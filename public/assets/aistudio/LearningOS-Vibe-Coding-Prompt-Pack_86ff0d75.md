# LearningOS — Vibe-Coding Prompt Pack

Version: 1.0
Date: 2026-09-27
Target: Windows 11, 8 GB RAM, local-first, storage-minimal, desktop-first
Primary coding agents: Claude Code or Codex

---

# HOW TO USE THIS FILE

This file is the implementation playbook. Do not paste the whole file into the coding agent at once.

Use the stages in order. At the start of every coding session, paste the **Session Bootstrap Prompt**. Then paste exactly one stage prompt. Let the coding agent inspect the repository first, implement the smallest vertical slice, test it, and update the project memory files before stopping.

The agent must treat the local project files as the long-term memory of the build. Chat history is not a source of truth.

The application is one desktop shell containing multiple optional learning modules. Open-source repositories are not blindly merged. They are inspected, selectively reused, wrapped behind adapters, or run as isolated child applications/services only when that is actually useful.

---

# 0. NON-NEGOTIABLE PRODUCT RULES

1. The primary asset is the **learning representation**, not the video file.
2. Remote lecture videos remain remote by default.
3. Permanent local storage must contain metadata, curriculum mappings, transcript segments, notes, concepts, flashcards, quizzes, progress, settings, and provenance.
4. Temporary audio/media may be created only for an explicit processing job and must be deleted after validation or failure cleanup.
5. Captions/subtitles are always attempted before Whisper.
6. SQLite is the source of truth for structured application data.
7. SQLite FTS5 is the default search engine. Do not introduce a vector database until an actual quality gap is measured.
8. LLM calls happen only when the user requests an AI artifact or AI explanation.
9. Every AI artifact that makes factual claims about a source must store provenance/citation references.
10. API keys must never enter the React renderer or repository.
11. Every external integration is behind an adapter/interface.
12. Every optional app/module can be disabled without breaking the core curriculum/library application.
13. External web content is isolated. Do not bypass site security or embedding restrictions.
14. Open-source code is copied only after license review and a recorded source map.
15. Do not rewrite a working external project just to make it look native.
16. Do not let a coding agent modify unrelated files because it “cleaned things up.”
17. Every stage must finish with tests, documentation updates, and a work-log entry.
18. If the agent must choose between two reasonable implementations, choose the simpler one, record the decision, and continue.
19. Do not ask the user unnecessary clarification questions during a stage. Make a safe, reversible choice and document it.
20. Never push commits automatically unless the repository's existing workflow explicitly requires it. Local commits are encouraged for rollback.

---

# 1. TARGET SYSTEM

```text
                         LEARNINGOS DESKTOP
                               |
                  +------------+------------+
                  |                         |
             React UI                 Electron Host
                  |                         |
                  +------------+------------+
                               |
                      Local Tool / App Bus
                               |
       +-----------------------+-----------------------+
       |            |           |          |           |
   Curriculum   Resources   Knowledge    Study      Apps
       |            |           |          |           |
     SQLite       URLs       FTS5       Cards       adapters
       |         captions     citations  quizzes     workers
       |         metadata     concepts   review      bridges
       +-------------+----------+---------+-----------+
                     |
                 FastAPI local service
                     |
           +---------+----------+
           |                    |
      local workers        temporary jobs
           |                    |
      Whisper/yt-dlp          cache
           |
        cleanup
```

The application shell should be able to activate optional modules on demand:

```text
LearningOS Shell
├── Core Dashboard
├── Curriculum App
├── Resource Library App
├── Lecture Workspace App
├── Search App
├── Notes App
├── Revision App
├── AI Tutor App
├── Concept Graph App
├── Interactive Lesson App
└── External/Embedded Apps
    ├── supported web resource
    ├── OpenMAIC adapter
    ├── future study tools
    └── future plugins
```

The phrase “app inside app” is implemented as an application host, not as uncontrolled nesting.

Supported runtime types:

```text
internal   = native React module
process    = local child process/service
bridge     = adapter around a CLI/API/repository capability
web        = isolated external website view
sdk        = reusable installed package
```

Use the least powerful runtime that solves the problem.

---

# 2. OPEN-SOURCE REUSE STRATEGY

Use the repositories as specialized sources of code, architecture, or interfaces.

| Repository | Reuse boundary | Preferred mechanism |
|---|---|---|
| Samuel-025/youtube-learning-tracker | URL library, metadata, transcript/timestamp, progress, flashcard/export ideas | Reference + selective code/library extraction |
| tom1030507/OpenNotebookLM | local source ingestion, chunking, FTS5/hybrid retrieval, citations | Reference architecture + selective modules |
| MODSetter/SurfSense | desktop local-first knowledge/study artifact concepts | Reference architecture + optional isolated integration |
| THU-MAIC/OpenMAIC | lesson DSL, renderer, generation/importer boundaries | Package/SDK adapter when useful |
| yt-dlp/yt-dlp | metadata/subtitle/source adapters | External binary/Python dependency behind adapter |
| SYSTRAN/faster-whisper | local STT | Python adapter/process |
| ankidroid/Anki-Android | studying/interoperability concepts | Export/import contract, do not embed entire app in v1 |
| TriliumNext/Trilium | hierarchy and note organization patterns | Reference only unless a concrete module is required |
| logseq/logseq | knowledge graph/linking patterns | Reference only unless a concrete module is required |
| SQLite FTS5 | lexical search | Direct technology |
| Electron | desktop host/process/view isolation | Direct technology |

Never make the core LearningOS database depend on one external repository's database schema.

Never create a giant `vendor/` folder and import half of the internet into the renderer.

---

# 3. APP-IN-APP + TOOL-BUS MODEL

The host application owns routing and permissions.

```text
                    APP HOST
                       |
              +--------+--------+
              |                 |
         App Registry       Tool Registry
              |                 |
        mount/unmount      capability lookup
              |                 |
       +------+-------+    +----+----------------+
       |      |       |    |        |             |
    internal process  web  resource search      AI
                         \\        /             |
                          `-------> Tool Bus <----+
                                   |
                            permission check
                                   |
                              run / stream
                                   |
                             result + events
```

Example capability IDs:

```text
curriculum.read
curriculum.write
resource.add
resource.metadata
resource.transcript
resource.open
search.query
search.semantic
notes.read
notes.write
ai.ask
ai.summarize
ai.flashcards
ai.quiz
revision.review
concept.graph
interactive.lesson.create
external.web.open
external.process.run
```

Every tool call should have:

```text
request_id
caller_app_id
capability
input
permission_scope
created_at
```

and return:

```text
request_id
success
result
error
citations
warnings
```

Independent read-only calls should be allowed to run in parallel.

State-changing calls should default to sequential execution unless the domain service explicitly declares them safe to parallelize.

Do not expose an MCP network server in v1 merely because the architecture resembles MCP. Build an internal tool bus first. Later create an MCP bridge if another agent/tool genuinely needs remote access.

---

# 4. ELECTRON EMBEDDING RULES

Use Electron as a secure host.

Preferred layering:

```text
BrowserWindow / BaseWindow
        |
        +--> React renderer
        |
        +--> WebContentsView for isolated external pages when required
        |
        +--> UtilityProcess / child process for heavy or crash-prone local workers
```

Do not use the deprecated `BrowserView` API.

Do not use the `<webview>` tag for the default architecture.

External origins must be allowlisted. A user action must be required before launching an external embedded app.

External content must never receive access to the LearningOS filesystem or secret store.

When a site refuses embedding or is not safe to embed, show a clear “Open externally” action instead of bypassing the site's controls.

---

# 5. PERMANENT PROJECT MEMORY FILES

At repository initialization create:

```text
docs/
├── PRD.md
├── ARCHITECTURE.md
├── DATA_MODEL.md
├── DECISIONS.md
├── REPO_MAP.md
├── INTEGRATION_CONTRACTS.md
├── LICENSE_LEDGER.md
├── SECURITY.md
├── JOBS.md
├── UI_MAP.md
├── WORK_LOG.md
├── TEST_MATRIX.md
├── BUILD_STATE.md
└── AGENT_MEMORY.md
```

The meaning of each file is defined in `LearningOS-Agent-Operating-Protocol.md`.

---

# 6. SESSION BOOTSTRAP PROMPT

Copy this at the start of every Claude Code/Codex session.

```text
You are working as the senior implementation engineer on LearningOS, a Windows-first local-first desktop learning system.

BEFORE TOUCHING CODE:

1. Read these files if they exist:
   - docs/AGENT_MEMORY.md
   - docs/BUILD_STATE.md
   - docs/PRD.md
   - docs/ARCHITECTURE.md
   - docs/DATA_MODEL.md
   - docs/DECISIONS.md
   - docs/REPO_MAP.md
   - docs/INTEGRATION_CONTRACTS.md
   - docs/SECURITY.md
   - docs/WORK_LOG.md
   - docs/TEST_MATRIX.md

2. Inspect the actual repository state. Do not rely on assumptions from previous chat messages.

3. Inspect available project skills/instructions and tool documentation when present. Use relevant skills for the stage. Do not invent skills or commands that do not exist.

4. Inspect the current git status and recent commits.

5. Determine the current stage from docs/BUILD_STATE.md. Do not silently skip earlier incomplete work.

6. Before coding, state internally:
   - what files you will inspect,
   - what existing implementation you will reuse,
   - what files you expect to change,
   - what acceptance tests must pass.

ENGINEERING RULES:

- Inspect before modifying.
- Reuse existing working code before writing replacements.
- Keep modules behind stable interfaces.
- Do not modify unrelated files.
- Do not change the database schema without a migration.
- Do not hard-code secrets.
- Do not permanently store lecture video/audio.
- Do not add vector search until the current search implementation has a demonstrated limitation.
- Keep optional integrations optional.
- Prefer small, testable functions.
- Validate external inputs.
- Add tests for behavior, not merely line coverage.

WHEN YOU FINISH:

1. Run the narrowest relevant tests.
2. Run typecheck/lint/build for affected packages.
3. Inspect the diff.
4. Remove dead code and accidental debug output from this stage only.
5. Update docs/WORK_LOG.md with:
   - date,
   - stage,
   - files changed,
   - tests run,
   - results,
   - decisions,
   - unresolved issues.
6. Update docs/BUILD_STATE.md with the actual current state.
7. Update docs/AGENT_MEMORY.md with reusable facts discovered in this session.
8. Update docs/REPO_MAP.md or docs/INTEGRATION_CONTRACTS.md if interfaces changed.
9. Update docs/TEST_MATRIX.md if a new acceptance test was created.
10. Create a local git commit only if the code is in a known-good state and the repository uses git commits as its normal workflow. Do not push.

Do not finish by merely saying “done.” Leave the repository in a state that the next coding session can resume without reading this chat.
```

---

# 7. STAGE 0 — CREATE THE PROJECT CONTROL CENTER

## Objective

Create the documentation and governance layer before implementing product features.

## Copy/paste prompt

```text
Implement STAGE 0 only: project control center.

You must NOT implement the actual learning application yet.

First inspect the current repository. If it is empty, initialize the smallest appropriate project skeleton. If a starter app already exists, preserve it.

Create and populate:

- docs/PRD.md
- docs/ARCHITECTURE.md
- docs/DATA_MODEL.md
- docs/DECISIONS.md
- docs/REPO_MAP.md
- docs/INTEGRATION_CONTRACTS.md
- docs/LICENSE_LEDGER.md
- docs/SECURITY.md
- docs/JOBS.md
- docs/UI_MAP.md
- docs/WORK_LOG.md
- docs/TEST_MATRIX.md
- docs/BUILD_STATE.md
- docs/AGENT_MEMORY.md

Also create:

- .gitignore
- .env.example
- README.md

Requirements for the documents:

PRD.md:
- product goal
- target user
- core problem
- non-goals
- v0.1 scope
- v0.2+ scope
- storage constraint
- no-permanent-media rule

ARCHITECTURE.md:
- Electron shell
- React renderer
- FastAPI local service
- SQLite
- worker layer
- app registry
- tool bus
- adapter layer
- external embedded app boundary
- data flow

DATA_MODEL.md:
- entities
- relationships
- primary keys
- foreign keys
- lifecycle states

DECISIONS.md:
- ADR entries for desktop-first, SQLite, no permanent media, captions-first, FTS5-first, optional OpenMAIC, adapter boundary

REPO_MAP.md:
- current code tree
- what each directory owns
- leave an explicit section for third-party reference repositories

INTEGRATION_CONTRACTS.md:
- adapter interface concepts
- app manifest concept
- tool bus concept
- event contracts

LICENSE_LEDGER.md:
- columns for repository, URL, license, commit/tag, files reused, obligation, notes
- do not claim any license until verified from the actual repository

SECURITY.md:
- Electron isolation requirements
- secret handling
- external-site isolation
- subprocess restrictions
- path validation

JOBS.md:
- job states: queued/running/succeeded/failed/cancelled/cleaned
- progress model
- cleanup guarantees

UI_MAP.md:
- routes/screens/modules

BUILD_STATE.md:
- current stage
- completed stages
- blocked stages
- next stage

AGENT_MEMORY.md:
- stable facts only; never store credentials

Do not invent implementation details that have not been decided. Mark them TODO/OPEN where appropriate.

Run formatting only. Do not add unnecessary dependencies.
```

## Acceptance test

The repository can be handed to another coding session and the agent can determine what the project is, what stage it is at, and what remains without relying on chat history.

---

# 8. STAGE 1 — INSPECT AND FETCH OPEN-SOURCE REFERENCES

## Objective

Fetch repositories for examination without contaminating the main application.

## Copy/paste prompt

```text
Implement STAGE 1: open-source reference acquisition and audit.

DO NOT integrate the repositories into production code yet.

Repositories to inspect:

1. https://github.com/Samuel-025/youtube-learning-tracker
2. https://github.com/tom1030507/OpenNotebookLM
3. https://github.com/MODSetter/SurfSense
4. https://github.com/THU-MAIC/OpenMAIC
5. https://github.com/yt-dlp/yt-dlp
6. https://github.com/SYSTRAN/faster-whisper
7. https://github.com/ankidroid/Anki-Android
8. https://github.com/TriliumNext/Trilium
9. https://github.com/logseq/logseq

REQUIRED PROCESS FOR EVERY REPOSITORY:

1. Clone into a non-production reference location such as:
   third_party/reference/<repo-name>

2. Before running repository scripts, inspect:
   - LICENSE
   - README
   - package manifests / requirements
   - root scripts
   - suspicious install hooks
   - build scripts

3. Record:
   - default branch
   - current HEAD commit
   - license
   - language/runtime
   - package manager
   - relevant directories
   - relevant entry points
   - storage/database strategy
   - relevant features
   - dependencies that would be dangerous or unnecessary for LearningOS

4. Do not copy code merely because it exists.

5. Create docs/repo-audits/<repo-name>.md for each repository.

6. Add every repository to docs/REPO_MAP.md and docs/LICENSE_LEDGER.md.

7. Create docs/REUSE_MATRIX.md with this table:
   repository | feature | file/package | reuse type | license checked | integration plan | rationale

8. Prefer git sparse-checkout for later selective retrieval if the repository is large.

9. For each candidate feature, classify it as:
   A = use as installed dependency/package
   B = wrap as an external process
   C = adapt source code selectively
   D = architecture reference only
   E = do not use

10. Never let a third-party repository become a hidden dependency of the core domain model.

Use read-only inspection/subagents if available. Parallelize independent repository audits. Keep the final synthesis in the main session.

For OpenMAIC specifically inspect the current packages and determine whether the DSL/renderer/importer/generation packages can be consumed independently. Do not copy the full OpenMAIC app.

For YouTube Learning Tracker identify the smallest set of files that correspond to:
- metadata fetching
- subtitle/transcript extraction
- timestamp linking
- progress
- study artifacts
- export

For OpenNotebookLM identify the smallest set of concepts/files corresponding to:
- local ingestion
- text chunking
- FTS/BM25 retrieval
- optional vectors
- citations

For SurfSense identify:
- local desktop packaging
- local source index
- study artifact architecture
- local model/provider abstraction

For yt-dlp identify command/API usage patterns and subtitle functionality, but do not archive media.

For faster-whisper identify install/runtime requirements and the smallest Python integration boundary.

For Anki/AnkiDroid identify the practical interchange format and workflow; do not embed the full Android application.

For Trilium and Logseq identify only structural ideas useful to notes/graph organization.

At the end, produce a single recommendation in docs/REUSE_MATRIX.md describing which components will actually enter LearningOS and which stay reference-only.
```

## Acceptance test

You have a verified repository inventory and can point to the exact file/package that would be reused for each selected capability.

---

# 9. STAGE 2 — APPLICATION SHELL

## Copy/paste prompt

```text
Implement STAGE 2: secure desktop shell.

Use:
- Electron
- React
- Vite
- TypeScript

Use a secure Electron architecture:
- contextIsolation true
- nodeIntegration false
- sandbox where compatible
- minimal preload bridge
- no secrets in renderer

Create:

apps/desktop/                # Electron host
apps/web/                    # React renderer if the chosen layout benefits from separation
backend/                     # FastAPI service
packages/contracts/          # shared API/domain contracts if useful
packages/ui/                # shared UI primitives if useful

Do not over-engineer into dozens of packages yet.

Desktop shell requirements:

1. Open a main window.
2. Load the React application.
3. Start/stop the local FastAPI process in development mode in a controlled way.
4. Provide GET /health.
5. Show backend connection status in the UI.
6. Gracefully handle backend not running.
7. Add application logging with a local file sink.
8. Never log environment secrets.
9. Store application data in a user-data directory, not the repository directory for production builds.
10. Store temporary processing files in a dedicated temp path.

Add a Settings/Diagnostics screen that shows:
- app version
- database path
- temp path
- backend status
- Python/Node versions where safely obtainable
- yt-dlp availability
- Whisper availability

Do not implement lectures, curriculum, AI, or repository integrations yet.

Acceptance:
- desktop app opens
- React loads
- /health works
- diagnostics page works
- backend can restart without corrupting state
- unit/integration smoke tests pass
``` 

---

# 10. STAGE 3 — INTERNAL APP HOST + TOOL BUS

## Objective

Build the “one dashboard with many apps inside it” capability before filling those apps.

## Copy/paste prompt

```text
Implement STAGE 3: internal App Host and Tool Bus.

The goal is to make LearningOS a shell that can activate independent modules without hard-wiring every feature into one giant page.

Create these concepts:

1. AppManifest
2. AppRegistry
3. AppRuntime
4. CapabilityRegistry
5. ToolRequest
6. ToolResponse
7. PermissionScope
8. AppEvent

AppManifest should describe at minimum:

- id
- name
- version
- description
- runtime: internal | process | bridge | web | sdk
- route
- requiredCapabilities
- optionalCapabilities
- permissions
- enabledByDefault

Create a registry that can:
- register apps
- enable/disable apps
- discover apps
- mount an app route
- report health
- prevent disabled apps from executing

Create a Tool Bus that can:
- register capabilities
- validate the caller
- validate permissions
- execute handlers
- generate request IDs
- return structured results/errors
- emit lifecycle events

Add a simple dashboard showing installed modules and their enabled status.

Implement only three internal demo apps:
- Dashboard
- Curriculum
- Resource Library placeholder

The apps may be empty shells with correct contracts.

DO NOT use an external MCP server yet.

Create docs/INTEGRATION_CONTRACTS.md examples.

Add tests for:
- app registration
- disabled app cannot run tools
- unknown capability fails cleanly
- authorized capability succeeds
- independent read-only tools can run in parallel
- state-changing tool is serialized by default
```

## Architecture expectation

```text
Dashboard
   |
App Registry
   |
   +-- Curriculum App --ToolBus--> curriculum.read/write
   |
   +-- Resource App ----ToolBus--> resource.add/open/search
   |
   +-- Study App -------ToolBus--> flashcards/quiz/revision
```

---

# 11. STAGE 4 — SQLITE + DATABASE MIGRATIONS

## Copy/paste prompt

```text
Implement STAGE 4: SQLite persistence and migrations.

Use SQLite as the source of truth.

Use a real migration mechanism rather than auto-creating tables from application startup logic.

Create the minimum tables required for v0.1:

courses
terms
subjects
units
topics
resources
resource_topics
transcripts
transcript_segments
notes
concepts
concept_links
flashcards
quiz_sets
quiz_questions
study_sessions
review_states
jobs
source_checks
settings

Implement the schema according to docs/DATA_MODEL.md.

Rules:
- stable IDs
- foreign keys enabled
- useful indexes
- timestamps in a consistent format
- status fields constrained where practical
- unique URL/source identifiers where safe
- idempotent migrations

Create repositories/DAO layer and service layer separately.

Do not place SQL inside React components.

Add seed data only in development/test fixtures, never in production.

Add migration tests that create a fresh database and upgrade from the previous migration.

Update docs/DATA_MODEL.md with the exact real schema after implementation.
```

---

# 12. STAGE 5 — CURRICULUM APP

## Copy/paste prompt

```text
Implement STAGE 5: Curriculum App.

Build a curriculum tree:

Degree/Course
 -> Year/Term
 -> Semester
 -> Subject
 -> Unit
 -> Topic
 -> optional Subtopic

Required operations:
- create
- edit
- delete with safe dependency handling
- reorder
- search/filter
- expand/collapse

The curriculum must be the organizational backbone of the entire application.

One resource may map to multiple topics through resource_topics.
One topic may have multiple resources.

Add:
- breadcrumb navigation
- progress summary by subject/unit/topic
- “resources attached” counts
- “uncovered topic” state

Do not add AI mapping yet.

Add manual mapping UI only.

Test persistence by:
1. create a subject
2. create a unit
3. create a topic
4. restart the application
5. verify data remains

Do not allow deletion of a curriculum node that would silently orphan important learning data. Use a clear confirmation and safe behavior.
```

---

# 13. STAGE 6 — RESOURCE LIBRARY + OPEN-SOURCE ADAPTERS 

## Copy/paste prompt

```text
Implement STAGE 6: Resource Library and source adapter architecture.

A resource is not synonymous with a video.

Supported initial types:
- youtube
- webpage
- pdf
- note
- local-file reference

Create a SourceAdapter interface:

resolve(input)
get_metadata(resource)
get_capabilities(resource)
get_subtitles(resource)
open(resource)

Create a YouTube adapter first.

IMPORTANT:
- The adapter is not allowed to permanently download lecture video by default.
- Metadata retrieval must be independent from media download.
- Subtitle retrieval must be independent from media download.
- Every adapter reports capabilities.

Example:

YouTube capabilities:
metadata = true
subtitles = true/false
stream_url = optional
permanent_download = disabled by default

Create a clean Resource Library UI:
- add URL
- detect source
- fetch metadata
- choose curriculum placement
- status
- progress
- open resource
- transcript availability

Reuse source-level ideas from YouTube Learning Tracker where helpful, but do not import its Streamlit application or its entire storage system.

Do not integrate AI yet.

Create adapter tests using mocked network responses.
```

---

# 14. STAGE 7 — SELECTIVE REUSE OF YOUTUBE LEARNING TRACKER

## Objective

Use the repository surgically instead of copying it.

## Copy/paste prompt

```text
Implement STAGE 7: selective Learning Tracker reuse audit and integration.

Open the already-audited reference repository:
third_party/reference/youtube-learning-tracker

Do not copy the entire application.

From the repo, identify exact implementation patterns for:
- YouTube metadata fetching
- transcript/subtitle extraction
- timestamp link creation
- progress tracking
- flashcard generation/export
- JSON/Markdown export if useful

For each candidate file:
1. inspect the source,
2. verify license status already recorded in docs/LICENSE_LEDGER.md,
3. compare against our adapter contract,
4. extract only the smallest reusable logic where it genuinely reduces risk,
5. preserve our own domain model,
6. add attribution/source note if required,
7. write docs/reuse/youtube-learning-tracker.md describing what was reused and why.

Prefer these outcomes in order:
A. use an existing package/API cleanly;
B. wrap the external project as a process/CLI;
C. selectively copy a small MIT-compatible utility with attribution where required;
D. reimplement a tiny function ourselves if that is simpler than importing an entire framework.

Never copy its Streamlit UI, its JSON persistence model, or its permanent media downloader architecture.

Run all existing tests afterward.
```

---

# 15. STAGE 8 — CAPTIONS-FIRST TRANSCRIPT PIPELINE

## Copy/paste prompt

```text
Implement STAGE 8: caption-first transcript ingestion.

Create these interfaces:

SubtitleResolver
TranscriptParser
TranscriptNormalizer
TranscriptRepository

Pipeline:

resource URL
 -> source adapter
 -> metadata
 -> subtitle capability check
 -> fetch caption
 -> parse VTT/SRT
 -> normalize
 -> segment records
 -> database
 -> FTS5 indexing

Do not store MP4.
Do not store MP3.
Do not persist temporary subtitle files unless diagnostics explicitly require it.

Transcript segments must include:
- id
- transcript_id
- sequence
- start_ms
- end_ms
- text

Normalization should:
- merge duplicate/cue fragments where sensible
- retain timestamps
- preserve paragraph boundaries where possible
- preserve the original language
- avoid destructive “AI cleanup” at this stage

Add idempotency:
If the same source transcript is ingested twice without changes, do not create duplicate segments.

Add source provenance:
- source URL
- subtitle type: manual/auto/generated/unknown
- retrieved_at
- content hash

Add tests for VTT/SRT parsing and timestamp edge cases.

Acceptance test:
A captioned lecture becomes searchable transcript segments without any permanent video/audio file.
```

---

# 16. STAGE 9 — WHISPER FALLBACK + TEMP MEDIA CLEANUP

## Copy/paste prompt

```text
Implement STAGE 9: local Whisper fallback.

Goal:
When usable captions are unavailable, create a timestamped transcript using the user's local Whisper capability.

Architecture:

FastAPI
  -> JobService
      -> TemporaryMediaManager
      -> WhisperAdapter
      -> TranscriptNormalizer
      -> TranscriptRepository
      -> CleanupManager

Use the existing local Whisper installation if it is already available. If faster-whisper is added, put it behind the same interface.

Do not force model replacement just because a new library exists.

Temporary path:
<app-data>/temp/extraction/<job-id>/

Rules:
- unique job directory
- no shared global temp audio filename
- validate that transcript exists before deleting temporary media
- cleanup in a finally block
- cleanup also on failure and cancellation
- expose cleanup result in job diagnostics

Job states:
queued
running
succeeded
failed
cancelled
cleaned

The HTTP request that creates a transcription job must return quickly. Poll or stream job status.

Add tests for:
- no captions -> Whisper called
- captions available -> Whisper not called
- successful transcription -> temp audio removed
- failed transcription -> temp audio removed
- cancellation -> cleanup attempted
- duplicate job protection

Never add a UI button that silently downloads an entire lecture.
```

---

# 17. STAGE 10 — LECTURE WORKSPACE 

## Copy/paste prompt

```text
Implement STAGE 10: Lecture Workspace.

Layout:

Top:
- course path
- subject/unit/topic
- lecture title
- source status
- progress

Main:
- remote video/player area
- transcript
- notes
- AI actions placeholder

Transcript behavior:
- display timestamped segments
- clicking a segment opens/navigates the source at that timestamp
- current playback time highlights the corresponding segment when technically possible
- clicking a search result opens the lecture and focuses the matching segment

Use the official/normal playback mechanism provided by the source platform where possible.
Do not bypass access controls.

Persist:
- last position
- progress
- completed state
- last opened time

Notes:
- local Markdown/text-backed note editor
- autosave with debounce
- manual save indicator

Add a compact “source facts” panel:
- URL
- channel/author
- duration
- transcript source
- last verified

Do not implement AI generation in this stage.
```

---

# 18. STAGE 11 — SEARCH ENGINE

## Copy/paste prompt

```text
Implement STAGE 11: FTS5 search.

Start with SQLite FTS5 only.

Create searchable content for:
- resource title
- resource metadata
- transcript segments
- notes
- topics
- concepts when present
- flashcards

Search API should return:
- result type
- resource ID
- lecture title
- curriculum path
- matched text snippet
- transcript timestamp when applicable
- relevance/rank

Add filters:
- subject
- semester
- topic
- resource type
- completed status

Add keyboard shortcut to open global search.

Add result actions:
- open resource
- jump to transcript timestamp
- open topic
- open note

Do not add embeddings yet.

Add realistic test data and benchmarks for a few thousand transcript segments.
Record benchmark results in docs/TEST_MATRIX.md.
```

---

# 19. STAGE 12 — RESEARCH/REUSE OPENNOTEBOOKLM RETRIEVAL PATTERNS

## Copy/paste prompt

```text
Implement STAGE 12: local knowledge retrieval upgrade planning and only the pieces justified by current evidence.

Inspect:
third_party/reference/OpenNotebookLM

Do not copy the entire project.

Identify and document its useful patterns for:
- document/source ingestion
- chunking
- retrieval
- FTS5/BM25
- citations
- optional vector retrieval

Compare them against our current FTS5 implementation.

Only implement improvements that are clearly beneficial to LearningOS v0.1.

The first goal is source-grounded retrieval:
query -> matching segments -> ranked source references.

Keep the existing search API stable.

If you decide vectors are not necessary yet, do not add them. Record the decision in docs/DECISIONS.md.

If you add hybrid retrieval:
- choose a local embedding model where practical
- keep embeddings optional
- keep them outside the critical path for basic search
- allow deleting/rebuilding the index
- store model name/version
- store embedding dimension
- do not introduce a server database merely for vectors

Add tests proving citations resolve back to transcript segments.
```

---

# 20. STAGE 13 — SOURCE-GROUNDED AI TUTOR

## Copy/paste prompt

```text
Implement STAGE 13: source-grounded AI tutor.

Create an LLMProvider interface:
- chat
- generate_json
- optional embed

The backend owns API keys.
The renderer never receives secret credentials.

Implement:
POST /ai/resources/{resource_id}/ask

Input:
- resource ID
- optional selected segment IDs
- user question

Context selection:
1. selected transcript segments, if any
2. local search results from the resource
3. nearby transcript context where necessary
4. curriculum context

Do NOT send the entire course unless explicitly required.

The response schema must contain:
- answer
- citations[]
- warnings[]

Each citation:
- resource_id
- segment_id
- start_ms
- end_ms
- short quote/reference label

The model must be told:
- distinguish source facts from inference
- say when the source does not contain the answer
- do not fabricate citations

Validate the JSON against a schema before returning it.

Persist only useful user-requested artifacts or explicitly saved answers, not every chat token by default.

Add tests for:
- valid cited answer
- unknown answer
- malformed model output
- missing citation reference
- API failure
- timeout
```

---

# 21. STAGE 14 — AI STUDY ARTIFACTS

## Copy/paste prompt

```text
Implement STAGE 14: on-demand study artifact generation.

Artifacts:
- summary
- structured notes
- flashcards
- quiz
- revision sheet

All generation is explicitly user-triggered.

Each artifact stores:
- artifact ID
- source resource IDs
- source segment IDs where practical
- prompt/template version
- model/provider
- created_at
- content hash

Do not regenerate an identical artifact automatically.
Provide “regenerate” explicitly.

Flashcards:
- front
- back
- source
- topic
- tags
- provenance

Quiz questions:
- question
- options
- correct answer
- explanation
- source reference
- difficulty

Use structured JSON outputs with validation.

Add size limits so one large lecture cannot create an accidental huge request.

Provide a cost/token estimate when the provider exposes enough information, but do not require one.

Cache successful reusable artifacts.
```

---

# 22. STAGE 15 — ANKI + REVISION ENGINE

## Copy/paste prompt

```text
Implement STAGE 15: revision system.

Do not rebuild all of Anki.

Implement a LearningOS review abstraction that can later support FSRS.

Required local state:
- flashcard_id
- due_at
- interval_days
- stability if available
- difficulty if available
- repetitions
- lapses
- last_reviewed

UI:
- due today
- new cards
- learning cards
- completed review session
- weak concepts

Actions:
- Again
- Hard
- Good
- Easy

Keep the scheduling implementation isolated behind an interface.

Implement Anki-compatible export/import where practical.

Test deterministic scheduling with fixtures.
```

---

# 23. STAGE 16 — CONCEPT + PREREQUISITE GRAPH

## Copy/paste prompt

```text
Implement STAGE 16: knowledge graph.

Entities:
- concept
- definition/summary
- source resources
- source segments
- topic
- prerequisite/related/contrast/example relationships

Start with SQLite relational tables.
Do NOT introduce Neo4j.

Provide two views:
1. concept list
2. visual graph

The graph must support:
- zoom
- pan
- click node
- show source lectures
- show prerequisite direction
- open exact source timestamp

AI-generated links must include:
- confidence
- source evidence
- mapping method

Do not silently create a high-confidence prerequisite relation from weak evidence.
```

---

# 24. STAGE 17 — CURRICULUM MATCHING

## Copy/paste prompt

```text
Implement STAGE 17: curriculum matching.

Modes:

MANUAL
- user selects topic(s)

ASSISTED
- backend sends syllabus topics + lecture title + limited transcript context to the LLM
- LLM returns ranked candidates
- user approves

AUTOMATIC LATER
- allowed only as an opt-in bulk operation

Every match stores:
- resource_id
- topic_id
- confidence
- mapping_method
- created_at

UI should show:

Population inversion       0.94
Stimulated emission        0.91
Einstein coefficients      0.43

Never silently treat low-confidence AI suggestions as final truth.

Add a “Why this topic?” explanation showing the source phrase(s) used for the suggestion.
```

---

# 25. STAGE 18 — SURFSENSE INTEGRATION BOUNDARY

## Copy/paste prompt

```text
Implement STAGE 18: evaluate SurfSense as an optional study-artifact application.

Inspect:
third_party/reference/SurfSense

Do not embed the entire SurfSense product into the renderer.
Do not duplicate its database into our core database.

Determine the safest useful integration boundary from the actual repository.
Candidate boundaries:
- export LearningOS sources
- import generated study artifacts
- launch SurfSense as an optional local tool
- invoke a documented local API if one exists
- share files through a controlled exchange directory

Prefer a file-based or documented API boundary over deep database coupling.

Create:
apps/integrations/surfsense/

Add a manifest:
- app ID
- runtime
- capabilities
- permissions
- launch behavior

If no clean integration exists, keep SurfSense as a reference-only module and record the decision.
```

---

# 26. STAGE 19 — OPENMAIC INTEGRATION

## Copy/paste prompt

```text
Implement STAGE 19: OpenMAIC integration as an optional interactive-learning app.

Inspect the current OpenMAIC repository carefully before coding.
Pay special attention to the standalone package boundaries for:
- @openmaic/dsl
- @openmaic/renderer
- @openmaic/editor
- @openmaic/importer
- @openmaic/generation
- @openmaic/storage

Do not copy the entire OpenMAIC application into LearningOS.

Create:
apps/integrations/openmaic/

Adapter input:
- selected resources
- selected transcript segments
- curriculum topic
- concepts
- user notes

Adapter output:
- a validated internal InteractiveLesson artifact
- optional OpenMAIC-compatible lesson/DSL representation

The LearningOS core must not import OpenMAIC internals everywhere.
Only the adapter package knows OpenMAIC details.

User flow:

Lecture
 -> More tools
 -> Create interactive lesson
 -> choose sections
 -> generate
 -> validate lesson artifact
 -> open Interactive Lesson App

Do not generate video by default.
Prefer:
- interactive slide
- whiteboard
- quiz
- simulation
- concept navigation

Make this feature opt-in and disabled until its dependencies are available.
```

---

# 27. STAGE 20 — EXTERNAL WEB APP HOST

## Copy/paste prompt

```text
Implement STAGE 20: controlled external web-app host.

The goal is to support the concept “browser inside the learning app” without turning Electron into an uncontrolled browser.

Use Electron WebContentsView for embedded external web content where appropriate.
Do not use BrowserView.
Do not use the webview tag as the default architecture.

Create WebAppManifest:
- id
- name
- allowedOrigins
- launchURL
- permissions
- sessionPartition
- canOpenExternal
- enabledByDefault

Security rules:
- default deny
- explicit origin allowlist
- separate session where appropriate
- no Node integration
- no access to app filesystem
- no secret injection
- user-visible origin indicator
- external navigation policy
- open unsupported pages in external browser

Examples of acceptable uses:
- viewing a source webpage
- opening a course platform that permits normal embedding
- viewing a documentation site

Never bypass CSP, X-Frame-Options, authentication controls, paywalls, or other site restrictions.

Test:
- allowed origin opens
- disallowed origin is blocked
- navigation outside allowlist is handled safely
- external page cannot call privileged preload APIs
```

---

# 28. STAGE 21 — JOB ORCHESTRATOR + PARALLELISM

## Copy/paste prompt

```text
Implement STAGE 21: job orchestration.

Jobs are required for:
- metadata fetch
- transcript extraction
- Whisper
- bulk imports
- AI generation
- indexing
- rebuilds

Create:
- JobService
- JobRepository
- worker registry
- cancellation support
- retry policy
- concurrency limits

Rules:
- independent jobs may run in parallel
- CPU-heavy local transcription has a strict concurrency limit for the user's laptop
- AI calls use provider rate limits
- database writes are coordinated
- every temporary file is linked to a job ID

Expose:
- queue position
- progress
- current operation
- elapsed time
- retry count
- error summary

Add a “Jobs” screen so the user can see what the application is doing.

Do not create a distributed queue.
This is a single-user desktop application.
```

---

# 29. STAGE 22 — STORAGE AUDIT

## Copy/paste prompt

```text
Implement STAGE 22: storage audit and automatic cleanup.

Build a storage diagnostics screen that shows:
- SQLite database size
- transcript size
- notes size
- cache size
- temporary size
- optional vector index size
- thumbnails/cache size
- total application footprint

Create policies:

PERMANENT:
metadata, curriculum, transcript, notes, cards, quizzes, progress, provenance

TEMPORARY:
audio extraction, subtitle files, transient render files

OPTIONAL CACHE:
remote thumbnails, computed artifacts, local embedding index

Never silently retain lecture video/audio.

Add a cleanup command that is idempotent.

Add tests that create temporary job data and verify cleanup removes it.

Add a startup check that marks orphaned temp job directories for safe cleanup.
```

---

# 30. STAGE 23 — BACKUP / RESTORE

## Copy/paste prompt

```text
Implement STAGE 23: local backup and restore.

Provide:
- SQLite backup
- JSON export of portable domain data
- Markdown export of notes/curriculum
- flashcard export

Backup must NOT include temporary media.

Include:
- application schema version
- backup timestamp
- source app version
- integrity hash where practical

Restore flow:
1. validate backup
2. show summary
3. optionally create a safety backup
4. migrate/import
5. validate relationships
6. report failures

Do not overwrite the live database blindly.
```

---

# 31. STAGE 24 — SECURE SETTINGS + API PROVIDER SYSTEM

## Copy/paste prompt

```text
Implement STAGE 24: provider settings.

Providers:
- LLM provider
- optional embeddings provider
- Whisper/local STT
- optional TTS

The provider system must be interface-based.

Settings UI:
- provider
- model
- base URL when supported
- test connection
- model capability flags

Secrets:
- keep API keys out of the renderer
- never log full secrets
- never write secrets to docs
- use OS credential storage or a protected local mechanism where practical
- .env is development-only

A user can run the application with:
- no LLM key
- no TTS key
- no Veo key
- local Whisper only

Core browsing, organization and transcript reading must continue to work without an LLM provider.
```

---

# 32. STAGE 25 — DASHBOARD

## Copy/paste prompt

```text
Implement STAGE 25: dashboard.

The dashboard should answer four questions immediately:

1. What am I studying?
2. What have I completed?
3. What is due/relevant today?
4. What should I study next?

Widgets:
- semester progress
- subject progress
- recent lectures
- continue watching
- due flashcards
- weak topics
- unfinished curriculum topics
- running jobs
- source availability warnings

Do not invent “AI recommendations” yet. Use deterministic signals first.

Provide a command palette for fast actions:
- add resource
- search
- open curriculum
- continue lecture
- generate flashcards
- start revision
```

---

# 33. STAGE 26 — PERFORMANCE FOR 8 GB RAM

## Copy/paste prompt

```text
Implement STAGE 26: performance and memory pass for an 8 GB RAM Windows laptop.

Inspect real memory/CPU behavior.

Optimize:
- lazy loading of transcript panels
- pagination/virtualization for long transcript lists
- delayed loading of optional apps
- process isolation for Whisper/heavy tools
- bounded job concurrency
- release remote views when hidden
- avoid loading entire transcripts into the renderer when unnecessary
- cache small metadata only

Do not optimize by deleting useful data.

Document measured before/after numbers in docs/TEST_MATRIX.md.
```

---

# 34. STAGE 27 — END-TO-END MVP TEST current

## Copy/paste prompt

```text
Implement STAGE 27: full v0.1 end-to-end test.

The test flow must be:

1. create a course
2. create semester
3. create subject
4. create unit
5. create topic
6. add a lecture URL
7. retrieve metadata
8. retrieve captions if available
9. otherwise run local Whisper fallback
10. store transcript segments
11. index transcript
12. open lecture workspace
13. click a transcript timestamp
14. create a note
15. search for a transcript phrase
16. ask the AI tutor about selected text when provider is configured
17. generate flashcards
18. export flashcards
19. mark progress
20. review a flashcard
21. restart the application
22. verify all persistent state remains
23. verify no permanent lecture video/audio exists

Create a reproducible test fixture or mock source so CI/dev tests do not depend on YouTube availability.

Add a separate manual smoke-test document for real YouTube operation.
```

---

# 35. STAGE 28 — OPTIONAL MCP BRIDGE

## Copy/paste prompt

```text
Implement STAGE 28 only if a real integration need exists: optional MCP bridge.

The internal Tool Bus remains the source of truth.

Expose a thin MCP adapter that maps selected capabilities to MCP tools.

Do not expose everything by default.

Allowlist:
- curriculum.read
- resource.read
- search.query
- notes.read
- concepts.read
- flashcards.export

Write capabilities for future integrations but keep them disabled.

Do not expose:
- raw filesystem access
- API secrets
- arbitrary subprocess execution
- unrestricted external web requests

Document exactly how an external agent would authenticate/authorize and how its tool calls map to internal capabilities.
```

---

# 36. STAGE 29 — FINAL APP-MODULE PACKAGING

## Copy/paste prompt

```text
Implement STAGE 29: package each module as an app-like capability boundary.

Modules:
- dashboard
- curriculum
- resources
- lecture
- search
- notes
- study
- revision
- concepts
- interactive lessons
- integrations

Each module must have:
- manifest
- route
- API contract
- required capabilities
- permission scope
- health state
- enable/disable behavior
- tests

The shell must remain usable when any optional module is disabled.

Do not create 12 separate npm applications. Keep the repository maintainable. The “app” abstraction is a runtime boundary, not an excuse for needless microservices.
```

---

# 37. STAGE 30 — POLISH + RELEASE BUILD

## Copy/paste prompt

```text
Implement STAGE 30: release hardening.

Do not add new product features.

Audit:
- startup
- graceful shutdown
- migrations
- backup
- temp cleanup
- permission checks
- external origin allowlist
- secret handling
- logging
- error messages
- offline behavior
- network failure behavior
- missing Whisper behavior
- missing FFmpeg behavior
- missing LLM provider behavior

Build Windows installer.

Test a clean-machine-style installation in a disposable directory.

Document:
- install
- first run
- storage locations
- backup
- troubleshooting
- optional integration setup
- known limitations

Create a release checklist and update BUILD_STATE.md to RELEASE_CANDIDATE only when all mandatory acceptance tests pass.
```

---

# 38. MASTER ACCEPTANCE TEST

The product is considered operational when this scenario works:

```text
Open LearningOS
      |
      v
Choose Semester 1
      |
      v
Open Applied Physics
      |
      v
Open Unit 1 — Laser
      |
      v
Paste a remote lecture URL
      |
      v
Metadata appears
      |
      v
Caption found
      |
      +----> transcript is created
      |
      v
Lecture Workspace opens
      |
      v
Transcript click -> correct source timestamp
      |
      v
Search “population inversion”
      |
      v
Exact lecture segment appears
      |
      v
Select segment -> Explain
      |
      v
AI answer returns citations
      |
      v
Generate flashcards
      |
      v
Review flashcards
      |
      v
Concept graph opens
      |
      v
Interactive lesson is optional
      |
      v
Close application
      |
      v
Reopen application
      |
      v
Everything persists
      |
      v
Storage audit shows no permanent lecture media
```

---

# 39. DEVELOPER BEHAVIOR RULES FOR CLAUDE CODE / CODEX

When the agent discovers existing code that solves 80% of a problem:

```text
inspect -> compare -> adapt -> test
```

not:

```text
rewrite -> duplicate -> create new framework
```

When a repository contains a useful component:

```text
reference repo
     |
     +--> library/package? ----> use package
     |
     +--> CLI/process? --------> wrap process
     |
     +--> isolated code? ------> selective copy + attribution
     |
     +--> tangled application? -> reference only
```

When the user says “make it work like X”:

1. inspect X's actual implementation,
2. identify the narrow contract needed,
3. implement an adapter,
4. keep the LearningOS contract stable.

Never import a repository's entire architecture just because one feature is useful.

---

# 40. SESSION END COMMAND

At the end of every coding session, paste this if the agent has forgotten the operating protocol:

```text
SESSION CLOSEOUT.

Stop feature development.

1. Run relevant tests.
2. Inspect git diff.
3. Remove debug code from this session.
4. Update docs/WORK_LOG.md.
5. Update docs/BUILD_STATE.md.
6. Update docs/AGENT_MEMORY.md.
7. Update docs/REPO_MAP.md if files/interfaces were discovered.
8. Update docs/INTEGRATION_CONTRACTS.md if an integration changed.
9. Update docs/DECISIONS.md for any architectural decision.
10. Update docs/TEST_MATRIX.md with newly created tests.
11. Verify no secrets were added.
12. Verify no permanent lecture video/audio was created by this stage.
13. Report exact files changed and tests passed.
14. Do not push.
```

---

# 41. QUICK STAGE MAP

```text
0   Documentation/control center
1   Repository audit
2   Electron + React + FastAPI shell
3   App Host + Tool Bus
4   SQLite
5   Curriculum
6   Resource Library
7   YouTube Tracker selective reuse
8   Captions
9   Whisper fallback
10  Lecture Workspace
11  FTS5 search
12  OpenNotebookLM retrieval audit
13  AI tutor
14  AI artifacts
15  Revision + Anki
16  Concept graph
17  Curriculum matcher
18  SurfSense boundary
19  OpenMAIC boundary
20  External Web App Host
21  Job orchestration
22  Storage audit
23  Backup/restore
24  Provider settings
25  Dashboard
26  8 GB performance
27  E2E MVP
28  Optional MCP bridge
29  App packaging boundaries
30  Release hardening
```

The shortest path to a useful application is stages 0–11. Stages 12–30 extend the system without making them prerequisites for basic lecture organization.
