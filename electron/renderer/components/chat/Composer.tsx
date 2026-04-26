import { forwardRef, useRef, type KeyboardEvent } from 'react';
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

export const Composer = forwardRef<HTMLTextAreaElement, Props>(function Composer(
	{ value, onChange, onSubmit, onStop, canSubmit, isStreaming, disabled, placeholder },
	ref,
) {
	const internalRef = useRef<HTMLTextAreaElement | null>(null);

	function setRef(el: HTMLTextAreaElement | null) {
		internalRef.current = el;
		if (typeof ref === 'function') ref(el);
		else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
	}

	function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
		// Enter submits, Shift+Enter inserts a newline.
		if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
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
				)}
			>
				<textarea
					ref={setRef}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					onKeyDown={handleKeyDown}
					rows={1}
					disabled={disabled}
					placeholder={placeholder ?? 'Send a message…'}
					className={cn(
						'field-sizing-content max-h-48 min-h-[28px] flex-1 resize-none bg-transparent px-1.5 py-1 text-[13px] leading-relaxed outline-none',
						'placeholder:text-foreground/40 disabled:cursor-not-allowed disabled:opacity-50',
					)}
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
				<kbd className="font-mono">Enter</kbd> to send · {' '}
				<kbd className="font-mono">Shift+Enter</kbd> for newline
			</div>
		</div>
	);
});
