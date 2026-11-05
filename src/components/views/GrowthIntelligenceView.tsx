import React, { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
  Check,
  Clock,
  Copy,
  Download,
  FileText,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { useStudyOS } from "../../context/StudyOSContext";
import {
  AppView,
  type AITutorMode,
  type AITutorResponse,
  type AssessmentDifficulty,
} from "../../types/studyOS";
import {
  buildGrowthTimeline,
  computeAllTopicMasteries,
  computeGrowthAnalytics,
  generateNextBestActions,
  generatePeriodicReview,
  type AnalyticsTimeRange,
  type MasteryLevelId,
} from "../../lib/growthIntelligence";
import { countWords } from "../../lib/gamification";
import { runGroundedAITutor } from "../../services/aiService";

type GrowthSubTab = "overview" | "timeline" | "reviews" | "tutor";

export function GrowthIntelligenceView() {
  const {
    state,
    setActiveView,
    setSelectedCourseId,
    setSelectedModuleId,
    openModuleInVault,
    actOnRecommendation,
    saveModuleNotes,
    createAssessment,
    pushToast,
  } = useStudyOS();

  const [subTab, setSubTab] = useState<GrowthSubTab>("overview");
  const [range, setRange] = useState<AnalyticsTimeRange>("30d");

  // Overview Mastery filters
  const [masteryCourseFilter, setMasteryCourseFilter] = useState<string>("all");
  const [masteryLevelFilter, setMasteryLevelFilter] = useState<"all" | MasteryLevelId>("all");

  // Timeline filters
  const [tlCourseFilter, setTlCourseFilter] = useState<string>("all");
  const [tlModuleFilter, setTlModuleFilter] = useState<string>("all");
  const [tlKindFilter, setTlKindFilter] = useState<
    "all" | "assessment" | "session" | "task" | "milestone"
  >("all");

  // Periodic review state
  const [reviewPeriod, setReviewPeriod] = useState<"weekly" | "monthly">("weekly");

  // Grounded AI Tutor state
  const activeCourses = useMemo(
    () => state.courses.filter((c) => !c.archived),
    [state.courses]
  );
  const activeModules = useMemo(
    () => state.modules.filter((m) => !m.archived),
    [state.modules]
  );

  const [tutorCourseId, setTutorCourseId] = useState<string>(
    () => activeCourses[0]?.id || ""
  );
  const tutorTopics = useMemo(
    () => activeModules.filter((m) => !tutorCourseId || m.courseId === tutorCourseId),
    [activeModules, tutorCourseId]
  );
  const [tutorModuleId, setTutorModuleId] = useState<string>(
    () => tutorTopics[0]?.id || ""
  );
  const [tutorMode, setTutorMode] = useState<AITutorMode>("mistake_analysis");
  const [tutorDifficulty, setTutorDifficulty] = useState<AssessmentDifficulty>("standard");
  const [tutorPrompt, setTutorPrompt] = useState<string>("");
  const [isTutorRunning, setIsTutorRunning] = useState<boolean>(false);
  const [tutorResponse, setTutorResponse] = useState<AITutorResponse | null>(null);
  const [appendedToVault, setAppendedToVault] = useState<boolean>(false);
  const [savedQuizId, setSavedQuizId] = useState<string | null>(null);

  const courseMap = useMemo(
    () => new Map(state.courses.map((c) => [c.id, c])),
    [state.courses]
  );

  const analytics = useMemo(
    () => computeGrowthAnalytics(state, range),
    [state, range]
  );

  const allMasteries = useMemo(
    () => computeAllTopicMasteries(state),
    [state]
  );

  const filteredMasteries = useMemo(() => {
    return allMasteries.filter((m) => {
      if (masteryCourseFilter !== "all" && m.courseId !== masteryCourseFilter) {
        return false;
      }
      if (masteryLevelFilter !== "all" && m.level !== masteryLevelFilter) {
        return false;
      }
      return true;
    });
  }, [allMasteries, masteryCourseFilter, masteryLevelFilter]);

  const recommendations = useMemo(
    () => generateNextBestActions(state),
    [state]
  );

  const timelineEntries = useMemo(
    () =>
      buildGrowthTimeline(state, {
        courseId: tlCourseFilter,
        moduleId: tlModuleFilter,
        kind: tlKindFilter,
        range,
      }),
    [state, tlCourseFilter, tlModuleFilter, tlKindFilter, range]
  );

  const periodicReview = useMemo(
    () => generatePeriodicReview(state, reviewPeriod),
    [state, reviewPeriod]
  );

  const selectedTutorTopic = useMemo(
    () =>
      activeModules.find((m) => m.id === tutorModuleId) || tutorTopics[0] || null,
    [activeModules, tutorModuleId, tutorTopics]
  );

  const tutorTopicAttempts = useMemo(() => {
    if (!selectedTutorTopic) return [];
    return state.assessmentAttempts
      .filter((a) => a.moduleId === selectedTutorTopic.id)
      .slice()
      .sort((a, b) => Date.parse(a.attemptedAt) - Date.parse(b.attemptedAt));
  }, [selectedTutorTopic, state.assessmentAttempts]);

  const handleNavigateRecommendation = (rec: (typeof recommendations)[number]) => {
    actOnRecommendation(rec.id, "accepted");
    if (rec.courseId) setSelectedCourseId(rec.courseId);
    if (rec.moduleId) setSelectedModuleId(rec.moduleId);
    const viewMap: Record<typeof rec.targetView, AppView> = {
      assessments: AppView.ASSESSMENTS,
      vault: AppView.VAULT,
      flashcards: AppView.FLASHCARDS,
      grokopedia: AppView.GROKOPEDIA,
      growth: AppView.GROWTH,
      courses: AppView.COURSES,
    };
    setActiveView(viewMap[rec.targetView]);
  };

  const buildReviewMarkdown = (): string => {
    const r = periodicReview;
    const lines: string[] = [
      `# StudyOS ${r.period === "weekly" ? "Weekly" : "Monthly"} Student Growth Review`,
      `Reporting Window: ${r.windowStartIso.slice(0, 10)} to ${r.windowEndIso.slice(0, 10)}`,
      "",
      "## Summary Metrics",
      `- Tracked Study Time: ${r.totalStudyMinutes} minutes (${r.sessionCount} logged sessions)`,
      `- Assessments Completed: ${r.assessmentsCompleted}`,
      `- Average Assessment Score: ${
        r.averageAssessmentScore !== null ? `${r.averageAssessmentScore}%` : "No attempts in window"
      }`,
      `- Topics Worked On: ${
        r.topicsWorkedOn.length > 0 ? r.topicsWorkedOn.join(", ") : "None recorded"
      }`,
      "",
      "## Baseline vs. Latest Score Progression",
      ...(r.scoreChanges.length > 0
        ? r.scoreChanges.map(
            (sc) =>
              `- ${sc.topic}: ${sc.baseline}% -> ${sc.latest}% (${
                sc.delta >= 0 ? "+" : ""
              }${sc.delta}%)`
          )
        : ["- Insufficient multi-attempt records to compute topic score deltas."]),
      "",
      "## Recurring Error Patterns",
      ...(r.recurringWeaknesses.length > 0
        ? r.recurringWeaknesses.map((w) => `- ${w.category}: ${w.count} occurrence(s)`)
        : ["- Zero categorized errors recorded in this window."]),
      "",
      "## Missed or Overdue Deadlines",
      ...(r.missedDeadlines.length > 0
        ? r.missedDeadlines.map((d) => `- ${d}`)
        : ["- None."]),
      "",
      "## Top Next Priorities",
      ...r.topNextPriorities.map((p, i) => `${i + 1}. ${p}`),
    ];

    if (r.missingDataDisclosures.length > 0) {
      lines.push("", "## Data Sufficiency Disclosures");
      for (const d of r.missingDataDisclosures) {
        lines.push(`- ${d}`);
      }
    }

    return lines.join("\n");
  };

  const handleCopyReview = async () => {
    const md = buildReviewMarkdown();
    try {
      await navigator.clipboard.writeText(md);
      pushToast({
        title: "Copied Review Markdown",
        subtitle: `${periodicReview.periodLabel} report copied to clipboard.`,
        variant: "success",
      });
    } catch {
      pushToast({
        title: "Clipboard Unavailable",
        subtitle: "Use Download .md to save the review file.",
        variant: "warning",
      });
    }
  };

  const handleDownloadReview = () => {
    const md = buildReviewMarkdown();
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `studyos-${reviewPeriod}-review-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleRunGroundedTutor = async (e: React.FormEvent) => {
    e.preventDefault();
    const topicTitle =
      selectedTutorTopic?.title || tutorPrompt.trim() || "Selected Academic Concept";
    const course = selectedTutorTopic
      ? courseMap.get(selectedTutorTopic.courseId)
      : undefined;

    const recurringErrors = Array.from(
      new Set(tutorTopicAttempts.flatMap((a) => a.errorCategories))
    );

    setIsTutorRunning(true);
    setAppendedToVault(false);
    setSavedQuizId(null);
    try {
      const response = await runGroundedAITutor({
        mode: tutorMode,
        topicTitle,
        courseTitle: course?.title,
        notesMarkdown: selectedTutorTopic?.notesMarkdown,
        prompt: tutorPrompt.trim() || undefined,
        attemptHistory: tutorTopicAttempts.slice(-5).map((a) => ({
          title: a.title,
          percentage: a.percentage,
          attemptedAt: a.attemptedAt,
          errorCategories: a.errorCategories,
        })),
        recurringErrors,
        difficulty: tutorDifficulty,
        model: state.settings.selectedModel,
      });
      setTutorResponse(response);
    } finally {
      setIsTutorRunning(false);
    }
  };

  const handleConfirmAppendTutorToNotes = () => {
    if (!selectedTutorTopic || !tutorResponse || appendedToVault) return;
    const stamp = new Date().toISOString().slice(0, 10);
    const merged = `${selectedTutorTopic.notesMarkdown.trim()}\n\n---\n\n## Grounded Tutor Note (${stamp})\n\n${tutorResponse.markdown.trim()}\n`;
    saveModuleNotes(selectedTutorTopic.id, merged);
    setAppendedToVault(true);
  };

  const handleConfirmSaveTutorQuiz = () => {
    if (
      !selectedTutorTopic ||
      !tutorResponse?.generatedQuiz ||
      savedQuizId
    ) {
      return;
    }
    const created = createAssessment({
      courseId: selectedTutorTopic.courseId,
      moduleId: selectedTutorTopic.id,
      title: tutorResponse.generatedQuiz.title,
      kind: "quiz",
      difficulty: tutorResponse.generatedQuiz.difficulty || tutorDifficulty,
      maxScore: tutorResponse.generatedQuiz.questions.length,
      questions: tutorResponse.generatedQuiz.questions,
      source: "ai_generated",
    });
    setSavedQuizId(created.id);
  };

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      {/* Header & Time Window Selector */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-outline-variant/30 pb-5">
        <div>
          <p className="text-xs font-mono text-on-surface-variant tracking-wide">
            Empirical Mastery · Longitudinal History · Explainable Guidance
          </p>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-on-surface mt-1">
            Student Growth Intelligence
          </h1>
          <p className="text-sm text-on-surface-variant mt-1 max-w-2xl">
            Mastery is computed strictly from recorded assessment evidence—never from passive timers, note length, or manual status toggles.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Sub-navigation */}
          <div className="flex items-center gap-1 p-1 bg-surface-low border border-outline-variant/35 rounded-lg">
            {(
              [
                { id: "overview", label: "Mastery & Actions" },
                { id: "timeline", label: "Growth Timeline" },
                { id: "reviews", label: "Weekly / Monthly Review" },
                { id: "tutor", label: "Grounded AI Tutor" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubTab(tab.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  subTab === tab.id
                    ? "bg-primary text-on-primary"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Time-Range Selector */}
          <div className="flex items-center gap-1 p-1 bg-surface-lowest border border-outline-variant/35 rounded-lg">
            {(["7d", "30d", "90d", "all"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`px-2.5 py-1.5 text-xs font-mono tabular-nums font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  range === r
                    ? "bg-surface-high text-on-surface"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {r === "all" ? "All Time" : r.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Top Empirical KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface-low border border-outline-variant/35 rounded-xl p-4">
          <p className="text-xs text-on-surface-variant">
            Study Activity ({range === "all" ? "All Time" : `Last ${range}`})
          </p>
          <p className="text-2xl font-bold font-mono tabular-nums text-on-surface mt-1">
            {analytics.studyMinutesInRange} min
          </p>
          <p className="text-xs text-on-surface-variant font-mono tabular-nums mt-1">
            {analytics.sessionsInRange} deduplicated session
            {analytics.sessionsInRange === 1 ? "" : "s"}
          </p>
        </div>

        <div className="bg-surface-low border border-outline-variant/35 rounded-xl p-4">
          <p className="text-xs text-on-surface-variant">
            Empirical Score Trend ({analytics.assessmentsInRange} attempts)
          </p>
          <p className="text-2xl font-bold font-mono tabular-nums text-primary mt-1">
            {analytics.currentAverageScore !== null
              ? `${analytics.currentAverageScore}%`
              : "No data"}
          </p>
          <p className="text-xs text-on-surface-variant font-mono tabular-nums mt-1">
            {analytics.overallScoreDelta !== null
              ? `${analytics.overallScoreDelta >= 0 ? "+" : ""}${
                  analytics.overallScoreDelta
                }% vs ${analytics.baselineAverageScore}% baseline`
              : analytics.assessmentsInRange === 1
              ? "1 attempt recorded — need ≥2 for trend"
              : "Record assessments to measure delta"}
          </p>
        </div>

        <div className="bg-surface-low border border-outline-variant/35 rounded-xl p-4">
          <p className="text-xs text-on-surface-variant">Verified Topic Mastery</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-tertiary mt-1">
            {analytics.verifiedMasteryCount} / {allMasteries.length}
          </p>
          <p className="text-xs text-on-surface-variant font-mono tabular-nums mt-1">
            {analytics.insufficientEvidenceCount} topic
            {analytics.insufficientEvidenceCount === 1 ? " has" : "s have"} 0 attempts
          </p>
        </div>

        <div className="bg-surface-low border border-outline-variant/35 rounded-xl p-4">
          <p className="text-xs text-on-surface-variant">Confidence Calibration</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-on-surface mt-1">
            {analytics.confidenceCalibrationGap !== null
              ? `${analytics.confidenceCalibrationGap > 0 ? "+" : ""}${
                  analytics.confidenceCalibrationGap
                }%`
              : "Unmeasured"}
          </p>
          <p className="text-xs text-on-surface-variant mt-1">
            {analytics.confidenceCalibrationGap === null
              ? "Requires ≥1 scored attempt"
              : Math.abs(analytics.confidenceCalibrationGap) <= 10
              ? "Well-calibrated confidence vs accuracy"
              : analytics.confidenceCalibrationGap > 10
              ? "Overconfidence gap: confidence exceeds score"
              : "Underconfident: accuracy exceeds self-rating"}
          </p>
        </div>
      </div>

      {/* =====================================================================
          SUB-VIEW 1: OVERVIEW — NEXT BEST ACTIONS, TOPIC MASTERY & ERRORS
         ===================================================================== */}
      {subTab === "overview" && (
        <div className="space-y-6">
          {/* Explainable Next-Best-Action Recommendations */}
          <div className="bg-surface-low border border-outline-variant/35 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-on-surface">
                  Recommended Next Actions
                </h2>
                <p className="text-xs text-on-surface-variant">
                  Every recommendation cites the specific deadline, recall schedule, or assessment record that triggered it.
                </p>
              </div>
              <TrendingUp className="w-4 h-4 text-primary" />
            </div>

            {recommendations.length === 0 ? (
              <p className="text-xs text-on-surface-variant py-4">
                All active recommendations have been addressed or snoozed. Add new coursework or log a baseline quiz to generate fresh guidance.
              </p>
            ) : (
              <div className="divide-y divide-outline-variant/25">
                {recommendations.map((rec) => (
                  <div
                    key={rec.id}
                    className="py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs font-mono">
                        <span
                          className={
                            rec.priority === "critical"
                              ? "text-error font-semibold"
                              : rec.priority === "high"
                              ? "text-secondary font-semibold"
                              : "text-primary"
                          }
                        >
                          {rec.priority.toUpperCase()}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="text-on-surface-variant">
                          {rec.category.replace(/_/g, " ")}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-on-surface">
                        {rec.title}
                      </p>
                      <p className="text-xs text-on-surface-variant">
                        Why suggested: {rec.whySuggested}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleNavigateRecommendation(rec)}
                        className="px-3 py-1.5 bg-primary text-on-primary text-xs font-semibold rounded-lg hover:opacity-90 flex items-center gap-1 whitespace-nowrap shrink-0"
                      >
                        {rec.actionLabel}
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => actOnRecommendation(rec.id, "snoozed")}
                        className="px-2.5 py-1.5 bg-surface-lowest border border-outline-variant/35 text-xs text-on-surface-variant hover:text-on-surface rounded-lg whitespace-nowrap shrink-0"
                      >
                        Snooze 24h
                      </button>
                      <button
                        type="button"
                        onClick={() => actOnRecommendation(rec.id, "dismissed")}
                        className="px-2.5 py-1.5 text-xs text-on-surface-variant hover:text-error whitespace-nowrap shrink-0"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Topic Mastery Matrix + Error Diagnostics */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-8 bg-surface-low border border-outline-variant/35 rounded-xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-outline-variant/25">
                <div>
                  <h2 className="text-base font-semibold text-on-surface">
                    Evidence-Based Topic Mastery Matrix
                  </h2>
                  <p className="text-xs text-on-surface-variant">
                    Compares manual syllabus workflow status against empirical assessment mastery.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={masteryCourseFilter}
                    onChange={(e) => setMasteryCourseFilter(e.target.value)}
                    className="bg-surface-lowest border border-outline-variant/40 rounded-lg px-2.5 py-1.5 text-xs text-on-surface"
                  >
                    <option value="all">All Courses</option>
                    {activeCourses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code}
                      </option>
                    ))}
                  </select>

                  <select
                    value={masteryLevelFilter}
                    onChange={(e) =>
                      setMasteryLevelFilter(e.target.value as "all" | MasteryLevelId)
                    }
                    className="bg-surface-lowest border border-outline-variant/40 rounded-lg px-2.5 py-1.5 text-xs text-on-surface"
                  >
                    <option value="all">All Evidence Levels</option>
                    <option value="verified_mastery">Verified Mastery</option>
                    <option value="proficient">Proficient</option>
                    <option value="developing">Developing</option>
                    <option value="emerging">Needs Remediation</option>
                    <option value="insufficient_evidence">Not Enough Evidence</option>
                  </select>
                </div>
              </div>

              {filteredMasteries.length === 0 ? (
                <p className="text-xs text-on-surface-variant py-8 text-center">
                  No active syllabus topics match the selected filters.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-outline-variant/30 text-[11px] font-mono text-on-surface-variant">
                        <th className="py-2.5 pr-3">Topic</th>
                        <th className="py-2.5 px-3">Workflow</th>
                        <th className="py-2.5 px-3">Evidence Mastery</th>
                        <th className="py-2.5 px-3 text-right">Baseline → Latest</th>
                        <th className="py-2.5 px-3 text-right">Attempts</th>
                        <th className="py-2.5 pl-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/20 text-xs">
                      {filteredMasteries.map((m) => {
                        const course = courseMap.get(m.courseId);
                        const unverifiedMismatch =
                          m.workflowStatus === "Mastered" && m.attemptCount === 0;

                        return (
                          <tr
                            key={m.moduleId}
                            className="hover:bg-surface-lowest/50 transition-colors"
                          >
                            <td className="py-3 pr-3">
                              <p className="font-medium text-on-surface">
                                {m.moduleTitle}
                              </p>
                              <p className="text-[11px] text-on-surface-variant">
                                {course?.code || "Course"}
                                {m.topErrorCategories.length > 0
                                  ? ` · Errors: ${m.topErrorCategories.join(", ")}`
                                  : ""}
                              </p>
                            </td>
                            <td className="py-3 px-3 text-on-surface-variant whitespace-nowrap">
                              {m.workflowStatus}
                            </td>
                            <td className="py-3 px-3">
                              <span
                                className={`font-semibold ${
                                  m.level === "verified_mastery"
                                    ? "text-tertiary"
                                    : m.level === "proficient"
                                    ? "text-primary"
                                    : m.level === "developing"
                                    ? "text-secondary"
                                    : m.level === "emerging"
                                    ? "text-error"
                                    : "text-on-surface-variant"
                                }`}
                              >
                                {m.label}
                              </span>
                              {unverifiedMismatch && (
                                <p className="text-[11px] text-secondary mt-0.5">
                                  Workflow marked Mastered without test evidence
                                </p>
                              )}
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                              {m.attemptCount === 0 ? (
                                <span className="text-on-surface-variant">—</span>
                              ) : m.attemptCount === 1 ? (
                                <span>{m.latestScore}%</span>
                              ) : (
                                <span>
                                  {m.baselineScore}% → {m.latestScore}% (
                                  {m.deltaScore! >= 0 ? "+" : ""}
                                  {m.deltaScore}%)
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-right font-mono tabular-nums text-on-surface-variant whitespace-nowrap">
                              {m.attemptCount}
                              {m.selfConfidenceAvg !== null
                                ? ` · ${m.selfConfidenceAvg}/5 conf`
                                : ""}
                            </td>
                            <td className="py-3 pl-3 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedCourseId(m.courseId);
                                    setSelectedModuleId(m.moduleId);
                                    setActiveView(AppView.ASSESSMENTS);
                                  }}
                                  className="text-xs font-medium text-primary hover:underline whitespace-nowrap shrink-0"
                                >
                                  Assess
                                </button>
                                <span aria-hidden="true" className="text-outline">
                                  ·
                                </span>
                                <button
                                  type="button"
                                  onClick={() => openModuleInVault(m.moduleId)}
                                  className="text-xs text-on-surface-variant hover:text-on-surface whitespace-nowrap shrink-0"
                                >
                                  Notes
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Recurring Error Breakdown & Struggling Topics */}
            <div className="lg:col-span-4 bg-surface-low border border-outline-variant/35 rounded-xl p-5 space-y-5">
              <div>
                <h2 className="text-base font-semibold text-on-surface">
                  Error Pattern Diagnostics
                </h2>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Aggregated from missed quiz questions and manual attempt logs in the selected window.
                </p>
              </div>

              {analytics.errorBreakdown.length === 0 ? (
                <p className="text-xs text-on-surface-variant py-4">
                  Zero categorized errors recorded in this window. Tag mistake categories during quizzes to surface recurring conceptual or calculation patterns.
                </p>
              ) : (
                <div className="space-y-3">
                  {analytics.errorBreakdown.map((err) => (
                    <div key={err.category} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="capitalize text-on-surface">
                          {err.category.replace(/_/g, " ")}
                        </span>
                        <span className="font-mono tabular-nums text-on-surface-variant">
                          {err.count} ({err.sharePct}%)
                        </span>
                      </div>
                      <div className="h-1.5 bg-surface-lowest rounded-full overflow-hidden">
                        <div
                          className="h-full bg-secondary rounded-full"
                          style={{ width: `${Math.max(6, err.sharePct)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="pt-4 border-t border-outline-variant/25 space-y-2.5">
                <h3 className="text-xs font-semibold text-on-surface">
                  Topics Still Difficult ({analytics.strugglingTopics.length})
                </h3>
                {analytics.strugglingTopics.length === 0 ? (
                  <p className="text-xs text-on-surface-variant">
                    No assessed topics are currently below 70% or flagged with recurring conceptual errors.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {analytics.strugglingTopics.slice(0, 4).map((st) => (
                      <div
                        key={st.moduleId}
                        className="flex items-center justify-between gap-2 text-xs"
                      >
                        <span className="text-on-surface truncate">
                          {st.moduleTitle}
                        </span>
                        <span className="font-mono tabular-nums text-error shrink-0">
                          {st.latestScore}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          SUB-VIEW 2: FILTERABLE STUDENT GROWTH TIMELINE
         ===================================================================== */}
      {subTab === "timeline" && (
        <div className="bg-surface-low border border-outline-variant/35 rounded-xl p-5 space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-outline-variant/25">
            <div>
              <h2 className="text-base font-semibold text-on-surface">
                Chronological Student Growth Timeline
              </h2>
              <p className="text-xs text-on-surface-variant">
                Every entry shows empirical outcome, change from previous comparable attempt, and suggested next action.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 bg-surface-lowest p-1 rounded-lg border border-outline-variant/30">
                {(["all", "assessment", "session", "task", "milestone"] as const).map(
                  (k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setTlKindFilter(k)}
                      className={`px-2.5 py-1 text-xs font-medium rounded capitalize transition-colors whitespace-nowrap shrink-0 ${
                        tlKindFilter === k
                          ? "bg-surface-high text-on-surface"
                          : "text-on-surface-variant hover:text-on-surface"
                      }`}
                    >
                      {k}
                    </button>
                  )
                )}
              </div>

              <select
                value={tlCourseFilter}
                onChange={(e) => {
                  setTlCourseFilter(e.target.value);
                  setTlModuleFilter("all");
                }}
                className="bg-surface-lowest border border-outline-variant/40 rounded-lg px-2.5 py-1.5 text-xs text-on-surface"
              >
                <option value="all">All Subjects</option>
                {state.courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.title}
                  </option>
                ))}
              </select>

              <select
                value={tlModuleFilter}
                onChange={(e) => setTlModuleFilter(e.target.value)}
                className="bg-surface-lowest border border-outline-variant/40 rounded-lg px-2.5 py-1.5 text-xs text-on-surface"
              >
                <option value="all">All Topics</option>
                {state.modules
                  .filter((m) => tlCourseFilter === "all" || m.courseId === tlCourseFilter)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {timelineEntries.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <Activity className="w-7 h-7 text-on-surface-variant mx-auto opacity-70" />
              <p className="text-sm font-medium text-on-surface">
                No verified growth records match this filter and time window.
              </p>
              <p className="text-xs text-on-surface-variant max-w-md mx-auto">
                Log focus sessions, complete assignments, or submit topic quizzes to build your longitudinal academic history.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-outline-variant/25">
              {timelineEntries.map((item) => (
                <div
                  key={item.id}
                  className="py-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono tabular-nums text-on-surface-variant">
                      <span>{item.timestamp.slice(0, 16).replace("T", " ")}</span>
                      <span aria-hidden="true">·</span>
                      <span className="capitalize text-primary">{item.kind}</span>
                      {item.courseCode && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{item.courseCode}</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span>{item.topicTitle}</span>
                    </div>
                    <p className="text-sm font-semibold text-on-surface">
                      {item.headline}
                    </p>
                    <p className="text-xs text-on-surface-variant">
                      {item.evidenceSummary} · Next: {item.suggestedNextStep}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 font-mono tabular-nums text-xs shrink-0">
                    <span className="font-semibold text-on-surface">
                      {item.resultLabel}
                    </span>
                    {item.deltaFromPrevious !== null && (
                      <span
                        className={
                          item.deltaFromPrevious >= 0 ? "text-tertiary" : "text-error"
                        }
                      >
                        ({item.deltaFromPrevious >= 0 ? "+" : ""}
                        {item.deltaFromPrevious}% vs prev)
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          SUB-VIEW 3: RECORD-GROUNDED WEEKLY & MONTHLY REVIEWS
         ===================================================================== */}
      {subTab === "reviews" && (
        <div className="bg-surface-low border border-outline-variant/35 rounded-xl p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-outline-variant/25 pb-4">
            <div>
              <h2 className="text-lg font-semibold text-on-surface">
                {periodicReview.period === "weekly" ? "Weekly" : "Monthly"} Learning &amp; Growth Review
              </h2>
              <p className="text-xs font-mono tabular-nums text-on-surface-variant mt-0.5">
                Window: {periodicReview.windowStartIso.slice(0, 10)} →{" "}
                {periodicReview.windowEndIso.slice(0, 10)} ({periodicReview.periodLabel})
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1 bg-surface-lowest p-1 rounded-lg border border-outline-variant/35">
                <button
                  type="button"
                  onClick={() => setReviewPeriod("weekly")}
                  className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap shrink-0 ${
                    reviewPeriod === "weekly"
                      ? "bg-primary text-on-primary"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  Weekly (7d)
                </button>
                <button
                  type="button"
                  onClick={() => setReviewPeriod("monthly")}
                  className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap shrink-0 ${
                    reviewPeriod === "monthly"
                      ? "bg-primary text-on-primary"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  Monthly (30d)
                </button>
              </div>

              <button
                type="button"
                onClick={() => void handleCopyReview()}
                className="flex items-center gap-1.5 px-3 py-2 bg-surface-high text-on-surface text-xs font-medium rounded-lg hover:bg-surface-bright whitespace-nowrap shrink-0"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy Markdown
              </button>

              <button
                type="button"
                onClick={handleDownloadReview}
                className="flex items-center gap-1.5 px-3 py-2 bg-primary text-on-primary text-xs font-semibold rounded-lg hover:opacity-90 whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Download .md
              </button>
            </div>
          </div>

          {periodicReview.missingDataDisclosures.length > 0 && (
            <div className="bg-surface-lowest border border-secondary/40 rounded-lg p-4 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-secondary">
                <AlertTriangle className="w-4 h-4" />
                Data Sufficiency Disclosures
              </div>
              {periodicReview.missingDataDisclosures.map((d, i) => (
                <p key={i} className="text-xs text-on-surface-variant">
                  · {d}
                </p>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="bg-surface-lowest border border-outline-variant/30 rounded-lg p-4 space-y-2">
              <h3 className="text-xs font-semibold text-on-surface">
                Activity &amp; Coverage
              </h3>
              <p className="text-xs font-mono tabular-nums text-on-surface-variant">
                Study Time: {periodicReview.totalStudyMinutes} min ({periodicReview.sessionCount} sessions)
              </p>
              <p className="text-xs font-mono tabular-nums text-on-surface-variant">
                Assessments Completed: {periodicReview.assessmentsCompleted}
              </p>
              <p className="text-xs font-mono tabular-nums text-on-surface-variant">
                Window Average:{" "}
                {periodicReview.averageAssessmentScore !== null
                  ? `${periodicReview.averageAssessmentScore}%`
                  : "Not enough attempts"}
              </p>
              <p className="text-xs text-on-surface-variant pt-1">
                Topics Worked On:{" "}
                {periodicReview.topicsWorkedOn.length > 0
                  ? periodicReview.topicsWorkedOn.join(" · ")
                  : "None logged in window"}
              </p>
            </div>

            <div className="bg-surface-lowest border border-outline-variant/30 rounded-lg p-4 space-y-2">
              <h3 className="text-xs font-semibold text-on-surface">
                Empirical Score Changes
              </h3>
              {periodicReview.scoreChanges.length === 0 ? (
                <p className="text-xs text-on-surface-variant">
                  Requires ≥2 attempts on a topic to report verified baseline-to-latest progression.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {periodicReview.scoreChanges.map((sc) => (
                    <div
                      key={sc.topic}
                      className="flex items-center justify-between text-xs font-mono tabular-nums"
                    >
                      <span className="font-sans text-on-surface truncate pr-2">
                        {sc.topic}
                      </span>
                      <span
                        className={sc.delta >= 0 ? "text-tertiary" : "text-error"}
                      >
                        {sc.baseline}% → {sc.latest}% ({sc.delta >= 0 ? "+" : ""}
                        {sc.delta}%)
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-surface-lowest border border-outline-variant/30 rounded-lg p-4 space-y-2">
              <h3 className="text-xs font-semibold text-on-surface">
                Next Priorities &amp; Deadlines
              </h3>
              {periodicReview.missedDeadlines.length > 0 && (
                <p className="text-xs text-error">
                  Overdue: {periodicReview.missedDeadlines.join(" · ")}
                </p>
              )}
              <div className="space-y-1.5">
                {periodicReview.topNextPriorities.map((p, idx) => (
                  <p key={idx} className="text-xs text-on-surface-variant">
                    {idx + 1}. {p}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          SUB-VIEW 4: GROUNDED AI LEARNING & MISTAKE TUTOR
         ===================================================================== */}
      {subTab === "tutor" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={(e) => void handleRunGroundedTutor(e)}
            className="lg:col-span-5 bg-surface-low border border-outline-variant/35 rounded-xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-on-surface">
                Grounded AI Learning Tutor
              </h2>
              <Sparkles className="w-4 h-4 text-primary" />
            </div>

            <p className="text-xs text-on-surface-variant">
              Grounds explanations, Socratic questioning, and mistake remediation in your actual Knowledge Vault notes and recorded assessment history. Never fabricates grades or modifies records without confirmation.
            </p>

            <div>
              <label className="block text-xs text-on-surface-variant mb-1">
                Course
              </label>
              <select
                value={tutorCourseId}
                onChange={(e) => {
                  const next = e.target.value;
                  setTutorCourseId(next);
                  const first = activeModules.find((m) => m.courseId === next);
                  setTutorModuleId(first?.id || "");
                }}
                className="w-full bg-surface-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-xs text-on-surface"
              >
                <option value="">General Academic Topic</option>
                {activeCourses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.title}
                  </option>
                ))}
              </select>
            </div>

            {tutorTopics.length > 0 && (
              <div>
                <label className="block text-xs text-on-surface-variant mb-1">
                  Syllabus Topic
                </label>
                <select
                  value={selectedTutorTopic?.id || ""}
                  onChange={(e) => setTutorModuleId(e.target.value)}
                  className="w-full bg-surface-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-xs text-on-surface"
                >
                  {tutorTopics.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs text-on-surface-variant mb-1">
                Tutoring Mode
              </label>
              <select
                value={tutorMode}
                onChange={(e) => setTutorMode(e.target.value as AITutorMode)}
                className="w-full bg-surface-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-xs text-on-surface"
              >
                <option value="mistake_analysis">
                  Explain Recurring Mistakes &amp; Remediation Plan
                </option>
                <option value="explain">First-Principles Concept Explanation</option>
                <option value="step_by_step">Step-by-Step Worked Problem Solving</option>
                <option value="socratic">Socratic Diagnostic Questioning</option>
                <option value="generate_quiz">Generate Practice Quiz Draft</option>
              </select>
            </div>

            {tutorMode === "generate_quiz" && (
              <div>
                <label className="block text-xs text-on-surface-variant mb-1">
                  Quiz Difficulty
                </label>
                <select
                  value={tutorDifficulty}
                  onChange={(e) =>
                    setTutorDifficulty(e.target.value as AssessmentDifficulty)
                  }
                  className="w-full bg-surface-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-xs text-on-surface"
                >
                  <option value="foundational">Foundational</option>
                  <option value="standard">Standard</option>
                  <option value="rigorous">Rigorous</option>
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs text-on-surface-variant mb-1">
                Specific Question or Problem (Optional)
              </label>
              <textarea
                rows={3}
                value={tutorPrompt}
                onChange={(e) => setTutorPrompt(e.target.value)}
                placeholder="Paste a specific problem, derivation step, or question..."
                className="w-full bg-surface-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-xs text-on-surface focus:outline-none focus:border-primary"
              />
            </div>

            {/* Transparent Verified Context Disclosure */}
            <div className="bg-surface-lowest border border-outline-variant/30 rounded-lg p-3 space-y-1 text-xs">
              <p className="font-semibold text-on-surface">
                Verified Student Records Attached to Context
              </p>
              <p className="text-on-surface-variant font-mono tabular-nums">
                Vault Notes:{" "}
                {selectedTutorTopic
                  ? `${countWords(selectedTutorTopic.notesMarkdown)} words`
                  : "0 words"}{" "}
                · Recorded Attempts: {tutorTopicAttempts.length}
              </p>
            </div>

            <button
              type="submit"
              disabled={isTutorRunning}
              className="w-full py-2.5 px-4 bg-primary text-on-primary text-xs font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity whitespace-nowrap shrink-0"
            >
              {isTutorRunning ? "Synthesizing Grounded Response..." : "Run Grounded Tutor"}
            </button>
          </form>

          {/* Right: Tutor Output with Strict Separation of AI Suggestion vs Verified Records */}
          <div className="lg:col-span-7 bg-surface-low border border-outline-variant/35 rounded-xl p-5 space-y-4">
            {!tutorResponse ? (
              <div className="py-16 text-center space-y-2">
                <BookOpen className="w-8 h-8 text-primary mx-auto opacity-75" />
                <p className="text-sm font-semibold text-on-surface">
                  Select a Mode &amp; Topic to Begin
                </p>
                <p className="text-xs text-on-surface-variant max-w-md mx-auto">
                  Generated explanations and quizzes are clearly separated from verified student records until you explicitly save them.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-outline-variant/25">
                  <div>
                    <p className="text-xs font-mono text-secondary">
                      AI Suggestion · Model: {tutorResponse.model}
                    </p>
                    <p className="text-xs text-on-surface-variant mt-0.5">
                      {tutorResponse.isGroundedInRecords
                        ? `Grounded in verified records: ${tutorResponse.groundingSources.join(" · ")}`
                        : "Disclosed: Zero prior notes or assessment records existed for this topic."}
                    </p>
                  </div>
                </div>

                <div className="bg-surface-lowest border border-outline-variant/30 rounded-lg p-4 text-xs text-on-surface whitespace-pre-wrap leading-relaxed font-sans max-h-[460px] overflow-y-auto">
                  {tutorResponse.markdown}
                </div>

                {/* Explicit Confirmation Actions */}
                <div className="flex flex-wrap items-center gap-2.5 pt-2">
                  {selectedTutorTopic && (
                    <button
                      type="button"
                      disabled={appendedToVault}
                      onClick={handleConfirmAppendTutorToNotes}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-surface-high text-on-surface text-xs font-semibold rounded-lg hover:bg-surface-bright disabled:opacity-50 whitespace-nowrap shrink-0"
                    >
                      {appendedToVault ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-tertiary" />
                          Appended to Vault Notes
                        </>
                      ) : (
                        <>
                          <FileText className="w-3.5 h-3.5 text-primary" />
                          Confirm &amp; Append to Topic Notes
                        </>
                      )}
                    </button>
                  )}

                  {selectedTutorTopic && tutorResponse.generatedQuiz && (
                    <button
                      type="button"
                      disabled={Boolean(savedQuizId)}
                      onClick={handleConfirmSaveTutorQuiz}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-primary text-on-primary text-xs font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 whitespace-nowrap shrink-0"
                    >
                      {savedQuizId ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          Saved to Question Bank
                        </>
                      ) : (
                        <>
                          Save Quiz ({tutorResponse.generatedQuiz.questions.length} Qs) to Question Bank
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
