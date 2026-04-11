

export const SIDENAV_SNAP_ZONE = 18;
export const SIDENAV_DRAG_TRANSITION = {
	type: "spring",
	stiffness: 440,
	damping: 38,
	mass: 0.28,
} as const;
export const SIDENAV_SNAP_TRANSITION = {
	type: "spring",
	stiffness: 360,
	damping: 34,
	mass: 0.42,
} as const;
export const SIDENAV_INSTANT_TRANSITION = {
	duration: 0,
} as const;
