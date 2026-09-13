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
- Deploy realizado na conta `Cuiabar | GHCO`.
- Worker: `google-ads-mcp`.
- Domínio: `https://google-ads-mcp.cuiabar.com`.
- Cloudflare Version ID: `0475a568-676e-4a4c-886b-64c2231e6286`.
- Health: `ok=true`, modo `read-write-controlled`, API Google Ads `v24`.
- OpenAPI: versão `0.2.0` com `POST /actions/mutate` ativo.
- Segurança: chamada não autenticada de mutação retorna `401`.

## Customer Match e CRM publicado em 2026-08-29

- Customer Match ativado por `OfflineUserDataJob`, com criação, lotes de inclusão/remoção e execução do job.
- Identificadores de email e telefone são normalizados e recebem SHA-256 no Worker; PII em claro não é registrada.
- Cargas de CRM grandes usam chamadas sucessivas de até 10.000 identificadores por lote.
- Upload de conversões offline de clique ativado, com `validateOnly=true` por padrão.
- Escrita exige `CONFIRM_GOOGLE_ADS_WRITE`; remoção exige `CONFIRM_GOOGLE_ADS_DELETE`.
- Worker: `google-ads-mcp`; domínio: `https://google-ads-mcp.cuiabar.com`.
- Cloudflare Version ID: `1ed7bab4-8025-404b-aebf-2b3e5e8d29db`.
- Health após o deploy: `ok=true`, sem secrets ausentes, API Google Ads `v24`.

## Merchant Center preparado em 2026-08-29

- Merchant API adicionada ao mesmo MCP Google Ads.
- Ferramentas de produtos, fontes de dados e relatórios registradas.
- Escrita e exclusão usam confirmações específicas do Merchant.
- Autorização real depende do secret `GOOGLE_MERCHANT_REFRESH_TOKEN` com escopo `content`.
- O Business Profile não foi incluído porque requer aprovação separada do Google.
- Cloudflare Version ID: `b1917c4b-66f9-447d-967f-63aa0f0d3c9e`.
- Health: `ok=true`; `merchantConfigured=false` até concluir o OAuth Merchant.

## Business Profile preparado em 2026-08-29

- Projeto Google Cloud auditado: `meucuiabar`.
- Escopo `business.manage` já cadastrado no consentimento OAuth.
- APIs ativas observadas: Account Management, Business Information, Performance, Google My Business, Notifications, Q&A e Verifications.
- Ferramenta MCP adicionada para fichas, SEO local, horários, categorias, posts, mídia, avaliações, perguntas e performance.
- Administradores e convites são bloqueados pelo conector.
- Autorização operacional depende do secret `GOOGLE_BUSINESS_REFRESH_TOKEN`.
- Cloudflare Version ID: `14a5cca7-85a4-4b5a-98ba-488958283629`.

## Meta autônoma não financeira publicada em 2026-09-07

- Worker `meta-ads-actions` atualizado para modo `autonomous-non-financial`.
- Pages, Instagram, Business, mensagens, comentários, leads, catálogos e fallback Graph executam sem confirmação adicional.
- Única confirmação funcional mantida: `CONFIRM_META_FINANCIAL` para orçamento, lance, cobrança, pagamento, limite de gasto e ativação de entrega de anúncios.
- OpenAPI `0.3.0`, com 46 caminhos e endpoints dedicados para leads e operações sociais.
- Cloudflare Version ID: `4ccb0363-5fa5-49c6-a97c-d9c1fefbeec5`.
- Health: `ok=true`, API Graph `v25.0`, sem secrets obrigatórios ausentes.

## Módulo Social Content da Meta preparado em 2026-09-07

- OpenAPI atualizado para `0.4.0` com operações explícitas para a biblioteca orgânica.
- Facebook: posts, fotos, vídeos, Reels, detalhes, insights e exclusões suportadas.
- Instagram profissional: mídia, detalhes, carrosséis, insights e comentários.
- Paginação por cursor e filtros `since`/`until` disponíveis para auditorias históricas.
- Nenhum conteúdo real foi alterado ou excluído durante a validação.
- Worker: `meta-ads-actions`; domínio: `https://meta-ads-actions.cuiabar.com`.
- Cloudflare Version ID: `09aa1a34-9e32-4934-9667-5318b02d2184`.
- Health: `ok=true`, modo `autonomous-non-financial`; OpenAPI `0.4.0` publicado.

## Meta Pub publicado em 2026-09-07

- Novo Worker independente `meta-pub`, focado exclusivamente na presença pública de Facebook e Instagram.
- Domínio: `https://meta-pub.cuiabar.com`; OpenAPI: `https://meta-pub.cuiabar.com/openapi.json`.
- Biblioteca orgânica, publicação, edição, exclusão Facebook, respostas, moderação, desempenho e Instagram Discovery por hashtags.
- Conexão interna ao Worker `meta-ads-actions`; o mesmo Bearer do GPT é encaminhado sem duplicar secrets.
- Cloudflare Version ID: `3dcf3673-9837-437f-a765-f47cae73fcf1`.
- Health: `ok=true`; OpenAPI `0.1.0`; chamadas sociais sem autenticação retornam `401`.

## Merchant e Business Profile ampliados em 2026-09-12

- Worker `google-ads-mcp` ampliado com acesso controlado às sub-APIs Merchant de contas, produtos, fontes, inventários, promoções, diagnósticos, relatórios, conversões, notificações, regiões, avaliações e Product Studio.
- Business Profile recebeu ferramentas dedicadas para leitura e atualização integral de cardápios (`FoodMenus`), incluindo seções, itens, preços, descrições, nutrição, porções e fotos por `mediaKey`.
- Escritas genéricas simulam por padrão; confirmações específicas continuam obrigatórias para alterações e exclusões reais.
- 12 testes automatizados aprovados, incluindo simulação de produto/cardápio e bloqueios contra caminhos externos, travessia e gestão de administradores.
- Cloudflare Version ID: `8fc3a0b5-5270-4f43-91ba-f8a1817d4230`.
- Sonda publicada: Business Profile configurado e alcançável; Merchant aguarda autorização do refresh token com escopo `content`.
