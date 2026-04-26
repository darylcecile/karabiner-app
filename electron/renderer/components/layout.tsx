import { Allotment } from 'allotment'
import { PropsWithChildren, useEffect, useState } from 'react'
import { Action, ActionBar, useActionBar } from './titlebar';
import "allotment/dist/style.css";

import { ArrowLeft02Icon, ArrowRight02Icon, LayoutAlignLeftIcon, LeftAngleIcon, LeftTriangleIcon, LinkSquare02Icon, PanelLeftOpenIcon, PlusSignIcon } from '@hugeicons/core-free-icons';
import { useWorkbench } from './workbench/Workbench';
import { InputModal, useInputModalController } from './workbench/InputModal';
import { toast } from 'sonner';
import { FileTree } from './workbench/FileTree';
import { TreeAccordion } from '@/renderer/components/workbench/TreeAccordion';
import { Editor } from '@/renderer/components/editor';
import { CanvasView } from '@/renderer/components/canvas';
import { ImageViewer } from '@/renderer/components/imageviewer';
import { WebViewer } from '@/renderer/components/webviewer';
import { atom, useAtom } from 'jotai';
import { ScrollArea, ScrollBar } from './ui/scroll-area';
import { ContentScrollArea } from '@/renderer/components/workbench/ContentScrollArea';
import { IndexingStatusFooter } from '@/renderer/components/workbench/IndexingStatusFooter';
import { usePrefersColorScheme } from '../hooks/usePrefersColorScheme';
import { cn } from '@/shared/utils';
import { BlockNoteEditor } from '@blocknote/core';
import { main } from '@/renderer/relay';

const sidebarCollapsedAtom = atom(false)

type SearchOpenFilePayload = { path: string };
type WorkspaceOpenUrlPayload = { url: string };

export function RootLayout(props: PropsWithChildren) {
	const [collapsed, setCollapsed] = useAtom(sidebarCollapsedAtom);
	const theme = usePrefersColorScheme();
	const { editor, workspace } = useWorkbench();

	useEffect(() => {
		return window.karabinerEvents.on<SearchOpenFilePayload>('search:open-file', ({ path }) => {
			if (path) workspace.openInEditor(path);
		});
	}, [workspace.openInEditor]);

	useEffect(() => {
		return window.karabinerEvents.on<WorkspaceOpenUrlPayload>('workspace:open-url', ({ url }) => {
			if (url) workspace.openUrl(url);
		});
	}, [workspace.openUrl]);

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
						<Action icon={!collapsed ? PanelLeftOpenIcon : LayoutAlignLeftIcon} onClick={() => setCollapsed(p => !p)} />
					</ActionBar>
					<div className="p-2 max-h-[calc(100vh-34px)] overflow-y-auto">
						<TreeAccordion label="Collections" defaultOpen>
							<FileTree />
						</TreeAccordion>
					</div>
				</Allotment.Pane>
				<Allotment.Pane>
					<div className="relative h-full">
						{workspace.viewKind === 'canvas' && workspace.openedPath ? (
							<div className="absolute inset-0 pt-6">
								<CanvasView path={workspace.openedPath} />
							</div>
						) : workspace.viewKind === 'image' && workspace.openedPath ? (
							<div className="absolute inset-0 pt-6">
								<ImageViewer path={workspace.openedPath} />
							</div>
						) : workspace.viewKind === 'url' && workspace.openedUrl ? (
							<div className="absolute inset-0 pt-6">
								<WebViewer url={workspace.openedUrl} />
							</div>
						) : (
							<ContentScrollArea
								className='pt-6 bg-background/25 dark:bg-black/20'
								scrollbarTopOffset={32}
								scrollbarBottomOffset={16}
								thumbWidth={6}
								topFadeHeight={56}
								bottomFadeHeight={40}
								footer={
									<>
										<IndexingStatusFooter />
										{editor ? (
											<div
												className="text-2xs font-medium absolute right-4 left-4 bottom-2 text-foreground/50 flex items-center justify-between"
											>
												{/* status (e.g. 'indexing...')
												<div>
													{editor.isIndexing ? "Indexing..." : editor.isSaving ? "Saving..." : null}
												</div> */}
												<div />

												{/* document state (counts) */}
												<div>{getContentCounterFromEditor(editor)}</div>
											</div>
										) : null}
									</>
								}
							>
								<Editor />
								{props.children}
							</ContentScrollArea>
						)}
						<ActionBar className='ml-1 px-1 flex items-center justify-between z-100'>
							<MainActionBarGroup />
						</ActionBar>
					</div>
				</Allotment.Pane>
			</Allotment>
		</div>
	)
}

function MainActionBarGroup() {
	const [collapsed, setCollapsed] = useAtom(sidebarCollapsedAtom);
	const { workspace, fs } = useWorkbench();
	const inputController = useInputModalController();

	const maxWidth = window.innerWidth - 110;


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

	const fileName = workspace.viewKind === 'url'
		? (workspace.urlViewCurrentUrl ?? workspace.openedUrl)
		: workspace.openedPath
			? workspace.openedPath.split("/").at(-1)
			: "Untitled";

	async function handleOpenInBrowser() {
		const target = workspace.urlViewCurrentUrl ?? workspace.openedUrl;
		if (!target) return;
		try {
			const res = await main.openExternal(target);
			if ('error' in res && res.error) {
				toast.error(`Failed to open in browser: ${res.error}`);
			}
		} catch (err) {
			toast.error(`Failed to open in browser: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	return (
		<>
			<div
				className="absolute w-full h-6 ml-auto flex flex-row items-center right-0 pl-20"
				style={{ width: window.innerWidth }}
			>
				<Action
					icon={!collapsed ? PanelLeftOpenIcon : LayoutAlignLeftIcon}
					// className='ml-10'
					onClick={() => setCollapsed(p => !p)}
				/>
			</div>
			<div
				className="w-full relative h-6 ml-auto flex flex-row items-center justify-between"
				style={{ maxWidth }}
			>
				<div className='flex flex-row items-center'>
					<Action icon={ArrowLeft02Icon} onClick={workspace.goBack} disabled={!workspace.canGoBack} />
					<Action icon={ArrowRight02Icon} onClick={workspace.goForward} disabled={!workspace.canGoForward} />
				</div>

				<span className="text-2xs text-muted-foreground/80 truncate px-2 max-w-[60%]" title={fileName}>{fileName}</span>

				<div className='flex flex-row items-center justify-end min-w-12'>
					{workspace.viewKind === 'url' ? (
						<Action icon={LinkSquare02Icon} onClick={handleOpenInBrowser} />
					) : null}
					<Action icon={PlusSignIcon} onClick={handleNewFile} />
				</div>
			</div>
			<InputModal controller={inputController} />
		</>
	)
}


function getContentCounterFromEditor(editor: BlockNoteEditor) {
	function getInlineText(content: any): string {
		if (!content) return "";
		if (Array.isArray(content)) {
			return content.map(getInlineText).join("");
		}
		if (typeof content === "string") {
			return content;
		}
		if (content.type === "text") {
			return content.text ?? "";
		}
		if (content.type === "link") {
			return getInlineText(content.content);
		}
		if (content.type === "tableContent") {
			return (content.rows ?? [])
				.map((row: any) =>
					(row.cells ?? [])
						.map((cell: any) => getInlineText(cell.content ?? cell))
						.join(" ")
				)
				.join(" ");
		}
		if ("content" in content) {
			return getInlineText(content.content);
		}
		return "";
	}

	function getBlockText(block: any): string {
		return [getInlineText(block.content), ...(block.children ?? []).map(getBlockText)]
			.filter(Boolean)
			.join(" ");
	}

	const text = editor.document.map(getBlockText).filter(Boolean).join(" ").trim();
	const wordCount = text ? text.split(/\s+/).length : 0;
	const charCount = text.length;

	return `${wordCount} words, ${charCount} characters`;
}
