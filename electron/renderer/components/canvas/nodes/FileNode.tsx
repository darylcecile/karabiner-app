import { useEffect, useRef, useState } from 'react';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import type { CanvasFileNode } from '@/shared/canvasTypes';
import { Path } from '@/shared/fsUtils';
import { cn } from '@/shared/utils';
import { useWorkbench } from '@/renderer/components/workbench/Workbench';
import { colorWithAlpha, resolveCanvasColor } from '../colors';
import { useCanvasContext } from '../context';
import { SideHandles } from '../handles';
import { CanvasResizer } from './resizer';

type Props = NodeProps & { data: { node: CanvasFileNode } };

function resolveFilePath(canvasDir: string, file: string): string {
	if (file.startsWith('/') || file.startsWith('~') || /^[A-Za-z]:[\\/]/.test(file)) {
		return Path.normalize(file);
	}
	return Path.normalize(`${canvasDir}/${file}`);
}

export function FileNode({ id, data, selected }: Props): React.ReactElement {
	const { node } = data;
	const { canvasDir } = useCanvasContext();
	const workbench = useWorkbench();
	const { updateNodeData } = useReactFlow();
	const border = resolveCanvasColor(node.color);
	const bg = node.color ? colorWithAlpha(node.color, 0.12) : undefined;

	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(node.file);
	const inputRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		if (editing && inputRef.current) {
			inputRef.current.focus();
			inputRef.current.select();
		}
	}, [editing]);

	const absPath = resolveFilePath(canvasDir, node.file);
	const [, base] = Path.split(absPath);
	const display = node.subpath ? `${node.file}${node.subpath}` : node.file;

	const onOpen = () => {
		if (editing) return;
		workbench.workspace.openInEditor(absPath);
	};

	const enterEdit = (e: React.MouseEvent) => {
		e.stopPropagation();
		setDraft(node.file);
		setEditing(true);
	};

	const commit = () => {
		setEditing(false);
		const next = draft.trim();
		if (next === node.file || next === '') return;
		updateNodeData(id, { node: { ...node, file: next } });
	};

	const cancel = () => {
		setEditing(false);
		setDraft(node.file);
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
			<div className="text-sm font-medium truncate">{base}</div>
			{editing ? (
				<input
					ref={inputRef}
					type="text"
					className="nodrag nopan mt-1 w-full rounded border bg-background px-1 py-0.5 text-xs outline-none"
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
					className="text-xs text-foreground/60 truncate mt-1"
					onDoubleClick={enterEdit}
					title="Double-click to edit path"
				>
					{display}
				</div>
			)}
		</div>
	);
}
