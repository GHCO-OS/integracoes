import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GoogleDataClient } from "./googleDataClient.js";
import { requireDeleteConfirmation, requireWriteConfirmation } from "./guards.js";

export function createDataMcpServer(client: GoogleDataClient): McpServer {
  const server = new McpServer({ name: "ghco-data-mcp", version: "0.1.0" });

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

  return server;
}

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}
