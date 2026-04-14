import { Allotment } from 'allotment'
import { PropsWithChildren } from 'react'
import { Action, ActionBar } from './titlebar';
import "allotment/dist/style.css";

import { Notification03Icon } from '@hugeicons/core-free-icons'

export function WorkbenchLayout(props: PropsWithChildren) {
	return (
		<Allotment proportionalLayout={false}>
			<Allotment.Pane preferredSize={300} className='pt-8.5'>
				<ActionBar className="mr-1"/>
				<div className='text-red-500'>Left pane</div>
			</Allotment.Pane>
			<Allotment.Pane>
				<ActionBar className='ml-1 px-1 flex items-center justify-between bg-red-200'>
					<Action icon={Notification03Icon} />
					<Action icon={Notification03Icon} />
				</ActionBar>
				<main className='pt-8.5 overflow-y-auto'>
					{props.children}
				</main>
			</Allotment.Pane>
		</Allotment>
	)
}
