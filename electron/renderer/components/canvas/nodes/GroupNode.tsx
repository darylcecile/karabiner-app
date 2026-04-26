import { type NodeProps } from '@xyflow/react';
import type { CanvasGroupNode } from '@/shared/canvasTypes';
import { cn } from '@/shared/utils';
import { colorWithAlpha, resolveCanvasColor } from '../colors';
import { SideHandles } from '../handles';

type Props = NodeProps & { data: { node: CanvasGroupNode } };

function bgSizeFor(style: CanvasGroupNode['backgroundStyle']): React.CSSProperties {
	switch (style) {
		case 'cover': return { backgroundSize: 'cover', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' };
		case 'ratio': return { backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' };
		case 'repeat': return { backgroundRepeat: 'repeat' };
		default: return { backgroundSize: 'cover', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' };
	}
}

export function GroupNode({ data }: Props): React.ReactElement {
	const { node } = data;
	const border = resolveCanvasColor(node.color);
	const tint = colorWithAlpha(node.color, 0.06);
	const bgImage = node.background ? { backgroundImage: `url("${node.background}")`, ...bgSizeFor(node.backgroundStyle) } : {};

	return (
		<div className="relative h-full w-full">
			<div
				className={cn('absolute inset-0 rounded-lg border-2 border-dashed')}
				style={{
					borderColor: border,
					background: tint,
					pointerEvents: 'none',
					...bgImage,
				}}
			/>
			{node.label && (
				<div
					className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs font-medium"
					style={{
						background: colorWithAlpha(node.color, 0.2),
						color: border,
						pointerEvents: 'none',
					}}
				>
					{node.label}
				</div>
			)}
			<SideHandles />
		</div>
	);
}
