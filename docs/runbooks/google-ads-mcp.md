# Google Ads MCP somente leitura

## Objetivo

Disponibilizar dados de Google Ads para o ChatGPT por MCP remoto, sem permitir escrita, pausa de campanhas, mudanca de verba ou qualquer chamada `mutate`.

## Local do servico

Codigo-fonte:

```text
services/google-ads-mcp/
```

Endpoint local:

```text
http://localhost:8788/sse
```

Endpoint publico:

```text
https://google-ads-mcp.cuiabar.com/sse
```

Endpoint alternativo:

```text
https://google-ads-mcp.cuiabar.com/mcp
```

O ChatGPT exige um MCP remoto em HTTPS acessivel pela internet. O endpoint local serve apenas para teste local ou via tunel temporario.

## Credenciais e secrets

Nao versionar valores. Configurar via `.env` local ou secrets do provedor de deploy:

- `GOOGLE_ADS_CLIENT_ID`
- `GOOGLE_ADS_CLIENT_SECRET`
- `GOOGLE_ADS_REFRESH_TOKEN`
- `GOOGLE_ADS_DEVELOPER_TOKEN`
- `GOOGLE_ADS_CUSTOMER_ID`
- `GOOGLE_ADS_LOGIN_CUSTOMER_ID`, se houver MCC
- `GOOGLE_ADS_API_VERSION`, padrao `v24`
- `MCP_BEARER_TOKEN`, recomendado em producao

O `MCP_BEARER_TOKEN` do Worker publicado fica guardado localmente em:

```text
ops-artifacts/google-ads-mcp/mcp-bearer-token.local
```

Escopo OAuth necessario:

```text
https://www.googleapis.com/auth/adwords
```

## Garantias de somente leitura

- O servidor usa apenas `customers:listAccessibleCustomers` e `googleAds:searchStream`.
- Nao existe ferramenta de `mutate`.
- A ferramenta generica `run_readonly_gaql` aceita apenas consultas iniciadas com `SELECT`.
- Termos de escrita como `MUTATE`, `CREATE`, `UPDATE`, `DELETE`, `PAUSE`, `ENABLE`, `SET`, `INSERT`, `DROP` e similares sao bloqueados antes de chamar a API.

## Instalar no ChatGPT

### Opção recomendada: GPT personalizado com Actions

Use esta opção para manter memória normal do ChatGPT e evitar o modo desenvolvedor do MCP.

No editor do GPT:

1. Abra `Configure`.
2. Em `Actions`, clique em `Create new action`.
3. Importe o schema:

```text
https://google-ads-mcp.cuiabar.com/openapi.json
```

4. Em Authentication, selecione:

```text
API Key
Bearer
```

5. Cole o token salvo em:

```text
ops-artifacts/google-ads-mcp/mcp-bearer-token.local
```

6. Instrua o GPT a usar apenas leitura e nunca sugerir alterações diretas em campanhas sem validação humana.

Endpoints disponíveis para Actions:

- `GET /actions/health`
- `GET /actions/accounts`
- `GET /actions/campaigns`
- `GET /actions/campaign-metrics`
- `GET /actions/search-terms`
- `GET /actions/budgets`
- `POST /actions/gaql`

### Opção alternativa: MCP remoto

1. No ChatGPT, abrir Configuracoes > Apps/Connectors > Advanced/Developer mode.
2. Adicionar servidor remoto MCP usando:

```text
https://google-ads-mcp.cuiabar.com/sse
```

3. Durante o OAuth, informar o token privado salvo em:

```text
ops-artifacts/google-ads-mcp/mcp-bearer-token.local
```

O Worker implementa discovery OAuth em:

```text
https://google-ads-mcp.cuiabar.com/.well-known/oauth-authorization-server
https://google-ads-mcp.cuiabar.com/.well-known/oauth-protected-resource
```

Fluxo validado em 2026-05-04:

- Dynamic Client Registration: OK
- Authorization Code com PKCE: OK
- Token endpoint: OK
- MCP `/mcp` sem token retorna `401` com `WWW-Authenticate` e metadata

## Instalar no ChatGPT - formato antigo

Caso a interface ainda peca URL e header manual:

4. Adicionar servidor remoto MCP usando:

```text
https://google-ads-mcp.cuiabar.com/sse
```

5. Se solicitado, configurar header:

```text
Authorization: Bearer <MCP_BEARER_TOKEN>
```

6. Atualizar a lista de ferramentas e manter apenas ferramentas de leitura habilitadas.

## Validacao

```bash
cd services/google-ads-mcp
npm install
npm run build
npm start
```

Health check:

```bash
curl http://localhost:8788/health
```

## Gerar refresh token

Com um OAuth Client criado no Google Cloud para a API Google Ads, rode:

```bash
cd services/google-ads-mcp
$env:GOOGLE_ADS_CLIENT_ID="..."
$env:GOOGLE_ADS_CLIENT_SECRET="..."
npm run oauth:ads
```

O script abre uma URL de autorização com o escopo:

```text
https://www.googleapis.com/auth/adwords
```

Depois do consentimento, ele salva localmente:

```text
ops-artifacts/google-ads-mcp/google-ads-client-id.local
ops-artifacts/google-ads-mcp/google-ads-client-secret.local
ops-artifacts/google-ads-mcp/google-ads-refresh-token.local
```

Estado atual do Worker publicado:

- `GOOGLE_ADS_CLIENT_ID`: configurado
- `GOOGLE_ADS_CLIENT_SECRET`: configurado
- `GOOGLE_ADS_REFRESH_TOKEN`: configurado
- `GOOGLE_ADS_CUSTOMER_ID`: configurado
- `GOOGLE_ADS_DEVELOPER_TOKEN`: configurado

Validacao concluida em 2026-05-04:

- `/health` do MCP retornou `ok: true`
- `customers:listAccessibleCustomers` retornou contas acessiveis
- `googleAds:searchStream` retornou campanhas da conta `7248246092`
