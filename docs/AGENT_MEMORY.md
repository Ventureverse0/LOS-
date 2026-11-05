# LearningOS / StudyOS — Persistent Agent Memory (`AGENT_MEMORY.md`)

> Stable engineering facts for future coding sessions. Never store API keys, tokens, or personal credentials in this file.

## 1. Runtime & Build Facts
- **Dev Server Port**: Must listen on `3000` in development (`process.env.NODE_ENV !== "production"` in `server.ts`); port `8080` is occupied by the container supervisor in preview environments.
- **SQLite Engine**: Node.js v22 built-in `node:sqlite` (`DatabaseSync`) is available natively with compiled **FTS5** (`bm25()`, `snippet()`, `porter unicode61`). Run `tsx --no-warnings` in test scripts to suppress Node's experimental SQLite banner cleanly.
- **TypeScript Config**: `tsconfig.json` includes `"types": ["vite/client", "node"]`.
- **Test Command**: `npm test` runs both `src/lib/gamification.test.ts` (38 pure unit assertions) and `src/server/learningOS.test.ts` (9 SQLite + FTS5 + 23-step E2E assertions).

## 2. Non-Negotiable Preservation & Storage Invariants
1. **Zero Deletion Policy**: StudyOS v3 views (`Dashboard`, `Courses`, `Vault`, `Synthesizer`, `Tasks & Exams`, `Growth Intelligence`, `Academic Profile`, `Pomodoro`, `Flashcards`, `Terminal`, `Physics Lab`), `StudyOSState` (`schemaVersion: 3`), existing `/api/db/*` and `/api/ai/*` endpoints, and original `/docs/*.md` files must never be removed or broken.
2. **Zero Permanent Lecture Media**: `permanentMediaBytes` in `getStorageAudit()` must always equal `0`. Transient Whisper audio buffers exist exclusively inside `data/temp/extraction/<jobId>/` and are deleted inside `finally` across `cleaned`, `failed`, and `cancelled` transitions.
3. **Captions-First Rule**: Always parse/ingest WebVTT/SRT/XML subtitles before invoking `runWhisperFallbackJob`.
4. **Gemini SDK Rule**: Use `@google/genai` server-side (`gemini-3.8-flash` default); never pass `temperature`, `topP`, or `topK` to Gemini 3 models, and never expose API keys or key-entry inputs in the React client.
5. **License Hygiene**: `youtube-learning-tracker` (`NOASSERTION`), `Anki-Android` (`GPL-3.0`), `Trilium` (`AGPL-3.0`), and `logseq` (`AGPL-3.0`) are strictly zero-copy reference/interchange boundaries.
