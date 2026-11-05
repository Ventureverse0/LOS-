import { AppView, type ShortcutActionId } from "../types/studyOS";

export interface ShortcutDefinition {
  id: ShortcutActionId;
  category: "Navigation" | "Study & Autonomous Actions";
  label: string;
  description: string;
  defaultChord: string;
  /** Secondary built-in chord that also triggers when default binding is active */
  secondaryChord?: string;
  targetView?: AppView;
}

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  {
    id: "nav_dashboard",
    category: "Navigation",
    label: "Go to Dashboard",
    description: "Open Command Center telemetry, active courses, and daily time-blocks.",
    defaultChord: "Mod+1",
    secondaryChord: "Alt+1",
    targetView: AppView.DASHBOARD,
  },
  {
    id: "nav_courses",
    category: "Navigation",
    label: "Go to Course Syllabus",
    description: "Switch to Kanban board, table matrix, and tag filter manager.",
    defaultChord: "Mod+2",
    secondaryChord: "Alt+2",
    targetView: AppView.COURSES,
  },
  {
    id: "nav_vault",
    category: "Navigation",
    label: "Go to Knowledge Vault",
    description: "Open split Markdown editor, embedded lecture player, and resources.",
    defaultChord: "Mod+3",
    secondaryChord: "Alt+3",
    targetView: AppView.VAULT,
  },
  {
    id: "nav_grokopedia",
    category: "Navigation",
    label: "Go to Grokopedia AI",
    description: "Open curriculum builder, file/PDF ingestion, and deep research studio.",
    defaultChord: "Mod+4",
    secondaryChord: "Alt+4",
    targetView: AppView.GROKOPEDIA,
  },
  {
    id: "nav_terminal",
    category: "Navigation",
    label: "Go to Terminal CLI",
    description: "Open interactive shell commands and unit test runner.",
    defaultChord: "Mod+5",
    secondaryChord: "Alt+5",
    targetView: AppView.TERMINAL,
  },
  {
    id: "nav_pomodoro",
    category: "Navigation",
    label: "Go to Pomodoro Focus",
    description: "Open focus sprint countdown timer and session controls.",
    defaultChord: "Mod+6",
    secondaryChord: "Alt+6",
    targetView: AppView.POMODORO,
  },
  {
    id: "nav_flashcards",
    category: "Navigation",
    label: "Go to Flashcard Deck",
    description: "Open Leitner 5-box spaced repetition active-recall deck.",
    defaultChord: "Mod+7",
    secondaryChord: "Alt+7",
    targetView: AppView.FLASHCARDS,
  },
  {
    id: "nav_settings",
    category: "Navigation",
    label: "Go to Settings & Local DB",
    description: "Manage learner profiles, autonomous agent, shortcuts, and backups.",
    defaultChord: "Mod+8",
    secondaryChord: "Mod+,",
    targetView: AppView.SETTINGS,
  },
  {
    id: "nav_simulation",
    category: "Navigation",
    label: "Go to 3D Physics & Math Lab",
    description: "Launch the full-screen 3D RK4 integrative physics & math simulation lab.",
    defaultChord: "Mod+9",
    secondaryChord: "Alt+9",
    targetView: AppView.SIMULATION,
  },
  {
    id: "nav_assessments",
    category: "Navigation",
    label: "Go to Tasks, Exams & Practice",
    description: "Open assignments, exam timetable, topic quizzes, and assessment attempts.",
    defaultChord: "Alt+A",
    secondaryChord: "Mod+Shift+A",
    targetView: AppView.ASSESSMENTS,
  },
  {
    id: "nav_growth",
    category: "Navigation",
    label: "Go to Growth Intelligence",
    description: "Inspect evidence-based mastery, timeline, weekly/monthly reviews, and AI tutor.",
    defaultChord: "Alt+G",
    secondaryChord: "Mod+Shift+G",
    targetView: AppView.GROWTH,
  },
  {
    id: "nav_profile",
    category: "Navigation",
    label: "Go to Student Profile & Skills",
    description: "Manage academic identity, goals, skill evidence matrix, and portfolio exports.",
    defaultChord: "Alt+P",
    secondaryChord: "Mod+Shift+P",
    targetView: AppView.PROFILE,
  },
  {
    id: "nav_learning_os",
    category: "Navigation",
    label: "Go to LearningOS Studio",
    description: "Open remote lecture transcripts, SQLite FTS5 search, cited tutor, and concept graph.",
    defaultChord: "Alt+L",
    secondaryChord: "Mod+Shift+L",
    targetView: AppView.LEARNING_OS,
  },
  {
    id: "action_focus_session",
    category: "Study & Autonomous Actions",
    label: "Focus Session (Start / Pause)",
    description: "Immediately start or pause your live Pomodoro focus sprint from any screen.",
    defaultChord: "Mod+Shift+F",
    secondaryChord: "Alt+F",
  },
  {
    id: "action_new_note",
    category: "Study & Autonomous Actions",
    label: "New Note in Vault",
    description: "Create a fresh study note in Knowledge Vault and jump straight to the editor.",
    defaultChord: "Alt+N",
    secondaryChord: "Mod+Shift+E",
  },
  {
    id: "action_auto_research",
    category: "Study & Autonomous Actions",
    label: "Think, Fetch & Take Notes",
    description: "Autonomously search authoritative sources, take down Vault notes, and add flashcards.",
    defaultChord: "Mod+Shift+R",
    secondaryChord: "Alt+R",
  },
  {
    id: "action_command_palette",
    category: "Study & Autonomous Actions",
    label: "Open Command Palette",
    description: "Search courses, modules, tags, and instant study commands.",
    defaultChord: "Mod+K",
  },
  {
    id: "action_shortcut_help",
    category: "Study & Autonomous Actions",
    label: "Keyboard Shortcut Manager",
    description: "Inspect and customize global keyboard shortcuts.",
    defaultChord: "Mod+/",
    secondaryChord: "?",
  },
];

const RESERVED_EDITING_CHORDS = new Set([
  "Mod+A",
  "Mod+C",
  "Mod+V",
  "Mod+X",
  "Mod+Z",
  "Mod+Y",
  "Mod+Shift+Z",
]);

export function isMacPlatform(): boolean {
  if (typeof navigator === "undefined") return true;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || "");
}

export function isEditableElement(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as {
    tagName?: string;
    isContentEditable?: boolean;
    getAttribute?: (attr: string) => string | null;
  };
  const tag = (el.tagName || "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    return true;
  }
  if (el.isContentEditable) return true;
  if (typeof el.getAttribute === "function" && el.getAttribute("contenteditable") === "true") {
    return true;
  }
  return false;
}

function normalizeKeyToken(key: string, code?: string): string | null {
  if (!key) return null;
  const lower = key.toLowerCase();
  if (lower === "meta" || lower === "control" || lower === "alt" || lower === "shift") {
    return null;
  }

  // Handle Digit1..Digit9 reliably even when Option/Alt or Shift alters `e.key` (e.g. "¡" on macOS Option+1)
  if (code && /^Digit([1-9])$/.test(code)) {
    return code.replace("Digit", "");
  }
  if (code && /^Key([A-Z])$/.test(code) && key.length === 1) {
    return code.replace("Key", "").toUpperCase();
  }
  if (code === "Slash" && (key === "/" || key === "?" || key === "÷")) {
    return key === "?" ? "?" : "/";
  }
  if (code === "Comma") {
    return ",";
  }

  if (key === " ") return "Space";
  if (key.length === 1) {
    return key.toUpperCase();
  }
  return key;
}

export interface KeyEventLike {
  key: string;
  code?: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

/**
 * Converts a keyboard event into a canonical chord string such as:
 * "Mod+1", "Mod+Shift+F", "Alt+N", "Mod+/", or "?"
 */
export function eventToShortcutChord(e: KeyEventLike): string | null {
  const hasMod = Boolean(e.metaKey || e.ctrlKey);
  const hasAlt = Boolean(e.altKey);
  const hasShift = Boolean(e.shiftKey);

  // Special case: plain "?" (Shift + / with no Mod/Alt)
  if (!hasMod && !hasAlt && (e.key === "?" || (hasShift && e.code === "Slash"))) {
    return "?";
  }

  const token = normalizeKeyToken(e.key, e.code);
  if (!token) return null;

  // Require at least Mod or Alt for global chords (other than "?")
  if (!hasMod && !hasAlt) {
    return null;
  }

  const parts: string[] = [];
  if (hasMod) parts.push("Mod");
  if (hasAlt) parts.push("Alt");
  if (hasShift && token !== "?") parts.push("Shift");
  parts.push(token === "?" ? "/" : token);

  const chord = parts.join("+");
  if (RESERVED_EDITING_CHORDS.has(chord)) {
    return null;
  }
  return chord;
}

export function resolveEffectiveShortcuts(
  custom?: Partial<Record<ShortcutActionId, string>>
): Record<ShortcutActionId, string> {
  const map = {} as Record<ShortcutActionId, string>;
  for (const def of SHORTCUT_DEFINITIONS) {
    const candidate = custom?.[def.id]?.trim();
    map[def.id] = candidate && !RESERVED_EDITING_CHORDS.has(candidate) ? candidate : def.defaultChord;
  }
  return map;
}

/**
 * Matches an incoming keyboard event against the user's effective shortcut table.
 * Safely ignores plain single-character shortcuts when focused inside text inputs.
 */
export function matchShortcutAction(
  e: KeyEventLike,
  custom?: Partial<Record<ShortcutActionId, string>>,
  inEditable: boolean = false
): ShortcutActionId | null {
  const chord = eventToShortcutChord(e);
  if (!chord) return null;

  // Single-key "?" must never fire while typing in an input/textarea
  if (chord === "?" && inEditable) {
    return null;
  }

  // Alt+<letter/number> without Mod can type characters on some international keyboards while inside an editor;
  // allow Alt+N / Alt+F / Alt+R / Alt+1..8 globally, except if Alt+1..8 is pressed inside a textarea where Alt+letter might compose,
  // still allow explicit primary bindings and navigation chords.
  const effective = resolveEffectiveShortcuts(custom);

  // 1. Check primary bindings first
  for (const def of SHORTCUT_DEFINITIONS) {
    if (effective[def.id].toLowerCase() === chord.toLowerCase()) {
      return def.id;
    }
  }

  // 2. Check secondary convenience aliases for unmodified actions
  for (const def of SHORTCUT_DEFINITIONS) {
    const isUsingDefault = effective[def.id] === def.defaultChord;
    if (
      isUsingDefault &&
      def.secondaryChord &&
      def.secondaryChord.toLowerCase() === chord.toLowerCase()
    ) {
      if (inEditable && def.secondaryChord.startsWith("Alt+") && def.targetView) {
        continue;
      }
      return def.id;
    }
  }

  return null;
}

export function formatShortcutBadge(chord: string, mac: boolean = isMacPlatform()): string {
  if (!chord) return "";
  if (chord === "?") return "?";
  const parts = chord.split("+");
  if (mac) {
    return parts
      .map((p) => {
        if (p === "Mod") return "⌘";
        if (p === "Alt") return "⌥";
        if (p === "Shift") return "⇧";
        return p.toUpperCase();
      })
      .join("");
  }
  return parts
    .map((p) => {
      if (p === "Mod") return "Ctrl";
      return p;
    })
    .join("+");
}

export function getShortcutActionForView(view: AppView): ShortcutActionId {
  switch (view) {
    case AppView.DASHBOARD:
      return "nav_dashboard";
    case AppView.COURSES:
      return "nav_courses";
    case AppView.VAULT:
      return "nav_vault";
    case AppView.GROKOPEDIA:
      return "nav_grokopedia";
    case AppView.TERMINAL:
      return "nav_terminal";
    case AppView.POMODORO:
      return "nav_pomodoro";
    case AppView.FLASHCARDS:
      return "nav_flashcards";
    case AppView.SETTINGS:
      return "nav_settings";
    case AppView.SIMULATION:
      return "nav_simulation";
    case AppView.ASSESSMENTS:
      return "nav_assessments";
    case AppView.GROWTH:
      return "nav_growth";
    case AppView.PROFILE:
      return "nav_profile";
    case AppView.LEARNING_OS:
      return "nav_learning_os";
    default:
      return "nav_dashboard";
  }
}

export function getFormattedViewShortcut(
  view: AppView,
  custom?: Partial<Record<ShortcutActionId, string>>,
  mac: boolean = isMacPlatform()
): string {
  const effective = resolveEffectiveShortcuts(custom);
  const actionId = getShortcutActionForView(view);
  return formatShortcutBadge(effective[actionId], mac);
}
