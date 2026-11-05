# LearningOS / StudyOS — Build & Release State (`BUILD_STATE.md`)

- **Current Status**: `RELEASE_CANDIDATE`
- **Active Stage**: Stage 30 Completed (All Stages `0–30` Implemented & Verified)
- **Blocked Stages**: None (`0`)
- **Next Optional Post-v0.1 Milestone**: Empirical evaluation of optional local ONNX hybrid semantic re-ranking if user corpora exceed lexical Porter-stemming recall.

---

## Stage Completion Ledger (`0–30`)

| Stage | Capability | Status | Evidence |
|---|---|---|---|
| **0** | Project Control Center (`/docs/*`, `.gitignore`, `.env.example`, `README.md`) | `COMPLETED` | All 14 governance docs + existing 12 StudyOS docs present |
| **1** | Open-Source Reference Audit (`9` repositories, SPDX verified) | `COMPLETED` | `LICENSE_LEDGER.md`, `REUSE_MATRIX.md`, `OPEN_SOURCE_REPO_AUDITS.md` |
| **2** | Secure Electron + React + Local Backend Shell (`/health`, diagnostics, log redaction) | `COMPLETED` | `electron/main.cjs`, `electron/preload.cjs`, `server.ts`, `learningOSRoutes.ts` |
| **3** | `AppHost` + `AppRegistry` + `ToolBus` (parallel reads, FIFO writes) | `COMPLETED` | `src/lib/appHostToolBus.ts` + unit & integration tests |
| **4** | SQLite Source of Truth + Migrations `001`–`003` (`WAL`, `foreign_keys = ON`) | `COMPLETED` | `src/server/sqliteLearningOS.ts` |
| **5** | Connected Curriculum (`↑`/`↓` reorder, uncovered badge, safe archive/delete) | `COMPLETED` | `CourseManagerView.tsx` + `StudyOSContext.tsx` + SQLite sync |
| **6** | Remote-First Resource Library (`SourceAdapter`, `permanentDownload: false`) | `COMPLETED` | `transcriptPipeline.ts` + `LearningOSHubView.tsx` |
| **7** | YouTube Tracker Clean-Room Selective Reuse | `COMPLETED` | `docs/reuse/youtube-learning-tracker.md` |
| **8** | Captions-First Pipeline (`WebVTT`/`SRT`/`XML`, rollover dedup, `content_hash`) | `COMPLETED` | `src/lib/transcriptPipeline.ts` |
| **9** | Bounded Whisper Fallback (`data/temp/extraction/<jobId>`, `finally` rm, boot sweep) | `COMPLETED` | `runWhisperFallbackJob` (`success`/`fail`/`cancel` verified) |
| **10** | Lecture Workspace (remote player + clickable cues + notes + artifacts) | `COMPLETED` | `LearningOSHubView.tsx` (`Lecture & Cited Tutor` tab) |
| **11** | SQLite FTS5 Search (`bm25()`, `snippet()`, `<1 ms` over 2,505 cues, CLI `fts`) | `COMPLETED` | `sqliteLearningOS.ts` + `LearningOSHubView.tsx` + `ExecutionToolsView.tsx` |
| **12** | OpenNotebookLM Retrieval Audit & Vector Deferral ADR | `COMPLETED` | `ADR-005` in `docs/DECISIONS.md` |
| **13** | Source-Grounded Cited AI Tutor (`POST /api/ai/resources/:id/ask`) | `COMPLETED` | Segment ID verification + hallucination stripping verified |
| **14** | Cached On-Demand Study Artifacts (`summary`, `notes`, `cards`, `quiz`, `sheet`) | `COMPLETED` | `POST /api/ai/resources/:id/artifacts` (`content_hash` cache) |
| **15** | `FsrsLiteScheduler` (`Again/Hard/Good/Easy`) + Bidirectional Anki `.tsv` | `COMPLETED` | `src/lib/fsrsScheduler.ts` + `ExecutionToolsView.tsx` |
| **16** | SQLite Relational Concept & Prerequisite Graph (List + SVG Zoom/Pan) | `COMPLETED` | `concepts`, `concept_links` + `LearningOSHubView.tsx` |
| **17** | Manual + Assisted Curriculum Matcher (`confidence` + `"Why this topic?"`) | `COMPLETED` | `LearningOSHubView.tsx` (`Curriculum Matcher` tab) |
| **18** | SurfSense JSON Exchange Boundary (`learningos.surfsense.exchange.v1`) | `COMPLETED` | `src/integrations/learningOSAdapters.ts` |
| **19** | OpenMAIC Interactive Lesson DSL Adapter (`permanentVideoGenerated: false`) | `COMPLETED` | `src/integrations/learningOSAdapters.ts` |
| **20** | Default-Deny External Web App Host (`WebContentsView` + allowlist) | `COMPLETED` | `learningOSAdapters.ts` + `electron/main.cjs` |
| **21** | Job Orchestrator, Queue Telemetry & Cancellation | `COMPLETED` | `jobs` table + `Storage, Jobs & Backup` tab |
| **22** | Storage Footprint Audit (`Permanent Media: 0 B`) & Idempotent Cleanup | `COMPLETED` | `getStorageAudit()` + `cleanupTemporaryStorage()` |
| **23** | SHA-256 Validated Portable SQLite Backup & Non-Destructive Restore | `COMPLETED` | `exportPortableBundle()` + `importPortableBundle()` |
| **24** | Server-Only Provider Diagnostics & Offline Operation | `COMPLETED` | `/api/learningos/providers` + zero UI secret inputs |
| **25** | Dashboard + `Mod+K` Command Palette Integration | `COMPLETED` | `DashboardView.tsx` + `CommandPalette.tsx` |
| **26** | 8 GB RAM Performance Pass (`React.lazy` heavy views, bounded worker `1`) | `COMPLETED` | `src/App.tsx` + `TEST_MATRIX.md` |
| **27** | 23-Step Master Acceptance Automated E2E + Manual Smoke Guide | `COMPLETED` | `src/server/learningOS.test.ts` (`9/9` passed) |
| **28** | Opt-In Read-Only MCP Bridge (`6` allowlisted read tools, writes blocked) | `COMPLETED` | `McpReadOnlyBridge` + `/api/mcp/*` |
| **29** | Modular App Packaging (`14` `AppManifest` boundaries, core protected) | `COMPLETED` | `DEFAULT_LEARNINGOS_APP_MANIFESTS` |
| **30** | Release Hardening, Troubleshooting & Installer Readiness | `COMPLETED` | `README.md`, `SECURITY.md`, `JOBS.md`, `47/47` tests passing |
