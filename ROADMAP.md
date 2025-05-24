# WyreUP MCP Roadmap

This roadmap outlines planned features, priorities, and architectural considerations to evolve WyreUP MCP from a basic local tool server to a robust automation-agent integration platform.

---

## ✅ v0.1.0 – Local-First Release

**Status:** Complete

- [x] CLI: `--serve`, `--init`, `--validate`, `--config`, `--help`
- [x] Manifest: `wyreup.json` schema, multi-tool support
- [x] MCP-compliant routes: `/mcp/tools`, `/mcp/capabilities`, `/tools/{tool}`
- [x] Tool proxy execution via webhook
- [x] Configurable `HOST` and `PORT` via flags or env
- [x] Example tools using `https://wyreup.com/tools-mock/`
- [x] Graceful logging and error handling

---

## ✅ v0.1.x – Core Refinements

**Status:** Complete

- [x] Tool name collision detection (prevent duplicates, exit on error)
- [x] Forward select request headers (`Authorization`, `X-Agent-ID`)
- [x] Normalize response errors (`{ "error": "message", "code": HTTP_STATUS_CODE }`)
- [x] CLI: Add `--debug` flag for verbose tool execution logging
- [x] Improve `--validate` error messages (detailed paths, color-coding, tool identifiers)
- [x] Optional `GET` execution for mock/demo tools
- [x] Support `tool.headers_whitelist` in `wyreup.json` for header forwarding control - *Implemented*

---

## 🟡 Near-Term Suggestions

These enhancements are small but high-leverage improvements that can be considered part of v0.2.x or used to tighten up the server UX and tooling:

- [x] Modularize `index.js` into logical components (e.g., `lib/config.js`, `lib/manifest.js`, `lib/jobs.js`, `lib/execute.js`)
- [ ] Add `--worker` CLI flag or background polling loop for processing pending async jobs
- [ ] Validate tool inputs against `input` schema using `ajv` or equivalent
- [ ] Improve internal logging and execution timing summaries (per tool call)
- [ ] Add `--list-jobs` or `/jobs` endpoint for dev visibility of job queue

---

## 🚀 v0.2.0 – Async Execution Support

**Status:** In Progress

- [x] Return `status: pending` + `job_id` for long-running tools - *Scaffolded*
- [x] Add `/status/{job_id}` polling endpoint - *Scaffolded*
- [x] In-memory job store (later Redis or pluggable backend) - *Scaffolded (in-memory)*
- [x] Support `callback_url` in tool call payload - *Scaffolded*
- [x] Extend manifest to support `"async": true`, `"callback_supported": true` - *Schema updated*
- [ ] Add support for GET-based tool execution for simple/demonstration tools
- [ ] Add support for binary or file-based responses (e.g., image generation)

---

## 🔐 v0.3.0 – Hosted Features & Preparation for Monetization

- [ ] Flag: `--publish` (upload manifest to WyreUP registry) *(coming soon)*
- [ ] Flag: `--proxy-mode` (call automation via secure proxy) *(coming soon)*
- [ ] Backend support for user auth / API keys
- [ ] Web dashboard to manage tools, view logs, and share links
- [ ] Explore: `/tools/explore` public listing endpoint

---

## 🧠 Future Features & R&D

- [ ] Input/output schema runtime validation
- [ ] Token-scoped tool execution (auth per tool)
- [ ] Rate limiting and analytics (Pro tier)
- [ ] Agent session memory support
- [ ] Templates or presets for common tool types
- [ ] Tool usage audit logs
- [ ] CLI and API test harness (ping every tool, assert shape)
- [ ] JSON Schema validation
      🟡 Not implemented — Useful for strict input contracts but may not be necessary for all tools

---

## 🧪 Experimental Concepts

- [ ] Tool chaining: output of one tool feeds into another
- [ ] Multi-agent tool delegation framework
- [ ] P2P/mesh tool discovery
- [ ] GPT-generated `wyreup.json` assistant

---

> Contributions and feedback welcome. This roadmap reflects current direction but will evolve with real-world usage and community input.