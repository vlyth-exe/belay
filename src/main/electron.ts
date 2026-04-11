import { app, BrowserWindow, ipcMain, dialog } from "electron";
import * as path from "node:path";
import { connectionManager } from "./acp/connection-manager.js";
import {
  loadSessionMessages,
  saveSessionMessages,
  deleteSessionMessages,
} from "./persistence.js";
import { fetchRegistry } from "./acp/registry.js";
import type { RegistryAgent } from "./acp/registry.js";
import {
  listInstalled,
  installHarness,
  uninstallHarness,
  updateHarness,
} from "./acp/harness-store.js";

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  // Determine icon path based on whether app is packaged
  const iconPath = !app.isPackaged
    ? path.join(__dirname, "..", "..", "public", "Belay.png")
    : path.join(__dirname, "..", "renderer", "Belay.png");

  mainWindow = new BrowserWindow({
    width: 1200,

    height: 800,

    minWidth: 800,

    minHeight: 600,

    frame: false,

    backgroundColor: "#0a0a0a",

    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),

      contextIsolation: true,

      nodeIntegration: false,
    },

    title: "Belay",

    show: false,
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
  });

  // In development, load from the Vite dev server
  if (process.env.NODE_ENV === "development" || !app.isPackaged) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    // In production, load the built renderer files
    mainWindow.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Set the main window for the ACP connection manager
  connectionManager.setMainWindow(mainWindow);
}

// ── IPC handlers for window controls ──────────────────────────────────

ipcMain.on("window:minimize", () => {
  mainWindow?.minimize();
});

ipcMain.on("window:maximize", () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.on("window:close", () => {
  mainWindow?.close();
});

ipcMain.handle("window:isMaximized", () => {
  return mainWindow?.isMaximized() ?? false;
});

// ── IPC handlers for project operations ──────────────────────────────

ipcMain.handle("project:openDirectory", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "Open Project Folder",
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle("dialog:openFile", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    title: "Select Executable",
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// ── IPC handlers for session persistence ──────────────────────────────

ipcMain.handle("session:loadMessages", async (_event, sessionId: string) => {
  return loadSessionMessages(sessionId);
});

ipcMain.handle(
  "session:saveMessages",
  async (_event, sessionId: string, messages: Record<string, unknown>[]) => {
    await saveSessionMessages(sessionId, messages);
  },
);

ipcMain.handle("session:deleteMessages", async (_event, sessionId: string) => {
  await deleteSessionMessages(sessionId);
});

// ── IPC handlers for ACP operations ──────────────────────────────────

ipcMain.handle("acp:listRegistry", async () => {
  try {
    const agents = await fetchRegistry();
    return agents;
  } catch {
    return [];
  }
});

ipcMain.handle("acp:listInstalled", () => {
  return listInstalled();
});

ipcMain.handle(
  "acp:installHarness",
  async (_event, manifest: RegistryAgent) => {
    console.log(
      `[ACP] acp:installHarness called for: ${manifest?.name} (${manifest?.id})`,
    );
    installHarness(manifest);
  },
);

ipcMain.handle("acp:uninstallHarness", async (_event, agentId: string) => {
  uninstallHarness(agentId);
});

ipcMain.handle(
  "acp:updateHarness",
  async (
    _event,
    agentId: string,
    updates: Partial<
      Pick<
        import("./acp/harness-store.js").HarnessConfig,
        | "cwd"
        | "env"
        | "mcpServers"
        | "args"
        | "useWsl"
        | "wslDistro"
        | "command"
        | "linuxCommand"
        | "linuxArgs"
      >
    >,
  ) => {
    updateHarness(agentId, updates);
  },
);

ipcMain.handle("acp:connect", async (_event, agentId: string) => {
  await connectionManager.connect(agentId);
});

ipcMain.handle("acp:disconnect", async (_event, agentId: string) => {
  await connectionManager.disconnect(agentId);
});

ipcMain.handle("acp:getConnectionState", (_event, agentId: string) => {
  return connectionManager.getConnectionState(agentId);
});

ipcMain.handle(
  "acp:createSession",
  async (_event, agentId: string, cwd?: string) => {
    return connectionManager.createSession(agentId, cwd);
  },
);

ipcMain.handle(
  "acp:sendPrompt",
  async (_event, agentId: string, sessionId: string, content: string) => {
    await connectionManager.sendPrompt(agentId, sessionId, content);
  },
);

ipcMain.handle(
  "acp:cancelPrompt",
  async (_event, agentId: string, sessionId: string) => {
    await connectionManager.cancelPrompt(agentId, sessionId);
  },
);

ipcMain.handle(
  "acp:setSessionMode",
  async (_event, agentId: string, sessionId: string, modeId: string) => {
    await connectionManager.setSessionMode(agentId, sessionId, modeId);
  },
);

ipcMain.handle(
  "acp:respondPermission",
  async (_event, requestId: string, optionId: string) => {
    connectionManager.respondPermission(requestId, optionId);
  },
);

// Notify renderer when maximize state changes
function broadcastMaximizeState(): void {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.webContents.send("window:onMaximize");
  } else {
    mainWindow.webContents.send("window:onUnmaximize");
  }
}

app.whenReady().then(() => {
  createWindow();

  // Attach maximize listeners after window is created
  if (mainWindow) {
    mainWindow.on("maximize", broadcastMaximizeState);
    mainWindow.on("unmaximize", broadcastMaximizeState);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  connectionManager.dispose();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
