# StudyOS — Product Vision & Pedagogical Constitution

## 1. Mission Statement

**StudyOS** is a persistent, local-first **Student Learning and Growth Operating System**. Rather than acting as a shallow to-do checklist or passive note drawer, StudyOS maintains a trustworthy, longitudinal record of a student's academic journey, conceptual mastery, recurring mistake patterns, and evidence-backed skill growth across semesters.

## 2. The Central Product Loop

Every screen, data entity, and recommendation in StudyOS maps directly to a 10-stage closed learning feedback loop:

```text
CAPTURE → ORGANIZE → LEARN → PRACTISE → ASSESS → RECORD → ANALYSE → RECOMMEND → IMPROVE → REASSESS
```

| Loop Stage | StudyOS Surface | Empirical Output |
| --- | --- | --- |
| **1. CAPTURE** | Grokopedia Curriculum Synthesizer, Knowledge Vault file/link ingest, YouTube timestamp bookmarks | Raw notes (`.md`, `.txt`, `.pdf`, scans), external resources, unresolved questions |
| **2. ORGANIZE** | Academic Profile & Course/Syllabus Manager | Connected hierarchy: `Programme → Academic Year → Semester → Course → Unit Group → Topic → Learning Objective` |
| **3. LEARN** | Knowledge Vault Split Markdown/LaTeX Workspace, Grounded AI Tutor, 3D RK4 Physics & Math Lab | Structured study notes, revision snapshots, interactive derivations, session logs |
| **4. PRACTISE** | Leitner Spaced-Repetition Flashcard Deck, Pomodoro Focus Sprints, Offline/AI Topic Quizzes | Active recall intervals (`nextReviewAt`), topic-tagged `StudySessionRecord` entries |
| **5. ASSESS** | Tasks, Assignments, Exams & Practice Workspace (`AssessmentsAndTasksView`) | Timed/untimed quizzes, practice sets, mock exams, rubric-graded assignments, delayed recall checks |
| **6. RECORD** | Durable v3 Ledger (`StudyOSState` in `IndexedDB` + `localStorage` + `./data/workspaces/*.json`) | Append-only `AssessmentAttempt`, `StudySessionRecord`, `LearningEvent`, and auditable `RecordCorrection` |
| **7. ANALYSE** | Student Growth Intelligence Engine (`growthIntelligence.ts` & `GrowthIntelligenceView`) | Empirical topic mastery, baseline-vs-latest deltas, confidence calibration gap, error taxonomy |
| **8. RECOMMEND** | Explainable Next-Best-Action Engine (Dashboard & Growth Intelligence) | Grounded action cards with explicit `"Why suggested"` rationale, Snooze (24h), and Dismiss controls |
| **9. IMPROVE** | Grounded AI Mistake Tutor, Missed-Task Recovery Plans, Topic Study Ledger | Targeted remediation on `conceptual`, `calculation`, `recall`, or `time_pressure` errors |
| **10. REASSESS** | Delayed Recall Verification (`isDelayedRecall: true` or multi-day spaced attempts) | Upgrades topic status from single-pass `Proficient` to durable `Verified Mastery` |

## 3. Core Trust & Integrity Principles

1. **Zero Mastery Inflation**: Passive behaviors—running Pomodoro timers, writing long notes, watching embedded lectures, or manually toggling workflow status to `"Mastered"`—never confer empirical mastery. When `attemptCount === 0`, StudyOS strictly reports `"Not enough evidence yet."`
2. **Preserve Historical Attempts**: Re-taking a topic quiz never overwrites the baseline score. Every `AssessmentAttempt` is preserved chronologically so both struggle and improvement remain visible.
3. **Separate Self-Reported Confidence from Assessed Competence**: Student confidence (`1–5`) is tracked alongside real scores (`0–100%`) to compute calibration gaps (`overconfidence` vs. `underconfidence`) and is never blended into skill verification badges.
4. **Honest Missing-Data Disclosures**: Weekly/monthly reviews, dashboard briefs, and AI tutor responses explicitly state when records are missing instead of fabricating encouragement or synthetic trends.
5. **Non-Destructive Academic Continuity**: Changing a syllabus or finishing a semester archives courses and topics (`archived: true`) without erasing historical study sessions, notes, or assessment evidence.
