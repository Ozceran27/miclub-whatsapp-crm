import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const findRepoRoot = (startDir: string): string => {
  let currentDir = startDir;

  while (true) {
    const packageJsonPath = path.join(currentDir, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as { name?: string };
        if (packageJson.name === "miclub-whatsapp-crm") return currentDir;
      } catch (error) {
        console.warn(`No se pudo leer ${packageJsonPath}:`, error);
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  const fallbackDir = process.cwd();
  console.warn(`No se encontró la raíz del repo (package.json con name=miclub-whatsapp-crm) desde ${startDir}. Usando fallback process.cwd(): ${fallbackDir}`);
  return fallbackDir;
};

const repoRoot = findRepoRoot(__dirname);
const webDistPath = path.join(repoRoot, "apps/web/dist");
const webIndexPath = path.join(webDistPath, "index.html");
const isProduction = process.env.NODE_ENV === "production" || __dirname.includes(`${path.sep}dist${path.sep}`);

dotenv.config({ path: path.join(repoRoot, ".env") });

import express from "express";
import cors from "cors";
import db from "./lib/sqlite.js";
import { templates } from "./data/mockData.js";
import dbRoutes from "./routes/dbRoutes.js";
import catalogRoutes from "./routes/catalogRoutes.js";
import peopleRoutes from "./routes/peopleRoutes.js";
import financeRoutes from "./routes/financeRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import importRoutes from "./routes/importRoutes.js";
import moduleRoutes from "./routes/moduleRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import { createCrmRoutes } from "./routes/crmRoutes.js";
import { createLegacyCompatRoutes, getMembersSource, isDebtorMember } from "./routes/legacyCompatRoutes.js";
import { createFrontendRoutes } from "./routes/frontendRoutes.js";
import errorHandler from "./middleware/errorHandler.js";
import { warnIfProductionCrmSourceIsNotPostgres } from "./config/env.js";
import { createAuthProtection, isProtectedApiPath } from "./middleware/auth.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);
const debugEndpointsEnabled = process.env.DEBUG_ENDPOINTS_ENABLED === "true";
warnIfProductionCrmSourceIsNotPostgres(isProduction);
app.set("trust proxy", true);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use("/api/db", dbRoutes);


if (isProduction) {
  app.use(express.static(webDistPath));
}


const runDb = (query: string, params: unknown[] = []): Promise<void> =>
  new Promise((resolve, reject) => {
    db.run(query, params, (err) => (err ? reject(err) : resolve()));
  });

const allDb = <T>(query: string, params: unknown[] = []): Promise<T[]> =>
  new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => (err ? reject(err) : resolve(rows as T[])));
  });

const seedDefaultTemplates = async () => {
  const [{ total }] = await allDb<{ total: number }>("SELECT COUNT(1) as total FROM message_templates");
  if (total > 0) return;
  const now = new Date().toISOString();
  for (const template of templates) {
    await runDb(
      `INSERT INTO message_templates (id, name, body, isDefault, createdAt, updatedAt)
       VALUES (?, ?, ?, 1, ?, ?)`,
      [template.id, template.name, template.body, now, now]
    );
  }
};

app.use("/auth", authRoutes);
app.use(createAuthProtection({ isProduction }));
app.use((req, res, next) => {
  if (isProtectedApiPath(req.path)) {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.set("Surrogate-Control", "no-store");
  }
  next();
});
app.use("/api/import", importRoutes);
app.use("/api/modules", moduleRoutes);
app.use("/api", catalogRoutes);
app.use("/api", peopleRoutes);
app.use("/api", financeRoutes);
app.use("/api", dashboardRoutes);

app.use(createLegacyCompatRoutes(debugEndpointsEnabled));
app.use(createCrmRoutes({ getMembersSource, isDebtorMember }));

app.use(errorHandler);

if (isProduction) {
  app.use(createFrontendRoutes(webIndexPath));
}


export const startServer = async () => {
  await seedDefaultTemplates();
  app.listen(port, () => {
    console.log(`API running at http://localhost:${port}`);
  });
};

export { app };

const isDirectRun = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;

if (isDirectRun) {
  startServer().catch((error) => {
    console.error("No se pudo iniciar la API", error);
    process.exit(1);
  });
}
