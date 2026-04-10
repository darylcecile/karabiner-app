import { mkdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { Utils } from "electrobun/bun";
import { CORE_DATA_MIGRATIONS } from "./schema";

export type DataLayerStatus = {
  databasePath: string;
  appliedMigrations: string[];
};

let dataLayerState: Promise<DataLayerStatus> | null = null;
let database: PGlite | null = null;

export function initializeDataLayer(): Promise<DataLayerStatus> {
  if (dataLayerState) {
    return dataLayerState;
  }

  dataLayerState = (async () => {
    const databasePath = join(Utils.paths.userData, "db");
    try {
      return await initializeDatabase(databasePath);
    } catch (error: unknown) {
      if (!isRecoverableDatabaseBootstrapError(error)) {
        throw error;
      }

      const backupPath = `${databasePath}-corrupt-${Date.now()}`;
      try {
        await rename(databasePath, backupPath);
        console.error(
          `[bun] database bootstrap failed; moved corrupted data directory to ${backupPath}`,
        );
      } catch {
        await rm(databasePath, { recursive: true, force: true });
        console.error(
          "[bun] database bootstrap failed; removed corrupted data directory",
        );
      }
      return initializeDatabase(databasePath);
    }
  })();

  return dataLayerState;
}

export function getDatabase(): PGlite {
  if (!database) {
    throw new Error("Database is not initialized yet. Call initializeDataLayer() first.");
  }
  return database;
}

async function initializeDatabase(databasePath: string): Promise<DataLayerStatus> {
  await mkdir(databasePath, { recursive: true });

  const db = new PGlite(databasePath, {
    extensions: {
      vector,
    },
  });

  await db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

  const appliedRows = await db.query<{
    id: string;
  }>("SELECT id FROM schema_migrations");
  const appliedMigrationSet = new Set(appliedRows.rows.map((row) => row.id));
  const newlyAppliedMigrations: string[] = [];

  for (const migration of CORE_DATA_MIGRATIONS) {
    if (appliedMigrationSet.has(migration.id)) {
      continue;
    }
    await db.exec(migration.sql);
    await db.query("INSERT INTO schema_migrations (id) VALUES ($1)", [migration.id]);
    newlyAppliedMigrations.push(migration.id);
  }

  database = db;
  return {
    databasePath,
    appliedMigrations: newlyAppliedMigrations,
  };
}

function isRecoverableDatabaseBootstrapError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Aborted()");
}
