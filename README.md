# StudyOS — Student Learning & Growth Operating System

**StudyOS** is a persistent, local-first academic workspace and **Student Growth Intelligence** operating system built around a closed, evidence-based learning loop:

> `CAPTURE → ORGANIZE → LEARN → PRACTISE → ASSESS → RECORD → ANALYSE → RECOMMEND → IMPROVE → REASSESS`

Unlike passive study dashboards that equate running a timer or clicking "Done" with subject mastery, StudyOS preserves longitudinal assessment attempts, separates self-reported confidence from verified test evidence, tracks recurring mistake categories, and generates explainable daily study recommendations.

---

## Key Capabilities

- **Daily Planning & Command Dashboard (`Mod+1`)**: Answers all 7 daily student questions (today's plan, approaching & overdue deadlines, revision queue, completed work, verified improvements, struggling topics, and explainable Next-Best-Actions with Snooze/Dismiss) plus a built-in 7-step interactive walkthrough guide.
- **Connected Academic Hierarchy (`Mod+2`)**: Organize `Programme → Academic Year → Semester → Course → Unit Group → Topic → Learning Objective` across Kanban, Table, and Matrix views with multi-tag filtering and non-destructive Syllabus Archiving.
- **Knowledge Vault, Concept Map & Lecture Workspace (`Mod+3`)**: Split Markdown + LaTeX editor with automatic revision snapshots, interactive **Personal Knowledge & Concept Graph**, page/timestamp-anchored **Highlights** with 1-click promotion to Flashcards & Quiz Questions, **Lecture Transcript & Captions** workspace, multimodal document ingest (`.md`, `.txt`, `.pdf`, scans, code), YouTube timestamp bookmarks, tagged Resource Locker, Topic Study Ledger, and cross-vault search.
- **Tasks, Assignments, Exams & Practice (`Alt+A`)**: ISO-dated assignments and exam timetables, inline deadline rescheduling with automatic study-plan `TimeBlock` adjustments, Missed-Task Recovery plans, RFC 5545 **Calendar `.ics` Export**, interactive Topic Quizzes (Gemini AI + offline deterministic fallback), manual rubric/score logging with error taxonomy (`conceptual`, `calculation`, `recall`, `careless`, `time_pressure`), and a Record-Grounded AI Learning & Mistake Tutor.
- **Student Growth Intelligence (`Alt+G`)**: Anti-inflationary Topic Mastery Engine (`"Not enough evidence yet."` when 0 attempts exist; `Verified Mastery` gated by multi-attempt/delayed-recall performance), `7d`/`30d`/`90d`/`All` trend analytics, Confidence Calibration Gap detector, Growth Timeline (assessments, sessions, tasks, skills, projects, objectives, corrections), Weekly/Monthly Review generator, and audited Record Corrections.
- **Academic Profile, Accessibility, Skills & Evidence Portfolio (`Alt+P`)**: Student identity, multi-semester academic history, live accessibility preferences (`Reduced Motion`, `High Contrast`, `Comfortable Spacing`), Skills Matrix (`Self-Reported Only` vs. `Evidence-Backed (Internal)`), projects, certifications, and one-click `.md` Evidence Portfolio export.
- **Spaced-Repetition Flashcards (`Mod+7`) & Durable Pomodoro Focus (`Mod+6`)**: 5-box Leitner SRS deck with `Due Now` scheduling and Anki `.tsv` export; topic-tagged Pomodoro sprints with reload-safe interrupted session recovery and idempotent session logging.
- **Grokopedia AI Curriculum Synthesizer (`Mod+4`) & 3D RK4 Physics Lab (`Mod+9`)**: Build structured courses from raw notes via server-side Gemini (`gemini-3.8-flash`) or offline first-principles synthesis, and explore real 120Hz Runge-Kutta dynamical simulations logged directly into the persistent `StudySessionRecord` and `LearningEvent` ledgers.

---

## Architecture & Stack

- **Frontend**: React 19 + TypeScript + Tailwind CSS v4 + Three.js + Lucide Icons (Vite SPA).
- **Backend (`server.ts`)**: Express server mounting Vite in development, providing server-side `@google/genai` routes (`/api/ai/curriculum`, `/api/ai/report`, `/api/ai/vault-sync`, `/api/ai/flashcards`, `/api/ai/tutor`) and optional local workspace snapshot persistence (`/api/db/workspaces/:workspaceId`).
- **Storage & Migration**: Multi-profile `IndexedDB` + `localStorage` (`schemaVersion: 3`) with visible save-failure retry alerts, non-destructive migration of v1/v2 data, and portable `.studyos.json`, Calendar `.ics`, Anki `.tsv`, and Portfolio `.md` exports.

---

## Getting Started

```bash
# Install dependencies
npm install

# Run full-stack Express + Vite server on port 3000
npm run dev

# Run the 48-assertion automated test suite (gamification + SQLite/FTS5 + local endpoint router)
npm test

# Type-check & build production bundle
npm run lint
npm run build
```

### Running Locally with Custom Endpoints & Custom API Keys

StudyOS + LearningOS supports local LLM servers (**Ollama**, **LM Studio**, **llama.cpp**, **vLLM / LocalAI**, **LiteLLM / Custom OpenAI-compatible URLs**, **Custom Gemini Proxy Base URLs**), cloud providers, or **100% Offline Deterministic Mode**:

1. **Interactive or Flag-Based Local CLI Setup (saves keys strictly server-side in `data/config/local-secrets.json` `0600`)**:
   ```bash
   # Interactive local setup wizard
   npm run configure:local

   # Example: Ollama (keyless local server)
   npm run configure:local -- --mode=ollama --url=http://127.0.0.1:11434/v1 --model=llama3.2

   # Example: Custom OpenAI-compatible local/LAN endpoint + custom API key
   npm run configure:local -- --mode=custom-openai --url=http://127.0.0.1:8000/v1 --model=Qwen/Qwen2.5-7B-Instruct --key=YOUR_CUSTOM_KEY
   ```
2. **Or via `.env` (server-side only; see `.env.example`)**:
   - `LLM_PROVIDER_MODE` (`auto`, `ollama`, `lmstudio`, `llamacpp`, `vllm`, `custom-openai`, `gemini`, `openai`, `groq`, `deepseek`, `anthropic`, `offline`)
   - `CUSTOM_LLM_BASE_URL` / `CUSTOM_LLM_MODEL` / `CUSTOM_LLM_API_KEY` — Custom OpenAI-compatible endpoint, model, and server-side API key.
   - `OLLAMA_BASE_URL` / `LMSTUDIO_BASE_URL` / `CUSTOM_GEMINI_BASE_URL` — Local server overrides.
   - `GEMINI_API_KEY` — Enables live Gemini (`gemini-3.8-flash` / `gemini-3.1-flash-lite`) synthesis, grounded tutoring, and quiz generation.
   - `VITE_API_BASE_URL` — Optional custom backend origin when running frontend and backend separately on localhost.
3. **In-App Endpoint Switcher & Live Connection Test**:
   - Open **Settings (`Mod+,`) -> Local Endpoint & Custom AI Provider** or **LearningOS Studio (`Alt+L`) -> Storage, Jobs & Backup** to switch local presets, auto-discover local models (`/v1/models` & `/api/tags`), choose a server-side credential slot, and click **Save & Test Endpoint** (API keys never enter the browser UI).

---

## Documentation Index (`/docs`)

- [`docs/PRODUCT_AUDIT.md`](./docs/PRODUCT_AUDIT.md) — Phase 1 audit of the deployed app, runtime verification, and preserved data.
- [`docs/FEATURE_MATRIX.md`](./docs/FEATURE_MATRIX.md) — Baseline vs. Post-Upgrade v3 feature verification matrix.
- [`docs/CURRENT_ARCHITECTURE.md`](./docs/CURRENT_ARCHITECTURE.md) — Full-stack runtime, state, and storage architecture.
- [`docs/KNOWN_ISSUES.md`](./docs/KNOWN_ISSUES.md) — Resolved audit gaps and transparent architectural boundaries.
- [`docs/PRODUCT_VISION.md`](./docs/PRODUCT_VISION.md) — Mission, 10-stage learning loop, and pedagogical trust rules.
- [`docs/PRODUCT_REQUIREMENTS.md`](./docs/PRODUCT_REQUIREMENTS.md) — Complete functional specification across all modules.
- [`docs/FEATURE_CATALOGUE.md`](./docs/FEATURE_CATALOGUE.md) — Workspace guide and keyboard shortcuts.
- [`docs/DATA_MODEL.md`](./docs/DATA_MODEL.md) — Schema v3 entities, append-only attempts, idempotency, and migration.
- [`docs/GROWTH_INTELLIGENCE.md`](./docs/GROWTH_INTELLIGENCE.md) — Mastery math, calibration gap, periodic reviews, and recommendations.
- [`docs/PRIVACY_AND_SECURITY.md`](./docs/PRIVACY_AND_SECURITY.md) — Storage boundaries, secret isolation, exports, and deletion controls.
- [`docs/IMPLEMENTATION_ROADMAP.md`](./docs/IMPLEMENTATION_ROADMAP.md) — Completed v3 phases and optional future cloud extension.
- [`docs/TEST_PLAN.md`](./docs/TEST_PLAN.md) — Automated test suite coverage and manual verification checklist.

---

## LearningOS Local-First Extension (`Alt+L` / `Mod+Shift+L`)

StudyOS now includes the complete **LearningOS Studio** (`Stages 0–30`) while preserving every existing StudyOS module:

- **SQLite + FTS5 Lexical Search (`< 1 ms`)**: Structured relational curriculum, remote lecture metadata, timestamped transcript cues, notes, concepts, FSRS flashcard state, jobs, and cached artifacts stored in `data/sqlite/learningos.db` (`WAL` mode, `search_fts` BM25 + `snippet()`).
- **Remote-First & Captions-First Pipeline (`Permanent Media = 0 Bytes`)**: Lectures stay remote (`permanentDownload: false`). WebVTT/SRT/XML captions are normalized and deduplicated first; `WhisperAdapter` runs only as an explicit fallback inside `data/temp/extraction/<jobId>/` and deletes transient audio inside `finally` on `cleaned`, `failed`, or `cancelled`.
- **Source-Grounded Cited AI Tutor & Cached Study Artifacts**: Every cited `segmentId` is verified against SQLite (`POST /api/ai/resources/:id/ask`), and generated summaries, structured notes, flashcards, quizzes, and revision sheets are cached by deterministic `content_hash`.
- **FSRS Spaced Repetition, Concept Graph, Curriculum Matcher & Modular AppHost**: `FsrsLiteScheduler` (`Again / Hard / Good / Easy`) + bidirectional Anki `.tsv` import/export, zoomable/pannable SVG prerequisite graph, Assisted topic matcher (`confidence` + `"Why this topic?"` + explicit approval), 14-module `AppRegistry` + `ToolBus`, opt-in read-only MCP bridge, SurfSense JSON exchange, OpenMAIC Interactive Lesson DSL compiler, and secure Electron host (`electron/main.cjs`, `electron/preload.cjs`).

### Storage Locations, Backup & Troubleshooting (Stage 30)
- **Storage Locations**:
  - `data/sqlite/learningos.db` — Permanent SQLite + FTS5 database.
  - `data/workspaces/ws_*.json` — Synchronized StudyOS profile snapshots.
  - `data/temp/extraction/` — Ephemeral Whisper job workspace (automatically wiped in `finally` and swept on startup).
  - `data/logs/learningos.log` — Secret-redacted runtime diagnostic log.
- **Backup & Restore**: Open **LearningOS Studio -> Storage, Jobs & Backup** to export or restore a SHA-256 verified portable SQLite JSON bundle (or use Sidebar `.studyos.json`, Anki `.tsv`, Calendar `.ics`, and Portfolio `.md` exports). Temporary media is never included in backups.
- **Troubleshooting & Graceful Degradation**:
  - **Missing LLM Key**: Core curriculum, transcript reading, FTS5 search, Concept Graph, FSRS flashcards, and deterministic grounded tutoring/artifacts continue working 100% offline.
  - **Missing Local Whisper / FFmpeg**: Captions-first ingestion (`.vtt` / `.srt` / `.xml` / `[mm:ss]`) works without external binaries; fallback jobs surface clear status and clean temporary folders safely.
  - **Desktop Electron Host (Optional)**: Launch via Electron pointing at `electron/main.cjs` once dependencies are installed (`contextIsolation: true`, `nodeIntegration: false`, `WebContentsView` origin allowlist).

### Additional LearningOS Governance Docs (`/docs`)
- [`docs/PRD.md`](./docs/PRD.md) · [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) · [`docs/DECISIONS.md`](./docs/DECISIONS.md) · [`docs/REPO_MAP.md`](./docs/REPO_MAP.md) · [`docs/INTEGRATION_CONTRACTS.md`](./docs/INTEGRATION_CONTRACTS.md) · [`docs/LICENSE_LEDGER.md`](./docs/LICENSE_LEDGER.md) · [`docs/REUSE_MATRIX.md`](./docs/REUSE_MATRIX.md) · [`docs/SECURITY.md`](./docs/SECURITY.md) · [`docs/JOBS.md`](./docs/JOBS.md) · [`docs/UI_MAP.md`](./docs/UI_MAP.md) · [`docs/TEST_MATRIX.md`](./docs/TEST_MATRIX.md) · [`docs/WORK_LOG.md`](./docs/WORK_LOG.md) · [`docs/BUILD_STATE.md`](./docs/BUILD_STATE.md) · [`docs/AGENT_MEMORY.md`](./docs/AGENT_MEMORY.md)

