import type {
  AutonomousSyncResult,
  DeepResearchReportData,
  GeneratedCurriculum,
  GeneratedCurriculumUnit,
  GeneratedFlashcardSeed,
  GeneratedMilestoneSeed,
  GeneratedStudyBlockSeed,
  IntegrativeLabBlueprint,
  LearnerLevel,
  UploadedNoteDocument,
} from "../types/studyOS";
import { normalizeCourseTags } from "../lib/gamification";
import {
  compileIntegrativeLabBlueprint,
  synthesizeDeterministicAutonomousNotes,
  synthesizeDeterministicCurriculum,
  synthesizeDeterministicResearchReport,
  synthesizeDeterministicVaultAssist,
} from "../lib/integrativePhysicsEngine";

import { resolveApiUrl } from "../lib/apiBase";

export interface AIEngineStatus {
  connected: boolean;
  cloudConfigured?: boolean;
  provider: string;
  defaultModel: string;
  endpointLabel?: string;
  isLocalEndpoint?: boolean;
  availableModels: Array<{ id: string; label: string }>;
}

function deriveCourseCodePrefix(titleOrCategory: string): string {
  const letters = titleOrCategory
    .replace(/[^a-zA-Z\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (letters.length >= 2) {
    return `${letters[0][0]}${letters[1][0]}${letters[2]?.[0] || ""}`.toUpperCase();
  }
  if (letters.length === 1 && letters[0].length >= 3) {
    return letters[0].slice(0, 3).toUpperCase();
  }
  return "STD";
}

export function normalizeCurriculumPayload(
  raw: Partial<GeneratedCurriculum>,
  fallbackTopic: string,
  fallbackCategory: string = "Integrative Physics & Mathematics"
): GeneratedCurriculum {
  const effectiveTopic = (fallbackTopic || raw.courseTitle || "Custom Curriculum").trim();
  const rawUnits = Array.isArray(raw.units) ? raw.units : [];
  const units: GeneratedCurriculumUnit[] = rawUnits
    .filter((u) => u && typeof u.title === "string" && u.title.trim().length > 0)
    .map((u) => ({
      title: u.title.trim(),
      estimatedHours:
        typeof u.estimatedHours === "number" &&
        Number.isFinite(u.estimatedHours) &&
        u.estimatedHours > 0
          ? Math.round(u.estimatedHours * 10) / 10
          : 2.5,
      keyConcepts: Array.isArray(u.keyConcepts)
        ? u.keyConcepts.map((k) => String(k).trim()).filter(Boolean).slice(0, 6)
        : ["Core Concepts"],
      searchQueryForVideo:
        typeof u.searchQueryForVideo === "string" && u.searchQueryForVideo.trim()
          ? u.searchQueryForVideo.trim()
          : `${u.title.trim()} lecture tutorial`,
      briefOverview:
        typeof u.briefOverview === "string" && u.briefOverview.trim()
          ? u.briefOverview.trim()
          : `Comprehensive study unit covering ${u.title.trim()}.`,
      starterNotesMarkdown:
        typeof u.starterNotesMarkdown === "string" && u.starterNotesMarkdown.trim()
          ? u.starterNotesMarkdown.trim()
          : `# ${u.title.trim()}\n\n${u.briefOverview || ""}\n\n## Key Concepts\n${(
              u.keyConcepts || []
            )
              .map((c) => `- ${c}`)
              .join("\n")}`,
    }));

  if (units.length === 0) {
    throw new Error("Curriculum response contained zero valid study units.");
  }

  const resolvedCategory =
    typeof raw.category === "string" && raw.category.trim()
      ? raw.category.trim()
      : fallbackCategory.trim() || "Integrative Physics & Mathematics";

  const resolvedTitle =
    typeof raw.courseTitle === "string" && raw.courseTitle.trim()
      ? raw.courseTitle.trim()
      : effectiveTopic;

  const codePrefix = deriveCourseCodePrefix(resolvedCategory || resolvedTitle);
  const resolvedCode =
    typeof raw.courseCode === "string" && raw.courseCode.trim()
      ? raw.courseCode.trim().toUpperCase().slice(0, 10)
      : `${codePrefix}-${Math.floor(101 + Math.random() * 398)}`;

  const resolvedTags = normalizeCourseTags([
    ...(Array.isArray(raw.tags) ? raw.tags : []),
    resolvedCategory,
    ...units.flatMap((u) => u.keyConcepts).slice(0, 3),
  ]).slice(0, 6);

  const flashcards: GeneratedFlashcardSeed[] = Array.isArray(raw.flashcards)
    ? raw.flashcards
        .filter(
          (f) =>
            f &&
            typeof f.question === "string" &&
            f.question.trim().length > 0 &&
            typeof f.answer === "string" &&
            f.answer.trim().length > 0
        )
        .map((f) => ({
          unitIndex:
            typeof f.unitIndex === "number" &&
            Number.isFinite(f.unitIndex) &&
            f.unitIndex >= 0 &&
            f.unitIndex < units.length
              ? Math.floor(f.unitIndex)
              : 0,
          question: f.question.trim(),
          answer: f.answer.trim(),
        }))
    : [];

  const milestones: GeneratedMilestoneSeed[] = Array.isArray(raw.milestones)
    ? raw.milestones
        .filter((m) => m && typeof m.title === "string" && m.title.trim().length > 0)
        .map((m) => ({
          title: m.title.trim(),
          subtitle:
            typeof m.subtitle === "string" && m.subtitle.trim()
              ? m.subtitle.trim()
              : `${resolvedCode} Mastery Checkpoint`,
          dueInDays:
            typeof m.dueInDays === "number" && Number.isFinite(m.dueInDays)
              ? Math.max(1, Math.min(180, Math.round(m.dueInDays)))
              : 5,
          urgency:
            m.urgency === "high" || m.urgency === "medium" || m.urgency === "normal"
              ? m.urgency
              : "medium",
        }))
    : [];

  const studyBlocks: GeneratedStudyBlockSeed[] = Array.isArray(raw.studyBlocks)
    ? raw.studyBlocks
        .filter((b) => b && typeof b.title === "string" && b.title.trim().length > 0)
        .map((b) => ({
          timeRange:
            typeof b.timeRange === "string" && b.timeRange.trim()
              ? b.timeRange.trim()
              : "19:00 - 20:00",
          durationMinutes:
            typeof b.durationMinutes === "number" && Number.isFinite(b.durationMinutes)
              ? Math.max(15, Math.min(240, Math.round(b.durationMinutes)))
              : 60,
          title: b.title.trim(),
          subtitle:
            typeof b.subtitle === "string" && b.subtitle.trim()
              ? b.subtitle.trim()
              : `${resolvedCode} · Focused Study Block`,
        }))
    : [];

  return {
    courseTitle: resolvedTitle,
    courseCode: resolvedCode,
    category: resolvedCategory,
    tags: resolvedTags,
    executiveSummary:
      typeof raw.executiveSummary === "string" && raw.executiveSummary.trim()
        ? raw.executiveSummary.trim()
        : `Personalized ${units.length}-unit integrative study curriculum covering ${resolvedTitle}.`,
    units,
    flashcards,
    milestones,
    studyBlocks,
  };
}

export async function fetchAIEngineStatus(): Promise<AIEngineStatus> {
  try {
    const res = await fetch(resolveApiUrl("/api/ai/status"));
    if (!res.ok) {
      throw new Error(`Status HTTP ${res.status}`);
    }
    return (await res.json()) as AIEngineStatus;
  } catch {
    return {
      connected: true,
      cloudConfigured: false,
      provider: "first-principles-engine",
      defaultModel: "first-principles-rk4-compiler",
      availableModels: [
        { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash (Integrative Physics + AI)" },
        { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite (Low-Latency Synthesis)" },
      ],
    };
  }
}

export async function generateGrokopediaCurriculum(params: {
  topic?: string;
  learningGoals?: string;
  learnerLevel?: LearnerLevel;
  targetUnitCount?: number;
  category?: string;
  rawNotesText?: string;
  uploadedDocuments?: UploadedNoteDocument[];
  model?: string;
  temperature?: number;
  topP?: number;
}): Promise<{ curriculum: GeneratedCurriculum; model: string }> {
  const fallbackTopic =
    params.topic?.trim() ||
    params.uploadedDocuments?.[0]?.name?.replace(/\.[^.]+$/, "") ||
    "Integrative Physics & Applied Mathematics";

  try {
    const res = await fetch(resolveApiUrl("/api/ai/curriculum"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    const data = (await res.json()) as {
      curriculum?: Partial<GeneratedCurriculum>;
      model?: string;
      error?: string;
    };

    if (res.ok && !data.error && data.curriculum) {
      return {
        curriculum: normalizeCurriculumPayload(
          data.curriculum,
          fallbackTopic,
          params.category || ""
        ),
        model: data.model || params.model || "gemini-3.8-flash",
      };
    }
  } catch {
    // Offline or API error — seamlessly synthesize via client First-Principles Physics & Math Compiler
  }

  return {
    curriculum: synthesizeDeterministicCurriculum(params),
    model: "first-principles-rk4-compiler",
  };
}

export async function generateDeepResearchReport(params: {
  topic: string;
  rawNotesText?: string;
  model?: string;
  temperature?: number;
  topP?: number;
}): Promise<{ report: DeepResearchReportData; model: string }> {
  try {
    const res = await fetch(resolveApiUrl("/api/ai/research"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    const data = (await res.json()) as {
      report?: DeepResearchReportData;
      model?: string;
      error?: string;
    };

    if (res.ok && !data.error && data.report) {
      return {
        report: data.report,
        model: data.model || params.model || "gemini-3.8-flash",
      };
    }
  } catch {
    // Offline or API error — seamlessly synthesize via First-Principles Compiler
  }

  return {
    report: synthesizeDeterministicResearchReport({
      topic: params.topic,
      rawNotesText: params.rawNotesText,
    }),
    model: "first-principles-rk4-compiler",
  };
}

export async function runVaultAIAssist(params: {
  action: "summarize" | "flashcards" | "ask" | "extract_code" | "ingest_file";
  notesMarkdown: string;
  moduleTitle: string;
  question?: string;
  uploadedDocument?: UploadedNoteDocument;
  model?: string;
}): Promise<{ markdown?: string; cards?: Array<{ question: string; answer: string }> }> {
  try {
    const res = await fetch(resolveApiUrl("/api/ai/vault-assist"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    const data = (await res.json()) as {
      markdown?: string;
      cards?: Array<{ question: string; answer: string }>;
      error?: string;
    };

    if (res.ok && !data.error) {
      return data;
    }
  } catch {
    // Offline or API error — seamlessly synthesize locally
  }

  return synthesizeDeterministicVaultAssist(params);
}

export async function runAutonomousModuleSync(params: {
  moduleTitle: string;
  courseTitle?: string;
  courseCategory?: string;
  existingNotes?: string;
  learningGoals?: string;
  model?: string;
}): Promise<AutonomousSyncResult> {
  try {
    const res = await fetch(resolveApiUrl("/api/ai/autonomous-sync"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });

    const data = (await res.json()) as Partial<AutonomousSyncResult> & { error?: string };

    if (res.ok && !data.error && data.notesMarkdown) {
      return {
        notesMarkdown: data.notesMarkdown.trim(),
        thinkingSummary:
          data.thinkingSummary?.trim() ||
          `Synthesized integrative physics & math notes for "${params.moduleTitle}".`,
        briefOverview:
          data.briefOverview?.trim() || `Study notes covering ${params.moduleTitle}.`,
        keyConcepts: Array.isArray(data.keyConcepts)
          ? data.keyConcepts.map((c) => String(c).trim()).filter(Boolean).slice(0, 6)
          : [],
        searchQueryForVideo:
          data.searchQueryForVideo?.trim() || `${params.moduleTitle} lecture`,
        webSources: Array.isArray(data.webSources)
          ? data.webSources
              .filter((s) => s && typeof s.url === "string" && s.url.trim().length > 0)
              .map((s) => ({
                title: (s.title || s.url).trim(),
                url: s.url.trim(),
              }))
          : [],
        flashcards: Array.isArray(data.flashcards)
          ? data.flashcards
              .filter(
                (f) =>
                  f &&
                  typeof f.question === "string" &&
                  f.question.trim().length > 0 &&
                  typeof f.answer === "string" &&
                  f.answer.trim().length > 0
              )
              .map((f) => ({
                question: f.question.trim(),
                answer: f.answer.trim(),
              }))
          : [],
        groundedWithSearch: Boolean(data.groundedWithSearch),
        model: data.model || params.model || "gemini-3.8-flash",
        syncedAt: data.syncedAt || new Date().toISOString(),
      };
    }
  } catch {
    // Offline or API error — seamlessly synthesize via First-Principles Compiler
  }

  return synthesizeDeterministicAutonomousNotes(params);
}

export async function fetchIntegrativeLabBlueprint(params: {
  topic: string;
  category?: string;
  notesText?: string;
  courseId?: string;
  moduleId?: string;
}): Promise<IntegrativeLabBlueprint> {
  try {
    const res = await fetch(resolveApiUrl("/api/ai/integrative-blueprint"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const data = (await res.json()) as { blueprint?: IntegrativeLabBlueprint };
    if (res.ok && data.blueprint) {
      return data.blueprint;
    }
  } catch {
    // Offline or API unavailable — deterministic RK4 physics blueprint compiles locally
  }

  return compileIntegrativeLabBlueprint({
    ...params,
    synthesisEngine: "first-principles-rk4-local",
  });
}

export async function runGroundedAITutor(params: {
  mode: "explain" | "step_by_step" | "socratic" | "generate_quiz" | "mistake_analysis";
  topicTitle: string;
  courseTitle?: string;
  notesMarkdown?: string;
  prompt?: string;
  attemptHistory?: Array<{
    title: string;
    percentage: number;
    attemptedAt: string;
    errorCategories?: string[];
  }>;
  recurringErrors?: string[];
  difficulty?: "foundational" | "standard" | "rigorous";
  model?: string;
}): Promise<import("../types/studyOS").AITutorResponse> {
  try {
    const res = await fetch(resolveApiUrl("/api/ai/tutor"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (res.ok) {
      const data = (await res.json()) as import("../types/studyOS").AITutorResponse;
      if (data && typeof data.markdown === "string") {
        return data;
      }
    }
  } catch {
    // Offline fallback handled below
  }

  const groundingSources: string[] = [];
  if (params.notesMarkdown && params.notesMarkdown.trim().length > 20) {
    groundingSources.push("Vault Notes");
  }
  if (params.attemptHistory && params.attemptHistory.length > 0) {
    groundingSources.push(`${params.attemptHistory.length} Recorded Attempt(s)`);
  }

  return {
    mode: params.mode,
    markdown: `### StudyOS Grounded Tutor — ${params.topicTitle}\n\n${
      groundingSources.length > 0
        ? `Grounded in: ${groundingSources.join(", ")}.`
        : "No prior notes or assessment records found for this topic yet."
    }\n\n1. Review the core governing definitions of **${params.topicTitle}**.\n2. Complete a baseline Topic Quiz in **Tasks, Exams & Practice** to record empirical performance.`,
    isGroundedInRecords: groundingSources.length > 0,
    groundingSources,
    model: "offline-grounded-tutor",
  };
}

