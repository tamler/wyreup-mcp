import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js'
import chalk from 'chalk'
import { executeTool } from './execute.js'
import { validateTool } from './validateTool.js'

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
    )

    this.setupToolHandlers()
    this.setupErrorHandling()
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


  setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      if (!this.toolsConfig.tools || this.toolsConfig.tools.length === 0) {
        return { tools: [] }
      }

      // Validate and filter tools for MCP compatibility
      const validTools = this.toolsConfig.tools.filter((tool) => {
        return validateTool(tool, false, this.DEBUG)
      })

      const tools = validTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.input || {
          type: 'object',
          properties: {},
          required: [],
        },
      }))

      if (this.DEBUG) {
        console.log(
          chalk.blueBright(
            `[DEBUG] Listing ${tools.length} valid tools via MCP (${
              this.toolsConfig.tools.length - validTools.length
            } filtered out)`
          )
        )
      }

      return { tools }
    })

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolName = request.params.name
      const args = request.params.arguments || {}

      if (this.DEBUG) {
        console.log(
          chalk.blueBright(
            `[DEBUG] MCP tool execution: ${chalk.cyan(toolName)}`
          )
        )
        console.log(
          chalk.blueBright(
            `[DEBUG] Arguments: ${JSON.stringify(args, null, 2)}`
          )
        )
      }

      // Find and validate the tool
      const tool = this.toolsConfig.tools?.find((t) => t.name === toolName)
      if (!tool) {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Tool not found: ${toolName}`
        )
      }

      // Runtime validation for MCP compatibility
      validateTool(tool, true, this.DEBUG)

      try {
        // Execute the tool by proxying to its configured URL
        // This allows MCP to invoke external automation workflows
        const result = await executeTool(
          tool,
          args,
          {},
          {
            DEBUG: this.DEBUG,
            toolsBaseUrl: this.toolsConfig.base_url,
          }
        )

        // Format response for MCP protocol
        // Handle both static and streaming responses
        const formattedResponse = this.formatToolResponse(result, toolName)
        
        // Check if it's an async generator (streaming response)
        if (formattedResponse && typeof formattedResponse[Symbol.asyncIterator] === 'function') {
          // For now, buffer the streaming response since MCP clients may not support generators
          return await this.bufferStreamingResponse(formattedResponse, toolName)
        }
        
        // If it's a promise, await it
        if (formattedResponse instanceof Promise) {
          return await formattedResponse
        }
        
        return formattedResponse
      } catch (error) {
        if (this.DEBUG) {
          console.error(
            chalk.redBright(
              `[DEBUG] MCP tool execution error: ${error.message}`
            )
          )
        }

        // Format error response
        return this.formatToolResponse(
          {
            success: false,
            error: error.message,
          },
          toolName
        )
      }
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
        if (this.DEBUG) {
          console.log(
            chalk.greenBright(
              `[DEBUG] Formatting streaming response for ${toolName} (${result.contentType})`
            )
          )
        }
        return this.createStreamingGenerator(result.stream, toolName, result.contentType)
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
        chalk.greenBright(
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
            chalk.blueBright(
              `[DEBUG] Stream chunk ${chunkCount}: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`
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
          chalk.greenBright(
            `[DEBUG] Completed streaming ${chunkCount} chunks for ${toolName}`
          )
        )
      }

    } catch (error) {
      if (this.DEBUG) {
        console.error(
          chalk.redBright(
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

  /**
   * Fallback: Convert streaming generator to buffered response
   * Used when MCP client doesn't support streaming
   *
   * @param {AsyncGenerator} generator - Streaming generator
   * @param {string} toolName - Tool name for debugging
   * @returns {Promise<Object>} Buffered MCP response
   */
  async bufferStreamingResponse(generator, toolName) {
    if (this.DEBUG) {
      console.warn(
        chalk.yellowBright(
          `⚠️  Streaming not supported by client — buffering full response for ${toolName}`
        )
      )
    }

    try {
      let chunks = []
      for await (const chunk of generator) {
        if (chunk.content && chunk.content[0] && chunk.content[0].text) {
          chunks.push(chunk.content[0].text)
        }
      }

      const fullText = chunks.join('')

      return {
        content: [
          {
            type: 'text',
            text: `[STREAMED RESPONSE] ${fullText}`,
          },
        ],
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Stream buffering failed: ${error.message}`,
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
      const transport = new SSEServerTransport('/message', port)
      await this.server.connect(transport)
      
      console.log(chalk.green(`✅ SSE server active on http://${host}:${port}`))
      if (this.DEBUG) {
        console.log(chalk.blueBright(`[DEBUG] WyreUP MCP Server running on SSE transport`))
        console.log(chalk.blueBright(`[DEBUG] SSE endpoint: http://${host}:${port}/message`))
      }
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
