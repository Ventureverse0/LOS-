import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { LearningOSSqliteService, redactSecretsFromLog } from "./sqliteLearningOS";
import { LlmProviderRouter } from "./llmProviderRouter";
import { createDefaultLearningOSHost } from "../lib/appHostToolBus";
import { FsrsLiteScheduler } from "../lib/fsrsScheduler";
import {
  buildSurfSenseExportBundle,
  compileInteractiveLessonArtifact,
  parseSurfSenseArtifactImport,
  validateInteractiveLessonArtifact,
} from "../integrations/learningOSAdapters";
import { createBlankStudyOSState } from "../lib/workspaceState";

interface TestResult {
  name: string;
  passed: boolean;
  detail: string;
}

async function runLearningOSSqliteAndMasterAcceptanceTests(): Promise<void> {
  const results: TestResult[] = [];
  const assert = (name: string, condition: boolean, detail: string) => {
    results.push({ name, passed: Boolean(condition), detail });
  };

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "learningos-e2e-"));
  const dbPath = path.join(tempRoot, "data", "learningos.sqlite");
  const tempExtractionDir = path.join(tempRoot, "data", "temp", "extraction");
  const logFilePath = path.join(tempRoot, "data", "logs", "learningos.log");
  const workspacesDir = path.join(tempRoot, "data", "workspaces");
  fs.mkdirSync(workspacesDir, { recursive: true });

  // Create an isolated orphan temp directory BEFORE booting service to verify Stage 22 startup sweep
  const orphanDir = path.join(tempExtractionDir, "orphan-crash-job-999");
  fs.mkdirSync(orphanDir, { recursive: true });
  fs.writeFileSync(path.join(orphanDir, "partial.wav"), "temp-audio-bytes", "utf-8");

  let service = new LearningOSSqliteService({
    dbPath,
    tempRootDir: tempExtractionDir,
    logFilePath,
  });

  try {
    // 1. Stage 2, 4 & 22: Migrations 001-003, Secret Redaction & Orphan Temp Sweep on Boot
    const diag = service.getDiagnostics({
      llmConfigured: false,
      llmProvider: "gemini",
      defaultModel: "gemini-3.8-flash",
    });
    const migrations = service.getAppliedMigrations();
    const redactedSample = redactSecretsFromLog(
      "GEMINI_API_KEY=AIzaSySecretKey12345678901234567890 Bearer eyJhbGciOiJIUzI1NiJ9"
    );

    assert(
      "Stage 2, 4 & 22: SQLite Migrations 001–003 Applied, Secret Redaction Active & Orphan Temp Dir Swept on Boot",
      diag.sqliteReady &&
        diag.fts5Ready &&
        migrations.length === 3 &&
        !fs.existsSync(orphanDir) &&
        !redactedSample.includes("AIzaSySecretKey") &&
        redactedSample.includes("[REDACTED]"),
      `migrations=${migrations.length}, orphanSwept=${!fs.existsSync(orphanDir)}, logRedacted=true`
    );

    // 2. Stage 3, 28 & 29: ToolBus Parallel Read-Only vs Serialized Mutating Calls + MCP Allowlist
    const { appRegistry, capabilityRegistry, toolBus, mcpBridge } =
      createDefaultLearningOSHost();
    const trace: string[] = [];

    capabilityRegistry.register({
      id: "curriculum.read",
      description: "Parallel read test",
      requiredScope: "read",
      readOnly: true,
      handler: async (input: { label?: string }) => {
        const lbl = input?.label || "R";
        trace.push(`rstart:${lbl}`);
        await new Promise((r) => setTimeout(r, 25));
        trace.push(`rend:${lbl}`);
        return { result: lbl };
      },
    });

    capabilityRegistry.register({
      id: "curriculum.write",
      description: "Serialized write test",
      requiredScope: "write",
      readOnly: false,
      handler: async (input: { label?: string }) => {
        const lbl = input?.label || "W";
        trace.push(`wstart:${lbl}`);
        await new Promise((r) => setTimeout(r, 20));
        trace.push(`wend:${lbl}`);
        return { result: lbl };
      },
    });

    await Promise.all([
      toolBus.execute({
        callerAppId: "curriculum",
        capability: "curriculum.read",
        input: { label: "R1" },
      }),
      toolBus.execute({
        callerAppId: "curriculum",
        capability: "curriculum.read",
        input: { label: "R2" },
      }),
    ]);
    const parallelReadsWorked = trace.indexOf("rstart:R2") < trace.indexOf("rend:R1");

    trace.length = 0;
    await Promise.all([
      toolBus.execute({
        callerAppId: "curriculum",
        capability: "curriculum.write",
        input: { label: "W1" },
      }),
      toolBus.execute({
        callerAppId: "curriculum",
        capability: "curriculum.write",
        input: { label: "W2" },
      }),
    ]);
    const serializedWritesWorked = trace.indexOf("wend:W1") < trace.indexOf("wstart:W2");

    // Disabled optional module cannot execute tools
    appRegistry.disableApp("lecture");
    const disabledExec = await toolBus.execute({
      callerAppId: "lecture",
      capability: "curriculum.read",
      input: { label: "blocked" },
    });

    // MCP Bridge read-only enforcement
    mcpBridge.setEnabled(true);
    const mcpReadOk = await mcpBridge.invokeMcpTool("curriculum.read", { label: "mcp" });
    const mcpWriteDenied = await mcpBridge.invokeMcpTool("curriculum.write", { label: "mcp-bad" });

    assert(
      "Stage 3, 28 & 29: ToolBus Parallelizes Read-Only Calls, Serializes Mutating Calls, Blocks Disabled Apps & Guards MCP Bridge",
      parallelReadsWorked &&
        serializedWritesWorked &&
        disabledExec.success === false &&
        mcpReadOk.success === true &&
        mcpWriteDenied.success === false,
      `parallelReads=${parallelReadsWorked}, serializedWrites=${serializedWritesWorked}, mcpWriteBlocked=${!mcpWriteDenied.success}`
    );

    // 3. Stage 27 & Section 38: 23-STEP MASTER ACCEPTANCE TEST
    // Steps 1–4: Create Semester 1 -> Applied Physics -> Unit 1 — Laser -> Population Inversion
    const blank = createBlankStudyOSState();
    const syncSummary = service.syncStudyOSWorkspace({
      ...blank,
      academicProfile: {
        ...blank.academicProfile,
        programme: "B.Tech Engineering Physics",
        academicYear: "Year 1",
        semester: "Semester 1",
      },
      courses: [
        {
          id: "subj-applied-physics",
          code: "PHY-101",
          title: "Applied Physics",
          category: "Physics",
          semester: "Semester 1",
          academicYear: "Year 1",
          tags: ["laser", "optics"],
          totalUnits: 2,
          completedUnits: 0,
          createdAt: "2026-10-01T00:00:00.000Z",
        },
      ],
      modules: [
        {
          id: "topic-laser-pop-inv",
          courseId: "subj-applied-physics",
          unitGroup: "Unit 1 — Laser",
          title: "Population Inversion & Stimulated Emission",
          status: "In Progress",
          videoLink: "",
          notesMarkdown:
            "# Unit 1 — Laser\n\n## Key Equations\n- Einstein A and B coefficients govern **Spontaneous Emission**, **Stimulated Emission**, and **Population Inversion** ($N_2 > N_1$).",
          estimatedHours: 3,
          tags: ["laser", "population-inversion"],
          keyConcepts: [
            "Population Inversion",
            "Stimulated Emission",
            "Metastable State",
            "Optical Resonator",
          ],
          resources: [],
          bookmarks: [],
          updatedAt: "2026-10-25T00:00:00.000Z",
        },
        {
          id: "topic-optical-fiber",
          courseId: "subj-applied-physics",
          unitGroup: "Unit 2 — Fiber Optics",
          title: "Numerical Aperture & Total Internal Reflection",
          status: "To Do",
          videoLink: "",
          notesMarkdown: "# Fiber Optics\nTotal internal reflection in step-index waveguides.",
          estimatedHours: 2,
          tags: ["fiber-optics"],
          keyConcepts: ["Numerical Aperture"],
          resources: [],
          bookmarks: [],
          updatedAt: "2026-10-25T00:00:00.000Z",
        },
      ],
    });

    // Step 5: Attach remote YouTube lecture URL (permanentDownload: false)
    const laserLecture = service.upsertResource({
      url: "https://www.youtube.com/watch?v=y3SBSbsdiYg",
      title: "Applied Physics Lecture 1: Laser & Population Inversion",
      authorOrChannel: "MIT OpenCourseWare Optics",
      courseId: "subj-applied-physics",
      unitName: "Unit 1 — Laser",
      topicId: "topic-laser-pop-inv",
    });

    // Steps 6–8: Captions-first WebVTT ingestion + content_hash idempotency check
    const laserVtt = `WEBVTT

00:00:05.000 --> 00:00:18.000
Welcome to Applied Physics Unit 1 on Laser systems and optical amplification.

00:00:18.000 --> 00:00:36.000
Under thermal equilibrium, Boltzmann statistics dictate N2 is much smaller than N1, so absorption dominates.

00:00:36.000 --> 00:00:55.000
To achieve laser action, optical or electrical pumping creates population inversion where N2 exceeds N1 in a metastable state.

00:00:55.000 --> 00:01:15.000
Once population inversion is established, an incident photon triggers stimulated emission of a second photon with identical phase, frequency, polarization, and direction.

00:01:15.000 --> 00:01:35.000
A Fabry-Perot optical resonator provides positive feedback along the cavity axis.`;

    const captionIngest1 = service.ingestTranscript({
      resourceId: laserLecture.id,
      rawSubtitleText: laserVtt,
      subtitleType: "manual",
      language: "en",
    });
    const captionIngest2 = service.ingestTranscript({
      resourceId: laserLecture.id,
      rawSubtitleText: laserVtt,
      subtitleType: "manual",
      language: "en",
    });

    // Update watch progress on Lecture Workspace (Stage 10)
    const updatedProgress = service.updateResourceProgress(laserLecture.id, {
      lastPositionSec: 55,
      progressPct: 65,
      completed: false,
    });

    assert(
      "Section 38 (Steps 1–8): Curriculum Synced, Remote URL Attached (Zero Media Download) & Captions Ingested Idempotently",
      syncSummary.coursesSynced === 1 &&
        syncSummary.topicsSynced === 2 &&
        laserLecture.capabilities.permanentDownload === false &&
        captionIngest1.segments.length === 5 &&
        captionIngest1.deduplicated === false &&
        captionIngest2.deduplicated === true &&
        updatedProgress?.lastPositionSec === 55,
      `resource=${laserLecture.id}, segments=${captionIngest1.segments.length}, deduplicated=${captionIngest2.deduplicated}`
    );

    // 4. Stage 9 Whisper Fallback Job Matrix (Captions Skip, Failure Cleanup, Cancel Cleanup, Success Cleanup)
    // Case A: Captions already exist -> Whisper MUST NOT run
    const skipWhenCaptioned = await service.runWhisperFallbackJob({
      resourceId: laserLecture.id,
    });

    // Create uncaptioned lecture
    const uncaptionedLecture = service.upsertResource({
      url: "https://www.youtube.com/watch?v=9X6_fiber01",
      title: "Uncaptioned Lecture: Numerical Aperture",
      courseId: "subj-applied-physics",
      unitName: "Unit 2 — Fiber Optics",
      topicId: "topic-optical-fiber",
    });

    // Case B: Whisper failure -> temp dir existed during run, deleted in `finally`
    const failRun = await service.runWhisperFallbackJob({
      resourceId: uncaptionedLecture.id,
      simulateMode: "fail",
    });

    // Case C: Whisper cancellation -> temp dir existed during run, deleted in `finally`
    const cancelRun = await service.runWhisperFallbackJob({
      resourceId: uncaptionedLecture.id,
      simulateMode: "cancel",
    });

    // Case D: Whisper fallback succeeds -> transcript validated & saved, temp dir deleted (`status === "cleaned"`)
    const successRun = await service.runWhisperFallbackJob({
      resourceId: uncaptionedLecture.id,
      simulateMode: "success",
      fallbackCueText: [
        "WEBVTT",
        "",
        "00:00:10.000 --> 00:00:25.000",
        "Numerical aperture equals n0 sin theta_max = sqrt(n1^2 - n2^2).",
        "",
        "00:00:25.000 --> 00:00:42.000",
        "Total internal reflection confines guided modes inside the core.",
      ].join("\n"),
    });

    const leftoverDirs = fs.existsSync(tempExtractionDir)
      ? fs.readdirSync(tempExtractionDir)
      : [];

    assert(
      "Stage 9 Job Matrix: Captions Skip Whisper; Success/Failure/Cancel All Delete Temp Media in finally",
      skipWhenCaptioned.whisperCalled === false &&
        failRun.tempDirExistedDuringRun === true &&
        failRun.tempDirExistsAfterCleanup === false &&
        failRun.job.status === "failed" &&
        cancelRun.tempDirExistedDuringRun === true &&
        cancelRun.tempDirExistsAfterCleanup === false &&
        cancelRun.job.status === "cancelled" &&
        successRun.whisperCalled === true &&
        successRun.tempDirExistsAfterCleanup === false &&
        successRun.job.status === "cleaned" &&
        leftoverDirs.length === 0,
      `skipWhisper=${!skipWhenCaptioned.whisperCalled}, failCleaned=${!failRun.tempDirExistsAfterCleanup}, cancelCleaned=${!cancelRun.tempDirExistsAfterCleanup}, finalStatus=${successRun.job.status}`
    );

    // 5. Stage 11 FTS5 BM25 Benchmark over 2,500+ Transcript Cues + Exact Timestamp Jump
    const benchResource = service.upsertResource({
      url: "https://www.youtube.com/watch?v=bench2500cues",
      title: "Extended 2500-Cue Optics Archive",
      courseId: "subj-applied-physics",
      topicId: "topic-optical-fiber",
    });
    const benchLines: string[] = ["WEBVTT", ""];
    for (let i = 0; i < 2500; i++) {
      const s0 = i * 5;
      const s1 = s0 + 4;
      const pad = (n: number) => String(n).padStart(2, "0");
      const fmt = (sec: number) =>
        `${pad(Math.floor(sec / 3600))}:${pad(Math.floor((sec % 3600) / 60))}:${pad(sec % 60)}.000`;
      benchLines.push(`${fmt(s0)} --> ${fmt(s1)}`);
      benchLines.push(
        i === 1420
          ? "Dispersion-shifted waveguides minimize pulse broadening near 1550 nanometers."
          : `Optics lecture segment ${i} covering wave propagation, phase velocity, and boundary invariants.`
      );
      benchLines.push("");
    }
    service.ingestTranscript({
      resourceId: benchResource.id,
      rawSubtitleText: benchLines.join("\n"),
      subtitleType: "auto",
      language: "en",
    });

    const t0Laser = performance.now();
    const laserHits = service.searchFts5("population inversion", {
      courseId: "subj-applied-physics",
      limit: 20,
    });
    const laserElapsedMs = Math.round((performance.now() - t0Laser) * 100) / 100;

    const t0Bench = performance.now();
    const benchHits = service.searchFts5("dispersion-shifted 1550", { limit: 10 });
    const benchElapsedMs = Math.round((performance.now() - t0Bench) * 100) / 100;

    const exactLaserSegHit = laserHits.find(
      (h) => h.entityType === "transcript_segment" && h.resourceId === laserLecture.id
    );

    assert(
      "Stage 11 & Section 38 (Steps 9–11): SQLite FTS5 BM25 Ranks Exact Timestamp Cue (<100ms over 2,500+ segments)",
      Boolean(exactLaserSegHit && exactLaserSegHit.startMs === 36000) &&
        laserElapsedMs < 100 &&
        benchHits.length >= 1 &&
        benchHits[0].startMs === 1420 * 5000 &&
        benchElapsedMs < 100,
      `laserSearch=${laserElapsedMs}ms (startMs=${exactLaserSegHit?.startMs}), 2500cueBench=${benchElapsedMs}ms`
    );

    // 6. Stage 13: Source-Grounded Cited Tutor & Fabricated Segment Rejection
    const validSegId = captionIngest1.segments[2].id; // 00:36 population inversion segment
    const normalizedTutor = service.validateAndNormalizeTutorAnswer({
      resourceId: laserLecture.id,
      rawAnswer:
        "Optical or electrical pumping excites atoms into a metastable state so N2 > N1, enabling stimulated emission.",
      rawCitations: [
        { segmentId: validSegId, quote: captionIngest1.segments[2].text },
        { segmentId: "seg-hallucinated-99999", quote: "Fake non-existent segment" },
      ],
      model: "gemini-3.8-flash",
    });

    const outOfSourceDet = service.buildDeterministicCitedAnswer({
      resourceId: laserLecture.id,
      question: "What was the exact rainfall in Tokyo in 1973?",
    });

    assert(
      "Stage 13 & Section 38 (Steps 12–13): Cited Tutor Verifies SQLite Segment IDs, Drops Hallucinated Citations & Flags Out-of-Source Queries",
      normalizedTutor.citations.length === 1 &&
        normalizedTutor.citations[0].segmentId === validSegId &&
        normalizedTutor.citations[0].startMs === 36000 &&
        normalizedTutor.warnings.some((w) => w.includes("seg-hallucinated-99999")) &&
        outOfSourceDet.warnings.length >= 1,
      `validCitations=${normalizedTutor.citations.length}, droppedHallucinated=true, outOfSourceWarn=${outOfSourceDet.warnings.length}`
    );

    // 7. Stage 14, 15 & 19: Cached Study Artifacts + FSRS Review + OpenMAIC InteractiveLesson
    const artHash = "fnv64_laser_flashcards_v1";
    const savedFlashcardArtifact = service.saveStudyArtifact({
      artifactType: "flashcards",
      resourceIds: [laserLecture.id],
      segmentIds: [validSegId],
      promptVersion: "v1.0",
      providerModel: "deterministic-artifact-compiler",
      contentHash: artHash,
      content: {
        cards: [
          {
            question: "What condition defines population inversion in a laser gain medium?",
            answer: "N2 > N1 in an excited metastable level.",
          },
        ],
      },
      citations: normalizedTutor.citations,
    });
    const cachedHit = service.getArtifactByHash("flashcards", artHash);

    const interactiveLesson = compileInteractiveLessonArtifact({
      topicTitle: "Population Inversion & Stimulated Emission",
      resources: [laserLecture],
      segments: captionIngest1.segments,
      concepts: service.getConceptGraph("subj-applied-physics").concepts,
      notesMarkdown: "# Unit 1 — Laser\nPopulation inversion N2 > N1.",
    });
    const lessonValid = validateInteractiveLessonArtifact(interactiveLesson);
    service.saveStudyArtifact({
      artifactType: "interactive_lesson",
      resourceIds: [laserLecture.id],
      segmentIds: captionIngest1.segments.map((s) => s.id),
      promptVersion: "openmaic-v1",
      providerModel: "openmaic-dsl-compiler",
      contentHash: "fnv64_laser_lesson_v1",
      content: interactiveLesson as unknown as Record<string, unknown>,
      citations: normalizedTutor.citations,
    });

    const scheduler = new FsrsLiteScheduler();
    const cardState0 = scheduler.createInitialState("fc-laser-1");
    const cardState1 = scheduler.schedule(cardState0, "good");

    assert(
      "Stage 14, 15 & 19 (Steps 14–16): Study Artifacts Cache by Hash, OpenMAIC Lesson Validates & FSRS Schedules Review",
      savedFlashcardArtifact.cached === false &&
        cachedHit?.cached === true &&
        lessonValid.valid === true &&
        interactiveLesson.permanentVideoGenerated === false &&
        cardState1.repetitions === 1 &&
        cardState1.intervalDays >= 1,
      `cachedHit=${cachedHit?.cached}, lessonSections=${interactiveLesson.sections.length}, nextInterval=${cardState1.intervalDays}d`
    );

    // 8. Stage 16, 17 & 18: Concept Graph Links + Assisted Curriculum Match + SurfSense Exchange
    const c1 = service.upsertConcept({
      courseId: "subj-applied-physics",
      topicId: "topic-laser-pop-inv",
      name: "Population Inversion (N2 > N1)",
      definition: "Excited metastable state population exceeds ground/lower state.",
      sourceResourceId: laserLecture.id,
      sourceSegmentId: validSegId,
      sourceStartMs: 36000,
    });
    const c2 = service.upsertConcept({
      courseId: "subj-applied-physics",
      topicId: "topic-laser-pop-inv",
      name: "Stimulated Optical Emission",
      definition: "Incident photon triggers phase-coherent photon emission.",
      sourceResourceId: laserLecture.id,
      sourceSegmentId: captionIngest1.segments[3].id,
      sourceStartMs: 55000,
    });
    service.addConceptLink({
      fromConceptId: c1.id,
      toConceptId: c2.id,
      relationType: "prerequisite",
      confidence: 0.92,
      evidence: "Transcript cue [00:55]: Once population inversion is established, stimulated emission occurs.",
      mappingMethod: "manual",
    });

    const unassignedLaserClip = service.upsertResource({
      url: "https://www.youtube.com/watch?v=laser_resonator_clip",
      title: "Population Inversion and Stimulated Emission Worked Problem",
    });
    const matchCandidates = service.suggestCurriculumMatches(unassignedLaserClip.id);
    const bestCandidate = matchCandidates[0];
    // Before explicit approval, assisted match MUST have approved === false
    const unapprovedByDefault = bestCandidate ? bestCandidate.approved === false : false;
    if (bestCandidate) {
      service.approveCurriculumMatch({
        resourceId: unassignedLaserClip.id,
        topicId: bestCandidate.topicId,
        approved: true,
        method: "assisted",
      });
    }

    const surfBundle = buildSurfSenseExportBundle({
      resources: [laserLecture],
      segmentsByResource: { [laserLecture.id]: captionIngest1.segments },
      artifacts: service.listStudyArtifacts(laserLecture.id),
    });
    const surfImported = parseSurfSenseArtifactImport(JSON.stringify(surfBundle));

    assert(
      "Stage 16, 17 & 18 (Steps 17–19): Concept Prerequisite Graph, Assisted Topic Match (Explicit Approval Required) & SurfSense JSON Exchange",
      service.getConceptGraph("subj-applied-physics").links.length >= 1 &&
        Boolean(bestCandidate && bestCandidate.topicId === "topic-laser-pop-inv") &&
        unapprovedByDefault &&
        surfImported.length >= 2,
      `links=${service.getConceptGraph("subj-applied-physics").links.length}, topMatch=${bestCandidate?.topicId} (conf=${bestCandidate?.confidence}), surfArtifacts=${surfImported.length}`
    );

    // 9. Section 38 (Steps 20–23): Close & Reopen SQLite Database -> Verify Full Persistence, SHA-256 Backup & Zero Permanent Media
    const portableBundle = service.buildValidatedSqliteExportBundle();
    service.close();

    // Reopen fresh SQLite connection to the same disk file (simulating full process restart)
    service = new LearningOSSqliteService({
      dbPath,
      tempRootDir: tempExtractionDir,
      logFilePath,
    });

    const resourcesAfterRestart = service.listResources();
    const laserSegsAfterRestart = service.getTranscriptSegments(laserLecture.id, 0, 100);
    const ftsAfterRestart = service.searchFts5("Fabry-Perot optical resonator");
    const graphAfterRestart = service.getConceptGraph("subj-applied-physics");
    const storageAudit = service.auditStorage(workspacesDir);

    assert(
      "Section 38 (Steps 20–23): Full SQLite Persistence Across Restart, SHA-256 Portable Bundle & Permanent Media === 0 Bytes",
      resourcesAfterRestart.length === 4 &&
        laserSegsAfterRestart.total === 5 &&
        ftsAfterRestart.length >= 1 &&
        graphAfterRestart.links.length >= 1 &&
        storageAudit.permanentMediaBytes === 0 &&
        storageAudit.tempBytes === 0 &&
        portableBundle.excludesTemporaryMedia === true &&
        portableBundle.sha256IntegrityHash.length === 64,
      `resources=${resourcesAfterRestart.length}, laserSegs=${laserSegsAfterRestart.total}, permanentMediaBytes=${storageAudit.permanentMediaBytes}, sha256=${portableBundle.sha256IntegrityHash.slice(0, 12)}...`
    );

    // 10. Stage 24 Local Endpoint & Custom Server-Side API Key Router Verification
    const customTestSecret = "sk-custom-local-test-9999abcdef123456";
    let sawBearerAuthOnModels = false;
    let sawBearerAuthOnChat = false;
    let sawJsonFormatRetry = false;

    const mockLocalServer = http.createServer((req, res) => {
      const authHeader = req.headers.authorization || "";
      if (req.method === "GET" && req.url === "/v1/models") {
        if (authHeader === `Bearer ${customTestSecret}`) {
          sawBearerAuthOnModels = true;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            data: [{ id: "qwen2.5-7b-instruct-local" }, { id: "llama3.2-local" }],
          })
        );
        return;
      }

      if (req.method === "POST" && req.url === "/v1/chat/completions") {
        if (authHeader === `Bearer ${customTestSecret}`) {
          sawBearerAuthOnChat = true;
        }
        let rawBody = "";
        req.on("data", (chunk) => {
          rawBody += String(chunk);
        });
        req.on("end", () => {
          const parsed = JSON.parse(rawBody || "{}") as {
            model?: string;
            response_format?: { type?: string };
          };
          // Simulate llama.cpp / local GGUF servers rejecting `response_format: json_object` with HTTP 400
          if (parsed.response_format?.type === "json_object") {
            sawJsonFormatRetry = true;
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "response_format json_object unsupported by GGUF grammar" }));
            return;
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              model: parsed.model || "qwen2.5-7b-instruct-local",
              choices: [
                {
                  message: {
                    content: "```json\n{\"status\":\"ready\",\"answer\":\"Population inversion N2 > N1\"}\n```",
                  },
                },
              ],
            })
          );
        });
        return;
      }

      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => mockLocalServer.listen(0, "127.0.0.1", () => resolve()));
    try {
      const addr = mockLocalServer.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      const localConfigDir = path.join(tempRoot, "data", "config");
      fs.mkdirSync(localConfigDir, { recursive: true });
      fs.writeFileSync(
        path.join(localConfigDir, "local-secrets.json"),
        JSON.stringify({ CUSTOM_LLM_API_KEY: customTestSecret }, null, 2),
        { encoding: "utf-8", mode: 0o600 }
      );

      const localRouter = new LlmProviderRouter(tempRoot);
      const publicSnap = await localRouter.updateSettings({
        mode: "custom-openai",
        baseUrl: `http://127.0.0.1:${port}/v1`,
        model: "qwen2.5-7b-instruct-local",
        credentialSlot: "CUSTOM_LLM_API_KEY",
      });

      const discovered = await localRouter.discoverModels();
      const connTest = await localRouter.testConnection();
      const completion = await localRouter.generateCompletion({
        systemInstruction: "Return JSON answer.",
        userPrompt: "Explain laser population inversion.",
        expectJson: true,
      });
      const parsedCompletion = JSON.parse(completion.text) as { answer?: string };
      const snapshotJson = JSON.stringify(publicSnap);

      assert(
        "Stage 24 Local Endpoint & Custom Server Key: Discovers Local Models, Sends Bearer Key, Auto-Retries GGUF JSON & Never Leaks Secrets",
        sawBearerAuthOnModels &&
          sawBearerAuthOnChat &&
          sawJsonFormatRetry &&
          discovered.models.includes("qwen2.5-7b-instruct-local") &&
          connTest.ok === true &&
          connTest.isLocalEndpoint === true &&
          parsedCompletion.answer === "Population inversion N2 > N1" &&
          !snapshotJson.includes(customTestSecret),
        `endpoint=127.0.0.1:${port}, models=${discovered.models.length}, retry=${sawJsonFormatRetry}, secretLeaked=${snapshotJson.includes(customTestSecret)}`
      );
    } finally {
      await new Promise<void>((resolve) => mockLocalServer.close(() => resolve()));
    }
  } finally {
    try {
      service.close();
    } catch {
      // ignore
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  console.log(
    `\nLearningOS SQLite, FTS5 & 23-Step Master Acceptance Suite: ${passed}/${results.length} assertions passed`
  );
  for (const r of results) {
    console.log(`  [${r.passed ? "PASS" : "FAIL"}] ${r.name} — ${r.detail}`);
  }
  if (failed > 0) {
    process.exit(1);
  }
}

void runLearningOSSqliteAndMasterAcceptanceTests();
