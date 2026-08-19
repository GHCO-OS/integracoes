import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GoogleAdsClient } from "./googleAdsClient.js";

type McpMetadata = {
  localUrl?: string;
  publicUrl?: string;
  apiVersion: string;
};

export function createGoogleAdsMcpServer(googleAds: GoogleAdsClient, metadata: McpMetadata): McpServer {
  const server = new McpServer({
    name: "cuiabar-google-ads-readonly",
    version: "0.1.0"
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

  server.registerResource(
    "install-info",
    "google-ads-mcp://install-info",
    {
      title: "Informacoes de instalacao",
      description: "Resumo de instalacao do MCP Google Ads read-only.",
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
              mode: "read-only",
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
