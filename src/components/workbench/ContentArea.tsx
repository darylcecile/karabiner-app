import { TitleBar } from "./TitleBar";
import { SideNav } from "./SideNav";
import { StatusBar } from './StatusBar';
import { FileTree } from "@pierre/trees/react";
import { HugeiconsIcon } from '@hugeicons/react';
import { LicenseDraftIcon, Search, ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons';
import { HIconButton } from "./HIconButton";
import { useWorkbench } from "./Workbench";

export function ContentArea() {

	return (
		<div className="flex flex-col absolute inset-0">
			<TitleBar />
			<section className="flex flex-row flex-1">
				<SideNav className="pt-10">
					<FileTree
						className="bg-transparent"
						options={{
							flattenEmptyDirectories: false,
							fileTreeSearchMode: "hide-non-matches",
							dragAndDrop: true,
							gitStatus: [],
							sort: false,
							lockedPaths: [
								"src/components/workbench/ContentArea.tsx",
							],
						}}
						files={[
							"src/components/workbench/ContentArea.tsx",
							"src/components/workbench/ResizeBar.tsx",
							"src/components/workbench/SideNav.tsx",
							"src/components/workbench/StatusBar.tsx",
							"src/components/workbench/TitleBar.tsx",
							"src/mainview/App.tsx",
							"src/mainview/index.css",
						]}
						initialExpandedItems={['src']}
					/>
				</SideNav>
				<main className="flex flex-1 flex-col bg-paper">
					<TopBar />
					<div className="flex-1">
						 
					</div>
				</main>
			</section>
			<StatusBar />
		</div>
	)
}

function TopBar() {
	const { history, trafficLight } = useWorkbench();

	const w = trafficLight.width + 56 - 8 // traffic light + titlebar buttons + padding

	return (
		<div 
			className="flex flex-row justify-between h-10 px-1.5 w-full ml-auto"
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

