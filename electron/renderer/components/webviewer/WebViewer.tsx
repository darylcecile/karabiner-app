import { useEffect, useRef, useState } from 'react';
import { cn } from '@/shared/utils';
import { useWorkbench } from '@/renderer/components/workbench/Workbench';
import { main } from '@/renderer/relay';

type WebviewElement = HTMLElement & {
	src: string;
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
	const { workspace } = useWorkbench();
	const ref = useRef<WebviewElement | null>(null);
	const [loading, setLoading] = useState<boolean>(false);

	const validation = isAllowedUrl(url);
	const validatedHref = validation.ok ? validation.href : '';

	const setUrlViewCurrentUrl = workspace.setUrlViewCurrentUrl;

	useEffect(() => {
		const el = ref.current;
		if (!el) return;

		const onStartLoad = (): void => setLoading(true);
		const onStopLoad = (): void => setLoading(false);
		const onNavigate = (e: Event): void => {
			const navEvent = e as DidNavigateEvent;
			if (navEvent.url) setUrlViewCurrentUrl(navEvent.url);
		};
		const onNewWindow = (e: Event): void => {
			const nw = e as NewWindowEvent;
			e.preventDefault();
			if (nw.url) {
				void main.openExternal(nw.url).catch(() => { /* noop */ });
			}
		};

		el.addEventListener('did-start-loading', onStartLoad);
		el.addEventListener('did-stop-loading', onStopLoad);
		el.addEventListener('did-navigate', onNavigate);
		el.addEventListener('did-navigate-in-page', onNavigate);
		el.addEventListener('new-window', onNewWindow);

		return () => {
			el.removeEventListener('did-start-loading', onStartLoad);
			el.removeEventListener('did-stop-loading', onStopLoad);
			el.removeEventListener('did-navigate', onNavigate);
			el.removeEventListener('did-navigate-in-page', onNavigate);
			el.removeEventListener('new-window', onNewWindow);
		};
	}, [setUrlViewCurrentUrl]);

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
		<div className="absolute inset-0">
			<div className="border-b border-border h-8.5 w-full bg-background"/>
			{loading ? (
				<div className={cn('absolute top-0 left-0 right-0 h-0.5 z-10 overflow-hidden bg-border')}>
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
	);
}
