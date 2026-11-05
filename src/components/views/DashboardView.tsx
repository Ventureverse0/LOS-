import React, { useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  Award,
  BookOpen,
  BrainCircuit,
  CalendarClock,
  CheckCircle2,
  Database,
  FileText,
  Flame,
  FolderKanban,
  Layers,
  Loader2,
  Paperclip,
  Pause,
  Play,
  Plus,
  Send,
  ShieldAlert,
  Sparkles,
  Terminal,
  Trash2,
  TrendingUp,
  Upload,
  Keyboard,
  Compass,
  Gamepad2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
} from "lucide-react";
import { useStudyOS } from "../../context/StudyOSContext";
import {
  AppView,
  type LearnerLevel,
  type UploadedNoteDocument,
} from "../../types/studyOS";
import {
  countWords,
  formatSecondsToTimestamp,
  getLevelProgress,
  getTodayDateString,
} from "../../lib/gamification";
import {
  computeAllTopicMasteries,
  computeGrowthAnalytics,
  generateNextBestActions,
  type NextBestActionItem,
} from "../../lib/growthIntelligence";
import { generateGrokopediaCurriculum } from "../../services/aiService";
import { formatByteSize, readUploadedNoteFiles } from "../../lib/storage";
import { WeeklyFocusHoursCard } from "../WeeklyFocusHoursCard";

type CourseFilterTab = "all" | "in_progress" | "todo" | "mastered";

export function DashboardView() {
  const {
    state,
    setActiveView,
    openModuleInVault,
    openCourseInManager,
    openCourseTagFilter,
    openGrokopediaWithTopic,
    updateModuleStatus,
    ingestGeneratedCurriculum,
    pomodoro,
    startOrPausePomodoro,
    logStudyMinutes,
    toggleTimeBlock,
    addTimeBlock,
    updateSettings,
    setShortcutModalOpen,
    setGuideModalOpen,
    launchIntegrativeLab,
    createQuickVaultNote,
    autonomousAgentStatus,
    importBackupJson,
    actOnRecommendation,
    pushToast,
  } = useStudyOS();

  const [courseFilter, setCourseFilter] = useState<CourseFilterTab>("all");
  const [quickPrompt, setQuickPrompt] = useState("");
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [showAddBlock, setShowAddBlock] = useState(false);
  const [newBlockRange, setNewBlockRange] = useState("19:00 - 20:00");
  const [newBlockTitle, setNewBlockTitle] = useState("");
  const [guideCollapsed, setGuideCollapsed] = useState(false);

  // Start-From-Scratch Launchpad state (rendered inline when courses.length === 0)
  const [scratchTopic, setScratchTopic] = useState("");
  const [scratchGoals, setScratchGoals] = useState("");
  const [scratchNotes, setScratchNotes] = useState("");
  const [scratchShowPaste, setScratchShowPaste] = useState(false);
  const [scratchLevel, setScratchLevel] = useState<LearnerLevel>("Intermediate");
  const [scratchUnits, setScratchUnits] = useState<number>(5);
  const [scratchFiles, setScratchFiles] = useState<UploadedNoteDocument[]>([]);
  const [isScratchBuilding, setIsScratchBuilding] = useState(false);

  const scratchFileInputRef = useRef<HTMLInputElement | null>(null);
  const restoreDbInputRef = useRef<HTMLInputElement | null>(null);

  const levelInfo = getLevelProgress(state.stats.currentXP);

  // 7-day commit strip data
  const weekDays = useMemo(() => {
    const labels = ["S", "M", "T", "W", "T", "F", "S"];
    const days: Array<{ date: string; short: string; mins: number; isToday: boolean }> = [];
    for (let offset = 6; offset >= 0; offset--) {
      const d = new Date();
      d.setDate(d.getDate() - offset);
      const ymd = getTodayDateString(d);
      days.push({
        date: ymd,
        short: offset === 0 ? "TODAY" : labels[d.getDay()],
        mins: state.stats.weeklyMinutes[ymd] || 0,
        isToday: offset === 0,
      });
    }
    return days;
  }, [state.stats.weeklyMinutes]);

  const activeCourses = useMemo(
    () => state.courses.filter((c) => !c.archived),
    [state.courses]
  );
  const activeModules = useMemo(
    () => state.modules.filter((m) => !m.archived),
    [state.modules]
  );

  // Syllabus summary metrics (active non-archived syllabus)
  const syllabusMetrics = useMemo(() => {
    const total = activeModules.length;
    const mastered = activeModules.filter((m) => m.status === "Mastered").length;
    const inProgress = activeModules.filter((m) => m.status === "In Progress").length;
    const todo = activeModules.filter((m) => m.status === "To Do").length;
    const pct = total > 0 ? Math.round((mastered / total) * 100) : 0;
    return { total, mastered, inProgress, todo, pct };
  }, [activeModules]);

  // Student Growth Intelligence 7-day brief & explainable next-best-actions
  const analytics7d = useMemo(() => computeGrowthAnalytics(state, "7d"), [state]);
  const allMasteries = useMemo(() => computeAllTopicMasteries(state), [state]);
  const nextActions = useMemo(() => generateNextBestActions(state), [state]);

  const upcomingAndOverdueTasks = useMemo(() => {
    const todayYmd = getTodayDateString();
    return [...state.tasks]
      .filter((t) => t.status !== "completed" && t.status !== "submitted")
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .map((t) => ({
        ...t,
        isOverdue: t.dueDate.slice(0, 10) < todayYmd || t.status === "missed",
      }));
  }, [state.tasks]);

  const completedTasksCount = useMemo(
    () => state.tasks.filter((t) => t.status === "completed" || t.status === "submitted").length,
    [state.tasks]
  );

  const executeRecommendation = (item: NextBestActionItem) => {
    actOnRecommendation(item.id, "accepted");
    if (item.moduleId && item.targetView === "vault") {
      openModuleInVault(item.moduleId);
      return;
    }
    setActiveView(item.targetView as AppView);
  };

  // Focus telemetry
  const focusGoalPct = Math.min(
    100,
    Math.round((state.stats.todayMinutesSpent / Math.max(1, state.stats.dailyGoalMinutes)) * 100)
  );
  const hoursToday = Math.floor(state.stats.todayMinutesSpent / 60);
  const minsToday = state.stats.todayMinutesSpent % 60;
  const goalHours = Math.floor(state.stats.dailyGoalMinutes / 60);
  const goalMins = state.stats.dailyGoalMinutes % 60;
  const totalStudiedHours = Math.round(((state.stats.totalMinutesStudied || 0) / 60) * 10) / 10;

  // Filtered courses
  const filteredCourses = useMemo(() => {
    return activeCourses.filter((c) => {
      const pct = c.totalUnits > 0 ? c.completedUnits / c.totalUnits : 0;
      if (courseFilter === "mastered") return c.totalUnits > 0 && pct === 1;
      if (courseFilter === "todo") return c.completedUnits === 0;
      if (courseFilter === "in_progress") return pct > 0 && pct < 1;
      return true;
    });
  }, [activeCourses, courseFilter]);

  const handleScratchFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    try {
      const docs = await readUploadedNoteFiles(files);
      setScratchFiles((prev) => {
        const seen = new Set(prev.map((d) => d.name));
        return [...prev, ...docs.filter((d) => !seen.has(d.name))].slice(0, 8);
      });
      pushToast({
        title: `Attached ${docs.length} File${docs.length > 1 ? "s" : ""}`,
        subtitle: docs.map((d) => d.name).join(", "),
        variant: "success",
      });
    } catch (err: unknown) {
      pushToast({
        title: "File Upload Error",
        subtitle: err instanceof Error ? err.message : "Could not read file.",
        variant: "error",
      });
    } finally {
      if (scratchFileInputRef.current) scratchFileInputRef.current.value = "";
    }
  };

  const handleScratchBuild = async (e: React.FormEvent) => {
    e.preventDefault();
    const canRun = Boolean(
      scratchTopic.trim() || scratchNotes.trim() || scratchFiles.length > 0
    );
    if (!canRun || isScratchBuilding) return;

    setIsScratchBuilding(true);
    try {
      const { curriculum, model } = await generateGrokopediaCurriculum({
        topic: scratchTopic.trim() || undefined,
        learningGoals: scratchGoals.trim() || undefined,
        learnerLevel: scratchLevel,
        targetUnitCount: scratchUnits,
        rawNotesText: scratchNotes.trim() || undefined,
        uploadedDocuments: scratchFiles.length > 0 ? scratchFiles : undefined,
        model: state.settings.selectedModel,
        temperature: state.settings.temperature,
        topP: state.settings.topP,
      });
      ingestGeneratedCurriculum(
        curriculum,
        scratchTopic.trim() || curriculum.courseTitle,
        model,
        {
          learningGoals: scratchGoals.trim() || undefined,
          sourceDocuments: scratchFiles,
          rawNotesText: scratchNotes.trim() || undefined,
        }
      );
      setScratchTopic("");
      setScratchGoals("");
      setScratchNotes("");
      setScratchFiles([]);
    } catch (err: unknown) {
      pushToast({
        title: "Curriculum Build Failed",
        subtitle: err instanceof Error ? err.message : "Unable to reach AI engine.",
        variant: "error",
      });
    } finally {
      setIsScratchBuilding(false);
    }
  };

  const handleRestoreLocalDbFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importBackupJson(String(reader.result || ""));
      } catch (err: unknown) {
        pushToast({
          title: "Database Restore Failed",
          subtitle: err instanceof Error ? err.message : "Invalid .studyos.json file.",
          variant: "error",
        });
      }
      if (restoreDbInputRef.current) restoreDbInputRef.current.value = "";
    };
    reader.readAsText(file);
  };

  const handleQuickSynthesize = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const topic = quickPrompt.trim();
    if (!topic || isSynthesizing) return;

    setIsSynthesizing(true);
    try {
      const { curriculum, model } = await generateGrokopediaCurriculum({
        topic,
        model: state.settings.selectedModel,
        temperature: state.settings.temperature,
        topP: state.settings.topP,
      });
      ingestGeneratedCurriculum(curriculum, topic, model);
      setQuickPrompt("");
    } catch (err: unknown) {
      pushToast({
        title: "Synthesis Failed",
        subtitle: err instanceof Error ? err.message : "Unable to reach AI engine.",
        variant: "error",
      });
    } finally {
      setIsSynthesizing(false);
    }
  };

  const handleCreateTimeBlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBlockTitle.trim()) return;
    addTimeBlock({
      timeRange: newBlockRange.trim() || "19:00 - 20:00",
      durationMinutes: 60,
      title: newBlockTitle.trim(),
      subtitle: `${state.courses[0]?.code || "STUDY"} · Deep Work Session`,
      courseId: state.courses[0]?.id,
      moduleId: state.modules[0]?.id,
      accent: "primary",
    });
    setNewBlockTitle("");
    setShowAddBlock(false);
  };

  const latestResearch = state.researchSessions[0];
  const isCleanSlate = state.courses.length === 0;

  const onboardingSteps = useMemo(() => {
    const hasCourse = state.courses.length > 0;
    const hasActiveUnit = state.modules.some((m) => m.status !== "To Do");
    const hasRichNotes = state.modules.some((m) => countWords(m.notesMarkdown) >= 50);
    const hasLabSession = state.activityLog.some((a) => a.type === "physics_lab_completed");
    const hasReviewed =
      (state.stats.totalFlashcardsReviewed || 0) > 0 ||
      state.flashcards.some((f) => Boolean(f.lastReviewedAt));

    return [
      {
        num: "01",
        title: "Build or Upload Topic",
        desc: "Enter any subject or drop notes in Grokopedia (works with any API or offline).",
        done: hasCourse,
        actionLabel: "Grokopedia",
        onClick: () => setActiveView(AppView.GROKOPEDIA),
      },
      {
        num: "02",
        title: "Pick an Active Unit",
        desc: "Filter courses by tag & select a syllabus unit to track.",
        done: hasActiveUnit,
        actionLabel: "Syllabus",
        onClick: () => setActiveView(AppView.COURSES),
      },
      {
        num: "03",
        title: "Write & Auto-Sync Vault",
        desc: "Notes auto-extract concepts, math laws & flashcards as you type.",
        done: hasRichNotes,
        actionLabel: "Open Vault",
        onClick: () => setActiveView(AppView.VAULT),
      },
      {
        num: "04",
        title: "Run 3D Physics & Math Lab",
        desc: "Test live 120Hz RK4 trajectories & save derivations to Vault.",
        done: hasLabSession,
        actionLabel: "Launch 3D Lab",
        onClick: () => launchIntegrativeLab(),
      },
      {
        num: "05",
        title: "Review & Sprint",
        desc: "Practice Leitner flashcards & run Pomodoro sprints for daily XP.",
        done: hasReviewed,
        actionLabel: "Flashcards",
        onClick: () => setActiveView(AppView.FLASHCARDS),
      },
    ];
  }, [
    state.courses.length,
    state.modules,
    state.activityLog,
    state.stats.totalFlashcardsReviewed,
    state.flashcards,
    setActiveView,
    launchIntegrativeLab,
  ]);

  const completedGuideSteps = onboardingSteps.filter((s) => s.done).length;

  return (
    <div className="flex flex-col gap-5 w-full">
      {/* Focus Lockdown Active Banner */}
      {state.settings.focusLockdown && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-md bg-surface-lowest border border-primary/40">
          <div className="flex items-center gap-2.5 text-xs font-mono text-primary">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>FOCUS LOCKDOWN PROTOCOL ACTIVE · Distractions muted for deep study execution</span>
          </div>
          <button
            type="button"
            onClick={() => updateSettings({ focusLockdown: false })}
            className="px-2.5 py-1 rounded bg-surface-high text-xs font-mono text-on-surface hover:text-primary transition-colors cursor-pointer whitespace-nowrap"
          >
            Exit Lockdown
          </button>
        </div>
      )}

      {/* SECTION 1: 4-COLUMN TELEMETRY STAT CARDS */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* CARD 1: STREAK TELEMETRY */}
        <div className="bg-surface-low border border-outline-variant/35 p-4 rounded-md flex flex-col justify-between gap-4 hover:border-secondary/40 transition-colors">
          <div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant">
                Active Study Streak
              </span>
              <Flame className="w-4 h-4 text-secondary" />
            </div>
            <div className="flex items-baseline gap-2 pt-2 tabular-nums">
              <span className="text-3xl font-bold text-on-surface font-mono">
                {state.stats.streakCount}
              </span>
              <span className="font-mono text-xs font-semibold text-secondary">
                {state.stats.streakCount === 1 ? "Day Active" : "Days Continuous"}
              </span>
            </div>
            <p className="font-mono text-[11px] text-outline pt-1">
              Last active: {state.stats.lastActiveDate}
            </p>
          </div>

          <div className="pt-1">
            <div className="grid grid-cols-7 gap-1 font-mono text-[9px] text-outline pb-1 text-center">
              {weekDays.map((d) => (
                <span key={d.date} className={d.isToday ? "text-primary font-bold" : ""}>
                  {d.short}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {weekDays.map((d) => {
                const intensity =
                  d.mins >= 240
                    ? "bg-secondary text-on-secondary"
                    : d.mins >= 120
                    ? "bg-primary-container text-on-primary-container"
                    : d.mins > 0
                    ? "bg-primary-container/40 text-on-surface"
                    : "bg-surface-highest text-outline";
                return (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => logStudyMinutes(15, `Quick +15m Study Commit (${d.date})`)}
                    title={`${d.date}: ${d.mins} mins logged · Click to log +15m`}
                    className={`h-5 rounded-xs flex items-center justify-center font-mono text-[9px] font-semibold transition-transform hover:scale-105 cursor-pointer ${intensity}`}
                  >
                    {d.isToday ? "⚡" : ""}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* CARD 2: TOTAL XP & LEVEL VELOCITY */}
        <div
          onClick={() => setActiveView(AppView.SETTINGS)}
          className="bg-surface-low border border-outline-variant/35 p-4 rounded-md flex flex-col justify-between gap-4 hover:border-primary/40 transition-colors cursor-pointer"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant">
                XP Velocity
              </span>
              <span className="font-mono text-[11px] text-primary font-semibold tabular-nums">
                LVL {levelInfo.level}
              </span>
            </div>
            <div className="flex items-center justify-between pt-2">
              <div>
                <div className="text-3xl font-bold text-on-surface font-mono tabular-nums">
                  {levelInfo.currentXP.toLocaleString()}
                </div>
                <div className="font-mono text-[11px] text-tertiary flex items-center gap-1 pt-1 tabular-nums">
                  <TrendingUp className="w-3.5 h-3.5" />
                  <span>+{state.stats.todayXP} XP earned today</span>
                </div>
              </div>

              <div className="relative w-12 h-12 flex items-center justify-center shrink-0">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-surface-highest"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3.5"
                  />
                  <path
                    className="text-primary"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeDasharray={`${levelInfo.progressPercent}, 100`}
                    strokeLinecap="round"
                    strokeWidth="3.5"
                  />
                </svg>
                <span className="absolute font-mono text-[10px] font-bold text-on-surface tabular-nums">
                  {Math.round(levelInfo.progressPercent)}%
                </span>
              </div>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center font-mono text-[10px] text-outline mb-1.5 tabular-nums">
              <span className="truncate">{levelInfo.tierName}</span>
              <span className="shrink-0">NEXT: {levelInfo.nextLevelXP.toLocaleString()}</span>
            </div>
            <div className="w-full bg-surface-highest h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-primary h-full rounded-full shadow-[0_0_8px_rgba(76,215,246,0.4)]"
                style={{ width: `${levelInfo.progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* CARD 3: SYLLABUS MATRIX */}
        <div
          onClick={() => setActiveView(AppView.COURSES)}
          className="bg-surface-low border border-outline-variant/35 p-4 rounded-md flex flex-col justify-between gap-4 hover:border-tertiary/40 transition-colors cursor-pointer"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant">
                Syllabus Matrix
              </span>
              <span className="font-mono text-[11px] text-tertiary font-bold tabular-nums">
                {syllabusMetrics.pct}% MASTERED
              </span>
            </div>
            <div className="flex items-baseline justify-between pt-2 tabular-nums">
              <span className="text-3xl font-bold text-on-surface font-mono">
                {syllabusMetrics.mastered}{" "}
                <span className="text-lg text-outline font-normal">/ {syllabusMetrics.total}</span>
              </span>
              <span className="font-mono text-[11px] text-on-surface-variant">Units</span>
            </div>
            <div className="flex items-center gap-2 pt-1 font-mono text-[11px] text-outline tabular-nums">
              <span className="text-primary">{syllabusMetrics.inProgress} In Progress</span>
              <span>·</span>
              <span>{syllabusMetrics.todo} To Do</span>
            </div>
          </div>

          <div className="flex items-end gap-1.5 h-9 pt-1">
            {state.courses.length === 0 ? (
              <div className="w-full h-full rounded bg-surface-lowest border border-outline-variant/25 flex items-center justify-center font-mono text-[10px] text-outline">
                0 courses yet — build or add below
              </div>
            ) : (
              state.courses.slice(0, 6).map((course) => {
                const ratio =
                  course.totalUnits > 0
                    ? Math.max(18, Math.round((course.completedUnits / course.totalUnits) * 100))
                    : 18;
                return (
                  <div
                    key={course.id}
                    title={`${course.code}: ${course.completedUnits}/${course.totalUnits} Mastered`}
                    className={`flex-1 rounded-t transition-colors ${
                      ratio === 100 ? "bg-tertiary" : "bg-primary/70 hover:bg-primary"
                    }`}
                    style={{ height: `${ratio}%` }}
                  />
                );
              })
            )}
          </div>
        </div>

        {/* CARD 4: FOCUS TELEMETRY & LIVE POMODORO */}
        <div className="bg-surface-low border border-outline-variant/35 p-4 rounded-md flex flex-col justify-between gap-4 hover:border-primary/40 transition-colors">
          <div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant">
                Focus Telemetry
              </span>
              <button
                type="button"
                onClick={() => setActiveView(AppView.POMODORO)}
                className="font-mono text-[11px] text-secondary hover:underline cursor-pointer tabular-nums"
              >
                TARGET: {goalHours}h {String(goalMins).padStart(2, "0")}m
              </button>
            </div>
            <div className="flex items-baseline justify-between pt-2 tabular-nums">
              <span className="text-3xl font-bold text-on-surface font-mono">
                {hoursToday}h {String(minsToday).padStart(2, "0")}m
              </span>
              <span className="font-mono text-xs text-primary font-bold">{focusGoalPct}% Goal</span>
            </div>
            <p className="font-mono text-[11px] text-outline pt-1 tabular-nums">
              {state.stats.focusSprintsToday} sprints today · {totalStudiedHours}h lifetime
            </p>
          </div>

          <div className="bg-surface-lowest border border-outline-variant/40 px-3 py-1.5 rounded flex items-center justify-between">
            <button
              type="button"
              onClick={startOrPausePomodoro}
              className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-primary hover:text-on-surface transition-colors cursor-pointer"
            >
              {pomodoro.isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{pomodoro.isRunning ? "PAUSE SPRINT" : "START SPRINT"}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView(AppView.POMODORO)}
              className="font-mono text-xs font-bold text-on-surface hover:text-primary tabular-nums cursor-pointer"
            >
              {formatSecondsToTimestamp(pomodoro.remainingSeconds)}
            </button>
          </div>
        </div>
      </section>

      {/* WEEKLY FOCUS HOURS VISUALIZATION (Calculated from PomodoroFocusView History) */}
      <WeeklyFocusHoursCard />

      {/* SECTION 1.5: DAILY PLANNING & STUDENT GROWTH INTELLIGENCE BRIEF (7 QUESTIONS) */}
      <section className="bg-surface-lowest border border-outline-variant/40 rounded-md p-4 sm:p-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-outline-variant/25">
          <div>
            <div className="flex items-center gap-2 font-mono text-[11px] text-primary">
              <TrendingUp className="w-4 h-4 shrink-0" />
              <span>DAILY PLANNING &amp; EVIDENCE BRIEF</span>
              <span className="text-outline">·</span>
              <span className="text-on-surface-variant tabular-nums">
                {analytics7d.verifiedMasteryCount}/{activeModules.length} topics empirically verified
              </span>
            </div>
            <h2 className="text-base font-semibold text-on-surface pt-0.5">
              Today&apos;s Academic Diagnostics &amp; Next-Best-Actions
            </h2>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <button
              type="button"
              onClick={() => setActiveView(AppView.LEARNING_OS)}
              className="px-3 py-1.5 rounded bg-surface-high hover:bg-surface-bright border border-outline-variant/40 font-mono text-xs text-on-surface flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              title="Open LearningOS Studio: Remote Lectures, SQLite FTS5 Search & Concept Graph"
            >
              <Database className="w-3.5 h-3.5 text-primary shrink-0" />
              <span>LearningOS Studio</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView(AppView.ASSESSMENTS)}
              className="px-3 py-1.5 rounded bg-surface-high hover:bg-surface-bright border border-outline-variant/40 font-mono text-xs text-on-surface flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <ClipboardCheck className="w-3.5 h-3.5 text-primary shrink-0" />
              <span>Tasks &amp; Quizzes ({upcomingAndOverdueTasks.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView(AppView.GROWTH)}
              className="px-3 py-1.5 rounded bg-primary-container hover:bg-primary text-on-primary-container font-mono text-xs font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <TrendingUp className="w-3.5 h-3.5 shrink-0" />
              <span>Growth Intelligence</span>
            </button>
          </div>
        </div>

        {/* 6 Concise Diagnostic Answers + Question 7 Explainable Recommendations */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {/* Q1: What should I do today? */}
          <div className="bg-surface-low border border-outline-variant/35 rounded p-3 flex flex-col justify-between gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-primary">
              1 · What should I do today?
            </span>
            <p className="text-xs text-on-surface leading-relaxed">
              {nextActions[0]
                ? nextActions[0].title
                : state.timeBlocks.some((b) => !b.completed)
                ? `Complete "${state.timeBlocks.find((b) => !b.completed)?.title}"`
                : "Schedule a study sprint or log an initial diagnostic quiz."}
            </p>
            <span className="font-mono text-[11px] text-outline tabular-nums">
              {state.timeBlocks.filter((b) => !b.completed).length} open blocks ·{" "}
              {Math.max(0, state.stats.dailyGoalMinutes - state.stats.todayMinutesSpent)}m left for daily goal
            </span>
          </div>

          {/* Q2: Approaching & Overdue Deadlines */}
          <div className="bg-surface-low border border-outline-variant/35 rounded p-3 flex flex-col justify-between gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-secondary">
              2 · Approaching deadlines
            </span>
            {upcomingAndOverdueTasks.length === 0 ? (
              <p className="text-xs text-on-surface-variant leading-relaxed">
                No open assignments or exams recorded yet. Add deadlines in Tasks &amp; Exams.
              </p>
            ) : (
              <div className="space-y-1">
                {upcomingAndOverdueTasks.slice(0, 2).map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between gap-2 text-xs font-mono"
                  >
                    <span className="truncate text-on-surface">{task.title}</span>
                    <span
                      className={`shrink-0 tabular-nums ${
                        task.isOverdue ? "text-error font-semibold" : "text-secondary"
                      }`}
                    >
                      {task.isOverdue ? "OVERDUE " : ""}
                      {task.dueDate.slice(0, 10)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <span className="font-mono text-[11px] text-outline tabular-nums">
              {analytics7d.overdueTasksCount} overdue · {analytics7d.upcomingDeadlinesCount} due in 7d
            </span>
          </div>

          {/* Q3: Which topics need revision? */}
          <div className="bg-surface-low border border-outline-variant/35 rounded p-3 flex flex-col justify-between gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-primary">
              3 · Topics needing revision
            </span>
            <p className="text-xs text-on-surface leading-relaxed">
              {analytics7d.topicsNeedingRevision.length > 0
                ? analytics7d.topicsNeedingRevision
                    .slice(0, 2)
                    .map((t) => `${t.moduleTitle} (${t.evidenceScore ?? 0}%)`)
                    .join(" · ")
                : state.assessmentAttempts.length === 0
                ? "Not enough assessment evidence yet — run a topic quiz to detect decay."
                : "No assessed topics currently flagged for urgent revision."}
            </p>
            <span className="font-mono text-[11px] text-outline tabular-nums">
              {analytics7d.dueFlashcardsCount} flashcards due for spaced recall now
            </span>
          </div>

          {/* Q4: What have I completed? */}
          <div className="bg-surface-low border border-outline-variant/35 rounded p-3 flex flex-col justify-between gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-tertiary">
              4 · Completed (Last 7 Days)
            </span>
            <p className="text-xs text-on-surface leading-relaxed tabular-nums">
              {analytics7d.studyMinutesInRange}m studied across {analytics7d.sessionsInRange} sessions ·{" "}
              {analytics7d.assessmentsInRange} assessment{analytics7d.assessmentsInRange === 1 ? "" : "s"} logged
            </p>
            <span className="font-mono text-[11px] text-outline tabular-nums">
              {completedTasksCount} tasks submitted/done · {syllabusMetrics.mastered} workflow units marked done
            </span>
          </div>

          {/* Q5: What has improved? */}
          <div className="bg-surface-low border border-outline-variant/35 rounded p-3 flex flex-col justify-between gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-tertiary">
              5 · What has improved?
            </span>
            <p className="text-xs text-on-surface leading-relaxed tabular-nums">
              {analytics7d.improvedTopics.length > 0
                ? analytics7d.improvedTopics
                    .slice(0, 2)
                    .map(
                      (t) =>
                        `${t.moduleTitle} (${t.baselineScore}% → ${t.latestScore}%, +${t.deltaScore}%)`
                    )
                    .join(" · ")
                : "Need at least 2 scored attempts on a topic to verify score improvement."}
            </p>
            <span className="font-mono text-[11px] text-outline tabular-nums">
              {analytics7d.currentAverageScore !== null
                ? `7d assessment mean: ${analytics7d.currentAverageScore}%`
                : "7d assessment mean: Not enough evidence yet."}
            </span>
          </div>

          {/* Q6: What is still difficult? */}
          <div className="bg-surface-low border border-outline-variant/35 rounded p-3 flex flex-col justify-between gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-error">
              6 · What is still difficult?
            </span>
            <p className="text-xs text-on-surface leading-relaxed tabular-nums">
              {analytics7d.strugglingTopics.length > 0
                ? analytics7d.strugglingTopics
                    .slice(0, 2)
                    .map((t) => `${t.moduleTitle} (${t.evidenceScore}%)`)
                    .join(" · ")
                : state.assessmentAttempts.length === 0
                ? "Insufficient quiz/exam attempts to diagnose weak topics yet."
                : "No assessed topics scoring below 70% right now."}
            </p>
            <span className="font-mono text-[11px] text-outline tabular-nums">
              {analytics7d.errorBreakdown[0]
                ? `Top error pattern: ${analytics7d.errorBreakdown[0].category.replace("_", " ")} (${analytics7d.errorBreakdown[0].sharePct}%)`
                : "No error tags recorded yet"}
            </span>
          </div>
        </div>

        {/* Q7: Next Most Useful Action (Explainable Recommendations) */}
        {nextActions.length > 0 && (
          <div className="pt-2 border-t border-outline-variant/25 flex flex-col gap-2">
            <div className="flex items-center justify-between font-mono text-[11px]">
              <span className="text-primary font-semibold uppercase tracking-wider">
                7 · Next Most Useful Actions (Evidence-Grounded)
              </span>
              <span className="text-outline">Transparent rationale · Accept, snooze or dismiss</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
              {nextActions.slice(0, 2).map((rec) => (
                <div
                  key={rec.id}
                  className="bg-surface-low border border-outline-variant/40 rounded p-3 flex flex-col justify-between gap-2.5"
                >
                  <div>
                    <div className="flex items-center gap-2 font-mono text-[10px] text-outline">
                      <span
                        className={
                          rec.priority === "critical"
                            ? "text-error font-bold uppercase"
                            : rec.priority === "high"
                            ? "text-secondary font-semibold uppercase"
                            : "text-primary uppercase"
                        }
                      >
                        {rec.priority}
                      </span>
                      <span>·</span>
                      <span>{rec.category.replace(/_/g, " ")}</span>
                    </div>
                    <div className="text-xs font-semibold text-on-surface pt-1">{rec.title}</div>
                    <p className="text-[11px] text-on-surface-variant leading-relaxed pt-0.5">
                      {rec.whySuggested}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => executeRecommendation(rec)}
                      className="px-2.5 py-1 rounded bg-primary-container hover:bg-primary text-on-primary-container font-mono text-[11px] font-semibold cursor-pointer whitespace-nowrap"
                    >
                      {rec.actionLabel} →
                    </button>
                    <div className="flex items-center gap-1.5 font-mono text-[10px]">
                      <button
                        type="button"
                        onClick={() => actOnRecommendation(rec.id, "snoozed")}
                        className="px-2 py-1 rounded bg-surface-highest text-on-surface-variant hover:text-on-surface cursor-pointer whitespace-nowrap"
                      >
                        Snooze 24h
                      </button>
                      <button
                        type="button"
                        onClick={() => actOnRecommendation(rec.id, "dismissed")}
                        className="px-2 py-1 rounded bg-surface-highest text-outline hover:text-error cursor-pointer whitespace-nowrap"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* INLINE WHERE-TO-START ROADMAP & INTEGRATIVE 3D LAB LAUNCHER */}
      <section className="bg-surface-lowest border border-outline-variant/40 rounded-md p-4 sm:p-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Compass className="w-4 h-4 text-primary shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-semibold text-on-surface">
                  Where to Start · Integrative Study OS Guide
                </h2>
                <span className="font-mono text-xs text-outline">·</span>
                <span className="font-mono text-xs text-primary tabular-nums">
                  {completedGuideSteps}/5 steps completed
                </span>
                <span className="font-mono text-xs text-outline hidden md:inline">·</span>
                <span className="font-mono text-xs text-on-surface-variant hidden md:inline">
                  Auto-updates notes, flashcards &amp; 3D RK4 Physics Lab as you study
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => launchIntegrativeLab()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary-container hover:bg-primary text-on-primary-container font-mono text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
            >
              <Gamepad2 className="w-3.5 h-3.5 shrink-0" />
              <span>Launch 3D Physics Lab</span>
            </button>
            <button
              type="button"
              onClick={() => setGuideModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-surface-high hover:bg-surface-bright border border-outline-variant/40 text-on-surface font-mono text-xs transition-colors cursor-pointer whitespace-nowrap"
            >
              <span>Full Tutorial</span>
            </button>
            <button
              type="button"
              onClick={() => setGuideCollapsed((prev) => !prev)}
              aria-label={guideCollapsed ? "Expand guide steps" : "Collapse guide steps"}
              className="p-1.5 rounded bg-surface-low border border-outline-variant/40 text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
            >
              {guideCollapsed ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronUp className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {!guideCollapsed && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 pt-2 border-t border-outline-variant/25">
            {onboardingSteps.map((step) => (
              <div
                key={step.num}
                className="bg-surface-low border border-outline-variant/35 rounded p-3 flex flex-col justify-between gap-2.5"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between font-mono text-[11px]">
                    <span className="text-primary font-semibold">{step.num}.</span>
                    {step.done ? (
                      <span className="text-tertiary flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Done</span>
                      </span>
                    ) : (
                      <span className="text-outline">Next</span>
                    )}
                  </div>
                  <h3 className="text-xs font-semibold text-on-surface">{step.title}</h3>
                  <p className="text-[11px] text-on-surface-variant leading-relaxed">
                    {step.desc}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={step.onClick}
                  className="inline-flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded bg-surface-highest hover:bg-primary hover:text-on-primary text-on-surface font-mono text-[11px] transition-colors cursor-pointer whitespace-nowrap"
                >
                  <span>{step.actionLabel}</span>
                  <ArrowRight className="w-3 h-3 shrink-0" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* CLEAN-SLATE INLINE LAUNCHPAD (Shown when starting from scratch with 0 courses) */}
      {isCleanSlate && (
        <section className="bg-surface-lowest border border-primary/40 rounded-md p-5 sm:p-6 flex flex-col gap-4 shadow-[0_0_24px_rgba(6,182,212,0.08)]">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 pb-3 border-b border-outline-variant/30">
            <div>
              <div className="font-mono text-xs text-primary font-semibold flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                <span>START FROM SCRATCH · PERSONAL AI CURRICULUM &amp; NOTES ARCHITECT</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-semibold text-on-surface tracking-tight pt-1">
                Upload your notes or tell Study OS what you want to master
              </h2>
              <p className="text-xs sm:text-sm text-on-surface-variant pt-1 max-w-3xl leading-relaxed">
                Drop lecture PDFs, Markdown files, code, or photos of handwritten notes — or simply describe what you want to learn. Study OS builds a complete syllabus, Vault study notes, spaced-repetition flashcards, milestones, and daily study blocks saved directly to your local database.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <button
                type="button"
                onClick={() => restoreDbInputRef.current?.click()}
                className="px-3 py-1.5 rounded bg-surface-high hover:bg-surface-bright border border-outline-variant/40 font-mono text-xs text-on-surface flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Upload className="w-3.5 h-3.5 text-secondary" />
                <span>Open .studyos.json</span>
              </button>
              <input
                ref={restoreDbInputRef}
                type="file"
                accept="application/json,.json"
                onChange={handleRestoreLocalDbFile}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => createQuickVaultNote()}
                className="px-3 py-1.5 rounded bg-surface-low hover:bg-surface-high border border-outline-variant/40 font-mono text-xs text-on-surface-variant hover:text-primary cursor-pointer whitespace-nowrap"
              >
                + Quick Note (Auto-Fetch)
              </button>
              <button
                type="button"
                onClick={() => setShortcutModalOpen(true)}
                className="px-3 py-1.5 rounded bg-surface-low hover:bg-surface-high border border-outline-variant/40 font-mono text-xs text-on-surface-variant hover:text-on-surface flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Keyboard className="w-3.5 h-3.5 text-primary" />
                <span>Shortcuts</span>
              </button>
            </div>
          </div>

          <form onSubmit={handleScratchBuild} className="flex flex-col gap-3.5">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
              <div className="lg:col-span-6 flex flex-col gap-1">
                <label className="font-mono text-[11px] uppercase text-outline">
                  1. What do you want to learn?
                </label>
                <input
                  type="text"
                  value={scratchTopic}
                  onChange={(e) => setScratchTopic(e.target.value)}
                  placeholder="e.g. Linear Algebra & SVD, Organic Chemistry, TypeScript Backend, Macroeconomics..."
                  className="bg-surface-low border border-outline-variant/50 focus:border-primary rounded px-3 py-2 text-xs font-mono text-on-surface placeholder:text-outline focus:outline-none"
                />
              </div>

              <div className="lg:col-span-6 flex flex-col gap-1">
                <label className="font-mono text-[11px] uppercase text-outline">
                  2. Specific Learning Goals (Optional)
                </label>
                <input
                  type="text"
                  value={scratchGoals}
                  onChange={(e) => setScratchGoals(e.target.value)}
                  placeholder="e.g. Build curriculum around my uploaded notes & prepare me for practical problem-solving..."
                  className="bg-surface-low border border-outline-variant/50 focus:border-primary rounded px-3 py-2 text-xs font-mono text-on-surface placeholder:text-outline focus:outline-none"
                />
              </div>
            </div>

            {/* File Attach + Paste Notes + Level Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-low border border-outline-variant/35 rounded p-3">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => scratchFileInputRef.current?.click()}
                  className="px-3 py-1.5 rounded bg-surface-high hover:bg-surface-bright border border-outline-variant/50 font-mono text-xs text-on-surface flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Paperclip className="w-3.5 h-3.5 text-primary" />
                  <span>Upload Notes / PDF / Slides</span>
                </button>
                <input
                  ref={scratchFileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.md,.markdown,.txt,.csv,.json,.tex,.py,.js,.ts,.tsx,.c,.cpp,.java,.rs,.go,.sql,image/png,image/jpeg,image/webp"
                  onChange={(e) => void handleScratchFiles(e.target.files)}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => setScratchShowPaste(!scratchShowPaste)}
                  className={`px-3 py-1.5 rounded border font-mono text-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    scratchShowPaste || scratchNotes.trim()
                      ? "bg-secondary/15 border-secondary/50 text-secondary font-semibold"
                      : "bg-surface-high border-outline-variant/50 text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>
                    {scratchNotes.trim()
                      ? `Pasted Notes (${scratchNotes.trim().split(/\s+/).length}w)`
                      : "Paste Notes Text"}
                  </span>
                </button>

                <select
                  value={scratchLevel}
                  onChange={(e) => setScratchLevel(e.target.value as LearnerLevel)}
                  className="bg-surface-lowest border border-outline-variant/40 rounded px-2.5 py-1.5 font-mono text-xs text-on-surface focus:outline-none"
                >
                  <option value="Beginner">Level: Beginner</option>
                  <option value="Intermediate">Level: Intermediate</option>
                  <option value="Advanced">Level: Advanced</option>
                </select>

                <select
                  value={scratchUnits}
                  onChange={(e) => setScratchUnits(Number(e.target.value))}
                  className="bg-surface-lowest border border-outline-variant/40 rounded px-2.5 py-1.5 font-mono text-xs text-on-surface tabular-nums focus:outline-none"
                >
                  {[3, 4, 5, 6, 7, 8].map((n) => (
                    <option key={n} value={n}>
                      {n} Study Units
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setActiveView(AppView.COURSES)}
                  className="px-3 py-2 rounded bg-surface-highest hover:bg-surface-bright font-mono text-xs text-on-surface cursor-pointer whitespace-nowrap"
                >
                  + Manual Course
                </button>

                <button
                  type="submit"
                  disabled={
                    isScratchBuilding ||
                    (!scratchTopic.trim() && !scratchNotes.trim() && scratchFiles.length === 0)
                  }
                  className="px-5 py-2 rounded bg-primary-container hover:bg-primary disabled:opacity-40 text-on-primary-container font-mono text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shadow-[0_0_14px_rgba(6,182,212,0.28)]"
                >
                  {isScratchBuilding ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Synthesizing Curriculum...</span>
                    </>
                  ) : (
                    <>
                      <BrainCircuit className="w-4 h-4" />
                      <span>Build My Curriculum (+50 XP)</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {scratchFiles.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {scratchFiles.map((f) => (
                  <div
                    key={f.name}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-high border border-primary/35 font-mono text-[11px] text-on-surface"
                  >
                    <FileText className="w-3 h-3 text-primary shrink-0" />
                    <span className="truncate max-w-[200px]">{f.name}</span>
                    <span className="text-outline tabular-nums">({formatByteSize(f.sizeBytes)})</span>
                    <button
                      type="button"
                      onClick={() =>
                        setScratchFiles((prev) => prev.filter((item) => item.name !== f.name))
                      }
                      className="text-outline hover:text-error cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {scratchShowPaste && (
              <textarea
                value={scratchNotes}
                onChange={(e) => setScratchNotes(e.target.value)}
                rows={4}
                placeholder="Paste your own lecture notes, reading excerpts, or syllabus outline here. Gemini will structure a complete multi-unit course, Vault notes, and flashcards around them..."
                className="w-full bg-surface-low border border-outline-variant/50 focus:border-primary rounded p-3 font-mono text-xs text-on-surface placeholder:text-outline focus:outline-none resize-y leading-relaxed"
              />
            )}
          </form>
        </section>
      )}

      {/* SECTION 2: CENTRAL 7:5 SPLIT WORKSPACE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN (7 Cols): ACTIVE COURSE MODULES */}
        <section className="lg:col-span-7 flex flex-col gap-4">
          {/* Header & Segmented Filter */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface-low border border-outline-variant/35 p-3.5 rounded-md">
            <div className="flex items-center gap-2.5">
              <FolderKanban className="w-5 h-5 text-primary shrink-0" />
              <div>
                <h2 className="text-base font-semibold text-on-surface leading-tight">
                  Active Course Modules
                </h2>
                <p className="font-mono text-[11px] text-outline">
                  Click any course to jump to its Vault notes, Kanban board, or flashcards
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 bg-surface-lowest p-1 rounded border border-outline-variant/30 overflow-x-auto">
              {(
                [
                  { id: "all", label: `All (${state.courses.length})` },
                  { id: "in_progress", label: "Active" },
                  { id: "todo", label: "Unstarted" },
                  { id: "mastered", label: "Mastered" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCourseFilter(tab.id)}
                  className={`px-2.5 py-1 rounded font-mono text-[11px] transition-colors cursor-pointer whitespace-nowrap ${
                    courseFilter === tab.id
                      ? "bg-primary-container text-on-primary-container font-semibold"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Course Cards */}
          <div className="flex flex-col gap-3">
            {filteredCourses.length === 0 ? (
              <div className="bg-surface-low border border-outline-variant/35 rounded-md p-8 text-center flex flex-col items-center gap-3">
                <p className="text-sm text-on-surface-variant">
                  {isCleanSlate
                    ? "Your personal course database is currently empty. Use the launchpad above to generate a curriculum from your notes or create a manual course."
                    : "No courses match this status filter yet."}
                </p>
                {!isCleanSlate ? (
                  <button
                    type="button"
                    onClick={() => setCourseFilter("all")}
                    className="px-4 py-2 rounded bg-primary-container text-on-primary-container font-mono text-xs font-semibold cursor-pointer"
                  >
                    Show All Courses
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setActiveView(AppView.GROKOPEDIA)}
                    className="px-4 py-2 rounded bg-primary-container text-on-primary-container font-mono text-xs font-semibold cursor-pointer"
                  >
                    Open Full Notes &amp; Curriculum Studio
                  </button>
                )}
              </div>
            ) : (
              filteredCourses.map((course) => {
                const courseModules = state.modules.filter((m) => m.courseId === course.id);
                const nextUnit =
                  courseModules.find((m) => m.status === "In Progress") ||
                  courseModules.find((m) => m.status === "To Do") ||
                  courseModules[0];
                const pct =
                  course.totalUnits > 0
                    ? Math.round((course.completedUnits / course.totalUnits) * 100)
                    : 0;
                const cardCount = state.flashcards.filter((f) => f.courseId === course.id).length;

                return (
                  <article
                    key={course.id}
                    className="bg-surface-low hover:bg-surface-container border border-outline-variant/35 hover:border-outline-variant/70 transition-colors p-4 rounded-md flex flex-col gap-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 font-mono text-[11px] text-outline flex-wrap">
                          <span className="text-primary font-bold">{course.code}</span>
                          <span>·</span>
                          <span>{course.category}</span>
                          {course.instructor && (
                            <>
                              <span>·</span>
                              <span>{course.instructor}</span>
                            </>
                          )}
                          {course.deadlineLabel && (
                            <>
                              <span>·</span>
                              <span className="text-secondary">{course.deadlineLabel}</span>
                            </>
                          )}
                        </div>
                        <h3 className="text-[17px] font-semibold text-on-surface pt-1 leading-snug">
                          {course.title}
                        </h3>
                        {course.tags.length > 0 && (
                          <div className="font-mono text-[11px] text-outline pt-1 flex items-center gap-1 flex-wrap">
                            {course.tags.map((tag, idx) => (
                              <React.Fragment key={tag}>
                                {idx > 0 && <span className="text-outline/60">·</span>}
                                <button
                                  type="button"
                                  onClick={() => openCourseTagFilter(tag)}
                                  className="hover:text-primary transition-colors cursor-pointer"
                                  title={`Filter courses by #${tag}`}
                                >
                                  #{tag}
                                </button>
                              </React.Fragment>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="font-mono text-xs font-bold tabular-nums shrink-0 text-right">
                        <span className={pct === 100 ? "text-tertiary" : "text-primary"}>
                          {pct}% WORKFLOW
                        </span>
                        <div className="text-[10px] font-normal text-outline">
                          {course.completedUnits}/{course.totalUnits} Units ·{" "}
                          {
                            allMasteries.filter(
                              (m) =>
                                m.courseId === course.id &&
                                (m.level === "proficient" || m.level === "verified_mastery")
                            ).length
                          }{" "}
                          Verified
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="flex flex-col gap-1.5">
                      <div className="w-full bg-surface-highest h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            pct === 100
                              ? "bg-tertiary shadow-[0_0_8px_rgba(78,222,163,0.45)]"
                              : "bg-primary shadow-[0_0_8px_rgba(76,215,246,0.45)]"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      {nextUnit && (
                        <div className="flex items-center justify-between font-mono text-[11px] text-on-surface-variant">
                          <span className="truncate">
                            Active Unit:{" "}
                            <strong className="text-on-surface font-medium">{nextUnit.title}</strong>
                          </span>
                          <span className="text-outline shrink-0 ml-2 tabular-nums">
                            {nextUnit.estimatedHours}h est
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Action Bar */}
                    <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {nextUnit && (
                          <button
                            type="button"
                            onClick={() => openModuleInVault(nextUnit.id)}
                            className="px-3 py-1.5 rounded bg-primary-container hover:bg-primary text-on-primary-container font-mono text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <Play className="w-3.5 h-3.5" />
                            <span>Resume in Vault</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => openCourseInManager(course.id)}
                          className="px-2.5 py-1.5 rounded bg-surface-highest/70 hover:bg-surface-bright text-on-surface font-mono text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <BookOpen className="w-3.5 h-3.5 text-primary" />
                          <span>Syllabus ({course.totalUnits})</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setActiveView(AppView.FLASHCARDS)}
                          className="px-2.5 py-1.5 rounded bg-surface-highest/70 hover:bg-surface-bright text-on-surface font-mono text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <Layers className="w-3.5 h-3.5 text-secondary" />
                          <span>Cards ({cardCount})</span>
                        </button>
                      </div>

                      {nextUnit && nextUnit.status !== "Mastered" && (
                        <button
                          type="button"
                          onClick={() => updateModuleStatus(nextUnit.id, "Mastered")}
                          className="px-2.5 py-1.5 rounded border border-tertiary/40 hover:bg-tertiary/15 text-tertiary font-mono text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Master Unit (+100 XP)</span>
                        </button>
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </div>

          {/* Bottom Activity Log & Achievements Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-surface-lowest border border-outline-variant/35 p-4 rounded-md flex flex-col justify-between gap-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-primary" />
                  Tracked Learning Log
                </span>
                <span className="font-mono text-[11px] text-primary tabular-nums">
                  {state.activityLog.length} events
                </span>
              </div>
              <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                {state.activityLog.slice(0, 4).map((act) => (
                  <div
                    key={act.id}
                    className="flex items-center justify-between gap-2 font-mono text-[11px]"
                  >
                    <span className="text-on-surface-variant truncate">{act.title}</span>
                    {act.xpEarned > 0 ? (
                      <span className="text-tertiary shrink-0 tabular-nums">
                        +{act.xpEarned} XP
                      </span>
                    ) : (
                      <span className="text-outline shrink-0 tabular-nums">
                        {new Date(act.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setActiveView(AppView.TERMINAL)}
                className="font-mono text-[11px] text-primary hover:underline text-right cursor-pointer flex items-center justify-end gap-1"
              >
                <Terminal className="w-3 h-3" />
                <span>Inspect in Terminal CLI →</span>
              </button>
            </div>

            <div className="bg-surface-lowest border border-outline-variant/35 p-4 rounded-md flex flex-col justify-between gap-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-secondary" />
                  Unlocked Milestones
                </span>
                <span className="font-mono text-[11px] text-secondary tabular-nums">
                  {state.achievements.filter((a) => a.unlockedAt).length}/{state.achievements.length}
                </span>
              </div>
              <div className="space-y-1.5">
                {state.achievements.slice(0, 3).map((ach) => (
                  <div key={ach.id} className="flex items-center justify-between font-mono text-[11px]">
                    <span className={ach.unlockedAt ? "text-on-surface" : "text-outline"}>
                      {ach.title}
                    </span>
                    <span className={ach.unlockedAt ? "text-tertiary" : "text-outline"}>
                      {ach.unlockedAt ? "UNLOCKED" : "LOCKED"}
                    </span>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setActiveView(AppView.SETTINGS)}
                className="font-mono text-[11px] text-primary hover:underline text-right cursor-pointer"
              >
                View All Achievements →
              </button>
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN (5 Cols): GROKOPEDIA WIDGET & TIME-BLOCK MATRIX */}
        <section className="lg:col-span-5 flex flex-col gap-4">
          {/* CARD 1: GROKOPEDIA DEEP RESEARCH QUICK ENGINE */}
          <div className="bg-surface-low border border-outline-variant/35 p-4 rounded-md flex flex-col gap-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BrainCircuit className="w-5 h-5 text-primary shrink-0" />
                <div>
                  <h2 className="text-base font-semibold text-on-surface leading-tight">
                    AI Curriculum &amp; Notes Studio
                  </h2>
                  <p className="font-mono text-[11px] text-tertiary">
                    Instant Topic or Uploaded-Notes Synthesis (+50 XP)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveView(AppView.GROKOPEDIA)}
                className="font-mono text-[11px] text-primary hover:underline cursor-pointer whitespace-nowrap"
              >
                Upload Notes →
              </button>
            </div>

            <form onSubmit={handleQuickSynthesize} className="flex flex-col gap-2">
              <div className="relative">
                <textarea
                  value={quickPrompt}
                  onChange={(e) => setQuickPrompt(e.target.value)}
                  rows={3}
                  placeholder="Enter any subject you want to learn to auto-build a structured course, Vault notes & flashcards... (or click 'Upload Notes →' to attach PDFs/files)"
                  className="w-full bg-surface-lowest border border-outline-variant/50 focus:border-primary rounded p-3 pr-11 font-mono text-xs text-on-surface placeholder:text-outline focus:outline-none resize-none"
                />
                <button
                  type="submit"
                  disabled={isSynthesizing || !quickPrompt.trim()}
                  title="Synthesize Curriculum (+50 XP)"
                  className="absolute right-2.5 bottom-2.5 p-2 rounded bg-primary-container hover:bg-primary disabled:opacity-40 text-on-primary-container transition-colors cursor-pointer"
                >
                  {isSynthesizing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {[
                  "Applied Linear Algebra & PCA",
                  "Neuroscience & Synaptic Plasticity",
                  "Distributed Databases & MVCC",
                  "Macroeconomics & Monetary Policy",
                ].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setQuickPrompt(preset)}
                    className="px-2 py-1 rounded bg-surface-high hover:bg-surface-bright font-mono text-[10px] text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer whitespace-nowrap"
                  >
                    + {preset}
                  </button>
                ))}
              </div>
            </form>

            {/* Latest Research Output Preview */}
            {latestResearch && (
              <div className="bg-surface-lowest border border-outline-variant/30 p-3 rounded flex flex-col gap-2">
                <div className="flex items-center justify-between font-mono text-[10px]">
                  <span className="text-primary font-semibold truncate">
                    LATEST SYNTHESIS: {latestResearch.topic}
                  </span>
                  <span className="text-outline shrink-0 ml-2 uppercase">{latestResearch.mode}</span>
                </div>
                <p className="text-xs text-on-surface-variant line-clamp-3 leading-relaxed">
                  {latestResearch.curriculum?.executiveSummary ||
                    latestResearch.report?.executiveSummary}
                </p>
                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => openGrokopediaWithTopic("")}
                    className="font-mono text-[11px] text-primary hover:underline cursor-pointer"
                  >
                    Inspect Full Synthesis →
                  </button>
                  {latestResearch.courseId && (
                    <button
                      type="button"
                      onClick={() => openCourseInManager(latestResearch.courseId!)}
                      className="font-mono text-[11px] text-tertiary hover:underline cursor-pointer"
                    >
                      Open Course Syllabus
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Autonomous Think, Fetch & Note-Taking Status Strip */}
            <div className="bg-surface-lowest border border-outline-variant/30 p-3 rounded flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-on-surface flex items-center gap-2">
                  <span>Autonomous Think &amp; Note-Taking</span>
                  {autonomousAgentStatus.isBusy && (
                    <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />
                  )}
                </div>
                <div className="font-mono text-[10px] text-outline truncate pt-0.5">
                  {autonomousAgentStatus.isBusy
                    ? `Researching & writing notes for "${autonomousAgentStatus.activeModuleTitle}"...`
                    : `Auto-tracks study dwell time & fetches grounded notes (${
                        state.stats.autoFetchedModulesCount || 0
                      } synced)`}
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={state.settings.autonomousAgentEnabled}
                onClick={() =>
                  updateSettings({
                    autonomousAgentEnabled: !state.settings.autonomousAgentEnabled,
                  })
                }
                className={`px-2.5 py-1 rounded font-mono text-[10px] font-semibold cursor-pointer shrink-0 transition-colors ${
                  state.settings.autonomousAgentEnabled
                    ? "bg-primary-container text-on-primary-container"
                    : "bg-surface-high text-outline"
                }`}
              >
                {state.settings.autonomousAgentEnabled ? "Auto: On" : "Paused"}
              </button>
            </div>
          </div>

          {/* CARD 2: TODAY'S TIME-BLOCK MATRIX */}
          <div className="bg-surface-low border border-outline-variant/35 p-4 rounded-md flex flex-col gap-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-5 h-5 text-secondary shrink-0" />
                <h2 className="text-base font-semibold text-on-surface">
                  Today&apos;s Time-Block Matrix
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowAddBlock(!showAddBlock)}
                className="flex items-center gap-1 px-2 py-1 rounded bg-surface-high hover:bg-surface-bright font-mono text-[11px] text-on-surface cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5 text-primary" />
                <span>Add Block</span>
              </button>
            </div>

            {showAddBlock && (
              <form
                onSubmit={handleCreateTimeBlock}
                className="bg-surface-lowest border border-outline-variant/40 p-3 rounded flex flex-col gap-2"
              >
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={newBlockRange}
                    onChange={(e) => setNewBlockRange(e.target.value)}
                    placeholder="19:00 - 20:00"
                    className="col-span-1 bg-surface-low border border-outline-variant/40 rounded px-2 py-1.5 font-mono text-xs text-on-surface focus:outline-none focus:border-primary"
                  />
                  <input
                    type="text"
                    value={newBlockTitle}
                    onChange={(e) => setNewBlockTitle(e.target.value)}
                    placeholder="Session focus goal..."
                    className="col-span-2 bg-surface-low border border-outline-variant/40 rounded px-2 py-1.5 text-xs text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddBlock(false)}
                    className="px-2.5 py-1 rounded font-mono text-[11px] text-outline hover:text-on-surface cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1 rounded bg-primary-container text-on-primary-container font-mono text-[11px] font-semibold cursor-pointer"
                  >
                    Schedule
                  </button>
                </div>
              </form>
            )}

            <div className="flex flex-col gap-2">
              {state.timeBlocks.length === 0 ? (
                <div className="py-5 px-3 rounded bg-surface-lowest border border-outline-variant/30 text-center font-mono text-xs text-outline">
                  No time-blocks scheduled yet. Generate an AI curriculum or click &quot;Add Block&quot; to plan your day.
                </div>
              ) : (
                state.timeBlocks.map((block) => (
                  <div
                    key={block.id}
                    className="flex items-center gap-3 p-3 rounded bg-surface-lowest border border-outline-variant/30 hover:border-outline-variant/60 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={block.completed}
                      onChange={() => toggleTimeBlock(block.id)}
                      className="w-4 h-4 rounded-xs accent-[#06b6d4] cursor-pointer shrink-0"
                    />

                    <div className="flex flex-col font-mono text-[11px] w-24 shrink-0 tabular-nums">
                      <span className="text-on-surface font-semibold">{block.timeRange}</span>
                      <span
                        className={
                          block.accent === "secondary"
                            ? "text-secondary"
                            : block.accent === "tertiary"
                            ? "text-tertiary"
                            : "text-primary"
                        }
                      >
                        {block.durationMinutes}m Block
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (block.moduleId) {
                          openModuleInVault(block.moduleId);
                        } else {
                          setActiveView(AppView.VAULT);
                        }
                      }}
                      className="min-w-0 flex-1 text-left group cursor-pointer"
                    >
                      <div
                        className={`text-[13px] font-medium truncate group-hover:text-primary transition-colors ${
                          block.completed ? "line-through text-outline" : "text-on-surface"
                        }`}
                      >
                        {block.title}
                      </div>
                      <div className="font-mono text-[10px] text-outline truncate">
                        {block.subtitle}
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (block.moduleId) openModuleInVault(block.moduleId);
                        else setActiveView(AppView.POMODORO);
                      }}
                      className="text-outline hover:text-primary p-1 cursor-pointer shrink-0"
                      title="Launch Workspace"
                    >
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Focus Lockdown Toggle */}
            <div className="flex items-center justify-between p-3 rounded bg-surface-lowest border border-outline-variant/30 mt-1">
              <div className="pr-3">
                <div className="text-xs font-semibold text-on-surface">
                  Focus Lockdown Protocol
                </div>
                <div className="font-mono text-[10px] text-outline">
                  Highlight active execution mode &amp; suppress ambient distractions
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={state.settings.focusLockdown}
                onClick={() =>
                  updateSettings({ focusLockdown: !state.settings.focusLockdown })
                }
                className={`w-10 h-5 rounded-xs p-0.5 transition-colors cursor-pointer shrink-0 ${
                  state.settings.focusLockdown ? "bg-primary-container" : "bg-surface-highest"
                }`}
              >
                <div
                  className={`w-4 h-4 bg-white rounded-xs transition-transform ${
                    state.settings.focusLockdown ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
