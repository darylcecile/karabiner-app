import { app, BrowserWindow, ipcMain } from 'electron/main'
import { join } from 'node:path'
import { mainRelay } from './ipcMethods';
import { setUpAppDir } from "./fs";

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
	
	mainRelay.attach(ipcMain);

	void createWindow()

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			void createWindow()
		}
	})
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit()
	}
});
