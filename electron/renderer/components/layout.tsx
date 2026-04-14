import { Allotment } from 'allotment'
import { PropsWithChildren } from 'react'
import { ActionBar } from './titlebar';
import "allotment/dist/style.css";

export function WorkbenchLayout(props: PropsWithChildren) {
	return (
		<Allotment proportionalLayout={false}>
			<Allotment.Pane preferredSize={300} className='pt-8.5'>
				<ActionBar className="mr-1"/>
				<div className='text-red-500'>Left pane</div>
			</Allotment.Pane>
			<Allotment.Pane>
				<ActionBar className='ml-1'/>
				<main className='pt-8.5 overflow-y-auto'>
					{props.children}
				</main>
			</Allotment.Pane>
		</Allotment>
	)
}
