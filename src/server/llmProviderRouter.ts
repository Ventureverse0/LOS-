/* ============================================================================
 * UNIVERSAL LOCAL & CUSTOM ENDPOINT LLM PROVIDER ROUTER (Stage 24)
 * - Supports local endpoints (Ollama, LM Studio, llama.cpp, vLLM, LocalAI,
 *   custom OpenAI-compatible URLs, custom Gemini base URLs) and cloud APIs.
 * - Keeps ALL API keys strictly server-side (env vars or protected server-only
 *   data/config/local-secrets.json — never sent to or accepted from browser UI).
 * - Automatic JSON-mode fallback for local GGUF/llama.cpp/Ollama models that
 *   do not support `response_format: { type: "json_object" }`.
 * ========================================================================== */

import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { GoogleGenAI, ThinkingLevel, type Schema } from "@google/genai";
import { redactSecretsFromLog as redactSecrets } from "./sqliteLearningOS.ts";

export type ProviderMode =
  | "auto"
  | "ollama"
  | "lmstudio"
  | "llamacpp"
  | "vllm"
  | "custom-openai"
  | "gemini"
  | "openai"
  | "groq"
  | "deepseek"
  | "anthropic"
  | "offline";

export type CredentialSlot =
  | "none"
  | "CUSTOM_LLM_API_KEY"
  | "GEMINI_API_KEY"
  | "OPENAI_API_KEY"
  | "GROQ_API_KEY"
  | "DEEPSEEK_API_KEY"
  | "ANTHROPIC_API_KEY";

export interface ProviderRoutingSettings {
  mode: ProviderMode;
  baseUrl: string;
  model: string;
  credentialSlot: CredentialSlot;
  timeoutMs: number;
  updatedAt: string;
}

export interface LocalSecretsFileSchema {
  CUSTOM_LLM_API_KEY?: string;
  GEMINI_API_KEY?: string;
  OPENAI_API_KEY?: string;
  GROQ_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  customHeaders?: Record<string, string>;
}

export type ResolvedRuntimeProvider =
  | {
      kind: "gemini";
      provider: "gemini";
      apiKey: string;
      baseUrl?: string;
      defaultModel: string;
      isLocalEndpoint: boolean;
      credentialSlot: CredentialSlot;
    }
  | {
      kind: "openai-compat";
      provider:
        | "ollama"
        | "lmstudio"
        | "llamacpp"
        | "vllm"
        | "custom-openai"
        | "openai"
        | "groq"
        | "deepseek";
      baseUrl: string;
      chatCompletionsUrl: string;
      modelsUrl: string;
      apiKey: string;
      defaultModel: string;
      isLocalEndpoint: boolean;
      credentialSlot: CredentialSlot;
      customHeaders?: Record<string, string>;
    }
  | {
      kind: "anthropic";
      provider: "anthropic";
      baseUrl: string;
      messagesUrl: string;
      apiKey: string;
      defaultModel: string;
      isLocalEndpoint: boolean;
      credentialSlot: CredentialSlot;
    }
  | {
      kind: "deterministic";
      provider: "first-principles-engine";
      defaultModel: string;
      isLocalEndpoint: true;
      credentialSlot: "none";
    };

export interface ProviderPublicSnapshot {
  settings: ProviderRoutingSettings;
  active: {
    kind: ResolvedRuntimeProvider["kind"];
    provider: string;
    defaultModel: string;
    endpointLabel: string;
    isLocalEndpoint: boolean;
    llmConfigured: boolean;
  };
  credentialSlots: Array<{
    slot: CredentialSlot;
    label: string;
    configured: boolean;
    source: "keyless" | "env" | "local_secrets_file" | "unset";
  }>;
  presets: Array<{
    mode: ProviderMode;
    label: string;
    defaultBaseUrl: string;
    defaultModel: string;
    defaultSlot: CredentialSlot;
    requiresKey: boolean;
  }>;
  capabilities: {
    chat: boolean;
    structuredJson: boolean;
    multimodalInlineDocs: boolean;
    localEndpoint: boolean;
    offlineFallbackReady: boolean;
  };
}

export const PROVIDER_PRESETS: ProviderPublicSnapshot["presets"] = [
  {
    mode: "auto",
    label: "Auto-Detect (Local Custom -> Cloud Env -> Offline Engine)",
    defaultBaseUrl: "",
    defaultModel: "",
    defaultSlot: "CUSTOM_LLM_API_KEY",
    requiresKey: false,
  },
  {
    mode: "ollama",
    label: "Ollama (Local Server · 127.0.0.1:11434)",
    defaultBaseUrl: "http://127.0.0.1:11434/v1",
    defaultModel: "llama3.2",
    defaultSlot: "none",
    requiresKey: false,
  },
  {
    mode: "lmstudio",
    label: "LM Studio (Local OpenAI Server · 127.0.0.1:1234/v1)",
    defaultBaseUrl: "http://127.0.0.1:1234/v1",
    defaultModel: "local-model",
    defaultSlot: "none",
    requiresKey: false,
  },
  {
    mode: "llamacpp",
    label: "llama.cpp Server (Local · 127.0.0.1:8080/v1)",
    defaultBaseUrl: "http://127.0.0.1:8080/v1",
    defaultModel: "local-gguf",
    defaultSlot: "none",
    requiresKey: false,
  },
  {
    mode: "vllm",
    label: "vLLM / LocalAI (Local or LAN · 127.0.0.1:8000/v1)",
    defaultBaseUrl: "http://127.0.0.1:8000/v1",
    defaultModel: "Qwen/Qwen2.5-7B-Instruct",
    defaultSlot: "CUSTOM_LLM_API_KEY",
    requiresKey: false,
  },
  {
    mode: "custom-openai",
    label: "Custom OpenAI-Compatible Endpoint (Local Proxy / OpenRouter / LiteLLM)",
    defaultBaseUrl: "http://127.0.0.1:4000/v1",
    defaultModel: "gpt-4o-mini",
    defaultSlot: "CUSTOM_LLM_API_KEY",
    requiresKey: false,
  },
  {
    mode: "gemini",
    label: "Google Gemini (@google/genai · Server Key + Optional Base URL)",
    defaultBaseUrl: "",
    defaultModel: "gemini-3.8-flash",
    defaultSlot: "GEMINI_API_KEY",
    requiresKey: true,
  },
  {
    mode: "openai",
    label: "OpenAI API",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    defaultSlot: "OPENAI_API_KEY",
    requiresKey: true,
  },
  {
    mode: "groq",
    label: "Groq Cloud",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    defaultSlot: "GROQ_API_KEY",
    requiresKey: true,
  },
  {
    mode: "deepseek",
    label: "DeepSeek API",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    defaultSlot: "DEEPSEEK_API_KEY",
    requiresKey: true,
  },
  {
    mode: "anthropic",
    label: "Anthropic Claude API",
    defaultBaseUrl: "https://api.anthropic.com",
    defaultModel: "claude-3-5-sonnet-latest",
    defaultSlot: "ANTHROPIC_API_KEY",
    requiresKey: true,
  },
  {
    mode: "offline",
    label: "100% Offline Deterministic Engine (Zero Network Calls)",
    defaultBaseUrl: "",
    defaultModel: "first-principles-rk4-compiler",
    defaultSlot: "none",
    requiresKey: false,
  },
];

const VALID_MODES = new Set<ProviderMode>(PROVIDER_PRESETS.map((p) => p.mode));
const VALID_SLOTS = new Set<CredentialSlot>([
  "none",
  "CUSTOM_LLM_API_KEY",
  "GEMINI_API_KEY",
  "OPENAI_API_KEY",
  "GROQ_API_KEY",
  "DEEPSEEK_API_KEY",
  "ANTHROPIC_API_KEY",
]);

export function isRealSecret(val?: string | null): val is string {
  if (!val) return false;
  const trimmed = val.trim();
  return (
    trimmed.length > 0 &&
    trimmed !== "MY_GEMINI_API_KEY" &&
    !trimmed.startsWith("YOUR_") &&
    !trimmed.startsWith("MY_")
  );
}

export function isLocalUrl(rawUrl?: string): boolean {
  if (!rawUrl) return false;
  try {
    const parsed = new URL(rawUrl);
    const h = parsed.hostname.toLowerCase();
    return (
      h === "localhost" ||
      h === "127.0.0.1" ||
      h === "0.0.0.0" ||
      h === "::1" ||
      h === "[::1]" ||
      h.endsWith(".local") ||
      h.startsWith("192.168.") ||
      h.startsWith("10.") ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(h)
    );
  } catch {
    return false;
  }
}

export function normalizeOpenAiEndpoints(rawBaseUrl: string): {
  baseUrl: string;
  chatCompletionsUrl: string;
  modelsUrl: string;
} {
  const cleaned = rawBaseUrl.trim().replace(/\/+$/, "");
  if (cleaned.endsWith("/chat/completions")) {
    const root = cleaned.slice(0, -"/chat/completions".length);
    return {
      baseUrl: root,
      chatCompletionsUrl: cleaned,
      modelsUrl: `${root}/models`,
    };
  }
  if (/\/v\d+$/i.test(cleaned) || cleaned.endsWith("/openai/v1")) {
    return {
      baseUrl: cleaned,
      chatCompletionsUrl: `${cleaned}/chat/completions`,
      modelsUrl: `${cleaned}/models`,
    };
  }
  return {
    baseUrl: `${cleaned}/v1`,
    chatCompletionsUrl: `${cleaned}/v1/chat/completions`,
    modelsUrl: `${cleaned}/v1/models`,
  };
}

export function extractFirstJsonObject(raw: string): string {
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

export class LlmProviderRouter {
  private readonly configDir: string;
  private readonly routingFilePath: string;
  private readonly localSecretsFilePath: string;
  private settings: ProviderRoutingSettings;

  constructor(rootDir: string) {
    this.configDir = path.join(rootDir, "data", "config");
    this.routingFilePath = path.join(this.configDir, "provider-routing.json");
    this.localSecretsFilePath = path.join(this.configDir, "local-secrets.json");
    fs.mkdirSync(this.configDir, { recursive: true });
    this.settings = this.loadInitialSettings();
  }

  private loadInitialSettings(): ProviderRoutingSettings {
    const envModeRaw = (process.env.LLM_PROVIDER_MODE || "").trim() as ProviderMode;
    const defaultMode: ProviderMode = VALID_MODES.has(envModeRaw) ? envModeRaw : "auto";
    const fallback: ProviderRoutingSettings = {
      mode: defaultMode,
      baseUrl:
        process.env.CUSTOM_LLM_BASE_URL?.trim() ||
        process.env.LMSTUDIO_BASE_URL?.trim() ||
        process.env.OLLAMA_BASE_URL?.trim() ||
        "",
      model:
        process.env.CUSTOM_LLM_MODEL?.trim() ||
        process.env.OLLAMA_MODEL?.trim() ||
        "",
      credentialSlot: isRealSecret(process.env.CUSTOM_LLM_API_KEY)
        ? "CUSTOM_LLM_API_KEY"
        : "auto" === defaultMode
        ? "CUSTOM_LLM_API_KEY"
        : "none",
      timeoutMs: 30000,
      updatedAt: new Date().toISOString(),
    };

    try {
      if (fs.existsSync(this.routingFilePath)) {
        const parsed = JSON.parse(
          fs.readFileSync(this.routingFilePath, "utf-8")
        ) as Partial<ProviderRoutingSettings>;
        return this.sanitizeSettings({ ...fallback, ...parsed });
      }
    } catch {
      // Fall back to defaults
    }
    return fallback;
  }

  private sanitizeSettings(raw: Partial<ProviderRoutingSettings>): ProviderRoutingSettings {
    const mode: ProviderMode =
      raw.mode && VALID_MODES.has(raw.mode) ? raw.mode : "auto";
    const credentialSlot: CredentialSlot =
      raw.credentialSlot && VALID_SLOTS.has(raw.credentialSlot)
        ? raw.credentialSlot
        : "none";
    let baseUrl = typeof raw.baseUrl === "string" ? raw.baseUrl.trim() : "";
    if (baseUrl) {
      try {
        const u = new URL(baseUrl);
        if (u.protocol !== "http:" && u.protocol !== "https:") {
          baseUrl = "";
        }
      } catch {
        baseUrl = "";
      }
    }
    const model =
      typeof raw.model === "string" ? raw.model.trim().slice(0, 140) : "";
    const timeoutMs =
      typeof raw.timeoutMs === "number" && Number.isFinite(raw.timeoutMs)
        ? Math.min(120000, Math.max(3000, Math.round(raw.timeoutMs)))
        : 30000;

    return {
      mode,
      baseUrl,
      model,
      credentialSlot,
      timeoutMs,
      updatedAt: new Date().toISOString(),
    };
  }

  private readLocalSecretsFile(): LocalSecretsFileSchema {
    try {
      if (!fs.existsSync(this.localSecretsFilePath)) return {};
      const parsed = JSON.parse(
        fs.readFileSync(this.localSecretsFilePath, "utf-8")
      ) as LocalSecretsFileSchema;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  private resolveCredentialSlotValue(slot: CredentialSlot): {
    value: string | null;
    source: "keyless" | "env" | "local_secrets_file" | "unset";
  } {
    if (slot === "none") {
      return { value: "local-no-key", source: "keyless" };
    }
    const localFile = this.readLocalSecretsFile();
    const fromFile = localFile[slot];
    if (isRealSecret(fromFile)) {
      return { value: fromFile.trim(), source: "local_secrets_file" };
    }
    const fromEnv = process.env[slot];
    if (isRealSecret(fromEnv)) {
      return { value: fromEnv.trim(), source: "env" };
    }
    return { value: null, source: "unset" };
  }

  private resolveCustomHeaders(): Record<string, string> {
    const out: Record<string, string> = {};
    const envJson = process.env.CUSTOM_LLM_HEADERS_JSON?.trim();
    if (envJson) {
      try {
        const parsed = JSON.parse(envJson) as Record<string, unknown>;
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === "string" && k.trim()) out[k.trim()] = v;
        }
      } catch {
        // Ignore malformed header JSON
      }
    }
    const localFile = this.readLocalSecretsFile();
    if (localFile.customHeaders && typeof localFile.customHeaders === "object") {
      for (const [k, v] of Object.entries(localFile.customHeaders)) {
        if (typeof v === "string" && k.trim()) out[k.trim()] = v;
      }
    }
    return out;
  }

  async updateSettings(
    patch: Partial<ProviderRoutingSettings>
  ): Promise<ProviderPublicSnapshot> {
    this.settings = this.sanitizeSettings({
      ...this.settings,
      ...patch,
    });
    await fsp.mkdir(this.configDir, { recursive: true });
    await fsp.writeFile(
      this.routingFilePath,
      JSON.stringify(this.settings, null, 2),
      "utf-8"
    );
    return this.getPublicSnapshot();
  }

  getSettings(): ProviderRoutingSettings {
    return { ...this.settings };
  }

  resolveActiveProvider(): ResolvedRuntimeProvider {
    const s = this.settings;
    const customHeaders = this.resolveCustomHeaders();

    if (s.mode === "offline") {
      return {
        kind: "deterministic",
        provider: "first-principles-engine",
        defaultModel: "first-principles-rk4-compiler",
        isLocalEndpoint: true,
        credentialSlot: "none",
      };
    }

    if (
      s.mode === "ollama" ||
      s.mode === "lmstudio" ||
      s.mode === "llamacpp" ||
      s.mode === "vllm" ||
      s.mode === "custom-openai"
    ) {
      const preset = PROVIDER_PRESETS.find((p) => p.mode === s.mode)!;
      const rawUrl = s.baseUrl || preset.defaultBaseUrl;
      const endpoints = normalizeOpenAiEndpoints(rawUrl);
      const slotRes = this.resolveCredentialSlotValue(s.credentialSlot);
      const apiKey = slotRes.value || s.mode;
      return {
        kind: "openai-compat",
        provider: s.mode,
        baseUrl: endpoints.baseUrl,
        chatCompletionsUrl: endpoints.chatCompletionsUrl,
        modelsUrl: endpoints.modelsUrl,
        apiKey,
        defaultModel: s.model || preset.defaultModel,
        isLocalEndpoint: isLocalUrl(endpoints.baseUrl),
        credentialSlot: s.credentialSlot,
        customHeaders,
      };
    }

    if (s.mode === "gemini") {
      const primarySlot =
        s.credentialSlot === "none" ? "GEMINI_API_KEY" : s.credentialSlot;
      const key =
        this.resolveCredentialSlotValue(primarySlot).value ||
        this.resolveCredentialSlotValue("GEMINI_API_KEY").value ||
        this.resolveCredentialSlotValue("CUSTOM_LLM_API_KEY").value;
      if (key) {
        const geminiBase =
          s.baseUrl || process.env.CUSTOM_GEMINI_BASE_URL?.trim() || undefined;
        return {
          kind: "gemini",
          provider: "gemini",
          apiKey: key,
          baseUrl: geminiBase,
          defaultModel: s.model || "gemini-3.8-flash",
          isLocalEndpoint: Boolean(geminiBase && isLocalUrl(geminiBase)),
          credentialSlot: primarySlot,
        };
      }
    }

    if (s.mode === "openai" || s.mode === "groq" || s.mode === "deepseek") {
      const preset = PROVIDER_PRESETS.find((p) => p.mode === s.mode)!;
      const fallbackSlot = preset.defaultSlot;
      const slotToTry = s.credentialSlot === "none" ? fallbackSlot : s.credentialSlot;
      const key =
        this.resolveCredentialSlotValue(slotToTry).value ||
        this.resolveCredentialSlotValue(fallbackSlot).value ||
        this.resolveCredentialSlotValue("CUSTOM_LLM_API_KEY").value;
      if (key || (s.baseUrl && isLocalUrl(s.baseUrl))) {
        const endpoints = normalizeOpenAiEndpoints(s.baseUrl || preset.defaultBaseUrl);
        return {
          kind: "openai-compat",
          provider: s.mode,
          baseUrl: endpoints.baseUrl,
          chatCompletionsUrl: endpoints.chatCompletionsUrl,
          modelsUrl: endpoints.modelsUrl,
          apiKey: key || "local-override",
          defaultModel: s.model || preset.defaultModel,
          isLocalEndpoint: isLocalUrl(endpoints.baseUrl),
          credentialSlot: slotToTry,
          customHeaders,
        };
      }
    }

    if (s.mode === "anthropic") {
      const key =
        this.resolveCredentialSlotValue(
          s.credentialSlot === "none" ? "ANTHROPIC_API_KEY" : s.credentialSlot
        ).value || this.resolveCredentialSlotValue("ANTHROPIC_API_KEY").value;
      if (key) {
        const base = (s.baseUrl || "https://api.anthropic.com").replace(/\/+$/, "");
        const messagesUrl = base.endsWith("/v1/messages")
          ? base
          : `${base}/v1/messages`;
        return {
          kind: "anthropic",
          provider: "anthropic",
          baseUrl: base,
          messagesUrl,
          apiKey: key,
          defaultModel: s.model || "claude-3-5-sonnet-latest",
          isLocalEndpoint: isLocalUrl(base),
          credentialSlot: "ANTHROPIC_API_KEY",
        };
      }
    }

    // AUTO MODE RESOLUTION:
    // 1. Explicit custom local/OpenAI base URL (env or saved settings)
    const autoCustomBase =
      s.baseUrl ||
      process.env.CUSTOM_LLM_BASE_URL?.trim() ||
      process.env.LMSTUDIO_BASE_URL?.trim();
    if (autoCustomBase) {
      const endpoints = normalizeOpenAiEndpoints(autoCustomBase);
      const customKey =
        this.resolveCredentialSlotValue("CUSTOM_LLM_API_KEY").value || "local-custom";
      return {
        kind: "openai-compat",
        provider: "custom-openai",
        baseUrl: endpoints.baseUrl,
        chatCompletionsUrl: endpoints.chatCompletionsUrl,
        modelsUrl: endpoints.modelsUrl,
        apiKey: customKey,
        defaultModel:
          s.model || process.env.CUSTOM_LLM_MODEL?.trim() || "local-model",
        isLocalEndpoint: isLocalUrl(endpoints.baseUrl),
        credentialSlot: "CUSTOM_LLM_API_KEY",
        customHeaders,
      };
    }

    // 2. Gemini
    const geminiKey = this.resolveCredentialSlotValue("GEMINI_API_KEY").value;
    if (geminiKey) {
      const geminiBase = process.env.CUSTOM_GEMINI_BASE_URL?.trim() || undefined;
      return {
        kind: "gemini",
        provider: "gemini",
        apiKey: geminiKey,
        baseUrl: geminiBase,
        defaultModel: s.model || "gemini-3.8-flash",
        isLocalEndpoint: Boolean(geminiBase && isLocalUrl(geminiBase)),
        credentialSlot: "GEMINI_API_KEY",
      };
    }

    // 3. Groq / OpenAI / DeepSeek / Anthropic / Ollama
    const groqKey = this.resolveCredentialSlotValue("GROQ_API_KEY").value;
    if (groqKey) {
      const endpoints = normalizeOpenAiEndpoints("https://api.groq.com/openai/v1");
      return {
        kind: "openai-compat",
        provider: "groq",
        ...endpoints,
        apiKey: groqKey,
        defaultModel: s.model || "llama-3.3-70b-versatile",
        isLocalEndpoint: false,
        credentialSlot: "GROQ_API_KEY",
      };
    }

    const openAiKey = this.resolveCredentialSlotValue("OPENAI_API_KEY").value;
    if (openAiKey) {
      const endpoints = normalizeOpenAiEndpoints("https://api.openai.com/v1");
      return {
        kind: "openai-compat",
        provider: "openai",
        ...endpoints,
        apiKey: openAiKey,
        defaultModel: s.model || "gpt-4o-mini",
        isLocalEndpoint: false,
        credentialSlot: "OPENAI_API_KEY",
      };
    }

    const deepseekKey = this.resolveCredentialSlotValue("DEEPSEEK_API_KEY").value;
    if (deepseekKey) {
      const endpoints = normalizeOpenAiEndpoints("https://api.deepseek.com/v1");
      return {
        kind: "openai-compat",
        provider: "deepseek",
        ...endpoints,
        apiKey: deepseekKey,
        defaultModel: s.model || "deepseek-chat",
        isLocalEndpoint: false,
        credentialSlot: "DEEPSEEK_API_KEY",
      };
    }

    const anthropicKey = this.resolveCredentialSlotValue("ANTHROPIC_API_KEY").value;
    if (anthropicKey) {
      return {
        kind: "anthropic",
        provider: "anthropic",
        baseUrl: "https://api.anthropic.com",
        messagesUrl: "https://api.anthropic.com/v1/messages",
        apiKey: anthropicKey,
        defaultModel: s.model || "claude-3-5-sonnet-latest",
        isLocalEndpoint: false,
        credentialSlot: "ANTHROPIC_API_KEY",
      };
    }

    if (isRealSecret(process.env.OLLAMA_BASE_URL)) {
      const endpoints = normalizeOpenAiEndpoints(process.env.OLLAMA_BASE_URL);
      return {
        kind: "openai-compat",
        provider: "ollama",
        ...endpoints,
        apiKey: "ollama",
        defaultModel: s.model || process.env.OLLAMA_MODEL?.trim() || "llama3.2",
        isLocalEndpoint: isLocalUrl(endpoints.baseUrl),
        credentialSlot: "none",
      };
    }

    return {
      kind: "deterministic",
      provider: "first-principles-engine",
      defaultModel: "first-principles-rk4-compiler",
      isLocalEndpoint: true,
      credentialSlot: "none",
    };
  }

  getPublicSnapshot(): ProviderPublicSnapshot {
    const active = this.resolveActiveProvider();
    const slotLabels: Array<{ slot: CredentialSlot; label: string }> = [
      { slot: "none", label: "Keyless Local Server (Ollama / LM Studio / llama.cpp)" },
      { slot: "CUSTOM_LLM_API_KEY", label: "Custom Key (CUSTOM_LLM_API_KEY)" },
      { slot: "GEMINI_API_KEY", label: "Google Gemini Key (GEMINI_API_KEY)" },
      { slot: "OPENAI_API_KEY", label: "OpenAI Key (OPENAI_API_KEY)" },
      { slot: "GROQ_API_KEY", label: "Groq Key (GROQ_API_KEY)" },
      { slot: "DEEPSEEK_API_KEY", label: "DeepSeek Key (DEEPSEEK_API_KEY)" },
      { slot: "ANTHROPIC_API_KEY", label: "Anthropic Key (ANTHROPIC_API_KEY)" },
    ];

    const credentialSlots = slotLabels.map(({ slot, label }) => {
      const info = this.resolveCredentialSlotValue(slot);
      return {
        slot,
        label,
        configured: Boolean(info.value),
        source: info.source,
      };
    });

    const endpointLabel =
      active.kind === "openai-compat"
        ? active.baseUrl
        : active.kind === "anthropic"
        ? active.baseUrl
        : active.kind === "gemini"
        ? active.baseUrl || "https://generativelanguage.googleapis.com"
        : "in-process://first-principles-rk4-engine";

    return {
      settings: this.getSettings(),
      active: {
        kind: active.kind,
        provider: active.provider,
        defaultModel: active.defaultModel,
        endpointLabel,
        isLocalEndpoint: active.isLocalEndpoint,
        llmConfigured: active.kind !== "deterministic",
      },
      credentialSlots,
      presets: PROVIDER_PRESETS,
      capabilities: {
        chat: active.kind !== "deterministic",
        structuredJson: true,
        multimodalInlineDocs: active.kind === "gemini",
        localEndpoint: active.isLocalEndpoint,
        offlineFallbackReady: true,
      },
    };
  }

  createGenAIClient(apiKey: string, baseUrl?: string): GoogleGenAI {
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        ...(baseUrl ? { baseUrl } : {}),
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }

  async generateCompletion(params: {
    systemInstruction: string;
    userPrompt: string;
    expectJson?: boolean;
    geminiSchema?: Schema;
    inlineParts?: Array<
      | { inlineData: { mimeType: string; data: string } }
      | { text: string }
    >;
    preferredModel?: string;
    enableSearchGrounding?: boolean;
  }): Promise<{
    text: string;
    model: string;
    provider: string;
    webSources?: Array<{ title: string; url: string }>;
  }> {
    const active = this.resolveActiveProvider();
    if (active.kind === "deterministic") {
      throw new Error("Active provider is set to offline deterministic mode.");
    }

    if (active.kind === "gemini") {
      const ai = this.createGenAIClient(active.apiKey, active.baseUrl);
      const allowedGemini = new Set(["gemini-3.8-flash", "gemini-3.1-flash-lite"]);
      const modelToUse =
        params.preferredModel && allowedGemini.has(params.preferredModel)
          ? params.preferredModel
          : active.defaultModel || "gemini-3.8-flash";

      const contents =
        params.inlineParts && params.inlineParts.length > 0
          ? { parts: [...params.inlineParts, { text: params.userPrompt }] }
          : params.userPrompt;

      const isGemini3 = modelToUse.startsWith("gemini-3");
      const response = await ai.models.generateContent({
        model: modelToUse,
        contents,
        config: {
          systemInstruction: params.systemInstruction,
          ...(isGemini3 && modelToUse === "gemini-3.8-flash" && params.enableSearchGrounding
            ? {
                thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
                tools: [{ googleSearch: {} }],
              }
            : {}),
          ...(params.expectJson && !params.enableSearchGrounding
            ? {
                responseMimeType: "application/json",
                ...(params.geminiSchema ? { responseSchema: params.geminiSchema } : {}),
              }
            : {}),
        },
      });

      const webSources: Array<{ title: string; url: string }> = [];
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (Array.isArray(chunks)) {
        const seen = new Set<string>();
        for (const chunk of chunks) {
          const uri = chunk?.web?.uri;
          const title = chunk?.web?.title;
          if (uri && typeof uri === "string" && !seen.has(uri)) {
            seen.add(uri);
            webSources.push({
              title: typeof title === "string" && title.trim() ? title.trim() : uri,
              url: uri,
            });
          }
        }
      }

      const outText = (response.text || "").trim();
      if (!outText) {
        throw new Error("Empty response from Gemini provider.");
      }

      return {
        text: params.expectJson ? extractFirstJsonObject(outText) : outText,
        model: modelToUse,
        provider: "gemini",
        webSources,
      };
    }

    if (active.kind === "openai-compat") {
      const modelToUse =
        params.preferredModel &&
        params.preferredModel !== "gemini-3.8-flash" &&
        params.preferredModel !== "gemini-3.1-flash-lite"
          ? params.preferredModel
          : active.defaultModel;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(active.customHeaders || {}),
      };
      if (active.apiKey && active.apiKey !== "local-no-key") {
        headers.Authorization = `Bearer ${active.apiKey}`;
      }

      const messages = [
        {
          role: "system",
          content: params.expectJson
            ? `${params.systemInstruction}\nIMPORTANT: Return ONLY a single valid JSON object with no markdown prose outside the JSON.`
            : params.systemInstruction,
        },
        { role: "user", content: params.userPrompt },
      ];

      const attemptRequest = async (includeJsonResponseFormat: boolean) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.settings.timeoutMs);
        try {
          return await fetch(active.chatCompletionsUrl, {
            method: "POST",
            headers,
            signal: controller.signal,
            body: JSON.stringify({
              model: modelToUse,
              temperature: 0.2,
              ...(includeJsonResponseFormat
                ? { response_format: { type: "json_object" } }
                : {}),
              messages,
            }),
          });
        } finally {
          clearTimeout(timer);
        }
      };

      let res = await attemptRequest(Boolean(params.expectJson));
      // Many local llama.cpp / vLLM / Ollama models reject `response_format: json_object` with HTTP 400.
      if (!res.ok && params.expectJson && res.status >= 400 && res.status < 500) {
        res = await attemptRequest(false);
      }

      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        throw new Error(
          redactSecrets(
            `${active.provider} (${active.chatCompletionsUrl}) HTTP ${res.status}: ${errBody.slice(
              0,
              180
            )}`
          )
        );
      }

      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        model?: string;
      };
      const content = json.choices?.[0]?.message?.content?.trim() || "";
      if (!content) {
        throw new Error(`Empty completion from ${active.provider}.`);
      }

      return {
        text: params.expectJson ? extractFirstJsonObject(content) : content,
        model: json.model || modelToUse,
        provider: active.provider,
      };
    }

    // Anthropic Messages API
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.settings.timeoutMs);
    try {
      const res = await fetch(active.messagesUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": active.apiKey,
          "anthropic-version": "2023-06-01",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: active.defaultModel,
          max_tokens: 4096,
          temperature: 0.2,
          system: params.expectJson
            ? `${params.systemInstruction}\nRespond ONLY with a single valid JSON object.`
            : params.systemInstruction,
          messages: [{ role: "user", content: params.userPrompt }],
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
        text: params.expectJson ? extractFirstJsonObject(content) : content,
        model: json.model || active.defaultModel,
        provider: "anthropic",
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async discoverModels(overrideBaseUrl?: string): Promise<{
    models: string[];
    endpointQueried: string;
    warning?: string;
  }> {
    const active = this.resolveActiveProvider();
    const rawTargetUrl = overrideBaseUrl?.trim() ||
      (active.kind === "openai-compat" ? active.baseUrl : "");

    if (!rawTargetUrl) {
      if (active.kind === "gemini") {
        return {
          models: ["gemini-3.8-flash", "gemini-3.1-flash-lite"],
          endpointQueried: "gemini-built-in",
        };
      }
      return {
        models: [active.defaultModel],
        endpointQueried: "local-default",
      };
    }

    const endpoints = normalizeOpenAiEndpoints(rawTargetUrl);
    const headers: Record<string, string> = {};
    if (
      active.kind === "openai-compat" &&
      active.apiKey &&
      active.apiKey !== "local-no-key"
    ) {
      headers.Authorization = `Bearer ${active.apiKey}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const res = await fetch(endpoints.modelsUrl, {
        headers,
        signal: controller.signal,
      });
      if (res.ok) {
        const data = (await res.json()) as {
          data?: Array<{ id?: string }>;
          models?: Array<{ name?: string; id?: string }>;
        };
        const ids = [
          ...(Array.isArray(data.data) ? data.data.map((m) => m.id || "") : []),
          ...(Array.isArray(data.models)
            ? data.models.map((m) => m.id || m.name || "")
            : []),
        ]
          .map((s) => s.trim())
          .filter(Boolean);
        if (ids.length > 0) {
          return {
            models: Array.from(new Set(ids)),
            endpointQueried: endpoints.modelsUrl,
          };
        }
      }

      // Fallback for native Ollama `/api/tags`
      const parsedOrigin = new URL(endpoints.baseUrl).origin;
      const ollamaTagsUrl = `${parsedOrigin}/api/tags`;
      const tagsRes = await fetch(ollamaTagsUrl, { signal: controller.signal });
      if (tagsRes.ok) {
        const tagsJson = (await tagsRes.json()) as {
          models?: Array<{ name?: string }>;
        };
        const names = (tagsJson.models || [])
          .map((m) => (m.name || "").trim())
          .filter(Boolean);
        return {
          models: Array.from(new Set(names)),
          endpointQueried: ollamaTagsUrl,
        };
      }

      return {
        models: [],
        endpointQueried: endpoints.modelsUrl,
        warning: `Endpoint returned HTTP ${res.status} on model discovery.`,
      };
    } catch (err: unknown) {
      return {
        models: [],
        endpointQueried: endpoints.modelsUrl,
        warning: redactSecrets(
          err instanceof Error ? err.message : "Could not reach local model endpoint."
        ),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async testConnection(): Promise<{
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
    const started = performance.now();
    const snapshot = this.getPublicSnapshot();
    const active = this.resolveActiveProvider();

    if (active.kind === "deterministic") {
      return {
        ok: true,
        provider: active.provider,
        model: active.defaultModel,
        endpointLabel: snapshot.active.endpointLabel,
        isLocalEndpoint: true,
        latencyMs: Math.round((performance.now() - started) * 100) / 100,
        sampleReply: "Offline First-Principles RK4 & FTS5 Engine ready (0 network calls).",
        discoveredModels: ["first-principles-rk4-compiler"],
      };
    }

    try {
      const discovery = await this.discoverModels();
      const completion = await this.generateCompletion({
        systemInstruction: "You are a health check responder. Reply with JSON {\"status\":\"ready\"}.",
        userPrompt: "Ping health check.",
        expectJson: true,
      });
      const latencyMs = Math.round((performance.now() - started) * 100) / 100;
      return {
        ok: true,
        provider: completion.provider,
        model: completion.model,
        endpointLabel: snapshot.active.endpointLabel,
        isLocalEndpoint: snapshot.active.isLocalEndpoint,
        latencyMs,
        sampleReply: completion.text.slice(0, 160),
        discoveredModels: discovery.models,
      };
    } catch (err: unknown) {
      const latencyMs = Math.round((performance.now() - started) * 100) / 100;
      return {
        ok: false,
        provider: snapshot.active.provider,
        model: snapshot.active.defaultModel,
        endpointLabel: snapshot.active.endpointLabel,
        isLocalEndpoint: snapshot.active.isLocalEndpoint,
        latencyMs,
        sampleReply: "",
        discoveredModels: [],
        error: redactSecrets(
          err instanceof Error ? err.message : "Connection test failed."
        ),
      };
    }
  }
}
