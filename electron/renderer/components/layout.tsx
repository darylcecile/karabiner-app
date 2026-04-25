import { Allotment } from 'allotment'
import { PropsWithChildren, useState } from 'react'
import { Action, ActionBar, useActionBar } from './titlebar';
import "allotment/dist/style.css";

import { ArrowLeft02Icon, ArrowRight02Icon, LayoutAlignLeftIcon, LeftAngleIcon, LeftTriangleIcon, PanelLeftOpenIcon, PlusSignIcon } from '@hugeicons/core-free-icons';
import { useWorkbench } from './workbench/Workbench';
import { InputModal, useInputModalController } from './workbench/InputModal';
import { toast } from 'sonner';
import { FileTree } from './workbench/FileTree';
import { TreeAccordion } from '@/renderer/components/workbench/TreeAccordion';
import { Editor } from '@/renderer/components/editor';
import { atom, useAtom } from 'jotai';
import { ScrollArea, ScrollBar } from './ui/scroll-area';
import { ContentScrollArea } from '@/renderer/components/workbench/ContentScrollArea';
import { usePrefersColorScheme } from '../hooks/usePrefersColorScheme';
import { cn } from '@/shared/utils';

const sidebarCollapsedAtom = atom(false)

export function RootLayout(props: PropsWithChildren) {
	const [collapsed, setCollapsed] = useAtom(sidebarCollapsedAtom);
	const theme = usePrefersColorScheme();

	return (
		<div
			className={cn(
				"contents",
				theme === "dark" && "dark"
			)}
		>
			<Allotment
				proportionalLayout={false}
				separator={!collapsed}
				onVisibleChange={(index, visible) => {
					if (index === 0) {
						setCollapsed(!visible)
					}
				}}
			>
				<Allotment.Pane
					preferredSize={240}
					className='pt-8.5'
					snap
					minSize={100}
					visible={!collapsed}
				>
					<ActionBar className="mr-1 pl-20 flex items-center absolute">
						<Action icon={collapsed ? PanelLeftOpenIcon : LayoutAlignLeftIcon} onClick={() => setCollapsed(p => !p)} />
					</ActionBar>
					<div className="p-2">
						<TreeAccordion label="Collections">
							<FileTree />
						</TreeAccordion>
					</div>
				</Allotment.Pane>
				<Allotment.Pane>
					<div className="relative h-full">
						<ContentScrollArea
							className='pt-6 bg-background/25 dark:bg-black/20'
							scrollbarTopOffset={32}
							scrollbarBottomOffset={16}
							thumbWidth={6}
							topFadeHeight={56}
						>
							<Editor />
							{props.children}
						</ContentScrollArea>
						<ActionBar className='ml-1 px-1 flex items-center justify-between z-100'>
							<LeftAlignedActionBarGroup />
							<RightAlignedActionBarGroup />
						</ActionBar>
					</div>
				</Allotment.Pane>
			</Allotment>
		</div>
	)
}

function LeftAlignedActionBarGroup() {
	const { width } = useActionBar();
	const maxWidth = Math.min(width, window.innerWidth - 132);
	const [collapsed, setCollapsed] = useAtom(sidebarCollapsedAtom);

	return (
		<>
			<div
				className="absolute w-full h-6 ml-auto flex flex-row items-center right-0 pl-20 mr-10"
				style={{ width: window.innerWidth }}
			>
				<Action
					icon={collapsed ? PanelLeftOpenIcon : LayoutAlignLeftIcon}
					className='ml-10'
					onClick={() => setCollapsed(p => !p)}
				/>
			</div>
			<div
				className="w-full relative h-6 ml-auto flex flex-row items-center"
				style={{ maxWidth }}
			>
				<div className='flex flex-row items-center'>
					<Action icon={ArrowLeft02Icon} onClick={() => toast("New file")} />
					<Action icon={ArrowRight02Icon} onClick={() => toast("New file")} />
				</div>
			</div>
		</>
	)
}

function RightAlignedActionBarGroup() {
	const { fs } = useWorkbench();
	const inputController = useInputModalController();

	async function handleNewFile() {
		const name = await inputController.prompt({
			title: "New File",
			message: "Enter the name of the new file:",
			messagePlaceholder: "e.g. untitled.md",
		});

		if (name === null) {
			return;
		}

		if (!name.trim()) {
			toast.error("File name cannot be empty.");
			return;
		}

		await fs.createFile(name.trim());
	}

	return (
		<>
			<div className='flex flex-row items-center gap-2 justify-end'>
				<Action icon={PlusSignIcon} onClick={handleNewFile} />
			</div>
			<InputModal controller={inputController} />
		</>
	)
}
