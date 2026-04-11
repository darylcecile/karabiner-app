import { useWorkbench } from "./Workbench";
import { HugeiconsIcon } from '@hugeicons/react'
import { SidebarLeftIcon, LayoutAlignLeftIcon, LicenseDraftIcon, Search } from '@hugeicons/core-free-icons'

export function TitleBar() {
	const { sidebar } = useWorkbench();

	return (
		<section className="h-10 w-full flex flex-row items-center">
			<div
				className="bg-transparent h-full"
				style={{
					width: 82
				}}
			/>
			<div className="flex flex-row items-center justify-between flex-1 h-full pr-2 text-foreground">
				<div>
					<button 
						className="w-6 h-6 flex items-center justify-center rounded hover:bg-background/20 transition-colors"
						onClick={() => {
							sidebar.setOpen(p => !p);
						}}
					>
						<HugeiconsIcon
							icon={sidebar.isOpen ? SidebarLeftIcon : LayoutAlignLeftIcon}
							size={16}
							color="currentColor"
							strokeWidth={2}
						/>
					</button>
				</div>

				<div className="flex flex-row gap-2 items-center">
					<button className="w-6 h-6 flex items-center justify-center rounded hover:bg-background/20 transition-colors">
						<HugeiconsIcon
							icon={Search}
							size={16}
							color="currentColor"
							strokeWidth={2}
						/>
					</button>

					<button className="w-6 h-6 flex items-center justify-center rounded hover:bg-background/20 transition-colors">
						<HugeiconsIcon
							icon={LicenseDraftIcon}
							size={16}
							color="currentColor"
							strokeWidth={2}
						/>
					</button>
				</div>
			</div>
		</section>
	);
}
