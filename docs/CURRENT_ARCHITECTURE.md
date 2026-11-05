# StudyOS — Current Architecture

## 1. High-Level System Topology

StudyOS is a **local-first, full-stack TypeScript single-page application** served on port `3000` by a unified Node.js + Express entry point (`server.ts`) paired with a React 19 + Vite frontend (`src/`).

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Browser Client (React 19 + TypeScript + Tailwind CSS v4)                   │
│                                                                            │
│  ┌──────────────────┐   ┌───────────────────────┐   ┌───────────────────┐  │
│  │ UI Views & Modals│◄─►│ StudyOSContext        │◄─►│ Growth & Mastery  │  │
│  │ (Dashboard,      │   │ (Central State,       │   │ Pure Engines      │  │
│  │  Syllabus, Vault,│   │  Profile Isolation,   │   │ (gamification.ts, │  │
│  │  Assessments,    │   │  Debounced Sync,      │   │  growthIntel.ts,  │  │
│  │  Growth, Profile)│   │  Save Error Surface)  │   │  rk4Physics.ts)   │  │
│  └──────────────────┘   └──────────┬────────────┘   └───────────────────┘  │
│                                    │                                       │
│            ┌───────────────────────┼───────────────────────┐               │
│            ▼                       ▼                       ▼               │
│  ┌──────────────────┐   ┌───────────────────────┐   ┌───────────────────┐  │
│  │ localStorage     │   │ IndexedDB             │   │ Portable Exports  │  │
│  │ Per-profile sync │   │ StudyOS_IndexedDB_v2  │   │ .studyos.json,    │  │
│  │ fast boot cache  │   │ High-capacity store   │   │ .md, Anki .tsv    │  │
│  └──────────────────┘   └───────────────────────┘   └───────────────────┘  │
└────────────────────────────────────┼───────────────────────────────────────┘
                                     │ HTTP JSON (/api/* on Port 3000)
                                     ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ Express Backend (server.ts)                                                │
│                                                                            │
│  • /api/db/health & /api/db/workspaces/:workspaceId                        │
│    Atomic temp-file + rename JSON persistence in ./data/workspaces/        │
│                                                                            │
│  • /api/ai/status, /curriculum, /research, /vault-assist,                  │
│    /autonomous-sync, /integrative-blueprint, /tutor                        │
│    Server-side @google/genai (GEMINI_API_KEY) + multi-provider fallback    │
│    + zero-API deterministic First-Principles Compiler fallback             │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Routing & State Management

- **Navigation Model**: State-driven workspace switching via `AppView` enum in `src/context/StudyOSContext.tsx`. Global shortcuts (`Mod+1..9`, `Mod+K` Command Palette) and sidebar controls switch views without full page reloads.
- **Central Store**: `StudyOSContext` holds the active `StudyOSState` for `activeProfileId`, derived selectors, timer state, persistence telemetry (`saving` / `saved` / `local-only` / `error`), and domain mutation actions.

---

## 3. Data Persistence & Multi-Profile Isolation

StudyOS uses a **three-tier local-first persistence strategy** so single-user and multi-profile device workflows operate with zero external database setup or paid cloud dependencies:

1. **Tier 1 — `localStorage` (`study_os_profile_state_v2:<profileId>`)**:
   - Synchronous initial hydration on page load (`loadInitialStateSync`) for instant zero-flicker startup.
   - Cross-tab synchronization via the browser `storage` event.
2. **Tier 2 — `IndexedDB` (`StudyOS_IndexedDB_v2` object store `workspaces`)**:
   - Asynchronous structured storage capable of holding large note corpuses, assessment attempt histories, and learning event logs well beyond the ~5 MB `localStorage` ceiling.
   - Automatically hydrates state if `localStorage` is evicted or cleared.
3. **Tier 3 — Local Express Atomic File Store (`data/workspaces/<workspaceSyncId>.json`)**:
   - Debounced background `PUT /api/db/workspaces/:workspaceId` writes a versioned envelope (`workspaceId`, `updatedAt`, `revision`, `state`) using an atomic write-to-temp + `fs.rename` pattern.
   - Supports restoring a workspace across browsers connected to the same server via `workspaceSyncId`, plus full offline portability via `.studyos.json` export/import.

### Honest Persistence & Isolation Guarantees
- **Same-Browser Profiles**: Separate `LearnerProfileMeta` entries use distinct `profileId` keys and distinct `workspaceSyncId` files, preventing accidental data mixing between profiles.
- **Important Limitation**: This is **not** multi-tenant cryptographic cloud authentication. Users sharing physical access to the same unlocked OS/browser profile can inspect browser storage, and anyone possessing a `workspaceSyncId` on the same server instance can read/write that workspace snapshot. Containerized cloud hosts without persistent disk volumes may reset `./data/workspaces/` on container restart, making browser `IndexedDB` + `.studyos.json` exports the authoritative user-controlled backups.

---

## 4. AI & Deterministic Fallback Architecture

- **Server-Only Secrets**: All LLM API keys (`GEMINI_API_KEY`, optional `OPENAI_API_KEY`, `GROQ_API_KEY`, `DEEPSEEK_API_KEY`, `ANTHROPIC_API_KEY`, `OLLAMA_BASE_URL`) are read exclusively inside `server.ts`. No API keys or key-entry forms exist in client code.
- **Graceful Degradation**: Every AI endpoint wraps model calls in structured schema validation and falls back automatically to deterministic synthesis (`src/lib/integrativePhysicsEngine.ts` and record-grounded local analyzers) if the provider is unconfigured, offline, or rate-limited.
