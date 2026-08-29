type BusinessProfileConfig = { clientId: string; clientSecret: string; refreshToken?: string };

const BASE_URLS = {
  accounts: "https://mybusinessaccountmanagement.googleapis.com/v1",
  information: "https://mybusinessbusinessinformation.googleapis.com/v1",
  business: "https://mybusiness.googleapis.com/v4",
  performance: "https://businessprofileperformance.googleapis.com/v1"
} as const;

export type BusinessProfileService = keyof typeof BASE_URLS;

export class BusinessProfileClient {
  constructor(private readonly config: BusinessProfileConfig) {}

  async request(service: BusinessProfileService, method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", path: string, query: Record<string, unknown> = {}, body?: unknown): Promise<unknown> {
    if (!this.config.refreshToken) throw new Error("Business Profile nao autorizado: configure GOOGLE_BUSINESS_REFRESH_TOKEN.");
    const cleanPath = assertAllowedPath(path);
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: this.config.clientId, client_secret: this.config.clientSecret, refresh_token: this.config.refreshToken, grant_type: "refresh_token" })
    });
    const token = await tokenResponse.json() as { access_token?: string; error_description?: string };
    if (!tokenResponse.ok || !token.access_token) throw new Error(`Falha OAuth Business Profile: ${token.error_description ?? tokenResponse.status}`);
    const url = new URL(`${BASE_URLS[service]}/${cleanPath}`);
    for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    const response = await fetch(url, {
      method,
      headers: { authorization: `Bearer ${token.access_token}`, "x-goog-api-format-version": "2", ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) throw new Error(`Business Profile API ${response.status}: ${JSON.stringify(payload)}`);
    return payload;
  }
}

function assertAllowedPath(path: string): string {
  const clean = path.replace(/^\/+/, "");
  const allowed = [
    /^accounts(?:\/[^/?]+)?$/,
    /^accounts\/[^/?]+\/locations(?:\/[^/?]+)?(?::[A-Za-z]+)?$/,
    /^accounts\/[^/?]+\/locations\/[^/?]+\/(?:reviews|localPosts|media|questions)(?:\/[^/?]+)?(?:\/reply|\/answers(?::[A-Za-z]+)?)?$/,
    /^locations\/[^/?]+(?::[A-Za-z]+)?$/,
    /^locations\/[^/?]+\/(?:searchkeywords\/impressions\/monthly|dailyMetricsTimeSeries)$/
  ];
  if (!allowed.some((pattern) => pattern.test(clean)) || /(?:admins|invitations)/i.test(clean)) {
    throw new Error("Caminho Business Profile fora da lista permitida.");
  }
  return clean;
}
