# Nonomy MCP

An MCP server that bridges LLMs and a running Roblox Game Client — execute code, inspect scripts, spy on remotes, and more.

## Features

- **Code Execution & Data Querying** — Run Lua and fetch data from the game client.
- **Script Inspection** — Decompile LocalScripts/ModuleScripts and search across sources.
- **Instance Search** — CSS-like selectors via `QueryDescendants` and hierarchy trees.
- **Remote Spy** — [Cobalt](https://github.com/notpoiu/cobalt) integration to intercept, log, block, and ignore Remotes/Bindables.
- **Multi-Client** — Connect multiple Roblox clients simultaneously; target each by `clientId`. Dashboard at `http://localhost:16384/`.
- **Screenshot** — Capture Roblox window screenshots (Windows only); relayed to the primary host when running as a secondary.
- **Primary / Secondary** — Multiple MCP instances auto-coordinate; secondaries relay through the primary with automatic promotion. Supports remote primaries via `--baseurl`.

## Prerequisites

- A Roblox executor supporting `loadstring`, `request`, and (preferably) `WebSocket`.
- Node.js ≥ 18.

## Quick Start

```bash
pnpm install && pnpm run build
```

### Add to your AI Client

**Cursor** — Settings > Features > MCP > Add: name `nonomy-mcp`, type `command`, command `node /path/to/MCPServer/dist/index.js`.

**Claude Desktop / Antigravity** — Add to your JSON config:
```json
{
  "mcpServers": {
    "nonomy-mcp": {
      "command": "node",
      "args": ["/path/to/MCPServer/dist/index.js"]
    }
  }
}
```

**Codex** — Settings > MCP Settings > Add server: name `nonomy-mcp`, type `STDIO`, command `node`, args `/path/to/MCPServer/dist/index.js`.

### Connect from Roblox

Run `connector.luau` in your executor, or use the quick loader:
```lua
-- getgenv().BridgeURL = "10.0.0.4:16384" (defaults to localhost, change if needed)
-- getgenv().DisableWebSocket = true
-- getgenv().DisableInitialScriptDecompMapping = true (disables script decompilation untill you run a script related tool)
loadstring(game:HttpGet("https://raw.githubusercontent.com/notpoiu/roblox-executor-mcp/refs/heads/main/connector.luau"))()
```

## Tools

| Category | Tool | Description |
|---|---|---|
| **Execution** | `execute` | Run Lua code (actions) |
| | `execute-file` | Run a local `.luau`/`.lua` file |
| | `get-data-by-code` | Run Lua code and return results |
| **Scripts** | `get-script-content` | Decompile a script's source |
| | `search-scripts-sources` | Search all scripts by source content |
| **Introspection** | `list-clients` | List connected clients |
| | `get-console-output` | Retrieve console logs |
| | `search-instances` | CSS-like instance search |
| | `get-descendants-tree` | Instance hierarchy tree |
| | `get-game-info` | Game metadata |
| **Remote Spy** | `ensure-remote-spy` | Load Cobalt (required first) |
| | `get-remote-spy-logs` | Get captured remote call logs |
| | `clear-remote-spy-logs` | Clear all logs |
| | `block-remote` | Block/unblock a remote |
| | `ignore-remote` | Ignore/unignore a remote |
| **Screenshot** | `list-roblox-windows` | List visible Roblox windows and their PIDs |
| | `screenshot-window` | Capture a Roblox window by PID (Windows only) |
| **GUI Interactions** |`click-button` | Simulate a button click on a Textbutton/ImageButtton |
| | `type-text-box` | Interact with a textbox |

## Primary / Secondary Mode

By default the server starts as a **primary** on port `16384`. If that port is already taken it automatically becomes a **secondary** that relays all tool calls through the primary. When the primary disconnects, a secondary promotes itself.

### Remote primary (`--baseurl`)

Connect this instance as a secondary to a **remote** primary — useful when your AI client is on macOS/Linux but Roblox is on a Windows machine:

```json
{
  "mcpServers": {
    "nonomy-mcp": {
      "command": "node",
      "args": [
        "/path/to/MCPServer/dist/index.js",
        "--baseurl",
        "http://<primary-host>:16384"
      ]
    }
  }
}
```

| Scenario | Result |
|---|---|
| `--baseurl` set, remote reachable | Runs as secondary relay to that host |
| `--baseurl` set, remote **unreachable** | Falls back to starting as primary locally |
| `--baseurl` set, remote unreachable **and** local port taken | Becomes secondary to the local primary |
| No `--baseurl` | Default: primary, or localhost secondary if port is in use |

> **Note:** `screenshot-window` and `list-roblox-windows` are forwarded over HTTP to the primary, so a Mac secondary can capture windows running on a Windows primary.

## Security Note

- **Arbitrary code execution** — Only use with trusted LLMs; any connected AI client can run code in your Roblox session.
- **Do not expose the HTTP server to the internet.** Port `16384` is unauthenticated. Anyone who can reach it can execute code in your game, take screenshots of your screen, and read client data. If you need cross-machine access (e.g. `--baseurl`), use a **local network / VPN** or an **SSH tunnel** — never forward the port through a public router or cloud firewall.
