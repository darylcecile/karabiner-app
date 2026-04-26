import { useEffect, useRef } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Sent02Icon, StopIcon } from '@hugeicons/core-free-icons';
import { cn } from '@/shared/utils';
import { Button } from '../ui/button';

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
		<div className="border-t border-foreground/10 bg-background/60 px-3 pt-2 pb-3 backdrop-blur-sm">
			<div
				className={cn(
					'flex items-end gap-2 rounded-lg border border-foreground/15 bg-background/80 px-2 py-1.5 shadow-xs transition-colors',
					'focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/40',
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
					className="flex-1 min-h-[28px] max-h-[200px] resize-none bg-transparent px-1.5 py-1 text-[13px] leading-relaxed outline-none placeholder:text-foreground/40"
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
			<div className="mt-1 px-1 text-[10.5px] text-foreground/45">
				<kbd className="font-mono">Cmd/Ctrl+Enter</kbd> to send ·{' '}
				<kbd className="font-mono">Enter</kbd> for newline
			</div>
		</div>
	);
}
