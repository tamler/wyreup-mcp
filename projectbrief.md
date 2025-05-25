8 | wyreup.json Schema (v0.2)

Each tool must define a fully qualified `url`. The `base_url` field has been removed to simplify tool resolution logic and support distributed/federated tools natively.

{
  "tools": [
    {
      "name": "random-quote",
      "description": "Returns a random quote. Use this to verify your MCP tool setup.",
      "url": "https://wyreup.com/tools-mock/random-quote",
      "input": {},
      "output": {
        "quote": "string"
      },
      "public": true,
      "paid": false,
      "auth": "optional-api-key"
    },
    {
      "name": "current-time",
      "description": "Returns the current UTC time in ISO format.",
      "url": "https://wyreup.com/tools-mock/current-time",
      "input": {},
      "output": {
        "time": "string"
      },
      "public": true,
      "paid": false
    }
  ]
}

This model favors clarity and LLM parsing simplicity. Each tool must include a full `url`. An optional `auth` field may be used to provide an API key or credential used by the MCP system to call the tool webhook securely.
