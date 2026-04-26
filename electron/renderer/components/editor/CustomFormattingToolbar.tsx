import { Children, isValidElement, cloneElement } from 'react';
import {
	FormattingToolbar,
	getFormattingToolbarItems,
	type FormattingToolbarProps,
} from '@blocknote/react';
import { CustomFileReplaceButton } from './CustomFileReplaceButton';

export function CustomFormattingToolbar(props: FormattingToolbarProps) {
	const items = getFormattingToolbarItems(props.blockTypeSelectItems);
	const swapped = items.map((child) => {
		if (isValidElement(child) && child.key === 'replaceFileButton') {
			return cloneElement(<CustomFileReplaceButton />, { key: 'replaceFileButton' });
		}
		return child;
	});
	return <FormattingToolbar {...props}>{Children.toArray(swapped)}</FormattingToolbar>;
}
