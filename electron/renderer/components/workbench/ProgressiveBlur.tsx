import { cn } from "@/shared/utils";
import { PropsWithChildren } from "react";


export function ProgressiveBlur({ children, className }: PropsWithChildren<{className?:string}>) {
	return (
		<div className={cn("relative", className)}>
			<div 
				className="absolute inset-0 z-10" 
				style={{
					mask: 'linear-gradient(to bottom, black, black, rgba(0,0,0,0))',
					backdropFilter: 'blur(40px) saturate(120%)',
					opacity: 0.9,
				}}
			/>
			<div className="relative z-20">
				{children}
			</div>
		</div>
	)
}