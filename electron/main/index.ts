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

	ipcMain.handle('fs:read', async (event, path) => {
		const fs = await import('fs/promises');
		return fs.readFile(path, 'utf-8');
	});
	ipcMain.handle('fs:readBinary', async (event, path) => {
		const fs = await import('fs/promises');
		return fs.readFile(path);
	});
	ipcMain.handle('fs:write', async (event, path, content) => {
		const fs = await import('fs/promises');
		await fs.writeFile(path, content, 'utf-8');
	});
	ipcMain.handle('fs:writeBinary', async (event, path, content) => {
		const fs = await import('fs/promises');
		await fs.writeFile(path, Buffer.from(content));
	});
	ipcMain.handle('fs:delete', async (event, path) => {
		const fs = await import('fs/promises');
		await fs.unlink(path);
	});
	ipcMain.handle('fs:exists', async (event, path) => {
		const fs = await import('fs/promises');
		try {
			await fs.access(path);
			return true;
		} catch {
			return false;
		}
	});
	ipcMain.handle('fs:mkdir', async (event, path) => {
		const fs = await import('fs/promises');
		await fs.mkdir(path, { recursive: true });
	});
	ipcMain.handle('fs:rmdir', async (event, path) => {
		const fs = await import('fs/promises');
		await fs.rmdir(path);
	});
	ipcMain.handle('fs:readdir', async (event, path) => {
		const fs = await import('fs/promises');
		return fs.readdir(path);
	});
	ipcMain.handle('fs:stat', async (event, path) => {
		const fs = await import('fs/promises');
		const stats = await fs.stat(path);
		return {
			isFile: stats.isFile(),
			isDirectory: stats.isDirectory(),
			isSymbolicLink: stats.isSymbolicLink(),
			size: stats.size,
			mtimeMs: stats.mtimeMs,
		};
	});
	ipcMain.on('query-sync', (event, args) => {
		if (args[0] === 'platform') {
			const platform = process.platform;
			switch (platform) {
				case 'darwin':
					event.returnValue = 'darwin';
					break;
				case 'win32':
					event.returnValue = 'win32';
					break;
				case 'linux':
					event.returnValue = 'linux';
					break;
				default:
					event.returnValue = 'unknown';
			}
			return;
		}
		if (args[0] === 'homeDir') {
			event.returnValue = process.env.HOME || process.env.USERPROFILE || '';
			return;
		}
		event.returnValue = 'unknown';
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
