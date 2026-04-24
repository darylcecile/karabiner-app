import { useEffect, useState } from 'react'
import { RootLayout } from './components/layout'
import { Editor, useEditorState } from './components/editor';
import { TooltipProvider } from './components/ui/tooltip';
import { Toaster } from "./components/ui/sonner"
import { Workbench } from '@/renderer/components/workbench/Workbench';

export default function App() {
	return (
		<TooltipProvider>
			<Workbench>
				<RootLayout>
					<Toaster />
				</RootLayout>
			</Workbench>
		</TooltipProvider>
	)
}
