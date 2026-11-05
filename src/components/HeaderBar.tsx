import React from "react";
import { AlertTriangle, Compass, Cpu, Flame, Gamepad2, Keyboard, Loader2, Menu, Search, Timer, X, Zap } from "lucide-react";
import { useStudyOS } from "../context/StudyOSContext";
import { AppView } from "../types/studyOS";
import {
  formatSecondsToTimestamp,
  getLevelProgress,
  getProfileInitials,
} from "../lib/gamification";
import { formatShortcutBadge, resolveEffectiveShortcuts } from "../lib/shortcuts";

interface HeaderBarProps {
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
}

export function HeaderBar({ mobileMenuOpen, setMobileMenuOpen }: HeaderBarProps) {
  const {
    state,
    setActiveView,
    setCommandPaletteOpen,
    setShortcutModalOpen,
    setGuideModalOpen,
    launchIntegrativeLab,
    autonomousAgentStatus,
    aiStatus,
    pomodoro,
    localSaveStatus,
    retryLocalSave,
  } = useStudyOS();
  const levelInfo = getLevelProgress(state.stats.currentXP);
  const effectiveShortcuts = resolveEffectiveShortcuts(state.settings.customShortcuts);

  return (
    <header className="fixed top-0 left-0 right-0 h-16 bg-surface-lowest/95 backdrop-blur-xl border-b border-outline-variant/40 z-50 flex items-center justify-between px-4 lg:px-6 gap-4">
      {/* Zone 1: Brand Lockup + Mobile Menu Trigger */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle navigation menu"
          className="lg:hidden p-2 rounded bg-surface-low border border-outline-variant/40 text-on-surface hover:border-primary/50 transition-colors cursor-pointer"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>

        <button
          type="button"
          onClick={() => setActiveView(AppView.DASHBOARD)}
          className="flex items-center gap-2.5 text-left group cursor-pointer"
        >
          <div className="w-8 h-8 rounded bg-primary-container/15 border border-primary/40 flex items-center justify-center shadow-[0_0_12px_rgba(6,182,212,0.2)] group-hover:border-primary transition-colors">
            <svg className="w-4 h-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <polygon points="12 2 21 7 21 17 12 22 3 17 3 7 12 2" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </div>
          <span className="text-lg font-bold tracking-tight text-on-surface whitespace-nowrap">
            Study OS
          </span>
        </button>
      </div>

      {/* Zone 2: Quick Search / Command Trigger */}
      <button
        type="button"
        onClick={() => setCommandPaletteOpen(true)}
        className="hidden md:flex items-center justify-between gap-6 px-3 py-1.5 rounded bg-surface-low border border-outline-variant/40 hover:border-primary/40 text-outline hover:text-on-surface transition-colors w-64 xl:w-80 cursor-pointer"
      >
        <span className="flex items-center gap-2 text-xs truncate">
          <Search className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="truncate">Jump to module, Grokopedia, or command...</span>
        </span>
        <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface-high text-on-surface-variant shrink-0">
          {formatShortcutBadge(effectiveShortcuts.action_command_palette)}
        </kbd>
      </button>

      {/* Zone 3: Persistent Gamification, Shortcuts & Engine Telemetry */}
      <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
        {localSaveStatus.status === "error" && (
          <button
            type="button"
            onClick={retryLocalSave}
            title={localSaveStatus.error || "Local storage write failed. Click to retry."}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-error/15 border border-error/60 text-error font-mono text-xs cursor-pointer whitespace-nowrap shrink-0"
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>Save Failed · Retry</span>
          </button>
        )}

        {/* Live Autonomous Thinking & Note-Taking Indicator */}
        {autonomousAgentStatus.isBusy && (
          <button
            type="button"
            onClick={() => setActiveView(AppView.VAULT)}
            title={`Autonomous agent researching & writing notes for "${autonomousAgentStatus.activeModuleTitle}"`}
            className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-primary-container/15 border border-primary/40 text-primary font-mono text-xs cursor-pointer max-w-[200px]"
          >
            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
            <span className="truncate">Fetching notes...</span>
          </button>
        )}

        {/* Live Pomodoro Indicator */}
        {pomodoro.isRunning && (
          <button
            type="button"
            onClick={() => setActiveView(AppView.POMODORO)}
            className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-primary-container/15 border border-primary/40 text-primary font-mono text-xs tabular-nums cursor-pointer"
          >
            <Timer className="w-3.5 h-3.5" />
            <span>{formatSecondsToTimestamp(pomodoro.remainingSeconds)}</span>
          </button>
        )}

        {/* 3D Physics & Math Lab Quick Launch */}
        <button
          type="button"
          onClick={() => launchIntegrativeLab()}
          title="Launch 3D Integrative Physics & Math Lab"
          className="hidden md:flex items-center gap-1.5 bg-surface-low border border-primary/35 hover:border-primary px-2.5 py-1.5 rounded text-primary transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Gamepad2 className="w-3.5 h-3.5 shrink-0" />
          <span className="font-mono text-[11px] font-semibold">3D Lab</span>
        </button>

        {/* Walkthrough Guide Trigger */}
        <button
          type="button"
          onClick={() => setGuideModalOpen(true)}
          title="Where to Start & Study OS Guide"
          className="flex items-center gap-1.5 bg-surface-low border border-outline-variant/40 hover:border-primary/50 px-2.5 py-1.5 rounded text-on-surface-variant hover:text-primary transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Compass className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="font-mono text-[11px]">Guide</span>
        </button>

        {/* Keyboard Shortcut Manager Trigger */}
        <button
          type="button"
          onClick={() => setShortcutModalOpen(true)}
          title={`Keyboard Shortcuts (${formatShortcutBadge(
            effectiveShortcuts.action_shortcut_help
          )} or ?)`}
          className="hidden sm:flex items-center gap-1.5 bg-surface-low border border-outline-variant/40 hover:border-primary/50 px-2.5 py-1.5 rounded text-on-surface-variant hover:text-primary transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Keyboard className="w-3.5 h-3.5 shrink-0" />
          <span className="font-mono text-[11px] hidden xl:inline">Shortcuts</span>
        </button>

        {/* Streak Badge */}
        <button
          type="button"
          onClick={() => setActiveView(AppView.DASHBOARD)}
          title="Active Study Streak"
          className="flex items-center gap-1.5 bg-surface-low border border-secondary/30 hover:border-secondary/60 px-2.5 sm:px-3 py-1.5 rounded shadow-[0_0_12px_rgba(245,158,11,0.14)] transition-colors cursor-pointer"
        >
          <Flame className="w-4 h-4 text-secondary shrink-0" />
          <span className="font-mono text-[11px] font-bold text-secondary tabular-nums whitespace-nowrap">
            {state.stats.streakCount} <span className="hidden sm:inline">d streak</span>
          </span>
        </button>

        {/* Level & XP Progress Bar */}
        <button
          type="button"
          onClick={() => setActiveView(AppView.SETTINGS)}
          title={`${levelInfo.tierName} · Click to view Achievements`}
          className="hidden sm:flex flex-col gap-1 bg-surface-low border border-outline-variant/40 hover:border-primary/40 px-3 py-1 rounded min-w-[165px] lg:min-w-[205px] transition-colors cursor-pointer"
        >
          <div className="flex justify-between items-center gap-2 font-mono text-[10px] tabular-nums">
            <span className="text-primary font-semibold flex items-center gap-1 whitespace-nowrap">
              <Zap className="w-3 h-3" />
              Lv {levelInfo.level}
            </span>
            <span className="text-on-surface-variant whitespace-nowrap">
              {levelInfo.currentXP.toLocaleString()} / {levelInfo.nextLevelXP.toLocaleString()} XP
            </span>
          </div>
          <div className="w-full bg-surface-highest h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-primary h-full rounded-full shadow-[0_0_8px_rgba(76,215,246,0.5)] transition-transform duration-300 origin-left"
              style={{ width: `${levelInfo.progressPercent}%` }}
            />
          </div>
        </button>

        {/* Multi-API & First-Principles Engine Status */}
        <button
          type="button"
          onClick={() => setActiveView(AppView.SETTINGS)}
          title={
            aiStatus.connected
              ? `Active Provider: ${aiStatus.provider} (${state.settings.selectedModel}) + RK4 Physics Engine`
              : "First-Principles RK4 Physics & Math Engine Active (Zero-API Mode)"
          }
          className="hidden lg:flex items-center gap-1.5 bg-surface-low border border-outline-variant/40 hover:border-outline px-2.5 py-1.5 rounded transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Cpu className={`w-3.5 h-3.5 shrink-0 ${aiStatus.connected ? "text-tertiary" : "text-primary"}`} />
          <span className="font-mono text-[11px] text-on-surface-variant">
            {aiStatus.connected ? aiStatus.provider : "RK4 Local"}
          </span>
        </button>

        {/* Profile Handle -> Academic Profile & Portfolio */}
        <button
          type="button"
          onClick={() => setActiveView(AppView.PROFILE)}
          title="Open Student Identity, Skills & Evidence Portfolio"
          className="hidden md:flex items-center gap-2 pl-1 cursor-pointer group"
        >
          <div className="text-right hidden xl:block">
            <div className="font-mono text-[11px] text-on-surface font-medium leading-tight group-hover:text-primary transition-colors">
              {state.academicProfile?.fullName || state.settings.studentHandle}
            </div>
            <div className="font-mono text-[10px] text-outline leading-tight">
              {state.academicProfile?.programme || state.settings.academicTrack}
            </div>
          </div>
          <div className="w-8 h-8 rounded bg-surface-high border border-primary/40 flex items-center justify-center font-mono text-xs font-bold text-primary">
            {getProfileInitials(state.academicProfile?.fullName || state.settings.studentHandle)}
          </div>
        </button>
      </div>
    </header>
  );
}
