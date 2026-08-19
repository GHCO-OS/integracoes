# Acessos e secrets

Este inventário contém somente nomes e finalidades. Valores reais devem ficar no Cloudflare Secrets ou no cofre institucional.

## Google Ads

- `GOOGLE_ADS_CLIENT_ID`: cliente OAuth.
- `GOOGLE_ADS_CLIENT_SECRET`: segredo do cliente OAuth.
- `GOOGLE_ADS_REFRESH_TOKEN`: renovação do acesso Google Ads.
- `GOOGLE_ADS_DEVELOPER_TOKEN`: token da API Google Ads.
- `GOOGLE_ADS_CUSTOMER_ID`: conta alvo.
- `GOOGLE_ADS_LOGIN_CUSTOMER_ID`: conta administradora opcional.
- `MCP_BEARER_TOKEN`: autenticação privada do MCP/GPT.

## Meta

- `META_ACCESS_TOKEN`: token principal da Graph API.
- `META_ACTIONS_BEARER_TOKEN`: autenticação privada das GPT Actions.
- `META_AD_ACCOUNT_ID`: conta de anúncios padrão.
- `META_PAGE_ACCESS_TOKEN`: token de página opcional.
- `META_PAGE_ID`: página padrão.
- `META_INSTAGRAM_BUSINESS_ACCOUNT_ID`: conta Instagram Business.
- `META_BUSINESS_ID`: Business Manager.
- `META_WHATSAPP_BUSINESS_ACCOUNT_ID`: WABA.
- `META_CATALOG_ID`: catálogo padrão.

## Cloudflare e GitHub

- `CLOUDFLARE_API_TOKEN`: somente no ambiente de deploy/Actions.
- `CLOUDFLARE_ACCOUNT_ID`: identificador da conta, sem poder de autenticação isoladamente.

## Rotação

Ao rotacionar uma credencial, atualize o secret no provedor, valide `/health`, teste uma operação somente leitura e registre a data em `PUBLICACOES.md`.
