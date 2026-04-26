import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
	FileEditIcon,
	FileSearchIcon,
	FileScriptIcon,
	FolderSearchIcon,
	Search01Icon,
	CubeIcon,
	ArrowDown01Icon,
	ArrowRight01Icon,
	Tick01Icon,
	Cancel01Icon,
	AlertCircleIcon,
} from '@hugeicons/core-free-icons';
import { cn } from '@/shared/utils';
import { Button } from '../ui/button';
import { Spinner } from '../ui/spinner';
import type { ChatHelpers } from './types';

type ToolUIPart = {
	type: string;
	toolCallId?: string;
	toolName?: string;
	state:
		| 'input-streaming'
		| 'input-available'
		| 'approval-requested'
		| 'approval-responded'
		| 'output-available'
		| 'output-error'
		| 'output-denied';
	input?: unknown;
	output?: unknown;
	errorText?: string;
	approval?: { id: string; approved?: boolean; reason?: string };
};

type Props = {
	part: ToolUIPart;
	addToolApprovalResponse: ChatHelpers['addToolApprovalResponse'];
};

const TOOL_META: Record<
	string,
	{ label: string; icon: typeof FileEditIcon; tint: string; needsApproval?: boolean }
> = {
	readFile: { label: 'Read file', icon: FileSearchIcon, tint: 'text-sky-500' },
	writeFile: {
		label: 'Write file',
		icon: FileEditIcon,
		tint: 'text-amber-500',
		needsApproval: true,
	},
	grep: { label: 'Grep', icon: Search01Icon, tint: 'text-violet-500' },
	searchWorkspace: {
		label: 'Search workspace',
		icon: CubeIcon,
		tint: 'text-emerald-500',
	},
	runBash: {
		label: 'Run bash',
		icon: FileScriptIcon,
		tint: 'text-rose-500',
		needsApproval: true,
	},
};

function getToolName(part: ToolUIPart): string {
	if (part.type === 'dynamic-tool') return part.toolName ?? 'tool';
	if (part.type.startsWith('tool-')) return part.type.slice('tool-'.length);
	return part.type;
}

function summarizeInput(input: unknown): string {
	if (input == null) return '';
	if (typeof input === 'string') return input;
	if (typeof input === 'object') {
		const obj = input as Record<string, unknown>;
		const candidates = ['path', 'file', 'filePath', 'pattern', 'query', 'command', 'cmd'];
		for (const key of candidates) {
			const val = obj[key];
			if (typeof val === 'string' && val.length > 0) return val;
		}
		try {
			const str = JSON.stringify(obj);
			return str.length > 80 ? str.slice(0, 80) + '…' : str;
		} catch {
			return '';
		}
	}
	return String(input);
}

function formatJson(value: unknown): string {
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

function stringifyOutput(output: unknown): string {
	if (output == null) return '';
	if (typeof output === 'string') return output;
	return formatJson(output);
}

export function ToolPart({ part, addToolApprovalResponse }: Props) {
	const name = getToolName(part);
	const meta = TOOL_META[name] ?? { label: name, icon: CubeIcon, tint: 'text-foreground/60' };
	const isApproval = part.state === 'approval-requested';
	const isError = part.state === 'output-error';
	const isDenied = part.state === 'output-denied';
	const isRunning = part.state === 'input-streaming' || part.state === 'input-available';

	const [open, setOpen] = useState<boolean>(isApproval || isError);
	const [responding, setResponding] = useState(false);

	const summary = summarizeInput(part.input);

	async function respond(approved: boolean) {
		if (!part.approval?.id || responding) return;
		setResponding(true);
		try {
			await addToolApprovalResponse({ id: part.approval.id, approved })
		} finally {
			setResponding(false);
		}
	}

	return (
		<div
			className={cn(
				'w-full max-w-full rounded-md border bg-background/40 text-xs overflow-hidden',
				isError
					? 'border-destructive/40'
					: isApproval
						? 'border-amber-500/40'
						: 'border-foreground/10',
			)}
		>
			<button
				type="button"
				onClick={() => setOpen((o) => !o)}
				className="flex w-full items-center gap-2 pl-2 pr-2.5 py-2 text-left hover:bg-foreground/5"
			>
				{/* <HugeiconsIcon
					icon={open ? ArrowDown01Icon : ArrowRight01Icon}
					size={12}
					className="shrink-0 text-foreground/50"
				/> */}
				<HugeiconsIcon
					icon={open ? ArrowDown01Icon : meta.icon}
					size={14}
					strokeWidth={2}
					className={cn('shrink-0', meta.tint)}
				/>
				<span className="font-sans text-2xs font-semibold">
					{meta.label}
				</span>
				{summary && (
					<span className="truncate font-mono text-2xs text-muted-foreground">
						{summary}
					</span>
				)}
				<span className="ml-auto flex shrink-0 items-center gap-1 text-3xs text-muted-foreground/40 uppercase">
					{isRunning && (
						<>
							<Spinner className="size-3" />
							<span>running</span>
						</>
					)}
					{isApproval && (
						<>
							<HugeiconsIcon
								icon={AlertCircleIcon}
								size={11}
								className="text-amber-500"
							/>
							<span className="text-amber-600 dark:text-amber-400">approval</span>
						</>
					)}
					{part.state === 'output-available' && <span>done</span>}
					{isError && <span className="text-destructive">error</span>}
					{isDenied && <span>denied</span>}
				</span>
			</button>

			{open && (
				<div className="flex flex-col gap-2 border-t border-foreground/10 px-2.5 py-2">
					{part.input !== undefined && (
						<div>
							<div className="mb-0.5 text-3xs tracking-wide text-foreground/50 uppercase">
								Input
							</div>
							<pre className="overflow-x-auto rounded bg-foreground/5 p-2 font-mono text-[11px] leading-snug whitespace-pre-wrap">
								{formatJson(part.input)}
							</pre>
						</div>
					)}

					{part.state === 'output-available' && part.output !== undefined && (
						<div>
							<div className="mb-0.5 text-3xs tracking-wide text-foreground/50 uppercase">
								Output
							</div>
							<pre className="max-h-64 overflow-auto rounded bg-foreground/5 p-2 font-mono text-[11px] leading-snug whitespace-pre-wrap">
								{stringifyOutput(part.output)}
							</pre>
						</div>
					)}

					{isError && part.errorText && (
						<div>
							<div className="mb-0.5 text-[10px] tracking-wide text-destructive uppercase">
								Error
							</div>
							<pre className="overflow-x-auto rounded bg-destructive/10 p-2 font-mono text-[11px] leading-snug whitespace-pre-wrap text-destructive">
								{part.errorText}
							</pre>
						</div>
					)}

					{isDenied && (
						<div className="text-[11px] text-foreground/60 italic">
							Tool execution denied
							{part.approval?.reason ? `: ${part.approval.reason}` : ''}.
						</div>
					)}

					{isApproval && (
						<div className="flex items-center gap-2 pt-1">
							<span className="mr-auto text-[11px] text-foreground/70">
								Allow this tool to run?
							</span>
							<Button
								size="xs"
								variant="outline"
								onClick={() => respond(false)}
								disabled={responding}
							>
								<HugeiconsIcon icon={Cancel01Icon} size={12} />
								Deny
							</Button>
							<Button
								size="xs"
								variant="default"
								onClick={() => respond(true)}
								disabled={responding}
							>
								<HugeiconsIcon icon={Tick01Icon} size={12} />
								Approve
							</Button>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
