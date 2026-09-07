type JsonObject = Record<string, unknown>;

const GET_ROUTES: Record<string, string> = {
  "/actions/facebook-list-page-posts": "/actions/facebook-list-posts",
  "/actions/facebook-get-post": "/actions/facebook-get-post",
  "/actions/facebook-list-page-photos": "/actions/facebook-list-photos",
  "/actions/facebook-get-photo": "/actions/facebook-get-photo",
  "/actions/facebook-list-page-videos": "/actions/facebook-list-videos",
  "/actions/facebook-get-video": "/actions/facebook-get-video",
  "/actions/facebook-list-page-reels": "/actions/facebook-list-reels",
  "/actions/facebook-get-reel": "/actions/facebook-get-reel",
  "/actions/facebook-get-post-insights": "/actions/facebook-get-post-insights",
  "/actions/instagram-list-media": "/actions/instagram-list-media",
  "/actions/instagram-get-media": "/actions/instagram-get-media",
  "/actions/instagram-get-media-children": "/actions/instagram-get-media-children",
  "/actions/instagram-get-media-insights": "/actions/instagram-get-media-insights",
  "/actions/instagram-list-comments": "/actions/instagram-list-comments",
  "/actions/comments": "/actions/comments"
};

const POST_ROUTES: Record<string, string> = {
  "/actions/facebook-publish-post": "/actions/create-page-post",
  "/actions/facebook-edit-post": "/actions/update-page-post",
  "/actions/facebook-publish-photo": "/actions/create-page-photo",
  "/actions/facebook-publish-video": "/actions/create-page-video",
  "/actions/facebook-delete-post": "/actions/facebook-delete-post",
  "/actions/facebook-delete-photo": "/actions/facebook-delete-photo",
  "/actions/facebook-delete-video": "/actions/facebook-delete-video",
  "/actions/facebook-delete-reel": "/actions/facebook-delete-video",
  "/actions/reply-comment": "/actions/reply-comment",
  "/actions/moderate-comment": "/actions/moderate-comment",
  "/actions/instagram-create-media-container": "/actions/create-instagram-media-container",
  "/actions/instagram-publish-media": "/actions/publish-instagram-content"
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/health") {
      return json({ ok: true, service: "meta-pub", mode: "organic-content", core: "meta-ads-actions" });
    }
    if (url.pathname === "/openapi.json") return json(openApi(url.origin));

    const getTarget = GET_ROUTES[url.pathname];
    if (getTarget && request.method === "GET") return proxy(request, env, getTarget);
    const postTarget = POST_ROUTES[url.pathname];
    if (postTarget && request.method === "POST") return proxy(request, env, postTarget);

    if (url.pathname === "/actions/instagram-discovery-search-hashtag" && request.method === "GET") {
      const igUserId = required(url, "ig_user_id");
      const query = required(url, "query");
      return graphRead(request, env, `/${igUserId}/ig_hashtag_search`, { q: query });
    }
    if ((url.pathname === "/actions/instagram-discovery-recent-media" || url.pathname === "/actions/instagram-discovery-top-media") && request.method === "GET") {
      const hashtagId = required(url, "hashtag_id");
      const igUserId = required(url, "ig_user_id");
      const edge = url.pathname.endsWith("top-media") ? "top_media" : "recent_media";
      return graphRead(request, env, `/${hashtagId}/${edge}`, {
        user_id: igUserId,
        fields: url.searchParams.get("fields") || "id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count",
        limit: boundedLimit(url)
      });
    }
    return json({ error: "Not found" }, 404);
  }
};

async function proxy(request: Request, env: Env, targetPath: string): Promise<Response> {
  const source = new URL(request.url);
  const target = new URL(`https://meta-ads-actions.internal${targetPath}`);
  target.search = source.search;
  const headers = new Headers(request.headers);
  headers.delete("host");
  return env.META_CORE.fetch(new Request(target, { method: request.method, headers, body: request.method === "GET" ? undefined : request.body }));
}

async function graphRead(request: Request, env: Env, path: string, query: JsonObject): Promise<Response> {
  const headers = new Headers({ "content-type": "application/json" });
  const authorization = request.headers.get("authorization");
  const apiKey = request.headers.get("x-api-key") || request.headers.get("api-key");
  if (authorization) headers.set("authorization", authorization);
  if (apiKey) headers.set("x-api-key", apiKey);
  return env.META_CORE.fetch("https://meta-ads-actions.internal/actions/meta-graph-request-v2", {
    method: "POST",
    headers,
    body: JSON.stringify({ method: "GET", path, query })
  });
}

function required(url: URL, name: string): string {
  const value = url.searchParams.get(name);
  if (!value) throw new Error(`${name} e obrigatorio.`);
  return value;
}

function boundedLimit(url: URL): number {
  const value = Number.parseInt(url.searchParams.get("limit") || "50", 10);
  return Number.isFinite(value) ? Math.max(1, Math.min(100, value)) : 50;
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value, null, 2), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

function openApi(origin: string): JsonObject {
  const security = [{ bearerAuth: [] }];
  const str = { type: "string" };
  const query = (name: string, required = false) => ({ name, in: "query", required, schema: str });
  const limit = { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 500, default: 100 } };
  const list = (id: string) => [query(id), query("fields"), query("cursor"), query("since"), query("until"), limit];
  const get = (operationId: string, summary: string, parameters: JsonObject[]) => ({ get: { operationId, summary, security, parameters, responses: { "200": { description: "OK" } } } });
  const post = (operationId: string, summary: string, properties: JsonObject, required: string[] = [], additionalProperties = false) => ({ post: { operationId, summary, security, requestBody: { required: true, content: { "application/json": { schema: { type: "object", properties, required, additionalProperties } } } }, responses: { "200": { description: "OK" } } } });
  const deletion = (id: string) => ({ [id]: str, validateOnly: { type: "boolean", default: false } });
  return {
    openapi: "3.1.0",
    info: { title: "GHCO Meta Pub", version: "0.1.0", description: "Organic Facebook and Instagram publishing, moderation, performance and discovery tools." },
    servers: [{ url: origin }], security,
    components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } } },
    paths: {
      "/actions/facebook-list-page-posts": get("facebook_list_page_posts", "List Page organic posts", list("page_id")),
      "/actions/facebook-get-post": get("facebook_get_post", "Get a Page post", [query("post_id", true), query("fields")]),
      "/actions/facebook-delete-post": post("facebook_delete_post", "Delete a Page post", deletion("post_id"), ["post_id"]),
      "/actions/facebook-publish-post": post("facebook_publish_post", "Publish a Page post", { pageId: str, message: str, link: str, published: { type: "boolean" } }, [], true),
      "/actions/facebook-edit-post": post("facebook_edit_post", "Edit a Page post", { postId: str, message: str }, ["postId"], true),
      "/actions/facebook-list-page-photos": get("facebook_list_page_photos", "List Page photos", list("page_id")),
      "/actions/facebook-get-photo": get("facebook_get_photo", "Get a Page photo", [query("photo_id", true), query("fields")]),
      "/actions/facebook-publish-photo": post("facebook_publish_photo", "Publish a Page photo", { pageId: str, url: str, caption: str }, ["url"]),
      "/actions/facebook-delete-photo": post("facebook_delete_photo", "Delete a Page photo", deletion("photo_id"), ["photo_id"]),
      "/actions/facebook-list-page-videos": get("facebook_list_page_videos", "List Page videos", list("page_id")),
      "/actions/facebook-get-video": get("facebook_get_video", "Get a Page video", [query("video_id", true), query("fields")]),
      "/actions/facebook-publish-video": post("facebook_publish_video", "Publish a Page video", { pageId: str, file_url: str, title: str, description: str }, ["file_url"]),
      "/actions/facebook-delete-video": post("facebook_delete_video", "Delete a Page video", deletion("video_id"), ["video_id"]),
      "/actions/facebook-list-page-reels": get("facebook_list_page_reels", "List Page Reels", list("page_id")),
      "/actions/facebook-get-reel": get("facebook_get_reel", "Get a Page Reel", [query("reel_id", true), query("fields")]),
      "/actions/facebook-delete-reel": post("facebook_delete_reel", "Delete a Page Reel through its video object", deletion("video_id"), ["video_id"]),
      "/actions/facebook-get-post-insights": get("facebook_get_post_insights", "Read Page post performance", [query("post_id", true), query("metric"), query("period"), query("since"), query("until")]),
      "/actions/instagram-list-media": get("instagram_list_media", "List professional Instagram organic media", list("ig_user_id")),
      "/actions/instagram-get-media": get("instagram_get_media", "Get Instagram organic media", [query("media_id", true), query("fields")]),
      "/actions/instagram-get-media-children": get("instagram_get_media_children", "Get carousel children", [query("media_id", true), query("fields"), query("cursor"), limit]),
      "/actions/instagram-get-media-insights": get("instagram_get_media_insights", "Read Instagram media performance", [query("media_id", true), query("metric", true), query("period")]),
      "/actions/instagram-list-comments": get("instagram_list_comments", "List Instagram comments", [query("media_id", true), query("fields"), query("cursor"), limit]),
      "/actions/instagram-create-media-container": post("instagram_create_media_container", "Prepare Instagram media for publishing", { instagramBusinessAccountId: str }, [], true),
      "/actions/instagram-publish-media": post("instagram_publish_media", "Publish a prepared Instagram media container", { instagramBusinessAccountId: str, creation_id: str }, ["creation_id"]),
      "/actions/comments": get("social_list_comments", "List comments on a supported social object", [query("objectId", true), query("fields"), limit]),
      "/actions/reply-comment": post("social_reply_comment", "Reply to a supported comment", { commentId: str, message: str }, ["commentId", "message"]),
      "/actions/moderate-comment": post("social_moderate_comment", "Hide or unhide a supported comment", { commentId: str, is_hidden: { type: "boolean" } }, ["commentId"]),
      "/actions/instagram-discovery-search-hashtag": get("instagram_discovery_search_hashtag", "Find an Instagram hashtag ID", [query("ig_user_id", true), query("query", true)]),
      "/actions/instagram-discovery-recent-media": get("instagram_discovery_recent_media", "Research recent organic media for a hashtag", [query("hashtag_id", true), query("ig_user_id", true), query("fields"), limit]),
      "/actions/instagram-discovery-top-media": get("instagram_discovery_top_media", "Research top organic media for a hashtag", [query("hashtag_id", true), query("ig_user_id", true), query("fields"), limit])
    }
  };
}
