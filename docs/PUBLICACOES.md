# Publicações

## Estado migrado

| Serviço | Worker | Domínio | Estado observado em 2026-08-19 |
|---|---|---|---|
| Google Ads MCP | `google-ads-mcp` | `google-ads-mcp.cuiabar.com` | endpoint público saudável |
| Meta Ads Actions | `meta-ads-actions` | `meta-ads-actions.cuiabar.com` | endpoint público saudável |

## Regra de registro

Cada deploy deve acrescentar data, commit, serviço, ambiente, responsável, resultado do health check e eventual rollback.

O código migrado ainda precisa ser reconciliado com as versões ativas do Cloudflare assim que a autenticação Wrangler for renovada.

## Alteração preparada em 2026-08-29

- Google Ads MCP atualizado para modo `read-write-controlled`.
- Adicionadas mutações genéricas para criação, atualização e remoção.
- Deploy realizado na conta `Cuiabar | GHCO`.
- Worker: `google-ads-mcp`.
- Domínio: `https://google-ads-mcp.cuiabar.com`.
- Cloudflare Version ID: `0475a568-676e-4a4c-886b-64c2231e6286`.
- Health: `ok=true`, modo `read-write-controlled`, API Google Ads `v24`.
- OpenAPI: versão `0.2.0` com `POST /actions/mutate` ativo.
- Segurança: chamada não autenticada de mutação retorna `401`.

## Customer Match e CRM publicado em 2026-08-29

- Customer Match ativado por `OfflineUserDataJob`, com criação, lotes de inclusão/remoção e execução do job.
- Identificadores de email e telefone são normalizados e recebem SHA-256 no Worker; PII em claro não é registrada.
- Cargas de CRM grandes usam chamadas sucessivas de até 10.000 identificadores por lote.
- Upload de conversões offline de clique ativado, com `validateOnly=true` por padrão.
- Escrita exige `CONFIRM_GOOGLE_ADS_WRITE`; remoção exige `CONFIRM_GOOGLE_ADS_DELETE`.
- Worker: `google-ads-mcp`; domínio: `https://google-ads-mcp.cuiabar.com`.
- Cloudflare Version ID: `1ed7bab4-8025-404b-aebf-2b3e5e8d29db`.
- Health após o deploy: `ok=true`, sem secrets ausentes, API Google Ads `v24`.

## Merchant Center preparado em 2026-08-29

- Merchant API adicionada ao mesmo MCP Google Ads.
- Ferramentas de produtos, fontes de dados e relatórios registradas.
- Escrita e exclusão usam confirmações específicas do Merchant.
- Autorização real depende do secret `GOOGLE_MERCHANT_REFRESH_TOKEN` com escopo `content`.
- O Business Profile não foi incluído porque requer aprovação separada do Google.
- Cloudflare Version ID: `b1917c4b-66f9-447d-967f-63aa0f0d3c9e`.
- Health: `ok=true`; `merchantConfigured=false` até concluir o OAuth Merchant.
