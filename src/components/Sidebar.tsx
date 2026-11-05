import React from "react";
import {
  AlertTriangle,
  BookOpen,
  BrainCircuit,
  ClipboardCheck,
  Compass,
  Database,
  FolderKanban,
  Gamepad2,
  GraduationCap,
  Keyboard,
  Layers,
  LayoutGrid,
  Loader2,
  Settings,
  Terminal,
  Timer,
  TrendingUp,
} from "lucide-react";
import { useStudyOS } from "../context/StudyOSContext";
import { AppView } from "../types/studyOS";
import { estimateStorageBytes } from "../lib/storage";
import { formatSecondsToTimestamp } from "../lib/gamification";
import { getDueFlashcards } from "../lib/growthIntelligence";
import {
  formatShortcutBadge,
  getFormattedViewShortcut,
  resolveEffectiveShortcuts,
} from "../lib/shortcuts";

interface SidebarProps {
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
}

export function Sidebar({ mobileMenuOpen, setMobileMenuOpen }: SidebarProps) {
  const {
    state,
    activeView,
    setActiveView,
    setCommandPaletteOpen,
    setShortcutModalOpen,
    setGuideModalOpen,
    autonomousAgentStatus,
    pomodoro,
    localSaveStatus,
    retryLocalSave,
  } = useStudyOS();

  const bytesUsed = estimateStorageBytes(state);
  const kbUsed = (bytesUsed / 1024).toFixed(1);
  const quotaPercent = Math.min(100, Math.max(4, Math.round((bytesUsed / (5 * 1024 * 1024)) * 100)));
  const effectiveShortcuts = resolveEffectiveShortcuts(state.settings.customShortcuts);
  const activeCoursesCount = state.courses.filter((c) => !c.archived).length;
  const activeModulesCount = state.modules.filter((m) => !m.archived).length;
  const openTasksCount = state.tasks.filter(
    (t) => t.status !== "completed" && t.status !== "submitted"
  ).length;
  const dueCardsCount = getDueFlashcards(state.flashcards).length;

  const navigate = (view: AppView) => {
    setActiveView(view);
    setMobileMenuOpen(false);
  };

  const coreLinks: Array<{
    id: AppView;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    meta?: string;
  }> = [
    { id: AppView.DASHBOARD, label: "Dashboard", icon: LayoutGrid },
    {
      id: AppView.COURSES,
      label: "Course Syllabus",
      icon: BookOpen,
      meta: `${activeCoursesCount}`,
    },
    {
      id: AppView.VAULT,
      label: "Knowledge Vault",
      icon: FolderKanban,
      meta: `${activeModulesCount}`,
    },
    {
      id: AppView.LEARNING_OS,
      label: "LearningOS Studio",
      icon: Database,
      meta: "SQLite",
    },
    {
      id: AppView.ASSESSMENTS,
      label: "Tasks & Exams",
      icon: ClipboardCheck,
      meta: `${openTasksCount}`,
    },
    {
      id: AppView.GROWTH,
      label: "Growth Intelligence",
      icon: TrendingUp,
      meta: state.assessmentAttempts.length > 0 ? `${state.assessmentAttempts.length}` : undefined,
    },
    {
      id: AppView.PROFILE,
      label: "Profile & Portfolio",
      icon: GraduationCap,
    },
    {
      id: AppView.GROKOPEDIA,
      label: "Grokopedia",
      icon: BrainCircuit,
    },
  ];

  const toolLinks: Array<{
    id: AppView;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    meta?: string;
  }> = [
    { id: AppView.TERMINAL, label: "Terminal CLI", icon: Terminal },
    {
      id: AppView.POMODORO,
      label: "Pomodoro Focus",
      icon: Timer,
      meta: pomodoro.isRunning ? formatSecondsToTimestamp(pomodoro.remainingSeconds) : undefined,
    },
    {
      id: AppView.FLASHCARDS,
      label: "Flashcard Deck",
      icon: Layers,
      meta: dueCardsCount > 0 ? `${dueCardsCount} due` : `${state.flashcards.length}`,
    },
    {
      id: AppView.SIMULATION,
      label: "3D Physics & Math Lab",
      icon: Gamepad2,
      meta: "RK4",
    },
  ];

  const renderSidebarContent = () => (
    <div className="flex flex-col justify-between h-full py-4 px-3 select-none">
      <div className="flex flex-col gap-6">
        {/* Core Nodes */}
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] tracking-wider text-outline px-2.5">
            Core Workspace
          </span>
          <nav className="flex flex-col gap-1">
            {coreLinks.map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.id;
              const shortcutHint = getFormattedViewShortcut(
                item.id,
                state.settings.customShortcuts
              );
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(item.id)}
                  title={`${item.label} (${shortcutHint})`}
                  className={`flex items-center justify-between px-2.5 py-2 rounded text-[13px] transition-colors cursor-pointer whitespace-nowrap group ${
                    isActive
                      ? "bg-primary-container text-on-primary-container font-semibold shadow-[0_0_14px_rgba(6,182,212,0.28)]"
                      : "text-on-surface-variant hover:bg-surface-high hover:text-on-surface"
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    {item.meta && (
                      <span
                        className={`font-mono text-[10px] tabular-nums ${
                          isActive ? "text-on-primary-container/90 font-bold" : "text-outline"
                        }`}
                      >
                        {item.meta}
                      </span>
                    )}
                    <kbd
                      className={`font-mono text-[10px] tabular-nums ${
                        isActive
                          ? "text-on-primary-container/80"
                          : "text-outline/70 group-hover:text-primary"
                      }`}
                    >
                      {shortcutHint}
                    </kbd>
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Execution Tools */}
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] tracking-wider text-outline px-2.5">
            Execution Tools
          </span>
          <nav className="flex flex-col gap-1">
            {toolLinks.map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.id;
              const shortcutHint = getFormattedViewShortcut(
                item.id,
                state.settings.customShortcuts
              );
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(item.id)}
                  title={`${item.label} (${shortcutHint})`}
                  className={`flex items-center justify-between px-2.5 py-2 rounded text-[13px] transition-colors cursor-pointer whitespace-nowrap group ${
                    isActive
                      ? "bg-primary-container text-on-primary-container font-semibold shadow-[0_0_14px_rgba(6,182,212,0.28)]"
                      : "text-on-surface-variant hover:bg-surface-high hover:text-on-surface"
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    {item.meta && (
                      <span
                        className={`font-mono text-[10px] tabular-nums ${
                          isActive ? "text-on-primary-container/90 font-bold" : "text-primary"
                        }`}
                      >
                        {item.meta}
                      </span>
                    )}
                    <kbd
                      className={`font-mono text-[10px] tabular-nums ${
                        isActive
                          ? "text-on-primary-container/80"
                          : "text-outline/70 group-hover:text-primary"
                      }`}
                    >
                      {shortcutHint}
                    </kbd>
                  </span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Bottom Autonomous Note-Taking Status, Local Storage Meter & Shortcuts */}
      <div className="flex flex-col gap-2.5 pt-4 border-t border-outline-variant/30">
        {autonomousAgentStatus.isBusy && (
          <div className="bg-surface-low border border-primary/40 p-2.5 rounded flex items-start gap-2">
            <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="font-mono text-[10px] text-primary font-semibold">
                Thinking &amp; Taking Notes
              </div>
              <div className="font-mono text-[10px] text-on-surface-variant truncate">
                {autonomousAgentStatus.activeModuleTitle}
              </div>
            </div>
          </div>
        )}

        {localSaveStatus.status === "error" && (
          <div className="bg-error/10 border border-error/50 p-2.5 rounded flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0 font-mono text-[10px] text-error">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Local save failed</span>
            </div>
            <button
              type="button"
              onClick={retryLocalSave}
              className="px-2 py-0.5 rounded bg-error text-on-error font-mono text-[10px] font-semibold cursor-pointer whitespace-nowrap shrink-0"
            >
              Retry
            </button>
          </div>
        )}

        <div className="bg-surface-low border border-outline-variant/30 p-2.5 rounded flex flex-col gap-1">
          <div className="flex justify-between items-center font-mono text-[10px] tabular-nums">
            <span className="text-on-surface-variant">Local Vault DB</span>
            <span className="text-primary">{kbUsed} KB</span>
          </div>
          <div className="w-full bg-surface-highest h-1 rounded-full overflow-hidden">
            <div className="bg-primary h-full rounded-full" style={{ width: `${quotaPercent}%` }} />
          </div>
          <span className="font-mono text-[10px] text-outline">
            {state.settings.autonomousAgentEnabled
              ? "Auto-Track & Auto-Notes Active"
              : "IndexedDB + Local Sync"}
          </span>
        </div>

        <div className="flex items-center justify-between pt-0.5 gap-1.5">
          <button
            type="button"
            onClick={() => navigate(AppView.SETTINGS)}
            title={`Settings & Local DB (${getFormattedViewShortcut(
              AppView.SETTINGS,
              state.settings.customShortcuts
            )})`}
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded font-mono text-xs transition-colors cursor-pointer min-w-0 ${
              activeView === AppView.SETTINGS
                ? "bg-surface-high text-primary font-semibold"
                : "text-on-surface-variant hover:text-on-surface hover:bg-surface-low"
            }`}
          >
            <Settings className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Settings</span>
          </button>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                setGuideModalOpen(true);
              }}
              title="Where to Start & Study OS Guide"
              className="flex items-center gap-1 px-2 py-1 rounded bg-surface-high border border-outline-variant/40 font-mono text-[11px] text-primary hover:border-primary/50 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Compass className="w-3 h-3 shrink-0" />
              <span>Guide</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                setShortcutModalOpen(true);
              }}
              title={`Keyboard Shortcut Manager (${formatShortcutBadge(
                effectiveShortcuts.action_shortcut_help
              )})`}
              className="flex items-center gap-1 px-2 py-1 rounded bg-surface-high border border-outline-variant/40 font-mono text-[11px] text-on-surface-variant hover:text-primary hover:border-primary/40 transition-colors cursor-pointer"
            >
              <Keyboard className="w-3 h-3" />
              <span>?</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                setCommandPaletteOpen(true);
              }}
              title={`Command Palette (${formatShortcutBadge(
                effectiveShortcuts.action_command_palette
              )})`}
              className="flex items-center gap-1 px-2 py-1 rounded bg-surface-high border border-outline-variant/40 font-mono text-[11px] text-on-surface-variant hover:text-primary hover:border-primary/40 transition-colors cursor-pointer"
            >
              <span>{formatShortcutBadge(effectiveShortcuts.action_command_palette)}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:block fixed left-0 top-16 bottom-0 w-64 bg-surface-lowest border-r border-outline-variant/40 z-40">
        {renderSidebarContent()}
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 top-16 z-40 flex">
          <div
            className="fixed inset-0 top-16 bg-black/70 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-64 max-w-[82vw] bg-surface-lowest border-r border-outline-variant/50 h-full z-50">
            {renderSidebarContent()}
          </aside>
        </div>
      )}
    </>
  );
}
