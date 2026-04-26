import type { UIMessage } from 'ai';
import { cn } from '@/shared/utils';
import { Markdown } from './markdown';
import { ToolPart } from './ToolPart';
import type { ChatHelpers } from './types';

type Props = {
	message: UIMessage;
	addToolApprovalResponse: ChatHelpers['addToolApprovalResponse'];
};

export function MessageBubble({ message, addToolApprovalResponse }: Props) {
	const isUser = message.role === 'user';

	return (
		<div className={cn('flex w-full', isUser ? 'justify-end' : 'justify-start')}>
			<div
				className={cn(
					'flex max-w-[85%] flex-col gap-2',
					isUser ? 'items-end' : 'items-start',
				)}
			>
				{message.parts.map((part, idx) => {
					const key = `${message.id}-${idx}`;

					if (part.type === 'text') {
						const text = (part as { text: string }).text;
						if (!text) return null;
						return (
							<div
								key={key}
								className={cn(
									'rounded-lg border px-3 py-2 shadow-xs',
									isUser
										? 'border-primary/20 bg-primary/10 text-foreground'
										: 'border-foreground/10 bg-background/60',
								)}
							>
								{isUser ? (
									<p className="text-[13px] leading-relaxed whitespace-pre-wrap">
										{text}
									</p>
								) : (
									<Markdown>{text}</Markdown>
								)}
							</div>
						);
					}

					if (part.type === 'reasoning') {
						const txt = (part as { text?: string }).text;
						if (!txt) return null;
						return (
							<div
								key={key}
								className="rounded-md border border-dashed border-foreground/15 bg-foreground/[0.03] px-3 py-2 text-[12px] text-foreground/70 italic"
							>
								{txt}
							</div>
						);
					}

					if (
						typeof part.type === 'string' &&
						(part.type.startsWith('tool-') || part.type === 'dynamic-tool')
					) {
						return (
							<ToolPart
								key={key}
								part={part as Parameters<typeof ToolPart>[0]['part']}
								addToolApprovalResponse={addToolApprovalResponse}
							/>
						);
					}

					return null;
				})}
			</div>
		</div>
	);
}
