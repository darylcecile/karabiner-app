import { Allotment } from 'allotment'
import { PropsWithChildren } from 'react'
import { Action, ActionBar } from './titlebar';
import "allotment/dist/style.css";

import { PlusSignIcon } from '@hugeicons/core-free-icons';
import { useWorkbench, Workbench } from './workbench/Workbench';
import { InputModal, useInputModalController } from './workbench/InputModal';
import { Tree } from 'react-arborist';

const data = [
  { id: "1", name: "Unread" },
  { id: "2", name: "Threads" },
  {
    id: "3",
    name: "Chat Rooms",
    children: [
      { id: "c1", name: "General" },
      { id: "c2", name: "Random" },
      { id: "c3", name: "Open Source Projects" },
    ],
  },
  {
    id: "4",
    name: "Direct Messages",
    children: [
      { id: "d1", name: "Alice" },
      { id: "d2", name: "Bob" },
      { id: "d3", name: "Charlie" },
    ],
  },
];

export function RootLayout(props: PropsWithChildren) {
	return (
		<Workbench>
			<Allotment proportionalLayout={false}>
				<Allotment.Pane preferredSize={300} className='pt-8.5'>
					<ActionBar className="mr-1" />
					<div className="p-1">
						<Tree initialData={data}/>
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
		</Workbench>
	)
}

function RightAlignedActionBarGroup() {
	const { service } = useWorkbench();
	const inputController = useInputModalController();

	async function handleNewFile() {
		const name = await inputController.prompt({
			title: "New File",
			message: "Enter the name of the new file:",
			messagePlaceholder: "e.g. untitled.md",
		}); 
		if (name) {
			service.createFile(name.endsWith(".md") ? name : `${name}.md`);
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