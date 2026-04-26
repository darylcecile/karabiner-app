import { BrowserWindow, clipboard, Menu, type MenuItemConstructorOptions } from 'electron';

export type FileTreeMenuPayload = {
	kind: 'root' | 'folder' | 'file';
	path?: string | null;
};

export type FileTreeMenuAction =
	| 'newFile'
	| 'newFolder'
	| 'rename'
	| 'delete'
	| 'revealInFinder';

export async function showFileTreeContextMenu(
	payload: FileTreeMenuPayload,
	window: BrowserWindow,
): Promise<{ action: FileTreeMenuAction | null }> {
	return await new Promise((resolve) => {
		let resolved = false;
		const choose = (action: FileTreeMenuAction) => {
			if (resolved) return;
			resolved = true;
			resolve({ action });
		};

		const isRoot = payload.kind === 'root';
		const isFolder = payload.kind === 'folder';
		const isFile = payload.kind === 'file';

		const template: MenuItemConstructorOptions[] = [];

		template.push({
			label: 'New File',
			click: () => choose('newFile'),
		});
		if (isRoot || isFolder) {
			template.push({
				label: 'New Folder',
				click: () => choose('newFolder'),
			});
		}

		if (!isRoot) {
			template.push({ type: 'separator' });
			template.push({
				label: 'Rename',
				click: () => choose('rename'),
			});
			template.push({
				label: 'Reveal in Finder',
				click: () => choose('revealInFinder'),
			});
			template.push({ type: 'separator' });
			template.push({
				label: isFile ? 'Delete File' : 'Delete Folder',
				click: () => choose('delete'),
			});
		}

		const menu = Menu.buildFromTemplate(template);
		menu.popup({
			window,
			callback: () => {
				if (!resolved) {
					resolved = true;
					resolve({ action: null });
				}
			},
		});
	});
}

// Standard editing context menu shown for the BlockNote editor and other
// editable / selectable areas. Includes spell-check suggestions when available
// and the macOS Services submenu (which exposes Writing Tools on macOS 15+).
export function setupNativeEditingContextMenu(window: BrowserWindow): void {
	window.webContents.on('context-menu', (_event, params) => {
		if (window.isDestroyed()) return;

		const template: MenuItemConstructorOptions[] = [];
		const isMac = process.platform === 'darwin';

		// Spell-check suggestions
		if (params.misspelledWord && params.dictionarySuggestions.length > 0) {
			for (const suggestion of params.dictionarySuggestions) {
				template.push({
					label: suggestion,
					click: () => {
						window.webContents.replaceMisspelling(suggestion);
					},
				});
			}
			template.push({ type: 'separator' });
			template.push({
				label: 'Add to Dictionary',
				click: () => {
					window.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord);
				},
			});
			template.push({ type: 'separator' });
		}

		// Link context
		if (params.linkURL) {
			template.push({
				label: 'Copy Link',
				click: () => {
					clipboard.writeText(params.linkURL);
				},
			});
			template.push({ type: 'separator' });
		}

		// Standard editing items
		const flags = params.editFlags;
		template.push(
			{ role: 'undo', enabled: flags.canUndo },
			{ role: 'redo', enabled: flags.canRedo },
			{ type: 'separator' },
			{ role: 'cut', enabled: flags.canCut },
			{ role: 'copy', enabled: flags.canCopy },
			{ role: 'paste', enabled: flags.canPaste },
			{ role: 'pasteAndMatchStyle', enabled: flags.canPaste },
			{ role: 'delete', enabled: flags.canDelete },
			{ role: 'selectAll', enabled: flags.canSelectAll },
		);

		// macOS-specific extras: Look Up + Speech submenu.
		if (isMac && params.selectionText && params.selectionText.trim().length > 0) {
			template.push({ type: 'separator' });
			template.push({
				label: `Look Up "${truncateForLabel(params.selectionText)}"`,
				click: () => {
					try {
						window.webContents.showDefinitionForSelection();
					} catch {
						// no-op
					}
				},
			});
		}

		// Don't show an empty menu (e.g., right-clicking on empty non-text area
		// where nothing applies).
		if (template.length === 0) return;

		const menu = Menu.buildFromTemplate(template);

		if (params.isEditable) {
			menu.popup({
				frame: params.frame || undefined
			});
		}

		menu.popup({ window });
	});
}

function truncateForLabel(text: string, max = 24): string {
	const single = text.replace(/\s+/g, ' ').trim();
	if (single.length <= max) return single;
	return single.slice(0, max - 1) + '…';
}
