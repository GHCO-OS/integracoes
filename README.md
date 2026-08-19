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
