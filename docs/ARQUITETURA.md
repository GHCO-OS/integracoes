# Arquitetura

## Serviços ativos

| Integração | Código | Superfície | Produção |
|---|---|---|---|
| Google Ads | `services/google/google-ads-mcp` | MCP remoto e GPT Actions | `https://google-ads-mcp.cuiabar.com` |
| Meta | `services/meta/meta-ads-actions` | GPT Actions / OpenAPI | `https://meta-ads-actions.cuiabar.com` |

## Limites

- Google Ads permanece somente leitura para relatórios e GAQL `SELECT`.
- Meta permite leitura e escrita controlada.
- Chamadas Meta de escrita exigem `confirmWrite=CONFIRM_WRITE`; `validateOnly=true` executa apenas simulação.
- Credenciais são injetadas no runtime do Cloudflare e não pertencem ao Git.
