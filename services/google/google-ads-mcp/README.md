# Google Ads MCP e GPT Actions

Servidor MCP remoto e API para consultar, criar, atualizar e remover recursos Google Ads com confirmação explícita.

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
- `mutate_google_ads`
- `create_customer_match_job`
- `add_customer_match_users`
- `run_customer_match_job`
- `upload_crm_click_conversions`
- `merchant_list_products`
- `merchant_list_data_sources`
- `merchant_upsert_product`
- `merchant_patch_product`
- `merchant_delete_product`
- `merchant_manage_data_source`
- `merchant_delete_data_source`
- `merchant_search_reports`

## Merchant Center

O Merchant usa a API atual `merchantapi.googleapis.com` e o escopo OAuth `https://www.googleapis.com/auth/content`. Configure `GOOGLE_MERCHANT_REFRESH_TOKEN` e, opcionalmente, `GOOGLE_MERCHANT_ACCOUNT_ID`. Não exige a aprovação especial do Business Profile.

- Escrita: `CONFIRM_GOOGLE_MERCHANT_WRITE`.
- Exclusão: `CONFIRM_GOOGLE_MERCHANT_DELETE`.
- Produtos só podem ser gravados em fontes do tipo API.

## Customer Match, CRM e cargas grandes

- O Customer Match usa `OfflineUserDataJob`: crie o job, envie lotes e depois execute o job.
- Cada chamada aceita ate 10.000 registros. Arquivos grandes devem ser lidos pelo CRM e enviados em chamadas sucessivas; o job pode acumular varios lotes.
- Email e telefone sao normalizados e transformados em SHA-256 dentro do Worker; PII em claro nao e registrada.
- Telefone deve usar E.164. Consentimento `adUserData` e `adPersonalization` e obrigatorio ao criar o job.
- Inclusao exige `CONFIRM_GOOGLE_ADS_WRITE`; remocao exige `CONFIRM_GOOGLE_ADS_DELETE`.
- Conversoes offline do CRM usam validacao por padrao e suportam ate 2.000 conversoes por chamada.
- A conta Google Ads ainda precisa estar elegivel para Customer Match. Upload arbitrario de midia pesada nao faz parte desse fluxo e continua sujeito aos limites de assets da API.

## Escrita e exclusão

A ferramenta `mutate_google_ads` e o endpoint `POST /actions/mutate` usam `GoogleAdsService.Mutate` e aceitam qualquer `MutateOperation` suportada pela versão configurada da API.

- `validateOnly` assume `true` e valida sem executar.
- Criação e atualização reais exigem `confirmWrite=CONFIRM_GOOGLE_ADS_WRITE`.
- Qualquer operação contendo `remove` exige `confirmWrite=CONFIRM_GOOGLE_ADS_DELETE`.
- Cada requisição aceita de 1 a 1000 operações e payload de até 1 MB.
- `partialFailure` assume `false`.
