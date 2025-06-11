import { Client } from '@microsoft/microsoft-graph-client';
import { config } from '../config.js';

export interface Subscription {
  id: string;
  resource: string;
  changeType: string;
  clientState: string;
  notificationUrl: string;
  expirationDateTime: string;
  creatorId?: string;
}

export class SubscriptionManager {
  private graphClient: Client;
  private subscriptions: Map<string, Subscription> = new Map();
  private renewalTimer?: NodeJS.Timeout;

  constructor(graphClient: Client) {
    this.graphClient = graphClient;
  }

  async createSubscription(
    resource: string,
    changeType: string,
    notificationUrl: string,
    clientState: string
  ): Promise<Subscription> {
    try {
      // Max expiration for mail is 4230 minutes (just under 3 days)
      const expirationDateTime = new Date();
      expirationDateTime.setMinutes(expirationDateTime.getMinutes() + 4230);

      const subscriptionRequest = {
        changeType,
        notificationUrl,
        resource,
        expirationDateTime: expirationDateTime.toISOString(),
        clientState,
      };

      console.log('Creating subscription:', subscriptionRequest);

      const subscription = await this.graphClient
        .api('/subscriptions')
        .post(subscriptionRequest);

      this.subscriptions.set(subscription.id, subscription);
      
      // Schedule renewal before expiration
      this.scheduleRenewal(subscription.id, subscription.expirationDateTime);

      console.log('Subscription created:', subscription.id);
      return subscription;
    } catch (error) {
      console.error('Error creating subscription:', error);
      throw error;
    }
  }

  async createEmailSubscription(notificationUrl: string, clientState: string): Promise<Subscription> {
    const resource = `/users/${config.email.userEmail}/mailFolders/${config.email.folderName}/messages`;
    return this.createSubscription(resource, 'created', notificationUrl, clientState);
  }

  async renewSubscription(subscriptionId: string): Promise<void> {
    try {
      const expirationDateTime = new Date();
      expirationDateTime.setMinutes(expirationDateTime.getMinutes() + 4230);

      const updated = await this.graphClient
        .api(`/subscriptions/${subscriptionId}`)
        .patch({
          expirationDateTime: expirationDateTime.toISOString()
        });

      this.subscriptions.set(subscriptionId, updated);
      
      // Schedule next renewal
      this.scheduleRenewal(subscriptionId, updated.expirationDateTime);

      console.log(`Subscription ${subscriptionId} renewed until ${updated.expirationDateTime}`);
    } catch (error) {
      console.error(`Error renewing subscription ${subscriptionId}:`, error);
      throw error;
    }
  }

  async deleteSubscription(subscriptionId: string): Promise<void> {
    try {
      await this.graphClient
        .api(`/subscriptions/${subscriptionId}`)
        .delete();

      this.subscriptions.delete(subscriptionId);
      console.log(`Subscription ${subscriptionId} deleted`);
    } catch (error) {
      console.error(`Error deleting subscription ${subscriptionId}:`, error);
      throw error;
    }
  }

  async listSubscriptions(): Promise<Subscription[]> {
    try {
      const response = await this.graphClient
        .api('/subscriptions')
        .get();

      return response.value;
    } catch (error) {
      console.error('Error listing subscriptions:', error);
      throw error;
    }
  }

  private scheduleRenewal(subscriptionId: string, expirationDateTime: string): void {
    const expirationTime = new Date(expirationDateTime).getTime();
    const now = Date.now();
    
    // Renew 5 minutes before expiration
    const renewalTime = expirationTime - (5 * 60 * 1000);
    const timeUntilRenewal = renewalTime - now;

    if (timeUntilRenewal > 0) {
      setTimeout(() => {
        this.renewSubscription(subscriptionId).catch(error => {
          console.error(`Failed to renew subscription ${subscriptionId}:`, error);
        });
      }, timeUntilRenewal);
    }
  }

  async startAutoRenewal(): Promise<void> {
    // Renew all subscriptions periodically (every 2 days)
    this.renewalTimer = setInterval(async () => {
      for (const [id] of this.subscriptions) {
        try {
          await this.renewSubscription(id);
        } catch (error) {
          console.error(`Failed to renew subscription ${id}:`, error);
        }
      }
    }, 2 * 24 * 60 * 60 * 1000); // 2 days
  }

  stopAutoRenewal(): void {
    if (this.renewalTimer) {
      clearInterval(this.renewalTimer);
      this.renewalTimer = undefined;
    }
  }

  async cleanup(): Promise<void> {
    this.stopAutoRenewal();
    
    // Delete all managed subscriptions
    for (const [id] of this.subscriptions) {
      try {
        await this.deleteSubscription(id);
      } catch (error) {
        console.error(`Error cleaning up subscription ${id}:`, error);
      }
    }
  }
}