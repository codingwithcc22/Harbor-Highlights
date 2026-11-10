import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const { Client } = pg;
const MIGRATION_LOCK_ID = 727_001;

function directConnectionString(url: string): string {
  const parsed = new URL(url);
  parsed.hostname = parsed.hostname.replace("-pooler.", ".");
  return parsed.toString();
}

/**
 * Apply committed migrations once, even when multiple server instances start
 * at the same time.
 */
export async function runMigrations(migrationsFolder: string): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to apply database migrations.");
  }

  const client = new Client({
    connectionString: directConnectionString(databaseUrl),
  });
  await client.connect();

  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    await client.end();
  }
}
