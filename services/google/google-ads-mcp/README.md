# Google Ads MCP somente leitura

Servidor MCP remoto para instalar no ChatGPT e consultar Google Ads sem expor funcoes de escrita.

## Link MCP

Local:

```text
http://localhost:8788/sse
```

Publico, apos deploy em HTTPS:

```text
https://google-ads-mcp.cuiabar.com/sse
```

Alternativo Streamable HTTP:

```text
https://google-ads-mcp.cuiabar.com/mcp
```

O ChatGPT precisa de uma URL HTTPS acessivel pela internet. O link local serve para validar com um cliente MCP local, mas nao funciona direto na nuvem do ChatGPT.

## Variaveis

Copie `.env.example` para `.env` e preencha:

- `GOOGLE_ADS_CLIENT_ID`
- `GOOGLE_ADS_CLIENT_SECRET`
- `GOOGLE_ADS_REFRESH_TOKEN`
- `GOOGLE_ADS_DEVELOPER_TOKEN`
- `GOOGLE_ADS_CUSTOMER_ID`
- `GOOGLE_ADS_LOGIN_CUSTOMER_ID`, se a conta estiver abaixo de MCC
- `MCP_BEARER_TOKEN`, recomendado ao publicar

O refresh token precisa do escopo OAuth:

```text
https://www.googleapis.com/auth/adwords
```

## Rodar

```bash
npm install
npm run build
npm start
```

Deploy Cloudflare Worker:

```bash
npm run deploy
```

Health check:

```bash
curl http://localhost:8788/health
```

## Ferramentas

- `get_accessible_customers`
- `list_campaigns`
- `get_campaign_metrics`
- `get_ad_groups`
- `get_ads`
- `get_keywords`
- `get_search_terms`
- `get_geo_performance`
- `get_budget_status`
- `run_readonly_gaql`

Todas as ferramentas usam apenas endpoints de leitura. O servidor nao implementa `mutate`, criacao, edicao, pausa, ativacao, exclusao ou alteracao de verba.
