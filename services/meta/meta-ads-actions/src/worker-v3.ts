import v2 from "./worker-v2";

type Env = {
  META_GRAPH_API_VERSION?: string;
  META_ACCESS_TOKEN?: string;
  META_AD_ACCOUNT_ID?: string;
  META_ACTIONS_BEARER_TOKEN?: string;
  META_PAGE_ACCESS_TOKEN?: string;
  META_PAGE_ID?: string;
  META_INSTAGRAM_BUSINESS_ACCOUNT_ID?: string;
  META_BUSINESS_ID?: string;
  META_WHATSAPP_BUSINESS_ACCOUNT_ID?: string;
  META_CATALOG_ID?: string;
};

type JsonObject = Record<string, unknown>;
type GraphMethod = "POST" | "DELETE";

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const SOCIAL_WRITE_PATHS = new Set([
  "/actions/create-page-post",
  "/actions/create-page-photo",
  "/actions/create-page-video",
  "/actions/update-page-post",
  "/actions/update-page-profile",
  "/actions/delete-meta-content",
  "/actions/create-instagram-media-container",
  "/actions/publish-instagram-media-container",
  "/actions/publish-instagram-content",
  "/actions/reply-comment",
  "/actions/moderate-comment",
  "/actions/send-meta-message",
]);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method !== "POST" || !SOCIAL_WRITE_PATHS.has(url.pathname)) {
      return v2.fetch(request, env);
    }

    const requestId = crypto.randomUUID();

    try {
      const authError = await requireBearer(request, env);
      if (authError) return withRequestId(authError, requestId);

      if (!env.META_ACCESS_TOKEN) {
        throw new HttpError(503, "META_ACCESS_TOKEN ausente.");
      }

      const input = (await request.clone().json().catch(() => ({}))) as JsonObject;
      if (input.validateOnly !== true && input.confirmWrite !== "CONFIRM_WRITE") {
        throw new HttpError(
          400,
          "Escrita bloqueada. Use validateOnly=true para simular ou confirmWrite=CONFIRM_WRITE para executar.",
        );
      }

      const result = await socialWrite(env, url.pathname, input);

      console.log(
        JSON.stringify({
          event: "meta_social_action",
          requestId,
          path: url.pathname,
          validateOnly: input.validateOnly === true,
          status: 200,
        }),
      );

      return withRequestId(json(result), requestId);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      const message = error instanceof Error ? error.message : "Erro interno.";
      console.error(
        JSON.stringify({
          event: "meta_social_action_error",
          requestId,
          path: url.pathname,
          status,
          error: message,
        }),
      );
      return withRequestId(json({ error: message, requestId }, status), requestId);
    }
  },
};

async function socialWrite(
  env: Env,
  pathname: string,
  input: JsonObject,
): Promise<unknown> {
  const pageToken = env.META_PAGE_ACCESS_TOKEN || env.META_ACCESS_TOKEN;

  const previewOrWrite = async (
    method: GraphMethod,
    path: string,
    payload: JsonObject,
    accessToken?: string,
  ): Promise<unknown> => {
    if (input.validateOnly === true) {
      return { ok: true, validateOnly: true, method, path, payload };
    }
    return graph(env, method, path, payload, accessToken);
  };

  if (pathname === "/actions/create-page-post") {
    const pageId = pageIdFrom(input, env);
    return previewOrWrite(
      "POST",
      `/${pageId}/feed`,
      stripControlFields(input, ["pageId"]),
      pageToken,
    );
  }

  if (pathname === "/actions/create-page-photo") {
    const pageId = pageIdFrom(input, env);
    return previewOrWrite(
      "POST",
      `/${pageId}/photos`,
      stripControlFields(input, ["pageId"]),
      pageToken,
    );
  }

  if (pathname === "/actions/create-page-video") {
    const pageId = pageIdFrom(input, env);
    return previewOrWrite(
      "POST",
      `/${pageId}/videos`,
      stripControlFields(input, ["pageId"]),
      pageToken,
    );
  }

  if (pathname === "/actions/update-page-post") {
    const postId = requiredBodyString(input, "postId");
    return previewOrWrite(
      "POST",
      `/${postId}`,
      stripControlFields(input, ["postId"]),
      pageToken,
    );
  }

  if (pathname === "/actions/update-page-profile") {
    const pageId = pageIdFrom(input, env);
    return previewOrWrite(
      "POST",
      `/${pageId}`,
      stripControlFields(input, ["pageId"]),
      pageToken,
    );
  }

  if (pathname === "/actions/delete-meta-content") {
    const objectId = requiredBodyString(input, "objectId");
    return previewOrWrite("DELETE", `/${objectId}`, {}, pageToken);
  }

  if (pathname === "/actions/create-instagram-media-container") {
    const igId = instagramIdFrom(input, env);
    return previewOrWrite(
      "POST",
      `/${igId}/media`,
      stripControlFields(input, ["instagramBusinessAccountId"]),
    );
  }

  if (
    pathname === "/actions/publish-instagram-media-container" ||
    pathname === "/actions/publish-instagram-content"
  ) {
    const igId = instagramIdFrom(input, env);
    const payload = stripControlFields(input, [
      "instagramBusinessAccountId",
      "creationId",
    ]);
    if (!payload.creation_id && input.creationId) {
      payload.creation_id = input.creationId;
    }
    if (!payload.creation_id) {
      throw new HttpError(400, "creation_id ou creationId e obrigatorio.");
    }
    return previewOrWrite("POST", `/${igId}/media_publish`, payload);
  }

  if (pathname === "/actions/reply-comment") {
    const commentId = requiredBodyString(input, "commentId");
    return previewOrWrite(
      "POST",
      `/${commentId}/comments`,
      stripControlFields(input, ["commentId"]),
      pageToken,
    );
  }

  if (pathname === "/actions/moderate-comment") {
    const commentId = requiredBodyString(input, "commentId");
    return previewOrWrite(
      "POST",
      `/${commentId}`,
      stripControlFields(input, ["commentId"]),
      pageToken,
    );
  }

  if (pathname === "/actions/send-meta-message") {
    return previewOrWrite(
      "POST",
      "/me/messages",
      stripControlFields(input),
      pageToken,
    );
  }

  throw new HttpError(404, "Acao social nao encontrada.");
}

async function graph(
  env: Env,
  method: GraphMethod,
  path: string,
  body: JsonObject,
  accessToken?: string,
): Promise<unknown> {
  const token = accessToken || env.META_ACCESS_TOKEN;
  if (!token) throw new HttpError(503, "Token Meta ausente.");

  const version = normalizeApiVersion(env.META_GRAPH_API_VERSION || "v25.0");
  const normalizedPath = normalizeGraphPath(path);
  const url = new URL(`https://graph.facebook.com/${version}${normalizedPath}`);

  const headers = new Headers({
    authorization: `Bearer ${token}`,
    accept: "application/json",
    "content-type": "application/x-www-form-urlencoded",
  });

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: method === "DELETE" ? undefined : new URLSearchParams(flatten(body)),
  });

  const text = await response.text();
  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text.slice(0, 2000) };
  }

  if (!response.ok) {
    throw new HttpError(
      response.status >= 400 && response.status < 500 ? 400 : 502,
      `Meta Graph API ${response.status}: ${JSON.stringify(payload)}`,
    );
  }

  return payload;
}

async function requireBearer(request: Request, env: Env): Promise<Response | null> {
  if (!env.META_ACTIONS_BEARER_TOKEN) {
    return json(
      {
        ok: false,
        auth: "server_secret_missing",
        error: "META_ACTIONS_BEARER_TOKEN ausente.",
      },
      503,
    );
  }

  const authorization = request.headers.get("authorization") || "";
  const candidates = [
    authorization,
    authorization.replace(/^Bearer\s+/i, ""),
    request.headers.get("x-api-key") || "",
    request.headers.get("api-key") || "",
  ]
    .map((value) => value.trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    if (await secureEqual(candidate, env.META_ACTIONS_BEARER_TOKEN)) return null;
  }

  return json(
    {
      ok: false,
      auth: "invalid_or_missing_action_bearer",
      error: "Bearer token invalido ou ausente na chamada.",
    },
    401,
  );
}

async function secureEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [aHash, bHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  const av = new Uint8Array(aHash);
  const bv = new Uint8Array(bHash);
  let diff = 0;
  for (let i = 0; i < av.length; i += 1) diff |= av[i] ^ bv[i];
  return diff === 0;
}

function pageIdFrom(input: JsonObject, env: Env): string {
  const pageId = String(input.pageId || env.META_PAGE_ID || "");
  if (!pageId) throw new HttpError(400, "pageId e obrigatorio.");
  return pageId;
}

function instagramIdFrom(input: JsonObject, env: Env): string {
  const igId = String(
    input.instagramBusinessAccountId ||
      env.META_INSTAGRAM_BUSINESS_ACCOUNT_ID ||
      "",
  );
  if (!igId) {
    throw new HttpError(400, "instagramBusinessAccountId e obrigatorio.");
  }
  return igId;
}

function requiredBodyString(body: JsonObject, name: string): string {
  const value = body[name];
  if (typeof value !== "string" || !value) {
    throw new HttpError(400, `${name} e obrigatorio.`);
  }
  return value;
}

function stripControlFields(
  input: JsonObject,
  additional: string[] = [],
): JsonObject {
  const blocked = new Set([
    "confirmWrite",
    "validateOnly",
    "apiVersion",
    ...additional,
  ]);
  return Object.fromEntries(
    Object.entries(input).filter(([key]) => !blocked.has(key)),
  );
}

function normalizeApiVersion(value: string): string {
  if (!/^v\d+\.\d+$/.test(value)) {
    throw new HttpError(400, "Versao da Graph API invalida.");
  }
  return value;
}

function normalizeGraphPath(path: string): string {
  if (!path || path.includes("://")) {
    throw new HttpError(400, "Graph path invalido.");
  }
  return path.startsWith("/") ? path : `/${path}`;
}

function flatten(input: JsonObject): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    out[key] = typeof value === "string" ? value : JSON.stringify(value);
  }
  return out;
}

function withRequestId(response: Response, requestId: string): Response {
  response.headers.set("x-request-id", requestId);
  return response;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
