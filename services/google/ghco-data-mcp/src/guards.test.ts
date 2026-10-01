import assert from "node:assert/strict";
import test from "node:test";
import { assertIdentifier, assertReadonlySql, requireDeleteConfirmation, requireWriteConfirmation } from "./guards.js";

test("aceita consultas somente leitura", () => assert.doesNotThrow(() => assertReadonlySql("WITH x AS (SELECT 1) SELECT * FROM x")));
test("bloqueia DML em ferramenta de leitura", () => assert.throws(() => assertReadonlySql("DELETE FROM x WHERE true")));
test("escrita real exige confirmacao", () => assert.throws(() => requireWriteConfirmation(false)));
test("simulacao nao exige confirmacao", () => assert.doesNotThrow(() => requireWriteConfirmation(true)));
test("exclusao real exige confirmacao especifica", () => assert.throws(() => requireDeleteConfirmation(false, "CONFIRM_GHCO_DATA_WRITE")));
test("valida identificadores BigQuery", () => {
  assert.equal(assertIdentifier("crm_clientes", "tableId"), "crm_clientes");
  assert.throws(() => assertIdentifier("crm-clientes", "tableId"));
});
