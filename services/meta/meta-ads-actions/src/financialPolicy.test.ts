import assert from "node:assert/strict";
import test from "node:test";
import { assertFinancialPolicy, isFinancialOperation } from "./worker.js";

test("libera conteudo e relacionamento sem confirmacao", () => {
  assert.equal(isFinancialOperation("/actions/create-page-post", { message: "Nova publicacao" }), false);
  assert.doesNotThrow(() => assertFinancialPolicy("/actions/reply-comment", { message: "Obrigado!" }));
});

test("bloqueia orcamento, cobranca e ativacao sem confirmacao financeira", () => {
  for (const input of [{ daily_budget: 1000 }, { funding_source: "123" }, { status: "ACTIVE" }]) {
    assert.equal(isFinancialOperation("/actions/meta-graph-request-v2", input), true);
    assert.throws(() => assertFinancialPolicy("/actions/meta-graph-request-v2", input), /CONFIRM_META_FINANCIAL/);
  }
});

test("permite financeiro com confirmacao dedicada ou simulacao", () => {
  assert.doesNotThrow(() => assertFinancialPolicy("/actions/create-full-meta-campaign-v2", { daily_budget: 1000, confirmFinancial: "CONFIRM_META_FINANCIAL" }));
  assert.doesNotThrow(() => assertFinancialPolicy("/actions/create-full-meta-campaign-v2", { daily_budget: 1000, validateOnly: true }));
});
