import { PropsWithChildren } from "react";
import { cn } from "../../shared/utils";
import { usePlatform } from '../hooks/usePlatform';
import { HugeiconsIcon } from '@hugeicons/react'
import { Button } from "./ui/button";

export function ActionBar(props: PropsWithChildren<{ className?: string }>) {
	return (
		<div
			className={cn(
				"inset-x-0 top-0 h-8.5",
				"absolute z-2",
				props.className
			)}
			style={{
				// @ts-expect-error
				appRegion: 'drag',
			}}
		>
			{props.children}
		</div>
	)
}

type ActionButtonIcon = Parameters<HugeiconsIcon>[0]['icon'];

type ActionProps = PropsWithChildren<{
	className?: string,
	icon?: ActionButtonIcon,
	onClick?: () => void,
}>

export function Action(props: ActionProps) {
	return (
		<Button
			className={cn(
				// "size-6.5 rounded-lg rounded-tr-xl bg-gray-200 flex items-center justify-center",
				props.className,
				'app-no-drag'
			)}
			size={"icon-xs"}
			variant={"ghost"}
		>
			{props.icon && <HugeiconsIcon icon={props.icon} strokeWidth={2}/>}
			{props.children}
		</Button>
	)
}