/* ============================================================================
 * LEARNINGOS — MODULAR DESKTOP-FIRST & WEB-COMPATIBLE DOMAIN CONTRACTS
 * Implements Stages 2–30 contracts alongside StudyOS Schema v3 without breaking
 * or removing any existing StudyOS types or workspaces.
 * ========================================================================== */

export type AppRuntimeType = "internal" | "process" | "bridge" | "web" | "sdk";

export type PermissionScope =
  | "read"
  | "write"
  | "ai"
  | "process"
  | "external_web";

export type CapabilityId =
  | "curriculum.read"
  | "curriculum.write"
  | "resource.add"
  | "resource.read"
  | "resource.metadata"
  | "resource.transcript"
  | "resource.open"
  | "search.query"
  | "notes.read"
  | "notes.write"
  | "ai.ask"
  | "ai.summarize"
  | "ai.flashcards"
  | "ai.quiz"
  | "revision.review"
  | "concepts.read"
  | "concept.graph"
  | "flashcards.export"
  | "interactive.lesson.create"
  | "external.web.open"
  | "external.process.run"
  | "jobs.manage"
  | "storage.audit";

export interface AppManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  runtime: AppRuntimeType;
  route: string;
  requiredCapabilities: CapabilityId[];
  optionalCapabilities: CapabilityId[];
  permissions: PermissionScope[];
  enabledByDefault: boolean;
  /** Core modules keep the curriculum/library shell usable and cannot be uninstalled */
  isCore?: boolean;
}

export interface ToolCitation {
  resourceId: string;
  segmentId: string;
  startMs: number;
  endMs: number;
  quote: string;
}

export interface ToolRequest<TInput = unknown> {
  requestId: string;
  callerAppId: string;
  capability: string;
  input: TInput;
  permissionScope: PermissionScope;
  createdAt: string;
}

export interface ToolResponse<TResult = unknown> {
  requestId: string;
  success: boolean;
  result?: TResult;
  error?: string;
  citations: ToolCitation[];
  warnings: string[];
  durationMs: number;
}

export interface AppEvent {
  id: string;
  timestamp: string;
  type:
    | "app.registered"
    | "app.enabled"
    | "app.disabled"
    | "tool.started"
    | "tool.succeeded"
    | "tool.failed";
  appId: string;
  detail: string;
  requestId?: string;
}

/* ============================================================================
 * STAGE 6–10: RESOURCES, SOURCE ADAPTERS & CAPTIONS-FIRST TRANSCRIPTS
 * ========================================================================== */
export type ResourceSourceType =
  | "youtube"
  | "webpage"
  | "pdf"
  | "note"
  | "local_file";

export interface SourceCapabilities {
  metadata: boolean;
  subtitles: boolean;
  streamUrl: boolean;
  /** Strictly false by non-negotiable Rule #1 & #2: remote videos stay remote */
  permanentDownload: false;
}

export type SubtitleType =
  | "manual"
  | "auto"
  | "generated"
  | "whisper"
  | "unknown";

export interface LearningResourceRecord {
  id: string;
  url: string;
  title: string;
  sourceType: ResourceSourceType;
  authorOrChannel: string;
  durationSeconds: number | null;
  courseId: string | null;
  unitName: string | null;
  topicId: string | null;
  status: "unread" | "in_progress" | "completed";
  progressPct: number;
  lastPositionSec: number;
  completed: boolean;
  transcriptAvailable: boolean;
  transcriptSource: SubtitleType | "none";
  capabilities: SourceCapabilities;
  lastVerifiedAt: string;
  lastOpenedAt: string | null;
  createdAt: string;
}

export interface TranscriptRecord {
  id: string;
  resourceId: string;
  sourceUrl: string;
  subtitleType: SubtitleType;
  language: string;
  contentHash: string;
  segmentCount: number;
  retrievedAt: string;
}

export interface TranscriptSegmentRecord {
  id: string;
  transcriptId: string;
  resourceId: string;
  sequence: number;
  startMs: number;
  endMs: number;
  text: string;
}

/* ============================================================================
 * STAGE 11–12: SQLITE FTS5 LEXICAL & SOURCE-GROUNDED SEARCH
 * ========================================================================== */
export type SearchResultEntityType =
  | "transcript_segment"
  | "resource"
  | "note"
  | "topic"
  | "concept"
  | "flashcard";

export interface FtsSearchFilters {
  courseId?: string;
  semester?: string;
  topicId?: string;
  resourceType?: ResourceSourceType | "all";
  completedStatus?: "all" | "completed" | "incomplete";
  limit?: number;
}

export interface FtsSearchResult {
  entityType: SearchResultEntityType;
  entityId: string;
  resourceId: string | null;
  topicId: string | null;
  courseId: string | null;
  title: string;
  curriculumPath: string;
  snippet: string;
  startMs: number | null;
  rank: number;
}

/* ============================================================================
 * STAGE 13–14: SOURCE-GROUNDED AI TUTOR & ON-DEMAND ARTIFACTS
 * ========================================================================== */
export interface CitedTutorAnswer {
  answer: string;
  citations: ToolCitation[];
  warnings: string[];
  model: string;
}

export type StudyArtifactType =
  | "summary"
  | "structured_notes"
  | "flashcards"
  | "quiz"
  | "revision_sheet"
  | "interactive_lesson";

export interface StudyArtifactRecord {
  id: string;
  artifactType: StudyArtifactType;
  resourceIds: string[];
  segmentIds: string[];
  promptVersion: string;
  providerModel: string;
  contentHash: string;
  content: Record<string, unknown>;
  citations: ToolCitation[];
  tokenEstimate: number | null;
  cached?: boolean;
  createdAt: string;
}

/* ============================================================================
 * STAGE 15: FSRS-COMPATIBLE REVISION ABSTRACTION
 * ========================================================================== */
export type FsrsCardState = "new" | "learning" | "review" | "relearning";
export type FsrsRating = "again" | "hard" | "good" | "easy";

export interface FsrsReviewState {
  flashcardId: string;
  dueAt: string;
  intervalDays: number;
  stability: number;
  difficulty: number;
  repetitions: number;
  lapses: number;
  cardState: FsrsCardState;
  lastReviewed: string | null;
}

/* ============================================================================
 * STAGE 16–17: RELATIONAL CONCEPT GRAPH & CURRICULUM MATCHING
 * ========================================================================== */
export type ConceptRelationType =
  | "prerequisite"
  | "related"
  | "contrast"
  | "example";

export interface ConceptNode {
  id: string;
  topicId: string | null;
  courseId: string | null;
  name: string;
  definition: string;
  sourceResourceId: string | null;
  sourceSegmentId: string | null;
  sourceStartMs: number | null;
  createdAt: string;
}

export interface ConceptLinkRecord {
  id: string;
  fromConceptId: string;
  toConceptId: string;
  relationType: ConceptRelationType;
  confidence: number;
  evidence: string;
  mappingMethod: "manual" | "assisted" | "notes_derived";
  createdAt: string;
}

export interface ResourceTopicMatch {
  id: string;
  resourceId: string;
  topicId: string;
  topicTitle: string;
  courseCode: string;
  confidence: number;
  mappingMethod: "manual" | "assisted" | "auto";
  whySuggested: string;
  approved: boolean;
  createdAt: string;
}

/* ============================================================================
 * STAGE 18–20: SURFSENSE, OPENMAIC & CONTROLLED EXTERNAL WEB HOST
 * ========================================================================== */
export interface InteractiveLessonSection {
  id: string;
  kind: "slide" | "whiteboard" | "quiz" | "simulation" | "concept_nav";
  title: string;
  bodyMarkdown: string;
  checkpointQuestion?: {
    prompt: string;
    options: string[];
    correctAnswer: string;
    explanation: string;
  };
  sourceSegmentId?: string;
  sourceStartMs?: number;
}

export interface InteractiveLessonArtifact {
  id: string;
  dslVersion: "openmaic-adapter-1.0";
  title: string;
  topicTitle: string;
  resourceIds: string[];
  sections: InteractiveLessonSection[];
  permanentVideoGenerated: false;
  createdAt: string;
}

export interface SurfSenseExchangeBundle {
  format: "learningos-surfsense-exchange-v1";
  exportedAt: string;
  resources: Array<{
    id: string;
    title: string;
    url: string;
    sourceType: ResourceSourceType;
    transcriptExcerpt: string;
  }>;
  artifacts: Array<{
    id: string;
    artifactType: StudyArtifactType;
    title: string;
    markdown: string;
    provenanceUrl?: string;
  }>;
}

export interface WebAppManifest {
  id: string;
  name: string;
  allowedOrigins: string[];
  launchURL: string;
  permissions: PermissionScope[];
  sessionPartition: string;
  canOpenExternal: boolean;
  enabledByDefault: boolean;
}

/* ============================================================================
 * STAGE 2, 9, 21–24: JOBS, STORAGE AUDIT & SYSTEM DIAGNOSTICS
 * ========================================================================== */
export type JobLifecycleState =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "cleaned";

export interface JobRecord {
  id: string;
  jobType:
    | "metadata_fetch"
    | "transcript_ingest"
    | "whisper_fallback"
    | "ai_artifact"
    | "fts_reindex"
    | "temp_cleanup";
  status: JobLifecycleState;
  queuePosition: number;
  progress: number;
  currentOperation: string;
  resourceId: string | null;
  retryCount: number;
  errorSummary: string | null;
  tempDir: string | null;
  cleanupStatus: "not_needed" | "pending" | "verified_deleted";
  elapsedMs: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface StorageAuditSummary {
  sqliteBytes: number;
  transcriptBytes: number;
  notesBytes: number;
  browserWorkspaceBytes: number;
  artifactCacheBytes: number;
  tempBytes: number;
  /** Non-negotiable Rule #1/#2/#22: must always equal 0 */
  permanentMediaBytes: 0;
  totalFootprintBytes: number;
  orphanedTempDirsCleaned: number;
  auditedAt: string;
}

export interface SystemDiagnosticsReport {
  appVersion: string;
  sqlitePath: string;
  tempPath: string;
  logPath: string;
  backendOnline: boolean;
  sqliteReady: boolean;
  fts5Ready: boolean;
  nodeVersion: string;
  pythonAvailable: boolean;
  pythonVersion: string | null;
  ytDlpAvailable: boolean;
  whisperAvailable: boolean;
  ffmpegAvailable: boolean;
  llmConfigured: boolean;
  llmProvider: string;
  defaultModel: string;
  capabilities: {
    llm: boolean;
    embeddings: boolean;
    localStt: boolean;
    tts: boolean;
  };
  mcpBridgeEnabled: boolean;
}
