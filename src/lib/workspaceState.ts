import type { Achievement, StudentAcademicProfile, StudyOSState } from "../types/studyOS";
import { getTodayDateString } from "./gamification";

export function generateWorkspaceSyncId(): string {
  const randomPart =
    Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
  return `ws_${randomPart.slice(0, 14)}`;
}

export function createDefaultAcademicProfile(
  academicTrack: string = "Self-Directed Mastery",
  nowIso: string = new Date().toISOString()
): StudentAcademicProfile {
  return {
    fullName: "",
    institution: "",
    programme: academicTrack,
    degreeLevel: "",
    academicYear: "",
    semester: "",
    academicGoals: [],
    personalLearningGoals: [],
    preferredLearningMethods: ["Active Recall", "Problem Solving"],
    accessibilityPreferences: {
      reducedMotion: false,
      highContrastText: false,
      comfortableSpacing: false,
      notes: "",
    },
    semesterHistory: [],
    skills: [],
    projects: [],
    certifications: [],
    updatedAt: nowIso,
  };
}

export function createDefaultAchievements(): Achievement[] {
  return [
    {
      id: "ach-first-mastery",
      title: "First Unit Mastered",
      desc: "Complete your first syllabus module unit (+100 XP).",
      icon: "CheckCircle2",
      unlockedAt: null,
    },
    {
      id: "ach-streak-7",
      title: "7-Day Study Streak",
      desc: "Maintain an active study streak for 7 consecutive days.",
      icon: "Flame",
      unlockedAt: null,
    },
    {
      id: "ach-deep-scholar",
      title: "Curriculum Architect",
      desc: "Synthesize your first AI curriculum or research track (+50 XP).",
      icon: "BrainCircuit",
      unlockedAt: null,
    },
    {
      id: "ach-obsidian-scribe",
      title: "Vault Scribe",
      desc: "Write or auto-synthesize 200+ words in a Knowledge Vault note (+25 XP).",
      icon: "FileText",
      unlockedAt: null,
    },
    {
      id: "ach-ten-units",
      title: "Tenfold Mastery",
      desc: "Master 10 syllabus units across your personal courses.",
      icon: "Layers",
      unlockedAt: null,
    },
    {
      id: "ach-level-5",
      title: "Deep Work Practitioner",
      desc: "Reach Level 5 (1,600+ XP) through consistent study and recall.",
      icon: "Award",
      unlockedAt: null,
    },
  ];
}

export function createBlankStudyOSState(options?: {
  handle?: string;
  academicTrack?: string;
  dailyGoalMinutes?: number;
  workspaceSyncId?: string;
}): StudyOSState {
  const today = getTodayDateString();
  const nowIso = new Date().toISOString();
  const handle = options?.handle?.trim() || "learner";
  const academicTrack = options?.academicTrack?.trim() || "Self-Directed Mastery";
  const dailyGoalMinutes = Math.max(30, Math.min(600, options?.dailyGoalMinutes ?? 120));
  const workspaceSyncId =
    options?.workspaceSyncId && /^[a-zA-Z0-9_-]{8,64}$/.test(options.workspaceSyncId)
      ? options.workspaceSyncId
      : generateWorkspaceSyncId();

  return {
    schemaVersion: 3,
    workspaceSyncId,
    settings: {
      preferredProvider: "gemini",
      selectedModel: "gemini-3.8-flash",
      temperature: 0.25,
      topP: 0.9,
      theme: "dark",
      soundEnabled: true,
      focusLockdown: false,
      autonomousAgentEnabled: true,
      customShortcuts: {},
      studentHandle: handle,
      academicTrack,
    },
    stats: {
      streakCount: 1,
      lastActiveDate: today,
      currentXP: 0,
      todayXP: 0,
      level: 1,
      completedModulesCount: 0,
      dailyGoalMinutes,
      todayMinutesSpent: 0,
      totalMinutesStudied: 0,
      focusSprintsToday: 0,
      totalFocusSprints: 0,
      flashcardsReviewedToday: 0,
      totalFlashcardsReviewed: 0,
      autoFetchedModulesCount: 0,
      shortcutTriggersCount: 0,
      weeklyMinutes: {
        [today]: 0,
      },
    },
    courses: [],
    modules: [],
    achievements: createDefaultAchievements(),
    flashcards: [],
    timeBlocks: [],
    deadlines: [],
    researchSessions: [],
    activityLog: [
      {
        id: `act-init-${Date.now()}`,
        timestamp: nowIso,
        type: "workspace_created",
        title: `Initialized clean workspace (${handle})`,
        detail: "Local-first storage & growth ledger ready",
        xpEarned: 0,
      },
    ],
    academicProfile: createDefaultAcademicProfile(academicTrack, nowIso),
    tasks: [],
    assessments: [],
    assessmentAttempts: [],
    studySessions: [],
    learningEvents: [],
    recordCorrections: [],
    recommendationFeedback: [],
    activeFocusSession: null,
  };
}
