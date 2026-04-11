import { startTransition, useEffect, useRef, useState } from "react";
import { TitleBar } from "./TitleBar";
import { SideNav } from "./SideNav";
import { StatusBar } from './StatusBar';
import { FileTree } from "@pierre/trees/react";
import { ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { HIconButton } from "./HIconButton";
import { useWorkbench } from "./Workbench";
import { KarabinerLogo } from "../KarabinerLogo";
import { Workspace } from "../../utils/workspace";
// import { Utils } from "electrobun";

export function ContentArea() {
	const { fs } = useWorkbench();
	const [files, setFiles] = useState<string[]>([]);
	const [expandedItems, setExpandedItems] = useState<string[]>([]);
	const expandedItemsRef = useRef<string[]>([]);

	useEffect(() => {
		expandedItemsRef.current = expandedItems;
	}, [expandedItems]);

	useEffect(() => {
		startTransition(() => {
			setFiles(fs.workspace?.listPaths() ?? []);
			setExpandedItems([]);
		});
	}, [fs.workspace]);

	async function handleExpandedItemsChange(nextExpandedItems: string[]) {
		const workspace = fs.workspace;
		const previousExpandedItems = expandedItemsRef.current;

		setExpandedItems(nextExpandedItems);

		if (!workspace) {
			return;
		}

		const newlyExpandedItems = nextExpandedItems.filter(
			(path) => !previousExpandedItems.includes(path),
		);

		if (newlyExpandedItems.length === 0) {
			return;
		}

		await Promise.all(newlyExpandedItems.map((path) => workspace.loadMore(path)));

		startTransition(() => {
			setFiles(workspace.listPaths());
		});
	}

	return (
		<div className="flex flex-col absolute inset-0">
			<TitleBar />
			<section className="flex flex-row flex-1">
				<SideNav className="pt-8">
					<FileTree
						className="bg-transparent"
						options={{
							flattenEmptyDirectories: true,
							dragAndDrop: true,
							gitStatus: [],
							sort: false,
							useLazyDataLoader: true,
						}}
						files={files}
						expandedItems={expandedItems}
						onExpandedItemsChange={(items) => {
							void handleExpandedItemsChange(items);
						}}
					/>
				</SideNav>
				<main className="flex flex-1 flex-col bg-paper">
					<TopBar />
					<div className="flex-1">
						 
					</div>
				</main>
			</section>
			<StatusBar />

			<WelcomeDialog />
		</div>
	)
}

function TopBar() {
	const { history, trafficLight } = useWorkbench();

	const w = trafficLight.width + 56 - 20 // traffic light + titlebar buttons + padding

	return (
		<div 
			className="flex flex-row justify-between h-8 px-1.5 w-full ml-auto"
			style={{
				maxWidth: `calc(100vw - ${w}px)`,
			}}
		>
			<div className="flex flex-row gap-1 items-center">
				<HIconButton
					icon={ArrowLeft01Icon}
					onClick={history.goBack}
					disabled={!history.goBack}
				/>
				<HIconButton
					icon={ArrowRight01Icon}
					onClick={history.goForward}
					disabled={!history.goForward}
				/>
			</div>

			<div className="flex flex-row gap-1 items-center electrobun-webkit-app-region-no-drag">
				
			</div>
		</div>
	)
}

function WelcomeDialog() {
	const { fs } = useWorkbench();

	useEffect(()=>{
		if (!fs.workspace) {
			const path = "karabiner-workspace";
			Workspace.getHomePath().then(async home => {
				const p = home + "/" + path;
				await Workspace.host?.mkdir([p, { recursive: true }]);
				await fs.openWorkspace(p);
				console.log("opened workspace at", p);
			});
		}
	}, []);

	if (fs.workspace) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden">
			<div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(248,250,252,0.82),rgba(241,245,249,0.58))] backdrop-blur-xl dark:bg-[linear-gradient(180deg,rgba(12,15,18,0.78),rgba(12,15,18,0.6))]" />
			<div className="pointer-events-none absolute inset-x-0 top-[14%] mx-auto h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(16,163,127,0.14),rgba(16,163,127,0))] blur-3xl" />

			<div className="relative z-10 w-full max-w-md px-6">
				<div className="rounded-[28px] bg-white/78 px-8 py-9 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur-2xl dark:bg-[rgba(20,24,28,0.8)] dark:shadow-[0_24px_80px_rgba(0,0,0,0.36)]">
					<div className="mb-6 flex justify-center">
						<KarabinerLogo />
					</div>

					<div className="text-center">
						<p className="text-[11px] font-medium uppercase tracking-[0.28em] text-foreground/42">
							Karabiner
						</p>
						<h1 className="mt-4 text-[2rem] leading-tight font-semibold tracking-[-0.05em] text-foreground">
							Welcome
						</h1>
						<p className="mt-3 text-sm leading-6 text-foreground/62">
							We're getting your workspace ready
						</p>
					</div>

					<div className="mt-8 flex justify-center">
						<div className="flex h-3 w-3 animate-pulse rounded-full bg-green-500" />
						<div className="ml-2 h-3 w-3 animate-pulse rounded-full bg-yellow-500" />
						<div className="ml-2 h-3 w-3 animate-pulse rounded-full bg-red-500" />
					</div>
				</div>
			</div>
		</div>
	)
}
