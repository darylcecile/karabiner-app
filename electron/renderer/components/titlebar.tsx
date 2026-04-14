import { PropsWithChildren } from "react";
import { cn } from "../../shared/utils";
import { usePlatform } from '../hooks/usePlatform';
import { HugeiconsIcon } from '@hugeicons/react'

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
	icon?: ActionButtonIcon
}>

export function Action(props: ActionProps) {
	return (
		<button
			className={cn(
				"size-6.5 rounded-lg rounded-tr-xl bg-gray-200 flex items-center justify-center",
				props.className
			)}
		>
			{props.icon && <HugeiconsIcon icon={props.icon} size={16} />}
			{props.children}
		</button>
	)
}