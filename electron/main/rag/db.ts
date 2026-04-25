import path from "node:path";
import { mkdir, rm } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";

const RAG_CACHE_DIR = "~/.karabiner/cache/rag";
const PG_DATA_SUBDIR = "pgdata";

function resolveHome(p: string): string {
	if (p.startsWith("~")) {
		return path.join(process.env.HOME || process.env.USERPROFILE || "", p.slice(1));
	}
	return path.resolve(p);
}

function getRagCacheDir(): string {
	return resolveHome(RAG_CACHE_DIR);
}

function getPgDataDir(): string {
	return path.join(getRagCacheDir(), PG_DATA_SUBDIR);
}

let dbPromise: Promise<PGlite> | null = null;

async function initDb(): Promise<PGlite> {
	const dataDir = getPgDataDir();
	await mkdir(dataDir, { recursive: true });
	const pg = new PGlite({
		dataDir,
		extensions: { vector },
	});
	await pg.waitReady;
	return pg;
}

export async function getDb(): Promise<PGlite> {
	if (!dbPromise) {
		dbPromise = (async () => {
			try {
				return await initDb();
			} catch (err) {
				console.error("[rag/db] PGlite init failed, evicting and retrying:", err);
				await evictDataDir();
				try {
					return await initDb();
				} catch (err2) {
					dbPromise = null;
					throw err2;
				}
			}
		})();
	}
	return dbPromise;
}

async function evictDataDir(): Promise<void> {
	await rm(getRagCacheDir(), { recursive: true, force: true });
}

type Migration = { version: number; name: string; sql: string };

function loadMigrations(): Migration[] {
	const modules = import.meta.glob("./migrations/*.sql", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
	const migrations: Migration[] = [];
	for (const [filePath, sql] of Object.entries(modules)) {
		const base = filePath.split("/").pop() ?? "";
		const match = base.match(/^(\d+)_(.+)\.sql$/);
		if (!match) continue;
		migrations.push({ version: parseInt(match[1], 10), name: match[2], sql });
	}
	migrations.sort((a, b) => a.version - b.version);
	return migrations;
}

async function ensureSchemaMeta(pg: PGlite): Promise<number> {
	await pg.exec(`CREATE TABLE IF NOT EXISTS schema_meta (version int NOT NULL);`);
	const res = await pg.query<{ version: number }>(`SELECT version FROM schema_meta LIMIT 1;`);
	if (res.rows.length === 0) {
		await pg.exec(`INSERT INTO schema_meta (version) VALUES (0);`);
		return 0;
	}
	return res.rows[0].version;
}

async function applyMigrationsOnce(pg: PGlite): Promise<{ applied: number[]; current: number }> {
	const current = await ensureSchemaMeta(pg);
	const migrations = loadMigrations();
	const pending = migrations.filter((m) => m.version > current);
	const applied: number[] = [];
	let version = current;
	for (const m of pending) {
		await pg.transaction(async (tx) => {
			await tx.exec(m.sql);
			await tx.exec(`UPDATE schema_meta SET version = ${m.version};`);
		});
		applied.push(m.version);
		version = m.version;
	}
	return { applied, current: version };
}

export async function runMigrations(): Promise<{ applied: number[]; current: number }> {
	let pg = await getDb();
	try {
		return await applyMigrationsOnce(pg);
	} catch (err) {
		console.error("[rag/db] Migration failed, evicting data dir and retrying from scratch:", err);
		try {
			await closeDb();
			await evictDataDir();
			pg = await getDb();
			return await applyMigrationsOnce(pg);
		} catch (err2) {
			console.error("[rag/db] Fresh init after eviction also failed:", err2);
			throw err2;
		}
	}
}

export async function evictAndReinit(): Promise<void> {
	await closeDb();
	await evictDataDir();
	await getDb();
	await runMigrations();
}

export async function closeDb(): Promise<void> {
	if (!dbPromise) return;
	const p = dbPromise;
	dbPromise = null;
	try {
		const pg = await p;
		await pg.close();
	} catch (err) {
		console.error("[rag/db] Error closing PGlite:", err);
	}
}
