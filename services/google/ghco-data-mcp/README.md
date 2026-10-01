# GHCO Data MCP

MCP remoto para substituir planilhas operacionais por uma base BigQuery catalogada e analisável pelo GPT.

## Capacidades

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
