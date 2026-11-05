# Stage 1 — Open-Source Reference Repository Audits

All 9 reference repositories specified in Stage 1 were audited for license terms, language/runtime, storage assumptions, useful architectural patterns, and dependencies unsafe for an 8 GB RAM local-first student system.

---

## 1. `Samuel-025/youtube-learning-tracker`
- **Branch / Runtime**: `main` | Python
- **License**: `NOASSERTION` (no OSS license file) -> **Zero code copied**.
- **Storage Strategy**: Lightweight local playlist/progress tracking.
- **Extracted Ideas**: URL metadata capture, subtitle cue timestamp jumping, lecture completion percentage.
- **Avoided**: Any permanent video download behavior; un-licensed source copying.

## 2. `tom1030507/OpenNotebookLM`
- **Branch / Runtime**: `master` | Python (`Gradio` / LLM orchestration)
- **License**: `MIT`
- **Storage Strategy**: Ephemeral/local document text extraction and chunked context assembly.
- **Extracted Ideas**: Grounded prompt construction (`selected segments + top BM25 hits + adjacent cue window`) and strict segment-ID citation verification before returning answers (`POST /api/ai/resources/:id/ask`).
- **Avoided**: Heavy multi-TTS podcast MP3 synthesis pipelines that retain audio files on disk.

## 3. `MODSetter/SurfSense`
- **Branch / Runtime**: `main` | Python (`FastAPI`) + Next.js + PostgreSQL (`pgvector`)
- **License**: `Apache-2.0`
- **Storage Strategy**: Server-grade PostgreSQL + `pgvector` + Docker containers.
- **Extracted Ideas**: Portable study-artifact bundle boundary (`learningos.surfsense.exchange.v1` in `src/integrations/learningOSAdapters.ts`).
- **Avoided**: Embedding PostgreSQL, Docker, or browser-extension scrapers into LearningOS (violates 8 GB RAM budget).

## 4. `THU-MAIC/OpenMAIC`
- **Branch / Runtime**: `main` | TypeScript / Next.js multi-agent classroom
- **License**: `MIT`
- **Storage Strategy**: Structured JSON lesson stages (`slide`, `whiteboard`, `quiz`, `simulation`).
- **Extracted Ideas**: Standalone lesson DSL representation (`@openmaic/dsl`-compatible JSON output in `compileInteractiveLessonArtifact`) isolated behind an opt-in adapter (`interactive-lessons`).
- **Avoided**: Copying the full Next.js multi-agent web app or enabling automated video/TTS asset generation (`permanentVideoGenerated: false`).

## 5. `yt-dlp/yt-dlp`
- **Branch / Runtime**: `master` | Python CLI
- **License**: `Unlicense`
- **Extracted Ideas**: Invoking strictly as an optional external CLI adapter with `--dump-single-json --skip-download --write-subs --write-auto-subs` inside `SourceAdapter` / `SubtitleResolver`.
- **Avoided**: Media stream downloading/muxing into permanent folders.

## 6. `SYSTRAN/faster-whisper`
- **Branch / Runtime**: `master` | Python (`CTranslate2`)
- **License**: `MIT`
- **Extracted Ideas**: Bounded (`maxWhisperConcurrency = 1`) fallback transcription job invoked **only** when captions are absent, writing transient audio to `data/temp/extraction/<jobId>/` and deleting it in `finally`.
- **Avoided**: Keeping CTranslate2 models resident in RAM when idle.

## 7. `ankidroid/Anki-Android`
- **Branch / Runtime**: `main` | Kotlin / Android + Rust backend
- **License**: `GPL-3.0` (Strong Copyleft) -> **Zero code copied**.
- **Extracted Ideas**: Standard tab-separated `.tsv` deck interchange (`Front \t Back \t Tags`) and FSRS-style `Again / Hard / Good / Easy` memory state variables (`stability`, `difficulty`, `lapses`) implemented cleanly in `src/lib/fsrsScheduler.ts`.

## 8. `TriliumNext/Trilium`
- **Branch / Runtime**: `main` | TypeScript / Node + SQLite
- **License**: `AGPL-3.0` (Strong Network Copyleft) -> **Zero code copied**.
- **Extracted Ideas**: Hierarchical tree organization, subtree reordering, and safe archive-vs-delete protection when child notes/resources exist.

## 9. `logseq/logseq`
- **Branch / Runtime**: `master` | ClojureScript / Datascript
- **License**: `AGPL-3.0` (Strong Network Copyleft) -> **Zero code copied**.
- **Extracted Ideas**: Visual node-link concept inspection (`prerequisite`, `related`, `contrast`, `example`) backed by simple SQLite relational tables (`concepts`, `concept_links`) rather than Neo4j or Datascript.
