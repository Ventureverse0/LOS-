import React, { useEffect, useState } from "react";
import { Keyboard, Play, RotateCcw, X } from "lucide-react";
import { useStudyOS } from "../context/StudyOSContext";
import {
  SHORTCUT_DEFINITIONS,
  eventToShortcutChord,
  formatShortcutBadge,
  resolveEffectiveShortcuts,
} from "../lib/shortcuts";
import type { ShortcutActionId } from "../types/studyOS";

export function ShortcutManagerModal() {
  const {
    state,
    isShortcutModalOpen,
    setShortcutModalOpen,
    setIsRecordingShortcut,
    updateShortcutBinding,
    resetShortcutBindings,
    setActiveView,
    setCommandPaletteOpen,
    triggerFocusSessionShortcut,
    createQuickVaultNote,
    runAutonomousNoteTaker,
    pushToast,
  } = useStudyOS();

  const [recordingId, setRecordingId] = useState<ShortcutActionId | null>(null);

  useEffect(() => {
    setIsRecordingShortcut(Boolean(recordingId));
    return () => setIsRecordingShortcut(false);
  }, [recordingId, setIsRecordingShortcut]);

  useEffect(() => {
    if (!isShortcutModalOpen) {
      setRecordingId(null);
      return;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (recordingId) {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          setRecordingId(null);
          return;
        }
        const chord = eventToShortcutChord(e);
        if (!chord) return;
        e.preventDefault();
        e.stopPropagation();
        updateShortcutBinding(recordingId, chord);
        setRecordingId(null);
        pushToast({
          title: "Shortcut Updated",
          subtitle: `Bound to ${formatShortcutBadge(chord)}`,
          variant: "success",
        });
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        setShortcutModalOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [isShortcutModalOpen, recordingId, updateShortcutBinding, setShortcutModalOpen, pushToast]);

  if (!isShortcutModalOpen) return null;

  const effective = resolveEffectiveShortcuts(state.settings.customShortcuts);
  const navDefs = SHORTCUT_DEFINITIONS.filter((d) => d.category === "Navigation");
  const actionDefs = SHORTCUT_DEFINITIONS.filter(
    (d) => d.category === "Study & Autonomous Actions"
  );

  const runActionDirectly = (id: ShortcutActionId) => {
    const def = SHORTCUT_DEFINITIONS.find((d) => d.id === id);
    setShortcutModalOpen(false);
    if (def?.targetView) {
      setActiveView(def.targetView);
      return;
    }
    if (id === "action_focus_session") {
      triggerFocusSessionShortcut();
    } else if (id === "action_new_note") {
      createQuickVaultNote();
    } else if (id === "action_auto_research") {
      void runAutonomousNoteTaker();
    } else if (id === "action_command_palette") {
      setCommandPaletteOpen(true);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[85] flex items-start justify-center pt-12 sm:pt-20 px-4 bg-black/75 backdrop-blur-xs"
      onClick={() => setShortcutModalOpen(false)}
    >
      <div
        className="w-full max-w-3xl rounded-lg bg-surface-low border border-outline-variant/60 shadow-2xl overflow-hidden flex flex-col max-h-[82vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 bg-surface-lowest border-b border-outline-variant/40">
          <div className="flex items-center gap-2.5 min-w-0">
            <Keyboard className="w-4 h-4 text-primary shrink-0" />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-on-surface">
                Global Keyboard Shortcut Manager
              </h2>
              <p className="font-mono text-[11px] text-outline truncate">
                Navigate views with Cmd/Ctrl + 1–8 or click any binding to customize ·{" "}
                <span className="text-primary tabular-nums">
                  {state.stats.shortcutTriggersCount || 0} shortcuts executed
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={resetShortcutBindings}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-high hover:bg-surface-bright border border-outline-variant/40 font-mono text-[11px] text-on-surface-variant hover:text-on-surface cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Defaults</span>
            </button>

            <button
              type="button"
              onClick={() => setShortcutModalOpen(false)}
              className="p-1.5 text-outline hover:text-on-surface cursor-pointer"
              aria-label="Close shortcut manager"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Column 1: View Navigation (Cmd/Ctrl + 1-8) */}
          <div className="flex flex-col gap-2.5">
            <div className="font-mono text-[11px] text-on-surface-variant font-semibold pb-1 border-b border-outline-variant/30">
              View Navigation (Cmd/Ctrl + 1–8)
            </div>
            {navDefs.map((def) => {
              const chord = effective[def.id];
              const isRecording = recordingId === def.id;
              return (
                <div
                  key={def.id}
                  className="flex items-center justify-between gap-2 p-2.5 rounded bg-surface-lowest border border-outline-variant/30 hover:border-outline-variant/60 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => runActionDirectly(def.id)}
                    className="min-w-0 flex-1 text-left group cursor-pointer"
                    title="Click to jump immediately"
                  >
                    <div className="text-xs font-medium text-on-surface group-hover:text-primary transition-colors truncate">
                      {def.label}
                    </div>
                    <div className="font-mono text-[10px] text-outline truncate">
                      {def.description}
                    </div>
                  </button>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {def.secondaryChord && chord === def.defaultChord && (
                      <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface-low border border-outline-variant/30 text-outline">
                        {formatShortcutBadge(def.secondaryChord)}
                      </kbd>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setRecordingId(isRecording ? null : def.id)
                      }
                      title="Click then press a new key combination (e.g. Cmd/Ctrl + key)"
                      className={`font-mono text-[11px] px-2.5 py-1 rounded border transition-colors cursor-pointer whitespace-nowrap ${
                        isRecording
                          ? "bg-primary-container text-on-primary-container border-primary font-bold"
                          : "bg-surface-high border-outline-variant/50 text-primary hover:border-primary/60"
                      }`}
                    >
                      {isRecording ? "Press keys..." : formatShortcutBadge(chord)}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Column 2: Study & Autonomous Actions */}
          <div className="flex flex-col gap-2.5">
            <div className="font-mono text-[11px] text-on-surface-variant font-semibold pb-1 border-b border-outline-variant/30">
              Instant Study &amp; Autonomous Actions
            </div>
            {actionDefs.map((def) => {
              const chord = effective[def.id];
              const isRecording = recordingId === def.id;
              return (
                <div
                  key={def.id}
                  className="flex items-center justify-between gap-2 p-2.5 rounded bg-surface-lowest border border-outline-variant/30 hover:border-outline-variant/60 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-on-surface truncate">
                        {def.label}
                      </span>
                      {def.id !== "action_shortcut_help" && (
                        <button
                          type="button"
                          onClick={() => runActionDirectly(def.id)}
                          className="text-outline hover:text-primary cursor-pointer shrink-0"
                          title={`Trigger ${def.label}`}
                        >
                          <Play className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <div className="font-mono text-[10px] text-outline leading-snug pt-0.5">
                      {def.description}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {def.secondaryChord && chord === def.defaultChord && (
                      <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface-low border border-outline-variant/30 text-outline">
                        {formatShortcutBadge(def.secondaryChord)}
                      </kbd>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setRecordingId(isRecording ? null : def.id)
                      }
                      title="Click then press a new key combination"
                      className={`font-mono text-[11px] px-2.5 py-1 rounded border transition-colors cursor-pointer whitespace-nowrap ${
                        isRecording
                          ? "bg-primary-container text-on-primary-container border-primary font-bold"
                          : "bg-surface-high border-outline-variant/50 text-secondary hover:border-secondary/60"
                      }`}
                    >
                      {isRecording ? "Press keys..." : formatShortcutBadge(chord)}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-2.5 bg-surface-lowest border-t border-outline-variant/30 font-mono text-[10px] text-outline">
          <span>
            Click any shortcut badge to record a custom key chord (saved locally per learner profile)
          </span>
          <span>ESC to close</span>
        </div>
      </div>
    </div>
  );
}
