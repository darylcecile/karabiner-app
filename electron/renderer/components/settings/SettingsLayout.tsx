import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Settings01Icon, MagicWand01Icon } from '@hugeicons/core-free-icons';
import { cn } from '@/shared/utils';
import { Separator } from '../ui/separator';
import { GeneralPane } from './GeneralPane';
import { AIPane } from './AIPane';
import { CustomScrollPanel } from '../ui/custom-scroll-panel';

type SectionId = 'general' | 'ai';

type Section = {
	id: SectionId;
	label: string;
	icon: typeof Settings01Icon;
	tint: string;
};

const SECTIONS: Section[] = [
	{ id: 'general', label: 'General', icon: Settings01Icon, tint: 'bg-zinc-500' },
	{ id: 'ai', label: 'AI', icon: MagicWand01Icon, tint: 'bg-violet-500' },
];

export function SettingsLayout() {
	const [active, setActive] = useState<SectionId>('general');

	return (
		<div className="flex h-screen w-screen overflow-hidden text-foreground">
			<aside className="w-[200px] shrink-0 bg-foreground/5 p-2 pt-10 select-none">
				<nav className="flex flex-col gap-0.5">
					{SECTIONS.map((s) => {
						const selected = active === s.id;
						return (
							<button
								key={s.id}
								type="button"
								onClick={() => setActive(s.id)}
								className={cn(
									'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left transition-colors',
									selected ? 'bg-foreground/10' : 'hover:bg-foreground/5'
								)}
							>
								<span
									className={cn(
										'flex h-4 w-4 items-center justify-center rounded-[4px] text-white',
										s.tint
									)}
								>
									<HugeiconsIcon icon={s.icon} size={10} strokeWidth={2.5} />
								</span>
								<span className="truncate">{s.label}</span>
							</button>
						);
					})}
				</nav>
			</aside>
			<Separator orientation="vertical" />
			<CustomScrollPanel className="flex-1 overflow-y-auto pt-6" thumbWidth={6} scrollbarTopOffset={8} scrollbarBottomOffset={8}>
				<div className="px-6">
					{active === 'general' && <GeneralPane />}
					{active === 'ai' && <AIPane />}
				</div>
			</CustomScrollPanel>
		</div>
	);
}
