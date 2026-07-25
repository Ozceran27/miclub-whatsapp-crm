import assert from "node:assert/strict";
import test from "node:test";
import { RegistrationError, validateRegistration } from "./registrationService.js";

test("validateRegistration normaliza los datos públicos", () => {
  assert.deepEqual(validateRegistration("  Club   Norte ", " OWNER@Example.COM ", "segura12345"), {
    clubName: "Club Norte", email: "owner@example.com", password: "segura12345"
  });
});

test("validateRegistration exige contraseña robusta y datos acotados", () => {
  assert.throws(() => validateRegistration("C", "mal", "123"), RegistrationError);
  assert.throws(() => validateRegistration("Club", "owner@example.com", "solonumeros1".replace(/\d/, "")), /letras y números/);
});
