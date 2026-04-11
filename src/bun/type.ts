import { RPCSchema } from 'electrobun/bun';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { rmdir } from 'node:fs/promises';
import { unlink } from 'node:fs/promises';

export type DirectoryEntry = {
	name: string;
	isDirectory: boolean;
};

export type RPCType = {
	bun: RPCSchema<{
		requests: {
			listDirectory: {
				params: [path: string],
				response: DirectoryEntry[];
			},
			readFile: {
				params: Parameters<typeof readFile>,
				response: Awaited<ReturnType<typeof readFile>>;
			},
			writeFile: {
				params: Parameters<typeof writeFile>,
				response: Awaited<ReturnType<typeof writeFile>>;
			},
			readdir: {
				params: Parameters<typeof readdir>,
				response: Awaited<ReturnType<typeof readdir>>;
			},
			readdirSync: {
				params: Parameters<typeof readdirSync>,
				response: ReturnType<typeof readdirSync>;
			},
			getHomeDirectory: {
				params: void,
				response: string;
			},
			mkdir: {
				params: Parameters<typeof mkdir>,
				response: Awaited<ReturnType<typeof mkdir>>;
			},
			rmdir: {
				params: Parameters<typeof rmdir>,
				response: Awaited<ReturnType<typeof rmdir>>;
			},
			unlink: {
				params: Parameters<typeof unlink>,
				response: Awaited<ReturnType<typeof unlink>>;
			}
		}
	}>,
	webview: RPCSchema<{ }>
}
