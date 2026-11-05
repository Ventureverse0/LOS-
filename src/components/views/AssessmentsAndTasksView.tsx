import React, { useMemo, useState } from "react";
import {
  BookOpen,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Download,
  Edit3,
  FileWarning,
  Layers,
  Play,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useStudyOS } from "../../context/StudyOSContext";
import {
  buildDeterministicTopicQuiz,
  computeTopicMastery,
} from "../../lib/growthIntelligence";
import { getTodayDateString } from "../../lib/gamification";
import { runGroundedAITutor } from "../../services/aiService";
import type {
  AcademicTaskKind,
  AcademicTaskPriority,
  AcademicTaskStatus,
  Assessment,
  AssessmentDifficulty,
  AssessmentKind,
  AssessmentQuestion,
  ErrorCategory,
  QuestionAttemptResponse,
} from "../../types/studyOS";

type WorkspaceTab = "tasks" | "practice" | "history";

const ERROR_CATEGORY_OPTIONS: Array<{ id: ErrorCategory; label: string }> = [
  { id: "conceptual", label: "Conceptual" },
  { id: "calculation", label: "Calculation" },
  { id: "recall", label: "Recall" },
  { id: "careless", label: "Careless" },
  { id: "time_pressure", label: "Time Pressure" },
];

const TASK_KINDS: Array<{ id: AcademicTaskKind; label: string }> = [
  { id: "assignment", label: "Assignment" },
  { id: "homework", label: "Homework" },
  { id: "practical", label: "Practical" },
  { id: "project", label: "Project" },
  { id: "exam", label: "Examination" },
  { id: "revision", label: "Revision" },
];

const ASSESSMENT_KINDS: Array<{ id: AssessmentKind; label: string }> = [
  { id: "quiz", label: "Topic Quiz" },
  { id: "practice_set", label: "Practice Set" },
  { id: "mock_exam", label: "Mock Exam" },
  { id: "exam", label: "Graded Exam" },
  { id: "assignment_rubric", label: "Assignment Rubric" },
  { id: "delayed_recall", label: "Delayed Recall Check" },
];

function getDefaultDueDateIso(daysAhead: number = 3): string {
  return getTodayDateString(new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000));
}

export function AssessmentsAndTasksView() {
  const {
    state,
    selectedCourseId,
    selectedModuleId,
    openModuleInVault,
    createAcademicTask,
    updateAcademicTask,
    deleteAcademicTask,
    recoverMissedTask,
    createAssessment,
    deleteAssessment,
    recordAssessmentAttempt,
    correctAssessmentAttempt,
    deleteAssessmentAttempt,
    exportCalendarIcs,
    pushToast,
  } = useStudyOS();

  const activeCourses = useMemo(
    () => state.courses.filter((c) => !c.archived),
    [state.courses]
  );
  const activeModules = useMemo(
    () => state.modules.filter((m) => !m.archived),
    [state.modules]
  );

  const [activeTab, setActiveTab] = useState<WorkspaceTab>("tasks");

  // =========================================================================
  // TAB 1 STATE: TASKS, ASSIGNMENTS & EXAMINATIONS
  // =========================================================================
  const [taskTitle, setTaskTitle] = useState("");
  const [taskKind, setTaskKind] = useState<AcademicTaskKind>("assignment");
  const [taskPriority, setTaskPriority] = useState<AcademicTaskPriority>("high");
  const [taskDueDate, setTaskDueDate] = useState<string>(() => getDefaultDueDateIso(5));
  const [taskMinutes, setTaskMinutes] = useState<number>(60);
  const [taskCourseId, setTaskCourseId] = useState<string>(
    () => selectedCourseId || activeCourses[0]?.id || ""
  );
  const [taskModuleId, setTaskModuleId] = useState<string>("");
  const [taskExamChapters, setTaskExamChapters] = useState<string>("");
  const [taskFormError, setTaskFormError] = useState<string | null>(null);

  const [taskFilterKind, setTaskFilterKind] = useState<"all" | AcademicTaskKind>("all");
  const [taskFilterStatus, setTaskFilterStatus] = useState<
    "all" | "active" | "overdue" | "completed"
  >("all");
  const [taskFilterCourse, setTaskFilterCourse] = useState<string>("all");
  const [taskSearch, setTaskSearch] = useState<string>("");

  const [gradingTaskId, setGradingTaskId] = useState<string | null>(null);
  const [gradeEarned, setGradeEarned] = useState<string>("");
  const [gradeMax, setGradeMax] = useState<string>("100");
  const [gradeFeedback, setGradeFeedback] = useState<string>("");
  const [gradeLogAsAttempt, setGradeLogAsAttempt] = useState<boolean>(true);
  const [confirmDeleteTaskId, setConfirmDeleteTaskId] = useState<string | null>(null);

  // =========================================================================
  // TAB 2 STATE: PRACTICE & INTERACTIVE TOPIC QUIZZES
  // =========================================================================
  const [quizCourseId, setQuizCourseId] = useState<string>(
    () => selectedCourseId || activeCourses[0]?.id || ""
  );
  const courseTopics = useMemo(
    () => activeModules.filter((m) => !quizCourseId || m.courseId === quizCourseId),
    [activeModules, quizCourseId]
  );
  const [quizModuleId, setQuizModuleId] = useState<string>(
    () => selectedModuleId || courseTopics[0]?.id || ""
  );
  const [quizDifficulty, setQuizDifficulty] = useState<AssessmentDifficulty>("standard");
  const [isGeneratingAIQuiz, setIsGeneratingAIQuiz] = useState<boolean>(false);
  const [aiQuizDraft, setAiQuizDraft] = useState<{
    title: string;
    difficulty: AssessmentDifficulty;
    questions: AssessmentQuestion[];
    groundingSources: string[];
    model: string;
  } | null>(null);

  const [runningAssessment, setRunningAssessment] = useState<Assessment | null>(null);
  const [runnerAnswers, setRunnerAnswers] = useState<Record<string, string>>({});
  const [runnerErrorTags, setRunnerErrorTags] = useState<Record<string, ErrorCategory>>({});
  const [runnerConfidence, setRunnerConfidence] = useState<number>(3);
  const [runnerDelayedRecall, setRunnerDelayedRecall] = useState<boolean>(false);
  const [runnerReflection, setRunnerReflection] = useState<string>("");
  const [runnerGraded, setRunnerGraded] = useState<boolean>(false);
  const [runnerSubmitted, setRunnerSubmitted] = useState<boolean>(false);
  const [runnerStartedAtMs, setRunnerStartedAtMs] = useState<number>(Date.now());
  const [confirmDeleteAsmtId, setConfirmDeleteAsmtId] = useState<string | null>(null);

  // =========================================================================
  // TAB 3 STATE: MANUAL SCORE LOGGER & AUDITABLE ATTEMPT LEDGER
  // =========================================================================
  const [logCourseId, setLogCourseId] = useState<string>(
    () => selectedCourseId || activeCourses[0]?.id || ""
  );
  const [logModuleId, setLogModuleId] = useState<string>(
    () => selectedModuleId || ""
  );
  const [logTitle, setLogTitle] = useState<string>("");
  const [logKind, setLogKind] = useState<AssessmentKind>("quiz");
  const [logDifficulty, setLogDifficulty] = useState<AssessmentDifficulty>("standard");
  const [logScore, setLogScore] = useState<string>("8");
  const [logMaxScore, setLogMaxScore] = useState<string>("10");
  const [logConfidence, setLogConfidence] = useState<number>(3);
  const [logDelayedRecall, setLogDelayedRecall] = useState<boolean>(false);
  const [logErrors, setLogErrors] = useState<ErrorCategory[]>([]);
  const [logReflection, setLogReflection] = useState<string>("");
  const [logFormError, setLogFormError] = useState<string | null>(null);

  const [historyFilterCourse, setHistoryFilterCourse] = useState<string>("all");
  const [historyFilterKind, setHistoryFilterKind] = useState<"all" | AssessmentKind>("all");

  const [editingAttemptId, setEditingAttemptId] = useState<string | null>(null);
  const [editScore, setEditScore] = useState<string>("");
  const [editMaxScore, setEditMaxScore] = useState<string>("");
  const [editConfidence, setEditConfidence] = useState<number>(3);
  const [editReason, setEditReason] = useState<string>("");
  const [editErrorMsg, setEditErrorMsg] = useState<string | null>(null);

  const [deletingAttemptId, setDeletingAttemptId] = useState<string | null>(null);
  const [deleteReason, setDeleteReason] = useState<string>("");

  const todayYmd = getTodayDateString();

  const courseMap = useMemo(
    () => new Map(state.courses.map((c) => [c.id, c])),
    [state.courses]
  );
  const moduleMap = useMemo(
    () => new Map(state.modules.map((m) => [m.id, m])),
    [state.modules]
  );

  // Summary metrics
  const openTasksCount = useMemo(
    () =>
      state.tasks.filter(
        (t) => t.status !== "completed" && t.status !== "submitted"
      ).length,
    [state.tasks]
  );

  const overdueTasksCount = useMemo(
    () =>
      state.tasks.filter(
        (t) =>
          t.status !== "completed" &&
          t.status !== "submitted" &&
          Boolean(t.dueDate) &&
          t.dueDate.slice(0, 10) < todayYmd
      ).length,
    [state.tasks, todayYmd]
  );

  const upcomingExamsCount = useMemo(
    () =>
      state.tasks.filter(
        (t) =>
          t.kind === "exam" &&
          t.status !== "completed" &&
          t.status !== "submitted"
      ).length,
    [state.tasks]
  );

  const filteredTasks = useMemo(() => {
    const q = taskSearch.trim().toLowerCase();
    return state.tasks
      .filter((t) => {
        if (taskFilterKind !== "all" && t.kind !== taskFilterKind) return false;
        if (taskFilterCourse !== "all" && t.courseId !== taskFilterCourse) return false;
        const isOverdue =
          t.status !== "completed" &&
          t.status !== "submitted" &&
          Boolean(t.dueDate) &&
          t.dueDate.slice(0, 10) < todayYmd;
        if (taskFilterStatus === "active") {
          if (t.status === "completed" || t.status === "submitted") return false;
        } else if (taskFilterStatus === "overdue") {
          if (!isOverdue && t.status !== "missed") return false;
        } else if (taskFilterStatus === "completed") {
          if (t.status !== "completed" && t.status !== "submitted") return false;
        }
        if (q) {
          const courseCode = t.courseId ? courseMap.get(t.courseId)?.code || "" : "";
          const modTitle = t.moduleId ? moduleMap.get(t.moduleId)?.title || "" : "";
          const hay = `${t.title} ${courseCode} ${modTitle} ${(t.examChapters || []).join(" ")}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .slice()
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [
    state.tasks,
    taskFilterKind,
    taskFilterCourse,
    taskFilterStatus,
    taskSearch,
    todayYmd,
    courseMap,
    moduleMap,
  ]);

  const selectedTopicForQuiz = useMemo(() => {
    if (quizModuleId && moduleMap.get(quizModuleId)) {
      return moduleMap.get(quizModuleId)!;
    }
    return courseTopics[0] || null;
  }, [quizModuleId, moduleMap, courseTopics]);

  const selectedTopicMastery = useMemo(() => {
    if (!selectedTopicForQuiz) return null;
    return computeTopicMastery(selectedTopicForQuiz.id, state);
  }, [selectedTopicForQuiz, state]);

  const savedAssessments = useMemo(() => {
    return state.assessments.filter((a) => {
      if (quizCourseId && a.courseId !== quizCourseId) return false;
      if (selectedTopicForQuiz && a.moduleId && a.moduleId !== selectedTopicForQuiz.id) {
        return false;
      }
      return true;
    });
  }, [state.assessments, quizCourseId, selectedTopicForQuiz]);

  const filteredAttempts = useMemo(() => {
    return state.assessmentAttempts
      .filter((att) => {
        if (historyFilterCourse !== "all" && att.courseId !== historyFilterCourse) {
          return false;
        }
        if (historyFilterKind !== "all" && att.kind !== historyFilterKind) {
          return false;
        }
        return true;
      })
      .slice()
      .sort((a, b) => Date.parse(b.attemptedAt) - Date.parse(a.attemptedAt));
  }, [state.assessmentAttempts, historyFilterCourse, historyFilterKind]);

  // Handlers
  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    setTaskFormError(null);
    const chapters = taskExamChapters
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const res = createAcademicTask({
      title: taskTitle,
      kind: taskKind,
      priority: taskPriority,
      dueDate: taskDueDate,
      estimatedMinutes: Number(taskMinutes) || 45,
      courseId: taskCourseId || undefined,
      moduleId: taskModuleId || undefined,
      examChapters: chapters.length > 0 ? chapters : undefined,
    });

    if (!res.ok) {
      setTaskFormError(res.error || "Invalid task input.");
      return;
    }
    setTaskTitle("");
    setTaskExamChapters("");
  };

  const handleSaveTaskGrade = (taskId: string) => {
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task) return;
    const earned = Number(gradeEarned);
    const max = Number(gradeMax);
    if (!Number.isFinite(earned) || !Number.isFinite(max) || max <= 0 || earned < 0 || earned > max) {
      pushToast({
        title: "Invalid Marks",
        subtitle: "Ensure score is between 0 and maximum marks.",
        variant: "error",
      });
      return;
    }

    updateAcademicTask(taskId, {
      scoreEarned: earned,
      scoreMax: max,
      feedbackNotes: gradeFeedback.trim() || undefined,
      status: "completed",
      completedAt: new Date().toISOString(),
    });

    if (gradeLogAsAttempt && task.courseId) {
      recordAssessmentAttempt({
        courseId: task.courseId,
        moduleId: task.moduleId,
        title: task.title,
        kind: task.kind === "exam" ? "exam" : "assignment_rubric",
        difficulty: task.kind === "exam" ? "rigorous" : "standard",
        score: earned,
        maxScore: max,
        selfConfidence: 3,
        errorCategories: [],
        reflection: gradeFeedback.trim() || undefined,
      });
    }

    setGradingTaskId(null);
    setGradeEarned("");
    setGradeFeedback("");
  };

  const startAssessmentRunner = (asmt: Assessment) => {
    setRunningAssessment(asmt);
    setRunnerAnswers({});
    setRunnerErrorTags({});
    setRunnerConfidence(3);
    setRunnerDelayedRecall(false);
    setRunnerReflection("");
    setRunnerGraded(false);
    setRunnerSubmitted(false);
    setRunnerStartedAtMs(Date.now());
  };

  const handleGenerateNotesQuiz = () => {
    if (!selectedTopicForQuiz) {
      pushToast({
        title: "Select a Syllabus Topic",
        subtitle: "Create or pick a course topic before generating a quiz.",
        variant: "warning",
      });
      return;
    }
    const course = courseMap.get(selectedTopicForQuiz.courseId);
    const built = buildDeterministicTopicQuiz(
      selectedTopicForQuiz,
      course?.title || "Course",
      quizDifficulty
    );
    const saved = createAssessment(built);
    startAssessmentRunner(saved);
  };

  const handleGenerateAIQuizPreview = async () => {
    if (!selectedTopicForQuiz) return;
    setIsGeneratingAIQuiz(true);
    setAiQuizDraft(null);
    try {
      const course = courseMap.get(selectedTopicForQuiz.courseId);
      const historyForTopic = state.assessmentAttempts
        .filter((a) => a.moduleId === selectedTopicForQuiz.id)
        .slice(-4)
        .map((a) => ({
          title: a.title,
          percentage: a.percentage,
          attemptedAt: a.attemptedAt,
          errorCategories: a.errorCategories,
        }));

      const res = await runGroundedAITutor({
        mode: "generate_quiz",
        topicTitle: selectedTopicForQuiz.title,
        courseTitle: course?.title,
        notesMarkdown: selectedTopicForQuiz.notesMarkdown,
        attemptHistory: historyForTopic,
        difficulty: quizDifficulty,
        model: state.settings.selectedModel,
      });

      if (res.generatedQuiz && res.generatedQuiz.questions.length > 0) {
        setAiQuizDraft({
          title: res.generatedQuiz.title,
          difficulty: res.generatedQuiz.difficulty || quizDifficulty,
          questions: res.generatedQuiz.questions,
          groundingSources: res.groundingSources,
          model: res.model,
        });
      } else {
        const built = buildDeterministicTopicQuiz(
          selectedTopicForQuiz,
          course?.title || "Course",
          quizDifficulty
        );
        setAiQuizDraft({
          title: built.title,
          difficulty: built.difficulty,
          questions: built.questions,
          groundingSources: ["Topic Notes & Concepts"],
          model: "notes-derived-fallback",
        });
      }
    } finally {
      setIsGeneratingAIQuiz(false);
    }
  };

  const handleConfirmAndLaunchAIQuiz = () => {
    if (!aiQuizDraft || !selectedTopicForQuiz) return;
    const saved = createAssessment({
      courseId: selectedTopicForQuiz.courseId,
      moduleId: selectedTopicForQuiz.id,
      title: aiQuizDraft.title,
      kind: "quiz",
      difficulty: aiQuizDraft.difficulty,
      maxScore: aiQuizDraft.questions.length,
      questions: aiQuizDraft.questions,
      source: "ai_generated",
    });
    setAiQuizDraft(null);
    startAssessmentRunner(saved);
  };

  const runnerEvaluation = useMemo(() => {
    if (!runningAssessment) return null;
    const responses: QuestionAttemptResponse[] = runningAssessment.questions.map((q) => {
      const studentAns = (runnerAnswers[q.id] || "").trim();
      const isCorrect =
        studentAns.toLowerCase() === q.correctAnswer.trim().toLowerCase();
      return {
        questionId: q.id,
        prompt: q.prompt,
        studentAnswer: studentAns || "(No answer selected)",
        correctAnswer: q.correctAnswer,
        isCorrect,
        errorCategory: !isCorrect ? runnerErrorTags[q.id] || "conceptual" : undefined,
      };
    });
    const correctCount = responses.filter((r) => r.isCorrect).length;
    const maxScore = runningAssessment.questions.length || 1;
    const pct = Math.round((correctCount / maxScore) * 1000) / 10;
    return { responses, correctCount, maxScore, pct };
  }, [runningAssessment, runnerAnswers, runnerErrorTags]);

  const handleRecordRunnerAttempt = () => {
    if (!runningAssessment || !runnerEvaluation || runnerSubmitted) return;
    const collectedErrors = Array.from(
      new Set(
        runnerEvaluation.responses
          .filter((r) => !r.isCorrect && r.errorCategory)
          .map((r) => r.errorCategory!)
      )
    );
    const elapsedMins = Math.max(
      1,
      Math.round((Date.now() - runnerStartedAtMs) / 60000)
    );

    const res = recordAssessmentAttempt({
      assessmentId: runningAssessment.id,
      courseId: runningAssessment.courseId,
      moduleId: runningAssessment.moduleId,
      title: runningAssessment.title,
      kind: runnerDelayedRecall ? "delayed_recall" : runningAssessment.kind,
      difficulty: runningAssessment.difficulty,
      score: runnerEvaluation.correctCount,
      maxScore: runnerEvaluation.maxScore,
      selfConfidence: runnerConfidence,
      durationMinutes: elapsedMins,
      errorCategories: collectedErrors,
      isDelayedRecall: runnerDelayedRecall,
      questionResponses: runnerEvaluation.responses,
      reflection: runnerReflection.trim() || undefined,
    });

    if (res.ok) {
      setRunnerSubmitted(true);
    }
  };

  const toggleManualErrorCat = (cat: ErrorCategory) => {
    setLogErrors((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const handleManualAttemptSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLogFormError(null);
    if (!logCourseId) {
      setLogFormError("Select a course to associate this assessment record.");
      return;
    }
    const mod = logModuleId ? moduleMap.get(logModuleId) : undefined;
    const resolvedTitle =
      logTitle.trim() ||
      (mod ? `${mod.title} — ${logKind.replace(/_/g, " ")}` : "Recorded Assessment");

    const res = recordAssessmentAttempt({
      courseId: logCourseId,
      moduleId: logModuleId || undefined,
      title: resolvedTitle,
      kind: logDelayedRecall ? "delayed_recall" : logKind,
      difficulty: logDifficulty,
      score: Number(logScore),
      maxScore: Number(logMaxScore),
      selfConfidence: logConfidence,
      errorCategories: logErrors,
      isDelayedRecall: logDelayedRecall,
      reflection: logReflection.trim() || undefined,
    });

    if (!res.ok) {
      setLogFormError(res.error || "Could not record assessment attempt.");
      return;
    }

    setLogTitle("");
    setLogReflection("");
    setLogErrors([]);
  };

  const handleSaveCorrection = (attemptId: string) => {
    setEditErrorMsg(null);
    const res = correctAssessmentAttempt(
      attemptId,
      {
        score: Number(editScore),
        maxScore: Number(editMaxScore),
        selfConfidence: editConfidence,
      },
      editReason
    );
    if (!res.ok) {
      setEditErrorMsg(res.error || "Correction failed.");
      return;
    }
    setEditingAttemptId(null);
    setEditReason("");
  };

  const handleConfirmDeleteAttempt = (attemptId: string) => {
    deleteAssessmentAttempt(
      attemptId,
      deleteReason.trim() || "Removed duplicate or erroneous entry"
    );
    setDeletingAttemptId(null);
    setDeleteReason("");
  };

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      {/* Workspace Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-outline-variant/30 pb-5">
        <div>
          <p className="text-xs font-mono text-on-surface-variant tracking-wide">
            Academic Execution · Practice · Empirical Assessment
          </p>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-on-surface mt-1">
            Tasks, Exams &amp; Practice Ledger
          </h1>
          <p className="text-sm text-on-surface-variant mt-1 max-w-2xl">
            Manage dated assignments and exams, run grounded topic quizzes, and log append-only assessment attempts that drive verified topic mastery.
          </p>
        </div>

        {/* Interactive Segmented Tab Control */}
        <div className="flex items-center gap-1 p-1 bg-surface-low border border-outline-variant/35 rounded-lg self-start md:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab("tasks")}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === "tasks"
                ? "bg-primary text-on-primary"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            Tasks &amp; Exams ({openTasksCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("practice")}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === "practice"
                ? "bg-primary text-on-primary"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            Topic Quizzes &amp; Practice
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`px-3.5 py-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
              activeTab === "history"
                ? "bg-primary text-on-primary"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            Score Logger &amp; Ledger ({state.assessmentAttempts.length})
          </button>
        </div>
      </div>

      {/* Summary KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface-low border border-outline-variant/35 rounded-xl p-4">
          <p className="text-xs text-on-surface-variant">Open Tasks &amp; Coursework</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-on-surface mt-1">
            {openTasksCount}
          </p>
          <p className="text-xs text-on-surface-variant mt-1">
            {state.tasks.filter((t) => t.status === "completed" || t.status === "submitted").length} completed total
          </p>
        </div>

        <div className="bg-surface-low border border-outline-variant/35 rounded-xl p-4">
          <p className="text-xs text-on-surface-variant">Overdue &amp; Recovery Queue</p>
          <p
            className={`text-2xl font-bold font-mono tabular-nums mt-1 ${
              overdueTasksCount > 0 ? "text-error" : "text-tertiary"
            }`}
          >
            {overdueTasksCount}
          </p>
          <p className="text-xs text-on-surface-variant mt-1">
            {overdueTasksCount > 0
              ? "Action needed: schedule recovery blocks"
              : "Zero overdue assignments"}
          </p>
        </div>

        <div className="bg-surface-low border border-outline-variant/35 rounded-xl p-4">
          <p className="text-xs text-on-surface-variant">Scheduled Examinations</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-secondary mt-1">
            {upcomingExamsCount}
          </p>
          <p className="text-xs text-on-surface-variant mt-1">
            Tracked in exam timetable
          </p>
        </div>

        <div className="bg-surface-low border border-outline-variant/35 rounded-xl p-4">
          <p className="text-xs text-on-surface-variant">Recorded Assessment Attempts</p>
          <p className="text-2xl font-bold font-mono tabular-nums text-primary mt-1">
            {state.assessmentAttempts.length}
          </p>
          <p className="text-xs text-on-surface-variant mt-1">
            Append-only mastery evidence
          </p>
        </div>
      </div>

      {/* =====================================================================
          TAB 1: TASKS, ASSIGNMENTS & EXAM TIMETABLE
         ===================================================================== */}
      {activeTab === "tasks" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Create Academic Task / Exam Form */}
          <form
            onSubmit={handleAddTask}
            className="lg:col-span-4 bg-surface-low border border-outline-variant/35 rounded-xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-on-surface">
                Add Assignment or Exam
              </h2>
              <Calendar className="w-4 h-4 text-primary" />
            </div>

            {taskFormError && (
              <p className="text-xs text-error bg-error-container/25 border border-error/40 rounded-lg px-3 py-2">
                {taskFormError}
              </p>
            )}

            <div>
              <label className="block text-xs text-on-surface-variant mb-1">
                Title *
              </label>
              <input
                type="text"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="e.g., Midterm Exam: Linear Operators & ODEs"
                className="w-full bg-surface-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-on-surface-variant mb-1">
                  Record Type
                </label>
                <select
                  value={taskKind}
                  onChange={(e) => setTaskKind(e.target.value as AcademicTaskKind)}
                  className="w-full bg-surface-lowest border border-outline-variant/40 rounded-lg px-2.5 py-2 text-xs text-on-surface focus:outline-none focus:border-primary"
                >
                  {TASK_KINDS.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-on-surface-variant mb-1">
                  Priority
                </label>
                <select
                  value={taskPriority}
                  onChange={(e) =>
                    setTaskPriority(e.target.value as AcademicTaskPriority)
                  }
                  className="w-full bg-surface-lowest border border-outline-variant/40 rounded-lg px-2.5 py-2 text-xs text-on-surface focus:outline-none focus:border-primary"
                >
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-on-surface-variant mb-1">
                  Due Date *
                </label>
                <input
                  type="date"
                  value={taskDueDate}
                  onChange={(e) => setTaskDueDate(e.target.value)}
                  className="w-full bg-surface-lowest border border-outline-variant/40 rounded-lg px-2.5 py-2 text-xs font-mono tabular-nums text-on-surface focus:outline-none focus:border-primary"
                  required
                />
              </div>

              <div>
                <label className="block text-xs text-on-surface-variant mb-1">
                  Effort Estimate (min)
                </label>
                <input
                  type="number"
                  min={5}
                  max={1440}
                  value={taskMinutes}
                  onChange={(e) => setTaskMinutes(Number(e.target.value))}
                  className="w-full bg-surface-lowest border border-outline-variant/40 rounded-lg px-2.5 py-2 text-xs font-mono tabular-nums text-on-surface focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-on-surface-variant mb-1">
                Subject / Course (Optional)
              </label>
              <select
                value={taskCourseId}
                onChange={(e) => {
                  setTaskCourseId(e.target.value);
                  setTaskModuleId("");
                }}
                className="w-full bg-surface-lowest border border-outline-variant/40 rounded-lg px-2.5 py-2 text-xs text-on-surface focus:outline-none focus:border-primary"
              >
                <option value="">General / Unlinked</option>
                {activeCourses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.title}
                  </option>
                ))}
              </select>
            </div>

            {taskCourseId && (
              <div>
                <label className="block text-xs text-on-surface-variant mb-1">
                  Linked Syllabus Topic (Optional)
                </label>
                <select
                  value={taskModuleId}
                  onChange={(e) => setTaskModuleId(e.target.value)}
                  className="w-full bg-surface-lowest border border-outline-variant/40 rounded-lg px-2.5 py-2 text-xs text-on-surface focus:outline-none focus:border-primary"
                >
                  <option value="">Entire Course</option>
                  {activeModules
                    .filter((m) => m.courseId === taskCourseId)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title}
                      </option>
                    ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs text-on-surface-variant mb-1">
                Chapters / Syllabus Scope (comma-separated, optional)
              </label>
              <input
                type="text"
                value={taskExamChapters}
                onChange={(e) => setTaskExamChapters(e.target.value)}
                placeholder="Ch 1: Eigenvalues, Ch 2: Stability"
                className="w-full bg-surface-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-xs text-on-surface focus:outline-none focus:border-primary"
              />
            </div>

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-primary text-on-primary text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              Save Academic Record
            </button>
          </form>

          {/* Right: Filterable Task & Examination Ledger */}
          <div className="lg:col-span-8 bg-surface-low border border-outline-variant/35 rounded-xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-outline-variant/25">
              <div className="flex flex-wrap items-center gap-1 bg-surface-lowest p-1 rounded-lg border border-outline-variant/30">
                {(["all", "active", "overdue", "completed"] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setTaskFilterStatus(st)}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                      taskFilterStatus === st
                        ? "bg-surface-high text-on-surface"
                        : "text-on-surface-variant hover:text-on-surface"
                    }`}
                  >
                    {st.charAt(0).toUpperCase() + st.slice(1)}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={taskFilterKind}
                  onChange={(e) =>
                    setTaskFilterKind(e.target.value as "all" | AcademicTaskKind)
                  }
                  className="bg-surface-lowest border border-outline-variant/40 rounded-lg px-2.5 py-1.5 text-xs text-on-surface"
                >
                  <option value="all">All Types</option>
                  {TASK_KINDS.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </select>

                <select
                  value={taskFilterCourse}
                  onChange={(e) => setTaskFilterCourse(e.target.value)}
                  className="bg-surface-lowest border border-outline-variant/40 rounded-lg px-2.5 py-1.5 text-xs text-on-surface"
                >
                  <option value="all">All Courses</option>
                  {activeCourses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code}
                    </option>
                  ))}
                </select>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-on-surface-variant absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={taskSearch}
                    onChange={(e) => setTaskSearch(e.target.value)}
                    placeholder="Filter tasks..."
                    className="bg-surface-lowest border border-outline-variant/40 rounded-lg pl-8 pr-3 py-1.5 text-xs text-on-surface w-36 focus:outline-none focus:border-primary"
                  />
                </div>

                <button
                  type="button"
                  onClick={exportCalendarIcs}
                  title="Export deadlines & scheduled study blocks as RFC 5545 iCalendar (.ics)"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-surface-high hover:bg-surface-bright border border-outline-variant/40 text-xs font-mono text-on-surface cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Download className="w-3.5 h-3.5 text-primary" />
                  <span>Export .ICS</span>
                </button>
              </div>
            </div>

            {filteredTasks.length === 0 ? (
              <div className="py-12 text-center space-y-2">
                <p className="text-sm font-medium text-on-surface">
                  No assignments, practicals, or exams match this filter.
                </p>
                <p className="text-xs text-on-surface-variant max-w-md mx-auto">
                  Add upcoming coursework deadlines or exam dates on the left so StudyOS can plan revision blocks and detect overdue work early.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-outline-variant/25">
                {filteredTasks.map((task) => {
                  const course = task.courseId ? courseMap.get(task.courseId) : undefined;
                  const mod = task.moduleId ? moduleMap.get(task.moduleId) : undefined;
                  const isOverdue =
                    task.status !== "completed" &&
                    task.status !== "submitted" &&
                    Boolean(task.dueDate) &&
                    task.dueDate.slice(0, 10) < todayYmd;

                  return (
                    <div key={task.id} className="py-3.5 space-y-2.5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-on-surface">
                              {task.title}
                            </span>
                            {isOverdue && (
                              <span className="text-xs font-medium text-error">
                                · Overdue
                              </span>
                            )}
                          </div>

                          {/* Clean Zero-Pill Metadata Line */}
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-on-surface-variant font-mono tabular-nums">
                            <span className="capitalize">{task.kind}</span>
                            <span aria-hidden="true">·</span>
                            <span>Due {task.dueDate}</span>
                            <span aria-hidden="true">·</span>
                            <span className="capitalize">{task.priority} priority</span>
                            <span aria-hidden="true">·</span>
                            <span>{task.estimatedMinutes}m est</span>
                            {course && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="text-primary">{course.code}</span>
                              </>
                            )}
                            {mod && (
                              <>
                                <span aria-hidden="true">·</span>
                                <button
                                  type="button"
                                  onClick={() => openModuleInVault(mod.id)}
                                  className="underline hover:text-on-surface"
                                >
                                  {mod.title}
                                </button>
                              </>
                            )}
                          </div>

                          {task.examChapters && task.examChapters.length > 0 && (
                            <p className="text-xs text-on-surface-variant">
                              Scope: {task.examChapters.join(" · ")}
                            </p>
                          )}

                          {typeof task.scoreEarned === "number" &&
                            typeof task.scoreMax === "number" && (
                              <p className="text-xs text-tertiary font-mono tabular-nums">
                                Recorded Result: {task.scoreEarned}/{task.scoreMax} (
                                {Math.round((task.scoreEarned / task.scoreMax) * 100)}%)
                                {task.feedbackNotes ? ` · ${task.feedbackNotes}` : ""}
                              </p>
                            )}

                          {task.recoveryPlanNote && (
                            <p className="text-xs text-secondary">
                              Recovery Plan: {task.recoveryPlanNote}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                          {task.status !== "completed" && task.status !== "submitted" && (
                            <input
                              type="date"
                              aria-label="Reschedule due date"
                              title="Reschedule deadline (automatically adjusts Today's Study Plan)"
                              value={task.dueDate.slice(0, 10)}
                              onChange={(e) => {
                                if (e.target.value) {
                                  updateAcademicTask(task.id, { dueDate: e.target.value });
                                }
                              }}
                              className="bg-surface-lowest border border-outline-variant/40 rounded-lg px-2 py-1.5 text-xs font-mono tabular-nums text-on-surface focus:outline-none focus:border-primary"
                            />
                          )}

                          <select
                            value={task.status}
                            onChange={(e) => {
                              const nextSt = e.target.value as AcademicTaskStatus;
                              updateAcademicTask(task.id, {
                                status: nextSt,
                                completedAt:
                                  nextSt === "completed" || nextSt === "submitted"
                                    ? new Date().toISOString()
                                    : null,
                              });
                            }}
                            className="bg-surface-lowest border border-outline-variant/40 rounded-lg px-2.5 py-1.5 text-xs text-on-surface"
                          >
                            <option value="todo">To Do</option>
                            <option value="in_progress">In Progress</option>
                            <option value="submitted">Submitted</option>
                            <option value="completed">Completed</option>
                            <option value="missed">Missed</option>
                          </select>

                          {(isOverdue || task.status === "missed") && (
                            <button
                              type="button"
                              onClick={() => recoverMissedTask(task.id)}
                              className="px-2.5 py-1.5 text-xs font-medium bg-secondary/15 text-secondary border border-secondary/40 rounded-lg hover:bg-secondary/25 transition-colors whitespace-nowrap shrink-0"
                            >
                              Schedule Recovery Block
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              setGradingTaskId(
                                gradingTaskId === task.id ? null : task.id
                              );
                              setGradeEarned(
                                task.scoreEarned !== undefined
                                  ? String(task.scoreEarned)
                                  : ""
                              );
                              setGradeMax(
                                task.scoreMax !== undefined
                                  ? String(task.scoreMax)
                                  : "100"
                              );
                              setGradeFeedback(task.feedbackNotes || "");
                            }}
                            className="px-2.5 py-1.5 text-xs font-medium bg-surface-high text-on-surface rounded-lg hover:bg-surface-bright transition-colors whitespace-nowrap shrink-0"
                          >
                            Marks &amp; Feedback
                          </button>

                          {confirmDeleteTaskId === task.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  deleteAcademicTask(task.id);
                                  setConfirmDeleteTaskId(null);
                                }}
                                className="px-2 py-1 text-xs font-medium bg-error text-on-primary rounded whitespace-nowrap shrink-0"
                              >
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteTaskId(null)}
                                className="px-2 py-1 text-xs text-on-surface-variant hover:text-on-surface whitespace-nowrap shrink-0"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteTaskId(task.id)}
                              aria-label="Delete task"
                              className="p-1.5 text-on-surface-variant hover:text-error transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {gradingTaskId === task.id && (
                        <div className="bg-surface-lowest border border-outline-variant/35 rounded-lg p-3.5 space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs text-on-surface-variant mb-1">
                                Marks Earned
                              </label>
                              <input
                                type="number"
                                step="0.5"
                                value={gradeEarned}
                                onChange={(e) => setGradeEarned(e.target.value)}
                                placeholder="86"
                                className="w-full bg-surface-low border border-outline-variant/40 rounded px-2.5 py-1.5 text-xs font-mono tabular-nums text-on-surface"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-on-surface-variant mb-1">
                                Maximum Marks
                              </label>
                              <input
                                type="number"
                                step="0.5"
                                value={gradeMax}
                                onChange={(e) => setGradeMax(e.target.value)}
                                className="w-full bg-surface-low border border-outline-variant/40 rounded px-2.5 py-1.5 text-xs font-mono tabular-nums text-on-surface"
                              />
                            </div>
                            <div className="flex items-end">
                              <label className="flex items-center gap-2 text-xs text-on-surface-variant cursor-pointer pb-1.5">
                                <input
                                  type="checkbox"
                                  checked={gradeLogAsAttempt}
                                  onChange={(e) => setGradeLogAsAttempt(e.target.checked)}
                                />
                                Append to Mastery Ledger
                              </label>
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs text-on-surface-variant mb-1">
                              Instructor / Self Feedback
                            </label>
                            <input
                              type="text"
                              value={gradeFeedback}
                              onChange={(e) => setGradeFeedback(e.target.value)}
                              placeholder="Missed boundary check on Q4; strong derivation on Q1–Q3."
                              className="w-full bg-surface-low border border-outline-variant/40 rounded px-2.5 py-1.5 text-xs text-on-surface"
                            />
                          </div>
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setGradingTaskId(null)}
                              className="px-3 py-1.5 text-xs text-on-surface-variant hover:text-on-surface"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveTaskGrade(task.id)}
                              className="px-3 py-1.5 text-xs font-semibold bg-primary text-on-primary rounded-lg whitespace-nowrap shrink-0"
                            >
                              Save Marks
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 2: PRACTICE & INTERACTIVE TOPIC QUIZZES
         ===================================================================== */}
      {activeTab === "practice" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Topic & Question Bank Selector */}
          <div className="lg:col-span-5 bg-surface-low border border-outline-variant/35 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-on-surface">
                Topic Practice Generator
              </h2>
              <Layers className="w-4 h-4 text-primary" />
            </div>

            {activeCourses.length === 0 ? (
              <p className="text-xs text-on-surface-variant">
                No active courses exist yet. Create a course or synthesize a curriculum first to generate topic quizzes.
              </p>
            ) : (
              <>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-on-surface-variant mb-1">
                      Subject / Course
                    </label>
                    <select
                      value={quizCourseId}
                      onChange={(e) => {
                        const nextCourse = e.target.value;
                        setQuizCourseId(nextCourse);
                        const firstMod = activeModules.find(
                          (m) => m.courseId === nextCourse
                        );
                        setQuizModuleId(firstMod?.id || "");
                      }}
                      className="w-full bg-surface-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-xs text-on-surface"
                    >
                      {activeCourses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code} · {c.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-on-surface-variant mb-1">
                      Syllabus Topic
                    </label>
                    <select
                      value={selectedTopicForQuiz?.id || ""}
                      onChange={(e) => setQuizModuleId(e.target.value)}
                      className="w-full bg-surface-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-xs text-on-surface"
                    >
                      {courseTopics.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-on-surface-variant mb-1">
                      Target Difficulty
                    </label>
                    <div className="flex items-center gap-1 bg-surface-lowest p-1 rounded-lg border border-outline-variant/35">
                      {(["foundational", "standard", "rigorous"] as const).map((diff) => (
                        <button
                          key={diff}
                          type="button"
                          onClick={() => setQuizDifficulty(diff)}
                          className={`flex-1 py-1.5 px-2 text-xs font-medium rounded capitalize transition-colors whitespace-nowrap shrink-0 ${
                            quizDifficulty === diff
                              ? "bg-surface-high text-on-surface"
                              : "text-on-surface-variant hover:text-on-surface"
                          }`}
                        >
                          {diff}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {selectedTopicMastery && (
                  <div className="bg-surface-lowest border border-outline-variant/30 rounded-lg p-3.5 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-on-surface-variant">
                        Current Evidence Status
                      </span>
                      <span
                        className={`font-semibold font-mono tabular-nums ${
                          selectedTopicMastery.level === "insufficient_evidence"
                            ? "text-on-surface-variant"
                            : selectedTopicMastery.level === "verified_mastery"
                            ? "text-tertiary"
                            : "text-primary"
                        }`}
                      >
                        {selectedTopicMastery.label}
                      </span>
                    </div>
                    <p className="text-xs text-on-surface-variant">
                      {selectedTopicMastery.explanation}
                    </p>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={handleGenerateNotesQuiz}
                    disabled={!selectedTopicForQuiz}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 bg-primary text-on-primary text-xs font-semibold rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity whitespace-nowrap shrink-0"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Start Notes Quiz
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleGenerateAIQuizPreview()}
                    disabled={!selectedTopicForQuiz || isGeneratingAIQuiz}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 bg-surface-high text-on-surface border border-outline-variant/40 text-xs font-semibold rounded-lg hover:bg-surface-bright disabled:opacity-40 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                    {isGeneratingAIQuiz ? "Generating..." : "AI Grounded Quiz"}
                  </button>
                </div>

                {/* Explicit Confirmation Card for AI-Generated Suggestions */}
                {aiQuizDraft && (
                  <div className="bg-surface-lowest border border-primary/40 rounded-lg p-4 space-y-3">
                    <div className="space-y-1">
                      <p className="text-xs font-mono text-primary">
                        AI Suggestion · Requires Confirmation Before Saving
                      </p>
                      <p className="text-sm font-semibold text-on-surface">
                        {aiQuizDraft.title} ({aiQuizDraft.questions.length} questions)
                      </p>
                      <p className="text-xs text-on-surface-variant">
                        Grounded in:{" "}
                        {aiQuizDraft.groundingSources.length > 0
                          ? aiQuizDraft.groundingSources.join(" · ")
                          : "Topic title (no prior notes/attempts found)"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleConfirmAndLaunchAIQuiz}
                        className="px-3 py-1.5 bg-primary text-on-primary text-xs font-semibold rounded-lg whitespace-nowrap shrink-0"
                      >
                        Confirm &amp; Launch Quiz
                      </button>
                      <button
                        type="button"
                        onClick={() => setAiQuizDraft(null)}
                        className="px-3 py-1.5 text-xs text-on-surface-variant hover:text-on-surface whitespace-nowrap shrink-0"
                      >
                        Discard Suggestion
                      </button>
                    </div>
                  </div>
                )}

                {/* Saved Question Banks */}
                <div className="pt-3 border-t border-outline-variant/25 space-y-2">
                  <p className="text-xs font-semibold text-on-surface">
                    Saved Question Sets ({savedAssessments.length})
                  </p>
                  {savedAssessments.length === 0 ? (
                    <p className="text-xs text-on-surface-variant">
                      Generated quizzes are stored here for repeated and delayed-recall testing.
                    </p>
                  ) : (
                    <div className="divide-y divide-outline-variant/20">
                      {savedAssessments.slice(0, 6).map((asmt) => (
                        <div
                          key={asmt.id}
                          className="py-2.5 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-on-surface truncate">
                              {asmt.title}
                            </p>
                            <p className="text-[11px] text-on-surface-variant font-mono tabular-nums">
                              {asmt.questions.length} Qs · {asmt.difficulty} ·{" "}
                              {asmt.source.replace(/_/g, " ")}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => startAssessmentRunner(asmt)}
                              className="px-2.5 py-1 text-xs font-medium bg-surface-high text-on-surface rounded hover:bg-surface-bright whitespace-nowrap shrink-0"
                            >
                              Practice
                            </button>
                            {confirmDeleteAsmtId === asmt.id ? (
                              <button
                                type="button"
                                onClick={() => {
                                  deleteAssessment(asmt.id);
                                  setConfirmDeleteAsmtId(null);
                                }}
                                className="px-2 py-1 text-xs bg-error text-on-primary rounded whitespace-nowrap shrink-0"
                              >
                                Delete
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteAsmtId(asmt.id)}
                                className="p-1 text-on-surface-variant hover:text-error"
                                aria-label="Delete saved quiz"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Right Column: Interactive Quiz Runner */}
          <div className="lg:col-span-7 bg-surface-low border border-outline-variant/35 rounded-xl p-5 space-y-5">
            {!runningAssessment ? (
              <div className="py-16 text-center space-y-3">
                <ClipboardCheck className="w-8 h-8 text-primary mx-auto opacity-80" />
                <h3 className="text-base font-semibold text-on-surface">
                  Ready for Active Retrieval Practice
                </h3>
                <p className="text-xs text-on-surface-variant max-w-md mx-auto">
                  Select a syllabus topic on the left and launch a Notes Quiz or Grounded AI Quiz. Remember: self-reported confidence is tracked for calibration, while empirical quiz accuracy drives mastery.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-outline-variant/25">
                  <div>
                    <p className="text-xs font-mono text-on-surface-variant">
                      {runningAssessment.difficulty} · {runningAssessment.questions.length} Questions
                    </p>
                    <h3 className="text-base font-semibold text-on-surface">
                      {runningAssessment.title}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRunningAssessment(null)}
                    className="text-xs text-on-surface-variant hover:text-on-surface self-start sm:self-auto whitespace-nowrap shrink-0"
                  >
                    Close Runner
                  </button>
                </div>

                {/* Questions */}
                <div className="space-y-5">
                  {runningAssessment.questions.map((q, idx) => {
                    const selectedAns = runnerAnswers[q.id] || "";
                    const evalItem = runnerEvaluation?.responses[idx];

                    return (
                      <div
                        key={q.id}
                        className="bg-surface-lowest border border-outline-variant/30 rounded-lg p-4 space-y-3"
                      >
                        <p className="text-sm font-medium text-on-surface">
                          <span className="font-mono tabular-nums text-primary mr-2">
                            Q{idx + 1}.
                          </span>
                          {q.prompt}
                        </p>

                        {q.options && q.options.length > 0 ? (
                          <div className="space-y-2">
                            {q.options.map((opt) => {
                              const isChosen = selectedAns === opt;
                              const isRightOpt =
                                runnerGraded &&
                                opt.trim().toLowerCase() ===
                                  q.correctAnswer.trim().toLowerCase();
                              const isWrongChosen =
                                runnerGraded && isChosen && !isRightOpt;

                              return (
                                <button
                                  key={opt}
                                  type="button"
                                  disabled={runnerGraded}
                                  onClick={() =>
                                    setRunnerAnswers((prev) => ({
                                      ...prev,
                                      [q.id]: opt,
                                    }))
                                  }
                                  className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                                    isRightOpt
                                      ? "border-tertiary bg-tertiary/10 text-on-surface"
                                      : isWrongChosen
                                      ? "border-error bg-error/10 text-on-surface"
                                      : isChosen
                                      ? "border-primary bg-primary/15 text-on-surface"
                                      : "border-outline-variant/30 bg-surface-low text-on-surface-variant hover:text-on-surface"
                                  }`}
                                >
                                  {opt}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <input
                            type="text"
                            disabled={runnerGraded}
                            value={selectedAns}
                            onChange={(e) =>
                              setRunnerAnswers((prev) => ({
                                ...prev,
                                [q.id]: e.target.value,
                              }))
                            }
                            placeholder="Type your answer..."
                            className="w-full bg-surface-low border border-outline-variant/40 rounded-lg px-3 py-2 text-xs text-on-surface"
                          />
                        )}

                        {runnerGraded && evalItem && (
                          <div className="pt-2 border-t border-outline-variant/25 space-y-2">
                            <p
                              className={`text-xs font-semibold ${
                                evalItem.isCorrect ? "text-tertiary" : "text-error"
                              }`}
                            >
                              {evalItem.isCorrect
                                ? "Correct"
                                : `Incorrect — Expected: ${q.correctAnswer}`}
                            </p>
                            {q.explanation && (
                              <p className="text-xs text-on-surface-variant">
                                {q.explanation}
                              </p>
                            )}
                            {!evalItem.isCorrect && (
                              <div className="flex flex-wrap items-center gap-2 pt-1">
                                <span className="text-xs text-on-surface-variant">
                                  Classify mistake:
                                </span>
                                {ERROR_CATEGORY_OPTIONS.map((cat) => (
                                  <button
                                    key={cat.id}
                                    type="button"
                                    disabled={runnerSubmitted}
                                    onClick={() =>
                                      setRunnerErrorTags((prev) => ({
                                        ...prev,
                                        [q.id]: cat.id,
                                      }))
                                    }
                                    className={`px-2 py-1 text-[11px] rounded border transition-colors whitespace-nowrap shrink-0 ${
                                      (runnerErrorTags[q.id] || "conceptual") === cat.id
                                        ? "border-secondary text-secondary bg-secondary/10"
                                        : "border-outline-variant/30 text-on-surface-variant"
                                    }`}
                                  >
                                    {cat.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Calibration & Delayed Recall Controls */}
                <div className="bg-surface-lowest border border-outline-variant/30 rounded-lg p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <label className="block text-xs font-medium text-on-surface">
                        Self-Assessed Confidence: {runnerConfidence} / 5
                      </label>
                      <p className="text-[11px] text-on-surface-variant">
                        Recorded separately to measure calibration gap; never substitutes for quiz score.
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((lvl) => (
                        <button
                          key={lvl}
                          type="button"
                          disabled={runnerSubmitted}
                          onClick={() => setRunnerConfidence(lvl)}
                          className={`w-8 h-8 rounded text-xs font-mono tabular-nums font-semibold transition-colors ${
                            runnerConfidence === lvl
                              ? "bg-primary text-on-primary"
                              : "bg-surface-low text-on-surface-variant hover:text-on-surface"
                          }`}
                        >
                          {lvl}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="flex items-center gap-2 text-xs text-on-surface cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={runnerSubmitted}
                      checked={runnerDelayedRecall}
                      onChange={(e) => setRunnerDelayedRecall(e.target.checked)}
                    />
                    Delayed Recall Check (attempted from memory days after initial study without reviewing notes)
                  </label>

                  {runnerGraded && (
                    <div>
                      <label className="block text-xs text-on-surface-variant mb-1">
                        Post-Attempt Reflection (Optional)
                      </label>
                      <input
                        type="text"
                        disabled={runnerSubmitted}
                        value={runnerReflection}
                        onChange={(e) => setRunnerReflection(e.target.value)}
                        placeholder="What key invariant or boundary case will you watch next time?"
                        className="w-full bg-surface-low border border-outline-variant/40 rounded-lg px-3 py-1.5 text-xs text-on-surface"
                      />
                    </div>
                  )}
                </div>

                {/* Action Footer */}
                {!runnerGraded ? (
                  <button
                    type="button"
                    onClick={() => setRunnerGraded(true)}
                    className="w-full py-2.5 px-4 bg-primary text-on-primary text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
                  >
                    Grade Answers &amp; Inspect Solutions
                  </button>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                    <div className="text-sm font-mono tabular-nums">
                      Score:{" "}
                      <span className="font-bold text-primary">
                        {runnerEvaluation?.correctCount}/{runnerEvaluation?.maxScore} (
                        {runnerEvaluation?.pct}%)
                      </span>
                    </div>

                    {runnerSubmitted ? (
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-tertiary flex items-center gap-1.5 font-medium">
                          <CheckCircle2 className="w-4 h-4" />
                          Saved to Official Attempt Ledger
                        </span>
                        <button
                          type="button"
                          onClick={() => startAssessmentRunner(runningAssessment)}
                          className="px-3 py-1.5 text-xs bg-surface-high text-on-surface rounded-lg hover:bg-surface-bright whitespace-nowrap shrink-0"
                        >
                          Retake Fresh Attempt
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={handleRecordRunnerAttempt}
                        className="px-4 py-2.5 bg-tertiary text-on-tertiary text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
                      >
                        Record Official Attempt
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 3: MANUAL SCORE LOGGER & AUDITABLE ATTEMPT LEDGER
         ===================================================================== */}
      {activeTab === "history" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Manual Score Logger */}
            <form
              onSubmit={handleManualAttemptSubmit}
              className="lg:col-span-4 bg-surface-low border border-outline-variant/35 rounded-xl p-5 space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-on-surface">
                  Log External Exam or Practice Score
                </h2>
                <BookOpen className="w-4 h-4 text-primary" />
              </div>

              {logFormError && (
                <p className="text-xs text-error bg-error-container/25 border border-error/40 rounded-lg px-3 py-2">
                  {logFormError}
                </p>
              )}

              <div>
                <label className="block text-xs text-on-surface-variant mb-1">
                  Course *
                </label>
                <select
                  value={logCourseId}
                  onChange={(e) => {
                    setLogCourseId(e.target.value);
                    setLogModuleId("");
                  }}
                  className="w-full bg-surface-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-xs text-on-surface"
                  required
                >
                  <option value="">Select Course...</option>
                  {state.courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} · {c.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-on-surface-variant mb-1">
                  Syllabus Topic (Recommended for Topic Mastery)
                </label>
                <select
                  value={logModuleId}
                  onChange={(e) => setLogModuleId(e.target.value)}
                  className="w-full bg-surface-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-xs text-on-surface"
                >
                  <option value="">Course-Level Assessment</option>
                  {state.modules
                    .filter((m) => !logCourseId || m.courseId === logCourseId)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-on-surface-variant mb-1">
                  Assessment Title
                </label>
                <input
                  type="text"
                  value={logTitle}
                  onChange={(e) => setLogTitle(e.target.value)}
                  placeholder="e.g., Problem Sheet 3 Timed Attempt"
                  className="w-full bg-surface-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-xs text-on-surface"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-on-surface-variant mb-1">
                    Format
                  </label>
                  <select
                    value={logKind}
                    onChange={(e) => setLogKind(e.target.value as AssessmentKind)}
                    className="w-full bg-surface-lowest border border-outline-variant/40 rounded-lg px-2.5 py-2 text-xs text-on-surface"
                  >
                    {ASSESSMENT_KINDS.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-on-surface-variant mb-1">
                    Difficulty
                  </label>
                  <select
                    value={logDifficulty}
                    onChange={(e) =>
                      setLogDifficulty(e.target.value as AssessmentDifficulty)
                    }
                    className="w-full bg-surface-lowest border border-outline-variant/40 rounded-lg px-2.5 py-2 text-xs text-on-surface"
                  >
                    <option value="foundational">Foundational</option>
                    <option value="standard">Standard</option>
                    <option value="rigorous">Rigorous</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-on-surface-variant mb-1">
                    Score *
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min={0}
                    value={logScore}
                    onChange={(e) => setLogScore(e.target.value)}
                    className="w-full bg-surface-lowest border border-outline-variant/40 rounded-lg px-2.5 py-2 text-xs font-mono tabular-nums text-on-surface"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-on-surface-variant mb-1">
                    Max *
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min={1}
                    value={logMaxScore}
                    onChange={(e) => setLogMaxScore(e.target.value)}
                    className="w-full bg-surface-lowest border border-outline-variant/40 rounded-lg px-2.5 py-2 text-xs font-mono tabular-nums text-on-surface"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-on-surface-variant mb-1">
                    Confidence (1–5)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={logConfidence}
                    onChange={(e) => setLogConfidence(Number(e.target.value))}
                    className="w-full bg-surface-lowest border border-outline-variant/40 rounded-lg px-2.5 py-2 text-xs font-mono tabular-nums text-on-surface"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-on-surface-variant mb-1.5">
                  Error Categories Observed
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {ERROR_CATEGORY_OPTIONS.map((cat) => {
                    const active = logErrors.includes(cat.id);
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => toggleManualErrorCat(cat.id)}
                        className={`px-2.5 py-1 text-xs rounded border transition-colors whitespace-nowrap shrink-0 ${
                          active
                            ? "border-secondary text-secondary bg-secondary/15"
                            : "border-outline-variant/35 text-on-surface-variant hover:text-on-surface"
                        }`}
                      >
                        {cat.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-on-surface cursor-pointer">
                <input
                  type="checkbox"
                  checked={logDelayedRecall}
                  onChange={(e) => setLogDelayedRecall(e.target.checked)}
                />
                Delayed recall check (spaced retrieval without notes)
              </label>

              <div>
                <label className="block text-xs text-on-surface-variant mb-1">
                  Reflection / Takeaway (Optional)
                </label>
                <input
                  type="text"
                  value={logReflection}
                  onChange={(e) => setLogReflection(e.target.value)}
                  placeholder="Key insight or error remediation plan"
                  className="w-full bg-surface-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-xs text-on-surface"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 px-4 bg-primary text-on-primary text-xs font-semibold rounded-lg hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
              >
                Append Attempt to Ledger
              </button>
            </form>

            {/* Chronological Attempt History Ledger */}
            <div className="lg:col-span-8 bg-surface-low border border-outline-variant/35 rounded-xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-outline-variant/25">
                <div>
                  <h2 className="text-base font-semibold text-on-surface">
                    Append-Only Assessment Ledger
                  </h2>
                  <p className="text-xs text-on-surface-variant">
                    Every attempt is preserved chronologically. Corrections and deletions require an audit reason and immediately recompute mastery.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={historyFilterCourse}
                    onChange={(e) => setHistoryFilterCourse(e.target.value)}
                    className="bg-surface-lowest border border-outline-variant/40 rounded-lg px-2.5 py-1.5 text-xs text-on-surface"
                  >
                    <option value="all">All Courses</option>
                    {state.courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code}
                      </option>
                    ))}
                  </select>

                  <select
                    value={historyFilterKind}
                    onChange={(e) =>
                      setHistoryFilterKind(e.target.value as "all" | AssessmentKind)
                    }
                    className="bg-surface-lowest border border-outline-variant/40 rounded-lg px-2.5 py-1.5 text-xs text-on-surface"
                  >
                    <option value="all">All Formats</option>
                    {ASSESSMENT_KINDS.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {filteredAttempts.length === 0 ? (
                <div className="py-12 text-center space-y-2">
                  <Clock className="w-7 h-7 text-on-surface-variant mx-auto opacity-70" />
                  <p className="text-sm font-medium text-on-surface">
                    Zero assessment attempts recorded yet.
                  </p>
                  <p className="text-xs text-on-surface-variant max-w-md mx-auto">
                    Complete a Topic Quiz or log a graded problem set on the left. Topics remain marked &ldquo;Not enough evidence yet.&rdquo; until real attempts are recorded.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-outline-variant/30 text-[11px] text-on-surface-variant font-mono">
                        <th className="py-2.5 pr-3">Date</th>
                        <th className="py-2.5 px-3">Assessment &amp; Topic</th>
                        <th className="py-2.5 px-3 text-right">Empirical Score</th>
                        <th className="py-2.5 px-3 text-right">Confidence</th>
                        <th className="py-2.5 px-3">Diagnostics</th>
                        <th className="py-2.5 pl-3 text-right">Audit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/20 text-xs">
                      {filteredAttempts.map((att) => {
                        const course = courseMap.get(att.courseId);
                        const mod = att.moduleId ? moduleMap.get(att.moduleId) : undefined;

                        return (
                          <React.Fragment key={att.id}>
                            <tr className="hover:bg-surface-lowest/50 transition-colors">
                              <td className="py-3 pr-3 font-mono tabular-nums text-on-surface-variant whitespace-nowrap">
                                {att.attemptedAt.slice(0, 10)}
                              </td>
                              <td className="py-3 px-3">
                                <p className="font-medium text-on-surface">{att.title}</p>
                                <p className="text-[11px] text-on-surface-variant">
                                  {course?.code || "Course"}
                                  {mod ? ` · ${mod.title}` : ""} ·{" "}
                                  {att.kind.replace(/_/g, " ")} · {att.difficulty}
                                  {att.isDelayedRecall ? " · Delayed Recall" : ""}
                                  {att.correctedAt ? " · Corrected" : ""}
                                </p>
                              </td>
                              <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                                <span
                                  className={`font-semibold ${
                                    att.percentage >= 80
                                      ? "text-tertiary"
                                      : att.percentage >= 60
                                      ? "text-primary"
                                      : "text-error"
                                  }`}
                                >
                                  {att.percentage}%
                                </span>{" "}
                                <span className="text-on-surface-variant">
                                  ({att.score}/{att.maxScore})
                                </span>
                              </td>
                              <td className="py-3 px-3 text-right font-mono tabular-nums text-on-surface-variant whitespace-nowrap">
                                {att.selfConfidence}/5
                              </td>
                              <td className="py-3 px-3 text-on-surface-variant">
                                {att.errorCategories.length > 0
                                  ? att.errorCategories.join(" · ")
                                  : "Clean pass"}
                              </td>
                              <td className="py-3 pl-3 text-right whitespace-nowrap">
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingAttemptId(
                                        editingAttemptId === att.id ? null : att.id
                                      );
                                      setDeletingAttemptId(null);
                                      setEditScore(String(att.score));
                                      setEditMaxScore(String(att.maxScore));
                                      setEditConfidence(att.selfConfidence);
                                      setEditReason("");
                                      setEditErrorMsg(null);
                                    }}
                                    className="p-1 text-on-surface-variant hover:text-primary"
                                    title="Correct score with audit reason"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDeletingAttemptId(
                                        deletingAttemptId === att.id ? null : att.id
                                      );
                                      setEditingAttemptId(null);
                                      setDeleteReason("");
                                    }}
                                    className="p-1 text-on-surface-variant hover:text-error"
                                    title="Delete mistaken attempt"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>

                            {editingAttemptId === att.id && (
                              <tr>
                                <td colSpan={6} className="py-3 px-4 bg-surface-lowest">
                                  <div className="space-y-3">
                                    <p className="text-xs font-semibold text-on-surface">
                                      Correct Attempt Record (Auditable)
                                    </p>
                                    {editErrorMsg && (
                                      <p className="text-xs text-error">{editErrorMsg}</p>
                                    )}
                                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                                      <div>
                                        <label className="block text-[11px] text-on-surface-variant mb-1">
                                          Corrected Score
                                        </label>
                                        <input
                                          type="number"
                                          step="0.5"
                                          value={editScore}
                                          onChange={(e) => setEditScore(e.target.value)}
                                          className="w-full bg-surface-low border border-outline-variant/40 rounded px-2 py-1 text-xs font-mono tabular-nums text-on-surface"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[11px] text-on-surface-variant mb-1">
                                          Corrected Max
                                        </label>
                                        <input
                                          type="number"
                                          step="0.5"
                                          value={editMaxScore}
                                          onChange={(e) => setEditMaxScore(e.target.value)}
                                          className="w-full bg-surface-low border border-outline-variant/40 rounded px-2 py-1 text-xs font-mono tabular-nums text-on-surface"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[11px] text-on-surface-variant mb-1">
                                          Confidence (1–5)
                                        </label>
                                        <input
                                          type="number"
                                          min={1}
                                          max={5}
                                          value={editConfidence}
                                          onChange={(e) =>
                                            setEditConfidence(Number(e.target.value))
                                          }
                                          className="w-full bg-surface-low border border-outline-variant/40 rounded px-2 py-1 text-xs font-mono tabular-nums text-on-surface"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[11px] text-on-surface-variant mb-1">
                                          Audit Reason *
                                        </label>
                                        <input
                                          type="text"
                                          value={editReason}
                                          onChange={(e) => setEditReason(e.target.value)}
                                          placeholder="e.g., Regrade on Q2"
                                          className="w-full bg-surface-low border border-outline-variant/40 rounded px-2 py-1 text-xs text-on-surface"
                                        />
                                      </div>
                                    </div>
                                    <div className="flex justify-end gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setEditingAttemptId(null)}
                                        className="px-2.5 py-1 text-xs text-on-surface-variant"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleSaveCorrection(att.id)}
                                        className="px-3 py-1 text-xs font-semibold bg-primary text-on-primary rounded whitespace-nowrap shrink-0"
                                      >
                                        Save Correction
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}

                            {deletingAttemptId === att.id && (
                              <tr>
                                <td colSpan={6} className="py-3 px-4 bg-surface-lowest">
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <input
                                      type="text"
                                      value={deleteReason}
                                      onChange={(e) => setDeleteReason(e.target.value)}
                                      placeholder="Reason for deleting this attempt (e.g., duplicate entry)..."
                                      className="flex-1 bg-surface-low border border-outline-variant/40 rounded px-2.5 py-1.5 text-xs text-on-surface"
                                    />
                                    <div className="flex items-center gap-2 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => setDeletingAttemptId(null)}
                                        className="px-2.5 py-1 text-xs text-on-surface-variant"
                                      >
                                        Cancel
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleConfirmDeleteAttempt(att.id)}
                                        className="px-3 py-1 text-xs font-semibold bg-error text-on-primary rounded whitespace-nowrap shrink-0"
                                      >
                                        Delete &amp; Recompute Mastery
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Record Corrections Audit Trail */}
              {state.recordCorrections.length > 0 && (
                <div className="pt-4 border-t border-outline-variant/25 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-on-surface">
                    <RotateCcw className="w-3.5 h-3.5 text-secondary" />
                    Record Corrections Audit Log ({state.recordCorrections.length})
                  </div>
                  <div className="space-y-1.5">
                    {state.recordCorrections.slice(0, 5).map((corr) => (
                      <p
                        key={corr.id}
                        className="text-[11px] font-mono tabular-nums text-on-surface-variant"
                      >
                        {corr.correctedAt.slice(0, 10)} · {corr.action.toUpperCase()} ·{" "}
                        {corr.previousSummary} · Reason: {corr.reason}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
