import "@blocknote/core/fonts/inter.css";
import "@blocknote/shadcn/style.css";
import { BlockNoteView } from "@blocknote/shadcn";
import { useCreateBlockNote } from "@blocknote/react";

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
