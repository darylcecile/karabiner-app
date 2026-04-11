import { ApplicationMenu, BrowserView, BrowserWindow, Updater, Utils } from "electrobun/bun";
import { dlopen, FFIType } from "bun:ffi";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { USE_NATIVE_MAC_DRAG_REGION } from "../shared/window-effects";
import { readFile } from "node:fs/promises";
import { writeFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { RPCType } from "./type";
import { mkdir } from "node:fs/promises";
import { rmdir } from "node:fs/promises";
import { unlink } from "node:fs/promises";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;
const MAC_TRAFFIC_LIGHTS_X = 9;
const MAC_TRAFFIC_LIGHTS_Y = 8;
const MAC_NATIVE_DRAG_REGION_X = 100;
const MAC_NATIVE_DRAG_REGION_HEIGHT = 28;

async function getMainViewUrl(): Promise<string> {
	const channel = await Updater.localInfo.channel();
	if (channel === "dev") {
		try {
			await fetch(DEV_SERVER_URL, { method: "HEAD" });
			console.log(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`);
			return DEV_SERVER_URL;
		} catch {
			console.log(
				"Vite dev server not running. Run 'bun run dev:hmr' for HMR support.",
			);
		}
	}

	return "views://mainview/index.html";
}

const url = await getMainViewUrl();
const isMacOS = process.platform === "darwin";

function applyMacOSWindowEffects(mainWindow: BrowserWindow) {
	const dylibPath = join(import.meta.dir, "libMacWindowEffects.dylib");

	if (!existsSync(dylibPath)) {
		console.warn(
			`Native macOS effects lib not found at ${dylibPath}. Falling back to transparent-only mode.`,
		);
		return;
	}

	try {
		const lib = dlopen(dylibPath, {
			enableWindowVibrancy: {
				args: [FFIType.ptr],
				returns: FFIType.bool,
			},
			ensureWindowShadow: {
				args: [FFIType.ptr],
				returns: FFIType.bool,
			},
			setWindowTrafficLightsPosition: {
				args: [FFIType.ptr, FFIType.f64, FFIType.f64],
				returns: FFIType.bool,
			},
			setNativeWindowDragRegion: {
				args: [FFIType.ptr, FFIType.f64, FFIType.f64],
				returns: FFIType.bool,
			},
		});

		const vibrancyEnabled = lib.symbols.enableWindowVibrancy(mainWindow.ptr);
		const shadowEnabled = lib.symbols.ensureWindowShadow(mainWindow.ptr);
		const alignButtons = () =>
			lib.symbols.setWindowTrafficLightsPosition(
				mainWindow.ptr,
				MAC_TRAFFIC_LIGHTS_X,
				MAC_TRAFFIC_LIGHTS_Y,
			);
		const alignNativeDragRegion = () =>
			lib.symbols.setNativeWindowDragRegion(
				mainWindow.ptr,
				MAC_NATIVE_DRAG_REGION_X,
				MAC_NATIVE_DRAG_REGION_HEIGHT,
			);

		const buttonsAlignedNow = alignButtons();
		const dragRegionAlignedNow = USE_NATIVE_MAC_DRAG_REGION
			? alignNativeDragRegion()
			: false;

		setTimeout(() => {
			alignButtons();
			if (USE_NATIVE_MAC_DRAG_REGION) {
				alignNativeDragRegion();
			}
		}, 120);

		mainWindow.on("resize", () => {
			if (USE_NATIVE_MAC_DRAG_REGION) {
				alignNativeDragRegion();
			}
		});

		console.log(
			`macOS effects applied (vibrancy=${vibrancyEnabled}, shadow=${shadowEnabled}, trafficLights=${buttonsAlignedNow}, nativeDrag=${dragRegionAlignedNow})`,
		);
	} catch (error) {
		console.warn("Failed to apply native macOS effects:", error);
	}
}

function setupMacOSMenu(mainWindow: BrowserWindow) {
	ApplicationMenu.setApplicationMenu([
		{
			submenu: [{ role: "quit" }],
		},
		{
			label: "File",
			submenu: [
				{
					label: "Close Window",
					action: "close-main-window",
					accelerator: "w",
				},
				{ type: "separator" },
				{ role: "quit" },
			],
		},
		{
			label: "Window",
			submenu: [{ role: "minimize" }, { role: "zoom" }, { role: "bringAllToFront" }],
		},
	]);

	ApplicationMenu.on("application-menu-clicked", (event: unknown) => {
		const action = (event as { data?: { action?: string } })?.data?.action;
		if (action === "close-main-window") {
			mainWindow.close();
		}
	});
}


const mainWindow = new BrowserWindow({
	title: "Karabiner",
	url,
	frame: {
		width: 900,
		height: 700,
		x: 200,
		y: 200,
	},
	titleBarStyle: "hiddenInset" as const,
	rpc: BrowserView.defineRPC<RPCType>({
		handlers: {
			requests: {
				listDirectory: async ([path]) => {
					const items = await readdir(path, { withFileTypes: true });
					return items.map((item) => ({
						name: item.name,
						isDirectory: item.isDirectory(),
					}));
				},
				readFile: async ([path, type]) => {
					return readFile(path, type);
				},
				writeFile: async ([path, data, options]) => {
					return writeFile(path, data, options);
				},
				readdir: async ([path, options]) => {
					return readdir(path, options);
				},
				getHomeDirectory: async () => {
					return Utils.paths.home;
				},
				mkdir: async ([path, options]) => {
					return mkdir(path, options);
				},
				rmdir: async ([path]) => {
					return rmdir(path);
				},
				unlink: async ([path]) => {
					return unlink(path);
				}
			}
		}
	})
});

if (isMacOS) {
	applyMacOSWindowEffects(mainWindow);
	setupMacOSMenu(mainWindow);
}

mainWindow.on("close", () => {
	Utils.quit();
});

console.log("Karabiner app started!");
