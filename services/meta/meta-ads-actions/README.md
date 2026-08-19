# Meta Ads Actions

API REST para GPT personalizado operar Meta Graph/Marketing API em modo `read-write-controlled`.

Schema OpenAPI:

```text
https://meta-ads-actions.cuiabar.com/openapi.json
```

Autenticacao no GPT:

```text
API Key -> Bearer
```

## Capacidades

- Ads: campanhas, conjuntos, anuncios, criativos, pixels, insights e upload de midia.
- Escrita controlada: `metaGraphRequestV2`, `batchMetaGraphRequest`, `createFullMetaCampaignV2` e criacao de anuncio em ad set existente.
- Business Manager: businesses, assets, paginas, Instagram, contas de anuncio.
- WhatsApp Business: WABAs, numeros, nome verificado, qualidade, status e templates.
- Catalogos: catalogos do Business e produtos.
- Fallback universal: qualquer edge da Graph API pode ser chamado via `metaGraphRequestV2`.

## Secrets e variaveis

Obrigatorias:

- `META_ACCESS_TOKEN`
- `META_AD_ACCOUNT_ID`
- `META_ACTIONS_BEARER_TOKEN`
- `META_GRAPH_API_VERSION`, default `v25.0`

Opcionais, mas recomendadas para Business/WhatsApp/Catalogo:

- `META_PAGE_ACCESS_TOKEN`
- `META_PAGE_ID`
- `META_INSTAGRAM_BUSINESS_ACCOUNT_ID`
- `META_BUSINESS_ID`
- `META_WHATSAPP_BUSINESS_ACCOUNT_ID`
- `META_CATALOG_ID`

## Permissoes Meta esperadas

O token Meta precisa ser emitido por usuario/sistema com acesso aos ativos no Business Manager. Escopos comuns:

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

As permissoes efetivas devem ser validadas por `/actions/permissions` e por chamadas reais aos edges de Business/WhatsApp/Catalogo.
