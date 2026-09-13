# Arquitetura

## Serviços ativos

| Integração | Código | Superfície | Produção |
|---|---|---|---|
| Google Ads | `services/google/google-ads-mcp` | MCP remoto e GPT Actions | `https://google-ads-mcp.cuiabar.com` |
| Meta | `services/meta/meta-ads-actions` | GPT Actions / OpenAPI | `https://meta-ads-actions.cuiabar.com` |

## Limites

- Google Ads oferece relatórios por GAQL `SELECT` e mutações controladas por `GoogleAdsService.Mutate`.
- Criação/atualização Google exigem `CONFIRM_GOOGLE_ADS_WRITE`; remoções exigem `CONFIRM_GOOGLE_ADS_DELETE`.
- Meta permite leitura e escrita controlada.
- Chamadas Meta de escrita exigem `confirmWrite=CONFIRM_WRITE`; `validateOnly=true` executa apenas simulação.
- Credenciais são injetadas no runtime do Cloudflare e não pertencem ao Git.
