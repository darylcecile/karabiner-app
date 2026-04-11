import { useEffect, useState } from "react";
import { useWorkbench } from "./Workbench";
import { SidebarLeftIcon, LayoutAlignLeftIcon, LicenseDraftIcon, Search } from '@hugeicons/core-free-icons';
import { HIconButton } from "./HIconButton";
import { USE_NATIVE_MAC_DRAG_REGION } from "../../shared/window-effects";
import { cn } from "../../utils/cn";

export function TitleBar() {
	const { sidebar, trafficLight, fs } = useWorkbench();
	const [isCreateFileOpen, setIsCreateFileOpen] = useState(false);
	const [filePath, setFilePath] = useState("");
	const [isCreatingFile, setIsCreatingFile] = useState(false);
	const [createFileError, setCreateFileError] = useState<string | null>(null);

	useEffect(() => {
		if (!isCreateFileOpen) {
			setFilePath("");
			setCreateFileError(null);
			setIsCreatingFile(false);
		}
	}, [isCreateFileOpen]);

	async function createFile() {
		const workspace = fs.workspace;
		const path = filePath.trim();

		if (!workspace) {
			setCreateFileError("Workspace is not ready yet.");
			return;
		}

		if (!path) {
			setCreateFileError("Enter a filename or path.");
			return;
		}

		setIsCreatingFile(true);
		setCreateFileError(null);
		try {
			await workspace.write(path, "", { flag: "wx" });
			setIsCreatingFile(false);
			setIsCreateFileOpen(false);
		} catch (error) {
			setCreateFileError(error instanceof Error ? error.message : "Failed to create file.");
			setIsCreatingFile(false);
		}
	}

	return (
		<>
			<section
				className={cn(
					'h-8 pl-4 w-full flex flex-row items-center absolute top-0 inset-x-0',
					{ "electrobun-webkit-app-region-drag": !USE_NATIVE_MAC_DRAG_REGION },
				)}
			>
				<div // reserved space for traffic lights
					className="bg-transparent h-full pointer-events-none"
					style={{
						width: trafficLight.width + 8,
						marginLeft: -8
					}}
				/>
				<div className="flex flex-row items-center justify-between flex-1 h-full pr-0.5 text-foreground">
					<HIconButton
						icon={sidebar.isOpen ? SidebarLeftIcon : LayoutAlignLeftIcon}
						onClick={() => sidebar.setOpen(p => !p)}
					/>

					<div className="flex flex-row gap-1 items-center electrobun-webkit-app-region-no-drag">
						<HIconButton
							icon={Search}
						/>

						<HIconButton
							icon={LicenseDraftIcon}
							onClick={() => setIsCreateFileOpen(true)}
						/>
					</div>
				</div>
			</section>

			{isCreateFileOpen ? (
				<div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden electrobun-webkit-app-region-no-drag">
					<button
						type="button"
						className="absolute inset-0 bg-[linear-gradient(180deg,rgba(248,250,252,0.82),rgba(241,245,249,0.58))] backdrop-blur-xl dark:bg-[linear-gradient(180deg,rgba(12,15,18,0.78),rgba(12,15,18,0.6))]"
						onClick={() => setIsCreateFileOpen(false)}
						aria-label="Close create file dialog"
					/>
					<div className="pointer-events-none absolute inset-x-0 top-[14%] mx-auto h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(16,163,127,0.14),rgba(16,163,127,0))] blur-3xl" />

					<div className="relative z-10 w-full max-w-md px-6">
						<div className="rounded-[28px] bg-white/78 px-8 py-9 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur-2xl dark:bg-[rgba(20,24,28,0.8)] dark:shadow-[0_24px_80px_rgba(0,0,0,0.36)]">
							<div className="text-center">
								<p className="text-[11px] font-medium uppercase tracking-[0.28em] text-foreground/42">
									Karabiner
								</p>
								<h2 className="mt-4 text-[2rem] leading-tight font-semibold tracking-[-0.05em] text-foreground">
									Create File
								</h2>
								<p className="mt-3 text-sm leading-6 text-foreground/62">
									Enter a filename or path inside your workspace
								</p>
							</div>

							<div className="mt-8">
								<input
									autoFocus
									type="text"
									value={filePath}
									onChange={(event) => {
										setFilePath(event.target.value);
										if (createFileError) setCreateFileError(null);
									}}
									onKeyDown={(event) => {
										if (event.key === "Enter") {
											event.preventDefault();
											void createFile();
										}
										if (event.key === "Escape") {
											event.preventDefault();
											setIsCreateFileOpen(false);
										}
									}}
									placeholder="example.txt or notes/todo.md"
									className="h-10 w-full rounded-xl border border-black/8 bg-white/82 px-3 text-sm text-foreground outline-none transition focus:border-black/16 focus:ring-2 focus:ring-emerald-500/35 dark:border-white/12 dark:bg-white/8"
								/>
								{createFileError ? (
									<p className="mt-2 text-xs text-red-600 dark:text-red-400">{createFileError}</p>
								) : null}
							</div>

							<div className="mt-6 flex flex-row justify-end gap-2">
								<button
									type="button"
									className="h-9 rounded-lg px-3 text-sm font-medium text-foreground/72 transition hover:bg-black/5 dark:hover:bg-white/8"
									onClick={() => setIsCreateFileOpen(false)}
									disabled={isCreatingFile}
								>
									Cancel
								</button>
								<button
									type="button"
									className="h-9 rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
									onClick={() => {
										void createFile();
									}}
									disabled={isCreatingFile}
								>
									{isCreatingFile ? "Creating..." : "Create"}
								</button>
							</div>
						</div>
					</div>
				</div>
			) : null}
		</>
	);
}
