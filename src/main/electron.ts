import { app, BrowserWindow, ipcMain } from "electron";
import * as path from "node:path";

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
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
  if (process.platform !== "darwin") {
    app.quit();
  }
});
