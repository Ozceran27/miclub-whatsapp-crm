import express from "express";
import cors from "cors";
import type { PrepareMessagesRequest, PreparedMessage } from "@miclub/shared";
import { members, templates } from "./data/mockData.js";
import { buildWaLink, interpolateTemplate, normalizeArPhone } from "./services/messages.js";
import db from "./lib/sqlite.js";

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

app.get("/health", (_req, res) => res.json({ ok: true, service: "miclub-api" }));
app.get("/debtors", (_req, res) => res.json(members.filter((m) => m.estado === "Adeudando")));
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

  const selected = members.filter((m) => body.memberIds?.includes(m.id));

  if (selected.length === 0) {
    return jsonError(res, 400, "No se encontraron miembros válidos para preparar mensajes.");
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
