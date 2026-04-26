import { createContext, PropsWithChildren, use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFileTree, Tree } from '@/renderer/hooks/useTree';
import { useConfig } from '@/renderer/hooks/useConfig';
import { Path } from '@/shared/fsUtils';
import { useEditorState } from '@/renderer/components/editor';

const WorkbenchContext = createContext({} as {
	fs: Tree;
	treeRef: React.RefObject<unknown>,
	workspace: {
		openInEditor: (path: string) => void,
		openedPath?: string,
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
	const [history, setHistory] = useState<string[]>([]);
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
	const editor = useEditorState();
	const isLoadingRef = useRef<boolean>(false);

	useEffect(() => {
		void fs.openRoot('~/.karabiner/vault');
	}, [fs.openRoot]);

	// Loads a file into the editor without touching history. Used by both the
	// public openInEditor (which adds to history) and the back/forward navigators.
	const loadIntoEditor = useCallback(async (path: string) => {
		path = Path.normalize(path);
		const node = fs.getNode(path);
		// node is only defined for paths the file tree knows about. Search results
		// can target files outside the currently loaded tree, so a missing node
		// shouldn't block opening — only bail when we know the entry isn't a file.
		if (node && node.kind !== "file") {
			return false;
		}
		const isCanvas = path.toLowerCase().endsWith('.canvas');
		// Set the loading flag synchronously, before any awaits, so any onChange
		// fired during the file-load lifecycle (focus, internal BlockNote setup,
		// or replaceBlocks) is suppressed regardless of whether openedPath has
		// flushed yet.
		isLoadingRef.current = true;
		try {
			setOpenedPath(path);
			if (isCanvas) {
				// Canvas files bypass BlockNote — the CanvasView component
				// fetches its own content via IPC.
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

	const openInEditor = useCallback(async (path: string) => {
		const normalized = Path.normalize(path);
		const ok = await loadIntoEditor(normalized);
		if (!ok) return;
		// Push onto history, truncating any forward entries. Skip if we're
		// re-opening the current head (avoids dupes from clicking the same row).
		setHistory(prev => {
			const head = prev[historyIndex];
			if (head === normalized) return prev;
			const trimmed = prev.slice(0, historyIndex + 1);
			const next = [...trimmed, normalized];
			setHistoryIndex(next.length - 1);
			return next;
		});
	}, [loadIntoEditor, historyIndex]);

	const goBack = useCallback(() => {
		if (historyIndex <= 0) return;
		const target = history[historyIndex - 1];
		if (!target) return;
		setHistoryIndex(historyIndex - 1);
		void loadIntoEditor(target);
	}, [history, historyIndex, loadIntoEditor]);

	const goForward = useCallback(() => {
		if (historyIndex >= history.length - 1) return;
		const target = history[historyIndex + 1];
		if (!target) return;
		setHistoryIndex(historyIndex + 1);
		void loadIntoEditor(target);
	}, [history, historyIndex, loadIntoEditor]);

	const workspace = useMemo(() => ({
		openInEditor,
		openedPath,
		isCanvasFile: openedPath ? openedPath.toLowerCase().endsWith('.canvas') : false,
		isLoadingRef,
		goBack,
		goForward,
		canGoBack: historyIndex > 0,
		canGoForward: historyIndex < history.length - 1,
	}), [openInEditor, openedPath, goBack, goForward, history.length, historyIndex]);

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

export function useWorkbench() {
	return use(WorkbenchContext);
}
