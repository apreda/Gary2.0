## BallDontLie MCP Server – Setup Guide

This enables your AI assistant (e.g., Claude Desktop) to discover and call BallDontLie’s sports API via MCP (Model Context Protocol). No code changes in the app are required; configuration happens in your MCP-compatible client.

### 1) Prerequisites
- Your BallDontLie API key (keep server key out of the repo).
- An MCP client (e.g., Claude Desktop).

### 2) Claude Desktop configuration
Edit your Claude Desktop config file:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

Add (or merge) the following:
```json
{
  "mcpServers": {
    "balldontlie-api": {
      "url": "https://mcp.balldontlie.io/mcp",
      "transport": "http",
      "headers": {
        "Authorization": "<YOUR_BALLDONTLIE_API_KEY>"
      }
    }
  }
}
```

Notes:
- Do not commit your key to source control.
- The Authorization header is forwarded by the hosted MCP server to the backend API.

### 3) What you can ask the assistant
After saving the config and restarting the client, try:
- “What are today’s NFL games?”
- “Show me Patrick Mahomes’ season stats.”
- “Get the current NBA standings.”
- “Fetch WNBA player injuries for tonight’s games.”
- “Get NCAAF week 3 odds summaries.”

The server exposes 120+ tools across NBA, WNBA, NFL, MLB, NHL, NCAAF, and NCAAB (we’re currently skipping EPL).

### 4) App integration (optional)
Our app already calls BallDontLie directly with the server env `BALLDONTLIE_API_KEY`. MCP is for assistant-side discovery, validation, and ad‑hoc analysis. No additional changes are required in Vercel.

### 5) Security
- Keep the API key in your MCP client config only.
- Do not place secrets inside this repository.

### 6) Troubleshooting
- 401 Unauthorized: verify `Authorization` header contains a valid key.
- 403 Forbidden: ensure your tier allows the requested endpoint.
- 429 Too Many Requests: slow down or upgrade plan.
- Check the MCP server GitHub for details: https://github.com/balldontlie-api/mcp


