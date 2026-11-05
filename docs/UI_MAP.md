# LearningOS / StudyOS — UI Route & Workspace Map (`UI_MAP.md`)

All existing StudyOS views are preserved intact alongside the new **LearningOS Studio** hub (`AppView.LEARNING_OS`).

| Workspace / Screen | `AppView` Enum | Shortcut | Component | Primary Capabilities |
|---|---|---|---|---|
| **Command Dashboard** | `DASHBOARD` | `Mod+1` | `DashboardView.tsx` | Today's plan, approaching & overdue deadlines, revision queue, progress metrics, Next-Best-Actions, and LearningOS Studio quick launch |
| **Courses & Hierarchy** | `COURSES` | `Mod+2` | `CourseManagerView.tsx` | `Programme -> Year -> Semester -> Course -> Unit -> Topic -> Objective`, Kanban/Table/Matrix views, `↑`/`↓` topic reordering, `"Uncovered topic"` badge, safe `Archive Safe` vs `Force Delete` confirmation |
| **Knowledge Vault** | `VAULT` | `Mod+3` | `KnowledgeVaultView.tsx` | Split Markdown + LaTeX editor, revision history, page/timestamp highlights -> Flashcard/Quiz promotion, personal knowledge map, multimodal file ingest |
| **Curriculum Synthesizer** | `SYNTHESIZER` | `Mod+4` | `CurriculumSynthesizerView.tsx` | Server-side Gemini (`gemini-3.8-flash`) + offline first-principles course & syllabus compiler |
| **LearningOS Studio** | `LEARNING_OS` | `Alt+L` / `Mod+Shift+L` | `LearningOSHubView.tsx` (Lazy) | **6-Tab Local-First Engine**:<br>1. **Lecture & Cited Tutor**: Remote URL ingest, captions-first WebVTT/SRT/XML parser, Whisper fallback trigger, clickable transcript cues, timestamp notes, cited AI Tutor, cached Study Artifacts (`summary`, `structured_notes`, `flashcards`, `quiz`, `revision_sheet`), OpenMAIC Interactive Lesson builder.<br>2. **FTS5 Search**: `<100ms` SQLite FTS5 BM25 search with subject/type/completion filters, `snippet()` highlights, and 1-click timestamp jump.<br>3. **Concept Graph**: Concept list + zoomable/pannable SVG prerequisite/related/contrast/example graph with timestamp links.<br>4. **Curriculum Matcher**: Manual topic mapping + Assisted candidate ranking (`confidence` + `"Why this topic?"` + explicit `Approve` button).<br>5. **Storage, Jobs & Backup**: Storage footprint breakdown (`Permanent Media: 0 B`), job queue (`queued`/`running`/`cleaned`/`failed`/`cancelled`), idempotent temp cleanup, SHA-256 SQLite portable backup/restore.<br>6. **AppHost, Bridges & Settings**: 14 `AppManifest` runtime toggles (core protected), ToolBus status, opt-in MCP read-only toggle, SurfSense JSON exchange, Default-Deny External Web evaluator, AI/STT provider diagnostics. |
| **Tasks, Exams & Practice** | `TASKS_ASSESSMENTS` | `Alt+A` | `TasksAssessmentsView.tsx` | Assignments, exam timetable, missed-task recovery, `.ics` calendar export, topic quizzes, rubric attempt logging, mistake tutor |
| **Growth Intelligence** | `GROWTH_INTELLIGENCE` | `Alt+G` | `GrowthIntelligenceView.tsx` | Anti-inflation Topic Mastery Engine, `7d`/`30d`/`90d`/`All` trends, calibration gap, growth timeline, weekly/monthly reviews, record audit |
| **Academic Profile & Skills** | `ACADEMIC_PROFILE` | `Alt+P` | `AcademicProfileView.tsx` | Student identity, semester history, accessibility controls, verified vs self-reported skills, projects, `.md` portfolio export |
| **Pomodoro Focus** | `POMODORO` | `Mod+6` | `ExecutionToolsView.tsx` | Reload-safe Pomodoro sprints, manual session log, idempotent event ledger |
| **FSRS & Leitner Flashcards** | `FLASHCARDS` | `Mod+7` | `ExecutionToolsView.tsx` | `All / Due / New / Learning / Weak` filters, FSRS stability/difficulty/lapses metadata, `Again / Hard / Good / Easy` review actions, bidirectional Anki `.tsv` export & import |
| **CLI Terminal** | `TERMINAL` | `Mod+8` | `ExecutionToolsView.tsx` | Keyboard CLI including `apps` (AppHost manifests) and `fts <query>` (live SQLite FTS5 BM25 query) |
| **3D RK4 Physics Lab** | `PHYSICS_LAB` | `Mod+9` | `IntegrativePhysicsLabGame.tsx` (Lazy) | 120Hz Runge-Kutta interactive 3D dynamical simulation |

### Global Modals & Overlays
- **Command Palette (`Mod+K`)**: `CommandPalette.tsx` — Instant search and jump to any StudyOS or LearningOS action.
- **Interactive Walkthrough Guide**: `StudyGuideModal.tsx` — 8-step guided onboarding covering the complete StudyOS + LearningOS loop.
- **Profile Onboarding**: `OnboardingModal.tsx` — Non-intrusive first-visit workspace initialization.
