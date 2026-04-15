import { createContext, PropsWithChildren, use, useState } from "react";

const WorkbenchContext = createContext({} as {
	service: WorkbenchService;
});

export function Workbench(props: PropsWithChildren) {
	const [workbenchService] = useState(() => new WorkbenchService());

	return (
		<WorkbenchContext.Provider
			value={{
				service: workbenchService
			}}
		>
			{props.children}
		</WorkbenchContext.Provider>
	)
}

export function useWorkbench() {
	return use(WorkbenchContext);
}

// MARK WorkbenchService

/**
 * The WorkbenchService is responsible for managing the state and logic of the workbench, 
 * including handling user interactions, managing open files, and coordinating with other services 
 * such as the editor and file system. It provides a centralized place for the workbench's business 
 * logic, allowing for better separation of concerns and easier maintenance.
 * 
 * Main areas of responsibility include:
 * - FileSystem interactions: Opening, saving, and managing files and directories.
 * - Navigation History: Keeping track of recently opened files and navigation history for easy access.
 * - Searchlight: Managing logic for searchlight feature; handling search queries, results, and interactions.
 * - State Management: Managing the overall state of the workbench, including open files, active file, and UI state.
 * 
 * WorkbenchFS is a helper class that abstracts file system operations, providing a clean API for the WorkbenchService 
 * to interact with the file system without worrying about implementation details. It can handle tasks such as reading 
 * and writing files, managing directories, and providing file metadata.
 */
class WorkbenchService {

	#fs = new WorkbenchFS("~/.karabiner/vault/");
	#assets = new WorkbenchFS("~/.karabiner/assets/");

	#history: string[] = [];
	#historyPointer: number = 0;

	constructor() {
		// Initialize the service, load any necessary data, etc.
	}

	goBack() {
		const newPtr = Math.max(0, this.#historyPointer - 1);
		const fileToOpen = this.#history.at(newPtr);
		if (fileToOpen) {
			this.loadFile(fileToOpen);
			this.#historyPointer = newPtr;
		}
	}

	goForward() {
		const newPtr = Math.min(this.#history.length - 1, this.#historyPointer + 1);
		const fileToOpen = this.#history.at(newPtr);
		if (fileToOpen) {
			this.loadFile(fileToOpen);
			this.#historyPointer = newPtr;
		}
	}

	openFile(path: string) {
		const ptr = this.#historyPointer;
		const isLatestHistoryEntry = this.#history.length === this.#historyPointer + 1 || this.#history.length === 0;
		if (!isLatestHistoryEntry) {
			// If we're not at the end of the history, we need to truncate the forward history before adding a new entry.
			this.#history = this.#history.slice(0, ptr + 1);
		}
		this.loadFile(path);
	}

	createFile(path: string) {
		// Logic to create a new file, update history, etc.
		const fullPath = this.loadFile(path);
		this.#fs.writeFile(fullPath, ""); // Create an empty file
	}

	private loadFile(path: string) {
		const fullPath = this.#fs.normalizePath(path);
		// Logic to open the file, update history, etc.
		this.#historyPointer++;
		this.#history.push(fullPath);
		return fullPath;
	}

	get fs() {
		return this.#fs;
	}

	get assets() {
		return this.#assets;
	}

	get currentFile() {
		return this.#history.at(this.#historyPointer);
	}

}

class WorkbenchFS {

	readonly #cwdPath: string;
	readonly #homeDir: string;

	constructor(cwdPath: string) {
		this.#cwdPath = WorkbenchFS.normalizePath(cwdPath);
		this.#homeDir = window.electron.getHomeDir() || "";
	}

	static normalizePath(...pathParts: string[]) {
		const platform = window.electron.getPlatform();
		const path = pathParts.join("/").replace(/\/+/g, "/");

		// Normalize the path, resolving any relative segments and ensuring it is absolute.
		// This is a placeholder implementation; in a real application, you would use a library like 'path' to handle this.
		if (path.startsWith("~")) {
			return path.replace("~", window.electron.getHomeDir() || "");
		}

		// Also corrects slashes for cross-platform compatibility.
		if (platform === "win32") {
			return path.replace(/\//g, "\\");
		}

		return path;
	}

	normalizePath(...pathParts: string[]) {
		return WorkbenchFS.normalizePath(this.#cwdPath, ...pathParts);
	}

	async readFile(path: string): Promise<string> {
		const fullPath = WorkbenchFS.normalizePath(this.#cwdPath, path);
		return await window.electron.fs.read(fullPath);
	}

	async writeFile(path: string, content: string): Promise<void> {
		const fullPath = WorkbenchFS.normalizePath(this.#cwdPath, path);
		await window.electron.fs.write(fullPath, content);
	}

	async listFiles(path: string): Promise<string[]> {
		const fullPath = WorkbenchFS.normalizePath(this.#cwdPath, path);
		return await window.electron.fs.readdir(fullPath);
	}

	async deleteFile(path: string): Promise<void> {
		const fullPath = WorkbenchFS.normalizePath(this.#cwdPath, path);
		await window.electron.fs.delete(fullPath);
	}

	async fileExists(path: string): Promise<boolean> {
		const fullPath = WorkbenchFS.normalizePath(this.#cwdPath, path);
		return await window.electron.fs.exists(fullPath);
	}

	async createDirectory(path: string): Promise<void> {
		const fullPath = WorkbenchFS.normalizePath(this.#cwdPath, path);
		await window.electron.fs.mkdir(fullPath);
	}

	async deleteDirectory(path: string): Promise<void> {
		const fullPath = WorkbenchFS.normalizePath(this.#cwdPath, path);
		await window.electron.fs.rmdir(fullPath);
	}

	async stat(path: string) {
		const fullPath = WorkbenchFS.normalizePath(this.#cwdPath, path);
		return await window.electron.fs.stat(fullPath);
	}

}