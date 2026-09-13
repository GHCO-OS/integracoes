import assert from "node:assert/strict";
import test from "node:test";
import { assertMutationConfirmed, containsRemove } from "./mutationGuard.js";

const createOperation = [{ campaignOperation: { create: { name: "Teste" } } }];
const removeOperation = [{ campaignOperation: { remove: "customers/123/campaigns/456" } }];

test("validateOnly permite simulacao sem frase", () => {
  assert.doesNotThrow(() => assertMutationConfirmed(createOperation, true));
});

test("escrita exige frase de escrita", () => {
  assert.throws(() => assertMutationConfirmed(createOperation, false), /CONFIRM_GOOGLE_ADS_WRITE/);
  assert.doesNotThrow(() => assertMutationConfirmed(createOperation, false, "CONFIRM_GOOGLE_ADS_WRITE"));
});

test("remove exige frase de exclusao", () => {
  assert.equal(containsRemove(removeOperation), true);
  assert.throws(
    () => assertMutationConfirmed(removeOperation, false, "CONFIRM_GOOGLE_ADS_WRITE"),
    /CONFIRM_GOOGLE_ADS_DELETE/
  );
  assert.doesNotThrow(() => assertMutationConfirmed(removeOperation, false, "CONFIRM_GOOGLE_ADS_DELETE"));
});

test("lista vazia ou excessiva e bloqueada", () => {
  assert.throws(() => assertMutationConfirmed([], true), /entre 1 e 1000/);
  assert.throws(() => assertMutationConfirmed(Array.from({ length: 1001 }, () => createOperation[0]), true), /entre 1 e 1000/);
});
