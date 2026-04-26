import { BrowserWindow, screen } from 'electron/main';
import { join } from 'node:path';
import { getMainWindow } from './index';

let searchWindow: BrowserWindow | null = null;
let pendingFocusOnShow = false;

const WIDTH = 640;
const HEIGHT = 440;

export function getSearchWindow(): BrowserWindow | null {
	if (searchWindow && !searchWindow.isDestroyed()) return searchWindow;
	return null;
}

function createSearchWindow(): BrowserWindow {
	const win = new BrowserWindow({
		width: WIDTH,
		height: HEIGHT,
		minWidth: 480,
		minHeight: 240,
		frame: false,
		titleBarStyle: 'hidden',
		transparent: true,
		hasShadow: true,
		resizable: false,
		movable: false,
		minimizable: false,
		maximizable: false,
		fullscreenable: false,
		skipTaskbar: true,
		show: false,
		vibrancy: 'fullscreen-ui',
		backgroundColor: '#00000000',
		roundedCorners: true,
		alwaysOnTop: false,
		webPreferences: {
			preload: join(__dirname, '../preload/index.js'),
			contextIsolation: true,
			nodeIntegration: false,
		},
	});

	if (process.platform === 'darwin' && typeof (win as any).setWindowButtonVisibility === 'function') {
		(win as any).setWindowButtonVisibility(false);
	}

	if (process.env.ELECTRON_RENDERER_URL) {
		void win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/search.html`);
	} else {
		void win.loadFile(join(__dirname, '../renderer/search.html'));
	}

	win.on('blur', () => {
		hideSearch();
	});

	win.on('closed', () => {
		if (searchWindow === win) searchWindow = null;
	});

	win.webContents.on('before-input-event', (_e, input) => {
		if (input.key === 'Escape' && input.type === 'keyDown') {
			hideSearch();
		}
	});

	win.webContents.on('did-finish-load', () => {
		if (pendingFocusOnShow && win.isVisible()) {
			pendingFocusOnShow = false;
			win.webContents.send('search:focus-input', null);
		}
	});

	searchWindow = win;
	return win;
}

function positionSearchWindow(win: BrowserWindow): void {
	const main = getMainWindow();
	const winBounds = { width: WIDTH, height: HEIGHT };

	if (main) {
		const mainBounds = main.getBounds();
		const display = screen.getDisplayMatching(mainBounds);
		const work = display.workArea;

		let x = Math.round(mainBounds.x + (mainBounds.width - winBounds.width) / 2);
		let y = Math.round(mainBounds.y + mainBounds.height * 0.18);

		x = Math.max(work.x, Math.min(x, work.x + work.width - winBounds.width));
		y = Math.max(work.y, Math.min(y, work.y + work.height - winBounds.height));

		win.setBounds({ x, y, width: winBounds.width, height: winBounds.height });
	} else {
		const display = screen.getPrimaryDisplay();
		const work = display.workArea;
		const x = Math.round(work.x + (work.width - winBounds.width) / 2);
		const y = Math.round(work.y + work.height * 0.18);
		win.setBounds({ x, y, width: winBounds.width, height: winBounds.height });
	}
}

export function showSearch(): void {
	const win = getSearchWindow() ?? createSearchWindow();
	positionSearchWindow(win);
	win.show();
	win.focus();

	if (win.webContents.isLoading()) {
		pendingFocusOnShow = true;
	} else {
		win.webContents.send('search:focus-input', null);
	}
}

export function hideSearch(): void {
	const win = getSearchWindow();
	if (!win) return;
	if (win.isVisible()) win.hide();
}

export function toggleSearch(): void {
	const win = getSearchWindow();
	if (win && win.isVisible()) {
		hideSearch();
	} else {
		showSearch();
	}
}
