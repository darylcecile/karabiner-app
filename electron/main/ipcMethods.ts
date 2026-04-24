import { ipcMain } from 'electron';
import crypto from "node:crypto";
import { activeScans, readDirectoryImpl, ReadDirectoryOptions, runScan, ScanOptions } from './fs';
import { getConfig, readConfig, setConfig } from './config';
import { getPreferences, setPreferences } from './preferences';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { FSReplay } from './vaultTemplates';
import { isBinaryFile } from '@/main/files';


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

	ipcMain.handle("fs:isBinaryFile", async (_event, filePath: string) => {
		const absPath = resolvePath(filePath);
		return isBinaryFile(absPath);
	});

	ipcMain.handle("fs:readFile", async (_event, filePath: string, encoding: BufferEncoding = "utf-8") => {
		const absPath = resolvePath(filePath);
		return await readFile(absPath, { encoding });
	});

	ipcMain.handle("fs:writeFile", async (_event, filePath: string, content: string, encoding: BufferEncoding = "utf-8") => {
		const absPath = resolvePath(filePath);
		await mkdir(path.dirname(absPath), { recursive: true });
		await writeFile(absPath, content, { encoding });
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

	if (!existsSync(absVaultPath)) {
		const defaultActions = FSReplay.defineOperations([
			{ type: 'createDirectory', path: absVaultPath },
			{ type: 'createDirectory', path: path.join(absVaultPath, 'Notes') },
			{ type: 'metadata', path: path.join(absVaultPath, 'Notes'), metadata: { icon: 'archive', tint: 'green' } },
			{
				type: 'createFile',
				path: path.join(absVaultPath, 'Notes', 'welcome.md'),
				content: '# Welcome to Karabiner\n\nThis is your vault. Start by creating a new file or folder!'
			},
			{
				type: 'createFile',
				path: path.join(absVaultPath, 'Notes', 'why-karabiner.md'),
				content: '# Why Karabiner?\n\nKarabiner is designed to be a simple, local-first knowledge base that helps you organize your thoughts and ideas without the overhead of more complex tools. It’s perfect for:\n\n- **Personal Notes**: Jot down quick thoughts, ideas, or reminders.\n- **Project Planning**: Keep track of project details, to-dos, and resources.\n- **Learning and Research**: Collect information, links, and insights in one place.\n\nKarabiner focuses on simplicity and speed, making it easy to capture and access your information whenever you need it.'
			},
			{ type: 'createDirectory', path: path.join(absVaultPath, 'Projects') },
			{ type: 'metadata', path: path.join(absVaultPath, 'Projects'), metadata: { icon: 'inbox', tint: 'purple' } },
			{
				type: 'createFile',
				path: path.join(absVaultPath, 'Projects', 'example-project.md'),
				content: '# Example Project\n\nThis is an example project file. You can use this space to outline your project goals, tasks, and resources.\n\n## Project Overview\n\nProvide a brief description of your project here.\n\n## Tasks\n\n- [ ] Task 1\n- [ ] Task 2\n- [ ] Task 3\n\n## Resources\n\n- Link to resource 1\n- Link to resource 2\n- Link to resource 3'
			},
			{ type: 'createDirectory', path: path.join(absVaultPath, 'Journal') },
			{ type: 'metadata', path: path.join(absVaultPath, 'Journal'), metadata: { icon: 'calendar', tint: 'blue' } },
			{
				type: 'createFile',
				path: path.join(absVaultPath, 'Journal', '2024-01-01.md'),
				content: '# Journal Entry - January 1, 2024\n\nToday marks the beginning of a new year and a fresh start. I am excited to embark on this journey with Karabiner as my trusted knowledge base. My goals for this year include:\n\n- [ ] Organize my thoughts and ideas more effectively.\n- [ ] Keep track of my projects and their progress.\n- [ ] Capture insights and information that I come across in my daily life.\n\nI am looking forward to seeing how Karabiner helps me grow and stay organized throughout the year!'
			},
			{
				type: 'createFile',
				path: path.join(absVaultPath, 'Journal', '2024-01-02.md'),
				content: '# Journal Entry - January 2, 2024\n\nToday I started setting up my Karabiner vault. I created a few folders and files to get things organized. I am impressed with how easy it is to create and manage my notes. I can already see the potential for this tool to help me stay organized and productive. Looking forward to filling this vault with all my thoughts and ideas!'
			},
			{ type: 'createDirectory', path: path.join(absVaultPath, 'Research') },
			{ type: 'metadata', path: path.join(absVaultPath, 'Research'), metadata: { icon: 'test-tube', tint: 'orange' } },
			{
				type: 'createFile',
				path: path.join(absVaultPath, 'Research', 'example-research.md'),
				content: '# Example Research Note\n\nThis is an example research note. Use this template to capture your research findings, insights, and references.\n\n## Research Topic\n\nBriefly describe the topic of your research here.\n\n## Key Findings\n\n- Finding 1: Description and implications.\n- Finding 2: Description and implications.\n- Finding 3: Description and implications.\n\n## References\n\n- [Link to reference 1](https://example.com)\n- [Link to reference 2](https://example.com)\n- [Link to reference 3](https://example.com)'
			}
		]);
		await FSReplay.applyOperations(defaultActions);
	}

	if (!existsSync(absAssetPath)) {
		await FSReplay.applyOperations([
			{ type: 'createDirectory', path: absAssetPath },
		]);
	}
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
