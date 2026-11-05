import {
  XP_REWARDS,
  calculateLevel,
  collectCourseTagCounts,
  computeWeeklyFocusHoursSummary,
  countWords,
  evaluateStreakOnLoad,
  filterCoursesByTags,
  formatFocusHoursLabel,
  getLevelProgress,
  getProfileInitials,
  normalizeCourseTag,
  normalizeCourseTags,
  parseYouTubeUrl,
  syncCoursesWithModules,
} from "./gamification";
import { createBlankStudyOSState } from "./workspaceState";
import {
  buildAnkiTsvContent,
  buildCalendarIcsContent,
  buildEvidencePortfolioMarkdown,
  buildPortableBackupPayload,
  parseImportedBackupJson,
  sanitizeState,
} from "./storage";
import {
  appendLearningEventIdempotent,
  appendStudySessionIdempotent,
  buildDeterministicTopicQuiz,
  buildGrowthTimeline,
  computeFlashcardNextReviewIso,
  computeGrowthAnalytics,
  computeSkillEvidence,
  computeTopicMastery,
  generateNextBestActions,
  generatePeriodicReview,
  getDueFlashcards,
  validateAcademicTaskInput,
  validateAssessmentAttemptInput,
} from "./growthIntelligence";
import {
  eventToShortcutChord,
  formatShortcutBadge,
  matchShortcutAction,
} from "./shortcuts";
import { normalizeCurriculumPayload } from "../services/aiService";
import {
  compileIntegrativeLabBlueprint,
  computeMechanicalInvariants,
  extractNoteConcepts,
  stepRK4InPlace,
  synthesizeDeterministicCurriculum,
  type ProjectileKinematicState,
  type RK4EnvironmentParams,
} from "./integrativePhysicsEngine";
import type {
  AssessmentAttempt,
  Course,
  LearningEvent,
  SkillRecord,
  StudyOSState,
  StudySessionRecord,
  UserStats,
} from "../types/studyOS";
import {
  DEFAULT_LEARNINGOS_APP_MANIFESTS,
  createDefaultLearningOSHost,
} from "./appHostToolBus";
import {
  computeDeterministicHash,
  detectResourceSourceType,
  getDefaultSourceCapabilities,
  normalizeTranscriptSegments,
  parseVttOrSrtTranscript,
} from "./transcriptPipeline";
import { FsrsLiteScheduler, parseAnkiTsvImport } from "./fsrsScheduler";
import {
  compileInteractiveLessonArtifact,
  evaluateExternalWebUrl,
  validateInteractiveLessonArtifact,
} from "../integrations/learningOSAdapters";

export interface UnitTestAssertionResult {
  name: string;
  passed: boolean;
  detail: string;
}

export function runAllUnitTests(): {
  total: number;
  passed: number;
  failed: number;
  results: UnitTestAssertionResult[];
} {
  const results: UnitTestAssertionResult[] = [];

  const assert = (name: string, condition: boolean, detail: string) => {
    results.push({ name, passed: Boolean(condition), detail });
  };

  // 1. XP & Level Formula Tests: Level = Math.floor(Math.sqrt(currentXP / 100)) + 1
  assert(
    "Level Formula @ 0 XP -> Level 1",
    calculateLevel(0) === 1,
    `Expected 1, received ${calculateLevel(0)}`
  );
  assert(
    "Level Formula @ 99 XP -> Level 1",
    calculateLevel(99) === 1,
    `Expected 1, received ${calculateLevel(99)}`
  );
  assert(
    "Level Formula @ 100 XP -> Level 2",
    calculateLevel(100) === 2,
    `Expected 2, received ${calculateLevel(100)}`
  );
  assert(
    "Level Formula @ 400 XP -> Level 3",
    calculateLevel(400) === 3,
    `Expected 3, received ${calculateLevel(400)}`
  );
  assert(
    "Level Formula @ 900 XP -> Level 4",
    calculateLevel(900) === 4,
    `Expected 4, received ${calculateLevel(900)}`
  );

  // 2. Level Progress Bounds
  const prog = getLevelProgress(250); // Level 2: floor=100, next=400 => 150/300 = 50%
  assert(
    "Level Progress Percent @ 250 XP -> 50%",
    prog.level === 2 &&
      prog.levelFloorXP === 100 &&
      prog.nextLevelXP === 400 &&
      prog.progressPercent === 50,
    `lvl=${prog.level}, floor=${prog.levelFloorXP}, next=${prog.nextLevelXP}, pct=${prog.progressPercent}%`
  );

  // 3. XP Constants Verification
  assert(
    "XP Reward Constants (+100 / +50 / +25)",
    XP_REWARDS.COMPLETE_MODULE === 100 &&
      XP_REWARDS.DEEP_RESEARCH_CURRICULUM === 50 &&
      XP_REWARDS.SAVE_NOTES_200_WORDS === 25,
    `Module=${XP_REWARDS.COMPLETE_MODULE}, Research=${XP_REWARDS.DEEP_RESEARCH_CURRICULUM}, Notes=${XP_REWARDS.SAVE_NOTES_200_WORDS}`
  );

  // 4. Streak Tracking & Daily Counter Rollover Logic
  const baseStats: UserStats = {
    streakCount: 5,
    lastActiveDate: "2026-10-23",
    currentXP: 500,
    todayXP: 100,
    level: 3,
    completedModulesCount: 2,
    dailyGoalMinutes: 120,
    todayMinutesSpent: 45,
    totalMinutesStudied: 320,
    focusSprintsToday: 3,
    totalFocusSprints: 12,
    flashcardsReviewedToday: 8,
    totalFlashcardsReviewed: 40,
    weeklyMinutes: {},
  };

  const sameDay = evaluateStreakOnLoad(baseStats, "2026-10-23");
  assert(
    "Streak Same Day -> Maintains Streak & Daily Counters",
    sameDay.streakCount === 5 &&
      sameDay.todayMinutesSpent === 45 &&
      sameDay.focusSprintsToday === 3 &&
      sameDay.flashcardsReviewedToday === 8,
    `streak=${sameDay.streakCount}, mins=${sameDay.todayMinutesSpent}, sprints=${sameDay.focusSprintsToday}`
  );

  const nextDay = evaluateStreakOnLoad(baseStats, "2026-10-24");
  assert(
    "Streak Next Day (+1d) -> Increments to 6 & Resets Daily Counters while Keeping Totals",
    nextDay.streakCount === 6 &&
      nextDay.lastActiveDate === "2026-10-24" &&
      nextDay.todayMinutesSpent === 0 &&
      nextDay.focusSprintsToday === 0 &&
      nextDay.flashcardsReviewedToday === 0 &&
      nextDay.totalFocusSprints === 12 &&
      nextDay.totalFlashcardsReviewed === 40,
    `streak=${nextDay.streakCount}, dailySprints=${nextDay.focusSprintsToday}, lifetimeSprints=${nextDay.totalFocusSprints}`
  );

  const missedDays = evaluateStreakOnLoad(baseStats, "2026-10-26");
  assert(
    "Streak Gap (>1d) -> Resets Streak to 1",
    missedDays.streakCount === 1 && missedDays.lastActiveDate === "2026-10-26",
    `streak=${missedDays.streakCount}, date=${missedDays.lastActiveDate}`
  );

  // 5. Clean-Slate Production Workspace Initialization
  const blank = createBlankStudyOSState({
    handle: "maya.bio",
    academicTrack: "Molecular Biology",
    dailyGoalMinutes: 90,
  });
  const sanitizedBlank = sanitizeState(blank, blank);
  assert(
    "Clean-Slate Workspace -> 0 XP, 0 Courses, Valid Sync ID & Tracked Init Log",
    sanitizedBlank.stats.currentXP === 0 &&
      sanitizedBlank.stats.level === 1 &&
      sanitizedBlank.courses.length === 0 &&
      sanitizedBlank.modules.length === 0 &&
      sanitizedBlank.flashcards.length === 0 &&
      /^ws_[a-zA-Z0-9]+$/.test(sanitizedBlank.workspaceSyncId) &&
      sanitizedBlank.activityLog.length === 1 &&
      getProfileInitials(sanitizedBlank.settings.studentHandle) === "MB",
    `syncId=${sanitizedBlank.workspaceSyncId}, xp=${sanitizedBlank.stats.currentXP}, courses=${sanitizedBlank.courses.length}`
  );

  // 6. Notes Word Counter (>200 words XP gate)
  const sample205Words = Array.from({ length: 205 }, (_, idx) => `token${idx}`).join(" ");
  assert(
    "Markdown Word Counter (>200 words threshold)",
    countWords(sample205Words) === 205 && countWords("# Header\n\nShort note") === 3,
    `205-word count=${countWords(sample205Words)}`
  );

  // 7. Native YouTube Embed URL Parser
  const ytWatch = parseYouTubeUrl("https://www.youtube.com/watch?v=64Zp3tzNbpE", 120);
  const ytShort = parseYouTubeUrl("https://youtu.be/aZjYr87r1b8");
  assert(
    "YouTube Watch & Short URL -> Clean Embed Iframe URL",
    ytWatch.isYouTube &&
      ytWatch.videoId === "64Zp3tzNbpE" &&
      Boolean(ytWatch.embedUrl?.includes("youtube.com/embed/64Zp3tzNbpE")) &&
      Boolean(ytWatch.embedUrl?.includes("start=120")) &&
      ytShort.videoId === "aZjYr87r1b8",
    `embed=${ytWatch.embedUrl}`
  );

  // 8. Subject-Agnostic Curriculum + Notes Payload Normalization
  const normalized = normalizeCurriculumPayload(
    {
      courseTitle: "Organic Chemistry Stereochemistry",
      courseCode: "chem-210",
      category: "Chemistry",
      tags: ["#Organic Chemistry", "stereochemistry"],
      executiveSummary: "Personalized curriculum built around uploaded lecture notes.",
      units: [
        {
          title: "Chirality & Enantiomers",
          estimatedHours: 3.5,
          keyConcepts: ["R/S Configuration", "Cahn-Ingold-Prelog"],
          searchQueryForVideo: "Organic Chemistry Chirality Enantiomers Lecture",
          briefOverview: "3D molecular stereocenters and optical activity.",
        },
      ],
      flashcards: [
        {
          unitIndex: 0,
          question: "How do you assign R vs S priority?",
          answer: "Rank substituents by atomic number using Cahn-Ingold-Prelog rules.",
        },
      ],
      milestones: [
        {
          title: "Complete Stereocenter Practice Set",
          subtitle: "15 R/S molecules",
          dueInDays: 4,
          urgency: "high",
        },
      ],
      studyBlocks: [
        {
          timeRange: "18:00 - 19:00",
          durationMinutes: 60,
          title: "Chirality Vault Notes & Flashcards",
          subtitle: "CHEM-210 · Unit 1",
        },
      ],
    },
    "Organic Chemistry"
  );
  assert(
    "Notes Curriculum Normalization (Units, Tags, Flashcards, Milestones & Blocks)",
    normalized.courseCode === "CHEM-210" &&
      normalized.units.length === 1 &&
      normalized.flashcards.length === 1 &&
      normalized.milestones.length === 1 &&
      normalized.studyBlocks.length === 1 &&
      normalized.tags.includes("organic-chemistry") &&
      Boolean(normalized.units[0].starterNotesMarkdown?.includes("Chirality")),
    `code=${normalized.courseCode}, cards=${normalized.flashcards.length}, milestones=${normalized.milestones.length}`
  );

  // 9. CourseDatabase Tagging & Filtering System Tests
  const normList = normalizeCourseTags(["#Distributed Systems", "C++", "distributed_systems", "  "]);
  assert(
    "Course Tag Normalization & Deduplication",
    normalizeCourseTag("#Core Systems") === "core-systems" &&
      normList.length === 2 &&
      normList[0] === "distributed-systems" &&
      normList[1] === "c++",
    `normalized=[${normList.join(", ")}]`
  );

  const sampleCourses: Course[] = [
    {
      id: "c1",
      code: "CS-401",
      title: "Distributed Systems",
      category: "Systems",
      tags: ["systems", "consensus"],
      totalUnits: 4,
      completedUnits: 2,
      createdAt: "2026-10-01T00:00:00.000Z",
    },
    {
      id: "c2",
      code: "CS-445",
      title: "Database Engines",
      category: "Databases",
      tags: ["systems", "databases"],
      totalUnits: 3,
      completedUnits: 1,
      createdAt: "2026-10-02T00:00:00.000Z",
    },
    {
      id: "c3",
      code: "ECE-382",
      title: "Computer Architecture",
      category: "Hardware",
      tags: ["hardware", "risc-v"],
      totalUnits: 4,
      completedUnits: 1,
      createdAt: "2026-10-03T00:00:00.000Z",
    },
  ];

  const tagCounts = collectCourseTagCounts(sampleCourses);
  const anyMatch = filterCoursesByTags(sampleCourses, ["consensus", "hardware"], "any");
  const allMatch = filterCoursesByTags(sampleCourses, ["systems", "databases"], "all");

  assert(
    "Course Tag Counts & Match Any / Match All Filtering",
    tagCounts[0]?.tag === "systems" &&
      tagCounts[0]?.count === 2 &&
      anyMatch.length === 2 &&
      allMatch.length === 1 &&
      allMatch[0]?.code === "CS-445",
    `topTag=${tagCounts[0]?.tag}(${tagCounts[0]?.count}), any=${anyMatch.length}, all=${allMatch.length}`
  );

  // 10. Global Keyboard Shortcut Manager (Cmd/Ctrl + 1-7 Navigation & Study Actions)
  const nav1 = matchShortcutAction({ key: "1", code: "Digit1", metaKey: true });
  const nav3 = matchShortcutAction({ key: "3", code: "Digit3", ctrlKey: true });
  const nav7 = matchShortcutAction({ key: "7", code: "Digit7", metaKey: true });
  const focusAct = matchShortcutAction({ key: "f", code: "KeyF", metaKey: true, shiftKey: true });
  const newNoteAct = matchShortcutAction({ key: "n", code: "KeyN", altKey: true });
  const autoResAct = matchShortcutAction({ key: "r", code: "KeyR", ctrlKey: true, shiftKey: true });
  const copyReserved = eventToShortcutChord({ key: "c", code: "KeyC", metaKey: true });
  const questionIgnoredInInput = matchShortcutAction({ key: "?", code: "Slash", shiftKey: true }, {}, true);

  assert(
    "Global Keyboard Shortcuts (Cmd/Ctrl + 1-9 Navigation, Focus, New Note & Input Safety)",
    nav1 === "nav_dashboard" &&
      nav3 === "nav_vault" &&
      nav7 === "nav_flashcards" &&
      matchShortcutAction({ key: "9", code: "Digit9", metaKey: true }) === "nav_simulation" &&
      focusAct === "action_focus_session" &&
      newNoteAct === "action_new_note" &&
      autoResAct === "action_auto_research" &&
      copyReserved === null &&
      questionIgnoredInInput === null &&
      formatShortcutBadge("Mod+1", true) === "⌘1" &&
      formatShortcutBadge("Mod+1", false) === "Ctrl+1",
    `nav1=${nav1}, nav3=${nav3}, nav7=${nav7}, focus=${focusAct}, newNote=${newNoteAct}`
  );

  // 11. 4th-Order Runge-Kutta (RK4) Conservation of Mechanical Energy (Zero-Drag Limit)
  const conservativeEnv: RK4EnvironmentParams = {
    massKg: 2.0,
    gravityMs2: 9.81,
    dragBeta: 0,
    lorentzOmega: 0,
    springOmegaSq: 0,
    wells: [{ x: 10, y: 2, z: -6, strength: 18 }],
  };
  const kinConservative: ProjectileKinematicState = {
    x: 0,
    y: 12,
    z: 0,
    vx: 18,
    vy: 14,
    vz: -9,
  };
  const e0 = computeMechanicalInvariants(kinConservative, conservativeEnv, 0).totalMechanicalJoules;
  for (let step = 0; step < 360; step++) {
    stepRK4InPlace(kinConservative, 1 / 120, conservativeEnv);
  }
  const eFinal = computeMechanicalInvariants(
    kinConservative,
    conservativeEnv,
    0
  ).totalMechanicalJoules;
  const relEnergyDrift = Math.abs(eFinal - e0) / Math.max(1e-6, Math.abs(e0));

  assert(
    "RK4 120Hz Symplectic-Grade Energy Accuracy (|ΔE/E0| < 1e-4 in Vacuum + Potential Well)",
    relEnergyDrift < 1e-4,
    `E0=${e0.toFixed(4)} J, E_T=${eFinal.toFixed(4)} J, relDrift=${relEnergyDrift.toExponential(2)}`
  );

  // 12. Dissipative Quadratic Drag Strictly Reduces Mechanical Energy
  const dissipativeEnv: RK4EnvironmentParams = {
    ...conservativeEnv,
    dragBeta: 0.025,
  };
  const kinDrag: ProjectileKinematicState = {
    x: 0,
    y: 12,
    z: 0,
    vx: 18,
    vy: 14,
    vz: -9,
  };
  for (let step = 0; step < 240; step++) {
    stepRK4InPlace(kinDrag, 1 / 120, dissipativeEnv);
  }
  const eDragFinal = computeMechanicalInvariants(kinDrag, dissipativeEnv, 0).totalMechanicalJoules;
  assert(
    "Nonlinear Quadratic Drag Monotonically Dissipates Mechanical Energy",
    eDragFinal < e0,
    `E0=${e0.toFixed(1)} J -> E_drag=${eDragFinal.toFixed(1)} J`
  );

  // 13. API-Agnostic First-Principles Integrative Compiler (Curriculum + 3D Lab Blueprint)
  const detCurriculum = synthesizeDeterministicCurriculum({
    topic: "B+ Trees, Slotted Pages & Disk Seek Latency",
    targetUnitCount: 5,
    rawNotesText: "## Amortized Split Cost\nUsing **Branching Factor** and **Hessian Curvature**.",
  });
  const labBlueprint = compileIntegrativeLabBlueprint({
    topic: "Charged Particle Cyclotron Motion in Magnetic Fields",
  });
  const liveConcepts = extractNoteConcepts(
    "# Lagrangian Mechanics\nDeriving **Euler-Lagrange Equations** and **Noether Symmetry**.",
    undefined,
    "Classical Mechanics"
  );

  assert(
    "API-Agnostic Integrative Compiler (5-Unit Curriculum, 5-Stage 3D Blueprint & Live Concept Extraction)",
    detCurriculum.units.length === 5 &&
      (detCurriculum.flashcards?.length || 0) >= 5 &&
      labBlueprint.archetype === "electromagnetic_lorentz" &&
      labBlueprint.stages.length === 5 &&
      liveConcepts.includes("Lagrangian Mechanics") &&
      liveConcepts.includes("Euler-Lagrange Equations"),
    `units=${detCurriculum.units.length}, archetype=${labBlueprint.archetype}, concepts=[${liveConcepts
      .slice(0, 3)
      .join(", ")}]`
  );

  // 14. Legacy v1/v2 Workspace Non-Destructive Migration & Syllabus Archive Protection
  const fixedNow = new Date("2026-10-24T12:00:00.000Z");
  const legacyRawPayload: Partial<StudyOSState> = {
    workspaceSyncId: "ws_shoeyidc5qn2oi",
    courses: [
      {
        id: "course-legacy-1",
        code: "PHYS-301",
        title: "Analytical Mechanics",
        category: "Physics",
        tags: ["mechanics", "lagrangian"],
        totalUnits: 2,
        completedUnits: 1,
        createdAt: "2026-09-01T00:00:00.000Z",
      },
    ],
    modules: [
      {
        id: "mod-active-1",
        courseId: "course-legacy-1",
        title: "Hamiltonian Phase Space",
        status: "Mastered",
        videoLink: "",
        estimatedHours: 4,
        studiedMinutes: 600,
        tags: ["hamiltonian"],
        keyConcepts: ["Symplectic Form", "Liouville Theorem"],
        notesMarkdown: sample205Words + " " + sample205Words, // >400 words
        resources: [],
        bookmarks: [],
        masteredXpAwarded: true,
        notesXpAwarded: true,
        updatedAt: "2026-10-01T00:00:00.000Z",
      },
      {
        id: "mod-archived-2",
        courseId: "course-legacy-1",
        title: "Deprecated Old Syllabus Appendix",
        status: "To Do",
        archived: true,
        videoLink: "",
        estimatedHours: 2,
        studiedMinutes: 30,
        tags: [],
        notesMarkdown: "Historical notes kept safely on archive.",
        resources: [],
        bookmarks: [],
        masteredXpAwarded: false,
        notesXpAwarded: false,
        updatedAt: "2026-09-15T00:00:00.000Z",
      },
    ],
    flashcards: [
      {
        id: "fc-1",
        courseId: "course-legacy-1",
        moduleId: "mod-active-1",
        question: "What does Liouville's theorem state?",
        answer: "Phase-space volume is conserved along Hamiltonian trajectories.",
        box: 2,
        reviewCount: 3,
        lastReviewedAt: "2026-10-10T00:00:00.000Z",
      },
    ],
  };

  const migratedState = sanitizeState(legacyRawPayload, blank);
  const syncedCourses = syncCoursesWithModules(migratedState.courses, migratedState.modules);

  assert(
    "Legacy v1/v2 Non-Destructive Migration & Non-Destructive Syllabus Archiving",
    migratedState.schemaVersion === 3 &&
      migratedState.workspaceSyncId === "ws_shoeyidc5qn2oi" &&
      migratedState.courses.length === 1 &&
      migratedState.modules.length === 2 &&
      migratedState.modules[1].notesMarkdown.includes("Historical notes") &&
      syncedCourses[0].totalUnits === 1 &&
      syncedCourses[0].completedUnits === 1 &&
      Array.isArray(migratedState.tasks) &&
      Array.isArray(migratedState.assessments) &&
      Array.isArray(migratedState.assessmentAttempts) &&
      Array.isArray(migratedState.studySessions) &&
      Array.isArray(migratedState.learningEvents) &&
      Array.isArray(migratedState.academicProfile.skills),
    `schema=v${migratedState.schemaVersion}, activeUnits=${syncedCourses[0].totalUnits}, preservedModules=${migratedState.modules.length}`
  );

  // 15. Anti-Inflation Mastery Guard (Timers + Long Notes + Manual "Mastered" Status != Verified Mastery)
  const unverifiedMastery = computeTopicMastery("mod-active-1", migratedState, fixedNow);
  assert(
    "Anti-Inflation Mastery Guard (0 Attempts -> 'Not enough evidence yet.' Despite 600m & 'Mastered' Status)",
    unverifiedMastery.attemptCount === 0 &&
      unverifiedMastery.level === "insufficient_evidence" &&
      unverifiedMastery.label === "Not enough evidence yet." &&
      unverifiedMastery.evidenceScore === null &&
      unverifiedMastery.needsRevision === true,
    `level=${unverifiedMastery.level}, label="${unverifiedMastery.label}", score=${unverifiedMastery.evidenceScore}`
  );

  // 16. Append-Only Assessment Attempts, Baseline/Latest Delta & Delayed-Recall Verified Mastery
  const attempt1Baseline: AssessmentAttempt = {
    id: "att-1",
    courseId: "course-legacy-1",
    moduleId: "mod-active-1",
    title: "Hamiltonian Diagnostic Quiz",
    kind: "quiz",
    difficulty: "standard",
    score: 5,
    maxScore: 10,
    percentage: 50,
    selfConfidence: 5, // Overconfident baseline
    errorCategories: ["conceptual", "calculation"],
    isDelayedRecall: false,
    attemptedAt: "2026-10-10T10:00:00.000Z",
  };
  const attempt2Practice: AssessmentAttempt = {
    id: "att-2",
    courseId: "course-legacy-1",
    moduleId: "mod-active-1",
    title: "Hamiltonian Practice Set",
    kind: "practice_set",
    difficulty: "rigorous",
    score: 9,
    maxScore: 10,
    percentage: 90,
    selfConfidence: 4,
    errorCategories: [],
    isDelayedRecall: false,
    attemptedAt: "2026-10-18T10:00:00.000Z",
  };
  const attempt3Delayed: AssessmentAttempt = {
    id: "att-3",
    courseId: "course-legacy-1",
    moduleId: "mod-active-1",
    title: "Hamiltonian Delayed Recall Check",
    kind: "delayed_recall",
    difficulty: "rigorous",
    score: 19,
    maxScore: 20,
    percentage: 95,
    selfConfidence: 4,
    errorCategories: [],
    isDelayedRecall: true,
    attemptedAt: "2026-10-23T10:00:00.000Z",
  };

  const stateAfterAtt1: StudyOSState = {
    ...migratedState,
    assessmentAttempts: [attempt1Baseline],
  };
  const masteryAfter1 = computeTopicMastery("mod-active-1", stateAfterAtt1, fixedNow);

  const stateAfter3Attempts: StudyOSState = {
    ...migratedState,
    assessmentAttempts: [attempt1Baseline, attempt2Practice, attempt3Delayed],
  };
  const masteryAfter3 = computeTopicMastery("mod-active-1", stateAfter3Attempts, fixedNow);

  assert(
    "Append-Only Attempts & Empirical Mastery Progression (Emerging 50% -> Verified Mastery +45% Delta)",
    masteryAfter1.level === "emerging" &&
      masteryAfter3.attemptCount === 3 &&
      masteryAfter3.baselineScore === 50 &&
      masteryAfter3.latestScore === 95 &&
      masteryAfter3.deltaScore === 45 &&
      masteryAfter3.delayedRecallVerified === true &&
      masteryAfter3.level === "verified_mastery",
    `att1=${masteryAfter1.level}(${masteryAfter1.evidenceScore}%), att3=${masteryAfter3.level}(${masteryAfter3.evidenceScore}%, delta=+${masteryAfter3.deltaScore}%)`
  );

  // 17. Record Correction / Deletion Recomputes Mastery Cleanly
  const correctedAtt3: AssessmentAttempt = {
    ...attempt3Delayed,
    score: 11,
    maxScore: 20,
    percentage: 55,
    errorCategories: ["calculation"],
    correctedAt: "2026-10-24T11:00:00.000Z",
  };
  const stateAfterCorrection: StudyOSState = {
    ...migratedState,
    assessmentAttempts: [attempt1Baseline, attempt2Practice, correctedAtt3],
  };
  const masteryAfterCorrection = computeTopicMastery("mod-active-1", stateAfterCorrection, fixedNow);
  assert(
    "Record Correction Recomputes Topic Mastery Accurately",
    masteryAfterCorrection.level !== "verified_mastery" &&
      masteryAfterCorrection.latestScore === 55 &&
      masteryAfterCorrection.deltaScore === 5 &&
      masteryAfterCorrection.needsRevision === true,
    `correctedLevel=${masteryAfterCorrection.level}, latest=${masteryAfterCorrection.latestScore}%, delta=+${masteryAfterCorrection.deltaScore}%`
  );

  // 18. Skill Self-Confidence vs. Assessed Evidence Strict Separation
  const sampleSkill: SkillRecord = {
    id: "skill-symplectic",
    name: "Hamiltonian & Symplectic Analysis",
    category: "Mathematical Physics",
    selfConfidence: 5,
    linkedCourseIds: ["course-legacy-1"],
    linkedModuleIds: ["mod-active-1"],
    updatedAt: "2026-10-24T00:00:00.000Z",
  };
  const skillZeroEvidence = computeSkillEvidence(sampleSkill, migratedState, fixedNow);
  const skillBackedEvidence = computeSkillEvidence(sampleSkill, stateAfter3Attempts, fixedNow);

  assert(
    "Skill Evidence Separation (5/5 Self-Confidence w/ 0 Attempts -> 'Self-Reported Only' vs >=2 Attempts -> 'Evidence-Backed (Internal)')",
    skillZeroEvidence.verificationBadge === "Self-Reported Only" &&
      skillZeroEvidence.assessedScore === null &&
      skillBackedEvidence.verificationBadge === "Evidence-Backed (Internal)" &&
      skillBackedEvidence.attemptCount === 3 &&
      (skillBackedEvidence.assessedScore || 0) > 75,
    `zeroAtt="${skillZeroEvidence.verificationBadge}", threeAtt="${skillBackedEvidence.verificationBadge}" (avg=${skillBackedEvidence.assessedScore}%)`
  );

  // 19. Idempotent Study Session & Learning Event Deduplication
  const sampleSession: StudySessionRecord = {
    id: "sess-1",
    idempotencyKey: "focus-sprint-key-001",
    courseId: "course-legacy-1",
    moduleId: "mod-active-1",
    durationMinutes: 25,
    kind: "pomodoro",
    label: "Pomodoro Sprint",
    startedAt: "2026-10-22T09:00:00.000Z",
    endedAt: "2026-10-22T09:25:00.000Z",
  };
  const firstInsert = appendStudySessionIdempotent([], sampleSession);
  const duplicateInsert = appendStudySessionIdempotent(firstInsert.sessions, {
    ...sampleSession,
    id: "sess-duplicate-retry",
  });

  const sampleEvent: LearningEvent = {
    id: "evt-1",
    idempotencyKey: "evt-key-001",
    timestamp: "2026-10-22T09:25:00.000Z",
    eventType: "session_logged",
    courseId: "course-legacy-1",
    moduleId: "mod-active-1",
    summary: "Completed 25m Pomodoro sprint",
    numericValue: 25,
  };
  const evtFirst = appendLearningEventIdempotent([], sampleEvent);
  const evtDup = appendLearningEventIdempotent(evtFirst.events, sampleEvent);

  assert(
    "Idempotent Session & Learning Event Logging Prevents Duplicate Double-Counting",
    firstInsert.inserted === true &&
      duplicateInsert.inserted === false &&
      duplicateInsert.sessions.length === 1 &&
      evtFirst.inserted === true &&
      evtDup.inserted === false &&
      evtDup.events.length === 1,
    `sessions=${duplicateInsert.sessions.length}, events=${evtDup.events.length}`
  );

  // 20. Spaced-Repetition Scheduling & Deterministic Topic Quiz Generation
  const againIso = computeFlashcardNextReviewIso(1, "again", fixedNow);
  const easyIso = computeFlashcardNextReviewIso(4, "easy", fixedNow);
  const dueCheck = getDueFlashcards(
    [
      { ...migratedState.flashcards[0], id: "due-now", nextReviewAt: "2026-10-20T00:00:00.000Z" },
      { ...migratedState.flashcards[0], id: "future", nextReviewAt: easyIso },
    ],
    fixedNow
  );
  const detQuiz = buildDeterministicTopicQuiz(
    migratedState.modules[0],
    "Analytical Mechanics",
    "rigorous"
  );

  assert(
    "Leitner Spaced Repetition Scheduling & Deterministic Offline Quiz Generator",
    Date.parse(againIso) - fixedNow.getTime() === 10 * 60 * 1000 &&
      Date.parse(easyIso) - fixedNow.getTime() === 12 * 24 * 60 * 60 * 1000 &&
      dueCheck.length === 1 &&
      dueCheck[0].id === "due-now" &&
      detQuiz.questions.length === 3 &&
      detQuiz.source === "notes_derived",
    `dueCount=${dueCheck.length}, quizQuestions=${detQuiz.questions.length}`
  );

  // 21. Time-Window Analytics (7d vs 30d), Error Breakdown & Periodic Review Disclosures
  const richAnalyticsState: StudyOSState = {
    ...stateAfter3Attempts,
    studySessions: [
      sampleSession, // 2 days ago (inside 7d)
      {
        ...sampleSession,
        id: "sess-older",
        idempotencyKey: "focus-sprint-key-002",
        durationMinutes: 50,
        startedAt: "2026-10-05T09:00:00.000Z", // 19 days ago (outside 7d, inside 30d)
        endedAt: "2026-10-05T09:50:00.000Z",
      },
    ],
    tasks: [
      {
        id: "task-overdue-1",
        courseId: "course-legacy-1",
        moduleId: "mod-active-1",
        title: "Problem Set 3: Canonical Transformations",
        kind: "assignment",
        priority: "high",
        status: "todo",
        dueDate: "2026-10-21",
        estimatedMinutes: 90,
        createdAt: "2026-10-10T00:00:00.000Z",
      },
    ],
  };

  const analytics7d = computeGrowthAnalytics(richAnalyticsState, "7d", fixedNow);
  const analytics30d = computeGrowthAnalytics(richAnalyticsState, "30d", fixedNow);
  const emptyWeeklyReview = generatePeriodicReview(migratedState, "weekly", fixedNow);

  assert(
    "Time-Window Growth Analytics (7d vs 30d) & Honest Periodic Review Missing-Data Disclosures",
    analytics7d.studyMinutesInRange === 25 &&
      analytics30d.studyMinutesInRange === 75 &&
      analytics7d.assessmentsInRange === 2 &&
      analytics30d.assessmentsInRange === 3 &&
      analytics30d.overdueTasksCount === 1 &&
      emptyWeeklyReview.missingDataDisclosures.length >= 2,
    `7dMins=${analytics7d.studyMinutesInRange}, 30dMins=${analytics30d.studyMinutesInRange}, disclosures=${emptyWeeklyReview.missingDataDisclosures.length}`
  );

  // 22. Explainable Next-Best-Action Recommendations & Snooze/Dismiss Suppression
  const actionsBeforeFeedback = generateNextBestActions(richAnalyticsState, fixedNow);
  const overdueRec = actionsBeforeFeedback.find((r) => r.category === "overdue_recovery");
  const suppressedState: StudyOSState = {
    ...richAnalyticsState,
    recommendationFeedback: overdueRec
      ? [
          {
            recommendationId: overdueRec.id,
            action: "snoozed",
            actedAt: fixedNow.toISOString(),
            snoozeUntil: "2026-10-25T12:00:00.000Z",
          },
        ]
      : [],
  };
  const actionsAfterSnooze = generateNextBestActions(suppressedState, fixedNow);

  assert(
    "Explainable Next-Best-Action Recommendations & Snooze Suppression",
    Boolean(overdueRec && overdueRec.whySuggested.includes("2026-10-21")) &&
      !actionsAfterSnooze.some((r) => r.id === overdueRec?.id),
    `topAction="${overdueRec?.title}", suppressedAfterSnooze=${!actionsAfterSnooze.some(
      (r) => r.id === overdueRec?.id
    )}`
  );

  // 23. Input Validation Guards for Academic Tasks & Assessment Attempts
  const invalidTaskEmpty = validateAcademicTaskInput({ title: "  ", dueDate: "2026-10-30" });
  const invalidTaskDate = validateAcademicTaskInput({ title: "Midterm", dueDate: "tomorrow" });
  const validTask = validateAcademicTaskInput({
    title: "Midterm Exam",
    dueDate: "2026-11-05",
    estimatedMinutes: 120,
  });
  const invalidAttemptOverflow = validateAssessmentAttemptInput({
    title: "Quiz 1",
    score: 12,
    maxScore: 10,
    selfConfidence: 3,
  });
  const invalidAttemptConf = validateAssessmentAttemptInput({
    title: "Quiz 1",
    score: 8,
    maxScore: 10,
    selfConfidence: 9,
  });
  const validAttempt = validateAssessmentAttemptInput({
    title: "Quiz 1",
    score: 8.5,
    maxScore: 10,
    selfConfidence: 4,
  });

  assert(
    "Input Validation Guards Reject Invalid Scores, Dates & Empty Titles",
    !invalidTaskEmpty.valid &&
      !invalidTaskDate.valid &&
      validTask.valid &&
      !invalidAttemptOverflow.valid &&
      !invalidAttemptConf.valid &&
      validAttempt.valid,
    `overflowErr="${invalidAttemptOverflow.error}", validAttempt=${validAttempt.valid}`
  );

  // 24. Portable Backup Round-Trip, Anki TSV Export & Honest Portfolio Markdown Export
  const portfolioState: StudyOSState = {
    ...richAnalyticsState,
    academicProfile: {
      ...richAnalyticsState.academicProfile,
      fullName: "Ada Lovelace",
      institution: "Analytical Institute",
      skills: [sampleSkill],
    },
  };
  const backupEnvelope = buildPortableBackupPayload(portfolioState);
  const restoredFromBackup = parseImportedBackupJson(JSON.stringify(backupEnvelope), blank);
  const ankiTsv = buildAnkiTsvContent(portfolioState);
  const portfolioMd = buildEvidencePortfolioMarkdown(portfolioState, fixedNow);

  assert(
    "Portable JSON Backup Round-Trip, Anki TSV Export & Evidence-Backed Portfolio Markdown",
    backupEnvelope.schemaVersion === "3.0.0" &&
      restoredFromBackup.assessmentAttempts.length === 3 &&
      restoredFromBackup.academicProfile.fullName === "Ada Lovelace" &&
      ankiTsv.includes("#separator:tab") &&
      ankiTsv.includes("Liouville's theorem") &&
      portfolioMd.includes("Evidence-Backed (Internal)") &&
      portfolioMd.includes("Verified Mastery"),
    `restoredAttempts=${restoredFromBackup.assessmentAttempts.length}, ankiLines=${
      ankiTsv.split("\n").length
    }`
  );

  // 25. RFC 5545 Calendar (.ics) Export for Open Tasks, Exams & Active Study TimeBlocks
  const calendarTestState: StudyOSState = {
    ...portfolioState,
    timeBlocks: [
      {
        id: "tb-active-1",
        timeRange: "14:30 - 15:30",
        title: "Hamiltonian Practice Block",
        subtitle: "Canonical Transformations",
        durationMinutes: 60,
        accent: "primary",
        completed: false,
      },
      {
        id: "tb-done-1",
        timeRange: "08:00 - 08:30",
        title: "Completed Morning Review",
        subtitle: "Done",
        durationMinutes: 30,
        accent: "secondary",
        completed: true,
      },
    ],
  };
  const icsOutput = buildCalendarIcsContent(calendarTestState, fixedNow);

  assert(
    "RFC 5545 Calendar (.ics) Export Includes Open Deadlines, Active Study Blocks & CRLF Framing",
    icsOutput.startsWith("BEGIN:VCALENDAR\r\n") &&
      icsOutput.endsWith("END:VCALENDAR") &&
      icsOutput.includes("DTSTART;VALUE=DATE:20261021") &&
      icsOutput.includes("DTEND;VALUE=DATE:20261022") &&
      icsOutput.includes("SUMMARY:[PHYS-301] ASSIGNMENT: Problem Set 3: Canonical Transformations") &&
      icsOutput.includes("UID:tb-active-1@studyos.local") &&
      !icsOutput.includes("UID:tb-done-1@studyos.local"),
    `icsBytes=${icsOutput.length}, hasCRLF=${icsOutput.includes("\r\n")}`
  );

  // 26. Page/Timestamp-Anchored Vault Highlights & Lecture Transcript Backup Round-Trip
  const vaultHighlightState: StudyOSState = {
    ...portfolioState,
    modules: portfolioState.modules.map((m) =>
      m.id === "mod-active-1"
        ? {
            ...m,
            transcriptNotes: "[12:40] Symplectic 2-forms remain invariant under canonical maps.",
            highlights: [
              {
                id: "hl-pdf-14",
                anchorLabel: "p. 14",
                excerpt: "Poisson brackets commute with canonical coordinate transformations.",
                note: "High-yield midterm derivation",
                createdAt: fixedNow.toISOString(),
                linkedFlashcardId: "fc-hl-1",
                linkedAssessmentId: "asmt-hl-1",
              },
            ],
          }
        : m
    ),
  };
  const hlEnvelope = buildPortableBackupPayload(vaultHighlightState);
  const restoredHlState = parseImportedBackupJson(JSON.stringify(hlEnvelope), blank);
  const restoredMod = restoredHlState.modules.find((m) => m.id === "mod-active-1");

  assert(
    "Vault Highlights (Anchor, Excerpt, Linked Flashcard/Quiz IDs) & Transcripts Survive Backup Round-Trip",
    Boolean(
      restoredMod &&
        restoredMod.transcriptNotes?.includes("[12:40] Symplectic 2-forms") &&
        restoredMod.highlights?.length === 1 &&
        restoredMod.highlights[0].anchorLabel === "p. 14" &&
        restoredMod.highlights[0].linkedFlashcardId === "fc-hl-1" &&
        restoredMod.highlights[0].linkedAssessmentId === "asmt-hl-1"
    ),
    `restoredHighlights=${restoredMod?.highlights?.length ?? 0}, anchor="${
      restoredMod?.highlights?.[0]?.anchorLabel ?? ""
    }"`
  );

  // 27. Growth Timeline Surfaces Skill Updates, Completed Projects, Objectives & Audited Corrections
  const milestoneEvents: LearningEvent[] = [
    {
      id: "ev-skill-1",
      idempotencyKey: "ev-skill-key-1",
      eventType: "skill_updated",
      timestamp: "2026-10-22T10:00:00.000Z",
      summary: "Updated skill Hamiltonian Mechanics (4/5 confidence)",
    },
    {
      id: "ev-proj-1",
      idempotencyKey: "ev-proj-key-1",
      eventType: "project_completed",
      timestamp: "2026-10-23T15:00:00.000Z",
      courseId: "course-legacy-1",
      summary: "Completed portfolio project: Symplectic Integrator Benchmark",
    },
    {
      id: "ev-obj-1",
      idempotencyKey: "ev-obj-key-1",
      eventType: "objective_completed",
      timestamp: "2026-10-24T08:00:00.000Z",
      courseId: "course-legacy-1",
      moduleId: "mod-active-1",
      summary: "Completed learning objective: Prove Liouville invariance",
    },
  ];
  const timelineState: StudyOSState = {
    ...portfolioState,
    learningEvents: milestoneEvents,
  };
  const milestoneTimeline = buildGrowthTimeline(
    timelineState,
    { kind: "milestone", range: "30d" },
    fixedNow
  );
  const fullTimeline = buildGrowthTimeline(
    timelineState,
    { kind: "all", range: "30d" },
    fixedNow
  );

  assert(
    "Growth Timeline Filters & Surfaces Skill, Project & Objective Milestones Alongside Assessments",
    milestoneTimeline.length === 3 &&
      milestoneTimeline.some((e) => e.id === "tl-ev-ev-skill-1") &&
      milestoneTimeline.some((e) => e.id === "tl-ev-ev-proj-1") &&
      milestoneTimeline.some((e) => e.id === "tl-ev-ev-obj-1") &&
      fullTimeline.some((e) => e.kind === "assessment" && e.deltaFromPrevious === 40),
    `milestones=${milestoneTimeline.length}, totalTimelineEntries=${fullTimeline.length}`
  );

  // 28. LearningOS AppRegistry, Core-Protection Guard & Opt-In MCP Read-Only Bridge
  const { appRegistry, capabilityRegistry, mcpBridge } = createDefaultLearningOSHost();
  capabilityRegistry.register({
    id: "curriculum.read",
    description: "Read curriculum tree",
    requiredScope: "read",
    readOnly: true,
    handler: async () => ({ result: { ok: true } }),
  });
  const coreDisableDenied = appRegistry.disableApp("dashboard").ok === false;
  const optDisableAllowed = appRegistry.disableApp("revision").ok === true;
  mcpBridge.setEnabled(false);
  const mcpOffTools = mcpBridge.listExposedTools().length === 0;
  mcpBridge.setEnabled(true);
  const mcpOnTools = mcpBridge.listExposedTools().includes("curriculum.read");
  const mcpWriteNotExposed = !mcpBridge.listExposedTools().includes("curriculum.write" as any);

  assert(
    "LearningOS AppRegistry Protects Core Modules & MCP Bridge Enforces Opt-In Read-Only Allowlist",
    DEFAULT_LEARNINGOS_APP_MANIFESTS.length >= 12 &&
      coreDisableDenied &&
      optDisableAllowed &&
      mcpOffTools &&
      mcpOnTools &&
      mcpWriteNotExposed,
    `manifests=${DEFAULT_LEARNINGOS_APP_MANIFESTS.length}, coreProtected=${coreDisableDenied}, writeBlocked=${mcpWriteNotExposed}`
  );

  // 29. Captions-First VTT/SRT Parser, Duplicate Rollover Normalizer & Zero-Permanent-Media Capability
  const sampleVtt = `WEBVTT

00:00:01.000 --> 00:00:04.500
<b>Population inversion</b> requires N2 > N1 in the gain medium.

00:00:04.500 --> 00:00:08.000
<b>Population inversion</b> requires N2 > N1 in the gain medium.

00:00:08.000 --> 00:00:12.250
Stimulated emission produces coherent photons in phase.`;
  const parsedVtt = parseVttOrSrtTranscript(sampleVtt);
  const normVtt1 = normalizeTranscriptSegments({
    cues: parsedVtt,
    transcriptId: "tx-test-1",
    resourceId: "res-test-1",
  });
  const normVtt2 = normalizeTranscriptSegments({
    cues: parseVttOrSrtTranscript(sampleVtt),
    transcriptId: "tx-test-1",
    resourceId: "res-test-1",
  });
  const hash1 = computeDeterministicHash(normVtt1.map((s) => s.text).join("\n"));
  const hash2 = computeDeterministicHash(normVtt2.map((s) => s.text).join("\n"));
  const ytCaps = getDefaultSourceCapabilities("youtube");

  assert(
    "Captions-First VTT Parser Strips Markup, Deduplicates Rollover Cues & Prohibits Permanent Media",
    detectResourceSourceType("https://www.youtube.com/watch?v=dQw4w9WgXcQ") === "youtube" &&
      ytCaps.permanentDownload === false &&
      normVtt1.length === 2 &&
      !normVtt1[0].text.includes("<b>") &&
      hash1 === hash2,
    `segments=${normVtt1.length}, hash=${hash1}, permanentDownload=${ytCaps.permanentDownload}`
  );

  // 30. FSRS-Compatible ReviewScheduler & Anki TSV Import Round-Trip
  const fsrs = new FsrsLiteScheduler();
  const fsrsInit = fsrs.createInitialState("fc-1", fixedNow);
  const fsrsGood1 = fsrs.schedule(fsrsInit, "good", fixedNow);
  const fsrsGood2 = fsrs.schedule(fsrsGood1, "easy", new Date("2026-10-25T12:00:00.000Z"));
  const fsrsLapse = fsrs.schedule(fsrsGood2, "again", new Date("2026-10-30T12:00:00.000Z"));
  const importedAnki = parseAnkiTsvImport(ankiTsv, "course-legacy-1");

  assert(
    "FSRS ReviewScheduler Updates Stability/Difficulty/Lapses & Anki TSV Import Parses Exported Deck",
    fsrsGood1.repetitions === 1 &&
      fsrsGood2.stability > fsrsGood1.stability &&
      fsrsLapse.lapses === 1 &&
      fsrsLapse.cardState === "learning" &&
      importedAnki.length === 1 &&
      importedAnki[0].question.includes("Liouville's theorem"),
    `S1=${fsrsGood1.stability}, S2=${fsrsGood2.stability}, lapses=${fsrsLapse.lapses}, importedAnki=${importedAnki.length}`
  );

  // 31. OpenMAIC InteractiveLesson DSL Compiler & Default-Deny External Web Host Allowlist
  const compiledLesson = compileInteractiveLessonArtifact({
    topicTitle: "Unit 1 — Laser & Population Inversion",
    resources: [],
    segments: normVtt1,
    concepts: [],
    notesMarkdown: "# Laser Action\nPopulation inversion requires optical pumping.",
  });
  const lessonValidation = validateInteractiveLessonArtifact(compiledLesson);
  const allowedOrigin = evaluateExternalWebUrl("https://en.wikipedia.org/wiki/Laser");
  const blockedOrigin = evaluateExternalWebUrl(
    "https://untrusted-tracker-adware.example.com/app"
  );

  assert(
    "OpenMAIC Lesson DSL Enforces Zero-Permanent-Video & External Web Host Blocks Unapproved Origins",
    lessonValidation.valid &&
      compiledLesson.permanentVideoGenerated === false &&
      allowedOrigin.allowed === true &&
      blockedOrigin.allowed === false,
    `sections=${compiledLesson.sections.length}, permanentVideo=${compiledLesson.permanentVideoGenerated}, blocked=${!blockedOrigin.allowed}`
  );

  // 32. Weekly Focus Hours Visualization Calculation from PomodoroFocusView Session History
  const focusRefDate = new Date(2026, 9, 31, 18, 0, 0); // Oct 31, 2026 local
  const prevDayDate = new Date(2026, 9, 29, 15, 0, 0); // Oct 29, 2026 local (in 7d)
  const priorWeekDate = new Date(2026, 9, 21, 14, 0, 0); // Oct 21, 2026 local (prior 7d)

  const sampleFocusHistory = [
    {
      id: "ss-pomo-1",
      idempotencyKey: "pomo:1",
      courseId: "course-legacy-1",
      durationMinutes: 50,
      kind: "pomodoro" as const,
      label: "Pomodoro Focus Sprint Completed",
      startedAt: focusRefDate.toISOString(),
      endedAt: focusRefDate.toISOString(),
    },
    {
      id: "ss-pomo-2",
      idempotencyKey: "pomo:2",
      courseId: "course-legacy-1",
      durationMinutes: 40,
      kind: "pomodoro" as const,
      label: "Pomodoro Focus Sprint Completed",
      startedAt: focusRefDate.toISOString(),
      endedAt: focusRefDate.toISOString(),
    },
    {
      id: "ss-manual-3",
      idempotencyKey: "manual:3",
      durationMinutes: 30,
      kind: "manual" as const,
      label: "Manual Deep Work Log",
      startedAt: prevDayDate.toISOString(),
      endedAt: prevDayDate.toISOString(),
    },
    {
      id: "ss-prior-4",
      idempotencyKey: "pomo:4",
      courseId: "course-legacy-1",
      durationMinutes: 60,
      kind: "pomodoro" as const,
      label: "Prior Week Sprint",
      startedAt: priorWeekDate.toISOString(),
      endedAt: priorWeekDate.toISOString(),
    },
  ];

  const emptyFocusSummary = computeWeeklyFocusHoursSummary([], {
    dailyGoalMinutes: 120,
    referenceDate: focusRefDate,
  });
  const allFocusSummary = computeWeeklyFocusHoursSummary(sampleFocusHistory, {
    dailyGoalMinutes: 120,
    courses: portfolioState.courses,
    scope: "all",
    referenceDate: focusRefDate,
  });
  const pomoOnlySummary = computeWeeklyFocusHoursSummary(sampleFocusHistory, {
    dailyGoalMinutes: 120,
    courses: portfolioState.courses,
    scope: "pomodoro",
    referenceDate: focusRefDate,
  });

  assert(
    "Weekly Focus Hours Summary Calculates Daily Hours, Pomodoro-Only Scope, WoW Delta & Course Share from Session History",
    emptyFocusSummary.totalHours === 0 &&
      emptyFocusSummary.days.length === 7 &&
      allFocusSummary.totalHours === 2 &&
      allFocusSummary.pomodoroHours === 1.5 &&
      allFocusSummary.otherHours === 0.5 &&
      allFocusSummary.previousWeekHours === 1 &&
      allFocusSummary.weekOverWeekDeltaHours === 1 &&
      allFocusSummary.sprintCount === 2 &&
      allFocusSummary.activeDaysCount === 2 &&
      allFocusSummary.courseBreakdown.length === 2 &&
      pomoOnlySummary.totalHours === 1.5 &&
      pomoOnlySummary.otherHours === 0 &&
      formatFocusHoursLabel(allFocusSummary.pomodoroHours) === "1.5h",
    `allHours=${allFocusSummary.totalHours}h, pomoOnly=${pomoOnlySummary.totalHours}h, wowDelta=+${allFocusSummary.weekOverWeekDeltaHours}h`
  );

  const passed = results.filter((r) => r.passed).length;
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
  };
}

// Allow CLI execution via `npm test` / `tsx src/lib/gamification.test.ts`
const isNodeDirectRun =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  process.argv.some((arg) => arg.includes("gamification.test"));

if (isNodeDirectRun) {
  const report = runAllUnitTests();
  console.log(`\nStudy OS Unit Test Suite: ${report.passed}/${report.total} assertions passed`);
  for (const r of report.results) {
    console.log(`  [${r.passed ? "PASS" : "FAIL"}] ${r.name} — ${r.detail}`);
  }
  if (report.failed > 0) {
    process.exit(1);
  }
}
