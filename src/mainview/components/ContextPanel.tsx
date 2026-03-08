import { type FC, type ReactNode } from "react";

export type ContextSection = {
	id: string;
	title: string;
	badge?: number;
	expanded?: boolean;
	content: ReactNode;
};

type Props = {
	sections: ContextSection[];
	onToggleSection: (id: string) => void;
	visible: boolean;
};

/**
 * Right-side context panel showing supplementary information:
 * MCPs, LSP info, modified files, etc.
 * Collapsible sections with VSCode-style accordion headers.
 */
export const ContextPanel: FC<Props> = ({ sections, onToggleSection, visible }) => {
	if (!visible) return null;

	return (
		<div
			className="flex flex-col bg-context-panel text-context-panel-fg border-l border-context-panel-border overflow-hidden shrink-0"
			style={{ width: "var(--spacing-context-panel-width)" }}
		>
			{sections.map((section) => (
				<div key={section.id} className="flex flex-col">
					{/* Section header */}
					<button
						type="button"
						onClick={() => onToggleSection(section.id)}
						className="flex items-center gap-1.5 px-3 py-1.5
						           bg-context-panel-header text-[11px] font-semibold uppercase tracking-wider
						           cursor-pointer hover:bg-list-hover transition-colors text-left"
					>
						<span className="text-[10px] text-fg-secondary w-3 text-center select-none">
							{section.expanded ? "\u25BC" : "\u25B6"}
						</span>
						<span className="flex-1 truncate">{section.title}</span>
						{section.badge != null && section.badge > 0 && (
							<span
								className="min-w-[18px] h-[18px] flex items-center justify-center
								           rounded-full bg-badge text-badge-fg
								           text-[10px] font-semibold leading-none px-1"
							>
								{section.badge}
							</span>
						)}
					</button>

					{/* Section content */}
					{section.expanded && (
						<div className="px-3 py-2 text-[var(--font-size-sm)] overflow-y-auto">
							{section.content}
						</div>
					)}
				</div>
			))}
		</div>
	);
};
