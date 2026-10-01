import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GoogleDataClient } from "./googleDataClient.js";
import { CloudflareDataClient } from "./cloudflareDataClient.js";
import { requireDeleteConfirmation, requireWriteConfirmation } from "./guards.js";

export function createDataMcpServer(client: GoogleDataClient, cloudflare: CloudflareDataClient): McpServer {
  const server = new McpServer({ name: "ghco-data-mcp", version: "0.2.0" });

  server.registerTool("data_list_datasets", {
    title: "Listar bases de dados",
    description: "Lista datasets BigQuery disponiveis no projeto.",
    inputSchema: { maxResults: z.number().int().min(1).max(1000).default(100), pageToken: z.string().optional() }
  }, async ({ maxResults, pageToken }) => result(await client.listDatasets(maxResults, pageToken)));

  server.registerTool("data_list_tables", {
    title: "Listar tabelas",
    description: "Lista tabelas e views de um dataset.",
    inputSchema: { datasetId: z.string().default("ghco_operacao"), maxResults: z.number().int().min(1).max(1000).default(100), pageToken: z.string().optional() }
  }, async ({ datasetId, maxResults, pageToken }) => result(await client.listTables(datasetId, maxResults, pageToken)));

  server.registerTool("data_describe_table", {
    title: "Descrever tabela",
    description: "Retorna schema, descricao, particionamento e metadados da tabela.",
    inputSchema: { datasetId: z.string(), tableId: z.string() }
  }, async ({ datasetId, tableId }) => result(await client.describeTable(datasetId, tableId)));

  server.registerTool("data_query", {
    title: "Consultar dados",
    description: "Executa SQL somente leitura com limite de custo e resultados.",
    inputSchema: {
      sql: z.string().min(1).max(50_000),
      maxResults: z.number().int().min(1).max(3000).default(500),
      maximumBytesBilled: z.string().regex(/^\d+$/).default("1000000000")
    }
  }, async ({ sql, maxResults, maximumBytesBilled }) => result(await client.query(sql, maxResults, maximumBytesBilled)));

  server.registerTool("data_execute_sql", {
    title: "Executar SQL administrativo",
    description: "Executa DDL/DML no BigQuery. Simula por padrao; escrita real exige confirmacao.",
    inputSchema: {
      sql: z.string().min(1).max(50_000),
      validateOnly: z.boolean().default(true),
      maximumBytesBilled: z.string().regex(/^\d+$/).default("1000000000"),
      confirmation: z.string().optional()
    }
  }, async ({ sql, validateOnly, maximumBytesBilled, confirmation }) => {
    const destructive = /\b(DROP|TRUNCATE|DELETE)\b/i.test(sql);
    destructive ? requireDeleteConfirmation(validateOnly, confirmation) : requireWriteConfirmation(validateOnly, confirmation);
    return result(await client.executeSql(sql, validateOnly, maximumBytesBilled));
  });

  server.registerTool("data_create_dataset", {
    title: "Criar base operacional",
    description: "Cria um dataset BigQuery. Simula por padrao.",
    inputSchema: { datasetId: z.string(), description: z.string().max(1024).default(""), validateOnly: z.boolean().default(true), confirmation: z.string().optional() }
  }, async ({ datasetId, description, validateOnly, confirmation }) => {
    requireWriteConfirmation(validateOnly, confirmation);
    return result(await client.createDataset(datasetId, description, validateOnly));
  });

  server.registerTool("data_create_table", {
    title: "Criar tabela",
    description: "Cria tabela com schema definido. Simula por padrao.",
    inputSchema: {
      datasetId: z.string().default("ghco_operacao"),
      tableId: z.string(),
      fields: z.array(z.record(z.string(), z.unknown())).min(1).max(500),
      description: z.string().max(1024).default(""),
      validateOnly: z.boolean().default(true),
      confirmation: z.string().optional()
    }
  }, async ({ datasetId, tableId, fields, description, validateOnly, confirmation }) => {
    requireWriteConfirmation(validateOnly, confirmation);
    return result(await client.createTable(datasetId, tableId, fields, description, validateOnly));
  });

  server.registerTool("data_create_view", {
    title: "Criar view analitica",
    description: "Cria uma view para analise ou Looker Studio. Simula por padrao.",
    inputSchema: { datasetId: z.string().default("ghco_operacao"), viewId: z.string(), sql: z.string().min(1).max(50_000), validateOnly: z.boolean().default(true), confirmation: z.string().optional() }
  }, async ({ datasetId, viewId, sql, validateOnly, confirmation }) => {
    requireWriteConfirmation(validateOnly, confirmation);
    return result(await client.createView(datasetId, viewId, sql, validateOnly));
  });

  server.registerTool("data_import_rows", {
    title: "Importar registros",
    description: "Insere ate 500 registros JSON por chamada. Simula por padrao.",
    inputSchema: { datasetId: z.string().default("ghco_operacao"), tableId: z.string(), rows: z.array(z.record(z.string(), z.unknown())).min(1).max(500), validateOnly: z.boolean().default(true), confirmation: z.string().optional() }
  }, async ({ datasetId, tableId, rows, validateOnly, confirmation }) => {
    requireWriteConfirmation(validateOnly, confirmation);
    return result(await client.insertRows(datasetId, tableId, rows, validateOnly));
  });

  server.registerTool("data_import_google_sheet", {
    title: "Migrar Google Sheets",
    description: "Importa uma planilha Google para tabela nativa BigQuery. Simula por padrao.",
    inputSchema: {
      datasetId: z.string().default("ghco_operacao"), tableId: z.string(), spreadsheetUrl: z.string().url(),
      writeDisposition: z.enum(["WRITE_APPEND", "WRITE_TRUNCATE", "WRITE_EMPTY"]).default("WRITE_APPEND"),
      validateOnly: z.boolean().default(true), confirmation: z.string().optional()
    }
  }, async ({ datasetId, tableId, spreadsheetUrl, writeDisposition, validateOnly, confirmation }) => {
    if (writeDisposition === "WRITE_TRUNCATE") requireDeleteConfirmation(validateOnly, confirmation);
    else requireWriteConfirmation(validateOnly, confirmation);
    return result(await client.importGoogleSheet(datasetId, tableId, spreadsheetUrl, writeDisposition, validateOnly));
  });

  server.registerTool("data_delete_table", {
    title: "Excluir tabela",
    description: "Exclui uma tabela ou view. Simula por padrao e exige confirmacao destrutiva.",
    inputSchema: { datasetId: z.string().default("ghco_operacao"), tableId: z.string(), validateOnly: z.boolean().default(true), confirmation: z.string().optional() }
  }, async ({ datasetId, tableId, validateOnly, confirmation }) => {
    requireDeleteConfirmation(validateOnly, confirmation);
    return result(await client.deleteTable(datasetId, tableId, validateOnly));
  });

  server.registerTool("data_catalog_source", {
    title: "Catalogar fonte",
    description: "Registra origem, destino, responsavel, frequencia e sensibilidade de uma fonte. Simula por padrao.",
    inputSchema: {
      sourceId: z.string().optional(), sourceName: z.string().min(1), sourceType: z.string().min(1), targetTable: z.string().min(1),
      description: z.string().default(""), owner: z.string().default(""), refreshFrequency: z.string().default("manual"),
      containsPersonalData: z.boolean().default(false), validateOnly: z.boolean().default(true), confirmation: z.string().optional()
    }
  }, async ({ validateOnly, confirmation, ...input }) => {
    requireWriteConfirmation(validateOnly, confirmation);
    return result(await client.catalogSource(input, validateOnly));
  });

  server.registerTool("data_list_catalog", {
    title: "Consultar catalogo",
    description: "Lista fontes catalogadas e seus metadados operacionais.",
    inputSchema: { limit: z.number().int().min(1).max(1000).default(200) }
  }, async ({ limit }) => result(await client.listCatalog(limit)));

  server.registerTool("looker_studio_list_assets", {
    title: "Listar ativos Looker Studio",
    description: "Lista relatorios ou fontes de dados visiveis para a conta autorizada.",
    inputSchema: { assetType: z.enum(["REPORT", "DATA_SOURCE"]), title: z.string().optional(), pageSize: z.number().int().min(1).max(1000).default(100), pageToken: z.string().optional() }
  }, async ({ assetType, title, pageSize, pageToken }) => result(await client.listLookerAssets(assetType, title, pageSize, pageToken)));

  server.registerTool("looker_studio_get_permissions", {
    title: "Ler acessos do Looker Studio",
    description: "Consulta proprietarios, editores, visualizadores e compartilhamento de um ativo.",
    inputSchema: { assetName: z.string() }
  }, async ({ assetName }) => result(await client.getLookerPermissions(assetName)));

  server.registerTool("looker_studio_add_members", {
    title: "Compartilhar ativo Looker Studio",
    description: "Adiciona usuarios, grupos ou dominio como editor ou visualizador. Simula por padrao.",
    inputSchema: { assetName: z.string(), role: z.enum(["VIEWER", "EDITOR"]), members: z.array(z.string()).min(1).max(100), validateOnly: z.boolean().default(true), confirmation: z.string().optional() }
  }, async ({ assetName, role, members, validateOnly, confirmation }) => {
    requireWriteConfirmation(validateOnly, confirmation);
    return result(await client.addLookerMembers(assetName, role, members, validateOnly));
  });

  server.registerTool("cloudflare_list_tables", {
    title: "Listar tabelas Cloudflare",
    description: "Lista tabelas e views da base operacional D1, armazenamento principal do MCP.",
    inputSchema: {}
  }, async () => result(await cloudflare.listTables()));

  server.registerTool("cloudflare_describe_table", {
    title: "Descrever tabela Cloudflare",
    description: "Retorna colunas e indices de uma tabela D1.",
    inputSchema: { tableName: z.string() }
  }, async ({ tableName }) => result(await cloudflare.describeTable(tableName)));

  server.registerTool("cloudflare_query", {
    title: "Consultar base Cloudflare",
    description: "Executa SELECT, WITH ou EXPLAIN somente leitura no D1.",
    inputSchema: { sql: z.string().min(1).max(100_000), params: z.array(z.unknown()).max(100).default([]) }
  }, async ({ sql, params }) => result(await cloudflare.query(sql, params)));

  server.registerTool("cloudflare_create_collection", {
    title: "Criar colecao operacional",
    description: "Cria uma colecao flexivel para substituir uma aba de planilha. Simula por padrao.",
    inputSchema: { name: z.string(), description: z.string().max(1024).default(""), schema: z.record(z.string(), z.unknown()).default({}), validateOnly: z.boolean().default(true), confirmation: z.string().optional() }
  }, async ({ name, description, schema, validateOnly, confirmation }) => {
    requireWriteConfirmation(validateOnly, confirmation);
    return result(await cloudflare.createCollection(name, description, schema, validateOnly));
  });

  server.registerTool("cloudflare_list_collections", {
    title: "Listar colecoes operacionais",
    description: "Lista colecoes de dados mantidas no D1.",
    inputSchema: {}
  }, async () => result(await cloudflare.listCollections()));

  server.registerTool("cloudflare_upsert_records", {
    title: "Inserir ou atualizar registros",
    description: "Insere ou atualiza ate 500 registros JSON em uma colecao. Simula por padrao.",
    inputSchema: { collection: z.string(), records: z.array(z.record(z.string(), z.unknown())).min(1).max(500), validateOnly: z.boolean().default(true), confirmation: z.string().optional() }
  }, async ({ collection, records, validateOnly, confirmation }) => {
    requireWriteConfirmation(validateOnly, confirmation);
    return result(await cloudflare.upsertRecords(collection, records, validateOnly));
  });

  server.registerTool("cloudflare_list_records", {
    title: "Ler registros",
    description: "Lista registros de uma colecao com paginacao temporal.",
    inputSchema: { collection: z.string(), limit: z.number().int().min(1).max(1000).default(200), cursor: z.string().optional() }
  }, async ({ collection, limit, cursor }) => result(await cloudflare.listRecords(collection, limit, cursor)));

  server.registerTool("cloudflare_delete_records", {
    title: "Excluir registros",
    description: "Exclui registros por ID. Simula por padrao e exige confirmacao destrutiva.",
    inputSchema: { collection: z.string(), ids: z.array(z.string()).min(1).max(500), validateOnly: z.boolean().default(true), confirmation: z.string().optional() }
  }, async ({ collection, ids, validateOnly, confirmation }) => {
    requireDeleteConfirmation(validateOnly, confirmation);
    return result(await cloudflare.deleteRecords(collection, ids, validateOnly));
  });

  server.registerTool("cloudflare_catalog_source", {
    title: "Catalogar fonte no Cloudflare",
    description: "Registra ou atualiza origem, destino, responsavel, frequencia e sensibilidade no catalogo D1.",
    inputSchema: {
      sourceId: z.string().optional(), sourceName: z.string().min(1), sourceType: z.string().min(1), targetName: z.string().min(1),
      description: z.string().default(""), owner: z.string().default(""), refreshFrequency: z.string().default("manual"),
      containsPersonalData: z.boolean().default(false), validateOnly: z.boolean().default(true), confirmation: z.string().optional()
    }
  }, async ({ validateOnly, confirmation, ...input }) => {
    requireWriteConfirmation(validateOnly, confirmation);
    return result(await cloudflare.catalogSource(input, validateOnly));
  });

  server.registerTool("cloudflare_list_catalog", {
    title: "Consultar catalogo Cloudflare",
    description: "Lista fontes catalogadas no armazenamento principal.",
    inputSchema: { limit: z.number().int().min(1).max(1000).default(200) }
  }, async ({ limit }) => result(await cloudflare.listCatalog(limit)));

  server.registerTool("cloudflare_list_files", {
    title: "Listar arquivos R2",
    description: "Lista arquivos, imagens, documentos e exportacoes no R2.",
    inputSchema: { prefix: z.string().default(""), limit: z.number().int().min(1).max(1000).default(200), cursor: z.string().optional() }
  }, async ({ prefix, limit, cursor }) => result(await cloudflare.listFiles(prefix, limit, cursor)));

  server.registerTool("cloudflare_put_file", {
    title: "Enviar arquivo ao R2",
    description: "Envia conteudo Base64 de ate 10 MB ao R2. Simula por padrao.",
    inputSchema: { key: z.string(), contentBase64: z.string(), contentType: z.string().default("application/octet-stream"), metadata: z.record(z.string(), z.string()).default({}), validateOnly: z.boolean().default(true), confirmation: z.string().optional() }
  }, async ({ key, contentBase64, contentType, metadata, validateOnly, confirmation }) => {
    requireWriteConfirmation(validateOnly, confirmation);
    return result(await cloudflare.putFile(key, contentBase64, contentType, metadata, validateOnly));
  });

  server.registerTool("cloudflare_get_file", {
    title: "Baixar arquivo do R2",
    description: "Le arquivo como texto ou Base64, com limite explicito de retorno.",
    inputSchema: { key: z.string(), encoding: z.enum(["text", "base64"]).default("text"), maxBytes: z.number().int().min(1).max(10_485_760).default(1_048_576), offset: z.number().int().min(0).default(0) }
  }, async ({ key, encoding, maxBytes, offset }) => result(await cloudflare.getFile(key, encoding, maxBytes, offset)));

  server.registerTool("cloudflare_create_multipart_upload", {
    title: "Iniciar upload pesado",
    description: "Inicia upload multipartes para arquivos grandes no R2.",
    inputSchema: { key: z.string(), contentType: z.string().default("application/octet-stream"), metadata: z.record(z.string(), z.string()).default({}), validateOnly: z.boolean().default(true), confirmation: z.string().optional() }
  }, async ({ key, contentType, metadata, validateOnly, confirmation }) => {
    requireWriteConfirmation(validateOnly, confirmation);
    return result(await cloudflare.createMultipartUpload(key, contentType, metadata, validateOnly));
  });

  server.registerTool("cloudflare_upload_part", {
    title: "Enviar parte de arquivo pesado",
    description: "Envia uma parte Base64 de ate 20 MB para um upload multipartes.",
    inputSchema: { key: z.string(), uploadId: z.string(), partNumber: z.number().int().min(1).max(10_000), contentBase64: z.string(), validateOnly: z.boolean().default(true), confirmation: z.string().optional() }
  }, async ({ key, uploadId, partNumber, contentBase64, validateOnly, confirmation }) => {
    requireWriteConfirmation(validateOnly, confirmation);
    return result(await cloudflare.uploadPart(key, uploadId, partNumber, contentBase64, validateOnly));
  });

  server.registerTool("cloudflare_complete_multipart_upload", {
    title: "Concluir upload pesado",
    description: "Combina as partes enviadas e publica o arquivo final no R2.",
    inputSchema: { key: z.string(), uploadId: z.string(), parts: z.array(z.object({ partNumber: z.number().int().min(1), etag: z.string() })).min(1).max(10_000), validateOnly: z.boolean().default(true), confirmation: z.string().optional() }
  }, async ({ key, uploadId, parts, validateOnly, confirmation }) => {
    requireWriteConfirmation(validateOnly, confirmation);
    return result(await cloudflare.completeMultipartUpload(key, uploadId, parts, validateOnly));
  });

  server.registerTool("cloudflare_abort_multipart_upload", {
    title: "Cancelar upload pesado",
    description: "Cancela e descarta um upload multipartes incompleto.",
    inputSchema: { key: z.string(), uploadId: z.string(), validateOnly: z.boolean().default(true), confirmation: z.string().optional() }
  }, async ({ key, uploadId, validateOnly, confirmation }) => {
    requireDeleteConfirmation(validateOnly, confirmation);
    return result(await cloudflare.abortMultipartUpload(key, uploadId, validateOnly));
  });

  server.registerTool("cloudflare_delete_files", {
    title: "Excluir arquivos do R2",
    description: "Exclui ate 1000 arquivos. Simula por padrao e exige confirmacao destrutiva.",
    inputSchema: { keys: z.array(z.string()).min(1).max(1000), validateOnly: z.boolean().default(true), confirmation: z.string().optional() }
  }, async ({ keys, validateOnly, confirmation }) => {
    requireDeleteConfirmation(validateOnly, confirmation);
    return result(await cloudflare.deleteFiles(keys, validateOnly));
  });

  server.registerTool("basin_catalog_info", {
    title: "Informacoes do Basin Catalog",
    description: "Retorna URI, warehouse, bucket e politica de retencao do R2 Data Catalog.",
    inputSchema: {}
  }, async () => result(cloudflare.catalogInfo()));

  return server;
}

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}
