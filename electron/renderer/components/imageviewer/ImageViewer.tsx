import { useCallback, useEffect, useRef, useState } from 'react';
import {
	TransformComponent,
	TransformWrapper,
	type ReactZoomPanPinchRef,
} from 'react-zoom-pan-pinch';
import { toast } from 'sonner';

import { main } from '@/renderer/relay';
import { cn } from '@/shared/utils';

const MIME_BY_EXT: Record<string, string> = {
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.svg': 'image/svg+xml',
	'.bmp': 'image/bmp',
	'.ico': 'image/x-icon',
	'.heic': 'image/heic',
	'.heif': 'image/heif',
	'.avif': 'image/avif',
	'.tiff': 'image/tiff',
	'.tif': 'image/tiff',
};

function getExt(p: string): string {
	const lower = p.toLowerCase();
	const dot = lower.lastIndexOf('.');
	return dot >= 0 ? lower.slice(dot) : '';
}

function getMime(p: string): string {
	return MIME_BY_EXT[getExt(p)] ?? 'application/octet-stream';
}

function basename(p: string): string {
	const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
	return idx >= 0 ? p.slice(idx + 1) : p;
}

function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes < 0) return '—';
	if (bytes < 1024) return `${bytes} B`;
	const units = ['KB', 'MB', 'GB', 'TB'];
	let value = bytes / 1024;
	let unitIdx = 0;
	while (value >= 1024 && unitIdx < units.length - 1) {
		value /= 1024;
		unitIdx++;
	}
	return `${value.toFixed(value < 10 ? 2 : value < 100 ? 1 : 0)} ${units[unitIdx]}`;
}

type Status = 'loading' | 'ready' | 'error';

type Meta = {
	width: number;
	height: number;
	bytes: number;
};

export function ImageViewer({ path }: { path: string }): React.ReactElement {
	const [status, setStatus] = useState<Status>('loading');
	const [errorMsg, setErrorMsg] = useState<string>('');
	const [dataUrl, setDataUrl] = useState<string>('');
	const [meta, setMeta] = useState<Meta | null>(null);
	const transformRef = useRef<ReactZoomPanPinchRef | null>(null);
	const containerRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (!path) {
			setStatus('error');
			return;
		}
		let cancelled = false;
		setStatus('loading');
		setErrorMsg('');
		setDataUrl('');
		setMeta(null);

		(async () => {
			try {
				const base64 = (await main.readFile(path, 'base64')) as unknown as string;
				if (cancelled) return;
				const mime = getMime(path);
				const url = `data:${mime};base64,${base64}`;
				// Approximate decoded byte length from base64 string.
				const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
				const bytes = Math.max(0, Math.floor((base64.length * 3) / 4) - padding);

				const img = new Image();
				img.onload = () => {
					if (cancelled) return;
					setMeta({ width: img.naturalWidth, height: img.naturalHeight, bytes });
					setDataUrl(url);
					setStatus('ready');
				};
				img.onerror = () => {
					if (cancelled) return;
					const msg = 'Failed to decode image';
					setStatus('error');
					setErrorMsg(msg);
					toast.error(msg);
				};
				img.src = url;
			} catch (err) {
				if (cancelled) return;
				const msg = err instanceof Error ? err.message : String(err);
				setStatus('error');
				setErrorMsg(msg);
				toast.error(`Failed to read image: ${msg}`);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [path]);

	// Prevent the page from scrolling while zooming over the viewer.
	useEffect(() => {
		const node = containerRef.current;
		if (!node) return;
		const handler = (e: WheelEvent) => {
			e.preventDefault();
		};
		node.addEventListener('wheel', handler, { passive: false });
		return () => {
			node.removeEventListener('wheel', handler);
		};
	}, []);

	const handleReset = useCallback(() => {
		const ref = transformRef.current;
		if (!ref) return;
		ref.resetTransform();
		ref.centerView(1, 0);
	}, []);

	const handleZoomIn = useCallback(() => {
		transformRef.current?.zoomIn();
	}, []);

	const handleZoomOut = useCallback(() => {
		transformRef.current?.zoomOut();
	}, []);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.target instanceof HTMLElement) {
				const tag = e.target.tagName;
				if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
			}
			if (e.key === '0') {
				e.preventDefault();
				handleReset();
			} else if (e.key === '+' || e.key === '=') {
				e.preventDefault();
				handleZoomIn();
			} else if (e.key === '-' || e.key === '_') {
				e.preventDefault();
				handleZoomOut();
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [handleReset, handleZoomIn, handleZoomOut]);

	if (!path) {
		return (
			<div className="absolute inset-0 flex items-center justify-center text-foreground/60">
				No image selected
			</div>
		);
	}

	if (status === 'loading') {
		return (
			<div className="absolute inset-0 flex items-center justify-center text-foreground/60">
				Loading image…
			</div>
		);
	}

	if (status === 'error') {
		return (
			<div className="absolute inset-0 flex items-center justify-center text-destructive">
				Failed to load image: {errorMsg}
			</div>
		);
	}

	const name = basename(path);
	const dims = meta ? `${meta.width} × ${meta.height}` : '—';
	const size = meta ? formatBytes(meta.bytes) : '—';

	return (
		<div
			ref={containerRef}
			className={cn(
				'absolute inset-0 overflow-hidden',
				'bg-muted/40',
				'[background-image:radial-gradient(circle_at_1px_1px,theme(colors.foreground/0.06)_1px,transparent_0)]',
				'[background-size:16px_16px]',
			)}
		>
			<TransformWrapper
				ref={transformRef}
				initialScale={1}
				minScale={0.05}
				maxScale={20}
				centerOnInit
				wheel={{ step: 0.15 }}
				pinch={{ step: 5 }}
				doubleClick={{ mode: 'reset' }}
				limitToBounds={false}
				panning={{ velocityDisabled: true }}
			>
				<TransformComponent
					wrapperClass="!w-full !h-full"
					contentClass="!w-full !h-full flex items-center justify-center"
				>
					<img
						src={dataUrl}
						alt={name}
						draggable={false}
						className="max-w-[calc(100%-2rem)] max-h-[calc(100%-2rem)] select-none"
					/>
				</TransformComponent>
			</TransformWrapper>

			<div className="pointer-events-none absolute top-8 left-2 z-10 rounded-md border border-border bg-card/90 px-2 py-1 text-xs text-foreground/80 shadow-sm">
				<div className="font-medium truncate max-w-[40ch]">{name}</div>
				<div className="text-foreground/60">
					{dims} · {size}
				</div>
			</div>

			<div className="absolute top-8 right-2 z-10 flex gap-1">
				<button
					type="button"
					onClick={handleZoomOut}
					className="rounded-md border border-border bg-card/90 px-2 py-1 text-xs text-foreground/80 hover:bg-card"
					title="Zoom out (-)"
				>
					−
				</button>
				<button
					type="button"
					onClick={handleZoomIn}
					className="rounded-md border border-border bg-card/90 px-2 py-1 text-xs text-foreground/80 hover:bg-card"
					title="Zoom in (+)"
				>
					+
				</button>
				<button
					type="button"
					onClick={handleReset}
					className="rounded-md border border-border bg-card/90 px-2 py-1 text-xs text-foreground/80 hover:bg-card"
					title="Reset / fit (0)"
				>
					Fit
				</button>
			</div>
		</div>
	);
}
