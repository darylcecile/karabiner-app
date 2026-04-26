import { type NodeProps } from '@xyflow/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { CanvasTextNode } from '@/shared/canvasTypes';
import { cn } from '@/shared/utils';
import { colorWithAlpha, resolveCanvasColor } from '../colors';
import { SideHandles } from '../handles';

type Props = NodeProps & { data: { node: CanvasTextNode } };

export function TextNode({ data }: Props): React.ReactElement {
	const { node } = data;
	const border = resolveCanvasColor(node.color);
	const bg = node.color ? colorWithAlpha(node.color, 0.12) : undefined;

	return (
		<div
			className={cn(
				'h-full w-full overflow-auto rounded-lg border p-3',
				!bg && 'bg-card/50',
				'prose prose-sm dark:prose-invert max-w-none',
			)}
			style={{ borderColor: border, background: bg }}
		>
			<SideHandles />
			<ReactMarkdown remarkPlugins={[remarkGfm]}>{node.text}</ReactMarkdown>
		</div>
	);
}
