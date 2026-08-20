# Cloudflare CI/CD via GitHub Actions

## Objetivo

O repositório `GHCO-OS/integracoes` é a ponte oficial de deploy do serviço Meta Actions para Cloudflare Workers.

Fluxo oficial:

```text
ChatGPT / GitHub
      ↓
GHCO-OS/integracoes
      ↓
GitHub Actions
      ↓
Wrangler
      ↓
Cloudflare Worker meta-ads-actions
      ↓
meta-ads-actions.cuiabar.com
```

## Workflow

Arquivo:

```text
.github/workflows/deploy-meta-cloudflare.yml
```

O workflow executa:

1. validação dos secrets Cloudflare;
2. `npm ci`;
3. `npm run typecheck`;
4. `wrangler deploy`;
5. health check público;
6. deep health check autenticado, quando o bearer estiver disponível no GitHub;
7. resumo da publicação no GitHub Actions.

## Gatilhos

- `push` na branch `main`, limitado a alterações em `services/meta/meta-ads-actions/**` ou no próprio workflow;
- execução manual por `workflow_dispatch` quando o workflow já estiver presente na branch padrão.

Branches de desenvolvimento não fazem deploy automático.

## Secrets obrigatórios no GitHub Actions

Configurar em:

```text
Repository Settings → Secrets and variables → Actions
```

### `CLOUDFLARE_API_TOKEN`

Token Cloudflare destinado ao CI/CD. Deve ter somente o escopo necessário para editar/deployar Workers na conta correspondente.

### `CLOUDFLARE_ACCOUNT_ID`

Account ID da conta Cloudflare onde o Worker `meta-ads-actions` está publicado.

## Secret opcional recomendado

### `META_ACTIONS_BEARER_TOKEN`

Permite que o workflow execute `/actions/health/deep` após o deploy e valide, além do runtime do Worker, a comunicação real com a Meta Graph API.

O valor deve ser o mesmo bearer configurado como secret no Worker. Não versionar esse valor.

## Secrets do Worker

Os tokens Meta continuam armazenados no Cloudflare, não no GitHub:

- `META_ACCESS_TOKEN`
- `META_AD_ACCOUNT_ID`
- `META_ACTIONS_BEARER_TOKEN`
- `META_PAGE_ACCESS_TOKEN`
- IDs opcionais de Business, Page, Instagram, WhatsApp e catálogo.

O GitHub não deve receber `META_ACCESS_TOKEN`.

## Política de deploy

- desenvolvimento ocorre em branch separada;
- `main` representa a versão autorizada para produção;
- qualquer alteração no serviço Meta que entrar em `main` dispara validação e deploy;
- falha em secrets ou typecheck bloqueia o deploy;
- falha no health check faz o workflow falhar após a publicação e deve ser investigada antes de novas alterações;
- rollback deve usar uma versão/commit Git conhecido e novo deploy pelo mesmo workflow.

## Worker de produção

```text
Worker: meta-ads-actions
Domain: https://meta-ads-actions.cuiabar.com
Config: services/meta/meta-ads-actions/wrangler.jsonc
```

## Regra de segurança

Nunca adicionar tokens, API keys ou valores de secrets a arquivos versionados, logs, issues ou pull requests.
