import type {
  LearnerProfileMeta,
  ModuleUnit,
  StudentAcademicProfile,
  StudyOSState,
  UploadedNoteDocument,
} from "../types/studyOS";
import {
  createBlankStudyOSState,
  createDefaultAcademicProfile,
  generateWorkspaceSyncId,
} from "./workspaceState";
import {
  calculateLevel,
  evaluateStreakOnLoad,
  normalizeCourseTags,
  syncCoursesWithModules,
} from "./gamification";
import { computeAllTopicMasteries, computeSkillEvidence } from "./growthIntelligence";
import { resolveApiUrl } from "./apiBase";

const LEGACY_LOCAL_STORAGE_KEY = "study_os_state_v1";
const PROFILES_INDEX_KEY = "study_os_profiles_v2";
const ACTIVE_PROFILE_KEY = "study_os_active_profile_v2";
const PROFILE_STATE_PREFIX = "study_os_profile_state_v2:";

const IDB_NAME = "StudyOS_IndexedDB_v2";
const IDB_STORE = "workspaces";
const LEGACY_IDB_NAME = "StudyOS_IndexedDB_v1";
const LEGACY_IDB_STORE = "app_state";
const LEGACY_IDB_RECORD_KEY = "primary_snapshot";

export const DEFAULT_PROFILE_ID = "profile-primary";

const TEXT_EXTENSIONS = new Set([
  "md",
  "markdown",
  "txt",
  "text",
  "csv",
  "tsv",
  "json",
  "tex",
  "latex",
  "html",
  "htm",
  "xml",
  "yaml",
  "yml",
  "toml",
  "ini",
  "py",
  "js",
  "ts",
  "tsx",
  "jsx",
  "c",
  "cpp",
  "cc",
  "h",
  "hpp",
  "java",
  "rs",
  "go",
  "rb",
  "php",
  "sql",
  "sh",
  "r",
  "m",
  "swift",
  "kt",
]);

const INLINE_BINARY_MIMES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB per file

export interface StorageSaveResult {
  ok: boolean;
  error?: string;
}

export function getProfileStorageKey(profileId: string): string {
  return `${PROFILE_STATE_PREFIX}${profileId}`;
}

function openIndexedDB(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(IDB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function loadLegacyIndexedDB(): Promise<StudyOSState | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(LEGACY_IDB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(LEGACY_IDB_STORE)) {
          db.createObjectStore(LEGACY_IDB_STORE);
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        try {
          const tx = db.transaction(LEGACY_IDB_STORE, "readonly");
          const store = tx.objectStore(LEGACY_IDB_STORE);
          const req = store.get(LEGACY_IDB_RECORD_KEY);
          req.onsuccess = () => {
            db.close();
            resolve((req.result as StudyOSState) || null);
          };
          req.onerror = () => {
            db.close();
            resolve(null);
          };
        } catch {
          db.close();
          resolve(null);
        }
      };
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveToIndexedDB(
  state: StudyOSState,
  profileId: string = DEFAULT_PROFILE_ID
): Promise<StorageSaveResult> {
  const db = await openIndexedDB();
  if (!db) {
    return { ok: false, error: "IndexedDB is unavailable in this browser context." };
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
      store.put(state, profileId);
      tx.oncomplete = () => {
        db.close();
        resolve({ ok: true });
      };
      tx.onerror = () => {
        const errMsg = tx.error?.message || "IndexedDB write transaction failed.";
        db.close();
        resolve({ ok: false, error: errMsg });
      };
    } catch (err: unknown) {
      db.close();
      resolve({
        ok: false,
        error: err instanceof Error ? err.message : "IndexedDB put failed.",
      });
    }
  });
}

export async function loadFromIndexedDB(
  profileId: string = DEFAULT_PROFILE_ID
): Promise<StudyOSState | null> {
  const db = await openIndexedDB();
  if (db) {
    const found = await new Promise<StudyOSState | null>((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, "readonly");
        const store = tx.objectStore(IDB_STORE);
        const req = store.get(profileId);
        req.onsuccess = () => {
          db.close();
          resolve((req.result as StudyOSState) || null);
        };
        req.onerror = () => {
          db.close();
          resolve(null);
        };
      } catch {
        db.close();
        resolve(null);
      }
    });
    if (found) return found;
  }

  if (profileId === DEFAULT_PROFILE_ID) {
    return loadLegacyIndexedDB();
  }
  return null;
}

export async function deleteFromIndexedDB(profileId: string): Promise<void> {
  const db = await openIndexedDB();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
      store.delete(profileId);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

function sanitizeAcademicProfile(
  rawProfile: Partial<StudentAcademicProfile> | undefined,
  fallbackTrack: string
): StudentAcademicProfile {
  const def = createDefaultAcademicProfile(fallbackTrack);
  if (!rawProfile || typeof rawProfile !== "object") {
    return def;
  }
  return {
    ...def,
    ...rawProfile,
    academicGoals: Array.isArray(rawProfile.academicGoals)
      ? rawProfile.academicGoals.filter((g) => typeof g === "string")
      : def.academicGoals,
    personalLearningGoals: Array.isArray(rawProfile.personalLearningGoals)
      ? rawProfile.personalLearningGoals.filter((g) => typeof g === "string")
      : def.personalLearningGoals,
    preferredLearningMethods: Array.isArray(rawProfile.preferredLearningMethods)
      ? rawProfile.preferredLearningMethods.filter((m) => typeof m === "string")
      : def.preferredLearningMethods,
    accessibilityPreferences: {
      ...def.accessibilityPreferences,
      ...(rawProfile.accessibilityPreferences || {}),
    },
    semesterHistory: Array.isArray(rawProfile.semesterHistory)
      ? rawProfile.semesterHistory
      : [],
    skills: Array.isArray(rawProfile.skills) ? rawProfile.skills : [],
    projects: Array.isArray(rawProfile.projects) ? rawProfile.projects : [],
    certifications: Array.isArray(rawProfile.certifications)
      ? rawProfile.certifications
      : [],
    updatedAt:
      typeof rawProfile.updatedAt === "string" ? rawProfile.updatedAt : def.updatedAt,
  };
}

export function sanitizeState(raw: Partial<StudyOSState>, fallback: StudyOSState): StudyOSState {
  const rawModel = raw.settings?.selectedModel;
  const safeModel =
    rawModel === "gemini-3.1-flash-lite" || rawModel === "gemini-3.8-flash"
      ? rawModel
      : "gemini-3.8-flash";

  const courses = Array.isArray(raw.courses)
    ? raw.courses.map((c) => {
        const seedMatch = fallback.courses.find((fc) => fc.id === c.id);
        const migratedTags = Array.isArray(c.tags)
          ? normalizeCourseTags(c.tags)
          : seedMatch
          ? normalizeCourseTags(seedMatch.tags)
          : normalizeCourseTags([c.category]);
        return {
          ...c,
          archived: Boolean(c.archived),
          archivedAt: c.archivedAt ?? null,
          tags: migratedTags,
        };
      })
    : fallback.courses;

  const modules: ModuleUnit[] = Array.isArray(raw.modules)
    ? raw.modules.map(
        (m): ModuleUnit => ({
          ...m,
          resources: Array.isArray(m.resources) ? m.resources : [],
          bookmarks: Array.isArray(m.bookmarks) ? m.bookmarks : [],
          tags: Array.isArray(m.tags) ? m.tags : [],
          learningObjectives: Array.isArray(m.learningObjectives)
            ? m.learningObjectives
            : [],
          unresolvedQuestions: Array.isArray(m.unresolvedQuestions)
            ? m.unresolvedQuestions
            : [],
          noteRevisions: Array.isArray(m.noteRevisions) ? m.noteRevisions : [],
          highlights: Array.isArray(m.highlights) ? m.highlights : [],
          transcriptNotes: typeof m.transcriptNotes === "string" ? m.transcriptNotes : "",
          archived: Boolean(m.archived),
          archivedAt: m.archivedAt ?? null,
          studiedMinutes: typeof m.studiedMinutes === "number" ? m.studiedMinutes : 0,
          masteredAt: m.masteredAt ?? null,
          sourceFileNames: Array.isArray(m.sourceFileNames) ? m.sourceFileNames : [],
          autoResearchStatus:
            m.autoResearchStatus === "synced" || m.autoResearchStatus === "error"
              ? m.autoResearchStatus
              : "idle",
          autoResearchedAt: m.autoResearchedAt ?? null,
          autoThinkingSummary:
            typeof m.autoThinkingSummary === "string" ? m.autoThinkingSummary : undefined,
        })
      )
    : fallback.modules;

  const syncedCourses = syncCoursesWithModules(courses, modules);
  const completedCount = modules.filter((m) => !m.archived && m.status === "Mastered").length;

  const rawWeekly =
    raw.stats?.weeklyMinutes && typeof raw.stats.weeklyMinutes === "object"
      ? raw.stats.weeklyMinutes
      : fallback.stats.weeklyMinutes;

  const computedWeeklySum = Object.values(rawWeekly).reduce(
    (sum, val) => sum + (typeof val === "number" && Number.isFinite(val) ? val : 0),
    0
  );

  const mergedStats = evaluateStreakOnLoad({
    ...fallback.stats,
    ...(raw.stats || {}),
    weeklyMinutes: rawWeekly,
    totalMinutesStudied:
      typeof raw.stats?.totalMinutesStudied === "number"
        ? raw.stats.totalMinutesStudied
        : Math.max(computedWeeklySum, raw.stats?.todayMinutesSpent ?? 0),
    focusSprintsToday:
      typeof raw.stats?.focusSprintsToday === "number" ? raw.stats.focusSprintsToday : 0,
    totalFocusSprints:
      typeof raw.stats?.totalFocusSprints === "number" ? raw.stats.totalFocusSprints : 0,
    flashcardsReviewedToday:
      typeof raw.stats?.flashcardsReviewedToday === "number"
        ? raw.stats.flashcardsReviewedToday
        : 0,
    totalFlashcardsReviewed:
      typeof raw.stats?.totalFlashcardsReviewed === "number"
        ? raw.stats.totalFlashcardsReviewed
        : 0,
    autoFetchedModulesCount:
      typeof raw.stats?.autoFetchedModulesCount === "number"
        ? raw.stats.autoFetchedModulesCount
        : 0,
    shortcutTriggersCount:
      typeof raw.stats?.shortcutTriggersCount === "number"
        ? raw.stats.shortcutTriggersCount
        : 0,
    completedModulesCount: completedCount,
    level: calculateLevel(raw.stats?.currentXP ?? fallback.stats.currentXP),
  });

  const safeSyncId =
    typeof raw.workspaceSyncId === "string" && /^[a-zA-Z0-9_-]{8,64}$/.test(raw.workspaceSyncId)
      ? raw.workspaceSyncId
      : fallback.workspaceSyncId || generateWorkspaceSyncId();

  const resolvedTrack =
    raw.settings?.academicTrack || fallback.settings.academicTrack || "Self-Directed Mastery";

  return {
    schemaVersion: 3,
    workspaceSyncId: safeSyncId,
    settings: {
      ...fallback.settings,
      ...(raw.settings || {}),
      preferredProvider: "gemini",
      selectedModel: safeModel,
      theme: "dark",
      autonomousAgentEnabled:
        typeof raw.settings?.autonomousAgentEnabled === "boolean"
          ? raw.settings.autonomousAgentEnabled
          : true,
      customShortcuts:
        raw.settings?.customShortcuts && typeof raw.settings.customShortcuts === "object"
          ? raw.settings.customShortcuts
          : {},
    },
    stats: mergedStats,
    courses: syncedCourses,
    modules,
    achievements: Array.isArray(raw.achievements) ? raw.achievements : fallback.achievements,
    flashcards: Array.isArray(raw.flashcards) ? raw.flashcards : fallback.flashcards,
    timeBlocks: Array.isArray(raw.timeBlocks) ? raw.timeBlocks : fallback.timeBlocks,
    deadlines: Array.isArray(raw.deadlines) ? raw.deadlines : fallback.deadlines,
    researchSessions: Array.isArray(raw.researchSessions)
      ? raw.researchSessions
      : fallback.researchSessions,
    activityLog: Array.isArray(raw.activityLog) ? raw.activityLog : fallback.activityLog,
    academicProfile: sanitizeAcademicProfile(raw.academicProfile, resolvedTrack),
    tasks: Array.isArray(raw.tasks) ? raw.tasks : fallback.tasks || [],
    assessments: Array.isArray(raw.assessments) ? raw.assessments : fallback.assessments || [],
    assessmentAttempts: Array.isArray(raw.assessmentAttempts)
      ? raw.assessmentAttempts
      : fallback.assessmentAttempts || [],
    studySessions: Array.isArray(raw.studySessions)
      ? raw.studySessions
      : fallback.studySessions || [],
    learningEvents: Array.isArray(raw.learningEvents)
      ? raw.learningEvents
      : fallback.learningEvents || [],
    recordCorrections: Array.isArray(raw.recordCorrections)
      ? raw.recordCorrections
      : fallback.recordCorrections || [],
    recommendationFeedback: Array.isArray(raw.recommendationFeedback)
      ? raw.recommendationFeedback
      : fallback.recommendationFeedback || [],
    activeFocusSession:
      raw.activeFocusSession && typeof raw.activeFocusSession === "object"
        ? raw.activeFocusSession
        : null,
  };
}

function evaluateInitialFallback(fallback: StudyOSState): StudyOSState {
  return {
    ...fallback,
    courses: syncCoursesWithModules(fallback.courses, fallback.modules),
    stats: evaluateStreakOnLoad(fallback.stats),
  };
}

export function getActiveProfileIdSync(): string {
  if (typeof window === "undefined") return DEFAULT_PROFILE_ID;
  try {
    return window.localStorage.getItem(ACTIVE_PROFILE_KEY) || DEFAULT_PROFILE_ID;
  } catch {
    return DEFAULT_PROFILE_ID;
  }
}

export function setActiveProfileIdSync(profileId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACTIVE_PROFILE_KEY, profileId);
  } catch {
    // Ignore storage error
  }
}

export function loadLearnerProfilesSync(): LearnerProfileMeta[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PROFILES_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LearnerProfileMeta[]) : [];
  } catch {
    return [];
  }
}

export function saveLearnerProfilesSync(profiles: LearnerProfileMeta[]): StorageSaveResult {
  if (typeof window === "undefined") return { ok: true };
  try {
    window.localStorage.setItem(PROFILES_INDEX_KEY, JSON.stringify(profiles));
    return { ok: true };
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to save learner profile index.",
    };
  }
}

export function loadProfileStateSync(
  profileId: string,
  fallback: StudyOSState = createBlankStudyOSState()
): StudyOSState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(getProfileStorageKey(profileId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StudyOSState>;
    return sanitizeState(parsed, fallback);
  } catch {
    return null;
  }
}

export function loadInitialStateSync(
  fallback: StudyOSState = createBlankStudyOSState()
): StudyOSState {
  if (typeof window === "undefined") return fallback;
  try {
    const activeProfileId = getActiveProfileIdSync();
    const profileRaw = window.localStorage.getItem(getProfileStorageKey(activeProfileId));
    if (profileRaw) {
      const parsed = JSON.parse(profileRaw) as Partial<StudyOSState>;
      return sanitizeState(parsed, fallback);
    }

    // Seamless migration from v1 single-profile storage if present
    const legacyRaw = window.localStorage.getItem(LEGACY_LOCAL_STORAGE_KEY);
    if (legacyRaw) {
      const parsed = JSON.parse(legacyRaw) as Partial<StudyOSState>;
      return sanitizeState(parsed, fallback);
    }

    return evaluateInitialFallback(fallback);
  } catch {
    return evaluateInitialFallback(fallback);
  }
}

/**
 * Persists state synchronously to localStorage and asynchronously to IndexedDB.
 * Returns structured StorageSaveResult so quota or serialization failures are surfaced visibly.
 */
export function persistState(
  state: StudyOSState,
  profileId: string = getActiveProfileIdSync(),
  onAsyncIdbResult?: (res: StorageSaveResult) => void
): StorageSaveResult {
  if (typeof window === "undefined") return { ok: true };
  let localOk = true;
  let localError: string | undefined;

  try {
    const serialized = JSON.stringify(state);
    window.localStorage.setItem(getProfileStorageKey(profileId), serialized);
    if (profileId === DEFAULT_PROFILE_ID) {
      window.localStorage.setItem(LEGACY_LOCAL_STORAGE_KEY, serialized);
    }
  } catch (err: unknown) {
    localOk = false;
    localError =
      err instanceof Error
        ? err.message
        : "Browser localStorage quota exceeded; falling back to IndexedDB.";
  }

  void saveToIndexedDB(state, profileId).then((idbRes) => {
    if (onAsyncIdbResult) {
      onAsyncIdbResult(
        idbRes.ok ? { ok: true } : { ok: localOk, error: idbRes.error || localError }
      );
    }
  });

  return { ok: localOk, error: localError };
}

export function deleteProfileStorage(profileId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(getProfileStorageKey(profileId));
    if (profileId === DEFAULT_PROFILE_ID) {
      window.localStorage.removeItem(LEGACY_LOCAL_STORAGE_KEY);
    }
  } catch {
    // Ignore
  }
  void deleteFromIndexedDB(profileId);
}

export function estimateStorageBytes(state: StudyOSState): number {
  try {
    return new Blob([JSON.stringify(state)]).size;
  } catch {
    return 0;
  }
}

export function formatByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function buildPortableBackupPayload(state: StudyOSState) {
  return {
    schemaVersion: "3.0.0",
    exportedAt: new Date().toISOString(),
    app: "Study OS — Student Learning & Growth OS",
    workspaceSyncId: state.workspaceSyncId,
    learnerHandle: state.settings.studentHandle,
    recordCounts: {
      courses: state.courses.length,
      modules: state.modules.length,
      flashcards: state.flashcards.length,
      tasks: state.tasks.length,
      assessments: state.assessments.length,
      assessmentAttempts: state.assessmentAttempts.length,
      studySessions: state.studySessions.length,
      learningEvents: state.learningEvents.length,
      skills: state.academicProfile.skills.length,
      projects: state.academicProfile.projects.length,
    },
    state,
  };
}

export function exportStateBackupFile(state: StudyOSState): void {
  const payload = buildPortableBackupPayload(state);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const dateTag = new Date().toISOString().slice(0, 10);
  const handleSlug =
    state.settings.studentHandle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ||
    "learner";
  a.href = url;
  a.download = `${handleSlug}-${dateTag}.studyos.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Builds Anki-compatible Tab-Separated Values (.tsv) deck content (Question \t Answer \t Tags).
 */
export function buildAnkiTsvContent(state: StudyOSState, courseId?: string): string {
  const courseMap = new Map(state.courses.map((c) => [c.id, c]));
  const cards = state.flashcards.filter(
    (f) => !courseId || courseId === "all" || f.courseId === courseId
  );
  const header = "#separator:tab\n#html:false\n#tags column:3";
  const rows = cards.map((card) => {
    const cleanQ = card.question.replace(/[\t\r\n]+/g, " ").trim();
    const cleanA = card.answer.replace(/[\t\r\n]+/g, " ").trim();
    const course = courseMap.get(card.courseId);
    const tagSlug = course
      ? course.code.toLowerCase().replace(/[^a-z0-9_-]+/g, "-")
      : "studyos";
    return `${cleanQ}\t${cleanA}\t${tagSlug} box-${card.box}`;
  });
  return [header, ...rows].join("\n");
}

export function exportFlashcardsAnkiTsv(state: StudyOSState, courseId?: string): void {
  const tsv = buildAnkiTsvContent(state, courseId);
  const blob = new Blob([tsv], { type: "text/tab-separated-values;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const dateTag = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `studyos-anki-deck-${dateTag}.tsv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Builds an honest, evidence-backed Student Academic & Skill Portfolio in Markdown.
 * Strictly separates self-reported ratings from verified internal assessment performance.
 */
export function buildEvidencePortfolioMarkdown(
  state: StudyOSState,
  now: Date = new Date()
): string {
  const prof = state.academicProfile;
  const masteries = computeAllTopicMasteries(state, now);
  const verifiedTopics = masteries.filter((m) => m.level === "verified_mastery");
  const proficientTopics = masteries.filter((m) => m.level === "proficient");

  const lines: string[] = [
    `# Student Growth & Academic Portfolio — ${
      prof.fullName?.trim() || state.settings.studentHandle
    }`,
    `> Generated from StudyOS Local Ledger on ${now.toISOString().slice(0, 10)} · Workspace \`${state.workspaceSyncId}\``,
    "",
    "## 1. Academic Identity & Programme",
    `- **Handle**: ${state.settings.studentHandle}`,
    `- **Track / Programme**: ${prof.programme || state.settings.academicTrack}`,
  ];

  if (prof.institution) lines.push(`- **Institution**: ${prof.institution}`);
  if (prof.degreeLevel) lines.push(`- **Degree Level**: ${prof.degreeLevel}`);
  if (prof.academicYear || prof.semester) {
    lines.push(
      `- **Academic Term**: ${[prof.academicYear, prof.semester].filter(Boolean).join(" · ")}`
    );
  }
  lines.push(
    `- **Tracked Study Volume**: ${state.stats.totalMinutesStudied} minutes (${state.stats.totalFocusSprints} focus sprints · ${state.assessmentAttempts.length} recorded assessments)`
  );

  if (prof.academicGoals.length > 0) {
    lines.push("", "## 2. Academic & Learning Goals");
    for (const g of prof.academicGoals) lines.push(`- ${g}`);
  }

  lines.push(
    "",
    "## 3. Skills Matrix (Self-Reported Confidence vs. Assessed Evidence)",
    "_Disclosure: 'Evidence-Backed (Internal)' reflects StudyOS assessment attempts and linked projects; it is not an external institutional accreditation._",
    ""
  );
  if (prof.skills.length === 0) {
    lines.push("_No skill records added yet._");
  } else {
    for (const sk of prof.skills) {
      const ev = computeSkillEvidence(sk, state, now);
      lines.push(
        `- **${ev.skillName}** (${ev.category}) — Status: **${ev.verificationBadge}** | Self-Confidence: ${ev.selfConfidence}/5 | Assessed Avg: ${
          ev.assessedScore !== null ? `${ev.assessedScore}% (${ev.attemptCount} attempts)` : "Not enough evidence yet."
        } | Projects: ${ev.linkedProjectCount}`
      );
    }
  }

  lines.push("", "## 4. Verified & Proficient Syllabus Topics");
  if (verifiedTopics.length === 0 && proficientTopics.length === 0) {
    lines.push("_Not enough assessment evidence yet to certify topic proficiency._");
  } else {
    for (const m of [...verifiedTopics, ...proficientTopics]) {
      lines.push(
        `- **${m.moduleTitle}** — **${m.label}** (Evidence Score: ${m.evidenceScore}% across ${m.attemptCount} attempts, latest ${m.latestScore}%)`
      );
    }
  }

  if (prof.projects.length > 0) {
    lines.push("", "## 5. Projects & Practical Evidence");
    for (const proj of prof.projects) {
      lines.push(
        `### ${proj.title}${proj.completedAt ? ` (${proj.completedAt})` : ""}`,
        proj.summary,
        proj.evidenceUrl ? `- Evidence Link: ${proj.evidenceUrl}` : ""
      );
    }
  }

  if (prof.certifications.length > 0) {
    lines.push("", "## 6. Certifications & Milestones");
    for (const cert of prof.certifications) {
      lines.push(
        `- **${cert.title}** (${cert.issuerOrType} · ${cert.kind}) — Completed ${cert.completedAt}${
          cert.credentialUrl ? ` · ${cert.credentialUrl}` : ""
        }`
      );
    }
  }

  return lines.filter((l) => l !== undefined).join("\n");
}

export function exportPortfolioMarkdownFile(state: StudyOSState): void {
  const md = buildEvidencePortfolioMarkdown(state);
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const dateTag = new Date().toISOString().slice(0, 10);
  const handleSlug =
    state.settings.studentHandle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ||
    "learner";
  a.href = url;
  a.download = `${handleSlug}-portfolio-${dateTag}.md`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function escapeIcsText(raw: string): string {
  return raw
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function formatIcsUtcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function addOneDayYmd(ymd: string): string {
  const parts = ymd.slice(0, 10).split("-").map((n) => parseInt(n, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return ymd.slice(0, 10).replace(/-/g, "");
  }
  const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + 1));
  return dt.toISOString().slice(0, 10).replace(/-/g, "");
}

/**
 * Builds an RFC 5545 compliant iCalendar (.ics) feed containing open AcademicTask deadlines,
 * exam dates, and active TimeBlock study blocks for external calendar applications.
 */
export function buildCalendarIcsContent(
  state: StudyOSState,
  now: Date = new Date()
): string {
  const dtStamp = formatIcsUtcStamp(now);
  const todayCompact = now.toISOString().slice(0, 10).replace(/-/g, "");
  const courseMap = new Map(state.courses.map((c) => [c.id, c]));

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//StudyOS//Student Learning and Growth OS//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(`StudyOS — ${state.settings.studentHandle}`)}`,
  ];

  for (const task of state.tasks || []) {
    if (task.status === "completed" || task.status === "submitted") continue;
    if (!task.dueDate || !/^\d{4}-\d{2}-\d{2}/.test(task.dueDate)) continue;

    const startDate = task.dueDate.slice(0, 10).replace(/-/g, "");
    const endDate = addOneDayYmd(task.dueDate);
    const course = task.courseId ? courseMap.get(task.courseId) : undefined;
    const prefix = course ? `[${course.code}] ` : "";
    const summary = `${prefix}${task.kind.toUpperCase()}: ${task.title}`;
    const descParts = [
      `Type: ${task.kind}`,
      `Priority: ${task.priority}`,
      `Estimated effort: ${task.estimatedMinutes} min`,
      `Status: ${task.status}`,
    ];
    if (task.examChapters && task.examChapters.length > 0) {
      descParts.push(`Scope: ${task.examChapters.join(", ")}`);
    }
    if (task.recoveryPlanNote) {
      descParts.push(`Note: ${task.recoveryPlanNote}`);
    }

    lines.push(
      "BEGIN:VEVENT",
      `UID:${task.id}@studyos.local`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART;VALUE=DATE:${startDate}`,
      `DTEND;VALUE=DATE:${endDate}`,
      `SUMMARY:${escapeIcsText(summary)}`,
      `DESCRIPTION:${escapeIcsText(descParts.join(" | "))}`,
      "END:VEVENT"
    );
  }

  for (const block of state.timeBlocks || []) {
    if (block.completed) continue;
    const timeMatch = block.timeRange.match(/(\d{1,2}):(\d{2})/);
    const hh = timeMatch ? String(Math.min(23, parseInt(timeMatch[1], 10))).padStart(2, "0") : "09";
    const mm = timeMatch ? String(Math.min(59, parseInt(timeMatch[2], 10))).padStart(2, "0") : "00";
    const startMinTotal = parseInt(hh, 10) * 60 + parseInt(mm, 10);
    const endMinTotal = Math.min(23 * 60 + 59, startMinTotal + Math.max(15, block.durationMinutes || 30));
    const endHh = String(Math.floor(endMinTotal / 60)).padStart(2, "0");
    const endMm = String(endMinTotal % 60).padStart(2, "0");

    lines.push(
      "BEGIN:VEVENT",
      `UID:${block.id}@studyos.local`,
      `DTSTAMP:${dtStamp}`,
      `DTSTART:${todayCompact}T${hh}${mm}00`,
      `DTEND:${todayCompact}T${endHh}${endMm}00`,
      `SUMMARY:${escapeIcsText(`Study Block: ${block.title}`)}`,
      `DESCRIPTION:${escapeIcsText(`${block.subtitle} (${block.durationMinutes} min)`)}`,
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

export function exportCalendarIcsFile(state: StudyOSState): void {
  const ics = buildCalendarIcsContent(state);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const dateTag = new Date().toISOString().slice(0, 10);
  const handleSlug =
    state.settings.studentHandle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") ||
    "learner";
  a.href = url;
  a.download = `${handleSlug}-studyos-schedule-${dateTag}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function parseImportedBackupJson(
  jsonText: string,
  fallback: StudyOSState = createBlankStudyOSState()
): StudyOSState {
  const parsed = JSON.parse(jsonText) as { state?: Partial<StudyOSState> } & Partial<StudyOSState>;
  const candidate = parsed && typeof parsed === "object" && parsed.state ? parsed.state : parsed;
  if (!candidate || typeof candidate !== "object") {
    throw new Error("Invalid Study OS database file structure.");
  }
  return sanitizeState(candidate, fallback);
}

/* ============================================================================
 * LOCAL SERVER WORKSPACE DATABASE SYNC (/api/db/workspaces/:workspaceId)
 * ========================================================================== */
export interface ServerDbHealth {
  ok: boolean;
  engine?: string;
  storageDir?: string;
  workspaceCount?: number;
}

export async function checkServerDbHealth(): Promise<ServerDbHealth> {
  try {
    const res = await fetch(resolveApiUrl("/api/db/health"));
    if (!res.ok) return { ok: false };
    return (await res.json()) as ServerDbHealth;
  } catch {
    return { ok: false };
  }
}

export async function pushWorkspaceToServer(
  state: StudyOSState
): Promise<{ ok: boolean; updatedAt?: string; revision?: number }> {
  try {
    const res = await fetch(
      resolveApiUrl(`/api/db/workspaces/${encodeURIComponent(state.workspaceSyncId)}`),
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state }),
      }
    );
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as {
      ok?: boolean;
      updatedAt?: string;
      revision?: number;
    };
    return {
      ok: Boolean(data.ok),
      updatedAt: data.updatedAt,
      revision: data.revision,
    };
  } catch {
    return { ok: false };
  }
}

export async function deleteWorkspaceFromServer(workspaceSyncId: string): Promise<boolean> {
  try {
    const res = await fetch(
      resolveApiUrl(`/api/db/workspaces/${encodeURIComponent(workspaceSyncId.trim())}`),
      {
        method: "DELETE",
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function pullWorkspaceFromServer(
  workspaceSyncId: string,
  fallback: StudyOSState = createBlankStudyOSState()
): Promise<{
  found: boolean;
  state?: StudyOSState;
  updatedAt?: string;
  revision?: number;
}> {
  const cleanId = workspaceSyncId.trim();
  const res = await fetch(
    resolveApiUrl(`/api/db/workspaces/${encodeURIComponent(cleanId)}`)
  );
  if (!res.ok) {
    throw new Error(`Workspace lookup failed (HTTP ${res.status}).`);
  }
  const data = (await res.json()) as {
    found?: boolean;
    updatedAt?: string;
    revision?: number;
    state?: Partial<StudyOSState>;
  };
  if (!data.found || !data.state) {
    return { found: false };
  }
  return {
    found: true,
    updatedAt: data.updatedAt,
    revision: data.revision,
    state: sanitizeState({ ...data.state, workspaceSyncId: cleanId }, fallback),
  };
}

/* ============================================================================
 * MULTIMODAL CLIENT NOTE & DOCUMENT READER (.md, .txt, .pdf, images, code)
 * ========================================================================== */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`Could not read text from "${file.name}".`));
    reader.readAsText(file);
  });
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const commaIdx = result.indexOf(",");
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error(`Could not read binary data from "${file.name}".`));
    reader.readAsDataURL(file);
  });
}

export async function readUploadedNoteFiles(
  fileList: FileList | File[]
): Promise<UploadedNoteDocument[]> {
  const files = Array.from(fileList).slice(0, 8);
  const processed: UploadedNoteDocument[] = [];

  for (const file of files) {
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error(
        `"${file.name}" exceeds the 15 MB per-file limit (${formatByteSize(file.size)}).`
      );
    }

    const ext = (file.name.split(".").pop() || "").toLowerCase();
    const rawMime = (file.type || "").toLowerCase();

    const mappedBinaryMime =
      INLINE_BINARY_MIMES[ext] ||
      (Object.values(INLINE_BINARY_MIMES).includes(rawMime) ? rawMime : null);

    if (mappedBinaryMime) {
      const base64Data = await readFileAsBase64(file);
      processed.push({
        name: file.name,
        mimeType: mappedBinaryMime,
        sizeBytes: file.size,
        base64Data,
      });
      continue;
    }

    if (TEXT_EXTENSIONS.has(ext) || rawMime.startsWith("text/") || rawMime === "application/json") {
      const textContent = await readFileAsText(file);
      processed.push({
        name: file.name,
        mimeType: rawMime || "text/plain",
        sizeBytes: file.size,
        textContent,
      });
      continue;
    }

    throw new Error(
      `Unsupported file format for "${file.name}". Upload PDF, Markdown (.md), TXT, CSV, JSON, source code, or PNG/JPG/WEBP note scans.`
    );
  }

  return processed;
}
