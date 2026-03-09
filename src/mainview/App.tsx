import { useCallback, useRef, useState, useMemo, useEffect } from "react";
import {
	DockviewReact,
	type DockviewApi,
	type IDockviewPanelProps,
	type DockviewReadyEvent,
} from "dockview";
import "dockview/dist/styles/dockview.css";

import { SidebarPanel, type FileNode } from "./components/Sidebar";
import { StatusBar, type StatusBarItem } from "./components/StatusBar";
import { CommandPalette, type CommandItem } from "./components/CommandPalette";
import { TerminalPanel } from "./components/TerminalPanel";
import { EditorPanel } from "./components/EditorPanel";
import { DiffPanel } from "./components/DiffPanel";
import { ContextSidebarPanel } from "./components/ContextSidebar";
import { readDirectory, openFolderDialog, onWorkspaceOpened, onFileChanged, gitStatus, gitBranchInfo, watchDirectory, unwatchDirectory, getOpenCodeContext, onOpenCodeContextUpdated, onOpenOpenCodeTerminal } from "./rpc";
import type { OpenCodeContextData } from "../shared/rpc";

/* ------------------------------------------------------------------ */
/*  Dockview panel components                                         */
/* ------------------------------------------------------------------ */

/** Welcome / empty-state panel shown when no folder is open */
const WelcomePanel = (props: IDockviewPanelProps) => {
	const onOpenFolder = props.params.onOpenFolder as (() => void) | undefined;

	return (
		<div className="flex items-center justify-center h-full text-fg-muted select-none">
			<div className="text-center space-y-4">
				<div className="text-6xl opacity-15 font-bold tracking-tighter">K</div>
				<p className="text-[var(--font-size-base)] text-fg-secondary">
					Open a folder to get started
				</p>
				<button
					type="button"
					onClick={onOpenFolder}
					className="inline-flex items-center gap-2 px-4 py-2 text-[var(--font-size-sm)]
					           bg-button text-button-fg border border-border rounded
					           hover:bg-button-hover transition-colors cursor-pointer"
				>
					Open Folder...
				</button>
				<p className="text-[var(--font-size-xs)] text-fg-muted">
					or press{" "}
					<kbd className="px-1.5 py-0.5 bg-bg-surface border border-border rounded text-[var(--font-size-xs)]">
						Cmd+O
					</kbd>{" "}
					to open a folder
				</p>
				<p className="text-[var(--font-size-xs)] text-fg-muted">
					Press{" "}
					<kbd className="px-1.5 py-0.5 bg-bg-surface border border-border rounded text-[var(--font-size-xs)]">
						Cmd+K
					</kbd>{" "}
					for commands
				</p>
			</div>
		</div>
	);
};



/* ------------------------------------------------------------------ */
/*  Dockview theme                                                    */
/* ------------------------------------------------------------------ */

const karabinerTheme = {
	name: "karabiner",
	className: "dockview-theme-karabiner",
};

/* ------------------------------------------------------------------ */
/*  Status bar data                                                   */
/* ------------------------------------------------------------------ */

// Status bar items are now dynamically generated in the component
// based on git branch info and workspace state.

/* ------------------------------------------------------------------ */
/*  Dockview components map                                           */
/* ------------------------------------------------------------------ */

const dockviewComponents = {
	welcome: WelcomePanel,
	editor: EditorPanel,
	diff: DiffPanel,
	terminal: TerminalPanel,
	sidebar: SidebarPanel,
	"context-sidebar": ContextSidebarPanel,
};

/* ------------------------------------------------------------------ */
/*  Git status helpers                                                */
/* ------------------------------------------------------------------ */

/** Map git porcelain status codes to FileNode.status values */
function gitCodeToStatus(code: string): NonNullable<FileNode["status"]> {
	switch (code) {
		case "M":
		case "MM":
		case "AM":
			return "modified";
		case "A":
			return "added";
		case "D":
			return "deleted";
		case "R":
		case "RM":
			return "renamed";
		case "??":
			return "untracked";
		case "!!":
			return "ignored";
		case "UU":
		case "AA":
		case "DD":
			return "conflict";
		default:
			// Any other status with M in it
			if (code.includes("M")) return "modified";
			if (code.includes("A")) return "added";
			if (code.includes("D")) return "deleted";
			if (code.includes("R")) return "renamed";
			return "modified";
	}
}

/**
 * Apply git status to file tree items and propagate status to parent
 * directories. A directory inherits the "most important" status of
 * any of its descendant files.
 */
function applyGitStatusToTree(
	items: Record<string, FileNode>,
	statusFiles: Record<string, string>,
	workspacePath: string,
): Record<string, FileNode> {
	if (Object.keys(statusFiles).length === 0) return items;

	const updated = { ...items };

	// Track which directories contain changed files
	const dirStatuses = new Map<string, Set<NonNullable<FileNode["status"]>>>();

	// Apply status to individual files
	for (const [relativePath, statusCode] of Object.entries(statusFiles)) {
		const absolutePath = `${workspacePath}/${relativePath}`;
		const toKey = (p: string) => p.replace(/[^a-zA-Z0-9_\-/]/g, "_");
		const key = toKey(absolutePath);
		const status = gitCodeToStatus(statusCode);

		if (updated[key]) {
			updated[key] = { ...updated[key], status };
		}

		// Propagate to parent directories
		if (status) {
			const parts = absolutePath.split("/");
			// Walk up from the file to the workspace root
			for (let i = parts.length - 1; i >= 1; i--) {
				const dirPath = parts.slice(0, i).join("/");
				if (dirPath.length < workspacePath.length) break;
				const dirKey = toKey(dirPath);
				if (!updated[dirKey] || !updated[dirKey].isDirectory) continue;

				if (!dirStatuses.has(dirKey)) {
					dirStatuses.set(dirKey, new Set());
				}
				dirStatuses.get(dirKey)!.add(status);
			}
		}
	}

	// Apply the most important status to directories
	// Priority: conflict > deleted > modified > renamed > added > untracked > ignored
	const STATUS_PRIORITY: NonNullable<FileNode["status"]>[] = [
		"conflict", "deleted", "modified", "renamed", "added", "untracked", "ignored",
	];

	for (const [dirKey, statuses] of dirStatuses) {
		if (!updated[dirKey]) continue;
		const bestStatus = STATUS_PRIORITY.find((s) => statuses.has(s)) ?? "modified";
		updated[dirKey] = { ...updated[dirKey], status: bestStatus };
	}

	return updated;
}

/* ------------------------------------------------------------------ */
/*  File tree helpers                                                  */
/* ------------------------------------------------------------------ */

/** Directories to skip during recursive file tree walk */
const IGNORED_DIRS = new Set([
	"node_modules",
	".git",
	".next",
	".turbo",
	"dist",
	"build",
	"out",
	".cache",
	"coverage",
	".vscode",
	".idea",
	"__pycache__",
	".svn",
	".hg",
]);

/** Max directory depth to walk (prevents runaway recursion on symlinks etc.) */
const MAX_DEPTH = 12;

/**
 * Recursively load a directory and its children into a flat
 * Record<string, FileNode> map compatible with headless-tree.
 *
 * Skips heavy / non-essential directories and caps recursion depth.
 */
async function loadFileTree(
	rootPath: string,
): Promise<{ items: Record<string, FileNode>; rootId: string }> {
	const items: Record<string, FileNode> = {};

	// Sanitise a filesystem path into a stable key for headless-tree
	const toKey = (p: string) => p.replace(/[^a-zA-Z0-9_\-/]/g, "_");

	async function walk(dirPath: string, depth: number): Promise<string[]> {
		if (depth > MAX_DEPTH) return [];

		let entries: Array<{ name: string; path: string; isDirectory: boolean }>;
		try {
			const result = await readDirectory(dirPath);
			entries = result.entries;
		} catch {
			return [];
		}
		const childKeys: string[] = [];

		for (const entry of entries) {
			// Skip known heavy directories
			if (entry.isDirectory && IGNORED_DIRS.has(entry.name)) continue;

			const key = toKey(entry.path);
			childKeys.push(key);

			if (entry.isDirectory) {
				const grandchildren = await walk(entry.path, depth + 1);
				items[key] = {
					name: entry.name,
					path: entry.path,
					isDirectory: true,
					children: grandchildren,
				};
			} else {
				items[key] = {
					name: entry.name,
					path: entry.path,
					isDirectory: false,
				};
			}
		}

		return childKeys;
	}

	const rootKey = toKey(rootPath);
	const children = await walk(rootPath, 0);
	const rootName = rootPath.split("/").pop() ?? rootPath;

	items[rootKey] = {
		name: rootName,
		path: rootPath,
		isDirectory: true,
		children,
	};

	return { items, rootId: rootKey };
}

/* ------------------------------------------------------------------ */
/*  App                                                               */
/* ------------------------------------------------------------------ */

let terminalCounter = 0;

/** The port OpenCode terminals will listen on */
const OPENCODE_PORT = 4096;

/** Panel IDs that are sidebars — excluded from anchor searches */
const SIDEBAR_PANEL_IDS = new Set(["sidebar", "context-sidebar"]);

/**
 * Hide the tab header for groups that contain only a single terminal panel.
 * Show the tab header again once a second tab is added or the sole tab isn't a terminal.
 * Sidebar groups are skipped (they manage their own header visibility).
 */
function updateMainGroupHeaders(api: DockviewApi) {
	for (const group of api.groups) {
		// Skip sidebar groups — they always hide headers via their own logic
		const hasSidebar = group.panels.some((p) =>
			SIDEBAR_PANEL_IDS.has(p.id),
		);
		if (hasSidebar) continue;

		const panels = group.panels;
		const shouldHide =
			panels.length === 1 && panels[0].id.startsWith("terminal-");

		group.header.hidden = shouldHide;
	}
}

function App() {
	const apiRef = useRef<DockviewApi | null>(null);
	const [sidebarVisible, setSidebarVisible] = useState(true);
	const [contextSidebarVisible, setContextSidebarVisible] = useState(true);

	// Workspace state
	const [workspacePath, setWorkspacePath] = useState<string | null>(null);
	const [fileTreeItems, setFileTreeItems] = useState<Record<string, FileNode>>({});
	const [fileTreeRootId, setFileTreeRootId] = useState<string>("root");
	const [gitStatusMap, setGitStatusMap] = useState<Record<string, string>>({});

	// Git branch state
	const [branchName, setBranchName] = useState<string | null>(null);
	const [branchAhead, setBranchAhead] = useState(0);
	const [branchBehind, setBranchBehind] = useState(0);

	// OpenCode context state
	const [openCodeContext, setOpenCodeContext] = useState<OpenCodeContextData | null>(null);

	const workspaceOpen = workspacePath !== null;

	// Stable ref for handleSelectFile to avoid stale closures in panel params
	const handleSelectFileRef = useRef<(path: string) => void>(() => {});

	/** Refresh git status and branch info for the current workspace */
	const refreshGitStatus = useCallback(async (wsPath: string, currentItems?: Record<string, FileNode>) => {
		try {
			const [statusResult, branchResult] = await Promise.all([
				gitStatus(wsPath),
				gitBranchInfo(wsPath),
			]);

			// Update branch info
			setBranchName(branchResult.branch);
			setBranchAhead(branchResult.ahead);
			setBranchBehind(branchResult.behind);

			if (statusResult.isGitRepo && Object.keys(statusResult.files).length > 0) {
				setGitStatusMap(statusResult.files);

				if (currentItems) {
					// Apply git status to the provided items directly
					const decorated = applyGitStatusToTree(currentItems, statusResult.files, wsPath);
					setFileTreeItems(decorated);
				} else {
					// Use functional updater to avoid stale closure over fileTreeItems
					setFileTreeItems(prev => {
						if (Object.keys(prev).length === 0) return prev;
						// Clear existing statuses, then apply new ones
						const cleaned: Record<string, FileNode> = {};
						for (const [key, node] of Object.entries(prev)) {
							if (node.status) {
								const { status: _, ...rest } = node;
								cleaned[key] = rest as FileNode;
							} else {
								cleaned[key] = node;
							}
						}
						return applyGitStatusToTree(cleaned, statusResult.files, wsPath);
					});
				}
			} else {
				setGitStatusMap(statusResult.isGitRepo ? {} : {});
				// Clear git statuses from tree items
				if (currentItems) {
					setFileTreeItems(currentItems);
				} else {
					setFileTreeItems(prev => {
						const cleaned: Record<string, FileNode> = {};
						for (const [key, node] of Object.entries(prev)) {
							if (node.status) {
								const { status: _, ...rest } = node;
								cleaned[key] = rest as FileNode;
							} else {
								cleaned[key] = node;
							}
						}
						return cleaned;
					});
				}
			}
		} catch {
			// Git operations failed — not a git repo or git not available
			setBranchName(null);
			setBranchAhead(0);
			setBranchBehind(0);
		}
	}, []); // No dependencies — uses functional updaters

	/** Open a folder in the workspace: swap welcome→terminal immediately, then load file tree in background */
	const handleOpenWorkspace = useCallback((folderPath: string) => {
		// Stop watching previous workspace
		if (workspacePath) {
			unwatchDirectory(workspacePath).catch(() => {});
		}

		setWorkspacePath(folderPath);
		setSidebarVisible(true);
		setContextSidebarVisible(true);

		// Transition Dockview immediately: remove welcome panel, add sidebar + terminal
		const api = apiRef.current;
		if (api) {
			const termId = `terminal-${++terminalCounter}`;

			// Remove existing sidebar if re-opening a different folder
			const existingSidebar = api.getPanel("sidebar");
			if (existingSidebar) {
				api.removePanel(existingSidebar);
			}

			// Remove existing context sidebar if re-opening
			const existingContextSidebar = api.getPanel("context-sidebar");
			if (existingContextSidebar) {
				api.removePanel(existingContextSidebar);
			}

			// Add terminal in the same group as welcome (replaces it visually)
			const welcomePanel = api.getPanel("welcome");
			if (welcomePanel) {
				api.addPanel({
					id: termId,
					component: "terminal",
					title: `Terminal ${terminalCounter}`,
					params: { cwd: folderPath },
					position: { referencePanel: "welcome", direction: "within" },
				});
				api.removePanel(welcomePanel);
			} else {
				// No welcome panel (maybe already removed) — just add terminal
				const anchor = api.panels.find((p) => !SIDEBAR_PANEL_IDS.has(p.id));
				api.addPanel({
					id: termId,
					component: "terminal",
					title: `Terminal ${terminalCounter}`,
					params: { cwd: folderPath },
					position: anchor
						? { referencePanel: anchor.id, direction: "within" }
						: undefined,
				});
			}

			// Add sidebar panel to the left of the terminal/editor area
			const mainPanel = api.getPanel(termId);
			if (mainPanel) {
				api.addPanel({
					id: "sidebar",
					component: "sidebar",
					title: "Explorer",
					params: {
						title: "Explorer",
						items: {},
						rootId: "root",
						onSelectFile: handleSelectFileRef.current,
					},
					position: { referencePanel: mainPanel.id, direction: "left" },
					initialWidth: 240,
					minimumWidth: 140,
					maximumWidth: 600,
				});

				// Lock the sidebar group to prevent drops and hide the close button
				const sidebarPanel = api.getPanel("sidebar");
				if (sidebarPanel?.group) {
					sidebarPanel.group.locked = "no-drop-target";
					// Mark the sidebar group for CSS targeting (hide tab bar)
					sidebarPanel.group.header.hidden = true;
				}

				// Add context sidebar to the right of the main area
				api.addPanel({
					id: "context-sidebar",
					component: "context-sidebar",
					title: "Context",
					params: { openCodeContext: openCodeContext ?? undefined },
					position: { referencePanel: mainPanel.id, direction: "right" },
					initialWidth: 280,
					minimumWidth: 140,
					maximumWidth: 500,
				});

				// Lock the context sidebar group
				const contextPanel = api.getPanel("context-sidebar");
				if (contextPanel?.group) {
					contextPanel.group.locked = "no-drop-target";
					contextPanel.group.header.hidden = true;
				}
			}
		}

		// Load the file tree in the background (don't block the UI)
		loadFileTree(folderPath)
			.then(async ({ items, rootId }) => {
				setFileTreeRootId(rootId);
				// Refresh git status (applies decorations to the loaded items)
				await refreshGitStatus(folderPath, items);
			})
			.catch(() => {
				// If loading fails, show an empty tree — sidebar is still visible
				setFileTreeItems({});
				setFileTreeRootId("root");
			});

		// Start watching for file changes
		watchDirectory(folderPath).catch(() => {});
	}, [workspacePath, refreshGitStatus]);

	/** Trigger the native folder picker. Result arrives async via onWorkspaceOpened. */
	const handleOpenFolderDialog = useCallback(() => {
		openFolderDialog();
	}, []);

	/** Initialise the default Dockview layout */
	const onReady = useCallback(
		(event: DockviewReadyEvent) => {
			apiRef.current = event.api;

			// Start with the welcome panel
			event.api.addPanel({
				id: "welcome",
				component: "welcome",
				title: "Welcome",
				params: { onOpenFolder: handleOpenFolderDialog },
			});

			// Hide tab headers for groups that contain only a single terminal
			event.api.onDidAddPanel(() => updateMainGroupHeaders(event.api));
			event.api.onDidRemovePanel(() => updateMainGroupHeaders(event.api));
			event.api.onDidMovePanel(() => updateMainGroupHeaders(event.api));
		},
		[handleOpenFolderDialog],
	);

	// Listen for workspace-opened events from the app menu (File > Open Folder)
	useEffect(() => {
		const unsub = onWorkspaceOpened((path) => {
			handleOpenWorkspace(path);
		});
		return unsub;
	}, [handleOpenWorkspace]);

	// Listen for keyboard shortcuts (Cmd+O, Cmd+S)
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "o" && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
				e.preventDefault();
				handleOpenFolderDialog();
			}
			// Prevent default browser save behavior (Monaco handles Cmd+S internally)
			if (e.key === "s" && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
				e.preventDefault();
			}
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [handleOpenFolderDialog]);

	// Listen for file change events from the file watcher — debounce and refresh git status
	useEffect(() => {
		if (!workspacePath) return;

		let debounceTimer: ReturnType<typeof setTimeout> | null = null;

		const unsub = onFileChanged((_path, _event) => {
			// Debounce: wait 500ms after the last change before refreshing
			if (debounceTimer) clearTimeout(debounceTimer);
			debounceTimer = setTimeout(() => {
				refreshGitStatus(workspacePath);
			}, 500);
		});

		return () => {
			unsub();
			if (debounceTimer) clearTimeout(debounceTimer);
		};
	}, [workspacePath, refreshGitStatus]);

	// Poll OpenCode server for context data and push updates to the context sidebar
	useEffect(() => {
		if (!workspaceOpen) return;

		let cancelled = false;

		const fetchAndUpdate = async () => {
			try {
				const data = await getOpenCodeContext();
				if (!cancelled) {
					setOpenCodeContext(data);
				}
			} catch {
				// Server unreachable — set disconnected state
				if (!cancelled) {
					setOpenCodeContext((prev) =>
						prev?.connected === false ? prev : {
							connected: false,
							sessionId: null,
							sessionTitle: null,
							sessionStatus: null,
							tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
							sessionCost: 0,
							todayCost: 0,
							mcpServers: [],
							model: null,
							serverUrl: prev?.serverUrl ?? "http://127.0.0.1:4096",
						},
					);
				}
			}
		};

		// Initial fetch
		fetchAndUpdate();

		// Poll every 30 seconds as a fallback (SSE provides real-time updates from bun side)
		const interval = setInterval(fetchAndUpdate, 30_000);

		// Also listen for SSE push updates
		const unsubSSE = onOpenCodeContextUpdated((data) => {
			if (!cancelled) {
				setOpenCodeContext(data);
			}
		});

		return () => {
			cancelled = true;
			clearInterval(interval);
			unsubSSE();
		};
	}, [workspaceOpen]);

	// Push OpenCode context data to the context sidebar panel when it changes
	useEffect(() => {
		const api = apiRef.current;
		if (!api || !openCodeContext) return;
		const contextPanel = api.getPanel("context-sidebar");
		if (!contextPanel) return;

		contextPanel.api.updateParameters({
			openCodeContext,
		});
	}, [openCodeContext]);

	/** Open a file in the editor area — diff view for changed files, editor for clean files */
	const handleSelectFile = useCallback((path: string) => {
		const api = apiRef.current;
		if (!api) return;

		// Check if a panel for this file already exists
		const panelId = `file:${path}`;
		const existing = api.getPanel(panelId);
		if (existing) {
			existing.api.setActive();
			return;
		}

		// Find an anchor panel to open "within" (skip sidebar panels)
		const anchor = api.panels.find((p) => !SIDEBAR_PANEL_IDS.has(p.id));
		if (!anchor) return;

		const fileName = path.split("/").pop() ?? path;

		// Determine git status for this file
		const relativePath = workspacePath && path.startsWith(workspacePath)
			? path.substring(workspacePath.length + 1)
			: null;
		const fileGitStatus = relativePath ? gitStatusMap[relativePath] : undefined;

		if (fileGitStatus && workspacePath) {
			// File has changes — open diff view
			api.addPanel({
				id: panelId,
				component: "diff",
				title: `${fileName} (diff)`,
				params: {
					filePath: path,
					workspacePath,
					gitStatus: fileGitStatus,
				},
				position: { referencePanel: anchor.id, direction: "within" },
			});
		} else {
			// Clean file or no git — open editor
			api.addPanel({
				id: panelId,
				component: "editor",
				title: fileName,
				params: { filePath: path },
				position: { referencePanel: anchor.id, direction: "within" },
			});
		}
	}, [workspacePath, gitStatusMap]);

	// Keep the ref in sync so the sidebar always calls the latest version
	handleSelectFileRef.current = handleSelectFile;

	// Push updated file tree data to the sidebar panel whenever state changes
	useEffect(() => {
		const api = apiRef.current;
		if (!api) return;
		const sidebarPanel = api.getPanel("sidebar");
		if (!sidebarPanel) return;

		sidebarPanel.api.updateParameters({
			title: "Explorer",
			items: fileTreeItems,
			rootId: fileTreeRootId,
			onSelectFile: handleSelectFileRef.current,
		});
	}, [fileTreeItems, fileTreeRootId]);

	/** Open a new terminal panel as a tab in the main group */
	const openTerminal = useCallback(() => {
		const api = apiRef.current;
		if (!api) return;

		const termId = `terminal-${++terminalCounter}`;

		// Find an existing terminal to group with, or use the first non-sidebar panel
		const existingTerminal = api.panels.find(
			(p) => p.id.startsWith("terminal-"),
		);
		const anchor = existingTerminal ?? api.panels.find((p) => !SIDEBAR_PANEL_IDS.has(p.id));
		if (!anchor) return;

		api.addPanel({
			id: termId,
			component: "terminal",
			title: `Terminal ${terminalCounter}`,
			params: { cwd: workspacePath ?? undefined },
			position: { referencePanel: anchor.id, direction: "within" },
		});
	}, [workspacePath]);

	/** Open a new terminal that auto-runs `opencode --port 4096` */
	const openOpenCodeTerminal = useCallback(() => {
		const api = apiRef.current;
		if (!api) return;

		const termId = `terminal-${++terminalCounter}`;

		const existingTerminal = api.panels.find(
			(p) => p.id.startsWith("terminal-"),
		);
		const anchor = existingTerminal ?? api.panels.find((p) => !SIDEBAR_PANEL_IDS.has(p.id));
		if (!anchor) return;

		api.addPanel({
			id: termId,
			component: "terminal",
			title: "OpenCode",
			params: {
				cwd: workspacePath ?? undefined,
				initialCommand: `opencode --port ${OPENCODE_PORT}`,
			},
			position: { referencePanel: anchor.id, direction: "within" },
		});
	}, [workspacePath]);

	// Listen for "Open OpenCode" events from the app menu
	useEffect(() => {
		const unsub = onOpenOpenCodeTerminal(() => {
			openOpenCodeTerminal();
		});
		return unsub;
	}, [openOpenCodeTerminal]);

	/** Toggle sidebar visibility by adding/removing the sidebar panel */
	const toggleSidebar = useCallback(() => {
		if (!workspaceOpen) return;
		const api = apiRef.current;
		if (!api) return;

		const sidebarPanel = api.getPanel("sidebar");
		if (sidebarPanel) {
			// Sidebar is visible — remove it
			api.removePanel(sidebarPanel);
			setSidebarVisible(false);
		} else {
			// Sidebar is hidden — re-add it to the left
			const anchor = api.panels.find((p) => !SIDEBAR_PANEL_IDS.has(p.id));
			if (!anchor) return;

			api.addPanel({
				id: "sidebar",
				component: "sidebar",
				title: "Explorer",
				params: {
					title: "Explorer",
					items: fileTreeItems,
					rootId: fileTreeRootId,
					onSelectFile: handleSelectFileRef.current,
				},
				position: { referencePanel: anchor.id, direction: "left" },
				initialWidth: 240,
				minimumWidth: 140,
				maximumWidth: 600,
			});

			// Lock and hide header on the re-added sidebar
			const newSidebar = api.getPanel("sidebar");
			if (newSidebar?.group) {
				newSidebar.group.locked = "no-drop-target";
				newSidebar.group.header.hidden = true;
			}

			setSidebarVisible(true);
		}
	}, [workspaceOpen, fileTreeItems, fileTreeRootId]);

	/** Toggle context sidebar visibility by adding/removing the panel */
	const toggleContextSidebar = useCallback(() => {
		if (!workspaceOpen) return;
		const api = apiRef.current;
		if (!api) return;

		const contextPanel = api.getPanel("context-sidebar");
		if (contextPanel) {
			// Context sidebar is visible — remove it
			api.removePanel(contextPanel);
			setContextSidebarVisible(false);
		} else {
			// Context sidebar is hidden — re-add it to the right
			const anchor = api.panels.find(
				(p) => !SIDEBAR_PANEL_IDS.has(p.id),
			);
			if (!anchor) return;

			api.addPanel({
				id: "context-sidebar",
				component: "context-sidebar",
				title: "Context",
				params: { openCodeContext: openCodeContext ?? undefined },
				position: { referencePanel: anchor.id, direction: "right" },
				initialWidth: 280,
				minimumWidth: 140,
				maximumWidth: 500,
			});

			// Lock and hide header on the re-added context sidebar
			const newContextPanel = api.getPanel("context-sidebar");
			if (newContextPanel?.group) {
				newContextPanel.group.locked = "no-drop-target";
				newContextPanel.group.header.hidden = true;
			}

			setContextSidebarVisible(true);
		}
	}, [workspaceOpen, openCodeContext]);

	// Listen for Cmd+B keyboard shortcut to toggle sidebar
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "b" && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
				e.preventDefault();
				toggleSidebar();
			}
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [toggleSidebar]);

	// Listen for Cmd+Shift+B keyboard shortcut to toggle context sidebar
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "b" && (e.metaKey || e.ctrlKey) && e.shiftKey) {
				e.preventDefault();
				toggleContextSidebar();
			}
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [toggleContextSidebar]);

	/** Command palette commands */
	const commands: CommandItem[] = useMemo(
		() => [
			{
				id: "open-folder",
				label: "Open Folder...",
				group: "File",
				shortcut: "Cmd+O",
				onSelect: handleOpenFolderDialog,
			},
			{
				id: "new-terminal",
				label: "New Terminal",
				group: "Terminal",
				shortcut: "Ctrl+`",
				onSelect: openTerminal,
			},
			{
				id: "open-opencode",
				label: "Open OpenCode",
				group: "Terminal",
				onSelect: openOpenCodeTerminal,
			},
			...(workspaceOpen
				? [
						{
							id: "toggle-sidebar",
							label: sidebarVisible ? "Hide Sidebar" : "Show Sidebar",
							group: "View",
							shortcut: "Cmd+B",
							onSelect: toggleSidebar,
						},
						{
							id: "toggle-context-sidebar",
							label: contextSidebarVisible ? "Hide Context Panel" : "Show Context Panel",
							group: "View",
							shortcut: "Cmd+Shift+B",
							onSelect: toggleContextSidebar,
						},
					]
				: []),
			{
				id: "close-panel",
				label: "Close Active Panel",
				group: "View",
				shortcut: "Cmd+W",
				onSelect: () => {
					const api = apiRef.current;
					if (!api) return;
					const active = api.activePanel;
					if (active && active.id !== "welcome" && !SIDEBAR_PANEL_IDS.has(active.id)) {
						api.removePanel(active);
					}
				},
			},
			{
				id: "split-right",
				label: "Split Editor Right",
				group: "View",
				onSelect: () => {
					const api = apiRef.current;
					if (!api) return;
					const active = api.activePanel;
					if (active) {
						api.addPanel({
							id: `split-${Date.now()}`,
							component: "editor",
							title: "Untitled",
							position: { referencePanel: active.id, direction: "right" },
						});
					}
				},
			},
		],
		[workspaceOpen, sidebarVisible, contextSidebarVisible, openTerminal, openOpenCodeTerminal, toggleSidebar, toggleContextSidebar, handleOpenFolderDialog],
	);

	/** Dynamic status bar items based on workspace + git state */
	const statusItems: StatusBarItem[] = useMemo(() => {
		const items: StatusBarItem[] = [];

		if (branchName) {
			let branchContent = branchName;
			if (branchAhead > 0 || branchBehind > 0) {
				const parts: string[] = [];
				if (branchAhead > 0) parts.push(`\u2191${branchAhead}`);
				if (branchBehind > 0) parts.push(`\u2193${branchBehind}`);
				branchContent = `${branchName} ${parts.join(" ")}`;
			}
			items.push({ id: "branch", content: branchContent, align: "left" });
		}

		// Count changed files from git status
		const changeCount = Object.keys(gitStatusMap).length;
		if (changeCount > 0) {
			items.push({
				id: "changes",
				content: `${changeCount} change${changeCount !== 1 ? "s" : ""}`,
				align: "left",
			});
		}

		items.push({ id: "encoding", content: "UTF-8", align: "right" });

		return items;
	}, [branchName, branchAhead, branchBehind, gitStatusMap]);

	return (
		<div className="flex flex-col h-full w-full overflow-hidden bg-bg">
			{/* Main content: dockview handles sidebar + editor layout */}
			<div className="flex-1 min-h-0">
				<DockviewReact
					theme={karabinerTheme}
					components={dockviewComponents}
					onReady={onReady}
				/>
			</div>

			{/* Status Bar */}
			<StatusBar items={statusItems} />

			{/* Command Palette (overlay) */}
			<CommandPalette commands={commands} />
		</div>
	);
}

export default App;
