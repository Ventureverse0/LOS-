# StudyOS — Known Issues & Audit Findings Log

## Baseline Issues Identified in Phase 1 Audit

### KI-01 — Self-Reported Status Conflated with Verified Mastery (Critical / P0)
- **Symptom**: Clicking `"Master (+100 XP)"` on any `ModuleUnit` immediately marks the unit and course `100% MASTERED` without any quiz, practice attempt, or assessment evidence.
- **Impact**: Violates core educational trustworthiness; passive note creation or manual status clicks appear indistinguishable from proven competence.
- **Resolution Target**: Separate workflow status (`To Do` / `In Progress` / `Completed`) from **Evidence-Based Topic Mastery** computed strictly from `AssessmentAttempt` records, returning `"Not enough evidence yet."` when assessment data is insufficient. *(Resolved in Phase 6/7 upgrade)*

### KI-02 — Missing Historical Assessment Attempts & Error Categorization (Critical / P0)
- **Symptom**: No entity exists for quizzes, exams, or graded assignments; flashcard reviews overwrite `box` and `lastReviewedAt` in place.
- **Impact**: Cannot measure baseline vs. current performance, score deltas across attempts, calibration between self-confidence and accuracy, or recurring mistake categories.
- **Resolution Target**: Add `Assessment` and append-only `AssessmentAttempt` records with immutable attempt history, error categories, confidence ratings, delayed-recall flags, and auditable `RecordCorrection` entries. *(Resolved in Phase 6/7 upgrade)*

### KI-03 — Activity History Truncated at 60 Items & Non-Idempotent Logging (High / P0)
- **Symptom**: `prependActivity` in `StudyOSContext.tsx` slices `activityLog` to `60` entries, permanently dropping older history; Pomodoro/study logs lack idempotency keys.
- **Impact**: Long-term semester analytics, weekly/monthly reviews, and historical timelines lose underlying records.
- **Resolution Target**: Add durable `learningEvents` ledger with deterministic idempotency keys and full time-window querying. *(Resolved in Phase 6/7 upgrade)*

### KI-04 — Silent Persistence Failures & Lost Active Timer on Reload (High / P0)
- **Symptom**: `persistState` catches `localStorage` quota exceptions silently and ignores `IndexedDB` write errors; `pomodoroTimer` lives only in React `useState`.
- **Impact**: Users are not warned if browser storage fails; refreshing the tab mid-Pomodoro discards the active focus sprint.
- **Resolution Target**: Return structured save status (`saving` / `saved` / `error`) from storage operations, surface save failures clearly in the UI header/toast, and persist active/paused focus session state safely across reloads. *(Resolved in Phase 6/7 upgrade)*

### KI-05 — Destructive Syllabus Deletion & Free-Text Deadlines (High / P0)
- **Symptom**: Deleting a course or syllabus unit permanently removes child records; `DeadlineItem.dueLabel` is free text (`"In 3 Days"`), preventing reliable overdue detection and recovery workflows.
- **Resolution Target**: Support non-destructive archiving on courses/modules so historical attempts and events survive syllabus changes; introduce `AcademicTask` with ISO `dueDate`, priority, effort estimate, exam links, and missed-task recovery actions. *(Resolved in Phase 6/7 upgrade)*

### KI-06 — Ephemeral Container Filesystem & Unauthenticated Local Sync Endpoint (Architectural Constraint — Documented)
- **Symptom**: `./data/workspaces/<workspaceSyncId>.json` is stored on the Node server's local disk without user authentication, and cloud preview containers may reset local disk on redeploy.
- **Impact**: Browser `IndexedDB` + `.studyos.json` portable backups are the primary durable user-controlled stores unless a persistent server volume and authenticated multi-user backend are provisioned in a future cloud phase.
- **Mitigation**: Disclosed transparently in `SettingsView` (Privacy & Data Control panel) and `docs/PRIVACY_AND_SECURITY.md`, with one-click `.studyos.json` backup export, Anki `.tsv` export, and explicit workspace deletion controls.

### KI-07 — External Headless Browser Inspection Unavailable in Build Sandbox (Audit Environment Constraint)
- **Symptom**: Build environment provides HTTP `curl` and full filesystem/server access, but no headless Chromium browser to visually interact with `https://study-osys.ai.studio`.
- **Mitigation**: Disclosed transparently in `docs/PRODUCT_AUDIT.md` and final report; verified HTTP `200` headers on deployed URL and executed comprehensive unit/integration tests against the local Express + React codebase.
