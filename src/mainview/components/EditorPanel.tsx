import { type FC, type ReactNode } from "react";

type Props = {
	children?: ReactNode;
};

/**
 * Main editor content area. Fills remaining horizontal space between
 * sidebar and context panel. Renders whatever content the active tab provides.
 */
export const EditorPanel: FC<Props> = ({ children }) => {
	return (
		<div className="flex-1 min-w-0 bg-editor text-editor-fg overflow-auto font-mono text-[var(--font-size-editor)] leading-[var(--line-height-editor)]">
			{children ?? (
				<div className="flex items-center justify-center h-full text-fg-muted">
					<div className="text-center space-y-2">
						<div className="text-4xl opacity-30">K</div>
						<p className="text-[var(--font-size-base)]">
							Open a file or start an agent session
						</p>
					</div>
				</div>
			)}
		</div>
	);
};
