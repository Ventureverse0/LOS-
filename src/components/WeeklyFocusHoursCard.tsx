import React, { useMemo, useState } from "react";
import { ArrowRight, Clock, Play, Timer } from "lucide-react";
import { useStudyOS } from "../context/StudyOSContext";
import { AppView } from "../types/studyOS";
import {
  computeWeeklyFocusHoursSummary,
  formatFocusHoursLabel,
  type FocusHistoryScope,
} from "../lib/gamification";

type ChartWindowMode = "7d_daily" | "4w_weekly";

export function WeeklyFocusHoursCard() {
  const { state, setActiveView, logStudyMinutes } = useStudyOS();

  const [scope, setScope] = useState<FocusHistoryScope>("all");
  const [windowMode, setWindowMode] = useState<ChartWindowMode>("7d_daily");
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const summary = useMemo(
    () =>
      computeWeeklyFocusHoursSummary(state.studySessions, {
        dailyGoalMinutes: state.stats.dailyGoalMinutes,
        courses: state.courses,
        scope,
      }),
    [state.studySessions, state.stats.dailyGoalMinutes, state.courses, scope]
  );

  // Default selection to Today (index 6) in 7-day mode or Current 7d (index 3) in 4-week mode
  const activeBarIndex = useMemo(() => {
    const count = windowMode === "7d_daily" ? summary.days.length : summary.fourWeekRollup.length;
    if (selectedIndex !== null && selectedIndex >= 0 && selectedIndex < count) {
      return selectedIndex;
    }
    return count - 1;
  }, [selectedIndex, windowMode, summary.days.length, summary.fourWeekRollup.length]);

  const chartColumns = useMemo(() => {
    if (windowMode === "7d_daily") {
      return summary.days.map((d) => ({
        key: d.date,
        primaryLabel: d.dayShort,
        secondaryLabel: d.shortDateLabel,
        isCurrent: d.isToday,
        pomodoroHours: d.pomodoroHours,
        otherHours: d.otherHours,
        totalHours: d.totalHours,
        totalMinutes: d.totalMinutes,
        sprintCount: d.sprintCount,
        sessionCount: d.sessionCount,
        goalMet: d.goalMet,
        sessions: d.sessions,
      }));
    }
    return summary.fourWeekRollup.map((w) => ({
      key: w.id,
      primaryLabel: w.label,
      secondaryLabel: w.rangeLabel,
      isCurrent: w.isCurrentWeek,
      pomodoroHours: w.pomodoroHours,
      otherHours: w.otherHours,
      totalHours: w.totalHours,
      totalMinutes: w.totalMinutes,
      sprintCount: w.sprintCount,
      sessionCount: w.sessionCount,
      goalMet: w.totalHours >= w.weeklyGoalHours,
      sessions: w.sessions,
    }));
  }, [windowMode, summary.days, summary.fourWeekRollup]);

  const targetHours =
    windowMode === "7d_daily" ? summary.dailyGoalHours : summary.weeklyGoalHours;

  const maxChartHours = useMemo(() => {
    const peakData = chartColumns.reduce((m, c) => Math.max(m, c.totalHours), 0);
    const rawMax = Math.max(peakData, targetHours * 1.15, windowMode === "7d_daily" ? 2 : 10);
    // Round up to a clean readable tick ceiling
    if (rawMax <= 3) return Math.ceil(rawMax * 2) / 2;
    if (rawMax <= 10) return Math.ceil(rawMax);
    return Math.ceil(rawMax / 2) * 2;
  }, [chartColumns, targetHours, windowMode]);

  const selectedColumn = chartColumns[activeBarIndex] ?? chartColumns[chartColumns.length - 1];

  // SVG coordinate constants
  const svgWidth = 640;
  const svgHeight = 220;
  const plotLeft = 42;
  const plotRight = 626;
  const plotTop = 22;
  const plotBottom = 176;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;

  const yForHours = (hrs: number): number => {
    const clamped = Math.max(0, Math.min(maxChartHours, hrs));
    return plotBottom - (clamped / Math.max(0.5, maxChartHours)) * plotHeight;
  };

  const targetY = yForHours(targetHours);
  const yTicks = [0, maxChartHours / 2, maxChartHours];

  const colCount = Math.max(1, chartColumns.length);
  const slotWidth = plotWidth / colCount;
  const barWidth = windowMode === "7d_daily" ? Math.min(44, slotWidth * 0.54) : Math.min(72, slotWidth * 0.5);

  const deltaSign = summary.weekOverWeekDeltaHours > 0 ? "+" : "";
  const wowLabel =
    summary.previousWeekHours === 0 && summary.totalHours === 0
      ? "0.0h prior 7d"
      : `${deltaSign}${formatFocusHoursLabel(summary.weekOverWeekDeltaHours)} vs prior 7d`;

  return (
    <section
      aria-label="Weekly Focus Hours Visualization"
      className="bg-surface-low border border-outline-variant/35 rounded-md p-4 sm:p-5 flex flex-col gap-4"
    >
      {/* Header Row: Title, Unboxed Summary Metadata & Functional Filter Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-outline-variant/25">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Clock className="w-4 h-4 text-primary shrink-0" />
            <h2 className="text-base font-semibold text-on-surface">
              Weekly Focus Hours
            </h2>
            <span className="font-mono text-xs text-outline" aria-hidden="true">
              ·
            </span>
            <span className="font-mono text-xs text-on-surface-variant tabular-nums">
              Calculated from Pomodoro Focus history ({state.studySessions.length}{" "}
              {state.studySessions.length === 1 ? "session" : "sessions"} recorded)
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap pt-1.5 font-mono text-xs text-outline tabular-nums">
            <span className="text-on-surface font-semibold">
              {formatFocusHoursLabel(summary.totalHours)} this 7d
            </span>
            <span aria-hidden="true">·</span>
            <span>Daily avg {formatFocusHoursLabel(summary.dailyAverageHours)}</span>
            <span aria-hidden="true">·</span>
            <span>
              Weekly goal {formatFocusHoursLabel(summary.weeklyGoalHours)} (
              {summary.weeklyGoalProgressPct}%)
            </span>
            <span aria-hidden="true">·</span>
            <span
              className={
                summary.weekOverWeekDeltaHours > 0
                  ? "text-tertiary"
                  : summary.weekOverWeekDeltaHours < 0
                  ? "text-secondary"
                  : "text-outline"
              }
            >
              {wowLabel}
            </span>
            {summary.peakDay && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  Peak {summary.peakDay.dayShort} ({formatFocusHoursLabel(summary.peakDay.totalHours)})
                </span>
              </>
            )}
          </div>
        </div>

        {/* Functional Segmented Controls */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <div
            role="group"
            aria-label="Focus session source filter"
            className="flex items-center gap-1 bg-surface-lowest p-1 rounded border border-outline-variant/30"
          >
            <button
              type="button"
              onClick={() => setScope("all")}
              className={`px-2.5 py-1 rounded font-mono text-[11px] transition-colors cursor-pointer whitespace-nowrap ${
                scope === "all"
                  ? "bg-primary-container text-on-primary-container font-semibold"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              All Focus
            </button>
            <button
              type="button"
              onClick={() => setScope("pomodoro")}
              className={`px-2.5 py-1 rounded font-mono text-[11px] transition-colors cursor-pointer whitespace-nowrap ${
                scope === "pomodoro"
                  ? "bg-primary-container text-on-primary-container font-semibold"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              Pomodoro Only
            </button>
          </div>

          <div
            role="group"
            aria-label="Time window view"
            className="flex items-center gap-1 bg-surface-lowest p-1 rounded border border-outline-variant/30"
          >
            <button
              type="button"
              onClick={() => {
                setWindowMode("7d_daily");
                setSelectedIndex(null);
              }}
              className={`px-2.5 py-1 rounded font-mono text-[11px] transition-colors cursor-pointer whitespace-nowrap ${
                windowMode === "7d_daily"
                  ? "bg-surface-high text-on-surface font-semibold"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              7-Day Daily
            </button>
            <button
              type="button"
              onClick={() => {
                setWindowMode("4w_weekly");
                setSelectedIndex(null);
              }}
              className={`px-2.5 py-1 rounded font-mono text-[11px] transition-colors cursor-pointer whitespace-nowrap ${
                windowMode === "4w_weekly"
                  ? "bg-surface-high text-on-surface font-semibold"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              4-Week Totals
            </button>
          </div>

          <button
            type="button"
            onClick={() => setActiveView(AppView.POMODORO)}
            className="px-3 py-1.5 rounded bg-surface-high hover:bg-surface-bright border border-outline-variant/40 font-mono text-xs text-on-surface flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Timer className="w-3.5 h-3.5 text-primary shrink-0" />
            <span>Focus Timer</span>
          </button>
        </div>
      </div>

      {/* Main Split: 8-Col SVG Focus Hours Chart + 4-Col Selected Period Session Ledger */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Chart Column */}
        <div className="lg:col-span-8 flex flex-col gap-2.5">
          <div className="w-full overflow-x-auto">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full h-52 select-none"
              role="img"
              aria-label={`Bar chart showing ${
                windowMode === "7d_daily" ? "daily focus hours over the past 7 days" : "weekly focus hours over the past 4 weeks"
              }`}
            >
              {/* Horizontal Hour Gridlines & Y-Axis Labels */}
              {yTicks.map((tickVal, idx) => {
                const y = yForHours(tickVal);
                return (
                  <g key={`tick-${idx}`}>
                    <line
                      x1={plotLeft}
                      y1={y}
                      x2={plotRight}
                      y2={y}
                      className="stroke-outline-variant/30"
                      strokeWidth={1}
                    />
                    <text
                      x={plotLeft - 8}
                      y={y + 3.5}
                      textAnchor="end"
                      className="fill-outline font-mono text-[10px] tabular-nums"
                    >
                      {formatFocusHoursLabel(tickVal)}
                    </text>
                  </g>
                );
              })}

              {/* Daily / Weekly Target Reference Line */}
              <line
                x1={plotLeft}
                y1={targetY}
                x2={plotRight}
                y2={targetY}
                className="stroke-secondary/75"
                strokeWidth={1.25}
                strokeDasharray="4 4"
              />
              <text
                x={plotRight - 2}
                y={Math.max(12, targetY - 5)}
                textAnchor="end"
                className="fill-secondary font-mono text-[9.5px] tabular-nums"
              >
                Target {formatFocusHoursLabel(targetHours)}
                {windowMode === "7d_daily" ? "/d" : "/wk"}
              </text>

              {/* Interactive Stacked Bars */}
              {chartColumns.map((col, idx) => {
                const centerX = plotLeft + idx * slotWidth + slotWidth / 2;
                const barX = centerX - barWidth / 2;
                const isSelected = idx === activeBarIndex;

                const pomoHeight = Math.max(
                  0,
                  plotBottom - yForHours(col.pomodoroHours)
                );
                const totalHeight = Math.max(
                  0,
                  plotBottom - yForHours(col.totalHours)
                );
                const otherHeight = Math.max(0, totalHeight - pomoHeight);

                const pomoY = plotBottom - pomoHeight;
                const otherY = pomoY - otherHeight;

                return (
                  <g
                    key={col.key}
                    role="button"
                    tabIndex={0}
                    aria-label={`${col.primaryLabel} (${col.secondaryLabel}): ${formatFocusHoursLabel(
                      col.totalHours
                    )} across ${col.sessionCount} sessions`}
                    onClick={() => setSelectedIndex(idx)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedIndex(idx);
                      }
                    }}
                    className="cursor-pointer focus:outline-none group"
                  >
                    {/* Subtle interactive column highlight */}
                    <rect
                      x={plotLeft + idx * slotWidth + 3}
                      y={plotTop - 6}
                      width={Math.max(12, slotWidth - 6)}
                      height={plotHeight + 12}
                      rx={4}
                      className={
                        isSelected
                          ? "fill-surface-highest/45 stroke-outline-variant/50"
                          : "fill-transparent group-hover:fill-surface-highest/25"
                      }
                      strokeWidth={isSelected ? 1 : 0}
                    />

                    {/* Zero-hour baseline tick when no sessions exist */}
                    {col.totalMinutes === 0 ? (
                      <rect
                        x={barX}
                        y={plotBottom - 2}
                        width={barWidth}
                        height={2}
                        rx={1}
                        className="fill-outline-variant/60"
                      />
                    ) : (
                      <>
                        {/* Pomodoro Sprint Hours Segment (Bottom) */}
                        {pomoHeight > 0 && (
                          <rect
                            x={barX}
                            y={pomoY}
                            width={barWidth}
                            height={Math.max(2, pomoHeight)}
                            rx={otherHeight > 0 ? 1 : 3}
                            className={
                              col.goalMet
                                ? "fill-primary"
                                : "fill-primary-container group-hover:fill-primary"
                            }
                          />
                        )}

                        {/* Manual / Lab / Dwell Focus Hours Segment (Stacked Top) */}
                        {scope === "all" && otherHeight > 0 && (
                          <rect
                            x={barX}
                            y={otherY}
                            width={barWidth}
                            height={Math.max(2, otherHeight)}
                            rx={3}
                            className="fill-tertiary/80 group-hover:fill-tertiary"
                          />
                        )}
                      </>
                    )}

                    {/* Value label above bar */}
                    {(col.totalMinutes > 0 || isSelected) && (
                      <text
                        x={centerX}
                        y={Math.max(13, plotBottom - totalHeight - 6)}
                        textAnchor="middle"
                        className={`font-mono text-[10px] tabular-nums ${
                          isSelected
                            ? "fill-on-surface font-semibold"
                            : "fill-on-surface-variant"
                        }`}
                      >
                        {formatFocusHoursLabel(col.totalHours)}
                      </text>
                    )}

                    {/* X-Axis Primary & Secondary Labels */}
                    <text
                      x={centerX}
                      y={plotBottom + 18}
                      textAnchor="middle"
                      className={`font-mono text-[11px] ${
                        col.isCurrent
                          ? "fill-primary font-semibold"
                          : isSelected
                          ? "fill-on-surface font-semibold"
                          : "fill-on-surface-variant"
                      }`}
                    >
                      {col.primaryLabel}
                    </text>
                    <text
                      x={centerX}
                      y={plotBottom + 32}
                      textAnchor="middle"
                      className="fill-outline font-mono text-[9.5px] tabular-nums"
                    >
                      {col.secondaryLabel}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Legend & Honest Breakdown Footer */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 font-mono text-[11px] text-outline tabular-nums">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-primary-container inline-block" />
                <span>
                  Pomodoro Sprints ({formatFocusHoursLabel(summary.pomodoroHours)} ·{" "}
                  {summary.sprintCount} {summary.sprintCount === 1 ? "sprint" : "sprints"})
                </span>
              </span>
              {scope === "all" && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-tertiary/80 inline-block" />
                  <span>
                    Logged / Lab Study ({formatFocusHoursLabel(summary.otherHours)})
                  </span>
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3.5 border-t border-dashed border-secondary inline-block" />
                <span>
                  {windowMode === "7d_daily" ? "Daily" : "Weekly"} Target (
                  {formatFocusHoursLabel(targetHours)})
                </span>
              </span>
            </div>

            <span>
              {summary.activeDaysCount}/7 active days · Click any bar to inspect sessions
            </span>
          </div>
        </div>

        {/* Right Column: Selected Bar Session History & Course Distribution */}
        <div className="lg:col-span-4 lg:border-l lg:border-outline-variant/25 lg:pl-5 flex flex-col justify-between gap-4">
          <div className="flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-on-surface">
                  {selectedColumn.primaryLabel} · {selectedColumn.secondaryLabel}
                </div>
                <div className="font-mono text-[11px] text-outline tabular-nums">
                  {formatFocusHoursLabel(selectedColumn.totalHours)} ({selectedColumn.totalMinutes}m) ·{" "}
                  {selectedColumn.sprintCount}{" "}
                  {selectedColumn.sprintCount === 1 ? "sprint" : "sprints"}
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  logStudyMinutes(25, "Pomodoro Focus Sprint Completed", {
                    isFocusSprint: true,
                    courseId: state.courses[0]?.id,
                    moduleId: state.modules[0]?.id,
                  })
                }
                className="px-2.5 py-1 rounded bg-surface-highest hover:bg-primary hover:text-on-primary font-mono text-[11px] text-on-surface transition-colors cursor-pointer whitespace-nowrap"
                title="Log a completed 25-minute Pomodoro sprint"
              >
                +25m Sprint
              </button>
            </div>

            {selectedColumn.sessions.length === 0 ? (
              <div className="py-3 border-t border-outline-variant/20 flex flex-col gap-2">
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  No {scope === "pomodoro" ? "Pomodoro sprints" : "focus sessions"} recorded for this period yet. Start a sprint in Pomodoro Focus or log study time.
                </p>
                <div>
                  <button
                    type="button"
                    onClick={() => setActiveView(AppView.POMODORO)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary-container hover:bg-primary text-on-primary-container font-mono text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Play className="w-3 h-3 shrink-0" />
                    <span>Start Focus Sprint</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="max-h-36 overflow-y-auto divide-y divide-outline-variant/20 border-t border-outline-variant/20 pr-1">
                {selectedColumn.sessions.slice(0, 8).map((sess) => {
                  const course = state.courses.find((c) => c.id === sess.courseId);
                  const mod = state.modules.find((m) => m.id === sess.moduleId);
                  const ended = new Date(sess.endedAt || sess.startedAt);
                  const timeStr = Number.isNaN(ended.getTime())
                    ? ""
                    : ended.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

                  return (
                    <div
                      key={sess.id}
                      className="py-1.5 flex items-center justify-between gap-2 font-mono text-[11px]"
                    >
                      <div className="min-w-0">
                        <div className="text-on-surface truncate">
                          {mod ? mod.title : course ? `${course.code} — ${course.title}` : sess.label}
                        </div>
                        <div className="text-[10px] text-outline flex items-center gap-1.5">
                          <span>{sess.kind === "pomodoro" ? "Pomodoro sprint" : sess.kind}</span>
                          {timeStr && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="tabular-nums">{timeStr}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <span className="text-primary font-semibold tabular-nums shrink-0">
                        {formatFocusHoursLabel(sess.durationMinutes / 60)} ({sess.durationMinutes}m)
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 7-Day Course Focus Distribution */}
          <div className="pt-3 border-t border-outline-variant/25 flex flex-col gap-2">
            <div className="flex items-center justify-between font-mono text-[11px]">
              <span className="text-on-surface-variant font-medium">
                7-Day Focus by Course
              </span>
              <button
                type="button"
                onClick={() => setActiveView(AppView.POMODORO)}
                className="text-primary hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <span>Full History</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            {summary.courseBreakdown.length === 0 ? (
              <p className="font-mono text-[11px] text-outline">
                Course distribution appears once sessions are logged.
              </p>
            ) : (
              <div className="space-y-1.5">
                {summary.courseBreakdown.slice(0, 3).map((item) => (
                  <div key={item.courseId} className="flex flex-col gap-1">
                    <div className="flex items-center justify-between gap-2 font-mono text-[11px] tabular-nums">
                      <span className="text-on-surface truncate">{item.label}</span>
                      <span className="text-on-surface-variant shrink-0">
                        {formatFocusHoursLabel(item.hours)} · {item.sharePct}%
                      </span>
                    </div>
                    <svg
                      viewBox="0 0 100 3"
                      preserveAspectRatio="none"
                      className="w-full h-1 rounded-xs overflow-hidden bg-surface-highest"
                      aria-hidden="true"
                    >
                      <rect
                        x={0}
                        y={0}
                        width={Math.min(100, Math.max(2, item.sharePct))}
                        height={3}
                        className="fill-primary"
                      />
                    </svg>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
