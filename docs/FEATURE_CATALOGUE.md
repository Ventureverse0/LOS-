# StudyOS — Complete Feature Catalogue (v3.0)

## Navigation & Workspaces Overview

| Workspace | View ID | Default Shortcut | Primary Capabilities |
| --- | --- | --- | --- |
| **Daily Command Dashboard** | `dashboard` | `Mod+1` | 7-question Daily Planning & Evidence Brief, Explainable Next-Best-Action cards (Execute / Snooze 24h / Dismiss), Streak/XP/Focus telemetry, Active Courses (Workflow % vs. Verified Mastery count), Time-Block Planner, Live Activity Feed |
| **Course & Syllabus Manager** | `courses` | `Mod+2` | Connected Course → Unit Group → Topic manager, Academic Year & Semester metadata, Tag filtering (`Match Any` / `Match All`), Kanban / Table / Deadline Matrix views, Workflow Status vs. Empirical Mastery badges, Non-destructive Archive & Restore |
| **Knowledge Vault** | `vault` | `Mod+3` | Split/Editor/Preview Markdown + LaTeX notes, Note Revision History snapshots & restore, Multimodal file import (`.md`, `.txt`, `.pdf`, images, code), YouTube lecture embed + timestamp bookmarks, Resource Locker with descriptions & tags, Topic Study Ledger (Learning Objectives, Unresolved Questions, Reflection), Cross-Vault full-text search |
| **Tasks, Exams & Practice** | `assessments` | `Alt+A` | Dated `AcademicTask` & Exam Timetable manager, Overdue Missed-Task Recovery workflow, Interactive Topic Quiz Runner (AI + offline deterministic fallback), Manual Score/Rubric Attempt Logger with error categories & confidence calibration, Append-only Attempt Ledger with audited corrections, Record-Grounded AI Tutor (Concept, Step-by-Step, Socratic, Mistake Analysis) |
| **Growth Intelligence** | `growth` | `Alt+G` | Time-window analytics (`7d`, `30d`, `90d`, `All`), Baseline vs. Current score trend, Confidence Calibration Gap detector, Error Category Breakdown, Topic Mastery Matrix (`Not enough evidence yet.` through `Verified Mastery`), Chronological Growth Timeline, Weekly & Monthly Review Generator with missing-data disclosures, Correction Audit Log |
| **Profile & Evidence Portfolio** | `profile` | `Alt+P` | Student Identity & Programme metadata, Multi-semester Academic History, Learning & Accessibility Preferences, Skills Matrix (`Self-Reported Only` vs. `Practice Evidence` vs. `Evidence-Backed (Internal)`), Projects & Practical Evidence, Certifications & Milestones, One-click `.md` Evidence Portfolio export |
| **Grokopedia & AI Curriculum** | `grokopedia` | `Mod+4` | Upload raw notes or specify any subject to synthesize structured multi-unit curricula, starter Vault notes, flashcards, deadlines, and study blocks via Gemini (`gemini-3.8-flash`) or offline first-principles synthesis |
| **Pomodoro Focus Sprint** | `pomodoro` | `Mod+6` / `Mod+Shift+F` | 25/50/90m focus & break timer tagged to Course + Topic, durable reload recovery banner for interrupted sprints, manual offline minute logger, idempotent `StudySessionRecord` history ledger |
| **Spaced-Repetition Flashcards** | `flashcards` | `Mod+7` | 5-box Leitner active-recall deck, `Due Now` vs. `All Cards` queue filter, `nextReviewAt` scheduling (`Again` 10m, `Hard`/`Good`/`Easy` 1–28d), AI deck generation from notes, Anki `.tsv` deck export |
| **3D Integrative Physics & Math Lab** | `simulation` | `Mod+9` | Full-viewport Three.js 120Hz 4th-order Runge-Kutta (RK4) physics & dynamical systems lab dynamically calibrated to any course topic; saves lab derivations directly to Vault |
| **Terminal CLI** | `cli` | `Mod+5` | Interactive keyboard terminal (`status`, `courses`, `review`, `test`, `export`, `help`) including in-browser execution of the 31-assertion automated test suite |
| **Settings, Storage & Privacy** | `settings` | `Mod+8` | Multi-Learner local profile switcher, Server Workspace Sync (`ws_*`) push/pull/delete, Portable `.studyos.json` backup export & restore, Anki `.tsv` & Portfolio `.md` exports, Transparent Privacy & Storage Boundaries disclosure |

## Global Productivity Controls
- **Command Palette (`Mod+K`)**: Instant fuzzy jump to any workspace, syllabus module, export tool, or focus action.
- **Global Shortcut Manager (`?`)**: View and customize keyboard bindings with conflict detection and input-field safety guards.
- **Interactive Onboarding & Walkthrough Guide**: Accessible anytime from the Header Bar (`Guide`) or Dashboard to orient new learners.
