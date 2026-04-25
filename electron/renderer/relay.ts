import { createRelayTerminal } from "@karabiner/relay";
import type { MainRelay } from '@/main/ipcMethods';

export const main = createRelayTerminal<MainRelay>();