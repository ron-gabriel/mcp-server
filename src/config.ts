import dotenv from 'dotenv';

dotenv.config();

export const config = {
  azure: {
    clientId: process.env.AZURE_CLIENT_ID || '',
    clientSecret: process.env.AZURE_CLIENT_SECRET || '',
    tenantId: process.env.AZURE_TENANT_ID || '',
  },
  email: {
    userEmail: process.env.OUTLOOK_USER_EMAIL || '',
    folderName: process.env.OUTLOOK_FOLDER_NAME || 'Inbox',
  },
  api: {
    endpoint: process.env.API_ENDPOINT || '',
    apiKey: process.env.API_KEY || '',
  },
  webhook: {
    enabled: process.env.WEBHOOK_ENABLED === 'true',
    port: parseInt(process.env.WEBHOOK_PORT || '80', 10),
    publicUrl: process.env.WEBHOOK_PUBLIC_URL || '',
    clientState: process.env.WEBHOOK_CLIENT_STATE || '',
    llmWebhookUrl: process.env.LLM_WEBHOOK_URL || '',
  },
};

export function validateConfig(): void {
  const required = [
    'AZURE_CLIENT_ID',
    'AZURE_CLIENT_SECRET', 
    'AZURE_TENANT_ID',
    'OUTLOOK_USER_EMAIL',
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  // Additional validation for webhook config
  if (config.webhook.enabled) {
    if (!config.webhook.publicUrl || !config.webhook.clientState) {
      throw new Error('WEBHOOK_PUBLIC_URL and WEBHOOK_CLIENT_STATE are required when WEBHOOK_ENABLED is true');
    }
  }
}