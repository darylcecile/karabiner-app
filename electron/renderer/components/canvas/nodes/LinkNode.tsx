import { type NodeProps } from '@xyflow/react';
import type { CanvasLinkNode } from '@/shared/canvasTypes';
import { cn } from '@/shared/utils';
import { colorWithAlpha, resolveCanvasColor } from '../colors';
import { SideHandles } from '../handles';

type Props = NodeProps & { data: { node: CanvasLinkNode } };

function getHost(url: string): string {
	try {
		return new URL(url).host;
	} catch {
		return url;
	}
}

export function LinkNode({ data }: Props): React.ReactElement {
	const { node } = data;
	const border = resolveCanvasColor(node.color);
	const bg = node.color ? colorWithAlpha(node.color, 0.12) : undefined;

	const onOpen = () => {
		window.open(node.url, '_blank', 'noopener,noreferrer');
	};

	return (
		<div
			className={cn(
				'h-full w-full overflow-hidden rounded-lg border p-3 cursor-pointer',
				'transition-colors hover:bg-accent/40',
				!bg && 'bg-card/50',
			)}
			style={{ borderColor: border, background: bg }}
			onClick={onOpen}
		>
			<SideHandles />
			<div className="text-xs uppercase tracking-wide text-foreground/60">{getHost(node.url)}</div>
			<div className="text-sm font-medium break-all mt-1">{node.url}</div>
		</div>
	);
}
