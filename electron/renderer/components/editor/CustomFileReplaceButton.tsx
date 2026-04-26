import {
	useBlockNoteEditor,
	useComponentsContext,
	useDictionary,
	useEditorState,
} from '@blocknote/react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ReplaceIcon } from '@hugeicons/core-free-icons';
import { CustomFilePanel } from './CustomFilePanel';

export function CustomFileReplaceButton() {
	const editor = useBlockNoteEditor();
	const Components = useComponentsContext();
	const dict = useDictionary();

	// Mirror the default selector: only show when exactly one block is selected
	// and that block has a `url` prop (i.e. an image / file block).
	const block = useEditorState({
		editor,
		selector: ({ editor: ed }) => {
			if (!ed.isEditable) return undefined;
			const blocks = ed.getSelection()?.blocks || [ed.getTextCursorPosition().block];
			if (blocks.length !== 1) return undefined;
			const b = blocks[0] as { id: string; type: string; props?: Record<string, unknown> };
			if (b.props && 'url' in b.props) return b;
			return undefined;
		},
	});

	if (!Components || !block) return null;

	const tooltip =
		dict.formatting_toolbar.file_replace.tooltip[block.type] ||
		dict.formatting_toolbar.file_replace.tooltip.file;

	return (
		<Components.Generic.Popover.Root position="bottom">
			<Components.Generic.Popover.Trigger>
				<Components.FormattingToolbar.Button
					className="bn-button"
					mainTooltip={tooltip}
					label={tooltip}
					icon={<HugeiconsIcon icon={ReplaceIcon} size={16} />}
				/>
			</Components.Generic.Popover.Trigger>
			<Components.Generic.Popover.Content
				className="bn-popover-content bn-panel-popover"
				variant="panel-popover"
			>
				<CustomFilePanel blockId={block.id} />
			</Components.Generic.Popover.Content>
		</Components.Generic.Popover.Root>
	);
}
