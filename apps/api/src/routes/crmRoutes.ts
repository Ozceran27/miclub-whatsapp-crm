// legacy-compat: paths raíz del CRM; no renombrar sin migración frontend.
import { randomUUID } from "node:crypto";
import { Router, type Response } from "express";
import type { Member, PrepareMessagesRequest, PreparedMessage, PrepareMessagesValidation } from "@miclub/shared";
import { templates } from "../data/mockData.js";
import { buildWaLink, interpolateTemplate, normalizeArPhone } from "../services/messages.js";
import { createCrmTemplate, deleteCrmTemplate, findCrmDuplicatePreparedMessages, getCrmContactedRecent, getCrmHistory, insertCrmHistory, listCrmTemplates, replaceCrmDefaultTemplates, updateCrmHistoryStatus, updateCrmTemplate } from "../services/crmService.js";

const jsonError = (res: Response, status: number, message: string) =>
  res.status(status).json({ error: true, message });

const ALLOWED_TEMPLATE_VARIABLES = new Set(["{nombre}", "{apellido}", "{actividad}", "{cuota}", "{modalidad}", "{instructor}"]);

const validateTemplateInput = (name: unknown, body: unknown): string | null => {
  if (typeof name !== "string" || name.trim().length === 0) return "name no puede estar vacío.";
  if (typeof body !== "string" || body.trim().length === 0) return "body no puede estar vacío.";
  const variables = body.match(/\{\w+\}/g) ?? [];
  const invalidVariables = variables.filter((variable) => !ALLOWED_TEMPLATE_VARIABLES.has(variable.toLowerCase()));
  if (invalidVariables.length > 0) return `Variables inválidas en body: ${Array.from(new Set(invalidVariables)).join(", ")}.`;
  return null;
};

const unresolvedTemplateVariables = (message: string): string[] => {
  const variables = message.match(/\{\w+\}/g) ?? [];

  return Array.from(
    new Set(
      variables
        .map((token) => token.toLowerCase())
        .filter((token) => !ALLOWED_TEMPLATE_VARIABLES.has(token))
    )
  );
};

export const createCrmRoutes = (options: {
  getMembersSource: () => Promise<{ members: Member[] }>;
  isDebtorMember: (member: Member) => boolean;
}) => {
  const router = Router();

  router.get("/templates", async (_req, res) => {
    try {
      res.json(await listCrmTemplates());
    } catch {
      jsonError(res, 500, "No se pudieron obtener las plantillas.");
    }
  });

  router.post("/templates", async (req, res) => {
    const body = req.body as { name?: string; body?: string };
    const validationError = validateTemplateInput(body.name, body.body);
    if (validationError) return jsonError(res, 400, validationError);
    const now = new Date().toISOString();
    const id = randomUUID();
    try {
      const created = await createCrmTemplate(body.name?.trim() ?? "", body.body?.trim() ?? "", id, now);
      res.status(201).json(created);
    } catch {
      jsonError(res, 500, "No se pudo crear la plantilla.");
    }
  });

  router.patch("/templates/:id", async (req, res) => {
    const { id } = req.params;
    const body = req.body as { name?: string; body?: string };
    const validationError = validateTemplateInput(body.name, body.body);
    if (validationError) return jsonError(res, 400, validationError);
    try {
      const now = new Date().toISOString();
      const updated = await updateCrmTemplate(id, body.name?.trim() ?? "", body.body?.trim() ?? "", now);
      if (!updated) return jsonError(res, 404, "Plantilla no encontrada.");
      res.json(updated);
    } catch {
      jsonError(res, 500, "No se pudo actualizar la plantilla.");
    }
  });

  router.delete("/templates/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const deleteResult = await deleteCrmTemplate(id);
      if (deleteResult === "missing") return jsonError(res, 404, "Plantilla no encontrada.");
      if (deleteResult === "default") return jsonError(res, 400, "No se pueden eliminar plantillas predeterminadas.");
      res.status(204).send();
    } catch {
      jsonError(res, 500, "No se pudo eliminar la plantilla.");
    }
  });

  router.post("/templates/reset-defaults", async (_req, res) => {
    const now = new Date().toISOString();
    try {
      res.json(await replaceCrmDefaultTemplates(templates, now));
    } catch {
      jsonError(res, 500, "No se pudieron restaurar las plantillas predeterminadas.");
    }
  });

  router.get("/history", async (req, res) => {
    const pageRaw = Number.parseInt(String(req.query.page ?? "1"), 10);
    const pageSizeRaw = Number.parseInt(String(req.query.pageSize ?? "20"), 10);
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const pageSize = Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ? Math.min(pageSizeRaw, 20) : 20;

    try {
      res.json(await getCrmHistory(page, pageSize));
    } catch {
      jsonError(res, 500, "No se pudo obtener el historial.");
    }
  });

  router.get("/contacted-recent", async (_req, res) => {
    const windowDays = 30;
    const sinceDate = new Date();
    sinceDate.setUTCDate(sinceDate.getUTCDate() - windowDays);
    const since = sinceDate.toISOString();

    try {
      res.json(await getCrmContactedRecent(since, windowDays));
    } catch {
      jsonError(res, 500, "No se pudo obtener contactos recientes.");
    }
  });

  router.post("/prepare-messages/validate", async (req, res) => {
    const body = req.body as Partial<PrepareMessagesRequest>;
    if (!Array.isArray(body.memberIds) || body.memberIds.length === 0) return jsonError(res, 400, "memberIds debe ser un array no vacío.");
    if (typeof body.message !== "string" || body.message.trim().length === 0) return jsonError(res, 400, "message debe ser un string no vacío.");
    const { members } = await options.getMembersSource();
    const selected = members.filter((m) => body.memberIds?.includes(m.id));
    const missingPhoneMembers = selected.filter((m) => normalizeArPhone(m.telefono).length === 0).map((m) => ({ memberId: m.id, nombre: `${m.nombre} ${m.apellido}` }));
    const unresolvedVariables = unresolvedTemplateVariables(body.message);
    const placeholders = selected.slice(0, 3).map((m) => ({ memberId: m.id, nombre: `${m.nombre} ${m.apellido}`, actividad: m.actividad, cuota: m.cuota, phone: m.telefono }));
    const duplicateRows = selected.length === 0 ? [] : await findCrmDuplicatePreparedMessages(selected.map((m) => m.id));
    const seen = new Set<string>();
    const duplicates = duplicateRows.filter((r) => { if (seen.has(r.memberId)) return false; seen.add(r.memberId); return true; });
    const sample = selected[0] ? interpolateTemplate(body.message, selected[0]) : body.message;
    const response: PrepareMessagesValidation = { selectedCount: selected.length, selectedPreview: placeholders, missingPhoneMembers, unresolvedVariables, duplicates, sampleMessage: sample };
    res.json(response);
  });

  router.post("/prepare-messages", async (req, res) => {
    const body = req.body as Partial<PrepareMessagesRequest>;

    if (!Array.isArray(body.memberIds) || body.memberIds.length === 0) {
      return jsonError(res, 400, "memberIds debe ser un array no vacío.");
    }

    if (typeof body.message !== "string" || body.message.trim().length === 0) {
      return jsonError(res, 400, "message debe ser un string no vacío.");
    }

    const { members } = await options.getMembersSource();
    const selected = members.filter((m) => body.memberIds?.includes(m.id));
    const nonDebtors = selected.filter((m) => !options.isDebtorMember(m));

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
        if (!phone) continue;
        const waLink = buildWaLink(phone, message);
        const createdAt = new Date().toISOString();

        const created = await insertCrmHistory({ memberId: member.id, nombre: `${member.nombre} ${member.apellido}`, actividad: member.actividad, phone, message, waLink, status: "prepared", createdAt, templateName: body.templateName?.trim() || null });

        prepared.push(created);
      }

      res.json(prepared);
    } catch {
      jsonError(res, 500, "No se pudieron preparar los mensajes.");
    }
  });

  router.patch("/history/:id/status", async (req, res) => {
    const id = Number(req.params.id);
    const body = req.body as { status?: "prepared" | "opened" | "sent_manual" | "skipped"; note?: string | null };
    const validStatuses = new Set(["prepared", "opened", "sent_manual", "skipped"]);

    if (!Number.isInteger(id) || id <= 0) return jsonError(res, 400, "id inválido.");
    if (!body.status || !validStatuses.has(body.status)) return jsonError(res, 400, "status inválido.");

    try {
      const updated = await updateCrmHistoryStatus(id, body.status, body.note ?? null);
      if (!updated) return jsonError(res, 404, "Mensaje no encontrado.");
      res.json(updated);
    } catch {
      jsonError(res, 500, "No se pudo actualizar el estado del mensaje.");
    }
  });

  return router;
};
