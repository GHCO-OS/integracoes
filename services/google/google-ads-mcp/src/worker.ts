import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { GoogleAdsClient, normalizeCustomerId } from "./googleAdsClient.js";
import { createGoogleAdsMcpServer } from "./mcpServer.js";

type Env = {
  GOOGLE_ADS_CLIENT_ID?: string;
  GOOGLE_ADS_CLIENT_SECRET?: string;
  GOOGLE_ADS_REFRESH_TOKEN?: string;
  GOOGLE_ADS_DEVELOPER_TOKEN?: string;
  GOOGLE_ADS_CUSTOMER_ID?: string;
  GOOGLE_ADS_LOGIN_CUSTOMER_ID?: string;
  GOOGLE_ADS_API_VERSION?: string;
  MCP_BEARER_TOKEN?: string;
};

type OAuthPayload = {
  type: "code" | "access" | "refresh";
  exp: number;
  client_id?: string;
  redirect_uri?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  scope?: string;
};

const REQUIRED_ENV: Array<keyof Env> = [
  "GOOGLE_ADS_CLIENT_ID",
  "GOOGLE_ADS_CLIENT_SECRET",
  "GOOGLE_ADS_REFRESH_TOKEN",
  "GOOGLE_ADS_DEVELOPER_TOKEN",
  "GOOGLE_ADS_CUSTOMER_ID"
];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = url.origin;

    if (url.pathname === "/" || url.pathname === "/health") {
      const missing = REQUIRED_ENV.filter((key) => !env[key]);
      return json({
        ok: missing.length === 0,
        service: "google-ads-mcp",
        mode: "read-only",
        endpoint: "https://google-ads-mcp.cuiabar.com/sse",
        apiVersion: env.GOOGLE_ADS_API_VERSION ?? "v24",
        missingSecrets: missing
      });
    }

    if (url.pathname === "/.well-known/oauth-authorization-server" || url.pathname === "/.well-known/openid-configuration") {
      return json(authorizationServerMetadata(origin));
    }

    if (
      url.pathname === "/.well-known/oauth-protected-resource" ||
      url.pathname === "/.well-known/oauth-protected-resource/sse" ||
      url.pathname === "/.well-known/oauth-protected-resource/mcp"
    ) {
      return json({
        resource: origin,
        authorization_servers: [origin],
        scopes_supported: ["google_ads.read"],
        bearer_methods_supported: ["header"],
        resource_documentation: "https://google-ads-mcp.cuiabar.com/health"
      });
    }

    if (url.pathname === "/register" && request.method === "POST") {
      const body = await readJson(request);
      const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
      return json(
        {
          client_id: `chatgpt-${crypto.randomUUID()}`,
          client_secret: crypto.randomUUID(),
          client_id_issued_at: Math.floor(Date.now() / 1000),
          client_secret_expires_at: 0,
          redirect_uris: redirectUris,
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          token_endpoint_auth_method: "client_secret_post",
          scope: "google_ads.read"
        },
        201
      );
    }

    if (url.pathname === "/authorize" && request.method === "GET") {
      return authorizationPage(url);
    }

    if (url.pathname === "/authorize" && request.method === "POST") {
      return handleAuthorizePost(request, env);
    }

    if (url.pathname === "/token" && request.method === "POST") {
      return handleTokenRequest(request, env);
    }

    if (url.pathname === "/openapi.json") {
      return json(openApiSchema(origin));
    }

    if (url.pathname.startsWith("/actions/")) {
      return handleActionRequest(request, env);
    }

    if (url.pathname !== "/sse" && url.pathname !== "/mcp") {
      return json({ error: "Not found" }, 404);
    }

    const authError = await requireBearerToken(request, env);
    if (authError) {
      return authError;
    }

    const missing = REQUIRED_ENV.filter((key) => !env[key]);
    if (missing.length > 0) {
      return json({ error: "Google Ads secrets ausentes.", missingSecrets: missing }, 503);
    }

    const googleAds = new GoogleAdsClient({
      apiVersion: env.GOOGLE_ADS_API_VERSION ?? "v24",
      clientId: env.GOOGLE_ADS_CLIENT_ID!,
      clientSecret: env.GOOGLE_ADS_CLIENT_SECRET!,
      refreshToken: env.GOOGLE_ADS_REFRESH_TOKEN!,
      developerToken: env.GOOGLE_ADS_DEVELOPER_TOKEN!,
      customerId: normalizeCustomerId(env.GOOGLE_ADS_CUSTOMER_ID!),
      loginCustomerId: env.GOOGLE_ADS_LOGIN_CUSTOMER_ID
    });

    const server = createGoogleAdsMcpServer(googleAds, {
      publicUrl: "https://google-ads-mcp.cuiabar.com/sse",
      apiVersion: env.GOOGLE_ADS_API_VERSION ?? "v24"
    });

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: false
    });

    await server.connect(transport);
    return transport.handleRequest(request);
  }
};

async function requireBearerToken(request: Request, env: Env): Promise<Response | null> {
  if (!env.MCP_BEARER_TOKEN) {
    return null;
  }

  const authorization = request.headers.get("authorization");
  if (authorization === `Bearer ${env.MCP_BEARER_TOKEN}`) {
    return null;
  }

  const accessToken = authorization?.replace(/^Bearer\s+/i, "");
  if (accessToken) {
    const payload = await verifyPayload(accessToken, env);
    return payload?.type === "access" ? null : unauthorized(request);
  }

  return unauthorized(request);
}

function authorizationServerMetadata(origin: string): Record<string, unknown> {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/authorize`,
    token_endpoint: `${origin}/token`,
    registration_endpoint: `${origin}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256", "plain"],
    token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic", "none"],
    scopes_supported: ["google_ads.read"],
    service_documentation: `${origin}/health`
  };
}

async function handleActionRequest(request: Request, env: Env): Promise<Response> {
  const authError = await requireBearerToken(request, env);
  if (authError) {
    return authError;
  }

  const missing = REQUIRED_ENV.filter((key) => !env[key]);
  if (missing.length > 0) {
    return json({ error: "Google Ads secrets ausentes.", missingSecrets: missing }, 503);
  }

  const url = new URL(request.url);
  const googleAds = new GoogleAdsClient({
    apiVersion: env.GOOGLE_ADS_API_VERSION ?? "v24",
    clientId: env.GOOGLE_ADS_CLIENT_ID!,
    clientSecret: env.GOOGLE_ADS_CLIENT_SECRET!,
    refreshToken: env.GOOGLE_ADS_REFRESH_TOKEN!,
    developerToken: env.GOOGLE_ADS_DEVELOPER_TOKEN!,
    customerId: normalizeCustomerId(env.GOOGLE_ADS_CUSTOMER_ID!),
    loginCustomerId: env.GOOGLE_ADS_LOGIN_CUSTOMER_ID
  });

  if (url.pathname === "/actions/health" && request.method === "GET") {
    return json({
      ok: true,
      service: "google-ads-actions",
      mode: "read-only",
      apiVersion: env.GOOGLE_ADS_API_VERSION ?? "v24"
    });
  }

  if (url.pathname === "/actions/accounts" && request.method === "GET") {
    return json(await googleAds.listAccessibleCustomers());
  }

  if (url.pathname === "/actions/campaigns" && request.method === "GET") {
    const customerId = url.searchParams.get("customerId") ?? undefined;
    const limit = clampLimit(url.searchParams.get("limit"), 100, 500);
    return json(
      await googleAds.searchStream(
        `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.bidding_strategy_type, campaign_budget.id, campaign_budget.name, campaign_budget.amount_micros FROM campaign ORDER BY campaign.name LIMIT ${limit}`,
        customerId
      )
    );
  }

  if (url.pathname === "/actions/campaign-metrics" && request.method === "GET") {
    const startDate = requiredDate(url.searchParams.get("startDate"), "startDate");
    const endDate = requiredDate(url.searchParams.get("endDate"), "endDate");
    const customerId = url.searchParams.get("customerId") ?? undefined;
    const campaignId = url.searchParams.get("campaignId");
    const limit = clampLimit(url.searchParams.get("limit"), 250, 1000);
    const where = [
      `segments.date BETWEEN '${startDate}' AND '${endDate}'`,
      campaignId ? `campaign.id = ${campaignId.replace(/\D/g, "")}` : null
    ]
      .filter(Boolean)
      .join(" AND ");

    return json(
      await googleAds.searchStream(
        `SELECT campaign.id, campaign.name, campaign.status, segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.ctr, metrics.average_cpc FROM campaign WHERE ${where} ORDER BY segments.date DESC LIMIT ${limit}`,
        customerId
      )
    );
  }

  if (url.pathname === "/actions/search-terms" && request.method === "GET") {
    const startDate = requiredDate(url.searchParams.get("startDate"), "startDate");
    const endDate = requiredDate(url.searchParams.get("endDate"), "endDate");
    const customerId = url.searchParams.get("customerId") ?? undefined;
    const limit = clampLimit(url.searchParams.get("limit"), 250, 1000);
    return json(
      await googleAds.searchStream(
        `SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, search_term_view.search_term, search_term_view.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM search_term_view WHERE segments.date BETWEEN '${startDate}' AND '${endDate}' ORDER BY metrics.clicks DESC LIMIT ${limit}`,
        customerId
      )
    );
  }

  if (url.pathname === "/actions/budgets" && request.method === "GET") {
    const customerId = url.searchParams.get("customerId") ?? undefined;
    const limit = clampLimit(url.searchParams.get("limit"), 100, 500);
    return json(
      await googleAds.searchStream(
        `SELECT campaign_budget.id, campaign_budget.name, campaign_budget.status, campaign_budget.amount_micros, campaign_budget.total_amount_micros, campaign_budget.delivery_method, campaign_budget.explicitly_shared FROM campaign_budget ORDER BY campaign_budget.name LIMIT ${limit}`,
        customerId
      )
    );
  }

  if (url.pathname === "/actions/gaql" && request.method === "POST") {
    const body = await readJson(request);
    const query = String(body.query ?? "");
    const customerId = typeof body.customerId === "string" ? body.customerId : undefined;
    return json(await googleAds.searchStream(query, customerId));
  }

  return json({ error: "Not found" }, 404);
}

function authorizationPage(url: URL): Response {
  const hiddenFields = [
    "client_id",
    "redirect_uri",
    "response_type",
    "scope",
    "state",
    "code_challenge",
    "code_challenge_method"
  ]
    .map((name) => `<input type="hidden" name="${name}" value="${escapeHtml(url.searchParams.get(name) ?? "")}">`)
    .join("\n");

  return new Response(
    `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Autorizar Google Ads MCP</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#111827;color:#f9fafb;display:grid;place-items:center;min-height:100vh;margin:0}
    main{width:min(440px,calc(100vw - 32px));background:#1f2937;border:1px solid #374151;border-radius:12px;padding:24px}
    label,input,button{display:block;width:100%;box-sizing:border-box}
    input{margin-top:8px;padding:12px;border-radius:8px;border:1px solid #4b5563;background:#111827;color:#fff}
    button{margin-top:16px;padding:12px;border:0;border-radius:8px;background:#f97316;color:#111827;font-weight:700;cursor:pointer}
    p{color:#d1d5db;line-height:1.5}
  </style>
</head>
<body>
  <main>
    <h1>Autorizar Google Ads MCP</h1>
    <p>Informe o token privado do MCP para liberar acesso somente leitura ao ChatGPT.</p>
    <form method="post" action="/authorize">
      ${hiddenFields}
      <label>Token MCP
        <input name="mcp_token" type="password" autocomplete="off" required autofocus>
      </label>
      <button type="submit">Autorizar</button>
    </form>
  </main>
</body>
</html>`,
    { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } }
  );
}

function openApiSchema(origin: string): Record<string, unknown> {
  const security = [{ bearerAuth: [] }];
  return {
    openapi: "3.1.0",
    info: {
      title: "Cuiabar Google Ads Read-Only API",
      version: "0.1.0",
      description: "Read-only Google Ads reporting API for a custom GPT. No mutate/write endpoints are exposed."
    },
    servers: [{ url: origin }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "Use the private MCP/action token as a Bearer token."
        }
      },
      schemas: {
        GoogleAdsRows: {
          type: "array",
          items: { type: "object", additionalProperties: true }
        }
      }
    },
    paths: {
      "/actions/health": {
        get: {
          operationId: "checkGoogleAdsApiHealth",
          summary: "Check Google Ads action health",
          security,
          responses: { "200": { description: "Health status" } }
        }
      },
      "/actions/accounts": {
        get: {
          operationId: "listAccessibleGoogleAdsAccounts",
          summary: "List accessible Google Ads customer accounts",
          security,
          responses: { "200": { description: "Accessible accounts" } }
        }
      },
      "/actions/campaigns": {
        get: {
          operationId: "listGoogleAdsCampaigns",
          summary: "List Google Ads campaigns",
          security,
          parameters: [
            { name: "customerId", in: "query", required: false, schema: { type: "string" } },
            { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 500, default: 100 } }
          ],
          responses: { "200": { description: "Campaign rows" } }
        }
      },
      "/actions/campaign-metrics": {
        get: {
          operationId: "getGoogleAdsCampaignMetrics",
          summary: "Get campaign metrics by date range",
          security,
          parameters: [
            { name: "startDate", in: "query", required: true, schema: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" } },
            { name: "endDate", in: "query", required: true, schema: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" } },
            { name: "customerId", in: "query", required: false, schema: { type: "string" } },
            { name: "campaignId", in: "query", required: false, schema: { type: "string" } },
            { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 1000, default: 250 } }
          ],
          responses: { "200": { description: "Campaign metric rows" } }
        }
      },
      "/actions/search-terms": {
        get: {
          operationId: "getGoogleAdsSearchTerms",
          summary: "Get Google Ads search terms by date range",
          security,
          parameters: [
            { name: "startDate", in: "query", required: true, schema: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" } },
            { name: "endDate", in: "query", required: true, schema: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" } },
            { name: "customerId", in: "query", required: false, schema: { type: "string" } },
            { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 1000, default: 250 } }
          ],
          responses: { "200": { description: "Search term rows" } }
        }
      },
      "/actions/budgets": {
        get: {
          operationId: "listGoogleAdsBudgets",
          summary: "List Google Ads campaign budgets",
          security,
          parameters: [
            { name: "customerId", in: "query", required: false, schema: { type: "string" } },
            { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 500, default: 100 } }
          ],
          responses: { "200": { description: "Budget rows" } }
        }
      },
      "/actions/gaql": {
        post: {
          operationId: "runReadOnlyGoogleAdsGaql",
          summary: "Run a read-only GAQL SELECT query",
          security,
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["query"],
                  properties: {
                    query: { type: "string", description: "GAQL query. Only SELECT is allowed." },
                    customerId: { type: "string" }
                  }
                }
              }
            }
          },
          responses: { "200": { description: "GAQL rows" } }
        }
      }
    }
  };
}

async function handleAuthorizePost(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  const mcpToken = String(form.get("mcp_token") ?? "");

  if (!env.MCP_BEARER_TOKEN || mcpToken !== env.MCP_BEARER_TOKEN) {
    return new Response("Token MCP invalido.", { status: 401, headers: { "content-type": "text/plain; charset=utf-8" } });
  }

  const redirectUri = String(form.get("redirect_uri") ?? "");
  const clientId = String(form.get("client_id") ?? "");
  const responseType = String(form.get("response_type") ?? "");
  const codeChallenge = String(form.get("code_challenge") ?? "");
  const codeChallengeMethod = String(form.get("code_challenge_method") || "plain");
  const state = String(form.get("state") ?? "");
  const scope = String(form.get("scope") || "google_ads.read");

  if (responseType !== "code" || !redirectUri || !clientId) {
    return json({ error: "invalid_request" }, 400);
  }

  const code = await signPayload(
    {
      type: "code",
      exp: Math.floor(Date.now() / 1000) + 300,
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod,
      scope
    },
    env
  );

  const destination = new URL(redirectUri);
  destination.searchParams.set("code", code);
  if (state) {
    destination.searchParams.set("state", state);
  }

  return Response.redirect(destination.toString(), 302);
}

async function handleTokenRequest(request: Request, env: Env): Promise<Response> {
  if (!env.MCP_BEARER_TOKEN) {
    return json({ error: "server_error" }, 500);
  }

  const form = await request.formData();
  const grantType = String(form.get("grant_type") ?? "");

  if (grantType === "authorization_code") {
    const code = String(form.get("code") ?? "");
    const redirectUri = String(form.get("redirect_uri") ?? "");
    const codeVerifier = String(form.get("code_verifier") ?? "");
    const payload = await verifyPayload(code, env);

    if (!payload || payload.type !== "code" || payload.redirect_uri !== redirectUri) {
      return json({ error: "invalid_grant" }, 400);
    }

    if (!(await verifyPkce(codeVerifier, payload.code_challenge, payload.code_challenge_method))) {
      return json({ error: "invalid_grant" }, 400);
    }

    return issueTokens(env, payload.scope);
  }

  if (grantType === "refresh_token") {
    const refreshToken = String(form.get("refresh_token") ?? "");
    const payload = await verifyPayload(refreshToken, env);

    if (!payload || payload.type !== "refresh") {
      return json({ error: "invalid_grant" }, 400);
    }

    return issueTokens(env, payload.scope);
  }

  return json({ error: "unsupported_grant_type" }, 400);
}

async function issueTokens(env: Env, scope = "google_ads.read"): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);
  const accessToken = await signPayload({ type: "access", exp: now + 3600, scope }, env);
  const refreshToken = await signPayload({ type: "refresh", exp: now + 60 * 60 * 24 * 30, scope }, env);

  return json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: refreshToken,
    scope
  });
}

function unauthorized(request: Request): Response {
  const url = new URL(request.url);
  const resourceMetadata = `${url.origin}/.well-known/oauth-protected-resource`;

  return json({ error: "Bearer token invalido." }, 401, {
    "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadata}", scope="google_ads.read"`
  });
}

function json(value: unknown, status: number, extraHeaders: Record<string, string>): Response;
function json(value: unknown, status?: number): Response;
function json(value: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders
    }
  });
}

async function signPayload(payload: OAuthPayload, env: Env): Promise<string> {
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = await hmac(body, env);
  return `${body}.${signature}`;
}

async function verifyPayload(token: string, env: Env): Promise<OAuthPayload | null> {
  const [body, signature] = token.split(".");
  if (!body || !signature) {
    return null;
  }

  const expected = await hmac(body, env);
  if (!timingSafeEqual(signature, expected)) {
    return null;
  }

  const payload = JSON.parse(base64UrlDecode(body)) as OAuthPayload;
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}

async function verifyPkce(verifier: string, challenge?: string, method = "plain"): Promise<boolean> {
  if (!challenge) {
    return true;
  }

  if (method === "S256") {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    return base64UrlEncodeBytes(new Uint8Array(digest)) === challenge;
  }

  return verifier === challenge;
}

async function hmac(value: string, env: Env): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.MCP_BEARER_TOKEN ?? ""),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

function base64UrlEncode(value: string): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < left.length; i += 1) {
    result |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return result === 0;
}

function clampLimit(value: string | null, fallback: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(1, Math.min(max, parsed));
}

function requiredDate(value: string | null, name: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Parametro ${name} deve estar no formato YYYY-MM-DD.`);
  }
  return value;
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
