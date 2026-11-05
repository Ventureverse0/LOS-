/* ============================================================================
 * LEARNINGOS EXPRESS API ROUTES (Stages 2, 4, 6, 8–14, 16–24, 28)
 * Mounted alongside existing StudyOS routes in server.ts without modifying
 * or removing any existing StudyOS endpoints.
 * ========================================================================== */

import type { Express } from "express";
import path from "path";
import { Type } from "@google/genai";
import { LearningOSSqliteService } from "./sqliteLearningOS.ts";
import {
  LlmProviderRouter,
  type CredentialSlot,
  type ProviderMode,
} from "./llmProviderRouter.ts";
import {
  computeDeterministicHash,
  formatMsToTimestamp,
} from "../lib/transcriptPipeline.ts";
import {
  compileInteractiveLessonArtifact,
  validateInteractiveLessonArtifact,
} from "../integrations/learningOSAdapters.ts";
import {
  createDefaultLearningOSHost,
  MCP_READONLY_ALLOWLIST,
} from "../lib/appHostToolBus.ts";
import type {
  ConceptRelationType,
  FtsSearchFilters,
  StudyArtifactType,
  SubtitleType,
} from "../types/learningOS.ts";
import type { StudyOSState } from "../types/studyOS.ts";

export function registerLearningOSRoutes(
  app: Express,
  rootDir: string,
  workspacesDir: string,
  sharedRouter?: LlmProviderRouter
): LearningOSSqliteService {
  const llmRouter = sharedRouter ?? new LlmProviderRouter(rootDir);
  const dataDir = path.join(rootDir, "data");
  const sqliteSvc = new LearningOSSqliteService({
    dbPath: path.join(dataDir, "learningos.sqlite"),
    tempRootDir: path.join(dataDir, "temp", "extraction"),
    logFilePath: path.join(dataDir, "logs", "learningos.log"),
    appVersion: "3.1.0-learningos",
  });

  // Wire server-side ToolBus for optional Stage 28 MCP Read-Only Bridge
  const serverHost = createDefaultLearningOSHost();
  serverHost.mcpBridge.setEnabled(sqliteSvc.isMcpBridgeEnabled());

  serverHost.capabilityRegistry.register({
    id: "curriculum.read",
    description: "Read synced courses and curriculum matches",
    requiredScope: "read",
    readOnly: true,
    handler: async () => ({
      result: {
        topicMatches: sqliteSvc.listCurriculumMatches(),
      },
    }),
  });
  serverHost.capabilityRegistry.register({
    id: "resource.read",
    description: "List remote learning resources and metadata",
    requiredScope: "read",
    readOnly: true,
    handler: async () => ({
      result: { resources: sqliteSvc.listResources() },
    }),
  });
  serverHost.capabilityRegistry.register({
    id: "search.query",
    description: "Run SQLite FTS5 BM25 lexical search",
    requiredScope: "read",
    readOnly: true,
    handler: async (input: { query?: string; filters?: FtsSearchFilters }) => ({
      result: {
        results: sqliteSvc.searchFts5(String(input?.query || ""), input?.filters || {}),
      },
    }),
  });
  serverHost.capabilityRegistry.register({
    id: "notes.read",
    description: "Search indexed Markdown notes",
    requiredScope: "read",
    readOnly: true,
    handler: async (input: { query?: string }) => ({
      result: {
        notes: sqliteSvc
          .searchFts5(String(input?.query || "Unit"), { limit: 25 })
          .filter((r) => r.entityType === "note"),
      },
    }),
  });
  serverHost.capabilityRegistry.register({
    id: "concepts.read",
    description: "Read relational concept and prerequisite graph",
    requiredScope: "read",
    readOnly: true,
    handler: async () => ({
      result: sqliteSvc.getConceptGraph(),
    }),
  });
  serverHost.capabilityRegistry.register({
    id: "flashcards.export",
    description: "Read indexed flashcards for read-only export",
    requiredScope: "read",
    readOnly: true,
    handler: async () => ({
      result: {
        flashcards: sqliteSvc
          .searchFts5("a OR e OR i OR o OR u", { limit: 100 })
          .filter((r) => r.entityType === "flashcard"),
      },
    }),
  });

  // =========================================================================
  // STAGE 2 & 24: HEALTH, LOCAL ENDPOINT ROUTER & SYSTEM DIAGNOSTICS
  // =========================================================================
  app.get("/health", (_req, res) => {
    const snap = llmRouter.getPublicSnapshot();
    res.json({
      ok: true,
      service: "studyos-learningos-host",
      sqliteReady: true,
      fts5Ready: true,
      llmConfigured: snap.active.llmConfigured,
      llmProvider: snap.active.provider,
      llmEndpoint: snap.active.endpointLabel,
      isLocalEndpoint: snap.active.isLocalEndpoint,
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/api/system/diagnostics", (_req, res) => {
    const snap = llmRouter.getPublicSnapshot();
    res.json(
      sqliteSvc.getDiagnostics({
        llmConfigured: snap.active.llmConfigured,
        llmProvider: snap.active.provider,
        defaultModel: snap.active.defaultModel,
      })
    );
  });

  app.get("/api/ai/provider/config", (_req, res) => {
    res.json(llmRouter.getPublicSnapshot());
  });

  app.put("/api/ai/provider/config", async (req, res) => {
    try {
      const body = (req.body || {}) as {
        mode?: ProviderMode;
        baseUrl?: string;
        model?: string;
        credentialSlot?: CredentialSlot;
        timeoutMs?: number;
      };
      const updated = await llmRouter.updateSettings(body);
      sqliteSvc.logInfo(
        `Updated AI provider routing: mode=${updated.settings.mode} endpoint=${updated.active.endpointLabel} model=${updated.active.defaultModel}`
      );
      res.json(updated);
    } catch (err: unknown) {
      res.status(400).json({
        error:
          err instanceof Error ? err.message : "Failed to save provider routing config.",
      });
    }
  });

  app.get("/api/ai/provider/models", async (req, res) => {
    const baseUrl =
      typeof req.query.baseUrl === "string" ? req.query.baseUrl : undefined;
    const out = await llmRouter.discoverModels(baseUrl);
    res.json(out);
  });

  app.post("/api/ai/provider/test", async (_req, res) => {
    const out = await llmRouter.testConnection();
    res.json(out);
  });

  // =========================================================================
  // BOOTSTRAP & WORKSPACE <-> SQLITE MIRROR SYNC
  // =========================================================================
  app.get("/api/learningos/bootstrap", (_req, res) => {
    const resources = sqliteSvc.listResources();
    const transcripts = resources
      .map((r) => sqliteSvc.getTranscriptMeta(r.id))
      .filter(Boolean);
    const conceptGraph = sqliteSvc.getConceptGraph();
    const topicMatches = sqliteSvc.listCurriculumMatches();
    const artifacts = sqliteSvc.listStudyArtifacts();
    const jobs = sqliteSvc.listJobs(25);
    const storageAudit = sqliteSvc.auditStorage(workspacesDir);
    const snap = llmRouter.getPublicSnapshot();
    const diagnostics = sqliteSvc.getDiagnostics({
      llmConfigured: snap.active.llmConfigured,
      llmProvider: snap.active.provider,
      defaultModel: snap.active.defaultModel,
    });

    res.json({
      resources,
      transcripts,
      concepts: conceptGraph.concepts,
      conceptLinks: conceptGraph.links,
      topicMatches,
      artifacts,
      jobs,
      storageAudit,
      diagnostics,
      providerSnapshot: snap,
      migrations: sqliteSvc.getAppliedMigrations(),
    });
  });

  app.post("/api/learningos/sync-workspace", (req, res) => {
    try {
      const { state } = req.body as { state?: Partial<StudyOSState> };
      if (!state || typeof state !== "object") {
        res.status(400).json({ error: "Missing valid StudyOS workspace state." });
        return;
      }
      const counts = sqliteSvc.syncStudyOSWorkspace(state);
      res.json({ ok: true, ...counts });
    } catch (err: unknown) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "Failed to sync workspace into SQLite.",
      });
    }
  });

  // =========================================================================
  // STAGE 6–9: RESOURCES, CAPTIONS-FIRST TRANSCRIPTS & WHISPER FALLBACK JOBS
  // =========================================================================
  app.post("/api/learningos/resources", async (req, res) => {
    try {
      const {
        url,
        title,
        authorOrChannel,
        durationSeconds,
        courseId,
        unitName,
        topicId,
        rawCaptionsText,
        subtitleType,
      } = req.body as {
        url?: string;
        title?: string;
        authorOrChannel?: string;
        durationSeconds?: number;
        courseId?: string | null;
        unitName?: string | null;
        topicId?: string | null;
        rawCaptionsText?: string;
        subtitleType?: SubtitleType;
      };

      if (!url || !url.trim()) {
        res.status(400).json({ error: "Please provide a valid resource URL or reference." });
        return;
      }

      const remoteMeta =
        !title?.trim() || !authorOrChannel?.trim()
          ? await sqliteSvc.fetchRemoteMetadata(url.trim())
          : {};

      const resource = sqliteSvc.upsertResource({
        url: url.trim(),
        title: title?.trim() || remoteMeta.title,
        authorOrChannel: authorOrChannel?.trim() || remoteMeta.authorOrChannel,
        durationSeconds: durationSeconds ?? null,
        courseId: courseId || null,
        unitName: unitName || null,
        topicId: topicId || null,
      });

      let transcriptResult = null;
      if (rawCaptionsText && rawCaptionsText.trim().length > 0) {
        transcriptResult = sqliteSvc.ingestTranscript({
          resourceId: resource.id,
          rawSubtitleText: rawCaptionsText,
          subtitleType: subtitleType || "manual",
          sourceUrl: resource.url,
        });
      }

      const updatedResource = sqliteSvc.getResourceById(resource.id)!;
      sqliteSvc.logInfo(`Added/updated resource ${updatedResource.id} (${updatedResource.sourceType})`);

      res.json({
        resource: updatedResource,
        transcript: transcriptResult?.transcript ?? sqliteSvc.getTranscriptMeta(resource.id),
        deduplicatedTranscript: transcriptResult?.deduplicated ?? false,
      });
    } catch (err: unknown) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "Failed to save learning resource.",
      });
    }
  });

  app.patch("/api/learningos/resources/:resourceId/progress", (req, res) => {
    const updated = sqliteSvc.updateResourceProgress(
      req.params.resourceId,
      req.body as {
        lastPositionSec?: number;
        progressPct?: number;
        completed?: boolean;
      }
    );
    if (!updated) {
      res.status(404).json({ error: "Resource not found." });
      return;
    }
    res.json({ resource: updated });
  });

  app.delete("/api/learningos/resources/:resourceId", (req, res) => {
    const deleted = sqliteSvc.deleteResource(req.params.resourceId);
    res.json({ ok: deleted });
  });

  app.get("/api/learningos/resources/:resourceId/transcript", (req, res) => {
    const offset = Math.max(0, parseInt(String(req.query.offset || "0"), 10) || 0);
    const limit = Math.min(250, Math.max(10, parseInt(String(req.query.limit || "60"), 10) || 60));
    const meta = sqliteSvc.getTranscriptMeta(req.params.resourceId);
    const page = sqliteSvc.getTranscriptSegments(req.params.resourceId, offset, limit);
    res.json({
      transcript: meta,
      total: page.total,
      offset,
      limit,
      segments: page.segments,
    });
  });

  app.post("/api/learningos/resources/:resourceId/transcript", (req, res) => {
    try {
      const { rawSubtitleText, subtitleType, language } = req.body as {
        rawSubtitleText?: string;
        subtitleType?: SubtitleType;
        language?: string;
      };
      if (!rawSubtitleText || !rawSubtitleText.trim()) {
        res.status(400).json({ error: "Provide WebVTT (.vtt), SubRip (.srt), or timestamped transcript lines." });
        return;
      }
      const out = sqliteSvc.ingestTranscript({
        resourceId: req.params.resourceId,
        rawSubtitleText,
        subtitleType: subtitleType || "manual",
        language: language || "en",
      });
      res.json({
        deduplicated: out.deduplicated,
        transcript: out.transcript,
        segments: out.segments.slice(0, 80),
        totalSegments: out.segments.length,
        resource: sqliteSvc.getResourceById(req.params.resourceId),
      });
    } catch (err: unknown) {
      res.status(400).json({
        error: err instanceof Error ? err.message : "Failed to parse and ingest transcript.",
      });
    }
  });

  app.post("/api/learningos/resources/:resourceId/whisper-job", async (req, res) => {
    try {
      const { fallbackCueText } = req.body as { fallbackCueText?: string };
      const outcome = await sqliteSvc.runWhisperFallbackJob({
        resourceId: req.params.resourceId,
        fallbackCueText,
      });
      res.json({
        ...outcome,
        resource: sqliteSvc.getResourceById(req.params.resourceId),
        transcript: sqliteSvc.getTranscriptMeta(req.params.resourceId),
      });
    } catch (err: unknown) {
      res.status(400).json({
        error: err instanceof Error ? err.message : "Failed to run Whisper fallback job.",
      });
    }
  });

  // =========================================================================
  // STAGE 11: SQLITE FTS5 GLOBAL SEARCH
  // =========================================================================
  app.post("/api/learningos/search", (req, res) => {
    try {
      const { query = "", filters = {} } = req.body as {
        query?: string;
        filters?: FtsSearchFilters;
      };
      const started = performance.now();
      const results = sqliteSvc.searchFts5(query, filters);
      const elapsedMs = Math.round((performance.now() - started) * 100) / 100;
      res.json({
        query,
        elapsedMs,
        results,
      });
    } catch (err: unknown) {
      res.status(400).json({
        error: err instanceof Error ? err.message : "FTS5 query failed.",
      });
    }
  });

  // =========================================================================
  // STAGE 13: SOURCE-GROUNDED AI TUTOR WITH SEGMENT CITATIONS
  // =========================================================================
  app.post("/api/ai/resources/:resourceId/ask", async (req, res) => {
    try {
      const { selectedSegmentIds = [], question = "", model } = req.body as {
        selectedSegmentIds?: string[];
        question?: string;
        model?: string;
      };
      if (!question.trim()) {
        res.status(400).json({ error: "Please enter a question about this lecture/resource." });
        return;
      }

      const ctx = sqliteSvc.buildGroundedContextForResource({
        resourceId: req.params.resourceId,
        selectedSegmentIds,
        question: question.trim(),
      });

      const activeProvider = llmRouter.resolveActiveProvider();
      if (activeProvider.kind !== "deterministic" && ctx.matchedSegments.length > 0) {
        try {
          const segmentBlock = ctx.matchedSegments
            .map(
              (s) =>
                `[segmentId="${s.id}" startMs=${s.startMs} endMs=${s.endMs} time="${formatMsToTimestamp(
                  s.startMs
                )}"] ${s.text}`
            )
            .join("\n");

          const completion = await llmRouter.generateCompletion({
            preferredModel: model,
            expectJson: true,
            systemInstruction:
              'You are LearningOS\'s source-grounded academic tutor. Distinguish verified source facts from general inference. If the provided transcript segments do not contain the answer, state that clearly in both `answer` and `warnings`. Cite ONLY real `segmentId` strings from the provided Verified Source Segments. Never invent segment IDs or timestamps. Return JSON with keys: {"answer":"string","citations":[{"segmentId":"string","quote":"string"}],"warnings":["string"]}.',
            userPrompt: `Curriculum Path: ${ctx.curriculumContext}\nResource Title: ${ctx.resource.title}\n\nVerified Source Segments:\n${segmentBlock}\n\nStudent Question: ${question.trim()}`,
            geminiSchema: {
              type: Type.OBJECT,
              properties: {
                answer: { type: Type.STRING },
                citations: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      segmentId: { type: Type.STRING },
                      quote: { type: Type.STRING },
                    },
                    required: ["segmentId", "quote"],
                  },
                },
                warnings: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ["answer", "citations", "warnings"],
            },
          });

          const parsed = JSON.parse(completion.text) as {
            answer?: string;
            citations?: Array<{ segmentId?: string; quote?: string }>;
            warnings?: string[];
          };

          if (parsed.answer) {
            const validated = sqliteSvc.validateAndNormalizeTutorAnswer({
              resourceId: req.params.resourceId,
              rawAnswer: parsed.answer,
              rawCitations: parsed.citations || [],
              rawWarnings: parsed.warnings || [],
              model: `${completion.provider}:${completion.model}`,
            });
            res.json(validated);
            return;
          }
        } catch (llmErr: unknown) {
          sqliteSvc.logInfo(
            `LLM tutor fallback triggered: ${
              llmErr instanceof Error ? llmErr.message : "unknown"
            }`
          );
        }
      }

      const fallback = sqliteSvc.buildDeterministicCitedAnswer({
        resourceId: req.params.resourceId,
        selectedSegmentIds,
        question: question.trim(),
      });
      res.json(fallback);
    } catch (err: unknown) {
      res.status(400).json({
        error: err instanceof Error ? err.message : "Failed to answer resource question.",
      });
    }
  });

  // =========================================================================
  // STAGE 14 & 19: ON-DEMAND CACHED STUDY ARTIFACTS & OPENMAIC LESSONS
  // =========================================================================
  app.post("/api/ai/resources/:resourceId/artifacts", async (req, res) => {
    try {
      const {
        artifactType = "summary",
        selectedSegmentIds = [],
        notesMarkdown = "",
        forceRegenerate = false,
      } = req.body as {
        artifactType?: StudyArtifactType;
        selectedSegmentIds?: string[];
        notesMarkdown?: string;
        forceRegenerate?: boolean;
      };

      const resource = sqliteSvc.getResourceById(req.params.resourceId);
      if (!resource) {
        res.status(404).json({ error: "Resource not found." });
        return;
      }

      const allSegs = sqliteSvc.getTranscriptSegments(resource.id, 0, 120).segments;
      const chosenSegs =
        selectedSegmentIds.length > 0
          ? allSegs.filter((s) => selectedSegmentIds.includes(s.id))
          : allSegs.slice(0, 40);

      // Strict input size limit (Stage 14) so a giant lecture cannot create an oversized LLM payload
      const boundedTranscriptText = chosenSegs
        .map((s) => `[${formatMsToTimestamp(s.startMs)}] ${s.text}`)
        .join("\n")
        .slice(0, 16000);
      const boundedNotes = notesMarkdown.slice(0, 6000);

      const contentHash = computeDeterministicHash(
        `${resource.id}|${artifactType}|v1|${boundedTranscriptText}|${boundedNotes}`
      );

      if (!forceRegenerate) {
        const cached = sqliteSvc.getArtifactByHash(artifactType, contentHash);
        if (cached) {
          res.json({ artifact: cached, cached: true });
          return;
        }
      }

      const citations = chosenSegs.slice(0, 4).map((s) => ({
        resourceId: resource.id,
        segmentId: s.id,
        startMs: s.startMs,
        endMs: s.endMs,
        quote: s.text.slice(0, 140),
      }));

      // Stage 19 OpenMAIC-compatible Interactive Lesson artifact
      if (artifactType === "interactive_lesson") {
        const graph = sqliteSvc.getConceptGraph(resource.courseId || undefined);
        const lesson = compileInteractiveLessonArtifact({
          topicTitle: resource.title,
          resources: [resource],
          segments: chosenSegs,
          concepts: graph.concepts,
          notesMarkdown: boundedNotes,
        });
        const check = validateInteractiveLessonArtifact(lesson);
        if (!check.valid) {
          res.status(400).json({ error: check.error });
          return;
        }
        const saved = sqliteSvc.saveStudyArtifact({
          artifactType: "interactive_lesson",
          resourceIds: [resource.id],
          segmentIds: chosenSegs.map((s) => s.id),
          promptVersion: "openmaic-lesson-v1",
          providerModel: "openmaic-local-adapter",
          contentHash,
          content: lesson as unknown as Record<string, unknown>,
          citations,
          tokenEstimate: 0,
        });
        res.json({ artifact: saved, cached: false });
        return;
      }

      const promptChars = boundedTranscriptText.length + boundedNotes.length + 350;
      const tokenEstimate = Math.ceil(promptChars / 4);
      const activeProvider = llmRouter.resolveActiveProvider();

      let generatedContent: Record<string, unknown> | null = null;
      let usedModel = "deterministic-artifact-compiler";

      if (
        activeProvider.kind !== "deterministic" &&
        (boundedTranscriptText.length > 0 || boundedNotes.length > 0)
      ) {
        try {
          const sourceCorpus = `Resource: ${resource.title} (${resource.url})\n\nTranscript Cues:\n${
            boundedTranscriptText || "(No transcript)"
          }\n\nStudent Notes:\n${boundedNotes || "(No notes)"}`;

          if (artifactType === "flashcards") {
            const resp = await llmRouter.generateCompletion({
              expectJson: true,
              systemInstruction:
                'Create concise, factual active-recall flashcards strictly grounded in the provided transcript cues and notes. Return JSON: {"cards":[{"front":"string","back":"string","sourceRef":"string"}]}.',
              userPrompt: `Generate 4 source-grounded active-recall flashcards from:\n\n${sourceCorpus}`,
              geminiSchema: {
                type: Type.OBJECT,
                properties: {
                  cards: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        front: { type: Type.STRING },
                        back: { type: Type.STRING },
                        sourceRef: { type: Type.STRING },
                      },
                      required: ["front", "back", "sourceRef"],
                    },
                  },
                },
                required: ["cards"],
              },
            });
            generatedContent = JSON.parse(resp.text);
            usedModel = `${resp.provider}:${resp.model}`;
          } else if (artifactType === "quiz") {
            const resp = await llmRouter.generateCompletion({
              expectJson: true,
              systemInstruction:
                'Create rigorous 4-option multiple-choice questions where correctAnswer exactly matches one of the 4 options and sourceRef cites the cue timestamp. Return JSON: {"questions":[{"question":"string","options":["a","b","c","d"],"correctAnswer":"a","explanation":"string","sourceRef":"string","difficulty":"standard"}]}.',
              userPrompt: `Generate a 3-question multiple-choice diagnostic quiz from:\n\n${sourceCorpus}`,
              geminiSchema: {
                type: Type.OBJECT,
                properties: {
                  questions: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        question: { type: Type.STRING },
                        options: { type: Type.ARRAY, items: { type: Type.STRING } },
                        correctAnswer: { type: Type.STRING },
                        explanation: { type: Type.STRING },
                        sourceRef: { type: Type.STRING },
                        difficulty: { type: Type.STRING },
                      },
                      required: [
                        "question",
                        "options",
                        "correctAnswer",
                        "explanation",
                        "sourceRef",
                        "difficulty",
                      ],
                    },
                  },
                },
                required: ["questions"],
              },
            });
            generatedContent = JSON.parse(resp.text);
            usedModel = `${resp.provider}:${resp.model}`;
          } else {
            const resp = await llmRouter.generateCompletion({
              expectJson: true,
              systemInstruction:
                'Synthesize concise academic Markdown strictly grounded in the provided source cues. Cite timestamps like [02:15] whenever referencing transcript facts. Return JSON: {"title":"string","markdown":"string"}.',
              userPrompt: `Create a ${artifactType.replace(/_/g, " ")} in clean Markdown with timestamp citations from:\n\n${sourceCorpus}`,
              geminiSchema: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  markdown: { type: Type.STRING },
                },
                required: ["title", "markdown"],
              },
            });
            generatedContent = JSON.parse(resp.text);
            usedModel = `${resp.provider}:${resp.model}`;
          }
        } catch {
          usedModel = "deterministic-artifact-compiler";
          generatedContent = null;
        }
      }

      // Deterministic offline fallback
      if (!generatedContent) {
        if (artifactType === "flashcards") {
          const cards = (chosenSegs.length > 0 ? chosenSegs.slice(0, 4) : []).map((s, i) => ({
            front: `In "${resource.title}" [${formatMsToTimestamp(s.startMs)}], what key point is established in Cue #${i + 1}?`,
            back: s.text,
            sourceRef: `${resource.title} @ ${formatMsToTimestamp(s.startMs)}`,
          }));
          if (cards.length === 0) {
            cards.push({
              front: `What is the central focus of "${resource.title}"?`,
              back: boundedNotes.slice(0, 220) || `Review source ${resource.url} and record key invariants.`,
              sourceRef: resource.url,
            });
          }
          generatedContent = { cards };
        } else if (artifactType === "quiz") {
          const lead = chosenSegs[0];
          const ans = lead
            ? lead.text.slice(0, 140)
            : `Verify boundary assumptions and definitions in ${resource.title}.`;
          generatedContent = {
            questions: [
              {
                question: `According to "${resource.title}"${
                  lead ? ` at [${formatMsToTimestamp(lead.startMs)}]` : ""
                }, which statement is supported by the source?`,
                options: [
                  ans,
                  "Source assumptions never depend on physical or domain constraints.",
                  "All variables remain invariant regardless of perturbation.",
                  "Self-rated familiarity replaces empirical retrieval checks.",
                ],
                correctAnswer: ans,
                explanation: lead
                  ? `Directly stated at [${formatMsToTimestamp(lead.startMs)}].`
                  : `Derived from ${resource.title}.`,
                sourceRef: lead ? formatMsToTimestamp(lead.startMs) : resource.url,
                difficulty: "standard",
              },
            ],
          };
        } else {
          const cueBullets = chosenSegs
            .slice(0, 8)
            .map((s) => `- **[${formatMsToTimestamp(s.startMs)}]** ${s.text}`)
            .join("\n");
          generatedContent = {
            title: `${resource.title} — ${artifactType.replace(/_/g, " ").toUpperCase()}`,
            markdown: `### ${resource.title}\n\n${
              cueBullets || boundedNotes || "*Ingest captions or add notes to enrich this study sheet.*"
            }\n\n---\n*Provenance: \`${resource.url}\` · Permanent media stored: 0 B*`,
          };
        }
      }

      const saved = sqliteSvc.saveStudyArtifact({
        artifactType,
        resourceIds: [resource.id],
        segmentIds: chosenSegs.map((s) => s.id),
        promptVersion: "stage14-v1",
        providerModel: usedModel,
        contentHash,
        content: generatedContent,
        citations,
        tokenEstimate: usedModel === "deterministic-artifact-compiler" ? 0 : tokenEstimate,
      });

      res.json({ artifact: saved, cached: false });
    } catch (err: unknown) {
      res.status(400).json({
        error: err instanceof Error ? err.message : "Failed to generate study artifact.",
      });
    }
  });

  // =========================================================================
  // STAGE 16 & 17: CONCEPT GRAPH & CURRICULUM MATCHING
  // =========================================================================
  app.post("/api/learningos/concepts", (req, res) => {
    try {
      const concept = sqliteSvc.upsertConcept(req.body);
      res.json({ concept, graph: sqliteSvc.getConceptGraph() });
    } catch (err: unknown) {
      res.status(400).json({
        error: err instanceof Error ? err.message : "Failed to save concept node.",
      });
    }
  });

  app.post("/api/learningos/concept-links", (req, res) => {
    try {
      const body = req.body as {
        fromConceptId: string;
        toConceptId: string;
        relationType: ConceptRelationType;
        confidence?: number;
        evidence?: string;
        mappingMethod?: "manual" | "assisted" | "notes_derived";
      };
      const link = sqliteSvc.addConceptLink({
        fromConceptId: body.fromConceptId,
        toConceptId: body.toConceptId,
        relationType: body.relationType || "prerequisite",
        confidence: body.confidence ?? 0.85,
        evidence: body.evidence || "Manual link",
        mappingMethod: body.mappingMethod || "manual",
      });
      res.json({ link, graph: sqliteSvc.getConceptGraph() });
    } catch (err: unknown) {
      res.status(400).json({
        error: err instanceof Error ? err.message : "Failed to link concepts.",
      });
    }
  });

  app.post("/api/learningos/curriculum-match", (req, res) => {
    try {
      const { resourceId } = req.body as { resourceId?: string };
      if (!resourceId) {
        res.status(400).json({ error: "Missing resourceId." });
        return;
      }
      const candidates = sqliteSvc.suggestCurriculumMatches(resourceId);
      res.json({ candidates });
    } catch (err: unknown) {
      res.status(400).json({
        error: err instanceof Error ? err.message : "Curriculum matching failed.",
      });
    }
  });

  app.post("/api/learningos/curriculum-match/approve", (req, res) => {
    try {
      const { resourceId, topicId, approved = true, method = "assisted" } = req.body as {
        resourceId?: string;
        topicId?: string;
        approved?: boolean;
        method?: "manual" | "assisted";
      };
      if (!resourceId || !topicId) {
        res.status(400).json({ error: "Missing resourceId or topicId." });
        return;
      }
      const matches = sqliteSvc.approveCurriculumMatch({
        resourceId,
        topicId,
        approved,
        method,
      });
      res.json({
        matches,
        resource: sqliteSvc.getResourceById(resourceId),
      });
    } catch (err: unknown) {
      res.status(400).json({
        error: err instanceof Error ? err.message : "Failed to approve curriculum match.",
      });
    }
  });

  // =========================================================================
  // STAGE 21–23: JOBS, STORAGE AUDIT, CLEANUP & PORTABLE SQLITE BACKUP
  // =========================================================================
  app.get("/api/learningos/jobs", (_req, res) => {
    res.json({ jobs: sqliteSvc.listJobs(30) });
  });

  app.post("/api/learningos/jobs/:jobId/cancel", (req, res) => {
    const job = sqliteSvc.cancelJob(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: "Job not found." });
      return;
    }
    res.json({ job });
  });

  app.get("/api/learningos/storage-audit", (_req, res) => {
    res.json(sqliteSvc.auditStorage(workspacesDir));
  });

  app.post("/api/learningos/storage-cleanup", (_req, res) => {
    res.json(sqliteSvc.runIdempotentTempCleanup(workspacesDir));
  });

  app.get("/api/learningos/backup", (_req, res) => {
    res.json(sqliteSvc.buildValidatedSqliteExportBundle());
  });

  // =========================================================================
  // STAGE 28: OPTIONAL READ-ONLY MCP BRIDGE
  // =========================================================================
  app.get("/api/mcp/tools", (_req, res) => {
    res.json({
      enabled: serverHost.mcpBridge.isEnabled(),
      allowlist: Array.from(MCP_READONLY_ALLOWLIST),
      exposedTools: serverHost.mcpBridge.listExposedTools(),
    });
  });

  app.post("/api/mcp/toggle", (req, res) => {
    const { enabled } = req.body as { enabled?: boolean };
    const next = Boolean(enabled);
    sqliteSvc.setMcpBridgeEnabled(next);
    serverHost.mcpBridge.setEnabled(next);
    res.json({
      enabled: next,
      exposedTools: serverHost.mcpBridge.listExposedTools(),
    });
  });

  app.post("/api/mcp/call", async (req, res) => {
    const { capability, input } = req.body as {
      capability?: string;
      input?: unknown;
    };
    const out = await serverHost.mcpBridge.invokeMcpTool(String(capability || ""), input || {});
    res.status(out.success ? 200 : 403).json(out);
  });

  return sqliteSvc;
}
