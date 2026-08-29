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
- Deploy ainda não realizado; a versão pública continua dependendo da reconciliação com o Cloudflare.
