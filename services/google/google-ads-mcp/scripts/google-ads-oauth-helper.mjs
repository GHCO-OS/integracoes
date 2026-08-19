import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { URL } from "node:url";

const scope = "https://www.googleapis.com/auth/adwords";
const redirectUri = "http://127.0.0.1:8787/oauth2callback";
const artifactDir = resolve(process.cwd(), "../../ops-artifacts/google-ads-mcp");

const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error("Defina GOOGLE_ADS_CLIENT_ID e GOOGLE_ADS_CLIENT_SECRET antes de rodar.");
  process.exit(1);
}

const state = randomBytes(24).toString("hex");
const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authUrl.searchParams.set("client_id", clientId);
authUrl.searchParams.set("redirect_uri", redirectUri);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("scope", scope);
authUrl.searchParams.set("access_type", "offline");
authUrl.searchParams.set("prompt", "consent");
authUrl.searchParams.set("state", state);

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", redirectUri);
    if (url.pathname !== "/oauth2callback") {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    if (url.searchParams.get("state") !== state) {
      throw new Error("OAuth state invalido.");
    }

    const code = url.searchParams.get("code");
    if (!code) {
      throw new Error(`Codigo OAuth ausente: ${url.searchParams.get("error") ?? "erro desconhecido"}`);
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code"
      })
    });

    const payload = await tokenResponse.json();
    if (!tokenResponse.ok || !payload.refresh_token) {
      throw new Error(`Falha ao gerar refresh token: ${JSON.stringify(payload)}`);
    }

    await mkdir(artifactDir, { recursive: true });
    await writeFile(resolve(artifactDir, "google-ads-client-id.local"), clientId, "utf8");
    await writeFile(resolve(artifactDir, "google-ads-client-secret.local"), clientSecret, "utf8");
    await writeFile(resolve(artifactDir, "google-ads-refresh-token.local"), payload.refresh_token, "utf8");

    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end("<h1>Google Ads OAuth concluido</h1><p>Refresh token salvo localmente em ops-artifacts/google-ads-mcp.</p>");
    console.log("Refresh token salvo em ops-artifacts/google-ads-mcp/google-ads-refresh-token.local");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido.";
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end(message);
    console.error(message);
  } finally {
    server.close();
  }
});

server.listen(8787, "127.0.0.1", () => {
  console.log("Abra esta URL no navegador e autorize a conta Google Ads:");
  console.log(authUrl.toString());
});
