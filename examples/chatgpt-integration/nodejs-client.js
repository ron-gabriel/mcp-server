#!/usr/bin/env node
/**
 * Example Node.js client for using the MCP Email Server with ChatGPT
 * This demonstrates how to integrate the MCP tools with OpenAI's API
 */

const { Client } = require('@anthropic/mcp');
const OpenAI = require('openai');

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize MCP client
const mcpClient = new Client({
  name: 'email-processor-client',
  version: '1.0.0',
});

// Email processing system prompt
const SYSTEM_PROMPT = `You are an email processing assistant that uses MCP tools to manage emails.

Available tools:
- get_unread_emails(limit): Fetch unread emails
- get_email_content(emailId, format): Read email content
- search_emails(query, limit): Search emails
- get_email_conversation(conversationId): Get email thread
- send_to_api(data, endpoint): Send to business API
- mark_email_processed(emailId): Mark as processed

Process emails according to their type and extract relevant information.`;

/**
 * Connect to MCP server
 */
async function connectToMCPServer() {
  try {
    await mcpClient.connect({
      transport: {
        type: 'stdio',
        command: 'node',
        args: ['/path/to/mcp-server/dist/index.js'],
        env: {
          AZURE_CLIENT_ID: process.env.AZURE_CLIENT_ID,
          AZURE_CLIENT_SECRET: process.env.AZURE_CLIENT_SECRET,
          AZURE_TENANT_ID: process.env.AZURE_TENANT_ID,
          OUTLOOK_USER_EMAIL: process.env.OUTLOOK_USER_EMAIL,
          OUTLOOK_FOLDER_NAME: process.env.OUTLOOK_FOLDER_NAME,
          API_ENDPOINT: process.env.API_ENDPOINT,
          API_KEY: process.env.API_KEY,
        },
      },
    });
    console.log('Connected to MCP server');
  } catch (error) {
    console.error('Failed to connect to MCP server:', error);
    throw error;
  }
}

/**
 * Process emails using ChatGPT
 */
async function processEmailsWithGPT(taskDescription) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: taskDescription },
  ];

  // Get available tools from MCP
  const tools = await mcpClient.listTools();
  
  // Convert MCP tools to OpenAI function format
  const functions = tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema,
  }));

  // Create ChatGPT completion with functions
  const completion = await openai.chat.completions.create({
    model: 'gpt-4-1106-preview',
    messages: messages,
    functions: functions,
    function_call: 'auto',
  });

  const message = completion.choices[0].message;

  // Handle function calls
  if (message.function_call) {
    const functionName = message.function_call.name;
    const functionArgs = JSON.parse(message.function_call.arguments);

    console.log(`Executing MCP tool: ${functionName}`);
    
    // Execute MCP tool
    const result = await mcpClient.callTool(functionName, functionArgs);
    
    // Add function result to conversation
    messages.push(message);
    messages.push({
      role: 'function',
      name: functionName,
      content: JSON.stringify(result),
    });

    // Get final response
    const finalCompletion = await openai.chat.completions.create({
      model: 'gpt-4-1106-preview',
      messages: messages,
    });

    return finalCompletion.choices[0].message.content;
  }

  return message.content;
}

/**
 * Example: Process customer support emails
 */
async function processCustomerSupportEmails() {
  const task = `Process all unread customer support emails:
1. Fetch unread emails
2. For each email, extract:
   - Customer email and name
   - Issue category (technical, billing, general)
   - Urgency level (low, medium, high)
   - Brief summary
3. Send to support ticket API
4. Mark emails as processed`;

  const result = await processEmailsWithGPT(task);
  console.log('Support emails processed:', result);
}

/**
 * Example: Process invoices
 */
async function processInvoiceEmails() {
  const task = `Search for emails containing "invoice" and process them:
1. Search for invoice emails
2. Extract invoice details:
   - Invoice number
   - Vendor name
   - Amount and currency
   - Due date
3. Send to accounting API
4. Mark as processed`;

  const result = await processEmailsWithGPT(task);
  console.log('Invoices processed:', result);
}

/**
 * Example: Process with conversation context
 */
async function processWithContext() {
  const conversation = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: 'Check for urgent emails' },
  ];

  // First call - check for urgent emails
  let completion = await openai.chat.completions.create({
    model: 'gpt-4-1106-preview',
    messages: conversation,
    functions: await getOpenAIFunctions(),
    function_call: 'auto',
  });

  // Process function calls and maintain conversation
  while (completion.choices[0].message.function_call) {
    const message = completion.choices[0].message;
    const functionName = message.function_call.name;
    const functionArgs = JSON.parse(message.function_call.arguments);

    // Execute MCP tool
    const result = await mcpClient.callTool(functionName, functionArgs);
    
    // Add to conversation
    conversation.push(message);
    conversation.push({
      role: 'function',
      name: functionName,
      content: JSON.stringify(result),
    });

    // Continue conversation
    completion = await openai.chat.completions.create({
      model: 'gpt-4-1106-preview',
      messages: conversation,
      functions: await getOpenAIFunctions(),
      function_call: 'auto',
    });
  }

  return completion.choices[0].message.content;
}

/**
 * Helper: Get OpenAI function definitions
 */
async function getOpenAIFunctions() {
  const tools = await mcpClient.listTools();
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema,
  }));
}

/**
 * Main execution
 */
async function main() {
  try {
    // Connect to MCP server
    await connectToMCPServer();

    // Example 1: Process support emails
    console.log('\\n=== Processing Customer Support Emails ===');
    await processCustomerSupportEmails();

    // Example 2: Process invoices
    console.log('\\n=== Processing Invoice Emails ===');
    await processInvoiceEmails();

    // Example 3: Interactive processing
    console.log('\\n=== Processing Urgent Emails ===');
    const urgentResult = await processWithContext();
    console.log('Urgent emails:', urgentResult);

    // Disconnect
    await mcpClient.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = {
  connectToMCPServer,
  processEmailsWithGPT,
  processCustomerSupportEmails,
  processInvoiceEmails,
};