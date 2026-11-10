import app from "./app";
import { runMigrations } from "@workspace/db";
import { logger } from "./lib/logger";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

try {
  // Resolve from the bundled entry file so dev and production share the same path.
  const migrationsFolder = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../lib/db/migrations",
  );
  await runMigrations(migrationsFolder);
} catch (error) {
  logger.error({ err: error }, "Failed to apply database migrations");
  process.exit(1);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
