# ChatGPT MCP Integration Example

This example demonstrates how to integrate ChatGPT with the MCP Email Processing Server to automatically process emails using AI.

## Overview

This integration allows ChatGPT to:
1. Monitor an Outlook inbox for new emails
2. Analyze email content using GPT-4
3. Extract structured data from emails
4. Send processed data to your business API
5. Mark emails as processed

## Architecture

```
Outlook Inbox → MCP Server → ChatGPT → Your Business API
                     ↑            ↓
                     └────────────┘
                    (MCP Protocol)
```

## Setup Instructions

### 1. Configure the MCP Server

First, ensure your MCP server is running with the correct environment variables:

```bash
AZURE_CLIENT_ID=your-azure-client-id
AZURE_CLIENT_SECRET=your-azure-client-secret
AZURE_TENANT_ID=your-azure-tenant-id
OUTLOOK_USER_EMAIL=processing@yourdomain.com
OUTLOOK_FOLDER_NAME=Inbox
API_ENDPOINT=https://api.yourdomain.com/process
API_KEY=your-api-key
```

### 2. Install the MCP Bridge

The MCP Bridge allows ChatGPT to communicate with your MCP server:

```bash
npm install -g @anthropic/mcp-bridge
```

### 3. Create Configuration File

Create `mcp-config.json`:

```json
{
  "mcpServers": {
    "email-processor": {
      "command": "node",
      "args": ["/path/to/mcp-server/dist/index.js"],
      "env": {
        "AZURE_CLIENT_ID": "your-azure-client-id",
        "AZURE_CLIENT_SECRET": "your-azure-client-secret",
        "AZURE_TENANT_ID": "your-azure-tenant-id",
        "OUTLOOK_USER_EMAIL": "processing@yourdomain.com",
        "OUTLOOK_FOLDER_NAME": "Inbox",
        "API_ENDPOINT": "https://api.yourdomain.com/process",
        "API_KEY": "your-api-key"
      }
    }
  }
}
```

### 4. Run the MCP Bridge

```bash
mcp-bridge --config mcp-config.json --port 3000
```

## Usage Examples

### Example 1: Customer Support Ticket Processing

```python
# ChatGPT Custom GPT Instructions
You are a customer support email processor. When asked to process emails:

1. Use get_unread_emails to fetch new support emails
2. For each email:
   - Use get_email_content to read the full message
   - Extract: customer name, issue category, urgency level, sentiment
   - Use send_to_api to send structured data:
     {
       "ticket": {
         "customer_email": "...",
         "category": "technical|billing|general",
         "urgency": "low|medium|high",
         "sentiment": "positive|neutral|negative",
         "summary": "Brief description of issue"
       }
     }
   - Use mark_email_processed to mark as handled
```

### Example 2: Invoice Processing

```python
# ChatGPT Custom GPT Instructions
You are an invoice processor. When asked to process invoices:

1. Use search_emails with "invoice" to find invoice emails
2. For each invoice email:
   - Use get_email_content to read the email
   - Extract: invoice number, amount, due date, vendor
   - Use send_to_api to send structured data:
     {
       "invoice": {
         "invoice_number": "...",
         "vendor": "...",
         "amount": 1234.56,
         "due_date": "2024-01-15",
         "currency": "USD"
       }
     }
   - Use mark_email_processed to mark as processed
```

### Example 3: Lead Generation

```python
# ChatGPT Custom GPT Instructions
You are a lead processor. When asked to process leads:

1. Use get_unread_emails to fetch new inquiries
2. For each inquiry:
   - Use get_email_content to read the message
   - Extract: company, contact name, interest level, budget range
   - Use get_email_conversation to get full context if it's a reply
   - Use send_to_api to send to CRM:
     {
       "lead": {
         "company": "...",
         "contact_name": "...",
         "email": "...",
         "interest_level": "hot|warm|cold",
         "budget_range": "...",
         "notes": "..."
       }
     }
   - Use mark_email_processed to mark as handled
```

## Webhook Integration (Push Model)

For real-time processing, configure webhooks:

1. Set up webhook environment variables:
```bash
WEBHOOK_ENABLED=true
WEBHOOK_PORT=80
WEBHOOK_PUBLIC_URL=https://mcp-server.yourdomain.com
WEBHOOK_CLIENT_STATE=your-secret-state
LLM_WEBHOOK_URL=https://your-chatgpt-webhook.com/process
```

2. Create a ChatGPT webhook handler that receives new email notifications

## Testing

Test the integration with this sample conversation:

```
User: Process any new customer support emails