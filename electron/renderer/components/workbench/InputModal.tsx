import { useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/renderer/components/ui/alert-dialog"
import { Button } from "@/renderer/components/ui/button"
import { Input } from "../ui/input";

type Payload = {
	title?: string;
	message: string;
	messagePlaceholder?: string;
	confirmText?: string;
	cancelText?: string;
}

type PayloadWithCallback = Payload & {
	onConfirm: (inputValue: string) => void;
}

const _internalSymbol: unique symbol = Symbol("InputModalController");

export function useInputModalController() {
	const [payload, setPayload] = useState<PayloadWithCallback | null>(null);

	function prompt(opt: Payload) {
		return new Promise<string>((resolve) => {
			console.log("Prompting with options:", opt);
			setPayload({
				...opt,
				onConfirm: (inputValue: string) => {
					resolve(inputValue);
					setPayload(null);
				}
			});
		});
	}

	function close() {
		setPayload(null);
	}

	return {
		isOpen: Boolean(payload),
		prompt: prompt,
		close: close,
		[_internalSymbol]: payload
	}
}

type Controller = ReturnType<typeof useInputModalController>;

export function InputModal(props: { controller: Controller }) {
	const payload = props.controller[_internalSymbol];
	const [value, setValue] = useState("");

	function handleConfirm() {
		payload?.onConfirm?.(value);
	}

	function handleCancel() {
		props.controller.close();
	}

	return (
		<AlertDialog open={props.controller.isOpen}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{payload?.title ?? 'Prompt'}</AlertDialogTitle>
					<AlertDialogDescription>
						{payload?.message}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<Input 
					value={value}
					onChange={(e) => setValue(e.target.value)}
					placeholder={payload?.messagePlaceholder ?? ''}
					autoFocus
				/>
				<AlertDialogFooter>
					<AlertDialogCancel onClick={handleCancel}>{payload?.cancelText ?? 'Cancel'}</AlertDialogCancel>
					<AlertDialogAction onClick={handleConfirm}>{payload?.confirmText ?? 'Confirm'}</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}