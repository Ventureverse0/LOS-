import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bookmark,
  BrainCircuit,
  CheckCircle2,
  CheckSquare,
  ClipboardCheck,
  Code2,
  Columns2,
  Download,
  ExternalLink,
  Eye,
  FileCode2,
  FileText,
  Folder,
  FolderOpen,
  Gamepad2,
  GitBranch,
  Globe,
  HelpCircle,
  History,
  Layers,
  Link2,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  Play,
  Plus,
  Search,
  Sparkles,
  Square,
  Trash2,
  Upload,
  Video,
} from "lucide-react";
import { useStudyOS } from "../../context/StudyOSContext";
import { AppView, type ModuleStatus, type ResourceItem } from "../../types/studyOS";
import {
  countWords,
  formatSecondsToTimestamp,
  parseYouTubeUrl,
} from "../../lib/gamification";
import { computeTopicMastery } from "../../lib/growthIntelligence";
import { readUploadedNoteFiles } from "../../lib/storage";
import { MarkdownRenderer } from "../MarkdownRenderer";
import { runVaultAIAssist } from "../../services/aiService";

import { formatShortcutBadge, resolveEffectiveShortcuts } from "../../lib/shortcuts";

type EditorLayoutMode = "split" | "editor" | "preview";
type MediaTab = "video" | "highlights" | "resources";

export function KnowledgeVaultView() {
  const {
    state,
    selectedModuleId,
    setSelectedModuleId,
    setActiveView,
    createCourse,
    addModule,
    createQuickVaultNote,
    vaultFocusTitleTick,
    runAutonomousNoteTaker,
    autonomousAgentStatus,
    updateModuleStatus,
    updateModuleDetails,
    saveModuleNotes,
    restoreNoteRevision,
    addLearningObjective,
    toggleLearningObjective,
    removeLearningObjective,
    addUnresolvedQuestion,
    toggleUnresolvedQuestion,
    removeUnresolvedQuestion,
    saveModuleReflection,
    saveModuleTranscript,
    addModuleHighlight,
    removeModuleHighlight,
    promoteHighlightToFlashcard,
    promoteHighlightToQuizQuestion,
    addModuleResource,
    removeModuleResource,
    addModuleBookmark,
    removeModuleBookmark,
    addFlashcardsBatch,
    launchIntegrativeLab,
    localSaveStatus,
    retryLocalSave,
    pushToast,
  } = useStudyOS();

  const [showExplorer, setShowExplorer] = useState(true);
  const [showKnowledgeMap, setShowKnowledgeMap] = useState(false);
  const [vaultSearch, setVaultSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<EditorLayoutMode>("split");
  const [mediaTab, setMediaTab] = useState<MediaTab>("video");

  const activeModule = useMemo(() => {
    return (
      state.modules.find((m) => m.id === selectedModuleId) ||
      state.modules[0] ||
      null
    );
  }, [state.modules, selectedModuleId]);

  const activeCourse = useMemo(() => {
    if (!activeModule) return null;
    return state.courses.find((c) => c.id === activeModule.courseId) || null;
  }, [state.courses, activeModule]);

  // Local editor state with 500ms debounced auto-save
  const [draftNotes, setDraftNotes] = useState<string>(activeModule?.notesMarkdown || "");
  const [draftVideoUrl, setDraftVideoUrl] = useState<string>(activeModule?.videoLink || "");
  const [saveState, setSaveState] = useState<"saved" | "saving">("saved");
  const [videoStartSec, setVideoStartSec] = useState<number>(0);

  // Bookmark form
  const [bmTimeInput, setBmTimeInput] = useState("10:30");
  const [bmLabelInput, setBmLabelInput] = useState("");

  // Resource form
  const [resTitle, setResTitle] = useState("");
  const [resUrl, setResUrl] = useState("");
  const [resType, setResType] = useState<ResourceItem["type"]>("pdf");
  const [resDescription, setResDescription] = useState("");
  const [resTagsInput, setResTagsInput] = useState("");

  // Topic Study Ledger (Objectives, Unresolved Questions, Reflection, Transcript & Highlights)
  const [objectiveInput, setObjectiveInput] = useState("");
  const [unresolvedInput, setUnresolvedInput] = useState("");
  const [reflectionDraft, setReflectionDraft] = useState(activeModule?.reflectionNote || "");
  const [transcriptDraft, setTranscriptDraft] = useState(activeModule?.transcriptNotes || "");
  const [transcriptSearch, setTranscriptSearch] = useState("");
  const [hlAnchorInput, setHlAnchorInput] = useState("PDF p. 1");
  const [hlExcerptInput, setHlExcerptInput] = useState("");
  const [hlNoteInput, setHlNoteInput] = useState("");

  // AI Vault Assist & File Ingestion state
  const [aiBusyAction, setAiBusyAction] = useState<string | null>(null);
  const [showAskInput, setShowAskInput] = useState(false);
  const [askPrompt, setAskPrompt] = useState("");

  const debounceRef = useRef<number | null>(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  const effectiveShortcuts = useMemo(
    () => resolveEffectiveShortcuts(state.settings.customShortcuts),
    [state.settings.customShortcuts]
  );

  // Sync draft when switching modules
  useEffect(() => {
    if (activeModule) {
      setDraftNotes(activeModule.notesMarkdown);
      setDraftVideoUrl(activeModule.videoLink);
      setReflectionDraft(activeModule.reflectionNote || "");
      setTranscriptDraft(activeModule.transcriptNotes || "");
      setVideoStartSec(0);
      setSaveState("saved");
    }
  }, [activeModule?.id]);

  // Automatically sync editor buffer when Autonomous Agent finishes writing notes in the background
  useEffect(() => {
    if (activeModule && saveState === "saved" && activeModule.autoResearchedAt) {
      setDraftNotes(activeModule.notesMarkdown);
      if (activeModule.videoLink) {
        setDraftVideoUrl(activeModule.videoLink);
      }
    }
  }, [activeModule?.autoResearchedAt]);

  // Focus & select title input when user triggers New Note shortcut
  useEffect(() => {
    if (vaultFocusTitleTick > 0 && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [vaultFocusTitleTick]);

  const handleNotesChange = (value: string) => {
    setDraftNotes(value);
    setSaveState("saving");
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    if (!activeModule) return;
    const targetId = activeModule.id;
    debounceRef.current = window.setTimeout(() => {
      saveModuleNotes(targetId, value);
      setSaveState("saved");
    }, 500);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, []);

  const wordCount = useMemo(() => countWords(draftNotes), [draftNotes]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const m of state.modules) {
      for (const t of m.tags) set.add(t);
    }
    return Array.from(set).slice(0, 12);
  }, [state.modules]);

  const parsedVideo = useMemo(
    () => parseYouTubeUrl(draftVideoUrl, videoStartSec),
    [draftVideoUrl, videoStartSec]
  );

  const ensureTargetCourseId = (): string => {
    if (activeCourse?.id) return activeCourse.id;
    if (state.courses[0]?.id) return state.courses[0].id;
    const created = createCourse({
      code: "VLT-101",
      title: "Personal Knowledge Vault",
      category: "Self-Directed Notes",
      tags: ["vault", "personal-notes"],
    });
    return created.id;
  };

  const handleApplyVideoUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeModule) return;
    updateModuleDetails(activeModule.id, { videoLink: draftVideoUrl.trim() });
    setVideoStartSec(0);
    pushToast({
      title: "Updated Lecture Video Feed",
      subtitle: activeModule.title,
      variant: "success",
    });
  };

  const handleExportMarkdown = () => {
    if (!activeModule) return;
    const slug = activeModule.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const blob = new Blob([draftNotes], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug || "vault-notes"}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    pushToast({
      title: "Exported Markdown File",
      subtitle: `${slug}.md downloaded`,
      variant: "success",
    });
  };

  const handleInsertSnippet = (snippet: string) => {
    const next = `${draftNotes}${draftNotes.endsWith("\n") || !draftNotes ? "" : "\n\n"}${snippet}`;
    handleNotesChange(next);
  };

  const handleImportNoteFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || aiBusyAction) return;

    setAiBusyAction("ingest_file");
    try {
      const docs = await readUploadedNoteFiles(files);
      const doc = docs[0];
      if (!doc) return;

      let targetMod = activeModule;
      const baseTitle = doc.name.replace(/\.[^.]+$/, "");

      if (!targetMod) {
        const courseId = ensureTargetCourseId();
        targetMod = addModule({
          courseId,
          title: baseTitle || "Imported Study Notes",
          estimatedHours: 2,
          videoLink: "",
          tags: ["imported-notes"],
          sourceFileNames: [doc.name],
          notesMarkdown: `# ${baseTitle}\n\n_Importing ${doc.name}..._`,
        });
        setSelectedModuleId(targetMod.id);
      }

      if (doc.textContent !== undefined) {
        const formattedText = doc.name.toLowerCase().endsWith(".md")
          ? doc.textContent.trim()
          : `## Imported from ${doc.name}\n\n${doc.textContent.trim()}`;
        const updated =
          activeModule && draftNotes.trim().length > 0
            ? `${draftNotes}\n\n---\n\n${formattedText}`
            : formattedText;
        setDraftNotes(updated);
        saveModuleNotes(targetMod.id, updated);
        pushToast({
          title: `Imported ${doc.name} into Vault`,
          subtitle: `${countWords(formattedText)} words saved locally`,
          variant: "success",
        });
      } else if (doc.base64Data) {
        const res = await runVaultAIAssist({
          action: "ingest_file",
          notesMarkdown: draftNotes,
          moduleTitle: targetMod.title,
          uploadedDocument: doc,
          model: state.settings.selectedModel,
        });
        const synthesized = (res.markdown || "").trim();
        if (synthesized) {
          const updated =
            activeModule && draftNotes.trim().length > 0
              ? `${draftNotes}\n\n---\n\n## Extracted Notes: ${doc.name}\n\n${synthesized}`
              : synthesized;
          setDraftNotes(updated);
          saveModuleNotes(targetMod.id, updated);
          pushToast({
            title: `Converted ${doc.name} to Markdown`,
            subtitle: "Extracted structured notes into Knowledge Vault",
            variant: "success",
          });
        }
      }
    } catch (err: unknown) {
      pushToast({
        title: "Note Import Failed",
        subtitle: err instanceof Error ? err.message : "Could not import document.",
        variant: "error",
      });
    } finally {
      setAiBusyAction(null);
      if (importFileInputRef.current) importFileInputRef.current.value = "";
    }
  };

  const handleVaultAI = async (
    action: "summarize" | "flashcards" | "ask" | "extract_code"
  ) => {
    if (!activeModule || aiBusyAction) return;
    setAiBusyAction(action);
    try {
      const result = await runVaultAIAssist({
        action,
        notesMarkdown: draftNotes,
        moduleTitle: activeModule.title,
        question: askPrompt.trim() || undefined,
        model: state.settings.selectedModel,
      });

      if (action === "flashcards" && result.cards && result.cards.length > 0) {
        addFlashcardsBatch(
          result.cards.map((c) => ({
            courseId: activeModule.courseId,
            moduleId: activeModule.id,
            question: c.question,
            answer: c.answer,
          }))
        );
      } else if (result.markdown) {
        const heading =
          action === "summarize"
            ? "## AI Executive Summary"
            : action === "extract_code"
            ? "## Worked Example & Reference"
            : `## AI Deep Dive: ${askPrompt.trim() || "Key Concepts"}`;
        const updated = `${draftNotes}\n\n${heading}\n${result.markdown.trim()}`;
        setDraftNotes(updated);
        saveModuleNotes(activeModule.id, updated);
        setAskPrompt("");
        setShowAskInput(false);
        pushToast({
          title: "Appended AI Synthesis to Vault Notes",
          subtitle: activeModule.title,
          variant: "success",
        });
      }
    } catch (err: unknown) {
      pushToast({
        title: "Vault AI Request Failed",
        subtitle: err instanceof Error ? err.message : "Unable to reach server AI.",
        variant: "error",
      });
    } finally {
      setAiBusyAction(null);
    }
  };

  const handlePinBookmark = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeModule || !bmLabelInput.trim()) return;
    const parts = bmTimeInput.split(":").map((n) => parseInt(n.trim(), 10));
    let secs = 0;
    if (parts.length === 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
      secs = parts[0] * 60 + parts[1];
    } else if (parts.length === 1 && !Number.isNaN(parts[0])) {
      secs = parts[0];
    }
    addModuleBookmark(activeModule.id, {
      timestampSeconds: Math.max(0, secs),
      label: bmLabelInput.trim(),
    });
    setBmLabelInput("");
  };

  const handleAddResource = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeModule || !resTitle.trim() || !resUrl.trim()) return;
    const normalizedUrl = /^https?:\/\//i.test(resUrl.trim())
      ? resUrl.trim()
      : `https://${resUrl.trim()}`;
    const tags = resTagsInput
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    addModuleResource(activeModule.id, {
      title: resTitle.trim(),
      url: normalizedUrl,
      type: resType,
      description: resDescription.trim() || undefined,
      tags: tags.length > 0 ? tags : undefined,
      sourceInfo: `Added ${new Date().toISOString().slice(0, 10)}`,
    });
    setResTitle("");
    setResUrl("");
    setResDescription("");
    setResTagsInput("");
  };

  const handleNewVaultNote = () => {
    createQuickVaultNote();
  };

  const isModuleAutoThinking =
    Boolean(activeModule?.autoResearchStatus === "thinking") ||
    Boolean(
      autonomousAgentStatus.isBusy &&
        activeModule &&
        autonomousAgentStatus.activeModuleId === activeModule.id
    );

  if (!activeModule) {
    return (
      <div className="bg-surface-low border border-outline-variant/40 rounded-md p-10 text-center flex flex-col items-center gap-4">
        <FolderOpen className="w-8 h-8 text-primary/75" />
        <div className="max-w-md">
          <h2 className="text-base font-semibold text-on-surface">
            Your Knowledge Vault is Ready
          </h2>
          <p className="text-xs text-on-surface-variant pt-1 leading-relaxed">
            Create a blank Markdown study note, import an existing PDF/Markdown/note scan directly, or let AI build an entire multi-unit curriculum around your notes.
          </p>
        </div>

        <div className="flex items-center justify-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={handleNewVaultNote}
            className="px-4 py-2 rounded bg-surface-high hover:bg-surface-bright border border-outline-variant/50 font-mono text-xs text-on-surface font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5 text-primary" />
            <span>Create Blank Note</span>
          </button>

          <button
            type="button"
            disabled={aiBusyAction === "ingest_file"}
            onClick={() => importFileInputRef.current?.click()}
            className="px-4 py-2 rounded bg-surface-high hover:bg-surface-bright border border-outline-variant/50 font-mono text-xs text-on-surface font-semibold flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-40"
          >
            {aiBusyAction === "ingest_file" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
            ) : (
              <Upload className="w-3.5 h-3.5 text-secondary" />
            )}
            <span>Import File / PDF</span>
          </button>
          <input
            ref={importFileInputRef}
            type="file"
            accept=".pdf,.md,.markdown,.txt,.csv,.json,.tex,.py,.js,.ts,.tsx,.c,.cpp,.java,.rs,.go,.sql,image/png,image/jpeg,image/webp"
            onChange={(e) => void handleImportNoteFile(e)}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => setActiveView(AppView.GROKOPEDIA)}
            className="px-4 py-2 rounded bg-primary-container hover:bg-primary text-on-primary-container font-mono text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <BrainCircuit className="w-3.5 h-3.5" />
            <span>Build Curriculum from Notes</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* TOP SUB-BAR */}
      <div className="bg-surface-lowest border border-outline-variant/40 rounded-md px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => setShowExplorer(!showExplorer)}
            title="Toggle Vault File Tree"
            className="p-1.5 rounded bg-surface-low hover:bg-surface-high border border-outline-variant/40 text-on-surface-variant hover:text-primary cursor-pointer"
          >
            {showExplorer ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
          </button>

          <div className="flex items-center gap-1.5 font-mono text-xs min-w-0">
            <span className="text-primary font-bold shrink-0">{activeCourse?.code || "VAULT"}</span>
            <span className="text-outline">/</span>
            <span className="text-on-surface font-medium truncate">{activeModule.title}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={activeModule.status}
            onChange={(e) =>
              updateModuleStatus(activeModule.id, e.target.value as ModuleStatus)
            }
            className={`bg-surface-low border border-outline-variant/40 rounded px-2.5 py-1 font-mono text-xs focus:outline-none cursor-pointer ${
              activeModule.status === "Mastered"
                ? "text-tertiary font-semibold"
                : activeModule.status === "In Progress"
                ? "text-primary font-semibold"
                : "text-secondary"
            }`}
          >
            <option value="To Do">Status: To Do</option>
            <option value="In Progress">Status: In Progress</option>
            <option value="Mastered">Status: Mastered (+100 XP)</option>
          </select>

          <button
            type="button"
            disabled={Boolean(aiBusyAction)}
            onClick={() => importFileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-high hover:bg-surface-bright font-mono text-xs text-on-surface transition-colors cursor-pointer whitespace-nowrap disabled:opacity-40"
            title="Import .md, .txt, .pdf, code, or image scan into this note"
          >
            {aiBusyAction === "ingest_file" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
            ) : (
              <Upload className="w-3.5 h-3.5 text-secondary" />
            )}
            <span>Import File / PDF</span>
          </button>
          <input
            ref={importFileInputRef}
            type="file"
            accept=".pdf,.md,.markdown,.txt,.csv,.json,.tex,.py,.js,.ts,.tsx,.c,.cpp,.java,.rs,.go,.sql,image/png,image/jpeg,image/webp"
            onChange={(e) => void handleImportNoteFile(e)}
            className="hidden"
          />

          <button
            type="button"
            disabled={isModuleAutoThinking || Boolean(aiBusyAction)}
            onClick={() => void runAutonomousNoteTaker(activeModule.id)}
            title={`Autonomous Think, Fetch & Take Notes (${formatShortcutBadge(
              effectiveShortcuts.action_auto_research
            )})`}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-high hover:bg-primary hover:text-on-primary border border-primary/35 font-mono text-xs text-primary transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
          >
            {isModuleAutoThinking ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Thinking &amp; Taking Notes...</span>
              </>
            ) : (
              <>
                <Globe className="w-3.5 h-3.5" />
                <span>Auto-Fetch &amp; Take Notes</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => setShowKnowledgeMap(!showKnowledgeMap)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded border font-mono text-xs transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              showKnowledgeMap
                ? "bg-primary-container text-on-primary-container border-primary/50 font-semibold"
                : "bg-surface-high hover:bg-surface-bright border-outline-variant/40 text-on-surface"
            }`}
            title="Inspect connected Personal Knowledge & Concept Map across courses, topics, skills, and mastery"
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span>Knowledge Map</span>
          </button>

          <button
            type="button"
            onClick={handleExportMarkdown}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-high hover:bg-surface-bright font-mono text-xs text-on-surface transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5 text-primary" />
            <span>Export .MD</span>
          </button>

          <button
            type="button"
            onClick={handleNewVaultNote}
            title={`New Note (${formatShortcutBadge(effectiveShortcuts.action_new_note)})`}
            className="flex items-center gap-1.5 px-3 py-1 rounded bg-primary-container hover:bg-primary text-on-primary-container font-mono text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Note</span>
          </button>
        </div>
      </div>

      {/* INTERACTIVE PERSONAL KNOWLEDGE & CONCEPT MAP */}
      {showKnowledgeMap && (
        <section className="bg-surface-low border border-outline-variant/40 rounded-md p-4 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-outline-variant/25">
            <div>
              <h2 className="text-sm font-semibold text-on-surface">
                Personal Knowledge &amp; Concept Graph
              </h2>
              <p className="text-xs text-on-surface-variant">
                Connected view of courses, syllabus topics, extracted concepts, anchored highlights, linked skills, and verified mastery evidence.
              </p>
            </div>
            <span className="font-mono text-xs text-outline tabular-nums">
              {state.courses.filter((c) => !c.archived).length} courses ·{" "}
              {state.modules.filter((m) => !m.archived).length} active topics
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
            {state.courses
              .filter((c) => !c.archived)
              .map((course) => {
                const cMods = state.modules.filter(
                  (m) => !m.archived && m.courseId === course.id
                );
                const linkedSkills = state.academicProfile.skills.filter((s) =>
                  s.linkedCourseIds.includes(course.id)
                );
                return (
                  <div
                    key={course.id}
                    className="bg-surface-lowest border border-outline-variant/35 rounded p-3.5 flex flex-col gap-2.5"
                  >
                    <div className="flex items-baseline justify-between gap-2 border-b border-outline-variant/20 pb-2">
                      <div className="min-w-0">
                        <span className="font-mono text-xs font-bold text-primary">
                          {course.code}
                        </span>
                        <h3 className="text-xs font-semibold text-on-surface truncate">
                          {course.title}
                        </h3>
                      </div>
                      <span className="font-mono text-[11px] text-outline tabular-nums shrink-0">
                        {cMods.length} topics
                      </span>
                    </div>

                    {linkedSkills.length > 0 && (
                      <div className="text-[11px] text-on-surface-variant font-mono truncate">
                        Skills: {linkedSkills.map((s) => s.name).join(" · ")}
                      </div>
                    )}

                    <div className="divide-y divide-outline-variant/20 max-h-52 overflow-y-auto pr-1">
                      {cMods.map((mod) => {
                        const mastery = computeTopicMastery(mod.id, state);
                        const cardCount = state.flashcards.filter(
                          (f) => f.moduleId === mod.id
                        ).length;
                        const hlCount = (mod.highlights || []).length;
                        const concepts = (mod.keyConcepts || mod.tags || []).slice(0, 3);
                        const isSelected = mod.id === activeModule.id;
                        return (
                          <button
                            key={mod.id}
                            type="button"
                            onClick={() => setSelectedModuleId(mod.id)}
                            className={`w-full text-left py-2 px-2 rounded transition-colors cursor-pointer block ${
                              isSelected
                                ? "bg-surface-high"
                                : "hover:bg-surface-low"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className={`text-xs font-medium truncate ${
                                  isSelected ? "text-primary font-semibold" : "text-on-surface"
                                }`}
                              >
                                {mod.unitGroup ? `${mod.unitGroup} / ` : ""}
                                {mod.title}
                              </span>
                              <span
                                className={`font-mono text-[10px] tabular-nums shrink-0 ${
                                  mastery.level === "verified_mastery"
                                    ? "text-tertiary"
                                    : mastery.evidenceScore !== null
                                    ? "text-secondary"
                                    : "text-outline"
                                }`}
                              >
                                {mastery.evidenceScore !== null
                                  ? `${mastery.evidenceScore}%`
                                  : "Unverified"}
                              </span>
                            </div>
                            <div className="text-[11px] text-outline font-mono tabular-nums pt-0.5 truncate">
                              {cardCount} cards · {hlCount} highlights
                              {concepts.length > 0 ? ` · ${concepts.join(" · ")}` : ""}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {/* MAIN WORKSPACE GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* OPTIONAL COL 1: VAULT EXPLORER TREE (3 Cols on XL) */}
        {showExplorer && (
          <aside className="lg:col-span-12 xl:col-span-3 bg-surface-low border border-outline-variant/35 rounded-md p-3.5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-wider text-on-surface-variant font-semibold">
                Vault Explorer
              </span>
              <span className="font-mono text-[10px] text-outline tabular-nums">
                {state.modules.length} files
              </span>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-outline absolute left-2.5 top-2" />
              <input
                type="text"
                value={vaultSearch}
                onChange={(e) => setVaultSearch(e.target.value)}
                placeholder="Search vault / notes..."
                className="w-full bg-surface-lowest border border-outline-variant/40 focus:border-primary rounded pl-8 pr-2.5 py-1.5 font-mono text-xs text-on-surface placeholder:text-outline focus:outline-none"
              />
            </div>

            {/* Course & Module Tree */}
            <div className="flex flex-col gap-2 max-h-[380px] overflow-y-auto pr-1">
              {state.courses.map((course) => {
                const cMods = state.modules.filter((m) => {
                  if (m.courseId !== course.id) return false;
                  if (activeTag && !m.tags.includes(activeTag)) return false;
                  if (vaultSearch.trim()) {
                    const q = vaultSearch.trim().toLowerCase();
                    const inResources = m.resources.some(
                      (r) =>
                        r.title.toLowerCase().includes(q) ||
                        Boolean(r.description && r.description.toLowerCase().includes(q)) ||
                        Boolean(r.tags && r.tags.some((t) => t.toLowerCase().includes(q)))
                    );
                    const inQuestions = (m.unresolvedQuestions || []).some((uq) =>
                      uq.question.toLowerCase().includes(q)
                    );
                    const inHighlights = (m.highlights || []).some(
                      (hl) =>
                        hl.excerpt.toLowerCase().includes(q) ||
                        hl.anchorLabel.toLowerCase().includes(q) ||
                        Boolean(hl.note && hl.note.toLowerCase().includes(q))
                    );
                    const inTranscript = Boolean(
                      m.transcriptNotes && m.transcriptNotes.toLowerCase().includes(q)
                    );
                    return (
                      m.title.toLowerCase().includes(q) ||
                      m.notesMarkdown.toLowerCase().includes(q) ||
                      m.tags.some((t) => t.toLowerCase().includes(q)) ||
                      inResources ||
                      inQuestions ||
                      inHighlights ||
                      inTranscript
                    );
                  }
                  return true;
                });

                if (cMods.length === 0) return null;
                const hasSelected = cMods.some((m) => m.id === activeModule.id);

                return (
                  <div key={course.id} className="flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 px-1.5 py-1 font-mono text-xs text-on-surface font-medium">
                      {hasSelected ? (
                        <FolderOpen className="w-3.5 h-3.5 text-secondary shrink-0" />
                      ) : (
                        <Folder className="w-3.5 h-3.5 text-outline shrink-0" />
                      )}
                      <span className="truncate">
                        {course.code} · {course.title}
                      </span>
                    </div>

                    <div className="pl-3 ml-2 border-l border-outline-variant/30 flex flex-col gap-0.5">
                      {cMods.map((mod) => {
                        const isSelected = mod.id === activeModule.id;
                        return (
                          <button
                            key={mod.id}
                            type="button"
                            onClick={() => setSelectedModuleId(mod.id)}
                            className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded text-left text-xs transition-colors cursor-pointer ${
                              isSelected
                                ? "bg-surface-high text-primary font-semibold border border-primary/30"
                                : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                            }`}
                          >
                            <span className="flex items-center gap-1.5 min-w-0">
                              <FileText className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{mod.title}</span>
                            </span>
                            {mod.status === "Mastered" && (
                              <CheckCircle2 className="w-3 h-3 text-tertiary shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Semantic Tag Filter */}
            {allTags.length > 0 && (
              <div className="pt-2 border-t border-outline-variant/30 flex flex-col gap-1.5">
                <div className="flex items-center justify-between font-mono text-[10px] text-outline uppercase">
                  <span>Note Tags</span>
                  {activeTag && (
                    <button
                      type="button"
                      onClick={() => setActiveTag(null)}
                      className="text-primary hover:underline cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {allTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                      className={`px-2 py-0.5 rounded font-mono text-[10px] transition-colors cursor-pointer ${
                        activeTag === tag
                          ? "bg-primary-container text-on-primary-container font-semibold"
                          : "bg-surface-container text-on-surface-variant hover:text-on-surface"
                      }`}
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </aside>
        )}

        {/* LEFT PANE: SPLIT-VIEW MARKDOWN NOTES EDITOR */}
        <section
          className={`${
            showExplorer ? "lg:col-span-7 xl:col-span-5" : "lg:col-span-7"
          } bg-surface-low border border-outline-variant/35 rounded-md p-4 flex flex-col gap-3`}
        >
          {/* Note Metadata & Mode Bar */}
          <div className="bg-surface-lowest border border-outline-variant/30 p-3 rounded flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 font-mono text-[11px] flex-wrap">
                {localSaveStatus.status === "error" ? (
                  <button
                    type="button"
                    onClick={retryLocalSave}
                    className="inline-flex items-center gap-1 text-error font-semibold hover:underline cursor-pointer"
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Save Failed · Retry</span>
                  </button>
                ) : (
                  <span className={saveState === "saving" ? "text-secondary" : "text-tertiary"}>
                    {saveState === "saving" ? "Auto-saving..." : "Saved to Local DB"}
                  </span>
                )}
                <span className="text-outline">·</span>
                <span className="text-on-surface tabular-nums">{wordCount} words</span>
                <span className="text-outline">·</span>
                <span className="text-outline tabular-nums">
                  {computeTopicMastery(activeModule.id, state).label}
                </span>
                {(activeModule.noteRevisions || []).length > 0 && (
                  <>
                    <span className="text-outline">·</span>
                    <span className="inline-flex items-center gap-1 text-primary">
                      <History className="w-3 h-3" />
                      <select
                        value=""
                        onChange={(e) => {
                          if (!e.target.value) return;
                          restoreNoteRevision(activeModule.id, e.target.value);
                          const rev = (activeModule.noteRevisions || []).find(
                            (r) => r.id === e.target.value
                          );
                          if (rev) setDraftNotes(rev.markdownSnapshot);
                        }}
                        className="bg-transparent text-primary font-mono text-[11px] focus:outline-none cursor-pointer"
                      >
                        <option value="">
                          Revisions ({(activeModule.noteRevisions || []).length})
                        </option>
                        {(activeModule.noteRevisions || []).map((rev) => (
                          <option key={rev.id} value={rev.id} className="bg-surface-low text-on-surface">
                            Restore {new Date(rev.savedAt).toLocaleString()} ({rev.wordCount}w)
                          </option>
                        ))}
                      </select>
                    </span>
                  </>
                )}
              </div>

              {/* Editor Mode Switcher */}
              <div className="flex items-center gap-1 bg-surface-low p-0.5 rounded border border-outline-variant/30">
                {(
                  [
                    { id: "split", label: "Split", icon: Columns2 },
                    { id: "editor", label: "Write", icon: PenLine },
                    { id: "preview", label: "Read", icon: Eye },
                  ] as const
                ).map((m) => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setEditorMode(m.id)}
                      className={`flex items-center gap-1 px-2 py-1 rounded font-mono text-[10px] cursor-pointer ${
                        editorMode === m.id
                          ? "bg-primary-container text-on-primary-container font-semibold"
                          : "text-on-surface-variant hover:text-on-surface"
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      <span>{m.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <input
              ref={titleInputRef}
              type="text"
              value={activeModule.title}
              onChange={(e) => updateModuleDetails(activeModule.id, { title: e.target.value })}
              placeholder="Enter study topic (Study OS will think, fetch sources & take notes automatically)..."
              className="bg-transparent text-base sm:text-lg font-semibold text-on-surface focus:outline-none focus:text-primary"
            />
            {(isModuleAutoThinking || activeModule.autoThinkingSummary) && (
              <div className="font-mono text-[11px] text-outline flex items-center gap-2 pt-0.5">
                {isModuleAutoThinking ? (
                  <>
                    <Loader2 className="w-3 h-3 text-primary animate-spin shrink-0" />
                    <span className="text-primary">
                      Autonomous agent is reasoning, searching authoritative sources &amp; taking down structured notes...
                    </span>
                  </>
                ) : (
                  <span className="truncate">
                    Auto-Synced · {activeModule.autoThinkingSummary}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Formatting & AI Assist Toolbar */}
          <div className="flex items-center justify-between gap-2 flex-wrap bg-surface-lowest border border-outline-variant/30 p-1.5 rounded">
            <div className="flex items-center gap-1 flex-wrap">
              <button
                type="button"
                onClick={() => handleInsertSnippet("## Section Heading\n")}
                className="px-2 py-1 rounded bg-surface-high hover:bg-surface-bright font-mono text-[10px] text-on-surface cursor-pointer"
              >
                H2
              </button>
              <button
                type="button"
                onClick={() =>
                  handleInsertSnippet("```text\n// Worked example or snippet\n\n```")
                }
                className="px-2 py-1 rounded bg-surface-high hover:bg-surface-bright font-mono text-[10px] text-on-surface flex items-center gap-1 cursor-pointer"
              >
                <Code2 className="w-3 h-3 text-primary" />
                <span>Code</span>
              </button>
              <button
                type="button"
                onClick={() => handleInsertSnippet("$$E = \\sum_{i=1}^{n} p_i x_i$$")}
                className="px-2 py-1 rounded bg-surface-high hover:bg-surface-bright font-mono text-[10px] text-on-surface cursor-pointer"
              >
                Math $$
              </button>
            </div>

            {/* AI Vault Action Triggers */}
            <div className="flex items-center gap-1 flex-wrap">
              <button
                type="button"
                disabled={Boolean(aiBusyAction)}
                onClick={() => handleVaultAI("summarize")}
                className="flex items-center gap-1 px-2 py-1 rounded bg-surface-high hover:bg-primary hover:text-on-primary text-on-surface font-mono text-[10px] transition-colors cursor-pointer whitespace-nowrap disabled:opacity-40"
              >
                {aiBusyAction === "summarize" ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3 text-primary" />
                )}
                <span>Summarize</span>
              </button>

              <button
                type="button"
                disabled={Boolean(aiBusyAction)}
                onClick={() => handleVaultAI("flashcards")}
                className="flex items-center gap-1 px-2 py-1 rounded bg-surface-high hover:bg-secondary hover:text-on-secondary text-on-surface font-mono text-[10px] transition-colors cursor-pointer whitespace-nowrap disabled:opacity-40"
              >
                {aiBusyAction === "flashcards" ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Layers className="w-3 h-3 text-secondary" />
                )}
                <span>Gen Cards</span>
              </button>

              <button
                type="button"
                disabled={Boolean(aiBusyAction)}
                onClick={() => handleVaultAI("extract_code")}
                className="flex items-center gap-1 px-2 py-1 rounded bg-surface-high hover:bg-tertiary hover:text-on-tertiary text-on-surface font-mono text-[10px] transition-colors cursor-pointer whitespace-nowrap disabled:opacity-40"
              >
                {aiBusyAction === "extract_code" ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <FileCode2 className="w-3 h-3 text-tertiary" />
                )}
                <span>Worked Example</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  launchIntegrativeLab({
                    courseId: activeModule.courseId,
                    moduleId: activeModule.id,
                    customTopic: activeModule.title,
                  })
                }
                className="flex items-center gap-1 px-2 py-1 rounded bg-surface-high hover:bg-primary hover:text-on-primary text-primary font-mono text-[10px] font-semibold transition-colors cursor-pointer whitespace-nowrap"
                title="Open interactive 3D RK4 Physics & Math simulation calibrated to this note"
              >
                <Gamepad2 className="w-3 h-3 shrink-0" />
                <span>3D Physics Lab</span>
              </button>

              <button
                type="button"
                onClick={() => setShowAskInput(!showAskInput)}
                className="flex items-center gap-1 px-2 py-1 rounded bg-primary-container/20 hover:bg-primary-container text-primary hover:text-on-primary-container font-mono text-[10px] font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                <BrainCircuit className="w-3 h-3" />
                <span>Ask Tutor</span>
              </button>
            </div>
          </div>

          {showAskInput && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleVaultAI("ask");
              }}
              className="flex items-center gap-2 bg-surface-lowest p-2 rounded border border-primary/40"
            >
              <input
                type="text"
                value={askPrompt}
                onChange={(e) => setAskPrompt(e.target.value)}
                placeholder="Ask AI tutor to clarify a concept, formula, or practice problem and append to notes..."
                className="flex-1 bg-transparent font-mono text-xs text-on-surface placeholder:text-outline focus:outline-none"
              />
              <button
                type="submit"
                disabled={Boolean(aiBusyAction)}
                className="px-3 py-1 rounded bg-primary-container text-on-primary-container font-mono text-xs font-bold cursor-pointer whitespace-nowrap"
              >
                {aiBusyAction === "ask" ? "Synthesizing..." : "Append"}
              </button>
            </form>
          )}

          {/* Editor / Preview Canvas */}
          <div
            className={`grid gap-3 ${
              editorMode === "split" ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"
            }`}
          >
            {(editorMode === "split" || editorMode === "editor") && (
              <textarea
                value={draftNotes}
                onChange={(e) => handleNotesChange(e.target.value)}
                rows={18}
                placeholder="Write Markdown study notes, import a PDF/file, or ask AI Tutor..."
                className="w-full min-h-[420px] bg-surface-lowest border border-outline-variant/40 focus:border-primary rounded p-3.5 font-mono text-[12.5px] leading-relaxed text-on-surface placeholder:text-outline focus:outline-none resize-y"
              />
            )}

            {(editorMode === "split" || editorMode === "preview") && (
              <div className="min-h-[420px] max-h-[620px] overflow-y-auto bg-surface-lowest border border-outline-variant/35 rounded p-4">
                <MarkdownRenderer markdown={draftNotes} />
              </div>
            )}
          </div>

          {/* TOPIC STUDY LEDGER: LEARNING OBJECTIVES, UNRESOLVED QUESTIONS & PERSONAL REFLECTION */}
          <div className="bg-surface-lowest border border-outline-variant/35 rounded p-3.5 flex flex-col gap-3.5 mt-1">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-outline-variant/25">
              <span className="font-mono text-xs font-semibold text-on-surface">
                Topic Study Ledger · Objectives, Unresolved Questions &amp; Reflection
              </span>
              <button
                type="button"
                onClick={() => setActiveView(AppView.ASSESSMENTS)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-primary-container/20 hover:bg-primary-container text-primary hover:text-on-primary-container font-mono text-[11px] font-semibold cursor-pointer whitespace-nowrap"
              >
                <ClipboardCheck className="w-3.5 h-3.5" />
                <span>Take Topic Quiz</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {/* Learning Objectives */}
              <div className="flex flex-col gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-primary">
                  Learning Objectives ({(activeModule.learningObjectives || []).length})
                </span>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!objectiveInput.trim()) return;
                    addLearningObjective(activeModule.id, objectiveInput.trim());
                    setObjectiveInput("");
                  }}
                  className="flex items-center gap-1.5"
                >
                  <input
                    type="text"
                    value={objectiveInput}
                    onChange={(e) => setObjectiveInput(e.target.value)}
                    placeholder="Add measurable learning objective..."
                    className="flex-1 bg-surface-low border border-outline-variant/40 rounded px-2.5 py-1 text-xs text-on-surface focus:outline-none focus:border-primary"
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1 rounded bg-surface-high hover:bg-primary hover:text-on-primary font-mono text-[11px] text-on-surface cursor-pointer whitespace-nowrap"
                  >
                    Add
                  </button>
                </form>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {(activeModule.learningObjectives || []).map((obj) => (
                    <div
                      key={obj.id}
                      className="flex items-center justify-between gap-2 text-xs bg-surface-low px-2.5 py-1.5 rounded"
                    >
                      <button
                        type="button"
                        onClick={() => toggleLearningObjective(activeModule.id, obj.id)}
                        className="flex items-center gap-2 text-left min-w-0 cursor-pointer"
                      >
                        {obj.completed ? (
                          <CheckSquare className="w-3.5 h-3.5 text-tertiary shrink-0" />
                        ) : (
                          <Square className="w-3.5 h-3.5 text-outline shrink-0" />
                        )}
                        <span
                          className={`truncate ${
                            obj.completed ? "line-through text-outline" : "text-on-surface"
                          }`}
                        >
                          {obj.text}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeLearningObjective(activeModule.id, obj.id)}
                        className="text-outline hover:text-error cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Unresolved Questions */}
              <div className="flex flex-col gap-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-secondary flex items-center gap-1">
                  <HelpCircle className="w-3 h-3" />
                  <span>
                    Unresolved Questions (
                    {(activeModule.unresolvedQuestions || []).filter((q) => !q.resolved).length} open)
                  </span>
                </span>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!unresolvedInput.trim()) return;
                    addUnresolvedQuestion(activeModule.id, unresolvedInput.trim());
                    setUnresolvedInput("");
                  }}
                  className="flex items-center gap-1.5"
                >
                  <input
                    type="text"
                    value={unresolvedInput}
                    onChange={(e) => setUnresolvedInput(e.target.value)}
                    placeholder="Log an open question or edge case..."
                    className="flex-1 bg-surface-low border border-outline-variant/40 rounded px-2.5 py-1 text-xs text-on-surface focus:outline-none focus:border-primary"
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1 rounded bg-surface-high hover:bg-secondary hover:text-on-secondary font-mono text-[11px] text-on-surface cursor-pointer whitespace-nowrap"
                  >
                    Pin
                  </button>
                </form>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {(activeModule.unresolvedQuestions || []).map((uq) => (
                    <div
                      key={uq.id}
                      className="flex items-center justify-between gap-2 text-xs bg-surface-low px-2.5 py-1.5 rounded"
                    >
                      <button
                        type="button"
                        onClick={() => toggleUnresolvedQuestion(activeModule.id, uq.id)}
                        className="flex items-center gap-2 text-left min-w-0 cursor-pointer"
                      >
                        {uq.resolved ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-tertiary shrink-0" />
                        ) : (
                          <HelpCircle className="w-3.5 h-3.5 text-secondary shrink-0" />
                        )}
                        <span
                          className={`truncate ${
                            uq.resolved ? "line-through text-outline" : "text-on-surface"
                          }`}
                        >
                          {uq.question}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeUnresolvedQuestion(activeModule.id, uq.id)}
                        className="text-outline hover:text-error cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Personal Reflection */}
            <div className="flex flex-col gap-1.5 pt-2 border-t border-outline-variant/20">
              <div className="flex items-center justify-between font-mono text-[10px]">
                <span className="uppercase tracking-wider text-outline">
                  Personal Reflection &amp; Synthesis Note
                </span>
                <button
                  type="button"
                  onClick={() => saveModuleReflection(activeModule.id, reflectionDraft)}
                  className="text-primary hover:underline cursor-pointer"
                >
                  Save Reflection
                </button>
              </div>
              <textarea
                rows={2}
                value={reflectionDraft}
                onChange={(e) => setReflectionDraft(e.target.value)}
                onBlur={() => saveModuleReflection(activeModule.id, reflectionDraft)}
                placeholder="Summarize what clicked in your own words or note misconceptions after practice..."
                className="w-full bg-surface-low border border-outline-variant/40 rounded px-2.5 py-1.5 text-xs text-on-surface placeholder:text-outline focus:outline-none focus:border-primary resize-y"
              />
            </div>
          </div>
        </section>

        {/* RIGHT PANE: EMBEDDED YOUTUBE VIDEO & RESOURCE LOCKER */}
        <section
          className={`${
            showExplorer ? "lg:col-span-5 xl:col-span-4" : "lg:col-span-5"
          } bg-surface-low border border-outline-variant/35 rounded-md p-4 flex flex-col gap-3.5`}
        >
          {/* Media Hub Segmented Tabs */}
          <div className="flex items-center gap-1 bg-surface-lowest p-1 rounded border border-outline-variant/30">
            <button
              type="button"
              onClick={() => setMediaTab("video")}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded font-mono text-[11px] transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                mediaTab === "video"
                  ? "bg-primary-container text-on-primary-container font-semibold"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              <span>Lecture</span>
            </button>

            <button
              type="button"
              onClick={() => setMediaTab("highlights")}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded font-mono text-[11px] tabular-nums transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                mediaTab === "highlights"
                  ? "bg-primary-container text-on-primary-container font-semibold"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              <Bookmark className="w-3.5 h-3.5" />
              <span>Highlights ({(activeModule.highlights || []).length})</span>
            </button>

            <button
              type="button"
              onClick={() => setMediaTab("resources")}
              className={`flex-1 flex items-center justify-center gap-1 py-1.5 px-2 rounded font-mono text-[11px] tabular-nums transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                mediaTab === "resources"
                  ? "bg-primary-container text-on-primary-container font-semibold"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>Resources ({activeModule.resources.length})</span>
            </button>
          </div>

          {mediaTab === "video" ? (
            <div className="flex flex-col gap-3">
              {/* YouTube URL Parser Input */}
              <form onSubmit={handleApplyVideoUrl} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={draftVideoUrl}
                  onChange={(e) => setDraftVideoUrl(e.target.value)}
                  placeholder="Paste YouTube lecture URL (watch?v=... or youtu.be/...)"
                  className="flex-1 bg-surface-lowest border border-outline-variant/40 focus:border-primary rounded px-2.5 py-1.5 font-mono text-xs text-on-surface placeholder:text-outline focus:outline-none"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded bg-surface-high hover:bg-primary hover:text-on-primary font-mono text-xs text-on-surface transition-colors cursor-pointer whitespace-nowrap"
                >
                  Load
                </button>
              </form>

              {/* Native Embedded YouTube Iframe */}
              <div className="w-full aspect-video rounded-md overflow-hidden bg-surface-lowest border border-outline-variant/40 relative">
                {parsedVideo.isYouTube && parsedVideo.embedUrl ? (
                  <iframe
                    key={parsedVideo.embedUrl}
                    src={parsedVideo.embedUrl}
                    title={activeModule.title}
                    className="w-full h-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center gap-2">
                    <Video className="w-8 h-8 text-primary/70" />
                    <p className="text-xs text-on-surface-variant">
                      Paste any YouTube lecture URL above to watch alongside your notes.
                    </p>
                    {activeModule.searchQueryForVideo && (
                      <a
                        href={`https://www.youtube.com/results?search_query=${encodeURIComponent(
                          activeModule.searchQueryForVideo
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 px-3 py-1.5 rounded bg-primary-container text-on-primary-container font-mono text-xs font-semibold flex items-center gap-1.5"
                      >
                        <span>Find Lecture on YouTube</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                )}
              </div>

              {activeModule.searchQueryForVideo && (
                <div className="flex items-center justify-between bg-surface-lowest px-3 py-2 rounded border border-outline-variant/30 font-mono text-[11px]">
                  <span className="text-outline truncate">
                    Recommended Search:{" "}
                    <span className="text-on-surface">{activeModule.searchQueryForVideo}</span>
                  </span>
                  <a
                    href={`https://www.youtube.com/results?search_query=${encodeURIComponent(
                      activeModule.searchQueryForVideo
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline flex items-center gap-1 shrink-0 ml-2"
                  >
                    <span>YouTube</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              {/* Indexed Chapters / Timestamp Bookmarks */}
              <div className="bg-surface-lowest border border-outline-variant/35 rounded p-3 flex flex-col gap-2.5">
                <div className="flex items-center justify-between font-mono text-[11px]">
                  <span className="uppercase tracking-wider text-on-surface-variant flex items-center gap-1.5">
                    <Bookmark className="w-3.5 h-3.5 text-secondary" />
                    Timestamped Chapters
                  </span>
                  <span className="text-outline">{activeModule.bookmarks.length} pinned</span>
                </div>

                <form onSubmit={handlePinBookmark} className="grid grid-cols-12 gap-1.5">
                  <input
                    type="text"
                    value={bmTimeInput}
                    onChange={(e) => setBmTimeInput(e.target.value)}
                    placeholder="14:20"
                    className="col-span-3 bg-surface-low border border-outline-variant/40 rounded px-2 py-1 font-mono text-xs text-on-surface tabular-nums focus:outline-none focus:border-primary"
                  />
                  <input
                    type="text"
                    value={bmLabelInput}
                    onChange={(e) => setBmLabelInput(e.target.value)}
                    placeholder="Pin lecture timestamp..."
                    className="col-span-7 bg-surface-low border border-outline-variant/40 rounded px-2 py-1 text-xs text-on-surface focus:outline-none focus:border-primary"
                  />
                  <button
                    type="submit"
                    className="col-span-2 rounded bg-surface-high hover:bg-primary hover:text-on-primary font-mono text-[11px] font-semibold text-on-surface cursor-pointer"
                  >
                    Pin
                  </button>
                </form>

                <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                  {activeModule.bookmarks.length === 0 ? (
                    <p className="font-mono text-[11px] text-outline py-2 text-center">
                      Pin MM:SS markers to jump straight to key explanations in the video.
                    </p>
                  ) : (
                    activeModule.bookmarks.map((bm) => (
                      <div
                        key={bm.id}
                        className="flex items-center justify-between gap-2 p-2 rounded bg-surface-low hover:bg-surface-container transition-colors"
                      >
                        <button
                          type="button"
                          onClick={() => setVideoStartSec(bm.timestampSeconds)}
                          className="flex items-center gap-2 min-w-0 text-left cursor-pointer group"
                        >
                          <span className="font-mono text-[11px] text-primary font-bold tabular-nums shrink-0 flex items-center gap-1">
                            <Play className="w-3 h-3" />
                            {formatSecondsToTimestamp(bm.timestampSeconds)}
                          </span>
                          <span className="text-xs text-on-surface group-hover:text-primary truncate">
                            {bm.label}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => removeModuleBookmark(activeModule.id, bm.id)}
                          className="text-outline hover:text-error p-1 cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Lecture Transcript & Captions */}
              <div className="bg-surface-lowest border border-outline-variant/35 rounded p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2 font-mono text-[11px]">
                  <span className="text-on-surface-variant font-semibold">
                    Lecture Transcript &amp; Captions
                  </span>
                  <button
                    type="button"
                    onClick={() => saveModuleTranscript(activeModule.id, transcriptDraft)}
                    className="text-primary hover:underline cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Save Captions
                  </button>
                </div>

                <input
                  type="text"
                  value={transcriptSearch}
                  onChange={(e) => setTranscriptSearch(e.target.value)}
                  placeholder="Filter transcript lines..."
                  className="bg-surface-low border border-outline-variant/40 rounded px-2.5 py-1 font-mono text-xs text-on-surface placeholder:text-outline focus:outline-none focus:border-primary"
                />

                {transcriptSearch.trim() && transcriptDraft.trim() && (
                  <div className="max-h-28 overflow-y-auto bg-surface-low rounded p-2 space-y-1 font-mono text-[11px]">
                    {transcriptDraft
                      .split("\n")
                      .filter((line) =>
                        line.toLowerCase().includes(transcriptSearch.trim().toLowerCase())
                      )
                      .slice(0, 8)
                      .map((line, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between gap-2 text-on-surface-variant"
                        >
                          <span className="truncate">{line}</span>
                          <button
                            type="button"
                            onClick={() => {
                              addModuleHighlight(activeModule.id, {
                                anchorLabel: "Transcript",
                                excerpt: line.trim(),
                              });
                              setMediaTab("highlights");
                            }}
                            className="text-primary hover:underline shrink-0 cursor-pointer"
                          >
                            Highlight
                          </button>
                        </div>
                      ))}
                  </div>
                )}

                <textarea
                  rows={4}
                  value={transcriptDraft}
                  onChange={(e) => setTranscriptDraft(e.target.value)}
                  onBlur={() => saveModuleTranscript(activeModule.id, transcriptDraft)}
                  placeholder="Paste lecture captions or timestamped transcript lines (searchable across your entire Vault without downloading video files)..."
                  className="w-full bg-surface-low border border-outline-variant/40 rounded px-2.5 py-1.5 font-mono text-xs text-on-surface placeholder:text-outline focus:outline-none focus:border-primary resize-y"
                />
              </div>
            </div>
          ) : mediaTab === "highlights" ? (
            /* ANCHORED PDF / LECTURE HIGHLIGHTS TAB */
            <div className="flex flex-col gap-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!hlExcerptInput.trim()) return;
                  addModuleHighlight(activeModule.id, {
                    anchorLabel: hlAnchorInput.trim() || "PDF p. 1",
                    excerpt: hlExcerptInput.trim(),
                    note: hlNoteInput.trim() || undefined,
                  });
                  setHlExcerptInput("");
                  setHlNoteInput("");
                }}
                className="bg-surface-lowest border border-outline-variant/35 rounded p-3 flex flex-col gap-2"
              >
                <span className="font-mono text-[11px] font-semibold text-on-surface-variant">
                  Save Page / Timestamp Highlight
                </span>
                <input
                  type="text"
                  value={hlAnchorInput}
                  onChange={(e) => setHlAnchorInput(e.target.value)}
                  placeholder="Source anchor (e.g. PDF p. 14, Theorem 2.1, or 18:40)"
                  className="bg-surface-low border border-outline-variant/40 rounded px-2.5 py-1.5 font-mono text-xs text-on-surface tabular-nums focus:outline-none focus:border-primary"
                />
                <textarea
                  rows={3}
                  required
                  value={hlExcerptInput}
                  onChange={(e) => setHlExcerptInput(e.target.value)}
                  placeholder="Paste highlighted definition, formula, or key passage..."
                  className="bg-surface-low border border-outline-variant/40 rounded px-2.5 py-1.5 text-xs text-on-surface focus:outline-none focus:border-primary resize-y"
                />
                <input
                  type="text"
                  value={hlNoteInput}
                  onChange={(e) => setHlNoteInput(e.target.value)}
                  placeholder="Optional margin annotation or intuition..."
                  className="bg-surface-low border border-outline-variant/40 rounded px-2.5 py-1.5 text-xs text-on-surface focus:outline-none focus:border-primary"
                />
                <button
                  type="submit"
                  className="mt-0.5 px-3 py-1.5 rounded bg-primary-container hover:bg-primary text-on-primary-container font-mono text-xs font-bold cursor-pointer whitespace-nowrap"
                >
                  Save Highlight
                </button>
              </form>

              <div className="flex flex-col gap-2 max-h-[420px] overflow-y-auto pr-0.5">
                {(activeModule.highlights || []).length === 0 ? (
                  <div className="py-8 px-3 text-center font-mono text-xs text-outline bg-surface-lowest rounded border border-outline-variant/30">
                    No anchored PDF or lecture highlights yet. Pin key passages above and promote them directly to flashcards or topic quiz questions.
                  </div>
                ) : (
                  (activeModule.highlights || []).map((hl) => (
                    <div
                      key={hl.id}
                      className="bg-surface-lowest border border-outline-variant/35 p-3 rounded flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between gap-2 font-mono text-[11px] tabular-nums">
                        <span className="text-primary font-semibold truncate">
                          {hl.anchorLabel} · {hl.createdAt.slice(0, 10)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeModuleHighlight(activeModule.id, hl.id)}
                          className="text-outline hover:text-error cursor-pointer shrink-0"
                          title="Delete Highlight"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <p className="text-xs text-on-surface leading-relaxed">{hl.excerpt}</p>
                      {hl.note && (
                        <p className="text-[11px] text-on-surface-variant">
                          Margin note: {hl.note}
                        </p>
                      )}

                      <div className="flex items-center gap-2 pt-1 border-t border-outline-variant/20 flex-wrap">
                        <button
                          type="button"
                          onClick={() => promoteHighlightToFlashcard(activeModule.id, hl.id)}
                          className="px-2 py-1 rounded bg-surface-high hover:bg-secondary hover:text-on-secondary font-mono text-[10px] text-on-surface transition-colors cursor-pointer whitespace-nowrap shrink-0"
                        >
                          {hl.linkedFlashcardId ? "Card Linked · Add Copy" : "To Flashcard"}
                        </button>
                        <button
                          type="button"
                          onClick={() => promoteHighlightToQuizQuestion(activeModule.id, hl.id)}
                          className="px-2 py-1 rounded bg-surface-high hover:bg-tertiary hover:text-on-tertiary font-mono text-[10px] text-on-surface transition-colors cursor-pointer whitespace-nowrap shrink-0"
                        >
                          {hl.linkedAssessmentId ? "Quiz Linked · Add Q" : "To Quiz Q"}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            /* RESOURCE LOCKER TAB */
            <div className="flex flex-col gap-3">
              <form
                onSubmit={handleAddResource}
                className="bg-surface-lowest border border-outline-variant/35 rounded p-3 flex flex-col gap-2"
              >
                <span className="font-mono text-[10px] uppercase tracking-wider text-outline">
                  Add External Paper, Textbook, or Link
                </span>
                <input
                  type="text"
                  required
                  value={resTitle}
                  onChange={(e) => setResTitle(e.target.value)}
                  placeholder="Resource title (e.g. Lecture Slides PDF)"
                  className="bg-surface-low border border-outline-variant/40 rounded px-2.5 py-1.5 text-xs text-on-surface focus:outline-none focus:border-primary"
                />
                <div className="grid grid-cols-3 gap-2">
                  <select
                    value={resType}
                    onChange={(e) => setResType(e.target.value as ResourceItem["type"])}
                    className="bg-surface-low border border-outline-variant/40 rounded px-2 py-1.5 font-mono text-xs text-on-surface focus:outline-none"
                  >
                    <option value="pdf">PDF</option>
                    <option value="github">GitHub</option>
                    <option value="arxiv">ArXiv</option>
                    <option value="doc">Docs</option>
                    <option value="video">Video</option>
                    <option value="slides">Slides</option>
                  </select>
                  <input
                    type="text"
                    required
                    value={resUrl}
                    onChange={(e) => setResUrl(e.target.value)}
                    placeholder="https://..."
                    className="col-span-2 bg-surface-low border border-outline-variant/40 rounded px-2.5 py-1.5 font-mono text-xs text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>
                <input
                  type="text"
                  value={resDescription}
                  onChange={(e) => setResDescription(e.target.value)}
                  placeholder="Optional description / source chapters..."
                  className="bg-surface-low border border-outline-variant/40 rounded px-2.5 py-1.5 text-xs text-on-surface focus:outline-none focus:border-primary"
                />
                <input
                  type="text"
                  value={resTagsInput}
                  onChange={(e) => setResTagsInput(e.target.value)}
                  placeholder="Optional tags (comma-separated, e.g. textbook, theorem-3)"
                  className="bg-surface-low border border-outline-variant/40 rounded px-2.5 py-1.5 font-mono text-xs text-on-surface focus:outline-none focus:border-primary"
                />
                <button
                  type="submit"
                  className="mt-1 px-3 py-1.5 rounded bg-primary-container hover:bg-primary text-on-primary-container font-mono text-xs font-bold cursor-pointer"
                >
                  Save to Resource Locker
                </button>
              </form>

              <div className="flex flex-col gap-2">
                {activeModule.resources.length === 0 ? (
                  <div className="py-8 text-center font-mono text-xs text-outline bg-surface-lowest rounded border border-outline-variant/30">
                    No external links or references attached to this module yet.
                  </div>
                ) : (
                  activeModule.resources.map((res) => (
                    <div
                      key={res.id}
                      className="bg-surface-lowest border border-outline-variant/35 p-3 rounded flex items-start justify-between gap-2"
                    >
                      <a
                        href={res.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-w-0 flex-1 group"
                      >
                        <div className="flex items-center gap-2 font-mono text-[10px] uppercase">
                          <span className="text-primary font-bold">{res.type}</span>
                          <span className="text-outline truncate">{res.url}</span>
                        </div>
                        <div className="text-xs font-medium text-on-surface group-hover:text-primary transition-colors pt-0.5 flex items-center gap-1.5">
                          <span className="truncate">{res.title}</span>
                          <ExternalLink className="w-3 h-3 shrink-0 text-outline" />
                        </div>
                        {res.description && (
                          <p className="text-[11px] text-on-surface-variant pt-0.5 line-clamp-2">
                            {res.description}
                          </p>
                        )}
                        {res.tags && res.tags.length > 0 && (
                          <div className="font-mono text-[10px] text-outline pt-1">
                            {res.tags.map((t) => `#${t}`).join(" · ")}
                          </div>
                        )}
                      </a>
                      <button
                        type="button"
                        onClick={() => removeModuleResource(activeModule.id, res.id)}
                        className="p-1.5 text-outline hover:text-error cursor-pointer shrink-0"
                        title="Remove Resource"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
