import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
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
});
