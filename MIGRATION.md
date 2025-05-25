# Migration to MCP SDK

This document outlines the migration from HTTP-based server to a standards-compliant MCP server using the official MCP SDK.

## What Changed

### Architecture
- **Before**: Custom HTTP server with `/mcp/capabilities`, `/mcp/tools`, `/tools/{name}` endpoints
- **After**: Standards-compliant MCP server using `@modelcontextprotocol/sdk`

### Transport Modes
- **Before**: HTTP only (port 3333 by default)
- **After**: 
  - **Stdio** (default) - for Claude Desktop and other local MCP clients
  - **SSE** (coming soon) - for remote MCP clients
  - **HTTP removed** - eliminated custom HTTP implementation

### Default Behavior
- **Before**: `--transport http` (default), required `--host` and `--port` configuration
- **After**: `--transport stdio` (default), no network configuration needed

## Benefits

1. **Claude Desktop Compatible**: Works directly with Claude Desktop MCP configuration
2. **Standards Compliant**: Follows official MCP specification
3. **Simpler Deployment**: No network exposure concerns with stdio mode
4. **Better Security**: Local stdio transport is inherently secure
5. **Future Ready**: Ready for SSE transport for remote access

## File Changes

### New Files
- `lib/mcp-server.js` - MCP SDK server implementation

### Modified Files
- `package.json` - Added `@modelcontextprotocol/sdk` dependency
- `lib/config.js` - Updated transport options, removed HTTP-specific config
- `index.js` - Replaced HTTP server with MCP server initialization
- `README.md` - Updated documentation for MCP-focused approach

### Removed Functionality
- Custom HTTP endpoints (`/mcp/*`, `/tools/*`, `/status/*`)
- Async job handling with polling (not part of standard MCP)
- HTTP-specific configuration (`--host`, `--port`)

## Migration Path for Users

### Claude Desktop Integration
Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "wyreup": {
      "command": "node",
      "args": ["/path/to/wyreup-mcp/index.js"],
      "env": {
        "DEBUG": "false"
      }
    }
  }
}
```

### Command Line Changes
- **Old**: `wyreup-mcp --host 0.0.0.0 --port 8080`
- **New**: `wyreup-mcp` (stdio mode is default)

### Tool Configuration
No changes needed to `wyreup.json` manifest files - all existing tool configurations remain compatible.

## Testing

The refactored server:
- ✅ Loads and validates manifests correctly
- ✅ Starts in stdio mode by default
- ✅ Maintains all existing tool execution logic
- ✅ Ready for Claude Desktop integration
- ✅ Preserves authentication and environment variable features

## Next Steps

1. Test with Claude Desktop integration
2. Implement SSE transport for remote access
3. Consider adding async job support to MCP specification