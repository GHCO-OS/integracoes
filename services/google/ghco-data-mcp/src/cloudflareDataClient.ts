import { assertIdentifier, assertReadonlySql } from "./guards.js";

type JsonObject = Record<string, unknown>;

export class CloudflareDataClient {
  constructor(
    private readonly db: D1Database,
    private readonly files: R2Bucket,
    private readonly catalogUri: string,
    private readonly warehouse: string
  ) {}

  async probe(): Promise<Record<string, unknown>> {
    const database = await this.db.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    const bucket = await this.files.list({ limit: 1 });
    return { database: database?.ok === 1, objectStorage: Array.isArray(bucket.objects), basinCatalog: true };
  }

  async listTables(): Promise<unknown> {
    return this.db.prepare("SELECT name, type, sql FROM sqlite_schema WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  }

  async describeTable(tableName: string): Promise<unknown> {
    assertIdentifier(tableName, "tableName");
    const [columns, indexes] = await Promise.all([
      this.db.prepare(`PRAGMA table_info(${tableName})`).all(),
      this.db.prepare(`PRAGMA index_list(${tableName})`).all()
    ]);
    return { tableName, columns: columns.results, indexes: indexes.results };
  }

  async query(sql: string, params: unknown[] = []): Promise<unknown> {
    assertReadonlySql(sql);
    if (params.length > 100) throw new Error("No maximo 100 parametros por consulta.");
    return this.db.prepare(sql).bind(...params).all();
  }

  async createCollection(name: string, description: string, schema: JsonObject, validateOnly: boolean): Promise<unknown> {
    assertIdentifier(name, "name");
    const now = new Date().toISOString();
    const body = { id: crypto.randomUUID(), name, description: description.slice(0, 1024), schema, createdAt: now };
    if (validateOnly) return { ok: true, validateOnly, operation: "createCollection", body };
    await this.db.prepare("INSERT INTO collections (id,name,description,schema_json,created_at,updated_at) VALUES (?,?,?,?,?,?)")
      .bind(body.id, name, body.description, JSON.stringify(schema), now, now).run();
    await this.audit("collection.create", name, { id: body.id });
    return { ok: true, ...body };
  }

  async listCollections(): Promise<unknown> {
    return this.db.prepare("SELECT id,name,description,schema_json,created_at,updated_at FROM collections ORDER BY name").all();
  }

  async upsertRecords(collection: string, records: JsonObject[], validateOnly: boolean): Promise<unknown> {
    assertIdentifier(collection, "collection");
    if (records.length < 1 || records.length > 500) throw new Error("Envie entre 1 e 500 registros por chamada.");
    const parent = await this.db.prepare("SELECT id FROM collections WHERE name=?").bind(collection).first<{ id: string }>();
    if (!parent) throw new Error(`Colecao inexistente: ${collection}`);
    if (validateOnly) return { ok: true, validateOnly, operation: "upsertRecords", collection, records: records.length };
    const now = new Date().toISOString();
    const statements = records.map((data) => {
      const id = typeof data.id === "string" && data.id ? data.id.slice(0, 200) : crypto.randomUUID();
      return this.db.prepare("INSERT INTO records (id,collection_id,data_json,created_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json,updated_at=excluded.updated_at")
        .bind(id, parent.id, JSON.stringify({ ...data, id }), now, now);
    });
    await this.db.batch(statements);
    await this.audit("records.upsert", collection, { count: records.length });
    return { ok: true, collection, records: records.length };
  }

  async listRecords(collection: string, limit: number, cursor?: string): Promise<unknown> {
    assertIdentifier(collection, "collection");
    const parent = await this.db.prepare("SELECT id FROM collections WHERE name=?").bind(collection).first<{ id: string }>();
    if (!parent) throw new Error(`Colecao inexistente: ${collection}`);
    const sql = cursor
      ? "SELECT id,data_json,created_at,updated_at FROM records WHERE collection_id=? AND updated_at<? ORDER BY updated_at DESC LIMIT ?"
      : "SELECT id,data_json,created_at,updated_at FROM records WHERE collection_id=? ORDER BY updated_at DESC LIMIT ?";
    const values = cursor ? [parent.id, cursor, limit] : [parent.id, limit];
    return this.db.prepare(sql).bind(...values).all();
  }

  async deleteRecords(collection: string, ids: string[], validateOnly: boolean): Promise<unknown> {
    assertIdentifier(collection, "collection");
    if (ids.length < 1 || ids.length > 500) throw new Error("Envie entre 1 e 500 ids.");
    if (validateOnly) return { ok: true, validateOnly, operation: "deleteRecords", collection, ids: ids.length };
    const parent = await this.db.prepare("SELECT id FROM collections WHERE name=?").bind(collection).first<{ id: string }>();
    if (!parent) throw new Error(`Colecao inexistente: ${collection}`);
    const placeholders = ids.map(() => "?").join(",");
    const result = await this.db.prepare(`DELETE FROM records WHERE collection_id=? AND id IN (${placeholders})`).bind(parent.id, ...ids).run();
    await this.audit("records.delete", collection, { ids, changes: result.meta.changes });
    return { ok: true, deleted: result.meta.changes };
  }

  async catalogSource(input: JsonObject, validateOnly: boolean): Promise<unknown> {
    const now = new Date().toISOString();
    const row = {
      id: String(input.sourceId ?? crypto.randomUUID()), sourceName: String(input.sourceName ?? "").slice(0, 256),
      sourceType: String(input.sourceType ?? "OTHER").slice(0, 64), targetName: String(input.targetName ?? "").slice(0, 512),
      description: String(input.description ?? "").slice(0, 2048), owner: String(input.owner ?? "").slice(0, 320),
      refreshFrequency: String(input.refreshFrequency ?? "manual").slice(0, 128), containsPersonalData: input.containsPersonalData === true
    };
    if (!row.sourceName || !row.targetName) throw new Error("sourceName e targetName sao obrigatorios.");
    if (validateOnly) return { ok: true, validateOnly, operation: "catalogSource", row };
    await this.db.prepare("INSERT INTO catalog_sources (id,source_name,source_type,target_name,description,owner,refresh_frequency,contains_personal_data,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET source_name=excluded.source_name,source_type=excluded.source_type,target_name=excluded.target_name,description=excluded.description,owner=excluded.owner,refresh_frequency=excluded.refresh_frequency,contains_personal_data=excluded.contains_personal_data,updated_at=excluded.updated_at")
      .bind(row.id, row.sourceName, row.sourceType, row.targetName, row.description, row.owner, row.refreshFrequency, row.containsPersonalData ? 1 : 0, now, now).run();
    await this.audit("catalog.upsert", row.id, row);
    return { ok: true, ...row };
  }

  async listCatalog(limit: number): Promise<unknown> {
    return this.db.prepare("SELECT * FROM catalog_sources ORDER BY updated_at DESC LIMIT ?").bind(limit).all();
  }

  async listFiles(prefix: string, limit: number, cursor?: string): Promise<unknown> {
    const result = await this.files.list({ prefix: normalizeKey(prefix, true), limit, cursor });
    return { objects: result.objects.map(({ key, size, etag, uploaded, customMetadata }) => ({ key, size, etag, uploaded, customMetadata })), truncated: result.truncated, cursor: result.truncated ? result.cursor : undefined };
  }

  async putFile(key: string, contentBase64: string, contentType: string, metadata: Record<string, string>, validateOnly: boolean): Promise<unknown> {
    const safeKey = normalizeKey(key);
    const bytes = Uint8Array.from(atob(contentBase64), (char) => char.charCodeAt(0));
    if (bytes.byteLength > 10 * 1024 * 1024) throw new Error("Uploads MCP diretos sao limitados a 10 MB por chamada.");
    if (validateOnly) return { ok: true, validateOnly, operation: "putFile", key: safeKey, bytes: bytes.byteLength, contentType };
    const stored = await this.files.put(safeKey, bytes, { httpMetadata: { contentType }, customMetadata: metadata });
    await this.audit("file.put", safeKey, { bytes: bytes.byteLength, etag: stored?.etag });
    return { ok: true, key: safeKey, bytes: bytes.byteLength, etag: stored?.etag };
  }

  async getFile(key: string, encoding: "text" | "base64", maxBytes: number, offset = 0): Promise<unknown> {
    const safeKey = normalizeKey(key);
    const object = await this.files.get(safeKey, { range: { offset, length: maxBytes + 1 } });
    if (!object) throw new Error("Arquivo nao encontrado.");
    const bytes = new Uint8Array(await object.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new Error(`Arquivo excede o limite de retorno de ${maxBytes} bytes.`);
    const content = encoding === "text" ? new TextDecoder().decode(bytes) : bytesToBase64(bytes);
    return { key: safeKey, size: object.size, offset, returnedBytes: bytes.byteLength, etag: object.etag, contentType: object.httpMetadata?.contentType, encoding, content };
  }

  async createMultipartUpload(key: string, contentType: string, metadata: Record<string, string>, validateOnly: boolean): Promise<unknown> {
    const safeKey = normalizeKey(key);
    if (validateOnly) return { ok: true, validateOnly, operation: "createMultipartUpload", key: safeKey, contentType };
    const upload = await this.files.createMultipartUpload(safeKey, { httpMetadata: { contentType }, customMetadata: metadata });
    await this.audit("file.multipart.create", safeKey, { uploadId: upload.uploadId });
    return { ok: true, key: upload.key, uploadId: upload.uploadId };
  }

  async uploadPart(key: string, uploadId: string, partNumber: number, contentBase64: string, validateOnly: boolean): Promise<unknown> {
    const safeKey = normalizeKey(key);
    const bytes = Uint8Array.from(atob(contentBase64), (char) => char.charCodeAt(0));
    if (bytes.byteLength > 20 * 1024 * 1024) throw new Error("Cada parte e limitada a 20 MB.");
    if (validateOnly) return { ok: true, validateOnly, operation: "uploadPart", key: safeKey, uploadId, partNumber, bytes: bytes.byteLength };
    const part = await this.files.resumeMultipartUpload(safeKey, uploadId).uploadPart(partNumber, bytes);
    return { ok: true, key: safeKey, uploadId, partNumber: part.partNumber, etag: part.etag, bytes: bytes.byteLength };
  }

  async completeMultipartUpload(key: string, uploadId: string, parts: Array<{ partNumber: number; etag: string }>, validateOnly: boolean): Promise<unknown> {
    const safeKey = normalizeKey(key);
    if (parts.length < 1 || parts.length > 10_000) throw new Error("Envie entre 1 e 10000 partes.");
    if (validateOnly) return { ok: true, validateOnly, operation: "completeMultipartUpload", key: safeKey, uploadId, parts: parts.length };
    const object = await this.files.resumeMultipartUpload(safeKey, uploadId).complete(parts);
    await this.audit("file.multipart.complete", safeKey, { uploadId, parts: parts.length, etag: object.etag });
    return { ok: true, key: object.key, etag: object.etag, size: object.size };
  }

  async abortMultipartUpload(key: string, uploadId: string, validateOnly: boolean): Promise<unknown> {
    const safeKey = normalizeKey(key);
    if (validateOnly) return { ok: true, validateOnly, operation: "abortMultipartUpload", key: safeKey, uploadId };
    await this.files.resumeMultipartUpload(safeKey, uploadId).abort();
    await this.audit("file.multipart.abort", safeKey, { uploadId });
    return { ok: true, key: safeKey, uploadId, aborted: true };
  }

  async deleteFiles(keys: string[], validateOnly: boolean): Promise<unknown> {
    const safeKeys = keys.map((key) => normalizeKey(key));
    if (safeKeys.length < 1 || safeKeys.length > 1000) throw new Error("Envie entre 1 e 1000 chaves.");
    if (validateOnly) return { ok: true, validateOnly, operation: "deleteFiles", keys: safeKeys };
    await this.files.delete(safeKeys);
    await this.audit("file.delete", "r2", { keys: safeKeys });
    return { ok: true, deleted: safeKeys.length };
  }

  catalogInfo(): unknown {
    return { provider: "Cloudflare R2 Data Catalog (Basin)", status: "active", catalogUri: this.catalogUri, warehouse: this.warehouse, bucket: "ghco-data-files", automaticSnapshotExpiration: false };
  }

  private async audit(action: string, target: string, details: unknown): Promise<void> {
    await this.db.prepare("INSERT INTO audit_log (id,action,target,details_json,created_at) VALUES (?,?,?,?,?)")
      .bind(crypto.randomUUID(), action, target, JSON.stringify(details), new Date().toISOString()).run();
  }
}

function normalizeKey(value: string, allowEmpty = false): string {
  const clean = value.trim().replace(/^\/+/, "");
  if ((!clean && !allowEmpty) || clean.includes("..") || clean.includes("\\") || clean.length > 1024) throw new Error("Chave R2 invalida.");
  return clean;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}
