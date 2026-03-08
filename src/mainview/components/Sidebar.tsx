import { type FC, useState, useCallback } from "react";
import {
	syncDataLoaderFeature,
	selectionFeature,
	hotkeysCoreFeature,
} from "@headless-tree/core";
import { useTree } from "@headless-tree/react";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface FileNode {
	name: string;
	path: string;
	isDirectory: boolean;
	children?: string[];
	/** Git status for decorations */
	status?: "modified" | "added" | "deleted" | "untracked" | "renamed" | "ignored" | "conflict";
}

type Props = {
	title: string;
	/** Map of item id → FileNode data */
	items: Record<string, FileNode>;
	/** The root item id (e.g. the project root path) */
	rootId: string;
	/** Called when a file is selected (not a directory) */
	onSelectFile: (path: string) => void;
};

/* ------------------------------------------------------------------ */
/*  Git status helpers                                                */
/* ------------------------------------------------------------------ */

const GIT_STATUS_CLASSES: Record<string, string> = {
	modified: "text-git-modified",
	added: "text-git-added",
	deleted: "text-git-deleted",
	untracked: "text-git-untracked",
	renamed: "text-git-renamed",
	ignored: "text-git-ignored",
	conflict: "text-git-conflict",
};

const GIT_STATUS_LABELS: Record<string, string> = {
	modified: "M",
	added: "A",
	deleted: "D",
	untracked: "U",
	renamed: "R",
	ignored: "!",
	conflict: "C",
};

/* ------------------------------------------------------------------ */
/*  Sidebar component                                                 */
/* ------------------------------------------------------------------ */

export const Sidebar: FC<Props> = ({ title, items, rootId, onSelectFile }) => {
	const [selectedPath, setSelectedPath] = useState<string | null>(null);

	const handleSelect = useCallback(
		(path: string, isDirectory: boolean) => {
			if (!isDirectory) {
				setSelectedPath(path);
				onSelectFile(path);
			}
		},
		[onSelectFile],
	);

	const tree = useTree<FileNode>({
		rootItemId: rootId,
		getItemName: (item) => item.getItemData().name,
		isItemFolder: (item) => item.getItemData().isDirectory,
		dataLoader: {
			getItem: (itemId) => items[itemId],
			getChildren: (itemId) => items[itemId]?.children ?? [],
		},
		indent: 16,
		features: [syncDataLoaderFeature, selectionFeature, hotkeysCoreFeature],
	});

	return (
		<div
			className="flex flex-col bg-sidebar border-r border-sidebar-border overflow-hidden shrink-0 select-none"
			style={{ width: "var(--spacing-sidebar-width)" }}
		>
			{/* Section header */}
			<div
				className="flex items-center px-4 uppercase tracking-wider font-semibold
				           text-[11px] text-sidebar-header-fg bg-sidebar shrink-0"
				style={{ height: "var(--spacing-tab-height)" }}
			>
				{title}
			</div>

			{/* Headless tree */}
			<div
				{...tree.getContainerProps()}
				className="flex-1 overflow-y-auto overflow-x-hidden"
			>
				{tree.getItems().map((item) => {
					const data = item.getItemData();
					const isFolder = item.isFolder();
					const isExpanded = item.isExpanded();
					const isSelected = data.path === selectedPath;
					const isFocused = item.isFocused();
					const level = item.getItemMeta().level;
					const statusClass = data.status ? GIT_STATUS_CLASSES[data.status] : "";
					const statusLabel = data.status ? GIT_STATUS_LABELS[data.status] : "";

					return (
						<button
							{...item.getProps()}
							type="button"
							key={item.getId()}
							onClick={() => handleSelect(data.path, isFolder)}
							className={`
								flex items-center w-full text-left cursor-pointer
								text-[var(--font-size-sm)] leading-[22px] h-[22px]
								transition-colors
								${isSelected ? "bg-list-active text-list-active-fg" : ""}
								${isFocused && !isSelected ? "bg-list-hover" : ""}
								${!isSelected && !isFocused ? "hover:bg-list-hover" : ""}
								${statusClass || "text-sidebar-fg"}
							`}
							style={{ paddingLeft: `${level * 16 + 8}px` }}
						>
							{/* Chevron for folders */}
							{isFolder ? (
								<span className="mr-1 text-[10px] text-sidebar-fg/60 w-4 text-center select-none shrink-0">
									{isExpanded ? "\u25BC" : "\u25B6"}
								</span>
							) : (
								<span className="w-4 mr-1 shrink-0" />
							)}

							{/* Name */}
							<span className="truncate flex-1">{data.name}</span>

							{/* Git status badge */}
							{statusLabel && (
								<span
									className={`ml-auto mr-2 text-[10px] font-semibold shrink-0 ${statusClass}`}
								>
									{statusLabel}
								</span>
							)}
						</button>
					);
				})}

				{Object.keys(items).length <= 1 && (
					<div className="px-4 py-6 text-fg-muted text-[var(--font-size-sm)] text-center">
						No files
					</div>
				)}
			</div>
		</div>
	);
};
