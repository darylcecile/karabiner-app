import { PropsWithChildren, useState } from "react";
import { HugeiconsIcon } from '@hugeicons/react';
import { ChevronRight, ChevronDown } from '@hugeicons/core-free-icons';
import { cn } from "@/shared/utils";

export function TreeAccordion(props: PropsWithChildren<{ label: string, defaultOpen?: boolean }>) {
	const [isOpen, setIsOpen] = useState(props.defaultOpen ?? false);

	const toggle = () => setIsOpen((open) => !open);

	return (
		<div
			className={cn(
				"flex flex-col"
			)}
		>
			<button 
				className="text-foreground/45 text-xs flex items-center gap-1 px-2 font-semibold"
				onClick={toggle}
			>
				{props.label}
				<HugeiconsIcon icon={isOpen ? ChevronDown : ChevronRight} strokeWidth={1.5} width={16} />
			</button>
			<div className={
				cn(
					"flex flex-col gap-1 transition-[height] duration-200 ease-in-out",
					!isOpen && "max-h-0 overflow-hidden"
				)
			}>
				{props.children}
			</div>
		</div>
	)
}