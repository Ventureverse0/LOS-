/* ============================================================================
 * STAGE 3, 28 & 29: INTERNAL APP HOST, CAPABILITY REGISTRY, TOOL BUS & MCP BRIDGE
 * - Enforces module boundaries, caller authentication, and permission scopes
 * - Runs read-only capabilities in parallel; serializes mutating capabilities
 * - Provides opt-in Read-Only MCP Bridge with strict capability allowlist
 * ========================================================================== */

import type {
  AppEvent,
  AppManifest,
  CapabilityId,
  PermissionScope,
  ToolCitation,
  ToolRequest,
  ToolResponse,
} from "../types/learningOS";

export interface CapabilityDefinition<TInput = unknown, TResult = unknown> {
  id: CapabilityId;
  description: string;
  requiredScope: PermissionScope;
  /** Read-only capabilities execute concurrently; mutating ones serialize by default */
  readOnly: boolean;
  handler: (
    input: TInput,
    context: { callerAppId: string; requestId: string }
  ) => Promise<{
    result: TResult;
    citations?: ToolCitation[];
    warnings?: string[];
  }>;
}

export interface RegisteredAppState {
  manifest: AppManifest;
  enabled: boolean;
  healthy: boolean;
  lastError?: string;
}

export class AppRegistry {
  private apps = new Map<string, RegisteredAppState>();
  private events: AppEvent[] = [];

  registerApp(manifest: AppManifest): void {
    const existing = this.apps.get(manifest.id);
    this.apps.set(manifest.id, {
      manifest,
      enabled: existing ? existing.enabled : manifest.enabledByDefault,
      healthy: true,
    });
    this.recordEvent("app.registered", manifest.id, `Registered ${manifest.name} (${manifest.runtime})`);
  }

  enableApp(appId: string): boolean {
    const entry = this.apps.get(appId);
    if (!entry) return false;
    entry.enabled = true;
    this.recordEvent("app.enabled", appId, `Enabled module ${entry.manifest.name}`);
    return true;
  }

  disableApp(appId: string): { ok: boolean; reason?: string } {
    const entry = this.apps.get(appId);
    if (!entry) return { ok: false, reason: `Unknown app "${appId}".` };
    if (entry.manifest.isCore) {
      return {
        ok: false,
        reason: `"${entry.manifest.name}" is a core shell module and cannot be disabled.`,
      };
    }
    entry.enabled = false;
    this.recordEvent("app.disabled", appId, `Disabled optional module ${entry.manifest.name}`);
    return { ok: true };
  }

  setAppEnabled(appId: string, enabled: boolean): { ok: boolean; reason?: string } {
    return enabled ? { ok: this.enableApp(appId) } : this.disableApp(appId);
  }

  isAppEnabled(appId: string): boolean {
    const entry = this.apps.get(appId);
    return Boolean(entry && entry.enabled);
  }

  getApp(appId: string): RegisteredAppState | undefined {
    return this.apps.get(appId);
  }

  discoverApps(): RegisteredAppState[] {
    return Array.from(this.apps.values());
  }

  mountAppRoute(route: string): RegisteredAppState | null {
    for (const state of this.apps.values()) {
      if (state.manifest.route === route && state.enabled) {
        return state;
      }
    }
    return null;
  }

  reportHealth(): Record<string, { enabled: boolean; healthy: boolean; runtime: string }> {
    const out: Record<string, { enabled: boolean; healthy: boolean; runtime: string }> = {};
    for (const [id, st] of this.apps.entries()) {
      out[id] = {
        enabled: st.enabled,
        healthy: st.healthy,
        runtime: st.manifest.runtime,
      };
    }
    return out;
  }

  recordEvent(type: AppEvent["type"], appId: string, detail: string, requestId?: string): void {
    this.events.unshift({
      id: `appev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      type,
      appId,
      detail,
      requestId,
    });
    if (this.events.length > 200) {
      this.events.length = 200;
    }
  }

  getEvents(): AppEvent[] {
    return this.events.slice();
  }
}

export class CapabilityRegistry {
  private capabilities = new Map<string, CapabilityDefinition<any, any>>();

  register<TInput, TResult>(def: CapabilityDefinition<TInput, TResult>): void {
    this.capabilities.set(def.id, def);
  }

  get(capabilityId: string): CapabilityDefinition<any, any> | undefined {
    return this.capabilities.get(capabilityId);
  }

  list(): Array<Omit<CapabilityDefinition<any, any>, "handler">> {
    return Array.from(this.capabilities.values()).map(({ handler: _h, ...meta }) => meta);
  }
}

export class ToolBus {
  private mutationQueue: Promise<void> = Promise.resolve();
  private reqCounter = 0;

  constructor(
    private readonly appRegistry: AppRegistry,
    private readonly capabilityRegistry: CapabilityRegistry
  ) {}

  async execute<TInput = unknown, TResult = unknown>(params: {
    callerAppId: string;
    capability: string;
    input: TInput;
    permissionScope?: PermissionScope;
  }): Promise<ToolResponse<TResult>> {
    const startedMs = Date.now();
    this.reqCounter += 1;
    const requestId = `treq-${startedMs}-${this.reqCounter}`;

    const caller = this.appRegistry.getApp(params.callerAppId);
    if (!caller) {
      return {
        requestId,
        success: false,
        error: `Unregistered caller app "${params.callerAppId}".`,
        citations: [],
        warnings: [],
        durationMs: Date.now() - startedMs,
      };
    }

    if (!caller.enabled) {
      this.appRegistry.recordEvent(
        "tool.failed",
        params.callerAppId,
        `Blocked "${params.capability}" because module is disabled`,
        requestId
      );
      return {
        requestId,
        success: false,
        error: `Caller app "${params.callerAppId}" is currently disabled.`,
        citations: [],
        warnings: [],
        durationMs: Date.now() - startedMs,
      };
    }

    const cap = this.capabilityRegistry.get(params.capability);
    if (!cap) {
      this.appRegistry.recordEvent(
        "tool.failed",
        params.callerAppId,
        `Unknown capability "${params.capability}"`,
        requestId
      );
      return {
        requestId,
        success: false,
        error: `Unknown capability "${params.capability}".`,
        citations: [],
        warnings: [],
        durationMs: Date.now() - startedMs,
      };
    }

    const effectiveScope = params.permissionScope ?? cap.requiredScope;
    const allowedByManifest =
      caller.manifest.permissions.includes(cap.requiredScope) &&
      (caller.manifest.requiredCapabilities.includes(cap.id) ||
        caller.manifest.optionalCapabilities.includes(cap.id));

    if (!allowedByManifest || effectiveScope !== cap.requiredScope) {
      this.appRegistry.recordEvent(
        "tool.failed",
        params.callerAppId,
        `Permission denied for "${params.capability}" (requires ${cap.requiredScope})`,
        requestId
      );
      return {
        requestId,
        success: false,
        error: `App "${params.callerAppId}" lacks permission scope "${cap.requiredScope}" or capability declaration for "${params.capability}".`,
        citations: [],
        warnings: [],
        durationMs: Date.now() - startedMs,
      };
    }

    const req: ToolRequest<TInput> = {
      requestId,
      callerAppId: params.callerAppId,
      capability: params.capability,
      input: params.input,
      permissionScope: effectiveScope,
      createdAt: new Date(startedMs).toISOString(),
    };

    const invoke = async (): Promise<ToolResponse<TResult>> => {
      this.appRegistry.recordEvent(
        "tool.started",
        req.callerAppId,
        `Running ${req.capability}`,
        req.requestId
      );
      try {
        const out = await cap.handler(req.input, {
          callerAppId: req.callerAppId,
          requestId: req.requestId,
        });
        this.appRegistry.recordEvent(
          "tool.succeeded",
          req.callerAppId,
          `Completed ${req.capability}`,
          req.requestId
        );
        return {
          requestId: req.requestId,
          success: true,
          result: out.result as TResult,
          citations: out.citations ?? [],
          warnings: out.warnings ?? [],
          durationMs: Date.now() - startedMs,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.appRegistry.recordEvent(
          "tool.failed",
          req.callerAppId,
          `Error in ${req.capability}: ${msg}`,
          req.requestId
        );
        return {
          requestId: req.requestId,
          success: false,
          error: msg,
          citations: [],
          warnings: [],
          durationMs: Date.now() - startedMs,
        };
      }
    };

    // Read-only calls run immediately in parallel; state-changing calls serialize via FIFO mutex
    if (cap.readOnly) {
      return invoke();
    }

    return new Promise<ToolResponse<TResult>>((resolve) => {
      this.mutationQueue = this.mutationQueue.then(async () => {
        const res = await invoke();
        resolve(res);
      });
    });
  }
}

/* ============================================================================
 * STAGE 28: OPTIONAL READ-ONLY MCP ADAPTER BRIDGE
 * ========================================================================== */
export const MCP_READONLY_ALLOWLIST: ReadonlySet<CapabilityId> = new Set<CapabilityId>([
  "curriculum.read",
  "resource.read",
  "search.query",
  "notes.read",
  "concepts.read",
  "flashcards.export",
]);

export class McpReadOnlyBridge {
  private enabled = false;

  constructor(private readonly toolBus: ToolBus) {}

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  listExposedTools(): CapabilityId[] {
    if (!this.enabled) return [];
    return Array.from(MCP_READONLY_ALLOWLIST);
  }

  async invokeMcpTool<TInput = unknown, TResult = unknown>(
    capability: string,
    input: TInput
  ): Promise<ToolResponse<TResult>> {
    if (!this.enabled) {
      return {
        requestId: `mcp-blocked-${Date.now()}`,
        success: false,
        error: "MCP Bridge is disabled. Enable it explicitly in App Host Diagnostics first.",
        citations: [],
        warnings: [],
        durationMs: 0,
      };
    }
    if (!MCP_READONLY_ALLOWLIST.has(capability as CapabilityId)) {
      return {
        requestId: `mcp-denied-${Date.now()}`,
        success: false,
        error: `Capability "${capability}" is not in the MCP read-only allowlist. Write, secret, filesystem, process, and external web tools are strictly forbidden.`,
        citations: [],
        warnings: [],
        durationMs: 0,
      };
    }
    return this.toolBus.execute<TInput, TResult>({
      callerAppId: "mcp_readonly_bridge",
      capability,
      input,
      permissionScope: "read",
    });
  }
}

/* ============================================================================
 * STAGE 29: DEFAULT LEARNINGOS MODULE MANIFESTS
 * ========================================================================== */
export const DEFAULT_LEARNINGOS_APP_MANIFESTS: AppManifest[] = [
  {
    id: "dashboard",
    name: "Core Dashboard",
    version: "1.0.0",
    description: "Daily study signals, active curriculum progress, continue-watching lectures, due cards, and running jobs.",
    runtime: "internal",
    route: "/dashboard",
    requiredCapabilities: ["curriculum.read", "resource.read"],
    optionalCapabilities: ["search.query", "jobs.manage"],
    permissions: ["read"],
    enabledByDefault: true,
    isCore: true,
  },
  {
    id: "curriculum",
    name: "Curriculum App",
    version: "1.0.0",
    description: "Degree -> Year/Semester -> Subject -> Unit -> Topic hierarchy with reordering, resource counts, and uncovered-topic tracking.",
    runtime: "internal",
    route: "/curriculum",
    requiredCapabilities: ["curriculum.read", "curriculum.write"],
    optionalCapabilities: ["resource.read"],
    permissions: ["read", "write"],
    enabledByDefault: true,
    isCore: true,
  },
  {
    id: "resources",
    name: "Resource Library App",
    version: "1.0.0",
    description: "Remote-first URL & document catalog with SourceAdapter metadata, subtitle checks, and assisted topic matching.",
    runtime: "internal",
    route: "/resources",
    requiredCapabilities: ["resource.read", "resource.add", "resource.metadata", "resource.transcript"],
    optionalCapabilities: ["curriculum.read", "curriculum.write"],
    permissions: ["read", "write"],
    enabledByDefault: true,
    isCore: true,
  },
  {
    id: "lecture",
    name: "Lecture Workspace App",
    version: "1.0.0",
    description: "Remote lecture player paired with timestamped transcript cues, source facts, watch progress, and autosaved Markdown notes.",
    runtime: "internal",
    route: "/lecture",
    requiredCapabilities: ["resource.read", "resource.open", "notes.read", "notes.write"],
    optionalCapabilities: ["ai.ask", "ai.summarize", "ai.flashcards", "ai.quiz"],
    permissions: ["read", "write", "ai"],
    enabledByDefault: true,
  },
  {
    id: "search",
    name: "FTS5 Search App",
    version: "1.0.0",
    description: "Sub-millisecond SQLite FTS5 BM25 lexical search across transcripts, notes, resources, concepts, topics, and flashcards.",
    runtime: "internal",
    route: "/search",
    requiredCapabilities: ["search.query"],
    optionalCapabilities: ["resource.open", "notes.read"],
    permissions: ["read"],
    enabledByDefault: true,
  },
  {
    id: "notes",
    name: "Notes & Knowledge Vault App",
    version: "1.0.0",
    description: "Structured Markdown + LaTeX notes with revision snapshots, anchored highlights, and Flashcard/Quiz promotion.",
    runtime: "internal",
    route: "/notes",
    requiredCapabilities: ["notes.read", "notes.write"],
    optionalCapabilities: ["ai.flashcards", "ai.quiz"],
    permissions: ["read", "write", "ai"],
    enabledByDefault: true,
  },
  {
    id: "revision",
    name: "Revision & Anki App",
    version: "1.0.0",
    description: "FSRS-ready spaced-repetition review queue (Due Today, New, Learning, Weak Concepts) with Anki .tsv import/export.",
    runtime: "internal",
    route: "/revision",
    requiredCapabilities: ["revision.review", "flashcards.export"],
    optionalCapabilities: ["curriculum.read"],
    permissions: ["read", "write"],
    enabledByDefault: true,
  },
  {
    id: "ai_tutor",
    name: "Source-Grounded AI Tutor App",
    version: "1.0.0",
    description: "Segment-cited lecture Q&A and explicit study artifact generator distinguishing source facts from inference.",
    runtime: "bridge",
    route: "/ai-tutor",
    requiredCapabilities: ["ai.ask", "resource.read"],
    optionalCapabilities: ["ai.summarize", "ai.flashcards", "ai.quiz", "search.query"],
    permissions: ["read", "ai"],
    enabledByDefault: true,
  },
  {
    id: "concepts",
    name: "Concept & Prerequisite Graph App",
    version: "1.0.0",
    description: "SQLite relational concept list and interactive zoom/pan prerequisite graph linked to exact lecture timestamps.",
    runtime: "internal",
    route: "/concepts",
    requiredCapabilities: ["concepts.read", "concept.graph"],
    optionalCapabilities: ["resource.open"],
    permissions: ["read", "write"],
    enabledByDefault: true,
  },
  {
    id: "interactive_lessons",
    name: "Interactive Lesson App (OpenMAIC Adapter)",
    version: "1.0.0",
    description: "Optional OpenMAIC-compatible interactive slide, whiteboard, concept navigation, and checkpoint quiz studio.",
    runtime: "sdk",
    route: "/interactive-lessons",
    requiredCapabilities: ["interactive.lesson.create"],
    optionalCapabilities: ["resource.read", "concepts.read", "notes.read"],
    permissions: ["read", "write"],
    enabledByDefault: false,
  },
  {
    id: "surfsense_bridge",
    name: "SurfSense Exchange Adapter",
    version: "1.0.0",
    description: "Optional file-based JSON exchange boundary for exporting LearningOS sources and importing external study artifacts.",
    runtime: "bridge",
    route: "/integrations/surfsense",
    requiredCapabilities: ["resource.read", "notes.read"],
    optionalCapabilities: ["notes.write"],
    permissions: ["read", "write"],
    enabledByDefault: false,
  },
  {
    id: "external_web_host",
    name: "Controlled External Web Host",
    version: "1.0.0",
    description: "Default-deny origin-allowlisted web resource viewer with isolated frame sandbox and safe external browser fallback.",
    runtime: "web",
    route: "/external-web",
    requiredCapabilities: ["external.web.open"],
    optionalCapabilities: ["resource.read"],
    permissions: ["read", "external_web"],
    enabledByDefault: true,
  },
  {
    id: "jobs_diagnostics",
    name: "Jobs, Storage Audit & Diagnostics",
    version: "1.0.0",
    description: "Bounded worker queue, temporary Whisper media cleanup verifier, storage footprint audit, and provider diagnostics.",
    runtime: "process",
    route: "/diagnostics",
    requiredCapabilities: ["jobs.manage", "storage.audit"],
    optionalCapabilities: ["external.process.run"],
    permissions: ["read", "write", "process"],
    enabledByDefault: true,
    isCore: true,
  },
  {
    id: "mcp_readonly_bridge",
    name: "MCP Read-Only Adapter Bridge",
    version: "1.0.0",
    description: "Internal caller identity used only when the opt-in Stage 28 read-only MCP bridge is explicitly enabled.",
    runtime: "bridge",
    route: "/integrations/mcp",
    requiredCapabilities: [
      "curriculum.read",
      "resource.read",
      "search.query",
      "notes.read",
      "concepts.read",
      "flashcards.export",
    ],
    optionalCapabilities: [],
    permissions: ["read"],
    enabledByDefault: true,
  },
];

export function createDefaultLearningOSHost() {
  const appRegistry = new AppRegistry();
  for (const manifest of DEFAULT_LEARNINGOS_APP_MANIFESTS) {
    appRegistry.registerApp(manifest);
  }
  const capabilityRegistry = new CapabilityRegistry();
  const toolBus = new ToolBus(appRegistry, capabilityRegistry);
  const mcpBridge = new McpReadOnlyBridge(toolBus);
  return { appRegistry, capabilityRegistry, toolBus, mcpBridge };
}
