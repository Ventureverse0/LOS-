# LearningOS / StudyOS — Architecture Decision Records (ADRs)

## ADR-001: Unified Express + Native `node:sqlite` Local Backend (vs. Separate FastAPI Process)
- **Context**: StudyOS v3 already runs an Express TypeScript server (`server.ts`) on Node.js v22, which includes native C-backed `node:sqlite` (`DatabaseSync`) with compiled FTS5 (`bm25()`, `snippet()`, `porter unicode61`).
- **Decision**: Implement the LearningOS local API, SQLite persistence, FTS5 search, and job orchestrator directly in TypeScript (`src/server/sqliteLearningOS.ts` + `src/server/learningOSRoutes.ts`) mounted on `server.ts`, while keeping Python CLI tools (`yt-dlp`, `faster-whisper`) as optional external child-process adapters.
- **Consequences**: Zero extra Python HTTP server RAM overhead on 8 GB laptops, shared TypeScript contracts across client and server, single-port preview/deployment (`3000` in dev), and sub-millisecond in-process SQLite FTS5 queries (`0.94 ms` over 2,500+ cues).

## ADR-002: Desktop-First Secure Electron Host (`WebContentsView`, Never `BrowserView` or `<webview>`)
- **Context**: Desktop users need OS-level windowing and controlled external course/documentation viewing without exposing local files or credentials to third-party web pages.
- **Decision**: Provide `electron/main.cjs` and `electron/preload.cjs` using `BrowserWindow` (`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`) and Electron's modern `WebContentsView` with an isolated `persist:external_web` session partition and strict HTTPS origin allowlist.
- **Consequences**: Disallowed or non-embeddable origins fall back cleanly to `"Open externally"` (`shell.openExternal`) without bypassing CSP or `X-Frame-Options`.

## ADR-003: Zero Permanent Lecture Media Storage (`permanentMediaBytes === 0`)
- **Context**: Storing `.mp4`/`.mp3` files fills student SSDs rapidly while adding zero searchability.
- **Decision**: Remote lectures remain remote (`permanentDownload: false`). Permanent local storage holds only metadata, curriculum mappings, normalized transcript cues, notes, concepts, flashcards, quizzes, progress, and provenance.
- **Consequences**: 100+ hours of indexed lectures occupy megabytes instead of tens of gigabytes. Automated storage audits verify `permanentMediaBytes === 0`.

## ADR-004: Captions-First Ingestion & Isolated `finally`-Cleaned Whisper Fallback
- **Context**: Local speech-to-text is CPU-heavy on 8 GB RAM laptops and requires transient audio extraction.
- **Decision**: Always attempt WebVTT/SRT/XML caption ingestion first (`SubtitleResolver` -> `TranscriptParser` -> `TranscriptNormalizer`). Invoke `WhisperAdapter` (`maxWhisperConcurrency = 1`) only when captions are absent, writing transient buffers exclusively to `data/temp/extraction/<jobId>/`, validating segment persistence first, and deleting `jobTempDir` inside `finally` on `cleaned`, `failed`, or `cancelled` (plus a startup orphan directory sweeper).
- **Consequences**: Zero orphaned temporary media even after failures, cancellations, or unexpected restarts.

## ADR-005: SQLite FTS5 (`porter unicode61` + `bm25()`) Before Vector Databases (Stage 11 & Stage 12)
- **Context**: Stage 12 evaluated `OpenNotebookLM` chunking/retrieval patterns against native SQLite FTS5.
- **Decision**: Do **not** add an embedding vector database or background ONNX indexer in v0.1. Keep `search_fts` (`porter unicode61`, `bm25()`, `snippet()`) as the primary search and RAG context retriever, augmented with adjacent cue windowing and curriculum path metadata.
- **Consequences**: Measured query latency across 2,505 transcript cues is **0.94 ms** (`2.31 ms` for multi-entity `"population inversion"` lookup) with zero RAM/VRAM model overhead and exact `start_ms` timestamp fidelity. Optional hybrid embeddings remain deferred until an empirical recall gap is demonstrated.

## ADR-006: Internal AppHost & ToolBus First; Opt-In Read-Only MCP Bridge Second
- **Context**: "App-inside-app" extensibility needs capability scoping without turning internal UI calls into network microservices.
- **Decision**: Route modular app actions through an in-process `ToolBus` (`src/lib/appHostToolBus.ts`) enforcing `AppManifest` permissions, parallelizing read-only calls, and FIFO-serializing mutating calls. Keep the external MCP bridge (`/api/mcp/*`) disabled by default and restricted to 6 read-only capabilities when toggled on.
- **Consequences**: Optional modules can be disabled safely while core modules (`dashboard`, `curriculum`, `resources`, `lecture`, `search`, `notes`) remain protected.

## ADR-007: Controlled File/JSON Exchange Boundary for SurfSense (`Apache-2.0`)
- **Context**: `MODSetter/SurfSense` is a heavy Python/PostgreSQL/pgvector stack unsuitable for direct embedding on an 8 GB SQLite laptop.
- **Decision**: Integrate SurfSense strictly via a versioned JSON exchange bundle (`learningos.surfsense.exchange.v1` in `src/integrations/learningOSAdapters.ts`) for exporting LearningOS sources/segments and importing study artifacts.
- **Consequences**: Zero PostgreSQL/Docker dependency in LearningOS core while maintaining bidirectional study-artifact portability.

## ADR-008: Isolated Adapter & Lesson DSL Boundary for OpenMAIC (`MIT`)
- **Context**: `THU-MAIC/OpenMAIC` provides structured multi-modal lesson stages (`slide`, `whiteboard`, `quiz`, `simulation`, `concept_nav`), but full app embedding would bloat the core bundle and risk unwanted video generation.
- **Decision**: Isolate OpenMAIC compatibility in `compileInteractiveLessonArtifact` and `validateInteractiveLessonArtifact` (`src/integrations/learningOSAdapters.ts`), keeping the module opt-in and enforcing `permanentVideoGenerated: false`.
- **Consequences**: Clean, deterministic interactive lessons grounded in transcript segments and concepts without polluting core domain models.

## ADR-009: Isolated `ReviewScheduler` Interface (`FsrsLiteScheduler`) + Anki `.tsv` Contract
- **Context**: `ankidroid/Anki-Android` is `GPL-3.0`, prohibiting code copying into a non-GPL codebase, while students still need FSRS-grade scheduling and Anki deck portability.
- **Decision**: Implement a clean-room `ReviewScheduler` (`FsrsLiteScheduler` in `src/lib/fsrsScheduler.ts`) tracking stability, difficulty, interval, repetitions, and lapses (`Again / Hard / Good / Easy`), paired with standard tab-separated `.tsv` export and import.
- **Consequences**: Zero GPL contamination, deterministic unit-tested scheduling, and seamless round-trip deck transfer with Anki Desktop / AnkiDroid.
