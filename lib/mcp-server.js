import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import chalk from 'chalk';
import { executeTool } from './execute.js';

export class WyreupMcpServer {
  constructor(toolsConfig, options = {}) {
    this.toolsConfig = toolsConfig;
    this.DEBUG = options.DEBUG || false;
    
    this.server = new Server(
      {
        name: toolsConfig.name || 'WyreUP MCP Adapter',
        version: toolsConfig.version || '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  setupErrorHandling() {
    this.server.onerror = (error) => {
      console.error(chalk.red('[MCP Error]'), error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      if (!this.toolsConfig.tools || this.toolsConfig.tools.length === 0) {
        return { tools: [] };
      }

      const tools = this.toolsConfig.tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.input || { type: 'object', properties: {}, required: [] },
      }));

      if (this.DEBUG) {
        console.log(chalk.blueBright(`[DEBUG] Listing ${tools.length} tools via MCP`));
      }

      return { tools };
    });

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolName = request.params.name;
      const args = request.params.arguments || {};

      if (this.DEBUG) {
        console.log(chalk.blueBright(`[DEBUG] MCP tool execution: ${chalk.cyan(toolName)}`));
        console.log(chalk.blueBright(`[DEBUG] Arguments: ${JSON.stringify(args, null, 2)}`));
      }

      // Find the tool
      const tool = this.toolsConfig.tools?.find(t => t.name === toolName);
      if (!tool) {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Tool not found: ${toolName}`
        );
      }

      try {
        // Execute the tool using existing logic
        const result = await executeTool(tool, args, {}, { 
          DEBUG: this.DEBUG,
          toolsBaseUrl: this.toolsConfig.base_url 
        });

        if (result.success) {
          // Handle binary responses
          if (result.data && result.data.binary === true && result.data.contentType && result.data.data) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Binary data returned (${result.data.contentType}). Data length: ${result.data.data.length} base64 characters.`,
                },
                {
                  type: 'text', 
                  text: `To access the binary data, use the HTTP endpoint: /tools/${toolName}`,
                },
              ],
            };
          } else {
            // Standard JSON response
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result.data, null, 2),
                },
              ],
            };
          }
        } else {
          // Tool execution failed
          return {
            content: [
              {
                type: 'text',
                text: `Tool execution failed: ${result.error}`,
              },
            ],
            isError: true,
          };
        }
      } catch (error) {
        if (this.DEBUG) {
          console.error(chalk.redBright(`[DEBUG] MCP tool execution error: ${error.message}`));
        }
        
        return {
          content: [
            {
              type: 'text',
              text: `Tool execution error: ${error.message}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  async runStdio() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    if (this.DEBUG) {
      console.error(chalk.green('WyreUP MCP Server running on stdio'));
    }
  }

  async runSse(port, host = 'localhost') {
    // SSE implementation would go here when the SDK supports it
    // For now, we'll throw an error indicating it's not implemented yet
    throw new Error('SSE transport not yet implemented in MCP SDK');
  }

  async close() {
    await this.server.close();
  }
}