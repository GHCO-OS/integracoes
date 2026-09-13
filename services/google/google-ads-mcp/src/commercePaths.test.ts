import assert from "node:assert/strict";
import test from "node:test";
import { assertAllowedPath, BusinessProfileClient } from "./businessProfileClient.js";
import { assertMerchantPath, MerchantClient } from "./merchantClient.js";

test("Merchant libera produtos, inventario, promocoes e diagnosticos", () => {
  const paths = [
    "products/v1/accounts/123/productInputs:insert",
    "inventories/v1/accounts/123/products/en~BR~sku/localInventories:insert",
    "promotions/v1/accounts/123/promotions:insert",
    "issueresolution/v1/accounts/123:renderaccountissues",
    "productstudio/v1alpha/accounts/123:generateProductTextSuggestions"
  ];
  for (const path of paths) assert.equal(assertMerchantPath(path), path);
});

test("Merchant bloqueia hosts, travessia e APIs fora da lista", () => {
  for (const path of ["https://example.com/x", "products/v1/../secrets", "drive/v3/files"]) {
    assert.throws(() => assertMerchantPath(path));
  }
});

test("Business Profile libera cardapio, atributos, posts, midia e desempenho", () => {
  const paths = [
    "accounts/1/locations/2/foodMenus",
    "accounts/1/locations/2/localPosts",
    "accounts/1/locations/2/media",
    "locations/2/attributes",
    "locations/2/searchkeywords/impressions/monthly"
  ];
  for (const path of paths) assert.equal(assertAllowedPath(path), path);
});

test("Business Profile continua bloqueando administradores e convites", () => {
  assert.throws(() => assertAllowedPath("accounts/1/admins"));
  assert.throws(() => assertAllowedPath("accounts/1/invitations"));
});

test("simula insercao de produto sem token nem chamada externa", async () => {
  const client = new MerchantClient({ clientId: "test", clientSecret: "test" });
  const result = await client.rawRequest("POST", "products/v1/accounts/123/productInputs:insert", { dataSource: "accounts/123/dataSources/456" }, { offerId: "SKU-1", title: "Produto teste" }, true);
  assert.deepEqual(result, {
    ok: true,
    validateOnly: true,
    method: "POST",
    path: "products/v1/accounts/123/productInputs:insert",
    query: { dataSource: "accounts/123/dataSources/456" },
    body: { offerId: "SKU-1", title: "Produto teste" }
  });
});

test("simula cardapio completo sem alterar a ficha", async () => {
  const client = new BusinessProfileClient({ clientId: "test", clientSecret: "test" });
  const foodMenus = { menus: [{ labels: [{ displayName: "Cardapio", languageCode: "pt-BR" }], sections: [] }] };
  const result = await client.safeRequest("business", "PATCH", "accounts/1/locations/2/foodMenus", {}, foodMenus, true);
  assert.deepEqual(result, { ok: true, validateOnly: true, service: "business", method: "PATCH", path: "accounts/1/locations/2/foodMenus", query: {}, body: foodMenus });
});
