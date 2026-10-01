import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { URL } from "node:url";

const execFileAsync = promisify(execFile);
const redirectUri = "http://127.0.0.1:8790/oauth2callback";
const artifactDir = resolve(process.cwd(), "../../ops-artifacts/ghco-data-mcp");
const clientId = process.env.GOOGLE_DATA_CLIENT_ID;
const clientSecret = process.env.GOOGLE_DATA_CLIENT_SECRET;
if (!clientId || !clientSecret) throw new Error("Defina GOOGLE_DATA_CLIENT_ID e GOOGLE_DATA_CLIENT_SECRET.");

const state = randomBytes(24).toString("hex");
const verifier = randomBytes(48).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");
const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
for (const [key, value] of Object.entries({
  client_id: clientId,
  redirect_uri: redirectUri,
  response_type: "code",
  scope: [
    "https://www.googleapis.com/auth/bigquery",
    "https://www.googleapis.com/auth/datastudio",
    "https://www.googleapis.com/auth/drive.readonly"
  ].join(" "),
  access_type: "offline",
  prompt: "consent",
  state,
  code_challenge: challenge,
  code_challenge_method: "S256"
})) authUrl.searchParams.set(key, value);

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", redirectUri);
    if (url.pathname !== "/oauth2callback" || url.searchParams.get("state") !== state) throw new Error("Callback OAuth invalido.");
    const code = url.searchParams.get("code");
    if (!code) throw new Error("Codigo OAuth ausente.");
    const body = new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, code_verifier: verifier, redirect_uri: redirectUri, grant_type: "authorization_code" }).toString();
    const { stdout } = await execFileAsync("curl.exe", ["--fail-with-body", "--silent", "--show-error", "--max-time", "30", "-H", "content-type: application/x-www-form-urlencoded", "--data", body, "https://oauth2.googleapis.com/token"], { maxBuffer: 1024 * 1024 });
    const payload = JSON.parse(stdout);
    if (!payload.refresh_token) throw new Error("O Google nao retornou refresh token.");
    await mkdir(artifactDir, { recursive: true });
    await writeFile(resolve(artifactDir, "google-data-refresh-token.local"), payload.refresh_token, "utf8");
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end("<h1>GHCO Data autorizado</h1><p>O token foi salvo apenas no artefato local temporario.</p>");
    console.log("Token salvo em services/ops-artifacts/ghco-data-mcp/google-data-refresh-token.local");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido.";
    console.error(`Falha no OAuth GHCO Data: ${message}`);
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end(message);
  } finally {
    server.close();
  }
});

server.listen(8790, "127.0.0.1", () => {
  console.log("Abra a URL e autorize BigQuery, Looker Studio e leitura das planilhas:");
  console.log(authUrl.toString());
});
