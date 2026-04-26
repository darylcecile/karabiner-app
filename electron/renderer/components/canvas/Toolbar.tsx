import { useReactFlow, type Node } from '@xyflow/react';

import type { CanvasNode } from '@/shared/canvasTypes';
import { cn } from '@/shared/utils';

import type { RfNodeData } from './serialize';

type Props = {
	onChange: () => void;
};

function newId(): string {
	return crypto.randomUUID();
}

export function Toolbar({ onChange }: Props): React.ReactElement {
	const rf = useReactFlow<Node<RfNodeData>>();

	function center(): { x: number; y: number } {
		try {
			return rf.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
		} catch {
			return { x: 0, y: 0 };
		}
	}

	function add(node: CanvasNode, opts: { beginEditing?: boolean; atFront?: boolean } = {}): void {
		const isGroup = node.type === 'group';
		const rfNode: Node<RfNodeData> = {
			id: node.id,
			type: node.type,
			position: { x: node.x, y: node.y },
			data: { node, ...(opts.beginEditing ? { beginEditing: true } : {}) },
			style: { width: node.width, height: node.height },
			width: node.width,
			height: node.height,
			zIndex: isGroup ? -1 : 1,
			draggable: true,
			selectable: true,
			connectable: true,
			selected: true,
		};
		rf.setNodes((prev) => {
			const cleared = prev.map((p) => (p.selected ? { ...p, selected: false } : p));
			return opts.atFront ? [rfNode, ...cleared] : [...cleared, rfNode];
		});
		onChange();
	}

	function addText(): void {
		const c = center();
		const width = 260;
		const height = 120;
		add(
			{
				id: newId(),
				type: 'text',
				x: Math.round(c.x - width / 2),
				y: Math.round(c.y - height / 2),
				width,
				height,
				text: '',
			},
			{ beginEditing: true },
		);
	}

	function addFile(): void {
		const c = center();
		const width = 320;
		const height = 80;
		const input = window.prompt('File path (vault-relative or absolute):', '') ?? '';
		add({
			id: newId(),
			type: 'file',
			x: Math.round(c.x - width / 2),
			y: Math.round(c.y - height / 2),
			width,
			height,
			file: input.trim(),
		});
	}

	function addLink(): void {
		const c = center();
		const width = 320;
		const height = 80;
		const input = window.prompt('URL:', 'https://') ?? '';
		add({
			id: newId(),
			type: 'link',
			x: Math.round(c.x - width / 2),
			y: Math.round(c.y - height / 2),
			width,
			height,
			url: input.trim(),
		});
	}

	function addGroup(): void {
		const c = center();
		const width = 480;
		const height = 320;
		add(
			{
				id: newId(),
				type: 'group',
				x: Math.round(c.x - width / 2),
				y: Math.round(c.y - height / 2),
				width,
				height,
				label: 'Group',
			},
			{ atFront: true },
		);
	}

	const btn =
		'rounded-md border border-border bg-card/90 backdrop-blur px-2 py-1 text-xs hover:bg-accent';

	return (
		<div className={cn('absolute top-8 left-2 z-10 flex gap-1')}>
			<button type="button" className={btn} onClick={addText}>
				+ Text
			</button>
			<button type="button" className={btn} onClick={addFile}>
				+ File
			</button>
			<button type="button" className={btn} onClick={addLink}>
				+ Link
			</button>
			<button type="button" className={btn} onClick={addGroup}>
				+ Group
			</button>
		</div>
	);
}
