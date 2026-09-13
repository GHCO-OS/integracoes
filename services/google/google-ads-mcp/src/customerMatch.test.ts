import assert from "node:assert/strict";
import test from "node:test";
import { customerMatchOperations, normalizeEmail, normalizePhone } from "./customerMatch.js";

test("normaliza identificadores sem manter PII em claro", async () => {
  assert.equal(normalizeEmail(" Pessoa@Exemplo.COM "), "pessoa@exemplo.com");
  assert.equal(normalizePhone("+55 (65) 99999-9999"), "+5565999999999");
  const [operation] = await customerMatchOperations([{ email: "Pessoa@Exemplo.COM" }]);
  const serialized = JSON.stringify(operation);
  assert.equal(serialized.includes("pessoa@exemplo.com"), false);
  assert.match(serialized, /[a-f0-9]{64}/);
});

test("remove exige formato E.164 valido", async () => {
  await assert.rejects(customerMatchOperations([{ phone: "65999999999" }], "remove"), /E\.164/);
});
