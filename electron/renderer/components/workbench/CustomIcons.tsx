import { Archive03Icon, Calendar05Icon, Folder01Icon, InboxIcon, TestTube03Icon, File01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from "@hugeicons/react";
import { ComponentProps } from "react";

type CustomIconProps = Omit<ComponentProps<HugeiconsIcon>, "icon"> & {
	icon: string;
}

export function CustomIcons(props: CustomIconProps) {
	const iconData = getIconByName(props.icon);

	if (!iconData) {
		return null;
	}

	return (
		<HugeiconsIcon {...props} icon={iconData} />
	)
}

function getIconByName(name: string): ComponentProps<HugeiconsIcon>['icon'] | null {
	const iconMap: Record<string, ComponentProps<HugeiconsIcon>['icon']> = {
		"test-tube": TestTube03Icon,
		"calendar": Calendar05Icon,
		"inbox": InboxIcon,
		"archive": Archive03Icon,
		"folder": Folder01Icon,
		"file": File01Icon,
	};

	return iconMap[name] || null;
}