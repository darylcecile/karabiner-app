import { Handle, Position } from '@xyflow/react';

const HANDLE_STYLE: React.CSSProperties = {
	opacity: 0,
	width: 8,
	height: 8,
	pointerEvents: 'none',
	background: 'transparent',
	border: 'none',
};

const SIDES: Array<{ id: 'top' | 'right' | 'bottom' | 'left'; position: Position }> = [
	{ id: 'top', position: Position.Top },
	{ id: 'right', position: Position.Right },
	{ id: 'bottom', position: Position.Bottom },
	{ id: 'left', position: Position.Left },
];

export function SideHandles(): React.ReactElement {
	return (
		<>
			{SIDES.map((s) => (
				<Handle
					key={`s-${s.id}`}
					type="source"
					position={s.position}
					id={s.id}
					style={HANDLE_STYLE}
					isConnectable={false}
				/>
			))}
			{SIDES.map((s) => (
				<Handle
					key={`t-${s.id}`}
					type="target"
					position={s.position}
					id={s.id}
					style={HANDLE_STYLE}
					isConnectable={false}
				/>
			))}
		</>
	);
}
