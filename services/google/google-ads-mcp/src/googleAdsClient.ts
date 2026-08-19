type GoogleAdsConfig = {
  apiVersion: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  developerToken: string;
  customerId: string;
  loginCustomerId?: string;
};

type OAuthTokenResponse = {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
};

export type SearchStreamResult = Record<string, unknown>;

export class GoogleAdsClient {
  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;

  constructor(private readonly config: GoogleAdsConfig) {}

  async listAccessibleCustomers(): Promise<unknown> {
    const accessToken = await this.getAccessToken();
    const response = await fetch(
      `https://googleads.googleapis.com/${this.config.apiVersion}/customers:listAccessibleCustomers`,
      {
        method: "GET",
        headers: this.headers(accessToken)
      }
    );

    return this.parseResponse(response);
  }

  async searchStream(query: string, customerId = this.config.customerId): Promise<SearchStreamResult[]> {
    assertReadOnlyGaql(query);

    const accessToken = await this.getAccessToken();
    const cleanCustomerId = normalizeCustomerId(customerId);
    const response = await fetch(
      `https://googleads.googleapis.com/${this.config.apiVersion}/customers/${cleanCustomerId}/googleAds:searchStream`,
      {
        method: "POST",
        headers: {
          ...this.headers(accessToken),
          "content-type": "application/json"
        },
        body: JSON.stringify({ query })
      }
    );

    const payload = await this.parseResponse(response);
    if (!Array.isArray(payload)) {
      return [];
    }

    return payload.flatMap((chunk) => {
      if (chunk && typeof chunk === "object" && "results" in chunk) {
        const results = (chunk as { results?: SearchStreamResult[] }).results;
        return Array.isArray(results) ? results : [];
      }
      return [];
    });
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.accessToken && now < this.accessTokenExpiresAt - 60_000) {
      return this.accessToken;
    }

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: this.config.refreshToken,
        grant_type: "refresh_token"
      })
    });

    const payload = (await response.json()) as OAuthTokenResponse;
    if (!response.ok || !payload.access_token) {
      throw new Error(
        `Falha ao renovar OAuth Google Ads: ${payload.error ?? response.status} ${payload.error_description ?? ""}`.trim()
      );
    }

    this.accessToken = payload.access_token;
    this.accessTokenExpiresAt = now + (payload.expires_in ?? 3600) * 1000;
    return payload.access_token;
  }

  private headers(accessToken: string): Record<string, string> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${accessToken}`,
      "developer-token": this.config.developerToken
    };

    if (this.config.loginCustomerId) {
      headers["login-customer-id"] = normalizeCustomerId(this.config.loginCustomerId);
    }

    return headers;
  }

  private async parseResponse(response: Response): Promise<unknown> {
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;

    if (!response.ok) {
      throw new Error(`Google Ads API ${response.status}: ${JSON.stringify(payload)}`);
    }

    return payload;
  }
}

export function normalizeCustomerId(customerId: string): string {
  return customerId.replace(/\D/g, "");
}

export function assertReadOnlyGaql(query: string): void {
  const normalized = query.trim().replace(/\s+/g, " ").toUpperCase();

  if (!normalized.startsWith("SELECT ")) {
    throw new Error("Somente consultas GAQL iniciadas com SELECT sao permitidas.");
  }

  const forbidden = [
    " MUTATE ",
    " CREATE ",
    " UPDATE ",
    " DELETE ",
    " REMOVE ",
    " ENABLE ",
    " PAUSE ",
    " SET ",
    " INSERT ",
    " UPSERT ",
    " ALTER ",
    " DROP ",
    " TRUNCATE "
  ];

  for (const token of forbidden) {
    if (` ${normalized} `.includes(token)) {
      throw new Error(`Comando bloqueado em modo somente leitura: ${token.trim()}`);
    }
  }
}
