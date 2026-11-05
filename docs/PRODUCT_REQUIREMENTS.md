# StudyOS — Complete Product Requirements Specification (v3.0)

## 1. Scope & Evolution Mandate

StudyOS evolves the existing deployed workspace (`https://study-osys.ai.studio`) into a complete **Student Learning and Growth Operating System** while preserving 100% of existing working capabilities (Grokopedia curriculum synthesis, Course tag filtering, Markdown/YouTube Knowledge Vault, Leitner flashcards, Pomodoro focus timer, 3D RK4 Physics Lab, Command Palette, Global Keyboard Shortcuts, and local multi-profile storage).

---

## 2. Functional Requirements by Module

### 2.1 Student Identity & Academic Profile (`AppView.PROFILE`)
- **FR-2.1.1**: Maintain an editable `StudentAcademicProfile` with optional personal fields (`fullName`, `institution`, `degreeLevel`, `programme`, `academicYear`, `semester`). Optional fields must never block app usage.
- **FR-2.1.2**: Support academic goals, personal learning goals, preferred study methods, and accessibility preferences (`reducedMotion`, `highContrastText`, `comfortableSpacing`).
- **FR-2.1.3**: Support multi-semester history (`AcademicHistorySemester`) so learners can record term-by-term outcomes over multiple academic years.

### 2.2 Connected Academic Structure (`AppView.COURSES` & `AppView.VAULT`)
- **FR-2.2.1**: Represent the connected hierarchy: `Degree/Programme → Academic Year → Semester → Course (Subject) → Unit Group → Topic (ModuleUnit) → Learning Objective`.
- **FR-2.2.2**: Link resources, Markdown notes, note revisions, unresolved questions, flashcards, study sessions, tasks, assessments, skill mappings, and personal reflections directly to `courseId` and `moduleId`.
- **FR-2.2.3**: Provide non-destructive **Archive / Restore** on both Courses and Topics so syllabus revisions exclude archived items from active workload counts without deleting historical attempts or notes.

### 2.3 Daily Planning & Command Dashboard (`AppView.DASHBOARD`)
- **FR-2.3.1**: Answer all 7 daily student questions at a glance:
  1. *What should I do today?*
  2. *Which deadlines are approaching?*
  3. *Which topics need revision?*
  4. *What have I completed?*
  5. *What has improved?*
  6. *What is still difficult?*
  7. *What is the next most useful action?*
- **FR-2.3.2**: Render explainable `NextBestActionItem` cards with priority badges, explicit data provenance (`whySuggested`), direct execution routing, 24-hour Snooze, and Dismiss controls.

### 2.4 Resource Library & Lecture Workspace (`AppView.VAULT`)
- **FR-2.4.1**: Store external links (`pdf`, `github`, `doc`, `arxiv`) with descriptions, tags, and source metadata alongside YouTube lecture embeds and timestamped bookmarks.
- **FR-2.4.2**: Track topic-level `learningObjectives`, `unresolvedQuestions` (open vs. resolved), and `reflectionNote`.
- **FR-2.4.3**: Provide cross-vault full-text search spanning module titles, Markdown notes, tags, key concepts, resource titles/descriptions, and unresolved questions.

### 2.5 Notes & Knowledge Management (`AppView.VAULT`)
- **FR-2.5.1**: Support Split/Editor/Preview Markdown + LaTeX editing, multimodal document upload (`.md`, `.txt`, `.pdf`, images, code), and `.md` export.
- **FR-2.5.2**: Surface explicit storage health (`Saved`, `Saving`, or `Save Failed · Retry` banner in header/sidebar/vault) whenever browser persistence encounters an error.
- **FR-2.5.3**: Capture lightweight `NoteRevision` snapshots on substantive edits so learners can restore prior note versions safely.

### 2.6 Tasks, Assignments & Examinations (`AppView.ASSESSMENTS`)
- **FR-2.6.1**: Support `AcademicTask` records across `assignment`, `homework`, `practical`, `project`, `exam`, and `revision` kinds with ISO `YYYY-MM-DD` due dates, priority, effort minutes, status, optional exam chapter lists, and earned marks/feedback.
- **FR-2.6.2**: Automatically detect overdue tasks (`dueDate < today` and not completed/submitted) and provide a **Missed-Task Recovery** workflow to log a recovery plan and reschedule deadlines cleanly.

### 2.7 Practice, Quizzes, Assessments & Spaced Repetition (`AppView.ASSESSMENTS` & `AppView.FLASHCARDS`)
- **FR-2.7.1**: Support interactive topic quizzes (AI-generated when configured or deterministic notes-derived offline), manual graded assessment logging, and delayed recall checks (`isDelayedRecall: true`).
- **FR-2.7.2**: Preserve every `AssessmentAttempt` in an append-only collection with `score`, `maxScore`, `percentage`, `difficulty`, `selfConfidence` (`1–5`), `errorCategories` (`conceptual`, `calculation`, `recall`, `careless`, `time_pressure`), and optional `reflection`.
- **FR-2.7.3**: Compute Leitner `nextReviewAt` timestamps on flashcard reviews, provide a `Due Now` queue filter, and export decks to Anki-compatible `.tsv`.

### 2.8 Focus & Study Activity (`AppView.POMODORO`)
- **FR-2.8.1**: Support subject- and topic-tagged Pomodoro focus sprints (`25m`, `50m`, `90m`) and manual offline study logging.
- **FR-2.8.2**: Persist `activeFocusSession` across browser reloads with safe recovery of interrupted sessions and deduplicate completed session logs via `idempotencyKey`.

### 2.9 Record-Grounded AI Learning Assistant (`AppView.ASSESSMENTS` & `AppView.GROKOPEDIA`)
- **FR-2.9.1**: Provide server-proxied AI tutoring (`explain`, `step_by_step`, `socratic`, `generate_quiz`, `mistake_analysis`) grounded in the learner's selected module notes and historical `AssessmentAttempt` errors, with deterministic offline fallback when no API key is configured.
- **FR-2.9.2**: Visually separate AI-generated suggestions/quizzes from verified student records and require explicit user action before saving generated quizzes or notes.

### 2.10 Skills, Projects & Evidence Portfolio (`AppView.PROFILE`)
- **FR-2.10.1**: Track student `SkillRecord`, `PortfolioProject`, and `CertificationMilestone` items linked to courses and modules.
- **FR-2.10.2**: Compute `SkillEvidenceSummary` strictly separating `selfConfidence` (`1–5`) from `assessedScore` (`0–100%`), labeling unassessed skills `"Self-Reported Only"` and exporting an honest Markdown Evidence Portfolio (`.md`).

### 2.11 Student Growth Intelligence (`AppView.GROWTH`)
- **FR-2.11.1**: Compute empirical topic mastery (`insufficient_evidence`, `emerging`, `developing`, `proficient`, `verified_mastery`), time-window analytics (`7d`, `30d`, `90d`, `all`), chronological Growth Timeline, Weekly/Monthly Periodic Reviews with missing-data disclosures, and auditable `RecordCorrection` history.
