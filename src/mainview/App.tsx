import {
  AiChat02Icon,
  AddSquareIcon,
  ArrowLeft02Icon,
  ArrowRight02Icon,
  Cancel01Icon,
  File01Icon,
  FolderOpenIcon,
  FolderTreeIcon,
  Image01Icon,
  PuzzleIcon,
  SaveIcon,
  Settings02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { PartialBlock } from "@blocknote/core";
import { filterSuggestionItems } from "@blocknote/core/extensions";
import {
  BlockNoteViewRaw,
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  useCreateBlockNote,
} from "@blocknote/react";
import type { DefaultReactSuggestionItem, SuggestionMenuProps } from "@blocknote/react";
import { FileTree } from "@pierre/trees/react";
import * as Tabs from "@radix-ui/react-tabs";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
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
import "tldraw/tldraw.css";

type SidebarSection = "files" | "extensions" | "kai" | "settings";

type EditorTab = {
  id: string;
  type: "editor";
  noteId: string;
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
    <div className="mt-4">
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

function createInstallApprovalPrompt(plan: OfficialExtensionInstallPlan): string {
  const permissionLines =
    plan.permissions.length === 0
      ? ["- (none)"]
      : plan.permissions.map((permission) => {
          const scope = formatPermissionScope(permission);
          return `- ${permission.id}\n  reason: ${permission.reason}\n  scope: ${scope}`;
        });
  return [
    `Install "${plan.name}" v${plan.version}?`,
    "",
    "The extension requests these permissions:",
    ...permissionLines,
    "",
    "You can only proceed if you trust this extension.",
  ].join("\n");
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
  const [sidebarSection, setSidebarSection] = useState<SidebarSection>("files");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [zoomedImageTabIds, setZoomedImageTabIds] = useState<Record<string, boolean>>({});
  const activeTabRef = useRef<AppTab | null>(null);

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

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

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

  async function loadNoteIntoEditor(noteId: string): Promise<void> {
    const note = await electroview.rpc!.request.readNote({ id: noteId });
    let parsedBlocks: PartialBlock[] = [];
    try {
      parsedBlocks = editor.tryParseMarkdownToBlocks(note.markdown);
    } catch (error: unknown) {
      electroview.rpc?.send.log({
        message: `Markdown parse failed for ${note.path}: ${String(error)}`,
      });
    }
    const blocks = parsedBlocks.length > 0 ? parsedBlocks : createFallbackBlocks(note.markdown);
    editor.replaceBlocks(
      editor.document.map((block) => block.id),
      blocks,
    );
    setNoteTitle(note.title);
    setTabs((currentTabs) =>
      currentTabs.map((tab) =>
        tab.type === "editor" && tab.noteId === noteId
          ? { ...tab, title: getFileNameFromPath(note.path), path: note.path }
          : tab,
      ),
    );
    setStatusMessage(`Opened ${note.path}`);
  }

  async function openNoteTab(item: WorkspaceItem): Promise<void> {
    const tabId = `note:${item.id}`;
    setTabs((currentTabs) => {
      if (currentTabs.some((tab) => tab.id === tabId)) {
        return currentTabs;
      }
      return [
        ...currentTabs,
        {
          id: tabId,
          type: "editor",
          noteId: item.id,
          title: getFileNameFromPath(item.path),
          path: item.path,
        },
      ];
    });
    setActiveTabId(tabId);
    await loadNoteIntoEditor(item.id);
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

  async function openFilePreviewTab(item: WorkspaceItem): Promise<void> {
    const tabId = `preview:${item.path}`;
    if (!tabs.some((tab) => tab.id === tabId)) {
      const preview = await electroview.rpc!.request.renderExtensionFilePreview({
        path: item.path,
      });
      if (!preview) {
        setStatusMessage(`No preview handler is registered for ${item.path}.`);
        return;
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
    setStatusMessage(`Installing ${tab.name}...`);
    setInstallingExtensionIds((current) => ({ ...current, [tab.id]: true }));
    try {
      const installPlan = await electroview.rpc!.request.prepareOfficialExtensionInstall({
        id: tab.id,
      });
      const approved = window.confirm(createInstallApprovalPrompt(installPlan));
      if (!approved) {
        setStatusMessage(`Install canceled for ${installPlan.name}.`);
        return;
      }
      const installed = await electroview.rpc!.request.installOfficialExtension({
        id: tab.id,
        installToken: installPlan.installToken,
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
    } catch (error: unknown) {
      reportError("Unable to install extension", error);
    } finally {
      setInstallingExtensionIds((current) => {
        const next = { ...current };
        delete next[tab.id];
        return next;
      });
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
      await openFilePreviewTab(item);
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
      const headingTitle = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "";
      const saved = await electroview.rpc!.request.saveNote({
        id: activeEditorTab.noteId,
        title: headingTitle || noteTitle.trim(),
        markdown,
      });

      await refreshWorkspaceItems();
      setTabs((currentTabs) =>
        currentTabs.map((tab) =>
          tab.type === "editor" && tab.noteId === saved.id
            ? { ...tab, title: getFileNameFromPath(saved.path), path: saved.path }
            : tab,
        ),
      );
      setNoteTitle(saved.title);
      setStatusMessage(`Saved ${saved.path}`);
    } catch (error: unknown) {
      reportError("Unable to save note", error);
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
        await loadNoteIntoEditor(tab.noteId);
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
    <div
      className={`flex h-screen overflow-hidden ${appBg} ${
        prefersDarkMode ? "text-neutral-100" : "text-neutral-900"
      }`}
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
              animate={{ width: 240, opacity: 1 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { width: 0, opacity: 0 }}
              transition={
                prefersReducedMotion ? { duration: 0 } : { duration: 0.12, ease: "easeOut" }
              }
              className={`flex h-full flex-col overflow-hidden border-r ${borderTone} ${panelBg}`}
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
                  <FileTree
                    className="h-full"
                    options={{
                      flattenEmptyDirectories: true,
                      search: true,
                      sort: true,
                      virtualize: { threshold: 120 },
                    }}
                    files={treeFiles}
                    selectedItems={activeTab ? [activeTab.path] : []}
                    onSelection={(items) => {
                      const selectedFile = items.find((item) => !item.isFolder);
                      if (!selectedFile) {
                        return;
                      }
                      void openWorkspaceItem(selectedFile.path);
                    }}
                  />
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
            </motion.div>
          )}
        </AnimatePresence>
      </Tabs.Root>

      <main className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${mainPanelBg}`}>
        {/* Tab strip */}
        <div className={`kb-scrollbar-hidden flex shrink-0 items-end overflow-x-auto border-b px-1 ${borderTone} ${panelBg}`}>
          {tabs.map((tab) => (
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
          ))}
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
                <BlockNoteViewRaw
                  editor={editor}
                  formattingToolbar={false}
                  linkToolbar={false}
                  slashMenu={false}
                  emojiPicker={false}
                  sideMenu={false}
                  filePanel={false}
                  tableHandles={false}
                  comments={false}
                >
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
                </BlockNoteViewRaw>
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
          <div className="min-h-0 min-w-0 flex-1 overflow-auto p-6">
            <div className={`mx-auto max-w-[860px] rounded-md border p-4 ${borderTone} ${panelBg}`}>
              <p className={`text-[11px] uppercase tracking-widest ${sectionLabelTone}`}>
                Preview · {activeTab.handlerTitle}
              </p>
              <p className={`mt-1 text-xs ${mutedTextTone}`}>{activeTab.path}</p>
              {activeTab.contentType === "tldraw" ? (
                <TldrawPreview
                  content={activeTab.content}
                  path={activeTab.path}
                  borderTone={borderTone}
                  mutedTextTone={mutedTextTone}
                />
              ) : (
                <pre
                  className={`mt-4 overflow-auto whitespace-pre-wrap break-words rounded-md border p-3 text-xs ${borderTone} ${
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
                    activeTab.installed ||
                    Boolean(installingExtensionIds[activeTab.extensionId])
                  }
                  onClick={() =>
                    void installExtensionFromTab({
                      id: activeTab.extensionId,
                      name: activeTab.title,
                      version: activeTab.version,
                      description: activeTab.description,
                      installed: activeTab.installed,
                      readme: activeTab.readme,
                    })
                  }
                  className={`shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${borderTone} ${
                    prefersDarkMode
                      ? "hover:border-white/25 hover:bg-white/5"
                      : "hover:border-neutral-300 hover:bg-black/[0.03]"
                  }`}
                >
                  {activeTab.installed
                    ? "Installed"
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
    </div>
  );
}
