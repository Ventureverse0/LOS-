# LearningOS — Integration, Adapter & ToolBus Contracts

## 1. `AppManifest` Contract (`/src/types/learningOS.ts`)

Every built-in or optional module registers an `AppManifest` with `AppRegistry`:

```ts
export interface AppManifest {
  id: string;
  name: string;
  version: string;
  runtime: "internal" | "process" | "bridge" | "web" | "sdk";
  route: string;
  capabilities: CapabilityId[];
  permissionScope: "read_only" | "workspace_write" | "isolated_external";
  core: boolean;               // Core apps cannot be disabled
  enabledByDefault: boolean;
  enabled: boolean;
  description: string;
}
```

## 2. `ToolBus` Request / Response Envelope (`/src/lib/appHostToolBus.ts`)

### Request
```ts
export interface ToolCallRequest<TInput = unknown> {
  requestId: string;
  callerAppId: string;
  capability: CapabilityId;
  input: TInput;
  permissionScope: PermissionScope;
  createdAt: string;
}
```

### Response
```ts
export interface ToolCallResponse<TResult = unknown> {
  requestId: string;
  success: boolean;
  result?: TResult;
  error?: string;
  citations: TranscriptCitation[];
  warnings: string[];
  durationMs: number;
}
```
- **Concurrency Rule**: Capabilities registered with `mutatesState: false` execute in parallel (`Promise.all`). Capabilities with `mutatesState: true` execute sequentially through the internal FIFO write queue.

## 3. Optional Read-Only MCP Bridge (`/api/mcp/*`)
- **Default State**: Disabled (`enabled: false`).
- **Strict Allowlist**:
  - `curriculum.read`
  - `resource.read`
  - `search.query`
  - `notes.read`
  - `concepts.read`
  - `flashcards.export`
- **Explicitly Blocked**: Raw filesystem access, secret/env inspection, arbitrary subprocess execution, unrestricted web requests, and all write capabilities (`curriculum.write`, `notes.write`, `resource.add`, etc.).

## 4. Domain Adapter Interfaces

### 4.1 `SourceAdapter` & Captions Pipeline (`/src/lib/transcriptPipeline.ts`)
- `resolveSourceMetadata(url, overrideTitle?)`: Normalizes remote URLs, extracts provider/video IDs and safe embed URLs, and stamps `permanentDownload: false`.
- `parseSubtitleContent(rawText, hint?)`: Parses WebVTT, SRT, XML (`<text start="..." dur="...">`), or `[mm:ss]` lines into timestamped cues (`startMs`, `endMs`, `text`).
- `normalizeTranscriptCues(cues)`: Strips inline HTML/VTT tags, deduplicates overlapping rollover cues, merges micro-fragments, and computes deterministic 64-bit FNV-1a `contentHash`.

### 4.2 `WhisperAdapter` Job Contract (`/src/server/sqliteLearningOS.ts`)
- Triggered via `POST /api/learningos/resources/:resourceId/whisper-fallback` **only** when `transcripts` has 0 segments for `resourceId`.
- Writes temporary extraction buffers exclusively to `data/temp/extraction/<jobId>/`, enforces `maxWhisperConcurrency = 1`, validates non-empty segment creation, and deletes `jobTempDir` inside `finally`.

### 4.3 `LLMProvider` & Cited Tutor (`POST /api/ai/resources/:resourceId/ask`)
- Server-only `@google/genai` (`gemini-3.8-flash`) with deterministic segment-grounded fallback when no API key is configured.
- Every returned citation `{ resourceId, segmentId, startMs, endMs, label }` is verified against SQLite `transcript_segments`; fabricated `segmentId`s are stripped and surfaced in `warnings[]`.

### 4.4 `ReviewScheduler` (`/src/lib/fsrsScheduler.ts`)
- `schedule(card, rating: "again" | "hard" | "good" | "easy", now)`: Pure function updating `stability`, `difficulty`, `intervalDays`, `repetitions`, `lapses`, `state`, and `dueAt`.
- `parseAnkiTsvImport(tsv)` / `exportAnkiTsv(flashcards, courses)`: Lossless tab-separated Anki interchange.

### 4.5 `SurfSense` Exchange Bundle (`/src/integrations/learningOSAdapters.ts`)
- Schema `learningos.surfsense.exchange.v1`: Exports selected resources, transcript segments, and notes as a self-contained JSON bundle and imports external SurfSense study artifacts without coupling databases.

### 4.6 `OpenMAIC` Interactive Lesson Adapter (`/src/integrations/learningOSAdapters.ts`)
- `compileInteractiveLessonArtifact(...)` & `validateInteractiveLessonArtifact(...)`: Produces validated interactive lesson stages (`slide`, `whiteboard`, `quiz`, `simulation`, `concept_nav`) and an `@openmaic/dsl`-compatible payload with `permanentVideoGenerated: false`.

### 4.7 `WebAppManifest` External Host (`/src/integrations/learningOSAdapters.ts` & `/electron/main.cjs`)
- `evaluateExternalWebUrl(url, manifest)`: Enforces default-deny HTTPS origin allowlist before mounting an Electron `WebContentsView` (`persist:external_web`) or delegating to `"Open externally"`.
