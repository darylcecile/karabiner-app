import { PropsWithChildren, useEffect, useRef } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Sent02Icon, StopIcon } from '@hugeicons/core-free-icons';
import { cn } from '@/shared/utils';
import { Button } from '../ui/button';
import { usePlatform } from '@/renderer/hooks/usePlatform';

type Props = {
	value: string;
	onChange: (next: string) => void;
	onSubmit: () => void;
	onStop: () => void;
	canSubmit: boolean;
	isStreaming: boolean;
	disabled?: boolean;
	placeholder?: string;
};

const MAX_HEIGHT_PX = 200;

export function Composer({
	value,
	onChange,
	onSubmit,
	onStop,
	canSubmit,
	isStreaming,
	disabled,
	placeholder,
}: Props) {
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);

	useEffect(() => {
		const el = textareaRef.current;
		if (!el) return;
		el.style.height = 'auto';
		const next = Math.min(el.scrollHeight, MAX_HEIGHT_PX);
		el.style.height = `${next}px`;
	}, [value]);

	function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			if (canSubmit) onSubmit();
		}
	}

	return (
		<div className="border-t border-foreground/10 bg-background/60 focus-within:bg-background/80 px-2 pt-2 pb-2 backdrop-blur-sm group/composer">
			<div
				className={cn(
					'flex items-end gap-2 transition-colors',
					// 'focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/40',
					disabled && 'opacity-50',
				)}
			>
				<textarea
					ref={textareaRef}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					onKeyDown={handleKeyDown}
					disabled={disabled}
					placeholder={placeholder ?? 'Send a message…'}
					rows={1}
					className="flex-1 min-h-7 max-h-50 resize-none bg-transparent px-1.5 py-0.5 text-[12px] leading-relaxed outline-none placeholder:text-foreground/40"
				/>
				{isStreaming ? (
					<Button
						type="button"
						size="icon-sm"
						variant="secondary"
						aria-label="Stop"
						onClick={onStop}
					>
						<HugeiconsIcon icon={StopIcon} size={14} />
					</Button>
				) : (
					<Button
						type="button"
						size="icon-sm"
						variant="default"
						aria-label="Send"
						disabled={!canSubmit}
						onClick={onSubmit}
					>
						<HugeiconsIcon icon={Sent02Icon} size={14} />
					</Button>
				)}
			</div>
			<div className="flex items-center select-none gap-1 mt-2 px-1 text-3xs text-muted-foreground/45 transition-all max-h-4 -mb-6 group-focus-within/composer:text-muted-foreground group-focus-within/composer:mb-0">
				<KeyboardKeyHint className="font-mono">cmd</KeyboardKeyHint> 
				<KeyboardKeyHint className="font-mono">Enter</KeyboardKeyHint> to send ·{' '}
				<KeyboardKeyHint className="font-mono">Enter</KeyboardKeyHint> for newline
			</div>
		</div>
	);
}

function KeyboardKeyHint(props: PropsWithChildren<{ className?: string}>){
	const isCommand = props.children === "cmd";
	const platform = usePlatform();

	const text = isCommand ? (platform === "darwin" ? "⌘" : "Ctrl") : props.children;

	return (
		<kbd className="border border-border px-0.5 pt-0.5 min-w-4 rounded inline-flex items-center justify-center uppercase">
			<span className={cn(props.className, isCommand && 'scale-120')}>{text}</span>
		</kbd>
	)
}