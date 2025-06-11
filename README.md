# MCP Email Processing Server

A Model Context Protocol (MCP) server that provides tools for LLMs to access and process emails from Microsoft 365 Outlook for various business workflows.

> **Security Notice**: This application handles sensitive data. Please review [SECURITY.md](SECURITY.md) before deployment.

## Architecture

The workflow follows this pattern:
1. **Email arrives** → Email arrives in designated inbox
2. **MCP server reads email** → Provides raw email data to LLM
3. **LLM processes data** → Analyzes content, extracts information
4. **LLM uses MCP tools** → Sends formatted data to your API

The MCP server acts as a bridge between the email system and the LLM, providing simple data access tools while the LLM handles all the intelligence and decision-making.

## Setup

1. **Azure AD App Registration**
   - Register an app in Azure AD
   - Add Microsoft Graph API permissions:
     - `Mail.Read`
     - `Mail.ReadWrite` 
   - Create a client secret

2. **Configuration**
   - Copy `.env.example` to `.env`
   - Fill in your Azure AD credentials:
     ```
     AZURE_CLIENT_ID=your-client-id
     AZURE_CLIENT_SECRET=your-client-secret
     AZURE_TENANT_ID=your-tenant-id
     OUTLOOK_USER_EMAIL=processing@yourdomain.com
     OUTLOOK_FOLDER_NAME=Inbox
     API_ENDPOINT=https://your-api.com/webhook
     API_KEY=your-api-key
     ```

3. **Installation**
   ```bash
   npm install
   npm run build
   npm start
   ```

## Available Tools

### Email Reading Tools
- **`get_unread_emails`** - Retrieves a list of unread emails with basic metadata
- **`get_email_content`** - Gets the full content of a specific email (HTML or plain text)
- **`search_emails`** - Searches for emails containing specific keywords
- **`get_email_conversation`** - Retrieves all emails in a conversation thread

### Processing Tools
- **`send_to_api`** - Sends LLM-formatted data to your API endpoint
- **`mark_email_processed`** - Marks an email as read/processed

## Example LLM Workflow

```
1. LLM calls get_unread_emails to see new messages
2. For each email:
   - LLM calls get_email_content to read the full message
   - LLM analyzes the content for:
     - Sentiment and tone
     - Intent and purpose
     - Key information (dates, references, entities)
   - LLM formats the analysis into structured data
   - LLM calls send_to_api with the formatted data
   - LLM calls mark_email_processed to mark as complete
```

## API Data Format

The LLM can send any JSON structure to your API. A typical format might be:

```json
{
  "emailId": "AAMkAGI2...",
  "from": "sender@example.com",
  "receivedAt": "2024-01-10T10:30:00Z",
  "analysis": {
    "category": "inquiry",
    "priority": "high",
    "confidence": 0.95
  },
  "extractedData": {
    "subject": "Product inquiry",
    "entities": ["Product X", "Feature Y"],
    "requestType": "information",
    "referenceNumber": "REF-1234"
  },
  "summary": "Customer requesting information about Product X features..."
}
```

## Benefits of this Architecture

- **Separation of Concerns**: MCP server handles email access, LLM handles intelligence
- **Flexibility**: LLM can adapt to any email format or analysis requirement
- **No Hardcoded Logic**: Analysis patterns aren't fixed in code
- **Easy Updates**: Change analysis behavior by updating LLM prompts, not code
- **Rich Context**: LLM can consider conversation history and nuanced language

## Running the Server

The server runs on stdio and connects to MCP-compatible LLM clients:

```bash
npm start
```

## Documentation

- [Deployment Guide](DEPLOYMENT.md) - Complete deployment instructions
- [Security Guide](SECURITY.md) - Security best practices and considerations
- [Operations Guide](OPERATIONS.md) - Day-to-day operations and monitoring

## Quick Start

1. Clone the repository
2. Copy `.env.example` to `.env` and configure
3. Run `npm install` and `npm run build`
4. Deploy using Docker or Kubernetes (see [DEPLOYMENT.md](DEPLOYMENT.md))

## Support

For issues and questions:
1. Check the [Operations Guide](OPERATIONS.md) troubleshooting section
2. Review logs using `kubectl logs` or `docker logs`
3. File an issue with sanitized logs and configuration