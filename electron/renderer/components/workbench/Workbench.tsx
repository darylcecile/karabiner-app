import { createContext, PropsWithChildren, use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useFileTree, Tree } from '@/renderer/hooks/useTree';
import { useConfig } from '@/renderer/hooks/useConfig';
import { Path } from '@/shared/fsUtils';
import { useEditorState } from '@/renderer/components/editor';
import { getFileViewKind } from './viewKind';
import { main } from '@/renderer/relay';

function pathToAssetUrl(absPath: string): string {
	return `karabiner-file:///${encodeURIComponent(absPath)}`;
}

export type ViewKind = 'editor' | 'canvas' | 'image' | 'url' | 'none';

type HistoryEntry =
	| { kind: 'file'; path: string }
	| { kind: 'url'; url: string };

const WorkbenchContext = createContext({} as {
	fs: Tree;
	treeRef: React.RefObject<unknown>,
	workspace: {
		openInEditor: (path: string) => void,
		openUrl: (url: string) => void,
		openedPath?: string,
		openedUrl?: string,
		urlViewCurrentUrl?: string,
		setUrlViewCurrentUrl: (url: string | undefined) => void,
		viewKind: ViewKind,
		isCanvasFile: boolean,
		isLoadingRef: React.RefObject<boolean>,
		goBack: () => void,
		goForward: () => void,
		canGoBack: boolean,
		canGoForward: boolean,
	},
	editor: ReturnType<typeof useEditorState>,
});

export function Workbench(props: PropsWithChildren) {
	const config = useConfig();
	const [openedPath, setOpenedPath] = useState<string | undefined>(undefined);
	const [openedUrl, setOpenedUrl] = useState<string | undefined>(undefined);
	const [urlViewCurrentUrl, setUrlViewCurrentUrl] = useState<string | undefined>(undefined);
	const [history, setHistory] = useState<HistoryEntry[]>([]);
	const [historyIndex, setHistoryIndex] = useState<number>(-1);
	const includeHidden = Boolean(config.getConfigValue("showHiddenFiles")) || false;
	const treeOptions = useMemo(() => ({
		includeHidden,
		scanOnOpen: true,
		scanOptions: {
			ignore: ['node_modules', '.git', 'dist', 'build', 'out', 'target', '__pycache__'],
			maxDepth: 10,
		}
	}), [includeHidden]);
	const fs = useFileTree(treeOptions);
	const treeRef = useRef<unknown>(null);

	const fsRef = useRef(fs);
	fsRef.current = fs;

	const uploadFile = useCallback(async (file: File): Promise<string> => {
		const root = fsRef.current.rootPath;
		// 1) FS-picked file: copy into <root>/assets and return a karabiner-file:// URL.
		const srcPath = window.karabinerFiles?.getPathForFile(file) || '';
		if (root && srcPath) {
			try {
				const result = await main.saveImageToWorkspace(srcPath, root);
				if ('absPath' in result && result.absPath) {
					return pathToAssetUrl(result.absPath);
				}
				if ('error' in result && result.error) {
					toast.error(result.error);
				}
			} catch (err) {
				toast.error(err instanceof Error ? err.message : 'Unable to save image.');
			}
		}
		// 2) Fallback: read the File via FileReader and return a base64 data URL.
		// Used for clipboard pastes where there's no underlying disk path, or when
		// no workspace is open.
		return await new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => {
				const result = reader.result;
				if (typeof result === 'string') resolve(result);
				else reject(new Error('Unable to read file.'));
			};
			reader.onerror = () => reject(reader.error || new Error('Unable to read file.'));
			reader.readAsDataURL(file);
		});
	}, []);

	const editor = useEditorState({ uploadFile });
	const isLoadingRef = useRef<boolean>(false);

	useEffect(() => {
		void fs.openRoot('~/.karabiner/vault');
	}, [fs.openRoot]);

	// Loads a view (file or URL) without touching history. Used by both the
	// public open* methods (which add to history) and the back/forward navigators.
	const loadView = useCallback(async (entry: HistoryEntry): Promise<boolean> => {
		if (entry.kind === 'url') {
			isLoadingRef.current = true;
			try {
				setOpenedPath(undefined);
				setOpenedUrl(entry.url);
				setUrlViewCurrentUrl(entry.url);
				return true;
			} finally {
				queueMicrotask(() => { isLoadingRef.current = false; });
			}
		}

		const path = Path.normalize(entry.path);
		const node = fs.getNode(path);
		// node is only defined for paths the file tree knows about. Search results
		// can target files outside the currently loaded tree, so a missing node
		// shouldn't block opening — only bail when we know the entry isn't a file.
		if (node && node.kind !== "file") {
			return false;
		}
		const viewKind = getFileViewKind(path);
		// Set the loading flag synchronously, before any awaits, so any onChange
		// fired during the file-load lifecycle (focus, internal BlockNote setup,
		// or replaceBlocks) is suppressed regardless of whether openedPath has
		// flushed yet.
		isLoadingRef.current = true;
		try {
			setOpenedUrl(undefined);
			setUrlViewCurrentUrl(undefined);
			setOpenedPath(path);
			if (viewKind === 'canvas' || viewKind === 'image') {
				// Dedicated viewers self-load via IPC.
				return true;
			}
			const isBinaryFormat = await fs.isBinaryFile(path);
			if (isBinaryFormat) return true;
			const content = await fs.readFile(path, "utf-8");
			const markdown = content.toString();
			const newDoc = editor.tryParseMarkdownToBlocks(markdown);
			if (newDoc) {
				editor.replaceBlocks(editor.document, newDoc);
			}
			return true;
		} finally {
			// Clear after the current task plus a microtask so the synchronous
			// onChange emitted by replaceBlocks is still suppressed.
			queueMicrotask(() => {
				isLoadingRef.current = false;
			});
		}
	}, [fs, editor]);

	const pushHistory = useCallback((entry: HistoryEntry) => {
		setHistory(prev => {
			const head = prev[historyIndex];
			if (head && entriesEqual(head, entry)) return prev;
			const trimmed = prev.slice(0, historyIndex + 1);
			const next = [...trimmed, entry];
			setHistoryIndex(next.length - 1);
			return next;
		});
	}, [historyIndex]);

	const openInEditor = useCallback(async (path: string) => {
		const normalized = Path.normalize(path);
		const ok = await loadView({ kind: 'file', path: normalized });
		if (!ok) return;
		pushHistory({ kind: 'file', path: normalized });
	}, [loadView, pushHistory]);

	const openUrl = useCallback(async (url: string) => {
		const trimmed = url.trim();
		if (!trimmed) return;
		const ok = await loadView({ kind: 'url', url: trimmed });
		if (!ok) return;
		pushHistory({ kind: 'url', url: trimmed });
	}, [loadView, pushHistory]);

	const goBack = useCallback(() => {
		if (historyIndex <= 0) return;
		const target = history[historyIndex - 1];
		if (!target) return;
		setHistoryIndex(historyIndex - 1);
		void loadView(target);
	}, [history, historyIndex, loadView]);

	const goForward = useCallback(() => {
		if (historyIndex >= history.length - 1) return;
		const target = history[historyIndex + 1];
		if (!target) return;
		setHistoryIndex(historyIndex + 1);
		void loadView(target);
	}, [history, historyIndex, loadView]);

	const viewKind: ViewKind = useMemo(() => {
		if (openedUrl) return 'url';
		if (!openedPath) return 'none';
		return getFileViewKind(openedPath);
	}, [openedPath, openedUrl]);

	const workspace = useMemo(() => ({
		openInEditor,
		openUrl,
		openedPath,
		openedUrl,
		urlViewCurrentUrl,
		setUrlViewCurrentUrl,
		viewKind,
		isCanvasFile: viewKind === 'canvas',
		isLoadingRef,
		goBack,
		goForward,
		canGoBack: historyIndex > 0,
		canGoForward: historyIndex < history.length - 1,
	}), [openInEditor, openUrl, openedPath, openedUrl, urlViewCurrentUrl, viewKind, goBack, goForward, history.length, historyIndex]);

	return (
		<WorkbenchContext.Provider
			value={{
				fs,
				treeRef,
				workspace,
				editor
			}}
		>
			{props.children}
		</WorkbenchContext.Provider>
	)
}

function entriesEqual(a: HistoryEntry, b: HistoryEntry): boolean {
	if (a.kind !== b.kind) return false;
	if (a.kind === 'file' && b.kind === 'file') return a.path === b.path;
	if (a.kind === 'url' && b.kind === 'url') return a.url === b.url;
	return false;
}

export function useWorkbench() {
	return use(WorkbenchContext);
}
