import React, { useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  ClipboardCheck,
  Compass,
  Database,
  FolderKanban,
  Gamepad2,
  Keyboard,
  Layers,
  RefreshCw,
  TrendingUp,
  X,
} from "lucide-react";
import { useStudyOS } from "../context/StudyOSContext";
import { AppView } from "../types/studyOS";
import { countWords } from "../lib/gamification";
import { formatShortcutBadge, resolveEffectiveShortcuts } from "../lib/shortcuts";

type GuideTab = "quickstart" | "autoupdate" | "controls";

export function StudyGuideModal() {
  const {
    state,
    isGuideModalOpen,
    setGuideModalOpen,
    setActiveView,
    launchIntegrativeLab,
    setShortcutModalOpen,
  } = useStudyOS();

  const [activeTab, setActiveTab] = useState<GuideTab>("quickstart");

  const effectiveShortcuts = useMemo(
    () => resolveEffectiveShortcuts(state.settings.customShortcuts),
    [state.settings.customShortcuts]
  );

  const steps = useMemo(() => {
    const hasCourse = state.courses.length > 0;
    const hasNotes = state.modules.some((m) => countWords(m.notesMarkdown) >= 50);
    const hasLabRun = state.activityLog.some((a) => a.type === "physics_lab_completed");
    const hasReviewedCards =
      (state.stats.totalFlashcardsReviewed || 0) > 0 ||
      state.flashcards.some((f) => Boolean(f.lastReviewedAt));
    const hasTrackedMinutes =
      state.stats.todayMinutesSpent > 0 || (state.stats.totalMinutesStudied || 0) > 0;

    const hasTasksOrQuiz =
      state.tasks.length > 0 || state.assessmentAttempts.length > 0;
    const hasVerifiedEvidence =
      state.assessmentAttempts.length > 0 &&
      (Boolean(state.academicProfile.programme?.trim()) ||
        state.academicProfile.skills.length > 0);

    return [
      {
        num: "01",
        title: "Capture Topics, Syllabi or Raw Notes",
        done: hasCourse,
        where: "Grokopedia Curriculum Builder",
        whatToDo:
          "Type any subject you want to master (e.g., B-Trees, Orbital Mechanics, PID Control, Linear Algebra) or attach your .md, .txt, or .pdf notes. Study OS generates a full multi-unit curriculum with real physics & math equations—whether an AI API is connected or completely offline.",
        ctaLabel: "Open Grokopedia",
        icon: BrainCircuit,
        onGo: () => {
          setGuideModalOpen(false);
          setActiveView(AppView.GROKOPEDIA);
        },
      },
      {
        num: "02",
        title: "Organize Semesters, Units & Syllabus Tags",
        done: hasCourse && state.modules.some((m) => m.status !== "To Do"),
        where: "Course & Syllabus Manager",
        whatToDo:
          "Inspect your units across Kanban, Table, or Matrix views, group by Academic Year & Semester, filter by multi-tags, and non-destructively archive past syllabus items without losing historical attempts.",
        ctaLabel: "Open Syllabus",
        icon: BookOpen,
        onGo: () => {
          setGuideModalOpen(false);
          setActiveView(AppView.COURSES);
        },
      },
      {
        num: "03",
        title: "Study in Vault, Pin Highlights & Map Concepts",
        done: hasNotes,
        where: "Knowledge Vault & Knowledge Map",
        whatToDo:
          "Write Markdown + LaTeX notes alongside lectures and searchable transcripts, pin page/timestamp highlights that promote in 1 click to flashcards or quiz questions, and inspect your Personal Knowledge Map.",
        ctaLabel: "Open Knowledge Vault",
        icon: FolderKanban,
        onGo: () => {
          setGuideModalOpen(false);
          setActiveView(AppView.VAULT);
        },
      },
      {
        num: "04",
        title: "Experiment in the 3D Physics & Math Lab",
        done: hasLabRun,
        where: "3D Integrative Proving Ground",
        whatToDo:
          "Launch the full-screen 3D RK4 Physics & Math simulation calibrated to your active unit. Adjust gravity g, launch speed v₀, drag Cd, and field coupling k, capture Resonance Beacons, and log verified lab derivations.",
        ctaLabel: "Launch 3D Physics Lab",
        icon: Gamepad2,
        onGo: () => {
          setGuideModalOpen(false);
          launchIntegrativeLab();
        },
      },
      {
        num: "05",
        title: "Practise Active Recall & Reload-Safe Focus Sprints",
        done: hasReviewedCards && hasTrackedMinutes,
        where: "Flashcard SRS Deck & Pomodoro",
        whatToDo:
          "Clear your Due Now Leitner 5-box flashcards (exportable to Anki .tsv) and run topic-tagged Focus Sprints with reload-safe session recovery.",
        ctaLabel: "Review Flashcards",
        icon: Layers,
        onGo: () => {
          setGuideModalOpen(false);
          setActiveView(AppView.FLASHCARDS);
        },
      },
      {
        num: "06",
        title: "Schedule Exams, Run Topic Quizzes & Log Scores",
        done: hasTasksOrQuiz,
        where: "Tasks, Exams & Practice Ledger",
        whatToDo:
          "Track dated assignments and exams (rescheduling auto-adjusts Today's Plan and exports to .ics), run grounded Topic Quizzes, and record append-only assessment attempts with error categories.",
        ctaLabel: "Open Tasks & Quizzes",
        icon: ClipboardCheck,
        onGo: () => {
          setGuideModalOpen(false);
          setActiveView(AppView.ASSESSMENTS);
        },
      },
      {
        num: "07",
        title: "Audit Empirical Mastery, Growth & Portfolio",
        done: hasVerifiedEvidence,
        where: "Growth Intelligence & Academic Profile",
        whatToDo:
          "Inspect evidence-gated Topic Mastery ('Not enough evidence yet.' until tested), Weekly/Monthly Reviews, Calibration Gap, and export your verified Evidence Portfolio (.md).",
        ctaLabel: "Open Growth Intelligence",
        icon: TrendingUp,
        onGo: () => {
          setGuideModalOpen(false);
          setActiveView(AppView.GROWTH);
        },
      },
      {
        num: "08",
        title: "Index Remote Lectures, SQLite FTS5 & Concept Graph",
        done: state.modules.some((m) => Boolean(m.videoLink)),
        where: "LearningOS Studio (SQLite + FTS5)",
        whatToDo:
          "Attach remote YouTube/lecture URLs without downloading permanent video, ingest WebVTT/SRT captions (with isolated temp Whisper fallback), search across all transcripts via SQLite FTS5 BM25, ask the cited AI tutor, and explore your Concept Graph.",
        ctaLabel: "Open LearningOS Studio",
        icon: Database,
        onGo: () => {
          setGuideModalOpen(false);
          setActiveView(AppView.LEARNING_OS);
        },
      },
    ];
  }, [state, setGuideModalOpen, setActiveView, launchIntegrativeLab]);

  if (!isGuideModalOpen) return null;

  const completedCount = steps.filter((s) => s.done).length;

  return (
    <div
      className="fixed inset-0 z-[88] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={() => setGuideModalOpen(false)}
    >
      <div
        className="w-full max-w-3xl max-h-[88vh] bg-surface-lowest border border-outline-variant/60 rounded-lg shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-outline-variant/40 bg-surface-low">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded bg-primary-container/20 border border-primary/40 flex items-center justify-center shrink-0 mt-0.5">
              <Compass className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-bold text-on-surface">
                Study OS Walkthrough &amp; Integrative Learning Guide
              </h2>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Where to start, how self-updating works as you study, and how any topic compiles into real 3D physics &amp; math.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setGuideModalOpen(false)}
            aria-label="Close guide"
            className="p-1.5 rounded text-outline hover:text-on-surface hover:bg-surface-high transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Segmented Navigation Tabs */}
        <div className="flex items-center justify-between gap-3 px-6 py-2.5 border-b border-outline-variant/30 bg-surface-lowest">
          <div className="flex items-center gap-1 bg-surface-low p-1 rounded border border-outline-variant/30">
            <button
              type="button"
              onClick={() => setActiveTab("quickstart")}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === "quickstart"
                  ? "bg-primary-container text-on-primary-container font-semibold"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              1. Where to Start ({completedCount}/{steps.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("autoupdate")}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === "autoupdate"
                  ? "bg-primary-container text-on-primary-container font-semibold"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              2. How Self-Updating Works
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("controls")}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === "controls"
                  ? "bg-primary-container text-on-primary-container font-semibold"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              3. Shortcuts &amp; 3D Lab Controls
            </button>
          </div>

          <span className="hidden sm:inline font-mono text-[11px] text-on-surface-variant tabular-nums">
            Progress: {completedCount} of {steps.length} milestones active
          </span>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === "quickstart" && (
            <div className="space-y-3">
              {steps.map((step) => {
                const Icon = step.icon;
                return (
                  <div
                    key={step.num}
                    className={`p-4 rounded-md border transition-colors ${
                      step.done
                        ? "bg-surface-low/80 border-tertiary/40"
                        : "bg-surface-low border-outline-variant/40 hover:border-primary/40"
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className={`w-7 h-7 rounded flex items-center justify-center font-mono text-xs font-bold shrink-0 mt-0.5 ${
                            step.done
                              ? "bg-tertiary/20 text-tertiary border border-tertiary/40"
                              : "bg-surface-high text-primary border border-outline-variant/40"
                          }`}
                        >
                          {step.done ? <CheckCircle2 className="w-4 h-4" /> : step.num}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-semibold text-on-surface">
                              {step.title}
                            </h3>
                            <span className="text-xs text-outline">· {step.where}</span>
                          </div>
                          <p className="text-xs text-on-surface-variant leading-relaxed mt-1">
                            {step.whatToDo}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={step.onGo}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded bg-surface-high hover:bg-primary-container hover:text-on-primary-container border border-outline-variant/40 text-xs font-medium text-on-surface transition-colors cursor-pointer whitespace-nowrap shrink-0 self-start"
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{step.ctaLabel}</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === "autoupdate" && (
            <div className="space-y-4">
              <div className="p-4 rounded-md bg-surface-low border border-outline-variant/40">
                <div className="flex items-center gap-2 text-sm font-semibold text-on-surface">
                  <RefreshCw className="w-4 h-4 text-primary" />
                  <span>Continuous Adaptive Learning Loop</span>
                </div>
                <p className="text-xs text-on-surface-variant leading-relaxed mt-1.5">
                  Study OS is built so you never have to micro-manage trackers, flashcards, or API keys. Every study action feeds back into your curriculum, notes, and 3D lab automatically:
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="p-4 rounded-md bg-surface-low border border-outline-variant/40">
                  <h4 className="text-xs font-semibold text-primary">
                    01. Works Regardless of API (Cloud, Local, or Offline)
                  </h4>
                  <p className="text-xs text-on-surface-variant leading-relaxed mt-1.5">
                    Routes across Gemini, OpenAI, Groq, DeepSeek, Anthropic, or Ollama when configured—and automatically falls back to the built-in First-Principles RK4 Physics &amp; Math Compiler so curriculum, notes, and simulations never fail.
                  </p>
                </div>

                <div className="p-4 rounded-md bg-surface-low border border-outline-variant/40">
                  <h4 className="text-xs font-semibold text-primary">
                    02. Live Note Evolution &amp; Auto-Flashcards
                  </h4>
                  <p className="text-xs text-on-surface-variant leading-relaxed mt-1.5">
                    As you write or expand Markdown notes in the Knowledge Vault, Study OS extracts new headings, equations, and concepts, updates unit tags, and generates fresh active-recall flashcards automatically.
                  </p>
                </div>

                <div className="p-4 rounded-md bg-surface-low border border-outline-variant/40">
                  <h4 className="text-xs font-semibold text-primary">
                    03. Automatic Dwell, Status &amp; Streak Tracking
                  </h4>
                  <p className="text-xs text-on-surface-variant leading-relaxed mt-1.5">
                    Studying in the Vault, Syllabus, Flashcards, or 3D Lab automatically increments daily &amp; weekly minutes, transitions units from To Do to In Progress, maintains your streak, and saves snapshots locally.
                  </p>
                </div>

                <div className="p-4 rounded-md bg-surface-low border border-outline-variant/40">
                  <h4 className="text-xs font-semibold text-primary">
                    04. 3D Lab ↔ Knowledge Vault Sync
                  </h4>
                  <p className="text-xs text-on-surface-variant leading-relaxed mt-1.5">
                    Switching study units re-calibrates the 3D Physics &amp; Math Lab to that unit&apos;s dynamical equations. Saving a lab run appends verified kinetic/potential energy and RK4 trajectory data straight into your notes.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === "controls" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-md bg-surface-low border border-outline-variant/40 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold text-on-surface">
                    Study OS Global Shortcuts
                  </h4>
                  <button
                    type="button"
                    onClick={() => {
                      setGuideModalOpen(false);
                      setShortcutModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-mono text-primary hover:underline cursor-pointer"
                  >
                    <Keyboard className="w-3 h-3" />
                    <span>Customize</span>
                  </button>
                </div>
                <div className="space-y-1.5 text-xs">
                  {[
                    ["Dashboard / Syllabus / Vault / Grokopedia", "Cmd/Ctrl + 1–4"],
                    ["Terminal / Pomodoro / Flashcards / Settings", "Cmd/Ctrl + 5–8"],
                    ["Tasks & Exams / Growth / Profile", "Alt + A / G / P"],
                    ["3D Integrative Physics & Math Lab", formatShortcutBadge(effectiveShortcuts.nav_simulation)],
                    ["Open Command Palette", formatShortcutBadge(effectiveShortcuts.action_command_palette)],
                    ["New Note in Vault", formatShortcutBadge(effectiveShortcuts.action_new_note)],
                    ["Start / Pause Focus Sprint", formatShortcutBadge(effectiveShortcuts.action_focus_session)],
                  ].map(([label, chord]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between gap-2 py-1 border-b border-outline-variant/20 last:border-0"
                    >
                      <span className="text-on-surface-variant">{label}</span>
                      <kbd className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-surface-high text-on-surface shrink-0">
                        {chord}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-md bg-surface-low border border-outline-variant/40 space-y-2.5">
                <h4 className="text-xs font-semibold text-on-surface">
                  3D Physics &amp; Math Proving Ground Controls
                </h4>
                <div className="space-y-1.5 text-xs">
                  {[
                    ["Vector Thrust & Steering", "W A S D / Arrows"],
                    ["Turret Yaw & Elevation Pitch", "Mouse Drag or Q E / R F"],
                    ["Fire 120Hz RK4 Calibration Sphere", "Space / Left Click"],
                    ["Suspension Boost Jump", "Shift"],
                    ["Collapse / Expand Physics Sliders", "H"],
                    ["Mute / Unmute Procedural Synth", "M"],
                    ["Pause / Resume Simulation", "Esc"],
                  ].map(([label, keyText]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between gap-2 py-1 border-b border-outline-variant/20 last:border-0"
                    >
                      <span className="text-on-surface-variant">{label}</span>
                      <kbd className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-surface-high text-primary shrink-0">
                        {keyText}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-3.5 border-t border-outline-variant/40 bg-surface-low">
          <span className="text-xs text-on-surface-variant">
            Tip: Press <kbd className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-surface-high text-on-surface">{formatShortcutBadge(effectiveShortcuts.action_command_palette)}</kbd> anytime to search topics, notes, or launch the 3D Lab.
          </span>
          <button
            type="button"
            onClick={() => setGuideModalOpen(false)}
            className="px-4 py-2 rounded bg-primary-container text-on-primary-container text-xs font-semibold cursor-pointer"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
}
