import {
  AiChat02Icon,
  AddSquareIcon,
  ArrowLeft02Icon,
  ArrowRight02Icon,
  Cancel01Icon,
  CodeIcon,
  File01Icon,
  FolderOpenIcon,
  FolderTreeIcon,
  HighlighterIcon,
  Image01Icon,
  Link01Icon,
  PuzzleIcon,
  SaveIcon,
  Settings02Icon,
  TextAlignCenterIcon,
  TextAlignLeftIcon,
  TextAlignRightIcon,
  TextBoldIcon,
  TextColorIcon,
  TextIndentLessIcon,
  TextIndentMoreIcon,
  TextItalicIcon,
  TextStrikethroughIcon,
  TextUnderlineIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { BlockNoteSchema, createCodeBlockSpec, defaultBlockSpecs } from "@blocknote/core";
import { createHighlighter } from "shiki";
import type { PartialBlock } from "@blocknote/core";
import { filterSuggestionItems } from "@blocknote/core/extensions";
import {
  FormattingToolbarController,
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  useBlockNoteEditor,
  useCreateBlockNote,
  useEditorState,
} from "@blocknote/react";
import type {
  DefaultReactSuggestionItem,
  FormattingToolbarProps,
  SuggestionMenuProps,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import { FileTree } from "@pierre/trees/react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Tldraw, parseTldrawJsonFile } from "tldraw";
import {
  electroview,
  onWorkspaceFolderSelected,
  registerActiveEditorBridge,
} from "./rpc";
import type { AIProviderDefinition } from "../shared/contracts/ai";
import type {
  ExtensionInlineEditorBlockContribution,
  OfficialExtensionInstallPlan,
  OfficialExtensionReadme,
  OfficialExtensionSummary,
  ExtensionResolvedFilePreview,
} from "../shared/contracts/extensions";
import type { WorkspaceItem } from "../shared/contracts/notes";
import type { ExtensionPermission } from "../shared/contracts/permissions";
import "@blocknote/shadcn/style.css";
import "tldraw/tldraw.css";

type SidebarSection = "files" | "extensions" | "kai" | "settings";

type EditorTab = {
  id: string;
  type: "editor";
  source: "note" | "text-file";
  sourceId: string;
  title: string;
  path: string;
};

type ImageTab = {
  id: string;
  type: "image";
  title: string;
  path: string;
  mimeType: string;
  dataUrl: string;
};

type ExtensionPreviewTab = {
  id: string;
  type: "preview";
  title: string;
  path: string;
  handlerTitle: string;
  contentType: ExtensionResolvedFilePreview["contentType"];
  content: string;
};

type ExtensionReadmeTab = {
  id: string;
  type: "extension";
  extensionId: string;
  title: string;
  version: string;
  description?: string;
  path: string;
  installed: boolean;
  readme: string;
};

type AppTab = EditorTab | ImageTab | ExtensionPreviewTab | ExtensionReadmeTab;

type ExtensionActionPrompt =
  | {
      kind: "install";
      plan: OfficialExtensionInstallPlan;
    }
  | {
      kind: "uninstall";
      extension: OfficialExtensionReadme;
    };

const CODE_BLOCK_LANGUAGES: Record<string, { name: string; aliases?: string[] }> = {
  text: { name: "Plain Text", aliases: ["txt", "plaintext"] },
  javascript: { name: "JavaScript", aliases: ["js"] },
  typescript: { name: "TypeScript", aliases: ["ts"] },
  jsx: { name: "JSX" },
  tsx: { name: "TSX" },
  json: { name: "JSON" },
  markdown: { name: "Markdown", aliases: ["md"] },
  bash: { name: "Bash", aliases: ["sh", "shell"] },
  html: { name: "HTML" },
  css: { name: "CSS" },
  yaml: { name: "YAML", aliases: ["yml"] },
  python: { name: "Python", aliases: ["py"] },
  go: { name: "Go" },
  rust: { name: "Rust", aliases: ["rs"] },
};

const blockNoteSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    codeBlock: createCodeBlockSpec({
      defaultLanguage: "typescript",
      supportedLanguages: CODE_BLOCK_LANGUAGES,
      createHighlighter: () =>
        createHighlighter({
          themes: ["github-dark", "github-light"],
          langs: Object.keys(CODE_BLOCK_LANGUAGES).filter(
            (l) => l !== "text",
          ),
        }),
    }),
  },
});

function TldrawPreview({
  content,
  path,
  borderTone,
  mutedTextTone,
}: {
  content: string;
  path: string;
  borderTone: string;
  mutedTextTone: string;
}) {
  const [loadError, setLoadError] = useState<string | null>(null);

  return (
    <div>
      {loadError ? (
        <p className={`mb-2 text-xs ${mutedTextTone}`}>{loadError}</p>
      ) : null}
      <div className={`h-[68vh] min-h-[360px] overflow-hidden rounded-md border ${borderTone}`}>
        <Tldraw
          key={path}
          hideUi
          inferDarkMode
          onMount={(drawingEditor) => {
            drawingEditor.updateInstanceState({ isReadonly: true });
            const parsed = parseTldrawJsonFile({
              json: content,
              schema: drawingEditor.store.schema,
            });
            if (!parsed.ok) {
              setLoadError("This file could not be loaded as a valid .tldraw document.");
              return;
            }
            drawingEditor.loadSnapshot(parsed.value.getStoreSnapshot());
            drawingEditor.clearHistory();
            setLoadError(null);
          }}
        />
      </div>
    </div>
  );
}

function getFileNameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  const fileName = segments[segments.length - 1];
  return fileName && fileName.length > 0 ? fileName : path;
}

function getParentPath(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const slashIndex = normalized.lastIndexOf("/");
  if (slashIndex < 0) {
    return "";
  }
  return normalized.slice(0, slashIndex);
}

function joinWorkspacePath(parent: string, child: string): string {
  const normalizedParent = parent.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const normalizedChild = child.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!normalizedParent) {
    return normalizedChild;
  }
  if (!normalizedChild) {
    return normalizedParent;
  }
  return `${normalizedParent}/${normalizedChild}`;
}

function toNoteIdFromPath(path: string): string {
  return path.toLowerCase().endsWith(".md") ? path.slice(0, -3) : path;
}

function isPathWithin(path: string, parentPath: string): boolean {
  return path === parentPath || path.startsWith(`${parentPath}/`);
}

function replacePathPrefix(path: string, fromPath: string, toPath: string): string {
  if (!isPathWithin(path, fromPath)) {
    return path;
  }
  return `${toPath}${path.slice(fromPath.length)}`;
}

function resolveSingleFileTreeMove(previous: string[], next: string[]): {
  fromPath: string;
  toPath: string;
} | null {
  const previousSet = new Set(previous);
  const nextSet = new Set(next);
  const removed = previous.filter((path) => !nextSet.has(path));
  const added = next.filter((path) => !previousSet.has(path));
  if (removed.length === 1 && added.length === 1) {
    return {
      fromPath: removed[0],
      toPath: added[0],
    };
  }
  return null;
}

function formatPermissionScope(permission: ExtensionPermission): string {
  if (permission.id === "filesystem.read" || permission.id === "filesystem.write") {
    return permission.roots.join(", ");
  }
  if (permission.id === "network") {
    return permission.allowlist.join(", ");
  }
  if (permission.id === "ai.provider") {
    return permission.providerIds.join(", ");
  }
  if (permission.id === "cli.exec") {
    return permission.commands.join(", ");
  }
  return "n/a";
}

function describePermissionImpact(permission: ExtensionPermission): string {
  if (permission.id === "filesystem.write") {
    return "Can modify files in the listed paths.";
  }
  if (permission.id === "filesystem.read") {
    return "Can read files in the listed paths.";
  }
  if (permission.id === "network") {
    return "Can send network requests to the allowed hosts.";
  }
  if (permission.id === "cli.exec") {
    return "Can run the listed system commands.";
  }
  if (permission.id === "ai.provider") {
    return "Can call the listed AI providers.";
  }
  return "Review this permission before installing.";
}

function getPermissionRisk(permission: ExtensionPermission): "Low" | "Medium" | "High" {
  if (permission.id === "filesystem.write" || permission.id === "network" || permission.id === "cli.exec") {
    return "High";
  }
  if (permission.id === "filesystem.read" || permission.id === "ai.provider") {
    return "Medium";
  }
  return "Low";
}

function SlashMenu({
  items,
  selectedIndex,
  loadingState,
  onItemClick,
}: SuggestionMenuProps<DefaultReactSuggestionItem>) {
  if (loadingState === "loading-initial") {
    return null;
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto mt-2 w-full max-w-[760px] rounded-md border border-black/10 bg-white px-3 py-2 text-xs text-neutral-500 shadow-lg dark:border-white/[0.14] dark:bg-neutral-950 dark:text-neutral-400">
        No commands found
      </div>
    );
  }

  return (
    <div className="mx-auto mt-2 w-full max-w-[760px] rounded-md border border-black/10 bg-white p-1.5 shadow-lg dark:border-white/[0.14] dark:bg-neutral-950">
      <div className="max-h-[min(24rem,45vh)] overflow-y-auto overscroll-contain">
        {items.map((item, index) => {
          const isSelected = index === selectedIndex;
          return (
            <button
              key={`${item.title}-${index}`}
              type="button"
              onClick={() => onItemClick?.(item)}
              className={`flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors ${
                isSelected
                  ? "bg-neutral-100 text-neutral-900 dark:bg-white/10 dark:text-white"
                  : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-white/[0.06]"
              }`}
            >
              {item.icon ? <span className="mt-0.5 shrink-0">{item.icon}</span> : null}
              <span className="min-w-0">
                <span className="block truncate">{item.title}</span>
                {item.subtext ? (
                  <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">
                    {item.subtext}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Custom formatting toolbar ──────────────────────────────────────────────

type InlineStyleKey = "bold" | "italic" | "underline" | "strike" | "code";
type BlockPresetValue =
  | "paragraph"
  | "heading-1"
  | "heading-2"
  | "heading-3"
  | "quote"
  | "bullet"
  | "numbered"
  | "check";
type AlignmentValue = "left" | "center" | "right";

type BlockPreset = {
  value: BlockPresetValue;
  label: string;
};

type ColorPreset = {
  value: string;
  label: string;
  swatch: string;
};

const BLOCK_PRESETS: BlockPreset[] = [
  { value: "paragraph", label: "Paragraph" },
  { value: "heading-1", label: "Heading 1" },
  { value: "heading-2", label: "Heading 2" },
  { value: "heading-3", label: "Heading 3" },
  { value: "quote", label: "Quote" },
  { value: "bullet", label: "Bulleted list" },
  { value: "numbered", label: "Numbered list" },
  { value: "check", label: "Checklist" },
];

const INLINE_STYLE_BUTTONS: Array<{ key: InlineStyleKey; icon: typeof TextBoldIcon; ariaLabel: string }> = [
  { key: "bold", icon: TextBoldIcon, ariaLabel: "Bold" },
  { key: "italic", icon: TextItalicIcon, ariaLabel: "Italic" },
  { key: "underline", icon: TextUnderlineIcon, ariaLabel: "Underline" },
  { key: "strike", icon: TextStrikethroughIcon, ariaLabel: "Strikethrough" },
  { key: "code", icon: CodeIcon, ariaLabel: "Inline code" },
];

const ALIGNMENT_BUTTONS: Array<{
  value: AlignmentValue;
  icon: typeof TextAlignLeftIcon;
  ariaLabel: string;
}> = [
  { value: "left", icon: TextAlignLeftIcon, ariaLabel: "Align left" },
  { value: "center", icon: TextAlignCenterIcon, ariaLabel: "Align center" },
  { value: "right", icon: TextAlignRightIcon, ariaLabel: "Align right" },
];

const TEXT_COLOR_PRESETS: ColorPreset[] = [
  { value: "default", label: "Default", swatch: "transparent" },
  { value: "gray", label: "Gray", swatch: "#9ca3af" },
  { value: "brown", label: "Brown", swatch: "#92400e" },
  { value: "red", label: "Red", swatch: "#ef4444" },
  { value: "orange", label: "Orange", swatch: "#f97316" },
  { value: "yellow", label: "Yellow", swatch: "#f59e0b" },
  { value: "green", label: "Green", swatch: "#22c55e" },
  { value: "blue", label: "Blue", swatch: "#3b82f6" },
  { value: "purple", label: "Purple", swatch: "#a855f7" },
  { value: "pink", label: "Pink", swatch: "#ec4899" },
];

const HIGHLIGHT_PRESETS: ColorPreset[] = [
  { value: "default", label: "Default", swatch: "transparent" },
  { value: "gray", label: "Gray", swatch: "#6b7280" },
  { value: "brown", label: "Brown", swatch: "#78350f" },
  { value: "red", label: "Red", swatch: "#dc2626" },
  { value: "orange", label: "Orange", swatch: "#ea580c" },
  { value: "yellow", label: "Yellow", swatch: "#ca8a04" },
  { value: "green", label: "Green", swatch: "#16a34a" },
  { value: "blue", label: "Blue", swatch: "#2563eb" },
  { value: "purple", label: "Purple", swatch: "#9333ea" },
  { value: "pink", label: "Pink", swatch: "#db2777" },
];

function getBlockPresetValue(block: { type: string; props: Record<string, unknown> }): BlockPresetValue {
  if (block.type === "heading") {
    const level = typeof block.props.level === "number" ? block.props.level : Number(block.props.level);
    if (level === 1) {
      return "heading-1";
    }
    if (level === 2) {
      return "heading-2";
    }
    if (level === 3) {
      return "heading-3";
    }
  }
  if (block.type === "quote") {
    return "quote";
  }
  if (block.type === "bulletListItem") {
    return "bullet";
  }
  if (block.type === "numberedListItem") {
    return "numbered";
  }
  if (block.type === "checkListItem") {
    return "check";
  }
  return "paragraph";
}

function getBlockUpdate(value: BlockPresetValue): PartialBlock {
  switch (value) {
    case "heading-1":
      return { type: "heading", props: { level: 1, isToggleable: false } };
    case "heading-2":
      return { type: "heading", props: { level: 2, isToggleable: false } };
    case "heading-3":
      return { type: "heading", props: { level: 3, isToggleable: false } };
    case "quote":
      return { type: "quote" };
    case "bullet":
      return { type: "bulletListItem" };
    case "numbered":
      return { type: "numberedListItem" };
    case "check":
      return { type: "checkListItem" };
    case "paragraph":
    default:
      return { type: "paragraph" };
  }
}

function CustomFormattingToolbar(_props: FormattingToolbarProps) {
  const editor = useBlockNoteEditor();
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const menuPanelRef = useRef<HTMLDivElement | null>(null);
  const blockMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const textColorMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const highlightMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const [openMenu, setOpenMenu] = useState<"block" | "textColor" | "highlight" | null>(null);
  const [menuPosition, setMenuPosition] = useState({
    top: 0,
    left: 0,
    minWidth: 180,
  });

  const state = useEditorState({
    editor,
    selector: ({ editor }) => {
      if (!editor.isEditable) {
        return undefined;
      }

      const selectedBlocks = editor.getSelection()?.blocks || [editor.getTextCursorPosition().block];
      if (selectedBlocks.length === 0) {
        return undefined;
      }

      const firstBlock = selectedBlocks[0] as {
        type: string;
        props: Record<string, unknown>;
      };
      const activeStyles = editor.getActiveStyles() as Record<string, string | boolean | undefined>;
      const textAlignmentProp = firstBlock.props.textAlignment;
      const textAlignment: AlignmentValue =
        textAlignmentProp === "center" || textAlignmentProp === "right" ? textAlignmentProp : "left";

      return {
        selectedBlocks,
        activeStyles,
        blockPreset: getBlockPresetValue(firstBlock),
        textAlignment,
        textColor: typeof activeStyles.textColor === "string" ? activeStyles.textColor : "default",
        backgroundColor:
          typeof activeStyles.backgroundColor === "string" ? activeStyles.backgroundColor : "default",
        canNest: editor.canNestBlock(),
        canUnnest: editor.canUnnestBlock(),
        hasLink: Boolean(editor.getSelectedLinkUrl()),
        supportsTextColor: "textColor" in editor.schema.styleSchema,
        supportsBackgroundColor: "backgroundColor" in editor.schema.styleSchema,
      };
    },
  });

  useEffect(() => {
    if (!state) {
      setOpenMenu(null);
    }
  }, [state]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && (toolbarRef.current?.contains(target) || menuPanelRef.current?.contains(target))) {
        return;
      }
      setOpenMenu(null);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, []);

  useEffect(() => {
    if (!openMenu) {
      return;
    }

    const getMenuTrigger = () => {
      if (openMenu === "block") {
        return blockMenuButtonRef.current;
      }
      if (openMenu === "textColor") {
        return textColorMenuButtonRef.current;
      }
      return highlightMenuButtonRef.current;
    };

    const updateMenuPosition = () => {
      const trigger = getMenuTrigger();
      if (!trigger) {
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const viewportPadding = 8;
      const menuVerticalOffset = 8;
      const minWidth = Math.max(180, Math.round(rect.width));
      const estimatedMenuHeight = Math.min(240, Math.max(120, window.innerHeight - viewportPadding * 2));

      const preferBelow = rect.bottom + menuVerticalOffset + estimatedMenuHeight <= window.innerHeight - viewportPadding;
      const top = preferBelow
        ? rect.bottom + menuVerticalOffset
        : Math.max(viewportPadding, rect.top - estimatedMenuHeight - menuVerticalOffset);

      const maxLeft = Math.max(viewportPadding, window.innerWidth - minWidth - viewportPadding);
      const left = Math.min(Math.max(viewportPadding, rect.left), maxLeft);

      setMenuPosition({
        top,
        left,
        minWidth,
      });
    };

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [openMenu]);

  if (!state) {
    return null;
  }

  const blockLabel = BLOCK_PRESETS.find((preset) => preset.value === state.blockPreset)?.label ?? "Paragraph";

  const isStyleActive = (style: InlineStyleKey) => {
    return state.activeStyles[style] === true;
  };

  const toggleStyle = (style: InlineStyleKey) => {
    editor.focus();
    switch (style) {
      case "bold":
        editor.toggleStyles({ bold: true });
        break;
      case "italic":
        editor.toggleStyles({ italic: true });
        break;
      case "underline":
        editor.toggleStyles({ underline: true });
        break;
      case "strike":
        editor.toggleStyles({ strike: true });
        break;
      case "code":
        editor.toggleStyles({ code: true });
        break;
      default:
        break;
    }
  };

  const applyBlockPreset = (preset: BlockPresetValue) => {
    const update = getBlockUpdate(preset);
    editor.focus();
    editor.transact(() => {
      for (const block of state.selectedBlocks) {
        editor.updateBlock(block, update);
      }
    });
    setOpenMenu(null);
  };

  const applyAlignment = (alignment: AlignmentValue) => {
    editor.focus();
    editor.transact(() => {
      for (const block of state.selectedBlocks) {
        if ("textAlignment" in block.props) {
          editor.updateBlock(block, {
            props: { ...block.props, textAlignment: alignment },
          });
        }
      }
    });
  };

  const applyTextColor = (color: string) => {
    if (!state.supportsTextColor) {
      return;
    }
    editor.focus();
    if (color === "default") {
      editor.removeStyles({ textColor: "default" } as never);
    } else {
      editor.addStyles({ textColor: color } as never);
    }
    setOpenMenu(null);
  };

  const applyBackgroundColor = (color: string) => {
    if (!state.supportsBackgroundColor) {
      return;
    }
    editor.focus();
    if (color === "default") {
      editor.removeStyles({ backgroundColor: "default" } as never);
    } else {
      editor.addStyles({ backgroundColor: color } as never);
    }
    setOpenMenu(null);
  };

  const applyLink = () => {
    const initialValue = editor.getSelectedLinkUrl() ?? "https://";
    const enteredUrl = window.prompt("Enter URL", initialValue);
    if (enteredUrl === null) {
      return;
    }
    const url = enteredUrl.trim();
    if (url.length === 0) {
      return;
    }
    editor.focus();
    editor.createLink(url);
  };

  const menuLabel =
    openMenu === "block"
      ? "Block type options"
      : openMenu === "textColor"
        ? "Text color options"
        : "Highlight color options";

  const menuContent =
    openMenu === "block"
      ? BLOCK_PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            role="menuitemradio"
            aria-checked={state.blockPreset === preset.value}
            className="kb-toolbar-menu-item"
            data-active={state.blockPreset === preset.value ? "true" : "false"}
            onMouseDown={(event) => {
              event.preventDefault();
              applyBlockPreset(preset.value);
            }}
          >
            {preset.label}
          </button>
        ))
      : openMenu === "textColor"
        ? TEXT_COLOR_PRESETS.map((color) => (
            <button
              key={color.value}
              type="button"
              role="menuitemradio"
              aria-checked={state.textColor === color.value}
              className="kb-toolbar-menu-item"
              data-active={state.textColor === color.value ? "true" : "false"}
              onMouseDown={(event) => {
                event.preventDefault();
                applyTextColor(color.value);
              }}
            >
              <span
                className="kb-toolbar-swatch"
                style={{ backgroundColor: color.swatch }}
                aria-hidden="true"
              />
              {color.label}
            </button>
          ))
        : HIGHLIGHT_PRESETS.map((color) => (
            <button
              key={color.value}
              type="button"
              role="menuitemradio"
              aria-checked={state.backgroundColor === color.value}
              className="kb-toolbar-menu-item"
              data-active={state.backgroundColor === color.value ? "true" : "false"}
              onMouseDown={(event) => {
                event.preventDefault();
                applyBackgroundColor(color.value);
              }}
            >
              <span
                className="kb-toolbar-swatch"
                style={{ backgroundColor: color.swatch }}
                aria-hidden="true"
              />
              {color.label}
            </button>
          ));

  return (
    <>
      <div
        ref={toolbarRef}
        className="kb-custom-toolbar"
        role="toolbar"
        aria-label="Text formatting controls"
      >
        <div className="kb-toolbar-menu">
          <button
            ref={blockMenuButtonRef}
            type="button"
            className="kb-toolbar-button kb-toolbar-button--menu"
            data-active={openMenu === "block" ? "true" : "false"}
            aria-label="Block type"
            onMouseDown={(event) => {
              event.preventDefault();
              setOpenMenu((current) => (current === "block" ? null : "block"));
            }}
          >
            <span className="kb-toolbar-button-label">{blockLabel}</span>
            <span className="kb-toolbar-caret" aria-hidden="true">
              ▾
            </span>
          </button>
        </div>

        <div className="kb-toolbar-separator" role="separator" aria-hidden="true" />

        {INLINE_STYLE_BUTTONS.map((styleButton) => (
          <button
            key={styleButton.key}
            type="button"
            className="kb-toolbar-button"
            data-active={isStyleActive(styleButton.key) ? "true" : "false"}
            aria-label={styleButton.ariaLabel}
            aria-pressed={isStyleActive(styleButton.key)}
            onMouseDown={(event) => {
              event.preventDefault();
              toggleStyle(styleButton.key);
            }}
          >
            <HugeiconsIcon icon={styleButton.icon} size={14} />
          </button>
        ))}

        <div className="kb-toolbar-separator" role="separator" aria-hidden="true" />

        {ALIGNMENT_BUTTONS.map((alignmentButton) => (
          <button
            key={alignmentButton.value}
            type="button"
            className="kb-toolbar-button"
            data-active={state.textAlignment === alignmentButton.value ? "true" : "false"}
            aria-label={alignmentButton.ariaLabel}
            aria-pressed={state.textAlignment === alignmentButton.value}
            onMouseDown={(event) => {
              event.preventDefault();
              applyAlignment(alignmentButton.value);
            }}
          >
            <HugeiconsIcon icon={alignmentButton.icon} size={14} />
          </button>
        ))}

        {state.supportsTextColor ? (
          <div className="kb-toolbar-menu">
            <button
              ref={textColorMenuButtonRef}
              type="button"
              className="kb-toolbar-button kb-toolbar-button--color"
              data-active={openMenu === "textColor" ? "true" : "false"}
              aria-label="Text color"
              onMouseDown={(event) => {
                event.preventDefault();
                setOpenMenu((current) => (current === "textColor" ? null : "textColor"));
              }}
            >
              <span className="kb-color-button-inner">
                <HugeiconsIcon icon={TextColorIcon} size={14} />
                <span
                  className="kb-color-swatch-bar"
                  style={{
                    backgroundColor:
                      state.textColor === "default" || !state.textColor
                        ? "currentColor"
                        : TEXT_COLOR_PRESETS.find((c) => c.value === state.textColor)?.swatch ?? "currentColor",
                  }}
                  aria-hidden="true"
                />
              </span>
            </button>
          </div>
        ) : null}

        {state.supportsBackgroundColor ? (
          <div className="kb-toolbar-menu">
            <button
              ref={highlightMenuButtonRef}
              type="button"
              className="kb-toolbar-button kb-toolbar-button--color"
              data-active={openMenu === "highlight" ? "true" : "false"}
              aria-label="Highlight color"
              onMouseDown={(event) => {
                event.preventDefault();
                setOpenMenu((current) => (current === "highlight" ? null : "highlight"));
              }}
            >
              <span className="kb-color-button-inner">
                <HugeiconsIcon icon={HighlighterIcon} size={14} />
                <span
                  className="kb-color-swatch-bar"
                  style={{
                    backgroundColor:
                      state.backgroundColor === "default" || !state.backgroundColor
                        ? "transparent"
                        : HIGHLIGHT_PRESETS.find((c) => c.value === state.backgroundColor)?.swatch ?? "transparent",
                    border:
                      state.backgroundColor === "default" || !state.backgroundColor
                        ? "1px dashed currentColor"
                        : "none",
                  }}
                  aria-hidden="true"
                />
              </span>
            </button>
          </div>
        ) : null}

        <div className="kb-toolbar-separator" role="separator" aria-hidden="true" />

        <button
          type="button"
          className="kb-toolbar-button"
          data-active={state.hasLink ? "true" : "false"}
          aria-label="Insert link"
          aria-pressed={state.hasLink}
          onMouseDown={(event) => {
            event.preventDefault();
            applyLink();
          }}
        >
          <HugeiconsIcon icon={Link01Icon} size={14} />
        </button>
        <button
          type="button"
          className="kb-toolbar-button"
          aria-label="Indent"
          disabled={!state.canNest}
          onMouseDown={(event) => {
            event.preventDefault();
            if (!state.canNest) {
              return;
            }
            editor.focus();
            editor.nestBlock();
          }}
        >
          <HugeiconsIcon icon={TextIndentMoreIcon} size={14} />
        </button>
        <button
          type="button"
          className="kb-toolbar-button"
          aria-label="Outdent"
          disabled={!state.canUnnest}
          onMouseDown={(event) => {
            event.preventDefault();
            if (!state.canUnnest) {
              return;
            }
            editor.focus();
            editor.unnestBlock();
          }}
        >
          <HugeiconsIcon icon={TextIndentLessIcon} size={14} />
        </button>
      </div>

      {openMenu && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuPanelRef}
              className="kb-toolbar-menu-panel"
              role="menu"
              aria-label={menuLabel}
              style={{
                top: `${menuPosition.top}px`,
                left: `${menuPosition.left}px`,
                minWidth: `${menuPosition.minWidth}px`,
              }}
            >
              {menuContent}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function createFallbackBlocks(markdown: string): PartialBlock[] {
  const blocks: PartialBlock[] = [];
  for (const rawLine of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trimEnd();
    if (line.trim().length === 0) {
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = Math.min(headingMatch[1].length, 3);
      const content = headingMatch[2].trim();
      blocks.push({
        type: "heading",
        props: { level },
        content: content.length > 0 ? content : "Untitled",
      });
      continue;
    }

    blocks.push({
      type: "paragraph",
      content: line,
    });
  }

  return blocks.length > 0 ? blocks : [{ type: "paragraph", content: "" }];
}

export function App() {
  const editor = useCreateBlockNote({
    schema: blockNoteSchema,
    // Keep paste behavior explicit and predictable:
    // prefer markdown-rich pastes when available, and parse plain text as markdown.
    pasteHandler: ({ defaultPasteHandler }) =>
      defaultPasteHandler({
        prioritizeMarkdownOverHTML: true,
        plainTextAsMarkdown: true,
      }),
  });
  const prefersReducedMotion = useReducedMotion();
  const [prefersDarkMode, setPrefersDarkMode] = useState(true);
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isOpeningFolder, setIsOpeningFolder] = useState(false);
  const [workspaceItems, setWorkspaceItems] = useState<WorkspaceItem[]>([]);
  const [tabs, setTabs] = useState<AppTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [statusMessage, setStatusMessage] = useState("Select a folder to start.");
  const [aiProviders, setAiProviders] = useState<AIProviderDefinition[]>([]);
  const [inlineEditorBlocks, setInlineEditorBlocks] = useState<
    ExtensionInlineEditorBlockContribution[]
  >([]);
  const [officialExtensions, setOfficialExtensions] = useState<OfficialExtensionSummary[]>([]);
  const [installingExtensionIds, setInstallingExtensionIds] = useState<Record<string, boolean>>(
    {},
  );
  const [uninstallingExtensionIds, setUninstallingExtensionIds] = useState<
    Record<string, boolean>
  >({});
  const [extensionActionPrompt, setExtensionActionPrompt] =
    useState<ExtensionActionPrompt | null>(null);
  const [isApplyingExtensionActionPrompt, setIsApplyingExtensionActionPrompt] =
    useState(false);
  const [sidebarSection, setSidebarSection] = useState<SidebarSection>("files");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [selectedTreeItems, setSelectedTreeItems] = useState<
    Array<{ path: string; isFolder: boolean }>
  >([]);
  const [fileTreeContextTarget, setFileTreeContextTarget] = useState<{
    path: string;
    isFolder: boolean;
  } | null>(null);
  const [draftMarkdownByTabId, setDraftMarkdownByTabId] = useState<Record<string, string>>({});
  const [savedMarkdownByTabId, setSavedMarkdownByTabId] = useState<Record<string, string>>({});
  const [isApplyingTreeMove, setIsApplyingTreeMove] = useState(false);
  const [zoomedImageTabIds, setZoomedImageTabIds] = useState<Record<string, boolean>>({});
  const activeTabRef = useRef<AppTab | null>(null);
  const draftMarkdownByTabIdRef = useRef<Record<string, string>>({});
  const selectedTreeItemsRef = useRef<Array<{ path: string; isFolder: boolean }>>([]);
  const syncEditorChangeRef = useRef(false);
  const contextMenuSelectionResetTimerRef = useRef<number | null>(null);
  const suppressNextTreeSelectionOpenRef = useRef(false);
  const sidebarResizeStateRef = useRef<{
    startX: number;
    startWidth: number;
  } | null>(null);

  const borderTone = prefersDarkMode ? "border-white/[0.07]" : "border-neutral-200";
  const appBg = prefersDarkMode ? "bg-[#0a0a0f]" : "bg-[#f6f8fc]";
  const railBg = prefersDarkMode ? "bg-[#0f0f14]" : "bg-[#eef1f7]";
  const panelBg = prefersDarkMode ? "bg-[#0d0d12]" : "bg-[#f9fbff]";
  const mainPanelBg = prefersDarkMode ? "bg-[#0a0a0f]" : "bg-[#ffffff]";
  const emptyIconTone = prefersDarkMode ? "text-neutral-700" : "text-neutral-400";
  const subtleTextTone = prefersDarkMode ? "text-neutral-700" : "text-neutral-500";
  const mutedTextTone = prefersDarkMode ? "text-neutral-600" : "text-neutral-500";
  const sectionLabelTone = prefersDarkMode ? "text-neutral-400" : "text-neutral-500";
  const navIconBtn = `flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
    prefersDarkMode
      ? "text-neutral-500 hover:bg-white/[0.07] hover:text-neutral-300"
      : "text-neutral-500 hover:bg-black/[0.05] hover:text-neutral-700"
  }`;
  const actionBtn = `flex h-7 w-7 items-center justify-center rounded transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
    prefersDarkMode
      ? "text-neutral-500 hover:bg-white/[0.07] hover:text-neutral-200"
      : "text-neutral-500 hover:bg-black/[0.05] hover:text-neutral-700"
  }`;

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [activeTabId, tabs],
  );
  const activeEditorTab = activeTab?.type === "editor" ? activeTab : null;
  const activeImageTab = activeTab?.type === "image" ? activeTab : null;
  const isActiveImageZoomed = activeImageTab ? Boolean(zoomedImageTabIds[activeImageTab.id]) : false;

  const itemByPath = useMemo(
    () => new Map(workspaceItems.map((item) => [item.path, item])),
    [workspaceItems],
  );
  const treeFiles = useMemo(
    () => workspaceItems.map((item) => item.path),
    [workspaceItems],
  );
  const dirtyTabIds = useMemo(() => {
    const dirtyIds: Record<string, boolean> = {};
    for (const tab of tabs) {
      if (tab.type !== "editor") {
        continue;
      }
      const draft = draftMarkdownByTabId[tab.id];
      const saved = savedMarkdownByTabId[tab.id];
      if (draft !== undefined && saved !== undefined && draft !== saved) {
        dirtyIds[tab.id] = true;
      }
    }
    return dirtyIds;
  }, [draftMarkdownByTabId, savedMarkdownByTabId, tabs]);
  const fileTreeGitStatus = useMemo(
    () =>
      tabs
        .filter((tab): tab is EditorTab => tab.type === "editor")
        .filter((tab) => dirtyTabIds[tab.id])
        .map((tab) => ({ path: tab.path, status: "modified" as const })),
    [dirtyTabIds, tabs],
  );

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    draftMarkdownByTabIdRef.current = draftMarkdownByTabId;
  }, [draftMarkdownByTabId]);

  useEffect(() => {
    selectedTreeItemsRef.current = selectedTreeItems;
  }, [selectedTreeItems]);

  useEffect(() => {
    return () => {
      if (contextMenuSelectionResetTimerRef.current !== null) {
        window.clearTimeout(contextMenuSelectionResetTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    return registerActiveEditorBridge({
      getSelectionAsMarkdown: () => {
        const currentActiveTab = activeTabRef.current;
        if (!currentActiveTab || currentActiveTab.type !== "editor") {
          throw new Error("No active editor tab.");
        }
        const selection = editor.getSelection();
        if (!selection) {
          return "";
        }
        const { blocks } = editor.getSelectionCutBlocks(true);
        return editor.blocksToMarkdownLossy(blocks as PartialBlock[]).trim();
      },
      insertAtCursor: (markdown: string) => {
        const currentActiveTab = activeTabRef.current;
        if (!currentActiveTab || currentActiveTab.type !== "editor") {
          throw new Error("No active editor tab.");
        }
        if (markdown.trim().length === 0) {
          return;
        }
        editor.pasteMarkdown(markdown);
      },
    });
  }, [editor]);

  async function refreshWorkspaceItems(): Promise<WorkspaceItem[]> {
    const items = await electroview.rpc!.request.listWorkspaceItems({});
    setWorkspaceItems(items);
    return items;
  }

  async function refreshOfficialExtensions(): Promise<void> {
    const extensions = await electroview.rpc!.request.listOfficialExtensions({});
    setOfficialExtensions(extensions);
  }

  async function refreshRuntimeContributions(): Promise<void> {
    const [providers, blocks] = await Promise.all([
      electroview.rpc!.request.listAIProviders({}),
      electroview.rpc!.request.listExtensionInlineEditorBlocks({}),
    ]);
    setAiProviders(providers);
    setInlineEditorBlocks(blocks);
  }

  function reportError(message: string, error: unknown): void {
    const detail = error instanceof Error ? error.message : String(error);
    setStatusMessage(`${message}: ${detail}`);
    electroview.rpc?.send.log({ message: `${message}: ${detail}` });
  }

  function applyEditorMarkdown(markdown: string, path: string): void {
    let parsedBlocks: PartialBlock[] = [];
    try {
      parsedBlocks = editor.tryParseMarkdownToBlocks(markdown);
    } catch (error: unknown) {
      electroview.rpc?.send.log({
        message: `Markdown parse failed for ${path}: ${String(error)}`,
      });
    }
    const blocks = parsedBlocks.length > 0 ? parsedBlocks : createFallbackBlocks(markdown);
    editor.replaceBlocks(
      editor.document.map((block) => block.id),
      blocks,
    );
  }

  function applyEditorMarkdownWithoutTracking(markdown: string, path: string): void {
    syncEditorChangeRef.current = true;
    applyEditorMarkdown(markdown, path);
    window.setTimeout(() => {
      syncEditorChangeRef.current = false;
    }, 0);
  }

  async function loadNoteIntoEditor(noteId: string, tabId: string): Promise<void> {
    const note = await electroview.rpc!.request.readNote({ id: noteId });
    const draft = draftMarkdownByTabIdRef.current[tabId];
    const nextMarkdown = draft ?? note.markdown;

    setSavedMarkdownByTabId((current) => ({ ...current, [tabId]: note.markdown }));
    setDraftMarkdownByTabId((current) =>
      current[tabId] === nextMarkdown ? current : { ...current, [tabId]: nextMarkdown },
    );
    setNoteTitle(note.title);
    setTabs((currentTabs) =>
      currentTabs.map((tab) =>
        tab.id === tabId && tab.type === "editor"
          ? {
              ...tab,
              source: "note",
              sourceId: note.id,
              title: getFileNameFromPath(note.path),
              path: note.path,
            }
          : tab,
      ),
    );
    applyEditorMarkdownWithoutTracking(nextMarkdown, note.path);
    setStatusMessage(`Opened ${note.path}`);
  }

  async function loadTextFileIntoEditor(path: string, tabId: string): Promise<void> {
    const file = await electroview.rpc!.request.readWorkspaceTextFile({ path });
    const draft = draftMarkdownByTabIdRef.current[tabId];
    const nextMarkdown = draft ?? file.content;

    setSavedMarkdownByTabId((current) => ({ ...current, [tabId]: file.content }));
    setDraftMarkdownByTabId((current) =>
      current[tabId] === nextMarkdown ? current : { ...current, [tabId]: nextMarkdown },
    );
    setNoteTitle(file.title);
    setTabs((currentTabs) =>
      currentTabs.map((tab) =>
        tab.id === tabId && tab.type === "editor"
          ? {
              ...tab,
              source: "text-file",
              sourceId: file.path,
              title: getFileNameFromPath(file.path),
              path: file.path,
            }
          : tab,
      ),
    );
    applyEditorMarkdownWithoutTracking(nextMarkdown, file.path);
    setStatusMessage(`Opened ${file.path}`);
  }

  async function openNoteTab(item: WorkspaceItem): Promise<void> {
    const tabId = `note:${item.id}`;
    const existingTab = tabs.find(
      (tab) => tab.type === "editor" && tab.source === "note" && tab.sourceId === item.id,
    );
    if (existingTab) {
      await activateTab(existingTab);
      return;
    }
    setTabs((currentTabs) => [
      ...currentTabs,
      {
        id: tabId,
        type: "editor",
        source: "note",
        sourceId: item.id,
        title: getFileNameFromPath(item.path),
        path: item.path,
      },
    ]);
    setActiveTabId(tabId);
    await loadNoteIntoEditor(item.id, tabId);
  }

  async function openTextFileTab(item: WorkspaceItem): Promise<void> {
    const tabId = `text:${item.path}`;
    const existingTab = tabs.find(
      (tab) => tab.type === "editor" && tab.source === "text-file" && tab.sourceId === item.path,
    );
    if (existingTab) {
      await activateTab(existingTab);
      return;
    }
    setTabs((currentTabs) => [
      ...currentTabs,
      {
        id: tabId,
        type: "editor",
        source: "text-file",
        sourceId: item.path,
        title: getFileNameFromPath(item.path),
        path: item.path,
      },
    ]);
    setActiveTabId(tabId);
    await loadTextFileIntoEditor(item.path, tabId);
  }

  async function openImageTab(item: WorkspaceItem): Promise<void> {
    const tabId = `image:${item.path}`;
    if (!tabs.some((tab) => tab.id === tabId)) {
      const image = await electroview.rpc!.request.readImageAsset({ path: item.path });
      setTabs((currentTabs) => [
        ...currentTabs,
        {
          id: tabId,
          type: "image",
          title: getFileNameFromPath(image.path),
          path: image.path,
          mimeType: image.mimeType,
          dataUrl: image.dataUrl,
        },
      ]);
      setZoomedImageTabIds((currentValue) => ({ ...currentValue, [tabId]: false }));
    }
    setActiveTabId(tabId);
    setStatusMessage(`Viewing ${item.path}`);
  }

  async function openFilePreviewTab(item: WorkspaceItem): Promise<boolean> {
    const tabId = `preview:${item.path}`;
    if (!tabs.some((tab) => tab.id === tabId)) {
      const preview = await electroview.rpc!.request.renderExtensionFilePreview({
        path: item.path,
      });
      if (!preview) {
        return false;
      }
      setTabs((currentTabs) => [
        ...currentTabs,
        {
          id: tabId,
          type: "preview",
          title: preview.title,
          path: item.path,
          handlerTitle: preview.handlerTitle,
          contentType: preview.contentType,
          content: preview.content,
        },
      ]);
    }
    setActiveTabId(tabId);
    setStatusMessage(`Previewing ${item.path}`);
    return true;
  }

  async function openOfficialExtensionTab(extensionId: string): Promise<void> {
    try {
      const tabId = `extension:${extensionId}`;
      if (tabs.some((tab) => tab.id === tabId)) {
        setActiveTabId(tabId);
        return;
      }

      const extension = await electroview.rpc!.request.readOfficialExtensionReadme({
        id: extensionId,
      });

      setTabs((currentTabs) => {
        if (currentTabs.some((tab) => tab.id === tabId)) {
          return currentTabs;
        }
        return [
          ...currentTabs,
          {
            id: tabId,
            type: "extension",
            extensionId: extension.id,
            title: extension.name,
            version: extension.version,
            description: extension.description,
            path: `official://${extension.id}`,
            installed: extension.installed,
            readme: extension.readme,
          },
        ];
      });
      setActiveTabId(tabId);
      setStatusMessage(`Viewing ${extension.name} extension.`);
    } catch (error: unknown) {
      reportError("Unable to open extension", error);
    }
  }

  async function installExtensionFromTab(tab: OfficialExtensionReadme): Promise<void> {
    if (tab.installed || installingExtensionIds[tab.id]) {
      return;
    }
    setStatusMessage(`Preparing install for ${tab.name}...`);
    try {
      const installPlan = await electroview.rpc!.request.prepareOfficialExtensionInstall({
        id: tab.id,
      });
      setExtensionActionPrompt({ kind: "install", plan: installPlan });
      setStatusMessage(`Review install permissions for ${installPlan.name}.`);
    } catch (error: unknown) {
      reportError("Unable to install extension", error);
    }
  }

  async function uninstallExtensionFromTab(tab: OfficialExtensionReadme): Promise<void> {
    if (!tab.installed || uninstallingExtensionIds[tab.id]) {
      return;
    }
    setExtensionActionPrompt({
      kind: "uninstall",
      extension: tab,
    });
    setStatusMessage(`Review uninstall for ${tab.name}.`);
  }

  function cancelExtensionActionPrompt(): void {
    if (!extensionActionPrompt || isApplyingExtensionActionPrompt) {
      return;
    }
    if (extensionActionPrompt.kind === "install") {
      setStatusMessage(`Install canceled for ${extensionActionPrompt.plan.name}.`);
    } else {
      setStatusMessage(`Uninstall canceled for ${extensionActionPrompt.extension.name}.`);
    }
    setExtensionActionPrompt(null);
  }

  async function confirmExtensionActionPrompt(): Promise<void> {
    if (!extensionActionPrompt || isApplyingExtensionActionPrompt) {
      return;
    }
    setIsApplyingExtensionActionPrompt(true);
    try {
      if (extensionActionPrompt.kind === "install") {
        const { plan } = extensionActionPrompt;
        setStatusMessage(`Installing ${plan.name}...`);
        setInstallingExtensionIds((current) => ({ ...current, [plan.id]: true }));
        const installed = await electroview.rpc!.request.installOfficialExtension({
          id: plan.id,
          installToken: plan.installToken,
        });
        await Promise.all([refreshOfficialExtensions(), refreshRuntimeContributions()]);
        setTabs((currentTabs) =>
          currentTabs.map((currentTab) =>
            currentTab.type === "extension" && currentTab.extensionId === installed.id
              ? {
                  ...currentTab,
                  installed: true,
                }
              : currentTab,
          ),
        );
        setStatusMessage(`Installed ${installed.name}.`);
      } else {
        const { extension } = extensionActionPrompt;
        setStatusMessage(`Uninstalling ${extension.name}...`);
        setUninstallingExtensionIds((current) => ({ ...current, [extension.id]: true }));
        const uninstalled = await electroview.rpc!.request.uninstallOfficialExtension({
          id: extension.id,
        });
        await Promise.all([refreshOfficialExtensions(), refreshRuntimeContributions()]);
        setTabs((currentTabs) =>
          currentTabs.map((currentTab) =>
            currentTab.type === "extension" && currentTab.extensionId === uninstalled.id
              ? {
                  ...currentTab,
                  installed: false,
                }
              : currentTab,
          ),
        );
        setStatusMessage(`Uninstalled ${uninstalled.name}.`);
      }
      setExtensionActionPrompt(null);
    } catch (error: unknown) {
      if (extensionActionPrompt.kind === "install") {
        reportError("Unable to install extension", error);
      } else {
        reportError("Unable to uninstall extension", error);
      }
    } finally {
      if (extensionActionPrompt.kind === "install") {
        setInstallingExtensionIds((current) => {
          const next = { ...current };
          delete next[extensionActionPrompt.plan.id];
          return next;
        });
      } else {
        setUninstallingExtensionIds((current) => {
          const next = { ...current };
          delete next[extensionActionPrompt.extension.id];
          return next;
        });
      }
      setIsApplyingExtensionActionPrompt(false);
    }
  }

  async function openWorkspaceItem(path: string): Promise<void> {
    try {
      const item = itemByPath.get(path);
      if (!item) {
        return;
      }
      if (item.kind === "note") {
        await openNoteTab(item);
        return;
      }
      if (item.kind === "image") {
        await openImageTab(item);
        return;
      }
      const openedPreview = await openFilePreviewTab(item);
      if (openedPreview) {
        return;
      }
      await openTextFileTab(item);
    } catch (error: unknown) {
      reportError("Unable to open item", error);
    }
  }

  async function insertInlineEditorBlock(
    block: ExtensionInlineEditorBlockContribution,
  ): Promise<void> {
    await insertInlineEditorBlockById(block.id, block.title);
  }

  async function insertInlineEditorBlockById(
    blockId: string,
    blockTitle: string,
  ): Promise<void> {
    if (!activeEditorTab) {
      setStatusMessage(`Open a note before inserting "${blockTitle}".`);
      return;
    }
    try {
      const response = await electroview.rpc!.request.invokeExtensionInlineEditorBlock({
        blockId,
      });
      if (response.markdown.trim().length === 0) {
        throw new Error("Inline block returned empty markdown.");
      }
      editor.pasteMarkdown(response.markdown);
      setStatusMessage(`Inserted ${blockTitle}.`);
    } catch (error: unknown) {
      reportError(`Unable to insert ${blockTitle}`, error);
    }
  }

  async function createNote(): Promise<void> {
    if (!workspaceRoot) {
      setStatusMessage("Open a folder before creating notes.");
      return;
    }
    try {
      setSidebarSection("files");
      setIsSidebarCollapsed(false);
      setStatusMessage("Creating note...");

      const created = await electroview.rpc!.request.saveNote({
        title: "Untitled note",
        markdown: "# Untitled note\n\n",
      });

      await refreshWorkspaceItems();
      await openNoteTab({
        kind: "note",
        id: created.id,
        path: created.path,
        title: created.title,
      });
      setStatusMessage(`Created ${created.path}`);
    } catch (error: unknown) {
      reportError("Unable to create note", error);
    }
  }

  async function saveCurrentEditorTab(): Promise<void> {
    if (!workspaceRoot || !activeEditorTab) {
      return;
    }
    try {
      const markdown = editor.blocksToMarkdownLossy(editor.document);
      if (activeEditorTab.source === "note") {
        const headingTitle = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "";
        const saved = await electroview.rpc!.request.saveNote({
          id: activeEditorTab.sourceId,
          title: headingTitle || noteTitle.trim(),
          markdown,
        });

        await refreshWorkspaceItems();
        setTabs((currentTabs) =>
          currentTabs.map((tab) =>
            tab.id === activeEditorTab.id && tab.type === "editor"
              ? {
                  ...tab,
                  source: "note",
                  sourceId: saved.id,
                  title: getFileNameFromPath(saved.path),
                  path: saved.path,
                }
              : tab,
          ),
        );
        setSavedMarkdownByTabId((current) => ({ ...current, [activeEditorTab.id]: markdown }));
        setDraftMarkdownByTabId((current) => ({ ...current, [activeEditorTab.id]: markdown }));
        setNoteTitle(saved.title);
        setStatusMessage(`Saved ${saved.path}`);
        return;
      }

      const saved = await electroview.rpc!.request.saveWorkspaceTextFile({
        path: activeEditorTab.path,
        content: markdown,
      });
      await refreshWorkspaceItems();
      setTabs((currentTabs) =>
        currentTabs.map((tab) =>
          tab.id === activeEditorTab.id && tab.type === "editor"
            ? {
                ...tab,
                source: "text-file",
                sourceId: saved.path,
                title: getFileNameFromPath(saved.path),
                path: saved.path,
              }
            : tab,
        ),
      );
      setSavedMarkdownByTabId((current) => ({ ...current, [activeEditorTab.id]: markdown }));
      setDraftMarkdownByTabId((current) => ({ ...current, [activeEditorTab.id]: markdown }));
      setNoteTitle(saved.title);
      setStatusMessage(`Saved ${saved.path}`);
    } catch (error: unknown) {
      reportError("Unable to save file", error);
    }
  }

  function closeTab(tabId: string): void {
    setTabs((currentTabs) => {
      const tabIndex = currentTabs.findIndex((tab) => tab.id === tabId);
      if (tabIndex < 0) {
        return currentTabs;
      }

      const removedTab = currentTabs[tabIndex];
      const nextTabs = currentTabs.filter((tab) => tab.id !== tabId);
      setActiveTabId((currentActive) => {
        if (currentActive !== tabId) {
          return currentActive;
        }
        const nextActive = nextTabs[tabIndex] ?? nextTabs[tabIndex - 1] ?? nextTabs[0] ?? null;
        return nextActive?.id ?? null;
      });
      if (removedTab.type === "image") {
        setZoomedImageTabIds((currentValue) => {
          const nextValue = { ...currentValue };
          delete nextValue[removedTab.id];
          return nextValue;
        });
      }
      if (removedTab.type === "editor") {
        setSavedMarkdownByTabId((current) => {
          const next = { ...current };
          delete next[removedTab.id];
          return next;
        });
        setDraftMarkdownByTabId((current) => {
          const next = { ...current };
          delete next[removedTab.id];
          return next;
        });
      }
      return nextTabs;
    });
  }

  function toggleImageZoom(tabId: string): void {
    setZoomedImageTabIds((currentValue) => ({
      ...currentValue,
      [tabId]: !currentValue[tabId],
    }));
  }

  async function activateTab(tab: AppTab): Promise<void> {
    setActiveTabId(tab.id);
    if (tab.type === "editor") {
      try {
        if (tab.source === "note") {
          await loadNoteIntoEditor(tab.sourceId, tab.id);
        } else {
          await loadTextFileIntoEditor(tab.sourceId, tab.id);
        }
      } catch (error: unknown) {
        reportError("Unable to load tab", error);
      }
      return;
    }
    if (tab.type === "extension") {
      setStatusMessage(`Viewing ${tab.title} extension.`);
      return;
    }
    setStatusMessage(`Viewing ${tab.path}`);
  }

  function requestWorkspaceFolderSelection(): void {
    if (isOpeningFolder) {
      return;
    }
    setIsOpeningFolder(true);
    setStatusMessage("Choose a folder to open...");
    electroview.rpc?.send.requestOpenWorkspaceFolder({});
  }

  function applyMovedPathToTabs(fromPath: string, toPath: string): void {
    setTabs((currentTabs) =>
      currentTabs.map((tab) => {
        if (!isPathWithin(tab.path, fromPath)) {
          return tab;
        }
        const nextPath = replacePathPrefix(tab.path, fromPath, toPath);
        if (tab.type !== "editor") {
          return {
            ...tab,
            path: nextPath,
            title: getFileNameFromPath(nextPath),
          };
        }
        if (tab.source === "note") {
          return {
            ...tab,
            path: nextPath,
            sourceId: toNoteIdFromPath(nextPath),
            title: getFileNameFromPath(nextPath),
          };
        }
        return {
          ...tab,
          path: nextPath,
          sourceId: replacePathPrefix(tab.sourceId, fromPath, toPath),
          title: getFileNameFromPath(nextPath),
        };
      }),
    );
  }

  function closeTabsAtPath(path: string): void {
    setTabs((currentTabs) => {
      const closingIds = currentTabs
        .filter((tab) => isPathWithin(tab.path, path))
        .map((tab) => tab.id);
      if (closingIds.length === 0) {
        return currentTabs;
      }

      setSavedMarkdownByTabId((current) => {
        const next = { ...current };
        for (const id of closingIds) {
          delete next[id];
        }
        return next;
      });
      setDraftMarkdownByTabId((current) => {
        const next = { ...current };
        for (const id of closingIds) {
          delete next[id];
        }
        return next;
      });
      setZoomedImageTabIds((current) => {
        const next = { ...current };
        for (const id of closingIds) {
          delete next[id];
        }
        return next;
      });

      const nextTabs = currentTabs.filter((tab) => !closingIds.includes(tab.id));
      setActiveTabId((currentActiveTabId) => {
        if (!currentActiveTabId || !closingIds.includes(currentActiveTabId)) {
          return currentActiveTabId;
        }
        return nextTabs[0]?.id ?? null;
      });
      return nextTabs;
    });
  }

  function getContextMenuBaseDirectory(): string {
    if (!fileTreeContextTarget) {
      return "";
    }
    if (fileTreeContextTarget.isFolder) {
      return fileTreeContextTarget.path;
    }
    return getParentPath(fileTreeContextTarget.path);
  }

  async function createFileFromContextMenu(): Promise<void> {
    const baseDirectory = getContextMenuBaseDirectory();
    const suggestedName = "untitled.md";
    const input = window.prompt("New file name", suggestedName);
    if (!input) {
      return;
    }
    const trimmed = input.trim();
    if (trimmed.length === 0) {
      setStatusMessage("File name cannot be empty.");
      return;
    }
    const fileName = trimmed.includes(".") ? trimmed : `${trimmed}.md`;
    const filePath = joinWorkspacePath(baseDirectory, fileName);
    try {
      await electroview.rpc!.request.createWorkspaceTextFile({
        path: filePath,
        content: fileName.toLowerCase().endsWith(".md") ? "# Untitled note\n\n" : "",
      });
      await refreshWorkspaceItems();
      setSidebarSection("files");
      setIsSidebarCollapsed(false);
      await openWorkspaceItem(filePath);
      setStatusMessage(`Created ${filePath}`);
    } catch (error: unknown) {
      reportError("Unable to create file", error);
    }
  }

  async function createFolderFromContextMenu(): Promise<void> {
    const baseDirectory = getContextMenuBaseDirectory();
    const input = window.prompt("New folder name", "new-folder");
    if (!input) {
      return;
    }
    const folderName = input.trim();
    if (folderName.length === 0) {
      setStatusMessage("Folder name cannot be empty.");
      return;
    }
    const folderPath = joinWorkspacePath(baseDirectory, folderName);
    try {
      await electroview.rpc!.request.createWorkspaceFolder({ path: folderPath });
      await refreshWorkspaceItems();
      setStatusMessage(`Created ${folderPath}`);
    } catch (error: unknown) {
      reportError("Unable to create folder", error);
    }
  }

  async function renameContextMenuTarget(): Promise<void> {
    if (!fileTreeContextTarget) {
      return;
    }
    const currentName = getFileNameFromPath(fileTreeContextTarget.path);
    const input = window.prompt("Rename item", currentName);
    if (!input) {
      return;
    }
    const nextName = input.trim();
    if (nextName.length === 0) {
      setStatusMessage("Name cannot be empty.");
      return;
    }

    const parentPath = getParentPath(fileTreeContextTarget.path);
    const nextPath = joinWorkspacePath(parentPath, nextName);
    if (nextPath === fileTreeContextTarget.path) {
      return;
    }
    try {
      await electroview.rpc!.request.moveWorkspaceItem({
        fromPath: fileTreeContextTarget.path,
        toPath: nextPath,
      });
      applyMovedPathToTabs(fileTreeContextTarget.path, nextPath);
      await refreshWorkspaceItems();
      setStatusMessage(`Renamed to ${nextPath}`);
    } catch (error: unknown) {
      reportError("Unable to rename item", error);
    }
  }

  async function deleteContextMenuTarget(): Promise<void> {
    if (!fileTreeContextTarget) {
      return;
    }
    const confirmed = window.confirm(`Delete ${fileTreeContextTarget.path}?`);
    if (!confirmed) {
      return;
    }
    try {
      await electroview.rpc!.request.deleteWorkspaceItem({ path: fileTreeContextTarget.path });
      closeTabsAtPath(fileTreeContextTarget.path);
      await refreshWorkspaceItems();
      setStatusMessage(`Deleted ${fileTreeContextTarget.path}`);
    } catch (error: unknown) {
      reportError("Unable to delete item", error);
    }
  }

  async function handleFileTreeFilesChange(nextFiles: string[]): Promise<void> {
    if (isApplyingTreeMove) {
      return;
    }
    const move = resolveSingleFileTreeMove(treeFiles, nextFiles);
    if (!move) {
      setStatusMessage("Drag and drop currently supports moving one file at a time.");
      return;
    }
    try {
      setIsApplyingTreeMove(true);
      await electroview.rpc!.request.moveWorkspaceItem({
        fromPath: move.fromPath,
        toPath: move.toPath,
      });
      applyMovedPathToTabs(move.fromPath, move.toPath);
      await refreshWorkspaceItems();
      setStatusMessage(`Moved ${move.fromPath} → ${move.toPath}`);
    } catch (error: unknown) {
      reportError("Unable to move file", error);
    } finally {
      setIsApplyingTreeMove(false);
    }
  }

  function handleFileTreeContextMenuCapture(): void {
    suppressNextTreeSelectionOpenRef.current = true;
    if (contextMenuSelectionResetTimerRef.current !== null) {
      window.clearTimeout(contextMenuSelectionResetTimerRef.current);
    }
    contextMenuSelectionResetTimerRef.current = window.setTimeout(() => {
      suppressNextTreeSelectionOpenRef.current = false;
      contextMenuSelectionResetTimerRef.current = null;
    }, 0);

    const selectedItem = selectedTreeItemsRef.current[0];
    setFileTreeContextTarget(selectedItem ?? null);
  }

  function startSidebarResize(clientX: number): void {
    sidebarResizeStateRef.current = {
      startX: clientX,
      startWidth: sidebarWidth,
    };
    setIsResizingSidebar(true);
    const minWidth = 180;
    const maxWidth = 420;

    const handleMouseMove = (event: MouseEvent) => {
      const resizeState = sidebarResizeStateRef.current;
      if (!resizeState) {
        return;
      }
      const delta = event.clientX - resizeState.startX;
      const nextWidth = Math.min(maxWidth, Math.max(minWidth, resizeState.startWidth + delta));
      setSidebarWidth(nextWidth);
    };

    const handleMouseUp = () => {
      sidebarResizeStateRef.current = null;
      setIsResizingSidebar(false);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const updatePreferredColorScheme = () => setPrefersDarkMode(mediaQuery.matches);
    updatePreferredColorScheme();
    mediaQuery.addEventListener("change", updatePreferredColorScheme);
    return () => {
      mediaQuery.removeEventListener("change", updatePreferredColorScheme);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = onWorkspaceFolderSelected((path) => {
      setIsOpeningFolder(false);
      if (!path) {
        setStatusMessage("Folder selection canceled.");
        return;
      }
      setWorkspaceRoot(path);
      setSidebarSection("files");
      setIsSidebarCollapsed(false);
    });

    void (async () => {
      try {
        const [workspace, providers, blocks, extensions] = await Promise.all([
          electroview.rpc!.request.getWorkspaceRoot({}),
          electroview.rpc!.request.listAIProviders({}),
          electroview.rpc!.request.listExtensionInlineEditorBlocks({}),
          electroview.rpc!.request.listOfficialExtensions({}),
        ]);
        setWorkspaceRoot(workspace.path);
        setAiProviders(providers);
        setInlineEditorBlocks(blocks);
        setOfficialExtensions(extensions);
        if (!workspace.path) {
          setStatusMessage("Select a folder to get started.");
        }
      } catch (error: unknown) {
        reportError("Failed to initialize app", error);
      } finally {
        setIsBootstrapping(false);
      }
    })();

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!workspaceRoot) {
      setWorkspaceItems([]);
      setTabs([]);
      setActiveTabId(null);
      setNoteTitle("");
      setDraftMarkdownByTabId({});
      setSavedMarkdownByTabId({});
      setSelectedTreeItems([]);
      setFileTreeContextTarget(null);
      return;
    }

    void (async () => {
      try {
        setStatusMessage(`Loading ${workspaceRoot}...`);
        const items = await refreshWorkspaceItems();
        const firstNote = items.find((item) => item.kind === "note");
        if (firstNote) {
          await openNoteTab(firstNote);
        } else {
          setStatusMessage(`Opened ${workspaceRoot}. Create your first note.`);
        }
      } catch (error: unknown) {
        reportError("Failed to load workspace", error);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceRoot]);

  const promptActionLabel =
    extensionActionPrompt?.kind === "install" ? "Install" : "Uninstall";
  const promptTitle =
    extensionActionPrompt?.kind === "install"
      ? `Install ${extensionActionPrompt.plan.name}?`
      : extensionActionPrompt?.kind === "uninstall"
        ? `Uninstall ${extensionActionPrompt.extension.name}?`
        : "";
  const promptDescription =
    extensionActionPrompt?.kind === "install"
      ? `Version ${extensionActionPrompt.plan.version} requests the permissions below.`
      : extensionActionPrompt?.kind === "uninstall"
        ? "This removes the extension from your local extensions folder."
        : "";
  const promptPermissions =
    extensionActionPrompt?.kind === "install"
      ? extensionActionPrompt.plan.permissions
      : [];
  const promptName =
    extensionActionPrompt?.kind === "install"
      ? extensionActionPrompt.plan.name
      : extensionActionPrompt?.kind === "uninstall"
        ? extensionActionPrompt.extension.name
        : "";
  const promptOverlayTone = prefersDarkMode ? "bg-black/75" : "bg-black/50";
  const promptCardTone = prefersDarkMode
    ? "border-white/15 bg-[#0f1117] text-neutral-100"
    : "border-neutral-200 bg-white text-neutral-900";
  const promptAccentTone = prefersDarkMode
    ? "bg-indigo-500/15 text-indigo-300 border-indigo-400/30"
    : "bg-indigo-50 text-indigo-700 border-indigo-200";
  const promptWarningTone = prefersDarkMode
    ? "border-amber-400/25 bg-amber-500/10 text-amber-200"
    : "border-amber-300 bg-amber-50 text-amber-800";

  if (isBootstrapping) {
    return (
      <div className={`flex h-screen items-center justify-center text-xs ${appBg} ${subtleTextTone}`}>
        Loading…
      </div>
    );
  }

  if (!workspaceRoot) {
    return (
      <div className={`flex h-screen items-center justify-center p-8 ${appBg}`}>
        <div className="w-full max-w-sm">
          <p className={`text-[11px] font-semibold uppercase tracking-widest ${mutedTextTone}`}>
            Karabiner
          </p>
          <h1 className={`mt-4 text-2xl font-semibold tracking-tight ${prefersDarkMode ? "text-white" : "text-neutral-900"}`}>
            Open a folder to start writing
          </h1>
          <p className={`mt-3 text-sm leading-relaxed ${prefersDarkMode ? "text-neutral-500" : "text-neutral-600"}`}>
            Your notes and images stay in a regular folder on disk. Choose one to use as your
            workspace.
          </p>
          <button
            onClick={requestWorkspaceFolderSelection}
            disabled={isOpeningFolder}
            className={`mt-8 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${
              prefersDarkMode ? "bg-neutral-100 text-neutral-900" : "bg-neutral-900 text-white"
            }`}
          >
            <HugeiconsIcon icon={FolderOpenIcon} size={16} />
            {isOpeningFolder ? "Waiting for folder picker…" : "Open folder"}
          </button>
          <p className={`mt-3 text-xs ${subtleTextTone}`}>{statusMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <Dialog.Root
      open={Boolean(extensionActionPrompt)}
      onOpenChange={(open) => {
        if (!open) {
          cancelExtensionActionPrompt();
        }
      }}
    >
      <div
        className={`flex h-screen overflow-hidden ${appBg} ${
          prefersDarkMode ? "text-neutral-100" : "text-neutral-900"
        } ${isResizingSidebar ? "cursor-col-resize select-none" : ""}`}
      >
      <Tabs.Root
        value={sidebarSection}
        onValueChange={(value) => {
          setSidebarSection(value as SidebarSection);
          setIsSidebarCollapsed(false);
        }}
        orientation="vertical"
        className="flex h-full shrink-0"
      >
        {/* Nav rail */}
        <div className={`flex w-12 flex-col items-center border-r py-2 ${borderTone} ${railBg}`}>
          <motion.button
            whileTap={prefersReducedMotion ? undefined : { scale: 0.92 }}
            onClick={() => setIsSidebarCollapsed((v) => !v)}
            className={`${navIconBtn} mb-3`}
            title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <HugeiconsIcon
              icon={isSidebarCollapsed ? ArrowRight02Icon : ArrowLeft02Icon}
              size={16}
            />
          </motion.button>

          <Tabs.List className="flex flex-1 flex-col items-center gap-0.5">
            <Tabs.Trigger
              value="files"
              className={`${navIconBtn} ${
                prefersDarkMode
                  ? "data-[state=active]:bg-white/[0.08] data-[state=active]:text-indigo-400"
                  : "data-[state=active]:bg-black/[0.06] data-[state=active]:text-indigo-600"
              }`}
              title="Files"
            >
              <HugeiconsIcon icon={FolderTreeIcon} size={18} />
            </Tabs.Trigger>
            <Tabs.Trigger
              value="extensions"
              className={`${navIconBtn} ${
                prefersDarkMode
                  ? "data-[state=active]:bg-white/[0.08] data-[state=active]:text-indigo-400"
                  : "data-[state=active]:bg-black/[0.06] data-[state=active]:text-indigo-600"
              }`}
              title="Extensions"
            >
              <HugeiconsIcon icon={PuzzleIcon} size={18} />
            </Tabs.Trigger>
            <Tabs.Trigger
              value="kai"
              className={`${navIconBtn} ${
                prefersDarkMode
                  ? "data-[state=active]:bg-white/[0.08] data-[state=active]:text-indigo-400"
                  : "data-[state=active]:bg-black/[0.06] data-[state=active]:text-indigo-600"
              }`}
              title="Kai"
            >
              <HugeiconsIcon icon={AiChat02Icon} size={18} />
            </Tabs.Trigger>
            <Tabs.Trigger
              value="settings"
              className={`${navIconBtn} ${
                prefersDarkMode
                  ? "data-[state=active]:bg-white/[0.08] data-[state=active]:text-indigo-400"
                  : "data-[state=active]:bg-black/[0.06] data-[state=active]:text-indigo-600"
              }`}
              title="Settings"
            >
              <HugeiconsIcon icon={Settings02Icon} size={18} />
            </Tabs.Trigger>
          </Tabs.List>
        </div>

        {/* Sidebar panel */}
        <AnimatePresence initial={false}>
          {!isSidebarCollapsed && (
            <motion.div
              initial={prefersReducedMotion ? false : { width: 0, opacity: 0 }}
              animate={{ width: sidebarWidth, opacity: 1 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { width: 0, opacity: 0 }}
              transition={
                prefersReducedMotion ? { duration: 0 } : { duration: 0.12, ease: "easeOut" }
              }
              className={`relative flex h-full flex-col overflow-hidden border-r ${borderTone} ${panelBg}`}
            >
              <Tabs.Content value="files" className="flex h-full flex-col data-[state=inactive]:hidden">
                <header className={`flex shrink-0 items-center justify-between border-b px-3 py-2.5 ${borderTone}`}>
                  <span className={`text-[11px] font-semibold uppercase tracking-widest ${sectionLabelTone}`}>
                    Files
                  </span>
                  <div className="flex items-center gap-0.5">
                    <motion.button
                      whileTap={prefersReducedMotion ? undefined : { scale: 0.92 }}
                      onClick={requestWorkspaceFolderSelection}
                      disabled={isOpeningFolder}
                      className={actionBtn}
                      title="Open folder"
                      aria-label="Open folder"
                    >
                      <HugeiconsIcon icon={FolderOpenIcon} size={15} />
                    </motion.button>
                    <motion.button
                      whileTap={prefersReducedMotion ? undefined : { scale: 0.92 }}
                      onClick={() => void createNote()}
                      className={`${actionBtn} ${
                        prefersDarkMode
                          ? "text-indigo-400 hover:bg-indigo-500/10 hover:text-indigo-300"
                          : "text-indigo-600 hover:bg-indigo-500/10 hover:text-indigo-700"
                      }`}
                      title="New note"
                      aria-label="New note"
                    >
                      <HugeiconsIcon icon={AddSquareIcon} size={15} />
                    </motion.button>
                    <motion.button
                      whileTap={prefersReducedMotion ? undefined : { scale: 0.92 }}
                      onClick={() => void saveCurrentEditorTab()}
                      disabled={!activeEditorTab}
                      className={actionBtn}
                      title="Save note"
                      aria-label="Save note"
                    >
                      <HugeiconsIcon icon={SaveIcon} size={15} />
                    </motion.button>
                  </div>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5">
                  <ContextMenu.Root
                    onOpenChange={(open) => {
                      if (!open) {
                        setFileTreeContextTarget(null);
                      }
                    }}
                  >
                    <ContextMenu.Trigger asChild>
                      <div onContextMenuCapture={handleFileTreeContextMenuCapture}>
                        <FileTree
                          className="h-full"
                          options={{
                            dragAndDrop: true,
                            flattenEmptyDirectories: true,
                            search: true,
                            sort: true,
                            virtualize: { threshold: 120 },
                          }}
                          files={treeFiles}
                          gitStatus={fileTreeGitStatus}
                          selectedItems={activeTab ? [activeTab.path] : []}
                          onFilesChange={(nextFiles) => {
                            void handleFileTreeFilesChange(nextFiles);
                          }}
                          onSelection={(items) => {
                            setSelectedTreeItems(items);
                            if (suppressNextTreeSelectionOpenRef.current) {
                              return;
                            }
                            const selectedFile = items.find((item) => !item.isFolder);
                            if (!selectedFile) {
                              return;
                            }
                            void openWorkspaceItem(selectedFile.path);
                          }}
                        />
                      </div>
                    </ContextMenu.Trigger>
                    <ContextMenu.Portal>
                      <ContextMenu.Content
                        className={`z-50 min-w-[180px] rounded-md border p-1 text-xs shadow-xl ${borderTone} ${
                          prefersDarkMode
                            ? "bg-[#11141b] text-neutral-200"
                            : "bg-white text-neutral-800"
                        }`}
                        collisionPadding={8}
                      >
                        <ContextMenu.Item
                          onSelect={() => {
                            void createFileFromContextMenu();
                          }}
                          className={`rounded px-2 py-1.5 outline-none transition-colors ${
                            prefersDarkMode
                              ? "focus:bg-white/10 focus:text-white"
                              : "focus:bg-black/[0.06] focus:text-black"
                          }`}
                        >
                          New file
                        </ContextMenu.Item>
                        <ContextMenu.Item
                          onSelect={() => {
                            void createFolderFromContextMenu();
                          }}
                          className={`rounded px-2 py-1.5 outline-none transition-colors ${
                            prefersDarkMode
                              ? "focus:bg-white/10 focus:text-white"
                              : "focus:bg-black/[0.06] focus:text-black"
                          }`}
                        >
                          New folder
                        </ContextMenu.Item>
                        <ContextMenu.Separator className={`my-1 h-px ${borderTone}`} />
                        <ContextMenu.Item
                          disabled={!fileTreeContextTarget}
                          onSelect={() => {
                            void renameContextMenuTarget();
                          }}
                          className={`rounded px-2 py-1.5 outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-40 ${
                            prefersDarkMode
                              ? "focus:bg-white/10 focus:text-white"
                              : "focus:bg-black/[0.06] focus:text-black"
                          }`}
                        >
                          Rename
                        </ContextMenu.Item>
                        <ContextMenu.Item
                          disabled={!fileTreeContextTarget}
                          onSelect={() => {
                            void deleteContextMenuTarget();
                          }}
                          className={`rounded px-2 py-1.5 outline-none transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-40 ${
                            prefersDarkMode
                              ? "focus:bg-rose-500/15 focus:text-rose-200"
                              : "focus:bg-rose-500/10 focus:text-rose-700"
                          }`}
                        >
                          Delete
                        </ContextMenu.Item>
                      </ContextMenu.Content>
                    </ContextMenu.Portal>
                  </ContextMenu.Root>
                </div>
                <footer className={`shrink-0 border-t px-3 py-2.5 ${borderTone}`}>
                  <p className={`truncate text-[11px] ${mutedTextTone}`} title={statusMessage}>
                    {statusMessage}
                  </p>
                  <p className={`mt-0.5 text-[11px] ${subtleTextTone}`}>
                    {workspaceItems.length} {workspaceItems.length === 1 ? "item" : "items"}
                  </p>
                </footer>
              </Tabs.Content>

              <Tabs.Content
                value="extensions"
                className="h-full p-4 data-[state=inactive]:hidden"
              >
                <h2 className={`text-[11px] font-semibold uppercase tracking-widest ${sectionLabelTone}`}>
                  Extensions
                </h2>
                <p className={`mt-3 text-xs leading-relaxed ${prefersDarkMode ? "text-neutral-500" : "text-neutral-600"}`}>
                  Manage installed extensions and permission grants here.
                </p>
                <div className={`mt-4 rounded-md border ${borderTone}`}>
                  <div className={`border-b px-3 py-2 text-[11px] font-semibold uppercase tracking-widest ${sectionLabelTone}`}>
                    Suggested official extensions
                  </div>
                  <div className="space-y-2 px-3 py-2.5">
                    {officialExtensions.length === 0 && (
                      <p className={`text-xs ${mutedTextTone}`}>No suggested extensions available.</p>
                    )}
                    {officialExtensions.map((extension) => (
                      <button
                        key={extension.id}
                        type="button"
                        onClick={() => void openOfficialExtensionTab(extension.id)}
                        className={`flex w-full items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left transition-colors ${borderTone} ${
                          prefersDarkMode
                            ? "hover:border-white/20 hover:bg-white/5"
                            : "hover:border-neutral-300 hover:bg-black/[0.03]"
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-medium">{extension.name}</span>
                          <span className={`block truncate text-[11px] ${subtleTextTone}`}>
                            {extension.description ?? extension.id}
                          </span>
                        </span>
                        <span
                          className={`shrink-0 rounded border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                            extension.installed
                              ? prefersDarkMode
                                ? "border-emerald-400/40 text-emerald-300"
                                : "border-emerald-500/40 text-emerald-700"
                              : `${borderTone} ${mutedTextTone}`
                          }`}
                        >
                          {extension.installed ? "Installed" : "Open"}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className={`mt-4 rounded-md border ${borderTone}`}>
                  <div className={`border-b px-3 py-2 text-[11px] font-semibold uppercase tracking-widest ${sectionLabelTone}`}>
                    Inline editor blocks
                  </div>
                  <div className="space-y-2 px-3 py-2.5">
                    {inlineEditorBlocks.length === 0 && (
                      <p className={`text-xs ${mutedTextTone}`}>No inline blocks registered.</p>
                    )}
                    {inlineEditorBlocks.map((block) => (
                      <div key={block.id} className="rounded-md border border-transparent px-1 py-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium">{block.title}</p>
                            <p className={`truncate text-[11px] ${subtleTextTone}`}>
                              {block.description ?? block.id}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void insertInlineEditorBlock(block)}
                            className={`shrink-0 rounded-md border px-2 py-1 text-[11px] transition-colors ${borderTone} ${
                              prefersDarkMode
                                ? "hover:border-white/20 hover:bg-white/5"
                                : "hover:border-neutral-300 hover:bg-black/[0.03]"
                            }`}
                          >
                            Insert
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Tabs.Content>

              <Tabs.Content value="kai" className="h-full p-4 data-[state=inactive]:hidden">
                <h2 className={`text-[11px] font-semibold uppercase tracking-widest ${sectionLabelTone}`}>
                  Kai
                </h2>
                <p className={`mt-3 text-xs leading-relaxed ${prefersDarkMode ? "text-neutral-500" : "text-neutral-600"}`}>
                  Chat UI entrypoint for note-aware assistant workflows.
                </p>
                <p className={`mt-2 text-[11px] ${subtleTextTone}`}>
                  Providers: {aiProviders.map((p) => p.id).join(", ") || "none"}
                </p>
              </Tabs.Content>

              <Tabs.Content value="settings" className="h-full p-4 data-[state=inactive]:hidden">
                <h2 className={`text-[11px] font-semibold uppercase tracking-widest ${sectionLabelTone}`}>
                  Settings
                </h2>
                <p className={`mt-3 text-xs leading-relaxed ${prefersDarkMode ? "text-neutral-500" : "text-neutral-600"}`}>
                  Karabiner preferences and app defaults.
                </p>
                <div className={`mt-4 rounded-md border px-3 py-2.5 text-xs ${borderTone} ${mutedTextTone}`}>
                  Motion and layout preferences will be configured here.
                </div>
              </Tabs.Content>
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize sidebar"
                onMouseDown={(event) => {
                  if (event.button !== 0) {
                    return;
                  }
                  event.preventDefault();
                  startSidebarResize(event.clientX);
                }}
                className={`absolute inset-y-0 right-0 w-1.5 cursor-col-resize transition-colors ${
                  prefersDarkMode ? "hover:bg-white/10" : "hover:bg-black/[0.08]"
                }`}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </Tabs.Root>

      <main className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${mainPanelBg}`}>
        {/* Tab strip */}
        <div className={`kb-scrollbar-hidden flex shrink-0 items-end overflow-x-auto border-b px-1 ${borderTone} ${panelBg}`}>
          {tabs.map((tab) => {
            const isDirty = Boolean(dirtyTabIds[tab.id]);
            return (
              <div
                key={tab.id}
                className={`group flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-xs transition-colors ${
                  tab.id === activeTabId
                    ? prefersDarkMode
                      ? "border-indigo-400/70 text-neutral-100"
                      : "border-indigo-600/80 text-neutral-900"
                    : prefersDarkMode
                      ? "border-transparent text-neutral-500 hover:text-neutral-300"
                      : "border-transparent text-neutral-500 hover:text-neutral-700"
                }`}
              >
                <button
                  onClick={() => void activateTab(tab)}
                  className="flex items-center gap-1.5 truncate text-left"
                  title={tab.path}
                >
                  <HugeiconsIcon
                    icon={
                      tab.type === "editor"
                        ? File01Icon
                        : tab.type === "image"
                          ? Image01Icon
                          : tab.type === "extension"
                            ? PuzzleIcon
                            : File01Icon
                    }
                    size={13}
                  />
                  <span className="max-w-[120px] truncate">{tab.title}</span>
                  {isDirty ? (
                    <span
                      className={
                        prefersDarkMode ? "text-amber-300" : "text-amber-600"
                      }
                      aria-label="Unsaved changes"
                      title="Unsaved changes"
                    >
                      •
                    </span>
                  ) : null}
                </button>
                <button
                  onClick={() => closeTab(tab.id)}
                  className={`ml-1 flex h-4 w-4 shrink-0 items-center justify-center rounded opacity-0 transition-all group-hover:opacity-100 ${
                    prefersDarkMode
                      ? "text-neutral-700 hover:bg-white/[0.1] hover:text-neutral-300"
                      : "text-neutral-500 hover:bg-black/[0.07] hover:text-neutral-700"
                  }`}
                  aria-label="Close tab"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={9} />
                </button>
              </div>
            );
          })}
          {tabs.length === 0 && (
            <span className={`px-4 py-2 text-[11px] ${subtleTextTone}`}>
              Open a file from the sidebar to start writing.
            </span>
          )}
        </div>

        {!activeTab && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2.5">
            <HugeiconsIcon icon={File01Icon} size={28} className={emptyIconTone} />
            <p className={`text-xs ${mutedTextTone}`}>No file open</p>
            <p className={`text-[11px] ${subtleTextTone}`}>
              Select a file from the sidebar
            </p>
          </div>
        )}

        {activeTab?.type === "editor" && (
          <div className="min-h-0 min-w-0 flex-1 overflow-auto">
            <div className="mx-auto w-full max-w-[760px] px-12 pb-20 pt-10">
              <div className="kb-blocknote">
                <BlockNoteView
                  editor={editor}
                  onChange={() => {
                    if (syncEditorChangeRef.current || !activeEditorTab) {
                      return;
                    }
                    const markdown = editor.blocksToMarkdownLossy(editor.document);
                    setDraftMarkdownByTabId((current) =>
                      current[activeEditorTab.id] === markdown
                        ? current
                        : { ...current, [activeEditorTab.id]: markdown },
                    );
                  }}
                  formattingToolbar={false}
                  linkToolbar={false}
                  slashMenu={false}
                  emojiPicker={false}
                  filePanel={false}
                  tableHandles={false}
                  comments={false}
                >
                  <FormattingToolbarController
                    formattingToolbar={CustomFormattingToolbar}
                    floatingUIOptions={{ elementProps: { style: { zIndex: 1100 } } }}
                  />
                  <SuggestionMenuController
                    triggerCharacter="/"
                    getItems={async (query) =>
                      (async () => {
                        const latestBlocks = await electroview.rpc!.request
                          .listExtensionInlineEditorBlocks({});
                        return filterSuggestionItems(
                          [
                            ...getDefaultReactSlashMenuItems(editor),
                            ...latestBlocks.map((block) => ({
                              title: block.title,
                              subtext: block.description ?? `Insert ${block.title}`,
                              aliases: [block.id, ...block.title.toLowerCase().split(/\s+/)],
                              icon: <HugeiconsIcon icon={PuzzleIcon} size={16} />,
                              onItemClick: () => {
                                void insertInlineEditorBlockById(block.id, block.title);
                              },
                            })),
                          ],
                          query,
                        );
                      })()
                    }
                    suggestionMenuComponent={SlashMenu}
                  />
                </BlockNoteView>
              </div>
            </div>
          </div>
        )}

        {activeTab?.type === "image" && (
          <div
            className={`min-h-0 min-w-0 flex-1 p-8 ${
              isActiveImageZoomed ? "overflow-auto" : "overflow-hidden"
            }`}
          >
            <div
              className={`flex min-h-full min-w-full ${
                isActiveImageZoomed ? "items-start justify-start" : "items-center justify-center"
              }`}
            >
                <button
                  type="button"
                  onClick={() => toggleImageZoom(activeTab.id)}
                  className={`rounded-md border transition-colors ${borderTone} ${
                    isActiveImageZoomed
                      ? prefersDarkMode
                        ? "cursor-zoom-out bg-black/30"
                        : "cursor-zoom-out bg-white/70"
                      : prefersDarkMode
                        ? "cursor-zoom-in bg-black/20 hover:border-white/[0.18]"
                        : "cursor-zoom-in bg-white/85 hover:border-neutral-300"
                  }`}
                  title={isActiveImageZoomed ? "Zoom out" : "Zoom in"}
                  aria-label={isActiveImageZoomed ? "Zoom out image" : "Zoom in image"}
              >
                <img
                  src={activeTab.dataUrl}
                  alt={activeTab.title}
                  className={`block shadow-2xl ${
                    isActiveImageZoomed
                      ? "max-h-none max-w-none"
                      : "max-h-[calc(100vh-9rem)] max-w-full object-contain"
                  }`}
                />
              </button>
            </div>
          </div>
        )}

        {activeTab?.type === "preview" && (
          <div className="min-h-0 min-w-0 flex-1 overflow-auto p-8">
            <div className="mx-auto w-full max-w-[960px]">
              {activeTab.contentType === "tldraw" ? (
                <TldrawPreview
                  content={activeTab.content}
                  path={activeTab.path}
                  borderTone={borderTone}
                  mutedTextTone={mutedTextTone}
                />
              ) : (
                <pre
                  className={`overflow-auto whitespace-pre-wrap break-words rounded-md border p-3 text-xs ${borderTone} ${
                    prefersDarkMode ? "bg-black/30 text-neutral-200" : "bg-neutral-50 text-neutral-800"
                  }`}
                >
                  {activeTab.content}
                </pre>
              )}
            </div>
          </div>
        )}

        {activeTab?.type === "extension" && (
          <div className="min-h-0 min-w-0 flex-1 overflow-auto p-6">
            <div className={`mx-auto max-w-[860px] rounded-md border p-4 ${borderTone} ${panelBg}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={`text-[11px] uppercase tracking-widest ${sectionLabelTone}`}>
                    Official extension
                  </p>
                  <h2 className="mt-1 text-sm font-semibold">
                    {activeTab.title} <span className={mutedTextTone}>v{activeTab.version}</span>
                  </h2>
                  <p className={`mt-1 text-xs ${mutedTextTone}`}>
                    {activeTab.description ?? activeTab.extensionId}
                  </p>
                  <p className={`mt-2 text-[11px] ${subtleTextTone}`}>{statusMessage}</p>
                </div>
                <button
                  type="button"
                  disabled={
                    activeTab.installed
                      ? Boolean(uninstallingExtensionIds[activeTab.extensionId])
                      : Boolean(installingExtensionIds[activeTab.extensionId])
                  }
                  onClick={() => {
                    if (activeTab.installed) {
                      void uninstallExtensionFromTab({
                        id: activeTab.extensionId,
                        name: activeTab.title,
                        version: activeTab.version,
                        description: activeTab.description,
                        installed: activeTab.installed,
                        readme: activeTab.readme,
                      });
                      return;
                    }
                    void installExtensionFromTab({
                      id: activeTab.extensionId,
                      name: activeTab.title,
                      version: activeTab.version,
                      description: activeTab.description,
                      installed: activeTab.installed,
                      readme: activeTab.readme,
                    });
                  }}
                  className={`shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${borderTone} ${
                    prefersDarkMode
                      ? "hover:border-white/25 hover:bg-white/5"
                      : "hover:border-neutral-300 hover:bg-black/[0.03]"
                  }`}
                >
                  {activeTab.installed
                    ? uninstallingExtensionIds[activeTab.extensionId]
                      ? "Uninstalling..."
                      : "Uninstall"
                    : installingExtensionIds[activeTab.extensionId]
                      ? "Installing..."
                      : "Install"}
                </button>
              </div>
              <pre
                className={`mt-4 overflow-auto whitespace-pre-wrap break-words rounded-md border p-3 text-xs ${borderTone} ${
                  prefersDarkMode ? "bg-black/30 text-neutral-200" : "bg-neutral-50 text-neutral-800"
                }`}
              >
                {activeTab.readme}
              </pre>
            </div>
          </div>
        )}
      </main>
      <Dialog.Portal>
        <Dialog.Overlay className={`fixed inset-0 ${promptOverlayTone}`} />
        <Dialog.Content
          className={`fixed left-1/2 top-1/2 z-50 w-[min(92vw,560px)] -translate-x-1/2 -translate-y-1/2 rounded-lg border p-4 shadow-2xl ${promptCardTone}`}
        >
          <div className={`inline-flex items-center gap-2 rounded-md border px-2 py-1 text-[11px] font-medium ${promptAccentTone}`}>
            <HugeiconsIcon icon={PuzzleIcon} size={14} />
            Extension permissions
          </div>
          <Dialog.Title className="mt-3 text-base font-semibold">{promptTitle}</Dialog.Title>
          <Dialog.Description className={`mt-1 text-xs leading-relaxed ${mutedTextTone}`}>
            {promptDescription}
          </Dialog.Description>
          {promptPermissions.length > 0 && (
            <div className={`mt-3 max-h-56 overflow-auto rounded-md border p-2 ${borderTone}`}>
              <p className={`mb-2 text-[11px] font-semibold uppercase tracking-widest ${sectionLabelTone}`}>
                Requested permissions
              </p>
              <div className="space-y-2">
                {promptPermissions.map((permission) => (
                  <div key={permission.id} className={`rounded-md border p-2 ${borderTone}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium">{permission.id}</p>
                      <span
                        className={`rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                          getPermissionRisk(permission) === "High"
                            ? prefersDarkMode
                              ? "border-rose-400/40 text-rose-300"
                              : "border-rose-300 text-rose-700"
                            : getPermissionRisk(permission) === "Medium"
                              ? prefersDarkMode
                                ? "border-amber-400/40 text-amber-300"
                                : "border-amber-300 text-amber-700"
                              : prefersDarkMode
                                ? "border-emerald-400/40 text-emerald-300"
                                : "border-emerald-300 text-emerald-700"
                        }`}
                      >
                        {getPermissionRisk(permission)}
                      </span>
                    </div>
                    <p className={`mt-1 text-[11px] ${mutedTextTone}`}>reason: {permission.reason}</p>
                    <p className={`mt-1 text-[11px] ${subtleTextTone}`}>
                      scope: {formatPermissionScope(permission)}
                    </p>
                    <p className={`mt-1 text-[11px] ${subtleTextTone}`}>
                      impact: {describePermissionImpact(permission)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {extensionActionPrompt?.kind === "install" && (
            <div className={`mt-3 rounded-md border px-2.5 py-2 text-[11px] leading-relaxed ${promptWarningTone}`}>
              Only install extensions you trust. Permissions grant real access to local files,
              commands, and network resources.
            </div>
          )}
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={isApplyingExtensionActionPrompt}
              onClick={cancelExtensionActionPrompt}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${borderTone} ${
                prefersDarkMode
                  ? "hover:border-white/25 hover:bg-white/5"
                  : "hover:border-neutral-300 hover:bg-black/[0.03]"
              }`}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isApplyingExtensionActionPrompt}
              onClick={() => void confirmExtensionActionPrompt()}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-opacity disabled:cursor-not-allowed disabled:opacity-60 ${
                prefersDarkMode ? "bg-neutral-100 text-neutral-900" : "bg-neutral-900 text-white"
              }`}
            >
              {isApplyingExtensionActionPrompt ? `${promptActionLabel}ing...` : promptActionLabel}
            </button>
          </div>
          <p className={`mt-2 text-[11px] ${subtleTextTone}`}>{promptName}</p>
        </Dialog.Content>
      </Dialog.Portal>
    </div>
    </Dialog.Root>
  );
}
