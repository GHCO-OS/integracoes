import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { URL } from "node:url";

const redirectUri = "http://127.0.0.1:8787/oauth2callback";
const artifactDir = resolve(process.cwd(), "../../ops-artifacts/google-ads-mcp");
const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
if (!clientId || !clientSecret) throw new Error("Defina GOOGLE_ADS_CLIENT_ID e GOOGLE_ADS_CLIENT_SECRET.");

const state = randomBytes(24).toString("hex");
const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
for (const [key, value] of Object.entries({
  client_id: clientId,
  redirect_uri: redirectUri,
  response_type: "code",
  scope: "https://www.googleapis.com/auth/content",
  access_type: "offline",
  prompt: "consent",
  state
})) authUrl.searchParams.set(key, value);

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", redirectUri);
    if (url.pathname !== "/oauth2callback" || url.searchParams.get("state") !== state) throw new Error("Callback OAuth invalido.");
    const code = url.searchParams.get("code");
    if (!code) throw new Error(`Codigo OAuth ausente: ${url.searchParams.get("error") ?? "erro desconhecido"}`);
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" })
    });
    const payload = await response.json();
    if (!response.ok || !payload.refresh_token) throw new Error(`Falha ao gerar refresh token: ${JSON.stringify(payload)}`);
    await mkdir(artifactDir, { recursive: true });
    await writeFile(resolve(artifactDir, "google-merchant-refresh-token.local"), payload.refresh_token, "utf8");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end("<h1>Merchant OAuth concluido</h1><p>Token salvo somente no artefato local.</p>");
    console.log("Token salvo em ops-artifacts/google-ads-mcp/google-merchant-refresh-token.local");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido.";
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end(message);
  } finally {
    server.close();
  }
});
server.listen(8787, "127.0.0.1", () => {
  console.log("Abra esta URL e autorize a conta vinculada ao Merchant Center:");
  console.log(authUrl.toString());
});
