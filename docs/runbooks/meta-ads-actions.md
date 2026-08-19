# Meta Ads Actions

## Objetivo

Permitir que um GPT personalizado consulte e opere Meta Graph/Marketing API em modo `read-write-controlled`, com acesso a Ads, Business Manager, Pages, Instagram, WhatsApp Business e catalogos.

## Endpoint

Schema OpenAPI:

```text
https://meta-ads-actions.cuiabar.com/openapi.json
```

Health:

```text
https://meta-ads-actions.cuiabar.com/health
```

## Autenticacao no GPT

No editor do GPT:

1. `Configure`
2. `Actions`
3. `Create new action`
4. Importar schema por URL:

```text
https://meta-ads-actions.cuiabar.com/openapi.json
```

5. Authentication:

```text
API Key
Bearer
```

6. Usar o bearer interno salvo em local restrito.

## Secrets do Worker

Obrigatorias:

- `META_GRAPH_API_VERSION`, default `v25.0`
- `META_ACCESS_TOKEN`
- `META_AD_ACCOUNT_ID`
- `META_ACTIONS_BEARER_TOKEN`

Opcionais para reduzir parametros nas chamadas:

- `META_PAGE_ACCESS_TOKEN`
- `META_PAGE_ID`
- `META_INSTAGRAM_BUSINESS_ACCOUNT_ID`
- `META_BUSINESS_ID`
- `META_WHATSAPP_BUSINESS_ACCOUNT_ID`
- `META_CATALOG_ID`

## Permissoes Meta esperadas

O token da Meta precisa pertencer a um usuario ou system user com acesso aos ativos no Business Manager. Escopos comuns:

- `ads_read`
- `ads_management`
- `business_management`
- `pages_read_engagement`
- `pages_manage_ads`
- `pages_manage_posts`
- `pages_messaging`
- `instagram_basic`
- `instagram_content_publish`
- `whatsapp_business_management`
- `whatsapp_business_messaging`
- `catalog_management`

Validar permissoes efetivas com:

- `GET /actions/permissions`
- `GET /actions/businesses`
- `GET /actions/whatsapp-business-accounts`
- `GET /actions/whatsapp-phone-numbers`
- `GET /actions/catalogs`

## Endpoints principais

- `GET /actions/health`
- `GET /actions/me`
- `GET /actions/permissions`
- `GET /actions/ad-accounts`
- `GET /actions/campaigns`
- `GET /actions/adsets`
- `GET /actions/ads`
- `GET /actions/creatives`
- `GET /actions/insights`
- `GET /actions/businesses`
- `GET /actions/business-profile`
- `GET /actions/business-assets`
- `GET /actions/whatsapp-business-accounts`
- `GET /actions/whatsapp-phone-numbers`
- `GET /actions/whatsapp-phone-number`
- `GET /actions/whatsapp-message-templates`
- `GET /actions/catalogs`
- `GET /actions/catalog-products`
- `POST /actions/meta-graph-request-v2`
- `POST /actions/batch-graph-request`
- `POST /actions/create-full-meta-campaign-v2`

## Estado atual

Publicado como Worker:

- Worker: `meta-ads-actions`
- Dominio: `meta-ads-actions.cuiabar.com`
- OpenAPI: `https://meta-ads-actions.cuiabar.com/openapi.json`
- Codigo-fonte: `services/meta-ads-actions/`

Regra operacional:

- o GPT pode chamar os endpoints publicados com bearer interno;
- escrita real fica protegida pelo bearer e pelos escopos do token Meta;
- permissoes no Business Manager precisam ser concedidas no proprio painel Meta para o usuario/system user que emitiu `META_ACCESS_TOKEN`.
