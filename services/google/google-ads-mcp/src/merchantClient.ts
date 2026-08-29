type MerchantConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken?: string;
  accountId?: string;
};

export class MerchantClient {
  constructor(private readonly config: MerchantConfig) {}

  get configured(): boolean {
    return Boolean(this.config.refreshToken);
  }

  async listProducts(accountId?: string, pageSize = 100, pageToken?: string): Promise<unknown> {
    return this.request("GET", `/products/v1/accounts/${this.account(accountId)}/products`, undefined, { pageSize, pageToken });
  }

  async listDataSources(accountId?: string, pageSize = 100, pageToken?: string): Promise<unknown> {
    return this.request("GET", `/datasources/v1/accounts/${this.account(accountId)}/dataSources`, undefined, { pageSize, pageToken });
  }

  async insertProduct(dataSource: string, productInput: Record<string, unknown>, accountId?: string): Promise<unknown> {
    assertResource(dataSource, /^accounts\/\d+\/dataSources\/\d+$/, "dataSource");
    return this.request("POST", `/products/v1/accounts/${this.account(accountId)}/productInputs:insert`, productInput, { dataSource });
  }

  async patchProduct(name: string, productInput: Record<string, unknown>, updateMask: string, dataSource: string): Promise<unknown> {
    assertResource(name, /^accounts\/\d+\/productInputs\/.+$/, "productInput name");
    assertResource(dataSource, /^accounts\/\d+\/dataSources\/\d+$/, "dataSource");
    return this.request("PATCH", `/products/v1/${name}`, { ...productInput, name }, { updateMask, dataSource });
  }

  async deleteProduct(name: string, dataSource: string): Promise<unknown> {
    assertResource(name, /^accounts\/\d+\/productInputs\/.+$/, "productInput name");
    assertResource(dataSource, /^accounts\/\d+\/dataSources\/\d+$/, "dataSource");
    return this.request("DELETE", `/products/v1/${name}`, undefined, { dataSource });
  }

  async createDataSource(dataSource: Record<string, unknown>, accountId?: string): Promise<unknown> {
    return this.request("POST", `/datasources/v1/accounts/${this.account(accountId)}/dataSources`, dataSource);
  }

  async patchDataSource(name: string, dataSource: Record<string, unknown>, updateMask: string): Promise<unknown> {
    assertResource(name, /^accounts\/\d+\/dataSources\/\d+$/, "dataSource name");
    return this.request("PATCH", `/datasources/v1/${name}`, { ...dataSource, name }, { updateMask });
  }

  async deleteDataSource(name: string): Promise<unknown> {
    assertResource(name, /^accounts\/\d+\/dataSources\/\d+$/, "dataSource name");
    return this.request("DELETE", `/datasources/v1/${name}`);
  }

  async searchReports(query: string, accountId?: string, pageSize = 100, pageToken?: string): Promise<unknown> {
    if (!/^\s*SELECT\s/i.test(query) || query.length > 12_000) throw new Error("Relatorio Merchant deve ser uma consulta SELECT valida.");
    return this.request("POST", `/reports/v1/accounts/${this.account(accountId)}/reports:search`, { query, pageSize, pageToken });
  }

  private account(value?: string): string {
    const accountId = (value ?? this.config.accountId ?? "").replace(/\D/g, "");
    if (!accountId) throw new Error("Informe merchantAccountId ou configure GOOGLE_MERCHANT_ACCOUNT_ID.");
    return accountId;
  }

  private async request(method: string, path: string, body?: unknown, query: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.config.refreshToken) throw new Error("Merchant nao autorizado: configure GOOGLE_MERCHANT_REFRESH_TOKEN com escopo content.");
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: this.config.clientId, client_secret: this.config.clientSecret, refresh_token: this.config.refreshToken, grant_type: "refresh_token" })
    });
    const token = await tokenResponse.json() as { access_token?: string; error_description?: string };
    if (!tokenResponse.ok || !token.access_token) throw new Error(`Falha OAuth Merchant: ${token.error_description ?? tokenResponse.status}`);
    const url = new URL(`https://merchantapi.googleapis.com${path}`);
    for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
    const response = await fetch(url, {
      method,
      headers: { authorization: `Bearer ${token.access_token}`, ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) throw new Error(`Merchant API ${response.status}: ${JSON.stringify(payload)}`);
    return payload;
  }
}

function assertResource(value: string, pattern: RegExp, label: string): void {
  if (!pattern.test(value)) throw new Error(`${label} invalido.`);
}
