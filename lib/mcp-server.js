import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js'
import chalk from 'chalk'
import { z } from 'zod'
import { executeTool } from './execute.js'
import { validateTool } from './validateTool.js'
import { healthMonitor } from './healthMonitor.js'
import { rateLimiter } from './rateLimiter.js'

/**
 * WyreUP MCP Server implementation
 *
 * This class wraps the MCP SDK to provide tool execution capabilities.
 * It may be abstracted further in the future as the MCP SDK evolves.
 */
export class WyreupMcpServer {
  constructor(toolsConfig, options = {}) {
    this.toolsConfig = toolsConfig
    this.DEBUG = options.DEBUG || false

    // Cache validated tools on startup to avoid duplicate validation
    this.validatedTools = this.cacheValidatedTools()

    this.server = new McpServer({
      name: 'wyreup-mcp',
      version: '0.1.0'
    })

    this.validatedTools.forEach((tool) => {
      // Convert JSON Schema to Zod schema for modern SDK
      const zodSchema = this.convertJsonSchemaToZod(tool.input || {
        type: 'object',
        properties: {},
        required: [],
      })

      // Add description to the Zod schema
      const schemaWithDescription = zodSchema.describe(tool.description || `Tool: ${tool.name}`)

      this.server.tool(
        tool.name,
        schemaWithDescription,
        async (params) => {
          const result = await executeTool(
            tool,
            params,
            {},
            {
              DEBUG: this.DEBUG,
              toolsBaseUrl: this.toolsConfig.base_url,
            }
          )
          return this.formatToolResponse(result, tool.name)
        }
      )
    })

    // Add built-in health monitoring tools
    this.setupHealthTools()
    this.setupErrorHandling()
  }

  /**
   * Convert JSON Schema to Zod schema for modern SDK compatibility
   * @param {Object} jsonSchema - JSON Schema object
   * @returns {Object} Zod schema
   */
  convertJsonSchemaToZod(jsonSchema) {
    if (!jsonSchema || typeof jsonSchema !== 'object') {
      return z.object({})
    }

    if (jsonSchema.type === 'object') {
      const properties = jsonSchema.properties || {}
      const required = jsonSchema.required || []
      
      const zodObject = {}
      
      for (const [key, prop] of Object.entries(properties)) {
        let zodType
        
        switch (prop.type) {
          case 'string':
            zodType = z.string()
            break
          case 'number':
            zodType = z.number()
            break
          case 'integer':
            zodType = z.number().int()
            break
          case 'boolean':
            zodType = z.boolean()
            break
          case 'array':
            zodType = z.array(z.any())
            break
          default:
            zodType = z.any()
        }
        
        // Add description if available
        if (prop.description) {
          zodType = zodType.describe(prop.description)
        }
        
        // Make optional if not required
        if (!required.includes(key)) {
          zodType = zodType.optional()
        }
        
        zodObject[key] = zodType
      }
      
      return z.object(zodObject)
    }
    
    // Fallback for non-object schemas
    return z.object({})
  }

  /**
   * Setup built-in health monitoring and system tools
   */
  setupHealthTools() {
    // Health check tool for individual webhook endpoints
    this.server.tool(
      'health-check',
      z.object({
        toolName: z.string().describe('Name of the tool to check')
      }).describe('Perform health check on a specific webhook tool'),
      async ({ toolName }) => {
        const tool = this.validatedTools.find(t => t.name === toolName)
        if (!tool) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ error: `Tool '${toolName}' not found` }, null, 2)
            }]
          }
        }

        const healthCheck = await healthMonitor.performHealthCheck(tool, this.DEBUG)
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(healthCheck, null, 2)
          }]
        }
      }
    )

    // Health status tool for getting tool statistics
    this.server.tool(
      'health-status',
      z.object({
        toolName: z.string().optional().describe('Specific tool name, or leave empty for all tools')
      }).describe('Get health statistics for webhook tools'),
      async ({ toolName }) => {
        if (toolName) {
          const health = healthMonitor.getHealth(toolName)
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(health, null, 2)
            }]
          }
        } else {
          const overallHealth = healthMonitor.getOverallHealth()
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(overallHealth, null, 2)
            }]
          }
        }
      }
    )

    // Rate limit status tool
    this.server.tool(
      'rate-limit-status',
      z.object({
        toolName: z.string().describe('Name of the tool to check rate limit status')
      }).describe('Check rate limiting status for a webhook tool'),
      async ({ toolName }) => {
        const tool = this.validatedTools.find(t => t.name === toolName)
        if (!tool) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ error: `Tool '${toolName}' not found` }, null, 2)
            }]
          }
        }

        if (!tool.rateLimit) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ message: `No rate limiting configured for '${toolName}'` }, null, 2)
            }]
          }
        }

        const status = rateLimiter.getStatus(toolName, tool.rateLimit)
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(status, null, 2)
          }]
        }
      }
    )
  }

  /**
   * Cache validated tools on startup to avoid duplicate validation
   * @returns {Array} Array of valid tools
   */
  cacheValidatedTools() {
    if (!this.toolsConfig.tools || this.toolsConfig.tools.length === 0) {
      return []
    }

    const validTools = this.toolsConfig.tools.filter((tool) => {
      return validateTool(tool, false, this.DEBUG)
    })

    if (this.DEBUG) {
      console.log(
        chalk.blue(
          `[DEBUG] Cached ${validTools.length} valid tools on startup (${
            this.toolsConfig.tools.length - validTools.length
          } filtered out)`
        )
      )
    }

    return validTools
  }

  setupErrorHandling() {
    this.server.onerror = (error) => {
      console.error(chalk.red('[MCP Error]'), error)
    }

    process.on('SIGINT', async () => {
      await this.server.close()
      process.exit(0)
    })
  }

  /**
   * Format tool execution results for MCP protocol
   * Handles both static and streaming responses
   *
   * @param {Object} result - Tool execution result
   * @param {string} toolName - Name of the executed tool
   * @returns {Object|AsyncGenerator} MCP-compatible response or async generator for streams
   */
  formatToolResponse(result, toolName) {
    if (result.success) {
      // Handle streaming responses
      if (result.stream) {
        const contentType = result.contentType || 'text/plain'
        if (this.DEBUG) {
          console.log(
            chalk.green(
              `[DEBUG] Formatting streaming response for ${toolName} (${contentType})`
            )
          )
        }
        return this.createStreamingGenerator(
          result.stream,
          toolName,
          contentType
        )
      }

      // Handle binary responses
      if (
        result.data &&
        result.data.binary === true &&
        result.data.contentType &&
        result.data.data
      ) {
        return {
          content: [
            {
              type: 'text',
              text: `Binary data returned (${result.data.contentType}). Data length: ${result.data.data.length} base64 characters.`,
            },
            {
              type: 'text',
              text: `Binary data is available in base64 format. Note: MCP currently supports text responses only.`,
            },
          ],
        }
      } else {
        // Standard JSON response
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result.data, null, 2),
            },
          ],
        }
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
      }
    }
  }

  /**
   * Create async generator for streaming responses
   * Yields text chunks in sequence for MCP clients that support streaming
   * Falls back to buffered response for clients that don't
   *
   * @param {ReadableStream} stream - Response stream
   * @param {string} toolName - Tool name for debugging
   * @param {string} contentType - Content type of the stream
   * @returns {AsyncGenerator|Promise<Object>} Async generator or buffered response
   */
  async *createStreamingGenerator(stream, toolName, contentType) {
    if (this.DEBUG) {
      console.log(
        chalk.green(
          `[DEBUG] Creating streaming generator for ${toolName} (${contentType})`
        )
      )
    }

    try {
      const reader = stream.getReader()
      const decoder = new TextDecoder()
      let chunkCount = 0
      let chunks = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value, { stream: true })
        chunkCount++
        chunks.push(text)

        if (this.DEBUG && chunkCount <= 5) {
          console.log(
            chalk.blue(
              `[DEBUG] Stream chunk ${chunkCount}: ${text.substring(0, 100)}${
                text.length > 100 ? '...' : ''
              }`
            )
          )
        }

        // Yield each chunk as it arrives
        yield {
          content: [
            {
              type: 'text',
              text: text,
            },
          ],
        }
      }

      if (this.DEBUG) {
        console.log(
          chalk.green(
            `[DEBUG] Completed streaming ${chunkCount} chunks for ${toolName}`
          )
        )
      }
    } catch (error) {
      if (this.DEBUG) {
        console.error(
          chalk.red(
            `[DEBUG] Error in streaming generator for ${toolName}: ${error.message}`
          )
        )
      }
      yield {
        content: [
          {
            type: 'text',
            text: `Stream reading failed: ${error.message}`,
          },
        ],
        isError: true,
      }
    }
  }

  async runStdio() {
    const transport = new StdioServerTransport()
    await this.server.connect(transport)
    if (this.DEBUG) {
      console.error(chalk.green('WyreUP MCP Server running on stdio'))
    }
  }

  async runSse(port = 3333, host = 'localhost') {
    try {
      const { createServer } = await import('http')
      const { URL } = await import('url')

      // Store transports for each session
      const transports = {}

      const httpServer = createServer(async (req, res) => {
        // Enable CORS
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        res.setHeader(
          'Access-Control-Allow-Headers',
          'Content-Type, Mcp-Session-Id'
        )

        if (req.method === 'OPTIONS') {
          res.writeHead(200)
          res.end()
          return
        }

        const url = new URL(req.url || '', `http://${host}:${port}`)

        if (url.pathname === '/sse' && req.method === 'GET') {
          // Handle SSE connection establishment
          const transport = new SSEServerTransport('/messages', res)
          transports[transport.sessionId] = transport
          
          res.on('close', () => {
            delete transports[transport.sessionId]
          })
          
          await this.server.connect(transport)

          if (this.DEBUG) {
            console.log(chalk.blue('[DEBUG] SSE connection established'))
          }
        } else if (url.pathname === '/messages' && req.method === 'POST') {
          // Handle POST messages to the SSE transport
          const sessionId = req.query?.sessionId
          const transport = transports[sessionId]
          if (transport) {
            let body = ''
            req.on('data', chunk => {
              body += chunk.toString()
            })
            req.on('end', async () => {
              try {
                const message = JSON.parse(body)
                await transport.handlePostMessage(req, res, message)
              } catch (error) {
                res.status(400).send('Invalid JSON')
              }
            })
          } else {
            res.status(400).send('No transport found for sessionId')
          }
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' })
          res.end('Not found')
        }
      })

      return new Promise((resolve, reject) => {
        httpServer.listen(port, host, (error) => {
          if (error) {
            reject(error)
            return
          }

          console.log(
            chalk.green(`✅ SSE server active on http://${host}:${port}`)
          )
          if (this.DEBUG) {
            console.log(
              chalk.blue(`[DEBUG] WyreUP MCP Server running on SSE transport`)
            )
            console.log(
              chalk.blue(`[DEBUG] SSE endpoint: http://${host}:${port}/sse`)
            )
            console.log(
              chalk.blue(`[DEBUG] Messages endpoint: http://${host}:${port}/messages`)
            )
            console.log(
              chalk.blue(
                `[DEBUG] Available tools: ${this.validatedTools
                  .map((t) => t.name)
                  .join(', ')}`
              )
            )
          }
          resolve()
        })

        httpServer.on('error', reject)
      })
    } catch (error) {
      console.error(chalk.red(`Failed to start SSE server: ${error.message}`))
      throw error
    }
  }

  async close() {
    await this.server.close()
  }
}

/**
 * Factory function to create MCP server instances
 * This abstraction allows for future SDK changes without affecting main code
 */
export function createMcpServer(toolsConfig, options = {}) {
  return new WyreupMcpServer(toolsConfig, options)
}
