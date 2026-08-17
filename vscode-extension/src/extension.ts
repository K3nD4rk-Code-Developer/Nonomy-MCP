import * as vscode from "vscode";
import * as http from "node:http";

interface StatusResponse {
  connected: boolean;
  clientCount: number;
}

let statusBarItem: vscode.StatusBarItem | undefined;
let pollTimer: ReturnType<typeof setInterval> | undefined;

// Once the user manually closes the dashboard tab, we stop auto-opening it
// on future connects until they explicitly reopen it via the command/button.
let suppressAutoOpen = false;
let lastConnected = false;

function getConfig() {
  const cfg = vscode.workspace.getConfiguration("robloxMcpDashboard");
  return {
    port: cfg.get<number>("port", 16384),
    pollIntervalMs: cfg.get<number>("pollIntervalMs", 3000),
    autoOpen: cfg.get<boolean>("autoOpen", true),
  };
}

function dashboardUrl(port: number): string {
  return `http://127.0.0.1:${port}/`;
}

function fetchStatus(port: number): Promise<StatusResponse | undefined> {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port, path: "/api/status", timeout: 1500 },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body) as StatusResponse);
          } catch {
            resolve(undefined);
          }
        });
      }
    );
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(undefined));
  });
}

// Our custom webview iframe never picked up live dashboard updates (its CSP
// and lack of scripting blocked the dashboard's own refresh/websocket logic).
// VS Code's built-in Simple Browser is a real browser context, so the
// dashboard updates itself normally.
async function revealOrCreatePanel(url: string) {
  await vscode.commands.executeCommand("simpleBrowser.show", url);
}

function isDashboardTab(tab: vscode.Tab): boolean {
  return tab.input instanceof vscode.TabInputWebview && tab.label === "Simple Browser";
}

function anyDashboardTabOpen(): boolean {
  return vscode.window.tabGroups.all.some((group) => group.tabs.some(isDashboardTab));
}

function updateStatusBar(connected: boolean) {
  if (!statusBarItem) return;
  statusBarItem.text = connected ? "$(circle-filled) Roblox MCP" : "$(circle-outline) Roblox MCP";
  statusBarItem.tooltip = connected
    ? "Roblox MCP: client connected — click to show dashboard"
    : "Roblox MCP: no client connected — click to show dashboard";
}

async function poll() {
  const { port, autoOpen } = getConfig();
  const status = await fetchStatus(port);
  const connected = !!status?.connected && status.clientCount > 0;

  if (connected && !lastConnected && autoOpen && !suppressAutoOpen) {
    void revealOrCreatePanel(dashboardUrl(port));
  }

  lastConnected = connected;
  updateStatusBar(connected);
}

export function activate(context: vscode.ExtensionContext) {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = "robloxMcpDashboard.show";
  statusBarItem.text = "$(circle-outline) Roblox MCP";
  statusBarItem.show();

  const showCommand = vscode.commands.registerCommand("robloxMcpDashboard.show", () => {
    const { port } = getConfig();
    suppressAutoOpen = false; // re-arm auto-open now that the user explicitly asked for it
    void revealOrCreatePanel(dashboardUrl(port));
  });

  let dashboardWasOpen = anyDashboardTabOpen();
  const tabsListener = vscode.window.tabGroups.onDidChangeTabs(() => {
    const open = anyDashboardTabOpen();
    if (dashboardWasOpen && !open) {
      // User closed the Simple Browser tab themselves -> don't auto-reopen
      // until they ask for it again.
      suppressAutoOpen = true;
    }
    dashboardWasOpen = open;
  });

  context.subscriptions.push(
    showCommand,
    statusBarItem,
    tabsListener,
    { dispose: () => pollTimer && clearInterval(pollTimer) }
  );

  const { pollIntervalMs } = getConfig();
  pollTimer = setInterval(poll, pollIntervalMs);
  void poll();
}

export function deactivate() {
  if (pollTimer) clearInterval(pollTimer);
}
