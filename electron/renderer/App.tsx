import { useEffect, useState } from 'react'
import { WorkbenchLayout } from './components/layout'
import { Editor, useEditorState } from './components/editor';

export default function App() {
	const editor = useEditorState();

	return (
		<WorkbenchLayout>
			<Editor 
				editor={editor} 
			/>
		</WorkbenchLayout>
	)
}
