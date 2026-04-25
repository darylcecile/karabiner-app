import { app, BrowserWindow, ipcMain, Menu, type MenuItemConstructorOptions } from 'electron/main'
import { join } from 'node:path'
import { mainRelay } from './ipcMethods';
import { setUpAppDir } from "./fs";
import { closeDb } from './rag/db';
import { bootstrap as bootstrapRag } from './rag/indexer';

if (process.env.KARABINER_DEBUG_PORT) {
	const port = process.env.KARABINER_DEBUG_PORT;
	app.commandLine.appendSwitch('remote-debugging-port', port);
	app.commandLine.appendSwitch('remote-allow-origins', '*');
}

let settingsWindow: BrowserWindow | null = null;

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

function buildAppMenu() {
	const isMac = process.platform === 'darwin';
	const appName = app.name || 'Karabiner';

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
		},
	})

	if (process.env.ELECTRON_RENDERER_URL) {
		await window.loadURL(process.env.ELECTRON_RENDERER_URL)
		return
	}

	await window.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(async () => {
	await setUpAppDir();

	bootstrapRag().catch((err) => {
		console.error('rag bootstrap failed:', err);
	});

	mainRelay.attach(ipcMain);

	buildAppMenu();

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
