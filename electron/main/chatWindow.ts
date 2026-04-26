import { app, BrowserWindow } from 'electron/main';
import { join } from 'node:path';

let chatWindow: BrowserWindow | null = null;

export function getChatWindow(): BrowserWindow | null {
	if (chatWindow && !chatWindow.isDestroyed()) return chatWindow;
	return null;
}

export function openChatWindow() {
	if (chatWindow && !chatWindow.isDestroyed()) {
		chatWindow.focus();
		return;
	}

	chatWindow = new BrowserWindow({
		width: 760,
		height: 720,
		minWidth: 480,
		minHeight: 480,
		titleBarStyle: 'hiddenInset',
		vibrancy: 'sidebar',
		backgroundMaterial: 'acrylic',
		title: `${app.name || 'Karabiner'} Chat`,
		trafficLightPosition: { x: 10, y: 10 },
		webPreferences: {
			preload: join(__dirname, '../preload/index.js'),
			contextIsolation: true,
			nodeIntegration: false,
		},
	});

	if (process.env.ELECTRON_RENDERER_URL) {
		void chatWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/chat.html`);
	} else {
		void chatWindow.loadFile(join(__dirname, '../renderer/chat.html'));
	}

	chatWindow.on('closed', () => {
		chatWindow = null;
	});
}
