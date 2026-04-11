import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  // Window controls
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),
  isMaximized: () => ipcRenderer.invoke("window:isMaximized"),
  onMaximize: (callback: () => void) => {
    ipcRenderer.on("window:onMaximize", () => callback());
  },
  onUnmaximize: (callback: () => void) => {
    ipcRenderer.on("window:onUnmaximize", () => callback());
  },

  // Window drag
  startDrag: (mouseX: number, mouseY: number) =>
    ipcRenderer.send("window:startDrag", mouseX, mouseY),
  stopDrag: () => ipcRenderer.send("window:stopDrag"),
  getWindowPosition: () =>
    ipcRenderer.invoke("window:getWindowPosition") as Promise<{
      x: number;
      y: number;
    }>,

  // ACP - Registry & Harness
  acpListRegistry: () => ipcRenderer.invoke("acp:listRegistry"),
  acpListInstalled: () => ipcRenderer.invoke("acp:listInstalled"),
  acpInstallHarness: (manifest: unknown) =>
    ipcRenderer.invoke("acp:installHarness", manifest),
  acpUninstallHarness: (agentId: string) =>
    ipcRenderer.invoke("acp:uninstallHarness", agentId),

  // ACP - Connection lifecycle
  acpConnect: (agentId: string) => ipcRenderer.invoke("acp:connect", agentId),
  acpDisconnect: () => ipcRenderer.invoke("acp:disconnect"),
  acpGetConnectionState: () => ipcRenderer.invoke("acp:getConnectionState"),
  acpOnConnectionStateChange: (callback: (state: string) => void) => {
    ipcRenderer.on("acp:onConnectionStateChange", (_event, state) =>
      callback(state),
    );
  },

  // ACP - Errors
  acpOnError: (
    callback: (error: { message: string; stderr: string }) => void,
  ) => {
    ipcRenderer.on("acp:onError", (_event, error) => callback(error));
  },

  // ACP - Session
  acpCreateSession: (cwd?: string) =>
    ipcRenderer.invoke("acp:createSession", cwd),
  acpGetActiveSession: () => ipcRenderer.invoke("acp:getActiveSession"),

  // ACP - Prompt
  acpSendPrompt: (sessionId: string, content: string) =>
    ipcRenderer.invoke("acp:sendPrompt", sessionId, content),
  acpCancelPrompt: (sessionId: string) =>
    ipcRenderer.invoke("acp:cancelPrompt", sessionId),

  // ACP - Streaming updates
  acpOnUpdate: (callback: (update: unknown) => void) => {
    ipcRenderer.on("acp:onUpdate", (_event, update) => callback(update));
  },

  // ACP - Permissions
  acpOnPermissionRequest: (callback: (request: unknown) => void) => {
    ipcRenderer.on("acp:onPermissionRequest", (_event, request) =>
      callback(request),
    );
  },
  acpRespondPermission: (requestId: string, optionId: string) =>
    ipcRenderer.invoke("acp:respondPermission", requestId, optionId),
});
