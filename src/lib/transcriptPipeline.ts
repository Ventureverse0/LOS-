/* ============================================================================
 * STAGE 6, 7 & 8: SOURCE ADAPTERS & CAPTIONS-FIRST TRANSCRIPT PIPELINE
 * - Detects source types (youtube, webpage, pdf, note, local_file)
 * - Enforces permanentDownload: false by rule
 * - Parses WebVTT (.vtt), SubRip (.srt), XML timedtext, and timestamped lines
 * - Normalizes duplicate rollover cues, preserves language, computes content hash
 * ========================================================================== */

import type {
  ResourceSourceType,
  SourceCapabilities,
  TranscriptSegmentRecord,
} from "../types/learningOS";

export interface RawSubtitleCue {
  startMs: number;
  endMs: number;
  text: string;
}

export interface SourceResolution {
  sourceType: ResourceSourceType;
  canonicalUrl: string;
  youtubeVideoId?: string;
  inferredTitle: string;
  capabilities: SourceCapabilities;
}

export interface SourceAdapter {
  readonly id: ResourceSourceType;
  resolve(inputUrlOrRef: string): SourceResolution;
  getCapabilities(inputUrlOrRef: string): SourceCapabilities;
}

export function extractYouTubeVideoId(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    if (host === "youtu.be") {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      return id && /^[a-zA-Z0-9_-]{6,16}$/.test(id) ? id : null;
    }
    if (host.endsWith("youtube.com")) {
      const v = parsed.searchParams.get("v");
      if (v && /^[a-zA-Z0-9_-]{6,16}$/.test(v)) return v;
      const parts = parsed.pathname.split("/").filter(Boolean);
      if ((parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live") && parts[1]) {
        return /^[a-zA-Z0-9_-]{6,16}$/.test(parts[1]) ? parts[1] : null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function detectResourceSourceType(input: string): ResourceSourceType {
  const trimmed = input.trim();
  if (extractYouTubeVideoId(trimmed)) return "youtube";
  if (/\.pdf(?:[?#].*)?$/i.test(trimmed)) return "pdf";
  if (/^(?:file:\/\/|[a-zA-Z]:\\|\/|\.\.?\/)/.test(trimmed)) return "local_file";
  if (/^note:\/\//i.test(trimmed)) return "note";
  return "webpage";
}

export function getDefaultSourceCapabilities(sourceType: ResourceSourceType): SourceCapabilities {
  switch (sourceType) {
    case "youtube":
      return {
        metadata: true,
        subtitles: true,
        streamUrl: true,
        permanentDownload: false,
      };
    case "pdf":
    case "webpage":
      return {
        metadata: true,
        subtitles: false,
        streamUrl: false,
        permanentDownload: false,
      };
    case "note":
    case "local_file":
    default:
      return {
        metadata: true,
        subtitles: false,
        streamUrl: false,
        permanentDownload: false,
      };
  }
}

export function resolveSourceInput(rawInput: string): SourceResolution {
  const trimmed = rawInput.trim();
  const sourceType = detectResourceSourceType(trimmed);
  const ytId = extractYouTubeVideoId(trimmed);

  let canonicalUrl = trimmed;
  let inferredTitle = "Untitled Learning Resource";

  if (ytId) {
    canonicalUrl = `https://www.youtube.com/watch?v=${ytId}`;
    inferredTitle = `YouTube Lecture (${ytId})`;
  } else {
    try {
      const u = new URL(trimmed);
      const lastSeg = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() || "");
      inferredTitle = lastSeg
        ? lastSeg.replace(/[-_]+/g, " ").replace(/\.[a-z0-9]{2,5}$/i, "")
        : u.hostname;
    } catch {
      inferredTitle = trimmed.split(/[\\/]/).pop() || "Local Reference";
    }
  }

  return {
    sourceType,
    canonicalUrl,
    youtubeVideoId: ytId ?? undefined,
    inferredTitle,
    capabilities: getDefaultSourceCapabilities(sourceType),
  };
}

/**
 * Parses `HH:MM:SS.mmm`, `HH:MM:SS,mmm`, `MM:SS.mmm`, or `MM:SS` into integer milliseconds.
 */
export function parseCueTimestampMs(raw: string): number | null {
  const clean = raw.trim().replace(",", ".");
  const match = clean.match(/^(?:(\d{1,3}):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/);
  if (!match) return null;
  const hours = match[1] ? parseInt(match[1], 10) : 0;
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);
  const msPart = match[4] ? parseInt(match[4].padEnd(3, "0").slice(0, 3), 10) : 0;
  if (minutes >= 60 || seconds >= 60) return null;
  return ((hours * 3600 + minutes * 60 + seconds) * 1000) + msPart;
}

export function formatMsToTimestamp(ms: number): string {
  const safeMs = Math.max(0, Math.floor(ms));
  const totalSec = Math.floor(safeMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function buildYouTubeEmbedAtSeconds(rawUrl: string, startSeconds: number = 0): string | null {
  const id = extractYouTubeVideoId(rawUrl);
  if (!id) return null;
  const start = Math.max(0, Math.floor(startSeconds));
  return `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1${
    start > 0 ? `&start=${start}` : ""
  }`;
}

function stripSubtitleMarkup(text: string): string {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parses WebVTT (.vtt), SubRip (.srt), YouTube XML timedtext, or `[MM:SS] text` lines.
 */
export function parseVttOrSrtTranscript(rawContent: string): RawSubtitleCue[] {
  const trimmed = rawContent.replace(/^\uFEFF/, "").trim();
  if (!trimmed) return [];

  // 1. Check XML <text start="12.34" dur="3.21">...</text> timedtext format
  if (trimmed.includes("<text") && trimmed.includes("start=")) {
    const cues: RawSubtitleCue[] = [];
    const regex = /<text[^>]*start=["']([\d.]+)["'][^>]*(?:dur=["']([\d.]+)["'])?[^>]*>([\s\S]*?)<\/text>/gi;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(trimmed)) !== null) {
      const startSec = parseFloat(m[1]);
      const durSec = m[2] ? parseFloat(m[2]) : 3;
      const text = stripSubtitleMarkup(m[3]);
      if (Number.isFinite(startSec) && text) {
        const startMs = Math.round(startSec * 1000);
        const endMs = Math.max(startMs + 500, Math.round((startSec + (Number.isFinite(durSec) ? durSec : 3)) * 1000));
        cues.push({ startMs, endMs, text });
      }
    }
    if (cues.length > 0) return cues;
  }

  // 2. Standard WebVTT / SRT cue blocks (`00:00:01.000 --> 00:00:04.500`)
  const normalizedNewlines = trimmed.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = normalizedNewlines.split(/\n{2,}/);
  const vttSrtCues: RawSubtitleCue[] = [];

  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;
    if (/^(?:WEBVTT|NOTE|STYLE|REGION)\b/i.test(lines[0])) continue;

    let arrowIdx = -1;
    for (let i = 0; i < Math.min(lines.length, 3); i++) {
      if (lines[i].includes("-->")) {
        arrowIdx = i;
        break;
      }
    }
    if (arrowIdx === -1) continue;

    const timingLine = lines[arrowIdx];
    const [leftRaw, rightWithSettings] = timingLine.split("-->");
    const rightRaw = (rightWithSettings || "").trim().split(/\s+/)[0] || "";
    const startMs = parseCueTimestampMs(leftRaw || "");
    const endMs = parseCueTimestampMs(rightRaw);
    if (startMs === null || endMs === null) continue;

    const textLines = lines.slice(arrowIdx + 1).map(stripSubtitleMarkup).filter(Boolean);
    const joined = textLines.join(" ").trim();
    if (!joined) continue;

    vttSrtCues.push({
      startMs,
      endMs: Math.max(startMs + 250, endMs),
      text: joined,
    });
  }

  if (vttSrtCues.length > 0) {
    return vttSrtCues;
  }

  // 3. Fallback: bracketed/inline timestamped notes (`[12:40] Symplectic forms...` or `12:40 Symplectic...`)
  const lineCues: RawSubtitleCue[] = [];
  const rawLines = normalizedNewlines.split("\n");
  let runningMs = 0;

  for (const rawLine of rawLines) {
    const cleanLine = rawLine.trim();
    if (!cleanLine || /^WEBVTT/i.test(cleanLine)) continue;
    const tsMatch = cleanLine.match(/^\[?((?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?)\]?\s*[-–:]?\s*(.+)$/);
    if (tsMatch) {
      const parsedMs = parseCueTimestampMs(tsMatch[1]);
      const body = stripSubtitleMarkup(tsMatch[2]);
      if (parsedMs !== null && body) {
        if (lineCues.length > 0 && lineCues[lineCues.length - 1].endMs <= lineCues[lineCues.length - 1].startMs + 4000) {
          lineCues[lineCues.length - 1].endMs = Math.max(
            lineCues[lineCues.length - 1].startMs + 1000,
            parsedMs
          );
        }
        lineCues.push({
          startMs: parsedMs,
          endMs: parsedMs + 5000,
          text: body,
        });
        runningMs = parsedMs + 5000;
        continue;
      }
    }
    const plain = stripSubtitleMarkup(cleanLine);
    if (plain) {
      lineCues.push({
        startMs: runningMs,
        endMs: runningMs + 5000,
        text: plain,
      });
      runningMs += 5000;
    }
  }

  return lineCues;
}

/**
 * Normalizes cues by sorting chronologically, removing exact rollover duplicates,
 * and merging micro-fragments without destructive AI rewriting.
 */
export function normalizeTranscriptSegments(params: {
  cues: RawSubtitleCue[];
  transcriptId: string;
  resourceId: string;
}): TranscriptSegmentRecord[] {
  const sorted = params.cues
    .filter((c) => c.text.trim().length > 0)
    .slice()
    .sort((a, b) => a.startMs - b.startMs);

  const merged: RawSubtitleCue[] = [];

  for (const cue of sorted) {
    const text = cue.text.trim();
    const prev = merged[merged.length - 1];

    if (prev) {
      // Exact duplicate rollover cue
      if (prev.text.toLowerCase() === text.toLowerCase() && cue.startMs <= prev.endMs + 1500) {
        prev.endMs = Math.max(prev.endMs, cue.endMs);
        continue;
      }
      // Rolling auto-caption prefix expansion (e.g. "population" -> "population inversion occurs")
      if (
        text.toLowerCase().startsWith(prev.text.toLowerCase()) &&
        cue.startMs <= prev.endMs + 800 &&
        text.length - prev.text.length < 120
      ) {
        prev.text = text;
        prev.endMs = Math.max(prev.endMs, cue.endMs);
        continue;
      }
    }

    merged.push({
      startMs: Math.max(0, cue.startMs),
      endMs: Math.max(cue.startMs + 250, cue.endMs),
      text,
    });
  }

  return merged.map((cue, idx) => ({
    id: `seg-${params.transcriptId}-${idx + 1}`,
    transcriptId: params.transcriptId,
    resourceId: params.resourceId,
    sequence: idx + 1,
    startMs: cue.startMs,
    endMs: cue.endMs,
    text: cue.text,
  }));
}

/**
 * Computes a deterministic browser+Node compatible 64-bit FNV-1a hex content hash
 * for transcript & artifact idempotency checks.
 */
export function computeDeterministicHash(content: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5 ^ 0x9e3779b9;
  for (let i = 0; i < content.length; i++) {
    const ch = content.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch ^ (i & 0xff);
    h2 = Math.imul(h2, 0x01000193);
  }
  return `fnv64_${(h1 >>> 0).toString(16).padStart(8, "0")}${(h2 >>> 0)
    .toString(16)
    .padStart(8, "0")}`;
}
