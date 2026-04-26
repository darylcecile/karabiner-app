import { type NodeProps } from '@xyflow/react';
import type { CanvasFileNode } from '@/shared/canvasTypes';
import { Path } from '@/shared/fsUtils';
import { cn } from '@/shared/utils';
import { useWorkbench } from '@/renderer/components/workbench/Workbench';
import { colorWithAlpha, resolveCanvasColor } from '../colors';
import { useCanvasContext } from '../context';
import { SideHandles } from '../handles';

type Props = NodeProps & { data: { node: CanvasFileNode } };

function resolveFilePath(canvasDir: string, file: string): string {
	if (file.startsWith('/') || file.startsWith('~') || /^[A-Za-z]:[\\/]/.test(file)) {
		return Path.normalize(file);
	}
	return Path.normalize(`${canvasDir}/${file}`);
}

export function FileNode({ data }: Props): React.ReactElement {
	const { node } = data;
	const { canvasDir } = useCanvasContext();
	const workbench = useWorkbench();
	const border = resolveCanvasColor(node.color);
	const bg = node.color ? colorWithAlpha(node.color, 0.12) : undefined;

	const absPath = resolveFilePath(canvasDir, node.file);
	const [, base] = Path.split(absPath);
	const display = node.subpath ? `${node.file}${node.subpath}` : node.file;

	const onOpen = () => {
		workbench.workspace.openInEditor(absPath);
	};

	return (
		<div
			className={cn(
				'group h-full w-full overflow-hidden rounded-lg border p-3 cursor-pointer',
				'transition-colors hover:bg-accent/40',
				!bg && 'bg-card/50',
			)}
			style={{ borderColor: border, background: bg }}
			onClick={onOpen}
		>
			<SideHandles />
			<div className="text-sm font-medium truncate">{base}</div>
			<div className="text-xs text-foreground/60 truncate mt-1">{display}</div>
		</div>
	);
}
