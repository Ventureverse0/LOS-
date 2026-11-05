import "dotenv/config";
import express from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import {
  compileIntegrativeLabBlueprint,
  synthesizeDeterministicAutonomousNotes,
  synthesizeDeterministicCurriculum,
  synthesizeDeterministicResearchReport,
  synthesizeDeterministicVaultAssist,
} from "./src/lib/integrativePhysicsEngine.ts";
import type { LearnerLevel, UploadedNoteDocument } from "./src/types/studyOS.ts";
import { registerLearningOSRoutes } from "./src/server/learningOSRoutes.ts";
import { LlmProviderRouter } from "./src/server/llmProviderRouter.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKSPACES_DIR = path.join(__dirname, "data", "workspaces");
const llmRouter = new LlmProviderRouter(__dirname);
const ALLOWED_GEMINI_MODELS = new Set(["gemini-3.8-flash", "gemini-3.1-flash-lite"]);
const SUPPORTED_INLINE_MIMES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
]);

interface StoredWorkspaceEnvelope {
  workspaceId: string;
  updatedAt: string;
  revision: number;
  state: unknown;
}

type ActiveProviderDescriptor =
  | {
      kind: "gemini";
      provider: "gemini";
      apiKey: string;
      baseUrl?: string;
      defaultModel: string;
    }
  | {
      kind: "openai-compat";
      provider: string;
      endpoint: string;
      apiKey: string;
      defaultModel: string;
      customHeaders?: Record<string, string>;
    }
  | {
      kind: "anthropic";
      provider: "anthropic";
      endpoint: string;
      apiKey: string;
      defaultModel: string;
    }
  | { kind: "deterministic"; provider: "first-principles-engine"; defaultModel: string };

/**
 * Universal API & Local Endpoint detector backed by LlmProviderRouter:
 * Supports Ollama, LM Studio, llama.cpp, vLLM, Custom OpenAI-compatible URLs,
 * Gemini (with optional custom base URL), OpenAI, Groq, DeepSeek, Anthropic,
 * and the offline First-Principles Physics & Math Compiler.
 */
function detectActiveProvider(): ActiveProviderDescriptor {
  const resolved = llmRouter.resolveActiveProvider();
  if (resolved.kind === "gemini") {
    return {
      kind: "gemini",
      provider: "gemini",
      apiKey: resolved.apiKey,
      baseUrl: resolved.baseUrl,
      defaultModel: resolved.defaultModel,
    };
  }
  if (resolved.kind === "openai-compat") {
    return {
      kind: "openai-compat",
      provider: resolved.provider,
      endpoint: resolved.chatCompletionsUrl,
      apiKey: resolved.apiKey,
      defaultModel: resolved.defaultModel,
      customHeaders: resolved.customHeaders,
    };
  }
  if (resolved.kind === "anthropic") {
    return {
      kind: "anthropic",
      provider: "anthropic",
      endpoint: resolved.messagesUrl,
      apiKey: resolved.apiKey,
      defaultModel: resolved.defaultModel,
    };
  }
  return {
    kind: "deterministic",
    provider: "first-principles-engine",
    defaultModel: "first-principles-rk4-compiler",
  };
}

function resolveGeminiModel(requested?: string): string {
  if (requested && ALLOWED_GEMINI_MODELS.has(requested)) {
    return requested;
  }
  const active = llmRouter.resolveActiveProvider();
  if (active.kind === "gemini" && active.defaultModel) {
    return active.defaultModel;
  }
  return "gemini-3.8-flash";
}

function getGenAIClient(apiKey: string, baseUrl?: string): GoogleGenAI {
  return llmRouter.createGenAIClient(apiKey, baseUrl);
}

function extractFirstJsonObject(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return candidate.slice(firstBrace, lastBrace + 1);
  }
  return candidate;
}

/**
 * Calls any local or cloud OpenAI-compatible or Anthropic provider for text or JSON synthesis.
 * Automatically retries without `response_format` when local GGUF/llama.cpp/Ollama servers reject it.
 */
async function callAlternativeProviderText(
  descriptor: Extract<ActiveProviderDescriptor, { kind: "openai-compat" | "anthropic" }>,
  systemInstruction: string,
  userPrompt: string,
  expectJson: boolean,
  temperature: number = 0.25
): Promise<{ text: string; model: string }> {
  if (descriptor.kind === "openai-compat") {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(descriptor.customHeaders || {}),
    };
    if (descriptor.apiKey && descriptor.apiKey !== "local-no-key") {
      headers.Authorization = `Bearer ${descriptor.apiKey}`;
    }

    const sendReq = (withJsonFormat: boolean) =>
      fetch(descriptor.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: descriptor.defaultModel,
          temperature,
          ...(withJsonFormat ? { response_format: { type: "json_object" } } : {}),
          messages: [
            {
              role: "system",
              content: expectJson
                ? `${systemInstruction}\nOutput strictly valid JSON without markdown fences.`
                : systemInstruction,
            },
            { role: "user", content: userPrompt },
          ],
        }),
      });

    let res = await sendReq(expectJson);
    if (!res.ok && expectJson && res.status >= 400 && res.status < 500) {
      res = await sendReq(false);
    }
    if (!res.ok) {
      throw new Error(`${descriptor.provider} HTTP ${res.status}`);
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
    };
    const content = json.choices?.[0]?.message?.content?.trim() || "";
    if (!content) throw new Error("Empty completion from provider.");
    return {
      text: expectJson ? extractFirstJsonObject(content) : content,
      model: json.model || descriptor.defaultModel,
    };
  }

  const res = await fetch(descriptor.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": descriptor.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: descriptor.defaultModel,
      max_tokens: 4096,
      temperature,
      system: expectJson
        ? `${systemInstruction}\nRespond ONLY with a single valid JSON object.`
        : systemInstruction,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Anthropic HTTP ${res.status}`);
  }
  const json = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
    model?: string;
  };
  const content =
    json.content
      ?.map((c) => c.text || "")
      .join("\n")
      .trim() || "";
  if (!content) throw new Error("Empty completion from Anthropic.");
  return {
    text: expectJson ? extractFirstJsonObject(content) : content,
    model: json.model || descriptor.defaultModel,
  };
}

function validateWorkspaceId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!/^[a-zA-Z0-9_-]{8,64}$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

async function ensureWorkspacesDir(): Promise<void> {
  await fs.mkdir(WORKSPACES_DIR, { recursive: true });
}

function getWorkspaceFilePath(workspaceId: string): string {
  return path.join(WORKSPACES_DIR, `${workspaceId}.json`);
}

async function readWorkspaceEnvelope(workspaceId: string): Promise<StoredWorkspaceEnvelope | null> {
  try {
    const raw = await fs.readFile(getWorkspaceFilePath(workspaceId), "utf-8");
    const parsed = JSON.parse(raw) as StoredWorkspaceEnvelope;
    if (!parsed || typeof parsed !== "object" || !parsed.state) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function writeWorkspaceEnvelopeAtomically(
  workspaceId: string,
  state: unknown
): Promise<{ updatedAt: string; revision: number; bytes: number }> {
  await ensureWorkspacesDir();
  const existing = await readWorkspaceEnvelope(workspaceId);
  const revision = (existing?.revision || 0) + 1;
  const updatedAt = new Date().toISOString();
  const envelope: StoredWorkspaceEnvelope = {
    workspaceId,
    updatedAt,
    revision,
    state,
  };
  const serialized = JSON.stringify(envelope, null, 2);
  const finalPath = getWorkspaceFilePath(workspaceId);
  const tempPath = `${finalPath}.tmp.${process.pid}.${Date.now()}`;
  await fs.writeFile(tempPath, serialized, "utf-8");
  await fs.rename(tempPath, finalPath);
  return {
    updatedAt,
    revision,
    bytes: Buffer.byteLength(serialized, "utf-8"),
  };
}

async function startServer() {
  const app = express();
  const PORT =
    process.env.NODE_ENV === "production"
      ? Number(process.env.PORT) || 3000
      : 3000;

  // Support local split-port / Electron desktop renderer requests safely
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (
      origin &&
      (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin) ||
        origin.startsWith("file://"))
    ) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    }
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(express.json({ limit: "25mb" }));

  // =========================================================================
  // 1. LOCAL WORKSPACE DATABASE API (Per-Learner Atomic Disk Persistence)
  // =========================================================================
  app.get("/api/db/health", async (_req, res) => {
    try {
      await ensureWorkspacesDir();
      const files = await fs.readdir(WORKSPACES_DIR);
      const workspaceCount = files.filter((f) => f.endsWith(".json")).length;
      res.json({
        ok: true,
        engine: "local-atomic-json-store",
        storageDir: "data/workspaces",
        workspaceCount,
      });
    } catch (err: unknown) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : "Local DB directory check failed.",
      });
    }
  });

  app.get("/api/db/workspaces/:workspaceId", async (req, res) => {
    const workspaceId = validateWorkspaceId(req.params.workspaceId);
    if (!workspaceId) {
      res.status(400).json({ error: "Invalid workspace ID format." });
      return;
    }
    const envelope = await readWorkspaceEnvelope(workspaceId);
    if (!envelope) {
      res.json({ found: false });
      return;
    }
    res.json({
      found: true,
      workspaceId: envelope.workspaceId,
      updatedAt: envelope.updatedAt,
      revision: envelope.revision,
      state: envelope.state,
    });
  });

  app.put("/api/db/workspaces/:workspaceId", async (req, res) => {
    try {
      const workspaceId = validateWorkspaceId(req.params.workspaceId);
      if (!workspaceId) {
        res.status(400).json({ error: "Invalid workspace ID format." });
        return;
      }
      const { state } = req.body as { state?: unknown };
      if (!state || typeof state !== "object") {
        res.status(400).json({ error: "Missing valid state payload." });
        return;
      }
      const meta = await writeWorkspaceEnvelopeAtomically(workspaceId, state);
      res.json({
        ok: true,
        workspaceId,
        ...meta,
      });
    } catch (err: unknown) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "Failed to persist workspace snapshot.",
      });
    }
  });

  app.delete("/api/db/workspaces/:workspaceId", async (req, res) => {
    const workspaceId = validateWorkspaceId(req.params.workspaceId);
    if (!workspaceId) {
      res.status(400).json({ error: "Invalid workspace ID format." });
      return;
    }
    try {
      await fs.unlink(getWorkspaceFilePath(workspaceId));
    } catch {
      // Ignore if file does not exist
    }
    res.json({ ok: true, workspaceId });
  });

  // =========================================================================
  // 2. UNIVERSAL INTEGRATIVE AI & PHYSICS ENGINE STATUS
  // =========================================================================
  app.get("/api/ai/status", (_req, res) => {
    const snap = llmRouter.getPublicSnapshot();
    const active = snap.active;
    const baseModels = [
      { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash (Integrative Physics + AI)" },
      { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite (Low-Latency Synthesis)" },
    ];
    if (
      active.defaultModel &&
      !baseModels.some((m) => m.id === active.defaultModel) &&
      active.kind !== "deterministic"
    ) {
      baseModels.unshift({
        id: active.defaultModel,
        label: `${active.defaultModel} (${active.provider}${
          active.isLocalEndpoint ? " · Local" : ""
        })`,
      });
    }
    res.json({
      connected: true,
      cloudConfigured: active.llmConfigured,
      provider: active.provider,
      defaultModel: active.defaultModel,
      endpointLabel: active.endpointLabel,
      isLocalEndpoint: active.isLocalEndpoint,
      availableModels: baseModels,
    });
  });

  // =========================================================================
  // 3. INTEGRATIVE CURRICULUM ENGINE (Any API + First-Principles Math/Physics)
  // =========================================================================
  app.post("/api/ai/curriculum", async (req, res) => {
    const {
      topic,
      learningGoals,
      learnerLevel,
      targetUnitCount,
      category,
      rawNotesText,
      uploadedDocuments,
      model,
      temperature,
      topP,
    } = req.body as {
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
    };

    const docs = Array.isArray(uploadedDocuments) ? uploadedDocuments.slice(0, 8) : [];
    const hasNotesText = Boolean(rawNotesText && rawNotesText.trim().length > 0);
    const hasTopic = Boolean(topic && topic.trim().length > 0);

    if (!hasTopic && !hasNotesText && docs.length === 0) {
      res.status(400).json({
        error: "Provide a subject to learn, paste your notes, or upload study documents.",
      });
      return;
    }

    const active = detectActiveProvider();
    const unitCount = Math.max(3, Math.min(8, Math.round(Number(targetUnitCount) || 5)));
    const levelLabel = learnerLevel || "Intermediate";

    // Build shared prompt & multimodal parts
    const parts: Array<
      | { inlineData: { mimeType: string; data: string } }
      | { text: string }
    > = [];
    const textDocsSummary: string[] = [];

    for (const doc of docs) {
      const docName = (doc.name || "uploaded-note").slice(0, 120);
      const mime = (doc.mimeType || "").toLowerCase();
      if (doc.base64Data && SUPPORTED_INLINE_MIMES.has(mime) && active.kind === "gemini") {
        parts.push({
          inlineData: {
            mimeType: mime,
            data: doc.base64Data,
          },
        });
        textDocsSummary.push(`[Attached Binary Document: ${docName} (${mime})]`);
      } else if (doc.textContent && doc.textContent.trim().length > 0) {
        textDocsSummary.push(
          `<uploaded_document filename="${docName}">\n${doc.textContent.trim().slice(0, 45000)}\n</uploaded_document>`
        );
      }
    }

    const hasAnyUploadedMaterial = hasNotesText || docs.length > 0;
    const systemInstruction = `You are a master integrative curriculum architect, physicist, and applied mathematician.
Design a complete, personalized learning curriculum tailored to the learner's subject that explicitly integrates domain mastery with REAL physics laws (Newtonian/Hamiltonian mechanics, conservation of energy/momentum, oscillations, fields, or thermodynamics) and rigorous mathematics (differential equations, linear algebra, vector calculus, and numerical verification).
${
  hasAnyUploadedMaterial
    ? `CRITICAL GROUNDING RULE: Incorporate the learner's uploaded notes/documents directly into the units while enriching them with governing mathematical equations and physical intuition.`
    : `Structure a rigorous progression from foundational equations and physical intuition to numerical mastery.`
}
Output strictly valid JSON:
- Generate ${unitCount} sequenced units.
- Each unit's starterNotesMarkdown (240 to 380 words) MUST include clear headings, governing equations, physical conservation intuition, a concrete worked numerical calculation, and key takeaways.
- Generate 6 to 10 active-recall flashcards (unitIndex 0..${unitCount - 1}), 3 milestones, and 2 studyBlocks.`;

    const promptSegments: string[] = [
      `Target Subject: ${
        hasTopic ? topic!.trim() : "Infer primary subject from uploaded notes and learning goals"
      }`,
      `Learner Level: ${levelLabel}`,
      `Desired Unit Count: ${unitCount}`,
    ];
    if (category?.trim()) promptSegments.push(`Domain Category: ${category.trim()}`);
    if (learningGoals?.trim()) promptSegments.push(`Learning Goals:\n${learningGoals.trim()}`);
    if (hasNotesText) {
      promptSegments.push(`<learner_notes>\n${rawNotesText!.trim().slice(0, 45000)}\n</learner_notes>`);
    }
    if (textDocsSummary.length > 0) {
      promptSegments.push(`Uploaded Materials:\n${textDocsSummary.join("\n\n")}`);
    }
    const combinedPromptText = promptSegments.join("\n\n");

    try {
      if (active.kind === "gemini") {
        const ai = getGenAIClient(active.apiKey, active.baseUrl);
        const selectedModel = resolveGeminiModel(model);
        parts.push({ text: combinedPromptText });

        const response = await ai.models.generateContent({
          model: selectedModel,
          contents: { parts },
          config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                courseTitle: { type: Type.STRING },
                courseCode: { type: Type.STRING },
                category: { type: Type.STRING },
                tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                executiveSummary: { type: Type.STRING },
                units: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      estimatedHours: { type: Type.NUMBER },
                      keyConcepts: { type: Type.ARRAY, items: { type: Type.STRING } },
                      searchQueryForVideo: { type: Type.STRING },
                      briefOverview: { type: Type.STRING },
                      starterNotesMarkdown: { type: Type.STRING },
                    },
                    required: [
                      "title",
                      "estimatedHours",
                      "keyConcepts",
                      "searchQueryForVideo",
                      "briefOverview",
                      "starterNotesMarkdown",
                    ],
                  },
                },
                flashcards: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      unitIndex: { type: Type.INTEGER },
                      question: { type: Type.STRING },
                      answer: { type: Type.STRING },
                    },
                    required: ["unitIndex", "question", "answer"],
                  },
                },
                milestones: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      subtitle: { type: Type.STRING },
                      dueInDays: { type: Type.INTEGER },
                      urgency: { type: Type.STRING },
                    },
                    required: ["title", "subtitle", "dueInDays", "urgency"],
                  },
                },
                studyBlocks: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      timeRange: { type: Type.STRING },
                      durationMinutes: { type: Type.INTEGER },
                      title: { type: Type.STRING },
                      subtitle: { type: Type.STRING },
                    },
                    required: ["timeRange", "durationMinutes", "title", "subtitle"],
                  },
                },
              },
              required: [
                "courseTitle",
                "courseCode",
                "category",
                "tags",
                "executiveSummary",
                "units",
                "flashcards",
                "milestones",
                "studyBlocks",
              ],
            },
          },
        });

        const rawText = response.text;
        if (!rawText) throw new Error("Empty curriculum payload.");
        res.json({
          curriculum: JSON.parse(rawText.trim()),
          model: selectedModel,
        });
        return;
      }

      if (active.kind === "openai-compat" || active.kind === "anthropic") {
        const schemaHint = `JSON Schema keys required: courseTitle (string), courseCode (string), category (string), tags (string[]), executiveSummary (string), units (Array<{title, estimatedHours, keyConcepts, searchQueryForVideo, briefOverview, starterNotesMarkdown}>), flashcards (Array<{unitIndex, question, answer}>), milestones (Array<{title, subtitle, dueInDays, urgency}>), studyBlocks (Array<{timeRange, durationMinutes, title, subtitle}>).`;
        const { text, model: usedModel } = await callAlternativeProviderText(
          active,
          `${systemInstruction}\n${schemaHint}`,
          combinedPromptText,
          true,
          typeof temperature === "number" ? temperature : 0.25
        );
        res.json({
          curriculum: JSON.parse(text),
          model: `${active.provider}:${usedModel}`,
        });
        return;
      }
    } catch {
      // Fall through cleanly to Deterministic First-Principles Physics & Math Compiler!
    }

    const deterministic = synthesizeDeterministicCurriculum({
      topic,
      learningGoals,
      learnerLevel,
      targetUnitCount: unitCount,
      category,
      rawNotesText,
      uploadedDocuments: docs,
    });

    res.json({
      curriculum: deterministic,
      model: "first-principles-rk4-compiler",
    });
  });

  // =========================================================================
  // 4. DEEP RESEARCH REPORT ENGINE (Any API + First-Principles Math/Physics)
  // =========================================================================
  app.post("/api/ai/research", async (req, res) => {
    const { topic, rawNotesText, model, temperature, topP } = req.body as {
      topic?: string;
      rawNotesText?: string;
      model?: string;
      temperature?: number;
      topP?: number;
    };

    if (!topic || !topic.trim()) {
      res.status(400).json({ error: "Please provide a research query." });
      return;
    }

    const active = detectActiveProvider();
    const contextBlock =
      rawNotesText && rawNotesText.trim()
        ? `\n\nIncorporate these learner notes as primary context:\n${rawNotesText.trim().slice(0, 25000)}`
        : "";
    const userPrompt = `Conduct an integrative physics & mathematical deep research synthesis on: "${topic.trim()}".${contextBlock}`;
    const sysPrompt =
      "You are a principal physicist, applied mathematician, and systems researcher. Deconstruct the requested topic with exact governing equations, physical conservation laws, comparative numerical solver tradeoffs, executable verification code, formal invariant specs, and a 5-day mastery track.";

    try {
      if (active.kind === "gemini") {
        const ai = getGenAIClient(active.apiKey, active.baseUrl);
        const selectedModel = resolveGeminiModel(model);
        const response = await ai.models.generateContent({
          model: selectedModel,
          contents: userPrompt,
          config: {
            systemInstruction: sysPrompt,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                subtitle: { type: Type.STRING },
                executiveSummary: { type: Type.STRING },
                mathInvariants: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      label: { type: Type.STRING },
                      formula: { type: Type.STRING },
                      explanation: { type: Type.STRING },
                    },
                    required: ["label", "formula", "explanation"],
                  },
                },
                comparisonMatrix: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      approach: { type: Type.STRING },
                      modelType: { type: Type.STRING },
                      boundOrMetric: { type: Type.STRING },
                      complexity: { type: Type.STRING },
                      performance: { type: Type.STRING },
                      tradeoff: { type: Type.STRING },
                    },
                    required: [
                      "approach",
                      "modelType",
                      "boundOrMetric",
                      "complexity",
                      "performance",
                      "tradeoff",
                    ],
                  },
                },
                codeSectionTitle: { type: Type.STRING },
                codeLanguage: { type: Type.STRING },
                codeSnippet: { type: Type.STRING },
                formalVerificationTitle: { type: Type.STRING },
                formalVerificationSpec: { type: Type.STRING },
                fiveDayTrack: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      day: { type: Type.STRING },
                      milestone: { type: Type.STRING },
                    },
                    required: ["day", "milestone"],
                  },
                },
              },
              required: [
                "title",
                "subtitle",
                "executiveSummary",
                "mathInvariants",
                "comparisonMatrix",
                "codeSectionTitle",
                "codeLanguage",
                "codeSnippet",
                "formalVerificationTitle",
                "formalVerificationSpec",
                "fiveDayTrack",
              ],
            },
          },
        });
        if (response.text) {
          res.json({
            report: JSON.parse(response.text.trim()),
            model: selectedModel,
          });
          return;
        }
      } else if (active.kind === "openai-compat" || active.kind === "anthropic") {
        const schemaDesc = `Required JSON keys: title, subtitle, executiveSummary, mathInvariants (Array<{label, formula, explanation}>), comparisonMatrix (Array<{approach, modelType, boundOrMetric, complexity, performance, tradeoff}>), codeSectionTitle, codeLanguage, codeSnippet, formalVerificationTitle, formalVerificationSpec, fiveDayTrack (Array<{day, milestone}>).`;
        const { text, model: usedModel } = await callAlternativeProviderText(
          active,
          `${sysPrompt}\n${schemaDesc}`,
          userPrompt,
          true,
          0.2
        );
        res.json({
          report: JSON.parse(text),
          model: `${active.provider}:${usedModel}`,
        });
        return;
      }
    } catch {
      // Fall back to deterministic physics & math report
    }

    res.json({
      report: synthesizeDeterministicResearchReport({ topic: topic.trim(), rawNotesText }),
      model: "first-principles-rk4-compiler",
    });
  });

  // =========================================================================
  // 5. KNOWLEDGE VAULT AI ASSISTANT (Any API + First-Principles Fallback)
  // =========================================================================
  app.post("/api/ai/vault-assist", async (req, res) => {
    const { action = "ask", notesMarkdown = "", moduleTitle = "Study Unit", question, uploadedDocument, model } =
      req.body as {
        action?: "summarize" | "flashcards" | "ask" | "extract_code" | "ingest_file";
        notesMarkdown?: string;
        moduleTitle?: string;
        question?: string;
        uploadedDocument?: UploadedNoteDocument;
        model?: string;
      };

    const active = detectActiveProvider();

    try {
      if (active.kind === "gemini") {
        const ai = getGenAIClient(active.apiKey, active.baseUrl);
        const selectedModel = resolveGeminiModel(model);

        if (action === "flashcards") {
          const response = await ai.models.generateContent({
            model: selectedModel,
            contents: `Generate 4 active-recall flashcards integrating domain theory, governing math equations, and physical intuition for "${moduleTitle}":\n\n${notesMarkdown}`,
            config: {
              systemInstruction:
                "Create concise active-recall flashcards testing definitions, equations, conservation principles, and practical problem-solving.",
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  cards: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        question: { type: Type.STRING },
                        answer: { type: Type.STRING },
                      },
                      required: ["question", "answer"],
                    },
                  },
                },
                required: ["cards"],
              },
            },
          });
          const parsed = JSON.parse((response.text || '{"cards":[]}').trim());
          res.json({ cards: parsed.cards || [] });
          return;
        }

        if (action === "ingest_file" && uploadedDocument) {
          const parts: Array<
            | { inlineData: { mimeType: string; data: string } }
            | { text: string }
          > = [];
          const mime = (uploadedDocument.mimeType || "").toLowerCase();
          if (uploadedDocument.base64Data && SUPPORTED_INLINE_MIMES.has(mime)) {
            parts.push({
              inlineData: {
                mimeType: mime,
                data: uploadedDocument.base64Data,
              },
            });
          } else if (uploadedDocument.textContent) {
            parts.push({
              text: `<uploaded_file name="${uploadedDocument.name || "notes"}">\n${uploadedDocument.textContent.slice(0, 45000)}\n</uploaded_file>`,
            });
          }
          parts.push({
            text: `Convert "${uploadedDocument.name || "Document"}" into structured Markdown study notes for "${moduleTitle}", preserving every equation, definition, and physical/mathematical principle.`,
          });

          const response = await ai.models.generateContent({
            model: selectedModel,
            contents: { parts },
            config: {
              systemInstruction:
                "Convert uploaded documents into clean, structured Markdown notes with mathematical precision and zero filler.",
              temperature: 0.2,
            },
          });
          res.json({ markdown: response.text || "" });
          return;
        }

        let prompt = "";
        if (action === "summarize") {
          prompt = `Synthesize a high-density Markdown summary highlighting governing equations, physical conservation laws, and key takeaways for "${moduleTitle}":\n\n${notesMarkdown}`;
        } else if (action === "extract_code") {
          prompt = `Write a self-contained mathematical/physical numerical verification snippet (or worked derivation) in Markdown for "${moduleTitle}":\n\n${notesMarkdown}`;
        } else {
          prompt = `Module: "${moduleTitle}"\nCurrent Notes:\n${notesMarkdown || "(empty)"}\n\nQuestion: ${
            question || "Derive the core mathematical and physical intuition of this topic."
          }\n\nRespond in crisp Markdown for the Knowledge Vault.`;
        }

        const response = await ai.models.generateContent({
          model: selectedModel,
          contents: prompt,
          config: {
            systemInstruction:
              "You are a concise physicist, mathematician, and domain tutor inside a Markdown Knowledge Vault. Output clean Markdown without filler.",
            temperature: 0.25,
          },
        });
        res.json({ markdown: response.text || "" });
        return;
      }

      if (active.kind === "openai-compat" || active.kind === "anthropic") {
        if (action === "flashcards") {
          const { text } = await callAlternativeProviderText(
            active,
            'Return JSON {"cards":[{"question":"...","answer":"..."}]} with 4 integrative math/physics flashcards.',
            `Module: ${moduleTitle}\nNotes:\n${notesMarkdown}`,
            true,
            0.2
          );
          const parsed = JSON.parse(text) as { cards?: Array<{ question: string; answer: string }> };
          res.json({ cards: parsed.cards || [] });
          return;
        }
        const prompt =
          action === "summarize"
            ? `Summarize "${moduleTitle}" with governing math & physics invariants:\n\n${notesMarkdown}`
            : action === "extract_code"
            ? `Provide a numerical simulation/verification code example in Markdown for "${moduleTitle}":\n\n${notesMarkdown}`
            : `Module: "${moduleTitle}"\nQuestion: ${question || "Explain with real math and physics."}\nNotes:\n${notesMarkdown}`;
        const { text } = await callAlternativeProviderText(
          active,
          "Output clean Knowledge Vault Markdown grounded in real mathematics and physics.",
          prompt,
          false,
          0.25
        );
        res.json({ markdown: text });
        return;
      }
    } catch {
      // Fall back to deterministic integrative vault assist
    }

    res.json(
      synthesizeDeterministicVaultAssist({
        action,
        notesMarkdown,
        moduleTitle,
        question,
        uploadedDocument,
      })
    );
  });

  // =========================================================================
  // 6. AUTONOMOUS THINKING, FETCHING & NOTE-TAKING (Any API + First-Principles)
  // =========================================================================
  app.post("/api/ai/autonomous-sync", async (req, res) => {
    const {
      moduleTitle,
      courseTitle,
      courseCategory,
      existingNotes,
      learningGoals,
      model,
    } = req.body as {
      moduleTitle?: string;
      courseTitle?: string;
      courseCategory?: string;
      existingNotes?: string;
      learningGoals?: string;
      model?: string;
    };

    const cleanTitle = (moduleTitle || "").trim();
    if (!cleanTitle) {
      res.status(400).json({ error: "Module title is required for autonomous research." });
      return;
    }

    const active = detectActiveProvider();
    const subjectContext = [
      courseTitle ? `Course: ${courseTitle.trim()}` : "",
      courseCategory ? `Domain: ${courseCategory.trim()}` : "",
      learningGoals ? `Learner Focus: ${learningGoals.trim()}` : "",
    ]
      .filter(Boolean)
      .join(" | ");

    const hasSubstantialExistingNotes =
      typeof existingNotes === "string" && existingNotes.trim().split(/\s+/).length >= 60;

    const notePrompt = hasSubstantialExistingNotes
      ? `Topic / Study Unit: "${cleanTitle}"
${subjectContext ? `Context: ${subjectContext}\n` : ""}
Existing Learner Notes:
<existing_notes>
${existingNotes!.trim().slice(0, 18000)}
</existing_notes>

Think carefully from first principles. Enrich these notes into a cohesive Markdown study document (340 to 550 words) integrating exact governing mathematical equations, physical conservation intuition, a concrete numerical example, and mastery takeaways.`
      : `Topic / Study Unit: "${cleanTitle}"
${subjectContext ? `Context: ${subjectContext}\n` : ""}
Think deeply from first principles and write comprehensive Markdown study notes (340 to 520 words) integrating:
1. Core Mental Model & Physical/Mathematical Intuition
2. Governing Differential Equations, Invariants & Worked Numerical Calculation
3. Common Pitfalls, Boundary Conditions & Tradeoffs
4. High-Yield Mastery Checklist`;

    try {
      if (active.kind === "gemini") {
        const ai = getGenAIClient(active.apiKey, active.baseUrl);
        const selectedModel = resolveGeminiModel(model);
        let synthesizedMarkdown = "";
        let groundedWithSearch = false;
        const webSources: Array<{ title: string; url: string }> = [];

        try {
          const groundedRes = await ai.models.generateContent({
            model: "gemini-3.8-flash",
            contents: notePrompt,
            config: {
              systemInstruction:
                "You are an autonomous integrative physics, mathematics, and academic research agent inside a Knowledge Vault. Reason rigorously, verify facts via Google Search when helpful, and write crisp Markdown notes with real equations and numerical examples.",
              thinkingConfig: {
                thinkingLevel: ThinkingLevel.HIGH,
              },
              tools: [{ googleSearch: {} }],
              temperature: 0.2,
            },
          });

          synthesizedMarkdown = (groundedRes.text || "").trim();
          const chunks = groundedRes.candidates?.[0]?.groundingMetadata?.groundingChunks;
          if (Array.isArray(chunks)) {
            const seenUrls = new Set<string>();
            for (const chunk of chunks) {
              const uri = chunk?.web?.uri;
              const title = chunk?.web?.title;
              if (uri && typeof uri === "string" && !seenUrls.has(uri)) {
                seenUrls.add(uri);
                webSources.push({
                  title:
                    typeof title === "string" && title.trim()
                      ? title.trim()
                      : uri.replace(/^https?:\/\/(www\.)?/i, "").slice(0, 60),
                  url: uri,
                });
              }
            }
            groundedWithSearch = webSources.length > 0;
          }
        } catch {
          const fallbackRes = await ai.models.generateContent({
            model: selectedModel,
            contents: notePrompt,
            config: {
              systemInstruction:
                "You are an autonomous integrative physics, mathematics, and academic note-taking agent. Write crisp Markdown study notes with real equations and worked numerical examples.",
              thinkingConfig:
                selectedModel === "gemini-3.8-flash"
                  ? { thinkingLevel: ThinkingLevel.HIGH }
                  : undefined,
              temperature: 0.25,
            },
          });
          synthesizedMarkdown = (fallbackRes.text || "").trim();
        }

        if (synthesizedMarkdown) {
          const metaRes = await ai.models.generateContent({
            model: "gemini-3.1-flash-lite",
            contents: `Extract structured study metadata and 3 active-recall flashcards from these notes for "${cleanTitle}":\n\n${synthesizedMarkdown.slice(
              0,
              12000
            )}`,
            config: {
              systemInstruction:
                "Extract concise study metadata and 3 active-recall flashcards strictly matching the JSON schema.",
              temperature: 0.15,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  thinkingSummary: { type: Type.STRING },
                  briefOverview: { type: Type.STRING },
                  keyConcepts: { type: Type.ARRAY, items: { type: Type.STRING } },
                  searchQueryForVideo: { type: Type.STRING },
                  flashcards: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        question: { type: Type.STRING },
                        answer: { type: Type.STRING },
                      },
                      required: ["question", "answer"],
                    },
                  },
                },
                required: [
                  "thinkingSummary",
                  "briefOverview",
                  "keyConcepts",
                  "searchQueryForVideo",
                  "flashcards",
                ],
              },
            },
          });

          const parsedMeta = JSON.parse((metaRes.text || "{}").trim()) as {
            thinkingSummary?: string;
            briefOverview?: string;
            keyConcepts?: string[];
            searchQueryForVideo?: string;
            flashcards?: Array<{ question: string; answer: string }>;
          };

          res.json({
            notesMarkdown: synthesizedMarkdown,
            thinkingSummary:
              parsedMeta.thinkingSummary ||
              `Synthesized integrative physics & math notes for "${cleanTitle}".`,
            briefOverview:
              parsedMeta.briefOverview || `Integrative study notes covering ${cleanTitle}.`,
            keyConcepts: Array.isArray(parsedMeta.keyConcepts)
              ? parsedMeta.keyConcepts.slice(0, 5)
              : [],
            searchQueryForVideo:
              parsedMeta.searchQueryForVideo || `${cleanTitle} university lecture`,
            webSources: webSources.slice(0, 5),
            flashcards: Array.isArray(parsedMeta.flashcards)
              ? parsedMeta.flashcards.slice(0, 4)
              : [],
            groundedWithSearch,
            model: "gemini-3.8-flash",
            syncedAt: new Date().toISOString(),
          });
          return;
        }
      } else if (active.kind === "openai-compat" || active.kind === "anthropic") {
        const { text: mdText, model: usedModel } = await callAlternativeProviderText(
          active,
          "You are an autonomous integrative physics & math note-taking agent. Write structured Markdown notes with governing equations and numerical examples.",
          notePrompt,
          false,
          0.25
        );
        const detFallback = synthesizeDeterministicAutonomousNotes({
          moduleTitle: cleanTitle,
          courseTitle,
          courseCategory,
          existingNotes,
          learningGoals,
        });
        res.json({
          ...detFallback,
          notesMarkdown: mdText,
          thinkingSummary: `Synthesized integrative notes via ${active.provider} (${usedModel}).`,
          model: `${active.provider}:${usedModel}`,
          syncedAt: new Date().toISOString(),
        });
        return;
      }
    } catch {
      // Fall back cleanly to deterministic First-Principles Physics & Math Compiler
    }

    res.json(
      synthesizeDeterministicAutonomousNotes({
        moduleTitle: cleanTitle,
        courseTitle,
        courseCategory,
        existingNotes,
        learningGoals,
      })
    );
  });

  // =========================================================================
  // 7. 3D INTEGRATIVE PHYSICS & MATH LAB BLUEPRINT COMPILER
  // =========================================================================
  app.post("/api/ai/integrative-blueprint", async (req, res) => {
    const { topic, category, notesText, courseId, moduleId } = req.body as {
      topic?: string;
      category?: string;
      notesText?: string;
      courseId?: string;
      moduleId?: string;
    };

    const cleanTopic = (topic || "Integrative Physics & Applied Mathematics").trim();
    const active = detectActiveProvider();

    const baseBlueprint = compileIntegrativeLabBlueprint({
      topic: cleanTopic,
      category,
      notesText,
      courseId,
      moduleId,
      synthesisEngine: active.provider,
    });

    // Optionally enrich conceptual bridge descriptions via active LLM while keeping
    // physical simulation bounds strictly calibrated and deterministic
    try {
      if (active.kind === "gemini") {
        const ai = getGenAIClient(active.apiKey, active.baseUrl);
        const enrichRes = await ai.models.generateContent({
          model: "gemini-3.1-flash-lite",
          contents: `Topic: "${cleanTopic}" (${category || "STEM"})\nArchetype: ${baseBlueprint.archetypeLabel}\nProvide a crisp 1-sentence domainAnalogySummary explaining how "${cleanTopic}" maps onto ${baseBlueprint.primaryEquation}, plus 5 concise stage conceptBridge titles connecting "${cleanTopic}" sub-concepts to real physics & math.`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                domainAnalogySummary: { type: Type.STRING },
                stageBridges: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ["domainAnalogySummary", "stageBridges"],
            },
          },
        });
        if (enrichRes.text) {
          const parsed = JSON.parse(enrichRes.text.trim()) as {
            domainAnalogySummary?: string;
            stageBridges?: string[];
          };
          if (parsed.domainAnalogySummary?.trim()) {
            baseBlueprint.domainAnalogySummary = parsed.domainAnalogySummary.trim();
          }
          if (Array.isArray(parsed.stageBridges)) {
            baseBlueprint.stages = baseBlueprint.stages.map((st, idx) => ({
              ...st,
              conceptBridge: parsed.stageBridges?.[idx]?.trim() || st.conceptBridge,
            }));
          }
          baseBlueprint.synthesisEngine = "gemini-3.1-flash-lite + rk4-physics";
        }
      } else if (active.kind === "openai-compat" || active.kind === "anthropic") {
        const { text: enrichJson, model: usedModel } = await callAlternativeProviderText(
          active,
          'Return JSON {"domainAnalogySummary":"string","stageBridges":["s1","s2","s3","s4","s5"]}.',
          `Topic: "${cleanTopic}" (${category || "STEM"})\nArchetype: ${baseBlueprint.archetypeLabel}\nPrimary Equation: ${baseBlueprint.primaryEquation}`,
          true,
          0.2
        );
        const parsed = JSON.parse(enrichJson) as {
          domainAnalogySummary?: string;
          stageBridges?: string[];
        };
        if (parsed.domainAnalogySummary?.trim()) {
          baseBlueprint.domainAnalogySummary = parsed.domainAnalogySummary.trim();
        }
        if (Array.isArray(parsed.stageBridges)) {
          baseBlueprint.stages = baseBlueprint.stages.map((st, idx) => ({
            ...st,
            conceptBridge: parsed.stageBridges?.[idx]?.trim() || st.conceptBridge,
          }));
        }
        baseBlueprint.synthesisEngine = `${active.provider}:${usedModel} + rk4-physics`;
      }
    } catch {
      // Deterministic RK4 blueprint is already complete and verified
    }

    res.json({ blueprint: baseBlueprint });
  });

  // =========================================================================
  // 8. GROUNDED AI LEARNING & MISTAKE TUTOR (Records-Grounded + Offline Fallback)
  // =========================================================================
  app.post("/api/ai/tutor", async (req, res) => {
    const {
      mode = "explain",
      topicTitle = "Selected Study Topic",
      courseTitle = "",
      notesMarkdown = "",
      prompt = "",
      attemptHistory = [],
      recurringErrors = [],
      difficulty = "standard",
      model,
    } = req.body as {
      mode?: "explain" | "step_by_step" | "socratic" | "generate_quiz" | "mistake_analysis";
      topicTitle?: string;
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
    };

    const cleanTopic = topicTitle.trim() || "Study Topic";
    const groundingSources: string[] = [];
    if (notesMarkdown && notesMarkdown.trim().length > 20) {
      groundingSources.push(`Vault Notes (${notesMarkdown.trim().split(/\s+/).length} words)`);
    }
    if (Array.isArray(attemptHistory) && attemptHistory.length > 0) {
      groundingSources.push(`${attemptHistory.length} Recorded Assessment Attempt(s)`);
    }
    if (Array.isArray(recurringErrors) && recurringErrors.length > 0) {
      groundingSources.push(`Logged Error Categories (${recurringErrors.join(", ")})`);
    }
    const isGroundedInRecords = groundingSources.length > 0;

    const historyContext =
      Array.isArray(attemptHistory) && attemptHistory.length > 0
        ? attemptHistory
            .slice(-6)
            .map(
              (a) =>
                `- ${a.attemptedAt.slice(0, 10)}: "${a.title}" -> ${a.percentage}%${
                  a.errorCategories && a.errorCategories.length > 0
                    ? ` (errors: ${a.errorCategories.join(", ")})`
                    : ""
                }`
            )
            .join("\n")
        : "No prior assessment attempts recorded for this topic yet.";

    const notesContext =
      notesMarkdown && notesMarkdown.trim().length > 0
        ? notesMarkdown.trim().slice(0, 12000)
        : "(No student notes saved for this topic yet.)";

    const active = detectActiveProvider();

    try {
      if (active.kind === "gemini") {
        const ai = getGenAIClient(active.apiKey, active.baseUrl);
        const selectedModel = resolveGeminiModel(model);

        if (mode === "generate_quiz") {
          const quizRes = await ai.models.generateContent({
            model: selectedModel,
            contents: `Topic: "${cleanTopic}"${courseTitle ? ` (${courseTitle})` : ""}
Difficulty: ${difficulty}
Recurring Student Errors to Target: ${recurringErrors.length > 0 ? recurringErrors.join(", ") : "general conceptual & calculation checks"}
Student Notes Context:
${notesContext}

Generate a 4-question multiple-choice topic assessment (4 options each, exact correctAnswer matching one option, and concise explanation).`,
            config: {
              systemInstruction:
                "You are an academic assessment designer inside StudyOS. Create rigorous, unambiguous multiple-choice questions grounded in the student's notes and error patterns. Never fabricate past student scores.",
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  questions: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        prompt: { type: Type.STRING },
                        options: { type: Type.ARRAY, items: { type: Type.STRING } },
                        correctAnswer: { type: Type.STRING },
                        explanation: { type: Type.STRING },
                      },
                      required: ["prompt", "options", "correctAnswer", "explanation"],
                    },
                  },
                },
                required: ["title", "questions"],
              },
            },
          });

          const parsed = JSON.parse((quizRes.text || "{}").trim()) as {
            title?: string;
            questions?: Array<{
              prompt: string;
              options: string[];
              correctAnswer: string;
              explanation: string;
            }>;
          };
          const questions = (parsed.questions || []).slice(0, 5).map((q, idx) => {
            const opts = Array.isArray(q.options) && q.options.length >= 2 ? q.options : [q.correctAnswer, "None of the above"];
            const exactAnswer = opts.includes(q.correctAnswer) ? q.correctAnswer : opts[0];
            return {
              id: `q-ai-${Date.now()}-${idx}`,
              prompt: q.prompt,
              options: opts,
              correctAnswer: exactAnswer,
              explanation: q.explanation,
            };
          });

          if (questions.length > 0) {
            res.json({
              mode,
              markdown: `Generated a **${questions.length}-question ${difficulty} quiz** for **${cleanTopic}**${
                isGroundedInRecords ? ` grounded in ${groundingSources.join(" + ")}` : ""
              }. Review the questions below and click **Save & Launch Quiz** to take it as a verified attempt.`,
              isGroundedInRecords,
              groundingSources,
              generatedQuiz: {
                title: parsed.title || `${cleanTopic} — ${difficulty.toUpperCase()} Practice Quiz`,
                difficulty,
                questions,
              },
              model: selectedModel,
            });
            return;
          }
        }

        const modeInstructionMap: Record<string, string> = {
          explain:
            "Provide a clear, structured concept explanation connecting intuition, formal definitions/equations, and one concrete example.",
          step_by_step:
            "Solve or break down the problem step-by-step, explicitly stating assumptions, intermediate checks, and unit/boundary verification.",
          socratic:
            "Use Socratic tutoring: briefly frame the core principle, then ask 3 progressive guiding questions that help the student derive the answer themselves without giving away everything prematurely.",
          mistake_analysis:
            "Analyze the student's actual recorded assessment history and error categories. Explain why those error modes happen on this topic and prescribe 3 concrete remediation drills. If no attempts exist yet, state honestly that no mistakes are recorded yet and suggest a baseline diagnostic.",
        };

        const tutorRes = await ai.models.generateContent({
          model: selectedModel,
          contents: `Topic: "${cleanTopic}"${courseTitle ? ` (${courseTitle})` : ""}
Student Question / Focus: ${prompt || `Help me master ${cleanTopic}`}

Verified Assessment Record History:
${historyContext}

Student Vault Notes:
${notesContext}`,
          config: {
            systemInstruction: `You are the StudyOS Academic Learning Assistant.
CRITICAL HONESTY RULES:
1. Never fabricate previous conversations, fake assessment scores, or imaginary achievements.
2. Reference ONLY the verified assessment history and notes provided above; if records are empty, explicitly disclose that.
3. ${modeInstructionMap[mode] || modeInstructionMap.explain}`,
          },
        });

        if (tutorRes.text) {
          res.json({
            mode,
            markdown: tutorRes.text.trim(),
            isGroundedInRecords,
            groundingSources,
            model: selectedModel,
          });
          return;
        }
      } else if (active.kind === "openai-compat" || active.kind === "anthropic") {
        if (mode === "generate_quiz") {
          const { text: rawQuizJson, model: usedModel } = await callAlternativeProviderText(
            active,
            'You are an academic assessment designer inside StudyOS. Return JSON {"title":"string","questions":[{"prompt":"string","options":["a","b","c","d"],"correctAnswer":"a","explanation":"string"}]}. Never fabricate past student scores.',
            `Topic: "${cleanTopic}"${courseTitle ? ` (${courseTitle})` : ""}\nDifficulty: ${difficulty}\nRecurring Errors: ${recurringErrors.join(", ") || "none"}\nNotes:\n${notesContext}\n\nGenerate 4 rigorous multiple-choice questions.`,
            true,
            0.25
          );
          const parsed = JSON.parse(rawQuizJson) as {
            title?: string;
            questions?: Array<{
              prompt: string;
              options: string[];
              correctAnswer: string;
              explanation: string;
            }>;
          };
          const questions = (parsed.questions || []).slice(0, 5).map((q, idx) => {
            const opts =
              Array.isArray(q.options) && q.options.length >= 2
                ? q.options
                : [q.correctAnswer, "None of the above"];
            const exactAnswer = opts.includes(q.correctAnswer) ? q.correctAnswer : opts[0];
            return {
              id: `q-ai-${Date.now()}-${idx}`,
              prompt: q.prompt,
              options: opts,
              correctAnswer: exactAnswer,
              explanation: q.explanation,
            };
          });
          if (questions.length > 0) {
            res.json({
              mode,
              markdown: `Generated a **${questions.length}-question ${difficulty} quiz** for **${cleanTopic}** via **${active.provider}** (${usedModel})${
                isGroundedInRecords ? ` grounded in ${groundingSources.join(" + ")}` : ""
              }.`,
              isGroundedInRecords,
              groundingSources,
              generatedQuiz: {
                title: parsed.title || `${cleanTopic} — ${difficulty.toUpperCase()} Practice Quiz`,
                difficulty,
                questions,
              },
              model: `${active.provider}:${usedModel}`,
            });
            return;
          }
        }

        const { text: tutorMd, model: usedModel } = await callAlternativeProviderText(
          active,
          `You are the StudyOS Academic Learning Assistant (mode: ${mode}). Never fabricate previous conversations or scores; reference ONLY the provided assessment history and notes.`,
          `Topic: "${cleanTopic}"${courseTitle ? ` (${courseTitle})` : ""}\nQuestion: ${
            prompt || `Help me master ${cleanTopic}`
          }\n\nVerified Assessment History:\n${historyContext}\n\nStudent Vault Notes:\n${notesContext}`,
          false,
          0.25
        );
        res.json({
          mode,
          markdown: tutorMd,
          isGroundedInRecords,
          groundingSources,
          model: `${active.provider}:${usedModel}`,
        });
        return;
      }
    } catch {
      // Fall through to deterministic record-grounded fallback
    }

    // Deterministic Offline / Fallback Tutor (strictly honest, never fabricates records)
    if (mode === "generate_quiz") {
      const fallbackQuestions = [
        {
          id: `q-fb-${Date.now()}-1`,
          prompt: `Which statement best captures the foundational invariant of "${cleanTopic}"?`,
          options: [
            `Identifying the governing relationship, assumptions, and valid domain boundaries of ${cleanTopic}`,
            "Memorizing surface notation without checking boundary conditions",
            "Assuming linearity holds outside the defined operating regime",
            "Skipping dimensional and unit verification during problem solving",
          ],
          correctAnswer: `Identifying the governing relationship, assumptions, and valid domain boundaries of ${cleanTopic}`,
          explanation: `Durable understanding of ${cleanTopic} starts with its governing invariants and domain constraints.`,
        },
        {
          id: `q-fb-${Date.now()}-2`,
          prompt:
            recurringErrors.includes("calculation")
              ? `To eliminate recurring calculation errors in "${cleanTopic}", which step should precede numerical substitution?`
              : `When solving a novel problem on "${cleanTopic}", what is the most reliable verification step?`,
          options: [
            "Check dimensional consistency, limiting cases, and sign conventions symbolically first",
            "Substitute rounded decimals immediately at step one",
            "Omit intermediate algebraic steps to save time",
            "Rely on self-reported familiarity without testing output bounds",
          ],
          correctAnswer:
            "Check dimensional consistency, limiting cases, and sign conventions symbolically first",
          explanation:
            "Symbolic sign and unit checks catch calculation and conceptual slips before arithmetic compounds them.",
        },
        {
          id: `q-fb-${Date.now()}-3`,
          prompt: `How does StudyOS verify durable mastery of "${cleanTopic}"?`,
          options: [
            "Consistent accuracy across multiple recorded assessments including delayed recall",
            "Passive timer minutes logged without assessment",
            "Self-rated confidence slider alone",
            "Highlighting lecture notes without retrieval practice",
          ],
          correctAnswer:
            "Consistent accuracy across multiple recorded assessments including delayed recall",
          explanation:
            "Verified mastery requires empirical retrieval accuracy over time, not passive exposure.",
        },
      ];

      res.json({
        mode,
        markdown: `Prepared a **3-question ${difficulty} diagnostic quiz** for **${cleanTopic}** using the built-in deterministic study engine${
          isGroundedInRecords ? ` (grounded in ${groundingSources.join(", ")})` : ""
        }. Click **Save & Launch Quiz** to record an official attempt.`,
        isGroundedInRecords,
        groundingSources,
        generatedQuiz: {
          title: `${cleanTopic} — ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} Diagnostic`,
          difficulty,
          questions: fallbackQuestions,
        },
        model: "deterministic-grounded-tutor",
      });
      return;
    }

    const fallbackMarkdown =
      mode === "mistake_analysis"
        ? attemptHistory.length === 0
          ? `### Mistake Pattern Analysis — ${cleanTopic}\n\n**Record Disclosure:** Zero assessment attempts are recorded for **${cleanTopic}** yet, so there are no verified mistake patterns to diagnose.\n\n#### Recommended Next Step\n1. Open **Tasks, Exams & Practice** and run a 3-question baseline quiz on **${cleanTopic}**.\n2. Tag any missed questions (` +
            "`conceptual`, `calculation`, `recall`, `careless`, or `time_pressure`" +
            `) so StudyOS can track recurring error patterns.`
          : `### Mistake Pattern Analysis — ${cleanTopic}\n\n**Verified Record Summary:** Analyzed **${attemptHistory.length}** recorded attempt(s). Latest score: **${
              attemptHistory[attemptHistory.length - 1].percentage
            }%**.\n\n**Logged Error Categories:** ${
              recurringErrors.length > 0 ? recurringErrors.join(", ") : "None tagged yet"
            }.\n\n#### Targeted Remediation Plan\n1. **Isolate the root step:** Review your Vault notes for *${cleanTopic}* and write a 2-line rule for each ${
              recurringErrors[0] || "missed"
            } error.\n2. **Active retrieval drill:** Solve 2 unassisted practice problems without looking at worked notes.\n3. **Re-assess:** Log a follow-up quiz in **Tasks, Exams & Practice** to measure score improvement against your baseline.`
        : mode === "socratic"
        ? `### Socratic Inquiry — ${cleanTopic}\n\n${
            prompt ? `**Your Focus:** ${prompt}\n\n` : ""
          }Work through these three questions in your own words before checking your notes:\n\n1. **Core Principle:** What fundamental constraint or definition makes **${cleanTopic}** necessary in ${
            courseTitle || "this subject"
          }?\n2. **Boundary Case:** Under what extreme input or edge condition does the standard assumption in **${cleanTopic}** break down?\n3. **Verification:** How could you test whether your solution to a **${cleanTopic}** problem is correct using an independent check?`
        : mode === "step_by_step"
        ? `### Step-by-Step Problem Framework — ${cleanTopic}\n\n${
            prompt ? `**Target Problem:** ${prompt}\n\n` : ""
          }1. **State Given Invariants & Unknowns:** Write down the exact quantities, domain constraints, and target output for **${cleanTopic}**.\n2. **Select Governing Relation:** Match the problem structure to the core theorem or equation in your Vault notes${
            isGroundedInRecords ? ` (${groundingSources[0]})` : ""
          }.\n3. **Execute Symbolic Derivation First:** Keep variables symbolic to verify units and sign consistency before substituting numbers.\n4. **Sanity-Check Limiting Behavior:** Verify the result against known boundary cases, then test yourself with a practice quiz.`
        : `### Concept Synthesis — ${cleanTopic}\n\n${
            prompt ? `**Prompt:** ${prompt}\n\n` : ""
          }**Grounding Status:** ${
            isGroundedInRecords
              ? `Grounded in ${groundingSources.join(" · ")}.`
              : "No student notes or assessment attempts recorded for this topic yet — showing structured study scaffold."
          }\n\n- **Mental Model:** Break **${cleanTopic}** into its core definition, governing assumptions, and primary failure modes.\n- **Active Recall Check:** Summarize the key mechanism of **${cleanTopic}** from memory in 3 sentences, then compare against your Knowledge Vault notes.\n- **Verification:** Complete a short Topic Quiz to convert passive reading into verified assessment evidence.`;

    res.json({
      mode,
      markdown: fallbackMarkdown,
      isGroundedInRecords,
      groundingSources,
      model: "deterministic-grounded-tutor",
    });
  });

  // =========================================================================
  // 8. LEARNINGOS SQLITE + FTS5 + CAPTIONS + JOBS + ADAPTERS + MCP BRIDGE
  // =========================================================================
  registerLearningOSRoutes(app, __dirname, WORKSPACES_DIR, llmRouter);

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const httpServer = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Study OS server listening on http://0.0.0.0:${PORT}`);
  });

  httpServer.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE" && PORT !== 3000) {
      console.warn(`Port ${PORT} in use, falling back to port 3000...`);
      app.listen(3000, "0.0.0.0", () => {
        console.log("Study OS server listening on http://0.0.0.0:3000");
      });
    } else {
      console.error("Failed to start Study OS server:", err);
      process.exit(1);
    }
  });
}

startServer();
