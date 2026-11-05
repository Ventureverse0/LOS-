# StudyOS — Data Model, Schema & Migration Architecture (Schema v3)

## 1. Root State Envelope (`StudyOSState`)

All student records for an active profile are stored in a strongly typed `StudyOSState` document (`schemaVersion: 3`) defined in `/src/types/studyOS.ts`:

```text
StudyOSState (schemaVersion: 3)
├── workspaceSyncId: string ("ws_...")
├── settings: UserSettings
├── stats: UserStats
├── academicProfile: StudentAcademicProfile
│   ├── institution, programme, degreeLevel, academicYear, semester
│   ├── academicGoals[], personalLearningGoals[], preferredLearningMethods[]
│   ├── accessibilityPreferences
│   ├── semesterHistory: AcademicHistorySemester[]
│   ├── skills: SkillRecord[]
│   ├── projects: PortfolioProject[]
│   └── certifications: CertificationMilestone[]
├── courses: Course[] (supports academicYear, semester, credits, archived, tags[])
├── modules: ModuleUnit[] (supports unitGroup, learningObjectives[], unresolvedQuestions[], reflectionNote, noteRevisions[], archived)
├── tasks: AcademicTask[] (ISO YYYY-MM-DD dueDate, priority, status, estimatedMinutes, examChapters[], recoveryPlanNote)
├── assessments: Assessment[] (quizzes, practice sets, mock exams, rubric definitions)
├── assessmentAttempts: AssessmentAttempt[] (append-only historical attempts with score, maxScore, percentage, difficulty, selfConfidence, errorCategories[], isDelayedRecall)
├── studySessions: StudySessionRecord[] (idempotencyKey, courseId, moduleId, durationMinutes, kind, startedAt, endedAt)
├── learningEvents: LearningEvent[] (durable longitudinal ledger with idempotencyKey)
├── recordCorrections: RecordCorrection[] (audit trail whenever an attempt/session/task is edited or deleted)
├── recommendationFeedback: RecommendationFeedback[] (accepted / snoozed / dismissed state)
├── activeFocusSession: ActiveFocusSession | null (reload-safe timer state)
└── flashcards: Flashcard[] (Leitner box 1..5 + nextReviewAt, reviewCount, lapseCount)
```

---

## 2. Key Entity Integrity Rules

### 2.1 `AssessmentAttempt` (Append-Only Evidence Record)
- Every completed quiz or logged exam/assignment creates a **new** `AssessmentAttempt` with a unique `id` and ISO `attemptedAt`.
- Historical attempts are never overwritten when a learner re-takes a topic quiz; `computeTopicMastery` sorts all attempts chronologically to compute `baselineScore`, `latestScore`, and `deltaScore`.
- If a student made a data-entry typo (e.g., typed `90/10` or `5/20` instead of `15/20`), editing or deleting the record via `correctAssessmentAttempt` or `deleteAssessmentAttempt` writes an explicit `RecordCorrection` entry recording the reason, timestamp, and prior summary, then recalculates mastery cleanly.

### 2.2 `StudySessionRecord` & `LearningEvent` (Idempotent Activity Ledger)
- Every focus sprint and significant learning mutation carries a deterministic `idempotencyKey`.
- `appendStudySessionIdempotent` and `appendLearningEventIdempotent` check existing keys before insertion so browser reloads, double-clicks, or state retries never double-count study minutes or events.
- Unlike `activityLog` (which caps recent UI feed items at 80), `learningEvents`, `studySessions`, and `assessmentAttempts` are durable longitudinal collections used for 7d/30d/90d/all-time analytics.

### 2.3 Non-Destructive Archiving (`Course.archived` & `ModuleUnit.archived`)
- Courses or topics linked to historical `AssessmentAttempt` or `StudySessionRecord` items can be archived (`archived: true`, `archivedAt: ISO`) rather than deleted.
- `syncCoursesWithModules` excludes `m.archived` from active syllabus denominators (`totalUnits`, `completedUnits`), preventing syllabus edits from distorting current progress while preserving historical records for Growth Intelligence and Portfolio exports.

---

## 3. Non-Destructive Schema Migration (`v1 / v2 → v3`)

`sanitizeState(raw, fallback)` in `/src/lib/storage.ts` upgrades any legacy `localStorage` (`study_os_state_v1`, `study_os_profile_state_v2:*`), `IndexedDB` (`StudyOS_IndexedDB_v1` / `v2`), `.studyos.json` backup, or server snapshot (`./data/workspaces/ws_*.json`) on load:
1. Preserves 100% of existing `courses`, `modules`, `notesMarkdown`, `resources`, `bookmarks`, `flashcards`, `researchSessions`, `timeBlocks`, `deadlines`, `stats`, and `workspaceSyncId`.
2. Backfills missing v3 collections (`academicProfile`, `tasks`, `assessments`, `assessmentAttempts`, `studySessions`, `learningEvents`, `recordCorrections`, `recommendationFeedback`, `activeFocusSession: null`) with clean empty arrays/defaults—never injecting fake demo scores or fabricated student history.
3. Stamps `schemaVersion: 3` on the normalized state.

---

## 4. LearningOS Physical SQLite + FTS5 Schema (`node:sqlite` Migrations `001`–`003`)

In addition to the browser-side `StudyOSState` envelope, LearningOS persists structured relational data, transcripts, lexical search indices, concept graphs, jobs, and cached artifacts in a local SQLite database (`data/sqlite/learningos.db`, WAL mode, `PRAGMA foreign_keys = ON`) managed by `/src/server/sqliteLearningOS.ts`.

### 4.1 Versioned Migrations
- `001_core_curriculum_resources_transcripts`: Creates `schema_migrations`, `courses`, `semesters`, `subjects`, `units`, `topics`, `resources`, `resource_topics`, `transcripts`, `transcript_segments`, `notes`, `progress_events`, `jobs`, and `app_settings`.
- `002_fts5_lexical_index`: Creates `search_fts` (`USING fts5(entity_type, entity_id UNINDEXED, resource_id UNINDEXED, topic_id UNINDEXED, title, body, curriculum_path, start_ms UNINDEXED, end_ms UNINDEXED, tokenize='porter unicode61')`) for `<100ms` BM25 lexical retrieval with `snippet()` highlighting.
- `003_concepts_artifacts_fsrs`: Creates `concepts`, `concept_links`, `flashcards` (with FSRS `stability`, `difficulty`, `interval_days`, `repetitions`, `lapses`, `state`, `due_at`), `review_logs`, `quizzes`, and `study_artifacts`.

### 4.2 Entity Primary Keys, Foreign Keys & Lifecycle States

| Table | Primary Key | Foreign Keys | Key Columns & Lifecycle States |
|---|---|---|---|
| `courses` | `id TEXT` | — | `title`, `program`, `institution`, `created_at` |
| `semesters` | `id TEXT` | `course_id -> courses(id) ON DELETE CASCADE` | `number`, `title`, `sort_order` |
| `subjects` | `id TEXT` | `semester_id -> semesters(id) ON DELETE CASCADE` | `code`, `title`, `credits`, `archived (0/1)` |
| `units` | `id TEXT` | `subject_id -> subjects(id) ON DELETE CASCADE` | `title`, `sort_order` |
| `topics` | `id TEXT` | `unit_id -> units(id) ON DELETE CASCADE` | `title`, `sort_order`, `status ('unread' \| 'studying' \| 'completed' \| 'archived')` |
| `resources` | `id TEXT` | — | `url`, `source_type ('youtube' \| 'vimeo' \| 'lecture_page' \| 'pdf' \| 'local_doc' \| 'external_web')`, `availability ('available' \| 'unavailable' \| 'unchecked')`, `progress_percent`, `last_position_ms`, `permanent_download_allowed (0)` |
| `resource_topics` | `(resource_id, topic_id)` | `resource_id -> resources(id) ON DELETE CASCADE`, `topic_id -> topics(id) ON DELETE CASCADE` | `confidence REAL (0..1)`, `mapping_method ('manual' \| 'assisted_approved' \| 'auto_bulk')`, `rationale` |
| `transcripts` | `id TEXT` | `resource_id -> resources(id) ON DELETE CASCADE` | `language`, `source_kind ('manual_caption' \| 'auto_caption' \| 'whisper' \| 'imported')`, `content_hash` (deterministic FNV-1a 64-bit) |
| `transcript_segments` | `id TEXT` | `transcript_id -> transcripts(id) ON DELETE CASCADE`, `resource_id -> resources(id) ON DELETE CASCADE` | `seq_index`, `start_ms`, `end_ms`, `text`, `section_heading` |
| `notes` | `id TEXT` | `topic_id -> topics(id) ON DELETE SET NULL`, `resource_id -> resources(id) ON DELETE SET NULL` | `title`, `markdown`, `timestamp_ms`, `tags_json`, `content_hash` |
| `concepts` | `id TEXT` | `topic_id -> topics(id) ON DELETE SET NULL`, `source_resource_id -> resources(id) ON DELETE SET NULL` | `name`, `summary`, `source_segment_id`, `confidence`, `mapping_method` |
| `concept_links` | `id TEXT` | `from_concept_id -> concepts(id) ON DELETE CASCADE`, `to_concept_id -> concepts(id) ON DELETE CASCADE` | `relation_type ('prerequisite' \| 'related' \| 'contrast' \| 'example')`, `confidence`, `evidence` |
| `flashcards` | `id TEXT` | `topic_id -> topics(id) ON DELETE SET NULL`, `resource_id -> resources(id) ON DELETE SET NULL` | `front`, `back`, `due_at`, `interval_days`, `stability`, `difficulty`, `repetitions`, `lapses`, `state ('new' \| 'learning' \| 'review' \| 'relearning')`, `provenance_json` |
| `study_artifacts` | `id TEXT` | `resource_id -> resources(id) ON DELETE CASCADE` | `artifact_type ('summary' \| 'structured_notes' \| 'flashcards' \| 'quiz' \| 'revision_sheet' \| 'interactive_lesson')`, `prompt_version`, `provider`, `content_hash`, `payload_json` |
| `jobs` | `id TEXT` | `resource_id -> resources(id) ON DELETE SET NULL` | `job_type`, `status ('queued' \| 'running' \| 'succeeded' \| 'failed' \| 'cancelled' \| 'cleaned')`, `progress`, `temp_dir`, `cleanup_status ('not_needed' \| 'pending' \| 'verified_deleted')` |

