import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ROLE_DEFAULT_PERMISSIONS } from "@miclub/shared";
import { hashPassword, verifyPassword } from "../../auth/passwordHasher.js";
import { validateWorkerMutation, WorkerMutationError } from "./workerMutationService.js";

const base = { firstName: " Ana ", lastName: " Pérez ", dni: "12.345.678", email: "ANA@EXAMPLE.COM", password: "segura12345", role: "TRABAJADOR", paymentMode: "VARIABLE" };
test("normaliza DNI/correo y exige las reglas públicas de contraseña", async () => {
  const input = validateWorkerMutation(base, true);
  assert.equal(input.dni, "12345678"); assert.equal(input.email, "ana@example.com");
  assert.throws(() => validateWorkerMutation({ ...base, password: "demasiadocorta" }, true), WorkerMutationError);
  const hash = await hashPassword(input.password!); assert.notEqual(hash, input.password); assert.equal(await verifyPassword(input.password!, hash), true);
});
test("FIXED y VARIABLE respetan la invariantes de monto", () => {
  assert.equal(validateWorkerMutation({ ...base, paymentMode: "FIXED", monthlyFixedAmount: 0 }, true).monthlyFixedAmount, 0);
  assert.throws(() => validateWorkerMutation({ ...base, paymentMode: "FIXED", monthlyFixedAmount: -1 }, true));
  assert.throws(() => validateWorkerMutation({ ...base, paymentMode: "VARIABLE", monthlyFixedAmount: 1 }, true));
});
test("roles operativos no heredan privilegios administrativos de Director", () => {
  for (const role of ["TRABAJADOR", "INSTRUCTOR"] as const) {
    assert.ok(!ROLE_DEFAULT_PERMISSIONS[role].includes("workers.manage" as never));
    assert.ok(!ROLE_DEFAULT_PERMISSIONS[role].includes("club:manage" as never));
  }
});
test("SQL contiene auditoría previa, gate, compatibilidad y verificaciones", () => {
  const sql=readFileSync(new URL("../../../../../docs/dbeaver-workers-payment-and-roles.sql",import.meta.url),"utf8");
  assert.match(sql,/AUDITORÍA \(solo lectura\)/); assert.match(sql,/AUDIT_GATE_FAILED/); assert.match(sql,/COMPATIBILIDAD TEMPORAL/);
  assert.match(sql,/upper\(role\.code\) in \('TRABAJADOR', 'INSTRUCTOR'\)/); assert.match(sql,/club:manage/);
  assert.match(sql,/lower\(existing\.code\) = lower\(value\.code\)/);
  const executableSql = sql.replace(/^\s*--.*$/gm, "");
  assert.doesNotMatch(executableSql,/on conflict\s*\(club_id,\s*code\)/i);
});
