#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

// Import from new lib modules
import { CONFIG_PATH, DEBUG, TRANSPORT, argv } from './lib/config.js';
import { loadManifest, validateManifest } from './lib/manifest.js';
import { WyreupMcpServer } from './lib/mcp-server.js';

// Replicate __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INIT_FLAG = argv.init;
const VALIDATE_FLAG = argv.validate;
const HELP_FLAG = argv.help || argv.h;
const SERVE_FLAG = argv.serve; // True if --serve is present, undefined otherwise

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
  --serve             Start the local MCP server (default action if no other primary flag is given)
  --config [file]     Path to a wyreup.json manifest (default: ./${CONFIG_PATH})
  --transport [type]  Communication transport: stdio or sse (default: stdio)
  --init              Create a starter wyreup.json in the current folder
  --validate          Check wyreup.json for structural issues
  --debug             Enable detailed logging for tool execution
  --help, -h          Show this help message

Transport modes:
  stdio               Standard input/output (for Claude Desktop and other MCP clients) [default]
  sse                 Server-Sent Events (for remote MCP clients) [coming soon]

  --publish           Upload tools to the WyreUP registry (coming soon)
  --proxy-mode        Enable secure proxy routing and secret injection (coming soon)
`);
  process.exit(0);
}

if (HELP_FLAG) {
  displayHelp();
}

// Determine if the server should start
// Server starts if:
// 1. SERVE_FLAG is explicitly true (argv.serve is true)
// 2. No other primary action flags (INIT_FLAG, VALIDATE_FLAG, HELP_FLAG) are true, and SERVE_FLAG is undefined (meaning no --serve but also no other action)
const shouldStartServer = SERVE_FLAG === true || (SERVE_FLAG === undefined && !INIT_FLAG && !VALIDATE_FLAG && !HELP_FLAG);


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


if (shouldStartServer) {
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
    const mcpServer = new WyreupMcpServer(toolsConfig, { DEBUG });
    try {
      await mcpServer.runStdio();
      // Server will run indefinitely in stdio mode
    } catch (error) {
      console.error(chalk.red(`Failed to start MCP server in stdio mode: ${error.message}`));
      process.exit(1);
    }
  } else if (TRANSPORT === 'sse') {
    // Run MCP server over SSE (not yet implemented)
    console.error(chalk.red('SSE transport is not yet implemented. Use --transport stdio'));
    process.exit(1);
  } else {
    console.error(chalk.red(`Unknown transport mode: ${TRANSPORT}`));
    process.exit(1);
  }
} else if (!INIT_FLAG && !HELP_FLAG && !VALIDATE_FLAG && SERVE_FLAG === false) {
    // This case handles when --no-serve is explicitly passed and no other action flag.
    console.log(chalk.yellow("Server not started due to --no-serve or other explicit action not taken."));
    console.log(chalk.cyan("Use 'wyreup-mcp --help' for command options."));
} else if (!INIT_FLAG && !HELP_FLAG && !VALIDATE_FLAG && SERVE_FLAG === undefined && process.argv.length === 2) {
    // No flags provided at all, default to starting the server was handled by shouldStartServer.
    // This block is more of a fallback or for clarity if shouldStartServer logic changes.
    // If shouldStartServer is false here, it means some condition wasn't met.
    // However, current shouldStartServer logic should make it true if no flags.
    // This specific condition might be redundant if shouldStartServer is robust.
    console.log(chalk.yellow("No specific action requested. Defaulting to server start (if not already handled)."));
    console.log(chalk.cyan("If server doesn't start, use 'wyreup-mcp --serve' or 'wyreup-mcp --help'."));
}