import { Allotment } from 'allotment'
import { PropsWithChildren } from 'react'
import { Action, ActionBar } from './titlebar';
import "allotment/dist/style.css";

import { PlusSignIcon } from '@hugeicons/core-free-icons';
import { useWorkbench, Workbench } from './workbench/Workbench';
import { InputModal, useInputModalController } from './workbench/InputModal';


export function RootLayout(props: PropsWithChildren) {
	return (
		<Workbench>
			<Allotment proportionalLayout={false}>
				<Allotment.Pane preferredSize={300} className='pt-8.5'>
					<ActionBar className="mr-1" />
					<div className='text-red-500'>Left pane</div>
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
		</Workbench>
	)
}

function RightAlignedActionBarGroup() {
	const { service } = useWorkbench();
	const inputController = useInputModalController();

	function handleNewFile() {
		const name = inputController.prompt("Enter the name of the new file:"); 
		if (name) {
			service.createFile(name);
		}
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