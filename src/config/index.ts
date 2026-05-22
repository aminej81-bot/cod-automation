// dotenv is loaded once at process entry in src/server.ts via `import 'dotenv/config'`

export const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  timezone: process.env.TZ ?? 'Africa/Casablanca',

  shopify: {
    shopDomain: process.env.SHOPIFY_SHOP_DOMAIN ?? '',
    accessToken: process.env.SHOPIFY_ACCESS_TOKEN ?? '',
    webhookSecret: process.env.SHOPIFY_WEBHOOK_SECRET ?? '',
  },

  whatsapp: {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? '',
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ?? '',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? '',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? '',
    apiVersion: 'v19.0',
  },

  myWhatsapp: process.env.MY_WHATSAPP_NUMBER ?? '',

  googleSheets: {
    sheetId: process.env.GOOGLE_SHEETS_ID ?? '',
    serviceAccountKeyPath: process.env.GOOGLE_SERVICE_ACCOUNT_KEY ?? '',
    sheetName: 'Commandes',
  },

  ozon: {
    apiUrl: process.env.OZON_API_URL ?? 'https://api.ozonexpress.com/v1',
    apiKey: process.env.OZON_API_KEY ?? '',
    apiSecret: process.env.OZON_API_SECRET ?? '',
  },

  claude: {
    apiKey: process.env.CLAUDE_API_KEY ?? '',
    model: process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6',
    maxTokens: 512,
  },

  reminders: {
    times: [
      process.env.REMINDER_TIME_1 ?? '10:00',
      process.env.REMINDER_TIME_2 ?? '14:00',
      process.env.REMINDER_TIME_3 ?? '20:00',
    ],
  },

  clientNotifyStartHour: parseInt(process.env.CLIENT_NOTIFY_START_HOUR ?? '9', 10),
  clientNotifyEndHour: parseInt(process.env.CLIENT_NOTIFY_END_HOUR ?? '20', 10),

  internalWebhookSecret: process.env.INTERNAL_WEBHOOK_SECRET ?? '',
} as const;
