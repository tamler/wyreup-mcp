#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

// Import from new lib modules
import { CONFIG_PATH, DEBUG, TRANSPORT, PORT, HOST, argv } from './lib/config.js';
import { loadManifest, validateManifest } from './lib/manifest.js';
import { createMcpServer } from './lib/mcp-server.js';

// Replicate __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INIT_FLAG = argv.init;
const VALIDATE_FLAG = argv.validate;
const HELP_FLAG = argv.help || argv.h;

let toolsConfig = {};

function createDefaultManifest() {
  const defaultManifestPath = path.resolve(process.cwd(), 'wyreup.json');
  if (fs.existsSync(defaultManifestPath)) {
    console.warn(chalk.yellow(`Warning: ${defaultManifestPath} already exists. No action taken.`));
    process.exit(0);
  }

  const defaultContent = {
    username: "your-username",
    base_url: "https://wyreup.com/tools-mock/", // This will be interpolated by manifest loader
    tools: [
      {
        name: "random-quote",
        description: "Fetches a random quote.",
        webhook: "random-quote", // Relative to base_url
        input: { type: "object", properties: {}, required: [] },
        output: {
          type: "object",
          properties: {
            quote: { type: "string", description: "The random quote." },
            author: { type: "string", description: "The author of the quote." }
          },
          required: ["quote", "author"]
        },
        public: true,
        paid: false
      },
      {
        name: "current-time",
        description: "Gets the current server time.",
        webhook: "current-time",
        input: {
          type: "object",
          properties: {
            timezone: { type: "string", description: "Optional timezone in TZ format (e.g., America/New_York). Defaults to UTC." }
          },
          required: []
        },
        output: {
          type: "object",
          properties: {
            time: { type: "string", format: "date-time", description: "The current time." },
            timezone_used: { type: "string", description: "The timezone used for the calculation." }
          },
          required: ["time", "timezone_used"]
        },
        public: true,
        paid: false
      }
    ]
  };

  try {
    fs.writeFileSync(defaultManifestPath, JSON.stringify(defaultContent, null, 2));
    console.log(chalk.green(`Successfully created default manifest at ${defaultManifestPath}`));
    process.exit(0);
  } catch (error) {
    console.error(chalk.red(`Error creating default manifest: ${error.message}`));
    process.exit(1);
  }
}

if (INIT_FLAG) {
  createDefaultManifest();
}

function displayHelp() {
  console.log(`
Usage: wyreup-mcp [options]

Options:
  --config [file]     Path to a wyreup.json manifest (default: ./${CONFIG_PATH})
  --transport [type]  Communication transport: stdio or sse (default: stdio)
  --port [number]     Port for SSE transport (default: 3333)
  --host [host]       Host for SSE transport (default: localhost)
  --init              Create a starter wyreup.json in the current folder
  --validate          Check wyreup.json for structural issues
  --debug             Enable detailed logging for tool execution
  --help, -h          Show this help message

Transport modes:
  stdio               Standard input/output (for Claude Desktop and other MCP clients) [default]
  sse                 Server-Sent Events (for remote MCP clients via HTTP)

Note: Server starts automatically unless --init, --validate, or --help is specified.
`);
  process.exit(0);
}

if (HELP_FLAG) {
  displayHelp();
}

if (VALIDATE_FLAG) {
  console.log(chalk.blue(`Validating manifest: ${path.resolve(process.cwd(), CONFIG_PATH)}`));
  // Pass relevant flags to manifest loading/validation
  const loadedConfig = loadManifest(CONFIG_PATH, {
    VALIDATE_FLAG: true, // Explicitly in validate mode
    SERVE_FLAG: false,   // Not serving
    shouldStartServer: false, // Not starting server
    configFlagUsed: !!argv.config, // Was --config used?
    INIT_FLAG: false // Not initializing
  });
  // validateManifest is called within loadManifest. If it fails, loadManifest exits.
  // If we reach here, it means the manifest structure is valid as per loadManifest's internal check.
  // We call validateManifest again just to get the boolean for the success message,
  // though loadManifest would have already printed errors and exited if invalid.
  if (validateManifest(loadedConfig, path.resolve(process.cwd(), CONFIG_PATH), { VALIDATE_FLAG: true, SERVE_FLAG: false, shouldStartServer: false })) {
      console.log(chalk.green.bold('\nManifest valid.'));
  } else {
      // This else block might not be reached if loadManifest exits on validation failure.
      // Kept for logical completeness, but loadManifest handles the exit.
      console.error(chalk.red.bold('\nManifest invalid. Please check the errors above.'));
      process.exit(1); // Ensure exit if somehow reached
  }
  process.exit(0); // Exit after validation
}

// Server starts by default unless a specific action flag is provided
const shouldStartServer = !INIT_FLAG && !VALIDATE_FLAG && !HELP_FLAG;

async function startServer() {
  console.log(chalk.blue(`Attempting to start MCP server with manifest: ${CONFIG_PATH}`));
  console.log(chalk.blue(`Transport mode: ${TRANSPORT}`));
  
  toolsConfig = loadManifest(CONFIG_PATH, {
    VALIDATE_FLAG: false, // Not just validating
    SERVE_FLAG: true, // Attempting to serve
    shouldStartServer: true, // Server should start
    configFlagUsed: !!argv.config,
    INIT_FLAG: false
  });

  if (!toolsConfig) { // Should not happen if loadManifest exits on error
    console.error(chalk.red("Failed to load tools configuration. Server cannot start."));
    process.exit(1);
  }

  // Handle different transport modes
  if (TRANSPORT === 'stdio') {
    // Run MCP server over stdio
    const mcpServer = createMcpServer(toolsConfig, { DEBUG });
    try {
      await mcpServer.runStdio();
      // Server will run indefinitely in stdio mode
    } catch (error) {
      console.error(chalk.red(`Failed to start MCP server in stdio mode: ${error.message}`));
      process.exit(1);
    }
  } else if (TRANSPORT === 'sse') {
    // Run MCP server over SSE
    const mcpServer = createMcpServer(toolsConfig, { DEBUG });
    try {
      await mcpServer.runSse(PORT, HOST);
      // Server will run indefinitely in SSE mode
    } catch (error) {
      console.error(chalk.red(`Failed to start MCP server in SSE mode: ${error.message}`));
      process.exit(1);
    }
  } else {
    console.error(chalk.red(`Unknown transport mode: ${TRANSPORT}`));
    process.exit(1);
  }
}

if (shouldStartServer) {
  startServer().catch(error => {
    console.error(chalk.red(`Server startup failed: ${error.message}`));
    process.exit(1);
  });
}