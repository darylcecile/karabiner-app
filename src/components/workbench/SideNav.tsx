import { PropsWithChildren, useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useWorkbench, WORKBENCH_SIDEBAR_COLLAPSE_WIDTH, WORKBENCH_SIDEBAR_MAX_WIDTH, WORKBENCH_SIDEBAR_MIN_WIDTH } from './Workbench';
import { useWindow } from '../../hooks/useWindow';
import { minMax } from '../../utils/math';
import { SIDENAV_SNAP_ZONE, SIDENAV_INSTANT_TRANSITION, SIDENAV_SNAP_TRANSITION, SIDENAV_DRAG_TRANSITION } from './constants';
import { ResizeBar } from './ResizeBar';


export function SideNav(props:PropsWithChildren) {
	const { sidebar } = useWorkbench();
	const { width } = useWindow();
	const [dragWidth, setDragWidth] = useState<number | null>(null);
	const [isDragging, setIsDragging] = useState(false);
	const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

	const maxSidebarWidth = minMax(
		WORKBENCH_SIDEBAR_MIN_WIDTH,
		WORKBENCH_SIDEBAR_MAX_WIDTH,
		width * 0.4,
	);
	const sidebarWidth = minMax(WORKBENCH_SIDEBAR_MIN_WIDTH, maxSidebarWidth, sidebar.width);
	const effectiveWidth = dragWidth ?? (sidebar.isOpen ? sidebarWidth : 0);
	const isSnappedClosed = effectiveWidth < WORKBENCH_SIDEBAR_COLLAPSE_WIDTH;
	const displayedWidth = isSnappedClosed ? 0 : effectiveWidth;
	const isNearSnap =
		isDragging &&
		dragWidth !== null &&
		Math.abs(dragWidth - WORKBENCH_SIDEBAR_COLLAPSE_WIDTH) <= SIDENAV_SNAP_ZONE;

	useEffect(() => {
		if (dragWidth === null) {
			return;
		}

		const clampedWidth = minMax(0, maxSidebarWidth, dragWidth);
		if (clampedWidth !== dragWidth) {
			setDragWidth(clampedWidth);
		}
	}, [dragWidth, maxSidebarWidth]);

	useEffect(() => {
		if (!sidebar.isOpen) {
			return;
		}

		if (sidebar.width !== sidebarWidth) {
			sidebar.setWidth(sidebarWidth);
		}
	}, [sidebar.isOpen, sidebar.setWidth, sidebar.width, sidebarWidth]);

	useEffect(() => {
		if (!isDragging) {
			return;
		}

		const previousCursor = document.body.style.cursor;
		const previousUserSelect = document.body.style.userSelect;

		document.body.style.cursor = "col-resize";
		document.body.style.userSelect = "none";

		const onPointerMove = (event: PointerEvent) => {
			const dragState = dragRef.current;
			if (!dragState) {
				return;
			}

			const nextWidth = minMax(0, maxSidebarWidth, dragState.startWidth + event.clientX - dragState.startX);
			setDragWidth(nextWidth);

			if (nextWidth < WORKBENCH_SIDEBAR_COLLAPSE_WIDTH) {
				if (sidebar.isOpen) {
					sidebar.setOpen(false);
				}
				return;
			}

			if (!sidebar.isOpen) {
				sidebar.setOpen(true);
			}

			sidebar.setWidth(minMax(WORKBENCH_SIDEBAR_MIN_WIDTH, maxSidebarWidth, nextWidth));
		};

		const finishDrag = () => {
			const finalWidth = dragRef.current
				? minMax(0, maxSidebarWidth, dragWidth ?? dragRef.current.startWidth)
				: 0;

			if (finalWidth < WORKBENCH_SIDEBAR_COLLAPSE_WIDTH) {
				sidebar.setOpen(false);
			} else {
				sidebar.setOpen(true);
				sidebar.setWidth(minMax(WORKBENCH_SIDEBAR_MIN_WIDTH, maxSidebarWidth, finalWidth));
			}

			dragRef.current = null;
			setDragWidth(null);
			setIsDragging(false);
		};

		window.addEventListener("pointermove", onPointerMove);
		window.addEventListener("pointerup", finishDrag);
		window.addEventListener("pointercancel", finishDrag);

		return () => {
			document.body.style.cursor = previousCursor;
			document.body.style.userSelect = previousUserSelect;
			window.removeEventListener("pointermove", onPointerMove);
			window.removeEventListener("pointerup", finishDrag);
			window.removeEventListener("pointercancel", finishDrag);
		};
	}, [dragWidth, isDragging, maxSidebarWidth, sidebar.isOpen, sidebar.setOpen, sidebar.setWidth]);

	const startResize = (clientX: number) => {
		dragRef.current = {
			startX: clientX,
			startWidth: displayedWidth,
		};
		setDragWidth(displayedWidth);
		setIsDragging(true);
	};

	return (
		<>
			<motion.section
				className="shrink-0 overflow-hidden"
				initial={false}
				animate={{
					width: displayedWidth,
					opacity: displayedWidth === 0 ? 0.86 : 1,
					x: displayedWidth === 0 ? 0 : 0,
				}}
				transition={{
					width: isDragging ? SIDENAV_INSTANT_TRANSITION : SIDENAV_SNAP_TRANSITION,
					opacity: isDragging ? SIDENAV_INSTANT_TRANSITION : SIDENAV_DRAG_TRANSITION,
					x: isDragging ? SIDENAV_INSTANT_TRANSITION : SIDENAV_SNAP_TRANSITION,
				}}
			> {/* main sidebar */}
				{props.children}
			</motion.section>
			<ResizeBar 
				isDragging={isDragging}
				isNearSnap={isNearSnap}
				isSidebarOpen={displayedWidth > 0}
				onDragStart={startResize}
			/>
		</>
	)
}