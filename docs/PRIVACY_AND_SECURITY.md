# StudyOS — Privacy, Security & Data Ownership Architecture

## 1. Local-First Data Ownership Model

StudyOS is designed around transparent student data ownership:
1. **Browser Primary Storage (`IndexedDB` + `localStorage`)**:
   - Every learner profile is isolated under its own key (`study_os_profile_state_v2:<profileId>` and `StudyOS_IndexedDB_v2` store `workspaces`).
   - Save health is monitored continuously (`StorageSaveResult`). Any quota or serialization failure surfaces an immediate **`Save Failed · Retry`** alert in the Header Bar, Sidebar, and Knowledge Vault so work is never lost silently.
2. **Optional Local Server Workspace Snapshot (`./data/workspaces/<workspaceSyncId>.json`)**:
   - Express (`server.ts`) exposes `GET / PUT / DELETE /api/db/workspaces/:workspaceId` restricted strictly to regex `^[a-zA-Z0-9_-]{8,64}$` to prevent path traversal.
   - **Important Boundary Disclosure**: Local server workspace files are keyed by the unauthenticated `workspaceSyncId` token on the running Node server filesystem and are intended for single-machine or trusted-workspace sync. In ephemeral cloud container environments, server disk may reset across redeploys; therefore, browser `IndexedDB` + `.studyos.json` portable exports remain the authoritative user-owned durability layer unless an authenticated cloud database is explicitly provisioned.
   - Existing production/local workspace snapshots (including `data/workspaces/ws_shoeyidc5qn2oi.json`) are preserved untouched and upgraded non-destructively in memory on read.

---

## 2. Server-Side AI Proxy & Secret Isolation

- **Zero Client-Side API Keys**: No LLM keys (`GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`) are ever bundled into Vite client code or requested via UI forms.
- **Scoped Context Transmission**: When a learner invokes Grokopedia Curriculum Synthesis, Autonomous Vault Sync, or the Record-Grounded AI Tutor (`/api/ai/tutor`), only the explicitly selected topic's notes, concepts, and summarized error history are sent to the server proxy.
- **Offline First-Principles Fallback**: When no API key is configured or network connectivity is unavailable, StudyOS automatically falls back to deterministic local synthesis (`integrativePhysicsEngine.ts` and `buildDeterministicTopicQuiz`) without exposing stack traces or failing user workflows.

---

## 3. User Data Portability & Deletion Controls

Available anytime in **Settings (`Mod+8`)** and **Command Palette (`Mod+K`)**:
- **Full Database Backup (`.studyos.json`)**: Exports the complete v3 `StudyOSState` envelope (`schemaVersion: "3.0.0"`) with record counts for full round-trip restore on any browser or machine.
- **Anki Flashcard Export (`.tsv`)**: Exports tab-separated active-recall cards tagged by course code and Leitner box.
- **Evidence-Backed Portfolio Export (`.md`)**: Exports an honest Markdown academic & skill portfolio clearly distinguishing self-reported confidence from internal assessment evidence.
- **Explicit Deletion**:
  - **Delete Learner Profile**: Removes the selected secondary profile from `localStorage` and `IndexedDB`.
  - **Delete Server Snapshot**: Two-step confirmed `DELETE /api/db/workspaces/:workspaceId` removes the server-side JSON snapshot for the current `workspaceSyncId`.
  - **Reset Current Workspace**: Two-step confirmed clean-slate reset for the active profile.
