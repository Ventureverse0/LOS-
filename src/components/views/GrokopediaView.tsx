import React, { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  BrainCircuit,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  FolderKanban,
  Gamepad2,
  Layers,
  Loader2,
  Paperclip,
  Sliders,
  Terminal,
  Trash2,
  Upload,
  Zap,
} from "lucide-react";
import { useStudyOS } from "../../context/StudyOSContext";
import {
  generateDeepResearchReport,
  generateGrokopediaCurriculum,
} from "../../services/aiService";
import { formatByteSize, readUploadedNoteFiles } from "../../lib/storage";
import {
  AppView,
  type DeepResearchReportData,
  type LearnerLevel,
  type ResearchSession,
  type UploadedNoteDocument,
} from "../../types/studyOS";

type SynthesisMode = "curriculum" | "report";

function formatReportToMarkdown(report: DeepResearchReportData): string {
  const mathPart = report.mathInvariants
    .map((m) => `### ${m.label}\n$$${m.formula}$$\n${m.explanation}`)
    .join("\n\n");
  const matrixPart = report.comparisonMatrix
    .map(
      (r) =>
        `- **${r.approach}** (${r.modelType}): Bound \`${r.boundOrMetric}\` · Complexity \`${r.complexity}\` · ${r.performance} · ${r.tradeoff}`
    )
    .join("\n");
  const trackPart = report.fiveDayTrack
    .map((d) => `- **${d.day}**: ${d.milestone}`)
    .join("\n");

  return `# ${report.title}\n\n> ${report.subtitle}\n\n## 1. Executive Summary\n${report.executiveSummary}\n\n${mathPart}\n\n## 2. Comparative Matrix\n${matrixPart}\n\n## 3. ${report.codeSectionTitle}\n\`\`\`${report.codeLanguage}\n${report.codeSnippet}\n\`\`\`\n\n## 4. ${report.formalVerificationTitle}\n\`\`\`text\n${report.formalVerificationSpec}\n\`\`\`\n\n## 5-Day Mastery Track\n${trackPart}\n`;
}

export function GrokopediaView() {
  const {
    state,
    setActiveView,
    pendingGrokTopic,
    clearPendingGrokTopic,
    ingestGeneratedCurriculum,
    saveGeneratedReport,
    saveReportAsVaultModule,
    openCourseInManager,
    openCourseTagFilter,
    openModuleInVault,
    launchIntegrativeLab,
    updateSettings,
    pushToast,
  } = useStudyOS();

  const [mode, setMode] = useState<SynthesisMode>("curriculum");
  const [topic, setTopic] = useState("");
  const [learningGoals, setLearningGoals] = useState("");
  const [learnerLevel, setLearnerLevel] = useState<LearnerLevel>("Intermediate");
  const [targetUnitCount, setTargetUnitCount] = useState<number>(5);
  const [category, setCategory] = useState("");
  const [rawNotesText, setRawNotesText] = useState("");
  const [showPasteNotes, setShowPasteNotes] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<UploadedNoteDocument[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    state.researchSessions[0]?.id || null
  );
  const [copiedCode, setCopiedCode] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (pendingGrokTopic) {
      setTopic(pendingGrokTopic);
      clearPendingGrokTopic();
    }
  }, [pendingGrokTopic, clearPendingGrokTopic]);

  const activeSession: ResearchSession | null =
    state.researchSessions.find((s) => s.id === selectedSessionId) ||
    state.researchSessions[0] ||
    null;

  const handleFilesSelected = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    try {
      const parsed = await readUploadedNoteFiles(files);
      setUploadedDocs((prev) => {
        const existingNames = new Set(prev.map((d) => d.name));
        const merged = [...prev, ...parsed.filter((d) => !existingNames.has(d.name))].slice(0, 8);
        return merged;
      });
      pushToast({
        title: `Attached ${parsed.length} Study File${parsed.length > 1 ? "s" : ""}`,
        subtitle: parsed.map((p) => p.name).join(", "),
        variant: "success",
      });
    } catch (err: unknown) {
      pushToast({
        title: "Could Not Read File",
        subtitle: err instanceof Error ? err.message : "Unsupported file format.",
        variant: "error",
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const canSubmit =
    mode === "curriculum"
      ? Boolean(topic.trim() || rawNotesText.trim() || uploadedDocs.length > 0)
      : Boolean(topic.trim());

  const handleDispatch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canSubmit || isLoading) return;

    const cleanTopic = topic.trim();
    setIsLoading(true);
    try {
      if (mode === "curriculum") {
        const { curriculum, model } = await generateGrokopediaCurriculum({
          topic: cleanTopic || undefined,
          learningGoals: learningGoals.trim() || undefined,
          learnerLevel,
          targetUnitCount,
          category: category.trim() || undefined,
          rawNotesText: rawNotesText.trim() || undefined,
          uploadedDocuments: uploadedDocs.length > 0 ? uploadedDocs : undefined,
          model: state.settings.selectedModel,
          temperature: state.settings.temperature,
          topP: state.settings.topP,
        });
        ingestGeneratedCurriculum(
          curriculum,
          cleanTopic || curriculum.courseTitle,
          model,
          {
            learningGoals: learningGoals.trim() || undefined,
            sourceDocuments: uploadedDocs,
            rawNotesText: rawNotesText.trim() || undefined,
          }
        );
        setSelectedSessionId(null); // Focus newest session at index 0
        setTopic("");
        setLearningGoals("");
        setRawNotesText("");
        setUploadedDocs([]);
      } else {
        const { report, model } = await generateDeepResearchReport({
          topic: cleanTopic,
          rawNotesText: rawNotesText.trim() || undefined,
          model: state.settings.selectedModel,
          temperature: state.settings.temperature,
          topP: state.settings.topP,
        });
        saveGeneratedReport(report, cleanTopic, model);
        setSelectedSessionId(null);
        setTopic("");
      }
    } catch (err: unknown) {
      pushToast({
        title: "Curriculum Synthesis Error",
        subtitle: err instanceof Error ? err.message : "Failed to complete synthesis.",
        variant: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportReportMD = (report: DeepResearchReportData) => {
    const md = formatReportToMarkdown(report);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "study-os-research-report.md";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handlePushReportToVault = (report: DeepResearchReportData) => {
    const md = formatReportToMarkdown(report);
    const created = saveReportAsVaultModule(report.title, md);
    openModuleInVault(created.id);
  };

  return (
    <div className="flex flex-col gap-5 w-full">
      {/* TOP INFERENCE & MULTIMODAL CURRICULUM ARCHITECT CONSOLE */}
      <section className="bg-surface-lowest border border-outline-variant/40 rounded-md p-4 sm:p-5 flex flex-col gap-4">
        {/* Engine & Hyperparameter Tuning Strip */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-surface-low border border-outline-variant/30 px-3.5 py-2.5 rounded">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 font-mono text-xs text-primary font-semibold">
              <BrainCircuit className="w-4 h-4" />
              <span>AI ENGINE:</span>
            </div>

            <select
              value={state.settings.selectedModel}
              onChange={(e) =>
                updateSettings({
                  selectedModel: e.target.value as "gemini-3.8-flash" | "gemini-3.1-flash-lite",
                })
              }
              className="bg-surface-highest border border-outline-variant/40 rounded px-2.5 py-1 font-mono text-xs text-on-surface focus:outline-none cursor-pointer"
            >
              <option value="gemini-3.8-flash">gemini-3.8-flash (Deep Multimodal Synthesis)</option>
              <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Fast Stream)</option>
            </select>

            {/* Mode Switcher */}
            <div className="flex items-center gap-1 bg-surface-lowest p-1 rounded border border-outline-variant/30">
              <button
                type="button"
                onClick={() => setMode("curriculum")}
                className={`px-2.5 py-1 rounded font-mono text-[11px] transition-colors cursor-pointer whitespace-nowrap ${
                  mode === "curriculum"
                    ? "bg-primary-container text-on-primary-container font-bold"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                Notes &amp; Goal Curriculum Builder (+50 XP)
              </button>
              <button
                type="button"
                onClick={() => setMode("report")}
                className={`px-2.5 py-1 rounded font-mono text-[11px] transition-colors cursor-pointer whitespace-nowrap ${
                  mode === "report"
                    ? "bg-primary-container text-on-primary-container font-bold"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                Deep Research Report (+50 XP)
              </button>
            </div>
          </div>

          {/* Sliders */}
          <div className="flex items-center gap-5 flex-wrap font-mono text-[11px] tabular-nums">
            <label className="flex items-center gap-2 text-on-surface-variant">
              <Sliders className="w-3.5 h-3.5 text-primary" />
              <span>
                TEMP: <strong className="text-primary">{state.settings.temperature.toFixed(2)}</strong>
              </span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={state.settings.temperature}
                onChange={(e) => updateSettings({ temperature: parseFloat(e.target.value) })}
                className="w-20 accent-[#4cd7f6] cursor-pointer"
              />
            </label>

            <label className="flex items-center gap-2 text-on-surface-variant">
              <span>
                TOP-P: <strong className="text-secondary">{state.settings.topP.toFixed(2)}</strong>
              </span>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={state.settings.topP}
                onChange={(e) => updateSettings({ topP: parseFloat(e.target.value) })}
                className="w-20 accent-[#ffb95f] cursor-pointer"
              />
            </label>
          </div>
        </div>

        {/* Main Curriculum & Notes Form */}
        <form
          onSubmit={handleDispatch}
          className="bg-surface-container border border-outline-variant/40 rounded-md p-4 flex flex-col gap-3.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px]">
            <span className="text-primary font-semibold">
              {mode === "curriculum"
                ? "PERSONALIZED CURRICULUM PIPELINE · Builds Course, Vault Notes, Flashcards, Milestones & Schedule"
                : "DEEP RESEARCH DECONSTRUCTION · Formal Principles, Comparative Matrix & Worked Examples"}
            </span>

            {mode === "curriculum" && (
              <div className="flex items-center gap-3 flex-wrap">
                <label className="flex items-center gap-1.5 text-outline">
                  <span>LEVEL:</span>
                  <select
                    value={learnerLevel}
                    onChange={(e) => setLearnerLevel(e.target.value as LearnerLevel)}
                    className="bg-surface-lowest border border-outline-variant/40 rounded px-2 py-0.5 font-mono text-[11px] text-on-surface focus:outline-none focus:border-primary"
                  >
                    <option value="Beginner">Beginner</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advanced">Advanced</option>
                  </select>
                </label>

                <label className="flex items-center gap-1.5 text-outline">
                  <span>UNITS:</span>
                  <select
                    value={targetUnitCount}
                    onChange={(e) => setTargetUnitCount(Number(e.target.value))}
                    className="bg-surface-lowest border border-outline-variant/40 rounded px-2 py-0.5 font-mono text-[11px] text-on-surface tabular-nums focus:outline-none focus:border-primary"
                  >
                    {[3, 4, 5, 6, 7, 8].map((n) => (
                      <option key={n} value={n}>
                        {n} Units
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex items-center gap-1.5 text-outline">
                  <span>DOMAIN:</span>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Auto-detect subject"
                    className="bg-surface-lowest border border-outline-variant/40 rounded px-2 py-0.5 font-mono text-[11px] text-on-surface w-36 placeholder:text-outline focus:outline-none focus:border-primary"
                  />
                </label>
              </div>
            )}
          </div>

          {/* Topic + Learning Goals Inputs */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
            <div
              className={`${
                mode === "curriculum" ? "lg:col-span-6" : "lg:col-span-12"
              } flex items-start gap-2.5 bg-surface-lowest border border-outline-variant/50 focus-within:border-primary rounded p-2.5`}
            >
              <Terminal className="w-4 h-4 text-primary mt-1 shrink-0" />
              <textarea
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                rows={2}
                placeholder={
                  mode === "curriculum"
                    ? "What do you want to learn? (e.g. Organic Chemistry Stereochemistry, Quantitative Options Pricing, Rust Async Runtime — or leave blank to infer from uploaded notes)"
                    : "Enter topic or research question to deconstruct in depth..."
                }
                className="w-full bg-transparent font-mono text-xs text-on-surface placeholder:text-outline focus:outline-none resize-none leading-relaxed"
              />
            </div>

            {mode === "curriculum" && (
              <div className="lg:col-span-6 flex items-start gap-2.5 bg-surface-lowest border border-outline-variant/50 focus-within:border-primary rounded p-2.5">
                <BookOpen className="w-4 h-4 text-secondary mt-1 shrink-0" />
                <textarea
                  value={learningGoals}
                  onChange={(e) => setLearningGoals(e.target.value)}
                  rows={2}
                  placeholder="Optional learning goals or instructions (e.g. Prepare me for next Friday's exam around my lecture slides, focus on problem-solving & active recall)..."
                  className="w-full bg-transparent font-mono text-xs text-on-surface placeholder:text-outline focus:outline-none resize-none leading-relaxed"
                />
              </div>
            )}
          </div>

          {/* Multimodal Upload Dropzone + Paste Raw Notes Box */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                void handleFilesSelected(e.dataTransfer.files);
              }}
              className={`lg:col-span-8 rounded border border-dashed p-3 flex flex-col justify-between gap-2 transition-colors ${
                isDragging
                  ? "border-primary bg-primary-container/10"
                  : "border-outline-variant/60 bg-surface-lowest/70"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                  <Upload className="w-4 h-4 text-primary shrink-0" />
                  <span>
                    Drop your own notes, PDFs, lecture slides, code, or handwritten note photos (
                    <span className="font-mono text-[11px] text-on-surface">
                      .pdf · .md · .txt · .png · .jpg · code
                    </span>
                    )
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2.5 py-1 rounded bg-surface-high hover:bg-surface-bright border border-outline-variant/40 font-mono text-[11px] text-on-surface flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Paperclip className="w-3 h-3 text-primary" />
                    <span>Upload Files</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPasteNotes(!showPasteNotes)}
                    className={`px-2.5 py-1 rounded border font-mono text-[11px] flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 ${
                      showPasteNotes || rawNotesText.trim()
                        ? "bg-secondary/15 border-secondary/50 text-secondary font-semibold"
                        : "bg-surface-high border-outline-variant/40 text-on-surface-variant hover:text-on-surface"
                    }`}
                  >
                    <FileText className="w-3 h-3" />
                    <span>
                      {rawNotesText.trim()
                        ? `Pasted Notes (${rawNotesText.trim().split(/\s+/).length}w)`
                        : "Paste Raw Notes"}
                    </span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.md,.markdown,.txt,.csv,.json,.tex,.py,.js,.ts,.tsx,.c,.cpp,.java,.rs,.go,.sql,image/png,image/jpeg,image/webp"
                    onChange={(e) => void handleFilesSelected(e.target.files)}
                    className="hidden"
                  />
                </div>
              </div>

              {uploadedDocs.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {uploadedDocs.map((doc) => (
                    <div
                      key={doc.name}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-high border border-primary/30 font-mono text-[11px] text-on-surface"
                    >
                      <FileText className="w-3 h-3 text-primary shrink-0" />
                      <span className="truncate max-w-[180px]">{doc.name}</span>
                      <span className="text-outline tabular-nums">
                        ({formatByteSize(doc.sizeBytes)})
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setUploadedDocs((prev) => prev.filter((d) => d.name !== doc.name))
                        }
                        className="text-outline hover:text-error cursor-pointer ml-0.5"
                        title="Remove file"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="lg:col-span-4 flex flex-col justify-center">
              <button
                type="submit"
                disabled={isLoading || !canSubmit}
                className="w-full h-full min-h-[54px] px-5 py-3 rounded bg-primary-container hover:bg-primary disabled:opacity-40 text-on-primary-container font-mono text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer shrink-0 whitespace-nowrap shadow-[0_0_16px_rgba(6,182,212,0.28)]"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>BUILDING CURRICULUM...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    <span>
                      {mode === "curriculum"
                        ? uploadedDocs.length > 0 || rawNotesText.trim()
                          ? "BUILD FROM MY NOTES (+50 XP)"
                          : "GENERATE CURRICULUM (+50 XP)"
                        : "SYNTHESIZE REPORT (+50 XP)"}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>

          {showPasteNotes && (
            <div className="bg-surface-lowest border border-outline-variant/50 rounded p-3 flex flex-col gap-1.5">
              <div className="flex items-center justify-between font-mono text-[11px]">
                <span className="text-secondary font-semibold">
                  PASTE LECTURE NOTES, SYLLABUS OUTLINE, OR STUDY MATERIAL
                </span>
                <span className="text-outline tabular-nums">
                  {rawNotesText.trim() ? `${rawNotesText.trim().split(/\s+/).length} words` : "0 words"}
                </span>
              </div>
              <textarea
                value={rawNotesText}
                onChange={(e) => setRawNotesText(e.target.value)}
                rows={5}
                placeholder="Paste raw lecture notes, textbook excerpts, syllabus topics, or messy bullet points here. Study OS will organize them into structured units, Vault notes, and active-recall flashcards..."
                className="w-full bg-surface-low border border-outline-variant/40 focus:border-primary rounded p-2.5 font-mono text-xs text-on-surface placeholder:text-outline focus:outline-none resize-y leading-relaxed"
              />
            </div>
          )}

          {/* Cross-Domain Starter Prompts */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-mono text-[10px] uppercase tracking-wider text-outline mr-1">
              Example Subjects:
            </span>
            {[
              "Transformer Architectures & Attention Mechanisms from Scratch",
              "Molecular Cell Biology: Gene Expression & CRISPR Editing",
              "Quantitative Finance: Stochastic Calculus & Black-Scholes",
              "Database Internals: B+ Trees, MVCC & Write-Ahead Logging",
            ].map((tpl) => (
              <button
                key={tpl}
                type="button"
                onClick={() => setTopic(tpl)}
                className="px-2.5 py-1 rounded bg-surface-highest hover:bg-surface-bright font-mono text-[10px] text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer text-left"
              >
                [{tpl.split(":")[0].slice(0, 34)}]
              </button>
            ))}
          </div>
        </form>
      </section>

      {/* SPLIT RESEARCH WORKSPACE (4:8) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT SIDEBAR: RESEARCH HISTORY */}
        <aside className="lg:col-span-4 flex flex-col gap-4">
          <div className="bg-surface-lowest border border-outline-variant/40 rounded-md p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between font-mono text-xs">
              <span className="uppercase tracking-wider text-on-surface-variant font-semibold">
                Curriculum &amp; Research History
              </span>
              <span className="text-primary tabular-nums">
                {state.researchSessions.length} saved
              </span>
            </div>

            {state.researchSessions.length === 0 ? (
              <p className="font-mono text-xs text-outline py-6 text-center">
                No curricula generated yet. Upload your notes or enter any subject above to build your first course.
              </p>
            ) : (
              <div className="flex flex-col gap-2 max-h-[480px] overflow-y-auto">
                {state.researchSessions.map((session) => {
                  const isSelected = activeSession?.id === session.id;
                  return (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => setSelectedSessionId(session.id)}
                      className={`p-3 rounded text-left border transition-colors cursor-pointer flex flex-col gap-1 ${
                        isSelected
                          ? "bg-surface-high border-primary/50"
                          : "bg-surface-low border-outline-variant/30 hover:bg-surface-container"
                      }`}
                    >
                      <div className="flex items-center justify-between font-mono text-[10px] text-outline">
                        <span
                          className={
                            session.mode === "curriculum"
                              ? "text-tertiary font-bold"
                              : "text-secondary font-bold"
                          }
                        >
                          {session.mode === "curriculum" ? "CURRICULUM" : "DEEP REPORT"}
                        </span>
                        <span>{new Date(session.createdAt).toLocaleDateString()}</span>
                      </div>
                      <div className="text-xs font-semibold text-on-surface line-clamp-2 leading-snug">
                        {session.topic}
                      </div>
                      <div className="font-mono text-[10px] text-outline truncate">
                        {session.sourceFileNames && session.sourceFileNames.length > 0
                          ? `Files: ${session.sourceFileNames.join(", ")}`
                          : `Model: ${session.model}`}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        {/* RIGHT MAIN CANVAS: ACTIVE SYNTHESIS OUTPUT */}
        <div className="lg:col-span-8 flex flex-col gap-4">
          {isLoading ? (
            <div className="bg-surface-lowest border border-primary/40 rounded-md p-8 flex flex-col items-center justify-center text-center gap-4 min-h-[380px]">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
              <div>
                <h3 className="text-base font-semibold text-on-surface">
                  Synthesizing Personalized Curriculum &amp; Knowledge Graph...
                </h3>
                <p className="font-mono text-xs text-outline pt-1 max-w-lg">
                  Reading your notes and goals, sequencing study units, authoring Vault Markdown notes, and generating active-recall flashcards &amp; milestones.
                </p>
              </div>
            </div>
          ) : !activeSession ? (
            <div className="bg-surface-lowest border border-outline-variant/40 rounded-md p-10 text-center flex flex-col items-center gap-2">
              <BrainCircuit className="w-7 h-7 text-primary/70" />
              <p className="text-sm text-on-surface font-medium">
                Start From Your Own Notes or Any Topic
              </p>
              <p className="text-xs text-outline max-w-md leading-relaxed">
                Upload PDFs, Markdown files, code, or photos of handwritten notes above — or describe what you want to learn — to generate a complete course, Vault notes, flashcards, and study blocks.
              </p>
            </div>
          ) : activeSession.mode === "curriculum" && activeSession.curriculum ? (
            /* GENERATED CURRICULUM VIEW */
            <article className="bg-surface-lowest border border-outline-variant/40 rounded-md p-5 flex flex-col gap-5">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-outline-variant/30">
                <div>
                  <div className="flex items-center gap-2 font-mono text-xs text-outline flex-wrap">
                    <span className="text-tertiary font-bold">
                      {activeSession.curriculum.courseCode}
                    </span>
                    <span>·</span>
                    <span>{activeSession.curriculum.category}</span>
                    <span>·</span>
                    <span className="tabular-nums">
                      {activeSession.curriculum.units.length} Units
                    </span>
                    <span>·</span>
                    <span className="text-secondary tabular-nums">
                      {activeSession.curriculum.flashcards?.length || 0} Flashcards
                    </span>
                  </div>
                  <h2 className="text-2xl font-semibold text-on-surface tracking-tight pt-1">
                    {activeSession.curriculum.courseTitle}
                  </h2>
                  <p className="text-sm text-on-surface-variant pt-2 leading-relaxed">
                    {activeSession.curriculum.executiveSummary}
                  </p>

                  {activeSession.curriculum.tags && activeSession.curriculum.tags.length > 0 && (
                    <div className="font-mono text-[11px] text-outline pt-2 flex items-center gap-1 flex-wrap">
                      {activeSession.curriculum.tags.map((tag, idx) => (
                        <React.Fragment key={tag}>
                          {idx > 0 && <span className="text-outline/60">·</span>}
                          <button
                            type="button"
                            onClick={() => openCourseTagFilter(tag)}
                            className="hover:text-primary transition-colors cursor-pointer"
                          >
                            #{tag}
                          </button>
                        </React.Fragment>
                      ))}
                    </div>
                  )}

                  {activeSession.sourceFileNames && activeSession.sourceFileNames.length > 0 && (
                    <div className="font-mono text-[11px] text-primary pt-1.5">
                      Grounded in uploaded files: {activeSession.sourceFileNames.join(" · ")}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      launchIntegrativeLab({
                        courseId: activeSession.courseId,
                        customTopic: activeSession.curriculum!.courseTitle,
                      })
                    }
                    className="px-3 py-2 rounded bg-surface-high hover:bg-primary hover:text-on-primary text-primary font-mono text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer whitespace-nowrap"
                  >
                    <Gamepad2 className="w-3.5 h-3.5 shrink-0" />
                    <span>3D Physics Lab</span>
                  </button>
                  {activeSession.courseId && (
                    <button
                      type="button"
                      onClick={() => openCourseInManager(activeSession.courseId!)}
                      className="px-3.5 py-2 rounded bg-primary-container hover:bg-primary text-on-primary-container font-mono text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer whitespace-nowrap"
                    >
                      <BookOpen className="w-4 h-4" />
                      <span>Open Syllabus Board</span>
                    </button>
                  )}
                  {(activeSession.curriculum.flashcards?.length || 0) > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveView(AppView.FLASHCARDS)}
                      className="px-3 py-2 rounded bg-surface-high hover:bg-surface-bright text-on-surface font-mono text-xs flex items-center gap-1.5 shrink-0 cursor-pointer whitespace-nowrap"
                    >
                      <Layers className="w-3.5 h-3.5 text-secondary" />
                      <span>Practice Deck</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {activeSession.curriculum.units.map((unit, idx) => {
                  const matchingModule = state.modules.find(
                    (m) =>
                      m.courseId === activeSession.courseId && m.title === unit.title
                  );

                  return (
                    <div
                      key={`${unit.title}-${idx}`}
                      className="bg-surface-low border border-outline-variant/35 rounded-md p-4 flex flex-col gap-2.5"
                    >
                      <div className="flex items-center justify-between gap-2 font-mono text-xs">
                        <span className="text-primary font-bold">
                          UNIT {String(idx + 1).padStart(2, "0")}
                        </span>
                        <span className="text-secondary tabular-nums">
                          {unit.estimatedHours}h estimated
                        </span>
                      </div>

                      <h3 className="text-base font-semibold text-on-surface">{unit.title}</h3>
                      <p className="text-[13px] text-on-surface-variant leading-relaxed">
                        {unit.briefOverview}
                      </p>

                      <div className="font-mono text-[11px] text-outline">
                        Concepts: {unit.keyConcepts.join(" · ")}
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-outline-variant/25 flex-wrap gap-2">
                        <a
                          href={`https://www.youtube.com/results?search_query=${encodeURIComponent(
                            unit.searchQueryForVideo
                          )}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-[11px] text-primary hover:underline flex items-center gap-1"
                        >
                          <span>Lecture Search: {unit.searchQueryForVideo}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>

                        {matchingModule && (
                          <button
                            type="button"
                            onClick={() => openModuleInVault(matchingModule.id)}
                            className="px-3 py-1 rounded bg-surface-high hover:bg-primary hover:text-on-primary font-mono text-[11px] text-on-surface flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <FolderKanban className="w-3.5 h-3.5" />
                            <span>Study Notes in Vault</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          ) : activeSession.report ? (
            /* DEEP TECHNICAL RESEARCH REPORT VIEW */
            <article className="bg-surface-lowest border border-outline-variant/40 rounded-md p-5 sm:p-6 flex flex-col gap-6">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-outline-variant/30">
                <span className="font-mono text-xs text-tertiary font-semibold">
                  DEEP RESEARCH REPORT · {activeSession.model}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleExportReportMD(activeSession.report!)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface-high hover:bg-surface-bright font-mono text-xs text-on-surface cursor-pointer whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5 text-primary" />
                    <span>Export .MD</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePushReportToVault(activeSession.report!)}
                    className="flex items-center gap-1.5 px-3 py-1 rounded bg-primary-container hover:bg-primary text-on-primary-container font-mono text-xs font-bold cursor-pointer whitespace-nowrap"
                  >
                    <FolderKanban className="w-3.5 h-3.5" />
                    <span>Push to Knowledge Vault</span>
                  </button>
                </div>
              </div>

              <div>
                <h1 className="text-2xl sm:text-3xl font-semibold text-on-surface tracking-tight leading-snug">
                  {activeSession.report.title}
                </h1>
                <p className="text-sm text-on-surface-variant pt-2 leading-relaxed">
                  {activeSession.report.subtitle}
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <h3 className="text-lg font-semibold text-on-surface">
                  01. Executive Summary &amp; Core Formalisms
                </h3>
                <div className="bg-surface-low border border-outline-variant/30 rounded-md p-4 flex flex-col gap-3">
                  <p className="text-[13.5px] text-on-surface-variant leading-relaxed">
                    {activeSession.report.executiveSummary}
                  </p>
                  {activeSession.report.mathInvariants.map((inv, idx) => (
                    <div
                      key={idx}
                      className="bg-surface-lowest border border-outline-variant/40 rounded p-3 flex flex-col gap-1"
                    >
                      <span className="font-mono text-[11px] text-secondary font-semibold">
                        {inv.label}
                      </span>
                      <div className="font-mono text-xs text-primary py-0.5 overflow-x-auto">
                        {inv.formula}
                      </div>
                      <span className="text-xs text-outline">{inv.explanation}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <h3 className="text-lg font-semibold text-on-surface">
                  02. Comparative Matrix
                </h3>
                <div className="overflow-x-auto rounded-md border border-outline-variant/35 bg-surface-low">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-surface-high font-mono text-[10px] uppercase text-outline border-b border-outline-variant/40">
                      <tr>
                        <th className="py-2.5 px-3">Approach</th>
                        <th className="py-2.5 px-3">Model</th>
                        <th className="py-2.5 px-3">Bound / Metric</th>
                        <th className="py-2.5 px-3">Complexity</th>
                        <th className="py-2.5 px-3">Performance</th>
                        <th className="py-2.5 px-3">Tradeoff</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/25 font-mono text-xs">
                      {activeSession.report.comparisonMatrix.map((row, idx) => (
                        <tr key={idx} className="hover:bg-surface-container transition-colors">
                          <td className="py-2.5 px-3 font-semibold text-primary">{row.approach}</td>
                          <td className="py-2.5 px-3 text-on-surface">{row.modelType}</td>
                          <td className="py-2.5 px-3 text-tertiary">{row.boundOrMetric}</td>
                          <td className="py-2.5 px-3 text-on-surface">{row.complexity}</td>
                          <td className="py-2.5 px-3 text-secondary">{row.performance}</td>
                          <td className="py-2.5 px-3 text-on-surface-variant">{row.tradeoff}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-on-surface">
                    03. {activeSession.report.codeSectionTitle}
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard
                        ?.writeText(activeSession.report!.codeSnippet)
                        .catch(() => {});
                      setCopiedCode(true);
                      window.setTimeout(() => setCopiedCode(false), 1600);
                    }}
                    className="flex items-center gap-1 font-mono text-xs text-on-surface-variant hover:text-primary cursor-pointer"
                  >
                    {copiedCode ? (
                      <Check className="w-3.5 h-3.5 text-tertiary" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedCode ? "Copied" : "Copy Snippet"}</span>
                  </button>
                </div>
                <div className="bg-surface-low border border-outline-variant/40 rounded-md p-4 overflow-x-auto">
                  <pre className="font-mono text-xs leading-relaxed text-on-surface">
                    <code>{activeSession.report.codeSnippet}</code>
                  </pre>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <h3 className="text-lg font-semibold text-on-surface">
                  04. Verification Criteria &amp; 5-Day Mastery Plan
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-surface-low border border-outline-variant/35 rounded-md p-4 flex flex-col gap-2">
                    <span className="font-mono text-xs text-primary font-semibold">
                      {activeSession.report.formalVerificationTitle}
                    </span>
                    <pre className="bg-surface-lowest border border-outline-variant/30 rounded p-3 font-mono text-xs text-on-surface overflow-x-auto leading-relaxed">
                      {activeSession.report.formalVerificationSpec}
                    </pre>
                  </div>

                  <div className="bg-surface-low border border-outline-variant/35 rounded-md p-4 flex flex-col gap-2">
                    <span className="font-mono text-xs text-secondary font-semibold uppercase">
                      5-Day Mastery Track
                    </span>
                    <ul className="space-y-2 pt-1">
                      {activeSession.report.fiveDayTrack.map((d, idx) => (
                        <li key={idx} className="flex items-start gap-2.5 text-xs">
                          <span className="font-mono text-[11px] font-bold text-secondary shrink-0 pt-0.5">
                            {d.day}
                          </span>
                          <span className="text-on-surface-variant leading-snug">{d.milestone}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </article>
          ) : null}
        </div>
      </div>
    </div>
  );
}
