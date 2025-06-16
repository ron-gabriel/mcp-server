#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { config, validateConfig } from './config.js';
import { EmailService } from './services/emailService.js';
import { WebhookService } from './services/webhookService.js';
import { SubscriptionManager } from './services/subscriptionManager.js';
import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import { MCPError, MCPErrorCode, createMCPError } from './errors.js';

let emailService: EmailService;
let webhookService: WebhookService | null = null;
let subscriptionManager: SubscriptionManager | null = null;

async function initializeServices() {
  try {
    validateConfig();
    
    // Initialize email service
    emailService = new EmailService(
      config.azure.tenantId,
      config.azure.clientId,
      config.azure.clientSecret,
      config.email.userEmail,
      config.email.folderName
    );

    // Initialize webhook service if enabled
    if (config.webhook.enabled) {
      console.log('Webhook mode enabled, starting webhook server...');
      
      webhookService = new WebhookService(emailService, {
        port: config.webhook.port,
        notificationUrl: config.webhook.publicUrl,
        clientState: config.webhook.clientState,
        llmWebhookUrl: config.webhook.llmWebhookUrl,
      });

      await webhookService.start();

      // Initialize Graph client for subscription management
      const credential = new ClientSecretCredential(
        config.azure.tenantId,
        config.azure.clientId,
        config.azure.clientSecret
      );

      const authProvider = new TokenCredentialAuthenticationProvider(credential, {
        scopes: ['https://graph.microsoft.com/.default'],
      });

      const graphClient = Client.initWithMiddleware({
        authProvider,
      });

      // Create subscription manager
      subscriptionManager = new SubscriptionManager(graphClient);
      
      // Create email subscription
      const subscription = await subscriptionManager.createEmailSubscription(
        `${config.webhook.publicUrl}/webhook`,
        config.webhook.clientState
      );
      
      console.log('Email subscription created:', subscription.id);
      
      // Start auto-renewal
      await subscriptionManager.startAutoRenewal();
    }
  } catch (error) {
    console.error('Service initialization error:', error);
    throw createMCPError(
      MCPErrorCode.INTERNAL_ERROR,
      'Failed to initialize services',
      { originalError: error instanceof Error ? error.message : String(error) }
    );
  }
}

// Initialize services will be called in main()

const server = new Server(
  {
    name: 'collections-email-server',
    version: '1.0.0',
    description: 'MCP server for managing email collections via Microsoft Graph API',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Error handler for the server
server.onerror = (error) => {
  console.error('[MCP Server Error]', error);
  if (error instanceof MCPError) {
    console.error('Error Code:', error.code);
    console.error('Error Data:', error.data);
  }
};

// ... rest of the MCP server code (same as index.ts) ...

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools: any[] = [
    {
      name: 'get_unread_emails',
      description: 'Get unread emails from the collections inbox',
      inputSchema: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Maximum number of emails to retrieve',
            default: 10,
          },
        },
      },
    },
    {
      name: 'get_email_content',
      description: 'Get full content of a specific email by ID',
      inputSchema: {
        type: 'object',
        properties: {
          emailId: {
            type: 'string',
            description: 'The ID of the email to retrieve',
          },
          format: {
            type: 'string',
            enum: ['html', 'text'],
            description: 'Format to return the email body in',
            default: 'text',
          },
        },
        required: ['emailId'],
      },
    },
    {
      name: 'search_emails',
      description: 'Search for emails containing specific text',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query text',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results',
            default: 10,
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'get_email_conversation',
      description: 'Get all emails in a conversation thread',
      inputSchema: {
        type: 'object',
        properties: {
          conversationId: {
            type: 'string',
            description: 'The conversation ID',
          },
        },
        required: ['conversationId'],
      },
    },
    {
      name: 'send_to_api',
      description: 'Send data to the collections API endpoint',
      inputSchema: {
        type: 'object',
        properties: {
          data: {
            type: 'object',
            description: 'The data payload to send',
          },
          endpoint: {
            type: 'string',
            description: 'API endpoint URL (optional, uses config if not provided)',
          },
        },
        required: ['data'],
      },
    },
    {
      name: 'mark_email_processed',
      description: 'Mark an email as read/processed',
      inputSchema: {
        type: 'object',
        properties: {
          emailId: {
            type: 'string',
            description: 'The ID of the email to mark as processed',
          },
        },
        required: ['emailId'],
      },
    },
  ];

  // Add webhook management tools if enabled
  if (config.webhook.enabled) {
    tools.push({
      name: 'list_subscriptions',
      description: 'List all active Graph API subscriptions',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    });
  }

  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'get_unread_emails': {
      const { limit = 10 } = args as { limit?: number };
      
      // Validate parameters
      if (limit !== undefined && typeof limit !== 'number') {
        throw createMCPError(
          MCPErrorCode.INVALID_PARAMS,
          'Parameter "limit" must be a number',
          { limit, type: typeof limit }
        );
      }
      if (limit < 1 || limit > 100) {
        throw createMCPError(
          MCPErrorCode.INVALID_PARAMS,
          'Parameter "limit" must be between 1 and 100',
          { limit }
        );
      }
      
      try {
        const emails = await emailService.getUnreadEmails(limit);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(emails, null, 2),
            },
          ],
        };
      } catch (error) {
        throw createMCPError(
          MCPErrorCode.EMAIL_SERVICE_ERROR,
          `Failed to fetch unread emails: ${error instanceof Error ? error.message : 'Unknown error'}`,
          { limit, originalError: error instanceof Error ? error.message : String(error) }
        );
      }
    }

    case 'get_email_content': {
      const { emailId, format = 'text' } = args as { emailId: string; format?: 'html' | 'text' };
      
      // Validate parameters
      if (typeof emailId !== 'string' || !emailId.trim()) {
        throw createMCPError(
          MCPErrorCode.INVALID_PARAMS,
          'Parameter "emailId" must be a non-empty string',
          { emailId, type: typeof emailId }
        );
      }
      if (format !== undefined && !['html', 'text'].includes(format)) {
        throw createMCPError(
          MCPErrorCode.INVALID_PARAMS,
          'Parameter "format" must be either "html" or "text"',
          { format }
        );
      }
      
      try {
        const email = await emailService.getEmailById(emailId);
        
        const content = format === 'text' && email.body.contentType === 'html'
          ? emailService.extractPlainText(email.body.content)
          : email.body.content;
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                id: email.id,
                from: email.from,
                fromName: email.fromName,
                subject: email.subject,
                receivedDateTime: email.receivedDateTime,
                conversationId: email.conversationId,
                body: content,
                bodyType: format,
                hasAttachments: email.hasAttachments,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        if (error instanceof Error && error.message.includes('404')) {
          throw createMCPError(
            MCPErrorCode.EMAIL_NOT_FOUND,
            `Email with ID '${emailId}' not found`,
            { emailId }
          );
        }
        throw createMCPError(
          MCPErrorCode.EMAIL_SERVICE_ERROR,
          `Failed to fetch email: ${error instanceof Error ? error.message : 'Unknown error'}`,
          { emailId, originalError: error instanceof Error ? error.message : String(error) }
        );
      }
    }

    case 'search_emails': {
      const { query, limit = 10 } = args as { query: string; limit?: number };
      
      // Validate parameters
      if (typeof query !== 'string' || !query.trim()) {
        throw createMCPError(
          MCPErrorCode.INVALID_PARAMS,
          'Parameter "query" must be a non-empty string',
          { query, type: typeof query }
        );
      }
      if (query.length > 500) {
        throw createMCPError(
          MCPErrorCode.INVALID_PARAMS,
          'Parameter "query" is too long (max 500 characters)',
          { queryLength: query.length }
        );
      }
      if (limit !== undefined && typeof limit !== 'number') {
        throw createMCPError(
          MCPErrorCode.INVALID_PARAMS,
          'Parameter "limit" must be a number',
          { limit, type: typeof limit }
        );
      }
      if (limit < 1 || limit > 100) {
        throw createMCPError(
          MCPErrorCode.INVALID_PARAMS,
          'Parameter "limit" must be between 1 and 100',
          { limit }
        );
      }
      
      try {
        const emails = await emailService.searchEmails(query, limit);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(emails, null, 2),
            },
          ],
        };
      } catch (error) {
        throw createMCPError(
          MCPErrorCode.EMAIL_SERVICE_ERROR,
          `Failed to search emails: ${error instanceof Error ? error.message : 'Unknown error'}`,
          { query, limit, originalError: error instanceof Error ? error.message : String(error) }
        );
      }
    }

    case 'get_email_conversation': {
      const { conversationId } = args as { conversationId: string };
      
      // Validate parameters
      if (typeof conversationId !== 'string' || !conversationId.trim()) {
        throw createMCPError(
          MCPErrorCode.INVALID_PARAMS,
          'Parameter "conversationId" must be a non-empty string',
          { conversationId, type: typeof conversationId }
        );
      }
      
      try {
        const emails = await emailService.getConversationEmails(conversationId);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(emails, null, 2),
            },
          ],
        };
      } catch (error) {
        throw createMCPError(
          MCPErrorCode.EMAIL_SERVICE_ERROR,
          `Failed to fetch conversation: ${error instanceof Error ? error.message : 'Unknown error'}`,
          { conversationId, originalError: error instanceof Error ? error.message : String(error) }
        );
      }
    }

    case 'send_to_api': {
      const { data, endpoint } = args as { data: any; endpoint?: string };
      
      // Validate parameters
      if (data === null || data === undefined) {
        throw createMCPError(
          MCPErrorCode.INVALID_PARAMS,
          'Parameter "data" is required',
          { data }
        );
      }
      if (typeof data !== 'object') {
        throw createMCPError(
          MCPErrorCode.INVALID_PARAMS,
          'Parameter "data" must be an object',
          { data, type: typeof data }
        );
      }
      if (endpoint !== undefined && typeof endpoint !== 'string') {
        throw createMCPError(
          MCPErrorCode.INVALID_PARAMS,
          'Parameter "endpoint" must be a string',
          { endpoint, type: typeof endpoint }
        );
      }
      if (endpoint) {
        try {
          new URL(endpoint);
        } catch {
          throw createMCPError(
            MCPErrorCode.INVALID_PARAMS,
            'Parameter "endpoint" must be a valid URL',
            { endpoint }
          );
        }
      }
      
      const apiEndpoint = endpoint || config.api.endpoint;
      
      if (!apiEndpoint) {
        throw createMCPError(
          MCPErrorCode.INVALID_PARAMS,
          'No API endpoint configured or provided',
          { providedEndpoint: endpoint, configuredEndpoint: config.api.endpoint }
        );
      }

      try {
        const response = await fetch(apiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'MCP-Collections-Email-Server/1.0.0',
            ...(config.api.apiKey && { 'Authorization': `Bearer ${config.api.apiKey}` }),
          },
          body: JSON.stringify(data),
        });

        const responseData = await response.text();
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                status: response.status,
                statusText: response.statusText,
                body: responseData,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        throw createMCPError(
          MCPErrorCode.INTERNAL_ERROR,
          `Failed to send data to API: ${error instanceof Error ? error.message : 'Unknown error'}`,
          { endpoint: apiEndpoint, originalError: error instanceof Error ? error.message : String(error) }
        );
      }
    }

    case 'mark_email_processed': {
      const { emailId } = args as { emailId: string };
      
      // Validate parameters
      if (typeof emailId !== 'string' || !emailId.trim()) {
        throw createMCPError(
          MCPErrorCode.INVALID_PARAMS,
          'Parameter "emailId" must be a non-empty string',
          { emailId, type: typeof emailId }
        );
      }
      
      try {
        await emailService.markAsRead(emailId);
        return {
          content: [
            {
              type: 'text',
              text: `Successfully marked email ${emailId} as processed`,
            },
          ],
        };
      } catch (error) {
        throw createMCPError(
          MCPErrorCode.EMAIL_SERVICE_ERROR,
          `Failed to mark email as processed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          { emailId, originalError: error instanceof Error ? error.message : String(error) }
        );
      }
    }

    case 'list_subscriptions': {
      if (!subscriptionManager) {
        throw createMCPError(
          MCPErrorCode.WEBHOOK_NOT_ENABLED,
          'Webhook mode is not enabled',
          { webhookEnabled: config.webhook.enabled }
        );
      }

      try {
        const subscriptions = await subscriptionManager.listSubscriptions();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(subscriptions, null, 2),
            },
          ],
        };
      } catch (error) {
        throw createMCPError(
          MCPErrorCode.WEBHOOK_ERROR,
          `Failed to list subscriptions: ${error instanceof Error ? error.message : 'Unknown error'}`,
          { originalError: error instanceof Error ? error.message : String(error) }
        );
      }
    }

    default:
      throw createMCPError(
        MCPErrorCode.METHOD_NOT_FOUND,
        `Unknown tool: ${name}`,
        { toolName: name }
      );
  }
});

async function main() {
  // Initialize services first
  await initializeServices();
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  const mode = config.webhook.enabled ? 'webhook' : 'manual';
  console.error(`MCP Collections Email Server v1.0.0`);
  console.error(`Running on stdio transport (${mode} mode)`);
  console.error(`Server capabilities: tools`);
  
  if (config.webhook.enabled) {
    console.error(`Webhook server listening on port ${config.webhook.port}`);
    console.error(`Webhook endpoint: ${config.webhook.publicUrl}/webhook`);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  
  try {
    if (webhookService) {
      console.log('Stopping webhook service...');
      webhookService.stop();
    }
    
    if (subscriptionManager) {
      console.log('Cleaning up subscriptions...');
      await subscriptionManager.cleanup();
    }
    
    console.log('Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  console.log('\nReceived SIGTERM, shutting down...');
  process.emit('SIGINT');
});

main().catch((error) => {
  console.error('Fatal server error:', error);
  if (error instanceof MCPError) {
    console.error('MCP Error Code:', error.code);
    console.error('MCP Error Data:', error.data);
  }
  process.exit(1);
});