import { CustomScrollPanel, type CustomScrollPanelProps } from "@/renderer/components/ui/custom-scroll-panel";

type ContentScrollAreaProps = CustomScrollPanelProps;

/**
 * Thin wrapper around `CustomScrollPanel` that preserves the original
 * Workbench-content defaults (a soft top fade by default).
 */
export function ContentScrollArea(props: ContentScrollAreaProps) {
	return <CustomScrollPanel topFadeHeight={28} {...props} />;
}
