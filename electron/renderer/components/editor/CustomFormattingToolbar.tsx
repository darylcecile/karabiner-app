import { Children, isValidElement, cloneElement } from 'react';
import {
	FormattingToolbar,
	getFormattingToolbarItems,
	type FormattingToolbarProps,
} from '@blocknote/react';
import { AIToolbarButton } from '@blocknote/xl-ai';
import { CustomFileReplaceButton } from './CustomFileReplaceButton';
import { isEditorAIEnabled } from './aiEnabled';

export function CustomFormattingToolbar(props: FormattingToolbarProps) {
	const items = getFormattingToolbarItems(props.blockTypeSelectItems);
	const swapped = items.map((child) => {
		if (isValidElement(child) && child.key === 'replaceFileButton') {
			return cloneElement(<CustomFileReplaceButton />, { key: 'replaceFileButton' });
		}
		return child;
	});
	const aiEnabled = isEditorAIEnabled();
	return (
		<FormattingToolbar {...props}>
			{Children.toArray(swapped)}
			{aiEnabled ? <AIToolbarButton key="aiToolbarButton" /> : null}
		</FormattingToolbar>
	);
}

