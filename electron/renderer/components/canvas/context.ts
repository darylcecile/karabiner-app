import { createContext, useContext } from 'react';

export type CanvasContextValue = {
	canvasDir: string;
};

export const CanvasContext = createContext<CanvasContextValue>({ canvasDir: '' });

export function useCanvasContext(): CanvasContextValue {
	return useContext(CanvasContext);
}
