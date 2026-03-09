import { type FC, useState, useCallback, useEffect, useRef } from "react";
import type { IDockviewPanelProps } from "dockview";
import type { OpenCodeContextData, OpenCodeMcpServer, OpenCodeModelInfo, OpenCodeTokens } from "../../shared/rpc";
import { setOpenCodeUrl } from "../rpc";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

type SectionId = "context" | "tokens" | "cost" | "mcps";

/** Props for the presentational content component */
interface ContextSidebarContentProps {
	data: OpenCodeContextData | null;
	onUrlChange: (url: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Formatting helpers                                                */
/* ------------------------------------------------------------------ */

/** Format a number with K/M suffix for compact display */
function formatTokenCount(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return String(n);
}

/** Format a dollar amount */
function formatCost(n: number): string {
	if (n === 0) return "$0.00";
	if (n < 0.01) return `$${n.toFixed(4)}`;
	return `$${n.toFixed(2)}`;
}

/* ------------------------------------------------------------------ */
/*  Section content components                                        */
/* ------------------------------------------------------------------ */

const ContextSizeSection: FC<{ model: OpenCodeModelInfo | null; tokens: OpenCodeTokens }> = ({ model, tokens }) => {
	const contextLimit = model?.contextLimit ?? 0;
	const used = tokens.total;
	const percent = contextLimit > 0 ? Math.min(100, Math.round((used / contextLimit) * 100)) : 0;
	const remaining = Math.max(0, contextLimit - used);

	if (!contextLimit) {
		return (
			<div className="text-[var(--font-size-xs)] text-fg-muted">
				No model info available
			</div>
		);
	}

	return (
		<div className="space-y-2">
			<div className="flex justify-between text-[var(--font-size-xs)]">
				<span className="text-fg-muted">Window</span>
				<span>{formatTokenCount(used)} / {formatTokenCount(contextLimit)}</span>
			</div>
			<div className="w-full h-1.5 bg-bg-surface rounded-full overflow-hidden">
				<div
					className="h-full rounded-full transition-all duration-300"
					style={{
						width: `${percent}%`,
						backgroundColor: percent > 80 ? "var(--color-error)" : "var(--color-accent)",
					}}
				/>
			</div>
			<div className="flex justify-between text-[var(--font-size-xs)] text-fg-muted">
				<span>{percent}% used</span>
				<span>{formatTokenCount(remaining)} remaining</span>
			</div>
			{model && (
				<div className="text-[var(--font-size-xs)] text-fg-muted truncate pt-1">
					{model.name}
				</div>
			)}
		</div>
	);
};

const TokensSection: FC<{ tokens: OpenCodeTokens }> = ({ tokens }) => (
	<div className="space-y-1.5">
		<div className="flex justify-between text-[var(--font-size-xs)]">
			<span className="text-fg-muted">Input</span>
			<span>{formatTokenCount(tokens.input)}</span>
		</div>
		<div className="flex justify-between text-[var(--font-size-xs)]">
			<span className="text-fg-muted">Output</span>
			<span>{formatTokenCount(tokens.output)}</span>
		</div>
		{tokens.reasoning > 0 && (
			<div className="flex justify-between text-[var(--font-size-xs)]">
				<span className="text-fg-muted">Reasoning</span>
				<span>{formatTokenCount(tokens.reasoning)}</span>
			</div>
		)}
		{(tokens.cacheRead > 0 || tokens.cacheWrite > 0) && (
			<>
				<div className="flex justify-between text-[var(--font-size-xs)]">
					<span className="text-fg-muted">Cache read</span>
					<span>{formatTokenCount(tokens.cacheRead)}</span>
				</div>
				<div className="flex justify-between text-[var(--font-size-xs)]">
					<span className="text-fg-muted">Cache write</span>
					<span>{formatTokenCount(tokens.cacheWrite)}</span>
				</div>
			</>
		)}
		<div className="flex justify-between text-[var(--font-size-xs)] border-t border-border pt-1.5 mt-1.5">
			<span className="text-fg-muted">Total</span>
			<span className="font-medium">{formatTokenCount(tokens.total)}</span>
		</div>
	</div>
);

const CostSection: FC<{ cost: number; todayCost: number }> = ({ cost, todayCost }) => (
	<div className="space-y-1.5">
		<div className="flex justify-between text-[var(--font-size-xs)]">
			<span className="text-fg-muted">Session</span>
			<span>{formatCost(cost)}</span>
		</div>
		<div className="flex justify-between text-[var(--font-size-xs)]">
			<span className="text-fg-muted">Today</span>
			<span>{formatCost(todayCost)}</span>
		</div>
	</div>
);

/** Status indicator dot */
const StatusDot: FC<{ status: OpenCodeMcpServer["status"] }> = ({ status }) => {
	const colorMap: Record<OpenCodeMcpServer["status"], string> = {
		connected: "var(--color-git-added, #73c991)",
		disabled: "var(--color-fg-muted)",
		failed: "var(--color-error, #f14c4c)",
		needs_auth: "var(--color-warning, #cca700)",
		needs_client_registration: "var(--color-warning, #cca700)",
	};
	return (
		<span
			className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
			style={{ backgroundColor: colorMap[status] }}
		/>
	);
};

const McpSection: FC<{ servers: OpenCodeMcpServer[] }> = ({ servers }) => {
	if (servers.length === 0) {
		return (
			<div className="text-[var(--font-size-xs)] text-fg-muted">
				No servers configured
			</div>
		);
	}

	return (
		<div className="space-y-1.5">
			{servers.map((server) => (
				<div key={server.name} className="flex items-center gap-2 text-[var(--font-size-xs)]">
					<StatusDot status={server.status} />
					<span className="truncate flex-1">{server.name}</span>
					<span className="text-fg-muted shrink-0">{server.status}</span>
				</div>
			))}
		</div>
	);
};

/** Disconnected state shown when OpenCode server is not reachable */
const DisconnectedState: FC<{ serverUrl: string; onUrlChange: (url: string) => void }> = ({ serverUrl, onUrlChange }) => {
	const [editing, setEditing] = useState(false);
	const [urlValue, setUrlValue] = useState(serverUrl);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		setUrlValue(serverUrl);
	}, [serverUrl]);

	useEffect(() => {
		if (editing) inputRef.current?.focus();
	}, [editing]);

	const handleSubmit = () => {
		const trimmed = urlValue.trim();
		if (trimmed && trimmed !== serverUrl) {
			onUrlChange(trimmed);
		}
		setEditing(false);
	};

	return (
		<div className="flex flex-col items-center justify-center gap-2 py-6 text-center px-3">
			<div className="text-fg-muted text-[var(--font-size-xs)]">
				Not connected to OpenCode server
			</div>
			{editing ? (
				<div className="w-full space-y-1.5">
					<input
						ref={inputRef}
						type="text"
						value={urlValue}
						onChange={(e) => setUrlValue(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") handleSubmit();
							if (e.key === "Escape") { setEditing(false); setUrlValue(serverUrl); }
						}}
						onBlur={handleSubmit}
						className="w-full px-2 py-1 text-[10px] bg-bg-surface border border-border rounded
						           text-fg focus:outline-none focus:border-accent"
						placeholder="http://127.0.0.1:4096"
					/>
				</div>
			) : (
				<button
					type="button"
					onClick={() => setEditing(true)}
					className="text-fg-muted text-[10px] hover:text-fg transition-colors cursor-pointer"
					title="Click to change server URL"
				>
					{serverUrl}
				</button>
			)}
		</div>
	);
};

/* ------------------------------------------------------------------ */
/*  Section definitions                                               */
/* ------------------------------------------------------------------ */

interface SectionDef {
	id: SectionId;
	title: string;
}

const SECTIONS: SectionDef[] = [
	{ id: "context", title: "Context" },
	{ id: "tokens", title: "Tokens" },
	{ id: "cost", title: "Cost" },
	{ id: "mcps", title: "MCP Servers" },
];

/* ------------------------------------------------------------------ */
/*  Context sidebar content (pure presentational)                     */
/* ------------------------------------------------------------------ */

const ContextSidebarContent: FC<ContextSidebarContentProps> = ({ data, onUrlChange }) => {
	const [expanded, setExpanded] = useState<Record<SectionId, boolean>>({
		context: true,
		tokens: true,
		cost: true,
		mcps: true,
	});

	const toggleSection = useCallback((id: SectionId) => {
		setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
	}, []);

	const connected = data?.connected ?? false;

	// Render section content based on section ID
	const renderSectionContent = (id: SectionId) => {
		if (!data || !connected) return null;

		switch (id) {
			case "context":
				return <ContextSizeSection model={data.model} tokens={data.tokens} />;
			case "tokens":
				return <TokensSection tokens={data.tokens} />;
			case "cost":
				return <CostSection cost={data.sessionCost} todayCost={data.todayCost} />;
			case "mcps":
				return <McpSection servers={data.mcpServers} />;
		}
	};

	return (
		<div className="flex flex-col h-full bg-context-panel text-context-panel-fg overflow-hidden select-none">
			{/* Header */}
			<div
				className="flex items-center px-4 uppercase tracking-wider font-semibold
				           text-[11px] text-sidebar-header-fg bg-context-panel shrink-0"
				style={{ height: "var(--spacing-tab-height)" }}
			>
				<span className="flex-1">Context</span>
				{data && (
					<span className="flex items-center gap-1.5 text-[10px] font-normal normal-case tracking-normal">
						<span
							className="inline-block w-1.5 h-1.5 rounded-full"
							style={{
								backgroundColor: connected
									? data.sessionStatus === "busy"
										? "var(--color-warning, #cca700)"
										: "var(--color-git-added, #73c991)"
									: "var(--color-error, #f14c4c)",
							}}
						/>
						<span className="text-fg-muted">
							{!connected
								? "disconnected"
								: data.sessionStatus === "busy"
									? "busy"
									: "connected"}
						</span>
					</span>
				)}
			</div>

			{/* Session title if available */}
			{data?.connected && data.sessionTitle && (
				<div className="px-3 py-1.5 text-[10px] text-fg-muted truncate border-b border-border">
					{data.sessionTitle}
				</div>
			)}

			{/* Sections */}
			<div className="flex-1 overflow-y-auto">
				{!connected && (
					<DisconnectedState
						serverUrl={data?.serverUrl ?? "http://127.0.0.1:4096"}
						onUrlChange={onUrlChange}
					/>
				)}

				{connected && SECTIONS.map((section) => {
					const isExpanded = expanded[section.id];

					return (
						<div key={section.id} className="flex flex-col">
							{/* Section header */}
							<button
								type="button"
								onClick={() => toggleSection(section.id)}
								className="flex items-center gap-1.5 px-3 py-1.5
								           bg-context-panel-header text-[11px] font-semibold uppercase tracking-wider
								           cursor-pointer hover:bg-list-hover transition-colors text-left w-full"
							>
								<span className="text-[10px] text-fg-secondary w-3 text-center select-none">
									{isExpanded ? "\u25BC" : "\u25B6"}
								</span>
								<span className="flex-1 truncate">{section.title}</span>
							</button>

							{/* Section content */}
							{isExpanded && (
								<div className="px-3 py-2">
									{renderSectionContent(section.id)}
								</div>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
};

/* ------------------------------------------------------------------ */
/*  Dockview panel wrapper                                            */
/* ------------------------------------------------------------------ */

/**
 * ContextSidebarPanel -- a Dockview panel for the right-hand context sidebar.
 * Displays context size, token usage, cost, and MCP server status.
 * Receives data via Dockview panel params.
 */
export const ContextSidebarPanel = (props: IDockviewPanelProps) => {
	const [data, setData] = useState<OpenCodeContextData | null>(null);

	// Listen for param updates from the parent (App.tsx)
	useEffect(() => {
		const disposable = props.api.onDidParametersChange(() => {
			const params = props.api.getParameters<{ openCodeContext?: OpenCodeContextData }>();
			if (params?.openCodeContext) {
				setData(params.openCodeContext);
			}
		});
		return () => disposable.dispose();
	}, [props.api]);

	// Also read initial params
	useEffect(() => {
		const params = props.params as { openCodeContext?: OpenCodeContextData } | undefined;
		if (params?.openCodeContext) {
			setData(params.openCodeContext);
		}
	}, [props.params]);

	const handleUrlChange = useCallback((url: string) => {
		setOpenCodeUrl(url);
	}, []);

	return <ContextSidebarContent data={data} onUrlChange={handleUrlChange} />;
};
