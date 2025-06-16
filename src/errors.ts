export enum MCPErrorCode {
  // Standard JSON-RPC error codes
  PARSE_ERROR = -32700,
  INVALID_REQUEST = -32600,
  METHOD_NOT_FOUND = -32601,
  INVALID_PARAMS = -32602,
  INTERNAL_ERROR = -32603,

  // Custom MCP error codes (authentication range)
  AUTH_REQUIRED = -31001,
  INVALID_TOKEN = -31002,
  INSUFFICIENT_PERMISSIONS = -31003,

  // Custom MCP error codes (resource access range)
  RESOURCE_NOT_FOUND = -30001,
  RESOURCE_LOCKED = -30002,
  QUOTA_EXCEEDED = -30003,

  // Custom MCP error codes (email service specific)
  EMAIL_SERVICE_ERROR = -29001,
  EMAIL_NOT_FOUND = -29002,
  EMAIL_ACCESS_DENIED = -29003,
  INVALID_EMAIL_FORMAT = -29004,

  // Custom MCP error codes (webhook service specific)
  WEBHOOK_ERROR = -28001,
  WEBHOOK_NOT_ENABLED = -28002,
  WEBHOOK_SUBSCRIPTION_FAILED = -28003,
}

export class MCPError extends Error {
  constructor(
    public code: MCPErrorCode,
    message: string,
    public data?: unknown
  ) {
    super(message);
    this.name = 'MCPError';
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      data: this.data,
    };
  }
}

export function createMCPError(
  code: MCPErrorCode,
  message: string,
  data?: unknown
): MCPError {
  return new MCPError(code, message, data);
}

export function isToolExecutionError(error: unknown): boolean {
  return error instanceof Error && 'isError' in error && (error as any).isError === true;
}