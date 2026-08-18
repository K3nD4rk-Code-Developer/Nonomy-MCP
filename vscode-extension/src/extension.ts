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

// Set while we're closing the dashboard tab ourselves (on client disconnect),
// so the tab-close listener doesn't mistake it for a user-initiated close
// and re-arm the auto-open suppression.
let closingProgrammatically = false;

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

function allDashboardTabs(): vscode.Tab[] {
  return vscode.window.tabGroups.all.flatMap((group) => group.tabs.filter(isDashboardTab));
}

async function closeDashboardTabs() {
  const tabs = allDashboardTabs();
  if (tabs.length === 0) return;
  closingProgrammatically = true;
  try {
    await vscode.window.tabGroups.close(tabs);
  } finally {
    closingProgrammatically = false;
  }
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

  if (connected && !lastConnected && autoOpen && !suppressAutoOpen && !anyDashboardTabOpen()) {
    // Only open when nothing is open yet -- calling simpleBrowser.show while a
    // tab already exists is what caused extra tabs to spawn (a known VS Code
    // race, microsoft/vscode#182795).
    void revealOrCreatePanel(dashboardUrl(port));
  } else if (!connected && lastConnected) {
    void closeDashboardTabs();
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
    // A single explicit click is safe to pass straight through to
    // simpleBrowser.show -- it reveals/focuses the existing tab when one is
    // already open. It's the automatic poll-driven path that must avoid
    // calling show() while a tab is already open (see poll()).
    void revealOrCreatePanel(dashboardUrl(port));
  });

  let dashboardWasOpen = anyDashboardTabOpen();
  const tabsListener = vscode.window.tabGroups.onDidChangeTabs(() => {
    const open = anyDashboardTabOpen();
    if (dashboardWasOpen && !open && !closingProgrammatically) {
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
