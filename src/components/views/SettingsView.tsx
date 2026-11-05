import React, { useRef, useState } from "react";
import {
  Award,
  Calendar,
  Check,
  CheckCircle2,
  Copy,
  Database,
  Download,
  FlaskConical,
  Globe,
  GraduationCap,
  HardDrive,
  Keyboard,
  Plus,
  RefreshCw,
  Settings,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useStudyOS } from "../../context/StudyOSContext";
import { estimateStorageBytes, formatByteSize } from "../../lib/storage";
import { runAllUnitTests, type UnitTestAssertionResult } from "../../lib/gamification.test";
import { LocalEndpointProviderPanel } from "../LocalEndpointProviderPanel";

export function SettingsView() {
  const {
    state,
    aiStatus,
    refreshAIStatus,
    profiles,
    activeProfileId,
    createLearnerProfile,
    switchLearnerProfile,
    deleteLearnerProfile,
    dbSyncState,
    localSaveStatus,
    retryLocalSave,
    deleteServerWorkspaceSnapshot,
    syncWorkspaceNow,
    pullWorkspaceBySyncId,
    updateSettings,
    setShortcutModalOpen,
    updateDailyGoalMinutes,
    exportBackup,
    exportPortfolio,
    exportAnkiDeck,
    exportCalendarIcs,
    importBackupJson,
    startFreshFromScratch,
    pushToast,
  } = useStudyOS();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [confirmFreshStart, setConfirmFreshStart] = useState(false);
  const [confirmDeleteServer, setConfirmDeleteServer] = useState(false);
  const [testResults, setTestResults] = useState<UnitTestAssertionResult[] | null>(null);

  // New Learner Profile form
  const [showNewProfile, setShowNewProfile] = useState(false);
  const [newHandle, setNewHandle] = useState("");
  const [newTrack, setNewTrack] = useState("");

  // Restore by Sync ID
  const [restoreSyncIdInput, setRestoreSyncIdInput] = useState("");
  const [copiedSyncId, setCopiedSyncId] = useState(false);

  const storageSizeLabel = formatByteSize(estimateStorageBytes(state));

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || "");
        importBackupJson(text);
      } catch (err: unknown) {
        pushToast({
          title: "Database Import Failed",
          subtitle: err instanceof Error ? err.message : "Malformed JSON file.",
          variant: "error",
        });
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    };
    reader.readAsText(file);
  };

  const handleRunDiagnostics = () => {
    const report = runAllUnitTests();
    setTestResults(report.results);
    pushToast({
      title: `Self-Test Suite: ${report.passed}/${report.total} Passed`,
      subtitle: "Verified XP math, Streak rollover, Clean-Slate DB & Curriculum schema.",
      variant: report.failed === 0 ? "success" : "error",
    });
  };

  const handleCreateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHandle.trim()) return;
    createLearnerProfile({
      handle: newHandle.trim(),
      academicTrack: newTrack.trim() || "Self-Directed Mastery",
      dailyGoalMinutes: 120,
    });
    setNewHandle("");
    setNewTrack("");
    setShowNewProfile(false);
  };

  const handleRestoreBySyncId = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restoreSyncIdInput.trim()) return;
    const ok = await pullWorkspaceBySyncId(restoreSyncIdInput.trim());
    if (ok) {
      setRestoreSyncIdInput("");
    }
  };

  return (
    <div className="flex flex-col gap-5 w-full max-w-5xl">
      {/* Header */}
      <div className="bg-surface-lowest border border-outline-variant/40 rounded-md p-5 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Settings className="w-5 h-5 text-primary" />
          <div>
            <h1 className="text-xl font-semibold text-on-surface">
              Learner Profiles, Local Database &amp; Preferences
            </h1>
            <p className="font-mono text-xs text-outline">
              Local-First Persistence · IndexedDB + Atomic Server Store ({storageSizeLabel} active)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs">
          <span
            className={`w-2 h-2 rounded-full ${
              dbSyncState.status === "synced"
                ? "bg-tertiary"
                : dbSyncState.status === "syncing"
                ? "bg-secondary"
                : "bg-primary"
            }`}
          />
          <span className="text-on-surface-variant">
            {dbSyncState.status === "synced"
              ? `Local Server Synced (rev ${dbSyncState.revision})`
              : dbSyncState.status === "syncing"
              ? "Syncing local snapshot..."
              : "Browser IndexedDB Active"}
          </span>
        </div>
      </div>

      {/* MULTI-LEARNER PROFILES & CLEAN-SLATE WORKSPACE MANAGER */}
      <section className="bg-surface-low border border-outline-variant/35 rounded-md p-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-outline-variant/30">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            <div>
              <h2 className="text-base font-semibold text-on-surface">
                Learner Profiles &amp; Clean-Slate Workspace
              </h2>
              <p className="font-mono text-[11px] text-outline">
                Each learner gets an isolated local database for their own courses, notes, streaks, and XP
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowNewProfile(!showNewProfile)}
            className="px-3 py-1.5 rounded bg-primary-container hover:bg-primary text-on-primary-container font-mono text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Learner Profile</span>
          </button>
        </div>

        {showNewProfile && (
          <form
            onSubmit={handleCreateProfile}
            className="bg-surface-lowest border border-primary/40 rounded p-3.5 grid grid-cols-1 sm:grid-cols-12 gap-3 items-end"
          >
            <div className="sm:col-span-5">
              <label className="block font-mono text-[10px] uppercase text-outline mb-1">
                Learner Name / Handle
              </label>
              <input
                type="text"
                required
                value={newHandle}
                onChange={(e) => setNewHandle(e.target.value)}
                placeholder="e.g. maya.bio or sam.cs"
                className="w-full bg-surface-low border border-outline-variant/40 rounded px-3 py-1.5 font-mono text-xs text-on-surface focus:outline-none focus:border-primary"
              />
            </div>
            <div className="sm:col-span-5">
              <label className="block font-mono text-[10px] uppercase text-outline mb-1">
                Focus Area / Goal Track
              </label>
              <input
                type="text"
                value={newTrack}
                onChange={(e) => setNewTrack(e.target.value)}
                placeholder="e.g. MCAT Prep, Machine Learning, Law"
                className="w-full bg-surface-low border border-outline-variant/40 rounded px-3 py-1.5 font-mono text-xs text-on-surface focus:outline-none focus:border-primary"
              />
            </div>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <button
                type="submit"
                className="w-full px-3 py-1.5 rounded bg-primary-container text-on-primary-container font-mono text-xs font-bold cursor-pointer whitespace-nowrap"
              >
                Create
              </button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {profiles.map((prof) => {
            const isActive = prof.id === activeProfileId;
            return (
              <div
                key={prof.id}
                className={`p-3.5 rounded border flex items-center justify-between gap-2 transition-colors ${
                  isActive
                    ? "bg-surface-high border-primary/50"
                    : "bg-surface-lowest border-outline-variant/35 hover:border-outline-variant/70"
                }`}
              >
                <button
                  type="button"
                  onClick={() => void switchLearnerProfile(prof.id)}
                  className="min-w-0 flex-1 text-left cursor-pointer"
                >
                  <div className="flex items-center gap-2 font-mono text-xs font-semibold text-on-surface">
                    <span className="truncate">{prof.handle}</span>
                    {isActive && <span className="text-[10px] text-tertiary">ACTIVE</span>}
                  </div>
                  <div className="font-mono text-[11px] text-outline truncate pt-0.5">
                    {prof.academicTrack}
                  </div>
                </button>

                {profiles.length > 1 && (
                  <button
                    type="button"
                    onClick={() => deleteLearnerProfile(prof.id)}
                    title="Delete Learner Profile"
                    className="p-1.5 text-outline hover:text-error cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Clean-Slate Reset Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-outline-variant/25">
          <div className="text-xs text-on-surface-variant">
            Wipe this profile back to <strong>0 XP &amp; 0 courses</strong> to start completely fresh from your own notes and topics.
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {!confirmFreshStart ? (
              <button
                type="button"
                onClick={() => setConfirmFreshStart(true)}
                className="px-3 py-1.5 rounded border border-error/40 text-error hover:bg-error-container/25 font-mono text-xs cursor-pointer whitespace-nowrap"
              >
                Start Fresh From Scratch (0 XP)
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmFreshStart(false)}
                  className="px-2.5 py-1 font-mono text-xs text-outline hover:text-on-surface cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    startFreshFromScratch();
                    setConfirmFreshStart(false);
                  }}
                  className="px-3 py-1 rounded bg-error text-on-error font-mono text-xs font-bold cursor-pointer whitespace-nowrap"
                >
                  Confirm Clean Slate
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* AI INFERENCE & WORKSPACE CONFIGURATION */}
        <section className="bg-surface-low border border-outline-variant/35 rounded-md p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between pb-2 border-b border-outline-variant/30">
            <h2 className="text-base font-semibold text-on-surface">
              AI Inference &amp; Study Preferences
            </h2>
            <button
              type="button"
              onClick={() => void refreshAIStatus()}
              className="flex items-center gap-1 font-mono text-xs text-primary hover:underline cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Verify Engine</span>
            </button>
          </div>

          {/* Server AI / Local Endpoint Status Card */}
          <div className="bg-surface-lowest border border-outline-variant/40 rounded p-3.5 flex items-center justify-between gap-3">
            <div>
              <div className="font-mono text-xs font-semibold text-on-surface">
                Active Server Engine: {aiStatus.provider} ({aiStatus.defaultModel})
              </div>
              <div className="font-mono text-[11px] text-outline pt-0.5">
                {aiStatus.cloudConfigured
                  ? `${aiStatus.isLocalEndpoint ? "Local Endpoint" : "Cloud Provider"} active${
                      aiStatus.endpointLabel ? ` · ${aiStatus.endpointLabel}` : ""
                    }`
                  : "Offline First-Principles Engine active · Configure local or cloud provider below"}
              </div>
            </div>
            <span
              className={`font-mono text-xs font-bold px-2.5 py-1 rounded ${
                aiStatus.connected
                  ? "bg-tertiary/15 text-tertiary"
                  : "bg-error-container/30 text-error"
              }`}
            >
              {aiStatus.isLocalEndpoint ? "LOCAL READY" : aiStatus.connected ? "ONLINE" : "OFFLINE"}
            </span>
          </div>

          {/* Local Endpoint & Custom AI Provider Router */}
          <LocalEndpointProviderPanel />

          {/* Model Selection */}
          <div className="flex flex-col gap-1.5">
            <label className="font-mono text-[11px] uppercase text-outline">
              Preferred Synthesis Model
            </label>
            <select
              value={state.settings.selectedModel}
              onChange={(e) =>
                updateSettings({
                  selectedModel: e.target.value as "gemini-3.8-flash" | "gemini-3.1-flash-lite",
                })
              }
              className="bg-surface-lowest border border-outline-variant/40 rounded px-3 py-2 font-mono text-xs text-on-surface focus:outline-none focus:border-primary"
            >
              <option value="gemini-3.8-flash">gemini-3.8-flash (Recommended Deep Synthesis)</option>
              <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (High-Speed Lite)</option>
            </select>
          </div>

          {/* Student Profile Handle */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-mono text-[11px] uppercase text-outline mb-1">
                Learner Handle
              </label>
              <input
                type="text"
                value={state.settings.studentHandle}
                onChange={(e) => updateSettings({ studentHandle: e.target.value })}
                className="w-full bg-surface-lowest border border-outline-variant/40 rounded px-3 py-1.5 font-mono text-xs text-on-surface focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block font-mono text-[11px] uppercase text-outline mb-1">
                Focus Track
              </label>
              <input
                type="text"
                value={state.settings.academicTrack}
                onChange={(e) => updateSettings({ academicTrack: e.target.value })}
                className="w-full bg-surface-lowest border border-outline-variant/40 rounded px-3 py-1.5 font-mono text-xs text-on-surface focus:outline-none focus:border-primary"
              />
            </div>
          </div>

          {/* Daily Goal Slider */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between font-mono text-xs tabular-nums">
              <span className="text-on-surface-variant">Daily Focus Target</span>
              <span className="text-primary font-bold">{state.stats.dailyGoalMinutes} min / day</span>
            </div>
            <input
              type="range"
              min="30"
              max="480"
              step="15"
              value={state.stats.dailyGoalMinutes}
              onChange={(e) => updateDailyGoalMinutes(parseInt(e.target.value, 10))}
              className="w-full accent-[#4cd7f6] cursor-pointer"
            />
          </div>

          {/* Sound Toggle */}
          <div className="flex items-center justify-between p-3 rounded bg-surface-lowest border border-outline-variant/30">
            <div className="flex items-center gap-2.5">
              {state.settings.soundEnabled ? (
                <Volume2 className="w-4 h-4 text-primary" />
              ) : (
                <VolumeX className="w-4 h-4 text-outline" />
              )}
              <div>
                <div className="text-xs font-semibold text-on-surface">
                  Synthesized Audio Feedback
                </div>
                <div className="font-mono text-[10px] text-outline">
                  Web Audio harmonic chimes on XP gain, mastery &amp; level-up
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => updateSettings({ soundEnabled: !state.settings.soundEnabled })}
              className={`px-3 py-1 rounded font-mono text-xs font-semibold cursor-pointer ${
                state.settings.soundEnabled
                  ? "bg-primary-container text-on-primary-container"
                  : "bg-surface-high text-outline"
              }`}
            >
              {state.settings.soundEnabled ? "ENABLED" : "MUTED"}
            </button>
          </div>

          {/* Autonomous Thinking, Fetching & Note-Taking Toggle */}
          <div className="flex items-center justify-between p-3 rounded bg-surface-lowest border border-outline-variant/30">
            <div className="flex items-center gap-2.5 min-w-0">
              <Globe className="w-4 h-4 text-primary shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-on-surface">
                  Autonomous Research &amp; Note-Taking
                </div>
                <div className="font-mono text-[10px] text-outline">
                  Auto-fetches authoritative sources, writes Vault notes &amp; tracks active study minutes
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                updateSettings({
                  autonomousAgentEnabled: !state.settings.autonomousAgentEnabled,
                })
              }
              className={`px-3 py-1 rounded font-mono text-xs font-semibold cursor-pointer shrink-0 ${
                state.settings.autonomousAgentEnabled
                  ? "bg-primary-container text-on-primary-container"
                  : "bg-surface-high text-outline"
              }`}
            >
              {state.settings.autonomousAgentEnabled ? "ACTIVE" : "PAUSED"}
            </button>
          </div>

          {/* Global Keyboard Shortcut Manager */}
          <div className="flex items-center justify-between p-3 rounded bg-surface-lowest border border-outline-variant/30">
            <div className="flex items-center gap-2.5 min-w-0">
              <Keyboard className="w-4 h-4 text-secondary shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-on-surface">
                  Global Keyboard Shortcuts
                </div>
                <div className="font-mono text-[10px] text-outline">
                  Cmd/Ctrl + 1–8 view navigation, Focus Session &amp; New Note bindings
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShortcutModalOpen(true)}
              className="px-3 py-1 rounded bg-surface-high hover:bg-surface-bright border border-outline-variant/50 font-mono text-xs text-on-surface hover:text-primary cursor-pointer shrink-0 whitespace-nowrap"
            >
              Configure
            </button>
          </div>
        </section>

        {/* LOCAL DATABASE ENGINE, WORKSPACE SYNC & PORTABLE BACKUP */}
        <section className="bg-surface-low border border-outline-variant/35 rounded-md p-5 flex flex-col justify-between gap-4">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/30">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-secondary" />
                <h2 className="text-base font-semibold text-on-surface">
                  Local Database &amp; Portable File Storage
                </h2>
              </div>
              <button
                type="button"
                onClick={() => void syncWorkspaceNow()}
                className="flex items-center gap-1 font-mono text-xs text-primary hover:underline cursor-pointer"
              >
                <HardDrive className="w-3.5 h-3.5" />
                <span>Sync Local DB</span>
              </button>
            </div>

            {/* Workspace Sync ID Card */}
            <div className="bg-surface-lowest border border-outline-variant/35 rounded p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2 font-mono text-[11px]">
                <span className="text-outline uppercase">Workspace Sync ID (Local Disk Snapshot)</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(state.workspaceSyncId).catch(() => {});
                    setCopiedSyncId(true);
                    window.setTimeout(() => setCopiedSyncId(false), 1600);
                  }}
                  className="text-primary hover:underline flex items-center gap-1 cursor-pointer"
                >
                  {copiedSyncId ? <Check className="w-3 h-3 text-tertiary" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedSyncId ? "Copied" : "Copy ID"}</span>
                </button>
              </div>
              <div className="font-mono text-xs text-on-surface bg-surface-low px-2.5 py-1.5 rounded border border-outline-variant/30 select-all">
                {state.workspaceSyncId}
              </div>

              <form onSubmit={handleRestoreBySyncId} className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={restoreSyncIdInput}
                  onChange={(e) => setRestoreSyncIdInput(e.target.value)}
                  placeholder="Paste a Workspace Sync ID to load from local server..."
                  className="flex-1 bg-surface-low border border-outline-variant/40 rounded px-2.5 py-1 font-mono text-xs text-on-surface placeholder:text-outline focus:outline-none focus:border-primary"
                />
                <button
                  type="submit"
                  disabled={!restoreSyncIdInput.trim()}
                  className="px-3 py-1 rounded bg-surface-high hover:bg-primary hover:text-on-primary disabled:opacity-40 font-mono text-xs text-on-surface font-semibold cursor-pointer whitespace-nowrap"
                >
                  Load ID
                </button>
              </form>
            </div>

            {/* Portable .studyos.json File Export/Import */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={exportBackup}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded bg-primary-container hover:bg-primary text-on-primary-container font-mono text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
              >
                <Download className="w-4 h-4" />
                <span>Save .studyos.json</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded bg-surface-high hover:bg-surface-bright border border-outline-variant/50 text-on-surface font-mono text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                <Upload className="w-4 h-4 text-secondary" />
                <span>Open .studyos.json</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                onChange={handleImportFile}
                className="hidden"
              />
            </div>

            {/* Unit Test Suite Verification */}
            <div className="bg-surface-lowest border border-outline-variant/35 rounded p-3.5 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-on-surface font-semibold flex items-center gap-1.5">
                  <FlaskConical className="w-4 h-4 text-tertiary" />
                  Database &amp; Gamification Self-Tests
                </span>
                <button
                  type="button"
                  onClick={handleRunDiagnostics}
                  className="px-2.5 py-1 rounded bg-surface-high hover:bg-tertiary hover:text-on-tertiary font-mono text-[11px] font-semibold text-on-surface transition-colors cursor-pointer whitespace-nowrap"
                >
                  Run Unit Tests
                </button>
              </div>

              {testResults && (
                <div className="max-h-40 overflow-y-auto space-y-1 pt-1 border-t border-outline-variant/25 font-mono text-[11px]">
                  {testResults.map((r) => (
                    <div key={r.name} className="flex items-center justify-between gap-2">
                      <span className="text-on-surface-variant truncate">{r.name}</span>
                      <span className={r.passed ? "text-tertiary font-bold" : "text-error font-bold"}>
                        {r.passed ? "PASS" : "FAIL"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* PRIVACY, DATA OWNERSHIP, AI BOUNDARIES & DELETION CONTROLS */}
      <section className="bg-surface-low border border-outline-variant/35 rounded-md p-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-outline-variant/30">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-tertiary" />
            <div>
              <h2 className="text-base font-semibold text-on-surface">
                Privacy, Data Ownership &amp; Storage Boundaries
              </h2>
              <p className="font-mono text-[11px] text-outline">
                Transparent disclosure of where student records live, what AI receives, and how to export or erase your data
              </p>
            </div>
          </div>
          {localSaveStatus.status === "error" && (
            <button
              type="button"
              onClick={retryLocalSave}
              className="px-3 py-1.5 rounded bg-error text-on-error font-mono text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              Retry Failed Local Save
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="bg-surface-lowest border border-outline-variant/30 rounded p-3.5 flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-primary">
              1 · Browser Storage (Primary)
            </span>
            <p className="text-on-surface-variant leading-relaxed">
              Your courses, notes, tasks, assessment attempts, and profile are stored locally in your browser&apos;s <code className="font-mono text-on-surface">IndexedDB</code> and <code className="font-mono text-on-surface">localStorage</code> isolated per Learner Profile.
            </p>
          </div>

          <div className="bg-surface-lowest border border-outline-variant/30 rounded p-3.5 flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-secondary">
              2 · Local Server Snapshot
            </span>
            <p className="text-on-surface-variant leading-relaxed">
              When the local Node server is available, workspace state is backed up atomically under <code className="font-mono text-on-surface">{state.workspaceSyncId}</code>. No multi-tenant cloud authentication is assumed; do not share sensitive credentials on public machines.
            </p>
          </div>

          <div className="bg-surface-lowest border border-outline-variant/30 rounded p-3.5 flex flex-col gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-wider text-tertiary">
              3 · AI Request Boundary
            </span>
            <p className="text-on-surface-variant leading-relaxed">
              API keys remain strictly server-side. Only selected topic context or uploaded notes are sent to Gemini when you run an AI tool or keep Autonomous Research enabled. AI outputs never overwrite verified assessment history.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-outline-variant/25">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={exportPortfolio}
              className="px-3 py-1.5 rounded bg-surface-high hover:bg-surface-bright border border-outline-variant/50 font-mono text-xs text-on-surface flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <GraduationCap className="w-3.5 h-3.5 text-primary" />
              <span>Export Evidence Portfolio (.md)</span>
            </button>
            <button
              type="button"
              onClick={() => exportAnkiDeck()}
              className="px-3 py-1.5 rounded bg-surface-high hover:bg-surface-bright border border-outline-variant/50 font-mono text-xs text-on-surface flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 text-secondary" />
              <span>Export Flashcards (.tsv)</span>
            </button>
            <button
              type="button"
              onClick={exportCalendarIcs}
              className="px-3 py-1.5 rounded bg-surface-high hover:bg-surface-bright border border-outline-variant/50 font-mono text-xs text-on-surface flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Calendar className="w-3.5 h-3.5 text-tertiary" />
              <span>Export Calendar (.ics)</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {!confirmDeleteServer ? (
              <button
                type="button"
                onClick={() => setConfirmDeleteServer(true)}
                className="px-3 py-1.5 rounded border border-error/40 text-error hover:bg-error-container/25 font-mono text-xs cursor-pointer whitespace-nowrap"
              >
                Delete Server Snapshot ({state.workspaceSyncId})
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteServer(false)}
                  className="px-2.5 py-1 font-mono text-xs text-outline hover:text-on-surface cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void deleteServerWorkspaceSnapshot();
                    setConfirmDeleteServer(false);
                  }}
                  className="px-3 py-1 rounded bg-error text-on-error font-mono text-xs font-bold cursor-pointer whitespace-nowrap"
                >
                  Confirm Delete Server Snapshot
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ACHIEVEMENTS GALLERY */}
      <section className="bg-surface-low border border-outline-variant/35 rounded-md p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-secondary" />
            <h2 className="text-base font-semibold text-on-surface">
              Mastery Achievements
            </h2>
          </div>
          <span className="font-mono text-xs text-secondary font-bold tabular-nums">
            {state.achievements.filter((a) => a.unlockedAt).length} / {state.achievements.length} Unlocked
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {state.achievements.map((ach) => {
            const unlocked = Boolean(ach.unlockedAt);
            return (
              <div
                key={ach.id}
                className={`p-3.5 rounded border flex flex-col justify-between gap-2 ${
                  unlocked
                    ? "bg-surface-lowest border-tertiary/40"
                    : "bg-surface-lowest/50 border-outline-variant/25 opacity-65"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-on-surface">{ach.title}</span>
                  {unlocked ? (
                    <CheckCircle2 className="w-4 h-4 text-tertiary shrink-0" />
                  ) : (
                    <span className="font-mono text-[10px] text-outline">LOCKED</span>
                  )}
                </div>
                <p className="text-xs text-on-surface-variant leading-relaxed">{ach.desc}</p>
                <span className="font-mono text-[10px] text-outline">
                  {ach.unlockedAt
                    ? `Unlocked ${new Date(ach.unlockedAt).toLocaleDateString()}`
                    : "Complete milestone to unlock"}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
