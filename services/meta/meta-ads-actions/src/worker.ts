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

const REQUIRED_ENV: Array<keyof Env> = ["META_ACCESS_TOKEN", "META_AD_ACCOUNT_ID", "META_ACTIONS_BEARER_TOKEN"];

const DEFAULT_FIELDS = {
  campaigns: "id,name,status,effective_status,objective,buying_type,created_time,updated_time,daily_budget,lifetime_budget",
  adsets:
    "id,name,status,effective_status,campaign_id,optimization_goal,billing_event,bid_strategy,daily_budget,lifetime_budget,start_time,end_time,created_time,updated_time,targeting,promoted_object",
  ads: "id,name,status,effective_status,campaign_id,adset_id,creative{id,name,object_story_spec},created_time,updated_time",
  creatives: "id,name,title,body,object_story_spec,thumbnail_url,effective_object_story_id",
  businesses:
    "id,name,created_time,updated_time,verification_status,timezone_id,primary_page,owned_pages{id,name},owned_ad_accounts{id,name,account_status},client_ad_accounts{id,name,account_status}",
  pages: "id,name,category,verification_status,access_token,tasks,instagram_business_account{id,username,name}",
  whatsappAccounts:
    "id,name,currency,timezone_id,message_template_namespace,business_verification_status,account_review_status,analytics",
  whatsappNumbers:
    "id,display_phone_number,verified_name,quality_rating,code_verification_status,platform_type,status,throughput",
  catalogs: "id,name,vertical,product_count,business{id,name},is_catalog_segment,feed_count,created_time",
  products: "id,name,retailer_id,availability,condition,price,sale_price,url,image_url,description,brand,category"
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const url = new URL(request.url);

      if (url.pathname === "/" || url.pathname === "/health" || url.pathname === "/actions/health") {
        return health(env);
      }

      if (url.pathname === "/openapi.json") {
        return json(openApiSchema(url.origin));
      }

      if (!url.pathname.startsWith("/actions/")) {
        return json({ error: "Not found" }, 404);
      }

      const authError = requireBearer(request, env);
      if (authError) {
        return authError;
      }

      const missing = REQUIRED_ENV.filter((key) => !env[key]);
      if (missing.length > 0) {
        return json({ error: "Meta Actions secrets ausentes.", missingSecrets: missing }, 503);
      }

      return handleAction(request, env);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro interno.";
      return json({ error: message }, 500);
    }
  }
};

async function handleAction(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const adAccountId = normalizeAdAccountId(url.searchParams.get("adAccountId") || env.META_AD_ACCOUNT_ID!);

  if (request.method === "POST") {
    const input = (await request.clone().json().catch(() => ({}))) as JsonObject;
    const isGenericRead =
      (url.pathname === "/actions/meta-graph-request" || url.pathname === "/actions/meta-graph-request-v2") &&
      String(input.method || "GET").toUpperCase() === "GET";
    if (!isGenericRead && input.validateOnly !== true && input.confirmWrite !== "CONFIRM_WRITE") {
      throw new Error("Escrita bloqueada. Use validateOnly=true para simular ou confirmWrite=CONFIRM_WRITE para executar.");
    }
  }

  if (url.pathname === "/actions/health" && request.method === "GET") return health(env);
  if (url.pathname === "/actions/me" && request.method === "GET") return json(await graph(env, "GET", "/me", { fields: "id,name" }));
  if (url.pathname === "/actions/permissions" && request.method === "GET") return json(await graph(env, "GET", "/me/permissions", {}));

  if (url.pathname === "/actions/ad-accounts" && request.method === "GET") {
    return json(await graph(env, "GET", "/me/adaccounts", { fields: "id,name,account_status,currency,timezone_name", limit: limit(url, 50) }));
  }

  if (url.pathname === "/actions/campaigns" && request.method === "GET") {
    return json(await graph(env, "GET", `/${adAccountId}/campaigns`, { fields: DEFAULT_FIELDS.campaigns, effective_status: statusFilter(url), limit: limit(url, 100) }));
  }

  if (url.pathname === "/actions/adsets" && request.method === "GET") {
    return json(await graph(env, "GET", `/${adAccountId}/adsets`, { fields: DEFAULT_FIELDS.adsets, effective_status: statusFilter(url), limit: limit(url, 100) }));
  }

  if (url.pathname === "/actions/ads" && request.method === "GET") {
    return json(await graph(env, "GET", `/${adAccountId}/ads`, { fields: DEFAULT_FIELDS.ads, effective_status: statusFilter(url), limit: limit(url, 100) }));
  }

  if (url.pathname === "/actions/creatives" && request.method === "GET") {
    return json(await graph(env, "GET", `/${adAccountId}/adcreatives`, { fields: DEFAULT_FIELDS.creatives, limit: limit(url, 100) }));
  }

  if (url.pathname === "/actions/ad-pixels" && request.method === "GET") {
    return json(await graph(env, "GET", `/${adAccountId}/adspixels`, { fields: url.searchParams.get("fields") || "id,name,last_fired_time,owner_ad_account", limit: limit(url, 100) }));
  }

  if (url.pathname === "/actions/insights" && request.method === "GET") {
    const startDate = requiredDate(url.searchParams.get("startDate"), "startDate");
    const endDate = requiredDate(url.searchParams.get("endDate"), "endDate");
    const level = enumParam(url, "level", ["account", "campaign", "adset", "ad"], "campaign");
    const fields =
      url.searchParams.get("fields") ||
      "account_id,account_name,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,impressions,reach,clicks,inline_link_clicks,spend,cpc,cpm,ctr,frequency,actions,action_values,purchase_roas";

    return json(
      await graph(env, "GET", `/${adAccountId}/insights`, {
        fields,
        level,
        time_range: JSON.stringify({ since: startDate, until: endDate }),
        breakdowns: url.searchParams.get("breakdowns") || undefined,
        action_breakdowns: url.searchParams.get("actionBreakdowns") || undefined,
        limit: limit(url, 500)
      })
    );
  }

  if (url.pathname === "/actions/businesses" && request.method === "GET") {
    return json(await graph(env, "GET", "/me/businesses", { fields: url.searchParams.get("fields") || DEFAULT_FIELDS.businesses, limit: limit(url, 50) }));
  }

  if (url.pathname === "/actions/business-profile" && request.method === "GET") {
    const businessId = requiredBusinessId(url, env);
    return json(await graph(env, "GET", `/${businessId}`, { fields: url.searchParams.get("fields") || DEFAULT_FIELDS.businesses }));
  }

  if (url.pathname === "/actions/business-assets" && request.method === "GET") {
    const businessId = url.searchParams.get("businessId") || env.META_BUSINESS_ID;
    if (!businessId) return json(await aggregateBusinessAssets(env, url));
    const edges = ["owned_pages", "client_pages", "owned_ad_accounts", "client_ad_accounts", "owned_instagram_accounts", "client_instagram_accounts"];
    const result: JsonObject = { businessId };
    await Promise.all(
      edges.map(async (edge) => {
        result[edge] = await graph(env, "GET", `/${businessId}/${edge}`, { fields: "id,name", limit: limit(url, 100) });
      })
    );
    return json(result);
  }

  if (url.pathname === "/actions/whatsapp-business-accounts" && request.method === "GET") {
    const businessId = url.searchParams.get("businessId") || env.META_BUSINESS_ID;
    const fields = url.searchParams.get("fields") || DEFAULT_FIELDS.whatsappAccounts;
    if (!businessId) return json(await aggregateBusinessEdge(env, "owned_whatsapp_business_accounts", fields, limit(url, 100)));
    return json(await graph(env, "GET", `/${businessId}/owned_whatsapp_business_accounts`, { fields, limit: limit(url, 100) }));
  }

  if (url.pathname === "/actions/whatsapp-phone-numbers" && request.method === "GET") {
    const wabaId = url.searchParams.get("whatsappBusinessAccountId") || env.META_WHATSAPP_BUSINESS_ACCOUNT_ID;
    if (!wabaId) return json(await aggregateWhatsAppPhoneNumbers(env, url));
    return json(await graph(env, "GET", `/${wabaId}/phone_numbers`, { fields: url.searchParams.get("fields") || DEFAULT_FIELDS.whatsappNumbers, limit: limit(url, 100) }));
  }

  if (url.pathname === "/actions/whatsapp-phone-number" && request.method === "GET") {
    const phoneNumberId = requiredId(url, undefined, "phoneNumberId");
    return json(await graph(env, "GET", `/${phoneNumberId}`, { fields: url.searchParams.get("fields") || DEFAULT_FIELDS.whatsappNumbers }));
  }

  if (url.pathname === "/actions/whatsapp-message-templates" && request.method === "GET") {
    const wabaId = requiredId(url, env.META_WHATSAPP_BUSINESS_ACCOUNT_ID, "whatsappBusinessAccountId");
    return json(await graph(env, "GET", `/${wabaId}/message_templates`, { fields: url.searchParams.get("fields") || "id,name,status,category,language,components", limit: limit(url, 100) }));
  }

  if (url.pathname === "/actions/catalogs" && request.method === "GET") {
    const businessId = url.searchParams.get("businessId") || env.META_BUSINESS_ID;
    if (!businessId) return json(await aggregateBusinessEdge(env, "owned_product_catalogs", url.searchParams.get("fields") || DEFAULT_FIELDS.catalogs, limit(url, 100)));
    return json(await graph(env, "GET", `/${businessId}/owned_product_catalogs`, { fields: url.searchParams.get("fields") || DEFAULT_FIELDS.catalogs, limit: limit(url, 100) }));
  }

  if (url.pathname === "/actions/catalog-products" && request.method === "GET") {
    const catalogId = url.searchParams.get("catalogId") || env.META_CATALOG_ID;
    if (!catalogId) return json(await aggregateCatalogProducts(env, url));
    return json(await graph(env, "GET", `/${catalogId}/products`, { fields: url.searchParams.get("fields") || DEFAULT_FIELDS.products, limit: limit(url, 100) }));
  }

  if (url.pathname === "/actions/pages" && request.method === "GET") {
    return json(await graph(env, "GET", "/me/accounts", { fields: url.searchParams.get("fields") || DEFAULT_FIELDS.pages, limit: limit(url, 100) }, env.META_PAGE_ACCESS_TOKEN || env.META_ACCESS_TOKEN));
  }

  if (url.pathname === "/actions/page-profile" && request.method === "GET") {
    const pageId = requiredId(url, env.META_PAGE_ID, "pageId");
    return json(await graph(env, "GET", `/${pageId}`, { fields: url.searchParams.get("fields") || "id,name,category,about,website,phone,emails,location,hours,instagram_business_account" }, env.META_PAGE_ACCESS_TOKEN || env.META_ACCESS_TOKEN));
  }

  if (url.pathname === "/actions/page-feed" && request.method === "GET") {
    const pageId = requiredId(url, env.META_PAGE_ID, "pageId");
    return json(await graph(env, "GET", `/${pageId}/feed`, { fields: url.searchParams.get("fields") || "id,message,created_time,permalink_url,story,attachments", limit: limit(url, 100) }, env.META_PAGE_ACCESS_TOKEN || env.META_ACCESS_TOKEN));
  }

  if (url.pathname === "/actions/instagram-profile" && request.method === "GET") {
    const igId = requiredId(url, env.META_INSTAGRAM_BUSINESS_ACCOUNT_ID, "instagramBusinessAccountId");
    return json(await graph(env, "GET", `/${igId}`, { fields: url.searchParams.get("fields") || "id,username,name,biography,website,followers_count,follows_count,media_count,profile_picture_url" }));
  }

  if (url.pathname === "/actions/instagram-media" && request.method === "GET") {
    const igId = requiredId(url, env.META_INSTAGRAM_BUSINESS_ACCOUNT_ID, "instagramBusinessAccountId");
    return json(await graph(env, "GET", `/${igId}/media`, { fields: url.searchParams.get("fields") || "id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count", limit: limit(url, 100) }));
  }

  if (url.pathname === "/actions/comments" && request.method === "GET") {
    const objectId = requiredId(url, undefined, "objectId");
    return json(await graph(env, "GET", `/${objectId}/comments`, { fields: url.searchParams.get("fields") || "id,message,from,created_time,comment_count,like_count,is_hidden", limit: limit(url, 100) }, env.META_PAGE_ACCESS_TOKEN || env.META_ACCESS_TOKEN));
  }

  if (url.pathname === "/actions/targeting-search" && request.method === "GET") {
    return json(
      await graph(env, "GET", `/${adAccountId}/targetingsearch`, {
        q: url.searchParams.get("q") || undefined,
        type: url.searchParams.get("type") || "adgeolocation",
        class: url.searchParams.get("class") || undefined,
        limit: limit(url, 100)
      })
    );
  }

  if (url.pathname === "/actions/resolve-geo-location" && request.method === "GET") {
    return json(
      await graph(env, "GET", `/${adAccountId}/targetingsearch`, {
        q: requiredQuery(url, "query"),
        type: "adgeolocation",
        location_types: JSON.stringify(["city", "region", "geo_market", "country"]),
        country_code: url.searchParams.get("countryCode") || undefined,
        limit: limit(url, 25)
      })
    );
  }

  if ((url.pathname === "/actions/meta-graph-request" || url.pathname === "/actions/meta-graph-request-v2") && request.method === "POST") {
    const body = await readJson(request);
    return json(await metaGraphRequest(env, body));
  }

  if (url.pathname === "/actions/batch-graph-request" && request.method === "POST") {
    const body = await readJson(request);
    return json(await batchGraphRequest(env, body));
  }

  if ((url.pathname === "/actions/create-full-meta-campaign" || url.pathname === "/actions/create-full-meta-campaign-v2") && request.method === "POST") {
    return json(await createFullMetaCampaign(env, await readJson(request)));
  }

  if (url.pathname === "/actions/create-ad-in-adset" && request.method === "POST") {
    return json(await createAdInExistingAdSet(env, await readJson(request)));
  }

  if (url.pathname === "/actions/upload-ad-image" && request.method === "POST") {
    const body = await readJson(request);
    return json(await graph(env, "POST", `/${normalizeAdAccountId(String(body.adAccountId || env.META_AD_ACCOUNT_ID))}/adimages`, {}, undefined, { url: requiredBodyString(body, "imageUrl") }));
  }

  if (url.pathname === "/actions/upload-ad-video" && request.method === "POST") {
    const body = await readJson(request);
    return json(await graph(env, "POST", `/${normalizeAdAccountId(String(body.adAccountId || env.META_AD_ACCOUNT_ID))}/advideos`, {}, undefined, { file_url: requiredBodyString(body, "videoUrl"), title: body.title, description: body.description }));
  }

  if (url.pathname === "/actions/create-traffic-ad-bundle" && request.method === "POST") {
    return json(await createTrafficAdBundle(env, await readJson(request)));
  }

  if (url.pathname === "/actions/create-page-post" && request.method === "POST") {
    const body = await readJson(request);
    const pageId = String(body.pageId || env.META_PAGE_ID || "");
    if (!pageId) throw new Error("pageId e obrigatorio.");
    return json(await graph(env, "POST", `/${pageId}/feed`, {}, env.META_PAGE_ACCESS_TOKEN || env.META_ACCESS_TOKEN, body));
  }

  if (url.pathname === "/actions/create-page-photo" && request.method === "POST") {
    const body = await readJson(request);
    const pageId = String(body.pageId || env.META_PAGE_ID || "");
    if (!pageId) throw new Error("pageId e obrigatorio.");
    return json(await graph(env, "POST", `/${pageId}/photos`, {}, env.META_PAGE_ACCESS_TOKEN || env.META_ACCESS_TOKEN, body));
  }

  if (url.pathname === "/actions/create-page-video" && request.method === "POST") {
    const body = await readJson(request);
    const pageId = String(body.pageId || env.META_PAGE_ID || "");
    if (!pageId) throw new Error("pageId e obrigatorio.");
    return json(await graph(env, "POST", `/${pageId}/videos`, {}, env.META_PAGE_ACCESS_TOKEN || env.META_ACCESS_TOKEN, body));
  }

  if (url.pathname === "/actions/update-page-post" && request.method === "POST") {
    const body = await readJson(request);
    return json(await graph(env, "POST", `/${requiredBodyString(body, "postId")}`, {}, env.META_PAGE_ACCESS_TOKEN || env.META_ACCESS_TOKEN, body));
  }

  if (url.pathname === "/actions/update-page-profile" && request.method === "POST") {
    const body = await readJson(request);
    const pageId = String(body.pageId || env.META_PAGE_ID || "");
    if (!pageId) throw new Error("pageId e obrigatorio.");
    return json(await graph(env, "POST", `/${pageId}`, {}, env.META_PAGE_ACCESS_TOKEN || env.META_ACCESS_TOKEN, body));
  }

  if (url.pathname === "/actions/delete-meta-content" && request.method === "POST") {
    const body = await readJson(request);
    return json(await graph(env, "DELETE", `/${requiredBodyString(body, "objectId")}`, {}, env.META_PAGE_ACCESS_TOKEN || env.META_ACCESS_TOKEN));
  }

  if (url.pathname === "/actions/create-instagram-media-container" && request.method === "POST") {
    const body = await readJson(request);
    const igId = String(body.instagramBusinessAccountId || env.META_INSTAGRAM_BUSINESS_ACCOUNT_ID || "");
    if (!igId) throw new Error("instagramBusinessAccountId e obrigatorio.");
    return json(await graph(env, "POST", `/${igId}/media`, {}, undefined, body));
  }

  if ((url.pathname === "/actions/publish-instagram-media-container" || url.pathname === "/actions/publish-instagram-content") && request.method === "POST") {
    const body = await readJson(request);
    const igId = String(body.instagramBusinessAccountId || env.META_INSTAGRAM_BUSINESS_ACCOUNT_ID || "");
    if (!igId) throw new Error("instagramBusinessAccountId e obrigatorio.");
    return json(await graph(env, "POST", `/${igId}/media_publish`, {}, undefined, body));
  }

  if (url.pathname === "/actions/reply-comment" && request.method === "POST") {
    const body = await readJson(request);
    return json(await graph(env, "POST", `/${requiredBodyString(body, "commentId")}/comments`, {}, env.META_PAGE_ACCESS_TOKEN || env.META_ACCESS_TOKEN, body));
  }

  if (url.pathname === "/actions/moderate-comment" && request.method === "POST") {
    const body = await readJson(request);
    return json(await graph(env, "POST", `/${requiredBodyString(body, "commentId")}`, {}, env.META_PAGE_ACCESS_TOKEN || env.META_ACCESS_TOKEN, body));
  }

  if (url.pathname === "/actions/send-meta-message" && request.method === "POST") {
    const body = await readJson(request);
    return json(await graph(env, "POST", "/me/messages", {}, env.META_PAGE_ACCESS_TOKEN || env.META_ACCESS_TOKEN, body));
  }

  if (url.pathname === "/actions/update-instagram-bio" && request.method === "POST") {
    return json({ error: "A Graph API nao oferece edicao direta de bio do Instagram por este endpoint. Use metaGraphRequestV2 se a Meta liberar um edge especifico para a conta." }, 400);
  }

  return json({ error: "Not found" }, 404);
}

async function metaGraphRequest(env: Env, input: JsonObject): Promise<unknown> {
  const method = enumValue(String(input.method || "GET"), ["GET", "POST", "DELETE"], "method") as "GET" | "POST" | "DELETE";
  const path = requiredBodyString(input, "path");
  const query = objectParam(input.query, input.queryJson);
  const body = objectParam(input.body, input.bodyJson);
  if (input.validateOnly === true && method !== "GET") {
    return { ok: true, validateOnly: true, method, path, query, body };
  }
  return graph(env, method, path, query, undefined, body, typeof input.apiVersion === "string" ? input.apiVersion : undefined);
}

async function batchGraphRequest(env: Env, input: JsonObject): Promise<unknown> {
  const requests = Array.isArray(input.requests) ? input.requests : [];
  if (requests.length < 1 || requests.length > 50) throw new Error("requests deve conter de 1 a 50 itens.");
  if (input.validateOnly === true) return { ok: true, validateOnly: true, requests };
  const batch = requests.map((request) => {
    const item = request as JsonObject;
    const body = objectParam(item.body, undefined);
    return {
      method: String(item.method || "GET"),
      relative_url: requiredBodyString(item, "relative_url"),
      body: Object.keys(body).length > 0 ? new URLSearchParams(flatten(body)).toString() : undefined,
      name: item.name,
      depends_on: item.depends_on
    };
  });
  return graph(env, "POST", "/", {}, undefined, { batch });
}

async function createFullMetaCampaign(env: Env, input: JsonObject): Promise<unknown> {
  const campaign = objectParam(input.campaign, input.campaignJson);
  const adsets = arrayParam(input.adsets, input.adsetsJson);
  const adAccountId = normalizeAdAccountId(String(input.adAccountId || env.META_AD_ACCOUNT_ID));
  if (!campaign.name) throw new Error("campaign.name e obrigatorio.");
  if (adsets.length < 1) throw new Error("adsets deve conter pelo menos um conjunto.");
  if (input.validateOnly === true) return { ok: true, validateOnly: true, adAccountId, campaign, adsets };

  const campaignResult = (await graph(env, "POST", `/${adAccountId}/campaigns`, {}, undefined, campaign)) as JsonObject;
  const campaignId = String(campaignResult.id || "");
  const results: JsonObject = { campaign: campaignResult, adsets: [] };
  for (const adsetBundle of adsets) {
    const bundle = adsetBundle as JsonObject;
    const adset = { ...objectParam(bundle.adset, undefined), campaign_id: campaignId };
    const adsetResult = (await graph(env, "POST", `/${adAccountId}/adsets`, {}, undefined, adset)) as JsonObject;
    const adsetId = String(adsetResult.id || "");
    const ads = Array.isArray(bundle.ads) ? bundle.ads : [];
    const adResults = [];
    for (const adBundle of ads) {
      const item = adBundle as JsonObject;
      const creativePayload = objectParam(item.creative, undefined);
      const creativeResult = (await graph(env, "POST", `/${adAccountId}/adcreatives`, {}, undefined, creativePayload)) as JsonObject;
      const adPayload = { ...objectParam(item.ad, undefined), adset_id: adsetId, creative: { creative_id: creativeResult.id } };
      const adResult = await graph(env, "POST", `/${adAccountId}/ads`, {}, undefined, adPayload);
      adResults.push({ creative: creativeResult, ad: adResult });
    }
    (results.adsets as unknown[]).push({ adset: adsetResult, ads: adResults });
  }
  return results;
}

async function createAdInExistingAdSet(env: Env, input: JsonObject): Promise<unknown> {
  if (input.validateOnly === true) return { ok: true, validateOnly: true, input };
  const adAccountId = normalizeAdAccountId(requiredBodyString(input, "adAccountId"));
  const objectStorySpec: JsonObject = { page_id: requiredBodyString(input, "pageId") };
  if (input.videoId) {
    objectStorySpec.video_data = {
      video_id: input.videoId,
      title: input.headline,
      message: requiredBodyString(input, "message"),
      image_url: input.thumbnailUrl,
      call_to_action: { type: input.callToActionType || "LEARN_MORE", value: { link: requiredBodyString(input, "linkUrl") } }
    };
  } else {
    objectStorySpec.link_data = {
      link: requiredBodyString(input, "linkUrl"),
      message: requiredBodyString(input, "message"),
      name: input.headline,
      description: input.description,
      picture: input.imageUrl,
      image_hash: input.imageHash,
      call_to_action: { type: input.callToActionType || "LEARN_MORE", value: { link: requiredBodyString(input, "linkUrl") } }
    };
  }
  const creative = (await graph(env, "POST", `/${adAccountId}/adcreatives`, {}, undefined, { name: input.creativeName || input.adName, object_story_spec: objectStorySpec })) as JsonObject;
  const ad = await graph(env, "POST", `/${adAccountId}/ads`, {}, undefined, { name: input.adName, adset_id: input.adSetId, creative: { creative_id: creative.id }, status: input.adStatus || "PAUSED" });
  return { creative, ad };
}

async function createTrafficAdBundle(env: Env, input: JsonObject): Promise<unknown> {
  const adAccountId = normalizeAdAccountId(String(input.adAccountId || env.META_AD_ACCOUNT_ID));
  const campaign = objectParam(input.campaign, undefined);
  const adset = objectParam(input.adset, undefined);
  const creative = objectParam(input.creative, undefined);
  const ad = objectParam(input.ad, undefined);
  if (input.validateOnly === true) return { ok: true, validateOnly: true, adAccountId, campaign, adset, creative, ad };
  return createFullMetaCampaign(env, {
    adAccountId,
    campaign: Object.keys(campaign).length ? campaign : { name: input.campaignName, objective: "OUTCOME_TRAFFIC", status: "PAUSED", special_ad_categories: [] },
    adsets: [
      {
        adset: Object.keys(adset).length ? adset : { name: input.adSetName, daily_budget: input.dailyBudget, billing_event: "IMPRESSIONS", optimization_goal: "LINK_CLICKS", status: "PAUSED" },
        ads: [{ creative, ad: Object.keys(ad).length ? ad : { name: input.adName, status: input.adStatus || "PAUSED" } }]
      }
    ],
    validateOnly: false
  });
}

async function getBusinesses(env: Env): Promise<Array<{ id: string; name?: string }>> {
  const response = (await graph(env, "GET", "/me/businesses", { fields: "id,name", limit: 100 })) as { data?: Array<{ id?: string; name?: string }> };
  return (response.data || []).filter((item): item is { id: string; name?: string } => Boolean(item.id));
}

async function aggregateBusinessEdge(env: Env, edge: string, fields: string, itemLimit: number): Promise<JsonObject> {
  const businesses = await getBusinesses(env);
  const data: unknown[] = [];
  for (const business of businesses) {
    const response = (await graph(env, "GET", `/${business.id}/${edge}`, { fields, limit: itemLimit })) as { data?: unknown[] };
    for (const item of response.data || []) data.push({ ...(item as JsonObject), business_id: business.id, business_name: business.name });
  }
  return { data, businesses: businesses.length };
}

async function aggregateBusinessAssets(env: Env, url: URL): Promise<JsonObject> {
  const businesses = await getBusinesses(env);
  const edges = ["owned_pages", "client_pages", "owned_ad_accounts", "client_ad_accounts", "owned_instagram_accounts", "client_instagram_accounts"];
  const data: unknown[] = [];
  for (const business of businesses) {
    const assets: JsonObject = { business_id: business.id, business_name: business.name };
    for (const edge of edges) {
      assets[edge] = await graph(env, "GET", `/${business.id}/${edge}`, { fields: "id,name", limit: limit(url, 100) });
    }
    data.push(assets);
  }
  return { data };
}

async function aggregateWhatsAppPhoneNumbers(env: Env, url: URL): Promise<JsonObject> {
  const wabas = (await aggregateBusinessEdge(env, "owned_whatsapp_business_accounts", "id,name", 100)).data as JsonObject[];
  const data: unknown[] = [];
  for (const waba of wabas || []) {
    const wabaId = String(waba.id || "");
    if (!wabaId) continue;
    const response = (await graph(env, "GET", `/${wabaId}/phone_numbers`, { fields: url.searchParams.get("fields") || DEFAULT_FIELDS.whatsappNumbers, limit: limit(url, 100) })) as { data?: unknown[] };
    for (const item of response.data || []) data.push({ ...(item as JsonObject), whatsapp_business_account_id: wabaId, whatsapp_business_account_name: waba.name, business_id: waba.business_id, business_name: waba.business_name });
  }
  return { data, whatsapp_business_accounts: wabas?.length || 0 };
}

async function aggregateCatalogProducts(env: Env, url: URL): Promise<JsonObject> {
  const catalogs = (await aggregateBusinessEdge(env, "owned_product_catalogs", "id,name", 100)).data as JsonObject[];
  const data: unknown[] = [];
  for (const catalog of catalogs || []) {
    const catalogId = String(catalog.id || "");
    if (!catalogId) continue;
    const response = (await graph(env, "GET", `/${catalogId}/products`, { fields: url.searchParams.get("fields") || DEFAULT_FIELDS.products, limit: limit(url, 100) })) as { data?: unknown[] };
    for (const item of response.data || []) data.push({ ...(item as JsonObject), catalog_id: catalogId, catalog_name: catalog.name, business_id: catalog.business_id, business_name: catalog.business_name });
  }
  return { data, catalogs: catalogs?.length || 0 };
}

async function graph(
  env: Env,
  method: "GET" | "POST" | "DELETE",
  path: string,
  query: JsonObject = {},
  accessToken?: string,
  body: JsonObject = {},
  apiVersion?: string
): Promise<unknown> {
  const version = apiVersion || env.META_GRAPH_API_VERSION || "v25.0";
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`https://graph.facebook.com/${version}${normalizedPath}`);
  url.searchParams.set("access_token", accessToken || env.META_ACCESS_TOKEN!);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const init: RequestInit = { method };
  if (method !== "GET") {
    init.body = new URLSearchParams(flatten(body));
    init.headers = { "content-type": "application/x-www-form-urlencoded" };
  }
  const response = await fetch(url.toString(), init);
  const payload = await response.json();
  if (!response.ok) throw new Error(`Meta Graph API ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

function health(env: Env): Response {
  const missing = REQUIRED_ENV.filter((key) => !env[key]);
  return json({
    ok: missing.length === 0,
    service: "meta-ads-actions",
    mode: "read-write-controlled",
    apiVersion: env.META_GRAPH_API_VERSION || "v25.0",
    endpoint: "https://meta-ads-actions.cuiabar.com/openapi.json",
    capabilities: ["ads", "business", "pages", "instagram", "whatsapp_business", "catalogs", "generic_graph"],
    configured: {
      businessId: Boolean(env.META_BUSINESS_ID),
      whatsappBusinessAccountId: Boolean(env.META_WHATSAPP_BUSINESS_ACCOUNT_ID),
      catalogId: Boolean(env.META_CATALOG_ID),
      pageId: Boolean(env.META_PAGE_ID),
      instagramBusinessAccountId: Boolean(env.META_INSTAGRAM_BUSINESS_ACCOUNT_ID)
    },
    missingSecrets: missing
  });
}

function requireBearer(request: Request, env: Env): Response | null {
  if (!env.META_ACTIONS_BEARER_TOKEN) return json({ ok: false, auth: "server_secret_missing", error: "META_ACTIONS_BEARER_TOKEN ausente." }, 503);
  const expected = env.META_ACTIONS_BEARER_TOKEN;
  const authorization = request.headers.get("authorization") || "";
  const candidates = [
    authorization,
    authorization.replace(/^Bearer\s+/i, ""),
    request.headers.get("x-api-key") || "",
    request.headers.get("api-key") || ""
  ].map((value) => value.trim());
  if (!candidates.includes(expected)) {
    return json({
      ok: false,
      auth: "invalid_or_missing_action_bearer",
      error: "Bearer token invalido ou ausente na chamada do GPT.",
      received: {
        authorizationHeader: Boolean(authorization),
        xApiKeyHeader: Boolean(request.headers.get("x-api-key")),
        apiKeyHeader: Boolean(request.headers.get("api-key"))
      },
      expectedConfiguration: "Configure a Action do GPT com API Key/Bearer usando o valor de META_ACTIONS_BEARER_TOKEN, sem incluir segredos no prompt."
    }, 401);
  }
  return null;
}

function requiredBusinessId(url: URL, env: Env): string {
  return requiredId(url, env.META_BUSINESS_ID, "businessId");
}

function requiredId(url: URL, fallback: string | undefined, name: string): string {
  const value = url.searchParams.get(name) || fallback;
  if (!value) throw new Error(`${name} nao configurado. Informe por parametro ou configure a secret/var correspondente.`);
  return value;
}

function normalizeAdAccountId(value: string): string {
  const digits = value.replace(/\D/g, "");
  return `act_${digits}`;
}

function limit(url: URL, fallback: number): number {
  const parsed = Number.parseInt(url.searchParams.get("limit") || "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(500, parsed));
}

function statusFilter(url: URL): string | undefined {
  const raw = url.searchParams.get("effectiveStatus");
  if (!raw) return undefined;
  const values = raw.split(",").map((value) => value.trim().toUpperCase()).filter(Boolean);
  return values.length > 0 ? JSON.stringify(values) : undefined;
}

function requiredDate(value: string | null, name: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Parametro ${name} deve estar no formato YYYY-MM-DD.`);
  return value;
}

function enumParam(url: URL, name: string, allowed: string[], fallback: string): string {
  const value = url.searchParams.get(name) || fallback;
  if (!allowed.includes(value)) throw new Error(`Parametro ${name} deve ser um de: ${allowed.join(", ")}.`);
  return value;
}

function enumValue(value: string, allowed: string[], name: string): string {
  if (!allowed.includes(value)) throw new Error(`${name} deve ser um de: ${allowed.join(", ")}.`);
  return value;
}

function requiredQuery(url: URL, name: string): string {
  const value = url.searchParams.get(name);
  if (!value) throw new Error(`Parametro ${name} e obrigatorio.`);
  return value;
}

function requiredBodyString(body: JsonObject, name: string): string {
  const value = body[name];
  if (typeof value !== "string" || !value) throw new Error(`${name} e obrigatorio.`);
  return value;
}

async function readJson(request: Request): Promise<JsonObject> {
  if (!request.headers.get("content-type")?.includes("application/json")) return {};
  return (await request.json()) as JsonObject;
}

function objectParam(value: unknown, jsonValue: unknown): JsonObject {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as JsonObject;
  if (typeof jsonValue === "string" && jsonValue.trim()) {
    const parsed = JSON.parse(jsonValue);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as JsonObject;
  }
  return {};
}

function arrayParam(value: unknown, jsonValue: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof jsonValue === "string" && jsonValue.trim()) {
    const parsed = JSON.parse(jsonValue);
    if (Array.isArray(parsed)) return parsed;
  }
  return [];
}

function flatten(input: JsonObject): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    out[key] = typeof value === "string" ? value : JSON.stringify(value);
  }
  return out;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

function schema(type: string, description?: string): JsonObject {
  return description ? { type, description } : { type };
}

function openApiSchema(origin: string): JsonObject {
  const security = [{ bearerAuth: [] }];
  const jsonBody = (properties: JsonObject, required: string[] = [], additionalProperties = false) => ({
    required: required.length > 0,
    content: { "application/json": { schema: { type: "object", additionalProperties, properties, required } } }
  });
  const getPath = (operationId: string, summary: string, parameters: JsonObject[] = [], operationSecurity: JsonObject[] = security) => ({ get: { operationId, summary, security: operationSecurity, parameters, responses: { "200": { description: "OK" } } } });
  const postPath = (operationId: string, summary: string, properties: JsonObject, required: string[] = [], additionalProperties = false) => ({
    post: { operationId, summary, security, requestBody: jsonBody(properties, required, additionalProperties), responses: { "200": { description: "OK" } } }
  });
  const idParam = (name: string, required = false) => ({ name, in: "query", required, schema: { type: "string" } });
  const listParams = [idParam("businessId"), { name: "fields", in: "query", required: false, schema: schema("string") }, { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 500, default: 100 } }];

  return {
    openapi: "3.1.0",
    info: {
      title: "Cuiabar Meta Ads API",
      version: "0.2.0",
      description: "Meta Graph/Marketing/Business Actions for authenticated Cuiabar editors with controlled write access."
    },
    servers: [{ url: origin }],
    security,
    components: {
      securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", description: "Use the private Meta Actions bearer token." } },
      schemas: { MetaGraphResponse: { type: "object", additionalProperties: true } }
    },
    paths: {
      "/actions/health": getPath("checkMetaAdsApiHealth", "Check Meta Actions health", [], []),
      "/actions/me": getPath("getMetaCurrentUser", "Get current Meta token user"),
      "/actions/permissions": getPath("listMetaCurrentUserPermissions", "List current Meta token permissions"),
      "/actions/ad-accounts": getPath("listMetaAdAccounts", "List accessible Meta ad accounts"),
      "/actions/campaigns": getPath("listMetaCampaigns", "List Meta campaigns", commonListParams()),
      "/actions/adsets": getPath("listMetaAdSets", "List Meta ad sets", commonListParams()),
      "/actions/ads": getPath("listMetaAds", "List Meta ads", commonListParams()),
      "/actions/creatives": getPath("listMetaAdCreatives", "List Meta ad creatives", commonListParams()),
      "/actions/ad-pixels": getPath("listMetaAdPixels", "List Meta ad pixels", commonListParams()),
      "/actions/insights": getPath("getMetaAdsInsights", "Get Meta Ads insights by date range", [
        { name: "startDate", in: "query", required: true, schema: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" } },
        { name: "endDate", in: "query", required: true, schema: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" } },
        { name: "level", in: "query", required: false, schema: { type: "string", enum: ["account", "campaign", "adset", "ad"], default: "campaign" } },
        { name: "fields", in: "query", required: false, schema: schema("string") },
        { name: "breakdowns", in: "query", required: false, schema: schema("string") },
        { name: "actionBreakdowns", in: "query", required: false, schema: schema("string") }
      ]),
      "/actions/businesses": getPath("listMetaBusinesses", "List accessible Meta Business accounts", listParams),
      "/actions/business-profile": getPath("getMetaBusinessProfile", "Get Meta Business account profile and settings", listParams),
      "/actions/business-assets": getPath("listMetaBusinessAssets", "List Business assets: pages, ad accounts and Instagram accounts", listParams),
      "/actions/whatsapp-business-accounts": getPath("listMetaWhatsAppBusinessAccounts", "List WhatsApp Business Accounts owned by a Business", listParams),
      "/actions/whatsapp-phone-numbers": getPath("listMetaWhatsAppPhoneNumbers", "List phone numbers in a WhatsApp Business Account", [idParam("whatsappBusinessAccountId"), idParam("fields"), { name: "limit", in: "query", required: false, schema: { type: "integer" } }]),
      "/actions/whatsapp-phone-number": getPath("getMetaWhatsAppPhoneNumber", "Get WhatsApp phone number name, display number, status and quality", [idParam("phoneNumberId", true), idParam("fields")]),
      "/actions/whatsapp-message-templates": getPath("listMetaWhatsAppMessageTemplates", "List WhatsApp message templates", [idParam("whatsappBusinessAccountId"), idParam("fields"), { name: "limit", in: "query", required: false, schema: { type: "integer" } }]),
      "/actions/catalogs": getPath("listMetaCatalogs", "List Business product catalogs", listParams),
      "/actions/catalog-products": getPath("listMetaCatalogProducts", "List catalog products", [idParam("catalogId"), idParam("fields"), { name: "limit", in: "query", required: false, schema: { type: "integer" } }]),
      "/actions/pages": getPath("listMetaPages", "List Pages available to the token", [idParam("fields"), { name: "limit", in: "query", required: false, schema: { type: "integer" } }]),
      "/actions/page-profile": getPath("getMetaPageProfile", "Get Meta Page profile"),
      "/actions/instagram-profile": getPath("getMetaInstagramProfile", "Get Instagram business profile"),
      "/actions/targeting-search": getPath("searchMetaTargeting", "Search Meta targeting descriptors"),
      "/actions/resolve-geo-location": getPath("resolveMetaGeoLocation", "Resolve Meta geo targeting location"),
      "/actions/meta-graph-request-v2": postPath("metaGraphRequestV2", "Generic Meta Graph request with JSON string fallbacks", graphRequestProperties(true), ["path"], true),
      "/actions/batch-graph-request": postPath("batchMetaGraphRequest", "Batch Meta Graph requests", { requests: { type: "array", maxItems: 50, items: { type: "object", additionalProperties: true } }, validateOnly: { type: "boolean", default: true }, confirmWrite: schema("string") }, ["requests"]),
      "/actions/create-full-meta-campaign-v2": postPath("createFullMetaCampaignV2", "Create full campaign with JSON string fallbacks", fullCampaignProperties(true), [], true),
      "/actions/create-ad-in-adset": postPath("createMetaAdInExistingAdSet", "Create a Meta ad in an existing ad set", { adAccountId: schema("string"), adSetId: schema("string"), pageId: schema("string"), linkUrl: schema("string"), adName: schema("string"), creativeName: schema("string"), message: schema("string"), headline: schema("string"), description: schema("string"), imageUrl: schema("string"), imageHash: schema("string"), videoId: schema("string"), thumbnailUrl: schema("string"), callToActionType: schema("string"), adStatus: { type: "string", enum: ["PAUSED", "ACTIVE"], default: "PAUSED" }, validateOnly: { type: "boolean", default: true } }, ["adAccountId", "adSetId", "pageId", "linkUrl", "adName", "message"]),
      "/actions/upload-ad-image": postPath("uploadMetaAdImageByUrl", "Upload Meta ad image by URL", { adAccountId: schema("string"), imageUrl: schema("string") }, ["imageUrl"]),
      "/actions/upload-ad-video": postPath("uploadMetaAdVideoByUrl", "Upload Meta ad video by URL", { adAccountId: schema("string"), videoUrl: schema("string"), title: schema("string"), description: schema("string") }, ["videoUrl"])
    }
  };
}

function graphRequestProperties(withFallbacks = false): JsonObject {
  return {
    method: { type: "string", enum: ["GET", "POST", "DELETE"], default: "GET" },
    path: schema("string", "Graph path such as /me/businesses, /<BUSINESS_ID>/owned_whatsapp_business_accounts or /<CATALOG_ID>/products."),
    apiVersion: schema("string"),
    query: { type: "object", additionalProperties: true },
    body: { type: "object", additionalProperties: true },
    ...(withFallbacks ? { queryJson: schema("string"), bodyJson: schema("string") } : {}),
    idempotencyKey: schema("string"),
    validateOnly: { type: "boolean", default: true },
    confirmWrite: schema("string")
  };
}

function fullCampaignProperties(withFallbacks = false): JsonObject {
  return {
    adAccountId: schema("string"),
    campaign: { type: "object", additionalProperties: true },
    adsets: { type: "array", items: { type: "object", additionalProperties: true } },
    ...(withFallbacks ? { campaignJson: schema("string"), adsetsJson: schema("string") } : {}),
    validateOnly: { type: "boolean", default: true },
    confirmWrite: schema("string")
  };
}

function commonListParams(): JsonObject[] {
  return [
    { name: "adAccountId", in: "query", required: false, schema: { type: "string" } },
    { name: "effectiveStatus", in: "query", required: false, schema: { type: "string", description: "Comma-separated statuses such as ACTIVE,PAUSED." } },
    { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 500, default: 100 } }
  ];
}
