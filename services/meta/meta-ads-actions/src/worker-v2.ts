import legacy from "./worker";

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
type GraphMethod = "GET" | "POST" | "DELETE";

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const REQUIRED_ENV: Array<keyof Env> = [
  "META_ACCESS_TOKEN",
  "META_AD_ACCOUNT_ID",
  "META_ACTIONS_BEARER_TOKEN",
];

const PUBLIC_PATHS = new Set(["/", "/health", "/actions/health", "/openapi.json"]);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);

    try {
      if (url.pathname === "/openapi.json") {
        const response = await legacy.fetch(request, env);
        const schema = (await response.json()) as JsonObject;
        return withRequestId(json(augmentOpenApi(schema)), requestId);
      }

      if (PUBLIC_PATHS.has(url.pathname)) {
        return withRequestId(await legacy.fetch(request, env), requestId);
      }

      if (!url.pathname.startsWith("/actions/")) {
        return withRequestId(await legacy.fetch(request, env), requestId);
      }

      const authError = await requireBearer(request, env);
      if (authError) return withRequestId(authError, requestId);

      const missing = REQUIRED_ENV.filter((key) => !env[key]);
      if (missing.length > 0) {
        return withRequestId(
          json({ error: "Meta Actions secrets ausentes.", missingSecrets: missing }, 503),
          requestId,
        );
      }

      let response: Response;
      if (url.pathname === "/actions/health/deep" && request.method === "GET") {
        response = await deepHealth(env, requestId);
      } else if (url.pathname === "/actions/account-spend" && request.method === "GET") {
        response = await accountSpend(url, env);
      } else if (url.pathname === "/actions/update-object-status" && request.method === "POST") {
        response = await guardedWrite(request, env, updateObjectStatus);
      } else if (url.pathname === "/actions/update-budget" && request.method === "POST") {
        response = await guardedWrite(request, env, updateBudget);
      } else if (url.pathname === "/actions/enforce-spend-limit" && request.method === "POST") {
        response = await guardedWrite(request, env, enforceSpendLimit);
      } else if (url.pathname === "/actions/create-carousel-ad" && request.method === "POST") {
        response = await guardedWrite(request, env, createCarouselAd);
      } else {
        response = await legacy.fetch(request, env);
      }

      if (request.method === "POST") {
        const input = (await request.clone().json().catch(() => ({}))) as JsonObject;
        console.log(
          JSON.stringify({
            event: "meta_action",
            requestId,
            path: url.pathname,
            validateOnly: input.validateOnly === true,
            status: response.status,
          }),
        );
      }

      return withRequestId(response, requestId);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      const message = error instanceof Error ? error.message : "Erro interno.";
      console.error(
        JSON.stringify({
          event: "meta_action_error",
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

async function guardedWrite(
  request: Request,
  env: Env,
  action: (env: Env, input: JsonObject) => Promise<unknown>,
): Promise<Response> {
  const input = (await request.clone().json().catch(() => ({}))) as JsonObject;
  if (input.validateOnly !== true && input.confirmWrite !== "CONFIRM_WRITE") {
    throw new HttpError(
      400,
      "Escrita bloqueada. Use validateOnly=true para simular ou confirmWrite=CONFIRM_WRITE para executar.",
    );
  }
  return json(await action(env, input));
}

async function deepHealth(env: Env, requestId: string): Promise<Response> {
  const started = Date.now();
  const me = await graph(env, "GET", "/me", { fields: "id,name" });
  const accounts = await graph(env, "GET", "/me/adaccounts", {
    fields: "id,name,account_status,currency,timezone_name",
    limit: 25,
  });
  return json({
    ok: true,
    service: "meta-ads-actions",
    metaReachable: true,
    apiVersion: env.META_GRAPH_API_VERSION || "v25.0",
    latencyMsApprox: Math.max(0, Date.now() - started),
    me,
    adAccounts: accounts,
    requestId,
  });
}

async function accountSpend(url: URL, env: Env): Promise<Response> {
  const adAccountId = normalizeAdAccountId(
    url.searchParams.get("adAccountId") || env.META_AD_ACCOUNT_ID || "",
  );
  const startDate = requiredDate(url.searchParams.get("startDate"), "startDate");
  const endDate = requiredDate(url.searchParams.get("endDate"), "endDate");
  return json(
    await graph(env, "GET", `/${adAccountId}/insights`, {
      fields:
        "account_id,account_name,spend,impressions,reach,clicks,cpc,cpm,ctr,actions,action_values,purchase_roas",
      level: "account",
      time_range: JSON.stringify({ since: startDate, until: endDate }),
      limit: 10,
    }),
  );
}

async function updateObjectStatus(env: Env, input: JsonObject): Promise<unknown> {
  const objectId = requiredBodyString(input, "objectId");
  const status = enumValue(
    String(input.status || "").toUpperCase(),
    ["ACTIVE", "PAUSED"],
    "status",
  );
  const payload = { status };
  if (input.validateOnly === true) {
    return { ok: true, validateOnly: true, objectId, payload };
  }
  return graph(env, "POST", `/${objectId}`, {}, payload);
}

async function updateBudget(env: Env, input: JsonObject): Promise<unknown> {
  const objectId = requiredBodyString(input, "objectId");
  const payload: JsonObject = {};

  if (input.dailyBudget !== undefined) {
    payload.daily_budget = positiveInteger(input.dailyBudget, "dailyBudget");
  }
  if (input.lifetimeBudget !== undefined) {
    payload.lifetime_budget = positiveInteger(input.lifetimeBudget, "lifetimeBudget");
  }
  if (Object.keys(payload).length === 0) {
    throw new HttpError(400, "Informe dailyBudget e/ou lifetimeBudget.");
  }

  if (input.validateOnly === true) {
    return { ok: true, validateOnly: true, objectId, payload };
  }
  return graph(env, "POST", `/${objectId}`, {}, payload);
}

async function enforceSpendLimit(env: Env, input: JsonObject): Promise<unknown> {
  const objectId = requiredBodyString(input, "objectId");
  const level = enumValue(
    String(input.level || "campaign"),
    ["campaign", "adset", "ad"],
    "level",
  );
  const maxSpend = positiveNumber(input.maxSpend, "maxSpend");
  const date =
    typeof input.date === "string" && input.date
      ? requiredDate(input.date, "date")
      : new Date().toISOString().slice(0, 10);

  const insights = (await graph(env, "GET", `/${objectId}/insights`, {
    fields: "spend",
    level,
    time_range: JSON.stringify({ since: date, until: date }),
    limit: 10,
  })) as { data?: Array<{ spend?: string }> };

  const spend = Number(insights.data?.[0]?.spend || 0);
  const exceeded = spend >= maxSpend;

  if (!exceeded || input.validateOnly === true) {
    return {
      ok: true,
      validateOnly: input.validateOnly === true,
      objectId,
      level,
      date,
      spend,
      maxSpend,
      exceeded,
      action: exceeded ? "WOULD_PAUSE" : "NO_ACTION",
    };
  }

  const result = await graph(env, "POST", `/${objectId}`, {}, { status: "PAUSED" });
  return {
    ok: true,
    objectId,
    level,
    date,
    spend,
    maxSpend,
    exceeded: true,
    action: "PAUSED",
    result,
  };
}

async function createCarouselAd(env: Env, input: JsonObject): Promise<unknown> {
  const adAccountId = normalizeAdAccountId(
    String(input.adAccountId || env.META_AD_ACCOUNT_ID || ""),
  );
  const adSetId = requiredBodyString(input, "adSetId");
  const pageId = String(input.pageId || env.META_PAGE_ID || "");
  if (!pageId) throw new HttpError(400, "pageId e obrigatorio.");

  const cards = Array.isArray(input.cards) ? input.cards : [];
  if (cards.length < 2 || cards.length > 10) {
    throw new HttpError(400, "cards deve conter entre 2 e 10 itens.");
  }

  const childAttachments = cards.map((raw, index) => {
    const card = raw as JsonObject;
    if (!card.imageHash && !card.imageUrl) {
      throw new HttpError(400, `cards[${index}] precisa de imageHash ou imageUrl.`);
    }
    return {
      link: requiredBodyString(card, "linkUrl"),
      name: requiredBodyString(card, "headline"),
      description: card.description,
      image_hash: card.imageHash,
      picture: card.imageUrl,
    };
  });

  const objectStorySpec = {
    page_id: pageId,
    link_data: {
      link: requiredBodyString(input, "linkUrl"),
      message: requiredBodyString(input, "message"),
      name: input.headline,
      description: input.description,
      child_attachments: childAttachments,
      multi_share_optimized: input.multiShareOptimized !== false,
      call_to_action: {
        type: input.callToActionType || "LEARN_MORE",
        value: { link: requiredBodyString(input, "linkUrl") },
      },
    },
  };

  const preview = {
    adAccountId,
    creative: {
      name: input.creativeName || input.adName,
      object_story_spec: objectStorySpec,
    },
    ad: {
      name: requiredBodyString(input, "adName"),
      adset_id: adSetId,
      status: input.adStatus || "PAUSED",
    },
  };

  if (input.validateOnly === true) {
    return { ok: true, validateOnly: true, ...preview };
  }

  const creative = (await graph(
    env,
    "POST",
    `/${adAccountId}/adcreatives`,
    {},
    preview.creative,
  )) as JsonObject;

  const ad = await graph(env, "POST", `/${adAccountId}/ads`, {}, {
    ...preview.ad,
    creative: { creative_id: creative.id },
  });

  return { creative, ad };
}

async function graph(
  env: Env,
  method: GraphMethod,
  path: string,
  query: JsonObject = {},
  body: JsonObject = {},
): Promise<unknown> {
  const token = env.META_ACCESS_TOKEN;
  if (!token) throw new HttpError(503, "META_ACCESS_TOKEN ausente.");

  const version = normalizeApiVersion(env.META_GRAPH_API_VERSION || "v25.0");
  const normalizedPath = normalizeGraphPath(path);
  const url = new URL(`https://graph.facebook.com/${version}${normalizedPath}`);

  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const headers = new Headers({
    authorization: `Bearer ${token}`,
    accept: "application/json",
  });
  const init: RequestInit = { method, headers };

  if (method !== "GET") {
    headers.set("content-type", "application/x-www-form-urlencoded");
    init.body = new URLSearchParams(flatten(body));
  }

  const response = await fetch(url.toString(), init);
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

function augmentOpenApi(schema: JsonObject): JsonObject {
  const paths = ((schema.paths || {}) as JsonObject);
  const security = [{ bearerAuth: [] }];

  const str = (description?: string) =>
    description ? { type: "string", description } : { type: "string" };
  const writeControl = {
    validateOnly: {
      type: "boolean",
      default: true,
      description: "Simula sem alterar a Meta.",
    },
    confirmWrite: {
      type: "string",
      description: "Para escrita real, deve ser exatamente CONFIRM_WRITE.",
    },
  };
  const post = (
    operationId: string,
    summary: string,
    properties: JsonObject,
    required: string[] = [],
    additionalProperties = false,
  ) => ({
    post: {
      operationId,
      summary,
      security,
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              additionalProperties,
              properties: { ...properties, ...writeControl },
              required,
            },
          },
        },
      },
      responses: {
        "200": { description: "OK" },
        "400": { description: "Invalid request or write confirmation missing" },
        "401": { description: "Unauthorized" },
      },
    },
  });
  const get = (
    operationId: string,
    summary: string,
    parameters: JsonObject[] = [],
  ) => ({
    get: {
      operationId,
      summary,
      security,
      parameters,
      responses: { "200": { description: "OK" } },
    },
  });
  const q = (name: string, required = false) => ({
    name,
    in: "query",
    required,
    schema: { type: "string" },
  });

  paths["/actions/health/deep"] = get(
    "checkMetaDeepHealth",
    "Validate live Meta token and ad-account connectivity",
  );
  paths["/actions/account-spend"] = get(
    "getMetaAccountSpend",
    "Get ad-account spend for a date range",
    [q("startDate", true), q("endDate", true), q("adAccountId")],
  );
  paths["/actions/update-object-status"] = post(
    "updateMetaObjectStatus",
    "Pause or activate a campaign, ad set or ad",
    {
      objectId: str(),
      status: { type: "string", enum: ["ACTIVE", "PAUSED"] },
    },
    ["objectId", "status"],
  );
  paths["/actions/update-budget"] = post(
    "updateMetaBudget",
    "Update campaign or ad-set budget",
    {
      objectId: str(),
      dailyBudget: {
        type: "integer",
        minimum: 1,
        description: "Minor currency units, e.g. 5000 = R$ 50.00.",
      },
      lifetimeBudget: {
        type: "integer",
        minimum: 1,
        description: "Minor currency units.",
      },
    },
    ["objectId"],
  );
  paths["/actions/enforce-spend-limit"] = post(
    "enforceMetaSpendLimit",
    "Check spend and pause the object if the threshold was reached",
    {
      objectId: str(),
      level: {
        type: "string",
        enum: ["campaign", "adset", "ad"],
        default: "campaign",
      },
      maxSpend: {
        type: "number",
        exclusiveMinimum: 0,
        description: "Account currency units, e.g. 50 = R$ 50.",
      },
      date: str("YYYY-MM-DD; defaults to today."),
    },
    ["objectId", "maxSpend"],
  );
  paths["/actions/create-carousel-ad"] = post(
    "createMetaCarouselAd",
    "Create a carousel creative and ad",
    {
      adAccountId: str(),
      adSetId: str(),
      pageId: str(),
      linkUrl: str(),
      adName: str(),
      creativeName: str(),
      message: str(),
      headline: str(),
      description: str(),
      callToActionType: str(),
      multiShareOptimized: { type: "boolean", default: true },
      adStatus: { type: "string", enum: ["PAUSED", "ACTIVE"], default: "PAUSED" },
      cards: {
        type: "array",
        minItems: 2,
        maxItems: 10,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            headline: str(),
            description: str(),
            linkUrl: str(),
            imageHash: str(),
            imageUrl: str(),
          },
          required: ["headline", "linkUrl"],
        },
      },
    },
    ["adSetId", "linkUrl", "adName", "message", "cards"],
  );

  paths["/actions/page-feed"] = get("getMetaPageFeed", "Get Facebook Page feed", [
    q("pageId"),
    q("fields"),
    q("limit"),
  ]);
  paths["/actions/instagram-media"] = get(
    "listMetaInstagramMedia",
    "List Instagram Business media",
    [q("instagramBusinessAccountId"), q("fields"), q("limit")],
  );
  paths["/actions/comments"] = get("listMetaComments", "List comments", [
    q("objectId", true),
    q("fields"),
    q("limit"),
  ]);

  paths["/actions/create-page-post"] = post(
    "createMetaPagePost",
    "Publish a Facebook Page post",
    { pageId: str(), message: str(), link: str() },
    ["message"],
    true,
  );
  paths["/actions/create-page-photo"] = post(
    "createMetaPagePhoto",
    "Publish a Facebook Page photo",
    { pageId: str(), url: str(), caption: str(), published: { type: "boolean" } },
    ["url"],
    true,
  );
  paths["/actions/create-page-video"] = post(
    "createMetaPageVideo",
    "Publish a Facebook Page video",
    { pageId: str(), file_url: str(), title: str(), description: str() },
    ["file_url"],
    true,
  );
  paths["/actions/update-page-post"] = post(
    "updateMetaPagePost",
    "Update a Facebook Page post",
    { postId: str(), message: str() },
    ["postId"],
    true,
  );
  paths["/actions/update-page-profile"] = post(
    "updateMetaPageProfile",
    "Update supported Facebook Page fields",
    { pageId: str() },
    [],
    true,
  );
  paths["/actions/delete-meta-content"] = post(
    "deleteMetaContent",
    "Delete supported Facebook or Instagram content",
    { objectId: str() },
    ["objectId"],
  );
  paths["/actions/create-instagram-media-container"] = post(
    "createInstagramMediaContainer",
    "Create an Instagram image, video or carousel media container",
    { instagramBusinessAccountId: str() },
    [],
    true,
  );
  paths["/actions/publish-instagram-content"] = post(
    "publishInstagramContent",
    "Publish an Instagram media container",
    {
      instagramBusinessAccountId: str(),
      creation_id: str(),
      creationId: str(),
    },
    [],
    true,
  );
  paths["/actions/reply-comment"] = post(
    "replyMetaComment",
    "Reply to a Facebook or Instagram comment",
    { commentId: str(), message: str() },
    ["commentId", "message"],
    true,
  );
  paths["/actions/moderate-comment"] = post(
    "moderateMetaComment",
    "Moderate a supported comment",
    { commentId: str(), is_hidden: { type: "boolean" } },
    ["commentId"],
    true,
  );
  paths["/actions/send-meta-message"] = post(
    "sendMetaMessage",
    "Send a supported Page message",
    {},
    [],
    true,
  );

  for (const uploadPath of ["/actions/upload-ad-image", "/actions/upload-ad-video"]) {
    const operation = paths[uploadPath] as JsonObject | undefined;
    const postOperation = operation?.post as JsonObject | undefined;
    const requestBody = postOperation?.requestBody as JsonObject | undefined;
    const content = requestBody?.content as JsonObject | undefined;
    const jsonContent = content?.["application/json"] as JsonObject | undefined;
    const bodySchema = jsonContent?.schema as JsonObject | undefined;
    const properties = (bodySchema?.properties || {}) as JsonObject;
    if (bodySchema) bodySchema.properties = { ...properties, ...writeControl };
  }

  schema.paths = paths;
  const info = (schema.info || {}) as JsonObject;
  schema.info = {
    ...info,
    title: "GHCO Meta Operations API",
    version: "0.3.0",
    description:
      "Meta Graph/Marketing/Business API with controlled writes, explicit budget/status operations, carousel creation and social publishing.",
  };
  return schema;
}

function normalizeApiVersion(value: string): string {
  if (!/^v\d+\.\d+$/.test(value)) throw new HttpError(400, "Versao da Graph API invalida.");
  return value;
}

function normalizeGraphPath(path: string): string {
  if (!path || path.includes("://")) throw new HttpError(400, "Graph path invalido.");
  return path.startsWith("/") ? path : `/${path}`;
}

function normalizeAdAccountId(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) throw new HttpError(400, "adAccountId invalido.");
  return `act_${digits}`;
}

function requiredDate(value: string | null, name: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(400, `${name} deve estar no formato YYYY-MM-DD.`);
  }
  return value;
}

function requiredBodyString(body: JsonObject, name: string): string {
  const value = body[name];
  if (typeof value !== "string" || !value) throw new HttpError(400, `${name} e obrigatorio.`);
  return value;
}

function enumValue(value: string, allowed: string[], name: string): string {
  if (!allowed.includes(value)) {
    throw new HttpError(400, `${name} deve ser um de: ${allowed.join(", ")}.`);
  }
  return value;
}

function positiveInteger(value: unknown, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new HttpError(400, `${name} deve ser inteiro positivo.`);
  }
  return parsed;
}

function positiveNumber(value: unknown, name: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new HttpError(400, `${name} deve ser numero positivo.`);
  }
  return parsed;
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
