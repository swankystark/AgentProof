import { z } from "zod"

const envSchema = z.object({
  PAYPAL_ENV: z.string().transform((value) => value.toLowerCase()).pipe(z.literal("sandbox")).default("sandbox"),
  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_CLIENT_SECRET: z.string().optional(),
  PAYPAL_SANDBOX_BUSINESS_EMAIL: z.string().optional(),
  PAYPAL_SANDBOX_BUYER_1_EMAIL: z.string().optional(),
  PAYPAL_SANDBOX_BUYER_1_PASSWORD: z.string().optional(),
  PAYPAL_SANDBOX_BUYER_2_EMAIL: z.string().optional(),
  PAYPAL_SANDBOX_BUYER_2_PASSWORD: z.string().optional(),
  PAYPAL_SANDBOX_BUYER_3_EMAIL: z.string().optional(),
  PAYPAL_SANDBOX_BUYER_3_PASSWORD: z.string().optional(),
  PAYPAL_WEBHOOK_ID: z.string().optional(),
  PAYPAL_NEGATIVE_TESTING: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  RENDER_API_KEY: z.string().optional(),
  AG_STUDIO_LICENSE_KEY: z.string().optional(),
  DATABASE_URL: z.string().default("postgres://agentproof:agentproof@localhost:5433/agentproof"),
  API_PORT: z.coerce.number().int().positive().default(8787),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  DEMO_MODE: z.string().default("true"),
})

export const config = envSchema.parse(process.env)
export const paypalConfigured = Boolean(config.PAYPAL_CLIENT_ID && config.PAYPAL_CLIENT_SECRET)
export const aiConfigured = Boolean(config.GEMINI_API_KEY)
export const databaseConfigured = true
