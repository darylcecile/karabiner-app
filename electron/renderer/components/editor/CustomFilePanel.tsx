import { useState } from 'react';
import {
	FilePanel,
	UploadTab,
	EmbedTab,
	useDictionary,
	type FilePanelProps,
} from '@blocknote/react';
import { LibraryTab } from './LibraryTab';

export function CustomFilePanel(props: FilePanelProps) {
	const dict = useDictionary();
	const [, setLoading] = useState(false);
	const tabs = [
		{
			name: dict.file_panel.upload.title,
			tabPanel: <UploadTab blockId={props.blockId} setLoading={setLoading} />,
		},
		{
			name: 'Library',
			tabPanel: <LibraryTab blockId={props.blockId} />,
		},
		{
			name: dict.file_panel.embed.title,
			tabPanel: <EmbedTab blockId={props.blockId} />,
		},
	];
	return <FilePanel {...props} tabs={tabs} />;
}
