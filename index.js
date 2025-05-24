#!/usr/bin/env node
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

// Import from new lib modules
import { PORT, HOST, BASE_URL, CONFIG_PATH, DEBUG, argv } from './lib/config.js';
import { loadManifest, validateManifest } from './lib/manifest.js';
import { createJob, getJob, jobs } from './lib/jobs.js';
import { executeTool, executeToolAndCallback } from './lib/execute.js';

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
  --host [hostname]   Hostname to bind the server to (default: ${HOST}, or HOST env var)
  --port, -p [number] Port to run the server on (default: ${PORT}, or PORT env var)
  --init              Create a starter wyreup.json in the current folder
  --validate          Check wyreup.json for structural issues
  --debug             Enable detailed logging for tool execution
  --help, -h          Show this help message

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
  console.log(chalk.blue(`Attempting to start server with manifest: ${CONFIG_PATH}`));
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

  const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const pathname = parsedUrl.pathname;
    const urlParts = pathname.split('/').filter(part => part.length > 0);

    // GET /status/:job_id
    if (req.method === 'GET' && urlParts.length === 2 && urlParts[0] === 'status') {
      const jobId = urlParts[1];
      const job = getJob(jobId);

      if (DEBUG) console.log(chalk.blueBright(`[DEBUG] Status check for Job ID: ${chalk.cyan(jobId)}`));

      if (job) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        const response = {
          job_id: jobId,
          status: job.status,
          timestamp: job.timestamp,
          tool_name: job.toolName,
        };
        if (job.result) response.result = job.result;
        if (job.error) response.error = job.error;
        if (DEBUG) console.log(chalk.blueBright(`[DEBUG] Job found: ${JSON.stringify(response, null, 2)}`));
        res.end(JSON.stringify(response));
      } else {
        if (DEBUG) console.log(chalk.yellowBright(`[DEBUG] Job not found: ${jobId}`));
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Job not found', code: 404, job_id: jobId }));
      }
    }
    // GET /mcp/capabilities
    else if (req.method === 'GET' && pathname === '/mcp/capabilities') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        mcp_version: "0.1.0",
        name: toolsConfig.name || "WyreUP MCP Adapter", // Use name from manifest if available
        description: toolsConfig.description || "Exposes automation workflows as MCP tools.", // Use desc from manifest
        capabilities: { tools: true, resources: false },
        authentication: { type: "none" },
        documentation_url: toolsConfig.documentation_url || "https://github.com/wyreup/mcp-adapter"
      }));
    }
    // GET /mcp/tools
    else if (req.method === 'GET' && pathname === '/mcp/tools') {
      if (toolsConfig.tools && toolsConfig.tools.length > 0) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(toolsConfig.tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.input,
          output_schema: tool.output,
        }))));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' }); // Return empty array if no tools
        res.end(JSON.stringify([]));
      }
    }
    // GET /tools/:toolName (Tool definition OR execution)
    else if (req.method === 'GET' && urlParts.length === 2 && urlParts[0] === 'tools' && toolsConfig.tools) {
      const toolName = urlParts[1];
      const tool = toolsConfig.tools.find(t => t.name === toolName);

      if (tool) {
        const queryParams = Object.fromEntries(parsedUrl.searchParams);
        const toolInputSchema = tool.input || { type: "object", properties: {}, required: [] };
        const inputProperties = toolInputSchema.properties || {};
        const requiredFields = toolInputSchema.required || [];

        let attemptExecution = false;
        if (Object.keys(inputProperties).length === 0) { // Condition 1: Tool takes no input
          attemptExecution = true;
        } else if (Object.keys(queryParams).length > 0) { // Condition 2: Query params are present, attempt to match
          attemptExecution = true;
        }

        if (attemptExecution) {
          const actualInputs = {};
          const missingFields = [];

          if (Object.keys(inputProperties).length > 0) { // Only validate if tool expects inputs
            for (const field of requiredFields) {
              if (queryParams[field] === undefined) {
                missingFields.push(field);
              } else {
                actualInputs[field] = queryParams[field];
              }
            }
            // Populate optional fields if present in queryParams and defined in schema, only if all required fields are met
            if (missingFields.length === 0) {
                for (const key in inputProperties) {
                    if (queryParams[key] !== undefined && actualInputs[key] === undefined) {
                        actualInputs[key] = queryParams[key];
                    }
                }
            }
          }

          if (missingFields.length > 0) {
            if (DEBUG) console.log(chalk.yellowBright(`[DEBUG] GET tool ${toolName}: Missing required fields: ${missingFields.join(', ')}`));
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `Missing required input fields: ${missingFields.join(', ')}`, code: 400 }));
          } else {
            // Execute the tool
            if (DEBUG) console.log(chalk.blueBright(`[DEBUG] Executing GET tool: ${chalk.cyan(toolName)} with params: ${JSON.stringify(actualInputs)}`));
            try {
              const result = await executeTool(tool, actualInputs, req.headers, { DEBUG, toolsBaseUrl: toolsConfig.base_url });
              if (result.success) {
                if (result.data && result.data.binary === true && result.data.contentType && result.data.data) {
                  try {
                    const binaryData = Buffer.from(result.data.data, 'base64');
                    res.writeHead(result.status || 200, {
                      'Content-Type': result.data.contentType,
                      'Content-Length': binaryData.length
                    });
                    res.end(binaryData);
                  } catch (e) {
                    if (DEBUG) console.error(chalk.redBright(`[DEBUG] Error decoding base64 data for GET ${toolName}: ${e.message}`));
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: "Failed to decode binary data from tool response", code: 500 }));
                  }
                } else {
                  res.writeHead(result.status || 200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify(result.data));
                }
              } else {
                res.writeHead(result.status || 500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: result.error, details: result.data, code: result.status || 500 }));
              }
            } catch (execError) {
              if (DEBUG) console.error(chalk.redBright(`[DEBUG] Error executing GET tool ${toolName}: ${execError.message}`));
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: `Tool execution failed: ${execError.message}`, code: 500 }));
            }
          }
        } else {
          // Fallback: No attempt to execute (e.g. tool has inputs, no query params), so return tool definition
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(tool));
        }
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Tool not found' }));
      }
    }
    // POST /tools/:toolName (Tool execution)
    else if (req.method === 'POST' && urlParts.length === 2 && urlParts[0] === 'tools' && toolsConfig.tools) {
      const toolName = urlParts[1];
      const tool = toolsConfig.tools.find(t => t.name === toolName);

      if (tool) {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', async () => {
          try {
            const requestBody = body ? JSON.parse(body) : {};
            const callbackUrl = requestBody.callback_url;

            if (tool.async || callbackUrl) {
              const jobId = createJob(tool.name, requestBody, callbackUrl, req.headers, BASE_URL);
              const job = getJob(jobId); // Get the created job details

              if (DEBUG) {
                console.log(chalk.blueBright(`[DEBUG] Queued async tool: ${chalk.cyan(toolName)}, Job ID: ${jobId}`));
                console.log(chalk.blueBright(`[DEBUG] Job details: ${JSON.stringify(job, null, 2)}`));
              } else {
                console.log(`Queued async request for tool '${toolName}', Job ID: ${jobId}`);
              }

              res.writeHead(202, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                status: 'pending',
                job_id: jobId,
                poll_url: job.poll_url
              }));

              if (callbackUrl) {
                // Offload actual execution for callback
                executeToolAndCallback(jobId, tool, requestBody, callbackUrl, req.headers, { DEBUG, toolsBaseUrl: toolsConfig.base_url })
                    .catch(err => console.error(chalk.red(`Error in detached executeToolAndCallback for job ${jobId}: ${err.message}`)));
              } else if (tool.async && !callbackUrl) {
                console.log(chalk.yellow(`[INFO] Job ${jobId} for tool ${tool.name} is pending and requires a worker to process or polling.`));
                // For purely async without callback, a worker would pick this up.
                // Or, it can be executed on first poll if designed that way.
                // For now, it just stays in 'pending' state.
              }
            } else { // Synchronous execution
              if (DEBUG) console.log(chalk.blueBright(`[DEBUG] Executing sync tool: ${chalk.cyan(toolName)}`));
              const result = await executeTool(tool, requestBody, req.headers, { DEBUG, toolsBaseUrl: toolsConfig.base_url });
              if (result.success) {
                // Handle potential binary response
                if (result.data && result.data.binary === true && result.data.contentType && result.data.data) {
                  try {
                    const binaryData = Buffer.from(result.data.data, 'base64');
                    res.writeHead(result.status || 200, {
                      'Content-Type': result.data.contentType,
                      'Content-Length': binaryData.length
                    });
                    res.end(binaryData);
                  } catch (e) {
                    if (DEBUG) console.error(chalk.redBright(`[DEBUG] Error decoding base64 data for POST ${toolName}: ${e.message}`));
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: "Failed to decode binary data from tool response", code: 500 }));
                  }
                } else {
                  // Standard JSON response
                  res.writeHead(result.status || 200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify(result.data));
                }
              } else {
                res.writeHead(result.status || 500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: result.error, details: result.data, code: result.status || 500 }));
              }
            }
          } catch (parseError) {
            if (DEBUG) console.error(chalk.redBright(`[DEBUG] Error parsing request body for ${toolName}: ${parseError.message}`));
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid JSON in request body', details: parseError.message }));
          }
        });
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Tool not found' }));
      }
    }
    // Fallback for unhandled routes
    else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found' }));
    }
  });

  server.listen(PORT, HOST, () => {
    console.log(chalk.green(`WyreUP MCP Server running at ${BASE_URL}`));
    console.log(chalk.yellow(`Using manifest: ${path.resolve(process.cwd(), CONFIG_PATH)}`));
    if (DEBUG) console.log(chalk.magentaBright('DEBUG mode is enabled. Verbose logging active.'));
    if (toolsConfig.tools && toolsConfig.tools.length > 0) {
        console.log(chalk.cyan('Available tools:'));
        toolsConfig.tools.forEach(tool => {
            console.log(chalk.cyan(`  - ${tool.name} (${BASE_URL}/tools/${tool.name})`));
        });
    } else {
        console.log(chalk.yellow('No tools currently configured in the manifest.'));
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(chalk.red(`Error: Port ${PORT} is already in use on ${HOST}.`));
      console.error(chalk.yellow('Please try a different port using --port <number> or check if another service is using it.'));
    } else {
      console.error(chalk.red(`Server error: ${err.message}`));
    }
    process.exit(1);
  });

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