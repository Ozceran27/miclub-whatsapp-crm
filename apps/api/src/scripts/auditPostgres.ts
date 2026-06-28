import "dotenv/config";
import { closePostgresPool } from "../db/postgres.js";
import { runPostgresAudit } from "../services/postgresAuditService.js";

runPostgresAudit()
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePostgresPool();
  });
