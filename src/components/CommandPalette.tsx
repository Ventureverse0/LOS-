import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  BrainCircuit,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Compass,
  Database,
  Download,
  FilePlus2,
  FolderKanban,
  Gamepad2,
  GraduationCap,
  Keyboard,
  Layers,
  LayoutGrid,
  Play,
  Search,
  Settings,
  Sparkles,
  Tag,
  Terminal,
  Timer,
  TrendingUp,
  Upload,
  X,
} from "lucide-react";
import { useStudyOS } from "../context/StudyOSContext";
import { AppView } from "../types/studyOS";
import { collectCourseTagCounts } from "../lib/gamification";
import {
  formatShortcutBadge,
  getFormattedViewShortcut,
  resolveEffectiveShortcuts,
} from "../lib/shortcuts";

interface PaletteItem {
  id: string;
  group: string;
  label: string;
  sublabel: string;
  shortcut?: string;
  icon: React.ComponentType<{ className?: string }>;
  onSelect: () => void;
}

export function CommandPalette() {
  const {
    state,
    isCommandPaletteOpen,
    setCommandPaletteOpen,
    setShortcutModalOpen,
    setGuideModalOpen,
    launchIntegrativeLab,
    setActiveView,
    openModuleInVault,
    openCourseInManager,
    openCourseTagFilter,
    openGrokopediaWithTopic,
    updateModuleStatus,
    logStudyMinutes,
    triggerFocusSessionShortcut,
    createQuickVaultNote,
    runAutonomousNoteTaker,
    pomodoro,
    exportBackup,
    exportPortfolio,
    exportAnkiDeck,
    exportCalendarIcs,
    syncWorkspaceNow,
  } = useStudyOS();

  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isCommandPaletteOpen) {
      setQuery("");
      setActiveIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [isCommandPaletteOpen]);

  const effectiveShortcuts = useMemo(
    () => resolveEffectiveShortcuts(state.settings.customShortcuts),
    [state.settings.customShortcuts]
  );

  const items = useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLowerCase();
    const list: PaletteItem[] = [];

    if (query.trim().length > 2) {
      list.push({
        id: "cmd-lab-dynamic",
        group: "3D Integrative Physics & Math",
        label: `Launch 3D Physics & Math Lab for "${query.trim()}"`,
        sublabel: "+75 XP · Interactive RK4 trajectory & conservation lab",
        icon: Gamepad2,
        onSelect: () => launchIntegrativeLab({ customTopic: query.trim() }),
      });
      list.push({
        id: "cmd-grok-dynamic",
        group: "Grokopedia AI Synthesis",
        label: `Generate Deep Curriculum for "${query.trim()}"`,
        sublabel: "+50 XP · Synthesize multi-unit syllabus & notes",
        icon: BrainCircuit,
        onSelect: () => openGrokopediaWithTopic(query.trim()),
      });
      list.push({
        id: "cmd-note-dynamic",
        group: "Autonomous Note-Taker",
        label: `Create Note & Auto-Fetch Research: "${query.trim()}"`,
        sublabel: "Opens Knowledge Vault & automatically takes down grounded notes",
        icon: Sparkles,
        onSelect: () => {
          const created = createQuickVaultNote(query.trim());
          void runAutonomousNoteTaker(created.id);
        },
      });
    }

    // Quick Study & Shortcut Actions
    const quickActions: PaletteItem[] = [
      {
        id: "act-guide",
        group: "Quick Actions",
        label: "Open Walkthrough & Study Guide (Where to Start)",
        sublabel: "7-step Student Growth OS roadmap, auto-updating pipeline & 3D Lab controls",
        icon: Compass,
        onSelect: () => setGuideModalOpen(true),
      },
      {
        id: "act-learningos",
        group: "Quick Actions",
        label: "Open LearningOS Studio (Remote Lectures, FTS5 Search & Concept Graph)",
        sublabel: "Captions-first transcripts, zero permanent video, cited AI tutor & SQLite FTS5",
        shortcut: getFormattedViewShortcut(AppView.LEARNING_OS, state.settings.customShortcuts),
        icon: Database,
        onSelect: () => setActiveView(AppView.LEARNING_OS),
      },
      {
        id: "act-launch-lab",
        group: "Quick Actions",
        label: "Launch 3D Integrative Physics & Math Lab",
        sublabel: "Full-screen 120Hz RK4 proving ground calibrated to your active study unit",
        shortcut: getFormattedViewShortcut(AppView.SIMULATION, state.settings.customShortcuts),
        icon: Gamepad2,
        onSelect: () => launchIntegrativeLab(),
      },
      {
        id: "act-new-note",
        group: "Quick Actions",
        label: "New Note in Knowledge Vault",
        sublabel: "Create a study note and jump directly to the Vault editor",
        shortcut: formatShortcutBadge(effectiveShortcuts.action_new_note),
        icon: FilePlus2,
        onSelect: () => createQuickVaultNote(),
      },
      {
        id: "act-pomo-toggle",
        group: "Quick Actions",
        label: pomodoro.isRunning
          ? "Focus Session: Pause Live Sprint"
          : "Focus Session: Start 25m Sprint",
        sublabel: "Start or pause Pomodoro Focus timer from anywhere",
        shortcut: formatShortcutBadge(effectiveShortcuts.action_focus_session),
        icon: Play,
        onSelect: () => triggerFocusSessionShortcut(),
      },
      {
        id: "act-auto-research",
        group: "Quick Actions",
        label: "Think, Fetch & Take Notes on Active Unit",
        sublabel: "Autonomously search web sources, take down Markdown notes & add cards",
        shortcut: formatShortcutBadge(effectiveShortcuts.action_auto_research),
        icon: Sparkles,
        onSelect: () => void runAutonomousNoteTaker(),
      },
      {
        id: "act-shortcuts",
        group: "Quick Actions",
        label: "Open Keyboard Shortcut Manager",
        sublabel: "View and customize Cmd/Ctrl + 1–8 navigation & study shortcuts",
        shortcut: formatShortcutBadge(effectiveShortcuts.action_shortcut_help),
        icon: Keyboard,
        onSelect: () => setShortcutModalOpen(true),
      },
      {
        id: "act-log-30",
        group: "Quick Actions",
        label: "Log +30 Minutes Deep Study Session",
        sublabel: "+15 XP · Updates Today's Focus Telemetry",
        icon: Timer,
        onSelect: () => logStudyMinutes(30, "Quick Command Log (+30m)"),
      },
      {
        id: "act-upload-notes",
        group: "Quick Actions",
        label: "Upload Notes / PDF & Build Personalized Curriculum",
        sublabel: "+50 XP · Synthesize Course, Vault Notes & Flashcards around your files",
        icon: Upload,
        onSelect: () => setActiveView(AppView.GROKOPEDIA),
      },
      {
        id: "act-sync-db",
        group: "Quick Actions",
        label: "Sync Workspace Snapshot to Local Database",
        sublabel: `Persist ${state.workspaceSyncId} to local store`,
        icon: Download,
        onSelect: () => void syncWorkspaceNow(),
      },
      {
        id: "act-export",
        group: "Quick Actions",
        label: "Save Portable Local Database File (.studyos.json)",
        sublabel: "Download portable JSON snapshot",
        icon: Download,
        onSelect: () => exportBackup(),
      },
      {
        id: "act-export-portfolio",
        group: "Quick Actions",
        label: "Export Evidence-Backed Student Portfolio (.md)",
        sublabel: "Download academic profile, skills matrix & verified mastery evidence",
        icon: GraduationCap,
        onSelect: () => exportPortfolio(),
      },
      {
        id: "act-export-anki",
        group: "Quick Actions",
        label: "Export Flashcard Deck for Anki (.tsv)",
        sublabel: "Download tab-separated Front / Back / Tags deck",
        icon: Layers,
        onSelect: () => exportAnkiDeck(),
      },
      {
        id: "act-export-ics",
        group: "Quick Actions",
        label: "Export Academic Calendar & Study Plan (.ics)",
        sublabel: "Download RFC 5545 calendar of deadlines, exams & time-blocks",
        icon: Calendar,
        onSelect: () => exportCalendarIcs(),
      },
    ];

    // Navigation Commands
    const navCommands: PaletteItem[] = [
      {
        id: "nav-dash",
        group: "Navigation",
        label: "Go to Command Center Dashboard",
        sublabel: "Daily Intelligence Brief, Streaks, Active Courses & Time-Blocks",
        shortcut: getFormattedViewShortcut(AppView.DASHBOARD, state.settings.customShortcuts),
        icon: LayoutGrid,
        onSelect: () => setActiveView(AppView.DASHBOARD),
      },
      {
        id: "nav-courses",
        group: "Navigation",
        label: "Open Course & Syllabus Manager",
        sublabel: "Kanban Board, Table View, Semesters & Tag Filtering",
        shortcut: getFormattedViewShortcut(AppView.COURSES, state.settings.customShortcuts),
        icon: BookOpen,
        onSelect: () => setActiveView(AppView.COURSES),
      },
      {
        id: "nav-vault",
        group: "Navigation",
        label: "Open Knowledge Vault & Lecture Workspace",
        sublabel: "Markdown Notes, Revisions, Objectives, Unresolved Questions & Video",
        shortcut: getFormattedViewShortcut(AppView.VAULT, state.settings.customShortcuts),
        icon: FolderKanban,
        onSelect: () => setActiveView(AppView.VAULT),
      },
      {
        id: "nav-learningos",
        group: "Navigation",
        label: "Open LearningOS Studio",
        sublabel: "SQLite + FTS5 Search, Captions-First Transcripts, Concept Graph & App Host",
        shortcut: getFormattedViewShortcut(AppView.LEARNING_OS, state.settings.customShortcuts),
        icon: Database,
        onSelect: () => setActiveView(AppView.LEARNING_OS),
      },
      {
        id: "nav-assessments",
        group: "Navigation",
        label: "Open Tasks, Exams & Practice Assessments",
        sublabel: "Assignments, Exam Timetable, Topic Quizzes & Attempt Ledger",
        shortcut: getFormattedViewShortcut(AppView.ASSESSMENTS, state.settings.customShortcuts),
        icon: ClipboardCheck,
        onSelect: () => setActiveView(AppView.ASSESSMENTS),
      },
      {
        id: "nav-growth",
        group: "Navigation",
        label: "Open Student Growth Intelligence",
        sublabel: "Evidence Mastery, Timeline, Weekly/Monthly Reviews & Grounded Tutor",
        shortcut: getFormattedViewShortcut(AppView.GROWTH, state.settings.customShortcuts),
        icon: TrendingUp,
        onSelect: () => setActiveView(AppView.GROWTH),
      },
      {
        id: "nav-profile",
        group: "Navigation",
        label: "Open Student Academic Profile & Portfolio",
        sublabel: "Identity, Academic Goals, Skills Evidence Matrix & Milestones",
        shortcut: getFormattedViewShortcut(AppView.PROFILE, state.settings.customShortcuts),
        icon: GraduationCap,
        onSelect: () => setActiveView(AppView.PROFILE),
      },
      {
        id: "nav-grok",
        group: "Navigation",
        label: "Open Grokopedia Deep Research Engine",
        sublabel: "AI Curriculum & Formal Systems Synthesis",
        shortcut: getFormattedViewShortcut(AppView.GROKOPEDIA, state.settings.customShortcuts),
        icon: BrainCircuit,
        onSelect: () => setActiveView(AppView.GROKOPEDIA),
      },
      {
        id: "nav-term",
        group: "Execution Tools",
        label: "Open Study OS Terminal CLI",
        sublabel: "Run shell commands & unit test diagnostics",
        shortcut: getFormattedViewShortcut(AppView.TERMINAL, state.settings.customShortcuts),
        icon: Terminal,
        onSelect: () => setActiveView(AppView.TERMINAL),
      },
      {
        id: "nav-pomo",
        group: "Execution Tools",
        label: "Open Pomodoro Focus Grid",
        sublabel: "Timed study sprints & session telemetry",
        shortcut: getFormattedViewShortcut(AppView.POMODORO, state.settings.customShortcuts),
        icon: Timer,
        onSelect: () => setActiveView(AppView.POMODORO),
      },
      {
        id: "nav-flash",
        group: "Execution Tools",
        label: "Open Spaced Repetition Flashcard Deck",
        sublabel: `${state.flashcards.length} active recall cards`,
        shortcut: getFormattedViewShortcut(AppView.FLASHCARDS, state.settings.customShortcuts),
        icon: Layers,
        onSelect: () => setActiveView(AppView.FLASHCARDS),
      },
      {
        id: "nav-sim",
        group: "Execution Tools",
        label: "Open 3D Integrative Physics & Math Lab",
        sublabel: "Full-viewport Three.js RK4 physics & math proving ground",
        shortcut: getFormattedViewShortcut(AppView.SIMULATION, state.settings.customShortcuts),
        icon: Gamepad2,
        onSelect: () => launchIntegrativeLab(),
      },
      {
        id: "nav-settings",
        group: "Navigation",
        label: "Open Settings, Privacy & Local DB",
        sublabel: "Learner profiles, Data Ownership, Autonomous Agent & Backup",
        shortcut: getFormattedViewShortcut(AppView.SETTINGS, state.settings.customShortcuts),
        icon: Settings,
        onSelect: () => setActiveView(AppView.SETTINGS),
      },
    ];

    // Modules
    const moduleCommands: PaletteItem[] = state.modules.map((m) => {
      const course = state.courses.find((c) => c.id === m.courseId);
      return {
        id: `mod-open-${m.id}`,
        group: "Knowledge Vault Modules",
        label: `${course ? `${course.code}: ` : ""}${m.title}`,
        sublabel: `${m.status} · Open notes & video lecture`,
        icon: FolderKanban,
        onSelect: () => openModuleInVault(m.id),
      };
    });

    const masterCommands: PaletteItem[] = state.modules
      .filter((m) => m.status !== "Mastered")
      .slice(0, 6)
      .map((m) => ({
        id: `mod-master-${m.id}`,
        group: "Complete Module (+100 XP)",
        label: `Mark Mastered: ${m.title}`,
        sublabel: "+100 XP · Complete syllabus unit",
        icon: CheckCircle2,
        onSelect: () => updateModuleStatus(m.id, "Mastered"),
      }));

    const courseCommands: PaletteItem[] = state.courses.map((c) => ({
      id: `course-${c.id}`,
      group: "Courses",
      label: `${c.code} — ${c.title}`,
      sublabel: `${c.completedUnits}/${c.totalUnits} units mastered${
        c.tags.length > 0 ? ` · ${c.tags.map((t) => `#${t}`).join(" · ")}` : ""
      }`,
      icon: BookOpen,
      onSelect: () => openCourseInManager(c.id),
    }));

    const courseTagCommands: PaletteItem[] = collectCourseTagCounts(state.courses).map(
      ({ tag, count }) => ({
        id: `course-tag-${tag}`,
        group: "Course Tags",
        label: `Filter Courses by #${tag}`,
        sublabel: `${count} matching ${count === 1 ? "course" : "courses"} in Course & Syllabus Manager`,
        icon: Tag,
        onSelect: () => openCourseTagFilter(tag),
      })
    );

    const all = [
      ...list,
      ...quickActions,
      ...navCommands,
      ...courseCommands,
      ...courseTagCommands,
      ...moduleCommands,
      ...masterCommands,
    ];
    if (!q) return all.slice(0, 14);

    return all.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.sublabel.toLowerCase().includes(q) ||
        item.group.toLowerCase().includes(q)
    );
  }, [
    query,
    effectiveShortcuts,
    state.flashcards.length,
    state.modules,
    state.courses,
    state.settings.customShortcuts,
    pomodoro.isRunning,
    openGrokopediaWithTopic,
    createQuickVaultNote,
    runAutonomousNoteTaker,
    triggerFocusSessionShortcut,
    setShortcutModalOpen,
    setGuideModalOpen,
    launchIntegrativeLab,
    setActiveView,
    logStudyMinutes,
    exportBackup,
    exportPortfolio,
    exportAnkiDeck,
    exportCalendarIcs,
    syncWorkspaceNow,
    state.workspaceSyncId,
    openModuleInVault,
    updateModuleStatus,
    openCourseInManager,
    openCourseTagFilter,
  ]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!isCommandPaletteOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setCommandPaletteOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (items.length > 0 ? (prev + 1) % items.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (items.length > 0 ? (prev - 1 + items.length) % items.length : 0));
    } else if (e.key === "Enter" && items[activeIndex]) {
      e.preventDefault();
      items[activeIndex].onSelect();
      setCommandPaletteOpen(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/75 backdrop-blur-xs"
      onClick={() => setCommandPaletteOpen(false)}
    >
      <div
        className="w-full max-w-2xl rounded-lg bg-surface-low border border-outline-variant/60 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-3 px-4 py-3 bg-surface-lowest border-b border-outline-variant/40">
          <Search className="w-4 h-4 text-primary shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a topic to auto-fetch notes, jump to a module, or run a command..."
            className="w-full bg-transparent text-sm text-on-surface placeholder:text-outline focus:outline-none font-mono"
          />
          <button
            type="button"
            onClick={() => setCommandPaletteOpen(false)}
            className="p-1 text-outline hover:text-on-surface cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2 space-y-1">
          {items.length === 0 ? (
            <div className="py-8 text-center text-xs font-mono text-outline">
              No matching modules or commands found.
            </div>
          ) : (
            items.map((item, idx) => {
              const Icon = item.icon;
              const selected = idx === activeIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => {
                    item.onSelect();
                    setCommandPaletteOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded text-left transition-colors cursor-pointer ${
                    selected
                      ? "bg-surface-high border border-primary/40 text-on-surface"
                      : "border border-transparent text-on-surface-variant hover:bg-surface-container"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Icon className={`w-4 h-4 shrink-0 ${selected ? "text-primary" : "text-outline"}`} />
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-on-surface truncate">{item.label}</div>
                      <div className="font-mono text-[11px] text-outline truncate">{item.sublabel}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {item.shortcut && (
                      <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface-lowest border border-outline-variant/40 text-primary">
                        {item.shortcut}
                      </kbd>
                    )}
                    <span className="font-mono text-[10px] tracking-wider text-outline hidden sm:inline">
                      {item.group}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-2 bg-surface-lowest border-t border-outline-variant/30 font-mono text-[10px] text-outline">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Execute</span>
            <span>ESC Dismiss</span>
          </div>
          <span>Cmd/Ctrl + 1–9 for Direct View Switching</span>
        </div>
      </div>
    </div>
  );
}
