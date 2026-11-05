import type {
  AcademicTask,
  Assessment,
  AssessmentAttempt,
  ErrorCategory,
  Flashcard,
  LearningEvent,
  ModuleUnit,
  PortfolioProject,
  SkillRecord,
  StudyOSState,
  StudySessionRecord,
} from "../types/studyOS";
import { getTodayDateString } from "./gamification";

export type MasteryLevelId =
  | "insufficient_evidence"
  | "emerging"
  | "developing"
  | "proficient"
  | "verified_mastery";

export interface TopicMasterySummary {
  moduleId: string;
  courseId: string;
  moduleTitle: string;
  workflowStatus: ModuleUnit["status"];
  level: MasteryLevelId;
  /** Human-readable status; strictly "Not enough evidence yet." when attempts === 0 */
  label: string;
  /** Weighted assessment score (0..100), or null when no assessment attempts exist */
  evidenceScore: number | null;
  /** Mean self-reported confidence (1..5), kept strictly separate from evidenceScore */
  selfConfidenceAvg: number | null;
  attemptCount: number;
  baselineScore: number | null;
  latestScore: number | null;
  deltaScore: number | null;
  lastAttemptedAt: string | null;
  delayedRecallVerified: boolean;
  needsRevision: boolean;
  topErrorCategories: ErrorCategory[];
  explanation: string;
}

export interface SkillEvidenceSummary {
  skillId: string;
  skillName: string;
  category: string;
  selfConfidence: number; // 1..5
  assessedScore: number | null; // 0..100 from linked real attempts
  attemptCount: number;
  linkedProjectCount: number;
  verificationBadge:
    | "Self-Reported Only"
    | "Practice Evidence"
    | "Evidence-Backed (Internal)";
  explanation: string;
}

export type AnalyticsTimeRange = "7d" | "30d" | "90d" | "all";

export interface GrowthAnalyticsSummary {
  range: AnalyticsTimeRange;
  windowStartIso: string | null;
  windowEndIso: string;
  studyMinutesInRange: number;
  sessionsInRange: number;
  assessmentsInRange: number;
  baselineAverageScore: number | null;
  currentAverageScore: number | null;
  overallScoreDelta: number | null;
  /** Positive means confidence exceeds actual accuracy; negative means underconfidence */
  confidenceCalibrationGap: number | null;
  verifiedMasteryCount: number;
  insufficientEvidenceCount: number;
  dueFlashcardsCount: number;
  overdueTasksCount: number;
  upcomingDeadlinesCount: number;
  errorBreakdown: Array<{ category: ErrorCategory; count: number; sharePct: number }>;
  improvedTopics: TopicMasterySummary[];
  strugglingTopics: TopicMasterySummary[];
  topicsNeedingRevision: TopicMasterySummary[];
}

export interface GrowthTimelineEntry {
  id: string;
  timestamp: string;
  kind: "assessment" | "session" | "task" | "milestone";
  courseId?: string;
  courseCode?: string;
  moduleId?: string;
  topicTitle: string;
  headline: string;
  resultLabel: string;
  deltaFromPrevious: number | null;
  evidenceSummary: string;
  suggestedNextStep: string;
}

export interface PeriodicReviewReport {
  period: "weekly" | "monthly";
  periodLabel: string;
  windowStartIso: string;
  windowEndIso: string;
  totalStudyMinutes: number;
  sessionCount: number;
  topicsWorkedOn: string[];
  assessmentsCompleted: number;
  averageAssessmentScore: number | null;
  scoreChanges: Array<{ topic: string; baseline: number; latest: number; delta: number }>;
  strongestTopics: Array<{ topic: string; score: number }>;
  recurringWeaknesses: Array<{ category: ErrorCategory; count: number }>;
  missedDeadlines: string[];
  topNextPriorities: string[];
  missingDataDisclosures: string[];
}

export interface NextBestActionItem {
  id: string;
  priority: "critical" | "high" | "medium";
  category:
    | "overdue_recovery"
    | "upcoming_deadline"
    | "spaced_recall"
    | "weak_topic_remediation"
    | "delayed_recall"
    | "unverified_mastery"
    | "onboarding";
  title: string;
  whySuggested: string;
  actionLabel: string;
  courseId?: string;
  moduleId?: string;
  taskId?: string;
  targetView:
    | "assessments"
    | "vault"
    | "flashcards"
    | "grokopedia"
    | "growth"
    | "courses";
}

const DIFFICULTY_WEIGHTS: Record<AssessmentAttempt["difficulty"], number> = {
  foundational: 0.92,
  standard: 1.0,
  rigorous: 1.06,
};

/**
 * Leitner spaced-repetition interval calculator (days per box 1..5).
 */
export function computeFlashcardNextReviewIso(
  nextBox: number,
  rating: "again" | "hard" | "good" | "easy",
  now: Date = new Date()
): string {
  if (rating === "again") {
    // Review again within 10 minutes
    return new Date(now.getTime() + 10 * 60 * 1000).toISOString();
  }
  const clampedBox = Math.max(1, Math.min(5, Math.round(nextBox)));
  const intervalDaysByBox: Record<number, number> = {
    1: 1,
    2: 2,
    3: 5,
    4: 12,
    5: 28,
  };
  const baseDays = intervalDaysByBox[clampedBox] ?? 1;
  const adjustedDays = rating === "hard" ? Math.max(1, Math.floor(baseDays * 0.6)) : baseDays;
  return new Date(now.getTime() + adjustedDays * 24 * 60 * 60 * 1000).toISOString();
}

export function getDueFlashcards(
  flashcards: Flashcard[],
  now: Date = new Date()
): Flashcard[] {
  const nowMs = now.getTime();
  return flashcards.filter((card) => {
    if (!card.nextReviewAt) return true;
    const dueMs = Date.parse(card.nextReviewAt);
    if (Number.isNaN(dueMs)) return true;
    return dueMs <= nowMs;
  });
}

/**
 * Core Mastery Rule (Section 3.2):
 * Topic mastery is computed strictly from verified AssessmentAttempt evidence.
 * Passive study time, note word count, video views, and manual workflow status
 * NEVER produce mastery when assessment evidence is missing.
 */
export function computeTopicMastery(
  moduleId: string,
  state: StudyOSState,
  now: Date = new Date()
): TopicMasterySummary {
  const mod = state.modules.find((m) => m.id === moduleId);
  const moduleTitle = mod?.title || "Unknown Topic";
  const courseId = mod?.courseId || "";
  const workflowStatus: ModuleUnit["status"] = mod?.status || "To Do";

  const attempts = (state.assessmentAttempts || [])
    .filter((a) => a.moduleId === moduleId && Number.isFinite(a.percentage))
    .slice()
    .sort((a, b) => Date.parse(a.attemptedAt) - Date.parse(b.attemptedAt));

  if (attempts.length === 0) {
    const workflowDisclosure =
      workflowStatus === "Mastered"
        ? " Marked 'Mastered' in syllabus workflow, but zero assessments have been recorded."
        : "";
    return {
      moduleId,
      courseId,
      moduleTitle,
      workflowStatus,
      level: "insufficient_evidence",
      label: "Not enough evidence yet.",
      evidenceScore: null,
      selfConfidenceAvg: null,
      attemptCount: 0,
      baselineScore: null,
      latestScore: null,
      deltaScore: null,
      lastAttemptedAt: null,
      delayedRecallVerified: false,
      needsRevision: workflowStatus === "Mastered",
      topErrorCategories: [],
      explanation: `Not enough evidence yet.${workflowDisclosure} Complete at least one quiz, practice set, or graded assessment to measure mastery.`,
    };
  }

  const nowMs = now.getTime();
  let weightedSum = 0;
  let weightTotal = 0;
  let confidenceSum = 0;

  const errorCounts = new Map<ErrorCategory, number>();

  for (const att of attempts) {
    const attemptMs = Date.parse(att.attemptedAt);
    const daysAgo = Number.isNaN(attemptMs)
      ? 0
      : Math.max(0, (nowMs - attemptMs) / (1000 * 60 * 60 * 24));
    // Recency half-life ~30 days so recent performance outweighs old baseline
    const recencyWeight = Math.exp(-daysAgo / 42);
    const diffMult = DIFFICULTY_WEIGHTS[att.difficulty] || 1.0;
    const delayedBoost = att.isDelayedRecall ? 1.15 : 1.0;
    const weight = recencyWeight * delayedBoost;

    const effectivePct = Math.min(100, Math.max(0, att.percentage * diffMult));
    weightedSum += effectivePct * weight;
    weightTotal += weight;
    confidenceSum += Math.min(5, Math.max(1, att.selfConfidence || 3));

    for (const errCat of att.errorCategories || []) {
      errorCounts.set(errCat, (errorCounts.get(errCat) || 0) + 1);
    }
  }

  const rawWeightedScore = weightTotal > 0 ? weightedSum / weightTotal : attempts[0].percentage;

  // Check recurring conceptual/calculation errors in the most recent 2 attempts
  const recentTwo = attempts.slice(-2);
  const recentConceptualOrCalcErrors = recentTwo.reduce(
    (acc, a) =>
      acc +
      (a.errorCategories || []).filter(
        (c) => c === "conceptual" || c === "calculation"
      ).length,
    0
  );
  const recurringPenalty = recentConceptualOrCalcErrors >= 2 ? 5 : 0;

  const evidenceScore = Math.round(
    Math.min(100, Math.max(0, rawWeightedScore - recurringPenalty)) * 10
  ) / 10;

  const selfConfidenceAvg =
    Math.round((confidenceSum / attempts.length) * 10) / 10;

  const baselineScore = Math.round(attempts[0].percentage * 10) / 10;
  const latestAttempt = attempts[attempts.length - 1];
  const latestScore = Math.round(latestAttempt.percentage * 10) / 10;
  const deltaScore =
    attempts.length >= 2
      ? Math.round((latestScore - baselineScore) * 10) / 10
      : 0;

  const distinctDays = new Set(
    attempts.map((a) => a.attemptedAt.slice(0, 10))
  ).size;
  const delayedRecallVerified = attempts.some(
    (a) => Boolean(a.isDelayedRecall) && a.percentage >= 80
  );
  const hasRigorousPass = attempts.some(
    (a) => a.difficulty === "rigorous" && a.percentage >= 85
  );

  const lastAttemptMs = Date.parse(latestAttempt.attemptedAt);
  const daysSinceLast = Number.isNaN(lastAttemptMs)
    ? 0
    : Math.max(0, (nowMs - lastAttemptMs) / (1000 * 60 * 60 * 24));

  let level: MasteryLevelId;
  let label: string;

  if (
    attempts.length >= 2 &&
    evidenceScore >= 85 &&
    latestScore >= 80 &&
    (delayedRecallVerified || distinctDays >= 2 || hasRigorousPass)
  ) {
    level = "verified_mastery";
    label = "Verified Mastery";
  } else if (evidenceScore >= 75) {
    level = "proficient";
    label =
      attempts.length === 1
        ? "Proficient (1 Attempt)"
        : "Proficient";
  } else if (evidenceScore >= 55) {
    level = "developing";
    label = "Developing";
  } else {
    level = "emerging";
    label = "Needs Remediation";
  }

  const topErrorCategories = Array.from(errorCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat]) => cat);

  const needsRevision =
    latestScore < 75 ||
    daysSinceLast >= 14 ||
    (attempts.length === 1 && daysSinceLast >= 5) ||
    recurringPenalty > 0;

  const deltaPhrase =
    attempts.length >= 2
      ? ` (${deltaScore >= 0 ? "+" : ""}${deltaScore}% vs. ${baselineScore}% baseline)`
      : " (single baseline attempt — complete a delayed recall check to verify retention)";

  const errPhrase =
    topErrorCategories.length > 0
      ? ` Logged error patterns: ${topErrorCategories.join(", ")}.`
      : "";

  return {
    moduleId,
    courseId,
    moduleTitle,
    workflowStatus,
    level,
    label,
    evidenceScore,
    selfConfidenceAvg,
    attemptCount: attempts.length,
    baselineScore,
    latestScore,
    deltaScore: attempts.length >= 2 ? deltaScore : null,
    lastAttemptedAt: latestAttempt.attemptedAt,
    delayedRecallVerified,
    needsRevision,
    topErrorCategories,
    explanation: `Based on ${attempts.length} recorded assessment${
      attempts.length === 1 ? "" : "s"
    }: latest ${latestScore}%, weighted evidence ${evidenceScore}%${deltaPhrase}.${errPhrase}`,
  };
}

export function computeAllTopicMasteries(
  state: StudyOSState,
  now: Date = new Date()
): TopicMasterySummary[] {
  return state.modules
    .filter((m) => !m.archived)
    .map((m) => computeTopicMastery(m.id, state, now));
}

/**
 * Evaluates skill development strictly separating self-confidence from assessed evidence (Module 2.10).
 */
export function computeSkillEvidence(
  skill: SkillRecord,
  state: StudyOSState,
  _now: Date = new Date()
): SkillEvidenceSummary {
  const courseSet = new Set(skill.linkedCourseIds || []);
  const modSet = new Set(skill.linkedModuleIds || []);

  const linkedAttempts = (state.assessmentAttempts || []).filter(
    (a) =>
      (a.moduleId && modSet.has(a.moduleId)) ||
      (a.courseId && courseSet.has(a.courseId))
  );

  const linkedProjects: PortfolioProject[] = (
    state.academicProfile?.projects || []
  ).filter((p) => (p.linkedSkillIds || []).includes(skill.id));

  const assessedScore =
    linkedAttempts.length > 0
      ? Math.round(
          (linkedAttempts.reduce((acc, a) => acc + a.percentage, 0) /
            linkedAttempts.length) *
            10
        ) / 10
      : null;

  let verificationBadge: SkillEvidenceSummary["verificationBadge"] =
    "Self-Reported Only";
  if (
    (linkedAttempts.length >= 2 && (assessedScore ?? 0) >= 75) ||
    (linkedAttempts.length >= 1 &&
      (assessedScore ?? 0) >= 75 &&
      linkedProjects.length >= 1)
  ) {
    verificationBadge = "Evidence-Backed (Internal)";
  } else if (linkedAttempts.length >= 1 || linkedProjects.length >= 1) {
    verificationBadge = "Practice Evidence";
  }

  const explanation =
    verificationBadge === "Self-Reported Only"
      ? `Self-rated ${skill.selfConfidence}/5 confidence; no linked assessments or portfolio projects recorded yet.`
      : `Backed by ${linkedAttempts.length} assessment attempt${
          linkedAttempts.length === 1 ? "" : "s"
        }${assessedScore !== null ? ` (avg ${assessedScore}%)` : ""} and ${
          linkedProjects.length
        } portfolio project${linkedProjects.length === 1 ? "" : "s"}.`;

  return {
    skillId: skill.id,
    skillName: skill.name,
    category: skill.category,
    selfConfidence: skill.selfConfidence,
    assessedScore,
    attemptCount: linkedAttempts.length,
    linkedProjectCount: linkedProjects.length,
    verificationBadge,
    explanation,
  };
}

function getWindowStartMs(range: AnalyticsTimeRange, now: Date): number | null {
  if (range === "all") return null;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return now.getTime() - days * 24 * 60 * 60 * 1000;
}

/**
 * Computes time-bounded StudyOS Growth Analytics without fabricating or double-counting data.
 */
export function computeGrowthAnalytics(
  state: StudyOSState,
  range: AnalyticsTimeRange = "30d",
  now: Date = new Date()
): GrowthAnalyticsSummary {
  const windowStartMs = getWindowStartMs(range, now);
  const windowStartIso =
    windowStartMs !== null ? new Date(windowStartMs).toISOString() : null;
  const windowEndIso = now.toISOString();
  const todayYmd = getTodayDateString(now);

  const sessions = (state.studySessions || []).filter((s) => {
    if (windowStartMs === null) return true;
    const endedMs = Date.parse(s.endedAt || s.startedAt);
    return !Number.isNaN(endedMs) && endedMs >= windowStartMs && endedMs <= now.getTime() + 60_000;
  });

  // Combine per-day session durations with `weeklyMinutes` safely (max per date prevents double-counting)
  const sessionMinsByDay = new Map<string, number>();
  for (const s of sessions) {
    const ymd = (s.endedAt || s.startedAt).slice(0, 10);
    sessionMinsByDay.set(ymd, (sessionMinsByDay.get(ymd) || 0) + s.durationMinutes);
  }

  const weeklyMap = state.stats?.weeklyMinutes || {};
  const allCandidateDates = new Set<string>([
    ...Object.keys(weeklyMap),
    ...Array.from(sessionMinsByDay.keys()),
  ]);

  let studyMinutesInRange = 0;
  for (const ymd of allCandidateDates) {
    const dayUtc = Date.parse(`${ymd}T12:00:00.000Z`);
    if (windowStartMs !== null && !Number.isNaN(dayUtc)) {
      const startYmd = new Date(windowStartMs).toISOString().slice(0, 10);
      if (ymd < startYmd || ymd > todayYmd) continue;
    }
    const fromSessions = sessionMinsByDay.get(ymd) || 0;
    const fromWeekly = typeof weeklyMap[ymd] === "number" ? weeklyMap[ymd] : 0;
    studyMinutesInRange += Math.max(fromSessions, fromWeekly);
  }

  if (range === "all") {
    studyMinutesInRange = Math.max(
      studyMinutesInRange,
      state.stats?.totalMinutesStudied || 0
    );
  }

  const attemptsInRange = (state.assessmentAttempts || [])
    .filter((a) => {
      if (windowStartMs === null) return true;
      const ms = Date.parse(a.attemptedAt);
      return !Number.isNaN(ms) && ms >= windowStartMs;
    })
    .slice()
    .sort((a, b) => Date.parse(a.attemptedAt) - Date.parse(b.attemptedAt));

  let baselineAverageScore: number | null = null;
  let currentAverageScore: number | null = null;
  let overallScoreDelta: number | null = null;
  let confidenceCalibrationGap: number | null = null;

  if (attemptsInRange.length > 0) {
    const half = Math.max(1, Math.floor(attemptsInRange.length / 2));
    const firstSlice = attemptsInRange.slice(0, half);
    const recentSlice = attemptsInRange.slice(-half);

    baselineAverageScore =
      Math.round(
        (firstSlice.reduce((s, a) => s + a.percentage, 0) / firstSlice.length) * 10
      ) / 10;
    currentAverageScore =
      Math.round(
        (recentSlice.reduce((s, a) => s + a.percentage, 0) / recentSlice.length) *
          10
      ) / 10;

    if (attemptsInRange.length >= 2) {
      overallScoreDelta =
        Math.round((currentAverageScore - baselineAverageScore) * 10) / 10;
    }

    const totalGap = attemptsInRange.reduce((acc, a) => {
      const expectedFromConf = ((a.selfConfidence || 3) / 5) * 100;
      return acc + (expectedFromConf - a.percentage);
    }, 0);
    confidenceCalibrationGap =
      Math.round((totalGap / attemptsInRange.length) * 10) / 10;
  }

  const errMap = new Map<ErrorCategory, number>();
  let totalErrors = 0;
  for (const att of attemptsInRange) {
    for (const cat of att.errorCategories || []) {
      errMap.set(cat, (errMap.get(cat) || 0) + 1);
      totalErrors += 1;
    }
  }

  const errorBreakdown = Array.from(errMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => ({
      category,
      count,
      sharePct: totalErrors > 0 ? Math.round((count / totalErrors) * 100) : 0,
    }));

  const allMasteries = computeAllTopicMasteries(state, now);
  const verifiedMasteryCount = allMasteries.filter(
    (m) => m.level === "verified_mastery"
  ).length;
  const insufficientEvidenceCount = allMasteries.filter(
    (m) => m.level === "insufficient_evidence"
  ).length;

  const improvedTopics = allMasteries
    .filter((m) => m.deltaScore !== null && m.deltaScore > 0)
    .sort((a, b) => (b.deltaScore || 0) - (a.deltaScore || 0));

  const strugglingTopics = allMasteries
    .filter(
      (m) =>
        m.attemptCount > 0 &&
        ((m.latestScore !== null && m.latestScore < 70) ||
          m.level === "emerging" ||
          m.topErrorCategories.includes("conceptual"))
    )
    .sort((a, b) => (a.latestScore ?? 100) - (b.latestScore ?? 100));

  const topicsNeedingRevision = allMasteries.filter((m) => m.needsRevision);

  const dueFlashcardsCount = getDueFlashcards(state.flashcards || [], now).length;

  const activeTasks = state.tasks || [];
  const overdueTasksCount = activeTasks.filter(
    (t) =>
      t.status !== "completed" &&
      t.status !== "submitted" &&
      Boolean(t.dueDate) &&
      t.dueDate.slice(0, 10) < todayYmd
  ).length;

  const sevenDaysAheadYmd = getTodayDateString(
    new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  );
  const upcomingDeadlinesCount =
    activeTasks.filter(
      (t) =>
        t.status !== "completed" &&
        t.status !== "submitted" &&
        Boolean(t.dueDate) &&
        t.dueDate.slice(0, 10) >= todayYmd &&
        t.dueDate.slice(0, 10) <= sevenDaysAheadYmd
    ).length + (state.deadlines || []).filter((d) => !d.completed).length;

  return {
    range,
    windowStartIso,
    windowEndIso,
    studyMinutesInRange,
    sessionsInRange: sessions.length,
    assessmentsInRange: attemptsInRange.length,
    baselineAverageScore,
    currentAverageScore,
    overallScoreDelta,
    confidenceCalibrationGap,
    verifiedMasteryCount,
    insufficientEvidenceCount,
    dueFlashcardsCount,
    overdueTasksCount,
    upcomingDeadlinesCount,
    errorBreakdown,
    improvedTopics,
    strugglingTopics,
    topicsNeedingRevision,
  };
}

/**
 * Builds a filterable chronological Student Growth Timeline (Section 3.3).
 */
export function buildGrowthTimeline(
  state: StudyOSState,
  filters?: {
    courseId?: string;
    moduleId?: string;
    kind?: "all" | "assessment" | "session" | "task" | "milestone";
    range?: AnalyticsTimeRange;
  },
  now: Date = new Date()
): GrowthTimelineEntry[] {
  const range = filters?.range || "all";
  const windowStartMs = getWindowStartMs(range, now);
  const entries: GrowthTimelineEntry[] = [];

  const courseById = new Map(state.courses.map((c) => [c.id, c]));
  const modById = new Map(state.modules.map((m) => [m.id, m]));

  // 1. Assessment Attempts (sorted ascending first to compute deltas accurately)
  const sortedAttempts = (state.assessmentAttempts || [])
    .slice()
    .sort((a, b) => Date.parse(a.attemptedAt) - Date.parse(b.attemptedAt));

  const lastScoreByTopicKey = new Map<string, number>();

  for (const att of sortedAttempts) {
    const topicKey = att.moduleId || `course:${att.courseId}`;
    const prevPct = lastScoreByTopicKey.get(topicKey);
    const delta =
      prevPct !== undefined
        ? Math.round((att.percentage - prevPct) * 10) / 10
        : null;
    lastScoreByTopicKey.set(topicKey, att.percentage);

    const course = courseById.get(att.courseId);
    const mod = att.moduleId ? modById.get(att.moduleId) : undefined;

    const nextStep =
      att.percentage < 70
        ? `Review ${
            att.errorCategories[0] || "missed"
          } concepts in Vault and re-test within 48h.`
        : !att.isDelayedRecall
        ? "Schedule a delayed recall quiz in 7 days to verify durable mastery."
        : "Durable recall confirmed — advance to dependent topics.";

    entries.push({
      id: `tl-att-${att.id}`,
      timestamp: att.attemptedAt,
      kind: "assessment",
      courseId: att.courseId,
      courseCode: course?.code,
      moduleId: att.moduleId,
      topicTitle: mod?.title || att.title,
      headline: `${att.title} (${att.kind.replace(/_/g, " ")})`,
      resultLabel: `${att.percentage}% (${att.score}/${att.maxScore})`,
      deltaFromPrevious: delta,
      evidenceSummary: `Difficulty: ${att.difficulty} · Confidence: ${
        att.selfConfidence
      }/5${
        att.errorCategories.length > 0
          ? ` · Errors: ${att.errorCategories.join(", ")}`
          : ""
      }`,
      suggestedNextStep: nextStep,
    });
  }

  // 2. Study Sessions
  for (const sess of state.studySessions || []) {
    const course = sess.courseId ? courseById.get(sess.courseId) : undefined;
    const mod = sess.moduleId ? modById.get(sess.moduleId) : undefined;
    entries.push({
      id: `tl-sess-${sess.id}`,
      timestamp: sess.endedAt || sess.startedAt,
      kind: "session",
      courseId: sess.courseId,
      courseCode: course?.code,
      moduleId: sess.moduleId,
      topicTitle: mod?.title || course?.title || "General Study",
      headline: sess.label,
      resultLabel: `${sess.durationMinutes} min`,
      deltaFromPrevious: null,
      evidenceSummary: `Session type: ${sess.kind} · Duration: ${sess.durationMinutes}m`,
      suggestedNextStep: mod
        ? "Convert session study into active recall or a short topic quiz."
        : "Link next study session to a specific syllabus topic.",
    });
  }

  // 3. Academic Tasks (completed or missed)
  for (const task of state.tasks || []) {
    if (task.status !== "completed" && task.status !== "submitted" && task.status !== "missed") {
      continue;
    }
    const course = task.courseId ? courseById.get(task.courseId) : undefined;
    const mod = task.moduleId ? modById.get(task.moduleId) : undefined;
    const hasGrade =
      typeof task.scoreEarned === "number" &&
      typeof task.scoreMax === "number" &&
      task.scoreMax > 0;
    const gradeLabel = hasGrade
      ? `${Math.round((task.scoreEarned! / task.scoreMax!) * 100)}% (${task.scoreEarned}/${task.scoreMax})`
      : task.status.toUpperCase();

    entries.push({
      id: `tl-task-${task.id}`,
      timestamp: task.completedAt || task.createdAt,
      kind: "task",
      courseId: task.courseId,
      courseCode: course?.code,
      moduleId: task.moduleId,
      topicTitle: mod?.title || course?.title || task.title,
      headline: `${task.kind.toUpperCase()}: ${task.title}`,
      resultLabel: gradeLabel,
      deltaFromPrevious: null,
      evidenceSummary: `Due ${task.dueDate}${
        task.feedbackNotes ? ` · Feedback: ${task.feedbackNotes}` : ""
      }`,
      suggestedNextStep:
        task.status === "missed"
          ? "Break into recovery sub-blocks and reschedule on Today's Plan."
          : "Archive key takeaways in Knowledge Vault.",
    });
  }

  // 4. Milestones / Learning Events (objectives, skills, projects, corrections, syllabus archive)
  for (const ev of state.learningEvents || []) {
    if (
      ev.eventType !== "objective_completed" &&
      ev.eventType !== "skill_updated" &&
      ev.eventType !== "project_completed" &&
      ev.eventType !== "record_corrected" &&
      ev.eventType !== "syllabus_archived"
    ) {
      continue;
    }
    const course = ev.courseId ? courseById.get(ev.courseId) : undefined;
    const mod = ev.moduleId ? modById.get(ev.moduleId) : undefined;
    entries.push({
      id: `tl-ev-${ev.id}`,
      timestamp: ev.timestamp,
      kind: "milestone",
      courseId: ev.courseId,
      courseCode: course?.code,
      moduleId: ev.moduleId,
      topicTitle: mod?.title || course?.title || "Workspace Record",
      headline: ev.summary,
      resultLabel: ev.eventType.replace(/_/g, " "),
      deltaFromPrevious: null,
      evidenceSummary: "Verified audit log event",
      suggestedNextStep:
        ev.eventType === "skill_updated"
          ? "Complete a linked topic quiz to back this skill with assessed evidence."
          : "Continue current syllabus progression.",
    });
  }

  return entries
    .filter((entry) => {
      if (windowStartMs !== null) {
        const ms = Date.parse(entry.timestamp);
        if (!Number.isNaN(ms) && ms < windowStartMs) return false;
      }
      if (filters?.courseId && filters.courseId !== "all" && entry.courseId !== filters.courseId) {
        return false;
      }
      if (filters?.moduleId && filters.moduleId !== "all" && entry.moduleId !== filters.moduleId) {
        return false;
      }
      if (filters?.kind && filters.kind !== "all" && entry.kind !== filters.kind) {
        return false;
      }
      return true;
    })
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
}

/**
 * Generates a strictly record-grounded Weekly or Monthly Review (Section 3.5).
 */
export function generatePeriodicReview(
  state: StudyOSState,
  period: "weekly" | "monthly",
  now: Date = new Date()
): PeriodicReviewReport {
  const range: AnalyticsTimeRange = period === "weekly" ? "7d" : "30d";
  const analytics = computeGrowthAnalytics(state, range, now);
  const windowStartIso =
    analytics.windowStartIso ||
    new Date(
      now.getTime() - (period === "weekly" ? 7 : 30) * 24 * 60 * 60 * 1000
    ).toISOString();

  const windowStartMs = Date.parse(windowStartIso);
  const modById = new Map(state.modules.map((m) => [m.id, m]));

  const topicSet = new Set<string>();
  for (const s of state.studySessions || []) {
    if (Date.parse(s.endedAt || s.startedAt) >= windowStartMs && s.moduleId) {
      const m = modById.get(s.moduleId);
      if (m) topicSet.add(m.title);
    }
  }
  for (const a of state.assessmentAttempts || []) {
    if (Date.parse(a.attemptedAt) >= windowStartMs) {
      const m = a.moduleId ? modById.get(a.moduleId) : undefined;
      topicSet.add(m?.title || a.title);
    }
  }

  const allMasteries = computeAllTopicMasteries(state, now);
  const scoreChanges = allMasteries
    .filter(
      (m) =>
        m.baselineScore !== null &&
        m.latestScore !== null &&
        m.deltaScore !== null &&
        m.attemptCount >= 2
    )
    .map((m) => ({
      topic: m.moduleTitle,
      baseline: m.baselineScore!,
      latest: m.latestScore!,
      delta: m.deltaScore!,
    }));

  const strongestTopics = allMasteries
    .filter((m) => m.evidenceScore !== null && m.evidenceScore >= 75)
    .sort((a, b) => (b.evidenceScore || 0) - (a.evidenceScore || 0))
    .slice(0, 4)
    .map((m) => ({ topic: m.moduleTitle, score: m.evidenceScore! }));

  const todayYmd = getTodayDateString(now);
  const missedDeadlines = (state.tasks || [])
    .filter(
      (t) =>
        t.status === "missed" ||
        (t.status !== "completed" &&
          t.status !== "submitted" &&
          Boolean(t.dueDate) &&
          t.dueDate.slice(0, 10) < todayYmd)
    )
    .map((t) => `${t.title} (due ${t.dueDate})`);

  const recommendations = generateNextBestActions(state, now);
  const topNextPriorities = recommendations
    .slice(0, 3)
    .map((r) => `${r.title} — ${r.whySuggested}`);

  const missingDataDisclosures: string[] = [];
  if (analytics.assessmentsInRange === 0) {
    missingDataDisclosures.push(
      `Zero assessment attempts were recorded during this ${
        period === "weekly" ? "7-day" : "30-day"
      } window. Mastery trends cannot be verified from study minutes alone.`
    );
  }
  if (analytics.studyMinutesInRange === 0) {
    missingDataDisclosures.push(
      "Zero tracked study minutes were recorded in this reporting window."
    );
  }
  if ((state.tasks || []).length === 0) {
    missingDataDisclosures.push(
      "No dated assignments or exam records have been entered yet."
    );
  }

  return {
    period,
    periodLabel: period === "weekly" ? "Last 7 Days" : "Last 30 Days",
    windowStartIso,
    windowEndIso: analytics.windowEndIso,
    totalStudyMinutes: analytics.studyMinutesInRange,
    sessionCount: analytics.sessionsInRange,
    topicsWorkedOn: Array.from(topicSet),
    assessmentsCompleted: analytics.assessmentsInRange,
    averageAssessmentScore: analytics.currentAverageScore,
    scoreChanges,
    strongestTopics,
    recurringWeaknesses: analytics.errorBreakdown.map((e) => ({
      category: e.category,
      count: e.count,
    })),
    missedDeadlines,
    topNextPriorities:
      topNextPriorities.length > 0
        ? topNextPriorities
        : ["Create or select a syllabus topic and record a baseline quiz."],
    missingDataDisclosures,
  };
}

/**
 * Generates explainable Next-Best-Action recommendations grounded strictly in student records (Section 3.4).
 */
export function generateNextBestActions(
  state: StudyOSState,
  now: Date = new Date()
): NextBestActionItem[] {
  const nowMs = now.getTime();
  const todayYmd = getTodayDateString(now);

  const feedbackById = new Map(
    (state.recommendationFeedback || []).map((f) => [f.recommendationId, f])
  );

  const isSuppressed = (recId: string): boolean => {
    const fb = feedbackById.get(recId);
    if (!fb) return false;
    if (fb.action === "dismissed") return true;
    if (fb.action === "snoozed" && fb.snoozeUntil) {
      const untilMs = Date.parse(fb.snoozeUntil);
      if (!Number.isNaN(untilMs) && untilMs > nowMs) return true;
    }
    return false;
  };

  const candidates: NextBestActionItem[] = [];
  const activeCourses = state.courses.filter((c) => !c.archived);
  const activeModules = state.modules.filter((m) => !m.archived);

  if (activeCourses.length === 0) {
    const id = "rec-onboarding-first-course";
    if (!isSuppressed(id)) {
      candidates.push({
        id,
        priority: "high",
        category: "onboarding",
        title: "Create your first course or synthesize a curriculum from notes",
        whySuggested:
          "Insufficient workspace records: 0 active courses exist. Add a syllabus or upload notes to begin tracking learning evidence.",
        actionLabel: "Open Curriculum Builder",
        targetView: "grokopedia",
      });
    }
    return candidates;
  }

  // 1. Overdue tasks / missed deadlines recovery
  const overdueTasks = (state.tasks || [])
    .filter(
      (t) =>
        t.status !== "completed" &&
        t.status !== "submitted" &&
        Boolean(t.dueDate) &&
        t.dueDate.slice(0, 10) < todayYmd
    )
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  for (const task of overdueTasks.slice(0, 2)) {
    const id = `rec-overdue-${task.id}`;
    if (!isSuppressed(id)) {
      candidates.push({
        id,
        priority: "critical",
        category: "overdue_recovery",
        title: `Recover overdue ${task.kind}: ${task.title}`,
        whySuggested: `Due date ${task.dueDate} has passed (${task.estimatedMinutes}m estimated effort, status: ${task.status}).`,
        actionLabel: "Recover Task",
        courseId: task.courseId,
        moduleId: task.moduleId,
        taskId: task.id,
        targetView: "assessments",
      });
    }
  }

  // 2. Approaching high-urgency exams or assignments within 5 days
  const fiveDaysYmd = getTodayDateString(
    new Date(nowMs + 5 * 24 * 60 * 60 * 1000)
  );
  const upcomingTasks = (state.tasks || [])
    .filter(
      (t) =>
        t.status !== "completed" &&
        t.status !== "submitted" &&
        Boolean(t.dueDate) &&
        t.dueDate.slice(0, 10) >= todayYmd &&
        t.dueDate.slice(0, 10) <= fiveDaysYmd
    )
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  for (const task of upcomingTasks.slice(0, 2)) {
    const id = `rec-upcoming-${task.id}`;
    if (!isSuppressed(id)) {
      candidates.push({
        id,
        priority: task.kind === "exam" || task.priority === "critical" ? "critical" : "high",
        category: "upcoming_deadline",
        title: `Prepare for upcoming ${task.kind}: ${task.title}`,
        whySuggested: `Scheduled for ${task.dueDate} (${task.priority} priority · ${task.estimatedMinutes}m est).`,
        actionLabel: "Open Exam & Task Planner",
        courseId: task.courseId,
        moduleId: task.moduleId,
        taskId: task.id,
        targetView: "assessments",
      });
    }
  }

  // 3. Weak topics with low assessment scores or recurring conceptual/calculation errors
  const masteries = activeModules.map((m) => computeTopicMastery(m.id, state, now));
  const weakMasteries = masteries
    .filter(
      (m) =>
        m.attemptCount > 0 &&
        ((m.latestScore !== null && m.latestScore < 70) ||
          m.topErrorCategories.includes("conceptual") ||
          m.topErrorCategories.includes("calculation"))
    )
    .sort((a, b) => (a.latestScore ?? 100) - (b.latestScore ?? 100));

  for (const wm of weakMasteries.slice(0, 2)) {
    const id = `rec-remediate-${wm.moduleId}`;
    if (!isSuppressed(id)) {
      const errDetail =
        wm.topErrorCategories.length > 0
          ? ` with ${wm.topErrorCategories.join(", ")} errors`
          : "";
      candidates.push({
        id,
        priority: "high",
        category: "weak_topic_remediation",
        title: `Remediate & re-assess: ${wm.moduleTitle}`,
        whySuggested: `Latest assessment scored ${wm.latestScore}%${errDetail} across ${wm.attemptCount} attempt${wm.attemptCount === 1 ? "" : "s"}.`,
        actionLabel: "Practice & Reassess",
        courseId: wm.courseId,
        moduleId: wm.moduleId,
        targetView: "assessments",
      });
    }
  }

  // 4. Spaced repetition flashcards due now
  const dueCards = getDueFlashcards(state.flashcards || [], now);
  if (dueCards.length > 0) {
    const id = `rec-due-flashcards-${todayYmd}`;
    if (!isSuppressed(id)) {
      candidates.push({
        id,
        priority: dueCards.length >= 8 ? "high" : "medium",
        category: "spaced_recall",
        title: `Complete ${dueCards.length} due spaced-repetition flashcard${
          dueCards.length === 1 ? "" : "s"
        }`,
        whySuggested: `${dueCards.length} active-recall card${
          dueCards.length === 1 ? " is" : "s are"
        } due in your Leitner schedule today.`,
        actionLabel: "Review Due Cards",
        targetView: "flashcards",
      });
    }
  }

  // 5. Delayed recall candidates (>= 5 days since single pass without delayed verification)
  for (const m of masteries) {
    if (
      m.attemptCount >= 1 &&
      !m.delayedRecallVerified &&
      (m.latestScore ?? 0) >= 75 &&
      m.lastAttemptedAt
    ) {
      const daysSince =
        (nowMs - Date.parse(m.lastAttemptedAt)) / (1000 * 60 * 60 * 24);
      if (daysSince >= 5) {
        const id = `rec-delayed-recall-${m.moduleId}`;
        if (!isSuppressed(id)) {
          candidates.push({
            id,
            priority: "medium",
            category: "delayed_recall",
            title: `Run delayed recall check: ${m.moduleTitle}`,
            whySuggested: `Last assessed ${Math.floor(
              daysSince
            )} days ago at ${m.latestScore}% — a delayed recall check verifies long-term retention.`,
            actionLabel: "Take Delayed Recall Quiz",
            courseId: m.courseId,
            moduleId: m.moduleId,
            targetView: "assessments",
          });
        }
      }
    }
  }

  // 6. Unverified mastery (marked "Mastered" or studied heavily with 0 assessments)
  const unverified = masteries.filter(
    (m) =>
      m.attemptCount === 0 &&
      (m.workflowStatus === "Mastered" || m.workflowStatus === "In Progress")
  );
  for (const uv of unverified.slice(0, 2)) {
    const id = `rec-verify-${uv.moduleId}`;
    if (!isSuppressed(id)) {
      candidates.push({
        id,
        priority: uv.workflowStatus === "Mastered" ? "high" : "medium",
        category: "unverified_mastery",
        title: `Record baseline assessment for "${uv.moduleTitle}"`,
        whySuggested:
          uv.workflowStatus === "Mastered"
            ? "Topic is marked 'Mastered' in syllabus workflow, but 0 assessment attempts exist ('Not enough evidence yet.')."
            : "Topic is in progress with 0 recorded assessments — log a quick quiz to establish your baseline score.",
        actionLabel: "Take Baseline Quiz",
        courseId: uv.courseId,
        moduleId: uv.moduleId,
        targetView: "assessments",
      });
    }
  }

  const priorityRank: Record<NextBestActionItem["priority"], number> = {
    critical: 0,
    high: 1,
    medium: 2,
  };

  return candidates
    .sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority])
    .slice(0, 6);
}

/**
 * Deterministic quiz generator from module notes/concepts so practice quizzes work even offline.
 */
export function buildDeterministicTopicQuiz(
  mod: ModuleUnit,
  courseTitle: string = "Course",
  difficulty: Assessment["difficulty"] = "standard"
): Assessment {
  const concepts =
    mod.keyConcepts && mod.keyConcepts.length > 0
      ? mod.keyConcepts
      : mod.tags.length > 0
      ? mod.tags
      : [mod.title];

  const primaryConcept = concepts[0] || mod.title;
  const secondaryConcept = concepts[1] || "conservation & boundary conditions";

  const questions = [
    {
      id: `q-${Date.now()}-1`,
      prompt: `In "${mod.title}" (${courseTitle}), what is the primary role of ${primaryConcept}?`,
      options: [
        `Defines the core governing invariant and state behavior of ${mod.title}`,
        "Acts only as a cosmetic formatting convention with no analytical impact",
        "Eliminates all boundary conditions regardless of input domain",
        "Replaces empirical verification with unverified assumptions",
      ],
      correctAnswer: `Defines the core governing invariant and state behavior of ${mod.title}`,
      explanation: `${primaryConcept} anchors the analytical formulation and state transitions of ${mod.title}.`,
    },
    {
      id: `q-${Date.now()}-2`,
      prompt: `When analyzing ${secondaryConcept} within "${mod.title}", which failure mode must be checked first?`,
      options: [
        "Violating domain assumptions, boundary constraints, or unit consistency",
        "Using structured Markdown headings in study notes",
        "Recording multiple practice attempts over time",
        "Checking dimensional consistency before numerical substitution",
      ],
      correctAnswer:
        "Violating domain assumptions, boundary constraints, or unit consistency",
      explanation:
        "Conceptual and calculation errors most frequently arise from applying a formula outside its boundary assumptions or misaligning units.",
    },
    {
      id: `q-${Date.now()}-3`,
      prompt: `Which verification practice confirms durable mastery of "${mod.title}" rather than short-term familiarity?`,
      options: [
        "Solving novel problems from memory and passing a delayed recall check days later",
        "Re-reading highlighted notes passively without testing recall",
        "Toggling syllabus status to Mastered without completing an assessment",
        "Logging study timer minutes without checking problem accuracy",
      ],
      correctAnswer:
        "Solving novel problems from memory and passing a delayed recall check days later",
      explanation:
        "Active retrieval under test conditions and delayed recall across spaced intervals provide real evidence of durable retention.",
    },
  ];

  return {
    id: `asmt-det-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    courseId: mod.courseId,
    moduleId: mod.id,
    title: `${mod.title} — ${
      difficulty.charAt(0).toUpperCase() + difficulty.slice(1)
    } Check`,
    kind: "quiz",
    difficulty,
    maxScore: questions.length,
    questions,
    source: "notes_derived",
    createdAt: new Date().toISOString(),
  };
}

/**
 * Helper to append a LearningEvent idempotently by `idempotencyKey`.
 */
export function appendLearningEventIdempotent(
  existing: LearningEvent[],
  incoming: LearningEvent
): { events: LearningEvent[]; inserted: boolean } {
  const list = Array.isArray(existing) ? existing : [];
  if (list.some((e) => e.idempotencyKey === incoming.idempotencyKey)) {
    return { events: list, inserted: false };
  }
  return { events: [incoming, ...list], inserted: true };
}

/**
 * Helper to append a StudySessionRecord idempotently by `idempotencyKey`.
 */
export function appendStudySessionIdempotent(
  existing: StudySessionRecord[],
  incoming: StudySessionRecord
): { sessions: StudySessionRecord[]; inserted: boolean } {
  const list = Array.isArray(existing) ? existing : [];
  if (list.some((s) => s.idempotencyKey === incoming.idempotencyKey)) {
    return { sessions: list, inserted: false };
  }
  return { sessions: [incoming, ...list], inserted: true };
}

/**
 * Helper to validate an academic task input before persistence.
 */
export function validateAcademicTaskInput(input: {
  title?: string;
  dueDate?: string;
  estimatedMinutes?: number;
}): { valid: boolean; error?: string } {
  if (!input.title || !input.title.trim()) {
    return { valid: false, error: "Task title is required." };
  }
  if (!input.dueDate || !/^\d{4}-\d{2}-\d{2}/.test(input.dueDate.trim())) {
    return { valid: false, error: "Valid due date (YYYY-MM-DD) is required." };
  }
  if (
    input.estimatedMinutes !== undefined &&
    (!Number.isFinite(input.estimatedMinutes) || input.estimatedMinutes <= 0)
  ) {
    return { valid: false, error: "Estimated effort must be greater than 0 minutes." };
  }
  return { valid: true };
}

/**
 * Helper to validate an assessment attempt input before persistence.
 */
export function validateAssessmentAttemptInput(input: {
  title?: string;
  score?: number;
  maxScore?: number;
  selfConfidence?: number;
}): { valid: boolean; error?: string } {
  if (!input.title || !input.title.trim()) {
    return { valid: false, error: "Assessment title is required." };
  }
  if (
    typeof input.maxScore !== "number" ||
    !Number.isFinite(input.maxScore) ||
    input.maxScore <= 0
  ) {
    return { valid: false, error: "Maximum score must be a positive number." };
  }
  if (
    typeof input.score !== "number" ||
    !Number.isFinite(input.score) ||
    input.score < 0 ||
    input.score > input.maxScore
  ) {
    return {
      valid: false,
      error: `Score must be between 0 and ${input.maxScore}.`,
    };
  }
  if (
    input.selfConfidence !== undefined &&
    (input.selfConfidence < 1 || input.selfConfidence > 5)
  ) {
    return { valid: false, error: "Self-confidence rating must be between 1 and 5." };
  }
  return { valid: true };
}
