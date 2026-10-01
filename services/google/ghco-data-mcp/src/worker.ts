import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { GoogleDataClient } from "./googleDataClient.js";
import { createDataMcpServer } from "./mcpServer.js";

type Env = {
  GOOGLE_DATA_CLIENT_ID?: string;
  GOOGLE_DATA_CLIENT_SECRET?: string;
  GOOGLE_DATA_REFRESH_TOKEN?: string;
  GOOGLE_CLOUD_PROJECT_ID?: string;
  GOOGLE_BIGQUERY_LOCATION?: string;
  GOOGLE_BIGQUERY_DATASET?: string;
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

const REQUIRED: Array<keyof Env> = [
  "GOOGLE_DATA_CLIENT_ID",
  "GOOGLE_DATA_CLIENT_SECRET",
  "GOOGLE_DATA_REFRESH_TOKEN",
  "GOOGLE_CLOUD_PROJECT_ID",
  "MCP_BEARER_TOKEN"
];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);
      const origin = url.origin;

      if (url.pathname === "/" || url.pathname === "/health") {
        const missing = REQUIRED.filter((key) => !env[key]);
        const probe = url.searchParams.get("probe") === "google" && missing.length === 0
          ? await probeGoogle(env)
          : undefined;
        return json({
          ok: missing.length === 0,
          service: "ghco-data-mcp",
          mode: "read-write-controlled",
          endpoint: `${origin}/mcp`,
          projectId: env.GOOGLE_CLOUD_PROJECT_ID,
          defaultDataset: env.GOOGLE_BIGQUERY_DATASET ?? "ghco_operacao",
          probe,
          missingSecrets: missing
        });
      }

      if (url.pathname === "/.well-known/oauth-authorization-server" || url.pathname === "/.well-known/openid-configuration") {
        return json(authorizationServerMetadata(origin));
      }
      if (url.pathname === "/.well-known/oauth-protected-resource" || url.pathname === "/.well-known/oauth-protected-resource/mcp") {
        return json({
          resource: origin,
          authorization_servers: [origin],
          scopes_supported: ["data.read", "data.write"],
          bearer_methods_supported: ["header"],
          resource_documentation: `${origin}/health`
        });
      }
      if (url.pathname === "/register" && request.method === "POST") {
        const body = await safeJson(request);
        return json({
          client_id: `chatgpt-${crypto.randomUUID()}`,
          client_secret: crypto.randomUUID(),
          client_id_issued_at: Math.floor(Date.now() / 1000),
          client_secret_expires_at: 0,
          redirect_uris: Array.isArray(body.redirect_uris) ? body.redirect_uris : [],
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          token_endpoint_auth_method: "client_secret_post",
          scope: "data.read data.write"
        }, 201);
      }
      if (url.pathname === "/authorize" && request.method === "GET") return authorizationPage(url);
      if (url.pathname === "/authorize" && request.method === "POST") return handleAuthorize(request, env);
      if (url.pathname === "/token" && request.method === "POST") return handleToken(request, env);
      if (url.pathname !== "/mcp") return json({ error: "Not found" }, 404);

      const authError = await requireBearer(request, env);
      if (authError) return authError;
      const missing = REQUIRED.filter((key) => !env[key]);
      if (missing.length) return json({ error: "Configuracao Google ausente.", missingSecrets: missing }, 503);

      const server = createDataMcpServer(clientFromEnv(env));
      const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: false });
      await server.connect(transport);
      return transport.handleRequest(request);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro interno.";
      console.error(JSON.stringify({ service: "ghco-data-mcp", error: message.slice(0, 500) }));
      return json({ error: message }, 500);
    }
  }
};

function clientFromEnv(env: Env): GoogleDataClient {
  return new GoogleDataClient({
    clientId: env.GOOGLE_DATA_CLIENT_ID ?? "",
    clientSecret: env.GOOGLE_DATA_CLIENT_SECRET ?? "",
    refreshToken: env.GOOGLE_DATA_REFRESH_TOKEN ?? "",
    projectId: env.GOOGLE_CLOUD_PROJECT_ID ?? "",
    location: env.GOOGLE_BIGQUERY_LOCATION ?? "southamerica-east1",
    defaultDataset: env.GOOGLE_BIGQUERY_DATASET ?? "ghco_operacao"
  });
}

async function probeGoogle(env: Env): Promise<Record<string, unknown>> {
  try {
    return { configured: true, reachable: true, ...(await clientFromEnv(env).probe()) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return { configured: true, reachable: false, status: Number(message.match(/(?:API|OAuth) (\d{3})/)?.[1] ?? 0) || undefined };
  }
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
    scopes_supported: ["data.read", "data.write"]
  };
}

function authorizationPage(url: URL): Response {
  const fields = ["client_id", "redirect_uri", "response_type", "scope", "state", "code_challenge", "code_challenge_method"]
    .map((name) => `<input type="hidden" name="${name}" value="${escapeHtml(url.searchParams.get(name) ?? "")}">`).join("");
  return new Response(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Autorizar GHCO Data</title><style>body{font-family:system-ui;background:#0b1220;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0}main{width:min(460px,calc(100vw - 32px));padding:28px;border:1px solid #334155;border-radius:16px;background:#111827}input,button{box-sizing:border-box;width:100%;padding:12px;border-radius:9px}input{background:#0b1220;color:#fff;border:1px solid #475569}button{margin-top:16px;border:0;background:#38bdf8;color:#082f49;font-weight:700}</style></head><body><main><h1>GHCO Data MCP</h1><p>Autorize o GPT a consultar e administrar, de forma controlada, BigQuery e Looker Studio.</p><form method="post" action="/authorize">${fields}<label>Chave privada do conector<input type="password" name="mcp_token" required autofocus></label><button type="submit">Autorizar</button></form></main></body></html>`, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

async function handleAuthorize(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  if (!env.MCP_BEARER_TOKEN || !timingSafeEqual(String(form.get("mcp_token") ?? ""), env.MCP_BEARER_TOKEN)) return new Response("Chave invalida.", { status: 401 });
  const redirectUri = String(form.get("redirect_uri") ?? "");
  const clientId = String(form.get("client_id") ?? "");
  if (String(form.get("response_type")) !== "code" || !redirectUri || !clientId) return json({ error: "invalid_request" }, 400);
  const code = await signPayload({
    type: "code", exp: Math.floor(Date.now() / 1000) + 300, client_id: clientId, redirect_uri: redirectUri,
    code_challenge: String(form.get("code_challenge") ?? ""), code_challenge_method: String(form.get("code_challenge_method") || "plain"),
    scope: String(form.get("scope") || "data.read data.write")
  }, env);
  const destination = new URL(redirectUri);
  destination.searchParams.set("code", code);
  const state = String(form.get("state") ?? "");
  if (state) destination.searchParams.set("state", state);
  return Response.redirect(destination.toString(), 302);
}

async function handleToken(request: Request, env: Env): Promise<Response> {
  if (!env.MCP_BEARER_TOKEN) return json({ error: "server_error" }, 500);
  const form = await request.formData();
  const grantType = String(form.get("grant_type") ?? "");
  if (grantType === "authorization_code") {
    const payload = await verifyPayload(String(form.get("code") ?? ""), env);
    if (!payload || payload.type !== "code" || payload.redirect_uri !== String(form.get("redirect_uri") ?? "")) return json({ error: "invalid_grant" }, 400);
    if (!(await verifyPkce(String(form.get("code_verifier") ?? ""), payload.code_challenge, payload.code_challenge_method))) return json({ error: "invalid_grant" }, 400);
    return issueTokens(env, payload.scope);
  }
  if (grantType === "refresh_token") {
    const payload = await verifyPayload(String(form.get("refresh_token") ?? ""), env);
    if (!payload || payload.type !== "refresh") return json({ error: "invalid_grant" }, 400);
    return issueTokens(env, payload.scope);
  }
  return json({ error: "unsupported_grant_type" }, 400);
}

async function issueTokens(env: Env, scope = "data.read data.write"): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);
  return json({
    access_token: await signPayload({ type: "access", exp: now + 3600, scope }, env),
    token_type: "Bearer", expires_in: 3600,
    refresh_token: await signPayload({ type: "refresh", exp: now + 60 * 60 * 24 * 30, scope }, env), scope
  });
}

async function requireBearer(request: Request, env: Env): Promise<Response | null> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return unauthorized(request);
  if (env.MCP_BEARER_TOKEN && timingSafeEqual(token, env.MCP_BEARER_TOKEN)) return null;
  const payload = await verifyPayload(token, env);
  return payload?.type === "access" ? null : unauthorized(request);
}

function unauthorized(request: Request): Response {
  const origin = new URL(request.url).origin;
  return json({ error: "Bearer token invalido." }, 401, { "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource", scope="data.read data.write"` });
}

async function signPayload(payload: OAuthPayload, env: Env): Promise<string> {
  const body = base64UrlEncode(JSON.stringify(payload));
  return `${body}.${await hmac(body, env)}`;
}
async function verifyPayload(token: string, env: Env): Promise<OAuthPayload | null> {
  const [body, signature] = token.split(".");
  if (!body || !signature || !timingSafeEqual(signature, await hmac(body, env))) return null;
  const payload = JSON.parse(base64UrlDecode(body)) as OAuthPayload;
  return payload.exp >= Math.floor(Date.now() / 1000) ? payload : null;
}
async function verifyPkce(verifier: string, challenge?: string, method = "plain"): Promise<boolean> {
  if (!challenge) return true;
  if (method === "S256") return base64UrlBytes(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)))) === challenge;
  return timingSafeEqual(verifier, challenge);
}
async function hmac(value: string, env: Env): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.MCP_BEARER_TOKEN ?? ""), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64UrlBytes(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}
function base64UrlEncode(value: string): string { return base64UrlBytes(new TextEncoder().encode(value)); }
function base64UrlBytes(bytes: Uint8Array): string { let binary = ""; bytes.forEach((byte) => { binary += String.fromCharCode(byte); }); return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, ""); }
function base64UrlDecode(value: string): string { const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=")); return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0))); }
function timingSafeEqual(left: string, right: string): boolean { if (left.length !== right.length) return false; let result = 0; for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index); return result === 0; }
function escapeHtml(value: string): string { return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char] ?? char); }
async function safeJson(request: Request): Promise<Record<string, unknown>> { try { return await request.json() as Record<string, unknown>; } catch { return {}; } }
function json(value: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response { return new Response(JSON.stringify(value, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extraHeaders } }); }
