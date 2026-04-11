import { HugeiconsIcon, IconSvgElement } from '@hugeicons/react';
import { PropsWithChildren } from 'react';
import { cn } from '../../utils/cn';
import { useColorScheme } from '../../hooks/useColorScheme';


type HIconButtonProps = PropsWithChildren<{
	icon: IconSvgElement;
	theme?: 'light' | 'dark';
	className?: string;
	onClick?: () => void;
	disabled?: boolean;
}>;

export function HIconButton(props: HIconButtonProps) {
	const resolvedTheme = useColorScheme()[0];
	const theme = props.theme ?? resolvedTheme;

	return (
		<button
			className={cn(
				"size-6 flex items-center justify-center rounded-lg transition-colors",
				theme === 'light' ? 'hover:bg-black/10' : 'hover:bg-white/10',
				props.className,
				props.disabled && 'pointer-events-none opacity-50'
			)}
			onClick={props.onClick}
		>
			<HugeiconsIcon
				icon={props.icon}
				size={14}
				strokeWidth={1.5}
				className={cn(
					"pointer-events-none text-foreground",
				)}
			/>
		</button>
	)
}