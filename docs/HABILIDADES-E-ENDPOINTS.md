# Habilidades e endpoints

## Google Ads

- Endpoint base: `https://google-ads-mcp.cuiabar.com`
- MCP remoto: `/sse` e `/mcp`
- Contrato GPT: `/openapi.json`
- Saúde: `/health`
- Capacidades de leitura: campanhas, desempenho, grupos, anúncios, palavras-chave, termos de busca, geografia, orçamentos e GAQL `SELECT`.
- Capacidades de escrita: criação, atualização e remoção de qualquer recurso aceito por `GoogleAdsService.Mutate`.
- GPT Action: `POST /actions/mutate`; MCP: `mutate_google_ads`.
- Escrita real exige confirmação explícita; simulação é o comportamento padrão.

## Meta

- Endpoint base: `https://meta-ads-actions.cuiabar.com`
- Contrato GPT: `/openapi.json`
- Saúde: `/actions/health`
- Capacidades: Ads, Business Manager, Pages, Instagram, WhatsApp Business, catálogos e Graph API.
- Escritas: bloqueadas por padrão; use simulação ou confirmação explícita.

Os detalhes operacionais ficam em `docs/runbooks/`.
