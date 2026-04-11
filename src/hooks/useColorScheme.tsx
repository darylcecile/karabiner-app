import { useEffect, useState } from "react";
import { useLocalStorage } from "@uidotdev/usehooks";


type ColorPreference = "light" | "dark" | "system";
type ResolvedColorScheme = "light" | "dark";

const media = window.matchMedia("(prefers-color-scheme: dark)");

export function useColorScheme() {
	const [colorPreference, setColorPreference] = useLocalStorage<ColorPreference>("color-scheme-preference", "system");

	const resolvedColorScheme:ResolvedColorScheme = colorPreference === "system" ? (media.matches ? "dark" : "light") : colorPreference;

	return [resolvedColorScheme, setColorPreference] as const;
}