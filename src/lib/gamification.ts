import type {
  Achievement,
  Course,
  ModuleUnit,
  StudyOSState,
  StudySessionRecord,
  UserStats,
} from "../types/studyOS";

export const XP_REWARDS = {
  COMPLETE_MODULE: 100,
  DEEP_RESEARCH_CURRICULUM: 50,
  SAVE_NOTES_200_WORDS: 25,
  COMPLETE_FOCUS_SPRINT: 15,
  REVIEW_FLASHCARD: 10,
} as const;

export function getTodayDateString(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Exact Mission Brief Level Formula:
 * Level = Math.floor(Math.sqrt(currentXP / 100)) + 1
 */
export function calculateLevel(currentXP: number): number {
  const safeXP = Math.max(0, Number.isFinite(currentXP) ? currentXP : 0);
  return Math.floor(Math.sqrt(safeXP / 100)) + 1;
}

export function getTierNameForLevel(level: number): string {
  if (level >= 15) return "PRINCIPAL MASTERY FELLOW";
  if (level >= 10) return "STAFF KNOWLEDGE ARCHITECT";
  if (level >= 7) return "SENIOR RESEARCHER";
  if (level >= 5) return "DEEP WORK PRACTITIONER";
  if (level >= 3) return "ACTIVE SCHOLAR";
  return "APPRENTICE LEARNER";
}

export function getProfileInitials(handle: string): string {
  const cleaned = (handle || "").trim().replace(/^@+/, "");
  if (!cleaned) return "OS";
  const parts = cleaned.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}

export function formatFutureDueLabel(dueInDays: number, baseDate: Date = new Date()): string {
  const safeDays = Math.max(1, Math.min(365, Math.round(Number(dueInDays) || 3)));
  const target = new Date(baseDate.getTime());
  target.setDate(target.getDate() + safeDays);
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const labelDate = `${monthNames[target.getMonth()]} ${target.getDate()}`;
  return `Due ${labelDate} (${safeDays}d)`;
}

export interface LevelProgressInfo {
  level: number;
  currentXP: number;
  levelFloorXP: number;
  nextLevelXP: number;
  xpIntoLevel: number;
  xpNeededForLevel: number;
  progressPercent: number;
  tierName: string;
}

export function getLevelProgress(currentXP: number): LevelProgressInfo {
  const safeXP = Math.max(0, Math.floor(Number.isFinite(currentXP) ? currentXP : 0));
  const level = calculateLevel(safeXP);
  const levelFloorXP = Math.pow(level - 1, 2) * 100;
  const nextLevelXP = Math.pow(level, 2) * 100;
  const xpIntoLevel = Math.max(0, safeXP - levelFloorXP);
  const xpNeededForLevel = Math.max(100, nextLevelXP - levelFloorXP);
  const progressPercent = Math.min(100, Math.max(0, Math.round((xpIntoLevel / xpNeededForLevel) * 1000) / 10));

  return {
    level,
    currentXP: safeXP,
    levelFloorXP,
    nextLevelXP,
    xpIntoLevel,
    xpNeededForLevel,
    progressPercent,
    tierName: getTierNameForLevel(level),
  };
}

function parseYMDToUTC(ymd: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]) - 1;
  const d = Number(match[3]);
  return Date.UTC(y, m, d);
}

/**
 * Automated Streak Tracking:
 * - If today - lastActiveDate === 1 day: increment streakCount
 * - If > 1 day (or in future/invalid): reset streak to 1
 * - If today (0 days): maintain streak
 */
export function evaluateStreakOnLoad(stats: UserStats, todayStr: string = getTodayDateString()): UserStats {
  const todayUTC = parseYMDToUTC(todayStr);
  const lastUTC = stats.lastActiveDate ? parseYMDToUTC(stats.lastActiveDate) : null;

  if (todayUTC === null) {
    return stats;
  }

  if (lastUTC === null) {
    return {
      ...stats,
      streakCount: Math.max(1, stats.streakCount || 1),
      lastActiveDate: todayStr,
    };
  }

  const diffDays = Math.round((todayUTC - lastUTC) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return {
      ...stats,
      streakCount: Math.max(1, stats.streakCount),
      level: calculateLevel(stats.currentXP),
    };
  }

  if (diffDays === 1) {
    return {
      ...stats,
      streakCount: Math.max(1, stats.streakCount) + 1,
      lastActiveDate: todayStr,
      todayMinutesSpent: 0,
      todayXP: 0,
      focusSprintsToday: 0,
      flashcardsReviewedToday: 0,
      level: calculateLevel(stats.currentXP),
    };
  }

  // > 1 day gap (or negative clock skew): reset streak to 1
  return {
    ...stats,
    streakCount: 1,
    lastActiveDate: todayStr,
    todayMinutesSpent: 0,
    todayXP: 0,
    focusSprintsToday: 0,
    flashcardsReviewedToday: 0,
    level: calculateLevel(stats.currentXP),
  };
}

export function countWords(markdown: string): number {
  if (!markdown || !markdown.trim()) return 0;
  const cleaned = markdown
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```/g, " "))
    .replace(/[#>*_`~[\]()!-]/g, " ")
    .trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).filter(Boolean).length;
}

export interface ParsedYouTubeResult {
  isYouTube: boolean;
  videoId: string | null;
  embedUrl: string | null;
  watchUrl: string;
}

/**
 * Native YouTube player URL parser:
 * Converts watch?v=..., youtu.be/..., youtube.com/embed/..., youtube.com/shorts/..., youtube.com/live/...
 * into clean https://www.youtube.com/embed/{videoId} URLs.
 */
export function parseYouTubeUrl(rawUrl: string, startSeconds: number = 0): ParsedYouTubeResult {
  const trimmed = (rawUrl || "").trim();
  if (!trimmed) {
    return { isYouTube: false, videoId: null, embedUrl: null, watchUrl: "" };
  }

  let videoId: string | null = null;
  let parsedStart = Math.max(0, Math.floor(startSeconds));

  try {
    const urlWithProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const u = new URL(urlWithProto);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();

    if (host === "youtu.be") {
      videoId = u.pathname.split("/").filter(Boolean)[0] || null;
    } else if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
      if (u.pathname === "/watch") {
        videoId = u.searchParams.get("v");
      } else if (
        u.pathname.startsWith("/embed/") ||
        u.pathname.startsWith("/shorts/") ||
        u.pathname.startsWith("/live/")
      ) {
        videoId = u.pathname.split("/").filter(Boolean)[1] || null;
      }
    }

    if (!parsedStart) {
      const tParam = u.searchParams.get("t") || u.searchParams.get("start");
      if (tParam) {
        const numeric = parseInt(tParam.replace(/s$/i, ""), 10);
        if (!Number.isNaN(numeric) && numeric > 0) {
          parsedStart = numeric;
        }
      }
    }
  } catch {
    // Fallback regex for raw IDs or malformed strings
    const match = /(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/.exec(trimmed);
    if (match) {
      videoId = match[1];
    }
  }

  if (videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    const params = new URLSearchParams({ rel: "0", modestbranding: "1" });
    if (parsedStart > 0) {
      params.set("start", String(parsedStart));
    }
    return {
      isYouTube: true,
      videoId,
      embedUrl: `https://www.youtube.com/embed/${videoId}?${params.toString()}`,
      watchUrl: `https://www.youtube.com/watch?v=${videoId}${parsedStart > 0 ? `&t=${parsedStart}s` : ""}`,
    };
  }

  return {
    isYouTube: false,
    videoId: null,
    embedUrl: null,
    watchUrl: trimmed,
  };
}

export function formatSecondsToTimestamp(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function normalizeCourseTag(raw: string): string {
  const cleaned = (raw || "")
    .trim()
    .replace(/^#+/, "")
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9+.-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned.slice(0, 32);
}

export function normalizeCourseTags(input: string[] | string | undefined): string[] {
  if (!input) return [];
  const rawList = Array.isArray(input) ? input : input.split(",");
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of rawList) {
    const tag = normalizeCourseTag(String(item));
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      result.push(tag);
    }
  }
  return result;
}

export function collectCourseTagCounts(courses: Course[]): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const course of courses) {
    const uniqueCourseTags = normalizeCourseTags(course.tags);
    for (const tag of uniqueCourseTags) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => (b.count !== a.count ? b.count - a.count : a.tag.localeCompare(b.tag)));
}

export function filterCoursesByTags(
  courses: Course[],
  selectedTags: string[],
  matchMode: "any" | "all" = "any"
): Course[] {
  const normalizedSelected = normalizeCourseTags(selectedTags);
  if (normalizedSelected.length === 0) return courses;

  return courses.filter((course) => {
    const courseTagSet = new Set(normalizeCourseTags(course.tags));
    if (matchMode === "all") {
      return normalizedSelected.every((t) => courseTagSet.has(t));
    }
    return normalizedSelected.some((t) => courseTagSet.has(t));
  });
}

export function syncCoursesWithModules(courses: Course[], modules: ModuleUnit[]): Course[] {
  return courses.map((course) => {
    const courseModules = modules.filter((m) => m.courseId === course.id && !m.archived);
    const completed = courseModules.filter((m) => m.status === "Mastered").length;
    return {
      ...course,
      tags: normalizeCourseTags(course.tags),
      totalUnits: courseModules.length,
      completedUnits: completed,
    };
  });
}

export function evaluateAchievements(state: StudyOSState, nowIso: string = new Date().toISOString()): {
  achievements: Achievement[];
  newlyUnlocked: Achievement[];
} {
  const newlyUnlocked: Achievement[] = [];
  const masteredCount = state.modules.filter((m) => m.status === "Mastered").length;
  const hasLongNote = state.modules.some((m) => countWords(m.notesMarkdown) >= 200);
  const aiCurriculaCount = state.researchSessions.filter((r) => r.mode === "curriculum").length;

  const updated = state.achievements.map((ach) => {
    if (ach.unlockedAt) return ach;

    let shouldUnlock = false;
    switch (ach.id) {
      case "ach-first-mastery":
        shouldUnlock = masteredCount >= 1;
        break;
      case "ach-streak-7":
        shouldUnlock = state.stats.streakCount >= 7;
        break;
      case "ach-deep-scholar":
        shouldUnlock = aiCurriculaCount >= 1;
        break;
      case "ach-obsidian-scribe":
        shouldUnlock = hasLongNote;
        break;
      case "ach-ten-units":
        shouldUnlock = masteredCount >= 10;
        break;
      case "ach-level-5":
        shouldUnlock = state.stats.level >= 5;
        break;
      default:
        break;
    }

    if (shouldUnlock) {
      const unlockedItem = { ...ach, unlockedAt: nowIso };
      newlyUnlocked.push(unlockedItem);
      return unlockedItem;
    }
    return ach;
  });

  return { achievements: updated, newlyUnlocked };
}

export type FocusHistoryScope = "all" | "pomodoro";

export interface DailyFocusHoursBucket {
  date: string; // YYYY-MM-DD
  dayShort: string; // Sun, Mon, ...
  shortDateLabel: string; // Oct 31
  isToday: boolean;
  pomodoroMinutes: number;
  otherMinutes: number;
  totalMinutes: number;
  pomodoroHours: number;
  otherHours: number;
  totalHours: number;
  sprintCount: number;
  sessionCount: number;
  goalHours: number;
  goalMet: boolean;
  sessions: StudySessionRecord[];
}

export interface WeeklyRollupBucket {
  id: string;
  label: string;
  rangeLabel: string;
  startDate: string;
  endDate: string;
  isCurrentWeek: boolean;
  pomodoroHours: number;
  otherHours: number;
  totalHours: number;
  totalMinutes: number;
  sessionCount: number;
  sprintCount: number;
  weeklyGoalHours: number;
  sessions: StudySessionRecord[];
}

export interface CourseFocusShare {
  courseId: string;
  code: string;
  label: string;
  minutes: number;
  hours: number;
  sharePct: number;
}

export interface WeeklyFocusHoursSummary {
  days: DailyFocusHoursBucket[];
  fourWeekRollup: WeeklyRollupBucket[];
  totalMinutes: number;
  totalHours: number;
  pomodoroMinutes: number;
  pomodoroHours: number;
  otherMinutes: number;
  otherHours: number;
  dailyAverageHours: number;
  dailyGoalHours: number;
  weeklyGoalHours: number;
  weeklyGoalProgressPct: number;
  previousWeekHours: number;
  weekOverWeekDeltaHours: number;
  sprintCount: number;
  sessionCount: number;
  activeDaysCount: number;
  peakDay: DailyFocusHoursBucket | null;
  courseBreakdown: CourseFocusShare[];
}

function roundHours(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  return Math.round((minutes / 60) * 100) / 100;
}

export function formatFocusHoursLabel(hours: number): string {
  const safe = Number.isFinite(hours) && hours > 0 ? hours : 0;
  if (safe === 0) return "0.0h";
  const rounded1 = Math.round(safe * 10) / 10;
  if (rounded1 === 0 && safe > 0) {
    return `${(Math.round(safe * 100) / 100).toFixed(2)}h`;
  }
  return `${rounded1.toFixed(1)}h`;
}

/**
 * Computes weekly focus hours, daily stacked breakdowns, 4-week rollups,
 * week-over-week delta, and per-course focus distribution directly from
 * PomodoroFocusView session history (`StudySessionRecord[]`).
 */
export function computeWeeklyFocusHoursSummary(
  studySessions: StudySessionRecord[],
  options?: {
    dailyGoalMinutes?: number;
    courses?: Course[];
    scope?: FocusHistoryScope;
    referenceDate?: Date;
  }
): WeeklyFocusHoursSummary {
  const scope: FocusHistoryScope = options?.scope ?? "all";
  const safeGoalMinutes = Math.max(15, Number(options?.dailyGoalMinutes) || 120);
  const dailyGoalHours = roundHours(safeGoalMinutes);
  const weeklyGoalHours = roundHours(safeGoalMinutes * 7);
  const refDate = options?.referenceDate ? new Date(options.referenceDate.getTime()) : new Date();
  const courses = options?.courses ?? [];

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  // Normalize and index valid sessions by local YYYY-MM-DD date
  const sessionsByDate = new Map<string, StudySessionRecord[]>();
  const safeList = Array.isArray(studySessions) ? studySessions : [];

  for (const sess of safeList) {
    if (!sess) continue;
    if (scope === "pomodoro" && sess.kind !== "pomodoro") continue;
    const mins = Math.max(0, Number(sess.durationMinutes) || 0);
    if (mins <= 0) continue;

    const rawTs = sess.endedAt || sess.startedAt;
    if (!rawTs) continue;
    const parsed = new Date(rawTs);
    if (Number.isNaN(parsed.getTime())) continue;

    const ymd = getTodayDateString(parsed);
    const bucket = sessionsByDate.get(ymd);
    const normalizedSess: StudySessionRecord = {
      ...sess,
      durationMinutes: mins,
    };
    if (bucket) {
      bucket.push(normalizedSess);
    } else {
      sessionsByDate.set(ymd, [normalizedSess]);
    }
  }

  // Sort each day's sessions newest-first
  for (const list of sessionsByDate.values()) {
    list.sort((a, b) => (b.endedAt || b.startedAt).localeCompare(a.endedAt || a.startedAt));
  }

  const buildDateAtOffset = (daysAgo: number): Date => {
    const d = new Date(refDate.getTime());
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - daysAgo);
    return d;
  };

  // Rolling 7-day daily buckets (oldest -> today)
  const days: DailyFocusHoursBucket[] = [];
  for (let offset = 6; offset >= 0; offset--) {
    const d = buildDateAtOffset(offset);
    const ymd = getTodayDateString(d);
    const daySessions = sessionsByDate.get(ymd) ?? [];

    let pomodoroMinutes = 0;
    let otherMinutes = 0;
    let sprintCount = 0;

    for (const s of daySessions) {
      if (s.kind === "pomodoro") {
        pomodoroMinutes += s.durationMinutes;
        sprintCount += 1;
      } else {
        otherMinutes += s.durationMinutes;
      }
    }

    const totalMinutes = pomodoroMinutes + otherMinutes;
    days.push({
      date: ymd,
      dayShort: offset === 0 ? "Today" : dayNames[d.getDay()],
      shortDateLabel: `${monthNames[d.getMonth()]} ${d.getDate()}`,
      isToday: offset === 0,
      pomodoroMinutes,
      otherMinutes,
      totalMinutes,
      pomodoroHours: roundHours(pomodoroMinutes),
      otherHours: roundHours(otherMinutes),
      totalHours: roundHours(totalMinutes),
      sprintCount,
      sessionCount: daySessions.length,
      goalHours: dailyGoalHours,
      goalMet: totalMinutes >= safeGoalMinutes,
      sessions: daySessions,
    });
  }

  // 4-week rolling weekly buckets (3w ago -> current 7d)
  const fourWeekRollup: WeeklyRollupBucket[] = [];
  for (let weekIdx = 3; weekIdx >= 0; weekIdx--) {
    const startOffset = weekIdx * 7 + 6;
    const endOffset = weekIdx * 7;
    const startDt = buildDateAtOffset(startOffset);
    const endDt = buildDateAtOffset(endOffset);

    let pomoMins = 0;
    let otherMins = 0;
    let sprints = 0;
    const weekSessions: StudySessionRecord[] = [];

    for (let off = startOffset; off >= endOffset; off--) {
      const ymd = getTodayDateString(buildDateAtOffset(off));
      const dayList = sessionsByDate.get(ymd) ?? [];
      for (const s of dayList) {
        weekSessions.push(s);
        if (s.kind === "pomodoro") {
          pomoMins += s.durationMinutes;
          sprints += 1;
        } else {
          otherMins += s.durationMinutes;
        }
      }
    }

    weekSessions.sort((a, b) =>
      (b.endedAt || b.startedAt).localeCompare(a.endedAt || a.startedAt)
    );

    const totMins = pomoMins + otherMins;
    const rangeLabel = `${monthNames[startDt.getMonth()]} ${startDt.getDate()} – ${
      monthNames[endDt.getMonth()]
    } ${endDt.getDate()}`;

    fourWeekRollup.push({
      id: `wk-${weekIdx}`,
      label:
        weekIdx === 0
          ? "Current 7d"
          : weekIdx === 1
          ? "Prior 7d"
          : `${weekIdx}w ago`,
      rangeLabel,
      startDate: getTodayDateString(startDt),
      endDate: getTodayDateString(endDt),
      isCurrentWeek: weekIdx === 0,
      pomodoroHours: roundHours(pomoMins),
      otherHours: roundHours(otherMins),
      totalHours: roundHours(totMins),
      totalMinutes: totMins,
      sessionCount: weekSessions.length,
      sprintCount: sprints,
      weeklyGoalHours,
      sessions: weekSessions,
    });
  }

  const totalMinutes = days.reduce((acc, d) => acc + d.totalMinutes, 0);
  const pomodoroMinutes = days.reduce((acc, d) => acc + d.pomodoroMinutes, 0);
  const otherMinutes = days.reduce((acc, d) => acc + d.otherMinutes, 0);
  const totalHours = roundHours(totalMinutes);
  const pomodoroHours = roundHours(pomodoroMinutes);
  const otherHours = roundHours(otherMinutes);
  const dailyAverageHours = roundHours(totalMinutes / 7);
  const weeklyGoalProgressPct =
    weeklyGoalHours > 0
      ? Math.min(999, Math.round((totalMinutes / (safeGoalMinutes * 7)) * 100))
      : 0;

  const previousWeekBucket = fourWeekRollup.find((w) => w.id === "wk-1");
  const previousWeekHours = previousWeekBucket ? previousWeekBucket.totalHours : 0;
  const weekOverWeekDeltaHours =
    Math.round((totalHours - previousWeekHours) * 100) / 100;

  const sprintCount = days.reduce((acc, d) => acc + d.sprintCount, 0);
  const sessionCount = days.reduce((acc, d) => acc + d.sessionCount, 0);
  const activeDaysCount = days.filter((d) => d.totalMinutes > 0).length;

  let peakDay: DailyFocusHoursBucket | null = null;
  for (const d of days) {
    if (d.totalMinutes > 0 && (!peakDay || d.totalMinutes >= peakDay.totalMinutes)) {
      peakDay = d;
    }
  }

  // Course distribution across current 7 days
  const courseMinutesMap = new Map<string, number>();
  for (const d of days) {
    for (const s of d.sessions) {
      const key = s.courseId || "__general__";
      courseMinutesMap.set(key, (courseMinutesMap.get(key) || 0) + s.durationMinutes);
    }
  }

  const courseBreakdown: CourseFocusShare[] = Array.from(courseMinutesMap.entries())
    .map(([courseId, mins]) => {
      const matched = courses.find((c) => c.id === courseId);
      return {
        courseId,
        code: matched ? matched.code : "GENERAL",
        label: matched ? `${matched.code} · ${matched.title}` : "General Focus Study",
        minutes: mins,
        hours: roundHours(mins),
        sharePct:
          totalMinutes > 0 ? Math.max(2, Math.round((mins / totalMinutes) * 100)) : 0,
      };
    })
    .sort((a, b) => b.minutes - a.minutes);

  return {
    days,
    fourWeekRollup,
    totalMinutes,
    totalHours,
    pomodoroMinutes,
    pomodoroHours,
    otherMinutes,
    otherHours,
    dailyAverageHours,
    dailyGoalHours,
    weeklyGoalHours,
    weeklyGoalProgressPct,
    previousWeekHours,
    weekOverWeekDeltaHours,
    sprintCount,
    sessionCount,
    activeDaysCount,
    peakDay,
    courseBreakdown,
  };
}
