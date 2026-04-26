import {
	BaseEdge,
	EdgeLabelRenderer,
	getSmoothStepPath,
	useReactFlow,
	type EdgeProps,
} from '@xyflow/react';
import { useEffect, useRef, useState } from 'react';

import type { CanvasEdge as CanvasEdgeData } from '@/shared/canvasTypes';

import { resolveCanvasColor } from '../colors';

type Props = EdgeProps & {
	data?: { edge: CanvasEdgeData };
};

export function CanvasEdge(props: Props): React.ReactElement {
	const {
		id,
		sourceX,
		sourceY,
		targetX,
		targetY,
		sourcePosition,
		targetPosition,
		markerStart,
		markerEnd,
		data,
		label,
	} = props;

	const rf = useReactFlow();
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState<string>(typeof label === 'string' ? label : '');
	const inputRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		if (editing) {
			setDraft(typeof label === 'string' ? label : '');
			// Defer focus to next tick so the input is mounted.
			setTimeout(() => inputRef.current?.focus(), 0);
		}
	}, [editing, label]);

	const [path, labelX, labelY] = getSmoothStepPath({
		sourceX,
		sourceY,
		targetX,
		targetY,
		sourcePosition,
		targetPosition,
	});

	const stroke = resolveCanvasColor(data?.edge.color);

	function commit(): void {
		const trimmed = draft.trim();
		const next = trimmed === '' ? undefined : trimmed;
		rf.setEdges((eds) =>
			eds.map((e) => {
				if (e.id !== id) return e;
				const baseEdge = (e.data as { edge?: CanvasEdgeData } | undefined)?.edge;
				return {
					...e,
					label: next,
					data: {
						...(e.data ?? {}),
						edge: { ...(baseEdge ?? { id, fromNode: e.source, toNode: e.target, fromEnd: 'none', toEnd: 'arrow' }), label: next },
					},
				};
			}),
		);
		setEditing(false);
	}

	function cancel(): void {
		setDraft(typeof label === 'string' ? label : '');
		setEditing(false);
	}

	const hasLabel = typeof label === 'string' && label.length > 0;

	return (
		<>
			<BaseEdge
				id={id}
				path={path}
				markerStart={markerStart}
				markerEnd={markerEnd}
				style={{ stroke, strokeWidth: 2 }}
				onDoubleClick={() => {
					if (!hasLabel) setEditing(true);
				}}
			/>
			{(hasLabel || editing) && (
				<EdgeLabelRenderer>
					{editing ? (
						<input
							ref={inputRef}
							className="absolute pointer-events-auto rounded-full bg-card border px-2 py-0.5 text-xs outline-none"
							style={{
								transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
								borderColor: stroke,
								color: stroke,
								minWidth: 60,
							}}
							value={draft}
							onChange={(e) => setDraft(e.target.value)}
							onBlur={commit}
							onKeyDown={(e) => {
								e.stopPropagation();
								if (e.key === 'Enter') {
									e.preventDefault();
									commit();
								} else if (e.key === 'Escape') {
									e.preventDefault();
									cancel();
								}
							}}
						/>
					) : (
						<div
							className="absolute pointer-events-auto rounded-full bg-card border px-2 py-0.5 text-xs cursor-text select-none"
							style={{
								transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
								borderColor: stroke,
								color: stroke,
							}}
							onDoubleClick={(e) => {
								e.stopPropagation();
								setEditing(true);
							}}
						>
							{label}
						</div>
					)}
				</EdgeLabelRenderer>
			)}
		</>
	);
}
