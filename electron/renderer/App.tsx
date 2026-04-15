import { useEffect, useState } from 'react'
import { RootLayout } from './components/layout'
import { Editor, useEditorState } from './components/editor';
import { TooltipProvider } from './components/ui/tooltip';

export default function App() {
	const editor = useEditorState();

	return (
		<TooltipProvider>
			<RootLayout>
				<Editor editor={editor} />
			</RootLayout>
		</TooltipProvider>
	)
}
