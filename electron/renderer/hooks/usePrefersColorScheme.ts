import { useState, useEffect } from "react";


export function usePrefersColorScheme() {
	const [scheme, setScheme] = useState<"light" | "dark">(() => {
		return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
	});

	useEffect(() => {
		const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

		const handleChange = (event: MediaQueryListEvent) => {
			setScheme(event.matches ? "dark" : "light");
		};

		mediaQuery.addEventListener("change", handleChange);

		// Set the initial scheme
		setScheme(mediaQuery.matches ? "dark" : "light");

		return () => {
			mediaQuery.removeEventListener("change", handleChange);
		};
	}, []);

	return scheme;
}