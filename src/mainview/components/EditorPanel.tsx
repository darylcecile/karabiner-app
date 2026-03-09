import { useEffect, useRef, useState, useCallback, type FC } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type { IDockviewPanelProps } from "dockview";
import type { editor as monacoEditor } from "monaco-editor";
import { readFile, writeFile } from "../rpc";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface EditorPanelParams {
	filePath: string;
	/** Callback to notify the parent that dirty state changed */
	onDirtyChange?: (filePath: string, isDirty: boolean) => void;
}

/* ------------------------------------------------------------------ */
/*  Image extensions                                                  */
/* ------------------------------------------------------------------ */

const IMAGE_EXTENSIONS = new Set([
	".png", ".jpg", ".jpeg", ".gif", ".bmp", ".svg", ".webp", ".ico", ".avif",
]);

function isImageFile(path: string): boolean {
	const dot = path.lastIndexOf(".");
	if (dot === -1) return false;
	return IMAGE_EXTENSIONS.has(path.substring(dot).toLowerCase());
}

/* ------------------------------------------------------------------ */
/*  File extension → Monaco language map                              */
/* ------------------------------------------------------------------ */

const EXT_TO_LANG: Record<string, string> = {
	".ts": "typescript",
	".tsx": "typescript",
	".js": "javascript",
	".jsx": "javascript",
	".json": "json",
	".html": "html",
	".htm": "html",
	".css": "css",
	".scss": "scss",
	".less": "less",
	".md": "markdown",
	".yaml": "yaml",
	".yml": "yaml",
	".xml": "xml",
	".svg": "xml",
	".py": "python",
	".rs": "rust",
	".go": "go",
	".java": "java",
	".c": "c",
	".cpp": "cpp",
	".h": "c",
	".hpp": "cpp",
	".cs": "csharp",
	".rb": "ruby",
	".php": "php",
	".sh": "shell",
	".bash": "shell",
	".zsh": "shell",
	".sql": "sql",
	".graphql": "graphql",
	".gql": "graphql",
	".toml": "toml",
	".ini": "ini",
	".dockerfile": "dockerfile",
	".swift": "swift",
	".kt": "kotlin",
	".lua": "lua",
	".r": "r",
	".dart": "dart",
};

function getLanguage(filePath: string): string {
	const dot = filePath.lastIndexOf(".");
	if (dot === -1) return "plaintext";
	const ext = filePath.substring(dot).toLowerCase();
	// Special case: Dockerfile (no extension)
	const baseName = filePath.split("/").pop()?.toLowerCase() ?? "";
	if (baseName === "dockerfile" || baseName.startsWith("dockerfile.")) return "dockerfile";
	if (baseName === "makefile") return "makefile";
	return EXT_TO_LANG[ext] ?? "plaintext";
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export const EditorPanel: FC<IDockviewPanelProps<EditorPanelParams>> = (props) => {
	const params = props.params as EditorPanelParams;
	const filePath = params.filePath;
	const onDirtyChange = params.onDirtyChange;

	const [contents, setContents] = useState<string | null>(null);
	const [savedContents, setSavedContents] = useState<string | null>(null);
	const [isBinary, setIsBinary] = useState(false);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null);

	const isDirty = contents !== null && savedContents !== null && contents !== savedContents;

	// Update tab title with dirty indicator
	useEffect(() => {
		const fileName = filePath?.split("/").pop() ?? "Untitled";
		const title = isDirty ? `${fileName} \u2022` : fileName;
		props.api.setTitle(title);
	}, [isDirty, filePath, props.api]);

	// Notify parent of dirty state changes
	useEffect(() => {
		if (filePath && onDirtyChange) {
			onDirtyChange(filePath, isDirty);
		}
	}, [isDirty, filePath, onDirtyChange]);

	// Load file contents
	useEffect(() => {
		if (!filePath) return;

		// Image files don't need content loading
		if (isImageFile(filePath)) {
			setLoading(false);
			return;
		}

		setLoading(true);
		setError(null);

		readFile(filePath)
			.then(({ contents: fileContents, isBinary: binary }) => {
				if (binary) {
					setIsBinary(true);
				} else {
					setContents(fileContents);
					setSavedContents(fileContents);
				}
				setLoading(false);
			})
			.catch((err) => {
				setError(`Failed to read file: ${err}`);
				setLoading(false);
			});
	}, [filePath]);

	// Handle Monaco editor mount — register Cmd+S keybinding
	const handleEditorMount: OnMount = useCallback((editor, monaco) => {
		editorRef.current = editor;
		editor.focus();

		// Register Cmd+S / Ctrl+S for save
		editor.addAction({
			id: "karabiner-save",
			label: "Save File",
			keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
			run: () => {
				// Trigger save — we read the latest model value directly
				const currentValue = editor.getValue();
				setContents(currentValue);
				// Use a microtask to ensure state is updated before save runs
				queueMicrotask(() => {
					// We can't call handleSave directly (stale closure), so we dispatch
					// a custom event that the component listens for
					window.dispatchEvent(new CustomEvent("karabiner:save", { detail: { filePath } }));
				});
			},
		});
	}, [filePath]);

	// Listen for save events dispatched from Monaco keybinding
	useEffect(() => {
		const handler = async (e: Event) => {
			const detail = (e as CustomEvent).detail;
			if (detail?.filePath === filePath && editorRef.current) {
				const currentValue = editorRef.current.getValue();
				setSaving(true);
				try {
					const result = await writeFile(filePath, currentValue);
					if (result.ok) {
						setContents(currentValue);
						setSavedContents(currentValue);
					} else {
						setError(`Save failed: ${result.error ?? "Unknown error"}`);
					}
				} catch (err) {
					setError(`Save failed: ${err}`);
				} finally {
					setSaving(false);
				}
			}
		};
		window.addEventListener("karabiner:save", handler);
		return () => window.removeEventListener("karabiner:save", handler);
	}, [filePath]);

	// Track content changes from Monaco
	const handleEditorChange = useCallback((value: string | undefined) => {
		if (value !== undefined) {
			setContents(value);
		}
	}, []);

	// Resize Monaco when Dockview panel resizes
	useEffect(() => {
		const api = props.api;
		const disposable = api.onDidDimensionsChange(() => {
			// Monaco handles its own resize via the automaticLayout option
		});
		return () => disposable.dispose();
	}, [props.api]);

	if (loading) {
		return (
			<div className="flex items-center justify-center h-full text-fg-muted">
				<span className="text-[var(--font-size-sm)]">Loading...</span>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex items-center justify-center h-full text-feedback-error">
				<span className="text-[var(--font-size-sm)]">{error}</span>
			</div>
		);
	}

	// Image preview
	if (isImageFile(filePath)) {
		return (
			<div
				ref={containerRef}
				className="flex items-center justify-center h-full bg-editor overflow-auto p-4"
			>
				<img
					src={`file://${filePath}`}
					alt={filePath.split("/").pop() ?? "Image"}
					className="max-w-full max-h-full object-contain"
					onError={() => setError("Failed to load image")}
				/>
			</div>
		);
	}

	// Binary file
	if (isBinary) {
		return (
			<div className="flex items-center justify-center h-full text-fg-muted">
				<span className="text-[var(--font-size-sm)]">Binary file — cannot display</span>
			</div>
		);
	}

	// Monaco editor for text files
	const language = getLanguage(filePath);

	return (
		<div ref={containerRef} className="h-full w-full relative">
			{saving && (
				<div className="absolute top-2 right-4 z-10 text-[var(--font-size-xs)] text-fg-muted bg-bg-surface/80 px-2 py-0.5 rounded">
					Saving...
				</div>
			)}
			<Editor
				height="100%"
				language={language}
				defaultValue={contents ?? ""}
				theme="vs-dark"
				options={{
					readOnly: false,
					minimap: { enabled: true },
					fontSize: 13,
					fontFamily: "'MesloLGSDZ Nerd Font Mono', 'JetBrainsMono Nerd Font', monospace",
					lineHeight: 20,
					padding: { top: 8 },
					scrollBeyondLastLine: false,
					automaticLayout: true,
					renderWhitespace: "selection",
					bracketPairColorization: { enabled: true },
					guides: { bracketPairs: true, indentation: true },
					smoothScrolling: true,
					cursorBlinking: "smooth",
					wordWrap: "off",
				}}
				onChange={handleEditorChange}
				onMount={handleEditorMount}
			/>
		</div>
	);
};
