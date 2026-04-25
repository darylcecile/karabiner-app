import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteSchema, createCodeBlockSpec } from "@blocknote/core";
import { codeBlockOptions } from "@blocknote/code-block";
import { useWorkbench } from "./workbench/Workbench";
import { toast } from "sonner";

type BNEditor = ReturnType<typeof useCreateBlockNote>;

export function Editor() {
	const { fs, workspace, editor } = useWorkbench();

	return (
		<div className="max-w-5xl mx-auto">
			<BlockNoteView
				id={workspace.openedPath ?? 'new-document'}
				editor={editor}
				onChange={(bn, ctx) => {
					const currentPath = workspace.openedPath;
					if (!currentPath) {
						toast.error("No file is currently opened. Unable to save.");
						return;
					}
					const markdown = bn.blocksToMarkdownLossy();
					// console.log("Saving file:", currentPath, "Content length:", markdown.length);
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