import { PropsWithChildren } from "react";
import { cn } from "../../shared/utils";
import { usePlatform } from '../hooks/usePlatform';


export function ActionBar(props:PropsWithChildren<{className?:string}>) {
	return (
		<div 
			className={cn(
				"inset-x-0 top-0 h-11",
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
	)
}