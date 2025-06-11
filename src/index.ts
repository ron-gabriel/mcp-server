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
    process.exit(1);
  }
}

// Initialize services will be called in main()

const server = new Server(
  {
    name: 'collections-email-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

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
        return {
          content: [
            {
              type: 'text',
              text: `Error fetching emails: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    }

    case 'get_email_content': {
      const { emailId, format = 'text' } = args as { emailId: string; format?: 'html' | 'text' };
      
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
        return {
          content: [
            {
              type: 'text',
              text: `Error fetching email: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    }

    case 'search_emails': {
      const { query, limit = 10 } = args as { query: string; limit?: number };
      
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
        return {
          content: [
            {
              type: 'text',
              text: `Error searching emails: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    }

    case 'get_email_conversation': {
      const { conversationId } = args as { conversationId: string };
      
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
        return {
          content: [
            {
              type: 'text',
              text: `Error fetching conversation: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    }

    case 'send_to_api': {
      const { data, endpoint } = args as { data: any; endpoint?: string };
      const apiEndpoint = endpoint || config.api.endpoint;
      
      if (!apiEndpoint) {
        return {
          content: [
            {
              type: 'text',
              text: 'Error: No API endpoint configured or provided',
            },
          ],
        };
      }

      try {
        const response = await fetch(apiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
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
        return {
          content: [
            {
              type: 'text',
              text: `Error sending to API: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    }

    case 'mark_email_processed': {
      const { emailId } = args as { emailId: string };
      
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
        return {
          content: [
            {
              type: 'text',
              text: `Error marking email: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    }

    case 'list_subscriptions': {
      if (!subscriptionManager) {
        return {
          content: [
            {
              type: 'text',
              text: 'Webhook mode is not enabled',
            },
          ],
        };
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
        return {
          content: [
            {
              type: 'text',
              text: `Error listing subscriptions: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          ],
        };
      }
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

async function main() {
  // Initialize services first
  await initializeServices();
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  const mode = config.webhook.enabled ? 'webhook' : 'manual';
  console.error(`MCP Collections Email Server running on stdio (${mode} mode)`);
  
  if (config.webhook.enabled) {
    console.error(`Webhook server listening on port ${config.webhook.port}`);
    console.error(`Webhook endpoint: ${config.webhook.publicUrl}/webhook`);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  
  if (webhookService) {
    webhookService.stop();
  }
  
  if (subscriptionManager) {
    await subscriptionManager.cleanup();
  }
  
  process.exit(0);
});

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});