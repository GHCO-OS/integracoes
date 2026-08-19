# GHCO Integrações

Repositório exclusivo das integrações da GHCO com Google, Meta, GPT e outros serviços externos.

## Endereço oficial

`https://github.com/GHCO-OS/integracoes`

## Escopo

- Google Ads e demais APIs Google
- Meta Ads, Instagram, Facebook e WhatsApp Business
- MCPs, GPT Actions e conectores para ferramentas de IA
- contratos OpenAPI, autenticação e infraestrutura de integração

## Organização prevista

- `services/google/`: serviços e MCPs Google
- `services/meta/`: serviços e Actions Meta
- `services/gpt/`: conectores e contratos voltados a GPTs
- `packages/shared/`: autenticação, schemas e utilitários compartilhados
- `docs/`: arquitetura, segurança, operação e runbooks

## Segurança

Segredos, tokens e credenciais não devem ser versionados. Use secrets do provedor de execução e arquivos locais ignorados pelo Git.

## Serviços migrados

| Serviço | Código | Produção |
|---|---|---|
| Google Ads MCP | [`services/google/google-ads-mcp`](services/google/google-ads-mcp) | `google-ads-mcp.cuiabar.com` |
| Meta Ads Actions | [`services/meta/meta-ads-actions`](services/meta/meta-ads-actions) | `meta-ads-actions.cuiabar.com` |

## Documentação

- [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md): divisão dos serviços e limites de segurança.
- [`docs/ACESSOS-E-SECRETS.md`](docs/ACESSOS-E-SECRETS.md): nomes e finalidades das credenciais, sem valores.
- [`docs/HABILIDADES-E-ENDPOINTS.md`](docs/HABILIDADES-E-ENDPOINTS.md): capacidades, links e endpoints.
- [`docs/PUBLICACOES.md`](docs/PUBLICACOES.md): inventário e histórico de deploys.
- [`docs/runbooks/`](docs/runbooks): operação detalhada de Google e Meta.

## Validação local

```bash
npm ci
npm run typecheck
```
