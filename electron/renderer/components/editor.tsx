import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { useEffect, useRef } from "react";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteSchema, createCodeBlockSpec } from "@blocknote/core";
import { codeBlockOptions } from "@blocknote/code-block";
import { useWorkbench } from "./workbench/Workbench";
import { toast } from "sonner";

const EDITOR_FONT_FAMILY = '"Geist Variable", "Inter", system-ui, sans-serif';

type BNEditor = ReturnType<typeof useCreateBlockNote>;

export function Editor() {
	const { fs, workspace, editor } = useWorkbench();
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const node = containerRef.current;
		if (!node) return;

		const handler = (e: MouseEvent) => {
			const target = e.target;
			if (!(target instanceof Element)) return;
			const anchor = target.closest("a[href]") as HTMLAnchorElement | null;
			if (!anchor || !node.contains(anchor)) return;

			const href = anchor.getAttribute("href");
			if (!href) return;

			// Internal anchors — let the browser scroll naturally.
			if (href.startsWith("#")) return;

			if (/^https?:/i.test(href)) {
				// In the editor, clicking a link should NOT navigate; it should
				// position the cursor so the user can edit the link text. The
				// BlockNote link toolbar exposes "Edit Link" for changing the URL.
				e.preventDefault();
				e.stopPropagation();
				return;
			}

			if (href.toLowerCase().startsWith("mailto:")) {
				e.preventDefault();
				e.stopPropagation();
				// TODO: route through main.openExternal once IPC lands.
				console.warn("mailto unhandled, openExternal IPC missing:", href);
				return;
			}

			if (href.startsWith("/") || href.toLowerCase().startsWith("file:")) {
				const path = href.toLowerCase().startsWith("file:")
					? href.replace(/^file:\/\//i, "")
					: href;
				e.preventDefault();
				e.stopPropagation();
				workspace.openInEditor(path);
				return;
			}
		};

		node.addEventListener("click", handler, true);
		return () => node.removeEventListener("click", handler, true);
	}, [workspace]);

	return (
		<div ref={containerRef} className="max-w-5xl mx-auto" style={{ fontFamily: EDITOR_FONT_FAMILY }}>
			<BlockNoteView
				id={workspace.openedPath ?? 'new-document'}
				editor={editor}
				onChange={(bn, ctx) => {
					// Skip the change emitted by programmatic content loads (file open).
					// Must run BEFORE the openedPath check, since on first open the state
					// hasn't flushed yet when this fires.
					if (workspace.isLoadingRef.current) return;
					const currentPath = workspace.openedPath;
					if (!currentPath) {
						toast.error("No file is currently opened. Unable to save.");
						return;
					}
					const markdown = bn.blocksToMarkdownLossy();
					fs.writeFile(currentPath, markdown);
				}}
				editable={!!workspace.openedPath}
				
				className="bg-transparent"
				theme={{
					light: {
						colors: {
							editor: {
								background: "transparent",
							}
						}
					},
					dark: {
						colors: {
							editor: {
								background: "transparent",
							}
						}
					}
				}}
			/>
		</div>
	)
}

type UseEditorState = Parameters<typeof useCreateBlockNote>[0] & {
	schema?: Parameters<ReturnType<typeof BlockNoteSchema.create>['extend']>[0]
}


export function useEditorState(props?: UseEditorState) {
	const { schema, ...rest } = props || {};
	const editor = useCreateBlockNote({
		...rest,
		// Suppress BlockNote's built-in window.open on link click. Clicks now
		// just position the cursor inside the link so the user can edit the
		// link text; the link toolbar's "Edit Link" button is used to change
		// the URL.
		links: {
			...(rest as { links?: Record<string, unknown> }).links,
			onClick: () => true,
		},
		schema: BlockNoteSchema.create().extend({
			...schema,
			blockSpecs: {
				codeBlock: createCodeBlockSpec(codeBlockOptions),
				...schema?.blockSpecs,
			}
		}),

	});

	return editor;
}