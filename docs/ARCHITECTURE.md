# LearningOS / StudyOS — System Architecture

## 1. Layered Runtime Topology

```text
                      LEARNINGOS / STUDYOS SHELL
                                  |
             +--------------------+--------------------+
             |                                         |
   React 19 + Vite Renderer                 Electron Secure Host
   (Lazy Views + StudyOSContext)         (electron/main.cjs + preload.cjs)
             |                            - contextIsolation: true
             |                            - nodeIntegration: false
             |                            - WebContentsView allowlist
             +--------------------+--------------------+
                                  |
                     Internal AppHost & ToolBus
                     (src/lib/appHostToolBus.ts)
              - 14 AppManifests (core vs optional)
              - Parallel read-only / FIFO mutating calls
              - Opt-in read-only MCP Bridge (/api/mcp/*)
                                  |
                    Express Local Service (server.ts)
                  + LearningOS Router (learningOSRoutes.ts)
                                  |
       +--------------------------+--------------------------+
       |                          |                          |
  Node 22 SQLite             Worker & Job              Adapter Layer
  + FTS5 Engine              Orchestrator         - SourceAdapter (URL)
 (sqliteLearningOS.ts)     - Captions-first       - SubtitleResolver
  - Migrations 001-003     - Bounded Whisper (1)  - WhisperAdapter (temp)
  - BM25 + snippet()       - finally rm -rf       - Gemini / Fallback LLM
  - Concept Graph          - Boot orphan sweep    - SurfSense JSON Bridge
  - SHA-256 Backup                                - OpenMAIC Lesson DSL
```

## 2. Architectural Choice: Unified Node.js + `node:sqlite` Local Service
While the Prompt Pack illustrates a local service conceptually as FastAPI, StudyOS is an established full-stack TypeScript/Express application (`server.ts`) running on Node.js v22, which ships native C-backed **`node:sqlite` (`DatabaseSync`) with compiled SQLite FTS5 (`bm25()`, `snippet()`, `porter unicode61`)**. Keeping the local service in Express + `node:sqlite` (documented in `ADR-001` in `docs/DECISIONS.md`) avoids spawning a second Python web server on an 8 GB RAM machine while preserving 100% of the REST API contracts, SQLite WAL persistence, FTS5 indexing, and isolated subprocess boundaries for optional Python CLI tools (`yt-dlp`, `faster-whisper`).

## 3. Core Subsystems

### 3.1 Electron Desktop Shell (`/electron/main.cjs`, `/electron/preload.cjs`)
- Uses `BrowserWindow` for the main React renderer with `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`.
- Uses modern **`WebContentsView`** (never deprecated `BrowserView` or `<webview>`) with an isolated `persist:external_web` session partition and strict HTTPS origin allowlist for optional embedded documentation/course pages.
- Spawns or attaches to the local backend server and exposes only a minimal frozen `window.learningOSDesktop` IPC bridge (`getHealth`, `openExternalSafe`, `mountExternalWebView`, `closeExternalWebView`).

### 3.2 React Renderer (`/src/`)
- Preserves all 10 existing StudyOS views (`Dashboard`, `Courses`, `Knowledge Vault`, `Curriculum Synthesizer`, `Tasks & Exams`, `Growth Intelligence`, `Profile & Skills`, `Pomodoro`, `Flashcards`, `CLI Terminal`, `3D Physics Lab`) and adds **`LearningOS Studio` (`AppView.LEARNING_OS`, `Alt+L`)**.
- Heavy optional workspaces (`IntegrativePhysicsLabGame` with Three.js and `LearningOSHubView`) are code-split via `React.lazy` + `<Suspense>` to keep initial renderer heap footprint low on 8 GB RAM laptops.

### 3.3 AppHost & ToolBus (`/src/lib/appHostToolBus.ts`)
- **`AppRegistry`**: Tracks 14 `AppManifest` definitions (`dashboard`, `curriculum`, `resources`, `lecture`, `search`, `notes`, `study`, `revision`, `concepts`, `curriculum-matcher`, `interactive-lessons`, `surfsense-bridge`, `external-web-host`, `physics-lab`). Core modules (`core: true`) cannot be disabled; optional modules can be toggled at runtime without breaking core navigation.
- **`CapabilityRegistry` & `ToolBus`**: Enforces manifest capability scopes on every `{ requestId, callerAppId, capability, input, permissionScope, createdAt }` call. Read-only calls execute concurrently via `Promise.all`; mutating calls serialize FIFO to prevent SQLite write contention.
- **`McpReadOnlyBridge`**: Disabled by default; when explicitly enabled, exposes only `curriculum.read`, `resource.read`, `search.query`, `notes.read`, `concepts.read`, and `flashcards.export`.

### 3.4 SQLite + FTS5 Persistence (`/src/server/sqliteLearningOS.ts`)
- Single source of truth for structured LearningOS records (`data/sqlite/learningos.db`).
- Bi-directionally syncs StudyOS curriculum, notes, resources, transcripts, and flashcards via `/api/learningos/sync-studyos` so existing StudyOS workflows and LearningOS SQLite tables remain unified.

### 3.5 Worker, Transcript & Job Layer
- **Captions-First**: `ingestTranscript` always parses and normalizes WebVTT/SRT/XML subtitles first (`manual_caption` or `auto_caption`). If captions exist, `runWhisperFallbackJob` returns immediately (`whisperCalled: false`) without touching temporary audio.
- **Bounded Whisper Fallback**: Concurrency-limited (`maxWhisperConcurrency = 1` for 8 GB RAM laptops). Writes transient audio only inside `data/temp/extraction/<jobId>/`, validates transcript segment creation before marking `cleaned`, and unconditionally deletes `jobTempDir` inside `finally` on success, failure, or cancellation.
- **Startup Orphan Sweeper**: `sweepOrphanedTempDirs()` runs at service startup to clean any leftover `data/temp/extraction/*` directories from hard power-offs.

### 3.6 External Adapter & Embedded Boundaries
- **`SourceAdapter`**: Extracts URL metadata and embed links (`permanentDownload: false`).
- **`SurfSense` JSON Exchange (`/src/integrations/learningOSAdapters.ts`)**: File/JSON bundle boundary (`learningos.surfsense.exchange.v1`) without database coupling.
- **`OpenMAIC` Interactive Lesson Adapter**: Compiles selected segments, concepts, and notes into a validated `InteractiveLessonArtifact` + `@openmaic/dsl` JSON payload (`permanentVideoGenerated: false`).
- **Default-Deny External Web Host**: Evaluates origins against explicit HTTPS allowlists (`youtube.com`, `ocw.mit.edu`, `arxiv.org`, `wikipedia.org`, `developer.mozilla.org`, `nptel.ac.in`, `khanacademy.org`) and falls back to `"Open externally"` when blocked.
