import express, { Request, Response } from 'express';
import { EmailService } from './emailService.js';
import { config } from '../config.js';
import crypto from 'crypto';

export interface GraphNotification {
  value: Array<{
    subscriptionId: string;
    subscriptionExpirationDateTime: string;
    changeType: string;
    resource: string;
    resourceData?: {
      '@odata.type': string;
      '@odata.id': string;
      '@odata.etag': string;
      id: string;
    };
    clientState?: string;
    encryptedContent?: {
      data: string;
      dataSignature: string;
      dataKey: string;
      encryptionCertificateId: string;
      encryptionCertificateThumbprint: string;
    };
  }>;
}

export interface WebhookConfig {
  port: number;
  notificationUrl: string;
  clientState: string;
  llmWebhookUrl?: string;
}

export class WebhookService {
  private app: express.Application;
  private emailService: EmailService;
  private config: WebhookConfig;
  private server: any;
  private processedEmails: Set<string> = new Set();

  constructor(emailService: EmailService, config: WebhookConfig) {
    this.emailService = emailService;
    this.config = config;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // Parse JSON with text/plain content-type (Graph sends notifications as text/plain)
    this.app.use(express.text({ type: 'text/plain' }));
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Webhook validation endpoint (Graph will call this with validationToken)
    this.app.post('/webhook', async (req: Request, res: Response) => {
      // Handle validation request
      if (req.query.validationToken) {
        console.log('Webhook validation request received');
        res.set('Content-Type', 'text/plain');
        res.send(req.query.validationToken);
        return;
      }

      // Handle notification
      try {
        let notification: GraphNotification;
        
        // Parse the notification (might come as text/plain)
        if (typeof req.body === 'string') {
          notification = JSON.parse(req.body);
        } else {
          notification = req.body;
        }

        console.log('Received webhook notification:', JSON.stringify(notification, null, 2));

        // Validate client state if provided
        if (notification.value?.[0]?.clientState && 
            notification.value[0].clientState !== this.config.clientState) {
          console.error('Invalid client state');
          res.status(400).send('Invalid client state');
          return;
        }

        // Process each notification
        for (const item of notification.value || []) {
          if (item.changeType === 'created' && item.resourceData?.id) {
            await this.processNewEmail(item.resourceData.id);
          }
        }

        // Respond quickly to avoid timeout
        res.status(202).send();
      } catch (error) {
        console.error('Error processing webhook:', error);
        res.status(500).send('Internal server error');
      }
    });

    // Manual trigger endpoint for testing
    this.app.post('/process-email/:emailId', async (req: Request, res: Response) => {
      try {
        const { emailId } = req.params;
        await this.processNewEmail(emailId);
        res.json({ success: true, emailId });
      } catch (error) {
        console.error('Error processing email:', error);
        res.status(500).json({ 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    });
  }

  private async processNewEmail(emailId: string): Promise<void> {
    // Avoid processing the same email multiple times
    if (this.processedEmails.has(emailId)) {
      console.log(`Email ${emailId} already processed, skipping`);
      return;
    }

    this.processedEmails.add(emailId);

    try {
      console.log(`Processing new email: ${emailId}`);
      
      // Fetch the email details
      const email = await this.emailService.getEmailById(emailId);
      
      // Extract plain text if HTML
      const plainTextBody = email.body.contentType === 'html' 
        ? this.emailService.extractPlainText(email.body.content)
        : email.body.content;

      const emailData = {
        id: email.id,
        from: email.from,
        fromName: email.fromName,
        subject: email.subject,
        receivedAt: email.receivedDateTime,
        conversationId: email.conversationId,
        body: plainTextBody,
        hasAttachments: email.hasAttachments
      };

      // If LLM webhook URL is configured, forward to it
      if (this.config.llmWebhookUrl) {
        await this.notifyLLM(emailData);
      } else {
        console.log('New email ready for processing:', emailData);
      }

    } catch (error) {
      console.error(`Failed to process email ${emailId}:`, error);
      // Remove from processed set so it can be retried
      this.processedEmails.delete(emailId);
      throw error;
    }
  }

  private async notifyLLM(emailData: any): Promise<void> {
    if (!this.config.llmWebhookUrl) return;

    try {
      const response = await fetch(this.config.llmWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.api.apiKey && { 'Authorization': `Bearer ${config.api.apiKey}` }),
        },
        body: JSON.stringify({
          type: 'new_customer_response',
          timestamp: new Date().toISOString(),
          email: emailData
        })
      });

      if (!response.ok) {
        throw new Error(`LLM webhook failed: ${response.status} ${response.statusText}`);
      }

      console.log('Successfully notified LLM webhook');
    } catch (error) {
      console.error('Failed to notify LLM webhook:', error);
      throw error;
    }
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.config.port, () => {
        console.log(`Webhook server listening on port ${this.config.port}`);
        console.log(`Webhook endpoint: ${this.config.notificationUrl}/webhook`);
        resolve();
      });
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      console.log('Webhook server stopped');
    }
  }

  // Create a Graph subscription for new emails
  async createEmailSubscription(): Promise<any> {
    try {
      const expirationDateTime = new Date();
      expirationDateTime.setMinutes(expirationDateTime.getMinutes() + 4230); // Max 3 days for mail

      const subscription = {
        changeType: 'created',
        notificationUrl: `${this.config.notificationUrl}/webhook`,
        resource: `/users/${config.email.userEmail}/mailFolders/${config.email.folderName}/messages`,
        expirationDateTime: expirationDateTime.toISOString(),
        clientState: this.config.clientState
      };

      // This would normally be done through the Graph client
      // For now, we'll return the subscription object
      console.log('Subscription to create:', subscription);
      return subscription;
    } catch (error) {
      console.error('Error creating subscription:', error);
      throw error;
    }
  }
}