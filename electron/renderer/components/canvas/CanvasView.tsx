import '@xyflow/react/dist/style.css';
import { useEffect, useMemo, useState } from 'react';
import {
	Background,
	Controls,
	MarkerType,
	MiniMap,
	ReactFlow,
	ReactFlowProvider,
	type Edge,
	type EdgeTypes,
	type Node,
	type NodeTypes,
} from '@xyflow/react';
import { main } from '@/renderer/relay';
import type { CanvasData, CanvasEdge as CanvasEdgeT, CanvasNode } from '@/shared/canvasTypes';
import { Path } from '@/shared/fsUtils';
import { CanvasContext } from './context';
import { resolveCanvasColor } from './colors';
import { TextNode } from './nodes/TextNode';
import { FileNode } from './nodes/FileNode';
import { LinkNode } from './nodes/LinkNode';
import { GroupNode } from './nodes/GroupNode';
import { CanvasEdge } from './edges/CanvasEdge';

const nodeTypes: NodeTypes = {
	text: TextNode,
	file: FileNode,
	link: LinkNode,
	group: GroupNode,
};

const edgeTypes: EdgeTypes = {
	'canvas-edge': CanvasEdge,
};

const MIN_DIM = 40;

function clampDim(n: number): number {
	if (!Number.isFinite(n) || n <= 0) return MIN_DIM;
	return Math.max(MIN_DIM, n);
}

function buildNodes(data: CanvasData): Node[] {
	const nodes = data.nodes ?? [];
	// Spec: first node = bottom. Assign zIndex by reversed order so first nodes
	// (typically groups) sit behind later ones.
	const total = nodes.length;
	return nodes.map((node, idx) => {
		const baseZ = total - idx;
		const isGroup = node.type === 'group';
		return {
			id: node.id,
			type: node.type,
			position: { x: node.x, y: node.y },
			data: { node },
			style: { width: clampDim(node.width), height: clampDim(node.height) },
			zIndex: isGroup ? -1 : baseZ,
			draggable: !isGroup,
			selectable: true,
			connectable: false,
		} satisfies Node;
	});
}

function buildEdges(data: CanvasData, nodeIds: Set<string>): Edge[] {
	const edges = data.edges ?? [];
	const out: Edge[] = [];
	for (const edge of edges) {
		if (!nodeIds.has(edge.fromNode) || !nodeIds.has(edge.toNode)) {
			console.warn(`[canvas] edge ${edge.id} references missing node`, edge);
			continue;
		}
		const fromEnd = edge.fromEnd ?? 'none';
		const toEnd = edge.toEnd ?? 'arrow';
		const stroke = resolveCanvasColor(edge.color);
		out.push({
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
	return out;
}

type FetchState =
	| { status: 'loading' }
	| { status: 'error'; error: string }
	| { status: 'ready'; data: CanvasData };

export function CanvasView({ path }: { path: string }): React.ReactElement {
	const [state, setState] = useState<FetchState>({ status: 'loading' });

	useEffect(() => {
		let cancelled = false;
		setState({ status: 'loading' });
		(async () => {
			try {
				const res = await main.readCanvas(path);
				if (cancelled) return;
				if (res.error !== undefined) {
					setState({ status: 'error', error: res.error });
				} else {
					setState({ status: 'ready', data: res.data });
				}
			} catch (e) {
				if (cancelled) return;
				setState({ status: 'error', error: e instanceof Error ? e.message : String(e) });
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [path]);

	const canvasDir = useMemo(() => {
		const [dir] = Path.split(path);
		return dir;
	}, [path]);

	if (state.status === 'loading') {
		return (
			<div className="absolute inset-0 flex items-center justify-center text-foreground/60">
				Loading canvas…
			</div>
		);
	}

	if (state.status === 'error') {
		return (
			<div className="absolute inset-0 flex items-center justify-center text-destructive">
				Failed to load canvas: {state.error}
			</div>
		);
	}

	const data = state.data;
	const hasNodes = (data.nodes ?? []).length > 0;

	if (!hasNodes) {
		return (
			<div className="absolute inset-0 flex items-center justify-center text-foreground/60">
				Empty canvas
			</div>
		);
	}

	return (
		<CanvasContext.Provider value={{ canvasDir }}>
			<div className="absolute inset-0">
				<ReactFlowProvider>
					<CanvasFlow data={data} />
				</ReactFlowProvider>
			</div>
		</CanvasContext.Provider>
	);
}

function CanvasFlow({ data }: { data: CanvasData }): React.ReactElement {
	const nodes = useMemo(() => buildNodes(data), [data]);
	const edges = useMemo(() => {
		const ids = new Set((data.nodes ?? []).map((n) => n.id));
		return buildEdges(data, ids);
	}, [data]);

	return (
		<ReactFlow
			nodes={nodes}
			edges={edges}
			nodeTypes={nodeTypes}
			edgeTypes={edgeTypes}
			fitView
			nodesConnectable={false}
			proOptions={{ hideAttribution: true }}
		>
			<Background gap={20} size={1} bgColor='transparent' />
			<Controls />
			<MiniMap pannable zoomable position="bottom-right" className='rounded-md' />
		</ReactFlow>
	);
}
