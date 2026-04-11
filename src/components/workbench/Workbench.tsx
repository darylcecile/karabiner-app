import { createContext, Dispatch, PropsWithChildren, SetStateAction, use, useState } from "react";
import { useColorScheme } from '../../hooks/useColorScheme';
import { Workspace } from "../../utils/workspace";

export const WORKBENCH_SIDEBAR_DEFAULT_WIDTH = 280;
export const WORKBENCH_SIDEBAR_COLLAPSE_WIDTH = 120;
export const WORKBENCH_SIDEBAR_MIN_WIDTH = WORKBENCH_SIDEBAR_COLLAPSE_WIDTH;
export const WORKBENCH_SIDEBAR_MAX_WIDTH = 420;

interface WorkbenchContextValue {
	sidebar: {
		isOpen: boolean;
		setOpen: Dispatch<SetStateAction<boolean>>
		width: number;
		setWidth: Dispatch<SetStateAction<number>>
	};
	trafficLight: {
		width: number;
	};
	history: {
		pushToHistory: (path: string) => void;
		goBack?: () => void;
		goForward?: () => void;
	},
	fs: {
		workspace: Workspace | null;
		openWorkspace: (path: string) => Promise<void>;
		closeWorkspace: () => void;
	}
}

// context

const WorkbenchContext = createContext<WorkbenchContextValue>({} as WorkbenchContextValue);

export function Workbench(props: PropsWithChildren) {
	const [sidebarOpen, setSidebarOpen] = useState(true);
	const [sidebarWidth, setSidebarWidth] = useState(WORKBENCH_SIDEBAR_DEFAULT_WIDTH);
	const [theme] = useColorScheme();
	const [history, setHistory] = useState<{
		visitedPaths: string[];
		currentIndex: number;
	}>({
		visitedPaths: [],
		currentIndex: -1,
	});
	const [workspace, setWorkspace] = useState<Workspace | null>(null);

	function pushToHistory(path: string) {
		setHistory(prev => {
			const newVisitedPaths = [...prev.visitedPaths];
			// If we're not at the end of the history stack, remove all forward entries
			if (prev.currentIndex < prev.visitedPaths.length - 1) {
				newVisitedPaths.splice(prev.currentIndex + 1);
			}
			newVisitedPaths.push(path);
			return {
				visitedPaths: newVisitedPaths,
				currentIndex: prev.currentIndex + 1,
			};
		});
	}

	function goBack() {
		setHistory(prev => ({
			...prev,
			currentIndex: Math.max(prev.currentIndex - 1, 0),
		}));
	}

	function goForward() {
		setHistory(prev => ({
			...prev,
			currentIndex: Math.min(prev.currentIndex + 1, prev.visitedPaths.length - 1),
		}));
	}

	return (
		<WorkbenchContext.Provider
			value={{
				sidebar: {
					isOpen: sidebarOpen,
					setOpen: setSidebarOpen,
					width: sidebarWidth,
					setWidth: setSidebarWidth,
				},
				trafficLight: {
					width: 54,
				},
				history: {
					pushToHistory,
					goBack: history.currentIndex > 0 ? goBack : undefined,
					goForward: history.currentIndex < history.visitedPaths.length - 1 ? goForward : undefined,
				},
				fs: {
					workspace,
					openWorkspace: async (path: string) => setWorkspace(await Workspace.from(path)),
					closeWorkspace: () => setWorkspace(null),
				},
			}}
		>
			<div className={`contents ${theme}`}>
				{props.children}
			</div>
		</WorkbenchContext.Provider>
	)
}

export function useWorkbench() {
	return use(WorkbenchContext);
}
