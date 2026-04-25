import { createContext, PropsWithChildren, use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../../shared/utils";
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from "./ui/button";

const _internalSymbol: unique symbol = Symbol("ActionBarInternal");

const ActionBarContext = createContext({
	width: 0,
	[_internalSymbol]: {
		shouldMeasure: false,
		setShouldMeasure: (value: boolean) => {},
	},
	props: {} as any
});

export function ActionBar(props: PropsWithChildren<{ className?: string, ctxProps?: any }>) {
	const [width, setWidth] = useState(0);
	const [shouldMeasure, setShouldMeasure] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(()=>{
		if (!shouldMeasure) return;
		const resizeObserver = new ResizeObserver(entries => {
			for (let entry of entries) {
				if (entry.target === containerRef.current) {
					setWidth(entry.contentRect.width);
				}
			}
		});
		
		if (containerRef.current) {
			resizeObserver.observe(containerRef.current);
		}

		return () => {
			resizeObserver.disconnect();
		}
	}, [shouldMeasure]);

	const internal = useMemo(() => ({
		shouldMeasure,
		setShouldMeasure,
	}), [shouldMeasure]);

	return (
		<ActionBarContext.Provider value={{ width, [_internalSymbol]: internal, props: props.ctxProps }}>
			<div
				ref={containerRef}
				className={cn(
					"inset-x-0 top-0 h-8.5",
					"absolute z-100",
					props.className
				)}
				style={{
					// @ts-expect-error
					appRegion: 'drag',
				}}
			>
				{props.children}
			</div>
		</ActionBarContext.Provider>
	)
}

export function useActionBar() {
	const ctx = use(ActionBarContext);

	useEffect(() => {
		if (!ctx) return;
		ctx[_internalSymbol].setShouldMeasure(true);
		return () => {
			ctx[_internalSymbol].setShouldMeasure(false);
		}
	}, []);

	return ctx;
}

type ActionButtonIcon = Parameters<HugeiconsIcon>[0]['icon'];

type ActionProps = PropsWithChildren<{
	className?: string,
	icon?: ActionButtonIcon,
	onClick?: () => void,
	disabled?: boolean,
}>

export function Action(props: ActionProps) {
	return (
		<Button
			className={cn(
				// "size-6.5 rounded-lg rounded-tr-xl bg-gray-200 flex items-center justify-center",
				props.className,
				'app-no-drag',
				"hover:bg-foreground/10! text-foreground/70! hover:text-foreground!",
				"disabled:opacity-40 disabled:pointer-events-none"
			)}
			size={"icon-xs"}
			variant={"ghost"}
			disabled={props.disabled}
			onClick={props.onClick}
		>
			{props.icon && <HugeiconsIcon icon={props.icon} strokeWidth={2} />}
			{props.children}
		</Button>
	)
}