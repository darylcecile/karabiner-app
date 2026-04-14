import { useEffect, useState } from 'react'
import { WorkbenchLayout } from './components/layout'
import { Editor } from './components/editor';
import { useCreateBlockNote } from '@blocknote/react';

export default function App() {
	const editor = useCreateBlockNote();

	return (
		<WorkbenchLayout>
			<Editor 
				editor={editor} 
			/>
		</WorkbenchLayout>
	)
}
