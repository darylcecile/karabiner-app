// Maps a file path to the view that should render it. Centralised so the
// workbench, layout, and image-viewer all agree.

export const IMAGE_EXTS = new Set([
	'.png',
	'.jpg',
	'.jpeg',
	'.gif',
	'.webp',
	'.svg',
	'.bmp',
	'.ico',
	'.heic',
	'.heif',
	'.avif',
	'.tiff',
	'.tif',
]);

export type FileViewKind = 'editor' | 'canvas' | 'image';

export function getFileViewKind(path: string): FileViewKind {
	const lower = path.toLowerCase();
	if (lower.endsWith('.canvas')) return 'canvas';
	const dot = lower.lastIndexOf('.');
	if (dot >= 0) {
		const ext = lower.slice(dot);
		if (IMAGE_EXTS.has(ext)) return 'image';
	}
	return 'editor';
}

export function isImagePath(path: string): boolean {
	return getFileViewKind(path) === 'image';
}
