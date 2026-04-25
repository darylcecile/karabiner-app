import { createContext, PropsWithChildren, use, useEffect, useMemo, useRef, useState } from 'react';
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
		isLoadingRef: React.RefObject<boolean>,
	},
	editor: ReturnType<typeof useEditorState>,
});

export function Workbench(props: PropsWithChildren) {
	const config = useConfig();
	const [openedPath, setOpenedPath] = useState<string | undefined>(undefined);
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

	const workspace = useMemo(() => {
		return {
			openInEditor: async (path: string) => {
				path = Path.normalize(path);
				if (fs.getNode(path).kind !== "file") {
					return;
				}
				setOpenedPath(path);
				const isBinaryFormat = await fs.isBinaryFile(path);

				if (isBinaryFormat) {
					return;
				}
				const content = await fs.readFile(path, "utf-8");
				const markdown = content.toString();
				const newDoc = editor.tryParseMarkdownToBlocks(markdown);
				if (newDoc) {
					// Suppress the write-back triggered by the programmatic content load.
					// Otherwise BlockNote's onChange fires immediately and writes the file
					// back to disk, bumping mtime and invalidating the AI label cache.
					isLoadingRef.current = true;
					try {
						editor.replaceBlocks(editor.document, newDoc);
					} finally {
						// ProseMirror dispatches change transactions synchronously, but
						// React may batch onChange into a microtask. Clear after one tick.
						queueMicrotask(() => {
							isLoadingRef.current = false;
						});
					}
				}
			},
			openedPath,
			isLoadingRef,
		}
	}, [fs, openedPath, editor]);

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
