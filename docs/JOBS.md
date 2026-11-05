# LearningOS — Job Orchestration & Cleanup Guarantees (`JOBS.md`)

## 1. Job Lifecycle State Machine

```text
  [queued] ---> [running] ---> (validate transcript segments > 0) ---> [cleaned]
     |              |
     |              +---> (error thrown) ---> finally rm -rf tempDir ---> [failed]
     |              |
     +--------------+---> (user cancel)  ---> finally rm -rf tempDir ---> [cancelled]
```

Supported `JobStatus` values in SQLite `jobs`:
- `queued` — Accepted by `JobService`, awaiting concurrency slot (`queue_position >= 1`).
- `running` — Worker active (`progress` 0–99%, `current_operation` updated in SQLite).
- `succeeded` — Non-media metadata/indexing job completed (`cleanup_status = 'not_needed'`).
- `cleaned` — Media-assisted Whisper job validated SQLite `transcript_segments` **and** verified deletion of `data/temp/extraction/<jobId>/` (`cleanup_status = 'verified_deleted'`, `progress = 100`).
- `failed` — Operation threw an error; temporary directory deleted in `finally` (`cleanup_status = 'verified_deleted'`).
- `cancelled` — Cancelled by user (`POST /api/learningos/jobs/:jobId/cancel`); temporary directory deleted in `finally` (`cleanup_status = 'verified_deleted'`).

## 2. Concurrency & 8 GB RAM Laptop Protections (`Stage 21` & `Stage 26`)
- **Captions-First Short-Circuit**: `runWhisperFallbackJob` checks `getTranscriptSegments(resourceId)` before creating any job directory. If captions already exist, Whisper is skipped (`whisperCalled: false`).
- **Bounded CPU Transcription**: `maxWhisperConcurrency = 1` prevents parallel Whisper acoustic decoders from exhausting RAM/CPU on 8 GB Windows laptops.
- **Coordinated SQLite Writes**: Native `DatabaseSync` in WAL mode (`busy_timeout = 5000`) + `ToolBus` FIFO write serialization prevents `SQLITE_BUSY` races.

## 3. Mandatory Cleanup Guarantees (`Stage 9` & `Stage 22`)
1. **Per-Job Isolated Temp Path**: Transient extraction buffers are written strictly inside `data/temp/extraction/<jobId>/`.
2. **Transcript-Before-Clean Check**: A Whisper job never transitions to `cleaned` unless `ingested.segments.length > 0` is confirmed in SQLite.
3. **`finally` Deletion**: `await fsp.rm(jobTempDir, { recursive: true, force: true })` (with `fs.rmSync` fallback) executes inside `finally` across `cleaned`, `failed`, and `cancelled` paths, followed by `!fs.existsSync(jobTempDir)` verification.
4. **Startup Orphan Sweeper**: On every server boot, `sweepOrphanedTempDirs()` scans `data/temp/extraction/`, deletes any leftover directories from prior hard crashes, and marks any stale `queued`/`running` SQLite jobs as `failed` (`cleanup_status = 'verified_deleted'`).
5. **Idempotent Manual Sweep**: `POST /api/learningos/storage/cleanup` can be invoked at any time from the **Storage, Jobs & Backup** tab.
