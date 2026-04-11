import { useWorkbench } from "./Workbench";
import { SidebarLeftIcon, LayoutAlignLeftIcon, LicenseDraftIcon, Search } from '@hugeicons/core-free-icons';
import { HIconButton } from "./HIconButton";
import { USE_NATIVE_MAC_DRAG_REGION } from "../../shared/window-effects";
import { cn } from "../../utils/cn";
import { HugeiconsIcon } from '@hugeicons/react';

export function TitleBar() {
	const { sidebar, trafficLight, history } = useWorkbench();

	return (
		<section
			className={cn(
				'h-10 pl-4 w-full flex flex-row items-center absolute top-0 inset-x-0',
				{ "electrobun-webkit-app-region-drag": !USE_NATIVE_MAC_DRAG_REGION },
				// "pointer-events-none"
			)}
		>
			<div // reserved space for traffic lights
				className="bg-transparent h-full pointer-events-none"
				style={{
					width: trafficLight.width + 16,
					marginLeft: -8
				}}
			/>
			<div className="flex flex-row items-center justify-between flex-1 h-full pr-1.5 text-foreground">
				<div
					className="min-w-7 w-full flex flex-row items-center justify-between "
					style={{
						maxWidth: sidebar.isOpen ? (sidebar.width - (trafficLight.width + 24)) : 28
					}}
				>
					<HIconButton
						icon={sidebar.isOpen ? SidebarLeftIcon : LayoutAlignLeftIcon}
						onClick={() => sidebar.setOpen(p => !p)}
					/>
				</div>

				<div className="flex flex-row gap-1 items-center electrobun-webkit-app-region-no-drag">
					<button className="size-7 flex items-center justify-center rounded-lg hover:bg-black/10 transition-colors">
						<HugeiconsIcon
							icon={Search}
							size={16}
							color="currentColor"
							strokeWidth={2}
							className="pointer-events-none"
						/>
					</button>

					<button className="size-7 flex items-center justify-center rounded-lg hover:bg-black/10 transition-colors">
						<HugeiconsIcon
							icon={LicenseDraftIcon}
							size={16}
							color="currentColor"
							strokeWidth={2}
							className="pointer-events-none"
						/>
					</button>
				</div>
			</div>
		</section>
	);
}
