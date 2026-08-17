# Roblox MCP Dashboard (VS Code extension)

Auto-opens the roblox-mcp dashboard as a chrome-less tab inside VS Code — no URL bar, similar
to "Simple Browser" — whenever a Roblox client connects.

## Behavior

- Polls `http://127.0.0.1:<port>/api/status` (same endpoint the dashboard itself polls) every
  `robloxMcpDashboard.pollIntervalMs` (default 3s).
- On the transition from **no client connected** to **a client connected**, it automatically
  opens (or reveals) the dashboard tab.
- If you **close the tab yourself**, auto-open is suppressed — it will not pop back up on
  future connects.
- Click the `Roblox MCP` status bar item (bottom right), or run **"Roblox MCP: Show Dashboard"**
  from the command palette, to reopen it manually — doing so also re-arms auto-open for future
  connects.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `robloxMcpDashboard.port` | `16384` | Must match `ROBLOX_MCP_PORT` if you've changed it from the default. |
| `robloxMcpDashboard.pollIntervalMs` | `3000` | How often to poll `/api/status`. |
| `robloxMcpDashboard.autoOpen` | `true` | Master switch for the auto-open behavior. |

## Running it

```sh
cd vscode-extension
npm install
npm run compile
```

Then press **F5** (with this folder open in VS Code) to launch an Extension Development Host
with it loaded, or run `npx vsce package` to produce a `.vsix` you can install via
**Extensions: Install from VSIX...**.
