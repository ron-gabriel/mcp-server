import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import 'isomorphic-fetch';
import { MCPError, MCPErrorCode } from '../errors.js';

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
      if (error instanceof Error && error.message.includes('401')) {
        throw new MCPError(
          MCPErrorCode.AUTH_REQUIRED,
          'Authentication failed while fetching emails',
          { originalError: error.message }
        );
      }
      if (error instanceof Error && error.message.includes('403')) {
        throw new MCPError(
          MCPErrorCode.INSUFFICIENT_PERMISSIONS,
          'Insufficient permissions to read emails',
          { folderName: this.folderName, originalError: error.message }
        );
      }
      throw new MCPError(
        MCPErrorCode.EMAIL_SERVICE_ERROR,
        `Failed to fetch unread emails: ${error instanceof Error ? error.message : String(error)}`,
        { limit, folderName: this.folderName }
      );
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
      if (error instanceof Error && error.message.includes('404')) {
        throw new MCPError(
          MCPErrorCode.EMAIL_NOT_FOUND,
          `Email with ID '${messageId}' not found`,
          { messageId }
        );
      }
      if (error instanceof Error && error.message.includes('403')) {
        throw new MCPError(
          MCPErrorCode.EMAIL_ACCESS_DENIED,
          `Access denied to email with ID '${messageId}'`,
          { messageId }
        );
      }
      throw new MCPError(
        MCPErrorCode.EMAIL_SERVICE_ERROR,
        `Failed to fetch email by ID: ${error instanceof Error ? error.message : String(error)}`,
        { messageId }
      );
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
      throw new MCPError(
        MCPErrorCode.EMAIL_SERVICE_ERROR,
        `Failed to mark email as read: ${error instanceof Error ? error.message : String(error)}`,
        { messageId }
      );
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
      if (error instanceof Error && error.message.includes('400')) {
        throw new MCPError(
          MCPErrorCode.INVALID_PARAMS,
          'Invalid search query format',
          { query, originalError: error.message }
        );
      }
      throw new MCPError(
        MCPErrorCode.EMAIL_SERVICE_ERROR,
        `Failed to search emails: ${error instanceof Error ? error.message : String(error)}`,
        { query, limit }
      );
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
      throw new MCPError(
        MCPErrorCode.EMAIL_SERVICE_ERROR,
        `Failed to fetch conversation: ${error instanceof Error ? error.message : String(error)}`,
        { conversationId }
      );
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