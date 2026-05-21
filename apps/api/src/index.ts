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

app.get("/health", (_req, res) => res.json({ ok: true, service: "miclub-api" }));
app.get("/debtors", (_req, res) => res.json(members.filter((m) => m.estado === "Adeudando")));
app.get("/templates", (_req, res) => res.json(templates));

app.post("/prepare-messages", (req, res) => {
  const body = req.body as PrepareMessagesRequest;
  const selected = members.filter((m) => body.memberIds.includes(m.id));

  const prepared: PreparedMessage[] = selected.map((member) => {
    const message = interpolateTemplate(body.message, member);
    const phone = normalizeArPhone(member.telefono);
    const waLink = buildWaLink(phone, message);
    const createdAt = new Date().toISOString();

    db.run(
      "INSERT INTO message_history (memberId, nombre, telefono, mensaje, waLink, estado, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [member.id, `${member.nombre} ${member.apellido}`, phone, message, waLink, "prepared", createdAt]
    );

    return { memberId: member.id, phone, message, waLink, createdAt };
  });

  res.json(prepared);
});

app.listen(port, () => {
  console.log(`API running at http://localhost:${port}`);
});
