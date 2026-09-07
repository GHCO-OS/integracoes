# Meta Ads Actions

API REST para GPT operar Meta Graph/Marketing API em modo `autonomous-non-financial`.

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
- Escrita autônoma não financeira: publicações, edição, exclusão, comentários, mensagens, leads, perfis, catálogos e ativos Business não exigem confirmação adicional.
- Restrição financeira única: orçamento, lance, cobrança, pagamento, limite de gasto e ativação de entrega exigem `confirmFinancial=CONFIRM_META_FINANCIAL`.
- Business Manager: businesses, assets, paginas, Instagram, contas de anuncio.
- WhatsApp Business: WABAs, numeros, nome verificado, qualidade, status e templates.
- Catalogos: catalogos do Business e produtos.
- Fallback universal: qualquer edge da Graph API pode ser chamado via `metaGraphRequestV2`.

## Permissões solicitadas

- Pages: `pages_show_list`, `pages_read_engagement`, `pages_read_user_content`, `pages_manage_posts`, `pages_manage_engagement`, `pages_manage_metadata`, `pages_manage_cta`, `pages_messaging`, `read_insights`.
- Instagram: `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`, `instagram_manage_insights`, `instagram_manage_messages`.
- Business e Ads: `business_management`, `ads_read`, `ads_management`, `pages_manage_ads`.
- Leads: `leads_retrieval`.

O código expõe as operações, mas a Meta só libera cada uma quando o token e o app possuem a permissão correspondente e acesso ao ativo.

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
