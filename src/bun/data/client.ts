import { mkdir } from "node:fs/promises";
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
    await mkdir(databasePath, { recursive: true });

    database = new PGlite(databasePath, {
      extensions: {
        vector,
      },
    });

    await database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const appliedRows = await database.query<{
      id: string;
    }>("SELECT id FROM schema_migrations");
    const appliedMigrationSet = new Set(appliedRows.rows.map((row) => row.id));
    const newlyAppliedMigrations: string[] = [];

    for (const migration of CORE_DATA_MIGRATIONS) {
      if (appliedMigrationSet.has(migration.id)) {
        continue;
      }
      await database.exec(migration.sql);
      await database.query("INSERT INTO schema_migrations (id) VALUES ($1)", [
        migration.id,
      ]);
      newlyAppliedMigrations.push(migration.id);
    }

    return {
      databasePath,
      appliedMigrations: newlyAppliedMigrations,
    };
  })();

  return dataLayerState;
}

export function getDatabase(): PGlite {
  if (!database) {
    throw new Error("Database is not initialized yet. Call initializeDataLayer() first.");
  }
  return database;
}
