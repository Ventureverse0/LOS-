export enum AppView {
  DASHBOARD = "dashboard",
  COURSES = "courses",
  VAULT = "vault",
  ASSESSMENTS = "assessments",
  GROWTH = "growth",
  PROFILE = "profile",
  GROKOPEDIA = "grokopedia",
  SIMULATION = "simulation",
  TERMINAL = "terminal",
  POMODORO = "pomodoro",
  FLASHCARDS = "flashcards",
  SETTINGS = "settings",
  LEARNING_OS = "learning_os",
}

export type ShortcutActionId =
  | "nav_dashboard"
  | "nav_courses"
  | "nav_vault"
  | "nav_grokopedia"
  | "nav_terminal"
  | "nav_pomodoro"
  | "nav_flashcards"
  | "nav_settings"
  | "nav_simulation"
  | "nav_assessments"
  | "nav_growth"
  | "nav_profile"
  | "nav_learning_os"
  | "action_command_palette"
  | "action_focus_session"
  | "action_new_note"
  | "action_auto_research"
  | "action_shortcut_help";

export type ModuleStatus = "To Do" | "In Progress" | "Mastered";

export type LearnerLevel = "Beginner" | "Intermediate" | "Advanced";

export interface UploadedNoteDocument {
  name: string;
  mimeType: string;
  sizeBytes: number;
  /** UTF-8 text content for .md, .txt, .json, .csv, and code files */
  textContent?: string;
  /** Base64-encoded binary content (without data: URI prefix) for PDFs and images */
  base64Data?: string;
}

export type ActivityEventType =
  | "workspace_created"
  | "course_created"
  | "curriculum_generated"
  | "notes_uploaded"
  | "module_mastered"
  | "notes_saved"
  | "focus_session"
  | "flashcard_review"
  | "milestone_completed"
  | "auto_research"
  | "auto_tracked_study"
  | "physics_lab_completed"
  | "assessment_completed"
  | "task_completed"
  | "record_corrected"
  | "skill_updated"
  | "review_generated";

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  type: ActivityEventType;
  title: string;
  detail?: string;
  xpEarned: number;
}

export interface LearnerProfileMeta {
  id: string;
  workspaceSyncId: string;
  handle: string;
  academicTrack: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserSettings {
  preferredProvider: "gemini";
  selectedModel: "gemini-3.8-flash" | "gemini-3.1-flash-lite";
  temperature: number;
  topP: number;
  theme: "dark";
  soundEnabled: boolean;
  focusLockdown: boolean;
  autonomousAgentEnabled: boolean;
  customShortcuts?: Partial<Record<ShortcutActionId, string>>;
  studentHandle: string;
  academicTrack: string;
}

export interface UserStats {
  streakCount: number;
  lastActiveDate: string; // YYYY-MM-DD
  currentXP: number;
  todayXP: number;
  level: number;
  completedModulesCount: number;
  dailyGoalMinutes: number;
  todayMinutesSpent: number;
  totalMinutesStudied: number;
  focusSprintsToday: number;
  totalFocusSprints: number;
  flashcardsReviewedToday: number;
  totalFlashcardsReviewed: number;
  autoFetchedModulesCount?: number;
  shortcutTriggersCount?: number;
  weeklyMinutes: Record<string, number>; // YYYY-MM-DD -> minutes
}

export interface Course {
  id: string;
  code: string;
  title: string;
  category: string;
  instructor?: string;
  deadlineLabel?: string;
  semester?: string;
  academicYear?: string;
  credits?: number;
  archived?: boolean;
  archivedAt?: string | null;
  tags: string[];
  totalUnits: number;
  completedUnits: number;
  createdAt: string;
}

export interface ResourceItem {
  id: string;
  title: string;
  url: string;
  type: "pdf" | "github" | "doc" | "arxiv" | "video" | "slides";
  description?: string;
  tags?: string[];
  sourceInfo?: string;
}

export interface VideoBookmark {
  id: string;
  timestampSeconds: number;
  label: string;
}

export interface LearningObjective {
  id: string;
  text: string;
  completed: boolean;
}

export interface UnresolvedQuestion {
  id: string;
  question: string;
  resolved: boolean;
  resolutionNote?: string;
  createdAt: string;
}

export interface NoteRevision {
  id: string;
  savedAt: string;
  wordCount: number;
  markdownSnapshot: string;
}

export interface VaultHighlight {
  id: string;
  /** Page or timestamp anchor, e.g., "PDF p. 14", "Slide 9", or "Lecture 12:40" */
  anchorLabel: string;
  excerpt: string;
  note?: string;
  linkedFlashcardId?: string;
  linkedAssessmentId?: string;
  createdAt: string;
}

export interface ModuleUnit {
  id: string;
  courseId: string;
  unitGroup?: string;
  sortOrder?: number;
  title: string;
  status: ModuleStatus;
  videoLink: string;
  searchQueryForVideo?: string;
  notesMarkdown: string;
  transcriptNotes?: string;
  highlights?: VaultHighlight[];
  estimatedHours: number;
  studiedMinutes?: number;
  masteredAt?: string | null;
  sourceFileNames?: string[];
  tags: string[];
  keyConcepts?: string[];
  briefOverview?: string;
  learningObjectives?: LearningObjective[];
  unresolvedQuestions?: UnresolvedQuestion[];
  reflectionNote?: string;
  noteRevisions?: NoteRevision[];
  archived?: boolean;
  archivedAt?: string | null;
  autoResearchStatus?: "idle" | "thinking" | "synced" | "error";
  autoResearchedAt?: string | null;
  autoThinkingSummary?: string;
  resources: ResourceItem[];
  bookmarks: VideoBookmark[];
  notesXpAwarded?: boolean;
  masteredXpAwarded?: boolean;
  updatedAt: string;
}

export interface Achievement {
  id: string;
  title: string;
  desc: string;
  icon: string;
  unlockedAt: string | null;
}

export interface Flashcard {
  id: string;
  courseId: string;
  moduleId?: string;
  question: string;
  answer: string;
  box: number; // 1..5 Leitner box
  lastReviewedAt?: string;
  nextReviewAt?: string;
  reviewCount?: number;
  lapseCount?: number;
}

export interface TimeBlock {
  id: string;
  timeRange: string;
  durationMinutes: number;
  title: string;
  subtitle: string;
  courseId?: string;
  moduleId?: string;
  accent: "primary" | "secondary" | "tertiary";
  completed: boolean;
}

export interface DeadlineItem {
  id: string;
  courseCode: string;
  title: string;
  subtitle: string;
  dueLabel: string;
  dueDateIso?: string;
  urgency: "high" | "medium" | "normal";
  completed: boolean;
}

/* ============================================================================
 * STUDENT IDENTITY, ACADEMIC PROFILE, SKILLS & PORTFOLIO (Modules 2.1 & 2.10)
 * ========================================================================== */
export interface AcademicHistorySemester {
  id: string;
  label: string; // e.g., "Autumn Semester 1"
  academicYear: string; // e.g., "2025-2026"
  summary: string;
  outcomeNote?: string;
}

export interface SkillRecord {
  id: string;
  name: string;
  category: string;
  targetGoal?: string;
  /** Student self-reported confidence (1..5), kept strictly separate from assessed performance */
  selfConfidence: number;
  linkedCourseIds: string[];
  linkedModuleIds: string[];
  evidenceSummary?: string;
  updatedAt: string;
}

export interface PortfolioProject {
  id: string;
  title: string;
  summary: string;
  roleOrScope?: string;
  linkedCourseId?: string;
  linkedSkillIds: string[];
  evidenceUrl?: string;
  completedAt?: string;
  createdAt: string;
}

export interface CertificationMilestone {
  id: string;
  title: string;
  issuerOrType: string;
  kind: "certification" | "milestone" | "award";
  completedAt: string;
  credentialUrl?: string;
}

export interface AccessibilityPreferences {
  reducedMotion?: boolean;
  highContrastText?: boolean;
  comfortableSpacing?: boolean;
  notes?: string;
}

export interface StudentAcademicProfile {
  fullName?: string;
  institution?: string;
  programme?: string;
  degreeLevel?: string;
  academicYear?: string;
  semester?: string;
  academicGoals: string[];
  personalLearningGoals: string[];
  preferredLearningMethods: string[];
  accessibilityPreferences: AccessibilityPreferences;
  semesterHistory: AcademicHistorySemester[];
  skills: SkillRecord[];
  projects: PortfolioProject[];
  certifications: CertificationMilestone[];
  updatedAt: string;
}

/* ============================================================================
 * TASKS, ASSIGNMENTS, EXAMS & ASSESSMENTS (Modules 2.6, 2.7 & Phase 3)
 * ========================================================================== */
export type AcademicTaskKind =
  | "assignment"
  | "homework"
  | "practical"
  | "project"
  | "exam"
  | "revision";

export type AcademicTaskPriority = "critical" | "high" | "medium" | "low";

export type AcademicTaskStatus =
  | "todo"
  | "in_progress"
  | "submitted"
  | "completed"
  | "missed";

export interface AcademicTask {
  id: string;
  courseId?: string;
  moduleId?: string;
  title: string;
  kind: AcademicTaskKind;
  priority: AcademicTaskPriority;
  status: AcademicTaskStatus;
  /** YYYY-MM-DD date string */
  dueDate: string;
  estimatedMinutes: number;
  examChapters?: string[];
  scoreEarned?: number;
  scoreMax?: number;
  feedbackNotes?: string;
  recoveryPlanNote?: string;
  createdAt: string;
  completedAt?: string | null;
}

export type ErrorCategory =
  | "conceptual"
  | "calculation"
  | "recall"
  | "careless"
  | "time_pressure"
  | "unclassified";

export type AssessmentKind =
  | "quiz"
  | "practice_set"
  | "mock_exam"
  | "exam"
  | "assignment_rubric"
  | "delayed_recall";

export type AssessmentDifficulty = "foundational" | "standard" | "rigorous";

export interface AssessmentQuestion {
  id: string;
  prompt: string;
  options?: string[];
  correctAnswer: string;
  explanation?: string;
}

export interface Assessment {
  id: string;
  courseId: string;
  moduleId?: string;
  title: string;
  kind: AssessmentKind;
  difficulty: AssessmentDifficulty;
  maxScore: number;
  questions: AssessmentQuestion[];
  source: "manual" | "ai_generated" | "notes_derived";
  createdAt: string;
}

export interface QuestionAttemptResponse {
  questionId: string;
  prompt: string;
  studentAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  errorCategory?: ErrorCategory;
}

export interface AssessmentAttempt {
  id: string;
  assessmentId?: string;
  courseId: string;
  moduleId?: string;
  title: string;
  kind: AssessmentKind;
  difficulty: AssessmentDifficulty;
  score: number;
  maxScore: number;
  percentage: number;
  /** 1..5 self-reported confidence, strictly separated from assessed percentage */
  selfConfidence: number;
  durationMinutes?: number;
  errorCategories: ErrorCategory[];
  isDelayedRecall?: boolean;
  questionResponses?: QuestionAttemptResponse[];
  reflection?: string;
  attemptedAt: string;
  correctedAt?: string;
}

/* ============================================================================
 * DURABLE FOCUS SESSIONS, LEARNING EVENTS & AUDIT CORRECTIONS (Phase 3)
 * ========================================================================== */
export interface ActiveFocusSession {
  sessionId: string;
  isRunning: boolean;
  mode: "focus" | "break";
  totalSeconds: number;
  remainingSeconds: number;
  linkedCourseId: string;
  linkedModuleId?: string;
  startedAt: string;
  lastUpdatedAt: string;
}

export interface StudySessionRecord {
  id: string;
  idempotencyKey: string;
  courseId?: string;
  moduleId?: string;
  durationMinutes: number;
  kind: "pomodoro" | "manual" | "dwell" | "lab";
  label: string;
  startedAt: string;
  endedAt: string;
}

export type LearningEventKind =
  | "session_logged"
  | "assessment_attempt"
  | "flashcard_reviewed"
  | "task_status_changed"
  | "note_updated"
  | "resource_added"
  | "objective_completed"
  | "skill_updated"
  | "project_completed"
  | "record_corrected"
  | "syllabus_archived";

export interface LearningEvent {
  id: string;
  idempotencyKey: string;
  timestamp: string;
  eventType: LearningEventKind;
  courseId?: string;
  moduleId?: string;
  summary: string;
  numericValue?: number;
  metadata?: Record<string, string | number | boolean>;
}

export interface RecordCorrection {
  id: string;
  targetType: "assessment_attempt" | "study_session" | "task";
  targetId: string;
  action: "corrected" | "deleted";
  reason: string;
  previousSummary: string;
  correctedAt: string;
}

export interface RecommendationFeedback {
  recommendationId: string;
  action: "accepted" | "dismissed" | "snoozed";
  actedAt: string;
  snoozeUntil?: string;
}

export type AITutorMode =
  | "explain"
  | "step_by_step"
  | "socratic"
  | "generate_quiz"
  | "mistake_analysis";

export interface AITutorResponse {
  mode: AITutorMode;
  markdown: string;
  isGroundedInRecords: boolean;
  groundingSources: string[];
  generatedQuiz?: {
    title: string;
    difficulty: AssessmentDifficulty;
    questions: AssessmentQuestion[];
  };
  model: string;
}

/* ============================================================================
 * GROKOPEDIA, RESEARCH & 3D PHYSICS TYPES
 * ========================================================================== */
export interface GeneratedCurriculumUnit {
  title: string;
  estimatedHours: number;
  keyConcepts: string[];
  searchQueryForVideo: string;
  briefOverview: string;
  starterNotesMarkdown?: string;
}

export interface GeneratedFlashcardSeed {
  unitIndex: number;
  question: string;
  answer: string;
}

export interface GeneratedMilestoneSeed {
  title: string;
  subtitle: string;
  dueInDays: number;
  urgency: "high" | "medium" | "normal";
}

export interface GeneratedStudyBlockSeed {
  timeRange: string;
  durationMinutes: number;
  title: string;
  subtitle: string;
}

export interface GeneratedCurriculum {
  courseTitle: string;
  courseCode: string;
  category: string;
  tags: string[];
  executiveSummary: string;
  units: GeneratedCurriculumUnit[];
  flashcards: GeneratedFlashcardSeed[];
  milestones: GeneratedMilestoneSeed[];
  studyBlocks: GeneratedStudyBlockSeed[];
}

export interface AutonomousSyncResult {
  notesMarkdown: string;
  thinkingSummary: string;
  briefOverview: string;
  keyConcepts: string[];
  searchQueryForVideo: string;
  webSources: Array<{ title: string; url: string }>;
  flashcards: Array<{ question: string; answer: string }>;
  groundedWithSearch: boolean;
  model: string;
  syncedAt: string;
}

export interface DeepResearchReportData {
  title: string;
  subtitle: string;
  executiveSummary: string;
  mathInvariants: Array<{
    label: string;
    formula: string;
    explanation: string;
  }>;
  comparisonMatrix: Array<{
    approach: string;
    modelType: string;
    boundOrMetric: string;
    complexity: string;
    performance: string;
    tradeoff: string;
  }>;
  codeSectionTitle: string;
  codeLanguage: string;
  codeSnippet: string;
  formalVerificationTitle: string;
  formalVerificationSpec: string;
  fiveDayTrack: Array<{
    day: string;
    milestone: string;
  }>;
}

export interface ResearchSession {
  id: string;
  topic: string;
  learningGoals?: string;
  sourceFileNames?: string[];
  mode: "curriculum" | "report";
  model: string;
  createdAt: string;
  courseId?: string;
  curriculum?: GeneratedCurriculum;
  report?: DeepResearchReportData;
}

export type IntegrativeArchetypeId =
  | "orbital_gravity"
  | "harmonic_control"
  | "ballistic_kinematics"
  | "electromagnetic_lorentz"
  | "wave_resonance"
  | "energy_landscape";

export interface IntegrativeStageConfig {
  stageNumber: number;
  title: string;
  conceptBridge: string;
  governingEquation: string;
  beaconCount: number;
  droneCount: number;
  gravityMs2: number;
  dragCoeff: number;
  wellStrength: number;
  lorentzBz: number;
  targetEnergyJoules: number;
}

export interface IntegrativeLabBlueprint {
  id: string;
  topic: string;
  courseId?: string;
  moduleId?: string;
  archetype: IntegrativeArchetypeId;
  archetypeLabel: string;
  domainAnalogySummary: string;
  primaryEquation: string;
  conservationLaw: string;
  terrainSeed: number;
  accentHex: string;
  defaultGravityMs2: number;
  defaultLaunchSpeedMs: number;
  defaultDragCoeff: number;
  defaultFieldCoupling: number;
  stages: IntegrativeStageConfig[];
  synthesisEngine: string;
}

export interface StudyOSState {
  schemaVersion?: number;
  workspaceSyncId: string;
  settings: UserSettings;
  stats: UserStats;
  courses: Course[];
  modules: ModuleUnit[];
  achievements: Achievement[];
  flashcards: Flashcard[];
  timeBlocks: TimeBlock[];
  deadlines: DeadlineItem[];
  researchSessions: ResearchSession[];
  activityLog: ActivityLogEntry[];

  // Student Learning & Growth OS Extensions
  academicProfile: StudentAcademicProfile;
  tasks: AcademicTask[];
  assessments: Assessment[];
  assessmentAttempts: AssessmentAttempt[];
  studySessions: StudySessionRecord[];
  learningEvents: LearningEvent[];
  recordCorrections: RecordCorrection[];
  recommendationFeedback: RecommendationFeedback[];
  activeFocusSession: ActiveFocusSession | null;
}

export interface ToastNotification {
  id: string;
  title: string;
  subtitle?: string;
  xpDelta?: number;
  variant: "xp" | "success" | "warning" | "error" | "levelup";
}
