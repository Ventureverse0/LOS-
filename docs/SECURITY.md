# LearningOS / StudyOS — Security & Isolation Architecture (`SECURITY.md`)

## 1. Electron Host & Renderer Hardening (`/electron/main.cjs`, `/electron/preload.cjs`)
- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- Deprecated `BrowserView` and `<webview>` tags are **prohibited** and unused.
- `preload.cjs` exposes only a frozen, minimal `window.learningOSDesktop` bridge (`getHealth`, `openExternalSafe`, `mountExternalWebView`, `closeExternalWebView`). No raw `ipcRenderer`, `fs`, `child_process`, or `process.env` references cross into the renderer.

## 2. API Key & Secret Protection (Stage 24 & Rule #10)
- All LLM credentials (`GEMINI_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`, `DEEPSEEK_API_KEY`, `ANTHROPIC_API_KEY`) live exclusively in the backend process (`server.ts` / `learningOSRoutes.ts`).
- **Zero API-key text inputs** exist in the React UI. Provider inspection (`/api/learningos/providers`) returns boolean `configured` flags and capability metadata only—never secret values.
- `redactSecrets()` in `/src/server/sqliteLearningOS.ts` scrubs `AIza...`, `sk-...`, `Bearer ...`, and `api_key=...` patterns before any line reaches `data/logs/learningos.log` or client error responses.

## 3. Default-Deny External Web Host (`Stage 20`)
- External URLs are evaluated by `evaluateExternalWebUrl()` (`/src/integrations/learningOSAdapters.ts`) and repeated inside `electron/main.cjs`:
  - Only `https:` origins explicitly listed in `WebAppManifest.allowedOrigins` (`www.youtube.com`, `www.youtube-nocookie.com`, `ocw.mit.edu`, `arxiv.org`, `en.wikipedia.org`, `developer.mozilla.org`, `nptel.ac.in`, `www.khanacademy.org`) may mount inside an isolated `WebContentsView` (`sessionPartition: "persist:external_web"`).
  - `http:`, `javascript:`, `file:`, `data:`, and unlisted origins are **blocked by default** and fall back safely to an explicit user-triggered `"Open externally"` action (`https:`/`http:` validated).
  - Site CSP, `X-Frame-Options`, authentication walls, and paywalls are never stripped or bypassed.

## 4. ToolBus & Optional MCP Bridge Guardrails (`Stage 3` & `Stage 28`)
- Every internal module call checks `AppRegistry.isEnabled(callerAppId)` and verifies `capability` membership in the caller's `AppManifest`.
- Core apps (`dashboard`, `curriculum`, `resources`, `lecture`, `search`, `notes`) are protected against accidental disabling.
- The optional MCP bridge (`/api/mcp/call`) is **disabled by default** and hard-allowlists 6 read-only capabilities (`curriculum.read`, `resource.read`, `search.query`, `notes.read`, `concepts.read`, `flashcards.export`). Write capabilities, filesystem access, and subprocess execution are unconditionally rejected.

## 5. Path Traversal & Subprocess Restrictions
- Workspace IDs (`sanitizeWorkspaceId`) and job IDs strip all non-`[a-zA-Z0-9_-]` characters and verify `path.resolve(...)` stays strictly under `data/workspaces/` or `data/temp/extraction/`.
- Optional CLI adapters (`yt-dlp`, `faster-whisper`) never accept raw shell-interpolated strings from user input.
