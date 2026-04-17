import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  // App info
  appVersion: () => ipcRenderer.invoke("app:version"),

  // Project
  projectOpenDirectory: () => ipcRenderer.invoke("project:openDirectory"),

  // Dialog
  dialogOpenFile: () => ipcRenderer.invoke("dialog:openFile"),

  // Session persistence
  sessionLoadMessages: (sessionId: string) =>
    ipcRenderer.invoke("session:loadMessages", sessionId),
  sessionSaveMessages: (sessionId: string, messages: unknown[]) =>
    ipcRenderer.invoke("session:saveMessages", sessionId, messages),
  sessionDeleteMessages: (sessionId: string) =>
    ipcRenderer.invoke("session:deleteMessages", sessionId),

  // Project storage (.belay/)
  storageInit: (projectPath: string) =>
    ipcRenderer.invoke("storage:init", projectPath),
  storageLoadSettings: (projectPath: string) =>
    ipcRenderer.invoke("storage:loadSettings", projectPath),
  storageSaveSettings: (
    projectPath: string,
    settings: Record<string, unknown>,
  ) => ipcRenderer.invoke("storage:saveSettings", projectPath, settings),
  storageLoadState: (projectPath: string) =>
    ipcRenderer.invoke("storage:loadState", projectPath),
  storageSaveState: (projectPath: string, state: Record<string, unknown>) =>
    ipcRenderer.invoke("storage:saveState", projectPath, state),
  storageLoadMessages: (projectPath: string, sessionId: string) =>
    ipcRenderer.invoke("storage:loadMessages", projectPath, sessionId),
  storageSaveMessages: (
    projectPath: string,
    sessionId: string,
    messages: unknown[],
  ) =>
    ipcRenderer.invoke(
      "storage:saveMessages",
      projectPath,
      sessionId,
      messages,
    ),
  storageDeleteMessages: (projectPath: string, sessionId: string) =>
    ipcRenderer.invoke("storage:deleteMessages", projectPath, sessionId),
  storageListSessions: (projectPath: string) =>
    ipcRenderer.invoke("storage:listSessions", projectPath),
  storageGetInfo: (projectPath: string) =>
    ipcRenderer.invoke("storage:getInfo", projectPath),

  // Notifications
  notificationSend: (
    title: string,
    body: string,
    sessionVisible: boolean,
    projectId: string,
    sessionId: string,
  ) =>
    ipcRenderer.send(
      "notification:send",
      title,
      body,
      sessionVisible,
      projectId,
      sessionId,
    ),

  onNotificationClick: (
    callback: (data: { projectId: string; sessionId: string }) => void,
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { projectId: string; sessionId: string },
    ) => callback(data);
    ipcRenderer.on("notification:click", handler);
    return () => ipcRenderer.removeListener("notification:click", handler);
  },

  // Window controls
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),
  isMaximized: () => ipcRenderer.invoke("window:isMaximized"),
  onMaximize: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("window:onMaximize", handler);
    return () => ipcRenderer.removeListener("window:onMaximize", handler);
  },
  onUnmaximize: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on("window:onUnmaximize", handler);
    return () => ipcRenderer.removeListener("window:onUnmaximize", handler);
  },

  // ACP - Registry & Harness
  acpListRegistry: () => ipcRenderer.invoke("acp:listRegistry"),
  acpListInstalled: () => ipcRenderer.invoke("acp:listInstalled"),
  acpInstallHarness: (manifest: unknown) =>
    ipcRenderer.invoke("acp:installHarness", manifest),
  acpUninstallHarness: (agentId: string) =>
    ipcRenderer.invoke("acp:uninstallHarness", agentId),
  acpUpdateHarness: (
    agentId: string,
    updates: {
      cwd?: string;
      env?: Record<string, string>;
      mcpServers?: unknown[];
      args?: string[];
      command?: string;
      useWsl?: boolean;
      wslDistro?: string;
      linuxCommand?: string;
      linuxArgs?: string[];
    },
  ) => ipcRenderer.invoke("acp:updateHarness", agentId, updates),

  // ACP - Connection lifecycle
  acpConnect: (agentId: string) => ipcRenderer.invoke("acp:connect", agentId),
  acpDisconnect: (agentId: string) =>
    ipcRenderer.invoke("acp:disconnect", agentId),
  acpGetConnectionState: (agentId: string) =>
    ipcRenderer.invoke("acp:getConnectionState", agentId),
  acpOnConnectionStateChange: (
    callback: (event: { agentId: string; state: string }) => void,
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { agentId: string; state: string },
    ) => callback(data);
    ipcRenderer.on("acp:onConnectionStateChange", handler);
    return () =>
      ipcRenderer.removeListener("acp:onConnectionStateChange", handler);
  },

  // ACP - Errors
  acpOnError: (
    callback: (event: {
      agentId: string;
      message: string;
      stderr: string;
    }) => void,
  ) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      data: { agentId: string; message: string; stderr: string },
    ) => callback(data);
    ipcRenderer.on("acp:onError", handler);
    return () => ipcRenderer.removeListener("acp:onError", handler);
  },

  // ACP - Session
  acpCreateSession: (agentId: string, cwd?: string) =>
    ipcRenderer.invoke("acp:createSession", agentId, cwd),

  // ACP - Prompt
  acpSendPrompt: (agentId: string, sessionId: string, content: string) =>
    ipcRenderer.invoke("acp:sendPrompt", agentId, sessionId, content),
  acpCancelPrompt: (agentId: string, sessionId: string) =>
    ipcRenderer.invoke("acp:cancelPrompt", agentId, sessionId),
  acpSetSessionMode: (agentId: string, sessionId: string, modeId: string) =>
    ipcRenderer.invoke("acp:setSessionMode", agentId, sessionId, modeId),

  // ACP - Streaming updates
  acpOnUpdate: (callback: (update: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, update: unknown) =>
      callback(update);
    ipcRenderer.on("acp:onUpdate", handler);
    return () => ipcRenderer.removeListener("acp:onUpdate", handler);
  },

  // ACP - Permissions
  acpOnPermissionRequest: (callback: (request: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, request: unknown) =>
      callback(request);
    ipcRenderer.on("acp:onPermissionRequest", handler);
    return () => ipcRenderer.removeListener("acp:onPermissionRequest", handler);
  },
  acpRespondPermission: (requestId: string, optionId: string) =>
    ipcRenderer.invoke("acp:respondPermission", requestId, optionId),

  // File system
  fsReadFile: (filePath: string) =>
    ipcRenderer.invoke("fs:readFile", filePath),
  fsReadDir: (dirPath: string, showHidden: boolean = false) =>
    ipcRenderer.invoke("fs:readDir", dirPath, showHidden),

  // Git
  gitIsRepo: (dirPath: string) => ipcRenderer.invoke("git:isRepo", dirPath),
  gitStatus: (dirPath: string) => ipcRenderer.invoke("git:status", dirPath),
  gitLog: (dirPath: string, maxCount?: number) =>
    ipcRenderer.invoke("git:log", dirPath, maxCount),
  gitBranches: (dirPath: string) => ipcRenderer.invoke("git:branches", dirPath),
  gitDiffSummary: (dirPath: string, staged?: boolean) =>
    ipcRenderer.invoke("git:diffSummary", dirPath, staged),
  gitStage: (dirPath: string, ...files: string[]) =>
    ipcRenderer.invoke("git:stage", dirPath, ...files),
  gitUnstage: (dirPath: string, ...files: string[]) =>
    ipcRenderer.invoke("git:unstage", dirPath, ...files),
  gitCommit: (dirPath: string, message: string) =>
    ipcRenderer.invoke("git:commit", dirPath, message),
  gitPush: (dirPath: string) => ipcRenderer.invoke("git:push", dirPath),
  gitPull: (dirPath: string) => ipcRenderer.invoke("git:pull", dirPath),
  gitFetch: (dirPath: string) => ipcRenderer.invoke("git:fetch", dirPath),
  gitCheckout: (dirPath: string, branch: string) =>
    ipcRenderer.invoke("git:checkout", dirPath, branch),
  gitCreateBranch: (dirPath: string, name: string, checkout?: boolean) =>
    ipcRenderer.invoke("git:createBranch", dirPath, name, checkout),
  gitListWorktrees: (dirPath: string) =>
    ipcRenderer.invoke("git:listWorktrees", dirPath),
  gitCreateWorktree: (dirPath: string, branch: string, targetPath: string) =>
    ipcRenderer.invoke("git:createWorktree", dirPath, branch, targetPath),
  gitRemoveWorktree: (dirPath: string, worktreePath: string, force?: boolean) =>
    ipcRenderer.invoke("git:removeWorktree", dirPath, worktreePath, force),

  // Terminal
  terminalSpawn: (
    id: string,
    cwd?: string,
    options?: {
      shell?: string;
      args?: string[];
      isWsl?: boolean;
      wslDistro?: string;
    },
    cols?: number,
    rows?: number,
  ) => ipcRenderer.invoke("terminal:spawn", id, cwd, options, cols, rows),
  terminalWrite: (id: string, data: string) =>
    ipcRenderer.send("terminal:write", id, data),
  terminalResize: (id: string, cols: number, rows: number) =>
    ipcRenderer.send("terminal:resize", id, cols, rows),
  terminalKill: (id: string) => ipcRenderer.send("terminal:kill", id),
  onTerminalData: (id: string, callback: (data: string) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: { id: string; data: string },
    ) => {
      if (payload.id === id) callback(payload.data);
    };
    ipcRenderer.on("terminal:data", handler);
    return () => ipcRenderer.removeListener("terminal:data", handler);
  },
  onTerminalExit: (id: string, callback: (exitCode: number) => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: { id: string; exitCode: number },
    ) => {
      if (payload.id === id) callback(payload.exitCode);
    };
    ipcRenderer.on("terminal:exit", handler);
    return () => ipcRenderer.removeListener("terminal:exit", handler);
  },
});
