import "@blocknote/core/fonts/inter.css";
import "@blocknote/shadcn/style.css";
import { BlockNoteView } from "@blocknote/shadcn";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteSchema, createCodeBlockSpec } from "@blocknote/core";
import { codeBlockOptions } from "@blocknote/code-block";

type BNEditor = ReturnType<typeof useCreateBlockNote>;

export function Editor(props: { editor: BNEditor }) {
	return (
		<BlockNoteView
			editor={props.editor}
			shadCNComponents={
				{
					// Pass modified ShadCN components from your project here.
					// Otherwise, the default ShadCN components will be used.
				}
			}
		/>
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
		})
	});

	return editor;
}