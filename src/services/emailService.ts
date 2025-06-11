import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import 'isomorphic-fetch';

export interface EmailMessage {
  id: string;
  subject: string;
  from: string;
  fromName?: string;
  receivedDateTime: string;
  bodyPreview: string;
  body: {
    contentType: string;
    content: string;
  };
  hasAttachments: boolean;
  conversationId?: string;
}

export class EmailService {
  private graphClient: Client;
  private userEmail: string;
  private folderName: string;

  constructor(
    tenantId: string,
    clientId: string,
    clientSecret: string,
    userEmail: string,
    folderName: string = 'Inbox'
  ) {
    const credential = new ClientSecretCredential(
      tenantId,
      clientId,
      clientSecret
    );

    const authProvider = new TokenCredentialAuthenticationProvider(credential, {
      scopes: ['https://graph.microsoft.com/.default'],
    });

    this.graphClient = Client.initWithMiddleware({
      authProvider,
    });

    this.userEmail = userEmail;
    this.folderName = folderName;
  }

  async getUnreadEmails(limit: number = 10): Promise<EmailMessage[]> {
    try {
      const messages = await this.graphClient
        .api(`/users/${this.userEmail}/mailFolders/${this.folderName}/messages`)
        .filter('isRead eq false')
        .select('id,subject,from,receivedDateTime,bodyPreview,body,hasAttachments,conversationId')
        .orderby('receivedDateTime desc')
        .top(limit)
        .get();

      return messages.value.map((msg: any) => ({
        id: msg.id,
        subject: msg.subject,
        from: msg.from.emailAddress.address,
        fromName: msg.from.emailAddress.name,
        receivedDateTime: msg.receivedDateTime,
        bodyPreview: msg.bodyPreview,
        body: msg.body,
        hasAttachments: msg.hasAttachments,
        conversationId: msg.conversationId,
      }));
    } catch (error) {
      console.error('Error fetching emails:', error);
      throw error;
    }
  }

  async getEmailById(messageId: string): Promise<EmailMessage> {
    try {
      const message = await this.graphClient
        .api(`/users/${this.userEmail}/messages/${messageId}`)
        .select('id,subject,from,receivedDateTime,bodyPreview,body,hasAttachments,conversationId')
        .get();

      return {
        id: message.id,
        subject: message.subject,
        from: message.from.emailAddress.address,
        fromName: message.from.emailAddress.name,
        receivedDateTime: message.receivedDateTime,
        bodyPreview: message.bodyPreview,
        body: message.body,
        hasAttachments: message.hasAttachments,
        conversationId: message.conversationId,
      };
    } catch (error) {
      console.error('Error fetching email by ID:', error);
      throw error;
    }
  }

  async markAsRead(messageId: string): Promise<void> {
    try {
      await this.graphClient
        .api(`/users/${this.userEmail}/messages/${messageId}`)
        .update({
          isRead: true,
        });
    } catch (error) {
      console.error('Error marking email as read:', error);
      throw error;
    }
  }

  async searchEmails(query: string, limit: number = 10): Promise<EmailMessage[]> {
    try {
      const messages = await this.graphClient
        .api(`/users/${this.userEmail}/messages`)
        .search(`"${query}"`)
        .select('id,subject,from,receivedDateTime,bodyPreview,body,hasAttachments,conversationId')
        .orderby('receivedDateTime desc')
        .top(limit)
        .get();

      return messages.value.map((msg: any) => ({
        id: msg.id,
        subject: msg.subject,
        from: msg.from.emailAddress.address,
        fromName: msg.from.emailAddress.name,
        receivedDateTime: msg.receivedDateTime,
        bodyPreview: msg.bodyPreview,
        body: msg.body,
        hasAttachments: msg.hasAttachments,
        conversationId: msg.conversationId,
      }));
    } catch (error) {
      console.error('Error searching emails:', error);
      throw error;
    }
  }

  async getConversationEmails(conversationId: string): Promise<EmailMessage[]> {
    try {
      const messages = await this.graphClient
        .api(`/users/${this.userEmail}/messages`)
        .filter(`conversationId eq '${conversationId}'`)
        .select('id,subject,from,receivedDateTime,bodyPreview,body,hasAttachments')
        .orderby('receivedDateTime asc')
        .get();

      return messages.value.map((msg: any) => ({
        id: msg.id,
        subject: msg.subject,
        from: msg.from.emailAddress.address,
        fromName: msg.from.emailAddress.name,
        receivedDateTime: msg.receivedDateTime,
        bodyPreview: msg.bodyPreview,
        body: msg.body,
        hasAttachments: msg.hasAttachments,
        conversationId,
      }));
    } catch (error) {
      console.error('Error fetching conversation:', error);
      throw error;
    }
  }

  extractPlainText(htmlContent: string): string {
    // Simple HTML to plain text conversion
    return htmlContent
      .replace(/<[^>]*>/g, ' ')  // Remove HTML tags
      .replace(/&nbsp;/g, ' ')    // Replace &nbsp;
      .replace(/&amp;/g, '&')     // Replace &amp;
      .replace(/&lt;/g, '<')      // Replace &lt;
      .replace(/&gt;/g, '>')      // Replace &gt;
      .replace(/&quot;/g, '"')    // Replace &quot;
      .replace(/&#39;/g, "'")     // Replace &#39;
      .replace(/\s+/g, ' ')       // Normalize whitespace
      .trim();
  }
}