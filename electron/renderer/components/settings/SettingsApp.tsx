import { TooltipProvider } from '../ui/tooltip';
import { usePrefersColorScheme } from '../../hooks/usePrefersColorScheme';
import { cn } from '@/shared/utils';
import { SettingsLayout } from './SettingsLayout';

export function SettingsApp() {
	const theme = usePrefersColorScheme();

	return (
		<div className={cn('contents', theme === 'dark' && 'dark')}>
			<TooltipProvider>
				<div
					className="absolute inset-x-0 top-0 z-50 h-8"
					style={{
						// @ts-expect-error css-properties not typed
						appRegion: 'drag',
					}}
				/>
				<SettingsLayout />
			</TooltipProvider>
		</div>
	);
}
