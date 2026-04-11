import { createContext, Dispatch, PropsWithChildren, SetStateAction, use, useState } from "react";
import { useColorScheme } from '../../hooks/useColorScheme';

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
}

const WorkbenchContext = createContext<WorkbenchContextValue>({} as WorkbenchContextValue);

export function Workbench(props: PropsWithChildren) {
	const [sidebarOpen, setSidebarOpen] = useState(true);
	const [sidebarWidth, setSidebarWidth] = useState(WORKBENCH_SIDEBAR_DEFAULT_WIDTH);
	const [theme] = useColorScheme();

	return (
		<WorkbenchContext.Provider
			value={{
				sidebar: {
					isOpen: sidebarOpen,
					setOpen: setSidebarOpen,
					width: sidebarWidth,
					setWidth: setSidebarWidth,
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
