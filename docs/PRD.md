# LearningOS / StudyOS — Product Requirements Document (PRD)

## 1. Product Goal
Evolve **StudyOS** (`https://study-osys.ai.studio`) into a local-first, storage-minimal **Student Learning & Growth Operating System (LearningOS)** where the primary asset is the **structured learning representation** (curriculum mappings, timestamped transcript segments, notes, cited explanations, concepts, spaced-repetition flashcards, quizzes, and verified growth records)—never heavy downloaded video or audio archives.

## 2. Target User & Hardware Envelope
- **Primary User**: University, engineering, and self-directed students managing multi-semester syllabi, remote video lectures (YouTube, OCW, NPTEL, Vimeo), PDFs, notes, assignments, and exam preparation.
- **Target Hardware**: Windows 11 / cross-platform laptops with **8 GB RAM** and constrained SSD space, requiring fast lexical search (`<100 ms`), bounded worker concurrency, lazy-loaded heavy modules, and zero silent media bloat.

## 3. Core Problem Solved
Students watch hours of remote lectures and scatter bookmarks, notes, and AI chats across disconnected tools without retaining searchable, timestamp-anchored knowledge or verified mastery evidence. Traditional media archivers waste tens of gigabytes downloading `.mp4`/`.mp3` files while still failing to answer:
1. *Where in my syllabus did the lecturer explain "population inversion"?*
2. *What exact timestamp supports this AI explanation or flashcard?*
3. *Which topics are uncovered, weak, or due for spaced repetition today?*
4. *Has my assessed performance genuinely improved over time?*

## 4. Non-Goals
- **Not a video downloader or piracy archiver**: Remote lecture videos remain remote by default (`permanentDownload: false`).
- **Not an uncontrolled web browser**: External web resources open only via an explicit origin allowlist or the system browser; site CSP/`X-Frame-Options`/auth boundaries are never bypassed.
- **Not an always-on cloud vector cluster**: SQLite + FTS5 BM25 is the primary database and search engine; no Neo4j or external vector server is required for core operation.
- **Not a vendor-coupled monolith**: External open-source tools (`yt-dlp`, `faster-whisper`, `OpenMAIC`, `SurfSense`, `Anki`) sit strictly behind typed adapters or file-exchange contracts.

## 5. Scope Definition

### v0.1 Core LearningOS Scope (Implemented)
- **Secure Shell & Local Backend**: Electron desktop host (`electron/main.cjs`, `electron/preload.cjs`) + React 19 Vite UI + Express/Node 22 local service (`/health`, `/api/system/diagnostics`, `/api/learningos/*`).
- **AppHost & ToolBus**: `AppManifest` registry (14 modular capabilities), permission-checked `ToolBus` (parallel read-only calls, FIFO-serialized mutating calls), core-app protection, and opt-in read-only MCP bridge.
- **Connected Curriculum & Matching**: `Course -> Semester -> Subject -> Unit -> Topic` with `↑`/`↓` reordering, uncovered-topic indicators, safe archive-vs-delete dependency checks, Manual topic linking, and Assisted LLM/lexical candidate matching (`confidence` + `"Why this topic?"` + explicit user approval).
- **Remote-First Resource Library & Captions-First Pipeline**: URL ingestion with `SourceAdapter` metadata, `SubtitleResolver` -> `TranscriptParser` (WebVTT/SRT/XML) -> `TranscriptNormalizer` (markup stripping, rollover cue deduplication, deterministic `content_hash`), and isolated `WhisperAdapter` fallback job with mandatory `finally` temp cleanup.
- **Lecture Workspace & FTS5 Search**: Split lecture player + clickable timestamped transcript + segment selection + notes + `<100 ms` SQLite FTS5 BM25 search (`snippet()` + exact timestamp jump).
- **Source-Grounded AI Tutor & Cached Study Artifacts**: Server-side cited Q&A (`POST /api/ai/resources/:resourceId/ask`) verifying every cited `segmentId` against SQLite, plus cached `summary`, `structured_notes`, `flashcards`, `quiz`, and `revision_sheet` artifacts (`POST /api/ai/resources/:resourceId/artifacts`).
- **FSRS Revision & Anki Interop**: Isolated `ReviewScheduler` (`FsrsLiteScheduler`) with `Again / Hard / Good / Easy` actions, stability/difficulty/lapse tracking, and bidirectional Anki `.tsv` export/import.
- **Concept Graph, Integrations, Storage Audit & Backup**: SQLite relational concept prerequisite graph with SVG zoom/pan, SurfSense JSON exchange, OpenMAIC `InteractiveLesson` DSL compiler/validator, Storage Footprint Diagnostics (`Permanent Media: 0 B`), and SHA-256 verified portable backup/restore.

### v0.2+ Optional Extensions
- Optional local ONNX/embedding hybrid re-ranker if a semantic recall gap is empirically demonstrated beyond FTS5 Porter stemming.
- Optional native OS keychain binding (`keytar` / DPAPI) when packaged as a standalone Windows `.exe` installer.
- Optional bulk automatic curriculum auto-matching mode for playlists >100 lectures (opt-in only).

## 6. Storage Constraint & Zero-Permanent-Media Rule
- **Permanent Local Storage (`data/sqlite/learningos.db` + `StudyOSState`)**: Metadata, curriculum hierarchy, transcript cues, Markdown notes, concepts, flashcards, quizzes, growth records, settings, and citation provenance (~50–250 KB per hour of lecture).
- **Temporary Extraction Storage (`data/temp/extraction/<jobId>/`)**: Allowed **only** during an explicit Whisper fallback job when captions are unavailable. Must be deleted inside a `finally` block on `succeeded -> cleaned`, `failed`, or `cancelled`, and swept on startup if orphaned by an OS crash.
- **Permanent Lecture Video/Audio (`permanentMediaBytes`)**: Strictly **`0 bytes`** at rest. Enforced by `SourceAdapter`, `StorageAudit`, and automated tests.
