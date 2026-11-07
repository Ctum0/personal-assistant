# MASTER AUDIT SYNTHESIS: REMEDIATION TRACKING LEDGER
**Audit Deliverable**: `audit/15-remediation-ledger.md`  
**System**: JARVIS / Sofia Platform  
**Date**: November 2026  
**Auditor**: Principal Architecture & Quality Assurance Directorate  

---

## 1. Remediation Status Ledger

| Finding ID | Severity | File(s) to Modify | Planned Action | Implementation Status | Verification Evidence |
|---|---|---|---|---|---|
| **FIND-01** | **P0** | `src/app/api/live/tool/route.ts` | Wrap route with `verifyApiAuth` to eliminate unauthenticated RCE. | **VERIFIED (Phase 11)** | `verifyApiAuth` injected; unauthorized requests rejected with 401 |
| **FIND-02** | **P0** | `src/lib/tools.ts` | Gating on `computer_run` (check kill switch & command allowlist). | **VERIFIED (Phase 11)** | Destructive patterns & kill switch blocked; Vitest suite passed |
| **FIND-03** | **P0** | `src/lib/tools.ts` | Path jailing on `computer_file_write` / `read` to `process.cwd()`. | **VERIFIED (Phase 11)** | `path.resolve` check blocks root & sensitive paths (`/etc/`, etc.) |
| **FIND-04** | **P0** | `src/lib/tools.ts`, `src/lib/brain.ts` | Parameterize `list_tasks` SQL queries. | **VERIFIED (Phase 11)** | Parameterized bound SQL (`?`) eliminates SQL injection |
| **FIND-05** | **P0** | `src/lib/tools.ts` | Store tags as JSON array string in `remember` tool. | **VERIFIED (Phase 11)** | Tags stored as JSON array; `/api/memory` parses cleanly |
| **FIND-06** | **P0** | `src/lib/db.ts` | Configure `PRAGMA journal_mode = WAL;` and `busy_timeout = 5000;`. | **VERIFIED (Phase 11)** | Configured in `getDatabase()`; WAL mode active |
| **FIND-07** | **P1** | `src/lib/live/session.ts` | Wire completed voice turns to persist into `messages` table. | **VERIFIED (Phase 11)** | Voice turn captions persisted to `/api/chat` with `persistOnly: true` |
| **FIND-08** | **P1** | `src/lib/db.ts` | Add `session_id` and `channel` columns with indexes to `messages`. | **VERIFIED (Phase 11)** | Columns migrated; secondary indexes created in SQLite |
| **FIND-09** | **P1** | `src/lib/live/session.ts` | Emit `this.setState('speaking')` and `'listening'` in playback loop. | **VERIFIED (Phase 11)** | State transitions wired to Web Audio playback start/end |
| **FIND-10** | **P1** | `src/lib/live/session.ts` | Correct VAD silence logic to avoid mid-sentence turn cutoffs. | **VERIFIED (Phase 11)** | Silence detector checks 600ms continuous quiet window |
| **FIND-11** | **P1** | `src/lib/brain.ts`, `src/lib/live/config.ts` | Replace invalid model identifiers with valid Gemini model names. | **VERIFIED (Phase 11)** | Updated to `gemini-2.0-flash` & `gemini-2.0-flash-exp` |
| **FIND-12** | **P1** | `src/lib/db.ts`, `src/lib/tools.ts` | Activate background scheduler poller for `schedules` table. | **SCHEDULED (Phase 10.2)** | Target for Phase 10.2 service daemon |
| **FIND-13** | **P1** | `src/app/api/auth/route.ts` | Support both `SOFIA_API_TOKEN` and `SOFIA_AUTH_TOKEN` tokens. | **VERIFIED (Phase 11)** | Verified in `src/lib/auth.ts` `validTokens` array |
| **FIND-14** | **P1** | `scripts/hermes-relay.py` | Unify Hermes target port to 8642 and fix socket descriptor leak. | **SCHEDULED (Phase 10.2)** | Python daemon cleanup target |
| **FIND-15** | **P2** | `src/components/SofiaAvatar.tsx` | Point fallback images to `.webp` instead of `.png`. | **VERIFIED (Phase 11)** | Pointed to `/sofia/expressions/neutral.webp` |
| **FIND-16** | **P2** | `src/components/SofiaAvatar.tsx` | Restore smooth crossfade opacity transition on expression change. | **VERIFIED (Phase 11)** | Clean opacity transition configured |
| **FIND-17** | **P2** | `src/lib/db.ts` | Add secondary indexes to `events`, `tasks`, `messages`, `memory_notes`. | **VERIFIED (Phase 11)** | `CREATE INDEX IF NOT EXISTS` executed in `initDatabase` |
