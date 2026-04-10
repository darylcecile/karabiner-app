import {
  AiChat02Icon,
  AddSquareIcon,
  ArrowLeft02Icon,
  ArrowRight02Icon,
  File01Icon,
  FolderOpenIcon,
  FolderTreeIcon,
  Image01Icon,
  PuzzleIcon,
  SaveIcon,
  Settings02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { BlockNoteViewRaw, useCreateBlockNote } from "@blocknote/react";
import { FileTree } from "@pierre/trees/react";
import * as Tabs from "@radix-ui/react-tabs";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { electroview, onWorkspaceFolderSelected } from "./rpc";
import type { AIProviderDefinition } from "../shared/contracts/ai";
import type { WorkspaceItem } from "../shared/contracts/notes";

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

type AppTab = EditorTab | ImageTab;

export function App() {
  const editor = useCreateBlockNote();
  const prefersReducedMotion = useReducedMotion();
  const [workspaceRoot, setWorkspaceRoot] = useState<string | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isOpeningFolder, setIsOpeningFolder] = useState(false);
  const [workspaceItems, setWorkspaceItems] = useState<WorkspaceItem[]>([]);
  const [tabs, setTabs] = useState<AppTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [statusMessage, setStatusMessage] = useState("Select a folder to start.");
  const [aiProviders, setAiProviders] = useState<AIProviderDefinition[]>([]);
  const [sidebarSection, setSidebarSection] = useState<SidebarSection>("files");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const navIconBtn =
    "flex h-8 w-8 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-white/[0.07] hover:text-neutral-300";
  const actionBtn =
    "flex h-7 w-7 items-center justify-center rounded text-neutral-500 transition-colors hover:bg-white/[0.07] hover:text-neutral-200 disabled:cursor-not-allowed disabled:opacity-40";

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? null,
    [activeTabId, tabs],
  );
  const activeEditorTab = activeTab?.type === "editor" ? activeTab : null;

  const itemByPath = useMemo(
    () => new Map(workspaceItems.map((item) => [item.path, item])),
    [workspaceItems],
  );
  const treeFiles = useMemo(
    () => workspaceItems.map((item) => item.path),
    [workspaceItems],
  );

  async function refreshWorkspaceItems(): Promise<WorkspaceItem[]> {
    const items = await electroview.rpc!.request.listWorkspaceItems({});
    setWorkspaceItems(items);
    return items;
  }

  function reportError(message: string, error: unknown): void {
    const detail = error instanceof Error ? error.message : String(error);
    setStatusMessage(`${message}: ${detail}`);
    electroview.rpc?.send.log({ message: `${message}: ${detail}` });
  }

  async function loadNoteIntoEditor(noteId: string): Promise<void> {
    const note = await electroview.rpc!.request.readNote({ id: noteId });
    const blocks = editor.tryParseMarkdownToBlocks(note.markdown);
    editor.replaceBlocks(editor.document, blocks);
    setNoteTitle(note.title);
    setTabs((currentTabs) =>
      currentTabs.map((tab) =>
        tab.type === "editor" && tab.noteId === noteId
          ? { ...tab, title: note.title, path: note.path }
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
          title: item.title,
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
          title: image.title,
          path: image.path,
          mimeType: image.mimeType,
          dataUrl: image.dataUrl,
        },
      ]);
    }
    setActiveTabId(tabId);
    setStatusMessage(`Viewing ${item.path}`);
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
      await openImageTab(item);
    } catch (error: unknown) {
      reportError("Unable to open item", error);
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
      const saved = await electroview.rpc!.request.saveNote({
        id: activeEditorTab.noteId,
        title: noteTitle.trim() || "Untitled note",
        markdown,
      });

      await refreshWorkspaceItems();
      setTabs((currentTabs) =>
        currentTabs.map((tab) =>
          tab.type === "editor" && tab.noteId === saved.id
            ? { ...tab, title: saved.title, path: saved.path }
            : tab,
        ),
      );
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

      const nextTabs = currentTabs.filter((tab) => tab.id !== tabId);
      setActiveTabId((currentActive) => {
        if (currentActive !== tabId) {
          return currentActive;
        }
        const nextActive = nextTabs[tabIndex] ?? nextTabs[tabIndex - 1] ?? nextTabs[0] ?? null;
        return nextActive?.id ?? null;
      });
      return nextTabs;
    });
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
        const [workspace, providers] = await Promise.all([
          electroview.rpc!.request.getWorkspaceRoot({}),
          electroview.rpc!.request.listAIProviders({}),
        ]);
        setWorkspaceRoot(workspace.path);
        setAiProviders(providers);
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
      <div className="flex h-screen items-center justify-center bg-[#0a0a0f] text-xs text-neutral-700">
        Loading…
      </div>
    );
  }

  if (!workspaceRoot) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0a0a0f] p-8">
        <div className="w-full max-w-sm">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-600">
            Karabiner
          </p>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-white">
            Open a folder to start writing
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-neutral-500">
            Your notes and images stay in a regular folder on disk. Choose one to use as your
            workspace.
          </p>
          <button
            onClick={requestWorkspaceFolderSelection}
            disabled={isOpeningFolder}
            className="mt-8 inline-flex items-center gap-2 rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <HugeiconsIcon icon={FolderOpenIcon} size={16} />
            {isOpeningFolder ? "Waiting for folder picker…" : "Open folder"}
          </button>
          <p className="mt-3 text-xs text-neutral-700">{statusMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#0a0a0f] text-neutral-100">
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
        <div className="flex w-12 flex-col items-center border-r border-white/[0.07] bg-[#0f0f14] py-2">
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
              className={`${navIconBtn} data-[state=active]:bg-white/[0.09] data-[state=active]:text-white`}
              title="Files"
            >
              <HugeiconsIcon icon={FolderTreeIcon} size={18} />
            </Tabs.Trigger>
            <Tabs.Trigger
              value="extensions"
              className={`${navIconBtn} data-[state=active]:bg-white/[0.09] data-[state=active]:text-white`}
              title="Extensions"
            >
              <HugeiconsIcon icon={PuzzleIcon} size={18} />
            </Tabs.Trigger>
            <Tabs.Trigger
              value="kai"
              className={`${navIconBtn} data-[state=active]:bg-white/[0.09] data-[state=active]:text-white`}
              title="Kai"
            >
              <HugeiconsIcon icon={AiChat02Icon} size={18} />
            </Tabs.Trigger>
            <Tabs.Trigger
              value="settings"
              className={`${navIconBtn} data-[state=active]:bg-white/[0.09] data-[state=active]:text-white`}
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
              className="flex h-full flex-col overflow-hidden border-r border-white/[0.07] bg-[#0d0d12]"
            >
              <Tabs.Content value="files" className="flex h-full flex-col data-[state=inactive]:hidden">
                <header className="flex shrink-0 items-center justify-between border-b border-white/[0.07] px-3 py-2.5">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
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
                      className={`${actionBtn} text-indigo-400 hover:bg-indigo-500/10 hover:text-indigo-300`}
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
                <footer className="shrink-0 border-t border-white/[0.07] px-3 py-2">
                  <p className="text-[11px] text-neutral-600">{workspaceItems.length} items</p>
                  <p className="truncate text-[11px] text-neutral-700" title={statusMessage}>
                    {statusMessage}
                  </p>
                </footer>
              </Tabs.Content>

              <Tabs.Content
                value="extensions"
                className="h-full p-4 data-[state=inactive]:hidden"
              >
                <h2 className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
                  Extensions
                </h2>
                <p className="mt-3 text-xs leading-relaxed text-neutral-500">
                  Manage installed extensions and permission grants here.
                </p>
                <div className="mt-4 rounded-md border border-white/[0.07] px-3 py-2.5 text-xs text-neutral-600">
                  Official extensions will appear in this panel.
                </div>
              </Tabs.Content>

              <Tabs.Content value="kai" className="h-full p-4 data-[state=inactive]:hidden">
                <h2 className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
                  Kai
                </h2>
                <p className="mt-3 text-xs leading-relaxed text-neutral-500">
                  Chat UI entrypoint for note-aware assistant workflows.
                </p>
                <p className="mt-2 text-[11px] text-neutral-700">
                  Providers: {aiProviders.map((p) => p.id).join(", ") || "none"}
                </p>
              </Tabs.Content>

              <Tabs.Content value="settings" className="h-full p-4 data-[state=inactive]:hidden">
                <h2 className="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">
                  Settings
                </h2>
                <p className="mt-3 text-xs leading-relaxed text-neutral-500">
                  Karabiner preferences and app defaults.
                </p>
                <div className="mt-4 rounded-md border border-white/[0.07] px-3 py-2.5 text-xs text-neutral-600">
                  Motion and layout preferences will be configured here.
                </div>
              </Tabs.Content>
            </motion.div>
          )}
        </AnimatePresence>
      </Tabs.Root>

      <main className="flex min-h-0 flex-1 flex-col bg-[#0a0a0f]">
        {/* Tab strip */}
        <div className="flex shrink-0 items-end overflow-x-auto border-b border-white/[0.07] bg-[#0d0d12] px-1">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`group flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-xs transition-colors ${
                tab.id === activeTabId
                  ? "border-indigo-400/70 text-neutral-100"
                  : "border-transparent text-neutral-500 hover:text-neutral-300"
              }`}
            >
              <button
                onClick={() => void activateTab(tab)}
                className="flex items-center gap-1.5 truncate text-left"
                title={tab.path}
              >
                <HugeiconsIcon
                  icon={tab.type === "editor" ? File01Icon : Image01Icon}
                  size={13}
                />
                <span className="max-w-[120px] truncate">{tab.title}</span>
              </button>
              <button
                onClick={() => closeTab(tab.id)}
                className="ml-0.5 rounded px-0.5 text-neutral-700 transition-colors hover:text-neutral-300 group-hover:text-neutral-500"
                aria-label="Close tab"
              >
                ×
              </button>
            </div>
          ))}
          {tabs.length === 0 && (
            <span className="px-4 py-2 text-xs text-neutral-700">
              Open a note or image from Files.
            </span>
          )}
        </div>

        {!activeTab && (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-xs text-neutral-700">No file open.</p>
          </div>
        )}

        {activeTab?.type === "editor" && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 border-b border-white/[0.07] px-12 py-4">
              <input
                value={noteTitle}
                onChange={(event) => setNoteTitle(event.currentTarget.value)}
                placeholder="Untitled"
                className="w-full bg-transparent text-[1.625rem] font-semibold tracking-tight text-neutral-100 outline-none placeholder:text-neutral-700"
              />
              <p className="mt-1 text-[11px] text-neutral-600">{activeTab.path}</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto w-full max-w-[760px] px-12 pb-20 pt-8">
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
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab?.type === "image" && (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 border-b border-white/[0.07] px-12 py-4">
              <p className="text-sm font-medium text-neutral-200">{activeTab.title}</p>
              <p className="mt-1 text-[11px] text-neutral-600">{activeTab.path}</p>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-8">
              <img
                src={activeTab.dataUrl}
                alt={activeTab.title}
                className="max-h-full max-w-full rounded-md border border-white/[0.07] shadow-2xl"
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
