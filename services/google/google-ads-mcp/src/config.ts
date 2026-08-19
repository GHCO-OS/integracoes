import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  GOOGLE_ADS_CLIENT_ID: z.string().min(1),
  GOOGLE_ADS_CLIENT_SECRET: z.string().min(1),
  GOOGLE_ADS_REFRESH_TOKEN: z.string().min(1),
  GOOGLE_ADS_DEVELOPER_TOKEN: z.string().min(1),
  GOOGLE_ADS_CUSTOMER_ID: z.string().min(1),
  GOOGLE_ADS_LOGIN_CUSTOMER_ID: z.string().optional(),
  GOOGLE_ADS_API_VERSION: z.string().default("v24"),
  MCP_BEARER_TOKEN: z.string().optional(),
  PORT: z.coerce.number().int().positive().default(8788)
});

export const config = envSchema.parse(process.env);
