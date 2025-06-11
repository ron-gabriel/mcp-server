#!/usr/bin/env python3
"""
Example webhook handler for real-time email processing with ChatGPT
This receives webhooks from the MCP server when new emails arrive
"""

import json
import logging
from datetime import datetime
from typing import Dict, Any

import openai
from flask import Flask, request, jsonify

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)

# Configure OpenAI
openai.api_key = "your-openai-api-key"

# MCP Server configuration
MCP_SERVER_URL = "http://localhost:8080"
MCP_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_email_content",
            "description": "Get the full content of an email",
            "parameters": {
                "type": "object",
                "properties": {
                    "emailId": {"type": "string", "description": "The email ID"},
                    "format": {"type": "string", "enum": ["html", "text"], "description": "Format to retrieve"}
                },
                "required": ["emailId"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "send_to_api",
            "description": "Send processed data to business API",
            "parameters": {
                "type": "object",
                "properties": {
                    "data": {"type": "object", "description": "The data to send"},
                    "endpoint": {"type": "string", "description": "Optional API endpoint override"}
                },
                "required": ["data"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "mark_email_processed",
            "description": "Mark an email as processed/read",
            "parameters": {
                "type": "object",
                "properties": {
                    "emailId": {"type": "string", "description": "The email ID to mark as processed"}
                },
                "required": ["emailId"]
            }
        }
    }
]

# System prompt for email processing
SYSTEM_PROMPT = """You are an intelligent email processor. When you receive email notifications:
1. Analyze the email content to understand its purpose
2. Extract relevant information based on the email type
3. Structure the data appropriately for the business API
4. Send the processed data to the API
5. Mark the email as processed

Email types to handle:
- Customer support: Extract issue, urgency, customer details
- Invoices: Extract invoice number, amount, due date, vendor
- Sales inquiries: Extract company, contact, interest level
- General: Categorize and summarize

Always provide structured data that matches the business requirements."""


@app.route('/webhook', methods=['POST'])
def handle_webhook():
    """Handle incoming webhook from MCP server"""
    try:
        # Validate webhook request
        client_state = request.headers.get('X-Client-State')
        if client_state != 'your-secret-state':
            return jsonify({"error": "Invalid client state"}), 401

        # Parse webhook data
        data = request.json
        email_id = data.get('emailId')
        subject = data.get('subject', '')
        sender = data.get('from', {}).get('emailAddress', {}).get('address', '')
        
        logger.info(f"Processing email {email_id} from {sender}: {subject}")

        # Process email with ChatGPT
        result = process_email_with_gpt(email_id, subject, sender)
        
        return jsonify({"status": "processed", "result": result})

    except Exception as e:
        logger.error(f"Error processing webhook: {str(e)}")
        return jsonify({"error": str(e)}), 500


def process_email_with_gpt(email_id: str, subject: str, sender: str) -> Dict[str, Any]:
    """Process email using GPT-4 with function calling"""
    
    # Create initial message
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"New email received:\nID: {email_id}\nFrom: {sender}\nSubject: {subject}\n\nPlease process this email."}
    ]
    
    # Call GPT-4 with tools
    response = openai.ChatCompletion.create(
        model="gpt-4-1106-preview",
        messages=messages,
        tools=MCP_TOOLS,
        tool_choice="auto"
    )
    
    # Process function calls
    assistant_message = response.choices[0].message
    
    if assistant_message.tool_calls:
        # Execute tool calls via MCP
        tool_results = []
        
        for tool_call in assistant_message.tool_calls:
            function_name = tool_call.function.name
            function_args = json.loads(tool_call.function.arguments)
            
            # Execute MCP tool
            result = execute_mcp_tool(function_name, function_args)
            
            tool_results.append({
                "tool_call_id": tool_call.id,
                "output": json.dumps(result)
            })
        
        # Add results to conversation
        messages.append(assistant_message)
        messages.append({
            "role": "tool",
            "tool_call_id": tool_call.id,
            "content": json.dumps(result)
        })
        
        # Get final response
        final_response = openai.ChatCompletion.create(
            model="gpt-4-1106-preview",
            messages=messages
        )
        
        return {
            "processed_at": datetime.utcnow().isoformat(),
            "email_id": email_id,
            "summary": final_response.choices[0].message.content
        }
    
    return {"status": "no_action_needed"}


def execute_mcp_tool(tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
    """Execute MCP tool by calling the MCP server"""
    # In a real implementation, this would communicate with the MCP server
    # For this example, we'll simulate the responses
    
    if tool_name == "get_email_content":
        # Simulate fetching email content
        return {
            "content": "Example email content...",
            "format": arguments.get("format", "text")
        }
    
    elif tool_name == "send_to_api":
        # Simulate sending to API
        return {
            "status": 200,
            "response": "Data processed successfully"
        }
    
    elif tool_name == "mark_email_processed":
        # Simulate marking as processed
        return {
            "success": True,
            "emailId": arguments.get("emailId")
        }
    
    return {"error": "Unknown tool"}


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({"status": "healthy", "timestamp": datetime.utcnow().isoformat()})


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)