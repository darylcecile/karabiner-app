import '@xyflow/react/dist/style.css';

import {
	Background,
	Controls,
	MarkerType,
	MiniMap,
	ReactFlow,
	ReactFlowProvider,
	addEdge,
	useEdgesState,
	useNodesState,
	type Connection,
	type Edge,
	type EdgeTypes,
	type Node,
	type NodeTypes,
	type OnConnect,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { main } from '@/renderer/relay';
import { Path } from '@/shared/fsUtils';
import { cn } from '@/shared/utils';

import { Toolbar } from './Toolbar';
import { CanvasContext } from './context';
import { CanvasEdge } from './edges/CanvasEdge';
import { FileNode } from './nodes/FileNode';
import { GroupNode } from './nodes/GroupNode';
import { LinkNode } from './nodes/LinkNode';
import { TextNode } from './nodes/TextNode';
import { fromReactFlow, toReactFlow, type RfNodeData } from './serialize';

const nodeTypes: NodeTypes = {
	text: TextNode,
	file: FileNode,
	link: LinkNode,
	group: GroupNode,
};

const edgeTypes: EdgeTypes = {
	'canvas-edge': CanvasEdge,
};

const SAVE_DEBOUNCE_MS = 400;

type Status = 'loading' | 'ready' | 'error';

export function CanvasView({ path }: { path: string }): React.ReactElement {
	const canvasDir = useMemo(() => {
		const [dir] = Path.split(path);
		return dir;
	}, [path]);

	return (
		<CanvasContext.Provider value={{ canvasDir }}>
			<div className="absolute inset-0">
				<ReactFlowProvider>
					<CanvasFlow path={path} />
				</ReactFlowProvider>
			</div>
		</CanvasContext.Provider>
	);
}

function CanvasFlow({ path }: { path: string }): React.ReactElement {
	const [status, setStatus] = useState<Status>('loading');
	const [errorMsg, setErrorMsg] = useState<string>('');
	const [nodes, setNodes, onNodesChange] = useNodesState<Node<RfNodeData>>([]);
	const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

	const dirtyRef = useRef(false);
	const [savePending, setSavePending] = useState(false);
	const [saveInFlight, setSaveInFlight] = useState(false);
	const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	// Latest rf state captured for the debounced save closure / unmount flush.
	const latestRef = useRef<{ nodes: Node<RfNodeData>[]; edges: Edge[]; path: string }>({
		nodes: [],
		edges: [],
		path,
	});
	const fitDoneRef = useRef<string | null>(null);

	useEffect(() => {
		latestRef.current = { nodes, edges, path };
	}, [nodes, edges, path]);

	const flushSave = useCallback(async (target: { nodes: Node<RfNodeData>[]; edges: Edge[]; path: string }) => {
		if (saveTimerRef.current) {
			clearTimeout(saveTimerRef.current);
			saveTimerRef.current = null;
		}
		setSavePending(false);
		setSaveInFlight(true);
		try {
			const data = fromReactFlow(target.nodes, target.edges);
			const res = await main.writeCanvas(target.path, data);
			if (res.error !== undefined) {
				console.error('[canvas] writeCanvas error:', res.error);
				toast.error(`Failed to save canvas: ${res.error}`);
			}
		} catch (err) {
			console.error('[canvas] writeCanvas threw:', err);
			toast.error(`Failed to save canvas: ${err instanceof Error ? err.message : String(err)}`);
		} finally {
			setSaveInFlight(false);
		}
	}, []);

	const markDirty = useCallback(() => {
		dirtyRef.current = true;
		setSavePending(true);
		if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
		saveTimerRef.current = setTimeout(() => {
			saveTimerRef.current = null;
			const snap = latestRef.current;
			void flushSave(snap);
		}, SAVE_DEBOUNCE_MS);
	}, [flushSave]);

	// Load on mount / path change. Flush pending saves before swapping path.
	useEffect(() => {
		let cancelled = false;
		setStatus('loading');
		setErrorMsg('');
		(async () => {
			try {
				const res = await main.readCanvas(path);
				if (cancelled) return;
				if (res.error !== undefined) {
					setStatus('error');
					setErrorMsg(res.error);
					return;
				}
				const { nodes: nextNodes, edges: nextEdges } = toReactFlow(res.data);
				// Initial seed must NOT mark dirty.
				dirtyRef.current = false;
				setNodes(nextNodes);
				setEdges(nextEdges);
				setStatus('ready');
			} catch (err) {
				if (cancelled) return;
				setStatus('error');
				setErrorMsg(err instanceof Error ? err.message : String(err));
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [path, setNodes, setEdges]);

	// On path change or unmount: flush any pending save synchronously (kick it off).
	useEffect(() => {
		return () => {
			if (saveTimerRef.current) {
				clearTimeout(saveTimerRef.current);
				saveTimerRef.current = null;
				const snap = latestRef.current;
				if (dirtyRef.current) {
					// Fire-and-forget; don't block React.
					void flushSave(snap);
				}
			}
		};
	}, [path, flushSave]);

	const handleNodesChange: typeof onNodesChange = useCallback(
		(changes) => {
			onNodesChange(changes);
			const dirties = changes.some((c) => c.type !== 'select');
			if (dirties) markDirty();
		},
		[onNodesChange, markDirty],
	);

	const handleEdgesChange: typeof onEdgesChange = useCallback(
		(changes) => {
			onEdgesChange(changes);
			const dirties = changes.some((c) => c.type !== 'select');
			if (dirties) markDirty();
		},
		[onEdgesChange, markDirty],
	);

	const onConnect: OnConnect = useCallback(
		(conn: Connection) => {
			const id = crypto.randomUUID();
			const fromSide = (conn.sourceHandle ?? undefined) as 'top' | 'right' | 'bottom' | 'left' | undefined;
			const toSide = (conn.targetHandle ?? undefined) as 'top' | 'right' | 'bottom' | 'left' | undefined;
			const newEdge: Edge = {
				id,
				source: conn.source,
				target: conn.target,
				sourceHandle: conn.sourceHandle ?? undefined,
				targetHandle: conn.targetHandle ?? undefined,
				type: 'canvas-edge',
				data: {
					edge: {
						id,
						fromNode: conn.source,
						toNode: conn.target,
						fromSide,
						toSide,
						fromEnd: 'none' as const,
						toEnd: 'arrow' as const,
					},
				},
				markerEnd: { type: MarkerType.ArrowClosed },
			};
			setEdges((eds) => addEdge(newEdge, eds));
			markDirty();
		},
		[setEdges, markDirty],
	);

	useEffect(() => {
		if (status === 'ready' && fitDoneRef.current !== path) {
			fitDoneRef.current = path;
		}
	}, [status, path]);

	if (status === 'loading') {
		return (
			<div className="absolute inset-0 flex items-center justify-center text-foreground/60">
				Loading canvas…
			</div>
		);
	}

	if (status === 'error') {
		return (
			<div className="absolute inset-0 flex items-center justify-center text-destructive">
				Failed to load canvas: {errorMsg}
			</div>
		);
	}

	const showSaving = savePending || saveInFlight;
	const fitView = fitDoneRef.current !== path;

	return (
		<>
			<Toolbar onChange={markDirty} />
			<div
				className={cn(
					'absolute top-8 right-2 z-10 rounded-md border border-border bg-card/90 px-2 py-1 text-xs text-foreground/70 transition-opacity',
					showSaving ? 'opacity-100' : 'opacity-0 pointer-events-none',
				)}
			>
				Saving…
			</div>
			<ReactFlow
				nodes={nodes}
				edges={edges}
				nodeTypes={nodeTypes}
				edgeTypes={edgeTypes}
				onNodesChange={handleNodesChange}
				onEdgesChange={handleEdgesChange}
				onConnect={onConnect}
				fitView={fitView}
				nodesConnectable
				nodesDraggable
				elementsSelectable
				deleteKeyCode={['Delete', 'Backspace']}
				proOptions={{ hideAttribution: true }}
			>
				<Background gap={20} size={1} bgColor="transparent" />
				<Controls />
				<MiniMap pannable zoomable position="bottom-right" className="rounded-md" />
			</ReactFlow>
		</>
	);
}
