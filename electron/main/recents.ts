import { app, BrowserWindow } from 'electron';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { getConfig, setConfig } from './config';

const MAX_RECENTS = 10;

export const recentsEmitter = new EventEmitter();

function resolveAbs(p: string): string {
	if (!p) return '';
	if (p.startsWith('~')) {
		return path.join(process.env.HOME || process.env.USERPROFILE || '', p.slice(1));
	}
	return path.resolve(p);
}

export function getRecentFiles(): string[] {
	const list = getConfig('recentFiles') as unknown as string[] | undefined;
	if (!Array.isArray(list)) return [];
	return list.filter((p) => typeof p === 'string' && p.length > 0);
}

export function addRecentFile(absPath: string): string[] {
	const resolved = resolveAbs(absPath);
	if (!resolved) return getRecentFiles();
	const existing = getRecentFiles().filter((p) => p !== resolved);
	const next = [resolved, ...existing].slice(0, MAX_RECENTS);
	setConfig('recentFiles', next);
	try {
		// OS-level integration: macOS dock recent items + Windows JumpList.
		app.addRecentDocument(resolved);
	} catch {
		// no-op
	}
	broadcast(next);
	return next;
}

export function clearRecentFiles(): string[] {
	setConfig('recentFiles', []);
	try {
		app.clearRecentDocuments();
	} catch {
		// no-op
	}
	broadcast([]);
	return [];
}

export function pruneMissingRecents(): string[] {
	const current = getRecentFiles();
	const filtered = current.filter((p) => existsSync(p));
	if (filtered.length !== current.length) {
		setConfig('recentFiles', filtered);
		broadcast(filtered);
	}
	return filtered;
}

function broadcast(list: string[]) {
	for (const win of BrowserWindow.getAllWindows()) {
		if (!win.isDestroyed()) {
			win.webContents.send('recents:changed', { recentFiles: list });
		}
	}
	recentsEmitter.emit('changed', list);
}
