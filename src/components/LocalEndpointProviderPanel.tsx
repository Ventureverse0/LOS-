import React, { useEffect, useState } from "react";
import { Check, Copy, Cpu, Loader2, PlugZap, RefreshCw, Server } from "lucide-react";
import {
  discoverProviderModelsApi,
  fetchProviderRoutingConfigApi,
  saveProviderRoutingConfigApi,
  testProviderConnectionApi,
  type CredentialSlot,
  type ProviderMode,
  type ProviderPublicSnapshot,
} from "../services/learningOSService";
import {
  getConfiguredBackendOrigin,
  setConfiguredBackendOrigin,
} from "../lib/apiBase";
import { useStudyOS } from "../context/StudyOSContext";

interface LocalEndpointProviderPanelProps {
  compact?: boolean;
  onConfigSaved?: () => void;
}

export function LocalEndpointProviderPanel({
  compact = false,
  onConfigSaved,
}: LocalEndpointProviderPanelProps) {
  const { refreshAIStatus, pushToast } = useStudyOS();

  const [snapshot, setSnapshot] = useState<ProviderPublicSnapshot | null>(null);
  const [mode, setMode] = useState<ProviderMode>("auto");
  const [baseUrl, setBaseUrl] = useState<string>("");
  const [model, setModel] = useState<string>("");
  const [credentialSlot, setCredentialSlot] =
    useState<CredentialSlot>("CUSTOM_LLM_API_KEY");
  const [backendOrigin, setBackendOrigin] = useState<string>(() =>
    getConfiguredBackendOrigin()
  );

  const [discoveredModels, setDiscoveredModels] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [isDiscovering, setIsDiscovering] = useState<boolean>(false);
  const [copiedCmd, setCopiedCmd] = useState<boolean>(false);
  const [testBanner, setTestBanner] = useState<{
    ok: boolean;
    summary: string;
    detail?: string;
  } | null>(null);

  const loadConfig = async () => {
    setIsLoading(true);
    try {
      const snap = await fetchProviderRoutingConfigApi();
      setSnapshot(snap);
      setMode(snap.settings.mode);
      setBaseUrl(snap.settings.baseUrl);
      setModel(snap.settings.model);
      setCredentialSlot(snap.settings.credentialSlot);
    } catch {
      // Offline or initial load
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadConfig();
  }, []);

  const handleSelectMode = (nextMode: ProviderMode) => {
    setMode(nextMode);
    const preset = snapshot?.presets.find((p) => p.mode === nextMode);
    if (preset) {
      if (preset.defaultBaseUrl) setBaseUrl(preset.defaultBaseUrl);
      else if (nextMode === "auto" || nextMode === "offline" || nextMode === "gemini") {
        setBaseUrl("");
      }
      if (preset.defaultModel) setModel(preset.defaultModel);
      setCredentialSlot(preset.defaultSlot);
    }
  };

  const applyQuickLocalPreset = (
    presetMode: ProviderMode,
    presetUrl: string,
    presetModel: string,
    slot: CredentialSlot
  ) => {
    setMode(presetMode);
    setBaseUrl(presetUrl);
    setModel(presetModel);
    setCredentialSlot(slot);
  };

  const handleDiscoverModels = async () => {
    setIsDiscovering(true);
    try {
      const out = await discoverProviderModelsApi(baseUrl || undefined);
      setDiscoveredModels(out.models);
      if (out.models.length > 0 && !model) {
        setModel(out.models[0]);
      }
      pushToast({
        title:
          out.models.length > 0
            ? `Discovered ${out.models.length} Model(s)`
            : "No Models Returned",
        subtitle: out.warning || `Queried ${out.endpointQueried}`,
        variant: out.models.length > 0 ? "success" : "error",
      });
    } catch (err: unknown) {
      pushToast({
        title: "Model Discovery Failed",
        subtitle: err instanceof Error ? err.message : "Could not query endpoint.",
        variant: "error",
      });
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleSaveConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsLoading(true);
    try {
      const normalizedOrigin = setConfiguredBackendOrigin(backendOrigin);
      setBackendOrigin(normalizedOrigin);

      const updated = await saveProviderRoutingConfigApi({
        mode,
        baseUrl: baseUrl.trim(),
        model: model.trim(),
        credentialSlot,
      });
      setSnapshot(updated);
      await refreshAIStatus();
      onConfigSaved?.();
      pushToast({
        title: "Local & Custom Provider Saved",
        subtitle: `Active: ${updated.active.provider} (${updated.active.defaultModel})`,
        variant: "success",
      });
    } catch (err: unknown) {
      pushToast({
        title: "Failed to Save Provider Config",
        subtitle: err instanceof Error ? err.message : "Check local server status.",
        variant: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveAndTest = async () => {
    setIsTesting(true);
    setTestBanner(null);
    try {
      const normalizedOrigin = setConfiguredBackendOrigin(backendOrigin);
      setBackendOrigin(normalizedOrigin);

      const updated = await saveProviderRoutingConfigApi({
        mode,
        baseUrl: baseUrl.trim(),
        model: model.trim(),
        credentialSlot,
      });
      setSnapshot(updated);

      const probe = await testProviderConnectionApi();
      if (probe.discoveredModels.length > 0) {
        setDiscoveredModels(probe.discoveredModels);
      }
      await refreshAIStatus();
      onConfigSaved?.();

      setTestBanner({
        ok: probe.ok,
        summary: probe.ok
          ? `Connected to ${probe.provider} (${probe.model}) in ${probe.latencyMs} ms`
          : `Connection failed (${probe.latencyMs} ms): ${probe.error || "Unreachable"}`,
        detail: probe.ok
          ? `Endpoint: ${probe.endpointLabel} · Reply: ${probe.sampleReply}`
          : `Endpoint: ${probe.endpointLabel} · StudyOS automatically falls back to offline First-Principles engine until reachable.`,
      });
    } catch (err: unknown) {
      setTestBanner({
        ok: false,
        summary: "Could not reach backend server",
        detail: err instanceof Error ? err.message : "Verify `npm run dev` is running.",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const cliCommand = `npm run configure:local -- --mode ${mode} ${
    baseUrl ? `--url "${baseUrl}" ` : ""
  }${model ? `--model "${model}" ` : ""}`.trim();

  const handleCopyCli = async () => {
    try {
      await navigator.clipboard.writeText(cliCommand);
      setCopiedCmd(true);
      setTimeout(() => setCopiedCmd(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const activeSlotInfo = snapshot?.credentialSlots.find(
    (s) => s.slot === credentialSlot
  );

  return (
    <div className="bg-surface-lowest border border-outline-variant/40 rounded-md p-4 flex flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-outline-variant/25">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-primary shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-on-surface">
              Local Endpoint &amp; Custom AI Provider Router
            </h3>
            <p className="font-mono text-[11px] text-outline">
              Run against Ollama, LM Studio, llama.cpp, vLLM, custom OpenAI/Gemini URLs, or 100% offline
            </p>
          </div>
        </div>

        {snapshot && (
          <span
            className={`font-mono text-[11px] font-semibold px-2 py-0.5 rounded border ${
              snapshot.active.isLocalEndpoint
                ? "bg-tertiary/10 text-tertiary border-tertiary/30"
                : "bg-primary/10 text-primary border-primary/30"
            }`}
          >
            {snapshot.active.provider.toUpperCase()} ·{" "}
            {snapshot.active.isLocalEndpoint ? "LOCAL" : "CLOUD"}
          </span>
        )}
      </div>

      {/* 1-Click Local Runtime Presets */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[10px] uppercase text-outline mr-1">
          Quick Local Presets:
        </span>
        <button
          type="button"
          onClick={() =>
            applyQuickLocalPreset(
              "ollama",
              "http://127.0.0.1:11434/v1",
              "llama3.2",
              "none"
            )
          }
          className="px-2 py-1 rounded bg-surface-high hover:bg-surface-bright border border-outline-variant/40 font-mono text-[11px] text-on-surface cursor-pointer whitespace-nowrap"
        >
          Ollama (:11434)
        </button>
        <button
          type="button"
          onClick={() =>
            applyQuickLocalPreset(
              "lmstudio",
              "http://127.0.0.1:1234/v1",
              "local-model",
              "none"
            )
          }
          className="px-2 py-1 rounded bg-surface-high hover:bg-surface-bright border border-outline-variant/40 font-mono text-[11px] text-on-surface cursor-pointer whitespace-nowrap"
        >
          LM Studio (:1234)
        </button>
        <button
          type="button"
          onClick={() =>
            applyQuickLocalPreset(
              "llamacpp",
              "http://127.0.0.1:8080/v1",
              "local-gguf",
              "none"
            )
          }
          className="px-2 py-1 rounded bg-surface-high hover:bg-surface-bright border border-outline-variant/40 font-mono text-[11px] text-on-surface cursor-pointer whitespace-nowrap"
        >
          llama.cpp (:8080)
        </button>
        <button
          type="button"
          onClick={() =>
            applyQuickLocalPreset(
              "vllm",
              "http://127.0.0.1:8000/v1",
              "Qwen/Qwen2.5-7B-Instruct",
              "CUSTOM_LLM_API_KEY"
            )
          }
          className="px-2 py-1 rounded bg-surface-high hover:bg-surface-bright border border-outline-variant/40 font-mono text-[11px] text-on-surface cursor-pointer whitespace-nowrap"
        >
          vLLM (:8000)
        </button>
        <button
          type="button"
          onClick={() =>
            applyQuickLocalPreset(
              "offline",
              "",
              "first-principles-rk4-compiler",
              "none"
            )
          }
          className="px-2 py-1 rounded bg-surface-high hover:bg-surface-bright border border-outline-variant/40 font-mono text-[11px] text-on-surface cursor-pointer whitespace-nowrap"
        >
          Offline Only
        </button>
      </div>

      <form onSubmit={handleSaveConfig} className="grid grid-cols-1 sm:grid-cols-12 gap-3">
        {/* Provider Mode */}
        <div className="sm:col-span-6">
          <label className="block font-mono text-[10px] uppercase text-outline mb-1">
            Provider Mode
          </label>
          <select
            value={mode}
            onChange={(e) => handleSelectMode(e.target.value as ProviderMode)}
            className="w-full bg-surface-low border border-outline-variant/40 rounded px-2.5 py-1.5 font-mono text-xs text-on-surface focus:outline-none focus:border-primary"
          >
            {(snapshot?.presets || []).map((p) => (
              <option key={p.mode} value={p.mode}>
                {p.label}
              </option>
            ))}
            {!snapshot && <option value="auto">Auto-Detect</option>}
          </select>
        </div>

        {/* Server-Side Credential Slot Binding (Zero Raw Secrets in Browser) */}
        <div className="sm:col-span-6">
          <div className="flex items-center justify-between mb-1">
            <label className="font-mono text-[10px] uppercase text-outline">
              Server API Key Slot
            </label>
            {activeSlotInfo && (
              <span
                className={`font-mono text-[10px] ${
                  activeSlotInfo.configured ? "text-tertiary" : "text-secondary"
                }`}
              >
                {activeSlotInfo.source === "keyless"
                  ? "Keyless Local"
                  : activeSlotInfo.configured
                  ? `Ready (${activeSlotInfo.source})`
                  : "Unset on Server"}
              </span>
            )}
          </div>
          <select
            value={credentialSlot}
            onChange={(e) => setCredentialSlot(e.target.value as CredentialSlot)}
            className="w-full bg-surface-low border border-outline-variant/40 rounded px-2.5 py-1.5 font-mono text-xs text-on-surface focus:outline-none focus:border-primary"
          >
            {(snapshot?.credentialSlots || []).map((slot) => (
              <option key={slot.slot} value={slot.slot}>
                {slot.label} {slot.configured ? "✓" : ""}
              </option>
            ))}
            {!snapshot && (
              <option value="CUSTOM_LLM_API_KEY">
                Custom Key (CUSTOM_LLM_API_KEY)
              </option>
            )}
          </select>
        </div>

        {/* Custom Local / Proxy Base URL */}
        <div className="sm:col-span-7">
          <label className="block font-mono text-[10px] uppercase text-outline mb-1">
            Local / Custom Endpoint Base URL
          </label>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="e.g. http://127.0.0.1:1234/v1 or http://127.0.0.1:11434/v1"
            className="w-full bg-surface-low border border-outline-variant/40 rounded px-2.5 py-1.5 font-mono text-xs text-on-surface focus:outline-none focus:border-primary"
          />
        </div>

        {/* Custom Model ID + Discover */}
        <div className="sm:col-span-5">
          <div className="flex items-center justify-between mb-1">
            <label className="font-mono text-[10px] uppercase text-outline">
              Model ID
            </label>
            <button
              type="button"
              onClick={() => void handleDiscoverModels()}
              disabled={isDiscovering}
              className="flex items-center gap-1 font-mono text-[10px] text-primary hover:underline cursor-pointer"
            >
              {isDiscovering ? (
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
              ) : (
                <RefreshCw className="w-2.5 h-2.5" />
              )}
              <span>Fetch Local Models</span>
            </button>
          </div>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="e.g. llama3.2, qwen2.5:7b, gemini-3.8-flash"
            className="w-full bg-surface-low border border-outline-variant/40 rounded px-2.5 py-1.5 font-mono text-xs text-on-surface focus:outline-none focus:border-primary"
          />
        </div>

        {discoveredModels.length > 0 && (
          <div className="sm:col-span-12 flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[10px] text-outline">
              Discovered Models:
            </span>
            {discoveredModels.slice(0, 10).map((mId) => (
              <button
                key={mId}
                type="button"
                onClick={() => setModel(mId)}
                className={`px-2 py-0.5 rounded font-mono text-[11px] border cursor-pointer ${
                  model === mId
                    ? "bg-primary-container text-on-primary-container border-primary font-semibold"
                    : "bg-surface-low text-on-surface-variant border-outline-variant/35 hover:text-on-surface"
                }`}
              >
                {mId}
              </button>
            ))}
          </div>
        )}

        {!compact && (
          <div className="sm:col-span-12">
            <label className="block font-mono text-[10px] uppercase text-outline mb-1">
              Frontend-to-Backend Server Origin (Leave Blank for Same-Origin / Port 3000)
            </label>
            <input
              type="text"
              value={backendOrigin}
              onChange={(e) => setBackendOrigin(e.target.value)}
              placeholder="Same-origin default (or http://127.0.0.1:3000 for custom local host)"
              className="w-full bg-surface-low border border-outline-variant/40 rounded px-2.5 py-1.5 font-mono text-xs text-on-surface focus:outline-none focus:border-primary"
            />
          </div>
        )}

        {/* Action Buttons */}
        <div className="sm:col-span-12 flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-2 font-mono text-[11px] text-outline">
            <Cpu className="w-3.5 h-3.5 text-primary shrink-0" />
            <span>
              Active:{" "}
              <strong className="text-on-surface">
                {snapshot?.active.provider || "auto"}
              </strong>{" "}
              ({snapshot?.active.defaultModel || "default"})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={isLoading || isTesting}
              className="px-3 py-1.5 rounded bg-surface-high hover:bg-surface-bright border border-outline-variant/40 font-mono text-xs text-on-surface cursor-pointer whitespace-nowrap"
            >
              {isLoading ? "Saving..." : "Save Routing"}
            </button>
            <button
              type="button"
              onClick={() => void handleSaveAndTest()}
              disabled={isTesting || isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-primary-container text-on-primary-container font-mono text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              {isTesting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <PlugZap className="w-3.5 h-3.5" />
              )}
              <span>Save &amp; Test Endpoint</span>
            </button>
          </div>
        </div>
      </form>

      {/* Connection Test Result */}
      {testBanner && (
        <div
          className={`p-2.5 rounded border font-mono text-[11px] flex flex-col gap-1 ${
            testBanner.ok
              ? "bg-tertiary/10 border-tertiary/40 text-tertiary"
              : "bg-secondary/10 border-secondary/40 text-secondary"
          }`}
        >
          <div className="font-semibold">{testBanner.summary}</div>
          {testBanner.detail && (
            <div className="text-on-surface-variant break-all">{testBanner.detail}</div>
          )}
        </div>
      )}

      {/* Local Custom API Key CLI Helper (Keeps Secrets Strictly Out of Browser) */}
      <div className="bg-surface-low border border-outline-variant/25 rounded p-2.5 flex items-center justify-between gap-2">
        <div className="min-w-0 font-mono text-[10px] text-outline">
          <div className="text-on-surface-variant font-medium">
            Bind a custom API key locally on your machine (server-only, never stored in browser):
          </div>
          <code className="block truncate text-primary pt-0.5">
            {cliCommand} --key YOUR_KEY
          </code>
        </div>
        <button
          type="button"
          onClick={() => void handleCopyCli()}
          className="px-2 py-1 rounded bg-surface-high hover:bg-surface-bright font-mono text-[10px] text-on-surface flex items-center gap-1 shrink-0 cursor-pointer"
          title="Copy local CLI setup command"
        >
          {copiedCmd ? (
            <Check className="w-3 h-3 text-tertiary" />
          ) : (
            <Copy className="w-3 h-3" />
          )}
          <span>{copiedCmd ? "Copied" : "Copy CLI"}</span>
        </button>
      </div>
    </div>
  );
}
