/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy, useState } from "react";
import { Award, CheckCircle2, Loader2, Sparkles, X } from "lucide-react";
import { StudyOSProvider, useStudyOS } from "./context/StudyOSContext";
import { AppView } from "./types/studyOS";
import { HeaderBar } from "./components/HeaderBar";
import { Sidebar } from "./components/Sidebar";
import { CommandPalette } from "./components/CommandPalette";
import { ShortcutManagerModal } from "./components/ShortcutManagerModal";
import { DashboardView } from "./components/views/DashboardView";
import { CourseManagerView } from "./components/views/CourseManagerView";
import { KnowledgeVaultView } from "./components/views/KnowledgeVaultView";
import { GrokopediaView } from "./components/views/GrokopediaView";
import {
  FlashcardDeckView,
  PomodoroFocusView,
  TerminalCLIView,
} from "./components/views/ExecutionToolsView";
import { SettingsView } from "./components/views/SettingsView";
import { AssessmentsAndTasksView } from "./components/views/AssessmentsAndTasksView";
import { GrowthIntelligenceView } from "./components/views/GrowthIntelligenceView";
import { AcademicProfileView } from "./components/views/AcademicProfileView";
import { StudyGuideModal } from "./components/StudyGuideModal";

const IntegrativePhysicsLabGame = lazy(() =>
  import("./components/simulation/IntegrativePhysicsLabGame").then((m) => ({
    default: m.IntegrativePhysicsLabGame,
  }))
);

const LearningOSHubView = lazy(() =>
  import("./components/views/LearningOSHubView").then((m) => ({
    default: m.LearningOSHubView,
  }))
);

function ViewChunkFallback({ label }: { label: string }) {
  return (
    <div className="bg-surface-lowest border border-outline-variant/40 rounded-md p-8 flex items-center justify-center gap-2.5 font-mono text-xs text-outline">
      <Loader2 className="w-4 h-4 text-primary animate-spin" />
      <span>Loading {label}...</span>
    </div>
  );
}

function ToastOverlayStack({ overWebGL }: { overWebGL: boolean }) {
  const { toasts, dismissToast } = useStudyOS();
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[90] flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)] pointer-events-none">
      {toasts.map((t) => {
        const borderStyle =
          t.variant === "levelup"
            ? "border-secondary shadow-[0_0_20px_rgba(255,185,95,0.3)]"
            : t.variant === "xp"
            ? "border-primary/60 shadow-[0_0_16px_rgba(76,215,246,0.22)]"
            : t.variant === "error"
            ? "border-error/60"
            : "border-tertiary/50";

        return (
          <div
            key={t.id}
            className={`pointer-events-auto ${
              overWebGL ? "bg-[#0b111e]" : "bg-surface-lowest/95 backdrop-blur-md"
            } border ${borderStyle} rounded-md p-3.5 flex items-start justify-between gap-3`}
          >
            <div className="flex items-start gap-2.5 min-w-0">
              {t.variant === "levelup" ? (
                <Award className="w-4 h-4 text-secondary shrink-0 mt-0.5" />
              ) : t.variant === "xp" ? (
                <Sparkles className="w-4 h-4 text-primary shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-tertiary shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-on-surface">
                    {t.title}
                  </span>
                  {t.xpDelta && (
                    <span className="font-mono text-[11px] font-bold text-primary tabular-nums">
                      +{t.xpDelta} XP
                    </span>
                  )}
                </div>
                {t.subtitle && (
                  <p className="font-mono text-[11px] text-on-surface-variant truncate pt-0.5">
                    {t.subtitle}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              className="text-outline hover:text-on-surface cursor-pointer shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function StudyOSShell() {
  const { activeView, state } = useStudyOS();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const a11y = state.academicProfile?.accessibilityPreferences;
  const a11yProps = {
    "data-reduced-motion": a11y?.reducedMotion ? "true" : "false",
    "data-high-contrast": a11y?.highContrastText ? "true" : "false",
    "data-comfortable-spacing": a11y?.comfortableSpacing ? "true" : "false",
  };

  // Full-Viewport 100vw x 100vh 3D Game Shell (Zero Website Header/Sidebar Chrome)
  if (activeView === AppView.SIMULATION) {
    return (
      <div {...a11yProps}>
        <Suspense fallback={<ViewChunkFallback label="3D Physics & Math Lab" />}>
          <IntegrativePhysicsLabGame />
        </Suspense>
        <StudyGuideModal />
        <CommandPalette />
        <ShortcutManagerModal />
        <ToastOverlayStack overWebGL={true} />
      </div>
    );
  }

  const renderActiveView = () => {
    switch (activeView) {
      case AppView.DASHBOARD:
        return <DashboardView />;
      case AppView.COURSES:
        return <CourseManagerView />;
      case AppView.VAULT:
        return <KnowledgeVaultView />;
      case AppView.LEARNING_OS:
        return (
          <Suspense fallback={<ViewChunkFallback label="LearningOS Studio" />}>
            <LearningOSHubView />
          </Suspense>
        );
      case AppView.ASSESSMENTS:
        return <AssessmentsAndTasksView />;
      case AppView.GROWTH:
        return <GrowthIntelligenceView />;
      case AppView.PROFILE:
        return <AcademicProfileView />;
      case AppView.GROKOPEDIA:
        return <GrokopediaView />;
      case AppView.TERMINAL:
        return <TerminalCLIView />;
      case AppView.POMODORO:
        return <PomodoroFocusView />;
      case AppView.FLASHCARDS:
        return <FlashcardDeckView />;
      case AppView.SETTINGS:
        return <SettingsView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div
      {...a11yProps}
      className="min-h-screen bg-background text-on-surface flex flex-col"
    >
      <HeaderBar
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
      />

      <Sidebar
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
      />

      <div className="lg:pl-64 pt-16 flex-1 flex flex-col">
        <main className="flex-1 w-full max-w-[1600px] mx-auto px-4 sm:px-6 py-5">
          {renderActiveView()}
        </main>
      </div>

      {/* Global Walkthrough Guide, Cmd/Ctrl + K Command Palette & Keyboard Shortcut Manager */}
      <StudyGuideModal />
      <CommandPalette />
      <ShortcutManagerModal />
      <ToastOverlayStack overWebGL={false} />
    </div>
  );
}

export default function App() {
  return (
    <StudyOSProvider>
      <StudyOSShell />
    </StudyOSProvider>
  );
}
