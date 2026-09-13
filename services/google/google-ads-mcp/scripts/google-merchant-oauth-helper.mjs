import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { URL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const redirectUri = "http://127.0.0.1:8787/oauth2callback";
const artifactDir = resolve(process.cwd(), "../../ops-artifacts/google-ads-mcp");
const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
if (!clientId) throw new Error("Defina GOOGLE_ADS_CLIENT_ID.");

const state = randomBytes(24).toString("hex");
const codeVerifier = randomBytes(48).toString("base64url");
const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
for (const [key, value] of Object.entries({
  client_id: clientId,
  redirect_uri: redirectUri,
  response_type: "code",
  scope: "https://www.googleapis.com/auth/content",
  access_type: "offline",
  prompt: "consent",
  state,
  code_challenge: codeChallenge,
  code_challenge_method: "S256"
})) authUrl.searchParams.set(key, value);

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", redirectUri);
    if (url.pathname !== "/oauth2callback" || url.searchParams.get("state") !== state) throw new Error("Callback OAuth invalido.");
    const code = url.searchParams.get("code");
    if (!code) throw new Error(`Codigo OAuth ausente: ${url.searchParams.get("error") ?? "erro desconhecido"}`);
    const tokenParameters = { code, client_id: clientId, code_verifier: codeVerifier, redirect_uri: redirectUri, grant_type: "authorization_code" };
    if (clientSecret) tokenParameters.client_secret = clientSecret;
    const tokenBody = new URLSearchParams(tokenParameters).toString();
    const { stdout } = await execFileAsync("curl.exe", [
      "--fail-with-body",
      "--silent",
      "--show-error",
      "--max-time",
      "30",
      "-H",
      "content-type: application/x-www-form-urlencoded",
      "--data",
      tokenBody,
      "https://oauth2.googleapis.com/token"
    ], { maxBuffer: 1024 * 1024 });
    const payload = JSON.parse(stdout);
    if (!payload.refresh_token) throw new Error("O Google nao retornou refresh token.");
    await mkdir(artifactDir, { recursive: true });
    await writeFile(resolve(artifactDir, "google-merchant-refresh-token.local"), payload.refresh_token, "utf8");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end("<h1>Merchant OAuth concluido</h1><p>Token salvo somente no artefato local.</p>");
    console.log("Token salvo em ops-artifacts/google-ads-mcp/google-merchant-refresh-token.local");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido.";
    console.error(`Falha no OAuth Merchant: ${message}`);
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
