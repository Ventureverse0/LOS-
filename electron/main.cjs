/**
 * Stage 2 & Stage 20 Secure Electron Host Shell (Optional Desktop Packaging Entry)
 * - contextIsolation: true
 * - nodeIntegration: false
 * - sandbox: true
 * - Uses WebContentsView (never deprecated BrowserView or <webview>)
 * - Default-deny external origin allowlist; zero filesystem or secret exposure
 */
const path = require("path");

const ALLOWED_EXTERNAL_ORIGINS = new Set([
  "https://en.wikipedia.org",
  "https://arxiv.org",
  "https://ocw.mit.edu",
  "https://developer.mozilla.org",
  "https://www.youtube.com",
  "https://openstax.org",
]);

function isAllowedOrigin(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl));
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    return ALLOWED_EXTERNAL_ORIGINS.has(parsed.origin.toLowerCase());
  } catch {
    return false;
  }
}

async function bootElectronDesktopShell() {
  // Dynamically require electron only when launched via `electron electron/main.cjs`
  const { app, BaseWindow, BrowserWindow, WebContentsView, ipcMain, shell } = require("electron");

  await app.whenReady();

  const mainWin = new BrowserWindow({
    width: 1440,
    height: 920,
    title: "Study OS — Student Learning & Growth OS",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
    },
  });

  const devServerUrl = process.env.LEARNINGOS_RENDERER_URL || "http://127.0.0.1:3000";
  await mainWin.loadURL(devServerUrl);

  ipcMain.handle("learningos:open-external-safe", async (_event, targetUrl) => {
    try {
      const parsed = new URL(String(targetUrl));
      if (parsed.protocol === "https:" || parsed.protocol === "http:") {
        await shell.openExternal(parsed.toString());
        return { ok: true };
      }
      return { ok: false, error: "Blocked unsafe URI scheme." };
    } catch {
      return { ok: false, error: "Invalid external URL." };
    }
  });

  ipcMain.handle("learningos:mount-isolated-web-view", async (_event, targetUrl) => {
    if (!isAllowedOrigin(targetUrl)) {
      return {
        ok: false,
        error: "Origin denied by WebAppManifest allowlist.",
      };
    }
    if (!WebContentsView || !BaseWindow) {
      return { ok: false, error: "WebContentsView requires Electron >= 30." };
    }
    const isolatedView = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        partition: "persist:learningos-isolated-web",
      },
    });
    isolatedView.webContents.setWindowOpenHandler(({ url }) => {
      if (isAllowedOrigin(url)) return { action: "allow" };
      shell.openExternal(url);
      return { action: "deny" };
    });
    await isolatedView.webContents.loadURL(String(targetUrl));
    return { ok: true };
  });
}

if (require.main === module) {
  bootElectronDesktopShell().catch((err) => {
    console.error("Electron host startup failed:", err);
    process.exit(1);
  });
}

module.exports = { isAllowedOrigin, ALLOWED_EXTERNAL_ORIGINS };
