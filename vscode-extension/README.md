# Nonomy MCP (VS Code extension)

Runs the Nonomy MCP bridge server in the background and shows its live
dashboard as a VS Code editor tab (via the Webview API) instead of a browser
window at `http://localhost:16384`.

## How it works

- On activation, the extension forks the bundled server (`server/dist/index.js`,
  copied from the root project's `dist/` at build time) as a child process.
- **Nonomy MCP: Open Dashboard** (also available from the status bar item)
  opens a webview panel, waits for the server's HTTP API to come up, fetches
  its existing status page (`GET /`), and injects a `<base>` tag + CSP so the
  page's own relative `fetch('/api/status')` calls and asset requests resolve
  against `http://localhost:16384` from inside the webview sandbox. The
  server's dashboard markup itself is untouched — this extension doesn't
  duplicate it.
- **Nonomy MCP: Restart Server** kills and relaunches the child process.
- **Nonomy MCP: Show Server Logs** opens the "Nonomy MCP" output channel
  (the server's stdout/stderr).

## Developing

```
npm install
npm run build   # tsc compile + copies ../dist into server/dist
```

Then press **F5** (Run Extension) — this launches an Extension Development
Host window with the extension active. Run the command
**Nonomy MCP: Open Dashboard** from the Command Palette (Ctrl+Shift+P).

If you change the root server (`../src/index.ts`), rebuild it first
(`npm run build` in the repo root) then rerun `npm run build` here (or just
`node scripts/copy-server.js`) to pick up the new `dist/index.js`.

## Packaging as a .vsix

```
npm run package
```

Produces a `.vsix` you can install via the Command Palette →
**Extensions: Install from VSIX...**, or `code --install-extension <file>.vsix`.
