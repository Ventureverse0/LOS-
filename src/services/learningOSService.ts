/* ============================================================================
 * CLIENT SERVICE FOR LEARNINGOS SERVER ENDPOINTS (/api/learningos/*, /api/ai/*)
 * ========================================================================== */

import type {
  CitedTutorAnswer,
  ConceptLinkRecord,
  ConceptNode,
  ConceptRelationType,
  FtsSearchFilters,
  FtsSearchResult,
  JobRecord,
  LearningResourceRecord,
  ResourceTopicMatch,
  StorageAuditSummary,
  StudyArtifactRecord,
  StudyArtifactType,
  SubtitleType,
  SystemDiagnosticsReport,
  ToolResponse,
  TranscriptRecord,
  TranscriptSegmentRecord,
} from "../types/learningOS";
import type { StudyOSState } from "../types/studyOS";
import { resolveApiUrl } from "../lib/apiBase";
import type {
  CredentialSlot,
  ProviderMode,
  ProviderPublicSnapshot,
} from "../server/llmProviderRouter";

export type { CredentialSlot, ProviderMode, ProviderPublicSnapshot };

export interface LearningOSBootstrapPayload {
  resources: LearningResourceRecord[];
  transcripts: TranscriptRecord[];
  concepts: ConceptNode[];
  conceptLinks: ConceptLinkRecord[];
  topicMatches: ResourceTopicMatch[];
  artifacts: StudyArtifactRecord[];
  jobs: JobRecord[];
  storageAudit: StorageAuditSummary;
  diagnostics: SystemDiagnosticsReport;
  providerSnapshot?: ProviderPublicSnapshot;
  migrations: Array<{ version: number; name: string; appliedAt: string }>;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(resolveApiUrl(url), {
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error((data as { error?: string })?.error || `HTTP ${res.status}`);
  }
  return data as T;
}

export function fetchLearningOSBootstrap(): Promise<LearningOSBootstrapPayload> {
  return requestJson<LearningOSBootstrapPayload>("/api/learningos/bootstrap");
}

export function syncWorkspaceToSqliteApi(state: StudyOSState): Promise<{
  ok: boolean;
  coursesSynced: number;
  topicsSynced: number;
  notesSynced: number;
  flashcardsSynced: number;
}> {
  return requestJson("/api/learningos/sync-workspace", {
    method: "POST",
    body: JSON.stringify({ state }),
  });
}

export function addLearningResourceApi(payload: {
  url: string;
  title?: string;
  authorOrChannel?: string;
  durationSeconds?: number;
  courseId?: string | null;
  unitName?: string | null;
  topicId?: string | null;
  rawCaptionsText?: string;
  subtitleType?: SubtitleType;
}): Promise<{
  resource: LearningResourceRecord;
  transcript: TranscriptRecord | null;
  deduplicatedTranscript: boolean;
}> {
  return requestJson("/api/learningos/resources", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateLearningResourceProgressApi(
  resourceId: string,
  patch: { lastPositionSec?: number; progressPct?: number; completed?: boolean }
): Promise<{ resource: LearningResourceRecord }> {
  return requestJson(`/api/learningos/resources/${encodeURIComponent(resourceId)}/progress`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function deleteLearningResourceApi(resourceId: string): Promise<{ ok: boolean }> {
  return requestJson(`/api/learningos/resources/${encodeURIComponent(resourceId)}`, {
    method: "DELETE",
  });
}

export function fetchResourceTranscriptPageApi(
  resourceId: string,
  offset: number = 0,
  limit: number = 60
): Promise<{
  transcript: TranscriptRecord | null;
  total: number;
  offset: number;
  limit: number;
  segments: TranscriptSegmentRecord[];
}> {
  return requestJson(
    `/api/learningos/resources/${encodeURIComponent(resourceId)}/transcript?offset=${offset}&limit=${limit}`
  );
}

export function ingestResourceTranscriptApi(
  resourceId: string,
  payload: { rawSubtitleText: string; subtitleType?: SubtitleType; language?: string }
): Promise<{
  deduplicated: boolean;
  transcript: TranscriptRecord;
  segments: TranscriptSegmentRecord[];
  totalSegments: number;
  resource: LearningResourceRecord;
}> {
  return requestJson(`/api/learningos/resources/${encodeURIComponent(resourceId)}/transcript`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function triggerWhisperFallbackJobApi(
  resourceId: string,
  fallbackCueText?: string
): Promise<{
  job: JobRecord;
  whisperCalled: boolean;
  resource: LearningResourceRecord;
  transcript: TranscriptRecord | null;
}> {
  return requestJson(`/api/learningos/resources/${encodeURIComponent(resourceId)}/whisper-job`, {
    method: "POST",
    body: JSON.stringify({ fallbackCueText }),
  });
}

export function queryFtsSearchApi(
  query: string,
  filters: FtsSearchFilters = {}
): Promise<{
  query: string;
  elapsedMs: number;
  results: FtsSearchResult[];
}> {
  return requestJson("/api/learningos/search", {
    method: "POST",
    body: JSON.stringify({ query, filters }),
  });
}

export function askResourceGroundedTutorApi(
  resourceId: string,
  payload: { question: string; selectedSegmentIds?: string[]; model?: string }
): Promise<CitedTutorAnswer> {
  return requestJson(`/api/ai/resources/${encodeURIComponent(resourceId)}/ask`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function generateResourceStudyArtifactApi(
  resourceId: string,
  payload: {
    artifactType: StudyArtifactType;
    selectedSegmentIds?: string[];
    notesMarkdown?: string;
    forceRegenerate?: boolean;
  }
): Promise<{ artifact: StudyArtifactRecord; cached: boolean }> {
  return requestJson(`/api/ai/resources/${encodeURIComponent(resourceId)}/artifacts`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function upsertConceptNodeApi(payload: {
  topicId?: string | null;
  courseId?: string | null;
  name: string;
  definition: string;
  sourceResourceId?: string | null;
  sourceSegmentId?: string | null;
  sourceStartMs?: number | null;
}): Promise<{
  concept: ConceptNode;
  graph: { concepts: ConceptNode[]; links: ConceptLinkRecord[] };
}> {
  return requestJson("/api/learningos/concepts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function addConceptLinkApi(payload: {
  fromConceptId: string;
  toConceptId: string;
  relationType: ConceptRelationType;
  confidence: number;
  evidence: string;
  mappingMethod: "manual" | "assisted" | "notes_derived";
}): Promise<{
  link: ConceptLinkRecord;
  graph: { concepts: ConceptNode[]; links: ConceptLinkRecord[] };
}> {
  return requestJson("/api/learningos/concept-links", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function suggestCurriculumMatchesApi(
  resourceId: string
): Promise<{ candidates: ResourceTopicMatch[] }> {
  return requestJson("/api/learningos/curriculum-match", {
    method: "POST",
    body: JSON.stringify({ resourceId }),
  });
}

export function approveCurriculumMatchApi(payload: {
  resourceId: string;
  topicId: string;
  approved: boolean;
  method?: "manual" | "assisted";
}): Promise<{ matches: ResourceTopicMatch[]; resource: LearningResourceRecord }> {
  return requestJson("/api/learningos/curriculum-match/approve", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function runStorageCleanupApi(): Promise<{
  removedEntries: number;
  audit: StorageAuditSummary;
}> {
  return requestJson("/api/learningos/storage-cleanup", { method: "POST" });
}

export function fetchSqliteBackupBundleApi(): Promise<Record<string, unknown>> {
  return requestJson("/api/learningos/backup");
}

export function fetchSystemDiagnosticsApi(): Promise<SystemDiagnosticsReport> {
  return requestJson("/api/system/diagnostics");
}

export function toggleMcpBridgeApi(enabled: boolean): Promise<{
  enabled: boolean;
  exposedTools: string[];
}> {
  return requestJson("/api/mcp/toggle", {
    method: "POST",
    body: JSON.stringify({ enabled }),
  });
}

export function callMcpReadOnlyToolApi(
  capability: string,
  input: Record<string, unknown> = {}
): Promise<ToolResponse> {
  return requestJson("/api/mcp/call", {
    method: "POST",
    body: JSON.stringify({ capability, input }),
  });
}

export function fetchProviderRoutingConfigApi(): Promise<ProviderPublicSnapshot> {
  return requestJson<ProviderPublicSnapshot>("/api/ai/provider/config");
}

export function saveProviderRoutingConfigApi(patch: {
  mode?: ProviderMode;
  baseUrl?: string;
  model?: string;
  credentialSlot?: CredentialSlot;
  timeoutMs?: number;
}): Promise<ProviderPublicSnapshot> {
  return requestJson<ProviderPublicSnapshot>("/api/ai/provider/config", {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

export function discoverProviderModelsApi(baseUrl?: string): Promise<{
  models: string[];
  endpointQueried: string;
  warning?: string;
}> {
  const qs = baseUrl ? `?baseUrl=${encodeURIComponent(baseUrl)}` : "";
  return requestJson(`/api/ai/provider/models${qs}`);
}

export function testProviderConnectionApi(): Promise<{
  ok: boolean;
  provider: string;
  model: string;
  endpointLabel: string;
  isLocalEndpoint: boolean;
  latencyMs: number;
  sampleReply: string;
  discoveredModels: string[];
  error?: string;
}> {
  return requestJson("/api/ai/provider/test", { method: "POST" });
}

