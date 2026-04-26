import { MarkerType, type Edge, type Node } from '@xyflow/react';

import type { CanvasData, CanvasEdge as CanvasEdgeT, CanvasNode } from '@/shared/canvasTypes';

import { resolveCanvasColor } from './colors';

const MIN_DIM = 40;

function clampDim(n: number | undefined, fallback: number): number {
	const v = typeof n === 'number' && Number.isFinite(n) ? n : fallback;
	return Math.max(MIN_DIM, Math.round(v));
}

// Track B contract:
//   - Each rf node's `data` is `{ node: CanvasNode }`. Node components mutate
//     content via `useReactFlow().updateNodeData(id, { node: <updated CanvasNode> })`.
//   - For newly-created nodes, the toolbar may set `data.beginEditing = true`
//     so the matching node component can auto-focus into edit mode on mount.
//     This flag is transient and is NEVER serialized to disk.
//   - NodeResizer changes propagate via react-flow `onNodesChange` `dimensions`
//     events, which mutate rf `width`/`height`; we read those here.
export type RfNodeData = { node: CanvasNode; beginEditing?: boolean };

export function toReactFlow(data: CanvasData): { nodes: Node<RfNodeData>[]; edges: Edge[] } {
	const sourceNodes = data.nodes ?? [];
	const total = sourceNodes.length;
	const nodes: Node<RfNodeData>[] = sourceNodes.map((node, idx) => {
		const baseZ = total - idx;
		const isGroup = node.type === 'group';
		return {
			id: node.id,
			type: node.type,
			position: { x: node.x, y: node.y },
			data: { node },
			style: { width: clampDim(node.width, 200), height: clampDim(node.height, 100) },
			width: clampDim(node.width, 200),
			height: clampDim(node.height, 100),
			zIndex: isGroup ? -1 : baseZ,
			draggable: true,
			selectable: true,
			connectable: true,
		};
	});

	const ids = new Set(sourceNodes.map((n) => n.id));
	const sourceEdges = data.edges ?? [];
	const edges: Edge[] = [];
	for (const edge of sourceEdges) {
		if (!ids.has(edge.fromNode) || !ids.has(edge.toNode)) {
			console.warn(`[canvas] edge ${edge.id} references missing node`, edge);
			continue;
		}
		const fromEnd = edge.fromEnd ?? 'none';
		const toEnd = edge.toEnd ?? 'arrow';
		const stroke = resolveCanvasColor(edge.color);
		edges.push({
			id: edge.id,
			source: edge.fromNode,
			target: edge.toNode,
			sourceHandle: edge.fromSide,
			targetHandle: edge.toSide,
			type: 'canvas-edge',
			label: edge.label,
			data: { edge },
			markerStart: fromEnd === 'arrow' ? { type: MarkerType.ArrowClosed, color: stroke } : undefined,
			markerEnd: toEnd === 'arrow' ? { type: MarkerType.ArrowClosed, color: stroke } : undefined,
		});
	}

	return { nodes, edges };
}

function isSide(v: unknown): v is 'top' | 'right' | 'bottom' | 'left' {
	return v === 'top' || v === 'right' || v === 'bottom' || v === 'left';
}

export function fromReactFlow(rfNodes: Node<RfNodeData>[], rfEdges: Edge[]): CanvasData {
	const nodes: CanvasNode[] = rfNodes.map((rf) => {
		const base = rf.data?.node;
		if (!base) {
			throw new Error(`[canvas] rf node ${rf.id} missing data.node`);
		}
		const x = Math.round(rf.position.x);
		const y = Math.round(rf.position.y);
		const width = clampDim(rf.width ?? base.width, base.width);
		const height = clampDim(rf.height ?? base.height, base.height);
		// Strip the transient `beginEditing` flag (never persisted).
		return { ...base, id: rf.id, x, y, width, height } as CanvasNode;
	});

	const edges: CanvasEdgeT[] = rfEdges.map((rf) => {
		const baseEdge = (rf.data as { edge?: CanvasEdgeT } | undefined)?.edge;
		const fromSide = isSide(rf.sourceHandle) ? rf.sourceHandle : baseEdge?.fromSide;
		const toSide = isSide(rf.targetHandle) ? rf.targetHandle : baseEdge?.toSide;
		const merged: CanvasEdgeT = {
			id: rf.id,
			fromNode: rf.source,
			toNode: rf.target,
			fromEnd: baseEdge?.fromEnd ?? 'none',
			toEnd: baseEdge?.toEnd ?? 'arrow',
			...(baseEdge ?? {}),
			fromSide,
			toSide,
			label: typeof rf.label === 'string' ? rf.label : baseEdge?.label,
		};
		// Re-apply id/source/target after spread so they reflect current rf truth.
		merged.id = rf.id;
		merged.fromNode = rf.source;
		merged.toNode = rf.target;
		return merged;
	});

	return { nodes, edges };
}
