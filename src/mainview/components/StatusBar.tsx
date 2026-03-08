import { type FC, type ReactNode } from "react";

export type StatusBarItem = {
	id: string;
	content: ReactNode;
	align: "left" | "right";
	onClick?: () => void;
};

type Props = {
	items: StatusBarItem[];
};

const StatusBarEntry: FC<{ item: StatusBarItem }> = ({ item }) => {
	if (item.onClick) {
		return (
			<button
				type="button"
				onClick={item.onClick}
				className="flex items-center gap-1 cursor-pointer hover:bg-statusbar-hover px-1 rounded-sm"
			>
				{item.content}
			</button>
		);
	}
	return (
		<span className="flex items-center gap-1">
			{item.content}
		</span>
	);
};

/**
 * Bottom status bar spanning full width.
 * 22px tall, blue background matching VSCode.
 */
export const StatusBar: FC<Props> = ({ items }) => {
	const left = items.filter((i) => i.align === "left");
	const right = items.filter((i) => i.align === "right");

	return (
		<div
			className="flex items-center justify-between bg-statusbar text-statusbar-fg
			           text-[var(--font-size-xs)] px-2 shrink-0 select-none"
			style={{ height: "var(--spacing-statusbar-height)" }}
		>
			{/* Left items */}
			<div className="flex items-center gap-3">
				{left.map((item) => (
					<StatusBarEntry key={item.id} item={item} />
				))}
			</div>

			{/* Right items */}
			<div className="flex items-center gap-3">
				{right.map((item) => (
					<StatusBarEntry key={item.id} item={item} />
				))}
			</div>
		</div>
	);
};
