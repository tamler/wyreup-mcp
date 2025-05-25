import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import chalk from 'chalk';

/**
 * Centralized tool validation for MCP compatibility
 * @param {Object} tool - Tool configuration object
 * @param {boolean} throwOnError - Whether to throw McpError or return boolean
 * @param {boolean} debug - Whether to show debug logging
 * @returns {boolean} - Returns true if valid (when throwOnError=false)
 * @throws {McpError} - When throwOnError=true and validation fails
 */
export function validateTool(tool, throwOnError = false, debug = false) {
  if (!tool.name || typeof tool.name !== 'string') {
    const message = `Tool has invalid name: ${JSON.stringify(tool.name)}`;
    if (throwOnError) {
      throw new McpError(ErrorCode.InvalidRequest, message);
    }
    if (debug) {
      console.warn(chalk.yellowBright(`[DEBUG] ${message}`));
    }
    return false;
  }
  
  if (!tool.description || typeof tool.description !== 'string') {
    const message = `Tool "${tool.name}" has invalid description: ${JSON.stringify(tool.description)}`;
    if (throwOnError) {
      throw new McpError(ErrorCode.InvalidRequest, message);
    }
    if (debug) {
      console.warn(chalk.yellowBright(`[DEBUG] ${message}`));
    }
    return false;
  }
  
  return true;
}