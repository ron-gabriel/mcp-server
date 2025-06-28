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

import { MCPError, MCPErrorCode } from './errors';

export function validateConfig(): void {
  const required = [
    'AZURE_CLIENT_ID',
    'AZURE_CLIENT_SECRET', 
    'AZURE_TENANT_ID',
    'OUTLOOK_USER_EMAIL',
    'OUTLOOK_FOLDER_NAME',
  ];

  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new MCPError(
      MCPErrorCode.INVALID_PARAMS,
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (process.env.OUTLOOK_USER_EMAIL && !emailRegex.test(process.env.OUTLOOK_USER_EMAIL)) {
    throw new MCPError(
      MCPErrorCode.INVALID_PARAMS,
      'OUTLOOK_USER_EMAIL must be a valid email address'
    );
  }

  if (process.env.OUTLOOK_FOLDER_NAME !== undefined && process.env.OUTLOOK_FOLDER_NAME.trim() === '') {
    throw new MCPError(
      MCPErrorCode.INVALID_PARAMS,
      'OUTLOOK_FOLDER_NAME cannot be empty'
    );
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (process.env.AZURE_CLIENT_ID && !uuidRegex.test(process.env.AZURE_CLIENT_ID)) {
    throw new MCPError(
      MCPErrorCode.INVALID_PARAMS,
      'AZURE_CLIENT_ID must be a valid UUID'
    );
  }
  if (process.env.AZURE_TENANT_ID && !uuidRegex.test(process.env.AZURE_TENANT_ID)) {
    throw new MCPError(
      MCPErrorCode.INVALID_PARAMS,
      'AZURE_TENANT_ID must be a valid UUID'
    );
  }

  // Additional validation for webhook config
  if (process.env.WEBHOOK_ENABLED === 'true') {
    if (!process.env.WEBHOOK_PORT) {
      throw new MCPError(
        MCPErrorCode.WEBHOOK_NOT_ENABLED,
        'WEBHOOK_PORT is required when WEBHOOK_ENABLED is true'
      );
    }
    if (!process.env.WEBHOOK_PUBLIC_URL) {
      throw new MCPError(
        MCPErrorCode.WEBHOOK_NOT_ENABLED,
        'WEBHOOK_PUBLIC_URL is required when WEBHOOK_ENABLED is true'
      );
    }
    if (!process.env.WEBHOOK_CLIENT_STATE) {
      throw new MCPError(
        MCPErrorCode.WEBHOOK_NOT_ENABLED,
        'WEBHOOK_CLIENT_STATE is required when WEBHOOK_ENABLED is true'
      );
    }
    
    const port = parseInt(process.env.WEBHOOK_PORT);
    if (isNaN(port) || port <= 0 || port > 65535) {
      throw new MCPError(
        MCPErrorCode.INVALID_PARAMS,
        'WEBHOOK_PORT must be a valid port number (1-65535)'
      );
    }
    
    const urlRegex = /^https?:\/\/.+/;
    if (!urlRegex.test(process.env.WEBHOOK_PUBLIC_URL)) {
      throw new MCPError(
        MCPErrorCode.INVALID_PARAMS,
        'WEBHOOK_PUBLIC_URL must be a valid HTTP/HTTPS URL'
      );
    }
    
  }
  
  if (process.env.WEBHOOK_LLM_WEBHOOK_URL) {
    const urlRegex = /^https?:\/\/.+/;
    if (!urlRegex.test(process.env.WEBHOOK_LLM_WEBHOOK_URL)) {
      throw new MCPError(
        MCPErrorCode.INVALID_PARAMS,
        'WEBHOOK_LLM_WEBHOOK_URL must be a valid HTTP/HTTPS URL'
      );
    }
  }
}
