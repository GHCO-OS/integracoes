import { assertAssetName, assertIdentifier, assertReadonlySql } from "./guards.js";

export type GoogleDataConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  projectId: string;
  location: string;
  defaultDataset: string;
};

type JsonObject = Record<string, unknown>;

export class GoogleDataClient {
  constructor(private readonly config: GoogleDataConfig) {}

  async probe(): Promise<{ bigquery: boolean; lookerStudio: boolean }> {
    await this.bigQuery("GET", `/projects/${encodeURIComponent(this.config.projectId)}/datasets?maxResults=1`);
    await this.looker("GET", "/assets:search?assetTypes=REPORT&pageSize=1");
    return { bigquery: true, lookerStudio: true };
  }

  async listDatasets(maxResults = 100, pageToken?: string): Promise<unknown> {
    const query = new URLSearchParams({ maxResults: String(maxResults) });
    if (pageToken) query.set("pageToken", pageToken);
    return this.bigQuery("GET", `/projects/${encodeURIComponent(this.config.projectId)}/datasets?${query}`);
  }

  async listTables(datasetId = this.config.defaultDataset, maxResults = 100, pageToken?: string): Promise<unknown> {
    assertIdentifier(datasetId, "datasetId");
    const query = new URLSearchParams({ maxResults: String(maxResults) });
    if (pageToken) query.set("pageToken", pageToken);
    return this.bigQuery("GET", `/projects/${encodeURIComponent(this.config.projectId)}/datasets/${datasetId}/tables?${query}`);
  }

  async describeTable(datasetId: string, tableId: string): Promise<unknown> {
    assertIdentifier(datasetId, "datasetId");
    assertIdentifier(tableId, "tableId");
    return this.bigQuery("GET", `/projects/${encodeURIComponent(this.config.projectId)}/datasets/${datasetId}/tables/${tableId}`);
  }

  async query(sql: string, maxResults = 500, maximumBytesBilled = "1000000000"): Promise<unknown> {
    assertReadonlySql(sql);
    return this.bigQuery("POST", `/projects/${encodeURIComponent(this.config.projectId)}/queries`, {
      query: sql,
      useLegacySql: false,
      location: this.config.location,
      maxResults,
      maximumBytesBilled,
      timeoutMs: 20_000
    });
  }

  async executeSql(sql: string, validateOnly = true, maximumBytesBilled = "1000000000"): Promise<unknown> {
    if (!sql.trim() || sql.length > 50_000) throw new Error("SQL invalido ou excessivo.");
    return this.bigQuery("POST", `/projects/${encodeURIComponent(this.config.projectId)}/queries`, {
      query: sql,
      useLegacySql: false,
      location: this.config.location,
      maximumBytesBilled,
      dryRun: validateOnly,
      timeoutMs: validateOnly ? 10_000 : 20_000
    });
  }

  async createDataset(datasetId: string, description: string, validateOnly: boolean): Promise<unknown> {
    assertIdentifier(datasetId, "datasetId");
    const body = {
      datasetReference: { projectId: this.config.projectId, datasetId },
      location: this.config.location,
      description: description.slice(0, 1024)
    };
    if (validateOnly) return { ok: true, validateOnly, operation: "createDataset", body };
    return this.bigQuery("POST", `/projects/${encodeURIComponent(this.config.projectId)}/datasets`, body);
  }

  async createTable(datasetId: string, tableId: string, fields: JsonObject[], description: string, validateOnly: boolean): Promise<unknown> {
    assertIdentifier(datasetId, "datasetId");
    assertIdentifier(tableId, "tableId");
    const body = {
      tableReference: { projectId: this.config.projectId, datasetId, tableId },
      schema: { fields },
      description: description.slice(0, 1024)
    };
    if (validateOnly) return { ok: true, validateOnly, operation: "createTable", body };
    return this.bigQuery("POST", `/projects/${encodeURIComponent(this.config.projectId)}/datasets/${datasetId}/tables`, body);
  }

  async createView(datasetId: string, viewId: string, sql: string, validateOnly: boolean): Promise<unknown> {
    assertIdentifier(datasetId, "datasetId");
    assertIdentifier(viewId, "viewId");
    assertReadonlySql(sql);
    const body = {
      tableReference: { projectId: this.config.projectId, datasetId, tableId: viewId },
      view: { query: sql, useLegacySql: false }
    };
    if (validateOnly) return { ok: true, validateOnly, operation: "createView", body };
    return this.bigQuery("POST", `/projects/${encodeURIComponent(this.config.projectId)}/datasets/${datasetId}/tables`, body);
  }

  async insertRows(datasetId: string, tableId: string, rows: JsonObject[], validateOnly: boolean): Promise<unknown> {
    assertIdentifier(datasetId, "datasetId");
    assertIdentifier(tableId, "tableId");
    if (rows.length < 1 || rows.length > 500) throw new Error("Envie entre 1 e 500 registros por chamada.");
    if (validateOnly) return { ok: true, validateOnly, rows: rows.length, target: `${datasetId}.${tableId}` };
    return this.bigQuery("POST", `/projects/${encodeURIComponent(this.config.projectId)}/datasets/${datasetId}/tables/${tableId}/insertAll`, {
      skipInvalidRows: false,
      ignoreUnknownValues: false,
      rows: rows.map((json) => ({ insertId: crypto.randomUUID(), json }))
    });
  }

  async importGoogleSheet(datasetId: string, tableId: string, spreadsheetUrl: string, writeDisposition: string, validateOnly: boolean): Promise<unknown> {
    assertIdentifier(datasetId, "datasetId");
    assertIdentifier(tableId, "tableId");
    if (!/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]+/.test(spreadsheetUrl)) throw new Error("URL de Google Sheets invalida.");
    const target = `\`${this.config.projectId}.${datasetId}.${tableId}\``;
    const statements: Record<string, string> = {
      WRITE_TRUNCATE: `CREATE OR REPLACE TABLE ${target} AS SELECT * FROM external_sheet`,
      WRITE_EMPTY: `CREATE TABLE ${target} AS SELECT * FROM external_sheet`,
      WRITE_APPEND: `INSERT INTO ${target} SELECT * FROM external_sheet`
    };
    const sql = statements[writeDisposition];
    if (!sql) throw new Error("writeDisposition deve ser WRITE_TRUNCATE, WRITE_EMPTY ou WRITE_APPEND.");
    const configuration = {
      query: {
        query: sql,
        useLegacySql: false,
        tableDefinitions: {
          external_sheet: {
            sourceUris: [spreadsheetUrl],
            sourceFormat: "GOOGLE_SHEETS",
            autodetect: true,
            googleSheetsOptions: { skipLeadingRows: "1" }
          }
        }
      },
      dryRun: validateOnly
    };
    if (validateOnly) return { ok: true, validateOnly, operation: "importGoogleSheet", configuration };
    return this.bigQuery("POST", `/projects/${encodeURIComponent(this.config.projectId)}/jobs`, {
      configuration,
      jobReference: { projectId: this.config.projectId, location: this.config.location, jobId: `sheet_${crypto.randomUUID()}` }
    });
  }

  async deleteTable(datasetId: string, tableId: string, validateOnly: boolean): Promise<unknown> {
    assertIdentifier(datasetId, "datasetId");
    assertIdentifier(tableId, "tableId");
    if (validateOnly) return { ok: true, validateOnly, operation: "deleteTable", target: `${datasetId}.${tableId}` };
    return this.bigQuery("DELETE", `/projects/${encodeURIComponent(this.config.projectId)}/datasets/${datasetId}/tables/${tableId}`);
  }

  async catalogSource(input: JsonObject, validateOnly: boolean): Promise<unknown> {
    const datasetId = this.config.defaultDataset;
    const tableId = "_catalog_sources";
    const row = {
      source_id: String(input.sourceId ?? crypto.randomUUID()),
      source_name: String(input.sourceName ?? "").slice(0, 256),
      source_type: String(input.sourceType ?? "OTHER").slice(0, 64),
      target_table: String(input.targetTable ?? "").slice(0, 1024),
      description: String(input.description ?? "").slice(0, 2048),
      owner: String(input.owner ?? "").slice(0, 320),
      refresh_frequency: String(input.refreshFrequency ?? "manual").slice(0, 128),
      contains_personal_data: input.containsPersonalData === true,
      updated_at: new Date().toISOString()
    };
    if (validateOnly) return { ok: true, validateOnly, operation: "catalogSource", row };
    await this.ensureOperationalDataset();
    await this.ensureCatalogTable();
    return this.insertRows(datasetId, tableId, [row], false);
  }

  async listCatalog(limit = 200): Promise<unknown> {
    const dataset = `\`${this.config.projectId}.${this.config.defaultDataset}._catalog_sources\``;
    return this.query(`SELECT * FROM ${dataset} ORDER BY updated_at DESC LIMIT ${Math.min(limit, 1000)}`, Math.min(limit, 1000));
  }

  async listLookerAssets(assetType: "REPORT" | "DATA_SOURCE", title?: string, pageSize = 100, pageToken?: string): Promise<unknown> {
    const query = new URLSearchParams({ assetTypes: assetType, pageSize: String(pageSize) });
    if (title) query.set("title", title);
    if (pageToken) query.set("pageToken", pageToken);
    return this.looker("GET", `/assets:search?${query}`);
  }

  async getLookerPermissions(assetName: string): Promise<unknown> {
    return this.looker("GET", `/assets/${assertAssetName(assetName)}/permissions`);
  }

  async addLookerMembers(assetName: string, role: string, members: string[], validateOnly: boolean): Promise<unknown> {
    assertAssetName(assetName);
    if (members.length < 1 || members.length > 100) throw new Error("Informe de 1 a 100 membros.");
    const body = { role, members };
    if (validateOnly) return { ok: true, validateOnly, operation: "addLookerMembers", assetName, body };
    return this.looker("POST", `/assets/${assetName}/permissions:addMembers`, body);
  }

  private async ensureOperationalDataset(): Promise<void> {
    try {
      await this.bigQuery("GET", `/projects/${this.config.projectId}/datasets/${this.config.defaultDataset}`);
    } catch (error) {
      if (!String(error).includes("404")) throw error;
      await this.createDataset(this.config.defaultDataset, "Base operacional catalogada pelo GHCO Data MCP", false);
    }
  }

  private async ensureCatalogTable(): Promise<void> {
    try {
      await this.describeTable(this.config.defaultDataset, "_catalog_sources");
    } catch (error) {
      if (!String(error).includes("404")) throw error;
      await this.createTable(this.config.defaultDataset, "_catalog_sources", [
        { name: "source_id", type: "STRING", mode: "REQUIRED" },
        { name: "source_name", type: "STRING" },
        { name: "source_type", type: "STRING" },
        { name: "target_table", type: "STRING" },
        { name: "description", type: "STRING" },
        { name: "owner", type: "STRING" },
        { name: "refresh_frequency", type: "STRING" },
        { name: "contains_personal_data", type: "BOOLEAN" },
        { name: "updated_at", type: "TIMESTAMP" }
      ], "Catalogo das fontes operacionais", false);
    }
  }

  private async bigQuery(method: string, path: string, body?: unknown): Promise<unknown> {
    return this.googleApi("https://bigquery.googleapis.com/bigquery/v2", method, path, body);
  }

  private async looker(method: string, path: string, body?: unknown): Promise<unknown> {
    return this.googleApi("https://datastudio.googleapis.com/v1", method, path, body);
  }

  private async googleApi(base: string, method: string, path: string, body?: unknown): Promise<unknown> {
    const token = await this.accessToken();
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    if (response.status === 204) return { ok: true };
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Google API ${response.status}: ${JSON.stringify(payload)}`);
    return payload;
  }

  private async accessToken(): Promise<string> {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: this.config.refreshToken,
        grant_type: "refresh_token"
      })
    });
    const payload = await response.json() as { access_token?: string; error_description?: string };
    if (!response.ok || !payload.access_token) throw new Error(`Google OAuth ${response.status}: ${payload.error_description ?? "falha de autenticacao"}`);
    return payload.access_token;
  }
}
