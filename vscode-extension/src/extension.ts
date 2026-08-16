import * as vscode from "vscode";
import * as http from "http";
import * as cp from "child_process";
import * as path from "path";

const WS_PORT = 16384;

let serverProc: cp.ChildProcess | undefined;
let outputChannel: vscode.OutputChannel;
let dashboardPanel: vscode.WebviewPanel | undefined;
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel("Nonomy MCP");
  context.subscriptions.push(outputChannel);

  const serverEntry = context.asAbsolutePath(path.join("server", "dist", "index.js"));
  startServer(serverEntry);

  context.subscriptions.push(
    vscode.commands.registerCommand("nonomyMcp.openDashboard", () => openDashboard()),
    vscode.commands.registerCommand("nonomyMcp.restartServer", () => {
      outputChannel.appendLine("[Extension] Restarting server...");
      stopServer();
      startServer(serverEntry);
      dashboardPanel?.dispose();
    }),
    vscode.commands.registerCommand("nonomyMcp.showLogs", () => outputChannel.show())
  );

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = "$(radio-tower) Nonomy MCP";
  statusBarItem.command = "nonomyMcp.openDashboard";
  statusBarItem.tooltip = "Open Nonomy MCP Dashboard";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);
}

export function deactivate() {
  stopServer();
}

// ─── Server lifecycle ────────────────────────────────────────────────────────

function startServer(entry: string) {
  outputChannel.appendLine(`[Extension] Starting server: ${entry}`);
  serverProc = cp.fork(entry, [], {
    silent: true,
    // The forked process's cwd affects nothing here since the server only
    // writes to its own os.tmpdir(), but set it for predictability anyway.
    cwd: path.dirname(entry),
  });

  serverProc.stdout?.on("data", (d) => outputChannel.append(d.toString()));
  serverProc.stderr?.on("data", (d) => outputChannel.append(d.toString()));

  serverProc.on("error", (err) => {
    outputChannel.appendLine(`[Extension] Server process error: ${err.message}`);
    vscode.window.showErrorMessage(`Nonomy MCP server failed to start: ${err.message}`);
  });

  serverProc.on("exit", (code, signal) => {
    outputChannel.appendLine(`[Extension] Server exited (code=${code}, signal=${signal})`);
  });
}

function stopServer() {
  serverProc?.kill();
  serverProc = undefined;
}

// ─── Dashboard webview ────────────────────────────────────────────────────────

async function openDashboard() {
  if (dashboardPanel) {
    dashboardPanel.reveal(vscode.ViewColumn.One);
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    "nonomyMcpDashboard",
    "Nonomy MCP",
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true }
  );
  dashboardPanel = panel;
  panel.onDidDispose(() => {
    dashboardPanel = undefined;
  });

  panel.webview.html = loadingHtml();

  const ready = await waitForServer();
  if (!panel.visible && panel !== dashboardPanel) return; // disposed while waiting
  if (!ready) {
    panel.webview.html = errorHtml();
    return;
  }

  try {
    const html = await fetchDashboardHtml();
    panel.webview.html = injectWebviewShims(html);
  } catch (err: any) {
    panel.webview.html = errorHtml(err?.message);
  }
}

function waitForServer(retries = 40, delayMs = 250): Promise<boolean> {
  return (async () => {
    for (let i = 0; i < retries; i++) {
      if (await pingServer()) return true;
      await new Promise((r) => setTimeout(r, delayMs));
    }
    return false;
  })();
}

function pingServer(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${WS_PORT}/api/status`, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function fetchDashboardHtml(): Promise<string> {
  return new Promise((resolve, reject) => {
    http
      .get(`http://localhost:${WS_PORT}/`, (res) => {
        let body = "";
        res.setEncoding("utf-8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve(body));
      })
      .on("error", reject);
  });
}

/**
 * The dashboard HTML (served by the Node server) uses relative URLs
 * ("/api/status", "/api/avatar?...") and loads Google Fonts. A webview has
 * its own origin, so we inject a <base> tag pointing back at the local
 * server and a CSP that allows exactly what the page needs. The page's own
 * script/markup is otherwise untouched.
 */
function injectWebviewShims(html: string): string {
  const base = `http://localhost:${WS_PORT}/`;
  const csp = [
    `default-src 'none'`,
    `style-src 'unsafe-inline' https://fonts.googleapis.com`,
    `font-src https://fonts.gstatic.com`,
    `img-src https: data: ${base}`,
    `script-src 'unsafe-inline'`,
    `connect-src ${base}`,
  ].join("; ");

  const inject = `<base href="${base}"><meta http-equiv="Content-Security-Policy" content="${csp}">`;
  return html.replace("<head>", `<head>${inject}`);
}

function loadingHtml(): string {
  return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;padding:2rem;color:#a1a1aa;background:#09090b;">
    Starting Nonomy MCP server on port ${WS_PORT}…
  </body></html>`;
}

function errorHtml(detail?: string): string {
  return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;padding:2rem;color:#f87171;background:#09090b;">
    <p>Could not reach the Nonomy MCP server on <code>localhost:${WS_PORT}</code>.</p>
    ${detail ? `<p><code>${escapeHtml(detail)}</code></p>` : ""}
    <p style="color:#a1a1aa;">Check the "Nonomy MCP" output channel (Nonomy MCP: Show Server Logs) and try "Nonomy MCP: Restart Server".</p>
  </body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
