import { app, BrowserWindow, ipcMain, dialog, Notification } from "electron";
import * as path from "node:path";
import * as fs from "node:fs";
import { connectionManager } from "./acp/connection-manager.js";
import { terminalManager } from "./terminal.js";
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
import * as git from "./git.js";

// Set the App User Model ID so Windows shows "Belay" (not "electron")
// as the notification source and groups the taskbar icon correctly.
app.setAppUserModelId("Belay");

// Determine icon path based on whether app is packaged
const iconPath = !app.isPackaged
  ? path.join(__dirname, "..", "..", "public", "Belay.png")
  : path.join(__dirname, "..", "renderer", "Belay.png");

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
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
    terminalManager.killAll();
    mainWindow = null;
  });

  // Set the main window for the ACP connection manager
  connectionManager.setMainWindow(mainWindow);

  // Set the main window for the terminal manager
  terminalManager.setMainWindow(mainWindow);
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

// ── Notifications ─────────────────────────────────────────────────────

ipcMain.on(
  "notification:send",
  (
    _event,
    title: string,
    body: string,
    sessionVisible: boolean,
    projectId: string,
    sessionId: string,
  ) => {
    // Only notify if the user can't see the response:
    // - session is not the active/visible one, OR
    // - the window is minimized or unfocused
    const windowObscured =
      !mainWindow || mainWindow.isMinimized() || !mainWindow.isFocused();
    if (!sessionVisible || windowObscured) {
      const notification = new Notification({ title, body, icon: iconPath });
      notification.on("click", () => {
        // Restore and focus the window
        if (mainWindow) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.focus();
        }
        // Tell the renderer to navigate to the relevant session
        mainWindow?.webContents.send("notification:click", {
          projectId,
          sessionId,
        });
      });
      notification.show();
    }
  },
);

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

// ── IPC handlers for directory explorer ──────────────────────────────

ipcMain.handle("fs:readDir", async (_event, dirPath: string) => {
  try {
    const entries = await fs.promises.readdir(dirPath, {
      withFileTypes: true,
    });
    const statPromises = entries
      .filter((entry) => !entry.name.startsWith("."))
      .map(async (entry) => {
        try {
          const fullPath = path.join(dirPath, entry.name);
          const stat = await fs.promises.stat(fullPath);
          return {
            name: entry.name,
            isDirectory: stat.isDirectory(),
            isFile: stat.isFile(),
            size: stat.size,
            modifiedAt: stat.mtimeMs,
          };
        } catch {
          return null;
        }
      });
    const results = (await Promise.all(statPromises)).filter(
      (e): e is NonNullable<typeof e> => e !== null,
    );
    // Sort: directories first, then alphabetical
    results.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
    return results;
  } catch {
    return [];
  }
});

// ── IPC handlers for git operations ──────────────────────────────────

ipcMain.handle("git:isRepo", async (_event, dirPath: string) => {
  return git.isRepo(dirPath);
});

ipcMain.handle("git:status", async (_event, dirPath: string) => {
  return git.getStatus(dirPath);
});

ipcMain.handle(
  "git:log",
  async (_event, dirPath: string, maxCount?: number) => {
    return git.getLog(dirPath, maxCount);
  },
);

ipcMain.handle("git:branches", async (_event, dirPath: string) => {
  return git.getBranches(dirPath);
});

ipcMain.handle(
  "git:diffSummary",
  async (_event, dirPath: string, staged?: boolean) => {
    return git.getDiffSummary(dirPath, staged);
  },
);

ipcMain.handle(
  "git:stage",
  async (_event, dirPath: string, ...files: string[]) => {
    return git.stage(dirPath, ...files);
  },
);

ipcMain.handle(
  "git:unstage",
  async (_event, dirPath: string, ...files: string[]) => {
    return git.unstage(dirPath, ...files);
  },
);

ipcMain.handle(
  "git:commit",
  async (_event, dirPath: string, message: string) => {
    return git.commit(dirPath, message);
  },
);

ipcMain.handle("git:push", async (_event, dirPath: string) => {
  return git.push(dirPath);
});

ipcMain.handle("git:pull", async (_event, dirPath: string) => {
  return git.pull(dirPath);
});

ipcMain.handle("git:fetch", async (_event, dirPath: string) => {
  return git.fetch(dirPath);
});

ipcMain.handle(
  "git:checkout",
  async (_event, dirPath: string, branch: string) => {
    return git.checkout(dirPath, branch);
  },
);

ipcMain.handle(
  "git:createBranch",
  async (_event, dirPath: string, name: string, checkout?: boolean) => {
    return git.createBranch(dirPath, name, checkout);
  },
);

ipcMain.handle("git:listWorktrees", async (_event, dirPath: string) => {
  return git.listWorktrees(dirPath);
});

ipcMain.handle(
  "git:createWorktree",
  async (
    _event,
    dirPath: string,
    branch: string,
    targetPath: string,
  ) => {
    return git.createWorktree(dirPath, branch, targetPath);
  },
);

ipcMain.handle(
  "git:removeWorktree",
  async (
    _event,
    dirPath: string,
    worktreePath: string,
    force?: boolean,
  ) => {
    return git.removeWorktree(dirPath, worktreePath, force);
  },
);

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

// ── IPC handlers for terminal operations ──────────────────────────────

ipcMain.handle(
  "terminal:spawn",
  async (
    _event,
    id: string,
    cwd?: string,
    options?: {
      shell?: string;
      args?: string[];
      isWsl?: boolean;
      wslDistro?: string;
    },
  ) => {
    terminalManager.spawn(id, cwd, options);
  },
);

ipcMain.on("terminal:write", (_event, id: string, data: string) => {
  terminalManager.write(id, data);
});

ipcMain.on(
  "terminal:resize",
  (_event, id: string, cols: number, rows: number) => {
    terminalManager.resize(id, cols, rows);
  },
);

ipcMain.on("terminal:kill", (_event, id: string) => {
  terminalManager.kill(id);
});

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
  terminalManager.dispose();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
