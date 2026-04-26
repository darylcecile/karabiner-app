import { app, BrowserWindow, ipcMain, Menu, net, protocol, type MenuItemConstructorOptions } from 'electron/main'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { mainRelay } from './ipcMethods';
import { setUpAppDir } from "./fs";
import { closeDb } from './rag/db';
import { bootstrap as bootstrapRag } from './rag/indexer';
import { hideSearch, toggleSearch } from './searchWindow';
import { setupNativeEditingContextMenu } from './contextMenu';
import { clearRecentFiles, getRecentFiles, pruneMissingRecents, recentsEmitter } from './recents';

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
]);

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

	// Serve `karabiner-file://<encoded-abs-path>` from disk. The host carries the
	// absolute path (URL-encoded); pathname is "/" or empty.
	protocol.handle('karabiner-file', async (request) => {
		try {
			const url = new URL(request.url);
			// Format: karabiner-file:///<encoded-abs-path>
			// host is empty, pathname holds the encoded path.
			const encoded = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
			const absPath = decodeURIComponent(encoded);
			if (!absPath) return new Response('Not found', { status: 404 });
			return await net.fetch(pathToFileURL(absPath).toString());
		} catch (err) {
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
