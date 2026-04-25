import { createRendererRelay } from "@karabiner/relay";
import type { MainRelayMethods } from '@/main/ipcMethods';

export const main = createRendererRelay<MainRelayMethods>("mainRelay");
