# Guia de manutenção

Este repositório é a fonte oficial das integrações externas da GHCO.

## Regras

- Serviços ficam em `services/<provedor>/<serviço>`.
- Documentação operacional fica em `docs/`.
- Tokens, senhas, cookies, chaves privadas e arquivos `.dev.vars` nunca são versionados.
- Documente nomes de secrets, finalidade, origem e procedimento de rotação, nunca seus valores.
- Toda escrita em APIs externas deve ter simulação segura e confirmação explícita.
- Antes de publicar, execute `npm run typecheck` e a varredura de segredos.

## Publicação

- Workers são publicados pelo Wrangler a partir da pasta de cada serviço.
- GitHub Actions valida builds, mas deploy exige configuração explícita de ambiente e secrets.
- O código neste repositório não garante que a mesma versão esteja ativa no Cloudflare; registre cada deploy em `docs/PUBLICACOES.md`.
