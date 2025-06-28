import { jest } from '@jest/globals';
import { validateConfig } from '../config';
import { MCPError, MCPErrorCode } from '../errors';

describe('Config Validation', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    
    jest.resetModules();
    process.env = {};
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Required Environment Variables', () => {
    it('should validate all required environment variables are present', () => {
      process.env.AZURE_CLIENT_ID = '12345678-1234-1234-1234-123456789abc';
      process.env.AZURE_CLIENT_SECRET = 'test-client-secret';
      process.env.AZURE_TENANT_ID = '87654321-4321-4321-4321-cba987654321';
      process.env.OUTLOOK_USER_EMAIL = 'test@example.com';
      process.env.OUTLOOK_FOLDER_NAME = 'Inbox';

      expect(() => validateConfig()).not.toThrow();
    });

    it('should throw MCPError when AZURE_CLIENT_ID is missing', () => {
      process.env.AZURE_CLIENT_SECRET = 'test-client-secret';
      process.env.AZURE_TENANT_ID = '87654321-4321-4321-4321-cba987654321';
      process.env.OUTLOOK_USER_EMAIL = 'test@example.com';
      process.env.OUTLOOK_FOLDER_NAME = 'Inbox';

      expect(() => validateConfig()).toThrow(expect.objectContaining({
        code: MCPErrorCode.INVALID_PARAMS,
        message: expect.stringContaining('AZURE_CLIENT_ID')
      }));
    });

    it('should throw MCPError when AZURE_CLIENT_SECRET is missing', () => {
      process.env.AZURE_CLIENT_ID = '12345678-1234-1234-1234-123456789abc';
      process.env.AZURE_TENANT_ID = '87654321-4321-4321-4321-cba987654321';
      process.env.OUTLOOK_USER_EMAIL = 'test@example.com';
      process.env.OUTLOOK_FOLDER_NAME = 'Inbox';

      expect(() => validateConfig()).toThrow(expect.objectContaining({
        code: MCPErrorCode.INVALID_PARAMS,
        message: expect.stringContaining('AZURE_CLIENT_SECRET')
      }));
    });

    it('should throw MCPError when AZURE_TENANT_ID is missing', () => {
      process.env.AZURE_CLIENT_ID = '12345678-1234-1234-1234-123456789abc';
      process.env.AZURE_CLIENT_SECRET = 'test-client-secret';
      process.env.OUTLOOK_USER_EMAIL = 'test@example.com';
      process.env.OUTLOOK_FOLDER_NAME = 'Inbox';

      expect(() => validateConfig()).toThrow(expect.objectContaining({
        code: MCPErrorCode.INVALID_PARAMS,
        message: expect.stringContaining('AZURE_TENANT_ID')
      }));
    });

    it('should throw MCPError when OUTLOOK_USER_EMAIL is missing', () => {
      process.env.AZURE_CLIENT_ID = '12345678-1234-1234-1234-123456789abc';
      process.env.AZURE_CLIENT_SECRET = 'test-client-secret';
      process.env.AZURE_TENANT_ID = '87654321-4321-4321-4321-cba987654321';
      process.env.OUTLOOK_FOLDER_NAME = 'Inbox';

      expect(() => validateConfig()).toThrow(expect.objectContaining({
        code: MCPErrorCode.INVALID_PARAMS,
        message: expect.stringContaining('OUTLOOK_USER_EMAIL')
      }));
    });

    it('should throw MCPError when OUTLOOK_FOLDER_NAME is missing', () => {
      process.env.AZURE_CLIENT_ID = '12345678-1234-1234-1234-123456789abc';
      process.env.AZURE_CLIENT_SECRET = 'test-client-secret';
      process.env.AZURE_TENANT_ID = '87654321-4321-4321-4321-cba987654321';
      process.env.OUTLOOK_USER_EMAIL = 'test@example.com';

      expect(() => validateConfig()).toThrow(expect.objectContaining({
        code: MCPErrorCode.INVALID_PARAMS,
        message: expect.stringContaining('OUTLOOK_FOLDER_NAME')
      }));
    });
  });

  describe('Webhook Configuration Validation', () => {
    beforeEach(() => {
      process.env.AZURE_CLIENT_ID = '12345678-1234-1234-1234-123456789abc';
      process.env.AZURE_CLIENT_SECRET = 'test-client-secret';
      process.env.AZURE_TENANT_ID = '87654321-4321-4321-4321-cba987654321';
      process.env.OUTLOOK_USER_EMAIL = 'test@example.com';
      process.env.OUTLOOK_FOLDER_NAME = 'Inbox';
    });

    it('should validate webhook configuration when enabled', () => {
      process.env.WEBHOOK_ENABLED = 'true';
      process.env.WEBHOOK_PORT = '3000';
      process.env.WEBHOOK_PUBLIC_URL = 'https://example.com';
      process.env.WEBHOOK_CLIENT_STATE = 'test-client-state';

      expect(() => validateConfig()).not.toThrow();
    });

    it('should throw MCPError when webhook is enabled but WEBHOOK_PORT is missing', () => {
      process.env.WEBHOOK_ENABLED = 'true';
      delete process.env.WEBHOOK_PORT;
      process.env.WEBHOOK_PUBLIC_URL = 'https://example.com';
      process.env.WEBHOOK_CLIENT_STATE = 'test-client-state';

      expect(() => validateConfig()).toThrow(expect.objectContaining({
        code: MCPErrorCode.WEBHOOK_NOT_ENABLED,
        message: expect.stringContaining('WEBHOOK_PORT')
      }));
    });

    it('should throw MCPError when webhook is enabled but WEBHOOK_PUBLIC_URL is missing', () => {
      process.env.WEBHOOK_ENABLED = 'true';
      process.env.WEBHOOK_PORT = '3000';
      delete process.env.WEBHOOK_PUBLIC_URL;
      process.env.WEBHOOK_CLIENT_STATE = 'test-client-state';

      expect(() => validateConfig()).toThrow(expect.objectContaining({
        code: MCPErrorCode.WEBHOOK_NOT_ENABLED,
        message: expect.stringContaining('WEBHOOK_PUBLIC_URL')
      }));
    });

    it('should throw MCPError when webhook is enabled but WEBHOOK_CLIENT_STATE is missing', () => {
      process.env.WEBHOOK_ENABLED = 'true';
      process.env.WEBHOOK_PORT = '3000';
      process.env.WEBHOOK_PUBLIC_URL = 'https://example.com';
      delete process.env.WEBHOOK_CLIENT_STATE;

      expect(() => validateConfig()).toThrow(expect.objectContaining({
        code: MCPErrorCode.WEBHOOK_NOT_ENABLED,
        message: expect.stringContaining('WEBHOOK_CLIENT_STATE')
      }));
    });

    it('should validate when webhook is disabled', () => {
      process.env.WEBHOOK_ENABLED = 'false';

      expect(() => validateConfig()).not.toThrow();
    });

    it('should default webhook to disabled when WEBHOOK_ENABLED is not set', () => {
      expect(() => validateConfig()).not.toThrow();
    });

    it('should handle invalid WEBHOOK_PORT values', () => {
      process.env.WEBHOOK_ENABLED = 'true';
      process.env.WEBHOOK_PORT = 'invalid-port';
      process.env.WEBHOOK_PUBLIC_URL = 'https://example.com';
      process.env.WEBHOOK_CLIENT_STATE = 'test-client-state';

      expect(() => validateConfig()).toThrow(expect.objectContaining({
        code: MCPErrorCode.INVALID_PARAMS,
        message: expect.stringContaining('WEBHOOK_PORT')
      }));
    });

    it('should handle negative WEBHOOK_PORT values', () => {
      process.env.WEBHOOK_ENABLED = 'true';
      process.env.WEBHOOK_PORT = '-1';
      process.env.WEBHOOK_PUBLIC_URL = 'https://example.com';
      process.env.WEBHOOK_CLIENT_STATE = 'test-client-state';

      expect(() => validateConfig()).toThrow(expect.objectContaining({
        code: MCPErrorCode.INVALID_PARAMS,
        message: expect.stringContaining('WEBHOOK_PORT')
      }));
    });

    it('should handle WEBHOOK_PORT values that are too large', () => {
      process.env.WEBHOOK_ENABLED = 'true';
      process.env.WEBHOOK_PORT = '70000';
      process.env.WEBHOOK_PUBLIC_URL = 'https://example.com';
      process.env.WEBHOOK_CLIENT_STATE = 'test-client-state';

      expect(() => validateConfig()).toThrow(expect.objectContaining({
        code: MCPErrorCode.INVALID_PARAMS,
        message: expect.stringContaining('WEBHOOK_PORT')
      }));
    });

    it('should validate WEBHOOK_PUBLIC_URL format', () => {
      process.env.WEBHOOK_ENABLED = 'true';
      process.env.WEBHOOK_PORT = '3000';
      process.env.WEBHOOK_PUBLIC_URL = 'invalid-url';
      process.env.WEBHOOK_CLIENT_STATE = 'test-client-state';

      expect(() => validateConfig()).toThrow(expect.objectContaining({
        code: MCPErrorCode.INVALID_PARAMS,
        message: expect.stringContaining('WEBHOOK_PUBLIC_URL')
      }));
    });

    it('should accept valid HTTPS URLs for WEBHOOK_PUBLIC_URL', () => {
      process.env.WEBHOOK_ENABLED = 'true';
      process.env.WEBHOOK_PORT = '3000';
      process.env.WEBHOOK_PUBLIC_URL = 'https://example.com/webhook';
      process.env.WEBHOOK_CLIENT_STATE = 'test-client-state';

      expect(() => validateConfig()).not.toThrow();
    });

    it('should accept valid HTTP URLs for WEBHOOK_PUBLIC_URL in development', () => {
      process.env.WEBHOOK_ENABLED = 'true';
      process.env.WEBHOOK_PORT = '3000';
      process.env.WEBHOOK_PUBLIC_URL = 'http://localhost:3000/webhook';
      process.env.WEBHOOK_CLIENT_STATE = 'test-client-state';

      expect(() => validateConfig()).not.toThrow();
    });
  });

  describe('LLM Webhook Configuration', () => {
    beforeEach(() => {
      process.env.AZURE_CLIENT_ID = '12345678-1234-1234-1234-123456789abc';
      process.env.AZURE_CLIENT_SECRET = 'test-client-secret';
      process.env.AZURE_TENANT_ID = '87654321-4321-4321-4321-cba987654321';
      process.env.OUTLOOK_USER_EMAIL = 'test@example.com';
      process.env.OUTLOOK_FOLDER_NAME = 'Inbox';
      process.env.WEBHOOK_ENABLED = 'true';
      process.env.WEBHOOK_PORT = '3000';
      process.env.WEBHOOK_PUBLIC_URL = 'https://example.com';
      process.env.WEBHOOK_CLIENT_STATE = 'test-client-state';
    });

    it('should validate when LLM webhook URL is provided', () => {
      process.env.WEBHOOK_LLM_WEBHOOK_URL = 'https://llm.example.com/webhook';

      expect(() => validateConfig()).not.toThrow();
    });

    it('should validate when LLM webhook URL is not provided', () => {
      expect(() => validateConfig()).not.toThrow();
    });

    it('should validate LLM webhook URL format when provided', () => {
      process.env.WEBHOOK_LLM_WEBHOOK_URL = 'invalid-url';

      expect(() => validateConfig()).toThrow(expect.objectContaining({
        code: MCPErrorCode.INVALID_PARAMS,
        message: expect.stringContaining('WEBHOOK_LLM_WEBHOOK_URL')
      }));
    });

    it('should accept valid HTTPS URLs for LLM webhook', () => {
      process.env.WEBHOOK_LLM_WEBHOOK_URL = 'https://api.openai.com/webhook';

      expect(() => validateConfig()).not.toThrow();
    });

    it('should accept valid HTTP URLs for LLM webhook in development', () => {
      process.env.WEBHOOK_LLM_WEBHOOK_URL = 'http://localhost:8080/webhook';

      expect(() => validateConfig()).not.toThrow();
    });
  });

  describe('Email Configuration Validation', () => {
    beforeEach(() => {
      process.env.AZURE_CLIENT_ID = '12345678-1234-1234-1234-123456789abc';
      process.env.AZURE_CLIENT_SECRET = 'test-client-secret';
      process.env.AZURE_TENANT_ID = '87654321-4321-4321-4321-cba987654321';
      process.env.OUTLOOK_FOLDER_NAME = 'Inbox';
    });

    it('should validate email format for OUTLOOK_USER_EMAIL', () => {
      process.env.OUTLOOK_USER_EMAIL = 'invalid-email';

      expect(() => validateConfig()).toThrow(expect.objectContaining({
        code: MCPErrorCode.INVALID_PARAMS,
        message: expect.stringContaining('OUTLOOK_USER_EMAIL')
      }));
    });

    it('should accept valid email formats', () => {
      process.env.OUTLOOK_USER_EMAIL = 'user@example.com';

      expect(() => validateConfig()).not.toThrow();
    });

    it('should accept email with subdomain', () => {
      process.env.OUTLOOK_USER_EMAIL = 'user@mail.example.com';

      expect(() => validateConfig()).not.toThrow();
    });

    it('should accept email with plus addressing', () => {
      process.env.OUTLOOK_USER_EMAIL = 'user+tag@example.com';

      expect(() => validateConfig()).not.toThrow();
    });

    it('should validate OUTLOOK_FOLDER_NAME is not empty', () => {
      process.env.OUTLOOK_USER_EMAIL = 'test@example.com';
      process.env.OUTLOOK_FOLDER_NAME = '';

      expect(() => validateConfig()).toThrow(expect.objectContaining({
        code: MCPErrorCode.INVALID_PARAMS,
        message: expect.stringContaining('OUTLOOK_FOLDER_NAME')
      }));
    });

    it('should accept common folder names', () => {
      const folderNames = ['Inbox', 'Sent', 'Drafts', 'Archive', 'Custom Folder'];
      
      for (const folderName of folderNames) {
        process.env.OUTLOOK_USER_EMAIL = 'test@example.com';
        process.env.OUTLOOK_FOLDER_NAME = folderName;

        expect(() => validateConfig()).not.toThrow();
      }
    });
  });

  describe('Azure Configuration Validation', () => {
    beforeEach(() => {
      process.env.OUTLOOK_USER_EMAIL = 'test@example.com';
      process.env.OUTLOOK_FOLDER_NAME = 'Inbox';
    });

    it('should validate AZURE_CLIENT_ID is not empty', () => {
      process.env.AZURE_CLIENT_ID = '';
      process.env.AZURE_CLIENT_SECRET = 'test-client-secret';
      process.env.AZURE_TENANT_ID = '87654321-4321-4321-4321-cba987654321';

      expect(() => validateConfig()).toThrow(expect.objectContaining({
        code: MCPErrorCode.INVALID_PARAMS,
        message: expect.stringContaining('AZURE_CLIENT_ID')
      }));
    });

    it('should validate AZURE_CLIENT_SECRET is not empty', () => {
      process.env.AZURE_CLIENT_ID = '12345678-1234-1234-1234-123456789abc';
      process.env.AZURE_CLIENT_SECRET = '';
      process.env.AZURE_TENANT_ID = '87654321-4321-4321-4321-cba987654321';

      expect(() => validateConfig()).toThrow(expect.objectContaining({
        code: MCPErrorCode.INVALID_PARAMS,
        message: expect.stringContaining('AZURE_CLIENT_SECRET')
      }));
    });

    it('should validate AZURE_TENANT_ID is not empty', () => {
      process.env.AZURE_CLIENT_ID = '12345678-1234-1234-1234-123456789abc';
      process.env.AZURE_CLIENT_SECRET = 'test-client-secret';
      process.env.AZURE_TENANT_ID = '';

      expect(() => validateConfig()).toThrow(expect.objectContaining({
        code: MCPErrorCode.INVALID_PARAMS,
        message: expect.stringContaining('AZURE_TENANT_ID')
      }));
    });

    it('should validate AZURE_TENANT_ID format (UUID)', () => {
      process.env.AZURE_CLIENT_ID = '12345678-1234-1234-1234-123456789abc';
      process.env.AZURE_CLIENT_SECRET = 'test-client-secret';
      process.env.AZURE_TENANT_ID = 'invalid-tenant-id';

      expect(() => validateConfig()).toThrow(expect.objectContaining({
        code: MCPErrorCode.INVALID_PARAMS,
        message: expect.stringContaining('AZURE_TENANT_ID')
      }));
    });

    it('should accept valid UUID format for AZURE_TENANT_ID', () => {
      process.env.AZURE_CLIENT_ID = '12345678-1234-1234-1234-123456789abc';
      process.env.AZURE_CLIENT_SECRET = 'test-client-secret';
      process.env.AZURE_TENANT_ID = '12345678-1234-1234-1234-123456789abc';

      expect(() => validateConfig()).not.toThrow();
    });

    it('should validate AZURE_CLIENT_ID format (UUID)', () => {
      process.env.AZURE_CLIENT_ID = 'invalid-client-id';
      process.env.AZURE_CLIENT_SECRET = 'test-client-secret';
      process.env.AZURE_TENANT_ID = '12345678-1234-1234-1234-123456789abc';

      expect(() => validateConfig()).toThrow(expect.objectContaining({
        code: MCPErrorCode.INVALID_PARAMS,
        message: expect.stringContaining('AZURE_CLIENT_ID')
      }));
    });

    it('should accept valid UUID format for AZURE_CLIENT_ID', () => {
      process.env.AZURE_CLIENT_ID = '87654321-4321-4321-4321-cba987654321';
      process.env.AZURE_CLIENT_SECRET = 'test-client-secret';
      process.env.AZURE_TENANT_ID = '12345678-1234-1234-1234-123456789abc';

      expect(() => validateConfig()).not.toThrow();
    });
  });

  describe('Error Scenarios', () => {
    it('should throw MCPError with appropriate error code for missing required variables', () => {
      expect(() => validateConfig()).toThrow(MCPError);
      
      try {
        validateConfig();
      } catch (error) {
        expect(error).toBeInstanceOf(MCPError);
        expect((error as MCPError).code).toBe(MCPErrorCode.INVALID_PARAMS);
      }
    });

    it('should include helpful error messages for missing variables', () => {
      try {
        validateConfig();
      } catch (error) {
        expect((error as MCPError).message).toMatch(/required environment variable/i);
      }
    });

    it('should throw MCPError with webhook-specific error code for webhook validation failures', () => {
      process.env.AZURE_CLIENT_ID = '12345678-1234-1234-1234-123456789abc';
      process.env.AZURE_CLIENT_SECRET = 'test-client-secret';
      process.env.AZURE_TENANT_ID = '87654321-4321-4321-4321-cba987654321';
      process.env.OUTLOOK_USER_EMAIL = 'test@example.com';
      process.env.OUTLOOK_FOLDER_NAME = 'Inbox';
      process.env.WEBHOOK_ENABLED = 'true';

      try {
        validateConfig();
      } catch (error) {
        expect(error).toBeInstanceOf(MCPError);
        expect((error as MCPError).code).toBe(MCPErrorCode.WEBHOOK_NOT_ENABLED);
      }
    });

    it('should provide specific error messages for webhook configuration issues', () => {
      process.env.AZURE_CLIENT_ID = '12345678-1234-1234-1234-123456789abc';
      process.env.AZURE_CLIENT_SECRET = 'test-client-secret';
      process.env.AZURE_TENANT_ID = '87654321-4321-4321-4321-cba987654321';
      process.env.OUTLOOK_USER_EMAIL = 'test@example.com';
      process.env.OUTLOOK_FOLDER_NAME = 'Inbox';
      process.env.WEBHOOK_ENABLED = 'true';

      try {
        validateConfig();
      } catch (error) {
        expect((error as MCPError).message).toMatch(/webhook.*required/i);
      }
    });
  });

  describe('Environment Variable Parsing', () => {
    beforeEach(() => {
      process.env.AZURE_CLIENT_ID = '12345678-1234-1234-1234-123456789abc';
      process.env.AZURE_CLIENT_SECRET = 'test-client-secret';
      process.env.AZURE_TENANT_ID = '87654321-4321-4321-4321-cba987654321';
      process.env.OUTLOOK_USER_EMAIL = 'test@example.com';
      process.env.OUTLOOK_FOLDER_NAME = 'Inbox';
    });

    it('should parse WEBHOOK_ENABLED as boolean true', () => {
      process.env.WEBHOOK_ENABLED = 'true';
      process.env.WEBHOOK_PORT = '3000';
      process.env.WEBHOOK_PUBLIC_URL = 'https://example.com';
      process.env.WEBHOOK_CLIENT_STATE = 'test-client-state';

      expect(() => validateConfig()).not.toThrow();
    });

    it('should parse WEBHOOK_ENABLED as boolean false', () => {
      process.env.WEBHOOK_ENABLED = 'false';

      expect(() => validateConfig()).not.toThrow();
    });

    it('should parse WEBHOOK_PORT as number', () => {
      process.env.WEBHOOK_ENABLED = 'true';
      process.env.WEBHOOK_PORT = '8080';
      process.env.WEBHOOK_PUBLIC_URL = 'https://example.com';
      process.env.WEBHOOK_CLIENT_STATE = 'test-client-state';

      expect(() => validateConfig()).not.toThrow();
    });

    it('should handle case-insensitive boolean values for WEBHOOK_ENABLED', () => {
      const booleanValues = ['TRUE', 'True', 'FALSE', 'False'];
      
      for (const value of booleanValues) {
        process.env.WEBHOOK_ENABLED = value;
        if (value.toLowerCase() === 'true') {
          process.env.WEBHOOK_PORT = '3000';
          process.env.WEBHOOK_PUBLIC_URL = 'https://example.com';
          process.env.WEBHOOK_CLIENT_STATE = 'test-client-state';
        } else {
          delete process.env.WEBHOOK_PORT;
          delete process.env.WEBHOOK_PUBLIC_URL;
          delete process.env.WEBHOOK_CLIENT_STATE;
        }

        expect(() => validateConfig()).not.toThrow();
      }
    });
  });
});
