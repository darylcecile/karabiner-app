import { createContext, PropsWithChildren, use, useEffect, useMemo, useRef, useState } from 'react';
import { useFileTree, Tree, TreeItem } from '@/renderer/hooks/useTree';
import { useConfig } from '@/renderer/hooks/useConfig';
import { TreeApi } from 'react-arborist';
import { Path } from '@/shared/fsUtils';
import { useEditorState } from '@/renderer/components/editor';

const WorkbenchContext = createContext({} as {
	fs: Tree;
	treeRef: React.RefObject<TreeApi<TreeItem>>,
	workspace: {
		openInEditor: (path: string) => void,
		openedPath?: string,
	},
	editor: ReturnType<typeof useEditorState>,
});

export function Workbench(props: PropsWithChildren) {
	const config = useConfig();
	const [openedPath, setOpenedPath] = useState<string | undefined>(undefined);
	const includeHidden = config.getConfigValue("showHiddenFiles") || false;
	const treeOptions = useMemo(() => ({
		includeHidden,
		scanOnOpen: true,
		scanOptions: {
			ignore: ['node_modules', '.git', 'dist', 'build', 'out', 'target', '__pycache__'],
			maxDepth: 10,
		}
	}), [includeHidden]);
	const fs = useFileTree(treeOptions);
	const treeRef = useRef<TreeApi<TreeItem>>(null as unknown as TreeApi<TreeItem>);
	const editor = useEditorState();

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
					editor.replaceBlocks(editor.document, newDoc);
				}
			},
			openedPath
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
