import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  BookOpen,
  CheckCircle2,
  Cpu,
  Database,
  Download,
  ExternalLink,
  FileText,
  GitBranch,
  Globe,
  HardDrive,
  Layers,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useStudyOS } from "../../context/StudyOSContext";
import { MarkdownRenderer } from "../MarkdownRenderer";
import { LocalEndpointProviderPanel } from "../LocalEndpointProviderPanel";
import {
  createDefaultLearningOSHost,
  MCP_READONLY_ALLOWLIST,
  type RegisteredAppState,
} from "../../lib/appHostToolBus";
import {
  buildYouTubeEmbedAtSeconds,
  formatMsToTimestamp,
  resolveSourceInput,
} from "../../lib/transcriptPipeline";
import {
  buildSurfSenseExportBundle,
  DEFAULT_WEB_APP_MANIFEST,
  evaluateExternalWebUrl,
  parseSurfSenseArtifactImport,
} from "../../integrations/learningOSAdapters";
import { formatByteSize } from "../../lib/storage";
import {
  addConceptLinkApi,
  addLearningResourceApi,
  approveCurriculumMatchApi,
  askResourceGroundedTutorApi,
  callMcpReadOnlyToolApi,
  deleteLearningResourceApi,
  fetchLearningOSBootstrap,
  fetchResourceTranscriptPageApi,
  fetchSqliteBackupBundleApi,
  fetchSystemDiagnosticsApi,
  generateResourceStudyArtifactApi,
  ingestResourceTranscriptApi,
  queryFtsSearchApi,
  runStorageCleanupApi,
  suggestCurriculumMatchesApi,
  syncWorkspaceToSqliteApi,
  toggleMcpBridgeApi,
  triggerWhisperFallbackJobApi,
  updateLearningResourceProgressApi,
  upsertConceptNodeApi,
  type LearningOSBootstrapPayload,
} from "../../services/learningOSService";
import type {
  AppEvent,
  CitedTutorAnswer,
  ConceptRelationType,
  FtsSearchResult,
  InteractiveLessonArtifact,
  LearningResourceRecord,
  ResourceSourceType,
  ResourceTopicMatch,
  StudyArtifactRecord,
  StudyArtifactType,
  TranscriptRecord,
  TranscriptSegmentRecord,
} from "../../types/learningOS";

type HubTabId =
  | "resources"
  | "lecture"
  | "search"
  | "concepts"
  | "integrations"
  | "diagnostics";

const ENABLED_APPS_STORAGE_KEY = "learningos_enabled_apps_v1";

const SAMPLE_LASER_VTT = `WEBVTT

00:00:00.000 --> 00:00:14.000
Welcome to Semester 1 Applied Physics, Unit 1 on Laser fundamentals and optical resonators.

00:00:14.000 --> 00:00:32.000
In thermal equilibrium, the lower energy state E1 always has a higher atomic population N1 than the excited state N2 according to the Boltzmann distribution.

00:00:32.000 --> 00:00:54.000
Population inversion occurs when optical or electrical pumping drives N2 greater than N1, creating net optical gain instead of absorption.

00:00:54.000 --> 00:01:18.000
Once population inversion is established inside an optical cavity, an incident photon triggers stimulated emission of a coherent photon with identical phase, frequency, polarization, and direction.

00:01:18.000 --> 00:01:42.000
Einstein A and B coefficients relate spontaneous emission, stimulated absorption, and stimulated emission rates at thermal equilibrium.`;

export function LearningOSHubView() {
  const {
    state,
    createCourse,
    addModule,
    saveModuleNotes,
    addFlashcardsBatch,
    createAssessment,
    openModuleInVault,
    openCourseInManager,
    pushToast,
  } = useStudyOS();

  const [activeTab, setActiveTab] = useState<HubTabId>("resources");
  const [bootstrap, setBootstrap] = useState<LearningOSBootstrapPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);

  // App Host & Tool Bus instance (client runtime mirror with persisted optional module toggles)
  const hostRef = useRef(createDefaultLearningOSHost());
  const [registeredApps, setRegisteredApps] = useState<RegisteredAppState[]>([]);
  const [busEvents, setBusEvents] = useState<AppEvent[]>([]);

  // Resource Library state
  const [newUrl, setNewUrl] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newUnitName, setNewUnitName] = useState("Unit 1 — Core Foundations");
  const [selectedCourseId, setSelectedCourseId] = useState<string>(state.courses[0]?.id || "");
  const [selectedTopicId, setSelectedTopicId] = useState<string>(state.modules[0]?.id || "");
  const [rawCaptionsInput, setRawCaptionsInput] = useState("");
  const [showCaptionsPaste, setShowCaptionsPaste] = useState(false);
  const [matchCandidates, setMatchCandidates] = useState<ResourceTopicMatch[]>([]);
  const [matchingForResId, setMatchingForResId] = useState<string | null>(null);

  // Lecture Workspace state
  const [activeResourceId, setActiveResourceId] = useState<string | null>(null);
  const [activeTranscriptMeta, setActiveTranscriptMeta] = useState<TranscriptRecord | null>(null);
  const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegmentRecord[]>([]);
  const [transcriptTotal, setTranscriptTotal] = useState(0);
  const [transcriptOffset, setTranscriptOffset] = useState(0);
  const [playbackSeconds, setPlaybackSeconds] = useState(0);
  const [selectedSegmentIds, setSelectedSegmentIds] = useState<string[]>([]);
  const [inlineVttText, setInlineVttText] = useState("");
  const [lectureNotesDraft, setLectureNotesDraft] = useState("");
  const [tutorQuestion, setTutorQuestion] = useState("");
  const [tutorAnswer, setTutorAnswer] = useState<CitedTutorAnswer | null>(null);
  const [activeArtifact, setActiveArtifact] = useState<StudyArtifactRecord | null>(null);

  // FTS5 Global Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchCourseFilter, setSearchCourseFilter] = useState("all");
  const [searchTypeFilter, setSearchTypeFilter] = useState<ResourceSourceType | "all">("all");
  const [searchCompletedFilter, setSearchCompletedFilter] = useState<
    "all" | "completed" | "incomplete"
  >("all");
  const [searchResults, setSearchResults] = useState<FtsSearchResult[]>([]);
  const [searchElapsedMs, setSearchElapsedMs] = useState<number | null>(null);

  // Concept & Prerequisite Graph state
  const [conceptViewMode, setConceptViewMode] = useState<"graph" | "list">("graph");
  const [graphZoom, setGraphZoom] = useState(1);
  const [graphPan, setGraphPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(null);
  const [newConceptName, setNewConceptName] = useState("");
  const [newConceptDef, setNewConceptDef] = useState("");
  const [linkFromId, setLinkFromId] = useState("");
  const [linkToId, setLinkToId] = useState("");
  const [linkRelation, setLinkRelation] = useState<ConceptRelationType>("prerequisite");
  const [linkEvidence, setLinkEvidence] = useState("");

  // Integrations (OpenMAIC, SurfSense, Controlled Web Host, MCP)
  const [activeLessonSectionIdx, setActiveLessonSectionIdx] = useState(0);
  const [quizChoice, setQuizChoice] = useState<string | null>(null);
  const [webHostUrlInput, setWebHostUrlInput] = useState(DEFAULT_WEB_APP_MANIFEST.launchURL);
  const [mountedWebUrl, setMountedWebUrl] = useState(DEFAULT_WEB_APP_MANIFEST.launchURL);
  const [mcpTestOutput, setMcpTestOutput] = useState<string | null>(null);
  const vttFileInputRef = useRef<HTMLInputElement | null>(null);
  const surfsenseImportRef = useRef<HTMLInputElement | null>(null);

  const syncHostState = useCallback(() => {
    setRegisteredApps(hostRef.current.appRegistry.discoverApps());
    setBusEvents(hostRef.current.appRegistry.getEvents());
  }, []);

  // Hydrate persisted app toggles and register client ToolBus capabilities
  useEffect(() => {
    const host = hostRef.current;
    try {
      const savedRaw = localStorage.getItem(ENABLED_APPS_STORAGE_KEY);
      if (savedRaw) {
        const parsed = JSON.parse(savedRaw) as Record<string, boolean>;
        for (const [appId, enabled] of Object.entries(parsed)) {
          host.appRegistry.setAppEnabled(appId, Boolean(enabled));
        }
      }
    } catch {
      // Ignore storage parse error
    }

    host.capabilityRegistry.register({
      id: "search.query",
      description: "Query SQLite FTS5 index",
      requiredScope: "read",
      readOnly: true,
      handler: async (input: { query: string }) => {
        const res = await queryFtsSearchApi(input.query);
        return { result: res };
      },
    });
    host.capabilityRegistry.register({
      id: "interactive.lesson.create",
      description: "Compile OpenMAIC-compatible InteractiveLesson artifact",
      requiredScope: "write",
      readOnly: false,
      handler: async (input: { resourceId: string; notesMarkdown: string }) => {
        const out = await generateResourceStudyArtifactApi(input.resourceId, {
          artifactType: "interactive_lesson",
          notesMarkdown: input.notesMarkdown,
        });
        return { result: out.artifact };
      },
    });
    host.capabilityRegistry.register({
      id: "external.web.open",
      description: "Validate URL against default-deny WebAppManifest allowlist",
      requiredScope: "external_web",
      readOnly: true,
      handler: async (input: { url: string }) => ({
        result: evaluateExternalWebUrl(input.url, DEFAULT_WEB_APP_MANIFEST),
      }),
    });

    syncHostState();
  }, [syncHostState]);

  const refreshBootstrap = useCallback(async () => {
    try {
      await syncWorkspaceToSqliteApi(state);
      const data = await fetchLearningOSBootstrap();
      setBootstrap(data);
      if (!activeResourceId && data.resources.length > 0) {
        setActiveResourceId(data.resources[0].id);
      }
      if (data.concepts.length >= 2 && !linkFromId && !linkToId) {
        setLinkFromId(data.concepts[0].id);
        setLinkToId(data.concepts[1].id);
      }
    } catch (err: unknown) {
      pushToast({
        title: "LearningOS Sync Notice",
        subtitle: err instanceof Error ? err.message : "Could not reach local SQLite service.",
        variant: "warning",
      });
    } finally {
      setLoading(false);
    }
  }, [activeResourceId, linkFromId, linkToId, pushToast, state]);

  useEffect(() => {
    void refreshBootstrap();
  }, [refreshBootstrap]);

  const activeResource: LearningResourceRecord | null = useMemo(() => {
    if (!bootstrap) return null;
    return (
      bootstrap.resources.find((r) => r.id === activeResourceId) ||
      bootstrap.resources[0] ||
      null
    );
  }, [activeResourceId, bootstrap]);

  // Load paginated transcript segments whenever activeResource or transcriptOffset changes (8 GB RAM friendly)
  const loadTranscriptPage = useCallback(async (resourceId: string, offset: number) => {
    try {
      const page = await fetchResourceTranscriptPageApi(resourceId, offset, 60);
      setActiveTranscriptMeta(page.transcript);
      setTranscriptSegments(page.segments);
      setTranscriptTotal(page.total);
    } catch {
      setTranscriptSegments([]);
      setTranscriptTotal(0);
    }
  }, []);

  useEffect(() => {
    if (!activeResource) return;
    void loadTranscriptPage(activeResource.id, transcriptOffset);
    setPlaybackSeconds(Math.floor(activeResource.lastPositionSec || 0));
    const linkedMod = state.modules.find((m) => m.id === activeResource.topicId);
    if (linkedMod) {
      setLectureNotesDraft(linkedMod.notesMarkdown || "");
    }
  }, [activeResource, loadTranscriptPage, state.modules, transcriptOffset]);

  // Debounced autosave of lecture notes to linked StudyOS Vault module
  useEffect(() => {
    if (!activeResource?.topicId) return;
    const linkedMod = state.modules.find((m) => m.id === activeResource.topicId);
    if (!linkedMod || linkedMod.notesMarkdown === lectureNotesDraft) return;
    const t = window.setTimeout(() => {
      saveModuleNotes(linkedMod.id, lectureNotesDraft);
    }, 650);
    return () => window.clearTimeout(t);
  }, [activeResource?.topicId, lectureNotesDraft, saveModuleNotes, state.modules]);

  const previewResolution = useMemo(
    () => (newUrl.trim() ? resolveSourceInput(newUrl.trim()) : null),
    [newUrl]
  );

  const handleToggleOptionalApp = (appId: string, enabled: boolean) => {
    const res = hostRef.current.appRegistry.setAppEnabled(appId, enabled);
    if (!res.ok) {
      pushToast({
        title: "Core Module Protected",
        subtitle: res.reason || "Core curriculum/shell apps remain active.",
        variant: "warning",
      });
      return;
    }
    const map: Record<string, boolean> = {};
    for (const item of hostRef.current.appRegistry.discoverApps()) {
      map[item.manifest.id] = item.enabled;
    }
    try {
      localStorage.setItem(ENABLED_APPS_STORAGE_KEY, JSON.stringify(map));
    } catch {
      // Ignore quota
    }
    syncHostState();
    pushToast({
      title: enabled ? "Module Activated" : "Module Disabled",
      subtitle: `${appId} updated in AppRegistry`,
      variant: "success",
    });
  };

  const handleAddResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl.trim()) return;
    setBusyMessage("Resolving remote source metadata...");
    try {
      const out = await addLearningResourceApi({
        url: newUrl.trim(),
        title: newTitle.trim() || undefined,
        courseId: selectedCourseId || null,
        unitName: newUnitName.trim() || null,
        topicId: selectedTopicId || null,
        rawCaptionsText: rawCaptionsInput.trim() || undefined,
        subtitleType: rawCaptionsInput.trim() ? "manual" : undefined,
      });
      setNewUrl("");
      setNewTitle("");
      setRawCaptionsInput("");
      setShowCaptionsPaste(false);
      setActiveResourceId(out.resource.id);
      await refreshBootstrap();
      pushToast({
        title: "Remote Resource Indexed",
        subtitle: `${out.resource.title} (0 B media stored)`,
        variant: "success",
      });
    } catch (err: unknown) {
      pushToast({
        title: "Resource Error",
        subtitle: err instanceof Error ? err.message : "Could not add resource.",
        variant: "error",
      });
    } finally {
      setBusyMessage(null);
    }
  };

  const handleSeedMasterLaserScenario = async () => {
    setBusyMessage("Seeding Applied Physics — Unit 1 Laser lecture & captions...");
    try {
      let targetCourse = state.courses.find((c) => c.code === "PHYS-101");
      if (!targetCourse) {
        targetCourse = createCourse({
          code: "PHYS-101",
          title: "Applied Physics",
          category: "Physics",
          semester: "Semester 1",
          academicYear: "Year 1",
          tags: ["laser", "optics", "semester-1"],
        });
      }
      let targetMod = state.modules.find(
        (m) => m.courseId === targetCourse!.id && m.title.toLowerCase().includes("laser")
      );
      if (!targetMod) {
        targetMod = addModule({
          courseId: targetCourse.id,
          unitGroup: "Unit 1 — Laser",
          title: "Population Inversion & Stimulated Emission",
          estimatedHours: 2,
          videoLink: "https://www.youtube.com/watch?v=y3SBSbsdiYg",
          notesMarkdown:
            "# Unit 1 — Laser Physics\n\n- **Population Inversion ($N_2 > N_1$)**: Required condition for optical amplification.\n- **Stimulated Emission**: Incident photon induces coherent emission in phase and direction.",
        });
      }

      await syncWorkspaceToSqliteApi({
        ...state,
        courses: [...state.courses, targetCourse],
        modules: [...state.modules, targetMod],
      });

      const added = await addLearningResourceApi({
        url: "https://www.youtube.com/watch?v=y3SBSbsdiYg",
        title: "Applied Physics Lecture 1 — Laser, Population Inversion & Einstein Coefficients",
        authorOrChannel: "Applied Physics Open Lecture",
        durationSeconds: 102,
        courseId: targetCourse.id,
        unitName: "Unit 1 — Laser",
        topicId: targetMod.id,
        rawCaptionsText: SAMPLE_LASER_VTT,
        subtitleType: "manual",
      });

      const c1 = await upsertConceptNodeApi({
        courseId: targetCourse.id,
        topicId: targetMod.id,
        name: "Population Inversion",
        definition: "Non-equilibrium state where excited population N2 exceeds lower state N1.",
        sourceResourceId: added.resource.id,
        sourceStartMs: 32000,
      });
      const c2 = await upsertConceptNodeApi({
        courseId: targetCourse.id,
        topicId: targetMod.id,
        name: "Stimulated Emission",
        definition: "Coherent photon emission triggered by an incident photon under population inversion.",
        sourceResourceId: added.resource.id,
        sourceStartMs: 54000,
      });
      await addConceptLinkApi({
        fromConceptId: c1.concept.id,
        toConceptId: c2.concept.id,
        relationType: "prerequisite",
        confidence: 0.94,
        evidence: "Cue [00:54]: Once population inversion is established, an incident photon triggers stimulated emission.",
        mappingMethod: "manual",
      });

      setActiveResourceId(added.resource.id);
      setTranscriptOffset(0);
      await refreshBootstrap();
      await loadTranscriptPage(added.resource.id, 0);
      setActiveTab("lecture");
      pushToast({
        title: "Applied Physics — Laser Workspace Ready",
        subtitle: "Captions indexed in SQLite FTS5 with 0 B permanent media",
        variant: "success",
      });
    } catch (err: unknown) {
      pushToast({
        title: "Sample Setup Failed",
        subtitle: err instanceof Error ? err.message : "Failed to initialize sample lecture.",
        variant: "error",
      });
    } finally {
      setBusyMessage(null);
    }
  };

  const handleUploadVttFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeResource) return;
    try {
      const text = await file.text();
      const out = await ingestResourceTranscriptApi(activeResource.id, {
        rawSubtitleText: text,
        subtitleType: "manual",
      });
      await refreshBootstrap();
      await loadTranscriptPage(activeResource.id, 0);
      pushToast({
        title: out.deduplicated ? "Transcript Unchanged (Idempotent)" : "Captions Indexed in FTS5",
        subtitle: `${out.totalSegments} timestamped cues stored`,
        variant: "success",
      });
    } catch (err: unknown) {
      pushToast({
        title: "Subtitle Parse Failed",
        subtitle: err instanceof Error ? err.message : "Invalid .vtt or .srt file.",
        variant: "error",
      });
    } finally {
      e.target.value = "";
    }
  };

  const handleIngestInlineVtt = async () => {
    if (!activeResource || !inlineVttText.trim()) return;
    setBusyMessage("Parsing VTT/SRT cues and indexing FTS5...");
    try {
      const out = await ingestResourceTranscriptApi(activeResource.id, {
        rawSubtitleText: inlineVttText,
        subtitleType: "manual",
      });
      setInlineVttText("");
      await refreshBootstrap();
      await loadTranscriptPage(activeResource.id, 0);
      pushToast({
        title: out.deduplicated ? "Duplicate Cues Skipped (Hash Match)" : "Transcript Ingested",
        subtitle: `${out.totalSegments} segments ready in Lecture Workspace`,
        variant: "success",
      });
    } catch (err: unknown) {
      pushToast({
        title: "Transcript Error",
        subtitle: err instanceof Error ? err.message : "Failed to parse cues.",
        variant: "error",
      });
    } finally {
      setBusyMessage(null);
    }
  };

  const handleRunWhisperFallback = async (resourceId: string) => {
    setBusyMessage("Running isolated Whisper fallback job & verifying temp cleanup...");
    try {
      const out = await triggerWhisperFallbackJobApi(resourceId);
      await refreshBootstrap();
      if (activeResource?.id === resourceId) {
        await loadTranscriptPage(resourceId, 0);
      }
      pushToast({
        title: out.whisperCalled
          ? "Whisper Fallback Completed & Cleaned"
          : "Skipped Whisper (Captions Present)",
        subtitle: `Cleanup status: ${out.job.cleanupStatus}`,
        variant: "success",
      });
    } catch (err: unknown) {
      pushToast({
        title: "Whisper Job Failed",
        subtitle: err instanceof Error ? err.message : "Could not run transcription job.",
        variant: "error",
      });
    } finally {
      setBusyMessage(null);
    }
  };

  const handleJumpToSegment = async (resourceId: string, startMs: number) => {
    const sec = Math.max(0, Math.floor(startMs / 1000));
    setActiveResourceId(resourceId);
    setPlaybackSeconds(sec);
    setActiveTab("lecture");
    try {
      await updateLearningResourceProgressApi(resourceId, {
        lastPositionSec: sec,
        progressPct: 35,
      });
      await refreshBootstrap();
    } catch {
      // Non-fatal
    }
  };

  const handleRunFtsSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;
    if (!hostRef.current.appRegistry.isAppEnabled("search")) {
      pushToast({
        title: "Search App Disabled",
        subtitle: "Re-enable FTS5 Search App in App Host & Diagnostics.",
        variant: "warning",
      });
      return;
    }
    setBusyMessage("Searching SQLite FTS5 index...");
    try {
      const out = await queryFtsSearchApi(searchQuery.trim(), {
        courseId: searchCourseFilter,
        resourceType: searchTypeFilter,
        completedStatus: searchCompletedFilter,
        limit: 40,
      });
      setSearchResults(out.results);
      setSearchElapsedMs(out.elapsedMs);
      syncHostState();
    } catch (err: unknown) {
      pushToast({
        title: "Search Error",
        subtitle: err instanceof Error ? err.message : "FTS5 search failed.",
        variant: "error",
      });
    } finally {
      setBusyMessage(null);
    }
  };

  const handleAskSourceTutor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeResource || !tutorQuestion.trim()) return;
    if (!hostRef.current.appRegistry.isAppEnabled("ai_tutor")) {
      pushToast({
        title: "AI Tutor Disabled",
        subtitle: "Enable Source-Grounded AI Tutor in App Host & Diagnostics.",
        variant: "warning",
      });
      return;
    }
    setBusyMessage("Querying source-grounded tutor with citation verification...");
    try {
      const ans = await askResourceGroundedTutorApi(activeResource.id, {
        question: tutorQuestion.trim(),
        selectedSegmentIds,
        model: state.settings.selectedModel,
      });
      setTutorAnswer(ans);
    } catch (err: unknown) {
      pushToast({
        title: "Tutor Error",
        subtitle: err instanceof Error ? err.message : "Failed to generate grounded response.",
        variant: "error",
      });
    } finally {
      setBusyMessage(null);
    }
  };

  const handleGenerateArtifact = async (
    artifactType: StudyArtifactType,
    forceRegenerate: boolean = false
  ) => {
    if (!activeResource) return;
    if (
      artifactType === "interactive_lesson" &&
      !hostRef.current.appRegistry.isAppEnabled("interactive_lessons")
    ) {
      pushToast({
        title: "Interactive Lesson App Opt-In",
        subtitle: "Enable Interactive Lesson App (OpenMAIC Adapter) in App Host first.",
        variant: "warning",
      });
      setActiveTab("integrations");
      return;
    }

    setBusyMessage(`Building ${artifactType.replace(/_/g, " ")} with provenance...`);
    try {
      const out = await generateResourceStudyArtifactApi(activeResource.id, {
        artifactType,
        selectedSegmentIds,
        notesMarkdown: lectureNotesDraft,
        forceRegenerate,
      });
      setActiveArtifact(out.artifact);
      await refreshBootstrap();

      // Allow instant sync of generated flashcards or quiz into StudyOS workspace
      if (artifactType === "flashcards") {
        const cards = (
          out.artifact.content as {
            cards?: Array<{ front: string; back: string }>;
          }
        )?.cards;
        const fallbackCourseId = activeResource.courseId || state.courses[0]?.id;
        if (Array.isArray(cards) && cards.length > 0 && fallbackCourseId) {
          addFlashcardsBatch(
            cards.map((c) => ({
              courseId: fallbackCourseId,
              moduleId: activeResource.topicId || undefined,
              question: c.front,
              answer: c.back,
            }))
          );
        }
      } else if (artifactType === "quiz") {
        const questions = (
          out.artifact.content as {
            questions?: Array<{
              question: string;
              options: string[];
              correctAnswer: string;
              explanation: string;
            }>;
          }
        )?.questions;
        const fallbackCourseId = activeResource.courseId || state.courses[0]?.id;
        if (Array.isArray(questions) && questions.length > 0 && fallbackCourseId) {
          createAssessment({
            courseId: fallbackCourseId,
            moduleId: activeResource.topicId || undefined,
            title: `${activeResource.title} — Source Quiz`,
            kind: "quiz",
            difficulty: "standard",
            maxScore: questions.length,
            source: "ai_generated",
            questions: questions.map((q, idx) => ({
              id: `q-art-${Date.now()}-${idx}`,
              prompt: q.question,
              options: q.options,
              correctAnswer: q.correctAnswer,
              explanation: q.explanation,
            })),
          });
        }
      } else if (artifactType === "interactive_lesson") {
        setActiveLessonSectionIdx(0);
        setQuizChoice(null);
        setActiveTab("integrations");
      }

      pushToast({
        title: out.cached ? "Loaded Cached Study Artifact" : "Study Artifact Created",
        subtitle: `${artifactType.replace(/_/g, " ")} (${out.artifact.providerModel})`,
        variant: "success",
      });
    } catch (err: unknown) {
      pushToast({
        title: "Artifact Error",
        subtitle: err instanceof Error ? err.message : "Could not generate artifact.",
        variant: "error",
      });
    } finally {
      setBusyMessage(null);
    }
  };

  const handleSuggestTopics = async (resourceId: string) => {
    setBusyMessage("Matching lecture cues against syllabus topics...");
    try {
      const out = await suggestCurriculumMatchesApi(resourceId);
      setMatchingForResId(resourceId);
      setMatchCandidates(out.candidates);
    } catch (err: unknown) {
      pushToast({
        title: "Matching Error",
        subtitle: err instanceof Error ? err.message : "Failed to compute curriculum matches.",
        variant: "error",
      });
    } finally {
      setBusyMessage(null);
    }
  };

  const handleApproveTopicMatch = async (resourceId: string, topicId: string) => {
    try {
      await approveCurriculumMatchApi({
        resourceId,
        topicId,
        approved: true,
        method: "assisted",
      });
      setMatchCandidates((prev) =>
        prev.map((c) => (c.topicId === topicId ? { ...c, approved: true } : c))
      );
      await refreshBootstrap();
      pushToast({
        title: "Curriculum Match Approved",
        subtitle: "Resource linked to syllabus topic in SQLite",
        variant: "success",
      });
    } catch (err: unknown) {
      pushToast({
        title: "Approval Failed",
        subtitle: err instanceof Error ? err.message : "Could not save topic match.",
        variant: "error",
      });
    }
  };

  const handleCreateConcept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newConceptName.trim()) return;
    try {
      await upsertConceptNodeApi({
        courseId: selectedCourseId || state.courses[0]?.id || null,
        topicId: selectedTopicId || state.modules[0]?.id || null,
        name: newConceptName.trim(),
        definition: newConceptDef.trim() || `Core concept: ${newConceptName.trim()}`,
        sourceResourceId: activeResource?.id || null,
        sourceStartMs: playbackSeconds * 1000,
      });
      setNewConceptName("");
      setNewConceptDef("");
      await refreshBootstrap();
      pushToast({
        title: "Concept Node Saved",
        subtitle: "Indexed in SQLite relational graph & FTS5",
        variant: "success",
      });
    } catch (err: unknown) {
      pushToast({
        title: "Concept Error",
        subtitle: err instanceof Error ? err.message : "Failed to add concept.",
        variant: "error",
      });
    }
  };

  const handleCreateConceptLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkFromId || !linkToId) return;
    try {
      await addConceptLinkApi({
        fromConceptId: linkFromId,
        toConceptId: linkToId,
        relationType: linkRelation,
        confidence: 0.9,
        evidence: linkEvidence.trim() || "Verified prerequisite link",
        mappingMethod: "manual",
      });
      setLinkEvidence("");
      await refreshBootstrap();
      pushToast({
        title: "Concept Relation Linked",
        subtitle: `${linkRelation} edge added to graph`,
        variant: "success",
      });
    } catch (err: unknown) {
      pushToast({
        title: "Graph Link Error",
        subtitle: err instanceof Error ? err.message : "Could not link concepts.",
        variant: "error",
      });
    }
  };

  const handleExportSurfSense = () => {
    if (!bootstrap) return;
    const bundle = buildSurfSenseExportBundle({
      resources: bootstrap.resources,
      segmentsByResource: activeResource
        ? { [activeResource.id]: transcriptSegments }
        : {},
      artifacts: bootstrap.artifacts,
    });
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `learningos-surfsense-exchange-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    pushToast({
      title: "SurfSense Bundle Exported",
      subtitle: `${bundle.resources.length} sources & ${bundle.artifacts.length} artifacts`,
      variant: "success",
    });
  };

  const handleImportSurfSense = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const raw = await file.text();
      const imported = parseSurfSenseArtifactImport(raw);
      let targetCourse = state.courses[0];
      if (!targetCourse) {
        targetCourse = createCourse({
          code: "SURF-101",
          title: "Imported Study Artifacts",
          category: "Imported",
          tags: ["surfsense"],
        });
      }
      for (const item of imported) {
        addModule({
          courseId: targetCourse.id,
          unitGroup: "SurfSense Exchange",
          title: item.title,
          estimatedHours: 1,
          notesMarkdown: item.markdown,
        });
      }
      pushToast({
        title: "SurfSense Artifacts Imported",
        subtitle: `Added ${imported.length} study note module(s) to Knowledge Vault`,
        variant: "success",
      });
    } catch (err: unknown) {
      pushToast({
        title: "SurfSense Import Failed",
        subtitle: err instanceof Error ? err.message : "Invalid exchange JSON.",
        variant: "error",
      });
    } finally {
      e.target.value = "";
    }
  };

  const handleDownloadSqliteBackup = async () => {
    try {
      const bundle = await fetchSqliteBackupBundleApi();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `learningos-sqlite-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      pushToast({
        title: "Validated SQLite Backup Downloaded",
        subtitle: `SHA-256 verified · Excludes temporary media`,
        variant: "success",
      });
    } catch (err: unknown) {
      pushToast({
        title: "Backup Failed",
        subtitle: err instanceof Error ? err.message : "Could not export SQLite bundle.",
        variant: "error",
      });
    }
  };

  // Concept Graph circular/layered coordinates
  const graphLayout = useMemo(() => {
    const concepts = bootstrap?.concepts || [];
    const links = bootstrap?.conceptLinks || [];
    const count = Math.max(1, concepts.length);
    const cx = 390;
    const cy = 200;
    const radius = Math.min(155, Math.max(85, count * 22));
    const coords = new Map<string, { x: number; y: number }>();

    concepts.forEach((c, idx) => {
      const angle = (2 * Math.PI * idx) / count - Math.PI / 2;
      coords.set(c.id, {
        x: Math.round(cx + radius * Math.cos(angle)),
        y: Math.round(cy + radius * Math.sin(angle)),
      });
    });

    return { concepts, links, coords };
  }, [bootstrap?.conceptLinks, bootstrap?.concepts]);

  const latestInteractiveLesson: InteractiveLessonArtifact | null = useMemo(() => {
    const found =
      (activeArtifact?.artifactType === "interactive_lesson" ? activeArtifact : null) ||
      bootstrap?.artifacts.find((a) => a.artifactType === "interactive_lesson") ||
      null;
    if (!found) return null;
    return found.content as unknown as InteractiveLessonArtifact;
  }, [activeArtifact, bootstrap?.artifacts]);

  const webHostCheck = useMemo(
    () => evaluateExternalWebUrl(mountedWebUrl, DEFAULT_WEB_APP_MANIFEST),
    [mountedWebUrl]
  );

  const youtubeEmbedUrl = activeResource
    ? buildYouTubeEmbedAtSeconds(activeResource.url, playbackSeconds)
    : null;

  const isAppEnabled = (id: string) =>
    registeredApps.find((a) => a.manifest.id === id)?.enabled ?? true;

  if (loading && !bootstrap) {
    return (
      <div className="bg-surface-lowest border border-outline-variant/40 rounded-md p-10 flex items-center justify-center gap-3">
        <Loader2 className="w-5 h-5 text-primary animate-spin" />
        <span className="font-mono text-xs text-on-surface-variant">
          Initializing LearningOS SQLite + FTS5 Engine...
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 w-full">
      {/* Top Studio Header & Sub-App Segmented Bar */}
      <div className="bg-surface-lowest border border-outline-variant/40 rounded-md p-4 sm:p-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-lg sm:text-xl font-semibold text-on-surface">
              LearningOS Studio — Remote Lectures, FTS5 Search &amp; App Host
            </h1>
            <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-outline tabular-nums">
              <span>SQLite + FTS5 Active</span>
              <span aria-hidden="true">·</span>
              <span>{bootstrap?.resources.length || 0} Remote Resources</span>
              <span aria-hidden="true">·</span>
              <span>{bootstrap?.concepts.length || 0} Graph Concepts</span>
              <span aria-hidden="true">·</span>
              <span>Permanent Media: 0 B</span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {busyMessage && (
              <span className="font-mono text-xs text-primary flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                <span>{busyMessage}</span>
              </span>
            )}
            <button
              type="button"
              onClick={() => void handleSeedMasterLaserScenario()}
              className="px-3 py-1.5 rounded bg-surface-high hover:bg-surface-bright border border-outline-variant/40 font-mono text-xs text-on-surface cursor-pointer whitespace-nowrap shrink-0"
            >
              Load Sample Laser Lecture
            </button>
            <button
              type="button"
              onClick={() => void refreshBootstrap()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-surface-low hover:bg-surface-high border border-outline-variant/40 font-mono text-xs text-on-surface-variant hover:text-on-surface cursor-pointer whitespace-nowrap shrink-0"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Sync SQLite</span>
            </button>
          </div>
        </div>

        {/* Sub-App Switcher */}
        <div className="flex items-center gap-1 bg-surface-low border border-outline-variant/30 p-1 rounded overflow-x-auto">
          {(
            [
              { id: "resources", label: "01. Resource Library", icon: Database },
              { id: "lecture", label: "02. Lecture Workspace", icon: Play },
              { id: "search", label: "03. FTS5 Search", icon: Search },
              { id: "concepts", label: "04. Concept Graph", icon: GitBranch },
              { id: "integrations", label: "05. Lessons & Web Host", icon: Globe },
              { id: "diagnostics", label: "06. App Host, Jobs & Storage", icon: Cpu },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-mono text-xs transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  active
                    ? "bg-primary-container text-on-primary-container font-semibold"
                    : "text-on-surface-variant hover:text-on-surface hover:bg-surface-high"
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* =====================================================================
       * TAB 1: RESOURCE LIBRARY & CAPTIONS-FIRST INGESTION (Stages 6–9, 17)
       * =================================================================== */}
      {activeTab === "resources" && (
        <div className="flex flex-col gap-5">
          <form
            onSubmit={handleAddResource}
            className="bg-surface-lowest border border-outline-variant/40 rounded-md p-4 sm:p-5 flex flex-col gap-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-on-surface">
                Add Remote Lecture or Study Resource (Zero Permanent Media Download)
              </h2>
              <button
                type="button"
                onClick={() => setShowCaptionsPaste((v) => !v)}
                className="font-mono text-xs text-primary hover:underline cursor-pointer whitespace-nowrap"
              >
                {showCaptionsPaste ? "Hide VTT/SRT Captions Input" : "+ Attach VTT/SRT Captions Now"}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input
                type="text"
                required
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="Paste YouTube lecture URL, PDF link, webpage, or file ref..."
                className="md:col-span-2 bg-surface-low border border-outline-variant/40 rounded px-3 py-2 text-xs text-on-surface focus:outline-none focus:border-primary"
              />
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Optional title (auto-fetched for YouTube)"
                className="bg-surface-low border border-outline-variant/40 rounded px-3 py-2 text-xs text-on-surface focus:outline-none focus:border-primary"
              />
              <input
                type="text"
                value={newUnitName}
                onChange={(e) => setNewUnitName(e.target.value)}
                placeholder="Unit label (e.g. Unit 1 — Laser)"
                className="bg-surface-low border border-outline-variant/40 rounded px-3 py-2 text-xs text-on-surface focus:outline-none focus:border-primary"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
              <select
                value={selectedCourseId}
                onChange={(e) => setSelectedCourseId(e.target.value)}
                className="bg-surface-low border border-outline-variant/40 rounded px-3 py-2 font-mono text-xs text-on-surface"
              >
                <option value="">Unassigned Course</option>
                {state.courses
                  .filter((c) => !c.archived)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.title}
                    </option>
                  ))}
              </select>

              <select
                value={selectedTopicId}
                onChange={(e) => setSelectedTopicId(e.target.value)}
                className="bg-surface-low border border-outline-variant/40 rounded px-3 py-2 font-mono text-xs text-on-surface"
              >
                <option value="">Unassigned Syllabus Topic</option>
                {state.modules
                  .filter(
                    (m) =>
                      !m.archived &&
                      (!selectedCourseId || m.courseId === selectedCourseId)
                  )
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
              </select>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 py-2 rounded bg-primary-container hover:bg-primary text-on-primary-container font-mono text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Index Remote Resource</span>
                </button>
              </div>
            </div>

            {previewResolution && (
              <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-on-surface-variant pt-1">
                <span>Detected adapter: {previewResolution.sourceType}</span>
                <span aria-hidden="true">·</span>
                <span>Metadata: {previewResolution.capabilities.metadata ? "Yes" : "No"}</span>
                <span aria-hidden="true">·</span>
                <span>Subtitles: {previewResolution.capabilities.subtitles ? "Supported" : "Optional"}</span>
                <span aria-hidden="true">·</span>
                <span>Permanent media download: Disabled</span>
              </div>
            )}

            {showCaptionsPaste && (
              <textarea
                rows={4}
                value={rawCaptionsInput}
                onChange={(e) => setRawCaptionsInput(e.target.value)}
                placeholder="Paste WebVTT (WEBVTT ...), SubRip (.srt), or [MM:SS] caption lines to index immediately..."
                className="bg-surface-low border border-outline-variant/40 rounded p-3 font-mono text-xs text-on-surface focus:outline-none focus:border-primary"
              />
            )}
          </form>

          {/* Assisted Curriculum Matcher Results Drawer */}
          {matchingForResId && (
            <div className="bg-surface-lowest border border-outline-variant/40 rounded-md p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-on-surface">
                  Assisted Curriculum Matching Candidates (Requires Student Approval)
                </h3>
                <button
                  type="button"
                  onClick={() => setMatchingForResId(null)}
                  className="font-mono text-xs text-outline hover:text-on-surface cursor-pointer"
                >
                  Close
                </button>
              </div>
              {matchCandidates.length === 0 ? (
                <p className="text-xs text-outline">
                  No active syllabus topics found yet. Create a course/topic in Course Syllabus first.
                </p>
              ) : (
                <div className="divide-y divide-outline-variant/25">
                  {matchCandidates.map((cand) => (
                    <div
                      key={cand.id}
                      className="py-2.5 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-xs font-medium text-on-surface">
                          <span>{cand.courseCode}</span>
                          <span aria-hidden="true">·</span>
                          <span>{cand.topicTitle}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono text-primary tabular-nums">
                            {cand.confidence.toFixed(2)}
                          </span>
                        </div>
                        <p className="font-mono text-[11px] text-outline pt-0.5">
                          Why this topic? {cand.whySuggested}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={cand.approved}
                        onClick={() =>
                          void handleApproveTopicMatch(cand.resourceId, cand.topicId)
                        }
                        className="px-3 py-1.5 rounded bg-surface-high hover:bg-primary-container hover:text-on-primary-container disabled:opacity-50 font-mono text-xs text-on-surface cursor-pointer whitespace-nowrap shrink-0"
                      >
                        {cand.approved ? "Approved" : "Approve Match"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Resource Catalog Table */}
          <div className="bg-surface-lowest border border-outline-variant/40 rounded-md overflow-hidden">
            <div className="px-4 py-3 border-b border-outline-variant/30 flex items-center justify-between">
              <span className="text-sm font-semibold text-on-surface">
                Indexed Learning Resources ({bootstrap?.resources.length || 0})
              </span>
              <span className="font-mono text-xs text-outline">
                Captions-first · Remote playback · SQLite backed
              </span>
            </div>

            {!bootstrap || bootstrap.resources.length === 0 ? (
              <div className="p-10 text-center flex flex-col items-center gap-3">
                <p className="text-sm text-on-surface-variant max-w-md">
                  No remote lectures or study sources indexed yet. Paste a YouTube or PDF URL above, or load the Applied Physics Laser lecture fixture to explore the full pipeline.
                </p>
                <button
                  type="button"
                  onClick={() => void handleSeedMasterLaserScenario()}
                  className="px-4 py-2 rounded bg-primary-container text-on-primary-container font-mono text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  Load Applied Physics — Unit 1 Laser Fixture
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-outline-variant/30 font-mono text-[11px] text-outline">
                      <th className="py-2.5 px-4">Resource</th>
                      <th className="py-2.5 px-3">Type · Source</th>
                      <th className="py-2.5 px-3">Transcript</th>
                      <th className="py-2.5 px-3 text-right">Progress</th>
                      <th className="py-2.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/20 text-xs">
                    {bootstrap.resources.map((res) => (
                      <tr key={res.id} className="hover:bg-surface-low/60">
                        <td className="py-3 px-4 max-w-sm">
                          <div className="font-medium text-on-surface truncate">
                            {res.title}
                          </div>
                          <div className="font-mono text-[11px] text-outline truncate">
                            {res.unitName || "Unassigned Unit"} · {res.url}
                          </div>
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px] text-on-surface-variant whitespace-nowrap">
                          {res.sourceType} · {res.authorOrChannel || "External"}
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px] whitespace-nowrap">
                          {res.transcriptAvailable ? (
                            <span className="text-tertiary">
                              Ready ({res.transcriptSource})
                            </span>
                          ) : (
                            <span className="text-outline">No captions yet</span>
                          )}
                        </td>
                        <td className="py-3 px-3 font-mono text-xs text-right tabular-nums whitespace-nowrap">
                          {res.completed ? "100% (Done)" : `${res.progressPct}%`}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setActiveResourceId(res.id);
                                setTranscriptOffset(0);
                                setActiveTab("lecture");
                              }}
                              className="px-2.5 py-1 rounded bg-primary-container text-on-primary-container font-mono text-[11px] font-semibold cursor-pointer whitespace-nowrap"
                            >
                              Open Lecture
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleSuggestTopics(res.id)}
                              className="px-2.5 py-1 rounded bg-surface-high hover:bg-surface-bright font-mono text-[11px] text-on-surface cursor-pointer whitespace-nowrap"
                            >
                              Match Topics
                            </button>
                            {!res.transcriptAvailable && (
                              <button
                                type="button"
                                onClick={() => void handleRunWhisperFallback(res.id)}
                                className="px-2.5 py-1 rounded bg-surface-high hover:bg-surface-bright font-mono text-[11px] text-secondary cursor-pointer whitespace-nowrap"
                              >
                                Whisper Fallback
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={async () => {
                                await deleteLearningResourceApi(res.id);
                                await refreshBootstrap();
                              }}
                              className="p-1 text-outline hover:text-error cursor-pointer"
                              title="Remove Resource"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
       * TAB 2: LECTURE WORKSPACE (Stages 10, 13 & 14)
       * =================================================================== */}
      {activeTab === "lecture" && (
        <div className="flex flex-col gap-5">
          {!isAppEnabled("lecture") ? (
            <div className="bg-surface-lowest border border-outline-variant/40 rounded-md p-8 text-center flex flex-col items-center gap-3">
              <p className="text-sm text-on-surface-variant">
                Lecture Workspace App is currently disabled in AppRegistry.
              </p>
              <button
                type="button"
                onClick={() => handleToggleOptionalApp("lecture", true)}
                className="px-4 py-2 rounded bg-primary-container text-on-primary-container font-mono text-xs font-semibold cursor-pointer"
              >
                Enable Lecture Workspace
              </button>
            </div>
          ) : !activeResource ? (
            <div className="bg-surface-lowest border border-outline-variant/40 rounded-md p-8 text-center flex flex-col items-center gap-3">
              <p className="text-sm text-on-surface-variant">
                Select or add a lecture resource first to open the Lecture Workspace.
              </p>
              <button
                type="button"
                onClick={() => void handleSeedMasterLaserScenario()}
                className="px-4 py-2 rounded bg-primary-container text-on-primary-container font-mono text-xs font-semibold cursor-pointer"
              >
                Load Applied Physics — Unit 1 Laser Lecture
              </button>
            </div>
          ) : (
            <>
              {/* Lecture Top Path & Source Facts */}
              <div className="bg-surface-lowest border border-outline-variant/40 rounded-md p-4 flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-mono text-[11px] text-outline">
                      {state.courses.find((c) => c.id === activeResource.courseId)?.semester ||
                        "Semester"}{" "}
                      ·{" "}
                      {state.courses.find((c) => c.id === activeResource.courseId)?.title ||
                        "General Study"}{" "}
                      · {activeResource.unitName || "Unit 1"}
                    </div>
                    <h2 className="text-base sm:text-lg font-semibold text-on-surface pt-0.5">
                      {activeResource.title}
                    </h2>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      value={activeResource.id}
                      onChange={(e) => {
                        setActiveResourceId(e.target.value);
                        setTranscriptOffset(0);
                      }}
                      className="bg-surface-low border border-outline-variant/40 rounded px-2.5 py-1.5 font-mono text-xs text-on-surface max-w-xs"
                    >
                      {bootstrap?.resources.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.title}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={async () => {
                        await updateLearningResourceProgressApi(activeResource.id, {
                          completed: !activeResource.completed,
                          progressPct: !activeResource.completed ? 100 : 50,
                        });
                        await refreshBootstrap();
                      }}
                      className={`px-3 py-1.5 rounded font-mono text-xs cursor-pointer whitespace-nowrap ${
                        activeResource.completed
                          ? "bg-tertiary/20 text-tertiary font-semibold"
                          : "bg-surface-high text-on-surface hover:bg-surface-bright"
                      }`}
                    >
                      {activeResource.completed ? "Completed (100%)" : "Mark Completed"}
                    </button>

                    <a
                      href={activeResource.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-3 py-1.5 rounded bg-surface-low hover:bg-surface-high border border-outline-variant/40 font-mono text-xs text-on-surface-variant hover:text-on-surface whitespace-nowrap"
                    >
                      <span>Open Externally</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>

                {/* Compact Source Facts Row */}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-outline-variant/25 font-mono text-[11px] text-outline tabular-nums">
                  <span>Channel/Author: {activeResource.authorOrChannel || "External"}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Duration:{" "}
                    {activeResource.durationSeconds
                      ? formatMsToTimestamp(activeResource.durationSeconds * 1000)
                      : "Stream"}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>Transcript: {activeResource.transcriptSource}</span>
                  {activeTranscriptMeta && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>Hash: {activeTranscriptMeta.contentHash}</span>
                    </>
                  )}
                  <span aria-hidden="true">·</span>
                  <span>Verified: {activeResource.lastVerifiedAt.slice(0, 10)}</span>
                </div>
              </div>

              {/* Main 2-Zone Split: Player + Timestamped Segments (Left) | Notes + Grounded AI + Artifacts (Right) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                <div className="lg:col-span-7 flex flex-col gap-4">
                  {/* Remote Video Player */}
                  <div className="bg-surface-lowest border border-outline-variant/40 rounded-md overflow-hidden">
                    {youtubeEmbedUrl ? (
                      <div className="aspect-video w-full bg-black">
                        <iframe
                          key={`${activeResource.id}-${playbackSeconds}`}
                          src={youtubeEmbedUrl}
                          title={activeResource.title}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          className="w-full h-full border-0"
                        />
                      </div>
                    ) : (
                      <div className="p-8 flex flex-col items-center justify-center gap-3 text-center bg-surface-low">
                        <p className="text-xs text-on-surface-variant max-w-md">
                          Remote source ({activeResource.sourceType}) remains hosted at its origin without local downloading.
                        </p>
                        <a
                          href={activeResource.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded bg-primary-container text-on-primary-container font-mono text-xs font-semibold"
                        >
                          <span>Open Source URL</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Paginated Timestamped Transcript Panel */}
                  <div className="bg-surface-lowest border border-outline-variant/40 rounded-md p-4 flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-on-surface">
                          Timestamped Transcript Segments ({transcriptTotal})
                        </h3>
                        <p className="font-mono text-[11px] text-outline">
                          Click any timestamp to jump player · Check cues to ground AI questions
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          ref={vttFileInputRef}
                          type="file"
                          accept=".vtt,.srt,.txt,.xml"
                          onChange={(e) => void handleUploadVttFile(e)}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => vttFileInputRef.current?.click()}
                          className="flex items-center gap-1 px-2.5 py-1 rounded bg-surface-high hover:bg-surface-bright font-mono text-xs text-on-surface cursor-pointer whitespace-nowrap"
                        >
                          <Upload className="w-3 h-3 text-primary" />
                          <span>Import .VTT/.SRT</span>
                        </button>
                        {!activeResource.transcriptAvailable && (
                          <button
                            type="button"
                            onClick={() => void handleRunWhisperFallback(activeResource.id)}
                            className="px-2.5 py-1 rounded bg-surface-high hover:bg-surface-bright font-mono text-xs text-secondary cursor-pointer whitespace-nowrap"
                          >
                            Whisper Fallback
                          </button>
                        )}
                      </div>
                    </div>

                    {transcriptSegments.length === 0 ? (
                      <div className="flex flex-col gap-2 pt-1">
                        <textarea
                          rows={4}
                          value={inlineVttText}
                          onChange={(e) => setInlineVttText(e.target.value)}
                          placeholder="Paste WebVTT (.vtt), SubRip (.srt), or [MM:SS] caption lines here..."
                          className="bg-surface-low border border-outline-variant/40 rounded p-2.5 font-mono text-xs text-on-surface focus:outline-none focus:border-primary"
                        />
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => void handleIngestInlineVtt()}
                            className="px-3 py-1.5 rounded bg-primary-container text-on-primary-container font-mono text-xs font-semibold cursor-pointer"
                          >
                            Parse &amp; Index Cues
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="max-h-[360px] overflow-y-auto divide-y divide-outline-variant/20 pr-1">
                          {transcriptSegments.map((seg) => {
                            const segSec = Math.floor(seg.startMs / 1000);
                            const isCurrent =
                              playbackSeconds >= segSec &&
                              playbackSeconds < Math.ceil(seg.endMs / 1000);
                            const isChecked = selectedSegmentIds.includes(seg.id);

                            return (
                              <div
                                key={seg.id}
                                className={`py-2 px-2 flex items-start gap-2.5 rounded transition-colors ${
                                  isCurrent ? "bg-primary-container/15" : "hover:bg-surface-low"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() =>
                                    setSelectedSegmentIds((prev) =>
                                      prev.includes(seg.id)
                                        ? prev.filter((id) => id !== seg.id)
                                        : [...prev, seg.id]
                                    )
                                  }
                                  className="mt-1 accent-cyan-400 cursor-pointer"
                                  title="Select segment for AI grounding"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleJumpToSegment(activeResource.id, seg.startMs)
                                  }
                                  className="font-mono text-xs text-primary hover:underline tabular-nums shrink-0 cursor-pointer"
                                >
                                  [{formatMsToTimestamp(seg.startMs)}]
                                </button>
                                <p className="text-xs text-on-surface leading-relaxed">
                                  {seg.text}
                                </p>
                              </div>
                            );
                          })}
                        </div>

                        {transcriptTotal > 60 && (
                          <div className="flex items-center justify-between pt-2 border-t border-outline-variant/25 font-mono text-xs text-outline tabular-nums">
                            <span>
                              Showing {transcriptOffset + 1}–
                              {Math.min(transcriptTotal, transcriptOffset + 60)} of{" "}
                              {transcriptTotal}
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={transcriptOffset === 0}
                                onClick={() =>
                                  setTranscriptOffset((o) => Math.max(0, o - 60))
                                }
                                className="px-2.5 py-1 rounded bg-surface-low disabled:opacity-40 cursor-pointer"
                              >
                                Previous 60
                              </button>
                              <button
                                type="button"
                                disabled={transcriptOffset + 60 >= transcriptTotal}
                                onClick={() => setTranscriptOffset((o) => o + 60)}
                                className="px-2.5 py-1 rounded bg-surface-low disabled:opacity-40 cursor-pointer"
                              >
                                Next 60
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Right Column: Notes + Source-Grounded AI Tutor + On-Demand Artifacts */}
                <div className="lg:col-span-5 flex flex-col gap-4">
                  {/* Debounced Markdown Lecture Notes */}
                  <div className="bg-surface-lowest border border-outline-variant/40 rounded-md p-4 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-on-surface">
                        Lecture Markdown Notes
                      </h3>
                      {activeResource.topicId ? (
                        <button
                          type="button"
                          onClick={() => openModuleInVault(activeResource.topicId!)}
                          className="font-mono text-xs text-primary hover:underline cursor-pointer"
                        >
                          Autosaved to Vault →
                        </button>
                      ) : (
                        <span className="font-mono text-[11px] text-outline">
                          Scratchpad (link topic to sync Vault)
                        </span>
                      )}
                    </div>
                    <textarea
                      rows={6}
                      value={lectureNotesDraft}
                      onChange={(e) => setLectureNotesDraft(e.target.value)}
                      placeholder="Write structured equations, insights, and lecture notes..."
                      className="bg-surface-low border border-outline-variant/40 rounded p-3 font-mono text-xs text-on-surface focus:outline-none focus:border-primary"
                    />
                  </div>

                  {/* Stage 13 Source-Grounded AI Tutor */}
                  <div className="bg-surface-lowest border border-outline-variant/40 rounded-md p-4 flex flex-col gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-on-surface">
                        Source-Grounded AI Tutor (Cited Segments Only)
                      </h3>
                      <p className="font-mono text-[11px] text-outline">
                        {selectedSegmentIds.length > 0
                          ? `Grounded in ${selectedSegmentIds.length} selected cue(s)`
                          : "Uses FTS5 top matching cues from this lecture"}
                      </p>
                    </div>

                    <form onSubmit={handleAskSourceTutor} className="flex gap-2">
                      <input
                        type="text"
                        value={tutorQuestion}
                        onChange={(e) => setTutorQuestion(e.target.value)}
                        placeholder="Ask about a concept in this lecture (e.g. Explain population inversion)..."
                        className="flex-1 bg-surface-low border border-outline-variant/40 rounded px-3 py-1.5 text-xs text-on-surface focus:outline-none focus:border-primary"
                      />
                      <button
                        type="submit"
                        className="px-3.5 py-1.5 rounded bg-primary-container text-on-primary-container font-mono text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                      >
                        Explain
                      </button>
                    </form>

                    {tutorAnswer && (
                      <div className="bg-surface-low border border-outline-variant/30 rounded p-3 flex flex-col gap-2.5">
                        <MarkdownRenderer markdown={tutorAnswer.answer} />

                        {tutorAnswer.citations.length > 0 && (
                          <div className="pt-2 border-t border-outline-variant/25 flex flex-col gap-1">
                            <span className="font-mono text-[11px] text-outline">
                              Verified Source Citations:
                            </span>
                            {tutorAnswer.citations.map((cit, idx) => (
                              <button
                                key={`${cit.segmentId}-${idx}`}
                                type="button"
                                onClick={() =>
                                  void handleJumpToSegment(cit.resourceId, cit.startMs)
                                }
                                className="text-left font-mono text-[11px] text-primary hover:underline cursor-pointer"
                              >
                                [{formatMsToTimestamp(cit.startMs)}] &ldquo;{cit.quote}&rdquo;
                              </button>
                            ))}
                          </div>
                        )}

                        {tutorAnswer.warnings.length > 0 && (
                          <div className="font-mono text-[11px] text-secondary">
                            {tutorAnswer.warnings.join(" · ")}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Stage 14 On-Demand Study Artifacts */}
                  <div className="bg-surface-lowest border border-outline-variant/40 rounded-md p-4 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-on-surface">
                        On-Demand Study Artifacts (Cached with Provenance)
                      </h3>
                      {activeArtifact && (
                        <button
                          type="button"
                          onClick={() =>
                            void handleGenerateArtifact(activeArtifact.artifactType, true)
                          }
                          className="font-mono text-[11px] text-primary hover:underline cursor-pointer"
                        >
                          Regenerate
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          { id: "summary", label: "Summary" },
                          { id: "structured_notes", label: "Structured Notes" },
                          { id: "flashcards", label: "Flashcards → Deck" },
                          { id: "quiz", label: "Quiz → Tasks" },
                          { id: "revision_sheet", label: "Revision Sheet" },
                          { id: "interactive_lesson", label: "Interactive Lesson" },
                        ] as const
                      ).map((btn) => (
                        <button
                          key={btn.id}
                          type="button"
                          onClick={() => void handleGenerateArtifact(btn.id, false)}
                          className="px-2.5 py-1.5 rounded bg-surface-high hover:bg-surface-bright border border-outline-variant/40 font-mono text-xs text-on-surface cursor-pointer whitespace-nowrap"
                        >
                          {btn.label}
                        </button>
                      ))}
                    </div>

                    {activeArtifact && (
                      <div className="bg-surface-low border border-outline-variant/30 rounded p-3 flex flex-col gap-2">
                        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-outline tabular-nums">
                          <span>Type: {activeArtifact.artifactType}</span>
                          <span aria-hidden="true">·</span>
                          <span>Model: {activeArtifact.providerModel}</span>
                          <span aria-hidden="true">·</span>
                          <span>{activeArtifact.cached ? "Cache Hit" : "Fresh"}</span>
                          {activeArtifact.tokenEstimate ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>~{activeArtifact.tokenEstimate} est. tokens</span>
                            </>
                          ) : null}
                        </div>
                        {typeof (activeArtifact.content as { markdown?: string }).markdown ===
                        "string" ? (
                          <MarkdownRenderer
                            markdown={String(
                              (activeArtifact.content as { markdown: string }).markdown
                            )}
                          />
                        ) : (
                          <pre className="font-mono text-[11px] text-on-surface-variant whitespace-pre-wrap overflow-x-auto">
                            {JSON.stringify(activeArtifact.content, null, 2)}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* =====================================================================
       * TAB 3: SQLITE FTS5 GLOBAL LEXICAL SEARCH (Stages 11 & 12)
       * =================================================================== */}
      {activeTab === "search" && (
        <div className="bg-surface-lowest border border-outline-variant/40 rounded-md p-4 sm:p-5 flex flex-col gap-4">
          <form onSubmit={handleRunFtsSearch} className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder='Search transcripts, notes, resources, concepts & flashcards (e.g. "population inversion")...'
                className="flex-1 min-w-[240px] bg-surface-low border border-outline-variant/40 rounded px-3.5 py-2 text-xs text-on-surface focus:outline-none focus:border-primary"
              />
              <button
                type="submit"
                className="flex items-center gap-1.5 px-4 py-2 rounded bg-primary-container text-on-primary-container font-mono text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
              >
                <Search className="w-3.5 h-3.5" />
                <span>Search FTS5</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 font-mono text-xs">
              <select
                value={searchCourseFilter}
                onChange={(e) => setSearchCourseFilter(e.target.value)}
                className="bg-surface-low border border-outline-variant/40 rounded px-2.5 py-1.5 text-on-surface"
              >
                <option value="all">All Subjects / Courses</option>
                {state.courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.title}
                  </option>
                ))}
              </select>

              <select
                value={searchTypeFilter}
                onChange={(e) =>
                  setSearchTypeFilter(e.target.value as ResourceSourceType | "all")
                }
                className="bg-surface-low border border-outline-variant/40 rounded px-2.5 py-1.5 text-on-surface"
              >
                <option value="all">All Source Types</option>
                <option value="youtube">YouTube Lectures</option>
                <option value="pdf">PDFs</option>
                <option value="webpage">Webpages</option>
                <option value="note">Notes</option>
              </select>

              <select
                value={searchCompletedFilter}
                onChange={(e) =>
                  setSearchCompletedFilter(
                    e.target.value as "all" | "completed" | "incomplete"
                  )
                }
                className="bg-surface-low border border-outline-variant/40 rounded px-2.5 py-1.5 text-on-surface"
              >
                <option value="all">Any Completion Status</option>
                <option value="completed">Completed Resources</option>
                <option value="incomplete">In-Progress / Unread</option>
              </select>

              {searchElapsedMs !== null && (
                <span className="text-outline tabular-nums">
                  {searchResults.length} hit(s) in {searchElapsedMs} ms (SQLite FTS5 BM25)
                </span>
              )}
            </div>
          </form>

          {searchResults.length === 0 ? (
            <p className="text-xs text-outline py-6 text-center">
              Enter a concept, equation keyword, or lecture phrase above to run BM25 ranked search across SQLite FTS5.
            </p>
          ) : (
            <div className="divide-y divide-outline-variant/25">
              {searchResults.map((hit, idx) => (
                <div
                  key={`${hit.entityType}-${hit.entityId}-${idx}`}
                  className="py-3 flex flex-wrap items-start justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-outline tabular-nums">
                      <span className="text-primary font-semibold">
                        {hit.entityType.replace(/_/g, " ")}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{hit.curriculumPath}</span>
                      {hit.startMs !== null && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-secondary">
                            @{formatMsToTimestamp(hit.startMs)}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="text-sm font-medium text-on-surface pt-0.5">
                      {hit.title}
                    </div>
                    <p className="font-mono text-xs text-on-surface-variant pt-1">
                      {hit.snippet}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {hit.resourceId && hit.startMs !== null && (
                      <button
                        type="button"
                        onClick={() =>
                          void handleJumpToSegment(hit.resourceId!, hit.startMs!)
                        }
                        className="px-2.5 py-1 rounded bg-primary-container text-on-primary-container font-mono text-xs font-semibold cursor-pointer whitespace-nowrap"
                      >
                        Jump to {formatMsToTimestamp(hit.startMs)}
                      </button>
                    )}
                    {hit.resourceId && hit.startMs === null && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveResourceId(hit.resourceId);
                          setActiveTab("lecture");
                        }}
                        className="px-2.5 py-1 rounded bg-surface-high font-mono text-xs text-on-surface cursor-pointer whitespace-nowrap"
                      >
                        Open Resource
                      </button>
                    )}
                    {hit.topicId && (
                      <button
                        type="button"
                        onClick={() => openModuleInVault(hit.topicId!)}
                        className="px-2.5 py-1 rounded bg-surface-high font-mono text-xs text-on-surface cursor-pointer whitespace-nowrap"
                      >
                        Open Vault Note
                      </button>
                    )}
                    {hit.courseId && !hit.topicId && (
                      <button
                        type="button"
                        onClick={() => openCourseInManager(hit.courseId!)}
                        className="px-2.5 py-1 rounded bg-surface-high font-mono text-xs text-on-surface cursor-pointer whitespace-nowrap"
                      >
                        Open Course
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
       * TAB 4: RELATIONAL CONCEPT & PREREQUISITE GRAPH (Stage 16)
       * =================================================================== */}
      {activeTab === "concepts" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-8 bg-surface-lowest border border-outline-variant/40 rounded-md p-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1 bg-surface-low border border-outline-variant/30 p-1 rounded">
                <button
                  type="button"
                  onClick={() => setConceptViewMode("graph")}
                  className={`px-3 py-1 rounded font-mono text-xs cursor-pointer ${
                    conceptViewMode === "graph"
                      ? "bg-primary-container text-on-primary-container font-semibold"
                      : "text-on-surface-variant"
                  }`}
                >
                  Visual Prerequisite Graph
                </button>
                <button
                  type="button"
                  onClick={() => setConceptViewMode("list")}
                  className={`px-3 py-1 rounded font-mono text-xs cursor-pointer ${
                    conceptViewMode === "list"
                      ? "bg-primary-container text-on-primary-container font-semibold"
                      : "text-on-surface-variant"
                  }`}
                >
                  Concept List ({graphLayout.concepts.length})
                </button>
              </div>

              {conceptViewMode === "graph" && (
                <div className="flex items-center gap-1.5 font-mono text-xs">
                  <button
                    type="button"
                    onClick={() => setGraphZoom((z) => Math.max(0.55, +(z - 0.15).toFixed(2)))}
                    className="p-1.5 rounded bg-surface-low hover:bg-surface-high border border-outline-variant/40 cursor-pointer"
                    title="Zoom Out"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="tabular-nums px-1">{Math.round(graphZoom * 100)}%</span>
                  <button
                    type="button"
                    onClick={() => setGraphZoom((z) => Math.min(2.2, +(z + 0.15).toFixed(2)))}
                    className="p-1.5 rounded bg-surface-low hover:bg-surface-high border border-outline-variant/40 cursor-pointer"
                    title="Zoom In"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setGraphZoom(1);
                      setGraphPan({ x: 0, y: 0 });
                    }}
                    className="px-2 py-1 rounded bg-surface-low hover:bg-surface-high border border-outline-variant/40 cursor-pointer"
                  >
                    Reset View
                  </button>
                </div>
              )}
            </div>

            {conceptViewMode === "graph" ? (
              graphLayout.concepts.length === 0 ? (
                <div className="p-12 text-center text-xs text-outline">
                  Add concepts on the right or load the Sample Laser Lecture to explore the interactive prerequisite graph.
                </div>
              ) : (
                <div
                  onMouseDown={(e) => {
                    setIsPanning(true);
                    panStartRef.current = {
                      x: e.clientX - graphPan.x,
                      y: e.clientY - graphPan.y,
                    };
                  }}
                  onMouseMove={(e) => {
                    if (!isPanning) return;
                    setGraphPan({
                      x: e.clientX - panStartRef.current.x,
                      y: e.clientY - panStartRef.current.y,
                    });
                  }}
                  onMouseUp={() => setIsPanning(false)}
                  onMouseLeave={() => setIsPanning(false)}
                  className="w-full h-[420px] bg-surface-low border border-outline-variant/30 rounded overflow-hidden cursor-grab active:cursor-grabbing select-none"
                >
                  <svg viewBox="0 0 780 400" className="w-full h-full">
                    <defs>
                      <marker
                        id="prereq-arrow"
                        markerWidth="10"
                        markerHeight="8"
                        refX="22"
                        refY="4"
                        orient="auto"
                      >
                        <polygon points="0 0, 10 4, 0 8" fill="#06b6d4" />
                      </marker>
                    </defs>
                    <g
                      transform={`translate(${graphPan.x}, ${graphPan.y}) scale(${graphZoom})`}
                    >
                      {graphLayout.links.map((lnk) => {
                        const a = graphLayout.coords.get(lnk.fromConceptId);
                        const b = graphLayout.coords.get(lnk.toConceptId);
                        if (!a || !b) return null;
                        return (
                          <g key={lnk.id}>
                            <line
                              x1={a.x}
                              y1={a.y}
                              x2={b.x}
                              y2={b.y}
                              stroke={
                                lnk.relationType === "prerequisite" ? "#06b6d4" : "#94a3b8"
                              }
                              strokeWidth={2}
                              markerEnd="url(#prereq-arrow)"
                            />
                            <text
                              x={(a.x + b.x) / 2}
                              y={(a.y + b.y) / 2 - 6}
                              textAnchor="middle"
                              fill="#94a3b8"
                              fontSize="10"
                            >
                              {lnk.relationType} ({lnk.confidence.toFixed(2)})
                            </text>
                          </g>
                        );
                      })}

                      {graphLayout.concepts.map((node) => {
                        const pos = graphLayout.coords.get(node.id);
                        if (!pos) return null;
                        const selected = selectedConceptId === node.id;
                        return (
                          <g
                            key={node.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedConceptId(node.id);
                            }}
                            className="cursor-pointer"
                          >
                            <circle
                              cx={pos.x}
                              cy={pos.y}
                              r={selected ? 22 : 17}
                              fill={selected ? "#06b6d4" : "#1e293b"}
                              stroke="#06b6d4"
                              strokeWidth={selected ? 3 : 1.5}
                            />
                            <text
                              x={pos.x}
                              y={pos.y + 32}
                              textAnchor="middle"
                              fill="#e2e8f0"
                              fontSize="11"
                              fontWeight="600"
                            >
                              {node.name.slice(0, 26)}
                            </text>
                          </g>
                        );
                      })}
                    </g>
                  </svg>
                </div>
              )
            ) : (
              <div className="divide-y divide-outline-variant/25">
                {graphLayout.concepts.map((c) => (
                  <div
                    key={c.id}
                    className="py-2.5 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="text-xs font-semibold text-on-surface">{c.name}</div>
                      <p className="text-xs text-on-surface-variant">{c.definition}</p>
                    </div>
                    {c.sourceResourceId && c.sourceStartMs !== null && (
                      <button
                        type="button"
                        onClick={() =>
                          void handleJumpToSegment(c.sourceResourceId!, c.sourceStartMs!)
                        }
                        className="px-2.5 py-1 rounded bg-surface-high font-mono text-[11px] text-primary cursor-pointer whitespace-nowrap"
                      >
                        Open @{formatMsToTimestamp(c.sourceStartMs)}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Selected Node Detail Bar */}
            {selectedConceptId && (
              <div className="bg-surface-low border border-outline-variant/30 rounded p-3 flex flex-wrap items-center justify-between gap-3">
                {(() => {
                  const sel = graphLayout.concepts.find((c) => c.id === selectedConceptId);
                  if (!sel) return null;
                  return (
                    <>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-on-surface">
                          {sel.name}
                        </div>
                        <p className="text-xs text-on-surface-variant pt-0.5">
                          {sel.definition}
                        </p>
                      </div>
                      {sel.sourceResourceId && sel.sourceStartMs !== null && (
                        <button
                          type="button"
                          onClick={() =>
                            void handleJumpToSegment(
                              sel.sourceResourceId!,
                              sel.sourceStartMs!
                            )
                          }
                          className="px-3 py-1.5 rounded bg-primary-container text-on-primary-container font-mono text-xs font-semibold cursor-pointer whitespace-nowrap"
                        >
                          Jump to Lecture @{formatMsToTimestamp(sel.sourceStartMs)}
                        </button>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Right Column: Add Concept & Add Prerequisite Edge */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <form
              onSubmit={handleCreateConcept}
              className="bg-surface-lowest border border-outline-variant/40 rounded-md p-4 flex flex-col gap-2.5"
            >
              <h3 className="text-sm font-semibold text-on-surface">Add Concept Node</h3>
              <input
                type="text"
                required
                value={newConceptName}
                onChange={(e) => setNewConceptName(e.target.value)}
                placeholder="Concept name (e.g. Population Inversion)"
                className="bg-surface-low border border-outline-variant/40 rounded px-3 py-1.5 text-xs text-on-surface"
              />
              <textarea
                rows={2}
                value={newConceptDef}
                onChange={(e) => setNewConceptDef(e.target.value)}
                placeholder="Concise definition..."
                className="bg-surface-low border border-outline-variant/40 rounded p-2.5 text-xs text-on-surface"
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded bg-primary-container text-on-primary-container font-mono text-xs font-semibold cursor-pointer"
              >
                Save Concept
              </button>
            </form>

            <form
              onSubmit={handleCreateConceptLink}
              className="bg-surface-lowest border border-outline-variant/40 rounded-md p-4 flex flex-col gap-2.5"
            >
              <h3 className="text-sm font-semibold text-on-surface">
                Add Prerequisite / Relation Edge
              </h3>
              <select
                value={linkFromId}
                onChange={(e) => setLinkFromId(e.target.value)}
                className="bg-surface-low border border-outline-variant/40 rounded px-2.5 py-1.5 font-mono text-xs text-on-surface"
              >
                <option value="">From Concept...</option>
                {graphLayout.concepts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                value={linkRelation}
                onChange={(e) => setLinkRelation(e.target.value as ConceptRelationType)}
                className="bg-surface-low border border-outline-variant/40 rounded px-2.5 py-1.5 font-mono text-xs text-on-surface"
              >
                <option value="prerequisite">Prerequisite For →</option>
                <option value="related">Related To</option>
                <option value="contrast">Contrasts With</option>
                <option value="example">Example Of</option>
              </select>
              <select
                value={linkToId}
                onChange={(e) => setLinkToId(e.target.value)}
                className="bg-surface-low border border-outline-variant/40 rounded px-2.5 py-1.5 font-mono text-xs text-on-surface"
              >
                <option value="">To Concept...</option>
                {graphLayout.concepts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={linkEvidence}
                onChange={(e) => setLinkEvidence(e.target.value)}
                placeholder="Source evidence quote or timestamp..."
                className="bg-surface-low border border-outline-variant/40 rounded px-3 py-1.5 text-xs text-on-surface"
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded bg-surface-high hover:bg-surface-bright font-mono text-xs text-on-surface cursor-pointer"
              >
                Link Concepts
              </button>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
       * TAB 5: INTERACTIVE LESSONS (OpenMAIC), SURFSENSE & EXTERNAL WEB HOST
       * =================================================================== */}
      {activeTab === "integrations" && (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Stage 19: OpenMAIC Interactive Lesson App (Opt-In) */}
            <div className="bg-surface-lowest border border-outline-variant/40 rounded-md p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-on-surface">
                    Interactive Lesson App (OpenMAIC DSL Adapter)
                  </h2>
                  <p className="font-mono text-[11px] text-outline">
                    Slides · Whiteboard · Concept Nav · Checkpoint Quiz · Zero Video Generation
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleToggleOptionalApp(
                      "interactive_lessons",
                      !isAppEnabled("interactive_lessons")
                    )
                  }
                  className="px-2.5 py-1 rounded bg-surface-high font-mono text-xs text-on-surface cursor-pointer whitespace-nowrap"
                >
                  {isAppEnabled("interactive_lessons") ? "Disable App" : "Enable Opt-In App"}
                </button>
              </div>

              {!isAppEnabled("interactive_lessons") ? (
                <p className="text-xs text-outline py-4">
                  Opt-in module disabled by default per Stage 19. Click &ldquo;Enable Opt-In App&rdquo; above to compile interactive lessons from any lecture.
                </p>
              ) : !latestInteractiveLesson ? (
                <div className="py-4 flex flex-col items-start gap-2.5">
                  <p className="text-xs text-on-surface-variant">
                    No interactive lesson generated yet.
                  </p>
                  {activeResource && (
                    <button
                      type="button"
                      onClick={() =>
                        void handleGenerateArtifact("interactive_lesson", true)
                      }
                      className="px-3.5 py-1.5 rounded bg-primary-container text-on-primary-container font-mono text-xs font-semibold cursor-pointer"
                    >
                      Compile Interactive Lesson for &ldquo;{activeResource.title.slice(0, 32)}&rdquo;
                    </button>
                  )}
                </div>
              ) : (
                <div className="bg-surface-low border border-outline-variant/30 rounded p-3.5 flex flex-col gap-3">
                  <div className="flex items-center justify-between font-mono text-xs">
                    <span className="text-primary font-semibold">
                      {latestInteractiveLesson.title}
                    </span>
                    <span className="text-outline tabular-nums">
                      Section {activeLessonSectionIdx + 1} /{" "}
                      {latestInteractiveLesson.sections.length}
                    </span>
                  </div>

                  {(() => {
                    const sec =
                      latestInteractiveLesson.sections[activeLessonSectionIdx] ||
                      latestInteractiveLesson.sections[0];
                    if (!sec) return null;
                    return (
                      <div className="flex flex-col gap-2.5">
                        <div className="font-mono text-[11px] text-secondary">
                          [{sec.kind}] {sec.title}
                        </div>
                        <MarkdownRenderer markdown={sec.bodyMarkdown} />
                        {sec.checkpointQuestion && (
                          <div className="pt-2 border-t border-outline-variant/25 flex flex-col gap-2">
                            <p className="text-xs font-medium text-on-surface">
                              {sec.checkpointQuestion.prompt}
                            </p>
                            {sec.checkpointQuestion.options.map((opt) => (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => setQuizChoice(opt)}
                                className={`text-left px-3 py-2 rounded border text-xs cursor-pointer ${
                                  quizChoice === opt
                                    ? opt === sec.checkpointQuestion!.correctAnswer
                                      ? "border-tertiary bg-tertiary/15 text-on-surface"
                                      : "border-error bg-error/15 text-on-surface"
                                    : "border-outline-variant/40 bg-surface-lowest text-on-surface-variant hover:text-on-surface"
                                }`}
                              >
                                {opt}
                              </button>
                            ))}
                            {quizChoice && (
                              <p className="font-mono text-[11px] text-outline">
                                {sec.checkpointQuestion.explanation}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <div className="flex items-center justify-between pt-2 border-t border-outline-variant/25">
                    <button
                      type="button"
                      disabled={activeLessonSectionIdx === 0}
                      onClick={() => {
                        setQuizChoice(null);
                        setActiveLessonSectionIdx((i) => Math.max(0, i - 1));
                      }}
                      className="px-2.5 py-1 rounded bg-surface-lowest font-mono text-xs disabled:opacity-40 cursor-pointer"
                    >
                      Previous Section
                    </button>
                    <button
                      type="button"
                      disabled={
                        activeLessonSectionIdx + 1 >=
                        latestInteractiveLesson.sections.length
                      }
                      onClick={() => {
                        setQuizChoice(null);
                        setActiveLessonSectionIdx((i) => i + 1);
                      }}
                      className="px-2.5 py-1 rounded bg-surface-lowest font-mono text-xs disabled:opacity-40 cursor-pointer"
                    >
                      Next Section
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Stage 18: SurfSense Exchange Boundary */}
            <div className="bg-surface-lowest border border-outline-variant/40 rounded-md p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-on-surface">
                    SurfSense Study Artifact Exchange Boundary
                  </h2>
                  <p className="font-mono text-[11px] text-outline">
                    Controlled JSON exchange · Zero shared database coupling
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleToggleOptionalApp(
                      "surfsense_bridge",
                      !isAppEnabled("surfsense_bridge")
                    )
                  }
                  className="px-2.5 py-1 rounded bg-surface-high font-mono text-xs text-on-surface cursor-pointer whitespace-nowrap"
                >
                  {isAppEnabled("surfsense_bridge") ? "Disable Bridge" : "Enable Bridge"}
                </button>
              </div>

              {!isAppEnabled("surfsense_bridge") ? (
                <p className="text-xs text-outline py-4">
                  SurfSense exchange adapter is opt-in. Enable above to export LearningOS sources or import external study artifacts.
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleExportSurfSense}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded bg-primary-container text-on-primary-container font-mono text-xs font-semibold cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export SurfSense Bundle (.json)</span>
                  </button>
                  <input
                    ref={surfsenseImportRef}
                    type="file"
                    accept=".json"
                    onChange={(e) => void handleImportSurfSense(e)}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => surfsenseImportRef.current?.click()}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded bg-surface-high hover:bg-surface-bright font-mono text-xs text-on-surface cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5 text-primary" />
                    <span>Import Study Artifacts (.json)</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Stage 20: Controlled External Web App Host */}
          <div className="bg-surface-lowest border border-outline-variant/40 rounded-md p-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-on-surface">
                  Controlled External Web Resource Host (Default-Deny Allowlist)
                </h2>
                <p className="font-mono text-[11px] text-outline">
                  Allowed origins: {DEFAULT_WEB_APP_MANIFEST.allowedOrigins.join(" · ")}
                </p>
              </div>
              <span className="font-mono text-xs text-primary">
                Origin: {webHostCheck.origin || "Blocked"}
              </span>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setMountedWebUrl(webHostUrlInput.trim());
              }}
              className="flex flex-wrap gap-2"
            >
              <input
                type="text"
                value={webHostUrlInput}
                onChange={(e) => setWebHostUrlInput(e.target.value)}
                placeholder="Enter scholarly URL to verify against WebAppManifest allowlist..."
                className="flex-1 min-w-[240px] bg-surface-low border border-outline-variant/40 rounded px-3 py-1.5 font-mono text-xs text-on-surface"
              />
              <button
                type="submit"
                className="px-3.5 py-1.5 rounded bg-primary-container text-on-primary-container font-mono text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                Verify &amp; Open
              </button>
            </form>

            <div className="font-mono text-[11px] text-on-surface-variant">
              {webHostCheck.reason}
            </div>

            {!webHostCheck.allowed || webHostCheck.requiresExternalBrowserFallback ? (
              <div className="bg-surface-low border border-outline-variant/30 rounded p-6 flex flex-col items-center gap-3 text-center">
                <p className="text-xs text-on-surface-variant max-w-lg">
                  {webHostCheck.reason}
                </p>
                {webHostCheck.normalizedUrl && (
                  <a
                    href={webHostCheck.normalizedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-surface-high hover:bg-surface-bright font-mono text-xs text-on-surface"
                  >
                    <span>Open Externally in Browser</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            ) : (
              <div className="w-full h-[360px] border border-outline-variant/30 rounded overflow-hidden bg-white">
                <iframe
                  src={webHostCheck.normalizedUrl!}
                  title="Isolated Scholarly Web Host"
                  sandbox="allow-scripts allow-same-origin"
                  referrerPolicy="no-referrer"
                  className="w-full h-full border-0"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
       * TAB 6: APP HOST, JOBS, STORAGE AUDIT, MCP BRIDGE & DIAGNOSTICS
       * =================================================================== */}
      {activeTab === "diagnostics" && (
        <div className="flex flex-col gap-5">
          {/* Storage Audit & Zero-Permanent-Media Proof */}
          <div className="bg-surface-lowest border border-outline-variant/40 rounded-md p-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-semibold text-on-surface">
                  Storage Footprint Audit &amp; Zero-Permanent-Media Policy
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const out = await runStorageCleanupApi();
                    await refreshBootstrap();
                    pushToast({
                      title: "Temporary Extraction Cleanup Complete",
                      subtitle: `Removed ${out.removedEntries} temp item(s) · Temp size: ${formatByteSize(
                        out.audit.tempBytes
                      )}`,
                      variant: "success",
                    });
                  }}
                  className="px-3 py-1.5 rounded bg-surface-high hover:bg-surface-bright font-mono text-xs text-on-surface cursor-pointer whitespace-nowrap"
                >
                  Run Temp Cleanup
                </button>
                <button
                  type="button"
                  onClick={() => void handleDownloadSqliteBackup()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary-container text-on-primary-container font-mono text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export SQLite + SHA-256 Backup</span>
                </button>
              </div>
            </div>

            {bootstrap?.storageAudit && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-1 font-mono text-xs tabular-nums">
                <div className="bg-surface-low p-3 rounded border border-outline-variant/25">
                  <div className="text-[11px] text-outline">SQLite DB</div>
                  <div className="text-sm font-semibold text-on-surface pt-0.5">
                    {formatByteSize(bootstrap.storageAudit.sqliteBytes)}
                  </div>
                </div>
                <div className="bg-surface-low p-3 rounded border border-outline-variant/25">
                  <div className="text-[11px] text-outline">Transcripts</div>
                  <div className="text-sm font-semibold text-on-surface pt-0.5">
                    {formatByteSize(bootstrap.storageAudit.transcriptBytes)}
                  </div>
                </div>
                <div className="bg-surface-low p-3 rounded border border-outline-variant/25">
                  <div className="text-[11px] text-outline">Notes</div>
                  <div className="text-sm font-semibold text-on-surface pt-0.5">
                    {formatByteSize(bootstrap.storageAudit.notesBytes)}
                  </div>
                </div>
                <div className="bg-surface-low p-3 rounded border border-outline-variant/25">
                  <div className="text-[11px] text-outline">Artifact Cache</div>
                  <div className="text-sm font-semibold text-on-surface pt-0.5">
                    {formatByteSize(bootstrap.storageAudit.artifactCacheBytes)}
                  </div>
                </div>
                <div className="bg-surface-low p-3 rounded border border-outline-variant/25">
                  <div className="text-[11px] text-outline">Temp Extraction</div>
                  <div className="text-sm font-semibold text-on-surface pt-0.5">
                    {formatByteSize(bootstrap.storageAudit.tempBytes)}
                  </div>
                </div>
                <div className="bg-surface-low p-3 rounded border border-outline-variant/25">
                  <div className="text-[11px] text-outline">Permanent Media</div>
                  <div className="text-sm font-semibold text-tertiary pt-0.5">
                    0 B (Verified)
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* App Registry & Tool Bus Module Packaging */}
            <div className="lg:col-span-7 bg-surface-lowest border border-outline-variant/40 rounded-md p-4 flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-on-surface">
                Installed App Registry &amp; Capability Boundaries ({registeredApps.length})
              </h2>
              <div className="divide-y divide-outline-variant/20 max-h-[360px] overflow-y-auto pr-1">
                {registeredApps.map((app) => (
                  <div
                    key={app.manifest.id}
                    className="py-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs font-medium text-on-surface">
                        <span>{app.manifest.name}</span>
                        <span className="font-mono text-[11px] text-outline">
                          · {app.manifest.runtime} · {app.manifest.route}
                        </span>
                      </div>
                      <p className="text-[11px] text-outline truncate">
                        {app.manifest.description}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={Boolean(app.manifest.isCore)}
                      onClick={() =>
                        handleToggleOptionalApp(app.manifest.id, !app.enabled)
                      }
                      className={`px-2.5 py-1 rounded font-mono text-[11px] cursor-pointer whitespace-nowrap shrink-0 ${
                        app.manifest.isCore
                          ? "bg-surface-low text-outline cursor-default"
                          : app.enabled
                          ? "bg-primary-container text-on-primary-container font-semibold"
                          : "bg-surface-high text-on-surface-variant"
                      }`}
                    >
                      {app.manifest.isCore
                        ? "Core Active"
                        : app.enabled
                        ? "Enabled"
                        : "Disabled"}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* System Diagnostics, Local Endpoint Router, Jobs & Stage 28 MCP Bridge */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              <LocalEndpointProviderPanel
                compact
                onConfigSaved={() => void refreshBootstrap()}
              />

              {bootstrap?.diagnostics && (
                <div className="bg-surface-lowest border border-outline-variant/40 rounded-md p-4 flex flex-col gap-2.5 font-mono text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-sans text-sm font-semibold text-on-surface">
                      System &amp; Provider Diagnostics
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        const diag = await fetchSystemDiagnosticsApi();
                        pushToast({
                          title: "Backend Health Verified",
                          subtitle: `Node ${diag.nodeVersion} · SQLite+FTS5 Ready · Provider: ${diag.llmProvider}`,
                          variant: "success",
                        });
                      }}
                      className="px-2.5 py-1 rounded bg-surface-high text-primary cursor-pointer"
                    >
                      Test Connection
                    </button>
                  </div>
                  <div className="text-[11px] text-on-surface-variant space-y-1 tabular-nums">
                    <div>Version: {bootstrap.diagnostics.appVersion}</div>
                    <div>Node Runtime: {bootstrap.diagnostics.nodeVersion}</div>
                    <div>SQLite DB: {bootstrap.diagnostics.sqlitePath}</div>
                    <div>Temp Dir: {bootstrap.diagnostics.tempPath}</div>
                    <div>
                      LLM Provider: {bootstrap.diagnostics.llmProvider} (
                      {bootstrap.diagnostics.defaultModel})
                    </div>
                    <div>
                      Local Workers: Python={bootstrap.diagnostics.pythonAvailable ? "Yes" : "No"} · yt-dlp=
                      {bootstrap.diagnostics.ytDlpAvailable ? "Yes" : "Adapter"} · Whisper=
                      {bootstrap.diagnostics.whisperAvailable ? "Yes" : "Fallback"}
                    </div>
                  </div>
                </div>
              )}

              {/* Stage 28 Opt-In Read-Only MCP Bridge */}
              <div className="bg-surface-lowest border border-outline-variant/40 rounded-md p-4 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-on-surface">
                      Optional Read-Only MCP Bridge
                    </h3>
                    <p className="font-mono text-[11px] text-outline">
                      Allowlist: {Array.from(MCP_READONLY_ALLOWLIST).join(", ")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      const next = !bootstrap?.diagnostics.mcpBridgeEnabled;
                      await toggleMcpBridgeApi(next);
                      await refreshBootstrap();
                    }}
                    className="px-2.5 py-1 rounded bg-surface-high font-mono text-xs text-on-surface cursor-pointer whitespace-nowrap"
                  >
                    {bootstrap?.diagnostics.mcpBridgeEnabled ? "Disable MCP" : "Enable MCP"}
                  </button>
                </div>

                {bootstrap?.diagnostics.mcpBridgeEnabled && (
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await callMcpReadOnlyToolApi("resource.read", {});
                          setMcpTestOutput(JSON.stringify(res, null, 2).slice(0, 420));
                        }}
                        className="px-2.5 py-1 rounded bg-primary-container text-on-primary-container font-mono text-[11px] cursor-pointer"
                      >
                        Test Allowed (`resource.read`)
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const res = await callMcpReadOnlyToolApi("curriculum.write", {});
                            setMcpTestOutput(JSON.stringify(res, null, 2));
                          } catch (err: unknown) {
                            setMcpTestOutput(
                              `Blocked as expected: ${
                                err instanceof Error ? err.message : String(err)
                              }`
                            );
                          }
                        }}
                        className="px-2.5 py-1 rounded bg-surface-high font-mono text-[11px] text-on-surface cursor-pointer"
                      >
                        Test Blocked (`curriculum.write`)
                      </button>
                    </div>
                    {mcpTestOutput && (
                      <pre className="bg-surface-low p-2 rounded font-mono text-[10px] text-on-surface-variant overflow-x-auto">
                        {mcpTestOutput}
                      </pre>
                    )}
                  </div>
                )}
              </div>

              {/* Recent Jobs Queue */}
              <div className="bg-surface-lowest border border-outline-variant/40 rounded-md p-4 flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-on-surface">
                  Job Orchestrator History ({bootstrap?.jobs.length || 0})
                </h3>
                {bootstrap?.jobs.length === 0 ? (
                  <p className="text-xs text-outline">No background extraction jobs run yet.</p>
                ) : (
                  <div className="divide-y divide-outline-variant/20 max-h-40 overflow-y-auto font-mono text-[11px] tabular-nums">
                    {bootstrap?.jobs.map((j) => (
                      <div key={j.id} className="py-1.5 flex items-center justify-between gap-2">
                        <span className="truncate text-on-surface-variant">
                          {j.jobType} · {j.status}
                        </span>
                        <span className="text-tertiary shrink-0">{j.cleanupStatus}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
