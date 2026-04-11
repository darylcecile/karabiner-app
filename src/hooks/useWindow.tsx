import { useEffect, useState } from "react";


export function useWindow() {
	const [w, setW] = useState(window.innerWidth);
	const [h, setH] = useState(window.innerHeight);
	
	useEffect(() => {
		const onResize = () => {
			setW(window.innerWidth);
			setH(window.innerHeight);
		}
		window.addEventListener("resize", onResize);
		return () => {
			window.removeEventListener("resize", onResize);
		}
	}, []);
	
	return { width: w, height: h };
}