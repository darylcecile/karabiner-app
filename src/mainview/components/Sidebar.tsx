import { type FC, useState, useCallback, useEffect } from "react";
import {
	syncDataLoaderFeature,
	selectionFeature,
	hotkeysCoreFeature,
} from "@headless-tree/core";
import { useTree } from "@headless-tree/react";
import type { IDockviewPanelProps } from "dockview";

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
/*  Inner sidebar content (pure presentational)                       */
/* ------------------------------------------------------------------ */

type SidebarContentProps = {
	title: string;
	items: Record<string, FileNode>;
	rootId: string;
	onSelectFile: (path: string) => void;
};

const SidebarContent: FC<SidebarContentProps> = ({ title, items, rootId, onSelectFile }) => {
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

	// Force tree rebuild when items or rootId change (syncDataLoaderFeature
	// doesn't auto-rebuild when the underlying data changes)
	useEffect(() => {
		tree.rebuildTree();
	}, [items, rootId, tree]);

	return (
		<div className="flex flex-col h-full bg-sidebar overflow-hidden select-none">
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
					const treeProps = item.getProps();

					return (
						<button
							{...treeProps}
							type="button"
							key={item.getId()}
							onClick={(e) => {
								// Let headless-tree handle focus & expand/collapse
								treeProps.onClick?.(e as unknown as MouseEvent);
								// Also handle file selection
								handleSelect(data.path, isFolder);
							}}
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

/* ------------------------------------------------------------------ */
/*  Dockview panel wrapper                                            */
/* ------------------------------------------------------------------ */

/**
 * SidebarPanel — a Dockview panel component that wraps SidebarContent.
 * Receives file tree data via panel params.
 */
export const SidebarPanel = (props: IDockviewPanelProps) => {
	const { title, items, rootId, onSelectFile } = props.params as {
		title: string;
		items: Record<string, FileNode>;
		rootId: string;
		onSelectFile: (path: string) => void;
	};

	return (
		<SidebarContent
			title={title ?? "Explorer"}
			items={items ?? {}}
			rootId={rootId ?? "root"}
			onSelectFile={onSelectFile ?? (() => {})}
		/>
	);
};

/* ------------------------------------------------------------------ */
/*  Legacy export for backwards compat (re-export type)               */
/* ------------------------------------------------------------------ */
export { SidebarContent as Sidebar };
