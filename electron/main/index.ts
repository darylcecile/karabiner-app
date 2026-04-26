import { app, BrowserWindow, ipcMain, Menu, protocol, type MenuItemConstructorOptions } from 'electron/main'
import { isAbsolute, join, extname } from 'node:path'
import { stat, readFile } from 'node:fs/promises'
import { mainRelay } from './ipcMethods';
import { setUpAppDir } from "./fs";
import { closeDb } from './rag/db';
import { bootstrap as bootstrapRag } from './rag/indexer';
import { hideSearch, toggleSearch } from './searchWindow';
import { setupNativeEditingContextMenu } from './contextMenu';
import { clearRecentFiles, getRecentFiles, pruneMissingRecents, recentsEmitter } from './recents';
import { openChatWindow } from './chatWindow';
import { handleChatRequest } from './ai/chat/protocol-handler';
import { handleEditorAIRequest } from './ai/editor/protocol-handler';

// Register the asset protocol BEFORE app is ready so the renderer can use
// `karabiner-file://<absolute-path>` URLs in <img>, <video>, etc.
protocol.registerSchemesAsPrivileged([
	{
		scheme: 'karabiner-file',
		privileges: {
			standard: true,
			secure: true,
			supportFetchAPI: true,
			stream: true,
			bypassCSP: true,
		},
	},
	{
		scheme: 'karabiner-ai',
		privileges: {
			standard: true,
			secure: true,
			supportFetchAPI: true,
			stream: true,
			bypassCSP: true,
			corsEnabled: true,
		},
	},
]);

const VAULT_ROOT = join(process.env.HOME || process.env.USERPROFILE || '', '.karabiner', 'vault');

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
	'.mp4': 'video/mp4',
	'.webm': 'video/webm',
	'.mov': 'video/quicktime',
	'.mp3': 'audio/mpeg',
	'.wav': 'audio/wav',
	'.ogg': 'audio/ogg',
	'.pdf': 'application/pdf',
	'.json': 'application/json',
	'.txt': 'text/plain; charset=utf-8',
	'.md': 'text/markdown; charset=utf-8',
};

if (process.env.KARABINER_DEBUG_PORT) {
	const port = process.env.KARABINER_DEBUG_PORT;
	app.commandLine.appendSwitch('remote-debugging-port', port);
	app.commandLine.appendSwitch('remote-allow-origins', '*');
}

let settingsWindow: BrowserWindow | null = null;
let mainWindow: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
	if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
	return null;
}

function openSettingsWindow() {
	if (settingsWindow && !settingsWindow.isDestroyed()) {
		settingsWindow.focus();
		return;
	}

	settingsWindow = new BrowserWindow({
		width: 720,
		height: 480,
		minWidth: 600,
		minHeight: 400,
		resizable: true,
		maximizable: false,
		fullscreenable: false,
		titleBarStyle: 'hiddenInset',
		vibrancy: 'sidebar',
		title: 'Settings',
		webPreferences: {
			preload: join(__dirname, '../preload/index.js'),
			contextIsolation: true,
			nodeIntegration: false,
		},
	});

	if (process.env.ELECTRON_RENDERER_URL) {
		void settingsWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/settings.html`);
	} else {
		void settingsWindow.loadFile(join(__dirname, '../renderer/settings.html'));
	}

	settingsWindow.on('closed', () => {
		settingsWindow = null;
	});
}

function basenameOf(p: string): string {
	const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
	return idx >= 0 ? p.slice(idx + 1) : p;
}

function openInEditorFromMenu(absPath: string) {
	const mw = getMainWindow();
	if (mw && !mw.isDestroyed()) {
		mw.webContents.send('search:open-file', { path: absPath });
		if (mw.isMinimized()) mw.restore();
		mw.focus();
	}
}

function buildAppMenu() {
	const isMac = process.platform === 'darwin';
	const appName = app.name || 'Karabiner';

	const recents = getRecentFiles();
	const openRecentSubmenu: MenuItemConstructorOptions[] = recents.length === 0
		? [{ label: 'No Recent Files', enabled: false }]
		: [
			...recents.map((p) => ({
				label: basenameOf(p),
				toolTip: p,
				click: () => openInEditorFromMenu(p),
			} satisfies MenuItemConstructorOptions)),
			{ type: 'separator' as const },
			{
				label: 'Clear Recently Opened',
				click: () => {
					clearRecentFiles();
					buildAppMenu();
				},
			},
		];

	const template: MenuItemConstructorOptions[] = [
		...(isMac
			? [{
				label: appName,
				submenu: [
					{ role: 'about' as const },
					{ type: 'separator' as const },
					{
						label: 'Settings…',
						accelerator: 'CmdOrCtrl+,',
						click: () => openSettingsWindow(),
					},
					{ type: 'separator' as const },
					{ role: 'hide' as const },
					{ role: 'hideOthers' as const },
					{ role: 'unhide' as const },
					{ type: 'separator' as const },
					{ role: 'quit' as const },
				],
			}]
			: []),
		{
			label: 'File',
			submenu: [
				...(!isMac
					? [{
						label: 'Settings…',
						accelerator: 'CmdOrCtrl+,',
						click: () => openSettingsWindow(),
					},
					{ type: 'separator' as const }]
					: []),
				{
					label: 'Search',
					accelerator: 'CmdOrCtrl+K',
					click: () => toggleSearch(),
				},
				{
					label: 'Chat…',
					accelerator: 'CmdOrCtrl+Shift+J',
					click: () => openChatWindow(),
				},
				{ type: 'separator' as const },
				{
					label: 'Open Recent',
					submenu: openRecentSubmenu,
				},
				{ type: 'separator' as const },
				isMac ? { role: 'close' as const } : { role: 'quit' as const },
			],
		},
		{
			label: 'Edit',
			submenu: [
				{ role: 'undo' },
				{ role: 'redo' },
				{ type: 'separator' },
				{ role: 'cut' },
				{ role: 'copy' },
				{ role: 'paste' },
				{ role: 'selectAll' },
			],
		},
		{
			label: 'View',
			submenu: [
				{ role: 'reload' },
				{ role: 'forceReload' },
				{ role: 'toggleDevTools' },
				{ type: 'separator' },
				{ role: 'togglefullscreen' },
			],
		},
		{
			label: 'Window',
			submenu: [
				{ role: 'minimize' },
				{ role: 'zoom' },
				...(isMac
					? [
						{ type: 'separator' as const },
						{ role: 'front' as const },
					]
					: [{ role: 'close' as const }]),
			],
		},
		{
			role: 'help',
			submenu: [],
		},
	];

	const menu = Menu.buildFromTemplate(template);
	Menu.setApplicationMenu(menu);
}

async function createWindow() {
	const window = new BrowserWindow({
		width: 960,
		height: 680,
		titleBarStyle: 'hiddenInset',
		vibrancy: 'sidebar',
		backgroundMaterial: 'acrylic',
		trafficLightPosition: { x: 10, y: 10 },
		webPreferences: {
			preload: join(__dirname, '../preload/index.js'),
			contextIsolation: true,
			nodeIntegration: false,
			webviewTag: true,
		},
	})

	mainWindow = window;
	window.on('closed', () => {
		if (mainWindow === window) mainWindow = null;
		hideSearch();
	});

	// Deny popup windows. Route http(s) URLs into the in-app WebViewer via the
	// renderer's workspace.openUrl. This catches BlockNote's link click handler
	// (which calls window.open internally) and any other code paths that try
	// to open a new window.
	window.webContents.setWindowOpenHandler(({ url }) => {
		try {
			if (/^https?:\/\//i.test(url) && !window.isDestroyed()) {
				window.webContents.send('workspace:open-url', { url });
			}
		} catch {
			// no-op
		}
		return { action: 'deny' };
	});

	setupNativeEditingContextMenu(window);

	window.webContents.once('did-finish-load', () => {
		if (pendingOpenFiles.length === 0) return;
		for (const p of pendingOpenFiles.splice(0)) {
			window.webContents.send('search:open-file', { path: p });
		}
	});

	if (process.env.ELECTRON_RENDERER_URL) {
		await window.loadURL(process.env.ELECTRON_RENDERER_URL)
		return
	}

	await window.loadFile(join(__dirname, '../renderer/index.html'))
}

// macOS: receive paths from Dock recent docs / "Open With" / Finder. Queue any
// that arrive before the window exists; flush when ready.
const pendingOpenFiles: string[] = [];
app.on('open-file', (event, filePath) => {
	event.preventDefault();
	if (!filePath) return;
	const mw = getMainWindow();
	if (mw && !mw.isDestroyed()) {
		mw.webContents.send('search:open-file', { path: filePath });
		if (mw.isMinimized()) mw.restore();
		mw.focus();
	} else {
		pendingOpenFiles.push(filePath);
	}
});

app.whenReady().then(async () => {
	await setUpAppDir();

	// Serve `karabiner-file://...` from disk. We accept three URL shapes:
	//   1. karabiner-file:///%2Fabs%2Fpath        (absolute path, percent-encoded into pathname)
	//   2. karabiner-file:///abs/path             (absolute path, raw — host empty)
	//   3. karabiner-file:///vault-relative/path  (resolved against the vault root)
	// Whatever is decoded is first tried as an absolute path; if that misses we
	// fall back to resolving it against the vault root.
	protocol.handle('karabiner-file', async (request) => {
		try {
			const url = new URL(request.url);
			// Reconstruct the original "thing after the scheme". Host is usually
			// empty (triple-slash form) but if present we treat it as the first
			// segment of a vault-relative path.
			const hostPart = url.host ? decodeURIComponent(url.host) : '';
			const pathPart = decodeURIComponent(url.pathname || '');
			let raw = hostPart ? `${hostPart}${pathPart}` : pathPart;

			// Resolve an absolute candidate first, then a vault-relative fallback.
			const candidates: string[] = [];
			if (isAbsolute(raw)) {
				candidates.push(raw);
				// If raw was already absolute it might still actually be a vault
				// asset whose path was naively prefixed with `/`. Try that too.
				candidates.push(join(VAULT_ROOT, raw.replace(/^\/+/, '')));
			} else {
				if (raw.startsWith('/')) raw = raw.slice(1);
				candidates.push(join(VAULT_ROOT, raw));
			}

			let resolved: string | null = null;
			let st: Awaited<ReturnType<typeof stat>> | null = null;
			for (const c of candidates) {
				try {
					const s = await stat(c);
					if (s.isFile()) {
						resolved = c;
						st = s;
						break;
					}
				} catch {
					// keep trying
				}
			}

			if (!resolved || !st) {
				console.warn('[karabiner-file] not found:', request.url, 'tried:', candidates);
				return new Response('Not found', { status: 404 });
			}

			const ext = extname(resolved).toLowerCase();
			const type = MIME_BY_EXT[ext] ?? 'application/octet-stream';
			const buf = await readFile(resolved);
			return new Response(buf, {
				status: 200,
				headers: {
					'Content-Type': type,
					'Content-Length': String(st.size),
					'Cache-Control': 'no-cache',
					'Access-Control-Allow-Origin': '*',
				},
			});
		} catch (err) {
			console.error('[karabiner-file] handler failed:', err);
			return new Response(`Error: ${err instanceof Error ? err.message : String(err)}`, { status: 500 });
		}
	});

	// Streaming chat endpoint backed by the active AI provider. The renderer's
	// `useChat` hook talks to `karabiner-ai://chat` via DefaultChatTransport;
	// this handler returns a UI message stream Response.
	protocol.handle('karabiner-ai', async (request) => {
		try {
			const url = new URL(request.url);
			if (url.host === 'editor') {
				return await handleEditorAIRequest(request);
			}
			return await handleChatRequest(request);
		} catch (err) {
			console.error('[karabiner-ai] handler failed:', err);
			return new Response(`Error: ${err instanceof Error ? err.message : String(err)}`, { status: 500 });
		}
	});

	bootstrapRag().catch((err) => {
		console.error('rag bootstrap failed:', err);
	});

	mainRelay.attach(ipcMain);

	pruneMissingRecents();
	buildAppMenu();
	recentsEmitter.on('changed', () => buildAppMenu());

	void createWindow()

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			void createWindow()
		}
	})
});

app.on('before-quit', () => {
	void closeDb();
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit()
	}
});


