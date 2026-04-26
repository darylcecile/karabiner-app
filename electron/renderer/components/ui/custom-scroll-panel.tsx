import { cn } from "@/shared/utils";
import {
	CSSProperties,
	PointerEvent,
	PropsWithChildren,
	useLayoutEffect,
	useRef,
	useState,
} from "react";

const MIN_THUMB_HEIGHT = 20;

export type CustomScrollPanelProps = PropsWithChildren<{
	/**
	 * Class applied to the inner scrollable viewport. Use this to control padding,
	 * background, etc. of the scrolling region.
	 */
	className?: string;
	/** Class applied to the outermost wrapper. Defaults to filling parent height. */
	containerClassName?: string;
	scrollbarTopOffset?: number;
	scrollbarBottomOffset?: number;
	thumbWidth?: number;
	/** Reserved gutter width on the right. Defaults to `thumbWidth + 8`. */
	gutterWidth?: number;
	/** Height (px) of the linear-gradient fade applied to the top of the viewport. */
	topFadeHeight?: number;
	/** Height (px) of the linear-gradient fade applied to the bottom of the viewport. */
	bottomFadeHeight?: number;
	/** Optional element rendered absolutely on top of the bottom fade. */
	footer?: React.ReactNode;
	/** Hide the custom thumb entirely (still preserves the gutter). */
	hideThumb?: boolean;
}>;

export function CustomScrollPanel(props: CustomScrollPanelProps) {
	const {
		children,
		className,
		containerClassName,
		scrollbarTopOffset = 8,
		scrollbarBottomOffset = 8,
		thumbWidth = 4,
		gutterWidth: gutterWidthProp,
		topFadeHeight = 0,
		bottomFadeHeight = 0,
		footer,
		hideThumb = false,
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
	const [bottomFade, setBottomFade] = useState(0);

	useLayoutEffect(() => {
		const viewport = viewportRef.current;
		const content = contentRef.current;
		if (!viewport || !content) return;

		const updateThumb = () => {
			const { clientHeight, scrollHeight, scrollTop } = viewport;
			const trackHeight = Math.max(clientHeight - scrollbarTopOffset - scrollbarBottomOffset, 0);
			const nextHasOverflow = scrollHeight > clientHeight && trackHeight > 0;
			const maxScrollTop = Math.max(scrollHeight - clientHeight, 0);
			setHasOverflow(nextHasOverflow);
			setTopFade(Math.min(scrollTop, topFadeHeight));
			setBottomFade(Math.min(Math.max(maxScrollTop - scrollTop, 0), bottomFadeHeight));

			if (!nextHasOverflow) {
				setThumbHeight(0);
				setThumbTop(scrollbarTopOffset);
				setTopFade(0);
				setBottomFade(0);
				return;
			}

			const nextThumbHeight = Math.max(
				(clientHeight / scrollHeight) * trackHeight,
				Math.min(MIN_THUMB_HEIGHT, trackHeight),
			);
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
	}, [bottomFadeHeight, scrollbarBottomOffset, scrollbarTopOffset, topFadeHeight]);

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

	const gutterWidth = gutterWidthProp ?? Math.max(thumbWidth + 8, 12);
	const thumbStyle: CSSProperties = {
		top: thumbTop,
		height: thumbHeight,
		width: thumbWidth,
	};
	const topFadeProgress = topFadeHeight > 0 ? Math.min(topFade / topFadeHeight, 1) : 0;
	const bottomFadeProgress = bottomFadeHeight > 0 ? Math.min(bottomFade / bottomFadeHeight, 1) : 0;
	const topFadeSize = topFadeHeight * topFadeProgress;
	const bottomFadeSize = bottomFadeHeight * bottomFadeProgress;
	const topFadeEarlyStop = Math.max(1, topFadeSize * 0.18);
	const topFadeMidStop = Math.max(topFadeEarlyStop + 1, topFadeSize * 0.5);
	const bottomFadeEarlyStop = Math.max(1, bottomFadeSize * 0.18);
	const bottomFadeMidStop = Math.max(bottomFadeEarlyStop + 1, bottomFadeSize * 0.5);
	const maskSegments = [
		`rgba(0, 0, 0, 0) 0px`,
	];

	if (topFadeSize > 0) {
		maskSegments.push(
			`rgba(0, 0, 0, 0) 0px`,
			`rgba(0, 0, 0, 0) ${topFadeEarlyStop / 2}px`,
			`rgba(0, 0, 0, 0.12) ${topFadeEarlyStop}px`,
			`rgba(0, 0, 0, 0.55) ${topFadeMidStop}px`,
			`rgba(0, 0, 0, 1) ${topFadeSize}px`,
		);
	} else {
		maskSegments.push(`rgba(0, 0, 0, 1) 0px`);
	}

	if (bottomFadeSize > 0) {
		maskSegments.push(
			`rgba(0, 0, 0, 1) calc(100% - ${bottomFadeSize}px)`,
			`rgba(0, 0, 0, 0.55) calc(100% - ${bottomFadeMidStop}px)`,
			`rgba(0, 0, 0, 0.12) calc(100% - ${bottomFadeEarlyStop}px)`,
			`rgba(0, 0, 0, 0) calc(100% - ${bottomFadeEarlyStop / 2}px)`,
			`rgba(0, 0, 0, 0) 100%`,
		);
	} else {
		maskSegments.push(`rgba(0, 0, 0, 1) 100%`);
	}

	const viewportStyle: CSSProperties = topFadeSize > 0 || bottomFadeSize > 0
		? {
			maskImage: `linear-gradient(to bottom, ${maskSegments.join(", ")})`,
			WebkitMaskImage: `linear-gradient(to bottom, ${maskSegments.join(", ")})`,
			maskRepeat: "no-repeat",
			WebkitMaskRepeat: "no-repeat",
		}
		: {};

	return (
		<div className={cn("relative h-full min-h-0 overflow-hidden group/container", containerClassName)}>
			<div
				ref={viewportRef}
				className={cn("size-full overflow-y-auto overflow-x-hidden no-scrollbar", className)}
				style={viewportStyle}
			>
				<div ref={contentRef} className={cn("min-h-full", hasOverflow && !hideThumb && "pr-2")}>
					{children}
				</div>
			</div>

			{footer}

			{!hideThumb && (
				<div
					className="pointer-events-none absolute inset-y-0 right-0 z-20"
					style={{ width: gutterWidth }}
				>
					<div
						className={cn(
							"pointer-events-auto absolute right-1 rounded-full bg-foreground/50 hover:bg-foreground/80 transition-opacity",
							hasOverflow ? "cursor-grab" : "",
							isDragging ? "cursor-grabbing" : "",
							hasOverflow ? "opacity-20 group-hover/container:opacity-100" : "opacity-0",
						)}
						style={thumbStyle}
						onPointerDown={handleThumbPointerDown}
						onPointerMove={handleThumbPointerMove}
						onPointerUp={handleThumbPointerUp}
						onPointerCancel={handleThumbPointerUp}
					/>
				</div>
			)}
		</div>
	);
}
