import React, { useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Layers,
  Loader2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Terminal as TerminalIcon,
  Timer,
  Trash2,
  Upload,
} from "lucide-react";
import { useStudyOS } from "../../context/StudyOSContext";
import {
  formatSecondsToTimestamp,
  getLevelProgress,
  getTodayDateString,
} from "../../lib/gamification";
import { getDueFlashcards } from "../../lib/growthIntelligence";
import { runAllUnitTests } from "../../lib/gamification.test";
import { generateGrokopediaCurriculum, runVaultAIAssist } from "../../services/aiService";
import { deriveFsrsStateFromFlashcard, parseAnkiTsvImport } from "../../lib/fsrsScheduler";
import { DEFAULT_LEARNINGOS_APP_MANIFESTS } from "../../lib/appHostToolBus";
import { queryFtsSearchApi } from "../../services/learningOSService";

/* ============================================================================
 * 1. TERMINAL CLI VIEW
 * ========================================================================== */
interface CliLine {
  id: string;
  type: "cmd" | "out" | "ok" | "err";
  text: string;
}

export function TerminalCLIView() {
  const {
    state,
    openModuleInVault,
    updateModuleStatus,
    ingestGeneratedCurriculum,
    logStudyMinutes,
    exportBackup,
    exportPortfolio,
    exportAnkiDeck,
    exportCalendarIcs,
  } = useStudyOS();

  const [lines, setLines] = useState<CliLine[]>([
    { id: "init-1", type: "ok", text: "Study OS Interactive Shell Ready — Type 'help' to inspect commands." },
    { id: "init-2", type: "out", text: "Try 'status', 'courses', 'ls', 'test', or 'grok <topic>'." },
  ]);
  const [input, setInput] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const appendLines = (newEntries: Array<{ type: CliLine["type"]; text: string }>) => {
    setLines((prev) => [
      ...prev,
      ...newEntries.map((e, idx) => ({
        id: `ln-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
        ...e,
      })),
    ]);
    window.setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 30);
  };

  const executeCommand = async (rawCmd: string) => {
    const trimmed = rawCmd.trim();
    if (!trimmed) return;

    appendLines([{ type: "cmd", text: `$ ${trimmed}` }]);
    const [verb, ...rest] = trimmed.split(/\s+/);
    const arg = rest.join(" ");

    switch (verb.toLowerCase()) {
      case "help":
        appendLines([
          { type: "out", text: "Available Study OS Commands:" },
          { type: "out", text: "  status            Show Streak, XP, Level & Daily Focus telemetry" },
          { type: "out", text: "  courses           List all active courses & mastery progress" },
          { type: "out", text: "  ls [code]         List syllabus modules (optionally filter by course code)" },
          { type: "out", text: "  open <index>      Open module # in Knowledge Vault (from 'ls' index)" },
          { type: "out", text: "  complete <index>  Mark module # Mastered (+100 XP)" },
          { type: "out", text: "  log <minutes>     Record study minutes (e.g. 'log 30')" },
          { type: "out", text: "  grok <topic>      Synthesize AI curriculum (+50 XP)" },
          { type: "out", text: "  activity          Inspect recent tracked learning events" },
          { type: "out", text: "  test              Run XP, Streak, Clean-Slate & Growth OS unit tests" },
          { type: "out", text: "  export            Save .studyos.json local database file" },
          { type: "out", text: "  export-ics        Export deadlines & study plan as iCalendar (.ics)" },
          { type: "out", text: "  export-portfolio  Export verified Evidence Portfolio (.md)" },
          { type: "out", text: "  export-anki       Export Leitner flashcards for Anki (.tsv)" },
          { type: "out", text: "  apps              List LearningOS AppRegistry manifests & capabilities" },
          { type: "out", text: "  fts <query>       Search SQLite FTS5 BM25 index across lectures & notes" },
          { type: "out", text: "  clear             Clear terminal buffer" },
        ]);
        break;

      case "clear":
        setLines([]);
        break;

      case "status": {
        const lvl = getLevelProgress(state.stats.currentXP);
        appendLines([
          {
            type: "ok",
            text: `STREAK: ${state.stats.streakCount} Days  |  LEVEL: ${lvl.level} (${lvl.tierName})`,
          },
          {
            type: "out",
            text: `XP: ${lvl.currentXP} / ${lvl.nextLevelXP} (${lvl.progressPercent}%)  |  TODAY FOCUS: ${state.stats.todayMinutesSpent}/${state.stats.dailyGoalMinutes} min`,
          },
        ]);
        break;
      }

      case "courses":
        if (state.courses.length === 0) {
          appendLines([
            {
              type: "out",
              text: "  0 courses in workspace. Run 'grok <subject>' or upload notes in Curriculum Studio.",
            },
          ]);
        } else {
          appendLines(
            state.courses.map((c) => ({
              type: "out" as const,
              text: `  [${c.code}] ${c.title} — ${c.completedUnits}/${c.totalUnits} Mastered`,
            }))
          );
        }
        break;

      case "activity":
        appendLines(
          state.activityLog.slice(0, 10).map((a) => ({
            type: a.xpEarned > 0 ? ("ok" as const) : ("out" as const),
            text: `  [${new Date(a.timestamp).toLocaleTimeString()}] ${a.title}${
              a.xpEarned > 0 ? ` (+${a.xpEarned} XP)` : ""
            }`,
          }))
        );
        break;

      case "ls": {
        const codeFilter = arg.toUpperCase();
        const list = state.modules.filter((m) => {
          if (!codeFilter) return true;
          const c = state.courses.find((course) => course.id === m.courseId);
          return c?.code.toUpperCase() === codeFilter;
        });
        if (list.length === 0) {
          appendLines([{ type: "err", text: `No modules found${codeFilter ? ` for ${codeFilter}` : ""}.` }]);
        } else {
          appendLines(
            list.map((m, i) => {
              const globalIdx = state.modules.findIndex((x) => x.id === m.id) + 1;
              const c = state.courses.find((course) => course.id === m.courseId);
              return {
                type: m.status === "Mastered" ? ("ok" as const) : ("out" as const),
                text: `  #${globalIdx} [${c?.code || "CE"}] (${m.status}) ${m.title}`,
              };
            })
          );
        }
        break;
      }

      case "open": {
        const idx = parseInt(arg.replace(/^#/, ""), 10) - 1;
        const mod = state.modules[idx];
        if (!mod) {
          appendLines([{ type: "err", text: "Invalid module index. Run 'ls' first (e.g. 'open 1')." }]);
        } else {
          appendLines([{ type: "ok", text: `Opening "${mod.title}" in Knowledge Vault...` }]);
          openModuleInVault(mod.id);
        }
        break;
      }

      case "complete": {
        const idx = parseInt(arg.replace(/^#/, ""), 10) - 1;
        const mod = state.modules[idx];
        if (!mod) {
          appendLines([{ type: "err", text: "Invalid module index. Run 'ls' first (e.g. 'complete 2')." }]);
        } else {
          updateModuleStatus(mod.id, "Mastered");
          appendLines([{ type: "ok", text: `Marked Mastered: "${mod.title}" (+100 XP)` }]);
        }
        break;
      }

      case "log": {
        const mins = parseInt(arg, 10);
        if (Number.isNaN(mins) || mins <= 0) {
          appendLines([{ type: "err", text: "Usage: log <minutes> (e.g. 'log 45')" }]);
        } else {
          logStudyMinutes(mins, `Terminal CLI Log (+${mins}m)`);
          appendLines([{ type: "ok", text: `Logged +${mins} minutes to Focus Telemetry.` }]);
        }
        break;
      }

      case "test": {
        const report = runAllUnitTests();
        appendLines([
          {
            type: report.failed === 0 ? "ok" : "err",
            text: `Executed ${report.total} Unit Assertions: ${report.passed} PASSED, ${report.failed} FAILED`,
          },
          ...report.results.map((r) => ({
            type: r.passed ? ("ok" as const) : ("err" as const),
            text: `  [${r.passed ? "PASS" : "FAIL"}] ${r.name} (${r.detail})`,
          })),
        ]);
        break;
      }

      case "export":
        exportBackup();
        appendLines([{ type: "ok", text: "Exported Study OS JSON backup snapshot." }]);
        break;

      case "export-ics":
        exportCalendarIcs();
        appendLines([{ type: "ok", text: "Exported RFC 5545 Academic Calendar (.ics)." }]);
        break;

      case "export-portfolio":
        exportPortfolio();
        appendLines([{ type: "ok", text: "Exported Evidence-Backed Student Portfolio (.md)." }]);
        break;

      case "export-anki":
        exportAnkiDeck();
        appendLines([{ type: "ok", text: "Exported Anki Spaced-Repetition Deck (.tsv)." }]);
        break;

      case "apps":
        appendLines(
          DEFAULT_LEARNINGOS_APP_MANIFESTS.map((m) => ({
            type: m.enabledByDefault ? ("ok" as const) : ("out" as const),
            text: `  [${m.id}] ${m.name} (${m.runtime}) — ${
              m.enabledByDefault ? "ENABLED" : "OPT-IN"
            } · ${m.requiredCapabilities.join(", ")}`,
          }))
        );
        break;

      case "fts": {
        if (!arg) {
          appendLines([{ type: "err", text: "Usage: fts <query> (e.g. 'fts population inversion')" }]);
          break;
        }
        setIsBusy(true);
        try {
          const ftsRes = await queryFtsSearchApi(arg);
          appendLines([
            {
              type: "ok",
              text: `SQLite FTS5 returned ${ftsRes.results.length} hits in ${ftsRes.elapsedMs} ms:`,
            },
            ...ftsRes.results.slice(0, 8).map((r) => ({
              type: "out" as const,
              text: `  [${r.entityType}] ${r.title}${
                r.startMs !== null && r.startMs !== undefined
                  ? ` @ ${Math.floor(r.startMs / 1000)}s`
                  : ""
              } — ${r.snippet}`,
            })),
          ]);
        } catch (err: unknown) {
          appendLines([
            {
              type: "err",
              text: err instanceof Error ? err.message : "SQLite FTS5 query failed.",
            },
          ]);
        } finally {
          setIsBusy(false);
        }
        break;
      }

      case "grok": {
        if (!arg) {
          appendLines([{ type: "err", text: "Usage: grok <topic> (e.g. 'grok B-Tree Indexing')" }]);
          break;
        }
        setIsBusy(true);
        appendLines([{ type: "out", text: `Synthesizing Deep Curriculum for "${arg}" via Gemini...` }]);
        try {
          const { curriculum, model } = await generateGrokopediaCurriculum({
            topic: arg,
            model: state.settings.selectedModel,
          });
          ingestGeneratedCurriculum(curriculum, arg, model);
          appendLines([
            {
              type: "ok",
              text: `Synthesized [${curriculum.courseCode}] ${curriculum.courseTitle} (${curriculum.units.length} units) · +50 XP!`,
            },
          ]);
        } catch (err: unknown) {
          appendLines([
            {
              type: "err",
              text: err instanceof Error ? err.message : "Synthesis failed.",
            },
          ]);
        } finally {
          setIsBusy(false);
        }
        break;
      }

      default:
        appendLines([
          { type: "err", text: `Unknown command '${verb}'. Type 'help' for available commands.` },
        ]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isBusy || !input.trim()) return;
    const cmd = input;
    setInput("");
    void executeCommand(cmd);
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="bg-surface-lowest border border-outline-variant/40 rounded-md p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <TerminalIcon className="w-5 h-5 text-primary" />
          <div>
            <h1 className="text-lg font-semibold text-on-surface">Study OS Terminal CLI</h1>
            <p className="font-mono text-xs text-outline">
              Execute syllabus queries, run automated unit tests, or trigger Grokopedia synthesis
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {["status", "courses", "activity", "ls", "test"].map((qCmd) => (
            <button
              key={qCmd}
              type="button"
              onClick={() => void executeCommand(qCmd)}
              className="px-2.5 py-1 rounded bg-surface-high hover:bg-primary hover:text-on-primary font-mono text-xs text-on-surface transition-colors cursor-pointer"
            >
              {qCmd}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-surface-lowest border border-outline-variant/50 rounded-md p-4 flex flex-col gap-3 min-h-[480px]">
        <div className="flex-1 overflow-y-auto space-y-1.5 font-mono text-xs max-h-[55vh] pr-1">
          {lines.map((line) => (
            <div
              key={line.id}
              className={
                line.type === "cmd"
                  ? "text-primary font-semibold pt-1"
                  : line.type === "ok"
                  ? "text-tertiary"
                  : line.type === "err"
                  ? "text-error"
                  : "text-on-surface-variant"
              }
            >
              {line.text}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 pt-3 border-t border-outline-variant/30"
        >
          <span className="font-mono text-xs text-primary font-bold select-none">study-os$</span>
          <input
            type="text"
            value={input}
            disabled={isBusy}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isBusy ? "Running inference..." : "Enter command (type 'help' or 'test')..."}
            className="flex-1 bg-transparent font-mono text-xs text-on-surface placeholder:text-outline focus:outline-none"
          />
          <button
            type="submit"
            disabled={isBusy || !input.trim()}
            className="px-3 py-1 rounded bg-primary-container text-on-primary-container font-mono text-xs font-bold disabled:opacity-40 cursor-pointer"
          >
            Run
          </button>
        </form>
      </div>
    </div>
  );
}

/* ============================================================================
 * 2. POMODORO FOCUS GRID VIEW
 * ========================================================================== */
export function PomodoroFocusView() {
  const {
    state,
    pomodoro,
    startOrPausePomodoro,
    resetPomodoro,
    setPomodoroCourse,
    setPomodoroModule,
    logStudyMinutes,
  } = useStudyOS();

  const [manualMins, setManualMins] = useState("30");

  const progressRatio =
    pomodoro.totalSeconds > 0
      ? ((pomodoro.totalSeconds - pomodoro.remainingSeconds) / pomodoro.totalSeconds) * 100
      : 0;

  const isInterruptedSprint =
    !pomodoro.isRunning &&
    pomodoro.remainingSeconds > 0 &&
    pomodoro.remainingSeconds < pomodoro.totalSeconds;

  const availableModules = useMemo(() => {
    return state.modules.filter(
      (m) => !m.archived && (!pomodoro.linkedCourseId || m.courseId === pomodoro.linkedCourseId)
    );
  }, [state.modules, pomodoro.linkedCourseId]);

  const presets = [
    { label: "25m Sprint", mins: 25, mode: "focus" as const },
    { label: "50m Deep Work", mins: 50, mode: "focus" as const },
    { label: "90m Lab Block", mins: 90, mode: "focus" as const },
    { label: "5m Short Rest", mins: 5, mode: "break" as const },
    { label: "15m Recovery", mins: 15, mode: "break" as const },
  ];

  const today = getTodayDateString();
  const goalPct = Math.min(
    100,
    Math.round((state.stats.todayMinutesSpent / Math.max(1, state.stats.dailyGoalMinutes)) * 100)
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start w-full">
      {/* Main Timer Console */}
      <section className="lg:col-span-7 bg-surface-lowest border border-outline-variant/40 rounded-md p-6 flex flex-col items-center gap-6">
        <div className="w-full flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-mono text-xs text-primary font-semibold uppercase">
            <Timer className="w-4 h-4" />
            <span>{pomodoro.mode === "focus" ? "Deep Focus Sprint" : "Cognitive Recovery Break"}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={pomodoro.linkedCourseId}
              onChange={(e) => {
                setPomodoroCourse(e.target.value);
                setPomodoroModule("");
              }}
              className="bg-surface-low border border-outline-variant/40 rounded px-2.5 py-1 font-mono text-xs text-on-surface focus:outline-none"
            >
              <option value="">Course: General Study</option>
              {state.courses
                .filter((c) => !c.archived)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.title}
                  </option>
                ))}
            </select>
            <select
              value={pomodoro.linkedModuleId || ""}
              onChange={(e) => setPomodoroModule(e.target.value)}
              className="bg-surface-low border border-outline-variant/40 rounded px-2.5 py-1 font-mono text-xs text-on-surface max-w-[220px] focus:outline-none"
            >
              <option value="">Topic: Any Syllabus Unit</option>
              {availableModules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isInterruptedSprint && (
          <div className="w-full px-3.5 py-2 rounded bg-surface-low border border-secondary/40 flex items-center justify-between gap-2 font-mono text-xs text-secondary">
            <span>
              Paused session preserved ({formatSecondsToTimestamp(pomodoro.remainingSeconds)} remaining) · Safe against refresh or duplicate submission.
            </span>
          </div>
        )}

        {/* Preset Selector */}
        <div className="flex flex-wrap justify-center gap-2">
          {presets.map((p) => {
            const active = pomodoro.totalSeconds === p.mins * 60 && pomodoro.mode === p.mode;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => resetPomodoro(p.mins, p.mode)}
                className={`px-3 py-1.5 rounded font-mono text-xs transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? "bg-primary-container text-on-primary-container font-bold"
                    : "bg-surface-low hover:bg-surface-high text-on-surface-variant"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {/* Big Segmented Clock */}
        <div className="py-6 text-center">
          <div className="font-mono text-6xl sm:text-7xl font-bold text-on-surface tabular-nums tracking-tight">
            {formatSecondsToTimestamp(pomodoro.remainingSeconds)}
          </div>
          <p className="font-mono text-xs text-outline pt-2">
            Completing a Focus Sprint logs an idempotent session record &amp; awards +15 XP (passive study time never inflates topic mastery)
          </p>
        </div>

        <div className="w-full max-w-md bg-surface-highest h-2 rounded-full overflow-hidden">
          <div
            className="bg-primary h-full rounded-full transition-all duration-300"
            style={{ width: `${progressRatio}%` }}
          />
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={startOrPausePomodoro}
            className="px-6 py-2.5 rounded bg-primary-container hover:bg-primary text-on-primary-container font-mono text-xs font-bold flex items-center gap-2 cursor-pointer shadow-[0_0_16px_rgba(6,182,212,0.3)] whitespace-nowrap"
          >
            {pomodoro.isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            <span>
              {pomodoro.isRunning
                ? "PAUSE TIMER"
                : isInterruptedSprint
                ? "RESUME SPRINT"
                : "START SPRINT"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => resetPomodoro()}
            className="px-4 py-2.5 rounded bg-surface-low hover:bg-surface-high border border-outline-variant/40 font-mono text-xs text-on-surface flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>
      </section>

      {/* Right Column: Manual Session Logger, Daily Goal & Session History */}
      <section className="lg:col-span-5 bg-surface-low border border-outline-variant/35 rounded-md p-5 flex flex-col gap-5">
        <div>
          <span className="font-mono text-xs uppercase tracking-wider text-on-surface-variant font-semibold">
            Daily Study Goal Progress ({today})
          </span>
          <div className="flex items-baseline justify-between pt-2 tabular-nums">
            <span className="font-mono text-3xl font-bold text-on-surface">
              {state.stats.todayMinutesSpent}{" "}
              <span className="text-sm text-outline font-normal">
                / {state.stats.dailyGoalMinutes} min
              </span>
            </span>
            <span className="font-mono text-xs font-bold text-tertiary">{goalPct}%</span>
          </div>
          <div className="w-full bg-surface-highest h-2 rounded-full overflow-hidden mt-2">
            <div className="bg-tertiary h-full rounded-full" style={{ width: `${goalPct}%` }} />
          </div>
          <div className="flex items-center justify-between font-mono text-[11px] text-outline pt-2 tabular-nums">
            <span>
              {state.stats.focusSprintsToday} focus sprints today ({state.stats.totalFocusSprints} total)
            </span>
            <span>{state.stats.totalMinutesStudied}m lifetime</span>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const mins = parseInt(manualMins, 10);
            if (!Number.isNaN(mins) && mins > 0) {
              logStudyMinutes(mins, "Manual Deep Work Log", {
                courseId: pomodoro.linkedCourseId || undefined,
                moduleId: pomodoro.linkedModuleId || undefined,
              });
            }
          }}
          className="bg-surface-lowest border border-outline-variant/35 rounded p-4 flex flex-col gap-3"
        >
          <span className="font-mono text-xs text-on-surface font-semibold">
            Log Offline Lab / Textbook Study Time
          </span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="5"
              max="300"
              value={manualMins}
              onChange={(e) => setManualMins(e.target.value)}
              className="w-24 bg-surface-low border border-outline-variant/40 rounded px-3 py-1.5 font-mono text-xs text-on-surface tabular-nums focus:outline-none focus:border-primary"
            />
            <span className="font-mono text-xs text-outline">minutes</span>
            <button
              type="submit"
              className="ml-auto px-4 py-1.5 rounded bg-surface-high hover:bg-primary hover:text-on-primary font-mono text-xs font-semibold text-on-surface transition-colors cursor-pointer whitespace-nowrap"
            >
              Log Session (+15 XP)
            </button>
          </div>
        </form>

        {/* Persistent Study Session Ledger */}
        <div className="bg-surface-lowest border border-outline-variant/35 rounded p-4 flex flex-col gap-2.5">
          <div className="flex items-center justify-between font-mono text-xs">
            <span className="text-on-surface font-semibold">Recorded Study Sessions</span>
            <span className="text-outline tabular-nums">{state.studySessions.length} logged</span>
          </div>
          {state.studySessions.length === 0 ? (
            <p className="font-mono text-[11px] text-outline">
              No study sessions recorded yet. Start a focus sprint or log offline textbook study time above.
            </p>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
              {state.studySessions.slice(0, 10).map((sess) => {
                const c = state.courses.find((course) => course.id === sess.courseId);
                const m = state.modules.find((mod) => mod.id === sess.moduleId);
                return (
                  <div
                    key={sess.id}
                    className="flex items-center justify-between gap-2 py-1 border-b border-outline-variant/20 last:border-b-0 font-mono text-[11px]"
                  >
                    <div className="min-w-0">
                      <div className="text-on-surface truncate">
                        {m ? m.title : c ? `${c.code} — ${c.title}` : sess.label}
                      </div>
                      <div className="text-[10px] text-outline">
                        {sess.kind.replace(/_/g, " ")} ·{" "}
                        {new Date(sess.endedAt).toLocaleDateString()}
                      </div>
                    </div>
                    <span className="text-primary font-semibold tabular-nums shrink-0">
                      {sess.durationMinutes}m
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/* ============================================================================
 * 3. FLASHCARD DECK VIEW
 * ========================================================================== */
export function FlashcardDeckView() {
  const {
    state,
    createCourse,
    addFlashcardsBatch,
    reviewFlashcard,
    deleteFlashcard,
    exportAnkiDeck,
    pushToast,
  } = useStudyOS();

  const [courseFilter, setCourseFilter] = useState<string>("all");
  const [dueMode, setDueMode] = useState<"all" | "due" | "new" | "learning" | "weak">("all");
  const [cardIndex, setCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCourseId, setNewCourseId] = useState(state.courses[0]?.id || "");
  const [newQuestion, setNewQuestion] = useState("");
  const [newAnswer, setNewAnswer] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const ankiImportRef = useRef<HTMLInputElement | null>(null);

  const courseFilteredCards = useMemo(() => {
    return state.flashcards.filter(
      (f) => courseFilter === "all" || f.courseId === courseFilter
    );
  }, [state.flashcards, courseFilter]);

  const dueCards = useMemo(
    () => getDueFlashcards(courseFilteredCards),
    [courseFilteredCards]
  );

  const newCards = useMemo(
    () =>
      courseFilteredCards.filter(
        (c) => deriveFsrsStateFromFlashcard(c).cardState === "new"
      ),
    [courseFilteredCards]
  );

  const learningCards = useMemo(
    () =>
      courseFilteredCards.filter((c) => {
        const st = deriveFsrsStateFromFlashcard(c).cardState;
        return st === "learning" || st === "relearning";
      }),
    [courseFilteredCards]
  );

  const weakCards = useMemo(
    () =>
      courseFilteredCards.filter((c) => {
        const fsrs = deriveFsrsStateFromFlashcard(c);
        return fsrs.lapses >= 1 || c.box <= 2;
      }),
    [courseFilteredCards]
  );

  const deck =
    dueMode === "due"
      ? dueCards
      : dueMode === "new"
      ? newCards
      : dueMode === "learning"
      ? learningCards
      : dueMode === "weak"
      ? weakCards
      : courseFilteredCards;

  const safeIdx = deck.length > 0 ? Math.min(cardIndex, deck.length - 1) : 0;
  const currentCard = deck[safeIdx] || null;
  const currentFsrs = useMemo(
    () => (currentCard ? deriveFsrsStateFromFlashcard(currentCard) : null),
    [currentCard]
  );
  const currentCourse = state.courses.find((c) => c.id === currentCard?.courseId);

  const handleImportAnkiTsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let targetCourseId =
        (courseFilter !== "all" ? courseFilter : state.courses[0]?.id) || "";
      const parsed = parseAnkiTsvImport(String(reader.result || ""), targetCourseId || "ANK-101");
      if (parsed.length === 0) {
        pushToast({
          title: "No Valid Anki Rows Found",
          subtitle: "Ensure file contains tab-separated Front and Back columns.",
          variant: "error",
        });
      } else {
        if (!targetCourseId) {
          const created = createCourse({
            code: "ANK-101",
            title: "Imported Anki Deck",
            category: "Spaced Repetition",
            tags: ["anki-import"],
          });
          targetCourseId = created.id;
        }
        addFlashcardsBatch(
          parsed.map((row) => ({
            courseId: targetCourseId,
            question: row.question,
            answer: row.answer,
          }))
        );
      }
      if (ankiImportRef.current) ankiImportRef.current.value = "";
    };
    reader.readAsText(file);
  };

  const handleRate = (rating: "again" | "hard" | "good" | "easy") => {
    if (!currentCard) return;
    reviewFlashcard(currentCard.id, rating);
    setIsFlipped(false);
    setCardIndex((prev) => (deck.length > 1 ? (prev + 1) % deck.length : 0));
  };

  const handleAddCard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newQuestion.trim() || !newAnswer.trim()) return;
    let targetCourseId = newCourseId || state.courses[0]?.id;
    if (!targetCourseId) {
      const created = createCourse({
        code: "STD-101",
        title: "Personal Flashcard Deck",
        category: "Active Recall",
        tags: ["flashcards"],
      });
      targetCourseId = created.id;
    }
    addFlashcardsBatch([
      {
        courseId: targetCourseId,
        question: newQuestion,
        answer: newAnswer,
      },
    ]);
    setNewQuestion("");
    setNewAnswer("");
    setShowAddForm(false);
  };

  const handleAIGenerateCards = async () => {
    if (isGenerating) return;
    const targetCourse =
      state.courses.find((c) => c.id === courseFilter) || state.courses[0];
    if (!targetCourse) return;
    const sampleMods = state.modules.filter((m) => m.courseId === targetCourse.id);
    const combinedNotes = sampleMods
      .map((m) => `### ${m.title}\n${m.notesMarkdown}`)
      .join("\n\n")
      .slice(0, 4000);

    setIsGenerating(true);
    try {
      const res = await runVaultAIAssist({
        action: "flashcards",
        moduleTitle: `${targetCourse.code}: ${targetCourse.title}`,
        notesMarkdown: combinedNotes || targetCourse.title,
        model: state.settings.selectedModel,
      });
      if (res.cards && res.cards.length > 0) {
        addFlashcardsBatch(
          res.cards.map((c) => ({
            courseId: targetCourse.id,
            question: c.question,
            answer: c.answer,
          }))
        );
      }
    } catch (err: unknown) {
      pushToast({
        title: "Flashcard Generation Failed",
        subtitle: err instanceof Error ? err.message : "Could not synthesize flashcards.",
        variant: "error",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 w-full">
      {/* Header */}
      <div className="bg-surface-lowest border border-outline-variant/40 rounded-md p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Layers className="w-5 h-5 text-secondary" />
          <div>
            <h1 className="text-lg font-semibold text-on-surface">
              Spaced Repetition Flashcard Deck
            </h1>
            <p className="font-mono text-xs text-outline tabular-nums">
              Leitner spaced intervals · Due now: {dueCards.length} · Reviewed today:{" "}
              {state.stats.flashcardsReviewedToday} ({state.stats.totalFlashcardsReviewed} total)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-surface-low border border-outline-variant/40 p-1 rounded flex-wrap">
            {(
              [
                { id: "all", label: `All (${courseFilteredCards.length})` },
                { id: "due", label: `Due (${dueCards.length})` },
                { id: "new", label: `New (${newCards.length})` },
                { id: "learning", label: `Learning (${learningCards.length})` },
                { id: "weak", label: `Weak (${weakCards.length})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setDueMode(tab.id);
                  setCardIndex(0);
                }}
                className={`px-2 py-1 rounded font-mono text-xs cursor-pointer whitespace-nowrap tabular-nums ${
                  dueMode === tab.id
                    ? tab.id === "due"
                      ? "bg-secondary text-on-secondary font-semibold"
                      : "bg-primary-container text-on-primary-container font-semibold"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <select
            value={courseFilter}
            onChange={(e) => {
              setCourseFilter(e.target.value);
              setCardIndex(0);
              setIsFlipped(false);
            }}
            className="bg-surface-low border border-outline-variant/40 rounded px-3 py-1.5 font-mono text-xs text-on-surface focus:outline-none"
          >
            <option value="all">All Courses ({state.flashcards.length})</option>
            {state.courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.title}
              </option>
            ))}
          </select>

          <input
            ref={ankiImportRef}
            type="file"
            accept=".tsv,.txt,text/tab-separated-values,text/plain"
            onChange={handleImportAnkiTsv}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => ankiImportRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-surface-high hover:bg-surface-bright border border-outline-variant/40 font-mono text-xs text-on-surface cursor-pointer whitespace-nowrap"
          >
            <Upload className="w-3.5 h-3.5 text-primary" />
            <span>Import Anki (.tsv)</span>
          </button>

          <button
            type="button"
            disabled={courseFilteredCards.length === 0}
            onClick={() => exportAnkiDeck(courseFilter === "all" ? undefined : courseFilter)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-surface-high hover:bg-surface-bright border border-outline-variant/40 font-mono text-xs text-on-surface disabled:opacity-40 cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-primary" />
            <span>Export Anki (.tsv)</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-surface-high hover:bg-surface-bright font-mono text-xs text-on-surface cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5 text-primary" />
            <span>New Card</span>
          </button>

          <button
            type="button"
            disabled={isGenerating}
            onClick={handleAIGenerateCards}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-primary-container hover:bg-primary text-on-primary-container font-mono text-xs font-bold cursor-pointer whitespace-nowrap disabled:opacity-40"
          >
            {isGenerating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            <span>AI Generate 4 Cards</span>
          </button>
        </div>
      </div>

      {showAddForm && (
        <form
          onSubmit={handleAddCard}
          className="bg-surface-low border border-outline-variant/40 rounded-md p-4 flex flex-col gap-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select
              value={newCourseId}
              onChange={(e) => setNewCourseId(e.target.value)}
              className="bg-surface-lowest border border-outline-variant/40 rounded px-3 py-2 font-mono text-xs text-on-surface"
            >
              {state.courses.length === 0 ? (
                <option value="">Auto-create Personal Deck Course</option>
              ) : (
                state.courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.title}
                  </option>
                ))
              )}
            </select>
            <input
              type="text"
              required
              value={newQuestion}
              onChange={(e) => setNewQuestion(e.target.value)}
              placeholder="Front question..."
              className="sm:col-span-2 bg-surface-lowest border border-outline-variant/40 rounded px-3 py-2 text-xs text-on-surface focus:outline-none focus:border-primary"
            />
          </div>
          <textarea
            required
            rows={2}
            value={newAnswer}
            onChange={(e) => setNewAnswer(e.target.value)}
            placeholder="Back technical explanation..."
            className="bg-surface-lowest border border-outline-variant/40 rounded px-3 py-2 text-xs text-on-surface focus:outline-none focus:border-primary"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 font-mono text-xs text-outline hover:text-on-surface cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded bg-primary-container text-on-primary-container font-mono text-xs font-bold cursor-pointer"
            >
              Save Card
            </button>
          </div>
        </form>
      )}

      {/* Active Flashcard */}
      {!currentCard ? (
        <div className="bg-surface-lowest border border-outline-variant/40 rounded-md p-12 text-center">
          <p className="text-sm text-outline">No flashcards in this filter. Click &quot;AI Generate 4 Cards&quot; above!</p>
        </div>
      ) : (
        <div className="max-w-3xl mx-auto w-full flex flex-col gap-4">
          <div
            onClick={() => setIsFlipped(!isFlipped)}
            className="bg-surface-lowest hover:bg-surface-low border border-outline-variant/50 hover:border-primary/50 rounded-md p-6 sm:p-8 min-h-[280px] flex flex-col justify-between cursor-pointer transition-colors"
          >
            <div className="flex items-center justify-between font-mono text-xs text-outline">
              <span className="text-primary font-bold">
                {currentCourse?.code || "DECK"} · CARD {safeIdx + 1} OF {deck.length}
              </span>
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="tabular-nums">Box {currentCard.box}/5</span>
                {currentFsrs && (
                  <>
                    <span>·</span>
                    <span className="tabular-nums">
                      FSRS {currentFsrs.cardState} · S={currentFsrs.stability}d · D=
                      {currentFsrs.difficulty} · Lapses={currentFsrs.lapses}
                    </span>
                  </>
                )}
                <span>·</span>
                <span className="tabular-nums">
                  {!currentCard.nextReviewAt ||
                  new Date(currentCard.nextReviewAt).getTime() <= Date.now()
                    ? "Due now"
                    : `Next: ${currentCard.nextReviewAt.slice(0, 10)}`}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteFlashcard(currentCard.id);
                  }}
                  className="text-outline hover:text-error p-1 cursor-pointer"
                  title="Delete Card"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="my-6">
              <div className="font-mono text-[10px] uppercase tracking-wider text-secondary pb-2">
                {isFlipped ? "Answer / Proof" : "Prompt Question (Click card to reveal)"}
              </div>
              <p className="text-base sm:text-lg font-medium text-on-surface leading-relaxed">
                {isFlipped ? currentCard.answer : currentCard.question}
              </p>
            </div>

            <div className="flex items-center justify-between font-mono text-[11px] text-outline pt-2 border-t border-outline-variant/30">
              <span>Click card to flip</span>
              <span>{isFlipped ? "Rate recall confidence below" : "Tap to inspect answer"}</span>
            </div>
          </div>

          {/* Navigation & Rating Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsFlipped(false);
                  setCardIndex((prev) => (prev - 1 + deck.length) % deck.length);
                }}
                className="p-2 rounded bg-surface-low hover:bg-surface-high border border-outline-variant/40 text-on-surface cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsFlipped(false);
                  setCardIndex((prev) => (prev + 1) % deck.length);
                }}
                className="p-2 rounded bg-surface-low hover:bg-surface-high border border-outline-variant/40 text-on-surface cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => handleRate("again")}
                className="px-3 py-1.5 rounded bg-error-container/30 hover:bg-error-container/50 text-error font-mono text-xs cursor-pointer"
              >
                Again
              </button>
              <button
                type="button"
                onClick={() => handleRate("hard")}
                className="px-3 py-1.5 rounded bg-surface-high hover:bg-surface-bright text-secondary font-mono text-xs cursor-pointer"
              >
                Hard
              </button>
              <button
                type="button"
                onClick={() => handleRate("good")}
                className="px-3.5 py-1.5 rounded bg-primary-container/25 hover:bg-primary-container text-primary hover:text-on-primary-container font-mono text-xs font-semibold cursor-pointer"
              >
                Good (+10 XP)
              </button>
              <button
                type="button"
                onClick={() => handleRate("easy")}
                className="px-3.5 py-1.5 rounded bg-tertiary/20 hover:bg-tertiary text-tertiary hover:text-on-tertiary font-mono text-xs font-semibold cursor-pointer"
              >
                Easy (+10 XP)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
