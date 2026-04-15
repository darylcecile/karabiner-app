import { useEffect, useState } from 'react'
import { RootLayout } from './components/layout'
import { Editor, useEditorState } from './components/editor';

export default function App() {
	const editor = useEditorState();

	return (
		<RootLayout>
			<Editor 
				editor={editor} 
			/>
		</RootLayout>
	)
}
