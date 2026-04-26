import { NodeResizer } from '@xyflow/react';

export function CanvasResizer({ color, visible }: { color: string; visible: boolean }): React.ReactElement {
	return (
		<NodeResizer
			minWidth={40}
			minHeight={40}
			isVisible={visible}
			color={color}
			lineStyle={{ borderColor: color, borderWidth: 1 }}
			handleStyle={{
				width: 8,
				height: 8,
				borderRadius: 2,
				background: color,
				border: '1px solid rgba(255,255,255,0.6)',
			}}
		/>
	);
}
