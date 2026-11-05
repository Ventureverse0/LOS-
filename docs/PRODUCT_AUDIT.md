# StudyOS — Phase 1 Product Audit

## 1. Audit Scope & Inspection Methodology

- **Target Deployed Application**: `https://study-osys.ai.studio`
- **Audit Timestamp**: `2026-10-25T05:00:00Z`
- **External URL Verification**:
  - Probed `https://study-osys.ai.studio` via HTTP HEAD/GET headers (`curl -sIL https://study-osys.ai.studio`).
  - Confirmed live response: `HTTP/2 200`, `x-powered-by: Express`, `content-type: text/html; charset=UTF-8`, `content-length: 1574`, `last-modified: Sat, 24 Oct 2026 14:19:12 GMT`.
- **Browser Capability Disclosure**:
  - The AI Studio build sandbox does not expose an interactive Chromium browser tool capable of executing client-side JavaScript against external HTTPS origins. Per the audit protocol, no visual inspection of external rendered pages is fabricated.
  - Instead, we performed a full line-by-line inspection of the deployed repository source code, Express backend (`server.ts`), local running instance (`http://localhost:3000`), live API health endpoints (`/api/db/health`, `/api/ai/status`), existing persisted workspace envelope (`data/workspaces/ws_shoeyidc5qn2oi.json`), TypeScript static analysis (`tsc --noEmit`), and unit test suite (`npm test` -> `20/20` passing).
- **Version Control & Production Data Baseline**:
  - `.git` is not initialized inside the `/app/applet` container (`fatal: not a git repository`).
  - Existing server-side workspace record detected at `data/workspaces/ws_shoeyidc5qn2oi.json` (`revision: 3`, `studentHandle: "learner"`, `streakCount: 2`, `todayMinutesSpent: 2`). This file and any browser `localStorage` / `IndexedDB` snapshots (`study_os_state_v1`, `study_os_profile_state_v2:*`, `StudyOS_IndexedDB_v2`) must be preserved and migrated non-destructively.

---

## 2. Verified Technology Stack

| Layer | Actual Implementation | Notes |
| --- | --- | --- |
| Frontend Framework | React 19.0.1 + TypeScript 7.0.2 + Vite 8.3.0 | Single-page state router (`AppView` enum in `StudyOSContext.tsx`; no URL path router) |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`) | Custom dark palette in `src/index.css` (`Plus Jakarta Sans` + `JetBrains Mono`) |
| 3D Simulation | Three.js 0.186.1 (`IntegrativePhysicsLabGame.tsx`) | 120Hz 4th-order Runge-Kutta (RK4) physics simulation |
| Backend Runtime | Express 4.21.2 (`server.ts` via `tsx`) | Serves `/api/db/*`, `/api/ai/*`, Vite middleware in dev, static `dist/` in prod |
| AI SDK & Routing | `@google/genai` ^2.4.0 (`gemini-3.8-flash`, `gemini-3.1-flash-lite`) | Server-side proxy; supports optional OpenAI/Groq/DeepSeek/Anthropic/Ollama env keys + deterministic local fallback (`integrativePhysicsEngine.ts`) |
| Client Persistence | `localStorage` + `IndexedDB` (`StudyOS_IndexedDB_v2`) | Keyed per learner profile (`study_os_profile_state_v2:<profileId>`) |
| Server Persistence | Atomic JSON files in `data/workspaces/<workspaceSyncId>.json` | Written via temp file + `fs.rename`; synced every 800ms when reachable |
| Authentication | Local multi-profile switcher (`LearnerProfileMeta`) | **No cryptographic authentication or user login**; profiles share browser storage unless isolated by OS/browser user; Sync ID acts as an unauthenticated bearer token on `/api/db/workspaces/:id` |
| Automated Tests | Custom TypeScript runner (`src/lib/gamification.test.ts`) | 20 assertions covering XP, streaks, tag filtering, shortcuts, curriculum normalization, and RK4 energy conservation |

---

## 3. Walkthrough of Audited User Flows (Baseline Pre-Upgrade)

1. **First Visit & Onboarding**:
   - Loads a clean-slate workspace (`0 XP`, `0 courses`, `streakCount: 1`).
   - Displays an inline `"Start From Scratch"` curriculum builder on `DashboardView` plus a 5-step `"Where to Start"` banner and `StudyGuideModal`.
   - **Gap**: Does not capture structured academic identity (institution, degree/programme, academic year, semester, accessibility preferences, or structured academic goals).
2. **Creating / Updating a Student Profile**:
   - `SettingsView` allows editing `studentHandle` and `academicTrack` and creating/switching/deleting isolated local `LearnerProfileMeta` workspaces.
   - **Gap**: Missing academic history, skills, projects, certifications, milestones, and portfolio evidence tracking.
3. **Creating Subjects, Courses & Topics**:
   - `CourseManagerView` supports creating/editing/deleting `Course` items with normalized tags, filtering by `Match Any` / `Match All` tags, and adding `ModuleUnit` items across Kanban, Table, and Matrix views.
   - **Gap**: Flat `Course -> ModuleUnit` model lacks Degree/Year/Semester/Unit/Learning-Objective hierarchy; deleting a course or syllabus module permanently deletes associated modules/cards rather than archiving syllabus changes safely.
4. **Adding Tasks, Notes, Resources & Learning Sessions**:
   - `KnowledgeVaultView` supports split Markdown editing (500ms debounce save), `.md/.txt/.pdf/image` note import, `.md` export, embedded YouTube playback, timestamp bookmarks, and external resource links.
   - `DashboardView` supports simple `TimeBlock` items; `CourseManagerView` supports basic `DeadlineItem` entries (`dueLabel` free-text string).
   - **Gap**: No structured `AcademicTask` / `Assignment` / `Exam` records with real ISO due dates, overdue detection, effort estimates, or missed-task recovery; no note version history or unresolved-questions list per topic.
5. **Completing a Learning Activity & Recording Assessment Results**:
   - Users can review Leitner flashcards (`Again` / `Hard` / `Good` / `Easy`), run Pomodoro sprints, or run the 3D RK4 Physics Lab.
   - **Critical Gap**: There is **no assessment or quiz attempt engine**. Users can click `"Master (+100 XP)"` on any module to declare `100% MASTERED` without answering a single question, and Leitner flashcard reviews overwrite `box` and `lastReviewedAt` in place without recording historical attempts, accuracy scores, error categories, or delayed recall checks.
6. **Viewing Progress & Historical Activity**:
   - `DashboardView` and `TerminalCLIView` show `activityLog`, XP, streak, and 7-day study minutes.
   - **Critical Gap**: `activityLog` is capped at 60 items (`slice(0, 60)`), silently discarding older history! There is no append-only `LearningEvent` ledger, no Baseline-vs-Current Growth Analytics, no filterable Growth Timeline, no Weekly/Monthly Review generator, and no transparent Next-Best-Action recommendation engine.
7. **Reloading, Profile Switching, Narrow Viewport & Data Export/Delete**:
   - Data survives browser reloads via `localStorage` + `IndexedDB` + server JSON sync.
   - Multi-profile switching isolates `Course`, `ModuleUnit`, `Flashcard`, and `UserStats` per `profileId`.
   - Mobile drawer (`Sidebar.tsx`) and responsive grids adapt to narrow viewports, though header controls are dense on small screens.
   - `.studyos.json` export/import and clean-slate reset work, but Anki export and granular record correction/deletion with metric recomputation are missing, and `localStorage` / `IndexedDB` write failures are silently swallowed.

---

## 4. Key Strategic Conclusions for Evolution

1. **Preserve What Works**: Keep the responsive Vite + React + Express architecture, multi-profile `localStorage` + `IndexedDB` + atomic workspace sync, Grokopedia multimodal curriculum synthesis, deterministic RK4 fallback, Knowledge Vault Markdown/YouTube workspace, Leitner flashcards, Pomodoro timer, Command Palette, Keyboard Shortcuts, and 3D Physics Lab intact.
2. **Eliminate False Mastery**: Separate workflow completion (`To Do` / `In Progress` / `Completed`) from **Evidence-Based Topic Mastery**, returning `"Not enough evidence yet."` until real `AssessmentAttempt` evidence exists.
3. **Close the Central Learning Loop**: Add structured Academic Profile & Hierarchy, Assignments/Exams with overdue recovery, Quizzes & Historical Assessment Attempts with error categorization, Spaced-Repetition scheduling + Anki export, an idempotent `LearningEvent` + `AuditRecord` ledger, Growth Analytics, Growth Timeline, Weekly/Monthly Reviews, and transparent Next-Best-Action recommendations on the Dashboard.
