import assert from "node:assert/strict";
import test from "node:test";
import { ROLE_DEFAULT_PERMISSIONS } from "@miclub/shared";
import { provisionClub, type TransactionClient } from "../services/clubProvisioningService.js";
import { RegistrationError, validateRegistration } from "./registrationService.js";

const valid = { firstName: " Ana ", lastName: " Pérez ", dni: "12.345.678", phone: "+54 11 5555-5555", email: " ANA@Example.COM ", password: "segura12345", club: { name: " Club Norte " } };

test("validateRegistration normaliza todos los datos públicos", () => {
  assert.deepEqual(validateRegistration(valid), { ...valid, firstName: "Ana", lastName: "Pérez", dni: "12345678", phone: "+54 11 5555-5555", email: "ana@example.com", club: { name: "Club Norte" } });
});

test("validateRegistration exige identidad, contacto, club y contraseña robusta", () => {
  for (const patch of [{ firstName: "" }, { dni: "abc" }, { phone: "1" }, { email: "mal" }, { password: "sin-numeros" }]) {
    assert.throws(() => validateRegistration({ ...valid, ...patch }), RegistrationError);
  }
});

const input = { firstName: "Ana", lastName: "Pérez", dni: "12345678", phone: "1155555555", email: "ana@example.com", club: { name: "Club Norte" } };
function fakeClient(failAt = -1) {
  const calls: { sql: string; values?: readonly unknown[] }[] = [];
  const client: TransactionClient = { query: async (sql, values) => {
    const index = calls.length; calls.push({ sql, values });
    if (index === failAt) throw new Error(`falló ${index}`);
    if (sql.includes("miclub.clubs")) return { rows: [{ id: "club-id" }] } as never;
    if (sql.includes("miclub.club_subscriptions")) return { rows: [{ plan_code: "FREE" }] } as never;
    if (sql.includes("miclub.roles")) return { rows: [
      { id: "director-role-id", code: "DIRECTOR" }, { id: "worker-role-id", code: "TRABAJADOR" }, { id: "instructor-role-id", code: "INSTRUCTOR" },
    ] } as never;
    if (sql.includes("miclub.users")) return { rows: [{ id: "user-id" }] } as never;
    if (sql.includes("miclub.people")) return { rows: [{ id: "person-id" }] } as never;
    if (sql.includes("user_club_memberships")) return { rows: [{ id: "membership-id" }] } as never;
    return { rows: [] } as never;
  } };
  return { client, calls };
}

test("bootstrap crea integralmente Director, persona, usuario, membresía, empleo y sectores", async () => {
  const { client, calls } = fakeClient();
  const result = await provisionClub(client, input, "hash");
  assert.deepEqual(result, { clubId: "club-id", userId: "user-id", personId: "person-id", membershipId: "membership-id" });
  const sql = calls.map(({ sql }) => sql).join("\n");
  const tenantBinding = calls.find(({ sql: statement }) => statement.includes("set_config('app.club_id'"));
  assert.deepEqual(tenantBinding?.values, ["club-id"]);
  assert.ok(calls.indexOf(tenantBinding!) < calls.findIndex(({ sql: statement }) => statement.includes("miclub.club_subscriptions")));
  assert.match(sql, /miclub\.roles[\s\S]*jsonb_to_recordset/);
  assert.equal(sql.match(/insert into miclub\.roles/g)?.length, 1, "debe existir un único Director");
  const roleDefinitions = JSON.parse(String(calls.find(({ sql: statement }) => statement.includes("miclub.roles"))?.values?.[1]));
  assert.deepEqual(roleDefinitions.map(({ code }: { code: string }) => code), ["DIRECTOR", "TRABAJADOR", "INSTRUCTOR"]);
  assert.match(sql, /miclub\.people/); assert.match(sql, /miclub\.users/);
  assert.match(sql, /miclub\.user_club_memberships/); assert.doesNotMatch(sql, /miclub\.club_memberships/);
  assert.match(sql, /miclub\.employees/);
  assert.match(sql, /employment_start_date, has_fixed_compensation, fixed_compensation_amount, fixed_compensation_frequency[\s\S]*current_date, false, null, null/);
  assert.match(sql, /Administración/); assert.match(sql, /Tesorería/); assert.match(sql, /Áreas Comunes/); assert.match(sql, /is_system/);
  assert.match(sql, /miclub\.club_onboarding[\s\S]*NOT_STARTED/);
  assert.match(sql, /miclub\.club_subscriptions[\s\S]*code = 'FREE'[\s\S]*commercial_class = 'free'/);
  assert.doesNotMatch(sql, /code = 'DEVELOPMENT'/);
  assert.doesNotMatch(sql, /"onboarding"/);
  assert.equal(calls.find(({ sql: statement }) => statement.includes("user_club_memberships"))?.values?.[2], "director-role-id");
  assert.deepEqual(calls.find(({ sql }) => sql.includes("user_club_memberships"))?.values?.[3], [...ROLE_DEFAULT_PERMISSIONS.DIRECTOR]);
});

test("cada fallo de bootstrap se propaga para que registrationService haga rollback", async () => {
  for (let operation = 0; operation < 11; operation += 1) {
    const { client, calls } = fakeClient(operation);
    await assert.rejects(provisionClub(client, input, "hash"), new RegExp(`falló ${operation}`));
    assert.equal(calls.length, operation + 1, `no debe ejecutar suboperaciones después del fallo ${operation}`);
  }
});

test("los códigos públicos de conflicto de correo y DNI permanecen estables", () => {
  assert.equal(new RegistrationError("email_exists", "correo").code, "email_exists");
  assert.equal(new RegistrationError("dni_exists", "dni").code, "dni_exists");
});
