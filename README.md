# WyreUP MCP Server

A production-ready Model Context Protocol (MCP) server that transforms webhook endpoints from automation platforms (n8n, Make.com, Zapier, FlowiseAI, etc.) into reliable, agent-callable tools for **any MCP-compatible AI system**.

**Compatible with:**

- 🤖 **Claude Desktop** (Anthropic's official desktop app)
- 🔧 **Any MCP Client** (VS Code extensions, custom applications, etc.)
- 🌐 **Future MCP Services** (growing ecosystem of MCP-enabled tools)
- 📱 **Custom Integrations** (build your own MCP client)

[![npm version](https://img.shields.io/npm/v/wyreup-mcp/latest)](https://www.npmjs.com/package/wyreup-mcp)
[![GitHub](https://img.shields.io/github/license/tamler/wyreup-mcp)](https://github.com/tamler/wyreup-mcp)

**📦 NPM Package:** [wyreup-mcp](https://www.npmjs.com/package/wyreup-mcp)
**🔗 GitHub Repository:** [tamler/wyreup-mcp](https://github.com/tamler/wyreup-mcp)

## 🎯 What It Does

Turn any HTTP webhook into an MCP tool that AI agents can use reliably. Define your automation endpoints in a simple JSON manifest, and the server handles authentication, retries, rate limiting, health monitoring, and error handling automatically.

## ✨ Key Features

### 🚀 **Enterprise-Ready Reliability**

- **Smart Retry Logic**: Exponential backoff for transient failures
- **Rate Limiting**: Per-tool request throttling with sliding windows
- **Health Monitoring**: Real-time endpoint health tracking and statistics
- **Timeout Management**: Configurable timeouts per tool (great for slow automations)

### 🔐 **Flexible Authentication**

- **Multiple Auth Types**: Header-based and JWT Bearer token authentication
- **Environment Variables**: Secure credential management via `valueFromEnv` and `tokenFromEnv`
- **External Secrets**: Store credentials in `~/.wyreup-secrets/` files
- **Per-Tool Auth**: Each webhook can use different authentication methods

### 🛠 **Developer-Friendly**

- **JSON Schema Validation**: Full input/output schema support with Zod validation
- **Rich Error Handling**: Structured error responses with debugging context
- **Built-in Monitoring Tools**: Health checks and rate limit status via MCP
- **Hot Reload**: Changes to manifest files are picked up automatically

### 🌊 **Advanced HTTP Support**

- **All HTTP Methods**: GET, POST, PUT, PATCH, DELETE support
- **Binary Data**: Handle file downloads and binary responses
- **Streaming Ready**: Architecture prepared for real-time data streams
- **Content Type Detection**: Automatic handling of JSON, text, and binary responses

### 🧠 MCP Protocol Compliance

- ✅ Uses official MCP SDK (v1.12.0+) with full STDIO and SSE support
- ✅ Per-session SSE transports with isolated tool execution
- **Supports transports**: STDIO and SSE
- **Tool Registration**: Fully schema-based using `tools/list` and `tools/call`
- **JSON-RPC 2.0**: Strictly compliant request/response structure

## 🚀 Quick Start

### Installation & Setup

```bash
# Install globally from npm
npm install -g wyreup-mcp

# Or run directly with npx (recommended)
npx wyreup-mcp --init
npx wyreup-mcp --validate
npx wyreup-mcp
```

### ⚡ **Ultra-Fast Setup: Simplified Format**

**NEW**: Get started in under 2 minutes with the simplified webhook format! Perfect for rapid prototyping and low-code users.

```json
{
  "tools": [
    {
      "name": "get_quote",
      "webhook": "https://wyreup.com/tools-mock/random-quote"
    }
  ]
}
```

**That's it!** The system automatically infers:
- ✅ **Description**: "Forward to random quote webhook"
- ✅ **Method**: POST (default for webhooks)
- ✅ **Input Schema**: Empty object `{}`
- ✅ **Output Schema**: Auto-detects JSON, text, binary, or streaming responses

**Supported Response Types:**
- 📄 **JSON** - Auto-parsed for structured data
- 📝 **Text/HTML** - Plain text responses
- 🖼️ **Binary** - Images, PDFs, files (base64 encoded)
- 🌊 **Streaming** - Real-time event streams

**Test immediately:**
```bash
echo '{
  "tools": [
    {
      "name": "get_quote",
      "webhook": "https://wyreup.com/tools-mock/random-quote"
    }
  ]
}' > wyreup-simple.json

echo '{ "jsonrpc": "2.0", "id": "call-1", "method": "tools/call", "params": { "name": "get_quote", "arguments": {} } }' | npx wyreup-mcp --config wyreup-simple.json --transport stdio --debug
```

**Simplified Format Syntax:**
```json
{
  "tools": [
    {
      "name": "your_tool_name",
      "webhook": "https://your-webhook-url.com/endpoint"
    }
  ]
}
```

**Mixed Format Support:** You can combine simplified and full format tools in the same configuration file for maximum flexibility.

### 🚀 **Instant Testing with Live Endpoints**

Skip the setup and test immediately with our live demo endpoints at `wyreup.com`:

```bash
# Create a quick test configuration
echo '{
  "tools": [
    {
      "name": "get_quote",
      "description": "Get an inspirational quote",
      "url": "https://wyreup.com/tools-mock/random-quote",
      "method": "GET",
      "input": {},
      "output": {
        "type": "object",
        "properties": {
          "quote": { "type": "string" }
        }
      }
    },
    {
      "name": "get_time",
      "description": "Get current UTC time",
      "url": "https://wyreup.com/tools-mock/current-time",
      "method": "GET",
      "auth": {
        "type": "header",
        "name": "X-API-Key",
        "value": "mock-secret-key"
      },
      "output": {
        "type": "object",
        "properties": {
          "time": { "type": "string" }
        }
      }
    }
  ]
}' > test-wyreup.json

# Test immediately
npx wyreup-mcp --validate --config test-wyreup.json
npx wyreup-mcp --config test-wyreup.json
```

**Or use the comprehensive example configuration:**

```bash
# Download the full example config with all advanced features
curl -o wyreup-example.json https://raw.githubusercontent.com/tamler/wyreup-mcp/main/wyreup-example.json

# Test all features
npx wyreup-mcp --validate --config wyreup-example.json
npx wyreup-mcp --config wyreup-example.json
```

```bash
# Run the full SSE test suite
npm run test:sse
npm run test:sse-client
```

**Available Test Endpoints:**

- 🗨️ **Random Quote** - `GET /tools-mock/random-quote` (no auth)
- ⏰ **Current Time** - `GET /tools-mock/current-time` (API key: `mock-secret-key`)
- 🔄 **Echo Service** - `POST /tools-mock/echo` (API key: `test-api-key-12345`)
- ❌ **Error Testing** - `POST /tools-mock/error` (always returns 500)
- 🖼️ **Image Generation** - `GET /tools-mock/generate-image` (returns base64 PNG)
- 🎵 **Audio Generation** - `GET /tools-mock/generate-audio` (returns base64 WAV with bytebeat music!)

### Default Configuration

The default `wyreup.json` demonstrates both simplified and full formats:

```json
{
  "tools": [
    {
      "name": "get_quote",
      "webhook": "https://wyreup.com/tools-mock/random-quote"
    },
    {
      "name": "echo_message",
      "description": "Echoes back the JSON body. Expects 'message' and 'detail'.",
      "url": "https://wyreup.com/tools-mock/echo",
      "public": false,
      "input": { "message": "string", "detail": "string" },
      "output": {
        "received_message": "string",
        "received_detail": "string",
        "timestamp": "string"
      },
      "method": "POST",
      "auth": {
        "type": "header",
        "name": "X-API-Key",
        "value": "test-api-key-12345"
      }
    }
  ]
}
```

For comprehensive examples with all advanced features, see `wyreup-example.json`.

### Advanced Configuration Features

For production deployments, you can add advanced features:

```json
{
  "tools": [
    {
      "name": "advanced_tool",
      "description": "Production-ready tool with all features",
      "url": "https://your-automation-platform.com/webhook/endpoint",
      "method": "POST",
      "timeout": 30000,
      "maxRetries": 3,
      "retryDelay": 1000,
      "rateLimit": {
        "requests": 10,
        "window": 60000
      },
      "input": {
        "type": "object",
        "properties": {
          "url": { "type": "string", "description": "URL to summarize" },
          "max_words": { "type": "integer", "default": 150 }
        },
        "required": ["url"]
      },
      "output": {
        "type": "object",
        "properties": {
          "summary": { "type": "string" },
          "word_count": { "type": "integer" }
        }
      },
      "auth": {
        "type": "header",
        "name": "X-API-Key",
        "valueFromEnv": "SUMMARIZE_API_KEY"
      }
    }
  ]
}
```

### Connect to MCP Clients

**Claude Desktop:**
Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "wyreup": {
      "command": "npx",
      "args": ["wyreup-mcp"],
      "cwd": "/path/to/your/project"
    }
  }
}
```

**Other MCP Clients:**

- **VS Code Extensions**: Use MCP extension settings
- **Custom Applications**: Connect via stdio transport on any platform
- **Server Deployments**: Use SSE transport mode (`--transport sse --port 3333`)

The server implements the standard MCP protocol, so it works with any compliant client.

## 🔧 Configuration Reference

### Tool Properties

| Property      | Type   | Description                                      |
| ------------- | ------ | ------------------------------------------------ |
| `name`        | string | **Required.** Unique tool identifier             |
| `description` | string | **Required.** Human-readable description         |
| `url`         | string | **Required.** Full webhook URL                   |
| `method`      | string | HTTP method (default: POST)                      |
| `timeout`     | number | Request timeout in milliseconds (default: 30000) |
| `maxRetries`  | number | Maximum retry attempts (default: 3)              |
| `retryDelay`  | number | Base retry delay in ms (default: 1000)           |
| `rateLimit`   | object | Rate limiting configuration                      |
| `input`       | object | JSON Schema for input validation                 |
| `output`      | object | JSON Schema for output description               |
| `auth`        | object | Authentication configuration                     |
| `authFrom`    | object | External authentication source                   |

### Authentication Types

**Header Authentication:**

```json
{
  "auth": {
    "type": "header",
    "name": "Authorization",
    "value": "Bearer secret-token"
  }
}
```

**Environment Variable:**

```json
{
  "auth": {
    "type": "header",
    "name": "X-API-Key",
    "valueFromEnv": "API_KEY"
  }
}
```

**JWT Bearer:**

```json
{
  "auth": {
    "type": "jwt",
    "tokenFromEnv": "JWT_TOKEN"
  }
}
```

**External Secrets:**

```json
{
  "authFrom": {
    "user": "production-user"
  }
}
```

Create `~/.wyreup-secrets/production-user.json`:

```json
{
  "tool_name": {
    "type": "header",
    "name": "Authorization",
    "value": "Bearer your-secret-token"
  }
}
```

### Rate Limiting

```json
{
  "rateLimit": {
    "requests": 30, // Max requests
    "window": 60000 // Time window in ms
  }
}
```

## 🖥 Usage

### Command Line Options

```bash
# Validation
npx wyreup-mcp --validate
npx wyreup-mcp --validate --config wyreup-example.json

# Server modes
npx wyreup-mcp                          # STDIO mode (default, used by Claude Desktop and local tools)
npx wyreup-mcp --transport sse         # SSE mode for web clients (experimental)

# Development
npx wyreup-mcp --debug                  # Enable debug logging
npx wyreup-mcp --init                   # Create sample manifest
```

```bash
# SSE Testing (experimental)
npm run test:sse         # Starts local SSE server with demo tools
npm run test:sse-client  # Sends a tool call over SSE transport
```

### Built-in Monitoring

These tools are automatically available and do not require configuration:

- **`health-check`**: Test individual webhook endpoints
- **`health-status`**: Get success rates and performance metrics
- **`rate-limit-status`**: Monitor rate limiting usage

Example: Check health of all tools

```bash
echo '{"jsonrpc": "2.0", "method": "tools/call", "params": {"name": "health-status", "arguments": {}}, "id": 1}' | npx wyreup-mcp
```

### 🧪 SSE Transport Notes

To test SSE locally:

1. Start the server with `--transport sse`
2. Your client must subscribe to `/sse` (EventSource)
3. Wait for the `endpoint` event to get the sessionId
4. Send `POST` requests to `/messages?sessionId=...`
5. Each session gets its own transport and tool server instance
6. Transport is cleaned up after tool execution or connection close

## 🌟 Real-World Examples

### Content Processing Pipeline

```json
{
  "name": "process_article",
  "description": "Extract, summarize, and analyze web articles",
  "url": "https://n8n.company.com/webhook/process-article",
  "timeout": 45000,
  "maxRetries": 2,
  "input": {
    "type": "object",
    "properties": {
      "url": { "type": "string", "description": "Article URL" },
      "analysis_type": {
        "type": "string",
        "enum": ["summary", "sentiment", "keywords", "full"],
        "default": "summary"
      }
    },
    "required": ["url"]
  }
}
```

### Slack Notifications

```json
{
  "name": "notify_team",
  "description": "Send notifications to team channels",
  "url": "https://hooks.zapier.com/hooks/catch/slack-notify",
  "timeout": 15000,
  "rateLimit": { "requests": 30, "window": 60000 },
  "input": {
    "type": "object",
    "properties": {
      "channel": { "type": "string", "description": "#channel-name" },
      "message": { "type": "string" },
      "priority": {
        "type": "string",
        "enum": ["low", "normal", "high"],
        "default": "normal"
      }
    },
    "required": ["channel", "message"]
  }
}
```

### Document Generation

```json
{
  "name": "generate_report",
  "description": "Generate PDF reports from data",
  "url": "https://make.com/webhook/generate-pdf",
  "timeout": 60000,
  "input": {
    "type": "object",
    "properties": {
      "template": { "type": "string" },
      "data": { "type": "object" },
      "format": { "type": "string", "enum": ["pdf", "docx"] }
    }
  },
  "output": {
    "binary": true,
    "contentType": "application/pdf"
  }
}
```

## 🚀 Future Roadmap

### Near-Term Enhancements

- **Webhook Signature Verification**: Validate incoming webhook signatures for security
- **Response Caching**: Cache responses for identical requests to reduce API calls
- **Connection Pooling**: Optimize HTTP connections for high-throughput scenarios
- **Prometheus Metrics**: Export detailed metrics for production monitoring

### Advanced Features

- **Auto-Discovery**: Automatically detect and configure tools from popular platforms
- **Visual Tool Builder**: Web UI for creating and testing webhook configurations
- **Team Management**: Multi-user authentication and permission systems
- **Cloud Registry**: Share and discover webhook tools across teams

### Platform Integrations

- **Native Platform Support**: Pre-built templates for n8n, Make.com, Zapier, etc.
- **OAuth Integration**: Simplified authentication flows for supported platforms
- **Batch Operations**: Support for bulk webhook calls and parallel processing
- **Real-time Subscriptions**: WebSocket support for live data feeds

## 🤝 Contributing

Contributions welcome! Please visit our [GitHub repository](https://github.com/tamler/wyreup-mcp) to:

- **Report Issues**: [GitHub Issues](https://github.com/tamler/wyreup-mcp/issues)
- **Submit Pull Requests**: [GitHub PRs](https://github.com/tamler/wyreup-mcp/pulls)
- **View Source**: [GitHub Repository](https://github.com/tamler/wyreup-mcp)

Key areas for contribution:

- **Platform Templates**: Pre-configured tool definitions for popular automation platforms
- **Performance Optimization**: Enhance retry logic, connection handling, and response processing
- **Security Features**: Webhook signature verification, request sanitization
- **Monitoring & Observability**: Enhanced metrics, logging, and debugging tools

## 📄 License

MIT License - Build amazing automations for AI agents!

---

**Transform your automation workflows into AI-ready tools in minutes, not hours.**
