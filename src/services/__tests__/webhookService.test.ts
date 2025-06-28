import { jest } from '@jest/globals';
import request from 'supertest';
import { WebhookService, GraphNotification, WebhookConfig } from '../webhookService';
import { EmailService } from '../emailService';
import { MCPError, MCPErrorCode } from '../../errors';

jest.mock('../emailService');
jest.mock('../../config', () => ({
  config: {
    api: {
      apiKey: 'test-api-key'
    },
    email: {
      userEmail: 'test@example.com',
      folderName: 'Inbox'
    }
  }
}));

const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

describe('WebhookService', () => {
  let webhookService: WebhookService;
  let mockEmailService: jest.Mocked<EmailService>;
  let webhookConfig: WebhookConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockClear();

    mockEmailService = {
      getEmailById: jest.fn(),
      extractPlainText: jest.fn(),
    } as any;

    webhookConfig = {
      port: 3000,
      notificationUrl: 'https://example.com',
      clientState: 'test-client-state',
      llmWebhookUrl: 'https://llm.example.com/webhook'
    };

    webhookService = new WebhookService(mockEmailService, webhookConfig);
  });

  afterEach(async () => {
    if (webhookService) {
      webhookService.stop();
    }
  });

  describe('Constructor and Setup', () => {
    it('should initialize with correct config and email service', () => {
      expect(webhookService).toBeInstanceOf(WebhookService);
    });

    it('should setup Express middleware correctly', () => {
      expect(webhookService).toBeDefined();
    });
  });

  describe('Server Lifecycle', () => {
    it('should start server on configured port', async () => {
      const startPromise = webhookService.start();
      await expect(startPromise).resolves.toBeUndefined();
    });

    it('should stop server gracefully', async () => {
      await webhookService.start();
      expect(() => webhookService.stop()).not.toThrow();
    });
  });

  describe('Health Endpoint', () => {
    it('should respond to health check with status ok', async () => {
      await webhookService.start();
      
      const response = await request(webhookService['app'])
        .get('/health')
        .expect(200);

      expect(response.body).toEqual({
        status: 'ok',
        timestamp: expect.any(String)
      });
    });
  });

  describe('Webhook Validation', () => {
    it('should handle validation token correctly', async () => {
      await webhookService.start();
      
      const validationToken = 'test-validation-token';
      const response = await request(webhookService['app'])
        .post('/webhook')
        .query({ validationToken })
        .expect(200);

      expect(response.text).toBe(validationToken);
      expect(response.headers['content-type']).toContain('text/plain');
    });

    it('should validate client state in notifications', async () => {
      await webhookService.start();
      
      const notification: GraphNotification = {
        value: [{
          subscriptionId: 'test-sub-id',
          subscriptionExpirationDateTime: '2024-01-01T00:00:00Z',
          changeType: 'created',
          resource: 'test-resource',
          clientState: 'invalid-client-state',
          resourceData: {
            '@odata.type': 'test-type',
            '@odata.id': 'test-id',
            '@odata.etag': 'test-etag',
            id: 'test-email-id'
          }
        }]
      };

      const response = await request(webhookService['app'])
        .post('/webhook')
        .send(notification)
        .expect(400);

      expect(response.text).toBe('Invalid client state');
    });

    it('should accept notifications with valid client state', async () => {
      await webhookService.start();
      
      const mockEmail = {
        id: 'test-email-id',
        from: 'sender@example.com',
        fromName: 'Test Sender',
        subject: 'Test Subject',
        receivedDateTime: '2024-01-01T00:00:00Z',
        conversationId: 'test-conversation-id',
        bodyPreview: 'Test content preview',
        body: { content: 'Test content', contentType: 'text' },
        hasAttachments: false
      };

      mockEmailService.getEmailById.mockResolvedValue(mockEmail);
      mockEmailService.extractPlainText.mockReturnValue('Test content');
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK'
      } as Response);

      const notification: GraphNotification = {
        value: [{
          subscriptionId: 'test-sub-id',
          subscriptionExpirationDateTime: '2024-01-01T00:00:00Z',
          changeType: 'created',
          resource: 'test-resource',
          clientState: 'test-client-state',
          resourceData: {
            '@odata.type': 'test-type',
            '@odata.id': 'test-id',
            '@odata.etag': 'test-etag',
            id: 'test-email-id'
          }
        }]
      };

      await request(webhookService['app'])
        .post('/webhook')
        .send(notification)
        .expect(202);

      expect(mockEmailService.getEmailById).toHaveBeenCalledWith('test-email-id');
    });
  });

  describe('Email Processing', () => {
    it('should process new email correctly', async () => {
      await webhookService.start();
      
      const mockEmail = {
        id: 'test-email-id',
        from: 'sender@example.com',
        fromName: 'Test Sender',
        subject: 'Test Subject',
        receivedDateTime: '2024-01-01T00:00:00Z',
        conversationId: 'test-conversation-id',
        bodyPreview: 'Test HTML content preview',
        body: { content: '<p>Test HTML content</p>', contentType: 'html' },
        hasAttachments: false
      };

      mockEmailService.getEmailById.mockResolvedValue(mockEmail);
      mockEmailService.extractPlainText.mockReturnValue('Test HTML content');
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK'
      } as Response);

      const notification: GraphNotification = {
        value: [{
          subscriptionId: 'test-sub-id',
          subscriptionExpirationDateTime: '2024-01-01T00:00:00Z',
          changeType: 'created',
          resource: 'test-resource',
          clientState: 'test-client-state',
          resourceData: {
            '@odata.type': 'test-type',
            '@odata.id': 'test-id',
            '@odata.etag': 'test-etag',
            id: 'test-email-id'
          }
        }]
      };

      await request(webhookService['app'])
        .post('/webhook')
        .send(notification)
        .expect(202);

      expect(mockEmailService.getEmailById).toHaveBeenCalledWith('test-email-id');
      expect(mockEmailService.extractPlainText).toHaveBeenCalledWith('<p>Test HTML content</p>');
    });

    it('should handle email processing deduplication', async () => {
      await webhookService.start();
      
      const mockEmail = {
        id: 'test-email-id',
        from: 'sender@example.com',
        fromName: 'Test Sender',
        subject: 'Test Subject',
        receivedDateTime: '2024-01-01T00:00:00Z',
        conversationId: 'test-conversation-id',
        bodyPreview: 'Test content preview',
        body: { content: 'Test content', contentType: 'text' },
        hasAttachments: false
      };

      mockEmailService.getEmailById.mockResolvedValue(mockEmail);
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK'
      } as Response);

      const notification: GraphNotification = {
        value: [{
          subscriptionId: 'test-sub-id',
          subscriptionExpirationDateTime: '2024-01-01T00:00:00Z',
          changeType: 'created',
          resource: 'test-resource',
          clientState: 'test-client-state',
          resourceData: {
            '@odata.type': 'test-type',
            '@odata.id': 'test-id',
            '@odata.etag': 'test-etag',
            id: 'test-email-id'
          }
        }]
      };

      await request(webhookService['app'])
        .post('/webhook')
        .send(notification)
        .expect(202);

      await request(webhookService['app'])
        .post('/webhook')
        .send(notification)
        .expect(202);

      expect(mockEmailService.getEmailById).toHaveBeenCalledTimes(1);
    });

    it('should handle email processing errors gracefully', async () => {
      await webhookService.start();
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockEmailService.getEmailById.mockRejectedValue(new Error('Email service error'));

      const notification: GraphNotification = {
        value: [{
          subscriptionId: 'test-sub-id',
          subscriptionExpirationDateTime: '2024-01-01T00:00:00Z',
          changeType: 'created',
          resource: 'test-resource',
          clientState: 'test-client-state',
          resourceData: {
            '@odata.type': 'test-type',
            '@odata.id': 'test-id',
            '@odata.etag': 'test-etag',
            id: 'test-email-id'
          }
        }]
      };

      await request(webhookService['app'])
        .post('/webhook')
        .send(notification)
        .expect(202);
        
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to process email'), expect.any(Error));
      consoleSpy.mockRestore();
    });
  });

  describe('LLM Webhook Forwarding', () => {
    it('should forward email data to LLM webhook when configured', async () => {
      await webhookService.start();
      
      const mockEmail = {
        id: 'test-email-id',
        from: 'sender@example.com',
        fromName: 'Test Sender',
        subject: 'Test Subject',
        receivedDateTime: '2024-01-01T00:00:00Z',
        conversationId: 'test-conversation-id',
        bodyPreview: 'Test content preview',
        body: { content: 'Test content', contentType: 'text' },
        hasAttachments: false
      };

      mockEmailService.getEmailById.mockResolvedValue(mockEmail);
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK'
      } as Response);

      const notification: GraphNotification = {
        value: [{
          subscriptionId: 'test-sub-id',
          subscriptionExpirationDateTime: '2024-01-01T00:00:00Z',
          changeType: 'created',
          resource: 'test-resource',
          clientState: 'test-client-state',
          resourceData: {
            '@odata.type': 'test-type',
            '@odata.id': 'test-id',
            '@odata.etag': 'test-etag',
            id: 'test-email-id'
          }
        }]
      };

      await request(webhookService['app'])
        .post('/webhook')
        .send(notification)
        .expect(202);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://llm.example.com/webhook',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-api-key'
          }),
          body: expect.stringContaining('new_customer_response')
        })
      );
    });

    it('should handle LLM webhook failures gracefully', async () => {
      await webhookService.start();
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const mockEmail = {
        id: 'test-email-id',
        from: 'sender@example.com',
        fromName: 'Test Sender',
        subject: 'Test Subject',
        receivedDateTime: '2024-01-01T00:00:00Z',
        conversationId: 'test-conversation-id',
        bodyPreview: 'Test content preview',
        body: { content: 'Test content', contentType: 'text' },
        hasAttachments: false
      };

      mockEmailService.getEmailById.mockResolvedValue(mockEmail);
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      } as Response);

      const notification: GraphNotification = {
        value: [{
          subscriptionId: 'test-sub-id',
          subscriptionExpirationDateTime: '2024-01-01T00:00:00Z',
          changeType: 'created',
          resource: 'test-resource',
          clientState: 'test-client-state',
          resourceData: {
            '@odata.type': 'test-type',
            '@odata.id': 'test-id',
            '@odata.etag': 'test-etag',
            id: 'test-email-id'
          }
        }]
      };

      await request(webhookService['app'])
        .post('/webhook')
        .send(notification)
        .expect(202);
        
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to process email'), expect.any(Error));
      consoleSpy.mockRestore();
    });

    it('should skip LLM forwarding when not configured', async () => {
      const configWithoutLLM = {
        ...webhookConfig,
        llmWebhookUrl: undefined
      };
      
      const serviceWithoutLLM = new WebhookService(mockEmailService, configWithoutLLM);
      await serviceWithoutLLM.start();
      
      const mockEmail = {
        id: 'test-email-id',
        from: 'sender@example.com',
        fromName: 'Test Sender',
        subject: 'Test Subject',
        receivedDateTime: '2024-01-01T00:00:00Z',
        conversationId: 'test-conversation-id',
        bodyPreview: 'Test content preview',
        body: { content: 'Test content', contentType: 'text' },
        hasAttachments: false
      };

      mockEmailService.getEmailById.mockResolvedValue(mockEmail);

      const notification: GraphNotification = {
        value: [{
          subscriptionId: 'test-sub-id',
          subscriptionExpirationDateTime: '2024-01-01T00:00:00Z',
          changeType: 'created',
          resource: 'test-resource',
          clientState: 'test-client-state',
          resourceData: {
            '@odata.type': 'test-type',
            '@odata.id': 'test-id',
            '@odata.etag': 'test-etag',
            id: 'test-email-id'
          }
        }]
      };

      await request(serviceWithoutLLM['app'])
        .post('/webhook')
        .send(notification)
        .expect(202);

      expect(mockFetch).not.toHaveBeenCalled();
      
      serviceWithoutLLM.stop();
    });
  });

  describe('Manual Email Processing Endpoint', () => {
    it('should process email manually via endpoint', async () => {
      await webhookService.start();
      
      const mockEmail = {
        id: 'test-email-id',
        from: 'sender@example.com',
        fromName: 'Test Sender',
        subject: 'Test Subject',
        receivedDateTime: '2024-01-01T00:00:00Z',
        conversationId: 'test-conversation-id',
        bodyPreview: 'Test content preview',
        body: { content: 'Test content', contentType: 'text' },
        hasAttachments: false
      };

      mockEmailService.getEmailById.mockResolvedValue(mockEmail);
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK'
      } as Response);

      const response = await request(webhookService['app'])
        .post('/process-email/test-email-id')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        emailId: 'test-email-id'
      });

      expect(mockEmailService.getEmailById).toHaveBeenCalledWith('test-email-id');
    });

    it('should handle manual processing errors', async () => {
      await webhookService.start();
      
      mockEmailService.getEmailById.mockRejectedValue(new Error('Email not found'));

      const response = await request(webhookService['app'])
        .post('/process-email/invalid-id')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Email not found'
      });
    });
  });

  describe('Subscription Creation', () => {
    it('should create email subscription with correct parameters', async () => {
      const subscription = await webhookService.createEmailSubscription();

      expect(subscription).toEqual(expect.objectContaining({
        changeType: 'created',
        notificationUrl: 'https://example.com/webhook',
        resource: '/users/test@example.com/mailFolders/Inbox/messages',
        clientState: 'test-client-state',
        expirationDateTime: expect.any(String)
      }));
    });

    it('should handle subscription creation errors', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      const originalConfig = jest.requireActual('../../config.js') as any;
      jest.doMock('../../config.js', () => ({
        config: { ...originalConfig.config, email: undefined }
      }));
      
      const { WebhookService: MockedWebhookService } = await import('../webhookService.js');
      
      const invalidService = new MockedWebhookService(mockEmailService, {
        ...webhookConfig,
        notificationUrl: ''
      });

      const result = await invalidService.createEmailSubscription();
      expect(result).toBeDefined();
      expect(result.changeType).toBe('created');
      
      consoleSpy.mockRestore();
      jest.dontMock('../../config.js');
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON in webhook notifications', async () => {
      await webhookService.start();
      
      const response = await request(webhookService['app'])
        .post('/webhook')
        .set('Content-Type', 'text/plain')
        .send('invalid json')
        .expect(500);

      expect(response.text).toBe('Internal server error');
    });

    it('should handle notifications without value array', async () => {
      await webhookService.start();
      
      const invalidNotification = { invalid: 'structure' };

      await request(webhookService['app'])
        .post('/webhook')
        .send(invalidNotification)
        .expect(202);
    });

    it('should handle notifications with non-created change types', async () => {
      await webhookService.start();
      
      const notification: GraphNotification = {
        value: [{
          subscriptionId: 'test-sub-id',
          subscriptionExpirationDateTime: '2024-01-01T00:00:00Z',
          changeType: 'updated',
          resource: 'test-resource',
          clientState: 'test-client-state',
          resourceData: {
            '@odata.type': 'test-type',
            '@odata.id': 'test-id',
            '@odata.etag': 'test-etag',
            id: 'test-email-id'
          }
        }]
      };

      await request(webhookService['app'])
        .post('/webhook')
        .send(notification)
        .expect(202);

      expect(mockEmailService.getEmailById).not.toHaveBeenCalled();
    });
  });
});
