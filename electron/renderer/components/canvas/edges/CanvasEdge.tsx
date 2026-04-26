import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
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

	const [path, labelX, labelY] = getSmoothStepPath({
		sourceX,
		sourceY,
		targetX,
		targetY,
		sourcePosition,
		targetPosition,
	});

	const stroke = resolveCanvasColor(data?.edge.color);

	return (
		<>
			<BaseEdge
				id={id}
				path={path}
				markerStart={markerStart}
				markerEnd={markerEnd}
				style={{ stroke, strokeWidth: 2 }}
			/>
			{label && (
				<EdgeLabelRenderer>
					<div
						className="absolute pointer-events-auto rounded-full bg-card border px-2 py-0.5 text-xs"
						style={{
							transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
							borderColor: stroke,
							color: stroke,
						}}
					>
						{label}
					</div>
				</EdgeLabelRenderer>
			)}
		</>
	);
}
