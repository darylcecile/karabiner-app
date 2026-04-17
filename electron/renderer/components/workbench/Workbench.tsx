import { createContext, PropsWithChildren, use, useEffect, useMemo, useRef } from 'react';
import { useFileTree, Tree, TreeItem } from '@/renderer/hooks/useTree';
import { useConfig } from '@/renderer/hooks/useConfig';
import { TreeApi } from 'react-arborist';

const WorkbenchContext = createContext({} as {
	fs: Tree;
	treeRef: React.RefObject<TreeApi<TreeItem>>
});

export function Workbench(props: PropsWithChildren) {
	const config = useConfig();
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

	useEffect(() => {
		void fs.openRoot('~/.karabiner/vault');
	}, [fs.openRoot]);

	return (
		<WorkbenchContext.Provider value={{ fs, treeRef }}>
			{props.children}
		</WorkbenchContext.Provider>
	)
}

export function useWorkbench() {
	return use(WorkbenchContext);
}
