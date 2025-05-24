Project Brief: WyreUP MCP Adapter

Document Version: 0.1.3
Date: 2025-05-23
Project Lead/Contact: Project Lead

⸻

0 | Purpose

Enable anyone to expose and control their automation workflows (e.g. n8n, Make.com, flowiseai.com, etc) as agent-callable tools using the Model Context Protocol (MCP). The system should support both local self-hosted usage and optional cloud-hosted proxy/distribution by WyreUP.

⸻

1 | Target Users
	•	Automation Users: Individuals running workflows on n8n or Make.com who want to connect them to LLM agents.
	•	Developers: Those who want to wrap automation in agent-accessible services.
	•	Teams: Organizations who want centralized management of agent tools with secure key handling and proxying.

⸻

2 | Key Features

Local MCP Server (default)
	•	Installable via npx wyreup-mcp
	•	Reads from a wyreup.json manifest file
	•	Exposes local MCP server with endpoints like http://localhost:3333/tools/{tool}
	•	No key sharing or external exposure
	•	Unlimited tools per user
	•	Auth is handled by the underlying webhook tool (e.g., n8n supports Basic, Header, and JWT auth)

Hosted MCP Proxy (optional)
	•	WyreUP hosts tool.json manifests at https://wyreup.com/tools/{username}/{tool}
	•	Proxy-based relay mode for key injection and secured automation workflows
	•	Public or private tools (via auth tokens)
	•	Supports paid add-ons via CLI flags and API key authentication

wyreup.json Manifest Format
	•	Simple declarative JSON file describing each automation as a tool
	•	Includes tool name, description, input/output schema, and webhook endpoint
	•	Supports variable interpolation (e.g., $API_KEY)

⸻

3 | Tool Naming & Discovery

CLI Naming
	•	Single package: npx wyreup-mcp
	•	Invoked with flags like --config, --serve, --publish, --proxy-mode, --team, --secure-auth

URL Structure
	•	Local: http://localhost:3333/tools/{tool}
	•	Hosted: https://wyreup.com/tools/{username}/{tool}
	•	Follows MCP spec as closely as possible for compatibility

⸻

4 | Security Considerations
	•	Local use: All keys and endpoints remain private to user
	•	Hosted use:
	•	Environment-variable-based secrets (e.g., $API_KEY)
	•	Token-based access control for private tools (optional, only for hosted tools)
	•	Proxy injection only; never store user secrets directly
	•	Authentication is free and handled natively by platforms like n8n

⸻

5 | Strategic Goals
	•	Simplify MCP tooling for everyday automation users
	•	Enable agent-app interoperability with no-code platforms
	•	Lay groundwork for a tool registry and proxy service with monetization potential
	•	Preserve compatibility with MCP standards for tool discovery and agent support

⸻

6 | Monetization Plan (Paid CLI Flags)
	•	--publish: Upload tools to WyreUP cloud MCP registry
	•	--proxy-mode: Enable secure key injection proxying
	•	--team=org: Enable multi-user/team management
	•	--secure-auth: Add WyreUP-managed token-auth endpoints (optional)

Note: Authentication is free and handled natively by platforms like n8n.

⸻

7 | Public Registry and Marketplace Support
	•	Tools can be published as “public” to allow free use and sharing
	•	Public tools are listed on wyreup.com/tools/explore or equivalent UI
	•	Marketplace for selling automations is a planned future phase:
	•	Users can offer tools as paid services
	•	WyreUP may act as secure broker via proxy/token mechanisms
	•	Support for usage metering, billing, and key management under premium plans

⸻

8 | wyreup.json Schema (v0.1)

{
  "username": "demo-user",
  "base_url": "https://wyreup.com/tools-mock/",
  "tools": [
    {
      "name": "random-quote",
      "description": "Returns a random quote. Use this to verify your MCP tool setup.",
      "webhook": "random-quote",
      "input": {},
      "output": {
        "quote": "string"
      },
      "public": true,
      "paid": false
    },
    {
      "name": "current-time",
      "description": "Returns the current UTC time in ISO format.",
      "webhook": "current-time",
      "input": {},
      "output": {
        "time": "string"
      },
      "public": true,
      "paid": false
    }
  ]
}

⸻

9 | Milestones

✅ Finalize wyreup.json schema spec

✅ Design CLI tool (npx wyreup-mcp)

🔜 Build local MCP server functionality

🔜 Add cloud publishing + hosted MCP registry (WyreUP backend)

🔜 Launch https://wyreup.com/tools builder UI

🔜 Public tools listing and shareable tool discovery view

🔜 Begin groundwork for marketplace infrastructure

🔜 Deploy mock tools to https://wyreup.com/tools-mock/ for user onboarding and testing
