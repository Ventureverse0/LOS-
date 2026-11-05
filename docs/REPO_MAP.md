# LearningOS / StudyOS — Repository Map (`REPO_MAP.md`)

## 1. Production Workspace Structure

```text
/
├── electron/
│   ├── main.cjs                     # Secure Electron host (BrowserWindow + WebContentsView + backend lifecycle)
│   └── preload.cjs                  # Minimal contextBridge API (contextIsolation: true, no secrets)
├── public/
│   └── assets/aistudio/             # Attached specifications & static public assets
├── server.ts                        # Express + Vite server entry point (port 3000 dev), Gemini AI & StudyOS DB routes
├── src/
│   ├── App.tsx                      # Root shell, keyboard shortcuts, onboarding tour, React.lazy heavy view boundaries
│   ├── components/
│   │   ├── CommandPalette.tsx       # Mod+K command palette across all StudyOS + LearningOS views
│   │   ├── OnboardingModal.tsx      # First-run workspace setup
│   │   ├── Sidebar.tsx              # Navigation rail, profile switcher, XP/streak telemetry, backup actions
│   │   ├── StudyGuideModal.tsx      # 8-step interactive user walkthrough
│   │   └── views/
│   │       ├── AcademicProfileView.tsx       # Student identity, accessibility, skills & portfolio export
│   │       ├── CourseManagerView.tsx         # Connected hierarchy, ↑/↓ topic reorder, uncovered badge & safe archive/delete
│   │       ├── CurriculumSynthesizerView.tsx # AI + first-principles course compiler
│   │       ├── DashboardView.tsx             # 7 daily student questions, Next-Best-Actions & LearningOS quick launch
│   │       ├── ExecutionToolsView.tsx        # Pomodoro timer, FSRS + Leitner flashcards, Anki TSV import/export, CLI
│   │       ├── GrowthIntelligenceView.tsx    # Anti-inflation mastery engine, calibration gap, timeline & record audit
│   │       ├── IntegrativePhysicsLabGame.tsx # Lazy-loaded 120Hz RK4 3D physics lab
│   │       ├── KnowledgeVaultView.tsx        # Markdown/LaTeX notes, highlights, concept map & vault resources
│   │       ├── LearningOSHubView.tsx         # Lazy-loaded 6-tab LearningOS Studio (Lecture, FTS5, Graph, Matcher, Jobs, Apps)
│   │       └── TasksAssessmentsView.tsx      # Deadlines, .ics export, quizzes, rubric logging & AI mistake tutor
│   ├── context/
│   │   └── StudyOSContext.tsx       # Unified client state, idempotent ledgers, reordering & persistence sync
│   ├── integrations/
│   │   └── learningOSAdapters.ts    # SurfSense JSON exchange, OpenMAIC Lesson DSL compiler & WebApp allowlist evaluator
│   ├── lib/
│   │   ├── appHostToolBus.ts        # AppRegistry (14 manifests), CapabilityRegistry, ToolBus & McpReadOnlyBridge
│   │   ├── fsrsScheduler.ts         # ReviewScheduler interface, FsrsLiteScheduler & Anki TSV parser
│   │   ├── gamification.ts          # XP, levels, streaks & YouTube embed helpers
│   │   ├── gamification.test.ts     # 38 deterministic unit assertions (StudyOS + LearningOS pure modules)
│   │   ├── growthIntelligence.ts    # Topic mastery math, spaced repetition, recommendations & .ics/TSV/MD exporters
│   │   ├── integrativePhysicsCompiler.ts # RK4 numerical integrator & physics curriculum compiler
│   │   ├── shortcuts.ts             # Global keyboard shortcut registry
│   │   ├── storage.ts               # IndexedDB + localStorage v3 migration & server workspace sync
│   │   └── transcriptPipeline.ts    # SourceAdapter, WebVTT/SRT/XML parser, rollover deduplicator & FNV-1a hash
│   ├── server/
│   │   ├── learningOS.test.ts       # 9 end-to-end SQLite + FTS5 + 23-Step Master Acceptance tests (2,500+ cues)
│   │   ├── learningOSRoutes.ts      # Express router for /health, /api/system/diagnostics, /api/learningos/*, /api/mcp/*
│   │   └── sqliteLearningOS.ts      # Node 22 DatabaseSync SQLite + FTS5 engine, migrations 001-003, Whisper jobs, backups
│   ├── services/
│   │   ├── geminiService.ts         # Client wrappers for StudyOS server AI endpoints
│   │   └── learningOSService.ts     # Typed client wrappers for LearningOS SQLite, FTS5, Tutor & Artifact endpoints
│   └── types/
│       ├── learningOS.ts            # LearningOS domain, SQLite, FTS5, AppHost, Job, Concept & Adapter contracts
│       └── studyOS.ts               # StudyOS Schema v3 contracts
└── docs/                            # Permanent project memory, audits, ADRs, contracts, licenses & verification logs
```

## 2. Runtime Data Directories (`data/`, Git-Ignored)
- `data/sqlite/learningos.db` — Primary SQLite + FTS5 database (`WAL` mode, permanent structured representations only).
- `data/workspaces/ws_*.json` — Synchronized StudyOS profile snapshots.
- `data/temp/extraction/<jobId>/` — Transient Whisper fallback directory; guaranteed empty at rest (`finally` cleanup + boot sweeper).
- `data/logs/learningos.log` — Structured application log with automatic API key/Bearer secret redaction.

## 3. Third-Party Reference Location (`third_party/reference/`, Git-Ignored)
Non-production inspection boundary reserved for Stage 1 open-source audits (never imported directly into the React renderer or core SQLite schema):
1. `third_party/reference/youtube-learning-tracker` (`Samuel-025/youtube-learning-tracker`)
2. `third_party/reference/OpenNotebookLM` (`tom1030507/OpenNotebookLM`)
3. `third_party/reference/SurfSense` (`MODSetter/SurfSense`)
4. `third_party/reference/OpenMAIC` (`THU-MAIC/OpenMAIC`)
5. `third_party/reference/yt-dlp` (`yt-dlp/yt-dlp`)
6. `third_party/reference/faster-whisper` (`SYSTRAN/faster-whisper`)
7. `third_party/reference/Anki-Android` (`ankidroid/Anki-Android`)
8. `third_party/reference/Trilium` (`TriliumNext/Trilium`)
9. `third_party/reference/logseq` (`logseq/logseq`)

See `docs/LICENSE_LEDGER.md`, `docs/REUSE_MATRIX.md`, `docs/reuse/youtube-learning-tracker.md`, and `docs/repo-audits/OPEN_SOURCE_REPO_AUDITS.md` for full inspection records.
