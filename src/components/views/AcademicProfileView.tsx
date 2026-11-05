import React, { useMemo, useState } from "react";
import {
  Award,
  Briefcase,
  Check,
  Download,
  GraduationCap,
  Plus,
  Trash2,
  UserCheck,
} from "lucide-react";
import { useStudyOS } from "../../context/StudyOSContext";
import { computeSkillEvidence } from "../../lib/growthIntelligence";
import type {
  AcademicHistorySemester,
  CertificationMilestone,
} from "../../types/studyOS";

type ProfileSubTab = "identity" | "skills" | "portfolio";

const LEARNING_METHOD_OPTIONS = [
  "Active Recall",
  "Worked Mathematical Derivations",
  "Spaced Flashcards",
  "3D Physics Simulation",
  "Socratic Problem Solving",
  "Lecture + Timestamp Notes",
];

export function AcademicProfileView() {
  const {
    state,
    updateAcademicProfile,
    updateSettings,
    upsertSkillRecord,
    deleteSkillRecord,
    addPortfolioProject,
    deletePortfolioProject,
    addCertificationMilestone,
    deleteCertificationMilestone,
    exportPortfolio,
    pushToast,
  } = useStudyOS();

  const profile = state.academicProfile;
  const [subTab, setSubTab] = useState<ProfileSubTab>("identity");

  // Identity & Preferences State
  const [fullName, setFullName] = useState(profile.fullName || "");
  const [institution, setInstitution] = useState(profile.institution || "");
  const [programme, setProgramme] = useState(profile.programme || "");
  const [degreeLevel, setDegreeLevel] = useState(profile.degreeLevel || "");
  const [academicYear, setAcademicYear] = useState(profile.academicYear || "");
  const [semester, setSemester] = useState(profile.semester || "");
  const [newAcademicGoal, setNewAcademicGoal] = useState("");
  const [newPersonalGoal, setNewPersonalGoal] = useState("");
  const [customMethod, setCustomMethod] = useState("");

  // Skill Form State
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
  const [skillName, setSkillName] = useState("");
  const [skillCategory, setSkillCategory] = useState("Core Engineering");
  const [skillConfidence, setSkillConfidence] = useState<number>(3);
  const [skillGoal, setSkillGoal] = useState("");
  const [skillCourseIds, setSkillCourseIds] = useState<string[]>([]);
  const [skillModuleIds, setSkillModuleIds] = useState<string[]>([]);
  const [skillEvidenceSummary, setSkillEvidenceSummary] = useState("");

  // Project Form State
  const [projTitle, setProjTitle] = useState("");
  const [projSummary, setProjSummary] = useState("");
  const [projScope, setProjScope] = useState("");
  const [projCourseId, setProjCourseId] = useState("");
  const [projSkillIds, setProjSkillIds] = useState<string[]>([]);
  const [projUrl, setProjUrl] = useState("");
  const [projCompletedAt, setProjCompletedAt] = useState("");

  // Certification / Milestone Form State
  const [certTitle, setCertTitle] = useState("");
  const [certIssuer, setCertIssuer] = useState("");
  const [certKind, setCertKind] =
    useState<CertificationMilestone["kind"]>("certification");
  const [certDate, setCertDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [certUrl, setCertUrl] = useState("");

  // Semester History Form State
  const [semLabel, setSemLabel] = useState("");
  const [semYear, setSemYear] = useState("");
  const [semSummary, setSemSummary] = useState("");
  const [semOutcome, setSemOutcome] = useState("");

  const activeCourses = useMemo(
    () => state.courses.filter((c) => !c.archived),
    [state.courses]
  );

  const skillSummaries = useMemo(
    () => profile.skills.map((sk) => ({ skill: sk, evidence: computeSkillEvidence(sk, state) })),
    [profile.skills, state]
  );

  const handleSaveIdentity = (e: React.FormEvent) => {
    e.preventDefault();
    updateAcademicProfile({
      fullName: fullName.trim() || undefined,
      institution: institution.trim() || undefined,
      programme: programme.trim() || undefined,
      degreeLevel: degreeLevel.trim() || undefined,
      academicYear: academicYear.trim() || undefined,
      semester: semester.trim() || undefined,
    });
    if (programme.trim()) {
      updateSettings({ academicTrack: programme.trim() });
    }
    pushToast({
      title: "Saved Academic Profile",
      subtitle: "Identity and programme details persisted.",
      variant: "success",
    });
  };

  const handleAddAcademicGoal = () => {
    const clean = newAcademicGoal.trim();
    if (!clean) return;
    updateAcademicProfile({
      academicGoals: [...profile.academicGoals, clean],
    });
    setNewAcademicGoal("");
  };

  const handleAddPersonalGoal = () => {
    const clean = newPersonalGoal.trim();
    if (!clean) return;
    updateAcademicProfile({
      personalLearningGoals: [...profile.personalLearningGoals, clean],
    });
    setNewPersonalGoal("");
  };

  const toggleLearningMethod = (method: string) => {
    const exists = profile.preferredLearningMethods.includes(method);
    const next = exists
      ? profile.preferredLearningMethods.filter((m) => m !== method)
      : [...profile.preferredLearningMethods, method];
    updateAcademicProfile({ preferredLearningMethods: next });
  };

  const handleAddCustomMethod = () => {
    const clean = customMethod.trim();
    if (!clean) return;
    if (!profile.preferredLearningMethods.includes(clean)) {
      updateAcademicProfile({
        preferredLearningMethods: [...profile.preferredLearningMethods, clean],
      });
    }
    setCustomMethod("");
  };

  const handleSaveSkill = (e: React.FormEvent) => {
    e.preventDefault();
    if (!skillName.trim()) return;
    upsertSkillRecord({
      id: editingSkillId || undefined,
      name: skillName.trim(),
      category: skillCategory.trim() || "General",
      selfConfidence: skillConfidence,
      targetGoal: skillGoal.trim() || undefined,
      linkedCourseIds: skillCourseIds,
      linkedModuleIds: skillModuleIds,
      evidenceSummary: skillEvidenceSummary.trim() || undefined,
    });
    setEditingSkillId(null);
    setSkillName("");
    setSkillGoal("");
    setSkillCourseIds([]);
    setSkillModuleIds([]);
    setSkillEvidenceSummary("");
    setSkillConfidence(3);
  };

  const handleAddProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projTitle.trim() || !projSummary.trim()) return;
    addPortfolioProject({
      title: projTitle.trim(),
      summary: projSummary.trim(),
      roleOrScope: projScope.trim() || undefined,
      linkedCourseId: projCourseId || undefined,
      linkedSkillIds: projSkillIds,
      evidenceUrl: projUrl.trim() || undefined,
      completedAt: projCompletedAt || undefined,
    });
    setProjTitle("");
    setProjSummary("");
    setProjScope("");
    setProjCourseId("");
    setProjSkillIds([]);
    setProjUrl("");
    setProjCompletedAt("");
  };

  const handleAddCert = (e: React.FormEvent) => {
    e.preventDefault();
    if (!certTitle.trim()) return;
    addCertificationMilestone({
      title: certTitle.trim(),
      issuerOrType: certIssuer.trim() || "Self-Recorded Milestone",
      kind: certKind,
      completedAt: certDate || new Date().toISOString().slice(0, 10),
      credentialUrl: certUrl.trim() || undefined,
    });
    setCertTitle("");
    setCertIssuer("");
    setCertUrl("");
  };

  const handleAddSemesterHistory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!semLabel.trim() || !semSummary.trim()) return;
    const item: AcademicHistorySemester = {
      id: `sem-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label: semLabel.trim(),
      academicYear: semYear.trim() || "Current",
      summary: semSummary.trim(),
      outcomeNote: semOutcome.trim() || undefined,
    };
    updateAcademicProfile({
      semesterHistory: [item, ...profile.semesterHistory],
    });
    setSemLabel("");
    setSemYear("");
    setSemSummary("");
    setSemOutcome("");
  };

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-outline-variant/30 pb-5">
        <div>
          <p className="text-xs font-mono text-on-surface-variant tracking-wide">
            Academic Identity · Calibrated Skills · Evidence Portfolio
          </p>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-on-surface mt-1">
            Student Profile, Skills &amp; Portfolio
          </h1>
          <p className="text-sm text-on-surface-variant mt-1 max-w-2xl">
            Maintain optional academic identity details, track skill growth with self-confidence separated from empirical test performance, and export an evidence-backed Markdown portfolio.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-surface-low border border-outline-variant/35 rounded-lg">
            {(
              [
                { id: "identity", label: "Academic Profile" },
                { id: "skills", label: `Skills Matrix (${profile.skills.length})` },
                {
                  id: "portfolio",
                  label: `Projects & History (${profile.projects.length})`,
                },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSubTab(t.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  subTab === t.id
                    ? "bg-primary text-on-primary"
                    : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={exportPortfolio}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-primary text-on-primary text-xs font-semibold rounded-lg hover:opacity-90 whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Export Evidence Portfolio (.md)
          </button>
        </div>
      </div>

      {/* =====================================================================
          TAB 1: ACADEMIC IDENTITY, GOALS & ACCESSIBILITY PREFERENCES
         ===================================================================== */}
      {subTab === "identity" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={handleSaveIdentity}
            className="lg:col-span-6 bg-surface-low border border-outline-variant/35 rounded-xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-on-surface">
                  Institution &amp; Academic Programme
                </h2>
                <p className="text-xs text-on-surface-variant">
                  All personal fields are genuinely optional and remain stored locally in your workspace.
                </p>
              </div>
              <GraduationCap className="w-4 h-4 text-primary" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs text-on-surface-variant mb-1">
                  Display Name (Optional)
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g., Aarav Sharma"
                  className="w-full bg-surface-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-xs text-on-surface"
                />
              </div>

              <div>
                <label className="block text-xs text-on-surface-variant mb-1">
                  Institution (Optional)
                </label>
                <input
                  type="text"
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  placeholder="e.g., ETH Zurich / Self-Directed"
                  className="w-full bg-surface-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-xs text-on-surface"
                />
              </div>

              <div>
                <label className="block text-xs text-on-surface-variant mb-1">
                  Degree / Level (Optional)
                </label>
                <input
                  type="text"
                  value={degreeLevel}
                  onChange={(e) => setDegreeLevel(e.target.value)}
                  placeholder="e.g., B.Sc. Honours"
                  className="w-full bg-surface-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-xs text-on-surface"
                />
              </div>

              <div>
                <label className="block text-xs text-on-surface-variant mb-1">
                  Programme / Major (Optional)
                </label>
                <input
                  type="text"
                  value={programme}
                  onChange={(e) => setProgramme(e.target.value)}
                  placeholder="e.g., Computational Science & Physics"
                  className="w-full bg-surface-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-xs text-on-surface"
                />
              </div>

              <div>
                <label className="block text-xs text-on-surface-variant mb-1">
                  Academic Year (Optional)
                </label>
                <input
                  type="text"
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                  placeholder="e.g., Year 3 (2025–2026)"
                  className="w-full bg-surface-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-xs text-on-surface"
                />
              </div>

              <div>
                <label className="block text-xs text-on-surface-variant mb-1">
                  Current Semester / Term (Optional)
                </label>
                <input
                  type="text"
                  value={semester}
                  onChange={(e) => setSemester(e.target.value)}
                  placeholder="e.g., Semester 5"
                  className="w-full bg-surface-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-xs text-on-surface"
                />
              </div>
            </div>

            {/* Accessibility Preferences */}
            <div className="pt-3 border-t border-outline-variant/25 space-y-2.5">
              <p className="text-xs font-semibold text-on-surface">
                Accessibility &amp; Reading Preferences
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <label className="flex items-center gap-2 text-xs text-on-surface-variant cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(profile.accessibilityPreferences.reducedMotion)}
                    onChange={(e) =>
                      updateAcademicProfile({
                        accessibilityPreferences: {
                          ...profile.accessibilityPreferences,
                          reducedMotion: e.target.checked,
                        },
                      })
                    }
                  />
                  Reduced Motion
                </label>
                <label className="flex items-center gap-2 text-xs text-on-surface-variant cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(
                      profile.accessibilityPreferences.highContrastText
                    )}
                    onChange={(e) =>
                      updateAcademicProfile({
                        accessibilityPreferences: {
                          ...profile.accessibilityPreferences,
                          highContrastText: e.target.checked,
                        },
                      })
                    }
                  />
                  High-Contrast Text
                </label>
                <label className="flex items-center gap-2 text-xs text-on-surface-variant cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(
                      profile.accessibilityPreferences.comfortableSpacing
                    )}
                    onChange={(e) =>
                      updateAcademicProfile({
                        accessibilityPreferences: {
                          ...profile.accessibilityPreferences,
                          comfortableSpacing: e.target.checked,
                        },
                      })
                    }
                  />
                  Comfortable Spacing
                </label>
              </div>
            </div>

            <button
              type="submit"
              className="flex items-center gap-2 px-4 py-2.5 bg-primary text-on-primary text-xs font-semibold rounded-lg hover:opacity-90 whitespace-nowrap shrink-0"
            >
              <Check className="w-3.5 h-3.5" />
              Save Academic Identity
            </button>
          </form>

          {/* Right: Goals & Preferred Learning Methods */}
          <div className="lg:col-span-6 bg-surface-low border border-outline-variant/35 rounded-xl p-5 space-y-5">
            {/* Academic Goals */}
            <div className="space-y-2.5">
              <h2 className="text-base font-semibold text-on-surface">
                Academic &amp; Personal Learning Goals
              </h2>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newAcademicGoal}
                  onChange={(e) => setNewAcademicGoal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddAcademicGoal();
                    }
                  }}
                  placeholder="Add an academic goal (e.g., Master numerical PDE stability)..."
                  className="flex-1 bg-surface-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-xs text-on-surface"
                />
                <button
                  type="button"
                  onClick={handleAddAcademicGoal}
                  className="px-3 py-2 bg-surface-high text-on-surface text-xs font-medium rounded-lg hover:bg-surface-bright whitespace-nowrap shrink-0"
                >
                  Add Academic Goal
                </button>
              </div>

              {profile.academicGoals.length > 0 && (
                <ul className="space-y-1.5">
                  {profile.academicGoals.map((g, idx) => (
                    <li
                      key={`${g}-${idx}`}
                      className="flex items-center justify-between gap-2 text-xs bg-surface-lowest border border-outline-variant/25 rounded-lg px-3 py-2"
                    >
                      <span className="text-on-surface">{g}</span>
                      <button
                        type="button"
                        onClick={() =>
                          updateAcademicProfile({
                            academicGoals: profile.academicGoals.filter(
                              (_, i) => i !== idx
                            ),
                          })
                        }
                        className="text-on-surface-variant hover:text-error"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex gap-2 pt-2">
                <input
                  type="text"
                  value={newPersonalGoal}
                  onChange={(e) => setNewPersonalGoal(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddPersonalGoal();
                    }
                  }}
                  placeholder="Add a personal development goal..."
                  className="flex-1 bg-surface-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-xs text-on-surface"
                />
                <button
                  type="button"
                  onClick={handleAddPersonalGoal}
                  className="px-3 py-2 bg-surface-high text-on-surface text-xs font-medium rounded-lg hover:bg-surface-bright whitespace-nowrap shrink-0"
                >
                  Add Personal Goal
                </button>
              </div>

              {profile.personalLearningGoals.length > 0 && (
                <ul className="space-y-1.5">
                  {profile.personalLearningGoals.map((g, idx) => (
                    <li
                      key={`${g}-${idx}`}
                      className="flex items-center justify-between gap-2 text-xs bg-surface-lowest border border-outline-variant/25 rounded-lg px-3 py-2"
                    >
                      <span className="text-on-surface">{g}</span>
                      <button
                        type="button"
                        onClick={() =>
                          updateAcademicProfile({
                            personalLearningGoals:
                              profile.personalLearningGoals.filter(
                                (_, i) => i !== idx
                              ),
                          })
                        }
                        className="text-on-surface-variant hover:text-error"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Preferred Learning Methods */}
            <div className="pt-4 border-t border-outline-variant/25 space-y-2.5">
              <p className="text-xs font-semibold text-on-surface">
                Preferred Learning Methods
              </p>
              <div className="flex flex-wrap gap-1.5">
                {Array.from(
                  new Set([
                    ...LEARNING_METHOD_OPTIONS,
                    ...profile.preferredLearningMethods,
                  ])
                ).map((method) => {
                  const selected =
                    profile.preferredLearningMethods.includes(method);
                  return (
                    <button
                      key={method}
                      type="button"
                      onClick={() => toggleLearningMethod(method)}
                      className={`px-2.5 py-1.5 text-xs rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                        selected
                          ? "border-primary bg-primary/15 text-on-surface font-medium"
                          : "border-outline-variant/35 text-on-surface-variant hover:text-on-surface"
                      }`}
                    >
                      {method}
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-2 pt-1">
                <input
                  type="text"
                  value={customMethod}
                  onChange={(e) => setCustomMethod(e.target.value)}
                  placeholder="Add custom study method..."
                  className="flex-1 bg-surface-lowest border border-outline-variant/40 rounded-lg px-3 py-1.5 text-xs text-on-surface"
                />
                <button
                  type="button"
                  onClick={handleAddCustomMethod}
                  className="px-3 py-1.5 bg-surface-high text-on-surface text-xs rounded-lg whitespace-nowrap shrink-0"
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 2: SKILLS MATRIX (SELF-CONFIDENCE VS ASSESSED EVIDENCE)
         ===================================================================== */}
      {subTab === "skills" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <form
            onSubmit={handleSaveSkill}
            className="lg:col-span-4 bg-surface-low border border-outline-variant/35 rounded-xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-on-surface">
                {editingSkillId ? "Update Skill Record" : "Add Tracked Skill"}
              </h2>
              <UserCheck className="w-4 h-4 text-primary" />
            </div>

            <p className="text-xs text-on-surface-variant">
              Skills are never marked externally verified just from adding them. Link courses or topics so StudyOS can compute real assessment evidence alongside your self-rating.
            </p>

            <div>
              <label className="block text-xs text-on-surface-variant mb-1">
                Skill Name *
              </label>
              <input
                type="text"
                value={skillName}
                onChange={(e) => setSkillName(e.target.value)}
                placeholder="e.g., Runge-Kutta Numerical Integration"
                className="w-full bg-surface-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-xs text-on-surface"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-on-surface-variant mb-1">
                  Category
                </label>
                <input
                  type="text"
                  value={skillCategory}
                  onChange={(e) => setSkillCategory(e.target.value)}
                  placeholder="Applied Math"
                  className="w-full bg-surface-lowest border border-outline-variant/40 rounded-lg px-2.5 py-2 text-xs text-on-surface"
                />
              </div>
              <div>
                <label className="block text-xs text-on-surface-variant mb-1">
                  Self-Confidence (1–5)
                </label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={skillConfidence}
                  onChange={(e) => setSkillConfidence(Number(e.target.value))}
                  className="w-full bg-surface-lowest border border-outline-variant/40 rounded-lg px-2.5 py-2 text-xs font-mono tabular-nums text-on-surface"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-on-surface-variant mb-1">
                Development Goal (Optional)
              </label>
              <input
                type="text"
                value={skillGoal}
                onChange={(e) => setSkillGoal(e.target.value)}
                placeholder="Derive stability regions without notes"
                className="w-full bg-surface-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-xs text-on-surface"
              />
            </div>

            {activeCourses.length > 0 && (
              <div>
                <label className="block text-xs text-on-surface-variant mb-1">
                  Link Courses for Assessed Evidence
                </label>
                <div className="max-h-28 overflow-y-auto bg-surface-lowest border border-outline-variant/30 rounded-lg p-2 space-y-1">
                  {activeCourses.map((c) => (
                    <label
                      key={c.id}
                      className="flex items-center gap-2 text-xs text-on-surface cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={skillCourseIds.includes(c.id)}
                        onChange={(e) =>
                          setSkillCourseIds((prev) =>
                            e.target.checked
                              ? [...prev, c.id]
                              : prev.filter((id) => id !== c.id)
                          )
                        }
                      />
                      {c.code} · {c.title}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs text-on-surface-variant mb-1">
                Evidence Note (Optional)
              </label>
              <input
                type="text"
                value={skillEvidenceSummary}
                onChange={(e) => setSkillEvidenceSummary(e.target.value)}
                placeholder="Implemented in 3D Physics Lab & Problem Set 2"
                className="w-full bg-surface-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-xs text-on-surface"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="flex-1 py-2.5 px-4 bg-primary text-on-primary text-xs font-semibold rounded-lg hover:opacity-90 whitespace-nowrap shrink-0"
              >
                {editingSkillId ? "Save Skill Changes" : "Add Skill"}
              </button>
              {editingSkillId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingSkillId(null);
                    setSkillName("");
                  }}
                  className="px-3 py-2.5 text-xs text-on-surface-variant hover:text-on-surface"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>

          {/* Skills Matrix Table */}
          <div className="lg:col-span-8 bg-surface-low border border-outline-variant/35 rounded-xl p-5 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-on-surface">
                Skills Matrix: Self-Rating vs. Internal Assessment Evidence
              </h2>
              <p className="text-xs text-on-surface-variant">
                Verification status reflects internal StudyOS assessments and linked portfolio projects—never external professional certification.
              </p>
            </div>

            {skillSummaries.length === 0 ? (
              <p className="text-xs text-on-surface-variant py-10 text-center">
                No skills tracked yet. Add technical or academic skills on the left and link them to your courses to compare self-confidence with empirical quiz performance.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-outline-variant/30 text-[11px] font-mono text-on-surface-variant">
                      <th className="py-2.5 pr-3">Skill &amp; Category</th>
                      <th className="py-2.5 px-3 text-right">Self-Confidence</th>
                      <th className="py-2.5 px-3 text-right">Assessed Avg</th>
                      <th className="py-2.5 px-3">Internal Evidence Status</th>
                      <th className="py-2.5 pl-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/20 text-xs">
                    {skillSummaries.map(({ skill, evidence }) => (
                      <tr key={skill.id} className="hover:bg-surface-lowest/50">
                        <td className="py-3 pr-3">
                          <p className="font-semibold text-on-surface">
                            {skill.name}
                          </p>
                          <p className="text-[11px] text-on-surface-variant">
                            {skill.category}
                            {skill.targetGoal ? ` · Goal: ${skill.targetGoal}` : ""}
                          </p>
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-on-surface">
                          {skill.selfConfidence}/5
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums">
                          {evidence.assessedScore !== null ? (
                            <span className="text-primary font-semibold">
                              {evidence.assessedScore}% ({evidence.attemptCount})
                            </span>
                          ) : (
                            <span className="text-on-surface-variant">Unassessed</span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <p
                            className={`font-medium ${
                              evidence.verificationBadge ===
                              "Evidence-Backed (Internal)"
                                ? "text-tertiary"
                                : evidence.verificationBadge === "Practice Evidence"
                                ? "text-primary"
                                : "text-on-surface-variant"
                            }`}
                          >
                            {evidence.verificationBadge}
                          </p>
                          <p className="text-[11px] text-on-surface-variant">
                            {evidence.explanation}
                          </p>
                        </td>
                        <td className="py-3 pl-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingSkillId(skill.id);
                                setSkillName(skill.name);
                                setSkillCategory(skill.category);
                                setSkillConfidence(skill.selfConfidence);
                                setSkillGoal(skill.targetGoal || "");
                                setSkillCourseIds(skill.linkedCourseIds);
                                setSkillModuleIds(skill.linkedModuleIds);
                                setSkillEvidenceSummary(skill.evidenceSummary || "");
                              }}
                              className="text-xs text-primary hover:underline"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteSkillRecord(skill.id)}
                              className="text-on-surface-variant hover:text-error"
                              aria-label="Delete skill"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 3: PORTFOLIO PROJECTS, CERTIFICATIONS & ACADEMIC HISTORY
         ===================================================================== */}
      {subTab === "portfolio" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Portfolio Projects */}
            <div className="lg:col-span-6 bg-surface-low border border-outline-variant/35 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-on-surface">
                  Portfolio Projects &amp; Coursework Artifacts
                </h2>
                <Briefcase className="w-4 h-4 text-primary" />
              </div>

              <form onSubmit={handleAddProject} className="space-y-3">
                <input
                  type="text"
                  value={projTitle}
                  onChange={(e) => setProjTitle(e.target.value)}
                  placeholder="Project title (e.g., Symplectic RK4 Orbital Solver) *"
                  className="w-full bg-surface-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-xs text-on-surface"
                  required
                />
                <textarea
                  rows={2}
                  value={projSummary}
                  onChange={(e) => setProjSummary(e.target.value)}
                  placeholder="Concise technical summary & measurable outcome *"
                  className="w-full bg-surface-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-xs text-on-surface"
                  required
                />
                <div className="grid grid-cols-2 gap-2.5">
                  <input
                    type="url"
                    value={projUrl}
                    onChange={(e) => setProjUrl(e.target.value)}
                    placeholder="Repository or artifact URL (optional)"
                    className="w-full bg-surface-lowest border border-outline-variant/40 rounded-lg px-3 py-1.5 text-xs text-on-surface"
                  />
                  <input
                    type="date"
                    value={projCompletedAt}
                    onChange={(e) => setProjCompletedAt(e.target.value)}
                    className="w-full bg-surface-lowest border border-outline-variant/40 rounded-lg px-3 py-1.5 text-xs font-mono tabular-nums text-on-surface"
                  />
                </div>

                {profile.skills.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {profile.skills.map((sk) => {
                      const active = projSkillIds.includes(sk.id);
                      return (
                        <button
                          key={sk.id}
                          type="button"
                          onClick={() =>
                            setProjSkillIds((prev) =>
                              active
                                ? prev.filter((id) => id !== sk.id)
                                : [...prev, sk.id]
                            )
                          }
                          className={`px-2 py-1 text-[11px] rounded border transition-colors whitespace-nowrap shrink-0 ${
                            active
                              ? "border-primary bg-primary/15 text-on-surface"
                              : "border-outline-variant/30 text-on-surface-variant"
                          }`}
                        >
                          {sk.name}
                        </button>
                      );
                    })}
                  </div>
                )}

                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-primary text-on-primary text-xs font-semibold rounded-lg whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Project Evidence
                </button>
              </form>

              <div className="divide-y divide-outline-variant/25 pt-2">
                {profile.projects.map((p) => (
                  <div
                    key={p.id}
                    className="py-3 flex items-start justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-on-surface">
                        {p.title}
                      </p>
                      <p className="text-xs text-on-surface-variant">{p.summary}</p>
                      <p className="text-[11px] font-mono tabular-nums text-on-surface-variant">
                        {p.completedAt || p.createdAt.slice(0, 10)}
                        {p.evidenceUrl ? ` · ${p.evidenceUrl}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => deletePortfolioProject(p.id)}
                      className="text-on-surface-variant hover:text-error p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Certifications, Milestones & Semester History */}
            <div className="lg:col-span-6 space-y-6">
              <div className="bg-surface-low border border-outline-variant/35 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-on-surface">
                    Certifications &amp; Completed Milestones
                  </h2>
                  <Award className="w-4 h-4 text-secondary" />
                </div>

                <form onSubmit={handleAddCert} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      value={certTitle}
                      onChange={(e) => setCertTitle(e.target.value)}
                      placeholder="Milestone or certificate title *"
                      className="bg-surface-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-xs text-on-surface"
                      required
                    />
                    <input
                      type="text"
                      value={certIssuer}
                      onChange={(e) => setCertIssuer(e.target.value)}
                      placeholder="Issuer or context"
                      className="bg-surface-lowest border border-outline-variant/40 rounded-lg px-3 py-2 text-xs text-on-surface"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2.5">
                    <select
                      value={certKind}
                      onChange={(e) =>
                        setCertKind(e.target.value as CertificationMilestone["kind"])
                      }
                      className="bg-surface-lowest border border-outline-variant/40 rounded-lg px-2.5 py-1.5 text-xs text-on-surface"
                    >
                      <option value="certification">Certification</option>
                      <option value="milestone">Milestone</option>
                      <option value="award">Award</option>
                    </select>
                    <input
                      type="date"
                      value={certDate}
                      onChange={(e) => setCertDate(e.target.value)}
                      className="bg-surface-lowest border border-outline-variant/40 rounded-lg px-2.5 py-1.5 text-xs font-mono tabular-nums text-on-surface"
                    />
                    <button
                      type="submit"
                      className="bg-surface-high text-on-surface text-xs font-semibold rounded-lg hover:bg-surface-bright whitespace-nowrap shrink-0"
                    >
                      Add Milestone
                    </button>
                  </div>
                </form>

                <div className="divide-y divide-outline-variant/25">
                  {profile.certifications.map((c) => (
                    <div
                      key={c.id}
                      className="py-2.5 flex items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <p className="font-semibold text-on-surface">{c.title}</p>
                        <p className="text-on-surface-variant font-mono tabular-nums">
                          {c.kind} · {c.issuerOrType} · {c.completedAt}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteCertificationMilestone(c.id)}
                        className="text-on-surface-variant hover:text-error p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Semester Academic History */}
              <div className="bg-surface-low border border-outline-variant/35 rounded-xl p-5 space-y-4">
                <h2 className="text-base font-semibold text-on-surface">
                  Academic History Across Semesters
                </h2>
                <form onSubmit={handleAddSemesterHistory} className="space-y-2.5">
                  <div className="grid grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      value={semLabel}
                      onChange={(e) => setSemLabel(e.target.value)}
                      placeholder="Term (e.g., Semester 4) *"
                      className="bg-surface-lowest border border-outline-variant/40 rounded-lg px-3 py-1.5 text-xs text-on-surface"
                      required
                    />
                    <input
                      type="text"
                      value={semYear}
                      onChange={(e) => setSemYear(e.target.value)}
                      placeholder="Academic Year (2024–2025)"
                      className="bg-surface-lowest border border-outline-variant/40 rounded-lg px-3 py-1.5 text-xs text-on-surface"
                    />
                  </div>
                  <input
                    type="text"
                    value={semSummary}
                    onChange={(e) => setSemSummary(e.target.value)}
                    placeholder="Key subjects completed & focus *"
                    className="w-full bg-surface-lowest border border-outline-variant/40 rounded-lg px-3 py-1.5 text-xs text-on-surface"
                    required
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={semOutcome}
                      onChange={(e) => setSemOutcome(e.target.value)}
                      placeholder="Outcome / GPA / Honours note (optional)"
                      className="flex-1 bg-surface-lowest border border-outline-variant/40 rounded-lg px-3 py-1.5 text-xs text-on-surface"
                    />
                    <button
                      type="submit"
                      className="px-3.5 py-1.5 bg-surface-high text-on-surface text-xs font-semibold rounded-lg whitespace-nowrap shrink-0"
                    >
                      Record Term
                    </button>
                  </div>
                </form>

                <div className="divide-y divide-outline-variant/25">
                  {profile.semesterHistory.map((sh) => (
                    <div
                      key={sh.id}
                      className="py-2.5 flex items-start justify-between gap-2 text-xs"
                    >
                      <div>
                        <p className="font-semibold text-on-surface">
                          {sh.label} ({sh.academicYear})
                        </p>
                        <p className="text-on-surface-variant">{sh.summary}</p>
                        {sh.outcomeNote && (
                          <p className="text-tertiary font-mono tabular-nums">
                            {sh.outcomeNote}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          updateAcademicProfile({
                            semesterHistory: profile.semesterHistory.filter(
                              (item) => item.id !== sh.id
                            ),
                          })
                        }
                        className="text-on-surface-variant hover:text-error p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
