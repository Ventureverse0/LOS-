import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AppView,
  type AcademicTask,
  type AcademicTaskKind,
  type AcademicTaskPriority,
  type ActivityEventType,
  type ActivityLogEntry,
  type Assessment,
  type AssessmentAttempt,
  type AssessmentDifficulty,
  type AssessmentKind,
  type AssessmentQuestion,
  type CertificationMilestone,
  type Course,
  type DeadlineItem,
  type DeepResearchReportData,
  type ErrorCategory,
  type Flashcard,
  type GeneratedCurriculum,
  type LearnerProfileMeta,
  type LearningEvent,
  type ModuleStatus,
  type ModuleUnit,
  type NoteRevision,
  type PortfolioProject,
  type QuestionAttemptResponse,
  type RecordCorrection,
  type ResourceItem,
  type ShortcutActionId,
  type SkillRecord,
  type StudentAcademicProfile,
  type StudyOSState,
  type StudySessionRecord,
  type TimeBlock,
  type ToastNotification,
  type UploadedNoteDocument,
  type UserSettings,
  type VaultHighlight,
  type VideoBookmark,
} from "../types/studyOS";
import { createBlankStudyOSState, generateWorkspaceSyncId } from "../lib/workspaceState";
import {
  XP_REWARDS,
  calculateLevel,
  countWords,
  evaluateAchievements,
  evaluateStreakOnLoad,
  formatFutureDueLabel,
  formatSecondsToTimestamp,
  getTodayDateString,
  normalizeCourseTags,
  syncCoursesWithModules,
} from "../lib/gamification";
import {
  DEFAULT_PROFILE_ID,
  checkServerDbHealth,
  deleteProfileStorage,
  deleteWorkspaceFromServer,
  exportCalendarIcsFile,
  exportFlashcardsAnkiTsv,
  exportPortfolioMarkdownFile,
  exportStateBackupFile,
  getActiveProfileIdSync,
  getProfileStorageKey,
  loadFromIndexedDB,
  loadInitialStateSync,
  loadLearnerProfilesSync,
  loadProfileStateSync,
  parseImportedBackupJson,
  persistState,
  pullWorkspaceFromServer,
  pushWorkspaceToServer,
  sanitizeState,
  saveLearnerProfilesSync,
  setActiveProfileIdSync,
} from "../lib/storage";
import {
  appendLearningEventIdempotent,
  appendStudySessionIdempotent,
  computeFlashcardNextReviewIso,
  validateAcademicTaskInput,
  validateAssessmentAttemptInput,
} from "../lib/growthIntelligence";
import { isEditableElement, matchShortcutAction } from "../lib/shortcuts";
import { playSoundEffect, triggerConfettiBurst } from "../lib/soundAndConfetti";
import {
  fetchAIEngineStatus,
  runAutonomousModuleSync,
  type AIEngineStatus,
} from "../services/aiService";
import {
  extractNoteConcepts,
  synthesizeDeterministicVaultAssist,
} from "../lib/integrativePhysicsEngine";

interface PomodoroState {
  sessionId: string;
  isRunning: boolean;
  mode: "focus" | "break";
  totalSeconds: number;
  remainingSeconds: number;
  linkedCourseId: string;
  linkedModuleId?: string;
  startedAt: string;
  sessionsCompletedToday: number;
}

export interface DbSyncStatus {
  status: "synced" | "syncing" | "local-only" | "error";
  serverAvailable: boolean;
  lastSyncedAt: string | null;
  revision: number;
}

export interface LocalSaveStatus {
  status: "saved" | "saving" | "error";
  error?: string;
}

export interface AutonomousAgentStatus {
  isBusy: boolean;
  activeModuleId: string | null;
  activeModuleTitle: string;
  lastSyncedSummary: string | null;
  lastSyncedAt: string | null;
}

export interface CurriculumIngestMeta {
  learningGoals?: string;
  sourceDocuments?: UploadedNoteDocument[];
  rawNotesText?: string;
}

interface StudyOSContextValue {
  state: StudyOSState;
  activeView: AppView;
  setActiveView: (view: AppView) => void;
  selectedCourseId: string | null;
  setSelectedCourseId: (id: string | null) => void;
  selectedModuleId: string | null;
  setSelectedModuleId: (id: string | null) => void;
  openModuleInVault: (moduleId: string) => void;
  openCourseInManager: (courseId: string) => void;
  openCourseTagFilter: (tag: string) => void;
  activeCourseTagFilters: string[];
  setActiveCourseTagFilters: React.Dispatch<React.SetStateAction<string[]>>;
  courseTagMatchMode: "any" | "all";
  setCourseTagMatchMode: (mode: "any" | "all") => void;
  openGrokopediaWithTopic: (topic: string) => void;
  pendingGrokTopic: string;
  clearPendingGrokTopic: () => void;
  isCommandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;

  // Global Keyboard Shortcut Manager
  isShortcutModalOpen: boolean;
  setShortcutModalOpen: (open: boolean) => void;
  isRecordingShortcut: boolean;
  setIsRecordingShortcut: (recording: boolean) => void;
  updateShortcutBinding: (actionId: ShortcutActionId, chord: string) => void;
  resetShortcutBindings: () => void;
  createQuickVaultNote: (customTitle?: string) => ModuleUnit;
  triggerFocusSessionShortcut: () => void;
  vaultFocusTitleTick: number;

  // Autonomous Thinking, Fetching & Note-Taking Engine
  autonomousAgentStatus: AutonomousAgentStatus;
  runAutonomousNoteTaker: (
    moduleId?: string,
    options?: { isBackgroundAuto?: boolean }
  ) => Promise<void>;

  // Interactive Walkthrough Guide & 3D Integrative Physics Lab
  isGuideModalOpen: boolean;
  setGuideModalOpen: (open: boolean) => void;
  activeLabTopic: string;
  launchIntegrativeLab: (options?: {
    courseId?: string;
    moduleId?: string;
    customTopic?: string;
  }) => void;
  recordPhysicsLabSession: (payload: {
    topic: string;
    courseId?: string;
    moduleId?: string;
    markdownReport?: string;
    stagesCleared: number;
    score: number;
    primaryEquation: string;
    conservationLaw: string;
    silentStageIncrement?: boolean;
  }) => void;

  aiStatus: AIEngineStatus;
  refreshAIStatus: () => Promise<void>;
  toasts: ToastNotification[];
  pushToast: (toast: Omit<ToastNotification, "id">) => void;
  dismissToast: (id: string) => void;

  // Multi-Learner Profiles & Local Database Sync
  profiles: LearnerProfileMeta[];
  activeProfileId: string;
  createLearnerProfile: (input: {
    handle: string;
    academicTrack?: string;
    dailyGoalMinutes?: number;
  }) => void;
  switchLearnerProfile: (profileId: string) => Promise<void>;
  deleteLearnerProfile: (profileId: string) => void;
  dbSyncState: DbSyncStatus;
  localSaveStatus: LocalSaveStatus;
  retryLocalSave: () => void;
  deleteServerWorkspaceSnapshot: () => Promise<void>;
  syncWorkspaceNow: () => Promise<void>;
  pullWorkspaceBySyncId: (workspaceSyncId: string) => Promise<boolean>;

  // Course & Module Mutations
  createCourse: (input: {
    code: string;
    title: string;
    category: string;
    instructor?: string;
    deadlineLabel?: string;
    semester?: string;
    academicYear?: string;
    credits?: number;
    tags?: string[];
  }) => Course;
  updateCourse: (
    courseId: string,
    patch: Partial<
      Pick<
        Course,
        | "code"
        | "title"
        | "category"
        | "instructor"
        | "deadlineLabel"
        | "semester"
        | "academicYear"
        | "credits"
        | "tags"
      >
    >
  ) => void;
  updateCourseTags: (courseId: string, tags: string[]) => void;
  toggleArchiveCourse: (courseId: string) => void;
  deleteCourse: (courseId: string) => void;
  addModule: (input: {
    courseId: string;
    unitGroup?: string;
    title: string;
    estimatedHours: number;
    videoLink?: string;
    tags?: string[];
    notesMarkdown?: string;
    briefOverview?: string;
    sourceFileNames?: string[];
  }) => ModuleUnit;
  updateModuleStatus: (moduleId: string, status: ModuleStatus) => void;
  updateModuleDetails: (
    moduleId: string,
    patch: Partial<
      Pick<ModuleUnit, "title" | "unitGroup" | "videoLink" | "estimatedHours" | "tags">
    >
  ) => void;
  toggleArchiveModule: (moduleId: string) => void;
  saveModuleNotes: (moduleId: string, markdown: string) => void;
  restoreNoteRevision: (moduleId: string, revisionId: string) => void;
  addLearningObjective: (moduleId: string, text: string) => void;
  toggleLearningObjective: (moduleId: string, objectiveId: string) => void;
  removeLearningObjective: (moduleId: string, objectiveId: string) => void;
  addUnresolvedQuestion: (moduleId: string, question: string) => void;
  toggleUnresolvedQuestion: (
    moduleId: string,
    questionId: string,
    resolutionNote?: string
  ) => void;
  removeUnresolvedQuestion: (moduleId: string, questionId: string) => void;
  saveModuleReflection: (moduleId: string, reflectionNote: string) => void;
  saveModuleTranscript: (moduleId: string, transcriptNotes: string) => void;
  addModuleHighlight: (
    moduleId: string,
    input: { anchorLabel: string; excerpt: string; note?: string }
  ) => VaultHighlight | null;
  removeModuleHighlight: (moduleId: string, highlightId: string) => void;
  promoteHighlightToFlashcard: (moduleId: string, highlightId: string) => void;
  promoteHighlightToQuizQuestion: (moduleId: string, highlightId: string) => void;
  reorderModule: (moduleId: string, direction: "up" | "down") => void;
  deleteModule: (moduleId: string) => void;
  addModuleResource: (moduleId: string, resource: Omit<ResourceItem, "id">) => void;
  removeModuleResource: (moduleId: string, resourceId: string) => void;
  addModuleBookmark: (moduleId: string, bookmark: Omit<VideoBookmark, "id">) => void;
  removeModuleBookmark: (moduleId: string, bookmarkId: string) => void;

  // Academic Tasks, Assessments & Auditable Attempts (Modules 2.6, 2.7 & Phase 3)
  createAcademicTask: (input: {
    title: string;
    kind: AcademicTaskKind;
    priority: AcademicTaskPriority;
    dueDate: string;
    estimatedMinutes: number;
    courseId?: string;
    moduleId?: string;
    examChapters?: string[];
  }) => { ok: boolean; error?: string; task?: AcademicTask };
  updateAcademicTask: (taskId: string, patch: Partial<AcademicTask>) => void;
  deleteAcademicTask: (taskId: string) => void;
  recoverMissedTask: (taskId: string) => void;
  createAssessment: (
    assessment: Omit<Assessment, "id" | "createdAt"> & { id?: string; createdAt?: string }
  ) => Assessment;
  deleteAssessment: (assessmentId: string) => void;
  recordAssessmentAttempt: (input: {
    assessmentId?: string;
    courseId: string;
    moduleId?: string;
    title: string;
    kind: AssessmentKind;
    difficulty: AssessmentDifficulty;
    score: number;
    maxScore: number;
    selfConfidence: number;
    durationMinutes?: number;
    errorCategories: ErrorCategory[];
    isDelayedRecall?: boolean;
    questionResponses?: QuestionAttemptResponse[];
    reflection?: string;
    attemptedAt?: string;
  }) => { ok: boolean; error?: string; attempt?: AssessmentAttempt };
  correctAssessmentAttempt: (
    attemptId: string,
    patch: {
      score: number;
      maxScore: number;
      selfConfidence?: number;
      errorCategories?: ErrorCategory[];
      reflection?: string;
    },
    reason: string
  ) => { ok: boolean; error?: string };
  deleteAssessmentAttempt: (attemptId: string, reason: string) => void;

  // Student Profile, Skills, Portfolio & Recommendations (Modules 2.1, 2.10 & 3.4)
  updateAcademicProfile: (patch: Partial<StudentAcademicProfile>) => void;
  upsertSkillRecord: (
    input: Omit<SkillRecord, "id" | "updatedAt"> & { id?: string }
  ) => SkillRecord;
  deleteSkillRecord: (skillId: string) => void;
  addPortfolioProject: (
    input: Omit<PortfolioProject, "id" | "createdAt">
  ) => PortfolioProject;
  deletePortfolioProject: (projectId: string) => void;
  addCertificationMilestone: (
    input: Omit<CertificationMilestone, "id">
  ) => CertificationMilestone;
  deleteCertificationMilestone: (certId: string) => void;
  exportPortfolio: () => void;
  exportAnkiDeck: (courseId?: string) => void;
  exportCalendarIcs: () => void;
  actOnRecommendation: (
    recommendationId: string,
    action: "accepted" | "dismissed" | "snoozed"
  ) => void;

  // Grokopedia & Notes Curriculum Mutations
  ingestGeneratedCurriculum: (
    curriculum: GeneratedCurriculum,
    topic: string,
    model: string,
    meta?: CurriculumIngestMeta
  ) => Course;
  saveGeneratedReport: (report: DeepResearchReportData, topic: string, model: string) => void;
  saveReportAsVaultModule: (title: string, markdown: string, courseId?: string) => ModuleUnit;

  // Study Time, Pomodoro, TimeBlocks, Deadlines, Flashcards
  pomodoro: PomodoroState;
  startOrPausePomodoro: () => void;
  resetPomodoro: (minutes?: number, mode?: "focus" | "break") => void;
  setPomodoroCourse: (courseId: string) => void;
  setPomodoroModule: (moduleId: string) => void;
  logStudyMinutes: (
    minutes: number,
    label?: string,
    options?: {
      isFocusSprint?: boolean;
      courseId?: string;
      moduleId?: string;
      idempotencyKey?: string;
      startedAt?: string;
    }
  ) => void;
  toggleTimeBlock: (blockId: string) => void;
  addTimeBlock: (block: Omit<TimeBlock, "id" | "completed">) => void;
  toggleDeadline: (deadlineId: string) => void;
  addDeadline: (deadline: Omit<DeadlineItem, "id" | "completed">) => void;
  addFlashcardsBatch: (
    cards: Array<{ courseId: string; moduleId?: string; question: string; answer: string }>
  ) => void;
  reviewFlashcard: (cardId: string, rating: "again" | "hard" | "good" | "easy") => void;
  deleteFlashcard: (cardId: string) => void;

  // Settings, Clean-Slate Reset & Backup
  updateSettings: (patch: Partial<UserSettings>) => void;
  updateDailyGoalMinutes: (minutes: number) => void;
  exportBackup: () => void;
  importBackupJson: (jsonText: string) => void;
  startFreshFromScratch: (options?: {
    handle?: string;
    academicTrack?: string;
    dailyGoalMinutes?: number;
  }) => void;
}

const StudyOSContext = createContext<StudyOSContextValue | null>(null);

const CURATED_LECTURE_FALLBACKS: Array<{ pattern: RegExp; url: string }> = [
  { pattern: /\bb-?tree|slotted page|wal\b|aries\b|mvcc\b/i, url: "https://www.youtube.com/watch?v=aZjYr87r1b8" },
  { pattern: /\braft\b|\bpaxos\b|byzantine|pbft/i, url: "https://www.youtube.com/watch?v=64Zp3tzNbpE" },
  { pattern: /\brisc-?v\b|tomasulo|branch predictor|verilog/i, url: "https://www.youtube.com/watch?v=6Rk2kn2wbdU" },
  { pattern: /\bsvd\b|eigenvalue|singular value decomposition/i, url: "https://www.youtube.com/watch?v=mBcLRGuAFUk" },
  { pattern: /virtual memory|page table|tlb\b|io_uring/i, url: "https://www.youtube.com/watch?v=26QPDBe-NB8" },
  { pattern: /\bdijkstra\b|bellman-ford/i, url: "https://www.youtube.com/watch?v=ZA-tUyM_y7s" },
  { pattern: /\bbgp\b|tcp congestion|quic protocol/i, url: "https://www.youtube.com/watch?v=kee9T7D2Vo0" },
  { pattern: /\bllvm\b|ssa form|register allocation/i, url: "https://www.youtube.com/watch?v=O9upVbGSBFo" },
];

function pickCuratedVideoForTopic(query: string): string {
  for (const item of CURATED_LECTURE_FALLBACKS) {
    if (item.pattern.test(query)) {
      return item.url;
    }
  }
  return "";
}

function isPlaceholderNoteTitle(title: string): boolean {
  const clean = title.trim();
  if (clean.length < 4) return true;
  return /^(study note\s*\d*|untitled(\s+note)?\s*\d*|new\s+note\s*\d*)$/i.test(clean);
}

function createActivityItem(
  type: ActivityEventType,
  title: string,
  xpEarned: number = 0,
  detail?: string
): ActivityLogEntry {
  return {
    id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    type,
    title,
    detail,
    xpEarned,
  };
}

function prependActivity(
  existing: ActivityLogEntry[],
  item: ActivityLogEntry
): ActivityLogEntry[] {
  return [item, ...(Array.isArray(existing) ? existing : [])].slice(0, 60);
}

export function StudyOSProvider({ children }: { children: React.ReactNode }) {
  const blankFallback = useMemo(() => createBlankStudyOSState(), []);
  const [activeProfileId, setActiveProfileId] = useState<string>(() => getActiveProfileIdSync());
  const [state, setState] = useState<StudyOSState>(() => loadInitialStateSync(blankFallback));
  const [profiles, setProfiles] = useState<LearnerProfileMeta[]>(() => {
    const existing = loadLearnerProfilesSync();
    if (existing.length > 0) return existing;
    const nowIso = new Date().toISOString();
    return [
      {
        id: getActiveProfileIdSync(),
        workspaceSyncId: state.workspaceSyncId,
        handle: state.settings.studentHandle,
        academicTrack: state.settings.academicTrack,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    ];
  });

  const [activeView, setActiveView] = useState<AppView>(AppView.DASHBOARD);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(
    () => state.courses[0]?.id || null
  );
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(
    () => state.modules[0]?.id || null
  );
  const [activeCourseTagFilters, setActiveCourseTagFilters] = useState<string[]>([]);
  const [courseTagMatchMode, setCourseTagMatchMode] = useState<"any" | "all">("any");
  const [pendingGrokTopic, setPendingGrokTopic] = useState<string>("");
  const [isCommandPaletteOpen, setCommandPaletteOpen] = useState<boolean>(false);
  const [isShortcutModalOpen, setShortcutModalOpen] = useState<boolean>(false);
  const [isGuideModalOpen, setGuideModalOpen] = useState<boolean>(false);
  const [isRecordingShortcut, setIsRecordingShortcut] = useState<boolean>(false);
  const [vaultFocusTitleTick, setVaultFocusTitleTick] = useState<number>(0);
  const [activeLabTopic, setActiveLabTopic] = useState<string>(() => {
    const initialMod = state.modules[0];
    if (initialMod && !isPlaceholderNoteTitle(initialMod.title)) {
      return initialMod.title;
    }
    return state.courses[0]?.title || "Integrative Physics & Applied Mathematics";
  });

  const [autonomousAgentStatus, setAutonomousAgentStatus] = useState<AutonomousAgentStatus>({
    isBusy: false,
    activeModuleId: null,
    activeModuleTitle: "",
    lastSyncedSummary: null,
    lastSyncedAt: null,
  });

  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const [aiStatus, setAiStatus] = useState<AIEngineStatus>({
    connected: true,
    provider: "gemini",
    defaultModel: "gemini-3.8-flash",
    availableModels: [
      { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash (Balanced Deep Synthesis)" },
      { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite (Low-Latency Fast)" },
    ],
  });

  const [dbSyncState, setDbSyncState] = useState<DbSyncStatus>({
    status: "local-only",
    serverAvailable: false,
    lastSyncedAt: null,
    revision: 0,
  });

  const [localSaveStatus, setLocalSaveStatus] = useState<LocalSaveStatus>({
    status: "saved",
  });

  const [pomodoroTimer, setPomodoroTimer] = useState<{
    sessionId: string;
    isRunning: boolean;
    mode: "focus" | "break";
    totalSeconds: number;
    remainingSeconds: number;
    linkedCourseId: string;
    linkedModuleId?: string;
    startedAt: string;
  }>(() => {
    const saved = state.activeFocusSession;
    if (saved && saved.remainingSeconds > 0) {
      return {
        sessionId: saved.sessionId || `focus-${Date.now()}`,
        isRunning: false, // Resume safely in paused state after browser reload so student isn't surprised
        mode: saved.mode,
        totalSeconds: saved.totalSeconds,
        remainingSeconds: saved.remainingSeconds,
        linkedCourseId: saved.linkedCourseId || state.courses[0]?.id || "",
        linkedModuleId: saved.linkedModuleId,
        startedAt: saved.startedAt || new Date().toISOString(),
      };
    }
    return {
      sessionId: `focus-${Date.now()}`,
      isRunning: false,
      mode: "focus",
      totalSeconds: 25 * 60,
      remainingSeconds: 25 * 60,
      linkedCourseId: state.courses[0]?.id || "",
      linkedModuleId: state.modules[0]?.id,
      startedAt: new Date().toISOString(),
    };
  });

  const pomodoro: PomodoroState = useMemo(
    () => ({
      ...pomodoroTimer,
      sessionsCompletedToday: state.stats.focusSprintsToday,
    }),
    [pomodoroTimer, state.stats.focusSprintsToday]
  );

  // Refs to avoid stale closures in global listeners and autonomous background intervals
  const stateRef = useRef(state);
  stateRef.current = state;
  const activeViewRef = useRef(activeView);
  activeViewRef.current = activeView;
  const selectedModuleIdRef = useRef(selectedModuleId);
  selectedModuleIdRef.current = selectedModuleId;
  const pomodoroRef = useRef(pomodoroTimer);
  pomodoroRef.current = pomodoroTimer;
  const dbSyncRevisionRef = useRef(dbSyncState.revision);
  dbSyncRevisionRef.current = dbSyncState.revision;
  const soundEnabledRef = useRef(state.settings.soundEnabled);
  soundEnabledRef.current = state.settings.soundEnabled;
  const isRecordingShortcutRef = useRef(isRecordingShortcut);
  isRecordingShortcutRef.current = isRecordingShortcut;
  const inFlightAutoSyncRef = useRef<string | null>(null);
  const lastUserActivityMsRef = useRef<number>(Date.now());

  const pushToast = useCallback((toast: Omit<ToastNotification, "id">) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev.slice(-3), { ...toast, id }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Keep 3D Physics Lab topic automatically synchronized as the learner switches study units
  useEffect(() => {
    if (!selectedModuleId) return;
    const mod = state.modules.find((m) => m.id === selectedModuleId);
    if (mod && !isPlaceholderNoteTitle(mod.title)) {
      setActiveLabTopic(mod.title);
    }
  }, [selectedModuleId, state.modules]);

  // Hydrate from IndexedDB if localStorage was cleared for the active profile
  useEffect(() => {
    const hasProfileInLocal = Boolean(loadProfileStateSync(activeProfileId, blankFallback));
    const hasLegacy =
      typeof window !== "undefined" && Boolean(window.localStorage.getItem("study_os_state_v1"));
    if (!hasProfileInLocal && !hasLegacy) {
      void loadFromIndexedDB(activeProfileId).then((idbState) => {
        if (idbState) {
          const sanitized = sanitizeState(idbState, blankFallback);
          setState(sanitized);
          setSelectedCourseId(sanitized.courses[0]?.id || null);
          setSelectedModuleId(sanitized.modules[0]?.id || null);
        }
      });
    }
  }, [activeProfileId, blankFallback]);

  // Check local server DB health on mount
  useEffect(() => {
    void checkServerDbHealth().then((health) => {
      setDbSyncState((prev) => ({
        ...prev,
        serverAvailable: health.ok,
      }));
    });
  }, []);

  // Persist locally (localStorage + IndexedDB) & keep profile metadata synced, surfacing save errors visibly
  useEffect(() => {
    const syncRes = persistState(state, activeProfileId, (idbRes) => {
      if (!idbRes.ok) {
        setLocalSaveStatus({
          status: "error",
          error: idbRes.error || "Local storage write failed.",
        });
      } else {
        setLocalSaveStatus({ status: "saved" });
      }
    });

    if (!syncRes.ok) {
      setLocalSaveStatus({
        status: "error",
        error: syncRes.error,
      });
    } else {
      setLocalSaveStatus({ status: "saved" });
    }

    setActiveProfileIdSync(activeProfileId);

    setProfiles((prev) => {
      const nowIso = new Date().toISOString();
      const exists = prev.some((p) => p.id === activeProfileId);
      const updated = exists
        ? prev.map((p) =>
            p.id === activeProfileId
              ? {
                  ...p,
                  workspaceSyncId: state.workspaceSyncId,
                  handle: state.settings.studentHandle,
                  academicTrack: state.settings.academicTrack,
                  updatedAt: nowIso,
                }
              : p
          )
        : [
            ...prev,
            {
              id: activeProfileId,
              workspaceSyncId: state.workspaceSyncId,
              handle: state.settings.studentHandle,
              academicTrack: state.settings.academicTrack,
              createdAt: nowIso,
              updatedAt: nowIso,
            },
          ];
      saveLearnerProfilesSync(updated);
      return updated;
    });
  }, [state, activeProfileId]);

  const retryLocalSave = useCallback(() => {
    setLocalSaveStatus({ status: "saving" });
    const res = persistState(stateRef.current, activeProfileId, (idbRes) => {
      if (idbRes.ok) {
        setLocalSaveStatus({ status: "saved" });
        pushToast({
          title: "Local Save Recovered",
          subtitle: "Workspace persisted cleanly to browser storage.",
          variant: "success",
        });
      } else {
        setLocalSaveStatus({ status: "error", error: idbRes.error });
      }
    });
    if (!res.ok) {
      setLocalSaveStatus({ status: "error", error: res.error });
    }
  }, [activeProfileId, pushToast]);

  const deleteServerWorkspaceSnapshot = useCallback(async () => {
    const ok = await deleteWorkspaceFromServer(stateRef.current.workspaceSyncId);
    setDbSyncState((prev) => ({
      ...prev,
      status: "local-only",
      lastSyncedAt: null,
    }));
    pushToast({
      title: ok ? "Server Snapshot Deleted" : "Server Snapshot Cleared",
      subtitle: "Browser copy remains under your local control until deleted.",
      variant: "warning",
    });
  }, [pushToast]);

  // Debounced background sync to local server atomic store (./data/workspaces/<workspaceSyncId>.json)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDbSyncState((prev) => ({
        ...prev,
        status: prev.serverAvailable ? "syncing" : prev.status,
      }));
      void pushWorkspaceToServer(state).then((res) => {
        if (res.ok) {
          setDbSyncState({
            status: "synced",
            serverAvailable: true,
            lastSyncedAt: res.updatedAt || new Date().toISOString(),
            revision: res.revision || 1,
          });
        } else {
          setDbSyncState((prev) => ({
            ...prev,
            status: "local-only",
            serverAvailable: false,
          }));
        }
      });
    }, 800);

    return () => window.clearTimeout(timer);
  }, [state]);

  // Cross-tab localStorage live sync & tab-focus server workspace check
  useEffect(() => {
    const expectedStorageKey = getProfileStorageKey(activeProfileId);

    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key === expectedStorageKey && e.newValue) {
        try {
          const incoming = JSON.parse(e.newValue) as Partial<StudyOSState>;
          setState((prev) => sanitizeState(incoming, prev));
        } catch {
          // Ignore malformed cross-tab payload
        }
      }
    };

    const handleVisibilitySync = () => {
      if (document.visibilityState !== "visible") return;
      const syncId = stateRef.current.workspaceSyncId;
      if (!syncId) return;
      void pullWorkspaceFromServer(syncId, blankFallback)
        .then((res) => {
          if (
            res.found &&
            res.state &&
            typeof res.revision === "number" &&
            res.revision > dbSyncRevisionRef.current
          ) {
            setState(res.state);
            setDbSyncState({
              status: "synced",
              serverAvailable: true,
              lastSyncedAt: res.updatedAt || new Date().toISOString(),
              revision: res.revision,
            });
          }
        })
        .catch(() => {
          // Ignore offline server check
        });
    };

    window.addEventListener("storage", handleStorageEvent);
    document.addEventListener("visibilitychange", handleVisibilitySync);
    return () => {
      window.removeEventListener("storage", handleStorageEvent);
      document.removeEventListener("visibilitychange", handleVisibilitySync);
    };
  }, [activeProfileId, blankFallback]);

  const syncWorkspaceNow = useCallback(async () => {
    setDbSyncState((prev) => ({ ...prev, status: "syncing" }));
    const res = await pushWorkspaceToServer(state);
    if (res.ok) {
      setDbSyncState({
        status: "synced",
        serverAvailable: true,
        lastSyncedAt: res.updatedAt || new Date().toISOString(),
        revision: res.revision || 1,
      });
      pushToast({
        title: "Synced to Local Workspace DB",
        subtitle: `Saved snapshot ${state.workspaceSyncId} (rev ${res.revision || 1})`,
        variant: "success",
      });
    } else {
      setDbSyncState((prev) => ({
        ...prev,
        status: "local-only",
        serverAvailable: false,
      }));
      pushToast({
        title: "Saved in Browser IndexedDB",
        subtitle: "Local server sync endpoint unavailable; browser database is active.",
        variant: "warning",
      });
    }
  }, [state, pushToast]);

  const pullWorkspaceBySyncId = useCallback(
    async (workspaceSyncId: string): Promise<boolean> => {
      try {
        const result = await pullWorkspaceFromServer(workspaceSyncId, blankFallback);
        if (!result.found || !result.state) {
          pushToast({
            title: "Workspace Not Found",
            subtitle: `No local server snapshot found for ID "${workspaceSyncId.trim()}".`,
            variant: "error",
          });
          return false;
        }
        setState(result.state);
        setSelectedCourseId(result.state.courses[0]?.id || null);
        setSelectedModuleId(result.state.modules[0]?.id || null);
        setDbSyncState({
          status: "synced",
          serverAvailable: true,
          lastSyncedAt: result.updatedAt || new Date().toISOString(),
          revision: result.revision || 1,
        });
        pushToast({
          title: "Workspace Restored from Local DB",
          subtitle: `Loaded ${result.state.courses.length} courses for ${result.state.settings.studentHandle}`,
          variant: "success",
        });
        return true;
      } catch (err: unknown) {
        pushToast({
          title: "Workspace Restore Failed",
          subtitle: err instanceof Error ? err.message : "Could not load workspace snapshot.",
          variant: "error",
        });
        return false;
      }
    },
    [blankFallback, pushToast]
  );

  // Multi-Learner Profile Operations
  const createLearnerProfile = useCallback(
    (input: { handle: string; academicTrack?: string; dailyGoalMinutes?: number }) => {
      const cleanHandle = input.handle.trim() || `learner-${profiles.length + 1}`;
      const newProfileId = `profile-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const freshState = createBlankStudyOSState({
        handle: cleanHandle,
        academicTrack: input.academicTrack?.trim() || "Self-Directed Mastery",
        dailyGoalMinutes: input.dailyGoalMinutes ?? 120,
      });

      persistState(state, activeProfileId);
      setActiveProfileId(newProfileId);
      setActiveProfileIdSync(newProfileId);
      setState(freshState);
      setSelectedCourseId(null);
      setSelectedModuleId(null);
      setActiveCourseTagFilters([]);

      pushToast({
        title: `Created Learner Workspace: ${cleanHandle}`,
        subtitle: "Clean slate ready — upload notes or enter any subject to start.",
        variant: "success",
      });
    },
    [profiles.length, state, activeProfileId, pushToast]
  );

  const switchLearnerProfile = useCallback(
    async (profileId: string) => {
      if (profileId === activeProfileId) return;
      persistState(state, activeProfileId);

      const targetMeta = profiles.find((p) => p.id === profileId);
      const customFallback = createBlankStudyOSState({
        handle: targetMeta?.handle || "learner",
        academicTrack: targetMeta?.academicTrack || "Self-Directed Mastery",
        workspaceSyncId: targetMeta?.workspaceSyncId,
      });

      let nextState = loadProfileStateSync(profileId, customFallback);
      if (!nextState) {
        const idb = await loadFromIndexedDB(profileId);
        if (idb) {
          nextState = sanitizeState(idb, customFallback);
        }
      }
      if (!nextState && targetMeta?.workspaceSyncId) {
        try {
          const pulled = await pullWorkspaceFromServer(targetMeta.workspaceSyncId, customFallback);
          if (pulled.found && pulled.state) {
            nextState = pulled.state;
          }
        } catch {
          // Ignore network error and use fallback
        }
      }

      const resolved = nextState || customFallback;
      setActiveProfileId(profileId);
      setActiveProfileIdSync(profileId);
      setState(resolved);
      setSelectedCourseId(resolved.courses[0]?.id || null);
      setSelectedModuleId(resolved.modules[0]?.id || null);
      setActiveCourseTagFilters([]);

      pushToast({
        title: `Switched to ${resolved.settings.studentHandle}`,
        subtitle: `${resolved.courses.length} courses · Level ${resolved.stats.level}`,
        variant: "success",
      });
    },
    [activeProfileId, state, profiles, pushToast]
  );

  const deleteLearnerProfile = useCallback(
    (profileId: string) => {
      if (profiles.length <= 1) {
        const fresh = createBlankStudyOSState();
        deleteProfileStorage(profileId);
        setActiveProfileId(DEFAULT_PROFILE_ID);
        setActiveProfileIdSync(DEFAULT_PROFILE_ID);
        setProfiles([
          {
            id: DEFAULT_PROFILE_ID,
            workspaceSyncId: fresh.workspaceSyncId,
            handle: fresh.settings.studentHandle,
            academicTrack: fresh.settings.academicTrack,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ]);
        setState(fresh);
        setSelectedCourseId(null);
        setSelectedModuleId(null);
        pushToast({
          title: "Workspace Cleared",
          subtitle: "Started a fresh blank workspace.",
          variant: "warning",
        });
        return;
      }

      const remaining = profiles.filter((p) => p.id !== profileId);
      deleteProfileStorage(profileId);
      saveLearnerProfilesSync(remaining);
      setProfiles(remaining);

      if (profileId === activeProfileId && remaining[0]) {
        void switchLearnerProfile(remaining[0].id);
      } else {
        pushToast({
          title: "Removed Learner Profile",
          subtitle: "Local workspace data deleted.",
          variant: "warning",
        });
      }
    },
    [profiles, activeProfileId, switchLearnerProfile, pushToast]
  );

  const refreshAIStatus = useCallback(async () => {
    const status = await fetchAIEngineStatus();
    setAiStatus(status);
  }, []);

  useEffect(() => {
    void refreshAIStatus();
  }, [refreshAIStatus]);

  // Helper to apply XP, check Level-Up, Achievements & Activity Log
  const commitStateWithXP = useCallback(
    (
      updater: (prev: StudyOSState) => StudyOSState,
      xpDelta: number = 0,
      toastMeta?: { title: string; subtitle?: string; celebrate?: boolean },
      activityMeta?: { type: ActivityEventType; title: string; detail?: string }
    ) => {
      setState((prev) => {
        const draft = updater(prev);
        const syncedCourses = syncCoursesWithModules(draft.courses, draft.modules);
        const completedCount = draft.modules.filter(
          (m) => !m.archived && m.status === "Mastered"
        ).length;

        const oldLevel = prev.stats.level;
        const newXP = Math.max(0, draft.stats.currentXP + xpDelta);
        const newLevel = calculateLevel(newXP);
        const today = getTodayDateString();

        const updatedLog = activityMeta
          ? prependActivity(
              draft.activityLog,
              createActivityItem(
                activityMeta.type,
                activityMeta.title,
                Math.max(0, xpDelta),
                activityMeta.detail
              )
            )
          : draft.activityLog;

        const nextWithStats: StudyOSState = {
          ...draft,
          courses: syncedCourses,
          activityLog: updatedLog,
          stats: {
            ...draft.stats,
            currentXP: newXP,
            todayXP: Math.max(0, draft.stats.todayXP + Math.max(0, xpDelta)),
            level: newLevel,
            completedModulesCount: completedCount,
            lastActiveDate: today,
          },
        };

        const { achievements, newlyUnlocked } = evaluateAchievements(nextWithStats);
        const finalized: StudyOSState = {
          ...nextWithStats,
          achievements,
        };

        const allowConfetti =
          !finalized.academicProfile?.accessibilityPreferences?.reducedMotion;

        window.setTimeout(() => {
          if (newLevel > oldLevel) {
            playSoundEffect("levelup", soundEnabledRef.current);
            if (allowConfetti) triggerConfettiBurst();
            pushToast({
              title: `LEVEL UP · Reached Level ${newLevel}`,
              subtitle: toastMeta?.title || "New mastery tier unlocked!",
              xpDelta: xpDelta > 0 ? xpDelta : undefined,
              variant: "levelup",
            });
          } else if (toastMeta) {
            if (toastMeta.celebrate) {
              playSoundEffect("complete", soundEnabledRef.current);
              if (allowConfetti) triggerConfettiBurst();
            } else if (xpDelta > 0) {
              playSoundEffect("xp", soundEnabledRef.current);
            }
            pushToast({
              title: toastMeta.title,
              subtitle: toastMeta.subtitle,
              xpDelta: xpDelta > 0 ? xpDelta : undefined,
              variant: xpDelta > 0 ? "xp" : "success",
            });
          }

          for (const ach of newlyUnlocked) {
            pushToast({
              title: `Achievement Unlocked: ${ach.title}`,
              subtitle: ach.desc,
              variant: "levelup",
            });
          }
        }, 0);

        return finalized;
      });
    },
    [pushToast]
  );

  // Navigation Deep-Link Helpers
  const openModuleInVault = useCallback((moduleId: string) => {
    setSelectedModuleId(moduleId);
    setActiveView(AppView.VAULT);
  }, []);

  const openCourseInManager = useCallback((courseId: string) => {
    setSelectedCourseId(courseId);
    setActiveView(AppView.COURSES);
  }, []);

  const openCourseTagFilter = useCallback((tag: string) => {
    const normalized = normalizeCourseTags([tag]);
    setActiveCourseTagFilters(normalized);
    setActiveView(AppView.COURSES);
  }, []);

  const openGrokopediaWithTopic = useCallback((topic: string) => {
    setPendingGrokTopic(topic);
    setActiveView(AppView.GROKOPEDIA);
  }, []);

  const clearPendingGrokTopic = useCallback(() => {
    setPendingGrokTopic("");
  }, []);

  // Course & Module CRUD + Non-Destructive Syllabus Archiving
  const createCourse = useCallback(
    (input: {
      code: string;
      title: string;
      category: string;
      instructor?: string;
      deadlineLabel?: string;
      semester?: string;
      academicYear?: string;
      credits?: number;
      tags?: string[];
    }): Course => {
      const categoryClean = input.category.trim() || "Self-Directed Mastery";
      const normalizedTags = normalizeCourseTags(
        input.tags && input.tags.length > 0 ? input.tags : [categoryClean]
      );
      const newCourse: Course = {
        id: `course-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        code: input.code.trim().toUpperCase() || "STD-101",
        title: input.title.trim(),
        category: categoryClean,
        instructor: input.instructor?.trim() || "Self-Directed Study",
        deadlineLabel: input.deadlineLabel?.trim() || "Active Track",
        semester: input.semester?.trim() || undefined,
        academicYear: input.academicYear?.trim() || undefined,
        credits: input.credits,
        archived: false,
        archivedAt: null,
        tags: normalizedTags,
        totalUnits: 0,
        completedUnits: 0,
        createdAt: new Date().toISOString(),
      };
      commitStateWithXP(
        (prev) => ({
          ...prev,
          courses: [newCourse, ...prev.courses],
        }),
        0,
        { title: `Created Course ${newCourse.code}`, subtitle: newCourse.title },
        {
          type: "course_created",
          title: `Created course ${newCourse.code}: ${newCourse.title}`,
          detail: categoryClean,
        }
      );
      setSelectedCourseId(newCourse.id);
      return newCourse;
    },
    [commitStateWithXP]
  );

  const updateCourse = useCallback(
    (
      courseId: string,
      patch: Partial<
        Pick<
          Course,
          | "code"
          | "title"
          | "category"
          | "instructor"
          | "deadlineLabel"
          | "semester"
          | "academicYear"
          | "credits"
          | "tags"
        >
      >
    ) => {
      const target = stateRef.current.courses.find((c) => c.id === courseId);
      if (!target) return;
      commitStateWithXP(
        (prev) => ({
          ...prev,
          courses: prev.courses.map((c) => {
            if (c.id !== courseId) return c;
            return {
              ...c,
              ...(patch.code !== undefined ? { code: patch.code.trim().toUpperCase() || c.code } : {}),
              ...(patch.title !== undefined ? { title: patch.title.trim() || c.title } : {}),
              ...(patch.category !== undefined
                ? { category: patch.category.trim() || c.category }
                : {}),
              ...(patch.instructor !== undefined ? { instructor: patch.instructor.trim() } : {}),
              ...(patch.deadlineLabel !== undefined
                ? { deadlineLabel: patch.deadlineLabel.trim() }
                : {}),
              ...(patch.semester !== undefined ? { semester: patch.semester.trim() } : {}),
              ...(patch.academicYear !== undefined
                ? { academicYear: patch.academicYear.trim() }
                : {}),
              ...(patch.credits !== undefined ? { credits: patch.credits } : {}),
              ...(patch.tags !== undefined ? { tags: normalizeCourseTags(patch.tags) } : {}),
            };
          }),
        }),
        0,
        {
          title: `Updated ${patch.code?.trim().toUpperCase() || target.code}`,
          subtitle:
            patch.tags !== undefined
              ? `${normalizeCourseTags(patch.tags).length} course tag${
                  normalizeCourseTags(patch.tags).length === 1 ? "" : "s"
                } saved`
              : target.title,
        }
      );
    },
    [commitStateWithXP]
  );

  const updateCourseTags = useCallback(
    (courseId: string, tags: string[]) => {
      updateCourse(courseId, { tags });
    },
    [updateCourse]
  );

  const toggleArchiveCourse = useCallback(
    (courseId: string) => {
      const target = stateRef.current.courses.find((c) => c.id === courseId);
      if (!target) return;
      const nextArchived = !target.archived;
      const nowIso = new Date().toISOString();
      commitStateWithXP(
        (prev) => {
          const ev: LearningEvent = {
            id: `ev-arch-c-${Date.now()}`,
            idempotencyKey: `arch-c:${courseId}:${nowIso}`,
            timestamp: nowIso,
            eventType: "syllabus_archived",
            courseId,
            summary: `${nextArchived ? "Archived" : "Restored"} course ${target.code} (historical attempts preserved)`,
          };
          return {
            ...prev,
            learningEvents: appendLearningEventIdempotent(prev.learningEvents, ev).events,
            courses: prev.courses.map((c) =>
              c.id === courseId
                ? { ...c, archived: nextArchived, archivedAt: nextArchived ? nowIso : null }
                : c
            ),
            modules: prev.modules.map((m) =>
              m.courseId === courseId
                ? { ...m, archived: nextArchived, archivedAt: nextArchived ? nowIso : null }
                : m
            ),
          };
        },
        0,
        {
          title: nextArchived ? `Archived ${target.code}` : `Restored ${target.code}`,
          subtitle: "All historical study & assessment records preserved safely.",
        }
      );
    },
    [commitStateWithXP]
  );

  const deleteCourse = useCallback(
    (courseId: string) => {
      commitStateWithXP(
        (prev) => ({
          ...prev,
          courses: prev.courses.filter((c) => c.id !== courseId),
          modules: prev.modules.filter((m) => m.courseId !== courseId),
          flashcards: prev.flashcards.filter((f) => f.courseId !== courseId),
          timeBlocks: prev.timeBlocks.filter((t) => t.courseId !== courseId),
        }),
        0,
        { title: "Removed Course", subtitle: "Associated syllabus modules cleaned up." }
      );
    },
    [commitStateWithXP]
  );

  const addModule = useCallback(
    (input: {
      courseId: string;
      unitGroup?: string;
      title: string;
      estimatedHours: number;
      videoLink?: string;
      tags?: string[];
      notesMarkdown?: string;
      briefOverview?: string;
      sourceFileNames?: string[];
    }): ModuleUnit => {
      const providedMarkdown = input.notesMarkdown;
      const initialWords = countWords(providedMarkdown || "");
      const mod: ModuleUnit = {
        id: `mod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        courseId: input.courseId,
        unitGroup: input.unitGroup?.trim() || undefined,
        title: input.title.trim(),
        status: "To Do",
        videoLink: input.videoLink?.trim() || "",
        notesMarkdown:
          providedMarkdown ?? `# ${input.title.trim()}\n\n## Key Takeaways & Notes\n- `,
        estimatedHours: Math.max(0.5, Number(input.estimatedHours) || 2),
        studiedMinutes: 0,
        masteredAt: null,
        sourceFileNames: input.sourceFileNames || [],
        tags: input.tags && input.tags.length > 0 ? input.tags : ["study-unit"],
        briefOverview: input.briefOverview || "",
        learningObjectives: [],
        unresolvedQuestions: [],
        noteRevisions: [],
        archived: false,
        archivedAt: null,
        autoResearchStatus: initialWords >= 50 ? "synced" : "idle",
        autoResearchedAt: initialWords >= 50 ? new Date().toISOString() : null,
        resources: [],
        bookmarks: [],
        notesXpAwarded: initialWords >= 200,
        masteredXpAwarded: false,
        updatedAt: new Date().toISOString(),
      };
      commitStateWithXP(
        (prev) => ({
          ...prev,
          modules: [...prev.modules, mod],
        }),
        0,
        { title: "Module Added to Syllabus", subtitle: mod.title }
      );
      return mod;
    },
    [commitStateWithXP]
  );

  const createQuickVaultNote = useCallback(
    (customTitle?: string): ModuleUnit => {
      const snap = stateRef.current;
      let targetCourseId =
        selectedCourseId && snap.courses.some((c) => c.id === selectedCourseId)
          ? selectedCourseId
          : snap.courses[0]?.id || "";

      const nowIso = new Date().toISOString();
      let autoCreatedCourse: Course | null = null;
      if (!targetCourseId) {
        autoCreatedCourse = {
          id: `course-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          code: "VLT-101",
          title: "Personal Knowledge Vault",
          category: "Self-Directed Notes",
          instructor: "Autonomous Study OS",
          deadlineLabel: "Active Vault",
          tags: ["vault", "personal-notes"],
          totalUnits: 0,
          completedUnits: 0,
          createdAt: nowIso,
        };
        targetCourseId = autoCreatedCourse.id;
      }

      const resolvedTitle = customTitle?.trim() || `Study Note ${snap.modules.length + 1}`;
      const newMod: ModuleUnit = {
        id: `mod-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        courseId: targetCourseId,
        title: resolvedTitle,
        status: "In Progress",
        videoLink: "",
        notesMarkdown: `# ${resolvedTitle}\n\n## Key Takeaways & Notes\n- `,
        estimatedHours: 2,
        studiedMinutes: 0,
        masteredAt: null,
        sourceFileNames: [],
        tags: ["vault-note"],
        briefOverview: "",
        autoResearchStatus: "idle",
        autoResearchedAt: null,
        resources: [],
        bookmarks: [],
        notesXpAwarded: false,
        masteredXpAwarded: false,
        updatedAt: nowIso,
      };

      commitStateWithXP(
        (prev) => ({
          ...prev,
          courses: autoCreatedCourse ? [autoCreatedCourse, ...prev.courses] : prev.courses,
          modules: [newMod, ...prev.modules],
        }),
        0,
        {
          title: "New Vault Note Created",
          subtitle: stateRef.current.settings.autonomousAgentEnabled
            ? "Name the topic to auto-fetch & take down notes"
            : resolvedTitle,
        }
      );

      setSelectedCourseId(targetCourseId);
      setSelectedModuleId(newMod.id);
      setActiveView(AppView.VAULT);
      setVaultFocusTitleTick((t) => t + 1);
      return newMod;
    },
    [commitStateWithXP, selectedCourseId]
  );

  // =========================================================================
  // AUTONOMOUS THINKING, LIVE FETCHING & NOTE-TAKING AGENT
  // =========================================================================
  const runAutonomousNoteTaker = useCallback(
    async (
      explicitModuleId?: string,
      options?: { isBackgroundAuto?: boolean }
    ): Promise<void> => {
      const snap = stateRef.current;
      const targetId = explicitModuleId || selectedModuleIdRef.current || snap.modules[0]?.id;
      if (!targetId) {
        if (!options?.isBackgroundAuto) {
          const created = createQuickVaultNote();
          pushToast({
            title: "Created New Vault Note",
            subtitle: `Enter a subject title on "${created.title}" and Study OS will fetch & take notes automatically.`,
            variant: "success",
          });
        }
        return;
      }

      if (inFlightAutoSyncRef.current) return;
      const targetMod = snap.modules.find((m) => m.id === targetId);
      if (!targetMod) return;

      if (options?.isBackgroundAuto && isPlaceholderNoteTitle(targetMod.title)) {
        return;
      }

      const parentCourse = snap.courses.find((c) => c.id === targetMod.courseId);
      inFlightAutoSyncRef.current = targetMod.id;

      setAutonomousAgentStatus((prev) => ({
        ...prev,
        isBusy: true,
        activeModuleId: targetMod.id,
        activeModuleTitle: targetMod.title,
      }));

      setState((prev) => ({
        ...prev,
        modules: prev.modules.map((m) =>
          m.id === targetMod.id ? { ...m, autoResearchStatus: "thinking" } : m
        ),
      }));

      try {
        const result = await runAutonomousModuleSync({
          moduleTitle: targetMod.title,
          courseTitle: parentCourse?.title,
          courseCategory: parentCourse?.category,
          existingNotes: targetMod.notesMarkdown,
          learningGoals: snap.settings.academicTrack,
          model: snap.settings.selectedModel,
        });

        const words = countWords(result.notesMarkdown);
        const currentLatestMod = stateRef.current.modules.find((m) => m.id === targetMod.id);
        const qualifiesForNotesXP =
          words >= 200 && Boolean(currentLatestMod && !currentLatestMod.notesXpAwarded);
        const xpAward = qualifiesForNotesXP ? XP_REWARDS.SAVE_NOTES_200_WORDS : 0;

        commitStateWithXP(
          (prev) => {
            const modNow = prev.modules.find((m) => m.id === targetMod.id);
            if (!modNow) return prev;

            const existingUrls = new Set(modNow.resources.map((r) => r.url));
            const addedResources: ResourceItem[] = [];

            for (const src of result.webSources) {
              if (!existingUrls.has(src.url)) {
                existingUrls.add(src.url);
                const inferredType: ResourceItem["type"] = /arxiv\.org/i.test(src.url)
                  ? "arxiv"
                  : /github\.com/i.test(src.url)
                  ? "github"
                  : /\.pdf($|\?)/i.test(src.url)
                  ? "pdf"
                  : "doc";
                addedResources.push({
                  id: `res-auto-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                  title: src.title,
                  url: src.url,
                  type: inferredType,
                });
              }
            }

            const ytSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(
              result.searchQueryForVideo
            )}`;
            if (!existingUrls.has(ytSearchUrl)) {
              addedResources.push({
                id: `res-yt-auto-${Date.now()}`,
                title: `Lecture Search: ${result.searchQueryForVideo}`,
                url: ytSearchUrl,
                type: "doc",
              });
            }

            const existingQuestions = new Set(
              prev.flashcards
                .filter((f) => f.moduleId === targetMod.id)
                .map((f) => f.question.toLowerCase())
            );
            const newCards: Flashcard[] = result.flashcards
              .filter((fc) => !existingQuestions.has(fc.question.toLowerCase()))
              .map((fc, idx) => ({
                id: `fc-auto-${Date.now()}-${idx}`,
                courseId: modNow.courseId,
                moduleId: modNow.id,
                question: fc.question,
                answer: fc.answer,
                box: 1,
              }));

            const mergedTags = normalizeCourseTags([
              ...modNow.tags.filter((t) => t !== "study-unit"),
              ...result.keyConcepts.slice(0, 4),
              ...(result.groundedWithSearch ? ["web-grounded"] : []),
            ]);

            return {
              ...prev,
              stats: {
                ...prev.stats,
                autoFetchedModulesCount: (prev.stats.autoFetchedModulesCount || 0) + 1,
              },
              flashcards: [...newCards, ...prev.flashcards],
              modules: prev.modules.map((m) =>
                m.id === targetMod.id
                  ? {
                      ...m,
                      notesMarkdown: result.notesMarkdown,
                      briefOverview: result.briefOverview || m.briefOverview,
                      keyConcepts:
                        result.keyConcepts.length > 0 ? result.keyConcepts : m.keyConcepts,
                      searchQueryForVideo:
                        result.searchQueryForVideo || m.searchQueryForVideo,
                      videoLink:
                        m.videoLink ||
                        pickCuratedVideoForTopic(
                          `${m.title} ${result.searchQueryForVideo}`
                        ),
                      tags: mergedTags.length > 0 ? mergedTags : m.tags,
                      resources: [...m.resources, ...addedResources],
                      autoResearchStatus: "synced",
                      autoResearchedAt: result.syncedAt,
                      autoThinkingSummary: result.thinkingSummary,
                      notesXpAwarded: m.notesXpAwarded || words >= 200,
                      updatedAt: result.syncedAt,
                    }
                  : m
              ),
            };
          },
          xpAward,
          {
            title: options?.isBackgroundAuto
              ? `Auto-Fetched Notes: ${targetMod.title}`
              : `Synced Notes & Sources: ${targetMod.title}`,
            subtitle: `${words} words · ${result.flashcards.length} cards${
              result.webSources.length > 0 ? ` · ${result.webSources.length} web sources` : ""
            }`,
          },
          {
            type: "auto_research",
            title: `Thought & took down notes for "${targetMod.title}"`,
            detail: result.thinkingSummary,
          }
        );

        setAutonomousAgentStatus({
          isBusy: false,
          activeModuleId: null,
          activeModuleTitle: "",
          lastSyncedSummary: result.thinkingSummary,
          lastSyncedAt: result.syncedAt,
        });
      } catch (err: unknown) {
        setState((prev) => ({
          ...prev,
          modules: prev.modules.map((m) =>
            m.id === targetMod.id ? { ...m, autoResearchStatus: "error" } : m
          ),
        }));
        setAutonomousAgentStatus((prev) => ({
          ...prev,
          isBusy: false,
          activeModuleId: null,
          activeModuleTitle: "",
        }));
        if (!options?.isBackgroundAuto) {
          pushToast({
            title: "Autonomous Note Sync Failed",
            subtitle: err instanceof Error ? err.message : "Could not reach research engine.",
            variant: "error",
          });
        }
      } finally {
        inFlightAutoSyncRef.current = null;
      }
    },
    [commitStateWithXP, createQuickVaultNote, pushToast]
  );

  // Autonomous Watcher: Automatically detects new/stub topic modules & takes down notes (API-agnostic + First-Principles fallback)
  useEffect(() => {
    if (!state.settings.autonomousAgentEnabled) return;
    if (inFlightAutoSyncRef.current) return;

    const candidate = state.modules.find((m) => {
      if (m.autoResearchStatus === "thinking" || m.autoResearchStatus === "error") return false;
      if (m.autoResearchedAt) return false;
      if (isPlaceholderNoteTitle(m.title)) return false;
      return countWords(m.notesMarkdown) < 48;
    });

    if (!candidate) return;

    const timer = window.setTimeout(() => {
      void runAutonomousNoteTaker(candidate.id, { isBackgroundAuto: true });
    }, 2200);

    return () => window.clearTimeout(timer);
  }, [
    state.modules,
    state.settings.autonomousAgentEnabled,
    runAutonomousNoteTaker,
  ]);

  // Self-Tracking Active Study Dwell Heartbeat (tracks active study minutes & midnight rollover automatically)
  useEffect(() => {
    const markUserInteraction = () => {
      lastUserActivityMsRef.current = Date.now();
    };
    window.addEventListener("keydown", markUserInteraction, { passive: true });
    window.addEventListener("pointerdown", markUserInteraction, { passive: true });
    window.addEventListener("wheel", markUserInteraction, { passive: true });

    const interval = window.setInterval(() => {
      const today = getTodayDateString();
      const snap = stateRef.current;

      // 1. Automatic midnight streak & daily counter rollover if app stays open across days
      if (snap.stats.lastActiveDate !== today) {
        setState((prev) => ({
          ...prev,
          stats: evaluateStreakOnLoad(prev.stats, today),
        }));
        return;
      }

      // 2. Self-track active study dwell time (1m increments when actively studying in app)
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastUserActivityMsRef.current > 90_000) return;
      if (pomodoroRef.current.isRunning) return; // Pomodoro sprint logs its own minutes

      const view = activeViewRef.current;
      const isStudySurface =
        view === AppView.VAULT ||
        view === AppView.FLASHCARDS ||
        view === AppView.GROKOPEDIA ||
        view === AppView.COURSES ||
        view === AppView.SIMULATION;
      if (!isStudySurface) return;

      const openModId = selectedModuleIdRef.current;

      setState((prev) => ({
        ...prev,
        modules: openModId
          ? prev.modules.map((m) =>
              m.id === openModId
                ? {
                    ...m,
                    studiedMinutes: (m.studiedMinutes || 0) + 1,
                    status:
                      view === AppView.VAULT && m.status === "To Do"
                        ? "In Progress"
                        : m.status,
                  }
                : m
            )
          : prev.modules,
        stats: {
          ...prev.stats,
          todayMinutesSpent: prev.stats.todayMinutesSpent + 1,
          totalMinutesStudied: (prev.stats.totalMinutesStudied || 0) + 1,
          lastActiveDate: today,
          weeklyMinutes: {
            ...prev.stats.weeklyMinutes,
            [today]: (prev.stats.weeklyMinutes[today] || 0) + 1,
          },
        },
      }));
    }, 60_000);

    return () => {
      window.removeEventListener("keydown", markUserInteraction);
      window.removeEventListener("pointerdown", markUserInteraction);
      window.removeEventListener("wheel", markUserInteraction);
      window.clearInterval(interval);
    };
  }, []);

  const updateModuleStatus = useCallback(
    (moduleId: string, status: ModuleStatus) => {
      const target = stateRef.current.modules.find((m) => m.id === moduleId);
      if (!target || target.status === status) return;

      const isFirstTimeMastery = status === "Mastered" && !target.masteredXpAwarded;
      const xpAward = isFirstTimeMastery ? XP_REWARDS.COMPLETE_MODULE : 0;
      const nowIso = new Date().toISOString();

      commitStateWithXP(
        (prev) => ({
          ...prev,
          modules: prev.modules.map((m) =>
            m.id === moduleId
              ? {
                  ...m,
                  status,
                  masteredAt: status === "Mastered" ? m.masteredAt || nowIso : m.masteredAt,
                  masteredXpAwarded: m.masteredXpAwarded || status === "Mastered",
                  updatedAt: nowIso,
                }
              : m
          ),
        }),
        xpAward,
        status === "Mastered"
          ? {
              title: isFirstTimeMastery ? "Module Mastered!" : "Marked Mastered",
              subtitle: target.title,
              celebrate: isFirstTimeMastery,
            }
          : {
              title: `Moved to ${status}`,
              subtitle: target.title,
            },
        status === "Mastered"
          ? {
              type: "module_mastered",
              title: `Mastered unit: ${target.title}`,
              detail: isFirstTimeMastery ? "+100 XP Mastery Award" : "Status updated",
            }
          : undefined
      );
    },
    [commitStateWithXP]
  );

  const updateModuleDetails = useCallback(
    (
      moduleId: string,
      patch: Partial<
        Pick<ModuleUnit, "title" | "unitGroup" | "videoLink" | "estimatedHours" | "tags">
      >
    ) => {
      commitStateWithXP((prev) => ({
        ...prev,
        modules: prev.modules.map((m) => {
          if (m.id !== moduleId) return m;
          const titleChanged =
            patch.title !== undefined && patch.title.trim() !== m.title.trim();
          const resetAutoIfStub =
            titleChanged && countWords(m.notesMarkdown) < 48
              ? { autoResearchStatus: "idle" as const, autoResearchedAt: null }
              : {};
          return {
            ...m,
            ...patch,
            ...resetAutoIfStub,
            updatedAt: new Date().toISOString(),
          };
        }),
      }));
    },
    [commitStateWithXP]
  );

  const toggleArchiveModule = useCallback(
    (moduleId: string) => {
      const target = stateRef.current.modules.find((m) => m.id === moduleId);
      if (!target) return;
      const nextArchived = !target.archived;
      const nowIso = new Date().toISOString();
      commitStateWithXP(
        (prev) => ({
          ...prev,
          modules: prev.modules.map((m) =>
            m.id === moduleId
              ? { ...m, archived: nextArchived, archivedAt: nextArchived ? nowIso : null }
              : m
          ),
        }),
        0,
        {
          title: nextArchived ? "Archived Syllabus Topic" : "Restored Syllabus Topic",
          subtitle: `${target.title} (historical assessment records intact)`,
        }
      );
    },
    [commitStateWithXP]
  );

  const saveModuleNotes = useCallback(
    (moduleId: string, markdown: string) => {
      const target = stateRef.current.modules.find((m) => m.id === moduleId);
      if (!target) return;

      const words = countWords(markdown);
      const qualifiesForNotesXP = words >= 200 && !target.notesXpAwarded;
      const xpAward = qualifiesForNotesXP ? XP_REWARDS.SAVE_NOTES_200_WORDS : 0;

      const extractedConcepts =
        words >= 20 ? extractNoteConcepts(markdown, undefined, target.title) : [];

      commitStateWithXP(
        (prev) => {
          const existingModuleCards = prev.flashcards.filter((f) => f.moduleId === moduleId);
          let autoAddedCards: Flashcard[] = [];
          if (
            prev.settings.autonomousAgentEnabled &&
            words >= 85 &&
            existingModuleCards.length < 2
          ) {
            const generated =
              synthesizeDeterministicVaultAssist({
                action: "flashcards",
                notesMarkdown: markdown,
                moduleTitle: target.title,
              }).cards || [];
            const seenQuestions = new Set(
              prev.flashcards.map((f) => f.question.trim().toLowerCase())
            );
            autoAddedCards = generated
              .filter((c) => !seenQuestions.has(c.question.trim().toLowerCase()))
              .slice(0, 3)
              .map((c, idx) => ({
                id: `fc-live-${Date.now()}-${idx}`,
                courseId: target.courseId,
                moduleId: target.id,
                question: c.question,
                answer: c.answer,
                box: 1,
              }));
          }

          const nextEvents = qualifiesForNotesXP
            ? appendLearningEventIdempotent(prev.learningEvents, {
                id: `ev-note-${moduleId}-${Date.now()}`,
                idempotencyKey: `note200:${moduleId}`,
                timestamp: new Date().toISOString(),
                eventType: "note_updated",
                courseId: target.courseId,
                moduleId,
                summary: `Authored ${words}+ words of structured study notes in "${target.title}"`,
                numericValue: words,
              }).events
            : prev.learningEvents;

          return {
            ...prev,
            learningEvents: nextEvents,
            flashcards:
              autoAddedCards.length > 0
                ? [...autoAddedCards, ...prev.flashcards]
                : prev.flashcards,
            modules: prev.modules.map((m) => {
              if (m.id !== moduleId) return m;
              const nextConcepts =
                extractedConcepts.length > 0
                  ? Array.from(new Set([...extractedConcepts, ...(m.keyConcepts || [])])).slice(
                      0,
                      8
                    )
                  : m.keyConcepts;
              const nextTags =
                extractedConcepts.length > 0
                  ? normalizeCourseTags([...m.tags, ...extractedConcepts.slice(0, 3)])
                  : m.tags;

              // Append version snapshot if meaningful edit (>= 30 char diff from latest revision)
              const existingRevs = Array.isArray(m.noteRevisions) ? m.noteRevisions : [];
              const lastSnapshot = existingRevs[0]?.markdownSnapshot || "";
              const shouldSnapshot =
                Math.abs(markdown.length - lastSnapshot.length) >= 30 ||
                (existingRevs.length === 0 && words >= 12);
              const nextRevisions: NoteRevision[] = shouldSnapshot
                ? [
                    {
                      id: `rev-${Date.now()}`,
                      savedAt: new Date().toISOString(),
                      wordCount: words,
                      markdownSnapshot: markdown,
                    },
                    ...existingRevs,
                  ].slice(0, 10)
                : existingRevs;

              return {
                ...m,
                notesMarkdown: markdown,
                noteRevisions: nextRevisions,
                keyConcepts: nextConcepts,
                tags: nextTags,
                status: m.status === "To Do" && words >= 20 ? "In Progress" : m.status,
                notesXpAwarded: m.notesXpAwarded || words >= 200,
                updatedAt: new Date().toISOString(),
              };
            }),
          };
        },
        xpAward,
        qualifiesForNotesXP
          ? {
              title: "Deep Notes Milestone (>200 words)",
              subtitle: `Saved ${words} words in "${target.title}"`,
            }
          : undefined,
        qualifiesForNotesXP
          ? {
              type: "notes_saved",
              title: `Authored ${words}+ words in "${target.title}"`,
              detail: "Knowledge Vault Deep Notes Milestone",
            }
          : undefined
      );
    },
    [commitStateWithXP]
  );

  const restoreNoteRevision = useCallback(
    (moduleId: string, revisionId: string) => {
      const target = stateRef.current.modules.find((m) => m.id === moduleId);
      const rev = target?.noteRevisions?.find((r) => r.id === revisionId);
      if (!target || !rev) return;
      commitStateWithXP(
        (prev) => ({
          ...prev,
          modules: prev.modules.map((m) =>
            m.id === moduleId
              ? { ...m, notesMarkdown: rev.markdownSnapshot, updatedAt: new Date().toISOString() }
              : m
          ),
        }),
        0,
        {
          title: "Restored Note Revision",
          subtitle: `${rev.wordCount} words from ${rev.savedAt.slice(0, 16).replace("T", " ")}`,
        }
      );
    },
    [commitStateWithXP]
  );

  const addLearningObjective = useCallback(
    (moduleId: string, text: string) => {
      const clean = text.trim();
      if (!clean) return;
      commitStateWithXP((prev) => ({
        ...prev,
        modules: prev.modules.map((m) =>
          m.id === moduleId
            ? {
                ...m,
                learningObjectives: [
                  ...(m.learningObjectives || []),
                  { id: `obj-${Date.now()}`, text: clean, completed: false },
                ],
                updatedAt: new Date().toISOString(),
              }
            : m
        ),
      }));
    },
    [commitStateWithXP]
  );

  const toggleLearningObjective = useCallback(
    (moduleId: string, objectiveId: string) => {
      commitStateWithXP((prev) => {
        const mod = prev.modules.find((m) => m.id === moduleId);
        const obj = mod?.learningObjectives?.find((o) => o.id === objectiveId);
        const completing = Boolean(obj && !obj.completed);
        const nowIso = new Date().toISOString();
        const nextEvents =
          completing && mod && obj
            ? appendLearningEventIdempotent(prev.learningEvents, {
                id: `ev-obj-${objectiveId}`,
                idempotencyKey: `obj:${moduleId}:${objectiveId}`,
                timestamp: nowIso,
                eventType: "objective_completed",
                courseId: mod.courseId,
                moduleId,
                summary: `Completed learning objective: "${obj.text}"`,
              }).events
            : prev.learningEvents;

        return {
          ...prev,
          learningEvents: nextEvents,
          modules: prev.modules.map((m) =>
            m.id === moduleId
              ? {
                  ...m,
                  learningObjectives: (m.learningObjectives || []).map((o) =>
                    o.id === objectiveId ? { ...o, completed: !o.completed } : o
                  ),
                  updatedAt: nowIso,
                }
              : m
          ),
        };
      });
    },
    [commitStateWithXP]
  );

  const removeLearningObjective = useCallback(
    (moduleId: string, objectiveId: string) => {
      commitStateWithXP((prev) => ({
        ...prev,
        modules: prev.modules.map((m) =>
          m.id === moduleId
            ? {
                ...m,
                learningObjectives: (m.learningObjectives || []).filter(
                  (o) => o.id !== objectiveId
                ),
              }
            : m
        ),
      }));
    },
    [commitStateWithXP]
  );

  const addUnresolvedQuestion = useCallback(
    (moduleId: string, question: string) => {
      const clean = question.trim();
      if (!clean) return;
      commitStateWithXP((prev) => ({
        ...prev,
        modules: prev.modules.map((m) =>
          m.id === moduleId
            ? {
                ...m,
                unresolvedQuestions: [
                  ...(m.unresolvedQuestions || []),
                  {
                    id: `uq-${Date.now()}`,
                    question: clean,
                    resolved: false,
                    createdAt: new Date().toISOString(),
                  },
                ],
                updatedAt: new Date().toISOString(),
              }
            : m
        ),
      }));
    },
    [commitStateWithXP]
  );

  const toggleUnresolvedQuestion = useCallback(
    (moduleId: string, questionId: string, resolutionNote?: string) => {
      commitStateWithXP((prev) => ({
        ...prev,
        modules: prev.modules.map((m) =>
          m.id === moduleId
            ? {
                ...m,
                unresolvedQuestions: (m.unresolvedQuestions || []).map((q) =>
                  q.id === questionId
                    ? {
                        ...q,
                        resolved: !q.resolved,
                        resolutionNote: resolutionNote ?? q.resolutionNote,
                      }
                    : q
                ),
                updatedAt: new Date().toISOString(),
              }
            : m
        ),
      }));
    },
    [commitStateWithXP]
  );

  const removeUnresolvedQuestion = useCallback(
    (moduleId: string, questionId: string) => {
      commitStateWithXP((prev) => ({
        ...prev,
        modules: prev.modules.map((m) =>
          m.id === moduleId
            ? {
                ...m,
                unresolvedQuestions: (m.unresolvedQuestions || []).filter(
                  (q) => q.id !== questionId
                ),
              }
            : m
        ),
      }));
    },
    [commitStateWithXP]
  );

  const saveModuleReflection = useCallback(
    (moduleId: string, reflectionNote: string) => {
      commitStateWithXP(
        (prev) => ({
          ...prev,
          modules: prev.modules.map((m) =>
            m.id === moduleId
              ? { ...m, reflectionNote, updatedAt: new Date().toISOString() }
              : m
          ),
        }),
        0,
        { title: "Saved Topic Reflection" }
      );
    },
    [commitStateWithXP]
  );

  const launchIntegrativeLab = useCallback(
    (options?: { courseId?: string; moduleId?: string; customTopic?: string }) => {
      if (options?.courseId) {
        setSelectedCourseId(options.courseId);
      }
      if (options?.moduleId) {
        setSelectedModuleId(options.moduleId);
      }
      if (options?.customTopic && options.customTopic.trim()) {
        setActiveLabTopic(options.customTopic.trim());
      } else if (options?.moduleId) {
        const mod = stateRef.current.modules.find((m) => m.id === options.moduleId);
        if (mod) setActiveLabTopic(mod.title);
      } else if (options?.courseId) {
        const crs = stateRef.current.courses.find((c) => c.id === options.courseId);
        if (crs) setActiveLabTopic(crs.title);
      }
      setCommandPaletteOpen(false);
      setShortcutModalOpen(false);
      setGuideModalOpen(false);
      setActiveView(AppView.SIMULATION);
    },
    []
  );

  const recordPhysicsLabSession = useCallback(
    (payload: {
      topic: string;
      courseId?: string;
      moduleId?: string;
      markdownReport?: string;
      stagesCleared: number;
      score: number;
      primaryEquation: string;
      conservationLaw: string;
      silentStageIncrement?: boolean;
    }) => {
      const today = getTodayDateString();
      const nowIso = new Date().toISOString();
      const cleanTopic = (payload.topic || "Integrative Physics Lab").trim();

      if (payload.silentStageIncrement) {
        const stageIdem = `lab-stage:${cleanTopic}:${payload.stagesCleared}:${today}`;
        commitStateWithXP(
          (prev) => {
            const sess: StudySessionRecord = {
              id: `ss-lab-stg-${Date.now()}`,
              idempotencyKey: stageIdem,
              courseId: payload.courseId,
              moduleId: payload.moduleId,
              durationMinutes: 2,
              kind: "lab",
              label: `3D Physics Stage ${payload.stagesCleared}: ${cleanTopic}`,
              startedAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
              endedAt: nowIso,
            };
            const ev: LearningEvent = {
              id: `ev-lab-stg-${Date.now()}`,
              idempotencyKey: stageIdem,
              timestamp: nowIso,
              eventType: "session_logged",
              courseId: payload.courseId,
              moduleId: payload.moduleId,
              summary: `Cleared 3D Physics Stage ${payload.stagesCleared}: ${cleanTopic}`,
              numericValue: 2,
            };
            return {
              ...prev,
              studySessions: appendStudySessionIdempotent(prev.studySessions, sess).sessions,
              learningEvents: appendLearningEventIdempotent(prev.learningEvents, ev).events,
              stats: {
                ...prev.stats,
                todayMinutesSpent: prev.stats.todayMinutesSpent + 2,
                totalMinutesStudied: (prev.stats.totalMinutesStudied || 0) + 2,
                lastActiveDate: today,
                weeklyMinutes: {
                  ...prev.stats.weeklyMinutes,
                  [today]: (prev.stats.weeklyMinutes[today] || 0) + 2,
                },
              },
            };
          },
          75,
          undefined,
          {
            type: "physics_lab_completed",
            title: `Cleared 3D Physics Stage ${payload.stagesCleared}: ${cleanTopic}`,
            detail: `Score ${payload.score} · ${payload.primaryEquation}`,
          }
        );
        return;
      }

      const fullLabIdem = `lab-save:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`;
      commitStateWithXP(
        (prev) => {
          let targetCourseId =
            payload.courseId && prev.courses.some((c) => c.id === payload.courseId)
              ? payload.courseId
              : prev.courses[0]?.id || "";
          let nextCourses = prev.courses;

          if (!targetCourseId) {
            const createdCourse: Course = {
              id: `course-lab-${Date.now()}`,
              code: "PHY-301",
              title: "Integrative Physics & Applied Math Lab",
              category: "Physics & Mathematics",
              tags: ["physics-lab", "rk4-simulation", "applied-math"],
              totalUnits: 1,
              completedUnits: 0,
              createdAt: nowIso,
            };
            targetCourseId = createdCourse.id;
            nextCourses = [createdCourse, ...prev.courses];
          }

          const existingMod = payload.moduleId
            ? prev.modules.find((m) => m.id === payload.moduleId)
            : prev.modules.find(
                (m) =>
                  m.courseId === targetCourseId &&
                  m.title.trim().toLowerCase() === cleanTopic.toLowerCase()
              );

          let nextModules = prev.modules;
          let targetModId = existingMod?.id || "";

          if (existingMod) {
            const appendedNotes = payload.markdownReport
              ? `${existingMod.notesMarkdown.trim()}\n\n---\n\n${payload.markdownReport.trim()}\n`
              : existingMod.notesMarkdown;
            nextModules = prev.modules.map((m) =>
              m.id === existingMod.id
                ? {
                    ...m,
                    notesMarkdown: appendedNotes,
                    status: m.status === "To Do" ? "In Progress" : m.status,
                    studiedMinutes: (m.studiedMinutes || 0) + 5,
                    tags: normalizeCourseTags([...m.tags, "3d-lab-verified", "rk4"]),
                    updatedAt: nowIso,
                  }
                : m
            );
          } else if (payload.markdownReport) {
            const newMod: ModuleUnit = {
              id: `mod-lab-${Date.now()}`,
              courseId: targetCourseId,
              title: `${cleanTopic} — 3D Lab Verification`,
              status: "In Progress",
              videoLink: "",
              notesMarkdown: `# ${cleanTopic}\n\n${payload.markdownReport.trim()}\n`,
              estimatedHours: 2,
              studiedMinutes: 5,
              tags: normalizeCourseTags(["3d-lab-verified", "rk4", cleanTopic]),
              keyConcepts: [payload.primaryEquation, payload.conservationLaw],
              resources: [],
              bookmarks: [],
              updatedAt: nowIso,
            };
            targetModId = newMod.id;
            nextModules = [newMod, ...prev.modules];
          }

          const seenQ = new Set(prev.flashcards.map((f) => f.question.trim().toLowerCase()));
          const candidateCards = [
            {
              question: `State the governing differential equation verified in the 3D Lab for "${cleanTopic}".`,
              answer: payload.primaryEquation,
            },
            {
              question: `What conservation identity governs "${cleanTopic}" in the zero-drag limit?`,
              answer: payload.conservationLaw,
            },
          ];
          const labCards: Flashcard[] = candidateCards
            .filter((c) => !seenQ.has(c.question.trim().toLowerCase()))
            .map((c, idx) => ({
              id: `fc-lab-${Date.now()}-${idx}`,
              courseId: targetCourseId,
              moduleId: targetModId || undefined,
              question: c.question,
              answer: c.answer,
              box: 1,
            }));

          const labSess: StudySessionRecord = {
            id: `ss-lab-${Date.now()}`,
            idempotencyKey: fullLabIdem,
            courseId: targetCourseId,
            moduleId: targetModId || undefined,
            durationMinutes: 5,
            kind: "lab",
            label: `3D Physics Lab Verification: ${cleanTopic}`,
            startedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
            endedAt: nowIso,
          };
          const labEv: LearningEvent = {
            id: `ev-lab-${Date.now()}`,
            idempotencyKey: fullLabIdem,
            timestamp: nowIso,
            eventType: "session_logged",
            courseId: targetCourseId,
            moduleId: targetModId || undefined,
            summary: `Completed 3D Physics Lab verification for "${cleanTopic}" (Stages ${payload.stagesCleared})`,
            numericValue: 5,
          };

          return {
            ...prev,
            courses: syncCoursesWithModules(nextCourses, nextModules),
            modules: nextModules,
            flashcards: [...labCards, ...prev.flashcards],
            studySessions: appendStudySessionIdempotent(prev.studySessions, labSess).sessions,
            learningEvents: appendLearningEventIdempotent(prev.learningEvents, labEv).events,
            stats: {
              ...prev.stats,
              todayMinutesSpent: prev.stats.todayMinutesSpent + 5,
              totalMinutesStudied: (prev.stats.totalMinutesStudied || 0) + 5,
              lastActiveDate: today,
              weeklyMinutes: {
                ...prev.stats.weeklyMinutes,
                [today]: (prev.stats.weeklyMinutes[today] || 0) + 5,
              },
            },
          };
        },
        100,
        {
          title: "Saved 3D Physics Lab Derivation to Vault",
          subtitle: `${cleanTopic} · +2 Active-Recall Cards Synced`,
          celebrate: true,
        },
        {
          type: "physics_lab_completed",
          title: `Saved 3D Lab Telemetry & Derivations: "${cleanTopic}"`,
          detail: `Stages ${payload.stagesCleared} · Score ${payload.score} · ${payload.primaryEquation}`,
        }
      );
    },
    [commitStateWithXP]
  );

  const reorderModule = useCallback(
    (moduleId: string, direction: "up" | "down") => {
      commitStateWithXP((prev) => {
        const target = prev.modules.find((m) => m.id === moduleId);
        if (!target) return prev;
        const courseIndices: number[] = [];
        prev.modules.forEach((m, idx) => {
          if (m.courseId === target.courseId && Boolean(m.archived) === Boolean(target.archived)) {
            courseIndices.push(idx);
          }
        });
        const posInCourse = courseIndices.findIndex((i) => prev.modules[i].id === moduleId);
        if (posInCourse === -1) return prev;
        const swapPos = direction === "up" ? posInCourse - 1 : posInCourse + 1;
        if (swapPos < 0 || swapPos >= courseIndices.length) return prev;

        const nextModules = [...prev.modules];
        const idxA = courseIndices[posInCourse];
        const idxB = courseIndices[swapPos];
        const temp = nextModules[idxA];
        nextModules[idxA] = nextModules[idxB];
        nextModules[idxB] = temp;
        return {
          ...prev,
          modules: nextModules.map((m, idx) =>
            m.courseId === target.courseId ? { ...m, sortOrder: idx } : m
          ),
        };
      });
    },
    [commitStateWithXP]
  );

  const deleteModule = useCallback(
    (moduleId: string) => {
      commitStateWithXP(
        (prev) => ({
          ...prev,
          modules: prev.modules.filter((m) => m.id !== moduleId),
        }),
        0,
        { title: "Removed Module Unit" }
      );
    },
    [commitStateWithXP]
  );

  const saveModuleTranscript = useCallback(
    (moduleId: string, transcriptNotes: string) => {
      commitStateWithXP(
        (prev) => ({
          ...prev,
          modules: prev.modules.map((m) =>
            m.id === moduleId
              ? { ...m, transcriptNotes, updatedAt: new Date().toISOString() }
              : m
          ),
        }),
        0,
        { title: "Saved Lecture Transcript & Captions" }
      );
    },
    [commitStateWithXP]
  );

  const addModuleHighlight = useCallback(
    (
      moduleId: string,
      input: { anchorLabel: string; excerpt: string; note?: string }
    ): VaultHighlight | null => {
      const cleanExcerpt = input.excerpt.trim();
      if (!cleanExcerpt) return null;
      const nowIso = new Date().toISOString();
      const hl: VaultHighlight = {
        id: `hl-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        anchorLabel: input.anchorLabel.trim() || "Source Excerpt",
        excerpt: cleanExcerpt,
        note: input.note?.trim() || undefined,
        createdAt: nowIso,
      };
      commitStateWithXP(
        (prev) => ({
          ...prev,
          modules: prev.modules.map((m) =>
            m.id === moduleId
              ? {
                  ...m,
                  highlights: [hl, ...(m.highlights || [])],
                  updatedAt: nowIso,
                }
              : m
          ),
        }),
        5,
        { title: "Saved Anchored Highlight", subtitle: hl.anchorLabel }
      );
      return hl;
    },
    [commitStateWithXP]
  );

  const removeModuleHighlight = useCallback(
    (moduleId: string, highlightId: string) => {
      commitStateWithXP((prev) => ({
        ...prev,
        modules: prev.modules.map((m) =>
          m.id === moduleId
            ? {
                ...m,
                highlights: (m.highlights || []).filter((h) => h.id !== highlightId),
              }
            : m
        ),
      }));
    },
    [commitStateWithXP]
  );

  const promoteHighlightToFlashcard = useCallback(
    (moduleId: string, highlightId: string) => {
      const mod = stateRef.current.modules.find((m) => m.id === moduleId);
      const hl = mod?.highlights?.find((h) => h.id === highlightId);
      if (!mod || !hl) return;

      const fcId = `fc-hl-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      const card: Flashcard = {
        id: fcId,
        courseId: mod.courseId,
        moduleId: mod.id,
        question: `[${hl.anchorLabel}] Explain or recall this key principle from "${mod.title}":`,
        answer: hl.note ? `${hl.excerpt}\n\nNote: ${hl.note}` : hl.excerpt,
        box: 1,
        reviewCount: 0,
        lapseCount: 0,
      };

      commitStateWithXP(
        (prev) => ({
          ...prev,
          flashcards: [card, ...prev.flashcards],
          modules: prev.modules.map((m) =>
            m.id === moduleId
              ? {
                  ...m,
                  highlights: (m.highlights || []).map((h) =>
                    h.id === highlightId ? { ...h, linkedFlashcardId: fcId } : h
                  ),
                }
              : m
          ),
        }),
        10,
        {
          title: "Promoted Highlight to Flashcard",
          subtitle: `${hl.anchorLabel} · Added to Leitner SRS Deck`,
        }
      );
    },
    [commitStateWithXP]
  );

  const promoteHighlightToQuizQuestion = useCallback(
    (moduleId: string, highlightId: string) => {
      const mod = stateRef.current.modules.find((m) => m.id === moduleId);
      const hl = mod?.highlights?.find((h) => h.id === highlightId);
      if (!mod || !hl) return;

      const nowIso = new Date().toISOString();
      const correctStatement = hl.excerpt.slice(0, 180);
      const newQuestion: AssessmentQuestion = {
        id: `q-hl-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        prompt: `According to ${hl.anchorLabel} in "${mod.title}", which statement accurately captures the highlighted concept?`,
        options: [
          correctStatement,
          `The opposite condition holds regardless of boundary constraints in ${mod.title}.`,
          `The relationship scales purely randomly without dependence on system parameters.`,
          `This property applies only when all governing variables vanish identically.`,
        ],
        correctAnswer: correctStatement,
        explanation: hl.note
          ? `Source (${hl.anchorLabel}): ${hl.excerpt} — ${hl.note}`
          : `Verified directly from source highlight (${hl.anchorLabel}).`,
      };

      commitStateWithXP(
        (prev) => {
          const existingAsmt = prev.assessments.find(
            (a) => a.moduleId === moduleId && a.title.includes("Highlight & Source Check")
          );
          let targetAsmtId = existingAsmt?.id || `asmt-hl-${Date.now()}`;
          let nextAssessments: Assessment[];

          if (existingAsmt) {
            const updatedQuestions = [...existingAsmt.questions, newQuestion];
            nextAssessments = prev.assessments.map((a) =>
              a.id === existingAsmt.id
                ? { ...a, questions: updatedQuestions, maxScore: updatedQuestions.length }
                : a
            );
          } else {
            const createdAsmt: Assessment = {
              id: targetAsmtId,
              courseId: mod.courseId,
              moduleId: mod.id,
              title: `${mod.title} — Highlight & Source Check`,
              kind: "quiz",
              difficulty: "standard",
              maxScore: 1,
              questions: [newQuestion],
              source: "notes_derived",
              createdAt: nowIso,
            };
            nextAssessments = [createdAsmt, ...prev.assessments];
          }

          return {
            ...prev,
            assessments: nextAssessments,
            modules: prev.modules.map((m) =>
              m.id === moduleId
                ? {
                    ...m,
                    highlights: (m.highlights || []).map((h) =>
                      h.id === highlightId ? { ...h, linkedAssessmentId: targetAsmtId } : h
                    ),
                  }
                : m
            ),
          };
        },
        10,
        {
          title: "Linked Highlight to Topic Quiz",
          subtitle: `Added question from ${hl.anchorLabel} to "${mod.title} — Highlight & Source Check"`,
        }
      );
    },
    [commitStateWithXP]
  );

  const addModuleResource = useCallback(
    (moduleId: string, resource: Omit<ResourceItem, "id">) => {
      const target = stateRef.current.modules.find((m) => m.id === moduleId);
      const nowIso = new Date().toISOString();
      const item: ResourceItem = {
        ...resource,
        id: `res-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      };
      commitStateWithXP(
        (prev) => ({
          ...prev,
          learningEvents: appendLearningEventIdempotent(prev.learningEvents, {
            id: `ev-res-${item.id}`,
            idempotencyKey: `res:${item.id}`,
            timestamp: nowIso,
            eventType: "resource_added",
            courseId: target?.courseId,
            moduleId,
            summary: `Added ${item.type.toUpperCase()} resource "${item.title}"`,
          }).events,
          modules: prev.modules.map((m) =>
            m.id === moduleId ? { ...m, resources: [...m.resources, item] } : m
          ),
        }),
        0,
        { title: "Resource Linked to Vault", subtitle: item.title }
      );
    },
    [commitStateWithXP]
  );

  const removeModuleResource = useCallback(
    (moduleId: string, resourceId: string) => {
      commitStateWithXP((prev) => ({
        ...prev,
        modules: prev.modules.map((m) =>
          m.id === moduleId
            ? { ...m, resources: m.resources.filter((r) => r.id !== resourceId) }
            : m
        ),
      }));
    },
    [commitStateWithXP]
  );

  const addModuleBookmark = useCallback(
    (moduleId: string, bookmark: Omit<VideoBookmark, "id">) => {
      const bm: VideoBookmark = {
        ...bookmark,
        id: `bm-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      };
      commitStateWithXP(
        (prev) => ({
          ...prev,
          modules: prev.modules.map((m) =>
            m.id === moduleId
              ? {
                  ...m,
                  bookmarks: [...m.bookmarks, bm].sort(
                    (a, b) => a.timestampSeconds - b.timestampSeconds
                  ),
                }
              : m
          ),
        }),
        0,
        { title: "Pinned Video Chapter", subtitle: bm.label }
      );
    },
    [commitStateWithXP]
  );

  const removeModuleBookmark = useCallback(
    (moduleId: string, bookmarkId: string) => {
      commitStateWithXP((prev) => ({
        ...prev,
        modules: prev.modules.map((m) =>
          m.id === moduleId
            ? { ...m, bookmarks: m.bookmarks.filter((b) => b.id !== bookmarkId) }
            : m
        ),
      }));
    },
    [commitStateWithXP]
  );

  // Personalized Curriculum & Uploaded Notes Ingestion (+50 XP)
  const ingestGeneratedCurriculum = useCallback(
    (
      curriculum: GeneratedCurriculum,
      topic: string,
      model: string,
      meta?: CurriculumIngestMeta
    ): Course => {
      const nowIso = new Date().toISOString();
      const baseTs = Date.now();
      const courseId = `course-ai-${baseTs}`;
      const sourceFileNames = (meta?.sourceDocuments || []).map((d) => d.name);

      const derivedCourseTags = normalizeCourseTags([
        ...(curriculum.tags || []),
        curriculum.category,
        ...(sourceFileNames.length > 0 ? ["from-my-notes"] : ["ai-curriculum"]),
        ...curriculum.units.flatMap((u) => u.keyConcepts).slice(0, 3),
      ]);

      const newCourse: Course = {
        id: courseId,
        code: curriculum.courseCode || "STD-101",
        title: curriculum.courseTitle,
        category: curriculum.category,
        instructor:
          sourceFileNames.length > 0 || meta?.rawNotesText?.trim()
            ? "Synthesized from Your Notes"
            : "Personalized AI Curriculum",
        deadlineLabel: `${curriculum.units.length} Units · ${
          curriculum.flashcards.length || 0
        } Cards`,
        tags: derivedCourseTags,
        totalUnits: curriculum.units.length,
        completedUnits: 0,
        createdAt: nowIso,
      };

      const combinedVerbatimNotes: string[] = [];
      if (meta?.rawNotesText?.trim()) {
        combinedVerbatimNotes.push(meta.rawNotesText.trim().slice(0, 10000));
      }
      for (const doc of meta?.sourceDocuments || []) {
        if (doc.textContent?.trim()) {
          combinedVerbatimNotes.push(
            `### Source File: ${doc.name}\n\n${doc.textContent.trim().slice(0, 10000)}`
          );
        }
      }
      const verbatimAppendix =
        combinedVerbatimNotes.length > 0
          ? `\n\n---\n\n## Original Uploaded Notes & Source Material\n\n${combinedVerbatimNotes.join(
              "\n\n"
            )}`
          : "";

      const newModules: ModuleUnit[] = curriculum.units.map((u, idx) => {
        const baseNotes =
          u.starterNotesMarkdown ||
          `# ${u.title}\n\n${u.briefOverview}\n\n## Key Concepts\n${u.keyConcepts
            .map((k) => `- ${k}`)
            .join("\n")}`;
        const fullNotes =
          idx === 0 && verbatimAppendix ? `${baseNotes}${verbatimAppendix}` : baseNotes;
        const wordTotal = countWords(fullNotes);

        return {
          id: `mod-ai-${baseTs}-${idx}`,
          courseId,
          title: u.title,
          status: idx === 0 ? "In Progress" : "To Do",
          videoLink: pickCuratedVideoForTopic(`${topic} ${u.title} ${u.searchQueryForVideo}`),
          searchQueryForVideo: u.searchQueryForVideo,
          notesMarkdown: fullNotes,
          estimatedHours: u.estimatedHours,
          studiedMinutes: 0,
          masteredAt: null,
          sourceFileNames,
          tags: normalizeCourseTags(u.keyConcepts.slice(0, 4)),
          keyConcepts: u.keyConcepts,
          briefOverview: u.briefOverview,
          autoResearchStatus: wordTotal >= 50 ? "synced" : "idle",
          autoResearchedAt: wordTotal >= 50 ? nowIso : null,
          resources: [
            {
              id: `res-yt-${baseTs}-${idx}`,
              title: `YouTube Lecture Search: ${u.searchQueryForVideo}`,
              url: `https://www.youtube.com/results?search_query=${encodeURIComponent(
                u.searchQueryForVideo
              )}`,
              type: "doc",
            },
          ],
          bookmarks: [],
          notesXpAwarded: false,
          masteredXpAwarded: false,
          updatedAt: nowIso,
        };
      });

      const newFlashcards: Flashcard[] = (curriculum.flashcards || []).map((fc, idx) => {
        const targetMod = newModules[fc.unitIndex] || newModules[0];
        return {
          id: `fc-ai-${baseTs}-${idx}`,
          courseId,
          moduleId: targetMod?.id,
          question: fc.question,
          answer: fc.answer,
          box: 1,
        };
      });

      const newDeadlines: DeadlineItem[] = (curriculum.milestones || []).map((ms, idx) => ({
        id: `dl-ai-${baseTs}-${idx}`,
        courseCode: newCourse.code,
        title: ms.title,
        subtitle: ms.subtitle,
        dueLabel: formatFutureDueLabel(ms.dueInDays),
        urgency: ms.urgency,
        completed: false,
      }));

      const accents: Array<"primary" | "secondary" | "tertiary"> = [
        "primary",
        "secondary",
        "tertiary",
      ];
      const newTimeBlocks: TimeBlock[] = (curriculum.studyBlocks || []).map((sb, idx) => ({
        id: `tb-ai-${baseTs}-${idx}`,
        timeRange: sb.timeRange,
        durationMinutes: sb.durationMinutes,
        title: sb.title,
        subtitle: sb.subtitle,
        courseId,
        moduleId: newModules[Math.min(idx, newModules.length - 1)]?.id,
        accent: accents[idx % accents.length],
        completed: false,
      }));

      const displayTopic = topic.trim() || curriculum.courseTitle;

      commitStateWithXP(
        (prev) => ({
          ...prev,
          courses: [newCourse, ...prev.courses],
          modules: [...newModules, ...prev.modules],
          flashcards: [...newFlashcards, ...prev.flashcards],
          deadlines: [...newDeadlines, ...prev.deadlines],
          timeBlocks:
            prev.timeBlocks.length === 0
              ? newTimeBlocks
              : [...newTimeBlocks, ...prev.timeBlocks].slice(0, 12),
          researchSessions: [
            {
              id: `rs-${baseTs}`,
              topic: displayTopic,
              learningGoals: meta?.learningGoals,
              sourceFileNames,
              mode: "curriculum",
              model,
              createdAt: nowIso,
              courseId,
              curriculum,
            },
            ...prev.researchSessions,
          ],
        }),
        XP_REWARDS.DEEP_RESEARCH_CURRICULUM,
        {
          title: `Built ${newCourse.code}: ${newModules.length} Units & ${newFlashcards.length} Cards`,
          subtitle: curriculum.courseTitle,
          celebrate: true,
        },
        {
          type: "curriculum_generated",
          title: `Generated curriculum "${curriculum.courseTitle}" (${newModules.length} units, ${newFlashcards.length} flashcards)`,
          detail:
            sourceFileNames.length > 0
              ? `Grounded in ${sourceFileNames.join(", ")}`
              : meta?.rawNotesText?.trim()
              ? "Grounded in pasted study notes"
              : displayTopic,
        }
      );

      setSelectedCourseId(courseId);
      if (newModules[0]) {
        setSelectedModuleId(newModules[0].id);
      }
      setPomodoroTimer((prev) => ({
        ...prev,
        linkedCourseId: prev.linkedCourseId || courseId,
      }));

      return newCourse;
    },
    [commitStateWithXP]
  );

  const saveGeneratedReport = useCallback(
    (report: DeepResearchReportData, topic: string, model: string) => {
      const nowIso = new Date().toISOString();
      commitStateWithXP(
        (prev) => ({
          ...prev,
          researchSessions: [
            {
              id: `rs-rep-${Date.now()}`,
              topic,
              mode: "report",
              model,
              createdAt: nowIso,
              report,
            },
            ...prev.researchSessions,
          ],
        }),
        XP_REWARDS.DEEP_RESEARCH_CURRICULUM,
        {
          title: "Deep Research Synthesis Complete",
          subtitle: report.title,
          celebrate: true,
        },
        {
          type: "curriculum_generated",
          title: `Synthesized research report: ${report.title}`,
          detail: topic,
        }
      );
    },
    [commitStateWithXP]
  );

  const saveReportAsVaultModule = useCallback(
    (title: string, markdown: string, courseId?: string): ModuleUnit => {
      let targetCourseId = courseId || stateRef.current.courses[0]?.id;
      if (!targetCourseId) {
        const createdCourse = createCourse({
          code: "RES-101",
          title: "Deep Research Knowledge Vault",
          category: "Research Notes",
          tags: ["research", "vault"],
        });
        targetCourseId = createdCourse.id;
      }
      const mod = addModule({
        courseId: targetCourseId,
        title,
        estimatedHours: 2.5,
        videoLink: pickCuratedVideoForTopic(title),
        tags: ["grokopedia", "research"],
        notesMarkdown: markdown,
        briefOverview: "Synthesized via Grokopedia Deep Research Engine.",
      });
      setSelectedModuleId(mod.id);
      return mod;
    },
    [addModule, createCourse]
  );

  // =========================================================================
  // ACADEMIC TASKS, ASSESSMENTS, ATTEMPTS & PROFILE/PORTFOLIO MUTATIONS
  // =========================================================================
  const createAcademicTask = useCallback(
    (input: {
      title: string;
      kind: AcademicTaskKind;
      priority: AcademicTaskPriority;
      dueDate: string;
      estimatedMinutes: number;
      courseId?: string;
      moduleId?: string;
      examChapters?: string[];
    }): { ok: boolean; error?: string; task?: AcademicTask } => {
      const check = validateAcademicTaskInput(input);
      if (!check.valid) {
        return { ok: false, error: check.error };
      }
      const nowIso = new Date().toISOString();
      const task: AcademicTask = {
        id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        courseId: input.courseId || undefined,
        moduleId: input.moduleId || undefined,
        title: input.title.trim(),
        kind: input.kind,
        priority: input.priority,
        status: "todo",
        dueDate: input.dueDate.trim().slice(0, 10),
        estimatedMinutes: Math.max(5, Math.round(input.estimatedMinutes)),
        examChapters: input.examChapters || [],
        createdAt: nowIso,
        completedAt: null,
      };
      commitStateWithXP(
        (prev) => ({
          ...prev,
          tasks: [task, ...prev.tasks],
        }),
        0,
        {
          title: `Scheduled ${task.kind.toUpperCase()}`,
          subtitle: `${task.title} · Due ${task.dueDate}`,
        }
      );
      return { ok: true, task };
    },
    [commitStateWithXP]
  );

  const updateAcademicTask = useCallback(
    (taskId: string, patch: Partial<AcademicTask>) => {
      const target = stateRef.current.tasks.find((t) => t.id === taskId);
      if (!target) return;
      const markingCompleted =
        (patch.status === "completed" || patch.status === "submitted") &&
        target.status !== "completed" &&
        target.status !== "submitted";
      const statusChanged = Boolean(patch.status && patch.status !== target.status);
      const nextDueYmd = patch.dueDate ? patch.dueDate.trim().slice(0, 10) : target.dueDate;
      const deadlineChanged = Boolean(
        patch.dueDate &&
          /^\d{4}-\d{2}-\d{2}$/.test(nextDueYmd) &&
          nextDueYmd !== target.dueDate.slice(0, 10) &&
          target.status !== "completed" &&
          target.status !== "submitted"
      );
      const nowIso = new Date().toISOString();
      const prepMins = Math.min(90, Math.max(25, target.estimatedMinutes));

      commitStateWithXP(
        (prev) => {
          let nextBlocks = prev.timeBlocks;
          if (deadlineChanged) {
            const hasExistingBlock = prev.timeBlocks.some(
              (b) => !b.completed && b.title.toLowerCase().includes(target.title.toLowerCase())
            );
            if (hasExistingBlock) {
              nextBlocks = prev.timeBlocks.map((b) =>
                !b.completed && b.title.toLowerCase().includes(target.title.toLowerCase())
                  ? {
                      ...b,
                      subtitle: `Adjusted for rescheduled due date ${nextDueYmd} (${prepMins}m focus block)`,
                    }
                  : b
              );
            } else {
              const adjBlock: TimeBlock = {
                id: `tb-adj-${Date.now()}`,
                timeRange: "Plan Adjustment",
                durationMinutes: prepMins,
                title: `Prep: ${target.title}`,
                subtitle: `Auto-adjusted study block (${target.dueDate} → ${nextDueYmd})`,
                courseId: target.courseId,
                moduleId: target.moduleId,
                accent: "primary",
                completed: false,
              };
              nextBlocks = [adjBlock, ...prev.timeBlocks];
            }
          }

          let nextEvents = prev.learningEvents;
          if (statusChanged || deadlineChanged) {
            const ev: LearningEvent = {
              id: `ev-task-${taskId}-${Date.now()}`,
              idempotencyKey: `task-upd:${taskId}:${nowIso}`,
              timestamp: nowIso,
              eventType: "task_status_changed",
              courseId: target.courseId,
              moduleId: target.moduleId,
              summary: deadlineChanged
                ? `Rescheduled ${target.kind} "${target.title}" (${target.dueDate} → ${nextDueYmd}) & adjusted study plan`
                : `Updated ${target.kind} "${target.title}" status to ${patch.status}`,
            };
            nextEvents = appendLearningEventIdempotent(nextEvents, ev).events;
          }

          return {
            ...prev,
            timeBlocks: nextBlocks,
            learningEvents: nextEvents,
            tasks: prev.tasks.map((t) =>
              t.id === taskId
                ? {
                    ...t,
                    ...patch,
                    ...(deadlineChanged
                      ? {
                          dueDate: nextDueYmd,
                          recoveryPlanNote:
                            patch.recoveryPlanNote ??
                            `Deadline changed ${target.dueDate} → ${nextDueYmd}; ${prepMins}m study block synced to Today's Plan.`,
                        }
                      : {}),
                    completedAt: markingCompleted ? nowIso : t.completedAt,
                  }
                : t
            ),
          };
        },
        markingCompleted ? 25 : 0,
        markingCompleted
          ? { title: `Completed ${target.kind}`, subtitle: target.title }
          : deadlineChanged
          ? {
              title: "Deadline Rescheduled & Plan Adjusted",
              subtitle: `${target.title} → Due ${nextDueYmd}`,
            }
          : undefined,
        markingCompleted
          ? {
              type: "task_completed",
              title: `Completed ${target.kind}: ${target.title}`,
              detail: `Due ${target.dueDate}`,
            }
          : undefined
      );
    },
    [commitStateWithXP]
  );

  const deleteAcademicTask = useCallback(
    (taskId: string) => {
      commitStateWithXP((prev) => ({
        ...prev,
        tasks: prev.tasks.filter((t) => t.id !== taskId),
      }));
    },
    [commitStateWithXP]
  );

  const recoverMissedTask = useCallback(
    (taskId: string) => {
      const target = stateRef.current.tasks.find((t) => t.id === taskId);
      if (!target) return;
      const tomorrowYmd = getTodayDateString(
        new Date(Date.now() + 24 * 60 * 60 * 1000)
      );
      const recoveryDuration = Math.min(90, Math.max(25, target.estimatedMinutes));
      const recoveryBlock: TimeBlock = {
        id: `tb-rec-${Date.now()}`,
        timeRange: "Recovery Block",
        durationMinutes: recoveryDuration,
        title: `Recovery: ${target.title}`,
        subtitle: `Rescheduled from ${target.dueDate} (${recoveryDuration}m focus block)`,
        courseId: target.courseId,
        moduleId: target.moduleId,
        accent: "secondary",
        completed: false,
      };
      commitStateWithXP(
        (prev) => ({
          ...prev,
          timeBlocks: [recoveryBlock, ...prev.timeBlocks],
          tasks: prev.tasks.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  status: "in_progress",
                  dueDate: tomorrowYmd,
                  recoveryPlanNote: `Recovered on ${getTodayDateString()} — scheduled ${recoveryDuration}m block for ${tomorrowYmd}.`,
                }
              : t
          ),
        }),
        0,
        {
          title: "Recovery Plan Scheduled",
          subtitle: `Added ${recoveryDuration}m block to Today's Plan & extended due date to ${tomorrowYmd}.`,
        }
      );
    },
    [commitStateWithXP]
  );

  const createAssessment = useCallback(
    (
      assessment: Omit<Assessment, "id" | "createdAt"> & { id?: string; createdAt?: string }
    ): Assessment => {
      const created: Assessment = {
        ...assessment,
        id:
          assessment.id ||
          `asmt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        createdAt: assessment.createdAt || new Date().toISOString(),
      };
      commitStateWithXP((prev) => ({
        ...prev,
        assessments: [created, ...prev.assessments.filter((a) => a.id !== created.id)],
      }));
      return created;
    },
    [commitStateWithXP]
  );

  const deleteAssessment = useCallback(
    (assessmentId: string) => {
      commitStateWithXP((prev) => ({
        ...prev,
        assessments: prev.assessments.filter((a) => a.id !== assessmentId),
      }));
    },
    [commitStateWithXP]
  );

  const recordAssessmentAttempt = useCallback(
    (input: {
      assessmentId?: string;
      courseId: string;
      moduleId?: string;
      title: string;
      kind: AssessmentKind;
      difficulty: AssessmentDifficulty;
      score: number;
      maxScore: number;
      selfConfidence: number;
      durationMinutes?: number;
      errorCategories: ErrorCategory[];
      isDelayedRecall?: boolean;
      questionResponses?: QuestionAttemptResponse[];
      reflection?: string;
      attemptedAt?: string;
    }): { ok: boolean; error?: string; attempt?: AssessmentAttempt } => {
      const check = validateAssessmentAttemptInput(input);
      if (!check.valid) {
        return { ok: false, error: check.error };
      }
      const nowIso = input.attemptedAt || new Date().toISOString();
      const pct = Math.round((input.score / input.maxScore) * 1000) / 10;
      const attempt: AssessmentAttempt = {
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        assessmentId: input.assessmentId,
        courseId: input.courseId,
        moduleId: input.moduleId || undefined,
        title: input.title.trim(),
        kind: input.kind,
        difficulty: input.difficulty,
        score: input.score,
        maxScore: input.maxScore,
        percentage: pct,
        selfConfidence: Math.min(5, Math.max(1, Math.round(input.selfConfidence))),
        durationMinutes: input.durationMinutes,
        errorCategories: input.errorCategories,
        isDelayedRecall: Boolean(input.isDelayedRecall),
        questionResponses: input.questionResponses,
        reflection: input.reflection?.trim(),
        attemptedAt: nowIso,
      };

      commitStateWithXP(
        (prev) => {
          const ev: LearningEvent = {
            id: `ev-att-${attempt.id}`,
            idempotencyKey: `att:${attempt.id}`,
            timestamp: nowIso,
            eventType: "assessment_attempt",
            courseId: attempt.courseId,
            moduleId: attempt.moduleId,
            summary: `Recorded ${attempt.kind.replace(/_/g, " ")} "${attempt.title}": ${pct}% (${attempt.score}/${attempt.maxScore})`,
            numericValue: pct,
          };
          return {
            ...prev,
            // Append-only: never overwrite historical attempts
            assessmentAttempts: [...prev.assessmentAttempts, attempt],
            learningEvents: appendLearningEventIdempotent(prev.learningEvents, ev).events,
          };
        },
        40,
        {
          title: `Recorded Assessment: ${pct}%`,
          subtitle: `${attempt.title} (${attempt.score}/${attempt.maxScore})`,
          celebrate: pct >= 85,
        },
        {
          type: "assessment_completed",
          title: `Scored ${pct}% on "${attempt.title}"`,
          detail: `${attempt.score}/${attempt.maxScore} · Confidence ${attempt.selfConfidence}/5`,
        }
      );

      return { ok: true, attempt };
    },
    [commitStateWithXP]
  );

  const correctAssessmentAttempt = useCallback(
    (
      attemptId: string,
      patch: {
        score: number;
        maxScore: number;
        selfConfidence?: number;
        errorCategories?: ErrorCategory[];
        reflection?: string;
      },
      reason: string
    ): { ok: boolean; error?: string } => {
      const existing = stateRef.current.assessmentAttempts.find((a) => a.id === attemptId);
      if (!existing) {
        return { ok: false, error: "Assessment attempt record not found." };
      }
      const check = validateAssessmentAttemptInput({
        title: existing.title,
        score: patch.score,
        maxScore: patch.maxScore,
        selfConfidence: patch.selfConfidence ?? existing.selfConfidence,
      });
      if (!check.valid) {
        return { ok: false, error: check.error };
      }
      const nowIso = new Date().toISOString();
      const newPct = Math.round((patch.score / patch.maxScore) * 1000) / 10;
      const correction: RecordCorrection = {
        id: `corr-${Date.now()}`,
        targetType: "assessment_attempt",
        targetId: attemptId,
        action: "corrected",
        reason: reason.trim() || "Score correction by student",
        previousSummary: `${existing.title}: ${existing.percentage}% (${existing.score}/${existing.maxScore})`,
        correctedAt: nowIso,
      };

      commitStateWithXP(
        (prev) => {
          const ev: LearningEvent = {
            id: `ev-corr-${correction.id}`,
            idempotencyKey: `corr:${correction.id}`,
            timestamp: nowIso,
            eventType: "record_corrected",
            courseId: existing.courseId,
            moduleId: existing.moduleId,
            summary: `Corrected "${existing.title}" from ${existing.percentage}% to ${newPct}% (${correction.reason})`,
            numericValue: newPct,
          };
          return {
            ...prev,
            recordCorrections: [correction, ...prev.recordCorrections],
            learningEvents: appendLearningEventIdempotent(prev.learningEvents, ev).events,
            assessmentAttempts: prev.assessmentAttempts.map((a) =>
              a.id === attemptId
                ? {
                    ...a,
                    score: patch.score,
                    maxScore: patch.maxScore,
                    percentage: newPct,
                    selfConfidence: patch.selfConfidence ?? a.selfConfidence,
                    errorCategories: patch.errorCategories ?? a.errorCategories,
                    reflection: patch.reflection ?? a.reflection,
                    correctedAt: nowIso,
                  }
                : a
            ),
          };
        },
        0,
        {
          title: "Assessment Record Corrected",
          subtitle: `Updated to ${newPct}% · Mastery & analytics recomputed.`,
        },
        {
          type: "record_corrected",
          title: `Corrected attempt "${existing.title}" to ${newPct}%`,
          detail: correction.reason,
        }
      );

      return { ok: true };
    },
    [commitStateWithXP]
  );

  const deleteAssessmentAttempt = useCallback(
    (attemptId: string, reason: string) => {
      const existing = stateRef.current.assessmentAttempts.find((a) => a.id === attemptId);
      if (!existing) return;
      const nowIso = new Date().toISOString();
      const correction: RecordCorrection = {
        id: `corr-del-${Date.now()}`,
        targetType: "assessment_attempt",
        targetId: attemptId,
        action: "deleted",
        reason: reason.trim() || "Removed invalid/test attempt",
        previousSummary: `${existing.title}: ${existing.percentage}% (${existing.score}/${existing.maxScore})`,
        correctedAt: nowIso,
      };
      commitStateWithXP(
        (prev) => {
          const ev: LearningEvent = {
            id: `ev-del-${correction.id}`,
            idempotencyKey: `del:${correction.id}`,
            timestamp: nowIso,
            eventType: "record_corrected",
            courseId: existing.courseId,
            moduleId: existing.moduleId,
            summary: `Deleted attempt "${existing.title}" (${existing.percentage}%) — ${correction.reason}`,
          };
          return {
            ...prev,
            recordCorrections: [correction, ...prev.recordCorrections],
            learningEvents: appendLearningEventIdempotent(prev.learningEvents, ev).events,
            assessmentAttempts: prev.assessmentAttempts.filter((a) => a.id !== attemptId),
          };
        },
        0,
        {
          title: "Attempt Deleted & Audited",
          subtitle: "Derived topic mastery and analytics updated immediately.",
        }
      );
    },
    [commitStateWithXP]
  );

  const updateAcademicProfile = useCallback(
    (patch: Partial<StudentAcademicProfile>) => {
      commitStateWithXP(
        (prev) => ({
          ...prev,
          academicProfile: {
            ...prev.academicProfile,
            ...patch,
            updatedAt: new Date().toISOString(),
          },
          settings: {
            ...prev.settings,
            ...(patch.programme && patch.programme.trim()
              ? { academicTrack: patch.programme.trim() }
              : {}),
          },
        }),
        0,
        { title: "Academic Profile Saved" }
      );
    },
    [commitStateWithXP]
  );

  const upsertSkillRecord = useCallback(
    (input: Omit<SkillRecord, "id" | "updatedAt"> & { id?: string }): SkillRecord => {
      const nowIso = new Date().toISOString();
      const skill: SkillRecord = {
        ...input,
        id: input.id || `sk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: input.name.trim(),
        category: input.category.trim() || "Academic & Technical",
        selfConfidence: Math.min(5, Math.max(1, Math.round(input.selfConfidence || 3))),
        updatedAt: nowIso,
      };
      commitStateWithXP(
        (prev) => {
          const exists = prev.academicProfile.skills.some((s) => s.id === skill.id);
          const nextSkills = exists
            ? prev.academicProfile.skills.map((s) => (s.id === skill.id ? skill : s))
            : [skill, ...prev.academicProfile.skills];
          const ev: LearningEvent = {
            id: `ev-skill-${skill.id}-${Date.now()}`,
            idempotencyKey: `skill:${skill.id}:${nowIso}`,
            timestamp: nowIso,
            eventType: "skill_updated",
            courseId: skill.linkedCourseIds[0],
            moduleId: skill.linkedModuleIds[0],
            summary: `Updated skill "${skill.name}" (${skill.category} · self-confidence ${skill.selfConfidence}/5)`,
            numericValue: skill.selfConfidence,
          };
          return {
            ...prev,
            learningEvents: appendLearningEventIdempotent(prev.learningEvents, ev).events,
            academicProfile: {
              ...prev.academicProfile,
              skills: nextSkills,
              updatedAt: nowIso,
            },
          };
        },
        0,
        { title: `Saved Skill: ${skill.name}`, subtitle: `Self-confidence ${skill.selfConfidence}/5` },
        {
          type: "skill_updated",
          title: `Updated skill record: ${skill.name}`,
          detail: `${skill.category} · Self-confidence ${skill.selfConfidence}/5`,
        }
      );
      return skill;
    },
    [commitStateWithXP]
  );

  const deleteSkillRecord = useCallback(
    (skillId: string) => {
      commitStateWithXP((prev) => ({
        ...prev,
        academicProfile: {
          ...prev.academicProfile,
          skills: prev.academicProfile.skills.filter((s) => s.id !== skillId),
          updatedAt: new Date().toISOString(),
        },
      }));
    },
    [commitStateWithXP]
  );

  const addPortfolioProject = useCallback(
    (input: Omit<PortfolioProject, "id" | "createdAt">): PortfolioProject => {
      const nowIso = new Date().toISOString();
      const proj: PortfolioProject = {
        ...input,
        id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        title: input.title.trim(),
        summary: input.summary.trim(),
        createdAt: nowIso,
      };
      commitStateWithXP(
        (prev) => ({
          ...prev,
          learningEvents: appendLearningEventIdempotent(prev.learningEvents, {
            id: `ev-proj-${proj.id}`,
            idempotencyKey: `proj:${proj.id}`,
            timestamp: nowIso,
            eventType: "project_completed",
            courseId: proj.linkedCourseId,
            summary: `Recorded portfolio project "${proj.title}"`,
          }).events,
          academicProfile: {
            ...prev.academicProfile,
            projects: [proj, ...prev.academicProfile.projects],
            updatedAt: nowIso,
          },
        }),
        20,
        { title: "Added Portfolio Project", subtitle: proj.title }
      );
      return proj;
    },
    [commitStateWithXP]
  );

  const deletePortfolioProject = useCallback(
    (projectId: string) => {
      commitStateWithXP((prev) => ({
        ...prev,
        academicProfile: {
          ...prev.academicProfile,
          projects: prev.academicProfile.projects.filter((p) => p.id !== projectId),
        },
      }));
    },
    [commitStateWithXP]
  );

  const addCertificationMilestone = useCallback(
    (input: Omit<CertificationMilestone, "id">): CertificationMilestone => {
      const cert: CertificationMilestone = {
        ...input,
        id: `cert-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        title: input.title.trim(),
        issuerOrType: input.issuerOrType.trim(),
      };
      commitStateWithXP(
        (prev) => ({
          ...prev,
          academicProfile: {
            ...prev.academicProfile,
            certifications: [cert, ...prev.academicProfile.certifications],
            updatedAt: new Date().toISOString(),
          },
        }),
        15,
        { title: "Recorded Milestone / Certificate", subtitle: cert.title }
      );
      return cert;
    },
    [commitStateWithXP]
  );

  const deleteCertificationMilestone = useCallback(
    (certId: string) => {
      commitStateWithXP((prev) => ({
        ...prev,
        academicProfile: {
          ...prev.academicProfile,
          certifications: prev.academicProfile.certifications.filter((c) => c.id !== certId),
        },
      }));
    },
    [commitStateWithXP]
  );

  const exportPortfolio = useCallback(() => {
    exportPortfolioMarkdownFile(stateRef.current);
    pushToast({
      title: "Exported Evidence Portfolio (.md)",
      subtitle: "Self-reported confidence and verified scores separated clearly.",
      variant: "success",
    });
  }, [pushToast]);

  const exportAnkiDeck = useCallback(
    (courseId?: string) => {
      exportFlashcardsAnkiTsv(stateRef.current, courseId);
      pushToast({
        title: "Exported Anki Deck (.tsv)",
        subtitle: "Ready for direct import into Anki (Tab-separated with tags).",
        variant: "success",
      });
    },
    [pushToast]
  );

  const exportCalendarIcs = useCallback(() => {
    exportCalendarIcsFile(stateRef.current);
    pushToast({
      title: "Exported Academic Calendar (.ics)",
      subtitle: "RFC 5545 calendar ready for Google Calendar, Apple Calendar, or Outlook.",
      variant: "success",
    });
  }, [pushToast]);

  const actOnRecommendation = useCallback(
    (recommendationId: string, action: "accepted" | "dismissed" | "snoozed") => {
      const now = new Date();
      const snoozeUntil =
        action === "snoozed"
          ? new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
          : undefined;
      setState((prev) => ({
        ...prev,
        recommendationFeedback: [
          {
            recommendationId,
            action,
            actedAt: now.toISOString(),
            snoozeUntil,
          },
          ...prev.recommendationFeedback.filter(
            (f) => f.recommendationId !== recommendationId
          ),
        ],
      }));
      if (action === "dismissed" || action === "snoozed") {
        pushToast({
          title:
            action === "snoozed"
              ? "Recommendation Snoozed (24h)"
              : "Recommendation Dismissed",
          variant: "success",
        });
      }
    },
    [pushToast]
  );

  // Study Time & Persisted Idempotent Pomodoro Ticker
  const logStudyMinutes = useCallback(
    (
      minutes: number,
      label?: string,
      options?: {
        isFocusSprint?: boolean;
        courseId?: string;
        moduleId?: string;
        idempotencyKey?: string;
        startedAt?: string;
      }
    ) => {
      const cleanMins = Math.max(1, Math.round(minutes));
      const today = getTodayDateString();
      const nowIso = new Date().toISOString();
      const targetModId = options?.moduleId || selectedModuleIdRef.current || undefined;
      const idemKey =
        options?.idempotencyKey ||
        `sess:${nowIso}:${Math.random().toString(36).slice(2, 7)}`;

      // Guard against duplicate submission if this exact session key already exists
      if (stateRef.current.studySessions.some((s) => s.idempotencyKey === idemKey)) {
        return;
      }

      const sessionRec: StudySessionRecord = {
        id: `ss-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        idempotencyKey: idemKey,
        courseId: options?.courseId || undefined,
        moduleId: targetModId,
        durationMinutes: cleanMins,
        kind: options?.isFocusSprint ? "pomodoro" : "manual",
        label: label || (options?.isFocusSprint ? "Pomodoro Focus Sprint" : "Manual Study Session"),
        startedAt:
          options?.startedAt ||
          new Date(Date.now() - cleanMins * 60 * 1000).toISOString(),
        endedAt: nowIso,
      };

      const learnEv: LearningEvent = {
        id: `ev-sess-${sessionRec.id}`,
        idempotencyKey: idemKey,
        timestamp: nowIso,
        eventType: "session_logged",
        courseId: sessionRec.courseId,
        moduleId: sessionRec.moduleId,
        summary: `${sessionRec.label} (${cleanMins}m)`,
        numericValue: cleanMins,
      };

      commitStateWithXP(
        (prev) => {
          const { sessions, inserted } = appendStudySessionIdempotent(
            prev.studySessions,
            sessionRec
          );
          if (!inserted) return prev;
          return {
            ...prev,
            studySessions: sessions,
            learningEvents: appendLearningEventIdempotent(prev.learningEvents, learnEv).events,
            activeFocusSession: options?.isFocusSprint ? null : prev.activeFocusSession,
            modules: targetModId
              ? prev.modules.map((m) =>
                  m.id === targetModId
                    ? { ...m, studiedMinutes: (m.studiedMinutes || 0) + cleanMins }
                    : m
                )
              : prev.modules,
            stats: {
              ...prev.stats,
              todayMinutesSpent: prev.stats.todayMinutesSpent + cleanMins,
              totalMinutesStudied: (prev.stats.totalMinutesStudied || 0) + cleanMins,
              focusSprintsToday: options?.isFocusSprint
                ? (prev.stats.focusSprintsToday || 0) + 1
                : prev.stats.focusSprintsToday || 0,
              totalFocusSprints: options?.isFocusSprint
                ? (prev.stats.totalFocusSprints || 0) + 1
                : prev.stats.totalFocusSprints || 0,
              weeklyMinutes: {
                ...prev.stats.weeklyMinutes,
                [today]: (prev.stats.weeklyMinutes[today] || 0) + cleanMins,
              },
            },
          };
        },
        XP_REWARDS.COMPLETE_FOCUS_SPRINT,
        {
          title: `Logged +${cleanMins}m Deep Study`,
          subtitle: label || "Focus progress saved locally",
        },
        {
          type: "focus_session",
          title: `Logged ${cleanMins}m study session`,
          detail: label || "Deep focus time recorded",
        }
      );
    },
    [commitStateWithXP]
  );

  // Sync active/in-progress Pomodoro session into StudyOSState periodically so reloads recover safely
  useEffect(() => {
    const isInProgress =
      pomodoroTimer.isRunning || pomodoroTimer.remainingSeconds < pomodoroTimer.totalSeconds;
    const syncTimer = window.setTimeout(() => {
      setState((prev) => ({
        ...prev,
        activeFocusSession: isInProgress
          ? {
              sessionId: pomodoroTimer.sessionId,
              isRunning: pomodoroTimer.isRunning,
              mode: pomodoroTimer.mode,
              totalSeconds: pomodoroTimer.totalSeconds,
              remainingSeconds: pomodoroTimer.remainingSeconds,
              linkedCourseId: pomodoroTimer.linkedCourseId,
              linkedModuleId: pomodoroTimer.linkedModuleId,
              startedAt: pomodoroTimer.startedAt,
              lastUpdatedAt: new Date().toISOString(),
            }
          : null,
      }));
    }, 1200);
    return () => window.clearTimeout(syncTimer);
  }, [
    pomodoroTimer.sessionId,
    pomodoroTimer.isRunning,
    pomodoroTimer.mode,
    pomodoroTimer.totalSeconds,
    pomodoroTimer.linkedCourseId,
    pomodoroTimer.linkedModuleId,
    // Checkpoint every 10 seconds when running so we don't rewrite localStorage every 1s
    Math.floor(pomodoroTimer.remainingSeconds / 10),
  ]);

  useEffect(() => {
    if (!pomodoroTimer.isRunning) return;
    const timer = window.setInterval(() => {
      setPomodoroTimer((prev) => {
        if (!prev.isRunning) return prev;
        if (prev.remainingSeconds <= 1) {
          playSoundEffect("timer", soundEnabledRef.current);
          const minsEarned = Math.max(1, Math.round(prev.totalSeconds / 60));
          const completedSessionId = prev.sessionId;
          const startedAtSnap = prev.startedAt;
          if (prev.mode === "focus") {
            window.setTimeout(() => {
              logStudyMinutes(minsEarned, "Pomodoro Focus Sprint Completed", {
                isFocusSprint: true,
                courseId: prev.linkedCourseId,
                moduleId: prev.linkedModuleId,
                idempotencyKey: `pomo:${completedSessionId}`,
                startedAt: startedAtSnap,
              });
            }, 0);
          }
          return {
            ...prev,
            sessionId: `focus-${Date.now()}`,
            isRunning: false,
            remainingSeconds: prev.totalSeconds,
            startedAt: new Date().toISOString(),
          };
        }
        return {
          ...prev,
          remainingSeconds: prev.remainingSeconds - 1,
        };
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [pomodoroTimer.isRunning, logStudyMinutes]);

  const startOrPausePomodoro = useCallback(() => {
    setPomodoroTimer((prev) => ({
      ...prev,
      isRunning: !prev.isRunning,
      startedAt:
        !prev.isRunning && prev.remainingSeconds === prev.totalSeconds
          ? new Date().toISOString()
          : prev.startedAt,
    }));
  }, []);

  const triggerFocusSessionShortcut = useCallback(() => {
    const currentlyRunning = pomodoroRef.current.isRunning;
    const rem = pomodoroRef.current.remainingSeconds;
    setPomodoroTimer((prev) => ({
      ...prev,
      isRunning: !prev.isRunning,
      linkedCourseId: prev.linkedCourseId || stateRef.current.courses[0]?.id || "",
    }));
    pushToast({
      title: currentlyRunning ? "Focus Session Paused" : "Focus Session Active",
      subtitle: currentlyRunning
        ? `${formatSecondsToTimestamp(rem)} remaining on sprint timer`
        : `${formatSecondsToTimestamp(rem)} Pomodoro sprint running in background`,
      variant: "success",
    });
  }, [pushToast]);

  const resetPomodoro = useCallback((minutes?: number, mode?: "focus" | "break") => {
    setPomodoroTimer((prev) => {
      const nextMode = mode ?? prev.mode;
      const secs = minutes ? minutes * 60 : prev.totalSeconds;
      return {
        ...prev,
        sessionId: `focus-${Date.now()}`,
        isRunning: false,
        mode: nextMode,
        totalSeconds: secs,
        remainingSeconds: secs,
        startedAt: new Date().toISOString(),
      };
    });
  }, []);

  const setPomodoroCourse = useCallback((courseId: string) => {
    setPomodoroTimer((prev) => ({ ...prev, linkedCourseId: courseId }));
  }, []);

  const setPomodoroModule = useCallback((moduleId: string) => {
    setPomodoroTimer((prev) => ({ ...prev, linkedModuleId: moduleId || undefined }));
  }, []);

  // TimeBlocks, Deadlines & Flashcards
  const toggleTimeBlock = useCallback(
    (blockId: string) => {
      const block = stateRef.current.timeBlocks.find((b) => b.id === blockId);
      if (!block) return;
      const markingDone = !block.completed;
      commitStateWithXP(
        (prev) => ({
          ...prev,
          timeBlocks: prev.timeBlocks.map((b) =>
            b.id === blockId ? { ...b, completed: !b.completed } : b
          ),
        }),
        markingDone ? 10 : 0,
        markingDone ? { title: "Time-Block Completed", subtitle: block.title } : undefined,
        markingDone
          ? {
              type: "milestone_completed",
              title: `Completed scheduled block: ${block.title}`,
              detail: `${block.timeRange} (${block.durationMinutes}m)`,
            }
          : undefined
      );
    },
    [commitStateWithXP]
  );

  const addTimeBlock = useCallback(
    (block: Omit<TimeBlock, "id" | "completed">) => {
      const tb: TimeBlock = {
        ...block,
        id: `tb-${Date.now()}`,
        completed: false,
      };
      commitStateWithXP(
        (prev) => ({
          ...prev,
          timeBlocks: [...prev.timeBlocks, tb],
        }),
        0,
        { title: "Scheduled Study Time-Block", subtitle: tb.title }
      );
    },
    [commitStateWithXP]
  );

  const toggleDeadline = useCallback(
    (deadlineId: string) => {
      const target = stateRef.current.deadlines.find((d) => d.id === deadlineId);
      if (!target) return;
      const markingDone = !target.completed;
      commitStateWithXP(
        (prev) => ({
          ...prev,
          deadlines: prev.deadlines.map((d) =>
            d.id === deadlineId ? { ...d, completed: !d.completed } : d
          ),
        }),
        0,
        markingDone
          ? { title: "Milestone Checked Off", subtitle: `${target.courseCode} · ${target.title}` }
          : undefined,
        markingDone
          ? {
              type: "milestone_completed",
              title: `Completed milestone: ${target.title}`,
              detail: target.courseCode,
            }
          : undefined
      );
    },
    [commitStateWithXP]
  );

  const addDeadline = useCallback(
    (deadline: Omit<DeadlineItem, "id" | "completed">) => {
      const dl: DeadlineItem = {
        ...deadline,
        id: `dl-${Date.now()}`,
        completed: false,
      };
      commitStateWithXP(
        (prev) => ({
          ...prev,
          deadlines: [dl, ...prev.deadlines],
        }),
        0,
        { title: "Milestone Added", subtitle: `${dl.courseCode} · ${dl.title}` }
      );
    },
    [commitStateWithXP]
  );

  const addFlashcardsBatch = useCallback(
    (cards: Array<{ courseId: string; moduleId?: string; question: string; answer: string }>) => {
      const created: Flashcard[] = cards.map((c, idx) => ({
        id: `fc-${Date.now()}-${idx}`,
        courseId: c.courseId,
        moduleId: c.moduleId,
        question: c.question.trim(),
        answer: c.answer.trim(),
        box: 1,
        reviewCount: 0,
        lapseCount: 0,
      }));
      commitStateWithXP(
        (prev) => ({
          ...prev,
          flashcards: [...created, ...prev.flashcards],
        }),
        15,
        {
          title: `Added ${created.length} Active-Recall Flashcard${created.length > 1 ? "s" : ""}`,
          subtitle: "Synced to Leitner Spaced Repetition Deck",
        }
      );
    },
    [commitStateWithXP]
  );

  const reviewFlashcard = useCallback(
    (cardId: string, rating: "again" | "hard" | "good" | "easy") => {
      const target = stateRef.current.flashcards.find((f) => f.id === cardId);
      const boxDelta = rating === "again" ? -2 : rating === "hard" ? 0 : rating === "good" ? 1 : 2;
      const xp = rating === "good" || rating === "easy" ? XP_REWARDS.REVIEW_FLASHCARD : 0;
      const nextBox = target ? Math.min(5, Math.max(1, target.box + boxDelta)) : 1;
      const now = new Date();
      const nextReviewIso = computeFlashcardNextReviewIso(nextBox, rating, now);

      const nowIso = now.toISOString();

      commitStateWithXP(
        (prev) => ({
          ...prev,
          learningEvents: appendLearningEventIdempotent(prev.learningEvents, {
            id: `ev-fc-${cardId}-${Date.now()}`,
            idempotencyKey: `fcrev:${cardId}:${nowIso}`,
            timestamp: nowIso,
            eventType: "flashcard_reviewed",
            courseId: target?.courseId,
            moduleId: target?.moduleId,
            summary: `Reviewed flashcard (${rating.toUpperCase()} → Box ${nextBox}/5)`,
            numericValue: nextBox,
          }).events,
          stats: {
            ...prev.stats,
            flashcardsReviewedToday: (prev.stats.flashcardsReviewedToday || 0) + 1,
            totalFlashcardsReviewed: (prev.stats.totalFlashcardsReviewed || 0) + 1,
          },
          flashcards: prev.flashcards.map((f) =>
            f.id === cardId
              ? {
                  ...f,
                  box: Math.min(5, Math.max(1, f.box + boxDelta)),
                  lastReviewedAt: nowIso,
                  nextReviewAt: nextReviewIso,
                  reviewCount: (f.reviewCount || 0) + 1,
                  lapseCount:
                    rating === "again" ? (f.lapseCount || 0) + 1 : f.lapseCount || 0,
                }
              : f
          ),
        }),
        xp,
        undefined,
        {
          type: "flashcard_review",
          title: `Reviewed flashcard (${rating.toUpperCase()} -> Box ${nextBox}/5)`,
          detail: target?.question.slice(0, 80),
        }
      );
    },
    [commitStateWithXP]
  );

  const deleteFlashcard = useCallback(
    (cardId: string) => {
      commitStateWithXP((prev) => ({
        ...prev,
        flashcards: prev.flashcards.filter((f) => f.id !== cardId),
      }));
    },
    [commitStateWithXP]
  );

  // Settings, Shortcuts, Clean-Slate Reset & Backup
  const updateSettings = useCallback(
    (patch: Partial<UserSettings>) => {
      commitStateWithXP((prev) => ({
        ...prev,
        settings: { ...prev.settings, ...patch },
      }));
    },
    [commitStateWithXP]
  );

  const updateShortcutBinding = useCallback(
    (actionId: ShortcutActionId, chord: string) => {
      setState((prev) => {
        const nextCustom: Partial<Record<ShortcutActionId, string>> = {
          ...(prev.settings.customShortcuts || {}),
        };
        // Remove any duplicate assignment on another action
        for (const key of Object.keys(nextCustom) as ShortcutActionId[]) {
          if (key !== actionId && nextCustom[key]?.toLowerCase() === chord.toLowerCase()) {
            delete nextCustom[key];
          }
        }
        nextCustom[actionId] = chord;
        return {
          ...prev,
          settings: {
            ...prev.settings,
            customShortcuts: nextCustom,
          },
        };
      });
    },
    []
  );

  const resetShortcutBindings = useCallback(() => {
    setState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        customShortcuts: {},
      },
    }));
    pushToast({
      title: "Keyboard Shortcuts Reset",
      subtitle: "Restored default Cmd/Ctrl + 1–8 navigation & study bindings.",
      variant: "success",
    });
  }, [pushToast]);

  // =========================================================================
  // GLOBAL KEYBOARD SHORTCUT MANAGER LISTENER (Cmd/Ctrl + 1-8 & Study Actions)
  // =========================================================================
  useEffect(() => {
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      if (isRecordingShortcutRef.current) return;

      const editable = isEditableElement(e.target);
      const matchedAction = matchShortcutAction(
        e,
        stateRef.current.settings.customShortcuts,
        editable
      );
      if (!matchedAction) return;

      e.preventDefault();
      e.stopPropagation();

      setState((prev) => ({
        ...prev,
        stats: {
          ...prev.stats,
          shortcutTriggersCount: (prev.stats.shortcutTriggersCount || 0) + 1,
        },
      }));

      switch (matchedAction) {
        case "nav_dashboard":
          setCommandPaletteOpen(false);
          setShortcutModalOpen(false);
          setActiveView(AppView.DASHBOARD);
          break;
        case "nav_courses":
          setCommandPaletteOpen(false);
          setShortcutModalOpen(false);
          setActiveView(AppView.COURSES);
          break;
        case "nav_vault":
          setCommandPaletteOpen(false);
          setShortcutModalOpen(false);
          setActiveView(AppView.VAULT);
          break;
        case "nav_grokopedia":
          setCommandPaletteOpen(false);
          setShortcutModalOpen(false);
          setActiveView(AppView.GROKOPEDIA);
          break;
        case "nav_terminal":
          setCommandPaletteOpen(false);
          setShortcutModalOpen(false);
          setActiveView(AppView.TERMINAL);
          break;
        case "nav_pomodoro":
          setCommandPaletteOpen(false);
          setShortcutModalOpen(false);
          setActiveView(AppView.POMODORO);
          break;
        case "nav_flashcards":
          setCommandPaletteOpen(false);
          setShortcutModalOpen(false);
          setActiveView(AppView.FLASHCARDS);
          break;
        case "nav_settings":
          setCommandPaletteOpen(false);
          setShortcutModalOpen(false);
          setGuideModalOpen(false);
          setActiveView(AppView.SETTINGS);
          break;
        case "nav_simulation":
          setCommandPaletteOpen(false);
          setShortcutModalOpen(false);
          setGuideModalOpen(false);
          setActiveView(AppView.SIMULATION);
          break;
        case "nav_assessments":
          setCommandPaletteOpen(false);
          setShortcutModalOpen(false);
          setGuideModalOpen(false);
          setActiveView(AppView.ASSESSMENTS);
          break;
        case "nav_growth":
          setCommandPaletteOpen(false);
          setShortcutModalOpen(false);
          setGuideModalOpen(false);
          setActiveView(AppView.GROWTH);
          break;
        case "nav_profile":
          setCommandPaletteOpen(false);
          setShortcutModalOpen(false);
          setGuideModalOpen(false);
          setActiveView(AppView.PROFILE);
          break;
        case "nav_learning_os":
          setCommandPaletteOpen(false);
          setShortcutModalOpen(false);
          setGuideModalOpen(false);
          setActiveView(AppView.LEARNING_OS);
          break;
        case "action_command_palette":
          setShortcutModalOpen(false);
          setCommandPaletteOpen((prev) => !prev);
          break;
        case "action_shortcut_help":
          setCommandPaletteOpen(false);
          setShortcutModalOpen((prev) => !prev);
          break;
        case "action_focus_session":
          triggerFocusSessionShortcut();
          break;
        case "action_new_note":
          setCommandPaletteOpen(false);
          setShortcutModalOpen(false);
          createQuickVaultNote();
          break;
        case "action_auto_research":
          setCommandPaletteOpen(false);
          setShortcutModalOpen(false);
          void runAutonomousNoteTaker();
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", onGlobalKeyDown);
    return () => window.removeEventListener("keydown", onGlobalKeyDown);
  }, [createQuickVaultNote, runAutonomousNoteTaker, triggerFocusSessionShortcut]);

  const updateDailyGoalMinutes = useCallback(
    (minutes: number) => {
      commitStateWithXP((prev) => ({
        ...prev,
        stats: { ...prev.stats, dailyGoalMinutes: Math.max(30, Math.min(600, minutes)) },
      }));
    },
    [commitStateWithXP]
  );

  const exportBackup = useCallback(() => {
    exportStateBackupFile(state);
    pushToast({
      title: "Saved Local Study OS Database (.studyos.json)",
      subtitle: "All courses, notes, flashcards, streaks, and XP exported.",
      variant: "success",
    });
  }, [state, pushToast]);

  const importBackupJson = useCallback(
    (jsonText: string) => {
      const restored = parseImportedBackupJson(jsonText, blankFallback);
      setState(restored);
      setSelectedCourseId(restored.courses[0]?.id || null);
      setSelectedModuleId(restored.modules[0]?.id || null);
      setActiveCourseTagFilters([]);
      pushToast({
        title: "Local Database File Restored",
        subtitle: `Loaded ${restored.courses.length} courses & ${restored.modules.length} modules.`,
        variant: "success",
      });
    },
    [blankFallback, pushToast]
  );

  const startFreshFromScratch = useCallback(
    (options?: { handle?: string; academicTrack?: string; dailyGoalMinutes?: number }) => {
      const fresh = createBlankStudyOSState({
        handle: options?.handle ?? state.settings.studentHandle,
        academicTrack: options?.academicTrack ?? state.settings.academicTrack,
        dailyGoalMinutes: options?.dailyGoalMinutes ?? state.stats.dailyGoalMinutes,
        workspaceSyncId: generateWorkspaceSyncId(),
      });
      setState(fresh);
      setSelectedCourseId(null);
      setSelectedModuleId(null);
      setActiveCourseTagFilters([]);
      setPomodoroTimer((prev) => ({
        ...prev,
        isRunning: false,
        remainingSeconds: prev.totalSeconds,
        linkedCourseId: "",
      }));
      pushToast({
        title: "Started Clean Workspace From Scratch",
        subtitle: "0 XP · 0 Courses · Ready for your own notes and learning goals.",
        variant: "success",
      });
    },
    [
      state.settings.studentHandle,
      state.settings.academicTrack,
      state.stats.dailyGoalMinutes,
      pushToast,
    ]
  );

  const value: StudyOSContextValue = {
    state,
    activeView,
    setActiveView,
    selectedCourseId,
    setSelectedCourseId,
    selectedModuleId,
    setSelectedModuleId,
    openModuleInVault,
    openCourseInManager,
    openCourseTagFilter,
    activeCourseTagFilters,
    setActiveCourseTagFilters,
    courseTagMatchMode,
    setCourseTagMatchMode,
    openGrokopediaWithTopic,
    pendingGrokTopic,
    clearPendingGrokTopic,
    isCommandPaletteOpen,
    setCommandPaletteOpen,
    isShortcutModalOpen,
    setShortcutModalOpen,
    isRecordingShortcut,
    setIsRecordingShortcut,
    updateShortcutBinding,
    resetShortcutBindings,
    createQuickVaultNote,
    triggerFocusSessionShortcut,
    vaultFocusTitleTick,
    autonomousAgentStatus,
    runAutonomousNoteTaker,
    isGuideModalOpen,
    setGuideModalOpen,
    activeLabTopic,
    launchIntegrativeLab,
    recordPhysicsLabSession,
    aiStatus,
    refreshAIStatus,
    toasts,
    pushToast,
    dismissToast,
    profiles,
    activeProfileId,
    createLearnerProfile,
    switchLearnerProfile,
    deleteLearnerProfile,
    dbSyncState,
    localSaveStatus,
    retryLocalSave,
    deleteServerWorkspaceSnapshot,
    syncWorkspaceNow,
    pullWorkspaceBySyncId,
    createCourse,
    updateCourse,
    updateCourseTags,
    toggleArchiveCourse,
    deleteCourse,
    addModule,
    updateModuleStatus,
    updateModuleDetails,
    toggleArchiveModule,
    saveModuleNotes,
    restoreNoteRevision,
    addLearningObjective,
    toggleLearningObjective,
    removeLearningObjective,
    addUnresolvedQuestion,
    toggleUnresolvedQuestion,
    removeUnresolvedQuestion,
    saveModuleReflection,
    saveModuleTranscript,
    addModuleHighlight,
    removeModuleHighlight,
    promoteHighlightToFlashcard,
    promoteHighlightToQuizQuestion,
    reorderModule,
    deleteModule,
    addModuleResource,
    removeModuleResource,
    addModuleBookmark,
    removeModuleBookmark,
    createAcademicTask,
    updateAcademicTask,
    deleteAcademicTask,
    recoverMissedTask,
    createAssessment,
    deleteAssessment,
    recordAssessmentAttempt,
    correctAssessmentAttempt,
    deleteAssessmentAttempt,
    updateAcademicProfile,
    upsertSkillRecord,
    deleteSkillRecord,
    addPortfolioProject,
    deletePortfolioProject,
    addCertificationMilestone,
    deleteCertificationMilestone,
    exportPortfolio,
    exportAnkiDeck,
    exportCalendarIcs,
    actOnRecommendation,
    ingestGeneratedCurriculum,
    saveGeneratedReport,
    saveReportAsVaultModule,
    pomodoro,
    startOrPausePomodoro,
    resetPomodoro,
    setPomodoroCourse,
    setPomodoroModule,
    logStudyMinutes,
    toggleTimeBlock,
    addTimeBlock,
    toggleDeadline,
    addDeadline,
    addFlashcardsBatch,
    reviewFlashcard,
    deleteFlashcard,
    updateSettings,
    updateDailyGoalMinutes,
    exportBackup,
    importBackupJson,
    startFreshFromScratch,
  };

  return <StudyOSContext.Provider value={value}>{children}</StudyOSContext.Provider>;
}

export function useStudyOS(): StudyOSContextValue {
  const ctx = useContext(StudyOSContext);
  if (!ctx) {
    throw new Error("useStudyOS must be used inside StudyOSProvider");
  }
  return ctx;
}
