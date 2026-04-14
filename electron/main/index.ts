import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'

const createWindow = async () => {
	const window = new BrowserWindow({
		width: 960,
		height: 680,
		titleBarStyle: 'hiddenInset',
		vibrancy: 'under-window',
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

app.whenReady().then(() => {
	ipcMain.handle('ping', () => 'pong');
	ipcMain.handle('getPlatform', () => {
		const platform = process.platform;
		switch (platform) {
			case 'darwin':
				return 'darwin';
			case 'win32':
				return 'win32';
			case 'linux':
				return 'linux';
			default:
				return 'unknown';
		}
	});


	void createWindow()

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			void createWindow()
		}
	})
})

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
		app.quit()
	}
})
