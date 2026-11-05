/* ============================================================================
 * STAGES 18, 19 & 20: EXTERNAL INTEGRATION BOUNDARIES & ISOLATION ADAPTERS
 * - Stage 18: SurfSense controlled JSON exchange boundary (zero DB coupling)
 * - Stage 19: OpenMAIC-compatible InteractiveLesson DSL adapter & validator
 * - Stage 20: Controlled External Web App Host (default-deny origin allowlist)
 * ========================================================================== */

import type {
  ConceptNode,
  InteractiveLessonArtifact,
  InteractiveLessonSection,
  LearningResourceRecord,
  StudyArtifactRecord,
  SurfSenseExchangeBundle,
  TranscriptSegmentRecord,
  WebAppManifest,
} from "../types/learningOS";
import { formatMsToTimestamp } from "../lib/transcriptPipeline";

/* ============================================================================
 * STAGE 18: SURFSENSE FILE/JSON EXCHANGE ADAPTER (apps/integrations/surfsense)
 * ========================================================================== */
export const SURFSENSE_APP_MANIFEST = {
  appId: "surfsense_bridge",
  name: "SurfSense Study Artifact Exchange",
  runtime: "bridge" as const,
  capabilities: ["resource.read", "notes.read", "notes.write"] as const,
  permissions: ["read", "write"] as const,
  launchBehavior: "exchange_bundle_only" as const,
};

export function buildSurfSenseExportBundle(params: {
  resources: LearningResourceRecord[];
  segmentsByResource: Record<string, TranscriptSegmentRecord[]>;
  artifacts: StudyArtifactRecord[];
}): SurfSenseExchangeBundle {
  return {
    format: "learningos-surfsense-exchange-v1",
    exportedAt: new Date().toISOString(),
    resources: params.resources.map((r) => {
      const segs = params.segmentsByResource[r.id] || [];
      const transcriptExcerpt = segs
        .slice(0, 12)
        .map((s) => `[${formatMsToTimestamp(s.startMs)}] ${s.text}`)
        .join("\n");
      return {
        id: r.id,
        title: r.title,
        url: r.url,
        sourceType: r.sourceType,
        transcriptExcerpt,
      };
    }),
    artifacts: params.artifacts.map((a) => ({
      id: a.id,
      artifactType: a.artifactType,
      title: String((a.content as { title?: string })?.title || `${a.artifactType} (${a.id})`),
      markdown: String(
        (a.content as { markdown?: string })?.markdown || JSON.stringify(a.content, null, 2)
      ),
      provenanceUrl: a.resourceIds[0] || undefined,
    })),
  };
}

export function parseSurfSenseArtifactImport(rawJson: string): Array<{
  title: string;
  markdown: string;
  provenanceUrl?: string;
}> {
  const parsed = JSON.parse(rawJson) as Partial<SurfSenseExchangeBundle> & {
    notes?: Array<{ title?: string; content?: string; url?: string }>;
  };

  if (Array.isArray(parsed.artifacts)) {
    return parsed.artifacts
      .filter((a) => Boolean(a && a.title && a.markdown))
      .map((a) => ({
        title: String(a.title).trim(),
        markdown: String(a.markdown).trim(),
        provenanceUrl: a.provenanceUrl,
      }));
  }

  if (Array.isArray(parsed.notes)) {
    return parsed.notes
      .filter((n) => Boolean(n && n.title && n.content))
      .map((n) => ({
        title: String(n.title).trim(),
        markdown: String(n.content).trim(),
        provenanceUrl: n.url,
      }));
  }

  throw new Error("Unrecognized SurfSense exchange JSON payload.");
}

/* ============================================================================
 * STAGE 19: OPENMAIC INTERACTIVE LESSON ADAPTER (apps/integrations/openmaic)
 * - Generates interactive slide, whiteboard, concept navigation & quiz sections
 * - Strictly sets permanentVideoGenerated: false (no video generation by default)
 * ========================================================================== */
export function compileInteractiveLessonArtifact(params: {
  topicTitle: string;
  resources: LearningResourceRecord[];
  segments: TranscriptSegmentRecord[];
  concepts: ConceptNode[];
  notesMarkdown: string;
  requestedSections?: Array<InteractiveLessonSection["kind"]>;
}): InteractiveLessonArtifact {
  const chosenKinds: Array<InteractiveLessonSection["kind"]> =
    params.requestedSections && params.requestedSections.length > 0
      ? params.requestedSections
      : ["slide", "whiteboard", "concept_nav", "quiz"];

  const topSegments = params.segments.slice(0, 4);
  const leadSeg = topSegments[0];
  const cleanNotesExcerpt = params.notesMarkdown.trim().slice(0, 700);
  const conceptListMd =
    params.concepts.length > 0
      ? params.concepts
          .slice(0, 6)
          .map((c) => `- **${c.name}**: ${c.definition}`)
          .join("\n")
      : `- **${params.topicTitle}**: Core principle anchored in attached curriculum sources.`;

  const sections: InteractiveLessonSection[] = chosenKinds.map((kind, idx) => {
    if (kind === "slide") {
      return {
        id: `sec-slide-${idx + 1}`,
        kind: "slide",
        title: `Concept Overview — ${params.topicTitle}`,
        bodyMarkdown:
          leadSeg
            ? `### Source-Anchored Framing\n\n> "${leadSeg.text}" *(Cue ${formatMsToTimestamp(
                leadSeg.startMs
              )})*\n\n${cleanNotesExcerpt || "Review the primary invariants and boundary conditions before advancing to the whiteboard step."}`
            : cleanNotesExcerpt ||
              `### ${params.topicTitle}\n\nStructured interactive briefing synthesized from your local curriculum notes.`,
        sourceSegmentId: leadSeg?.id,
        sourceStartMs: leadSeg?.startMs,
      };
    }

    if (kind === "whiteboard") {
      const cueLines = topSegments
        .map((s, i) => `${i + 1}. **[${formatMsToTimestamp(s.startMs)}]** ${s.text}`)
        .join("\n");
      return {
        id: `sec-wb-${idx + 1}`,
        kind: "whiteboard",
        title: `Step-by-Step Whiteboard Derivation`,
        bodyMarkdown: cueLines
          ? `### Guided Derivation Sequence\n\n${cueLines}\n\nWork through each step symbolically before checking numeric values.`
          : `### Guided Derivation Sequence\n\n1. State assumptions and conserved quantities for **${params.topicTitle}**.\n2. Relate input parameters to governing equations.\n3. Verify limiting cases.`,
        sourceSegmentId: topSegments[1]?.id ?? leadSeg?.id,
        sourceStartMs: topSegments[1]?.startMs ?? leadSeg?.startMs,
      };
    }

    if (kind === "concept_nav") {
      return {
        id: `sec-cnav-${idx + 1}`,
        kind: "concept_nav",
        title: `Prerequisite & Concept Map Check`,
        bodyMarkdown: `### Linked Concept Nodes\n\n${conceptListMd}`,
      };
    }

    if (kind === "simulation") {
      return {
        id: `sec-sim-${idx + 1}`,
        kind: "simulation",
        title: `Interactive Parameter Exploration`,
        bodyMarkdown: `Adjust boundary conditions in the StudyOS 3D RK4 Physics & Math Lab or test limiting inputs on **${params.topicTitle}** to observe stability and invariant behavior.`,
      };
    }

    // Checkpoint Quiz
    const targetConcept = params.concepts[0];
    const correctAns = targetConcept
      ? targetConcept.definition.slice(0, 140)
      : leadSeg
      ? leadSeg.text.slice(0, 140)
      : `Verify governing assumptions and test retrieval accuracy on ${params.topicTitle}.`;

    return {
      id: `sec-quiz-${idx + 1}`,
      kind: "quiz",
      title: `Active Retrieval Checkpoint`,
      bodyMarkdown: `Answer this source-grounded checkpoint before marking the interactive lesson complete:`,
      checkpointQuestion: {
        prompt: targetConcept
          ? `Which statement best defines "${targetConcept.name}" in ${params.topicTitle}?`
          : `Based on the source material for "${params.topicTitle}", which statement is supported by the lesson?`,
        options: [
          correctAns,
          `The principle holds without any boundary or conservation constraints.`,
          `Source evidence is unnecessary when self-confidence is rated 5/5.`,
          `All system parameters remain constant under arbitrary perturbations.`,
        ],
        correctAnswer: correctAns,
        explanation: leadSeg
          ? `Grounded in transcript cue [${formatMsToTimestamp(leadSeg.startMs)}].`
          : `Grounded in your local curriculum notes for ${params.topicTitle}.`,
      },
      sourceSegmentId: leadSeg?.id,
      sourceStartMs: leadSeg?.startMs,
    };
  });

  return {
    id: `lesson-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    dslVersion: "openmaic-adapter-1.0",
    title: `${params.topicTitle} — Interactive Lesson`,
    topicTitle: params.topicTitle,
    resourceIds: params.resources.map((r) => r.id),
    sections,
    permanentVideoGenerated: false,
    createdAt: new Date().toISOString(),
  };
}

export function validateInteractiveLessonArtifact(
  candidate: unknown
): { valid: boolean; error?: string } {
  if (!candidate || typeof candidate !== "object") {
    return { valid: false, error: "Lesson artifact must be an object." };
  }
  const obj = candidate as Partial<InteractiveLessonArtifact>;
  if (obj.dslVersion !== "openmaic-adapter-1.0") {
    return { valid: false, error: "Unsupported InteractiveLesson DSL version." };
  }
  if (obj.permanentVideoGenerated !== false) {
    return {
      valid: false,
      error: "Lesson artifact violates no-permanent-video rule.",
    };
  }
  if (!obj.title || !Array.isArray(obj.sections) || obj.sections.length === 0) {
    return { valid: false, error: "Lesson artifact requires a title and at least one section." };
  }
  return { valid: true };
}

/* ============================================================================
 * STAGE 20: CONTROLLED EXTERNAL WEB APP HOST (Default-Deny Origin Allowlist)
 * ========================================================================== */
export const DEFAULT_WEB_APP_MANIFEST: WebAppManifest = {
  id: "scholarly_web_viewer",
  name: "Allowlisted Scholarly Web Viewer",
  allowedOrigins: [
    "https://en.wikipedia.org",
    "https://arxiv.org",
    "https://ocw.mit.edu",
    "https://developer.mozilla.org",
    "https://www.youtube.com",
    "https://openstax.org",
  ],
  launchURL: "https://en.wikipedia.org/wiki/Laser",
  permissions: ["read", "external_web"],
  sessionPartition: "persist:learningos-isolated-web",
  canOpenExternal: true,
  enabledByDefault: true,
};

export interface WebOriginCheckResult {
  allowed: boolean;
  origin: string | null;
  normalizedUrl: string | null;
  requiresExternalBrowserFallback: boolean;
  reason: string;
}

const KNOWN_XFO_DENY_HOSTS = new Set([
  "arxiv.org",
  "github.com",
  "scholar.google.com",
]);

export function evaluateExternalWebUrl(
  rawUrl: string,
  manifest: WebAppManifest = DEFAULT_WEB_APP_MANIFEST
): WebOriginCheckResult {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return {
      allowed: false,
      origin: null,
      normalizedUrl: null,
      requiresExternalBrowserFallback: false,
      reason: "Empty URL blocked by default-deny policy.",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      allowed: false,
      origin: null,
      normalizedUrl: null,
      requiresExternalBrowserFallback: false,
      reason: "Malformed URL.",
    };
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return {
      allowed: false,
      origin: null,
      normalizedUrl: null,
      requiresExternalBrowserFallback: false,
      reason: `Disallowed protocol "${parsed.protocol}" (file:, javascript:, and data: URIs are strictly forbidden).`,
    };
  }

  const origin = parsed.origin.toLowerCase();
  const allowSet = new Set(manifest.allowedOrigins.map((o) => o.toLowerCase()));

  if (!allowSet.has(origin)) {
    return {
      allowed: false,
      origin,
      normalizedUrl: parsed.toString(),
      requiresExternalBrowserFallback: manifest.canOpenExternal,
      reason: `Origin "${origin}" is not in the explicit WebAppManifest allowlist. Blocked by default-deny security policy.`,
    };
  }

  const hostClean = parsed.hostname.replace(/^www\./i, "").toLowerCase();
  const requiresExternalBrowserFallback = KNOWN_XFO_DENY_HOSTS.has(hostClean);

  return {
    allowed: true,
    origin,
    normalizedUrl: parsed.toString(),
    requiresExternalBrowserFallback,
    reason: requiresExternalBrowserFallback
      ? `Origin "${origin}" is allowlisted, but this publisher sets X-Frame-Options/CSP frame restrictions — use "Open Externally" without bypassing site headers.`
      : `Origin "${origin}" verified against allowlist (isolated sandbox, zero Node/secret access).`,
  };
}
