/**
 * Stage 2 Minimal Preload Bridge
 * Exposes strictly allowlisted IPC channels — never fs, process.env, or Node primitives.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("learningOSDesktopHost", {
  isElectronHost: true,
  openExternalSafe: (targetUrl) =>
    ipcRenderer.invoke("learningos:open-external-safe", String(targetUrl)),
  mountIsolatedWebView: (targetUrl) =>
    ipcRenderer.invoke("learningos:mount-isolated-web-view", String(targetUrl)),
});
