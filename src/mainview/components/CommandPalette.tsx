import { type FC, useState, useEffect, useCallback } from "react";
import { Command } from "cmdk";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface CommandItem {
	id: string;
	label: string;
	group: string;
	shortcut?: string;
	onSelect: () => void;
}

type Props = {
	commands: CommandItem[];
};

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

/**
 * VSCode-style command palette using cmdk.
 * Opens with Cmd+K / Ctrl+K or Cmd+Shift+P / Ctrl+Shift+P.
 */
export const CommandPalette: FC<Props> = ({ commands }) => {
	const [open, setOpen] = useState(false);

	// Listen for keyboard shortcuts
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Cmd+K / Ctrl+K
			if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				setOpen((prev) => !prev);
				return;
			}
			// Cmd+Shift+P / Ctrl+Shift+P (VSCode-style)
			if (e.key === "p" && (e.metaKey || e.ctrlKey) && e.shiftKey) {
				e.preventDefault();
				setOpen((prev) => !prev);
				return;
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, []);

	const handleSelect = useCallback(
		(id: string) => {
			const cmd = commands.find((c) => c.id === id);
			if (cmd) {
				setOpen(false);
				// Defer to let dialog close animation complete
				requestAnimationFrame(() => cmd.onSelect());
			}
		},
		[commands],
	);

	// Group commands by their group field
	const groups = commands.reduce<Record<string, CommandItem[]>>((acc, cmd) => {
		if (!acc[cmd.group]) acc[cmd.group] = [];
		acc[cmd.group].push(cmd);
		return acc;
	}, {});

	return (
		<Command.Dialog
			open={open}
			onOpenChange={setOpen}
			label="Command Palette"
		>
			<Command.Input
				placeholder="Type a command..."
				autoFocus
			/>
			<Command.List>
				<Command.Empty>No results found.</Command.Empty>

				{Object.entries(groups).map(([groupName, groupCommands]) => (
					<Command.Group key={groupName} heading={groupName}>
						{groupCommands.map((cmd) => (
							<Command.Item
								key={cmd.id}
								value={cmd.label}
								onSelect={() => handleSelect(cmd.id)}
							>
								<span className="flex-1">{cmd.label}</span>
								{cmd.shortcut && (
									<kbd className="cmdk-shortcut">{cmd.shortcut}</kbd>
								)}
							</Command.Item>
						))}
					</Command.Group>
				))}
			</Command.List>
		</Command.Dialog>
	);
};
