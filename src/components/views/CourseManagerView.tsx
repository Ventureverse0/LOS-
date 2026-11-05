import React, { useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  ArrowRight,
  BrainCircuit,
  Calendar,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Clock,
  FolderKanban,
  Kanban,
  LayoutList,
  Pencil,
  Plus,
  Search,
  Square,
  Table2,
  Tag,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { useStudyOS } from "../../context/StudyOSContext";
import { AppView, type Course, type ModuleStatus } from "../../types/studyOS";
import {
  collectCourseTagCounts,
  countWords,
  filterCoursesByTags,
  getTodayDateString,
  normalizeCourseTag,
  normalizeCourseTags,
} from "../../lib/gamification";
import { computeTopicMastery } from "../../lib/growthIntelligence";

type SyllabusDisplayMode = "kanban" | "table" | "matrix";

const SUGGESTED_COURSE_TAGS = [
  "systems",
  "hardware",
  "databases",
  "algorithms",
  "core-curriculum",
  "distributed-systems",
  "exam-prep",
  "lab-project",
];

interface CourseTagEditorProps {
  tags: string[];
  onChange: (nextTags: string[]) => void;
  pendingInput: string;
  onPendingInputChange: (val: string) => void;
  availableTags: string[];
}

function CourseTagEditor({
  tags,
  onChange,
  pendingInput,
  onPendingInputChange,
  availableTags,
}: CourseTagEditorProps) {
  const commitPendingTag = (rawValue: string) => {
    const incoming = normalizeCourseTags(rawValue);
    if (incoming.length === 0) {
      onPendingInputChange("");
      return;
    }
    onChange(normalizeCourseTags([...tags, ...incoming]));
    onPendingInputChange("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitPendingTag(pendingInput);
    } else if (e.key === "Backspace" && !pendingInput && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  const removeTag = (target: string) => {
    onChange(tags.filter((t) => t !== target));
  };

  const toggleSuggestedTag = (candidate: string) => {
    const clean = normalizeCourseTag(candidate);
    if (!clean) return;
    if (tags.includes(clean)) {
      removeTag(clean);
    } else {
      onChange(normalizeCourseTags([...tags, clean]));
    }
  };

  const quickPool = useMemo(() => {
    return normalizeCourseTags([...availableTags, ...SUGGESTED_COURSE_TAGS]).slice(0, 12);
  }, [availableTags]);

  return (
    <div className="flex flex-col gap-2.5">
      <label className="block font-mono text-[10px] text-outline">
        Course Tags (press Enter or comma to add)
      </label>

      {/* Current Tags + Input */}
      <div className="bg-surface-lowest border border-outline-variant/50 focus-within:border-primary rounded p-2 flex flex-col gap-2">
        {tags.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => removeTag(tag)}
                title={`Remove #${tag}`}
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-surface-high hover:bg-error-container/25 text-on-surface hover:text-error border border-outline-variant/40 font-mono text-[11px] transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <span>#{tag}</span>
                <X className="w-3 h-3 opacity-75" />
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={pendingInput}
            onChange={(e) => onPendingInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. systems, kernel, exam-prep..."
            className="flex-1 bg-transparent px-1 py-1 font-mono text-xs text-on-surface placeholder:text-outline focus:outline-none"
          />
          <button
            type="button"
            onClick={() => commitPendingTag(pendingInput)}
            disabled={!normalizeCourseTag(pendingInput)}
            className="px-2.5 py-1 rounded bg-surface-high hover:bg-surface-bright disabled:opacity-40 border border-outline-variant/40 font-mono text-[11px] text-primary transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            Add Tag
          </button>
        </div>
      </div>

      {/* Quick-Toggle Tag Suggestions */}
      {quickPool.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[10px] text-outline">Quick-toggle tags:</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {quickPool.map((suggestion) => {
              const active = tags.includes(suggestion);
              return (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => toggleSuggestedTag(suggestion)}
                  className={`px-2 py-0.5 rounded font-mono text-[10px] border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    active
                      ? "bg-primary/15 border-primary/50 text-primary font-semibold"
                      : "bg-surface-lowest border-outline-variant/30 text-outline hover:text-on-surface hover:border-outline-variant/60"
                  }`}
                >
                  {active ? `✓ #${suggestion}` : `+ #${suggestion}`}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function CourseManagerView() {
  const {
    state,
    selectedCourseId,
    setSelectedCourseId,
    activeCourseTagFilters,
    setActiveCourseTagFilters,
    courseTagMatchMode,
    setCourseTagMatchMode,
    setActiveView,
    openModuleInVault,
    createCourse,
    updateCourse,
    toggleArchiveCourse,
    deleteCourse,
    addModule,
    updateModuleStatus,
    toggleArchiveModule,
    reorderModule,
    deleteModule,
    toggleDeadline,
    addDeadline,
  } = useStudyOS();

  const [displayMode, setDisplayMode] = useState<SyllabusDisplayMode>("kanban");
  const [searchQuery, setSearchQuery] = useState("");
  const [courseFilter, setCourseFilter] = useState<string>("all");
  const [showArchived, setShowArchived] = useState<boolean>(false);
  const [showCourseDirectory, setShowCourseDirectory] = useState<boolean>(true);
  const [draggedModuleId, setDraggedModuleId] = useState<string | null>(null);
  const [confirmDeleteModuleId, setConfirmDeleteModuleId] = useState<string | null>(null);

  // Create Course Modal State
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [courseCode, setCourseCode] = useState("");
  const [courseTitle, setCourseTitle] = useState("");
  const [courseCategory, setCourseCategory] = useState("Systems Engineering");
  const [courseInstructor, setCourseInstructor] = useState("");
  const [courseAcademicYear, setCourseAcademicYear] = useState(
    state.academicProfile?.academicYear || "Year 1"
  );
  const [courseSemester, setCourseSemester] = useState(
    state.academicProfile?.semester || "Semester 1"
  );
  const [courseTagsDraft, setCourseTagsDraft] = useState<string[]>(["systems", "core-curriculum"]);
  const [courseTagPending, setCourseTagPending] = useState("");

  // Edit Course & Tags Modal State
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editInstructor, setEditInstructor] = useState("");
  const [editAcademicYear, setEditAcademicYear] = useState("");
  const [editSemester, setEditSemester] = useState("");
  const [editTagsDraft, setEditTagsDraft] = useState<string[]>([]);
  const [editTagPending, setEditTagPending] = useState("");

  // Create Module Modal State
  const [showModuleModal, setShowModuleModal] = useState(false);
  const [modCourseId, setModCourseId] = useState<string>(
    selectedCourseId || state.courses[0]?.id || ""
  );
  const [modUnitGroup, setModUnitGroup] = useState("Unit 1 · Core Foundations");
  const [modTitle, setModTitle] = useState("");
  const [modHours, setModHours] = useState("3");
  const [modVideo, setModVideo] = useState("");
  const [modTags, setModTags] = useState("consensus, systems");

  // Create Deadline Form State
  const [showDeadlineForm, setShowDeadlineForm] = useState(false);
  const [dlCourseCode, setDlCourseCode] = useState("CS-401");
  const [dlTitle, setDlTitle] = useState("");
  const [dlDue, setDlDue] = useState("In 3 Days");

  // Aggregated CourseDatabase Tags
  const allCourseTagCounts = useMemo(
    () => collectCourseTagCounts(state.courses),
    [state.courses]
  );

  const availableTagNames = useMemo(
    () => allCourseTagCounts.map((item) => item.tag),
    [allCourseTagCounts]
  );

  const archivedCount = useMemo(
    () =>
      state.courses.filter((c) => c.archived).length +
      state.modules.filter((m) => m.archived).length,
    [state.courses, state.modules]
  );

  const visibleBaseCourses = useMemo(
    () => state.courses.filter((c) => (showArchived ? true : !c.archived)),
    [state.courses, showArchived]
  );

  // Courses matching selected Course Tag Filters
  const tagMatchedCourses = useMemo(
    () => filterCoursesByTags(visibleBaseCourses, activeCourseTagFilters, courseTagMatchMode),
    [visibleBaseCourses, activeCourseTagFilters, courseTagMatchMode]
  );

  // Courses displayed in Course Directory & Matrix view
  const displayedCourses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tagMatchedCourses.filter((course) => {
      if (courseFilter !== "all" && course.id !== courseFilter) {
        return false;
      }
      if (!q) return true;
      const courseMatchesText =
        course.code.toLowerCase().includes(q) ||
        course.title.toLowerCase().includes(q) ||
        course.category.toLowerCase().includes(q) ||
        Boolean(course.semester && course.semester.toLowerCase().includes(q)) ||
        Boolean(course.academicYear && course.academicYear.toLowerCase().includes(q)) ||
        course.tags.some((t) => t.toLowerCase().includes(q));
      if (courseMatchesText) return true;
      return state.modules.some(
        (m) =>
          m.courseId === course.id &&
          (showArchived || !m.archived) &&
          (m.title.toLowerCase().includes(q) || m.tags.some((t) => t.toLowerCase().includes(q)))
      );
    });
  }, [tagMatchedCourses, courseFilter, searchQuery, state.modules, showArchived]);

  const displayedCourseIdSet = useMemo(
    () => new Set(displayedCourses.map((c) => c.id)),
    [displayedCourses]
  );

  // Filtered Modules for Kanban & Table views
  const filteredModules = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return state.modules.filter((m) => {
      if (!showArchived && m.archived) {
        return false;
      }
      if (!displayedCourseIdSet.has(m.courseId)) {
        return false;
      }
      if (!q) return true;
      const course = state.courses.find((c) => c.id === m.courseId);
      return (
        m.title.toLowerCase().includes(q) ||
        Boolean(m.unitGroup && m.unitGroup.toLowerCase().includes(q)) ||
        m.tags.some((t) => t.toLowerCase().includes(q)) ||
        Boolean(course && course.code.toLowerCase().includes(q)) ||
        Boolean(course && course.title.toLowerCase().includes(q)) ||
        Boolean(course && course.tags.some((t) => t.toLowerCase().includes(q)))
      );
    });
  }, [state.modules, state.courses, displayedCourseIdSet, searchQuery, showArchived]);

  const overallMasteryPct = useMemo(() => {
    const activeMods = state.modules.filter((m) => !m.archived);
    if (activeMods.length === 0) return 0;
    const done = activeMods.filter((m) => m.status === "Mastered").length;
    return Math.round((done / activeMods.length) * 1000) / 10;
  }, [state.modules]);

  const weeklyChartPoints = useMemo(() => {
    const vals: number[] = [];
    for (let offset = 6; offset >= 0; offset--) {
      const d = new Date();
      d.setDate(d.getDate() - offset);
      const ymd = getTodayDateString(d);
      vals.push(state.stats.weeklyMinutes[ymd] || 0);
    }
    const maxVal = Math.max(120, ...vals);
    return vals
      .map((v, i) => {
        const x = Math.round((i / 6) * 240);
        const y = Math.round(70 - (v / maxVal) * 56);
        return `${x},${y}`;
      })
      .join(" ");
  }, [state.stats.weeklyMinutes]);

  const toggleCourseTagFilter = (rawTag: string) => {
    const normalized = normalizeCourseTag(rawTag);
    if (!normalized) return;
    setActiveCourseTagFilters((prev) =>
      prev.includes(normalized) ? prev.filter((t) => t !== normalized) : [...prev, normalized]
    );
  };

  const resetAllFilters = () => {
    setActiveCourseTagFilters([]);
    setCourseFilter("all");
    setSearchQuery("");
  };

  const hasActiveFilters =
    activeCourseTagFilters.length > 0 || courseFilter !== "all" || searchQuery.trim().length > 0;

  const openEditCourseModal = (course: Course) => {
    setEditingCourse(course);
    setEditCode(course.code);
    setEditTitle(course.title);
    setEditCategory(course.category);
    setEditInstructor(course.instructor || "");
    setEditAcademicYear(course.academicYear || state.academicProfile?.academicYear || "");
    setEditSemester(course.semester || state.academicProfile?.semester || "");
    setEditTagsDraft(normalizeCourseTags(course.tags));
    setEditTagPending("");
  };

  const handleCreateCourse = (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseTitle.trim()) return;
    const mergedTags = normalizeCourseTags([
      ...courseTagsDraft,
      ...(courseTagPending.trim() ? courseTagPending.split(",") : []),
    ]);
    const created = createCourse({
      code: courseCode || "CE-405",
      title: courseTitle,
      category: courseCategory,
      instructor: courseInstructor,
      academicYear: courseAcademicYear.trim() || undefined,
      semester: courseSemester.trim() || undefined,
      tags: mergedTags,
    });
    setModCourseId(created.id);
    setCourseCode("");
    setCourseTitle("");
    setCourseInstructor("");
    setCourseTagsDraft(["systems"]);
    setCourseTagPending("");
    setShowCourseModal(false);
  };

  const handleSaveEditedCourse = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCourse || !editTitle.trim()) return;
    const mergedTags = normalizeCourseTags([
      ...editTagsDraft,
      ...(editTagPending.trim() ? editTagPending.split(",") : []),
    ]);
    updateCourse(editingCourse.id, {
      code: editCode,
      title: editTitle,
      category: editCategory,
      instructor: editInstructor,
      academicYear: editAcademicYear.trim() || undefined,
      semester: editSemester.trim() || undefined,
      tags: mergedTags,
    });
    setEditingCourse(null);
    setEditTagPending("");
  };

  const handleCreateModule = (e: React.FormEvent) => {
    e.preventDefault();
    const targetCourse = modCourseId || state.courses[0]?.id;
    if (!targetCourse || !modTitle.trim()) return;
    addModule({
      courseId: targetCourse,
      unitGroup: modUnitGroup.trim() || undefined,
      title: modTitle,
      estimatedHours: parseFloat(modHours) || 3,
      videoLink: modVideo,
      tags: modTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    });
    setModTitle("");
    setModVideo("");
    setShowModuleModal(false);
  };

  const handleCreateDeadline = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dlTitle.trim()) return;
    addDeadline({
      courseCode: dlCourseCode.trim().toUpperCase() || "CE-400",
      title: dlTitle.trim(),
      subtitle: "Scheduled Syllabus Milestone",
      dueLabel: dlDue.trim() || "Upcoming",
      urgency: "high",
    });
    setDlTitle("");
    setShowDeadlineForm(false);
  };

  const columns: ModuleStatus[] = ["To Do", "In Progress", "Mastered"];

  return (
    <div className="flex flex-col gap-5 w-full">
      {/* TOP COMMAND HEADER & TELEMETRY STRIP */}
      <section className="bg-surface-lowest border border-outline-variant/40 p-4 sm:p-5 rounded-md flex flex-col gap-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 font-mono text-xs text-outline flex-wrap tabular-nums">
              <span className="text-primary font-semibold">Course &amp; Syllabus Manager</span>
              <span>·</span>
              <span>
                {displayedCourses.length}/{state.courses.length} Courses
              </span>
              <span>·</span>
              <span>
                {filteredModules.length}/{state.modules.length} Units
              </span>
              <span>·</span>
              <span>{allCourseTagCounts.length} Tags</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-on-surface tracking-tight pt-1">
              Course &amp; Syllabus Telemetry
            </h1>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setShowCourseModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded bg-surface-high hover:bg-surface-bright border border-outline-variant/40 font-mono text-xs text-on-surface transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5 text-primary" />
              <span>New Course</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setModCourseId(
                  courseFilter !== "all"
                    ? courseFilter
                    : displayedCourses[0]?.id || selectedCourseId || state.courses[0]?.id || ""
                );
                setShowModuleModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded bg-surface-high hover:bg-surface-bright border border-outline-variant/40 font-mono text-xs text-on-surface transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5 text-secondary" />
              <span>Add Module Unit</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveView(AppView.GROKOPEDIA)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded bg-primary-container hover:bg-primary text-on-primary-container font-mono text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <BrainCircuit className="w-4 h-4" />
              <span>Generate AI Curriculum (+50 XP)</span>
            </button>
          </div>
        </div>

        {/* Search, Course Selector & View Switcher Bar */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center bg-surface-low p-2.5 rounded border border-outline-variant/30">
          {/* Search */}
          <div className="lg:col-span-4 relative flex items-center">
            <Search className="w-4 h-4 text-outline absolute left-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search courses, modules, or #tags..."
              className="w-full bg-surface-lowest border border-outline-variant/40 focus:border-primary rounded pl-9 pr-8 py-1.5 font-mono text-xs text-on-surface placeholder:text-outline focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                title="Clear search"
                className="absolute right-2.5 text-outline hover:text-on-surface cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Course Selector */}
          <div className="lg:col-span-3">
            <select
              value={courseFilter}
              onChange={(e) => {
                setCourseFilter(e.target.value);
                if (e.target.value !== "all") setSelectedCourseId(e.target.value);
              }}
              className="w-full bg-surface-lowest border border-outline-variant/40 focus:border-primary rounded px-3 py-1.5 font-mono text-xs text-on-surface focus:outline-none cursor-pointer"
            >
              <option value="all">All Matching Courses ({tagMatchedCourses.length})</option>
              {tagMatchedCourses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.title}
                </option>
              ))}
            </select>
          </div>

          {/* View Mode Segmented Switcher */}
          <div className="lg:col-span-3 flex items-center gap-1 bg-surface-lowest p-1 rounded border border-outline-variant/30">
            {(
              [
                { id: "kanban", label: "Kanban", icon: Kanban },
                { id: "table", label: "Table", icon: Table2 },
                { id: "matrix", label: "Matrix", icon: LayoutList },
              ] as const
            ).map((mode) => {
              const Icon = mode.icon;
              return (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setDisplayMode(mode.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1 px-2 rounded font-mono text-[11px] transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    displayMode === mode.id
                      ? "bg-primary-container text-on-primary-container font-semibold"
                      : "text-on-surface-variant hover:text-on-surface"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{mode.label}</span>
                </button>
              );
            })}
          </div>

          {/* Mastery Progress */}
          <div className="lg:col-span-2 flex items-center justify-between gap-2 bg-surface-lowest px-3 py-1.5 rounded border border-outline-variant/30 tabular-nums">
            <div>
              <div className="font-mono text-[10px] text-outline">Mastery</div>
              <div className="font-mono text-xs font-bold text-primary">{overallMasteryPct}%</div>
            </div>
            <div className="w-16 bg-surface-highest h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-primary h-full rounded-full"
                style={{ width: `${overallMasteryPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* COURSE TAG FILTER BAR */}
        <div className="bg-surface-low p-3 rounded border border-outline-variant/30 flex flex-col gap-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-mono text-xs text-on-surface-variant">
              <Tag className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="font-medium text-on-surface">Filter Courses by Tag</span>
              {activeCourseTagFilters.length > 0 && (
                <span className="text-primary tabular-nums">
                  · {activeCourseTagFilters.length} selected ({displayedCourses.length} matching{" "}
                  {displayedCourses.length === 1 ? "course" : "courses"})
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Match Any / Match All Segmented Control */}
              <div className="flex items-center gap-1 bg-surface-lowest p-0.5 rounded border border-outline-variant/30">
                {(
                  [
                    { id: "any", label: "Match Any" },
                    { id: "all", label: "Match All" },
                  ] as const
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setCourseTagMatchMode(mode.id)}
                    className={`px-2 py-0.5 rounded font-mono text-[10px] transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      courseTagMatchMode === mode.id
                        ? "bg-surface-high text-primary font-semibold"
                        : "text-outline hover:text-on-surface"
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>

              {archivedCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowArchived((prev) => !prev)}
                  className={`px-2.5 py-1 rounded border font-mono text-[11px] cursor-pointer whitespace-nowrap shrink-0 ${
                    showArchived
                      ? "bg-secondary/20 border-secondary text-secondary font-semibold"
                      : "bg-surface-lowest border-outline-variant/40 text-outline hover:text-on-surface"
                  }`}
                >
                  {showArchived ? `Showing Archived (${archivedCount})` : `Show Archived (${archivedCount})`}
                </button>
              )}

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="px-2.5 py-1 rounded bg-surface-lowest hover:bg-surface-high border border-outline-variant/40 font-mono text-[11px] text-secondary transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>

          {/* Interactive Tag Filter Buttons */}
          {allCourseTagCounts.length === 0 ? (
            <div className="font-mono text-xs text-outline">
              No course tags yet. Click &ldquo;Edit Tags&rdquo; on any course below to add tags.
            </div>
          ) : (
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setActiveCourseTagFilters([])}
                className={`px-2.5 py-1 rounded font-mono text-[11px] border transition-colors cursor-pointer whitespace-nowrap shrink-0 tabular-nums ${
                  activeCourseTagFilters.length === 0
                    ? "bg-primary-container text-on-primary-container border-primary-container font-semibold"
                    : "bg-surface-lowest border-outline-variant/35 text-on-surface-variant hover:text-on-surface hover:border-outline-variant/70"
                }`}
              >
                All Courses ({state.courses.length})
              </button>

              {allCourseTagCounts.map(({ tag, count }) => {
                const isSelected = activeCourseTagFilters.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleCourseTagFilter(tag)}
                    className={`px-2.5 py-1 rounded font-mono text-[11px] border transition-colors cursor-pointer whitespace-nowrap shrink-0 tabular-nums ${
                      isSelected
                        ? "bg-primary/20 border-primary text-primary font-semibold"
                        : "bg-surface-lowest border-outline-variant/35 text-on-surface-variant hover:text-on-surface hover:border-outline-variant/70"
                    }`}
                  >
                    #{tag} <span className="opacity-75">({count})</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* FILTERED COURSE DATABASE DIRECTORY (Hidden in Matrix view since Matrix renders full course trees directly) */}
      {displayMode !== "matrix" && (
        <section className="bg-surface-lowest border border-outline-variant/40 rounded-md p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="text-sm font-semibold text-on-surface">
                Filtered Courses
              </h2>
              <span className="font-mono text-xs text-outline tabular-nums">
                · Showing {displayedCourses.length} of {state.courses.length}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setShowCourseDirectory((prev) => !prev)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-surface-low hover:bg-surface-high border border-outline-variant/30 font-mono text-[11px] text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>{showCourseDirectory ? "Collapse Courses" : "Expand Courses"}</span>
              {showCourseDirectory ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          {showCourseDirectory && (
            <>
              {displayedCourses.length === 0 ? (
                <div className="py-8 px-4 text-center border border-dashed border-outline-variant/40 rounded flex flex-col items-center gap-2.5">
                  <p className="text-sm text-on-surface">
                    No courses match the selected tag filter criteria.
                  </p>
                  <p className="font-mono text-xs text-outline">
                    Try switching to &ldquo;Match Any&rdquo; or clearing active tag filters.
                  </p>
                  <button
                    type="button"
                    onClick={resetAllFilters}
                    className="px-3.5 py-1.5 rounded bg-primary-container text-on-primary-container font-mono text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    Reset Filters
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                  {displayedCourses.map((course) => {
                    const pct =
                      course.totalUnits > 0
                        ? Math.round((course.completedUnits / course.totalUnits) * 100)
                        : 0;
                    const isFocused = courseFilter === course.id;

                    return (
                      <article
                        key={course.id}
                        className={`bg-surface-low hover:bg-surface-container border rounded p-3.5 flex flex-col justify-between gap-3 transition-colors ${
                          isFocused ? "border-primary" : "border-outline-variant/35"
                        }`}
                      >
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center justify-between gap-2 font-mono text-[11px] text-outline tabular-nums">
                            <span className="text-primary font-bold truncate">
                              {course.code} · {course.category}
                              {course.archived ? " [ARCHIVED]" : ""}
                            </span>
                            <span className="shrink-0">
                              {course.completedUnits}/{course.totalUnits} ({pct}%)
                            </span>
                          </div>
                          {(course.academicYear || course.semester) && (
                            <div className="font-mono text-[10px] text-outline">
                              {[course.academicYear, course.semester].filter(Boolean).join(" · ")}
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              setCourseFilter((prev) => (prev === course.id ? "all" : course.id));
                              setSelectedCourseId(course.id);
                            }}
                            className="text-left text-sm font-semibold text-on-surface hover:text-primary transition-colors leading-snug cursor-pointer"
                          >
                            {course.title}
                          </button>

                          {/* Unboxed Clean Course Tags Metadata */}
                          <div className="font-mono text-[11px] text-outline leading-relaxed pt-0.5">
                            {course.tags.length > 0 ? (
                              course.tags.map((tag, idx) => {
                                const isActiveTag = activeCourseTagFilters.includes(tag);
                                return (
                                  <React.Fragment key={tag}>
                                    {idx > 0 && <span className="mx-1 text-outline/60">·</span>}
                                    <button
                                      type="button"
                                      onClick={() => toggleCourseTagFilter(tag)}
                                      className={`hover:text-primary transition-colors cursor-pointer ${
                                        isActiveTag ? "text-primary font-semibold underline" : ""
                                      }`}
                                      title={`Filter by #${tag}`}
                                    >
                                      #{tag}
                                    </button>
                                  </React.Fragment>
                                );
                              })
                            ) : (
                              <span className="italic text-outline/75">No tags assigned</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-outline-variant/25">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditCourseModal(course)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-surface-lowest hover:bg-surface-high border border-outline-variant/40 font-mono text-[11px] text-on-surface transition-colors cursor-pointer whitespace-nowrap shrink-0"
                            >
                              <Pencil className="w-3 h-3 text-primary" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleArchiveCourse(course.id)}
                              title={
                                course.archived
                                  ? "Restore Course to Active Syllabus"
                                  : "Archive Course (preserves historical attempts & notes)"
                              }
                              className="p-1.5 rounded bg-surface-lowest hover:bg-surface-high border border-outline-variant/40 text-outline hover:text-secondary cursor-pointer shrink-0"
                            >
                              {course.archived ? (
                                <ArchiveRestore className="w-3.5 h-3.5" />
                              ) : (
                                <Archive className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              setCourseFilter((prev) => (prev === course.id ? "all" : course.id))
                            }
                            className={`px-2.5 py-1 rounded font-mono text-[11px] transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                              isFocused
                                ? "bg-primary/20 text-primary font-semibold"
                                : "text-outline hover:text-on-surface"
                            }`}
                          >
                            {isFocused ? "Focused ✓" : "Focus Units"}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* VIEW 1: KANBAN BOARD */}
      {displayMode === "kanban" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          {columns.map((status) => {
            const colModules = filteredModules.filter((m) => m.status === status);
            const totalHours = colModules.reduce((acc, m) => acc + m.estimatedHours, 0);
            const headerAccent =
              status === "Mastered"
                ? "text-tertiary"
                : status === "In Progress"
                ? "text-primary"
                : "text-secondary";

            return (
              <div
                key={status}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (draggedModuleId) {
                    updateModuleStatus(draggedModuleId, status);
                    setDraggedModuleId(null);
                  }
                }}
                className="bg-surface-lowest border border-outline-variant/40 rounded-md p-3.5 flex flex-col gap-3 min-h-[420px]"
              >
                <div className="flex items-center justify-between pb-2 border-b border-outline-variant/30">
                  <div className="flex items-center gap-2">
                    <span className={`font-mono text-xs font-bold ${headerAccent}`}>
                      {status}
                    </span>
                    <span className="font-mono text-[11px] text-outline tabular-nums">
                      ({colModules.length})
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-outline tabular-nums">
                    {totalHours.toFixed(1)}h est
                  </span>
                </div>

                {colModules.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center py-12 text-center px-4 border border-dashed border-outline-variant/30 rounded">
                    <p className="font-mono text-xs text-outline">No units in {status}</p>
                    <p className="text-[11px] text-outline/80 pt-1">
                      {hasActiveFilters
                        ? "Adjust course tag filters above or drag a module here."
                        : "Drag a card here or update status on any unit."}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {colModules.map((mod) => {
                      const course = state.courses.find((c) => c.id === mod.courseId);
                      const words = countWords(mod.notesMarkdown);
                      const mastery = computeTopicMastery(mod.id, state);
                      return (
                        <article
                          key={mod.id}
                          draggable
                          onDragStart={() => setDraggedModuleId(mod.id)}
                          className="bg-surface-low hover:bg-surface-container border border-outline-variant/35 hover:border-primary/40 rounded p-3 flex flex-col gap-2.5 transition-colors cursor-grab active:cursor-grabbing"
                        >
                          <div className="flex items-center justify-between gap-2 font-mono text-[10px] text-outline">
                            <span className="text-primary font-bold truncate">
                              {course?.code || "COURSE"}
                              {mod.unitGroup ? ` · ${mod.unitGroup}` : ""}
                              {mod.archived ? " [ARCHIVED]" : ""}
                            </span>
                            <span className="tabular-nums flex items-center gap-1 shrink-0">
                              <Clock className="w-3 h-3" />
                              {mod.estimatedHours}h · {words}w
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => openModuleInVault(mod.id)}
                            className="text-left text-[13.5px] font-semibold text-on-surface hover:text-primary transition-colors leading-snug cursor-pointer"
                          >
                            {mod.title}
                          </button>

                          <div className="font-mono text-[10px] flex items-center justify-between gap-2">
                            <span
                              className={
                                mastery.level === "verified_mastery" || mastery.level === "proficient"
                                  ? "text-tertiary"
                                  : mastery.level === "insufficient_evidence"
                                  ? "text-outline"
                                  : "text-secondary"
                              }
                            >
                              Evidence: {mastery.label}
                            </span>
                            <span className="tabular-nums text-outline shrink-0">
                              {mod.resources.length + (mod.videoLink ? 1 : 0) === 0 ? (
                                <span className="text-secondary">Uncovered topic</span>
                              ) : (
                                `${mod.resources.length + (mod.videoLink ? 1 : 0)} src`
                              )}
                            </span>
                          </div>

                          {mod.tags.length > 0 && (
                            <div className="font-mono text-[10px] text-outline truncate">
                              {mod.tags.map((t) => `#${t}`).join(" · ")}
                            </div>
                          )}

                          <div className="flex items-center justify-between pt-1.5 border-t border-outline-variant/25 gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => openModuleInVault(mod.id)}
                              className="flex items-center gap-1 px-2 py-1 rounded bg-surface-high hover:bg-surface-bright font-mono text-[10px] text-on-surface cursor-pointer whitespace-nowrap shrink-0"
                            >
                              <FolderKanban className="w-3 h-3 text-primary" />
                              <span>Vault</span>
                              {mod.videoLink && <Video className="w-3 h-3 text-secondary ml-0.5" />}
                            </button>

                            <div className="flex items-center gap-1">
                              {status !== "To Do" && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateModuleStatus(
                                      mod.id,
                                      status === "Mastered" ? "In Progress" : "To Do"
                                    )
                                  }
                                  className="px-2 py-1 rounded bg-surface-lowest hover:bg-surface-high font-mono text-[10px] text-outline hover:text-on-surface cursor-pointer whitespace-nowrap shrink-0"
                                >
                                  ←
                                </button>
                              )}
                              {status === "To Do" && (
                                <button
                                  type="button"
                                  onClick={() => updateModuleStatus(mod.id, "In Progress")}
                                  className="px-2 py-1 rounded bg-primary/15 hover:bg-primary/25 text-primary font-mono text-[10px] font-semibold cursor-pointer whitespace-nowrap shrink-0"
                                >
                                  Start →
                                </button>
                              )}
                              {status !== "Mastered" && (
                                <button
                                  type="button"
                                  onClick={() => updateModuleStatus(mod.id, "Mastered")}
                                  className="px-2 py-1 rounded bg-tertiary/15 hover:bg-tertiary/25 text-tertiary font-mono text-[10px] font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0"
                                >
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>Master (+100 XP)</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* VIEW 2: HIGH-DENSITY TABLE VIEW */}
      {displayMode === "table" && (
        <div className="bg-surface-lowest border border-outline-variant/40 rounded-md overflow-hidden">
          {filteredModules.length === 0 ? (
            <div className="py-12 px-4 text-center flex flex-col items-center gap-2.5">
              <p className="text-sm text-on-surface">
                No syllabus modules match your active course tag or search filters.
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="px-3.5 py-1.5 rounded bg-primary-container text-on-primary-container font-mono text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  Reset Filters
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-surface-low border-b border-outline-variant/40 font-mono text-[11px] text-outline">
                  <tr>
                    <th className="py-3 px-4">Course &amp; Tags</th>
                    <th className="py-3 px-4">Unit / Topic</th>
                    <th className="py-3 px-4">Workflow Status</th>
                    <th className="py-3 px-4">Empirical Mastery</th>
                    <th className="py-3 px-4 text-right">Est. Hours</th>
                    <th className="py-3 px-4 text-right">Vault Words</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/25 text-[13px]">
                  {filteredModules.map((mod) => {
                    const course = state.courses.find((c) => c.id === mod.courseId);
                    const words = countWords(mod.notesMarkdown);
                    const mastery = computeTopicMastery(mod.id, state);
                    return (
                      <tr key={mod.id} className="hover:bg-surface-low/80 transition-colors">
                        <td className="py-2.5 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-bold text-primary">
                              {course?.code || "CE"}
                            </span>
                            {course && (
                              <button
                                type="button"
                                onClick={() => openEditCourseModal(course)}
                                title={`Edit tags for ${course.code}`}
                                className="text-outline hover:text-primary cursor-pointer"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                          {course && course.tags.length > 0 && (
                            <div className="font-mono text-[10px] text-outline">
                              {course.tags.slice(0, 2).map((t) => `#${t}`).join(" · ")}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-4">
                          {mod.unitGroup && (
                            <div className="font-mono text-[10px] text-outline">{mod.unitGroup}</div>
                          )}
                          <button
                            type="button"
                            onClick={() => openModuleInVault(mod.id)}
                            className="font-medium text-on-surface hover:text-primary text-left cursor-pointer"
                          >
                            {mod.title}
                            {mod.archived ? " [Archived]" : ""}
                          </button>
                          {mod.tags.length > 0 && (
                            <div className="font-mono text-[10px] text-outline">
                              {mod.tags.map((t) => `#${t}`).join(" · ")}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-4">
                          <select
                            value={mod.status}
                            onChange={(e) =>
                              updateModuleStatus(mod.id, e.target.value as ModuleStatus)
                            }
                            className={`bg-surface-high border border-outline-variant/40 rounded px-2 py-1 font-mono text-xs focus:outline-none cursor-pointer ${
                              mod.status === "Mastered"
                                ? "text-tertiary"
                                : mod.status === "In Progress"
                                ? "text-primary"
                                : "text-secondary"
                            }`}
                          >
                            <option value="To Do">To Do</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Mastered">Mastered (+100 XP)</option>
                          </select>
                        </td>
                        <td className="py-2.5 px-4 font-mono text-xs tabular-nums">
                          <span
                            className={
                              mastery.level === "verified_mastery" || mastery.level === "proficient"
                                ? "text-tertiary"
                                : mastery.level === "insufficient_evidence"
                                ? "text-outline"
                                : "text-secondary"
                            }
                          >
                            {mastery.label}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-xs text-on-surface-variant tabular-nums">
                          {mod.estimatedHours}h
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-xs text-on-surface-variant tabular-nums">
                          <div>{words}w</div>
                          <div className="text-[10px] text-outline">
                            {mod.resources.length + (mod.videoLink ? 1 : 0) === 0 ? (
                              <span className="text-secondary">Uncovered topic</span>
                            ) : (
                              `${mod.resources.length + (mod.videoLink ? 1 : 0)} resources`
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-right whitespace-nowrap">
                          {confirmDeleteModuleId === mod.id ? (
                            <div className="inline-flex items-center gap-1.5 font-mono text-[11px]">
                              <span className="text-error">Has linked notes/data:</span>
                              <button
                                type="button"
                                onClick={() => {
                                  toggleArchiveModule(mod.id);
                                  setConfirmDeleteModuleId(null);
                                }}
                                className="px-2 py-1 rounded bg-surface-high text-secondary cursor-pointer"
                              >
                                Archive Safe
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  deleteModule(mod.id);
                                  setConfirmDeleteModuleId(null);
                                }}
                                className="px-2 py-1 rounded bg-error text-on-error font-semibold cursor-pointer"
                              >
                                Force Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteModuleId(null)}
                                className="px-1.5 py-1 text-outline hover:text-on-surface cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => reorderModule(mod.id, "up")}
                                title="Move Topic Up"
                                className="p-1 rounded text-outline hover:text-primary cursor-pointer"
                              >
                                <ChevronUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => reorderModule(mod.id, "down")}
                                title="Move Topic Down"
                                className="p-1 rounded text-outline hover:text-primary cursor-pointer"
                              >
                                <ChevronDown className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openModuleInVault(mod.id)}
                                className="px-2.5 py-1 rounded bg-primary-container/20 hover:bg-primary-container text-primary hover:text-on-primary-container font-mono text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                              >
                                Open Vault
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleArchiveModule(mod.id)}
                                title={
                                  mod.archived
                                    ? "Restore Module"
                                    : "Archive Module (preserves notes & attempts)"
                                }
                                className="p-1.5 rounded text-outline hover:text-secondary transition-colors cursor-pointer"
                              >
                                {mod.archived ? (
                                  <ArchiveRestore className="w-3.5 h-3.5" />
                                ) : (
                                  <Archive className="w-3.5 h-3.5" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const hasDeps =
                                    words >= 30 ||
                                    mod.resources.length > 0 ||
                                    Boolean(mod.videoLink) ||
                                    state.assessmentAttempts.some((a) => a.moduleId === mod.id);
                                  if (hasDeps) {
                                    setConfirmDeleteModuleId(mod.id);
                                  } else {
                                    deleteModule(mod.id);
                                  }
                                }}
                                title="Delete Module"
                                className="p-1.5 rounded text-outline hover:text-error hover:bg-error-container/20 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* VIEW 3: COURSE MATRIX + CHRONO DEADLINES */}
      {displayMode === "matrix" && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          {/* Left 8 Cols: Course Check-Trees */}
          <div className="xl:col-span-8 flex flex-col gap-4">
            {displayedCourses.length === 0 ? (
              <div className="bg-surface-lowest border border-outline-variant/40 rounded-md p-8 text-center flex flex-col items-center gap-3">
                <p className="text-sm text-on-surface">
                  No courses match the selected tag filter criteria.
                </p>
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="px-4 py-1.5 rounded bg-primary-container text-on-primary-container font-mono text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  Reset Filters
                </button>
              </div>
            ) : (
              displayedCourses.map((course) => {
                const cMods = state.modules.filter((m) => m.courseId === course.id);
                const pct =
                  course.totalUnits > 0
                    ? Math.round((course.completedUnits / course.totalUnits) * 100)
                    : 0;
                return (
                  <article
                    key={course.id}
                    className="bg-surface-lowest border border-outline-variant/40 rounded-md p-4 sm:p-5 flex flex-col gap-4"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-outline-variant/30">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 font-mono text-xs text-outline flex-wrap">
                          <span className="text-primary font-bold">{course.code}</span>
                          <span>·</span>
                          <span>{course.category}</span>
                          {course.instructor && (
                            <>
                              <span>·</span>
                              <span>{course.instructor}</span>
                            </>
                          )}
                        </div>
                        <h2 className="text-lg font-semibold text-on-surface pt-0.5">
                          {course.title}
                        </h2>

                        {/* Clean Unboxed Course Tags */}
                        <div className="font-mono text-[11px] text-outline pt-1.5 flex items-center gap-1 flex-wrap">
                          {course.tags.length > 0 ? (
                            course.tags.map((tag, idx) => {
                              const isActiveTag = activeCourseTagFilters.includes(tag);
                              return (
                                <React.Fragment key={tag}>
                                  {idx > 0 && <span className="text-outline/60">·</span>}
                                  <button
                                    type="button"
                                    onClick={() => toggleCourseTagFilter(tag)}
                                    className={`hover:text-primary transition-colors cursor-pointer ${
                                      isActiveTag ? "text-primary font-semibold underline" : ""
                                    }`}
                                  >
                                    #{tag}
                                  </button>
                                </React.Fragment>
                              );
                            })
                          ) : (
                            <span className="italic text-outline/75">No course tags</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-start shrink-0">
                        <div className="px-3 py-1.5 rounded bg-surface-low border border-outline-variant/40 font-mono text-xs font-bold text-primary tabular-nums">
                          {pct}%
                        </div>
                        <button
                          type="button"
                          onClick={() => openEditCourseModal(course)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-surface-low hover:bg-surface-high text-on-surface-variant hover:text-primary border border-outline-variant/30 font-mono text-xs cursor-pointer whitespace-nowrap shrink-0"
                          title="Edit Course & Tags"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span>Edit Tags</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setModCourseId(course.id);
                            setShowModuleModal(true);
                          }}
                          className="p-2 rounded bg-surface-low hover:bg-surface-high text-on-surface-variant hover:text-primary border border-outline-variant/30 cursor-pointer"
                          title="Add Unit to Course"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                        {state.courses.length > 1 && (
                          <button
                            type="button"
                            onClick={() => deleteCourse(course.id)}
                            className="p-2 rounded bg-surface-low hover:bg-error-container/25 text-outline hover:text-error border border-outline-variant/30 cursor-pointer"
                            title="Delete Course"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Interactive Module Check-Tree */}
                    {cMods.length === 0 ? (
                      <div className="py-4 px-3 rounded border border-dashed border-outline-variant/30 flex items-center justify-between gap-2 font-mono text-xs text-outline">
                        <span>No syllabus units added to this course yet.</span>
                        <button
                          type="button"
                          onClick={() => {
                            setModCourseId(course.id);
                            setShowModuleModal(true);
                          }}
                          className="text-primary hover:underline cursor-pointer whitespace-nowrap"
                        >
                          + Add First Unit
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {cMods.map((m) => {
                          const isDone = m.status === "Mastered";
                          return (
                            <div
                              key={m.id}
                              className="bg-surface-low hover:bg-surface-container border border-outline-variant/30 p-2.5 rounded flex items-center justify-between gap-2 transition-colors"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateModuleStatus(m.id, isDone ? "In Progress" : "Mastered")
                                  }
                                  className="text-primary hover:scale-105 transition-transform cursor-pointer shrink-0"
                                  title={isDone ? "Mark In Progress" : "Mark Mastered (+100 XP)"}
                                >
                                  {isDone ? (
                                    <CheckSquare className="w-4 h-4 text-tertiary" />
                                  ) : (
                                    <Square className="w-4 h-4 text-outline" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openModuleInVault(m.id)}
                                  className={`font-mono text-xs truncate text-left hover:text-primary cursor-pointer ${
                                    isDone ? "text-on-surface-variant line-through" : "text-on-surface"
                                  }`}
                                >
                                  {m.title}
                                </button>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="font-mono text-[10px] text-outline tabular-nums">
                                  {m.resources.length + (m.videoLink ? 1 : 0) === 0 ? (
                                    <span className="text-secondary">Uncovered</span>
                                  ) : (
                                    `${m.resources.length + (m.videoLink ? 1 : 0)} src`
                                  )}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => reorderModule(m.id, "up")}
                                  className="text-outline hover:text-primary cursor-pointer"
                                  title="Move Topic Up"
                                >
                                  <ChevronUp className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => reorderModule(m.id, "down")}
                                  className="text-outline hover:text-primary cursor-pointer"
                                  title="Move Topic Down"
                                >
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openModuleInVault(m.id)}
                                  className="text-outline hover:text-primary cursor-pointer"
                                  title="Open in Knowledge Vault"
                                >
                                  <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </div>

          {/* Right 4 Cols: Deadlines & Weekly Effort SVG Chart */}
          <aside className="xl:col-span-4 flex flex-col gap-4">
            <div className="bg-surface-lowest border border-outline-variant/40 rounded-md p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-on-surface-variant flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-secondary" />
                  Academic Deadlines
                </span>
                <button
                  type="button"
                  onClick={() => setShowDeadlineForm(!showDeadlineForm)}
                  className="font-mono text-[11px] text-primary hover:underline cursor-pointer whitespace-nowrap"
                >
                  + Add
                </button>
              </div>

              {showDeadlineForm && (
                <form
                  onSubmit={handleCreateDeadline}
                  className="bg-surface-low p-3 rounded border border-outline-variant/40 flex flex-col gap-2"
                >
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={dlCourseCode}
                      onChange={(e) => setDlCourseCode(e.target.value)}
                      placeholder="CS-401"
                      className="bg-surface-lowest border border-outline-variant/40 rounded px-2 py-1 font-mono text-xs text-on-surface"
                    />
                    <input
                      type="text"
                      value={dlDue}
                      onChange={(e) => setDlDue(e.target.value)}
                      placeholder="Due Friday"
                      className="bg-surface-lowest border border-outline-variant/40 rounded px-2 py-1 font-mono text-xs text-on-surface"
                    />
                  </div>
                  <input
                    type="text"
                    value={dlTitle}
                    onChange={(e) => setDlTitle(e.target.value)}
                    placeholder="Milestone title..."
                    className="bg-surface-lowest border border-outline-variant/40 rounded px-2 py-1.5 text-xs text-on-surface"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1 rounded bg-primary-container text-on-primary-container font-mono text-xs font-semibold cursor-pointer"
                  >
                    Save Deadline
                  </button>
                </form>
              )}

              <div className="flex flex-col gap-2">
                {state.deadlines.map((dl) => (
                  <div
                    key={dl.id}
                    onClick={() => toggleDeadline(dl.id)}
                    className="bg-surface-low hover:bg-surface-container border border-outline-variant/30 p-2.5 rounded flex items-center justify-between gap-2 cursor-pointer transition-colors"
                  >
                    <div className="min-w-0">
                      <div
                        className={`font-mono text-xs font-semibold truncate ${
                          dl.completed ? "line-through text-outline" : "text-on-surface"
                        }`}
                      >
                        {dl.courseCode} · {dl.title}
                      </div>
                      <div className="font-mono text-[10px] text-outline truncate">{dl.subtitle}</div>
                    </div>
                    <span
                      className={`font-mono text-[11px] font-bold shrink-0 ${
                        dl.completed ? "text-tertiary" : "text-secondary"
                      }`}
                    >
                      {dl.completed ? "Done" : dl.dueLabel}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Effort vs Readiness SVG Chart */}
            <div className="bg-surface-lowest border border-outline-variant/40 rounded-md p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between font-mono text-xs">
                <span className="text-on-surface-variant">Weekly Effort Trajectory</span>
                <span className="text-primary font-bold tabular-nums">{overallMasteryPct}% Ready</span>
              </div>
              <div className="bg-surface-low p-3 rounded border border-outline-variant/30">
                <svg className="w-full h-24 text-primary" viewBox="0 0 240 80" fill="none">
                  <line
                    x1="0"
                    y1="20"
                    x2="240"
                    y2="20"
                    stroke="currentColor"
                    strokeOpacity="0.1"
                    strokeDasharray="3 3"
                  />
                  <line
                    x1="0"
                    y1="50"
                    x2="240"
                    y2="50"
                    stroke="currentColor"
                    strokeOpacity="0.1"
                    strokeDasharray="3 3"
                  />
                  <polyline
                    points={weeklyChartPoints}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <div className="flex justify-between font-mono text-[10px] text-outline pt-1 tabular-nums">
                  <span>-6d</span>
                  <span>-4d</span>
                  <span>-2d</span>
                  <span className="text-primary font-semibold">Today</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* CREATE COURSE MODAL */}
      {showCourseModal && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs"
          onClick={() => setShowCourseModal(false)}
        >
          <form
            onSubmit={handleCreateCourse}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-surface-low border border-outline-variant/60 rounded-lg p-5 flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-on-surface">Create New Course</h3>
              <button
                type="button"
                onClick={() => setShowCourseModal(false)}
                className="text-outline hover:text-on-surface cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block font-mono text-[10px] text-outline mb-1">Code</label>
                <input
                  type="text"
                  required
                  value={courseCode}
                  onChange={(e) => setCourseCode(e.target.value)}
                  placeholder="CS-450"
                  className="w-full bg-surface-lowest border border-outline-variant/50 rounded px-2.5 py-2 font-mono text-xs text-on-surface focus:outline-none focus:border-primary"
                />
              </div>
              <div className="col-span-2">
                <label className="block font-mono text-[10px] text-outline mb-1">Category</label>
                <input
                  type="text"
                  value={courseCategory}
                  onChange={(e) => setCourseCategory(e.target.value)}
                  placeholder="Systems Engineering"
                  className="w-full bg-surface-lowest border border-outline-variant/50 rounded px-2.5 py-2 text-xs text-on-surface focus:outline-none focus:border-primary"
                />
              </div>
            </div>
            <div>
              <label className="block font-mono text-[10px] text-outline mb-1">
                Course Title
              </label>
              <input
                type="text"
                required
                value={courseTitle}
                onChange={(e) => setCourseTitle(e.target.value)}
                placeholder="Operating System Kernels & Virtualization"
                className="w-full bg-surface-lowest border border-outline-variant/50 rounded px-3 py-2 text-xs text-on-surface focus:outline-none focus:border-primary"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-mono text-[10px] text-outline mb-1">
                  Academic Year
                </label>
                <input
                  type="text"
                  value={courseAcademicYear}
                  onChange={(e) => setCourseAcademicYear(e.target.value)}
                  placeholder="Year 2 (2025/26)"
                  className="w-full bg-surface-lowest border border-outline-variant/50 rounded px-3 py-2 text-xs text-on-surface focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block font-mono text-[10px] text-outline mb-1">
                  Semester / Term
                </label>
                <input
                  type="text"
                  value={courseSemester}
                  onChange={(e) => setCourseSemester(e.target.value)}
                  placeholder="Semester 1"
                  className="w-full bg-surface-lowest border border-outline-variant/50 rounded px-3 py-2 text-xs text-on-surface focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block font-mono text-[10px] text-outline mb-1">
                  Instructor (Optional)
                </label>
                <input
                  type="text"
                  value={courseInstructor}
                  onChange={(e) => setCourseInstructor(e.target.value)}
                  placeholder="Prof. R. Morris"
                  className="w-full bg-surface-lowest border border-outline-variant/50 rounded px-3 py-2 text-xs text-on-surface focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            <CourseTagEditor
              tags={courseTagsDraft}
              onChange={setCourseTagsDraft}
              pendingInput={courseTagPending}
              onPendingInputChange={setCourseTagPending}
              availableTags={availableTagNames}
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCourseModal(false)}
                className="px-3 py-1.5 rounded font-mono text-xs text-outline hover:text-on-surface cursor-pointer whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded bg-primary-container text-on-primary-container font-mono text-xs font-bold cursor-pointer whitespace-nowrap"
              >
                Create Course
              </button>
            </div>
          </form>
        </div>
      )}

      {/* EDIT COURSE & TAGS MODAL */}
      {editingCourse && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs"
          onClick={() => setEditingCourse(null)}
        >
          <form
            onSubmit={handleSaveEditedCourse}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-surface-low border border-outline-variant/60 rounded-lg p-5 flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-on-surface">
                  Edit Course &amp; Tags
                </h3>
                <p className="font-mono text-[11px] text-outline">
                  Update tags and metadata in CourseDatabase
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingCourse(null)}
                className="text-outline hover:text-on-surface cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <CourseTagEditor
              tags={editTagsDraft}
              onChange={setEditTagsDraft}
              pendingInput={editTagPending}
              onPendingInputChange={setEditTagPending}
              availableTags={availableTagNames}
            />

            <div className="grid grid-cols-3 gap-3 pt-1 border-t border-outline-variant/30">
              <div>
                <label className="block font-mono text-[10px] text-outline mb-1">Code</label>
                <input
                  type="text"
                  required
                  value={editCode}
                  onChange={(e) => setEditCode(e.target.value)}
                  className="w-full bg-surface-lowest border border-outline-variant/50 rounded px-2.5 py-2 font-mono text-xs text-on-surface focus:outline-none focus:border-primary"
                />
              </div>
              <div className="col-span-2">
                <label className="block font-mono text-[10px] text-outline mb-1">Category</label>
                <input
                  type="text"
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  className="w-full bg-surface-lowest border border-outline-variant/50 rounded px-2.5 py-2 text-xs text-on-surface focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            <div>
              <label className="block font-mono text-[10px] text-outline mb-1">
                Course Title
              </label>
              <input
                type="text"
                required
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="w-full bg-surface-lowest border border-outline-variant/50 rounded px-3 py-2 text-xs text-on-surface focus:outline-none focus:border-primary"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-mono text-[10px] text-outline mb-1">
                  Academic Year
                </label>
                <input
                  type="text"
                  value={editAcademicYear}
                  onChange={(e) => setEditAcademicYear(e.target.value)}
                  placeholder="Year 2"
                  className="w-full bg-surface-lowest border border-outline-variant/50 rounded px-3 py-2 text-xs text-on-surface focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block font-mono text-[10px] text-outline mb-1">
                  Semester / Term
                </label>
                <input
                  type="text"
                  value={editSemester}
                  onChange={(e) => setEditSemester(e.target.value)}
                  placeholder="Semester 1"
                  className="w-full bg-surface-lowest border border-outline-variant/50 rounded px-3 py-2 text-xs text-on-surface focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block font-mono text-[10px] text-outline mb-1">
                  Instructor / Source
                </label>
                <input
                  type="text"
                  value={editInstructor}
                  onChange={(e) => setEditInstructor(e.target.value)}
                  className="w-full bg-surface-lowest border border-outline-variant/50 rounded px-3 py-2 text-xs text-on-surface focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingCourse(null)}
                className="px-3 py-1.5 rounded font-mono text-xs text-outline hover:text-on-surface cursor-pointer whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded bg-primary-container text-on-primary-container font-mono text-xs font-bold cursor-pointer whitespace-nowrap"
              >
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ADD MODULE MODAL */}
      {showModuleModal && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs"
          onClick={() => setShowModuleModal(false)}
        >
          <form
            onSubmit={handleCreateModule}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-surface-low border border-outline-variant/60 rounded-lg p-5 flex flex-col gap-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-on-surface">Add Syllabus Module Unit</h3>
              <button
                type="button"
                onClick={() => setShowModuleModal(false)}
                className="text-outline hover:text-on-surface cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block font-mono text-[10px] text-outline mb-1">
                Target Course
              </label>
              <select
                value={modCourseId}
                onChange={(e) => setModCourseId(e.target.value)}
                className="w-full bg-surface-lowest border border-outline-variant/50 rounded px-3 py-2 font-mono text-xs text-on-surface focus:outline-none focus:border-primary"
              >
                {state.courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-mono text-[10px] text-outline mb-1">
                Unit / Chapter Group
              </label>
              <input
                type="text"
                value={modUnitGroup}
                onChange={(e) => setModUnitGroup(e.target.value)}
                placeholder="Unit 1 · Core Foundations"
                className="w-full bg-surface-lowest border border-outline-variant/50 rounded px-3 py-2 font-mono text-xs text-on-surface focus:outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block font-mono text-[10px] text-outline mb-1">
                Topic / Module Title
              </label>
              <input
                type="text"
                required
                value={modTitle}
                onChange={(e) => setModTitle(e.target.value)}
                placeholder="Page Table Walkers & TLB Shootdowns"
                className="w-full bg-surface-lowest border border-outline-variant/50 rounded px-3 py-2 text-xs text-on-surface focus:outline-none focus:border-primary"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block font-mono text-[10px] text-outline mb-1">
                  Est. Hours
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={modHours}
                  onChange={(e) => setModHours(e.target.value)}
                  className="w-full bg-surface-lowest border border-outline-variant/50 rounded px-2.5 py-2 font-mono text-xs text-on-surface focus:outline-none focus:border-primary"
                />
              </div>
              <div className="col-span-2">
                <label className="block font-mono text-[10px] text-outline mb-1">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={modTags}
                  onChange={(e) => setModTags(e.target.value)}
                  placeholder="vm, tlb, kernel"
                  className="w-full bg-surface-lowest border border-outline-variant/50 rounded px-2.5 py-2 font-mono text-xs text-on-surface focus:outline-none focus:border-primary"
                />
              </div>
            </div>
            <div>
              <label className="block font-mono text-[10px] text-outline mb-1">
                YouTube Lecture URL (Optional)
              </label>
              <input
                type="url"
                value={modVideo}
                onChange={(e) => setModVideo(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                className="w-full bg-surface-lowest border border-outline-variant/50 rounded px-3 py-2 font-mono text-xs text-on-surface focus:outline-none focus:border-primary"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowModuleModal(false)}
                className="px-3 py-1.5 rounded font-mono text-xs text-outline hover:text-on-surface cursor-pointer whitespace-nowrap"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded bg-primary-container text-on-primary-container font-mono text-xs font-bold cursor-pointer whitespace-nowrap"
              >
                Add Module
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
