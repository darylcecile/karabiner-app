import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/shared/utils';
import { usePrefersColorScheme } from '@/renderer/hooks/usePrefersColorScheme';

interface MenuCtx {
	close: () => void;
}

const MenuContext = createContext<MenuCtx | null>(null);

export interface TreeContextMenuProps {
	x: number;
	y: number;
	onClose: () => void;
	children: ReactNode;
}

export function TreeContextMenu({ x, y, onClose, children }: TreeContextMenuProps) {
	const menuRef = useRef<HTMLDivElement | null>(null);
	const [pos, setPos] = useState({ x, y, placed: false });
	const scheme = usePrefersColorScheme();

	useLayoutEffect(() => {
		const el = menuRef.current;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const margin = 4;
		let nx = x;
		let ny = y;
		if (nx + rect.width + margin > vw) nx = Math.max(margin, vw - rect.width - margin);
		if (ny + rect.height + margin > vh) ny = Math.max(margin, vh - rect.height - margin);
		setPos({ x: nx, y: ny, placed: true });
	}, [x, y]);

	useEffect(() => {
		const onDown = (e: MouseEvent) => {
			const el = menuRef.current;
			if (!el) return;
			if (e.target instanceof Node && el.contains(e.target)) return;
			onClose();
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.preventDefault();
				onClose();
			}
		};
		const onScroll = () => onClose();
		const onResize = () => onClose();
		document.addEventListener('mousedown', onDown, true);
		document.addEventListener('contextmenu', onDown, true);
		document.addEventListener('keydown', onKey, true);
		window.addEventListener('scroll', onScroll, true);
		window.addEventListener('resize', onResize);
		return () => {
			document.removeEventListener('mousedown', onDown, true);
			document.removeEventListener('contextmenu', onDown, true);
			document.removeEventListener('keydown', onKey, true);
			window.removeEventListener('scroll', onScroll, true);
			window.removeEventListener('resize', onResize);
		};
	}, [onClose]);

	useEffect(() => {
		menuRef.current?.focus();
	}, []);

	return createPortal(
		<div className={scheme === 'dark' ? 'dark' : undefined}>
			<MenuContext.Provider value={{ close: onClose }}>
				<div
					ref={menuRef}
					role="menu"
					tabIndex={-1}
					style={{
						position: 'fixed',
						left: pos.x,
						top: pos.y,
						zIndex: 50,
						visibility: pos.placed ? 'visible' : 'hidden',
					}}
					onContextMenu={(e) => e.preventDefault()}
					className={cn(
						'relative min-w-[10rem] max-w-[18rem] py-1',
						'rounded-md border border-border/60 bg-popover/90 text-popover-foreground',
						'backdrop-blur-2xl backdrop-saturate-150',
						'shadow-md',
						'text-[13px] leading-none',
						'select-none focus:outline-none',
					)}
				>
					{children}
				</div>
			</MenuContext.Provider>
		</div>,
		document.body,
	);
}

export interface TreeMenuItemProps {
	onSelect: () => void;
	disabled?: boolean;
	variant?: 'default' | 'destructive';
	children: ReactNode;
}

export function TreeMenuItem({ onSelect, disabled, variant = 'default', children }: TreeMenuItemProps) {
	const ctx = useContext(MenuContext);
	const handle = useCallback(() => {
		if (disabled) return;
		onSelect();
		ctx?.close();
	}, [ctx, disabled, onSelect]);
	return (
		<div
			role="menuitem"
			aria-disabled={disabled || undefined}
			data-disabled={disabled || undefined}
			data-variant={variant}
			onMouseDown={(e) => {
				// Prevent the global mousedown-outside handler from closing first.
				e.preventDefault();
				e.stopPropagation();
				handle();
			}}
			className={cn(
				'flex items-center gap-2 px-2 py-1.5 mx-1 rounded-sm cursor-default',
				'transition-colors',
				disabled && 'opacity-50 pointer-events-none',
				!disabled && variant === 'default' && 'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
				!disabled && variant === 'destructive' && 'text-destructive hover:bg-destructive/10 hover:text-destructive',
			)}
		>
			{children}
		</div>
	);
}

export function TreeMenuSeparator() {
	return <div role="separator" className="my-1 h-px bg-border/60" />;
}
