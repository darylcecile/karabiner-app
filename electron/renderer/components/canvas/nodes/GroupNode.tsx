import { useEffect, useRef, useState } from 'react';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import type { CanvasGroupNode } from '@/shared/canvasTypes';
import { cn } from '@/shared/utils';
import { colorWithAlpha, resolveCanvasColor } from '../colors';
import { SideHandles } from '../handles';
import { CanvasResizer } from './resizer';

type Props = NodeProps & { data: { node: CanvasGroupNode } };

function bgSizeFor(style: CanvasGroupNode['backgroundStyle']): React.CSSProperties {
	switch (style) {
		case 'cover': return { backgroundSize: 'cover', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' };
		case 'ratio': return { backgroundSize: 'contain', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' };
		case 'repeat': return { backgroundRepeat: 'repeat' };
		default: return { backgroundSize: 'cover', backgroundRepeat: 'no-repeat', backgroundPosition: 'center' };
	}
}

export function GroupNode({ id, data, selected }: Props): React.ReactElement {
	const { node } = data;
	const { updateNodeData } = useReactFlow();
	const border = resolveCanvasColor(node.color);
	const tint = colorWithAlpha(node.color, 0.06);
	const bgImage = node.background ? { backgroundImage: `url("${node.background}")`, ...bgSizeFor(node.backgroundStyle) } : {};

	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(node.label ?? '');
	const inputRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		if (editing && inputRef.current) {
			inputRef.current.focus();
			inputRef.current.select();
		}
	}, [editing]);

	const enterEdit = (e: React.MouseEvent) => {
		e.stopPropagation();
		setDraft(node.label ?? '');
		setEditing(true);
	};

	const commit = () => {
		setEditing(false);
		const next = draft.trim();
		if (next === (node.label ?? '')) return;
		const nextNode: CanvasGroupNode = { ...node };
		if (next === '') {
			delete nextNode.label;
		} else {
			nextNode.label = next;
		}
		updateNodeData(id, { node: nextNode });
	};

	const cancel = () => {
		setEditing(false);
		setDraft(node.label ?? '');
	};

	const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		e.stopPropagation();
		if (e.key === 'Escape') {
			e.preventDefault();
			cancel();
		} else if (e.key === 'Enter') {
			e.preventDefault();
			commit();
		}
	};

	const labelStyle: React.CSSProperties = {
		background: colorWithAlpha(node.color, 0.2),
		color: border,
		pointerEvents: 'auto',
	};

	return (
		<div className="relative h-full w-full">
			<CanvasResizer color={border} visible={Boolean(selected) && !editing} />
			<div
				className={cn('absolute inset-0 rounded-lg border-2 border-dashed')}
				style={{
					borderColor: border,
					background: tint,
					pointerEvents: 'none',
					...bgImage,
				}}
			/>
			{editing ? (
				<input
					ref={inputRef}
					type="text"
					placeholder="Label"
					className="nodrag nopan absolute top-2 left-2 rounded-full border bg-background px-2 py-0.5 text-xs outline-none"
					style={{ borderColor: border, color: border, pointerEvents: 'auto' }}
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={onKeyDown}
					onBlur={commit}
					onClick={(e) => e.stopPropagation()}
					onPointerDown={(e) => e.stopPropagation()}
				/>
			) : node.label ? (
				<div
					className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs font-medium cursor-text select-none"
					style={labelStyle}
					onDoubleClick={enterEdit}
					title="Double-click to edit label"
				>
					{node.label}
				</div>
			) : (
				<div
					className="absolute top-2 left-2 h-5 w-16 rounded-full border border-dashed text-xs opacity-0 hover:opacity-60"
					style={{ borderColor: border, color: border, pointerEvents: 'auto' }}
					onDoubleClick={enterEdit}
					title="Double-click to add label"
				/>
			)}
			<SideHandles />
		</div>
	);
}
