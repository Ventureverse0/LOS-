# Stage 7 Selective Reuse Record — `Samuel-025/youtube-learning-tracker`

## 1. License & Provenance Audit
- **Upstream URL**: `https://github.com/Samuel-025/youtube-learning-tracker`
- **Verified SPDX License**: `NOASSERTION` (upstream repository does not publish an open-source license file).
- **Compliance Decision**: Because `NOASSERTION` grants no copyright permission to copy source code, **zero lines of Python/JS code were copied** from `youtube-learning-tracker`. Instead, only high-level functional workflows were studied and implemented from scratch in clean-room TypeScript.

## 2. Clean-Room LearningOS Mapping

| Functional Concept | LearningOS Clean-Room Module | Adaptation & Enforced Product Rules |
|---|---|---|
| Remote lecture URL normalization & embed derivation | `/src/lib/transcriptPipeline.ts` (`resolveSourceMetadata`) | Extracts YouTube/Vimeo/OCW identifiers, constructs privacy-enhanced embed URLs, and stamps `permanentDownload: false`. |
| Captions-first subtitle parsing & deduplication | `/src/lib/transcriptPipeline.ts` (`parseSubtitleContent`, `normalizeTranscriptCues`) | Parses WebVTT, SRT, XML, and `[mm:ss]` transcripts; strips inline markup; deduplicates overlapping YouTube auto-caption rollover lines; computes deterministic 64-bit FNV-1a `contentHash`. |
| Curriculum & multi-topic resource mapping | `/src/server/sqliteLearningOS.ts` (`resources`, `resource_topics`) | Replaces flat playlist tracking with relational `Course -> Semester -> Subject -> Unit -> Topic` many-to-many mappings (`confidence`, `mapping_method`). |
| Timestamp deep-linking & lecture progress | `/src/components/views/LearningOSHubView.tsx` & `PATCH /api/learningos/resources/:id/progress` | Clicking any transcript cue updates player start offset and persists `lastPositionMs` + `progressPercent` in SQLite. |
| Flashcard & Markdown study export | `/src/lib/growthIntelligence.ts` & `/src/lib/fsrsScheduler.ts` | Exports Anki-compatible `.tsv` decks and structured Markdown notes with timestamp provenance. |

## 3. Explicitly Rejected Capabilities
- Any permanent `.mp4` / `.webm` / `.mp3` media file retention was rejected in accordance with Non-Negotiable Rule #2 (`permanentMediaBytes === 0`).
