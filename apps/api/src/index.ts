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
import { logger } from "./lib/logger.js";
import dbRoutes from "./routes/dbRoutes.js";
import catalogRoutes from "./routes/catalogRoutes.js";
import sectorMutationRoutes from "./routes/sectorMutationRoutes.js";
import activityMutationRoutes from "./routes/activityMutationRoutes.js";
import taskRoutes from "./routes/taskRoutes.js";
import requestRoutes from "./routes/requestRoutes.js";
import peopleRoutes from "./routes/peopleRoutes.js";
import financeRoutes from "./routes/financeRoutes.js";
import movementMutationRoutes from "./routes/movementMutationRoutes.js";
import enrollmentMutationRoutes from "./routes/enrollmentMutationRoutes.js";
import economyRoutes from "./routes/economyRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import administrationRoutes from "./routes/administrationRoutes.js";
import onboardingRoutes from "./routes/onboardingRoutes.js";
import readOnlyRoutes from "./routes/readOnlyRoutes.js";
import moduleRoutes from "./routes/moduleRoutes.js";
import migrationUploadRoutes from "./routes/migrationUploadRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import { createCrmRoutes } from "./routes/crmRoutes.js";
import { createLegacyCompatRoutes, getMembersSource, isDebtorMember } from "./routes/legacyCompatRoutes.js";
import { createFrontendRoutes } from "./routes/frontendRoutes.js";
import errorHandler from "./middleware/errorHandler.js";
import { validateRuntimeConfig } from "./config/env.js";
import { createAuthProtection, isExplicitTestAuthBypass, isProtectedApiPath, isTenantScopedPath } from "./middleware/auth.js";
import { rejectClientClubId, requireAuth, requireMembership } from "./middleware/authorization.js";
import { authRateLimit, cors, corsOptions, csrfProtection, getAllowedOrigins, helmet, importMutationRateLimit, jsonBodyLimit, requestId } from "./security/index.js";
import { getPostgresPool } from "./db/postgres.js";
import { diagnosePermissions } from "./auth/permissionDiagnostics.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);
app.set("trust proxy", true);
const allowedOrigins = getAllowedOrigins();
app.use(requestId);
app.use(helmet);
app.use(cors(corsOptions(allowedOrigins)));
app.use(express.json({ limit: jsonBodyLimit }));
app.use(csrfProtection(allowedOrigins));
if (isProduction) {
  app.use(express.static(webDistPath));
}


app.use(["/auth/login", "/auth/register"], authRateLimit);
app.use("/auth", (_req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.set("Surrogate-Control", "no-store");
  next();
});
app.use("/auth", authRoutes);
// Set this before authentication so reverse proxies never retain a stale 401.
app.use((req, res, next) => {
  if (isProtectedApiPath(req.path)) {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    res.set("Surrogate-Control", "no-store");
  }
  next();
});
app.use(createAuthProtection({ isProduction }));
app.use((req, res, next) => {
  if (isTenantScopedPath(req.path)) {
    if (isExplicitTestAuthBypass()) return next();
    return requireAuth(req, res, (error?: unknown) => {
      if (error) return next(error);
      requireMembership(req, res, (membershipError?: unknown) => {
        if (membershipError) return next(membershipError);
        rejectClientClubId(req, res, next);
      });
    });
  }
  next();
});
app.use("/api/migration", importMutationRateLimit, migrationUploadRoutes);
app.use("/api/db", dbRoutes);
app.use("/api/modules", moduleRoutes);
app.use("/api", readOnlyRoutes);
app.use("/api", catalogRoutes);
app.use("/api", sectorMutationRoutes);
app.use("/api", activityMutationRoutes);
app.use("/api", taskRoutes);
app.use("/api", requestRoutes);
app.use("/api", peopleRoutes);
app.use("/api", financeRoutes);
app.use("/api", movementMutationRoutes);
app.use("/api", enrollmentMutationRoutes);
app.use("/api/economy", economyRoutes);
app.use("/api/administration", administrationRoutes);
app.use("/api", onboardingRoutes);
app.use("/api", dashboardRoutes);

app.use(createLegacyCompatRoutes());
app.use(createCrmRoutes({ getMembersSource, isDebtorMember }));

if (isProduction) {
  app.use(createFrontendRoutes(webIndexPath));
}

app.use(errorHandler);


export const startServer = async () => {
  validateRuntimeConfig({ isProduction });
  try {
    const diagnostic = await diagnosePermissions(await getPostgresPool());
    if (diagnostic.unknownStoredPermissions.length) {
      logger.warn("Se detectaron permisos almacenados fuera del catálogo canónico", { permissions: diagnostic.unknownStoredPermissions });
    }
    if (diagnostic.ungrantedCodePermissions.length) {
      logger.warn("Hay permisos requeridos por código sin concesión en ningún rol activo", { permissions: diagnostic.ungrantedCodePermissions });
    }
  } catch (error) {
    // Availability remains the responsibility of health checks; this audit must
    // not turn a diagnostic catalog mismatch into an unrelated boot outage.
    logger.warn("No se pudo ejecutar el diagnóstico de permisos de startup", { error: error instanceof Error ? error.message : String(error) });
  }
  app.listen(port, () => {
    logger.info("API running", { port });
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
