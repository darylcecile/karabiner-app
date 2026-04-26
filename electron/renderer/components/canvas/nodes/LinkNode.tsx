import { useEffect, useRef, useState } from 'react';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import type { CanvasLinkNode } from '@/shared/canvasTypes';
import { cn } from '@/shared/utils';
import { colorWithAlpha, resolveCanvasColor } from '../colors';
import { SideHandles } from '../handles';
import { CanvasResizer } from './resizer';

type Props = NodeProps & { data: { node: CanvasLinkNode } };

function getHost(url: string): string {
	try {
		return new URL(url).host;
	} catch {
		return url;
	}
}

export function LinkNode({ id, data, selected }: Props): React.ReactElement {
	const { node } = data;
	const { updateNodeData } = useReactFlow();
	const border = resolveCanvasColor(node.color);
	const bg = node.color ? colorWithAlpha(node.color, 0.12) : undefined;

	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(node.url);
	const inputRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		if (editing && inputRef.current) {
			inputRef.current.focus();
			inputRef.current.select();
		}
	}, [editing]);

	const onOpen = () => {
		if (editing) return;
		window.open(node.url, '_blank', 'noopener,noreferrer');
	};

	const enterEdit = (e: React.MouseEvent) => {
		e.stopPropagation();
		setDraft(node.url);
		setEditing(true);
	};

	const commit = () => {
		setEditing(false);
		const next = draft.trim();
		if (next === node.url || next === '') return;
		updateNodeData(id, { node: { ...node, url: next } });
	};

	const cancel = () => {
		setEditing(false);
		setDraft(node.url);
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

	return (
		<div
			className={cn(
				'group relative h-full w-full overflow-hidden rounded-lg border p-3',
				!editing && 'cursor-pointer transition-colors hover:bg-accent/40',
				!bg && 'bg-card/50',
			)}
			style={{ borderColor: border, background: bg }}
			onClick={onOpen}
		>
			<CanvasResizer color={border} visible={Boolean(selected) && !editing} />
			<SideHandles />
			<div className="text-xs uppercase tracking-wide text-foreground/60">{getHost(node.url)}</div>
			{editing ? (
				<input
					ref={inputRef}
					type="text"
					className="nodrag nopan mt-1 w-full rounded border bg-background px-1 py-0.5 text-sm outline-none"
					style={{ borderColor: border }}
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={onKeyDown}
					onBlur={commit}
					onClick={(e) => e.stopPropagation()}
					onPointerDown={(e) => e.stopPropagation()}
				/>
			) : (
				<div
					className="text-sm font-medium break-all mt-1"
					onDoubleClick={enterEdit}
					title="Double-click to edit URL"
				>
					{node.url}
				</div>
			)}
		</div>
	);
}
