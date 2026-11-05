# LearningOS / StudyOS — Verification, Benchmark & Test Matrix (`TEST_MATRIX.md`)

## 1. Automated Test Execution Summary (`npm test`)

Command:
```bash
npm test
# Runs: tsx src/lib/gamification.test.ts && tsx --no-warnings src/server/learningOS.test.ts
```

- **Suite 1 (`src/lib/gamification.test.ts`)**: **38 / 38 assertions PASSED**
  - Preserves all 34 StudyOS Schema v3 unit tests (XP/levels, streaks, RK4 physics conservation `<1e-13`, v1/v2->v3 migration, anti-inflation mastery guard, record corrections, skill evidence separation, idempotent ledgers, `.ics`/`.tsv`/`.md` exports, highlights).
  - Adds 4 pure LearningOS unit suites:
    1. `AppRegistry` core protection + `McpReadOnlyBridge` write-blocking (`14` manifests).
    2. Captions-first VTT markup stripping, rollover cue deduplication, deterministic FNV-1a `contentHash`, and `permanentDownload === false`.
    3. `FsrsLiteScheduler` stability/difficulty/lapse transitions + `parseAnkiTsvImport` round-trip.
    4. OpenMAIC `InteractiveLessonArtifact` validation (`permanentVideoGenerated === false`) + `evaluateExternalWebUrl` default-deny blocking.
- **Suite 2 (`src/server/learningOS.test.ts`)**: **9 / 9 integration & E2E assertions PASSED**
  1. SQLite migrations `001`–`003`, boot orphan temp directory sweep, and log secret redaction (`AIza...`, `sk-...` -> `[REDACTED_SECRET]`).
  2. `ToolBus` parallel read-only execution (`Promise.all`), FIFO-serialized writes, disabled-app blocking, and MCP bridge write rejection.
  3. Section 38 Steps 1–8: `Semester 1 -> Applied Physics -> Unit 1 — Laser` synced, remote YouTube URL attached (`permanentDownload: false`), WebVTT captions parsed & deduplicated idempotently (`5` segments).
  4. Stage 9 Whisper Job Matrix: Captions short-circuit Whisper (`whisperCalled === false`); missing-captions jobs delete `data/temp/extraction/<jobId>/` inside `finally` across **success (`cleaned`)**, **failure (`failed`)**, and **cancellation (`cancelled`)**.
  5. Stage 11 FTS5 BM25 Search & Benchmark: `"population inversion"` resolves exact lecture cue (`startMs = 36000`) with `<mark>` snippet; 2,500+ segment benchmark executes in `< 1 ms`.
  6. Stage 13 Cited AI Tutor: Verifies SQLite `segmentId`s, strips hallucinated citations with explicit warning, and flags out-of-source questions honestly.
  7. Stage 14, 15 & 19: Study Artifacts cache by deterministic hash (`cachedHit === true`), OpenMAIC Lesson DSL validates (`4` stages, `permanentVideoGenerated === false`), and FSRS schedules flashcard review (`interval = 3d`).
  8. Stage 16, 17 & 18: SQLite Concept Prerequisite Graph (`Population Inversion -> Stimulated Emission`), Assisted Curriculum Matcher (`confidence = 0.97` requiring explicit user approval), and SurfSense JSON exchange (`2` imported artifacts).
  9. Section 38 Steps 20–23: Database close + cold reopen preserves 100% of curriculum, resources, transcripts, concepts, flashcards, and artifacts; SHA-256 portable backup validates; `permanentMediaBytes === 0`.

---

## 2. Measured Performance & 8 GB RAM Optimization Metrics (`Stage 11` & `Stage 26`)

| Metric | Target | Measured Result | Optimization Applied |
|---|---|---|---|
| FTS5 BM25 query (`"population inversion"`) | `< 100 ms` | **2.31 ms** | Native C `node:sqlite` FTS5 (`porter unicode61`, `bm25()`, `snippet()`) |
| FTS5 BM25 benchmark (**2,505** transcript segments) | `< 100 ms` | **0.94 ms** | Indexed `search_fts` virtual table in WAL mode (`synchronous = NORMAL`) |
| Initial React renderer bundle footprint | Defer heavy 3D/Studio chunks | Lazy-split chunks (`IntegrativePhysicsLabGame` + Three.js & `LearningOSHubView` loaded on demand) | `React.lazy()` + `<Suspense>` in `src/App.tsx` |
| Whisper CPU worker concurrency | `<= 1` on 8 GB laptop | **`maxWhisperConcurrency = 1`** | Bounded job semaphore in `LearningOSSqliteService` |
| Permanent media disk usage after E2E run | `0 bytes` | **`0 bytes`** | Captions-first + `finally` `rm -rf` + boot orphan sweeper |

---

## 3. Manual Real-YouTube Smoke Test Checklist (`Stage 27` & `Stage 30`)

1. Start the application (`npm run dev`) and open `http://localhost:3000`.
2. Press `Alt+L` (or click **LearningOS Studio** in the sidebar).
3. In **Lecture & Cited Tutor**, select an existing course/topic (e.g., *Semester 1 -> Applied Physics -> Unit 1 — Laser*), paste a real YouTube lecture URL, paste or attach `.vtt`/`.srt` captions (or click **Whisper Fallback** if captions are absent), and click **Add Remote Lecture**.
4. Click any `[mm:ss]` cue in the transcript pane and verify the embedded YouTube iframe jumps to `?start=<seconds>` and updates playback progress.
5. Open the **FTS5 Search** tab, search a phrase from the lecture, and click **Jump to Timestamp**.
6. Select 1–2 transcript segments, enter a question in **Cited AI Tutor**, and verify every returned citation chip resolves to a real `[mm:ss]` segment.
7. Generate **Flashcards** or **Summary** in **Study Artifacts**, review due cards in **Flashcards (`Mod+7`)** using `Again / Hard / Good / Easy`, and export/import an Anki `.tsv` file.
8. Open **Storage, Jobs & Backup**, click **Refresh Audit**, and confirm `Permanent Media` reads **`0 B`**, then download a **Portable SQLite Backup JSON** and verify its SHA-256 hash.
