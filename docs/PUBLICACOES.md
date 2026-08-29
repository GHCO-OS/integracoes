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
