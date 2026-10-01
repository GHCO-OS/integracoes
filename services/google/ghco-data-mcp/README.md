# GHCO Data MCP

MCP remoto com Cloudflare D1, R2 e Basin Catalog como armazenamento principal. BigQuery e Looker Studio permanecem como integrações opcionais.

## Armazenamento principal

- D1 `ghco-operacao`: coleções, registros, catálogo e auditoria;
- R2 `ghco-data-files`: documentos, imagens, CSV, JSON e arquivos pesados;
- Basin Catalog: ativo no bucket, sem expiração automática configurada;
- BigQuery e Looker Studio: mantidos para compatibilidade e migrações futuras.

## Capacidades

- criar coleções flexíveis e inserir, atualizar, consultar ou excluir registros no D1;
- catalogar fontes e consultar a auditoria operacional;
- enviar, listar, ler e excluir arquivos no R2;
- enviar e baixar arquivos grandes em partes;
- inspecionar a configuração do Basin Catalog;
- listar datasets, tabelas, views e schemas;
- executar consultas somente leitura com limite de bytes faturados;
- criar datasets, tabelas e views com simulação por padrão;
- importar registros JSON em lotes;
- migrar Google Sheets para tabelas BigQuery;
- manter catálogo operacional de fontes;
- localizar relatórios e fontes do Looker Studio;
- consultar e adicionar permissões do Looker Studio.

## Segurança

- OAuth do Google armazenado somente como secrets do Cloudflare;
- OAuth 2.1/PKCE na conexão do ChatGPT;
- leitura SQL separada de DDL/DML;
- escrita real exige `CONFIRM_GHCO_DATA_WRITE`;
- exclusão e substituição exigem `CONFIRM_GHCO_DATA_DELETE`;
- consultas usam `maximumBytesBilled` para limitar custo.

## Secrets

- `GOOGLE_DATA_CLIENT_ID`
- `GOOGLE_DATA_CLIENT_SECRET`
- `GOOGLE_DATA_REFRESH_TOKEN`
- `MCP_BEARER_TOKEN`

## Endpoint

- MCP: `https://data-mcp.cuiabar.com/mcp`
- Saúde: `https://data-mcp.cuiabar.com/health`
