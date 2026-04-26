import type { CanvasColor } from '@/shared/canvasTypes';

const PRESETS: Record<string, string> = {
	'1': '#e93147',
	'2': '#ec7500',
	'3': '#e0ac00',
	'4': '#08b94e',
	'5': '#00bfbc',
	'6': '#7852ee',
};

const NEUTRAL = '#9ca3af';

export function resolveCanvasColor(color: CanvasColor | undefined, fallback: string = NEUTRAL): string {
	if (!color) return fallback;
	if (PRESETS[color]) return PRESETS[color];
	if (color.startsWith('#')) return color;
	return fallback;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
	const m = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex);
	if (!m) return null;
	let h = m[1];
	if (h.length === 3) h = h.split('').map((c) => c + c).join('');
	const num = parseInt(h, 16);
	return { r: (num >> 16) & 0xff, g: (num >> 8) & 0xff, b: num & 0xff };
}

export function colorWithAlpha(color: CanvasColor | undefined, alpha: number): string {
	const resolved = resolveCanvasColor(color, NEUTRAL);
	const rgb = hexToRgb(resolved);
	if (!rgb) return `rgba(156, 163, 175, ${alpha})`;
	return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}
