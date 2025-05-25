# [WyreUP MCP Adapter](https://wyreup.com)

WyreUP MCP Adapter enables anyone to expose and control their automation workflows (e.g., n8n, Make.com, FlowiseAI) as agent-callable tools using the Model Context Protocol (MCP). This allows you to connect your existing automations to LLM agents. Learn more about WyreUP at [wyreup.com](https://wyreup.com).

This project provides a local MCP server that reads a `wyreup.json` manifest file to define and expose your automation tools.

## Features

- **Local MCP Server**: Runs on your machine over HTTP. Designed to be exposed securely via HTTPS using a reverse proxy (like Caddy or NGINX).
- **`wyreup.json` Manifest**: A simple JSON file to declare your automation tools, their inputs, outputs, direct URLs, authentication methods, and async behavior.
- **MCP Compliant**: Implements standard MCP discovery endpoints (`/mcp/capabilities`, `/mcp/tools`).
- **Tool Execution Proxy**: Forwards tool execution requests to their configured direct URLs, handling specified authentication.
- **Header Whitelisting**: Control which additional headers (beyond auth) are forwarded to your tools using `tool.headers_whitelist`. Defaults to `Authorization` and `X-Agent-ID` if no specific auth is defined for the tool.
- **Tool-Specific Authentication (v0.3.0)**:
  - Each tool can define an `auth` object specifying authentication type (`header`, `jwt`) and necessary credentials, or specify `authFrom` to securely load credentials from `~/.wyreup-secrets/<user>.json`.
  - The server automatically applies these authentication details when calling the tool's URL.
- **Async Tool Support (v0.2.0)**:
- Tools can be marked as `async: true`.
- Returns a `job_id` and `poll_url` for async tools.
- `GET /status/{job_id}` endpoint to check job status.
- Supports `callback_url` in the tool request payload for asynchronous result delivery.

- **GET Tool Execution (v0.2.0)**:
- Allows `GET /tools/{toolName}` to trigger tool execution if:
  - The tool's input schema is empty.
  - Or, query parameters are used to match tool input keys (e.g., `/tools/slugify?text=hello`).
- If a tool requires fields not found in query params, a `400` error is returned.
- **Binary/File Responses (v0.2.0)**:
- Tools can return binary data (e.g., images) by responding with a specific JSON structure:
  ```json
  {
    "binary": true,
    "contentType": "image/png",
    "data": "base64-encoded-string-of-the-file-content"
  }
  ```
- The MCP server will decode the base64 `data` and return a binary HTTP response with the specified `Content-Type`.

## Prerequisites

- Node.js (v14 or later recommended)
- npm (comes with Node.js)

## Installation

You can run the adapter directly using `npx` or install it globally.

**Using npx (recommended for quick use):**

```bash
npx wyreup-mcp
```

_(Note: The `npx wyreup-mcp` command will be fully functional once the package is published to npm. For local development, use `npm start`.)_

**Global Installation (optional):**

```bash
npm install -g .
# (Run this from the project root directory after cloning, or use 'npm link' for development)
# Then you can run 'wyreup-mcp' from any directory.
```

## Configuration

The server's host and port, as well as the manifest file path, can be configured.

**Configuration Priority for Host and Port:**

The server determines the host and port to use based on the following priority:

1.  **CLI Flags**: `--host` and `--port` (or `-p`).
2.  **Environment Variables**: `HOST` and `PORT`.
3.  **Defaults**: `localhost` for host, `3333` for port.

**Command-line Flags:**

- `--config <path>`: Specifies the path to your `wyreup.json` manifest file (default: `./wyreup.json`).
  - Example: `wyreup-mcp --config ./my-configs/custom-manifest.json`
- `--host <hostname>`: Hostname for the server to listen on (default: `localhost`).
  - Example: `wyreup-mcp --host 0.0.0.0`
- `--port, -p <number>`: Port for the server to listen on (default: `3333`).
  - Example: `wyreup-mcp --port 8080`
- `--init`: Creates a default `wyreup.json` manifest file in the current directory with example tools. If `wyreup.json` already exists, a warning is shown, and the file is not overwritten. The server will not start when this flag is used.
  - Example: `wyreup-mcp --init`
- `--validate`: Loads the specified (or default) `wyreup.json` file, checks its structure and content for required fields (including unique tool names). Prints a success message or lists errors with detailed paths and color-coding for better readability. If duplicate tool names are found, it will log a critical error and exit. The server will not start when this flag is used. You can use `--config` with `--validate`.
  - Example: `wyreup-mcp --validate`
  - Example: `wyreup-mcp --config ./my-tools.json --validate`
- `--debug`: Enables detailed logging for each tool execution, including the tool name, request body, and response status and body. Useful for troubleshooting tool interactions.
  - Example: `wyreup-mcp --debug`
  - Example: `wyreup-mcp --serve --debug`
- `--serve`: Explicitly starts the local MCP server. This is the default action if no other primary flag (`--init`, `--validate`, `--help`) is provided.
  - Example: `wyreup-mcp --serve`
- `--help`, `-h`: Displays the help message with all available CLI options.
  - Example: `wyreup-mcp --help`

If `wyreup-mcp` is run with no flags, the help message will be displayed.

**Environment Variables:**

You can also configure the server using environment variables. Create a `.env` file in the project root (this file is gitignored) by copying `.env.example`:

```bash
cp .env.example .env
```

Then edit `.env` with your desired values.

- `HOST`: Sets the hostname for the server (e.g., `HOST=0.0.0.0`).
- `PORT`: Sets the port for the server (e.g., `PORT=8080`).

**Environment Variable Interpolation in `wyreup.json`:**

The server supports environment variable interpolation in string values within the `wyreup.json` manifest itself. You can use `$VAR_NAME` or `${VAR_NAME}` syntax. If an environment variable is not found, a warning will be logged, and the placeholder will be replaced with an empty string.

This is particularly useful for sensitive data like API keys in tool `url` fields, or within `auth` object values (e.g., `auth.value` for header auth, `auth.token` for JWT). See `.env.example` for how to set these up.

Example:
If you have an environment variable `TOOL_API_KEY=yourSecretKey` (e.g., in your `.env` file), you can use it in `wyreup.json`:

```json
{
  "tools": [
    {
      "name": "secure-api-tool",
      "description": "Accesses a secure API.",
      "url": "https://your-domain.com/data?param=$SOME_OTHER_ENV_VAR",
      "auth": {
        "type": "header",
        "name": "X-Api-Key",
        "value": "$TOOL_API_KEY"
      },
      "input": {},
      "output": {}
    }
  ]
}
```

This `auth.value` will be resolved to: `yourSecretKey`.

**Example `wyreup.json` (Schema v0.3):**

All tools must define a fully-qualified `url` field. This design allows each tool to point to different external endpoints, supporting multiple automation platforms and services.

```json
{
  "tools": [
    {
      "name": "summarize-url",
      "description": "Summarizes any URL using an n8n automation.",
      "url": "https://your-domain.com/webhook/your-n8n-summarize-webhook-id",
      "input": {
        "type": "object",
        "properties": {
          "url": {
            "type": "string",
            "description": "The URL to summarize."
          }
        },
        "required": ["url"]
      },
      "output": {
        "type": "object",
        "properties": {
          "summary": {
            "type": "string",
            "description": "The summarized text."
          }
        },
        "required": ["summary"]
      },
      "public": true,
      "paid": false,
      "headers_whitelist": ["x-custom-header"],
      "async": false,
      "callback_supported": false
    },
    {
      "name": "secure-tool-example",
      "description": "An example tool requiring API key authentication.",
      "url": "https://your-domain.com/secure-endpoint",
      "auth": {
        "type": "header",
        "name": "X-API-KEY",
        "value": "your_secret_api_key_here_or_from_env"
      },
      "input": {
        "type": "object",
        "properties": { "query": { "type": "string" } }
      },
      "output": {
        "type": "object",
        "properties": { "data": { "type": "string" } }
      },
      "public": false
    },
    {
      "name": "secure-tool-external",
      "description": "Tool using external secrets.",
      "url": "https://your-domain.com/secure",
      "authFrom": {
        "user": "acme-user"
      },
      "input": {},
      "output": {}
    }
  ]
}
```

**Key fields:**

- `tools`: An array of tool objects.
  - `name`: Unique name for the tool (used in the URL). **Must be unique across all tools in the manifest.**
  - `description`: A human-readable description.
  - `url` (string, **required**): The full direct URL endpoint for this tool. Must be a fully-qualified URL. Environment variable interpolation is supported.
  - `method` (string, optional, default: `POST`): HTTP method for the tool. Must be one of: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`.
  - `auth` (object, optional): Defines the authentication method for the tool. Now supports structured types (see table below for supported types).
    - Values within the `auth` object (like `value`, `username`, `password`, `token`) also support environment variable interpolation.
  - `authFrom` (object, optional): Alternative to `auth` for loading credentials from external files. Mutually exclusive with `auth`.
    - `user` (string, required): Username for loading secrets from `~/.wyreup-secrets/<user>.json` using the tool name as the key.
  - `input`: JSON schema describing the expected input for the tool.
  - `output`: JSON schema describing the output of the tool.
  - `public` (boolean, optional, default: `false`): Flags for future use with a hosted registry.
  - `paid` (boolean, optional, default: `false`): Flags for future use with a hosted registry.
  - `headers_whitelist` (optional): An array of strings. If defined, only headers matching these (case-insensitive) will be forwarded from the incoming request to the tool's URL, _in addition_ to any headers generated by the `auth` mechanism. If not defined and no `auth` is specified, only `authorization` and `x-agent-id` headers from the original client request are forwarded. If `auth` or `authFrom` is used, those credentials are injected and override incoming headers. `Content-Type` is always forwarded for JSON payloads.
  - `async` (optional, boolean, default: `false`): If `true`, the tool execution will be handled asynchronously. The server will immediately return a job ID and polling URL.
  - `callback_supported` (optional, boolean, default: `false`): Indicates if the tool can utilize a `callback_url` provided in the request payload for asynchronous result delivery.

**Tool `auth` object types**

| auth.type | Required Fields | Description                         |
| --------- | --------------- | ----------------------------------- |
| header    | name, value     | Adds a custom HTTP header           |
| jwt       | token           | Sends Authorization: Bearer <token> |

🔐 **External Secrets Support**: Alternatively, you may define an `authFrom` object with a `user` field. This will load credentials from a file at `~/.wyreup-secrets/<user>.json` using the tool's name as the lookup key. This provides secure credential management by keeping sensitive data outside the manifest file.

**Example external secrets file** (`~/.wyreup-secrets/demo-user.json`):
```json
{
  "my-secure-tool": {
    "type": "header",
    "name": "X-API-Key",
    "value": "secret-api-key-from-external-file"
  },
  "another-tool": {
    "type": "jwt",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

## Usage

**Initializing a new project:**

To create a sample `wyreup.json` file in your current directory, run:

```bash
npx wyreup-mcp --init
# or if installed globally:
wyreup-mcp --init
```

This will generate a `wyreup.json` with example tools to get you started.

**Validating your manifest file:**

To check if your `wyreup.json` (or a custom-named manifest file) is correctly structured, run:

```bash
# Validate default wyreup.json in current directory
npx wyreup-mcp --validate

# Validate a custom manifest file
npx wyreup-mcp --config ./path/to/your/manifest.json --validate
```

This will output whether the manifest is valid or list any errors found, with enhanced error reporting for clarity.

**For local development (from the project root directory):**

1.  Ensure you have `nodemon` installed for auto-reloading (optional but recommended):
    ```bash
    npm install -g nodemon
    # or add as a dev dependency: npm install --save-dev nodemon
    # and update "start" script in package.json to "nodemon index.js"
    ```
2.  Start the server:
    ```bash
    npm start
    ```

This will start the MCP server, typically on `http://localhost:3333`.

**Running the server (after global install or via npx):**

Navigate to your project directory and run:

```bash
# Start the server (default action if wyreup.json exists and is valid)
# Looks for wyreup.json in current directory, runs on port 3333
wyreup-mcp
# or explicitly:
wyreup-mcp --serve

# Using npx:
npx wyreup-mcp
# or explicitly:
npx wyreup-mcp --serve


# Custom config file and port
wyreup-mcp --serve --config ./path/to/your/wyreup.json --port 3000
# or
npx wyreup-mcp --serve --config ./path/to/your/wyreup.json --port 3000
```

If you run `wyreup-mcp` or `npx wyreup-mcp` without any flags, it will attempt to start the server. If you want to see all options, use `wyreup-mcp --help`.

The server will output the address it's running on, the manifest file being used, and the available tool endpoints.

## API Endpoints

Once the server is running (e.g., on `http://localhost:3333`):

- **MCP Capabilities**: `GET /mcp/capabilities`
  - Returns information about the server and its capabilities.
- **MCP Tools List**: `GET /mcp/tools`
  - Lists all tools defined in `wyreup.json` with their MCP-compliant schemas.
- **Individual Tool Definition**: `GET /tools/{toolName}`
  - Example: `GET http://localhost:3333/tools/random_quote`
  - Returns the detailed definition of a specific tool as found in `wyreup.json`.
  - **Can also execute the tool via GET** if the tool's input schema is empty, or if all required inputs are provided as query parameters (e.g., `GET http://localhost:3333/tools/random_quote`). If inputs are required but not fully provided in the query, a `400` error is returned.
- **Tool Execution (POST)**: `POST /tools/{toolName}`
  - Example: `POST http://localhost:3333/tools/echo_message`
  - Executes the tool by sending the request (with JSON body) to the configured `tool.url`.
  - **Authentication**: If `tool.auth` is defined, the server automatically adds the necessary authentication (e.g., Authorization header for JWT, custom header for 'header' type) before sending the request.
  - **Header Forwarding**: In addition to auth headers, `Authorization` and `X-Agent-ID` from the original request are forwarded by default if no `tool.auth` is specified. This can be further customized per tool using the `headers_whitelist` property in `wyreup.json`.
  - **Synchronous Execution**: If the tool is not marked `async` and no `callback_url` is provided (for POST), or for GET executions, the server waits for the tool's URL to respond and returns the result directly.
    - **Binary Responses**: If the tool's endpoint responds with the special binary structure (see "Binary/File Responses" under Features), the server will return the decoded binary data with the correct `Content-Type`. Otherwise, a JSON response is returned.
  - **Asynchronous Execution (POST only)**: - If `tool.async` is `true` in `wyreup.json`, or if a `callback_url` is provided in the POST request body (e.g., `{"url": "...", "callback_url": "http://my-service/results"}`), the server will: - Immediately respond with `202 Accepted` and a JSON body like:
    `json
        {
          "status": "pending",
          "job_id": "job_123",
          "poll_url": "http://localhost:3333/status/job_123"
        }
        ` - The actual tool execution happens in the background. - If a `callback_url` was provided, the server will POST the final result (or error) to that URL once the tool execution is complete. The payload to the callback URL will be:
    `json
        // On success
        {
          "job_id": "job_123",
          "status": "completed",
          "tool_name": "echo_message",
          "result": { /* ... tool's output ... */ }
        }
        // On failure
        {
          "job_id": "job_123",
          "status": "failed",
          "tool_name": "echo_message",
          "error": { "message": "...", "details": "..." }
        }
        `
  - Failed synchronous tool executions return a normalized JSON error: `{ "error": "Human-readable message", "code": HTTP_STATUS_CODE }`.
- **Job Status**: `GET /status/{job_id}`
  - Example: `GET http://localhost:3333/status/job_123`
  - Returns the status of an asynchronously executed job.
  - Response structure:
    ```json
    // Pending
    {
      "job_id": "job_123",
      "status": "pending",
      "timestamp": "2023-10-27T10:30:00.000Z",
      "tool_name": "echo_message"
    }
    // Completed
    {
      "job_id": "job_123",
      "status": "completed",
      "timestamp": "2023-10-27T10:30:00.000Z",
      "tool_name": "echo_message",
      "result": { /* ... tool's output ... */ }
    }
    // Failed
    {
      "job_id": "job_123",
      "status": "failed",
      "timestamp": "2023-10-27T10:30:00.000Z",
      "tool_name": "echo_message",
      "error": { "message": "...", "details": "..." }
    }
    ```

**Quick start: Test your tools with curl**

```bash
curl http://localhost:3333/mcp/tools
curl -X POST http://localhost:3333/tools/echo_message \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello", "detail": "Test message"}'
```

- If the job is not found, returns a `404` error.

## Development

This project uses ES Modules.

1.  Clone the repository:
    ```bash
    git clone https://github.com/tamler/wyreup-mcp
    cd wyreup-mcp
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Run in development mode:
    ```bash
    npm start
    # (Consider using nodemon for auto-restarts)
    ```

**Note on Modules:** The project uses ES Modules (`import`/`export` syntax) and has been modularized with core logic residing in the `lib/` directory (e.g., `lib/config.js`, `lib/manifest.js`, `lib/jobs.js`, `lib/execute.js`). Ensure your Node.js version supports ES Modules (v14+ recommended).

**HTTP Client:** As of v0.1.0, the project uses undici (native Node.js HTTP client) instead of axios for all network requests.

## Production Deployment

**⚠️ Security Notice**: The MCP server runs over HTTP on localhost by default and is designed for local development. For production deployments, you should **never expose the MCP server directly** without TLS encryption. Instead, use a reverse proxy (like Caddy, NGINX, or Traefik) to:

- Terminate TLS/SSL encryption
- Provide secure HTTPS access
- Handle authentication and rate limiting
- Implement proper security headers

Example reverse proxy configuration for production use is beyond the scope of this README, but ensure proper security measures are in place before exposing the server to external networks.

## Future Enhancements (from Project Brief)

- Cloud publishing and hosted MCP registry.
- Support for optional authentication headers in proxy mode.
- Team features and secure auth options for hosted tools.

This project aims to simplify connecting no-code/low-code automation platforms to the growing ecosystem of LLM agents.
