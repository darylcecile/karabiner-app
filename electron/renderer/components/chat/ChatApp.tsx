import { useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { HugeiconsIcon } from '@hugeicons/react';
import {
	MagicWand01Icon,
	ArrowReloadHorizontalIcon,
	AlertCircleIcon,
	BotIcon,
} from '@hugeicons/core-free-icons';
import { cn } from '@/shared/utils';
import { TooltipProvider } from '../ui/tooltip';
import { Button } from '../ui/button';
import { Spinner } from '../ui/spinner';
import { usePrefersColorScheme } from '../../hooks/usePrefersColorScheme';
import { MessageBubble } from './MessageBubble';
import { Composer } from './Composer';
import { main } from '../../relay';

type Availability = {
	claude: boolean;
	copilot: boolean;
	openai: boolean;
	ollama: boolean;
	apple: boolean;
};

type ProviderId = 'none' | 'auto' | 'claude' | 'copilot' | 'openai' | 'ollama' | 'apple';

const PROVIDER_LABEL: Record<Exclude<ProviderId, 'auto' | 'none'>, string> = {
	apple: 'Apple Intelligence',
	claude: 'Claude (CLI)',
	copilot: 'Copilot SDK',
	openai: 'OpenAI',
	ollama: 'Ollama',
};

function resolveAutoProvider(avail: Availability | null): string | null {
	if (!avail) return null;
	if (avail.apple) return PROVIDER_LABEL.apple;
	if (avail.claude) return PROVIDER_LABEL.claude;
	if (avail.copilot) return PROVIDER_LABEL.copilot;
	if (avail.ollama) return PROVIDER_LABEL.ollama;
	if (avail.openai) return PROVIDER_LABEL.openai;
	return null;
}

function useProviderLabel() {
	const [label, setLabel] = useState<string | null | undefined>(undefined);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				let prefRaw: unknown = undefined;
				try {
					// `preferences` is a sync relay method — returns value directly.
					prefRaw = main.preferences('ai.provider');
				} catch {
					prefRaw = undefined;
				}
				const availability = (await (main.aiAvailability() as unknown as Promise<Availability>).catch(
					() => null,
				)) as Availability | null;
				if (cancelled) return;
				const pref = (prefRaw as ProviderId | undefined) ?? 'auto';
				if (pref === 'none') {
					setLabel(null);
					return;
				}
				if (pref === 'auto') {
					setLabel(resolveAutoProvider(availability));
					return;
				}
				const direct = PROVIDER_LABEL[pref as keyof typeof PROVIDER_LABEL];
				if (direct) {
					setLabel(direct);
				} else {
					setLabel(resolveAutoProvider(availability));
				}
			} catch {
				if (!cancelled) setLabel(null);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	return label;
}

function useStickToBottom(deps: unknown[]) {
	const scrollRef = useRef<HTMLDivElement | null>(null);
	const stickRef = useRef(true);

	function handleScroll() {
		const el = scrollRef.current;
		if (!el) return;
		const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
		stickRef.current = distanceFromBottom < 80;
	}

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		if (stickRef.current) {
			el.scrollTop = el.scrollHeight;
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, deps);

	return { scrollRef, handleScroll };
}

export function ChatApp() {
	const theme = usePrefersColorScheme();
	const providerLabel = useProviderLabel();

	useEffect(() => {
		document.body.classList.add('chat-window');
		return () => document.body.classList.remove('chat-window');
	}, []);

	const transport = useMemo(
		() => new DefaultChatTransport({ api: 'karabiner-ai://chat' }),
		[],
	);

	const {
		messages,
		sendMessage,
		stop,
		regenerate,
		status,
		error,
		clearError,
		addToolApprovalResponse,
	} = useChat({
		transport,
		experimental_throttle: 50,
	});

	const [input, setInput] = useState('');
	const isStreaming = status === 'streaming' || status === 'submitted';
	const ready = providerLabel !== undefined;
	const hasProvider = providerLabel !== null && providerLabel !== undefined;
	const canSubmit = !isStreaming && hasProvider && input.trim().length > 0;

	const { scrollRef, handleScroll } = useStickToBottom([messages, status]);

	function submit() {
		const text = input.trim();
		if (!text || isStreaming) return;
		setInput('');
		void sendMessage({ text });
	}

	function retry() {
		clearError();
		void regenerate();
	}

	const empty = messages.length === 0;

	return (
		<div className={cn('contents', theme === 'dark' && 'dark')}>
			<TooltipProvider>
				<div className="relative flex h-screen w-screen flex-col overflow-hidden bg-background/0 text-foreground">
					{/* draggable titlebar region */}
					<div
						className="absolute inset-x-0 top-0 z-30 h-10"
						style={{
							// @ts-expect-error css-properties not typed
							appRegion: 'drag',
						}}
					/>

					{/* Header */}
					<header className="relative z-20 flex h-10 shrink-0 items-center justify-center border-b border-foreground/10 bg-background/30 pl-20 pr-3 backdrop-blur">
						<div className="flex items-center gap-2 text-[12px] text-foreground/70">
							<HugeiconsIcon
								icon={MagicWand01Icon}
								size={13}
								strokeWidth={2}
								className="text-violet-500"
							/>
							<span className="font-medium tracking-tight">Chat</span>
							{providerLabel && (
								<>
									<span className="text-foreground/30">·</span>
									<span className="text-foreground/60">{providerLabel}</span>
								</>
							)}
						</div>
					</header>

					{/* Body */}
					<div
						ref={scrollRef}
						onScroll={handleScroll}
						className="flex-1 overflow-y-auto"
					>
						<div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-5">
							{empty && ready && (
								<EmptyState hasProvider={hasProvider} />
							)}

							{messages.map((m) => (
								<MessageBubble
									key={m.id}
									message={m}
									addToolApprovalResponse={addToolApprovalResponse}
								/>
							))}

							{(() => {
								const last = messages[messages.length - 1];
								const lastIsEmptyAssistant = last?.role === 'assistant'
									&& !last.parts?.some((p) => p.type === 'text' && p.text.length > 0);
								const showThinking =
									status === 'submitted'
									|| (status === 'streaming' && (last?.role === 'user' || lastIsEmptyAssistant));
								return showThinking ? (
									<div className="flex items-center gap-2 text-[12px] text-foreground/50">
										<Spinner className="size-3" />
										<span>Thinking…</span>
									</div>
								) : null;
							})()}

							{error && (
								<div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
									<HugeiconsIcon
										icon={AlertCircleIcon}
										size={14}
										className="mt-0.5 shrink-0"
									/>
									<div className="flex-1">
										<div className="font-medium">Something went wrong</div>
										<div className="opacity-80">{error.message}</div>
									</div>
									<Button
										size="xs"
										variant="outline"
										onClick={retry}
										className="border-destructive/30 text-destructive hover:bg-destructive/10"
									>
										<HugeiconsIcon icon={ArrowReloadHorizontalIcon} size={12} />
										Retry
									</Button>
								</div>
							)}
						</div>
					</div>

					{/* Composer */}
					<Composer
						value={input}
						onChange={setInput}
						onSubmit={submit}
						onStop={() => stop()}
						canSubmit={canSubmit}
						isStreaming={isStreaming}
						disabled={!hasProvider}
						placeholder={
							hasProvider
								? 'Send a message…'
								: 'Configure an AI provider in Settings to start chatting'
						}
					/>
				</div>
			</TooltipProvider>
		</div>
	);
}

function EmptyState({ hasProvider }: { hasProvider: boolean }) {
	return (
		<div className="mx-auto mt-12 flex max-w-md flex-col items-center gap-3 text-center">
			<div className="flex size-10 items-center justify-center rounded-full bg-foreground/5">
				<HugeiconsIcon
					icon={BotIcon}
					size={20}
					strokeWidth={1.75}
					className="text-foreground/60"
				/>
			</div>
			<div className="text-[14px] font-medium">How can I help?</div>
			{hasProvider ? (
				<div className="text-[12px] leading-relaxed text-foreground/60">
					Ask me to read a file, search your workspace, or run a command.
					<br />
					Try{' '}
					<code className="rounded bg-foreground/10 px-1 py-0.5 font-mono text-[11px]">
						/grep TODO
					</code>{' '}
					or{' '}
					<span className="italic">"summarise the README".</span>
				</div>
			) : (
				<div className="text-[12px] leading-relaxed text-foreground/60">
					No AI provider is configured. Open{' '}
					<span className="font-medium text-foreground/80">Settings → AI</span> to
					choose a provider.
				</div>
			)}
		</div>
	);
}
