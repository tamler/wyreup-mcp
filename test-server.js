import { createMcpServer } from './lib/mcp-server.js'
import { loadManifest } from './lib/manifest.js'

async function startTestServer() {
  try {
    console.log('🚀 Starting WyreUP MCP Server test...')
    
    // Load the demo configuration
    const manifest = await loadManifest('./wyreup-demo.json')
    
    // Create server with debug enabled
    const server = createMcpServer(manifest, { DEBUG: true })
    
    // Start SSE server
    await server.runSse(3333, 'localhost')
    
    console.log('✅ Server is ready for testing!')
    console.log('📋 Run the test client with: node test-sse-client.js')
    
  } catch (error) {
    console.error('❌ Failed to start server:', error)
    process.exit(1)
  }
}

startTestServer()