import { useEffect, useState, type FC } from "react";
import { MultiFileDiff } from "@pierre/diffs/react";
import type { IDockviewPanelProps } from "dockview";
import { readFile, gitShowFile } from "../rpc";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface DiffPanelParams {
	/** Absolute path to the changed file */
	filePath: string;
	/** Workspace root (git repo root) for `git show HEAD:...` */
	workspacePath: string;
	/** Git status code (M, A, D, ??, etc.) */
	gitStatus: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export const DiffPanel: FC<IDockviewPanelProps<DiffPanelParams>> = (props) => {
	const { filePath, workspacePath, gitStatus: statusCode } = props.params as DiffPanelParams;

	const [oldContents, setOldContents] = useState<string | null>(null);
	const [newContents, setNewContents] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!filePath || !workspacePath) return;

		setLoading(true);
		setError(null);

		// Compute relative path from workspace root
		const relativePath = filePath.startsWith(workspacePath)
			? filePath.substring(workspacePath.length + 1) // +1 for trailing /
			: filePath;

		const loadContents = async () => {
			try {
				// For deleted files, only load the old version
				if (statusCode === "D") {
					const old = await gitShowFile(workspacePath, relativePath);
					setOldContents(old.contents);
					setNewContents("");
					setLoading(false);
					return;
				}

				// Load current file contents
				const current = await readFile(filePath);
				if (current.isBinary) {
					setError("Binary file — cannot display diff");
					setLoading(false);
					return;
				}
				setNewContents(current.contents);

				// For new/untracked files, there's no old version
				if (statusCode === "??" || statusCode === "A") {
					setOldContents("");
					setLoading(false);
					return;
				}

				// Load the original version from HEAD
				const old = await gitShowFile(workspacePath, relativePath);
				setOldContents(old.isNew ? "" : old.contents);
				setLoading(false);
			} catch (err) {
				setError(`Failed to load diff: ${err}`);
				setLoading(false);
			}
		};

		loadContents();
	}, [filePath, workspacePath, statusCode]);

	if (loading) {
		return (
			<div className="flex items-center justify-center h-full text-fg-muted">
				<span className="text-[var(--font-size-sm)]">Loading diff...</span>
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

	const fileName = filePath.split("/").pop() ?? filePath;

	return (
		<div className="h-full w-full overflow-auto bg-editor">
			<MultiFileDiff
				oldFile={{
					name: fileName,
					contents: oldContents ?? "",
				}}
				newFile={{
					name: fileName,
					contents: newContents ?? "",
				}}
				options={{
					theme: "github-dark",
					diffStyle: "unified",
					diffIndicators: "bars",
					overflow: "scroll",
					lineDiffType: "word-alt",
					expandUnchanged: false,
				}}
			/>
		</div>
	);
};
