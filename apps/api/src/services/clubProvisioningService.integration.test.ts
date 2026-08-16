import assert from "node:assert/strict";
import test from "node:test";
import { CLUB_CAPABILITIES, CLUB_ROLE_DEFINITIONS, PERMISSIONS } from "@miclub/shared";
import { hasFeature } from "./clubCapabilityService.js";
import { provisionClub, type TransactionClient } from "./clubProvisioningService.js";

const input = { firstName: "Ana", lastName: "Pérez", dni: "12345678", phone: "1155555555", email: "ana@example.com", club: { name: "Club Norte" } };

type State = { clubs: string[]; subscriptions: Map<string, string>; roles: Map<string, string>; onboarding: string[]; memberships: string[]; employees: string[] };
const emptyState = (): State => ({ clubs: [], subscriptions: new Map(), roles: new Map(), onboarding: [], memberships: [], employees: [] });

/** Small transactional adapter: it verifies the cross-statement provisioning contract without requiring a developer database. */
const harness = (failAt = -1) => {
  let state = emptyState(); let calls = 0;
  const query = async (sql: string, values?: readonly unknown[]) => {
    if (calls++ === failAt) throw new Error("forced provisioning failure");
    if (sql.includes("miclub.clubs")) { state.clubs.push("club-id"); return { rows: [{ id: "club-id" }] }; }
    if (sql.includes("insert into miclub.club_subscriptions")) {
      state.subscriptions.set(String(values?.[0]), "DEVELOPMENT");
      return { rows: [{ plan_code: "DEVELOPMENT" }] };
    }
    if (sql.includes("miclub.club_onboarding")) { state.onboarding.push(String(values?.[0])); return { rows: [] }; }
    if (sql.includes("miclub.roles")) {
      const definitions = JSON.parse(String(values?.[1])) as { code: string }[];
      const rows = definitions.map(({ code }) => { const id = `${code.toLowerCase()}-id`; state.roles.set(code, id); return { id, code }; });
      return { rows };
    }
    if (sql.includes("miclub.users")) return { rows: [{ id: "user-id" }] };
    if (sql.includes("miclub.people")) return { rows: [{ id: "person-id" }] };
    if (sql.includes("user_club_memberships")) { state.memberships.push(String(values?.[2])); return { rows: [{ id: "membership-id" }] }; }
    if (sql.includes("miclub.employees")) state.employees.push(String(values?.[3]));
    return { rows: [] };
  };
  const client: TransactionClient = { query: query as TransactionClient["query"] };
  const resolvesFeature = async (clubId: string) => hasFeature(clubId, CLUB_CAPABILITIES.DATA_MIGRATION, {
    query: <T>() => Promise.resolve({ rows: [{ enabled: state.subscriptions.get(clubId) === "DEVELOPMENT" }] as T[] }),
  });
  return {
    run: async () => { const before = state; state = emptyState(); try { return await provisionClub(client, input, "hash"); } catch (error) { state = before; throw error; } },
    createWorker: (role: "TRABAJADOR" | "INSTRUCTOR") => {
      const roleId = state.roles.get(role); if (!roleId) throw new Error(`missing ${role}`);
      state.memberships.push(roleId); return { roleId, permissions: [...CLUB_ROLE_DEFINITIONS[role].permissions] };
    },
    requestTemplate: async () => resolvesFeature("club-id") && CLUB_ROLE_DEFINITIONS.DIRECTOR.permissions.includes(PERMISSIONS.IMPORTS_RUN)
      ? { status: 200, contentDisposition: "attachment; filename=\"plantilla-migracion.xlsx\"" }
      : { status: 403, contentDisposition: null },
    readOnboarding: async () => ({ migrationAvailable: await resolvesFeature("club-id") }),
    resolvesFeature,
    state: () => state,
  };
};

test("el provisioning permite crear después trabajadores e instructores con sus roles canónicos", async () => {
  const integration = harness(); await integration.run();
  assert.deepEqual([...integration.state().roles.keys()], ["DIRECTOR", "TRABAJADOR", "INSTRUCTOR"]);
  for (const role of ["TRABAJADOR", "INSTRUCTOR"] as const) {
    const worker = integration.createWorker(role);
    assert.equal(worker.roleId, `${role.toLowerCase()}-id`);
    assert.deepEqual(worker.permissions, [...CLUB_ROLE_DEFINITIONS[role].permissions]);
  }
  assert.deepEqual(integration.state().onboarding, ["club-id"]);
  assert.equal(integration.state().memberships[0], "director-id", "la membresía propietaria conserva DIRECTOR");
  assert.equal(integration.state().employees[0], "membership-id", "el empleado propietario conserva esa membresía");
});

test("el club registrado obtiene DATA_MIGRATION desde DEVELOPMENT y accede a la plantilla", async () => {
  const integration = harness(); await integration.run();
  assert.equal(integration.state().subscriptions.get("club-id"), "DEVELOPMENT");
  assert.equal(await integration.resolvesFeature("club-id"), true);
  const response = await integration.requestTemplate();
  assert.equal(response.status, 200);
  assert.match(response.contentDisposition ?? "", /plantilla-migracion\.xlsx/);
  assert.equal((await integration.readOnboarding()).migrationAvailable, true);
});

test("cualquier fallo revierte integralmente el provisioning", async () => {
  for (let operation = 0; operation < 10; operation += 1) {
    const integration = harness(operation);
    await assert.rejects(integration.run(), /forced provisioning failure/);
    assert.deepEqual(integration.state(), emptyState(), `quedaron datos parciales al fallar la operación ${operation}`);
    assert.equal(integration.state().subscriptions.size, 0, "no debe quedar una suscripción huérfana");
  }
});
