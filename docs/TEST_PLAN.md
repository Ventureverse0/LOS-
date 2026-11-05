# StudyOS — Automated & Manual Test Plan (Phase 8 Verification)

## 1. Automated Unit & Integration Suite (`src/lib/gamification.test.ts`)

Run via CLI:
```bash
npm test
```
Or run directly inside the application via **Terminal CLI (`Mod+5` → `test`)** or **Settings (`Mod+8` → `Run Unit Tests`)**.

### Verified Assertion Coverage (34 / 34 Passing)

| # | Test Domain | Verified Invariant |
| --- | --- | --- |
| 1–7 | Gamification & XP Math | `calculateLevel`, `getLevelProgress`, XP constants (`+100`/`+50`/`+25`), same-day/next-day/missed-day streak rollover |
| 8–10 | Clean Workspace & Parsers | `createBlankStudyOSState` zero-XP clean init, Markdown `>200` word gate, YouTube watch/short embed URL parser |
| 11–16 | Curriculum, Tags & Shortcuts | `normalizeCurriculumPayload`, course tag normalization & `any`/`all` filtering, `Mod+1..9` / `Alt+A/G/P` shortcuts & input-field safety |
| 17–19 | 3D RK4 Physics & Compiler | 120Hz RK4 energy conservation (`|ΔE/E0| < 1e-4`), quadratic drag dissipation, offline 5-unit curriculum + 5-stage lab blueprint synthesis |
| 20 | Legacy Schema Migration & Archiving | v1/v2 payload (`ws_shoeyidc5qn2oi`) upgrades to `schemaVersion: 3` preserving all courses/notes/flashcards; `archived` modules excluded from active counts without deleting notes |
| 21 | **Anti-Inflation Mastery Guard** | Topic marked `"Mastered"` with `600m` studied and `>400` words of notes but `0` assessment attempts strictly returns `insufficient_evidence` (`"Not enough evidence yet."`) |
| 22 | **Append-Only Attempts & Verified Mastery** | Attempt 1 (`50%`) → `emerging`; Attempt 2 (`90%`) + Attempt 3 delayed recall (`95%`) → `verified_mastery` with preserved `baselineScore=50%`, `latestScore=95%`, `deltaScore=+45%` |
| 23 | **Audited Record Correction** | Correcting Attempt 3 from `19/20` (`95%`) to `11/20` (`55%`) recalculates mastery down to `developing` and sets `needsRevision=true` |
| 24 | **Skill Evidence Separation** | Skill with `5/5` self-confidence and `0` attempts returns `"Self-Reported Only"` (`assessedScore=null`); upgrades to `"Evidence-Backed (Internal)"` when $\ge 2$ linked attempts average $\ge 75\%$ |
| 25 | **Idempotent Session & Event Ledger** | Duplicate `idempotencyKey` submissions to `appendStudySessionIdempotent` and `appendLearningEventIdempotent` are rejected cleanly |
| 26 | **Spaced Repetition & Offline Quiz** | `computeFlashcardNextReviewIso` schedules `10m` on `"again"` and `12d` on Box 4 `"easy"`; `buildDeterministicTopicQuiz` generates 3 notes-derived questions offline |
| 27 | **Time-Window Analytics & Reviews** | `computeGrowthAnalytics` separates `7d` (`25m`, 2 attempts) vs `30d` (`75m`, 3 attempts); `generatePeriodicReview` emits honest `missingDataDisclosures` when data is absent |
| 28 | **Explainable Recommendations & Snooze** | `generateNextBestActions` prioritizes overdue task recovery with due-date rationale and suppresses snoozed items until `snoozeUntil` |
| 29 | **Input Validation Guards** | `validateAcademicTaskInput` and `validateAssessmentAttemptInput` reject empty titles, invalid dates, `score > maxScore`, and out-of-bounds confidence |
| 30–31 | **Portable Exports & Round-Trip** | `.studyos.json` v3 backup round-trips all attempts & profile fields; Anki `.tsv` and Portfolio `.md` include accurate headers and evidence badges |
| 32 | **RFC 5545 Calendar `.ICS` Export** | `buildCalendarIcsContent` emits RFC 5545 `VCALENDAR`/`VEVENT` blocks with CRLF endings for open tasks, exams, and active `TimeBlock` sessions while omitting completed blocks |
| 33 | **Vault Highlights & Transcripts** | `VaultHighlight` (`anchorLabel`, `excerpt`, `linkedFlashcardId`, `linkedAssessmentId`) and `transcriptNotes` round-trip intact through `sanitizeState` and `.studyos.json` backups |
| 34 | **Growth Timeline Milestones** | `buildGrowthTimeline` filters and surfaces `skill_updated`, `project_completed`, and `objective_completed` milestones alongside chronological assessment score deltas |

---

## 2. Static Type & Build Verification

```bash
npm run lint    # tsc --noEmit (0 errors)
npm run build   # vite build production bundle (clean exit)
```

---

## 3. Manual End-to-End Acceptance Checklist

1. **First Visit & 7-Step Guide**: Launch clean profile → Dashboard displays Onboarding banner, `"Create your first course"` recommendation disclosing `0 active courses exist`, and the 7-step `StudyGuideModal` walkthrough.
2. **Capture & Organize**: Synthesize a course in Grokopedia or create one in Course Manager with Academic Year, Semester, Unit Group, and Tags → Archive and Restore a topic without losing notes.
3. **Learn, Highlights, Transcripts & Knowledge Map**: Edit Markdown notes in Knowledge Vault, add a page-anchored (`p. 14`) or timestamp-anchored (`12:40`) Highlight, promote it in 1 click to a Flashcard and Quiz Question, add Lecture Transcript notes, and inspect the interactive **Knowledge Map** toggle.
4. **Practise, Focus & Deadline Auto-Adjustment**: Start a Pomodoro sprint tagged to a specific Topic → reload browser tab → verify yellow Interrupted Sprint Recovery Banner; reschedule an open task's due date in `Tasks & Exams` and verify Today's Plan `TimeBlock` updates automatically.
5. **Assess & Reassess**: Run a Topic Quiz in `Tasks & Exams`, then log a Delayed Recall attempt → open `Growth Intelligence` and verify baseline-to-latest delta, error breakdown, timeline entry, and Weekly Review report.
6. **Export & Portability**: Export `.studyos.json`, Calendar `.ics`, Anki `.tsv`, and Evidence Portfolio `.md` from Settings (or `Mod+K` / Terminal CLI `export-ics`, `export-anki`, `export-portfolio`) and verify restored state integrity.
