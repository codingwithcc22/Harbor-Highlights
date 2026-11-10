import app from "./app";
import { runMigrations } from "@workspace/db";
import { logger } from "./lib/logger";
import path from "node:path";

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
  // The API bundle runs from the workspace root, where committed migrations live.
  await runMigrations(path.resolve(process.cwd(), "lib/db/migrations"));
} catch (error) {
  logger.error({ error }, "Failed to apply database migrations");
  process.exit(1);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
