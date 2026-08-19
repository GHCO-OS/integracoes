import express, { type Request, type Response, type NextFunction } from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { config } from "./config.js";
import { GoogleAdsClient, normalizeCustomerId } from "./googleAdsClient.js";
import { createGoogleAdsMcpServer } from "./mcpServer.js";

const googleAds = new GoogleAdsClient({
  apiVersion: config.GOOGLE_ADS_API_VERSION,
  clientId: config.GOOGLE_ADS_CLIENT_ID,
  clientSecret: config.GOOGLE_ADS_CLIENT_SECRET,
  refreshToken: config.GOOGLE_ADS_REFRESH_TOKEN,
  developerToken: config.GOOGLE_ADS_DEVELOPER_TOKEN,
  customerId: normalizeCustomerId(config.GOOGLE_ADS_CUSTOMER_ID),
  loginCustomerId: config.GOOGLE_ADS_LOGIN_CUSTOMER_ID
});

const app = express();
app.use(express.json({ limit: "1mb" }));

const transports = new Map<string, SSEServerTransport>();

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "google-ads-mcp",
    mode: "read-only",
    apiVersion: config.GOOGLE_ADS_API_VERSION
  });
});

app.get("/sse", requireBearerToken, async (_req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  transports.set(transport.sessionId, transport);

  res.on("close", () => {
    transports.delete(transport.sessionId);
  });

  await createGoogleAdsMcpServer(googleAds, {
    localUrl: `http://localhost:${config.PORT}/sse`,
    publicUrl: "https://google-ads-mcp.cuiabar.com/sse",
    apiVersion: config.GOOGLE_ADS_API_VERSION
  }).connect(transport);
});

app.post("/messages", requireBearerToken, async (req, res) => {
  const sessionId = String(req.query.sessionId ?? "");
  const transport = transports.get(sessionId);

  if (!transport) {
    res.status(404).json({ error: "Sessao MCP nao encontrada." });
    return;
  }

  await transport.handlePostMessage(req, res, req.body);
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = error instanceof Error ? error.message : "Erro interno.";
  res.status(500).json({ error: message });
});

app.listen(config.PORT, () => {
  console.log(`Google Ads MCP read-only em http://localhost:${config.PORT}/sse`);
});

function requireBearerToken(req: Request, res: Response, next: NextFunction): void {
  if (!config.MCP_BEARER_TOKEN) {
    next();
    return;
  }

  const expected = `Bearer ${config.MCP_BEARER_TOKEN}`;
  if (req.header("authorization") !== expected) {
    res.status(401).json({ error: "Bearer token invalido." });
    return;
  }

  next();
}
