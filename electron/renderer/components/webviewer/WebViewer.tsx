import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { HugeiconsIcon } from '@hugeicons/react';
import {
	ArrowLeft02Icon,
	ArrowRight02Icon,
	RefreshIcon,
	LinkSquare02Icon,
	CancelIcon,
} from '@hugeicons/core-free-icons';

import { cn } from '@/shared/utils';
import { main } from '@/renderer/relay';

type WebviewElement = HTMLElement & {
	src: string;
	goBack(): void;
	goForward(): void;
	reload(): void;
	stop(): void;
	canGoBack(): boolean;
	canGoForward(): boolean;
	getURL(): string;
};

type DidNavigateEvent = Event & { url: string };
type NewWindowEvent = Event & { url: string };

type WebViewerProps = {
	url: string;
};

function isAllowedUrl(raw: string): { ok: true; href: string } | { ok: false; reason: string } {
	if (!raw) return { ok: false, reason: 'empty' };
	let parsed: URL;
	try {
		parsed = new URL(raw);
	} catch {
		return { ok: false, reason: 'Invalid URL' };
	}
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		return { ok: false, reason: `Unsupported protocol: ${parsed.protocol}` };
	}
	return { ok: true, href: parsed.toString() };
}

function truncateUrl(url: string, max = 80): string {
	if (url.length <= max) return url;
	return url.slice(0, max - 1) + '…';
}

export function WebViewer({ url }: WebViewerProps): React.ReactElement {
	const ref = useRef<WebviewElement | null>(null);
	const [currentUrl, setCurrentUrl] = useState<string>(url);
	const [loading, setLoading] = useState<boolean>(false);
	const [canBack, setCanBack] = useState<boolean>(false);
	const [canForward, setCanForward] = useState<boolean>(false);

	const validation = isAllowedUrl(url);
	const validatedHref = validation.ok ? validation.href : '';

	async function openInBrowser(target: string): Promise<void> {
		const check = isAllowedUrl(target);
		if (!check.ok) {
			toast.error(`Cannot open URL: ${check.reason}`);
			return;
		}
		try {
			const res = await main.openExternal(check.href);
			if ('error' in res && res.error) {
				toast.error(`Failed to open in browser: ${res.error}`);
			}
		} catch (err) {
			toast.error(`Failed to open in browser: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	useEffect(() => {
		const el = ref.current;
		if (!el) return;

		const updateNavState = (): void => {
			try {
				setCanBack(el.canGoBack());
				setCanForward(el.canGoForward());
			} catch {
				// webview not ready yet
			}
		};

		const onStartLoad = (): void => setLoading(true);
		const onStopLoad = (): void => {
			setLoading(false);
			updateNavState();
		};
		const onNavigate = (e: Event): void => {
			const navEvent = e as DidNavigateEvent;
			if (navEvent.url) setCurrentUrl(navEvent.url);
			updateNavState();
		};
		const onNewWindow = (e: Event): void => {
			const nw = e as NewWindowEvent;
			e.preventDefault();
			if (nw.url) void openInBrowser(nw.url);
		};
		const onDomReady = (): void => updateNavState();

		el.addEventListener('did-start-loading', onStartLoad);
		el.addEventListener('did-stop-loading', onStopLoad);
		el.addEventListener('did-navigate', onNavigate);
		el.addEventListener('did-navigate-in-page', onNavigate);
		el.addEventListener('new-window', onNewWindow);
		el.addEventListener('dom-ready', onDomReady);

		return () => {
			el.removeEventListener('did-start-loading', onStartLoad);
			el.removeEventListener('did-stop-loading', onStopLoad);
			el.removeEventListener('did-navigate', onNavigate);
			el.removeEventListener('did-navigate-in-page', onNavigate);
			el.removeEventListener('new-window', onNewWindow);
			el.removeEventListener('dom-ready', onDomReady);
		};
	}, []);

	useEffect(() => {
		if (!validatedHref) return;
		const el = ref.current;
		if (!el) return;
		try {
			if (el.getURL && el.getURL() === validatedHref) return;
		} catch {
			// ignore — webview may not be attached yet
		}
		el.src = validatedHref;
		setCurrentUrl(validatedHref);
	}, [validatedHref]);

	if (!url) {
		return (
			<div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
				No URL loaded
			</div>
		);
	}

	if (!validation.ok) {
		return (
			<div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
				<div className="text-sm font-medium">Cannot display this link</div>
				<div className="text-xs text-muted-foreground">{validation.reason}</div>
				<div className="text-xs text-muted-foreground break-all max-w-md" title={url}>
					{truncateUrl(url, 200)}
				</div>
			</div>
		);
	}

	return (
		<div className="absolute inset-0 flex flex-col">
			<div
				className={cn(
					'h-9 shrink-0 flex flex-row items-center gap-1 px-2',
					'bg-card/95 border-b border-border',
				)}
			>
				<button
					type="button"
					aria-label="Back"
					title="Back"
					disabled={!canBack}
					onClick={() => ref.current?.goBack()}
					className={cn(
						'inline-flex items-center justify-center size-7 rounded-md',
						'hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent',
					)}
				>
					<HugeiconsIcon icon={ArrowLeft02Icon} strokeWidth={1.5} width={16} height={16} />
				</button>
				<button
					type="button"
					aria-label="Forward"
					title="Forward"
					disabled={!canForward}
					onClick={() => ref.current?.goForward()}
					className={cn(
						'inline-flex items-center justify-center size-7 rounded-md',
						'hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent',
					)}
				>
					<HugeiconsIcon icon={ArrowRight02Icon} strokeWidth={1.5} width={16} height={16} />
				</button>
				{loading ? (
					<button
						type="button"
						aria-label="Stop"
						title="Stop"
						onClick={() => ref.current?.stop()}
						className="inline-flex items-center justify-center size-7 rounded-md hover:bg-accent"
					>
						<HugeiconsIcon icon={CancelIcon} strokeWidth={1.5} width={16} height={16} />
					</button>
				) : (
					<button
						type="button"
						aria-label="Reload"
						title="Reload"
						onClick={() => ref.current?.reload()}
						className="inline-flex items-center justify-center size-7 rounded-md hover:bg-accent"
					>
						<HugeiconsIcon icon={RefreshIcon} strokeWidth={1.5} width={16} height={16} />
					</button>
				)}
				<div
					className="flex-1 min-w-0 mx-1 text-xs text-muted-foreground truncate select-text"
					title={currentUrl}
				>
					{truncateUrl(currentUrl, 200)}
				</div>
				<button
					type="button"
					aria-label="Open in browser"
					title="Open in default browser"
					onClick={() => void openInBrowser(currentUrl)}
					className="inline-flex items-center justify-center size-7 rounded-md hover:bg-accent"
				>
					<HugeiconsIcon icon={LinkSquare02Icon} strokeWidth={1.5} width={16} height={16} />
				</button>
			</div>
			<div className="relative flex-1 w-full">
				{loading ? (
					<div className="absolute top-0 left-0 right-0 h-0.5 z-10 overflow-hidden bg-border">
						<div className="h-full w-1/3 bg-primary animate-pulse" />
					</div>
				) : null}
				<webview
					ref={ref as unknown as React.RefObject<HTMLElement>}
					src={validatedHref}
					partition="persist:webviewer"
					allowpopups={false}
					webpreferences="contextIsolation=yes, sandbox=yes, nodeIntegration=no"
					className="w-full h-full"
					style={{ display: 'inline-flex', width: '100%', height: '100%' }}
				/>
			</div>
		</div>
	);
}
