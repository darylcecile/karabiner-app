import { ipcMain } from 'electron';
import crypto from "node:crypto";
import { activeScans, readDirectoryImpl, ReadDirectoryOptions, runScan, ScanOptions } from './fs';
import { getConfig, readConfig, setConfig } from './config';
import { getPreferences, setPreferences } from './preferences';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';


function resolvePath(p: string): string {
	if (p.startsWith("~")) {
		return path.join(process.env.HOME || process.env.USERPROFILE || "", p.slice(1));
	}
	return path.resolve(p);
}


export function defineMainMethods() {
	ipcMain.on('query-sync', querySync);

	ipcMain.on('config', (_event, key: string, value?: any) => {
		if (value === undefined) {
			if (key === '') {
				_event.returnValue = readConfig();
				return;
			}
			_event.returnValue = getConfig(key);
			return;
		}
		setConfig(key, value);
	});

	ipcMain.on('preferences', (_event, key: string, value?: any) => {
		if (value === undefined) {
			_event.returnValue = getPreferences(key);
		} else {
			setPreferences(key, value);
		}
	});

	ipcMain.handle("fs:readDirectory", async (_event, dirPath: string, options?: ReadDirectoryOptions) => {
		return readDirectoryImpl(resolvePath(dirPath), options);
	});

	ipcMain.handle("fs:startScan", async (event, rootPath: string, options?: ScanOptions) => {
		const scanId = crypto.randomUUID();
		activeScans.set(scanId, {
			cancelled: false,
			webContentsId: event.sender.id,
		});

		void runScan(scanId, resolvePath(rootPath), options ?? {});
		return scanId;
	});

	ipcMain.handle("fs:cancelScan", async (_event, scanId: string) => {
		const scan = activeScans.get(scanId);
		if (scan) scan.cancelled = true;
		return true;
	});

	ipcMain.handle("fs:createFile", async (_e, filePath: string) => {
		const absPath = resolvePath(filePath);
		await mkdir(path.dirname(absPath), { recursive: true });
		await writeFile(absPath, "");
		return true;
	});

	ipcMain.handle("fs:createDirectory", async (_e, dirPath: string) => {
		await mkdir(resolvePath(dirPath), { recursive: true });
		return true;
	});

	ipcMain.handle("fs:rename", async (_e, oldPath: string, newPath: string) => {
		await rename(resolvePath(oldPath), resolvePath(newPath));
		return true;
	});

	ipcMain.handle("fs:delete", async (_e, targetPath: string) => {
		await rm(resolvePath(targetPath), { recursive: true, force: true });
		return true;
	});
}

export async function setUpAppDir() {
	const vaultPath = '~/.karabiner/vault';
	const assetPath = '~/.karabiner/assets';
	
	const absVaultPath = vaultPath.replace("~", process.env.HOME || "");
	const absAssetPath = assetPath.replace("~", process.env.HOME || "");

	await mkdir(absVaultPath, { recursive: true });
	await mkdir(absAssetPath, { recursive: true });
}


// MARK methods

function querySync(event: Electron.IpcMainEvent, propertyName: string) {
	if (propertyName === 'platform') {
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
	if (propertyName === 'homeDir') {
		event.returnValue = process.env.HOME || process.env.USERPROFILE || '';
		return;
	}
	console.log('Unknown sync query:', propertyName);
	event.returnValue = 'unknown';
}
