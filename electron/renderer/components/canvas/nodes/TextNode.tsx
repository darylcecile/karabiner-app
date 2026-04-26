import { useEffect, useRef, useState } from 'react';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { CanvasTextNode } from '@/shared/canvasTypes';
import { cn } from '@/shared/utils';
import { colorWithAlpha, resolveCanvasColor } from '../colors';
import { SideHandles } from '../handles';
import { CanvasResizer } from './resizer';

type Props = NodeProps & {
	data: { node: CanvasTextNode; beginEditing?: boolean };
};

export function TextNode({ id, data, selected }: Props): React.ReactElement {
	const { node, beginEditing } = data;
	const { updateNodeData } = useReactFlow();
	const border = resolveCanvasColor(node.color);
	const bg = node.color ? colorWithAlpha(node.color, 0.12) : undefined;

	const [editing, setEditing] = useState<boolean>(Boolean(beginEditing));
	const [draft, setDraft] = useState<string>(node.text);
	const taRef = useRef<HTMLTextAreaElement | null>(null);

	useEffect(() => {
		if (beginEditing && !editing) {
			setEditing(true);
			setDraft(node.text);
		}
		// only run when beginEditing flips
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [beginEditing]);

	useEffect(() => {
		if (editing && taRef.current) {
			const el = taRef.current;
			el.focus();
			const len = el.value.length;
			el.setSelectionRange(len, len);
		}
	}, [editing]);

	const enterEdit = () => {
		setDraft(node.text);
		setEditing(true);
	};

	const commit = () => {
		setEditing(false);
		const next = draft;
		const patch: { node: CanvasTextNode; beginEditing?: undefined } = {
			node: { ...node, text: next },
		};
		if (beginEditing) patch.beginEditing = undefined;
		updateNodeData(id, patch);
	};

	const cancel = () => {
		setEditing(false);
		setDraft(node.text);
		if (beginEditing) updateNodeData(id, { beginEditing: undefined });
	};

	const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		e.stopPropagation();
		if (e.key === 'Escape') {
			e.preventDefault();
			cancel();
			return;
		}
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			commit();
		}
	};

	return (
		<div
			className={cn(
				'group relative h-full w-full overflow-auto rounded-lg border p-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
				!bg && 'bg-card/50',
				!editing && 'prose prose-sm dark:prose-invert max-w-none',
			)}
			style={{ borderColor: border, background: bg }}
			onDoubleClick={(e) => {
				if (editing) return;
				e.stopPropagation();
				enterEdit();
			}}
		>
			<CanvasResizer color={border} visible={Boolean(selected) && !editing} />
			<SideHandles />
			{editing ? (
				<textarea
					ref={taRef}
					className="nodrag nopan h-full w-full resize-none bg-transparent font-mono text-sm outline-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={onKeyDown}
					onBlur={commit}
					onPointerDown={(e) => e.stopPropagation()}
				/>
			) : (
				<ReactMarkdown remarkPlugins={[remarkGfm]}>{node.text}</ReactMarkdown>
			)}
		</div>
	);
}
