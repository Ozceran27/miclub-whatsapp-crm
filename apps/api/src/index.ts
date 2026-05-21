import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../..");

dotenv.config({ path: path.join(repoRoot, ".env") });

import express from "express";
import cors from "cors";
import type { Member, PrepareMessagesRequest, PreparedMessage } from "@miclub/shared";
import { members as mockMembers, templates } from "./data/mockData.js";
import { buildWaLink, interpolateTemplate, normalizeArPhone } from "./services/messages.js";
import db from "./lib/sqlite.js";
import { getGoogleSheetsConfig, getMembersFromGoogleSheets, SHEET_NAMES, type SyncStatus } from "./services/googleSheets.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);
app.use(cors());
app.use(express.json());

const jsonError = (res: express.Response, status: number, message: string) =>
  res.status(status).json({ error: true, message });

const runDb = (query: string, params: unknown[] = []): Promise<void> =>
  new Promise((resolve, reject) => {
    db.run(query, params, (err) => (err ? reject(err) : resolve()));
  });

const allDb = <T>(query: string, params: unknown[] = []): Promise<T[]> =>
  new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => (err ? reject(err) : resolve(rows as T[])));
  });

let lastSyncAt: string | undefined;
let lastSyncError: string | undefined;

const getMembersSource = async (): Promise<{ members: Member[]; syncStatus: SyncStatus }> => {
  const config = getGoogleSheetsConfig();

  if (!config.enabled) {
    lastSyncError = undefined;
    return {
      members: mockMembers,
      syncStatus: { source: "mock", enabled: false, sheets: SHEET_NAMES }
    };
  }

  if (!config.credentialsPresent) {
    lastSyncError = "Google Sheets está habilitado pero faltan credenciales. Usando datos mock.";
    console.warn(lastSyncError);
    return {
      members: mockMembers,
      syncStatus: { source: "mock", enabled: true, sheets: SHEET_NAMES, error: lastSyncError }
    };
  }

  try {
    const googleMembers = await getMembersFromGoogleSheets();
    lastSyncAt = new Date().toISOString();
    lastSyncError = undefined;

    return {
      members: googleMembers,
      syncStatus: { source: "google_sheets", enabled: true, sheets: SHEET_NAMES, lastSyncAt }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido al sincronizar con Google Sheets.";
    lastSyncError = `Google Sheets falló, usando datos mock. ${message}`;
    console.warn(lastSyncError);
    return {
      members: mockMembers,
      syncStatus: { source: "mock", enabled: true, sheets: SHEET_NAMES, lastSyncAt, error: lastSyncError }
    };
  }
};

const normalizeFeeToArs = (fee: number | undefined): number => {
  if (typeof fee !== "number" || Number.isNaN(fee)) return 0;
  if (fee === 0) return 0;
  return Math.abs(fee) < 1000 ? fee * 1000 : fee;
};

const byKey = (members: Member[], getter: (m: Member) => string): Record<string, number> =>
  members.reduce<Record<string, number>>((acc, member) => {
    const key = getter(member) || "Sin datos";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

app.get("/health", (_req, res) => res.json({ ok: true, service: "miclub-api" }));
app.get("/members", async (_req, res) => {
  try {
    const { members } = await getMembersSource();
    res.json(members);
  } catch {
    jsonError(res, 500, "No se pudo obtener la lista de miembros.");
  }
});

app.get("/debtors", async (_req, res) => {
  try {
    const { members } = await getMembersSource();
    res.json(members.filter((m) => m.estado === "Adeudando"));
  } catch {
    jsonError(res, 500, "No se pudo obtener la lista de deudores.");
  }
});

app.get("/summary", async (_req, res) => {
  try {
    const { members } = await getMembersSource();
    const debtors = members.filter((m) => m.estado === "Adeudando");
    res.json({
      totalMembers: members.length,
      totalDebtors: debtors.length,
      totalBySheet: byKey(members, (m) => m.sourceSheet),
      debtorsBySheet: byKey(debtors, (m) => m.sourceSheet),
      totalByActivity: byKey(members, (m) => m.actividad ?? "Sin actividad"),
      debtorsByActivity: byKey(debtors, (m) => m.actividad ?? "Sin actividad"),
      totalEstimatedDebt: debtors.reduce((sum, d) => sum + normalizeFeeToArs(d.cuota), 0)
    });
  } catch {
    jsonError(res, 500, "No se pudo obtener el resumen.");
  }
});

app.get("/sync-status", async (_req, res) => {
  try {
    const { syncStatus } = await getMembersSource();
    res.json(syncStatus);
  } catch {
    jsonError(res, 500, "No se pudo obtener el estado de sincronización.");
  }
});

app.get("/templates", (_req, res) => res.json(templates));

app.get("/history", async (_req, res) => {
  try {
    const rows = await allDb<PreparedMessage & { nombre: string; telefono: string; estado: string }>(
      "SELECT memberId, mensaje as message, waLink, createdAt, telefono as phone FROM message_history ORDER BY datetime(createdAt) DESC LIMIT 100"
    );
    res.json(rows);
  } catch {
    jsonError(res, 500, "No se pudo obtener el historial.");
  }
});

app.post("/prepare-messages", async (req, res) => {
  const body = req.body as Partial<PrepareMessagesRequest>;

  if (!Array.isArray(body.memberIds) || body.memberIds.length === 0) {
    return jsonError(res, 400, "memberIds debe ser un array no vacío.");
  }

  if (typeof body.message !== "string" || body.message.trim().length === 0) {
    return jsonError(res, 400, "message debe ser un string no vacío.");
  }

  const { members } = await getMembersSource();
  const selected = members.filter((m) => body.memberIds?.includes(m.id));
  const nonDebtors = selected.filter((m) => m.estado !== "Adeudando");

  if (selected.length === 0) {
    return jsonError(res, 400, "No se encontraron miembros válidos para preparar mensajes.");
  }

  if (nonDebtors.length > 0) {
    return jsonError(res, 400, "Solo se pueden preparar mensajes para miembros con estado Adeudando.");
  }

  try {
    const prepared: PreparedMessage[] = [];

    for (const member of selected) {
      const message = interpolateTemplate(body.message, member);
      const phone = normalizeArPhone(member.telefono);
      const waLink = buildWaLink(phone, message);
      const createdAt = new Date().toISOString();

      await runDb(
        "INSERT INTO message_history (memberId, nombre, telefono, mensaje, waLink, estado, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [member.id, `${member.nombre} ${member.apellido}`, phone, message, waLink, "prepared", createdAt]
      );

      prepared.push({ memberId: member.id, phone, message, waLink, createdAt });
    }

    res.json(prepared);
  } catch {
    jsonError(res, 500, "No se pudieron preparar los mensajes.");
  }
});

app.listen(port, () => {
  console.log(`API running at http://localhost:${port}`);
});
