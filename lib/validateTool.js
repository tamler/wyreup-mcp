import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import chalk from 'chalk';

// Constants for validation
const VALID_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const VALID_AUTH_TYPES = ['header', 'jwt'];
const REQUIRED_FIELDS = ['name', 'description', 'url'];

// Validation messages for easier localization/editing
const MESSAGES = {
  INVALID_NAME: (name) => `Tool has invalid name: ${JSON.stringify(name)}. Must be a non-empty string.`,
  INVALID_DESCRIPTION: (toolName, desc) => `Tool "${toolName}" has invalid description: ${JSON.stringify(desc)}. Must be a non-empty string.`,
  INVALID_URL: (toolName, url) => `Tool "${toolName}" has invalid url: ${JSON.stringify(url)}. Must be a non-empty string.`,
  INVALID_METHOD: (toolName, method) => `Tool "${toolName}" has invalid method: ${JSON.stringify(method)}. Must be one of: ${VALID_METHODS.join(', ')}.`,
  INVALID_INPUT_SCHEMA: (toolName) => `Tool "${toolName}" has invalid input schema. Must be an object if defined.`,
  INVALID_OUTPUT_SCHEMA: (toolName) => `Tool "${toolName}" has invalid output schema. Must be an object if defined.`,
  INVALID_AUTH: (toolName) => `Tool "${toolName}" has invalid auth. Must be an object if defined.`,
  INVALID_AUTH_TYPE: (toolName, type) => `Tool "${toolName}" has invalid auth.type: ${JSON.stringify(type)}. Must be one of: ${VALID_AUTH_TYPES.join(', ')}.`,
  INVALID_AUTH_HEADER_NAME: (toolName) => `Tool "${toolName}" auth.name is required for header auth type.`,
  INVALID_AUTH_HEADER_VALUE: (toolName) => `Tool "${toolName}" auth.value is required for header auth type.`,
  INVALID_AUTH_JWT_TOKEN: (toolName) => `Tool "${toolName}" auth.token is required for jwt auth type.`,
  UNKNOWN_FIELD: (toolName, field) => `Tool "${toolName}" has unknown field: "${field}". This may be a typo.`,
};

/**
 * Centralized tool validation for MCP compatibility
 * @param {Object} tool - Tool configuration object
 * @param {boolean} throwOnError - Whether to throw McpError or return boolean
 * @param {boolean} debug - Whether to show debug logging
 * @returns {boolean} - Returns true if valid (when throwOnError=false)
 * @throws {McpError} - When throwOnError=true and validation fails
 */
export function validateTool(tool, throwOnError = false, debug = false) {
  const errors = [];
  
  // Validate required fields
  if (!tool.name || typeof tool.name !== 'string' || !tool.name.trim()) {
    errors.push(MESSAGES.INVALID_NAME(tool.name));
  }
  
  if (!tool.description || typeof tool.description !== 'string' || !tool.description.trim()) {
    errors.push(MESSAGES.INVALID_DESCRIPTION(tool.name || 'unknown', tool.description));
  }
  
  if (!tool.url || typeof tool.url !== 'string' || !tool.url.trim()) {
    errors.push(MESSAGES.INVALID_URL(tool.name || 'unknown', tool.url));
  }
  
  // Validate method (optional, defaults to GET)
  if (tool.method !== undefined) {
    if (typeof tool.method !== 'string' || !VALID_METHODS.includes(tool.method.toUpperCase())) {
      errors.push(MESSAGES.INVALID_METHOD(tool.name || 'unknown', tool.method));
    }
  }
  
  // Validate input schema (optional)
  if (tool.input !== undefined) {
    if (typeof tool.input !== 'object' || tool.input === null || Array.isArray(tool.input)) {
      errors.push(MESSAGES.INVALID_INPUT_SCHEMA(tool.name || 'unknown'));
    }
  }
  
  // Validate output schema (optional)
  if (tool.output !== undefined) {
    if (typeof tool.output !== 'object' || tool.output === null || Array.isArray(tool.output)) {
      errors.push(MESSAGES.INVALID_OUTPUT_SCHEMA(tool.name || 'unknown'));
    }
  }
  
  // Validate auth (optional)
  if (tool.auth !== undefined) {
    if (typeof tool.auth !== 'object' || tool.auth === null || Array.isArray(tool.auth)) {
      errors.push(MESSAGES.INVALID_AUTH(tool.name || 'unknown'));
    } else {
      // Validate auth structure
      if (!tool.auth.type || typeof tool.auth.type !== 'string' || !VALID_AUTH_TYPES.includes(tool.auth.type)) {
        errors.push(MESSAGES.INVALID_AUTH_TYPE(tool.name || 'unknown', tool.auth.type));
      } else {
        // Validate auth type-specific fields
        if (tool.auth.type === 'header') {
          if (!tool.auth.name || typeof tool.auth.name !== 'string' || !tool.auth.name.trim()) {
            errors.push(MESSAGES.INVALID_AUTH_HEADER_NAME(tool.name || 'unknown'));
          }
          // Allow valueFromEnv as alternative to value for header auth
          const hasValue = tool.auth.value && typeof tool.auth.value === 'string';
          const hasValueFromEnv = tool.auth.valueFromEnv && typeof tool.auth.valueFromEnv === 'string';
          if (!hasValue && !hasValueFromEnv) {
            errors.push(`Tool "${tool.name || 'unknown'}" auth requires either "value" or "valueFromEnv" for header auth type.`);
          }
        } else if (tool.auth.type === 'jwt') {
          // Allow tokenFromEnv as alternative to token for JWT auth
          const hasToken = tool.auth.token && typeof tool.auth.token === 'string' && tool.auth.token.trim();
          const hasTokenFromEnv = tool.auth.tokenFromEnv && typeof tool.auth.tokenFromEnv === 'string';
          if (!hasToken && !hasTokenFromEnv) {
            errors.push(`Tool "${tool.name || 'unknown'}" auth requires either "token" or "tokenFromEnv" for jwt auth type.`);
          }
        }
      }
    }
  }
  
  // Validate webhook-specific configurations
  if (tool.timeout !== undefined) {
    if (typeof tool.timeout !== 'number' || tool.timeout <= 0) {
      errors.push(`Tool "${tool.name || 'unknown'}" has invalid timeout: ${tool.timeout}. Must be a positive number (milliseconds).`);
    }
  }
  
  if (tool.maxRetries !== undefined) {
    if (typeof tool.maxRetries !== 'number' || tool.maxRetries < 0 || tool.maxRetries > 10) {
      errors.push(`Tool "${tool.name || 'unknown'}" has invalid maxRetries: ${tool.maxRetries}. Must be 0-10.`);
    }
  }
  
  if (tool.retryDelay !== undefined) {
    if (typeof tool.retryDelay !== 'number' || tool.retryDelay < 0) {
      errors.push(`Tool "${tool.name || 'unknown'}" has invalid retryDelay: ${tool.retryDelay}. Must be a non-negative number (milliseconds).`);
    }
  }
  
  if (tool.rateLimit !== undefined) {
    if (typeof tool.rateLimit !== 'object' || !tool.rateLimit.requests || !tool.rateLimit.window) {
      errors.push(`Tool "${tool.name || 'unknown'}" has invalid rateLimit. Must be {requests: number, window: number}.`);
    }
  }

  // Check for unknown/extra fields (expanded for webhook features)
  const knownFields = [
    'name', 'description', 'url', 'method', 'input', 'output', 'auth', 'authFrom',
    'public', 'paid', 'timeout', 'maxRetries', 'retryDelay', 'rateLimit',
    'webhookVerification', 'healthCheck', 'tags'
  ];
  const unknownFields = Object.keys(tool).filter(field => !knownFields.includes(field));
  
  if (unknownFields.length > 0 && debug) {
    unknownFields.forEach(field => {
      console.warn(chalk.yellow(`[DEBUG] ${MESSAGES.UNKNOWN_FIELD(tool.name || 'unknown', field)}`));
    });
  }
  
  // Handle errors
  if (errors.length > 0) {
    const firstError = errors[0];
    
    if (throwOnError) {
      throw new McpError(ErrorCode.InvalidRequest, firstError);
    }
    
    if (debug) {
      errors.forEach(error => {
        console.warn(chalk.yellow(`[DEBUG] ${error}`));
      });
    }
    
    return false;
  }
  
  return true;
}

/**
 * Validate an entire manifest with tools array
 * @param {Object} config - Parsed manifest configuration
 * @param {string} filePath - Path to manifest file (for error reporting)
 * @param {boolean} debug - Whether to show debug logging
 * @returns {Object} - Validation result with success boolean and errors array
 */
export function validateManifest(config, filePath, debug = false) {
  const errors = [];
  
  // Check tools array
  if (!Array.isArray(config.tools)) {
    errors.push('Field "tools": Missing or invalid. Must be an array.');
    return { success: false, errors };
  }
  
  if (config.tools.length === 0) {
    errors.push('Field "tools": Array must contain at least one tool.');
    return { success: false, errors };
  }
  
  // Check for duplicate tool names
  const toolNames = new Set();
  const duplicates = [];
  
  config.tools.forEach((tool, index) => {
    // Validate individual tool
    try {
      if (!validateTool(tool, false, debug)) {
        errors.push(`Tool at index ${index}: Invalid tool configuration`);
      }
    } catch (error) {
      errors.push(`Tool at index ${index}: ${error.message}`);
    }
    
    // Check for duplicate names
    if (tool.name && typeof tool.name === 'string') {
      if (toolNames.has(tool.name)) {
        duplicates.push(tool.name);
      } else {
        toolNames.add(tool.name);
      }
    }
  });
  
  // Report duplicates
  if (duplicates.length > 0) {
    duplicates.forEach(name => {
      errors.push(`Duplicate tool name found: "${name}". Tool names must be unique.`);
    });
  }
  
  return {
    success: errors.length === 0,
    errors,
    toolCount: config.tools.length,
    toolNames: Array.from(toolNames)
  };
}