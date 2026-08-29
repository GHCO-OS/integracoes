import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GoogleAdsClient } from "./googleAdsClient.js";
import { assertMutationConfirmed } from "./mutationGuard.js";
import { customerMatchOperations } from "./customerMatch.js";
import { MerchantClient } from "./merchantClient.js";

type McpMetadata = {
  localUrl?: string;
  publicUrl?: string;
  apiVersion: string;
};

export function createGoogleAdsMcpServer(googleAds: GoogleAdsClient, metadata: McpMetadata, merchant?: MerchantClient): McpServer {
  const server = new McpServer({
    name: "ghco-google-ads",
    version: "0.3.0"
  });

  server.registerTool(
    "get_accessible_customers",
    {
      title: "Listar contas acessiveis",
      description: "Lista customer IDs do Google Ads acessiveis pelo OAuth configurado.",
      inputSchema: {}
    },
    async () => textResult(await googleAds.listAccessibleCustomers())
  );

  server.registerTool(
    "list_campaigns",
    {
      title: "Listar campanhas",
      description: "Lista campanhas com status, tipo, estrategia de lance e orcamento.",
      inputSchema: {
        customerId: z.string().optional(),
        limit: z.number().int().min(1).max(500).default(100)
      }
    },
    async ({ customerId, limit }) =>
      textResult(
        await googleAds.searchStream(
          `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.bidding_strategy_type, campaign_budget.id, campaign_budget.name, campaign_budget.amount_micros FROM campaign ORDER BY campaign.name LIMIT ${limit}`,
          customerId
        )
      )
  );

  server.registerTool(
    "get_campaign_metrics",
    {
      title: "Metricas de campanhas",
      description: "Consulta impressoes, cliques, custo, conversoes, CTR e CPC por campanha.",
      inputSchema: {
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        customerId: z.string().optional(),
        campaignId: z.string().optional(),
        limit: z.number().int().min(1).max(1000).default(250)
      }
    },
    async ({ startDate, endDate, customerId, campaignId, limit }) => {
      const where = [
        `segments.date BETWEEN '${startDate}' AND '${endDate}'`,
        campaignId ? `campaign.id = ${campaignId.replace(/\D/g, "")}` : null
      ]
        .filter(Boolean)
        .join(" AND ");

      return textResult(
        await googleAds.searchStream(
          `SELECT campaign.id, campaign.name, campaign.status, segments.date, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.ctr, metrics.average_cpc FROM campaign WHERE ${where} ORDER BY segments.date DESC LIMIT ${limit}`,
          customerId
        )
      );
    }
  );

  server.registerTool(
    "get_ad_groups",
    {
      title: "Grupos de anuncios",
      description: "Lista grupos de anuncios por campanha.",
      inputSchema: {
        customerId: z.string().optional(),
        campaignId: z.string().optional(),
        limit: z.number().int().min(1).max(1000).default(250)
      }
    },
    async ({ customerId, campaignId, limit }) => {
      const where = campaignId ? ` WHERE campaign.id = ${campaignId.replace(/\D/g, "")}` : "";
      return textResult(
        await googleAds.searchStream(
          `SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, ad_group.status, ad_group.type FROM ad_group${where} ORDER BY campaign.name, ad_group.name LIMIT ${limit}`,
          customerId
        )
      );
    }
  );

  server.registerTool(
    "get_ads",
    {
      title: "Anuncios",
      description: "Lista anuncios, status e textos principais quando disponiveis.",
      inputSchema: {
        customerId: z.string().optional(),
        campaignId: z.string().optional(),
        limit: z.number().int().min(1).max(1000).default(250)
      }
    },
    async ({ customerId, campaignId, limit }) => {
      const where = campaignId ? ` WHERE campaign.id = ${campaignId.replace(/\D/g, "")}` : "";
      return textResult(
        await googleAds.searchStream(
          `SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, ad_group_ad.ad.id, ad_group_ad.status, ad_group_ad.ad.type, ad_group_ad.ad.final_urls, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions FROM ad_group_ad${where} ORDER BY campaign.name, ad_group.name LIMIT ${limit}`,
          customerId
        )
      );
    }
  );

  server.registerTool(
    "get_keywords",
    {
      title: "Palavras-chave",
      description: "Lista palavras-chave, correspondencia, status e metricas no periodo.",
      inputSchema: {
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        customerId: z.string().optional(),
        limit: z.number().int().min(1).max(1000).default(250)
      }
    },
    async ({ startDate, endDate, customerId, limit }) =>
      textResult(
        await googleAds.searchStream(
          `SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM keyword_view WHERE segments.date BETWEEN '${startDate}' AND '${endDate}' ORDER BY metrics.clicks DESC LIMIT ${limit}`,
          customerId
        )
      )
  );

  server.registerTool(
    "get_search_terms",
    {
      title: "Termos de busca",
      description: "Consulta termos reais pesquisados, campanha, grupo e metricas no periodo.",
      inputSchema: {
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        customerId: z.string().optional(),
        limit: z.number().int().min(1).max(1000).default(250)
      }
    },
    async ({ startDate, endDate, customerId, limit }) =>
      textResult(
        await googleAds.searchStream(
          `SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, search_term_view.search_term, search_term_view.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM search_term_view WHERE segments.date BETWEEN '${startDate}' AND '${endDate}' ORDER BY metrics.clicks DESC LIMIT ${limit}`,
          customerId
        )
      )
  );

  server.registerTool(
    "get_geo_performance",
    {
      title: "Desempenho geografico",
      description: "Consulta desempenho por localizacao geografica no periodo.",
      inputSchema: {
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        customerId: z.string().optional(),
        limit: z.number().int().min(1).max(1000).default(250)
      }
    },
    async ({ startDate, endDate, customerId, limit }) =>
      textResult(
        await googleAds.searchStream(
          `SELECT geographic_view.country_criterion_id, geographic_view.location_type, campaign.id, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM geographic_view WHERE segments.date BETWEEN '${startDate}' AND '${endDate}' ORDER BY metrics.clicks DESC LIMIT ${limit}`,
          customerId
        )
      )
  );

  server.registerTool(
    "get_budget_status",
    {
      title: "Status de orcamentos",
      description: "Lista orcamentos de campanha e valores configurados.",
      inputSchema: {
        customerId: z.string().optional(),
        limit: z.number().int().min(1).max(500).default(100)
      }
    },
    async ({ customerId, limit }) =>
      textResult(
        await googleAds.searchStream(
          `SELECT campaign_budget.id, campaign_budget.name, campaign_budget.status, campaign_budget.amount_micros, campaign_budget.total_amount_micros, campaign_budget.delivery_method, campaign_budget.explicitly_shared FROM campaign_budget ORDER BY campaign_budget.name LIMIT ${limit}`,
          customerId
        )
      )
  );

  server.registerTool(
    "run_readonly_gaql",
    {
      title: "Executar GAQL somente leitura",
      description: "Executa uma consulta GAQL SELECT. Mutacoes e comandos de escrita sao bloqueados.",
      inputSchema: {
        query: z.string().min(1).max(8000),
        customerId: z.string().optional()
      }
    },
    async ({ query, customerId }) => textResult(await googleAds.searchStream(query, customerId))
  );

  server.registerTool(
    "mutate_google_ads",
    {
      title: "Criar, atualizar ou remover recursos Google Ads",
      description:
        "Executa GoogleAdsService.Mutate para qualquer recurso suportado. Por padrao apenas valida. Escrita exige CONFIRM_GOOGLE_ADS_WRITE; operacoes remove exigem CONFIRM_GOOGLE_ADS_DELETE.",
      inputSchema: {
        operations: z.array(z.record(z.string(), z.unknown())).min(1).max(1000),
        customerId: z.string().optional(),
        partialFailure: z.boolean().default(false),
        validateOnly: z.boolean().default(true),
        responseContentType: z.enum(["RESOURCE_NAME_ONLY", "MUTABLE_RESOURCE"]).default("RESOURCE_NAME_ONLY"),
        confirmWrite: z.string().optional()
      }
    },
    async ({ operations, customerId, partialFailure, validateOnly, responseContentType, confirmWrite }) => {
      assertMutationConfirmed(operations, validateOnly, confirmWrite);
      return textResult(
        await googleAds.mutate(operations, {
          customerId,
          partialFailure,
          validateOnly,
          responseContentType
        })
      );
    }
  );

  server.registerTool(
    "create_customer_match_job",
    {
      title: "Criar job de Customer Match",
      description: "Cria um job de audiencia CRM. Exige consentimento declarado e confirmacao de escrita.",
      inputSchema: {
        userList: z.string().regex(/^customers\/\d+\/userLists\/\d+$/),
        customerId: z.string().optional(),
        adUserData: z.enum(["GRANTED", "DENIED"]),
        adPersonalization: z.enum(["GRANTED", "DENIED"]),
        confirmWrite: z.literal("CONFIRM_GOOGLE_ADS_WRITE")
      }
    },
    async ({ userList, customerId, adUserData, adPersonalization }) =>
      textResult(await googleAds.createCustomerMatchJob(userList, customerId, { adUserData, adPersonalization }))
  );

  server.registerTool(
    "add_customer_match_users",
    {
      title: "Enviar lote CRM ao Customer Match",
      description: "Normaliza e aplica SHA-256 a email/telefone no Worker. Aceita ate 10 mil registros por chamada; repita para arquivos grandes.",
      inputSchema: {
        jobResourceName: z.string().regex(/^customers\/\d+\/offlineUserDataJobs\/\d+$/),
        records: z.array(z.object({
          email: z.string().optional(),
          phone: z.string().optional(),
          thirdPartyUserId: z.string().optional()
        })).min(1).max(10_000),
        action: z.enum(["create", "remove"]).default("create"),
        enablePartialFailure: z.boolean().default(true),
        confirmWrite: z.string()
      }
    },
    async ({ jobResourceName, records, action, enablePartialFailure, confirmWrite }) => {
      const expected = action === "remove" ? "CONFIRM_GOOGLE_ADS_DELETE" : "CONFIRM_GOOGLE_ADS_WRITE";
      if (confirmWrite !== expected) throw new Error(`Operacao bloqueada. Use confirmWrite=${expected}.`);
      return textResult(await googleAds.addCustomerMatchOperations(
        jobResourceName,
        await customerMatchOperations(records, action),
        enablePartialFailure
      ));
    }
  );

  server.registerTool(
    "run_customer_match_job",
    {
      title: "Executar job de Customer Match",
      description: "Inicia o processamento do job apos todos os lotes terem sido enviados.",
      inputSchema: {
        jobResourceName: z.string().regex(/^customers\/\d+\/offlineUserDataJobs\/\d+$/),
        confirmWrite: z.literal("CONFIRM_GOOGLE_ADS_WRITE")
      }
    },
    async ({ jobResourceName }) => textResult(await googleAds.runCustomerMatchJob(jobResourceName))
  );

  server.registerTool(
    "upload_crm_click_conversions",
    {
      title: "Enviar conversoes offline do CRM",
      description: "Envia conversoes de clique do CRM. Valida por padrao; execucao real exige confirmacao.",
      inputSchema: {
        conversions: z.array(z.record(z.string(), z.unknown())).min(1).max(2000),
        customerId: z.string().optional(),
        partialFailure: z.boolean().default(true),
        validateOnly: z.boolean().default(true),
        jobId: z.number().int().positive().optional(),
        confirmWrite: z.string().optional()
      }
    },
    async ({ conversions, customerId, partialFailure, validateOnly, jobId, confirmWrite }) => {
      if (!validateOnly && confirmWrite !== "CONFIRM_GOOGLE_ADS_WRITE") {
        throw new Error("Upload bloqueado. Use confirmWrite=CONFIRM_GOOGLE_ADS_WRITE.");
      }
      return textResult(await googleAds.uploadClickConversions(conversions, { customerId, partialFailure, validateOnly, jobId }));
    }
  );

  server.registerTool("merchant_list_products", {
    title: "Listar produtos do Merchant Center",
    description: "Lista produtos processados, status e problemas do catalogo.",
    inputSchema: { merchantAccountId: z.string().optional(), pageSize: z.number().int().min(1).max(1000).default(100), pageToken: z.string().optional() }
  }, async ({ merchantAccountId, pageSize, pageToken }) => textResult(await requireMerchant(merchant).listProducts(merchantAccountId, pageSize, pageToken)));

  server.registerTool("merchant_list_data_sources", {
    title: "Listar fontes do Merchant Center",
    description: "Lista fontes de dados usadas pelo catalogo.",
    inputSchema: { merchantAccountId: z.string().optional(), pageSize: z.number().int().min(1).max(1000).default(100), pageToken: z.string().optional() }
  }, async ({ merchantAccountId, pageSize, pageToken }) => textResult(await requireMerchant(merchant).listDataSources(merchantAccountId, pageSize, pageToken)));

  server.registerTool("merchant_upsert_product", {
    title: "Inserir ou substituir produto Merchant",
    description: "Insere um ProductInput em fonte API. Exige confirmacao de escrita.",
    inputSchema: { merchantAccountId: z.string().optional(), dataSource: z.string(), productInput: z.record(z.string(), z.unknown()), confirmWrite: z.literal("CONFIRM_GOOGLE_MERCHANT_WRITE") }
  }, async ({ merchantAccountId, dataSource, productInput }) => textResult(await requireMerchant(merchant).insertProduct(dataSource, productInput, merchantAccountId)));

  server.registerTool("merchant_patch_product", {
    title: "Atualizar produto Merchant",
    description: "Atualiza campos selecionados de um ProductInput.",
    inputSchema: { name: z.string(), dataSource: z.string(), updateMask: z.string().min(1), productInput: z.record(z.string(), z.unknown()), confirmWrite: z.literal("CONFIRM_GOOGLE_MERCHANT_WRITE") }
  }, async ({ name, dataSource, updateMask, productInput }) => textResult(await requireMerchant(merchant).patchProduct(name, productInput, updateMask, dataSource)));

  server.registerTool("merchant_delete_product", {
    title: "Excluir produto Merchant",
    description: "Exclui um ProductInput da fonte indicada.",
    inputSchema: { name: z.string(), dataSource: z.string(), confirmWrite: z.literal("CONFIRM_GOOGLE_MERCHANT_DELETE") }
  }, async ({ name, dataSource }) => textResult(await requireMerchant(merchant).deleteProduct(name, dataSource)));

  server.registerTool("merchant_manage_data_source", {
    title: "Criar ou atualizar fonte Merchant",
    description: "Cria ou atualiza uma fonte de dados. action=create ou patch.",
    inputSchema: { action: z.enum(["create", "patch"]), merchantAccountId: z.string().optional(), name: z.string().optional(), updateMask: z.string().optional(), dataSource: z.record(z.string(), z.unknown()), confirmWrite: z.literal("CONFIRM_GOOGLE_MERCHANT_WRITE") }
  }, async ({ action, merchantAccountId, name, updateMask, dataSource }) => textResult(action === "create"
    ? await requireMerchant(merchant).createDataSource(dataSource, merchantAccountId)
    : await requireMerchant(merchant).patchDataSource(name ?? "", dataSource, updateMask ?? "")));

  server.registerTool("merchant_delete_data_source", {
    title: "Excluir fonte Merchant",
    description: "Exclui uma fonte de dados e exige confirmacao destrutiva.",
    inputSchema: { name: z.string(), confirmWrite: z.literal("CONFIRM_GOOGLE_MERCHANT_DELETE") }
  }, async ({ name }) => textResult(await requireMerchant(merchant).deleteDataSource(name)));

  server.registerTool("merchant_search_reports", {
    title: "Consultar relatorios Merchant",
    description: "Executa consulta SELECT na Merchant Reports API.",
    inputSchema: { query: z.string().min(1).max(12_000), merchantAccountId: z.string().optional(), pageSize: z.number().int().min(1).max(1000).default(100), pageToken: z.string().optional() }
  }, async ({ query, merchantAccountId, pageSize, pageToken }) => textResult(await requireMerchant(merchant).searchReports(query, merchantAccountId, pageSize, pageToken)));

  server.registerResource(
    "install-info",
    "google-ads-mcp://install-info",
    {
      title: "Informacoes de instalacao",
      description: "Resumo de instalacao do MCP Google Ads com leitura e escrita controlada.",
      mimeType: "application/json"
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(
            {
              service: "google-ads-mcp",
              mode: "read-write-controlled",
              localUrl: metadata.localUrl,
              publicUrl: metadata.publicUrl,
              apiVersion: metadata.apiVersion
            },
            null,
            2
          )
        }
      ]
    })
  );

  return server;
}

function requireMerchant(merchant?: MerchantClient): MerchantClient {
  if (!merchant) throw new Error("Merchant Center nao configurado neste ambiente.");
  return merchant;
}

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}
