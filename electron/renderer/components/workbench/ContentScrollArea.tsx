import { cn } from "@/shared/utils";
import { CSSProperties, PointerEvent, PropsWithChildren, useLayoutEffect, useRef, useState } from "react";

const MIN_THUMB_HEIGHT = 20;

type ContentScrollAreaProps = PropsWithChildren<{
	className?: string;
	scrollbarTopOffset?: number;
	scrollbarBottomOffset?: number;
	thumbWidth?: number;
	topFadeHeight?: number;
}>;

export function ContentScrollArea(props: ContentScrollAreaProps) {
	const {
		children,
		className,
		scrollbarTopOffset = 8,
		scrollbarBottomOffset = 8,
		thumbWidth = 4,
		topFadeHeight = 28,
	} = props;
	const viewportRef = useRef<HTMLDivElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);
	const dragStateRef = useRef({ pointerId: -1, startY: 0, startScrollTop: 0 });
	const scrollMetricsRef = useRef({ maxScrollTop: 0, maxThumbTravel: 0 });
	const [thumbHeight, setThumbHeight] = useState(0);
	const [thumbTop, setThumbTop] = useState(scrollbarTopOffset);
	const [hasOverflow, setHasOverflow] = useState(false);
	const [isDragging, setIsDragging] = useState(false);
	const [topFade, setTopFade] = useState(0);

	useLayoutEffect(() => {
		const viewport = viewportRef.current;
		const content = contentRef.current;
		if (!viewport || !content) return;

		const updateThumb = () => {
			const { clientHeight, scrollHeight, scrollTop } = viewport;
			const trackHeight = Math.max(clientHeight - scrollbarTopOffset - scrollbarBottomOffset, 0);
			const nextHasOverflow = scrollHeight > clientHeight && trackHeight > 0;
			setHasOverflow(nextHasOverflow);
			setTopFade(Math.min(scrollTop, topFadeHeight));

			if (!nextHasOverflow) {
				setThumbHeight(0);
				setThumbTop(scrollbarTopOffset);
				setTopFade(0);
				return;
			}

			const nextThumbHeight = Math.max(
				(clientHeight / scrollHeight) * trackHeight,
				Math.min(MIN_THUMB_HEIGHT, trackHeight),
			);
			const maxScrollTop = scrollHeight - clientHeight;
			const maxThumbTravel = trackHeight - nextThumbHeight;
			const nextThumbTop = scrollbarTopOffset + (
				maxScrollTop > 0 ? (scrollTop / maxScrollTop) * maxThumbTravel : 0
			);
			scrollMetricsRef.current = { maxScrollTop, maxThumbTravel };

			setThumbHeight(nextThumbHeight);
			setThumbTop(nextThumbTop);
		};

		updateThumb();

		const resizeObserver = new ResizeObserver(updateThumb);
		resizeObserver.observe(viewport);
		resizeObserver.observe(content);

		viewport.addEventListener("scroll", updateThumb, { passive: true });

		return () => {
			viewport.removeEventListener("scroll", updateThumb);
			resizeObserver.disconnect();
		};
	}, [scrollbarBottomOffset, scrollbarTopOffset, topFadeHeight]);

	function handleThumbPointerDown(event: PointerEvent<HTMLDivElement>) {
		const viewport = viewportRef.current;
		if (!viewport || !hasOverflow) return;

		event.preventDefault();
		dragStateRef.current = {
			pointerId: event.pointerId,
			startY: event.clientY,
			startScrollTop: viewport.scrollTop,
		};
		setIsDragging(true);
		event.currentTarget.setPointerCapture(event.pointerId);
	}

	function handleThumbPointerMove(event: PointerEvent<HTMLDivElement>) {
		const viewport = viewportRef.current;
		if (!viewport || !isDragging || event.pointerId !== dragStateRef.current.pointerId) return;

		const { maxScrollTop, maxThumbTravel } = scrollMetricsRef.current;
		if (maxScrollTop <= 0 || maxThumbTravel <= 0) return;

		const deltaY = event.clientY - dragStateRef.current.startY;
		const scrollDelta = (deltaY / maxThumbTravel) * maxScrollTop;
		viewport.scrollTop = dragStateRef.current.startScrollTop + scrollDelta;
	}

	function handleThumbPointerUp(event: PointerEvent<HTMLDivElement>) {
		if (event.pointerId !== dragStateRef.current.pointerId) return;

		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
		setIsDragging(false);
	}

	const gutterWidth = Math.max(thumbWidth + 8, 12);
	const thumbStyle: CSSProperties = {
		top: thumbTop,
		height: thumbHeight,
		width: thumbWidth,
	};
	const topFadeEarlyStop = Math.max(1, topFade * 0.18);
	const topFadeMidStop = Math.max(topFadeEarlyStop + 1, topFade * 0.5);
	const maskGradient = `linear-gradient(to bottom,
		rgba(0, 0, 0, 0) 0px,
		rgba(0, 0, 0, 0) ${topFadeEarlyStop/2}px,
		rgba(0, 0, 0, 0.12) ${topFadeEarlyStop}px,
		rgba(0, 0, 0, 0.55) ${topFadeMidStop}px,
		rgba(0, 0, 0, 1) ${topFade}px,
		rgba(0, 0, 0, 1) 100%
	)`;
	const viewportStyle: CSSProperties = topFade > 0
		? {
			maskImage: maskGradient,
			WebkitMaskImage: maskGradient,
			maskRepeat: "no-repeat",
			WebkitMaskRepeat: "no-repeat",
		}
		: {};

	return (
		<div className="relative h-full min-h-0 overflow-hidden">
			<div
				ref={viewportRef}
				className={cn("size-full overflow-y-auto overflow-x-hidden no-scrollbar", className)}
				style={viewportStyle}
			>
				<div 
					className="w-full absolute top-0 z-99"
					style={{
						height: Math.max((props.topFadeHeight ?? 0) * 0.8, 32),
						backgroundColor: 'rgba(255,255,255,0)'
					}}
				/>
				<div ref={contentRef} className="min-h-full isolate">
					{children}
				</div>
			</div>

			<div
				className="pointer-events-none absolute inset-y-0 right-0"
				style={{ width: gutterWidth }}
			>
				<div
					className={cn(
						"pointer-events-auto absolute right-1 rounded-full bg-foreground/50 hover:bg-foreground/80 transition-opacity",
						hasOverflow ? "cursor-grab" : "",
						isDragging ? "cursor-grabbing" : "",
						hasOverflow ? "opacity-100" : "opacity-0",
					)}
					style={thumbStyle}
					onPointerDown={handleThumbPointerDown}
					onPointerMove={handleThumbPointerMove}
					onPointerUp={handleThumbPointerUp}
					onPointerCancel={handleThumbPointerUp}
				/>
			</div>
		</div>
	);
}
