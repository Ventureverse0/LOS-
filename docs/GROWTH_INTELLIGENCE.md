# StudyOS — Student Growth Intelligence Specification

## 1. Purpose

Implemented in `/src/lib/growthIntelligence.ts` and surfaced in `GrowthIntelligenceView.tsx` and `DashboardView.tsx`, **Student Growth Intelligence** transforms raw study logs and assessment attempts into transparent, auditable, anti-inflationary insights.

---

## 2. Empirical Topic Mastery Algorithm (`computeTopicMastery`)

### 2.1 Zero-Attempt Anti-Inflation Rule
If a topic (`ModuleUnit`) has `0` recorded `AssessmentAttempt` entries:
- `level = "insufficient_evidence"`
- `label = "Not enough evidence yet."`
- `evidenceScore = null`
- Even if `studiedMinutes === 600`, `notesMarkdown` exceeds 1,000 words, and manual workflow status is set to `"Mastered"`, StudyOS refuses to certify mastery and flags `needsRevision = true` with an explicit disclosure explaining that zero assessments have been recorded.

### 2.2 Recency-, Difficulty-, and Delayed-Recall Weighted Evidence Score
When `attemptCount >= 1`, attempts are sorted chronologically (`attempts[0]` = baseline, `attempts[n-1]` = latest):
- **Recency Weight**: $\exp(-\Delta t_{\text{days}} / 42)$, giving recent performance higher weight while retaining historical context.
- **Difficulty Multiplier**: `foundational` ($0.92\times$), `standard` ($1.00\times$), `rigorous` ($1.06\times$, capped at $100\%$).
- **Delayed Recall Boost**: Attempts flagged `isDelayedRecall: true` carry $1.15\times$ weight in the weighted average.
- **Recurring Error Penalty**: If the latest 2 attempts contain $\ge 2$ `conceptual` or `calculation` error tags, `evidenceScore` receives a $-5\%$ caution adjustment and `needsRevision` is set to `true`.

### 2.3 Five Mastery Tiers

| Tier ID | UI Label | Qualifying Criteria |
| --- | --- | --- |
| `insufficient_evidence` | **Not enough evidence yet.** | `attemptCount === 0` |
| `emerging` | **Needs Remediation** | `attemptCount >= 1` and `evidenceScore < 55%` |
| `developing` | **Developing** | `55% <= evidenceScore < 75%` |
| `proficient` | **Proficient** / **Proficient (1 Attempt)** | `evidenceScore >= 75%` (single attempt or same-day attempts without rigorous/delayed verification) |
| `verified_mastery` | **Verified Mastery** | `attemptCount >= 2`, `evidenceScore >= 85%`, `latestScore >= 80%`, AND (`delayedRecallVerified` OR attempts span $\ge 2$ distinct calendar days OR includes a `rigorous` pass $\ge 85\%$) |

---

## 3. Confidence Calibration & Error Taxonomy

- **Confidence Calibration Gap**: Each attempt records self-confidence ($c \in \{1..5\}$, mapped to expected accuracy $20\% \dots 100\%$). StudyOS compares mean expected accuracy against actual percentage accuracy:
  - Positive gap ($>+12\%$): **Overconfidence warning** — student feels confident on material where test accuracy lags.
  - Negative gap ($<-12\%$): **Underconfidence signal** — student performs better under test conditions than self-rated.
- **Error Categories**: Every incorrect question or manual assessment log can tag `conceptual`, `calculation`, `recall`, `careless`, or `time_pressure`. Analytics aggregate category shares to guide targeted remediation (e.g., Socratic concept review for `conceptual` errors vs. Leitner drills for `recall` errors).

---

## 4. Explainable Next-Best-Action Engine (`generateNextBestActions`)

Candidate actions are ranked deterministically (`critical` → `high` → `medium`) and include an explicit `whySuggested` citation of student records:
1. **Overdue Task Recovery (`critical`)**: Tasks where `dueDate < today` and status is not `completed`/`submitted`.
2. **Approaching Deadlines & Exams (`critical` / `high`)**: Exams and tasks due within 5 calendar days.
3. **Weak Topic Remediation (`high`)**: Assessed topics with `latestScore < 70%` or recurring `conceptual`/`calculation` errors.
4. **Spaced Recall Queue (`high` / `medium`)**: Flashcards with `nextReviewAt <= now`.
5. **Delayed Recall Verification (`medium`)**: Single-attempt proficient topics ($\ge 75\%$) last tested $\ge 5$ days ago without a delayed recall check.
6. **Unverified Workflow Mastery (`high` / `medium`)**: Topics marked `"Mastered"` or `"In Progress"` with `0` assessment attempts.

Learners can **Execute**, **Snooze (24h)**, or **Dismiss** any recommendation; feedback is persisted in `state.recommendationFeedback`.

---

## 5. Periodic Weekly & Monthly Reviews (`generatePeriodicReview`)

Generates structured 7-day and 30-day review reports containing study minutes, session count, topics worked on, assessments completed, baseline-to-latest score deltas, strongest topics, recurring weaknesses, missed deadlines, top next priorities, and explicit **`missingDataDisclosures`** whenever study time, tasks, or assessment attempts are absent in the selected window.
