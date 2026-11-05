# LearningOS — Open-Source Reuse Matrix (`REUSE_MATRIX.md`)

Reuse classification codes (Stage 1):
- **A** = Use as installed dependency / runtime module
- **B** = Wrap as an external CLI / child process behind an adapter
- **C** = Adapt contract / clean-room adapter selectively
- **D** = Architecture / UX / file-interchange reference only
- **E** = Do not use (rejected due to license, bloat, or permanent media violation)

| Repository | Feature | Upstream File / Package | Reuse Type | License Checked | Integration Plan | Rationale |
|---|---|---|---|---|---|---|
| `Samuel-025/youtube-learning-tracker` | URL library, metadata, timestamp jump, progress % | Conceptual Python URL/subtitle flow | **D** | Yes (`NOASSERTION` — no license) | Clean-room TypeScript implementation in `src/lib/transcriptPipeline.ts` & `sqliteLearningOS.ts` | Upstream lacks an OSS license (`NOASSERTION`), so **zero code was copied**; clean-room adapter enforces `permanentDownload: false`. |
| `Samuel-025/youtube-learning-tracker` | Permanent video file downloading (if any) | Media download scripts | **E** | Yes (`NOASSERTION`) | Explicitly excluded | Violates Non-Negotiable Rule #2 (remote videos remain remote). |
| `tom1030507/OpenNotebookLM` | Source ingestion, segment chunking & citation grounding | Retrieval & prompt grounding pipeline | **D** | Yes (`MIT`) | Implemented natively on SQLite `transcript_segments` + `search_fts` BM25 in `sqliteLearningOS.ts` | Native SQLite FTS5 achieves `<1ms` BM25 search with exact `start_ms` citations and zero Python/vector server RAM cost. |
| `MODSetter/SurfSense` | Local study-artifact exchange | Knowledge space / artifact export concepts | **C / D** | Yes (`Apache-2.0`) | Isolated JSON bundle exchange (`learningos.surfsense.exchange.v1`) in `src/integrations/learningOSAdapters.ts` | Avoids pulling PostgreSQL + pgvector + Docker onto an 8 GB student laptop while preserving artifact portability. |
| `THU-MAIC/OpenMAIC` | Structured multi-stage interactive lessons | `@openmaic/dsl` & stage schema concepts | **C / D** | Yes (`MIT`) | Isolated `compileInteractiveLessonArtifact` & validator in `src/integrations/learningOSAdapters.ts` (`opt-in`) | Keeps LearningOS core decoupled from OpenMAIC internals and enforces `permanentVideoGenerated: false`. |
| `yt-dlp/yt-dlp` | Remote metadata & caption track extraction | `yt-dlp --dump-single-json --skip-download --write-subs` | **B** | Yes (`Unlicense`) | Optional external binary behind `SourceAdapter` / `SubtitleResolver` | Best-in-class URL/caption extractor when run strictly with `--skip-download`. |
| `SYSTRAN/faster-whisper` | Offline fallback speech-to-text when captions are missing | Python `faster_whisper.WhisperModel` CLI worker | **B** | Yes (`MIT`) | Optional bounded child worker (`maxWhisperConcurrency = 1`) in `runWhisperFallbackJob` | Keeps heavy CTranslate2 tensors out of the main Node/Electron process and guarantees `finally` temp cleanup. |
| `ankidroid/Anki-Android` | Spaced-repetition deck interoperability | Tab-separated `.tsv` note import/export specification | **D** | Yes (`GPL-3.0`) | Clean-room `FsrsLiteScheduler` + `.tsv` export/import in `src/lib/fsrsScheduler.ts` | `GPL-3.0` prohibits copying code; `.tsv` plain-text interchange gives full Anki Desktop / AnkiDroid compatibility cleanly. |
| `TriliumNext/Trilium` | Deep hierarchical curriculum & note tree patterns | Tree navigation & safe subtree archive UX | **D** | Yes (`AGPL-3.0`) | UX reference only in `CourseManagerView.tsx` & `KnowledgeVaultView.tsx` | `AGPL-3.0` strong copyleft; zero code copied. |
| `logseq/logseq` | Concept prerequisite & backlink graph navigation | Node-link inspection & source jump UX | **D** | Yes (`AGPL-3.0`) | UX reference only for SQLite `concepts`/`concept_links` SVG graph in `LearningOSHubView.tsx` | `AGPL-3.0` strong copyleft + ClojureScript stack; zero code copied. |

---

## Final Synthesis Recommendation

1. **Direct Core Stack (`A`)**: Node 22 built-in `node:sqlite` + compiled `FTS5`, React 19, Vite, Express, `@google/genai` (server-only), and Electron (`BrowserWindow` + `WebContentsView`).
2. **Optional External Process Workers (`B`)**: `yt-dlp` (`--skip-download` metadata/subtitles only) and `faster-whisper` (captions-missing fallback only, concurrency `1`, `data/temp/extraction/<jobId>/` wiped in `finally`).
3. **Clean-Room Typed Adapters (`C`)**: `SurfSense` JSON exchange (`learningos.surfsense.exchange.v1`) and `OpenMAIC` Lesson DSL compiler/validator (`InteractiveLessonArtifact`), both opt-in and toggleable in `AppRegistry`.
4. **Reference / Interchange Only (`D`)**: `youtube-learning-tracker`, `OpenNotebookLM`, `Anki-Android` (`.tsv`), `Trilium`, and `logseq`—zero third-party database schemas or copyleft code enter LearningOS.
