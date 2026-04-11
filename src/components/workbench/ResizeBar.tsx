import { motion } from 'motion/react';
import { SIDENAV_INSTANT_TRANSITION, SIDENAV_DRAG_TRANSITION, SIDENAV_SNAP_TRANSITION } from './constants';


export function ResizeBar(props: {
	isDragging: boolean;
	isNearSnap: boolean;
	isSidebarOpen: boolean;
	onDragStart: (clientX: number) => void;
}) {
	return (
		<motion.div
			role="separator"
			aria-orientation="vertical"
			aria-label="Resize sidebar"
			className="relative flex w-2 -mr-2 shrink-0 cursor-col-resize touch-none items-stretch justify-center not-hover:opacity-0!"
			onPointerDown={(event) => {
				event.preventDefault();
				props.onDragStart(event.clientX);
			}}
			initial={false}
			animate={{
				scaleX: props.isDragging ? 1.25 : props.isNearSnap ? 1.15 : 1,
				opacity: props.isSidebarOpen || props.isDragging ? 1 : 0.84,
				x: props.isDragging ? 0 : props.isSidebarOpen ? 0 : -1,
			}}
			whileHover={{ scaleX: 1.1 }}
			transition={{
				scaleX: props.isDragging ? SIDENAV_INSTANT_TRANSITION : SIDENAV_DRAG_TRANSITION,
				opacity: props.isDragging ? SIDENAV_INSTANT_TRANSITION : SIDENAV_SNAP_TRANSITION,
				x: props.isDragging ? SIDENAV_INSTANT_TRANSITION : SIDENAV_SNAP_TRANSITION,
			}}
		>
			<motion.div
				className="my-2 w-px rounded-full bg-border"
				initial={false}
				style={{
					marginRight: props.isSidebarOpen ? 4 : -6,
				}}
				animate={{
					width: props.isDragging || props.isNearSnap ? 2 : 1,
					opacity: props.isSidebarOpen ? 0 : (props.isDragging ? 0.96 : props.isNearSnap ? 0.88 : 0.62),
				}}
				transition={{
					width: props.isDragging ? SIDENAV_INSTANT_TRANSITION : SIDENAV_DRAG_TRANSITION,
					opacity: props.isDragging ? SIDENAV_INSTANT_TRANSITION : SIDENAV_SNAP_TRANSITION,
				}}
			/>
		</motion.div>
	)
}