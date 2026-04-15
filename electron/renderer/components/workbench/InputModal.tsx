import { useState } from "react";

export function useInputModalController() {
	const [isOpen, setIsOpen] = useState(false);

	return {
		isOpen,
		prompt: (message: string): string => {
			return ""
		}
	}
}

type Controller = ReturnType<typeof useInputModalController>;

export function InputModal(props: { controller: Controller }) {
	return null;
}