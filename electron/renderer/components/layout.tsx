import { Allotment } from 'allotment'
import { PropsWithChildren } from 'react'
import { Action, ActionBar } from './titlebar';
import "allotment/dist/style.css";

import { PlusSignIcon } from '@hugeicons/core-free-icons';
import { useWorkbench } from './workbench/Workbench';
import { InputModal, useInputModalController } from './workbench/InputModal';
import { toast } from 'sonner';
import { FileTree } from './workbench/FileTree';

export function RootLayout(props: PropsWithChildren) {
	return (
		<Allotment proportionalLayout={false}>
			<Allotment.Pane preferredSize={300} className='pt-8.5'>
				<ActionBar className="mr-1" />
				<div className="p-1">
					<FileTree />
				</div>
			</Allotment.Pane>
			<Allotment.Pane>
				<ActionBar className='ml-1 px-1 flex items-center justify-between'>
					{/* <Action icon={Notification03Icon} /> */}
					<div />
					<RightAlignedActionBarGroup />
				</ActionBar>
				<main className='pt-8.5 overflow-y-auto'>
					{props.children}
				</main>
			</Allotment.Pane>
		</Allotment>
	)
}

function RightAlignedActionBarGroup() {
	const { fs } = useWorkbench();
	const inputController = useInputModalController();

	async function handleNewFile() {
		const name = await inputController.prompt({
			title: "New File",
			message: "Enter the name of the new file:",
			messagePlaceholder: "e.g. untitled.md",
		});
		if (!name) {
			toast.error("File name cannot be empty.");
			return;
		}

		await fs.createFile(name);
	}

	return (
		<>
			<div className='flex flex-row items-center gap-2'>
				<ActionBar className='ml-1 px-1 flex items-center justify-end'>
					<Action icon={PlusSignIcon} onClick={handleNewFile} />
				</ActionBar>
			</div>
			<InputModal controller={inputController} />
		</>
	)
}

