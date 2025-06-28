import { jest } from '@jest/globals';
import { SubscriptionManager, Subscription } from '../subscriptionManager';
import { Client } from '@microsoft/microsoft-graph-client';

jest.mock('@microsoft/microsoft-graph-client');

jest.mock('../../config', () => ({
  config: {
    webhook: {
      enabled: true,
      port: 3000,
      publicUrl: 'https://example.com',
      clientState: 'test-client-state',
      llmWebhookUrl: 'https://llm.example.com/webhook'
    },
    email: {
      userEmail: 'test@example.com',
      folderName: 'Inbox'
    }
  }
}));

describe('SubscriptionManager', () => {
  let subscriptionManager: SubscriptionManager;
  let mockGraphClient: jest.Mocked<Client>;
  let mockApiChain: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockApiChain = {
      post: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
      get: jest.fn(),
    };

    mockGraphClient = {
      api: jest.fn().mockReturnValue(mockApiChain),
    } as any;

    subscriptionManager = new SubscriptionManager(mockGraphClient);
  });

  afterEach(() => {
    subscriptionManager.cleanup();
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with graph client', () => {
      expect(subscriptionManager).toBeInstanceOf(SubscriptionManager);
      expect(subscriptionManager['graphClient']).toBe(mockGraphClient);
    });
  });

  describe('Create Subscription', () => {
    it('should create a new subscription successfully', async () => {
      const mockSubscriptionResponse = {
        id: 'test-subscription-id',
        resource: '/users/test@example.com/mailFolders/Inbox/messages',
        changeType: 'created',
        notificationUrl: 'https://example.com/webhook',
        clientState: 'test-client-state',
        expirationDateTime: '2024-01-01T12:00:00Z'
      };

      mockApiChain.post.mockResolvedValue(mockSubscriptionResponse);

      const result = await subscriptionManager.createSubscription(
        '/users/test@example.com/mailFolders/Inbox/messages',
        'created',
        'https://example.com/webhook',
        'test-client-state'
      );

      expect(result).toEqual(mockSubscriptionResponse);
      expect(mockGraphClient.api).toHaveBeenCalledWith('/subscriptions');
      expect(mockApiChain.post).toHaveBeenCalledWith(expect.objectContaining({
        changeType: 'created',
        notificationUrl: 'https://example.com/webhook',
        resource: '/users/test@example.com/mailFolders/Inbox/messages',
        clientState: 'test-client-state',
        expirationDateTime: expect.any(String)
      }));
    });

    it('should handle Graph API errors during subscription creation', async () => {
      const graphError = new Error('Graph API Error: Insufficient permissions');
      
      mockApiChain.post.mockRejectedValue(graphError);

      await expect(subscriptionManager.createSubscription(
        '/users/test@example.com/mailFolders/Inbox/messages',
        'created',
        'https://example.com/webhook',
        'test-client-state'
      )).rejects.toThrow(Error);
    });

    it('should handle permission errors', async () => {
      const permissionError = new Error('403: Forbidden');
      
      mockApiChain.post.mockRejectedValue(permissionError);

      await expect(subscriptionManager.createSubscription(
        '/users/test@example.com/mailFolders/Inbox/messages',
        'created',
        'https://example.com/webhook',
        'test-client-state'
      )).rejects.toThrow(Error);
    });

    it('should handle invalid subscription data', async () => {
      const invalidDataError = new Error('400: Bad Request - Invalid notification URL');
      
      mockApiChain.post.mockRejectedValue(invalidDataError);

      await expect(subscriptionManager.createSubscription(
        '/users/test@example.com/mailFolders/Inbox/messages',
        'created',
        'invalid-url',
        'test-client-state'
      )).rejects.toThrow(Error);
    });
  });

  describe('Create Email Subscription', () => {
    it('should create email subscription with correct resource path', async () => {
      const mockSubscriptionResponse = {
        id: 'test-subscription-id',
        resource: '/users/test@example.com/mailFolders/Inbox/messages',
        changeType: 'created',
        notificationUrl: 'https://example.com/webhook',
        clientState: 'test-client-state',
        expirationDateTime: '2024-01-01T12:00:00Z'
      };

      mockApiChain.post.mockResolvedValue(mockSubscriptionResponse);

      const result = await subscriptionManager.createEmailSubscription(
        'https://example.com/webhook',
        'test-client-state'
      );

      expect(result).toEqual(mockSubscriptionResponse);
      expect(mockApiChain.post).toHaveBeenCalledWith(expect.objectContaining({
        resource: '/users/test@example.com/mailFolders/Inbox/messages',
        changeType: 'created'
      }));
    });
  });

  describe('Renew Subscription', () => {
    it('should renew an existing subscription successfully', async () => {
      const renewedSubscription = {
        id: 'test-subscription-id',
        resource: '/users/test@example.com/mailFolders/Inbox/messages',
        changeType: 'created',
        notificationUrl: 'https://example.com/webhook',
        clientState: 'test-client-state',
        expirationDateTime: '2024-01-02T12:00:00Z'
      };

      mockApiChain.patch.mockResolvedValue(renewedSubscription);

      await subscriptionManager.renewSubscription('test-subscription-id');

      expect(mockGraphClient.api).toHaveBeenCalledWith('/subscriptions/test-subscription-id');
      expect(mockApiChain.patch).toHaveBeenCalledWith(expect.objectContaining({
        expirationDateTime: expect.any(String)
      }));
    });

    it('should handle renewal of non-existent subscription', async () => {
      const notFoundError = new Error('404: Subscription not found');
      
      mockApiChain.patch.mockRejectedValue(notFoundError);

      await expect(subscriptionManager.renewSubscription('non-existent-id'))
        .rejects.toThrow(Error);
    });

    it('should handle Graph API errors during renewal', async () => {
      const graphError = new Error('Graph API Error: Service unavailable');
      
      mockApiChain.patch.mockRejectedValue(graphError);

      await expect(subscriptionManager.renewSubscription('test-id'))
        .rejects.toThrow(Error);
    });
  });

  describe('Delete Subscription', () => {
    it('should delete an existing subscription successfully', async () => {
      mockApiChain.delete.mockResolvedValue(undefined);

      await subscriptionManager.deleteSubscription('test-subscription-id');

      expect(mockGraphClient.api).toHaveBeenCalledWith('/subscriptions/test-subscription-id');
      expect(mockApiChain.delete).toHaveBeenCalled();
    });

    it('should handle deletion of non-existent subscription gracefully', async () => {
      const notFoundError = new Error('404: Subscription not found');
      
      mockApiChain.delete.mockRejectedValue(notFoundError);

      await expect(subscriptionManager.deleteSubscription('non-existent-id'))
        .rejects.toThrow(Error);
    });

    it('should handle Graph API errors during deletion', async () => {
      const graphError = new Error('Graph API Error: Service unavailable');
      
      mockApiChain.delete.mockRejectedValue(graphError);

      await expect(subscriptionManager.deleteSubscription('test-id'))
        .rejects.toThrow(Error);
    });
  });

  describe('List Subscriptions', () => {
    it('should return subscriptions from Graph API', async () => {
      const mockSubscriptions = [
        {
          id: 'test-subscription-1',
          resource: '/users/test@example.com/mailFolders/Inbox/messages',
          changeType: 'created',
          notificationUrl: 'https://example.com/webhook',
          clientState: 'test-client-state',
          expirationDateTime: '2024-01-01T12:00:00Z'
        },
        {
          id: 'test-subscription-2',
          resource: '/users/test@example.com/mailFolders/Sent/messages',
          changeType: 'created',
          notificationUrl: 'https://example.com/webhook',
          clientState: 'test-client-state',
          expirationDateTime: '2024-01-01T12:00:00Z'
        }
      ];

      mockApiChain.get.mockResolvedValue({ value: mockSubscriptions });

      const subscriptions = await subscriptionManager.listSubscriptions();

      expect(subscriptions).toEqual(mockSubscriptions);
      expect(mockGraphClient.api).toHaveBeenCalledWith('/subscriptions');
      expect(mockApiChain.get).toHaveBeenCalled();
    });

    it('should handle Graph API errors during listing', async () => {
      const graphError = new Error('Graph API Error: Service unavailable');
      
      mockApiChain.get.mockRejectedValue(graphError);

      await expect(subscriptionManager.listSubscriptions())
        .rejects.toThrow(Error);
    });
  });

  describe('Auto-Renewal Scheduling', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should start auto-renewal timer', async () => {
      await subscriptionManager.startAutoRenewal();

      expect(subscriptionManager['renewalTimer']).toBeDefined();
    });

    it('should stop auto-renewal when stopAutoRenewal is called', async () => {
      await subscriptionManager.startAutoRenewal();
      expect(subscriptionManager['renewalTimer']).toBeDefined();

      subscriptionManager.stopAutoRenewal();
      expect(subscriptionManager['renewalTimer']).toBeUndefined();
    });

    it.skip('should handle renewal errors gracefully during auto-renewal', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      const mockSubscription = {
        id: 'test-subscription-id',
        resource: '/users/test@example.com/mailFolders/Inbox/messages',
        changeType: 'created',
        notificationUrl: 'https://example.com/webhook',
        clientState: 'test-client-state',
        expirationDateTime: '2024-01-01T12:00:00Z'
      };

      mockApiChain.post.mockResolvedValue(mockSubscription);
      await subscriptionManager.createSubscription(
        '/users/test@example.com/mailFolders/Inbox/messages',
        'created',
        'https://example.com/webhook',
        'test-client-state'
      );

      mockApiChain.patch.mockRejectedValue(new Error('Renewal failed'));

      await subscriptionManager.startAutoRenewal();

      jest.advanceTimersByTime(2 * 24 * 60 * 60 * 1000); // 2 days
      
      await new Promise(resolve => setImmediate(resolve));

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to renew subscription'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    }, 10000);
  });

  describe('Cleanup', () => {
    it('should stop renewal timer on cleanup', async () => {
      await subscriptionManager.startAutoRenewal();
      expect(subscriptionManager['renewalTimer']).toBeDefined();

      await subscriptionManager.cleanup();
      expect(subscriptionManager['renewalTimer']).toBeUndefined();
    });

    it('should delete all subscriptions on cleanup', async () => {
      const mockSubscription1 = {
        id: 'test-subscription-1',
        resource: '/users/test@example.com/mailFolders/Inbox/messages',
        changeType: 'created',
        notificationUrl: 'https://example.com/webhook',
        clientState: 'test-client-state',
        expirationDateTime: '2024-01-01T12:00:00Z'
      };

      const mockSubscription2 = {
        id: 'test-subscription-2',
        resource: '/users/test@example.com/mailFolders/Sent/messages',
        changeType: 'created',
        notificationUrl: 'https://example.com/webhook',
        clientState: 'test-client-state',
        expirationDateTime: '2024-01-01T12:00:00Z'
      };

      mockApiChain.post.mockResolvedValueOnce(mockSubscription1)
                        .mockResolvedValueOnce(mockSubscription2);
      mockApiChain.delete.mockResolvedValue(undefined);

      await subscriptionManager.createSubscription(
        '/users/test@example.com/mailFolders/Inbox/messages',
        'created',
        'https://example.com/webhook',
        'test-client-state'
      );

      await subscriptionManager.createSubscription(
        '/users/test@example.com/mailFolders/Sent/messages',
        'created',
        'https://example.com/webhook',
        'test-client-state'
      );

      await subscriptionManager.cleanup();

      expect(mockApiChain.delete).toHaveBeenCalledTimes(2);
    });

    it('should handle cleanup errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      const mockSubscription = {
        id: 'test-subscription-id',
        resource: '/users/test@example.com/mailFolders/Inbox/messages',
        changeType: 'created',
        notificationUrl: 'https://example.com/webhook',
        clientState: 'test-client-state',
        expirationDateTime: '2024-01-01T12:00:00Z'
      };

      mockApiChain.post.mockResolvedValue(mockSubscription);
      mockApiChain.delete.mockRejectedValue(new Error('Cleanup failed'));

      await subscriptionManager.createSubscription(
        '/users/test@example.com/mailFolders/Inbox/messages',
        'created',
        'https://example.com/webhook',
        'test-client-state'
      );

      await subscriptionManager.cleanup();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error cleaning up subscription'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    it('should propagate Graph API errors', async () => {
      const originalError = new Error('Original error message');
      
      mockApiChain.post.mockRejectedValue(originalError);

      await expect(subscriptionManager.createSubscription(
        '/users/test@example.com/mailFolders/Inbox/messages',
        'created',
        'https://example.com/webhook',
        'test-client-state'
      )).rejects.toThrow('Original error message');
    });

    it('should log errors appropriately', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const originalError = new Error('Test error');
      
      mockApiChain.post.mockRejectedValue(originalError);

      try {
        await subscriptionManager.createSubscription(
          '/users/test@example.com/mailFolders/Inbox/messages',
          'created',
          'https://example.com/webhook',
          'test-client-state'
        );
      } catch (error) {
      }

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error creating subscription:',
        originalError
      );

      consoleSpy.mockRestore();
    });
  });
});
