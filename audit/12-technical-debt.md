# MASTER AUDIT SYNTHESIS: TECHNICAL DEBT & CODE QUALITY REGISTER
**Audit Deliverable**: `audit/12-technical-debt.md`  
**System**: JARVIS / Sofia Platform  
**Date**: November 2026  
**Auditor**: Principal Architecture & Code Quality Directorate  

---

## 1. Technical Debt Inventory & Impact Matrix

| Debt Item | Affected Files | Description | Technical Impact | Remediation Effort |
| :--- | :--- | :--- | :--- | :--- |
| **Dead Tool Catalog & Switch** | `src/lib/brain.ts:174-488` | `SOFIA_TOOLS` (11 tools) and `executeSofiaTool` are completely orphaned from production. | Dead code drift, test suite confusion, 315 lines of bloat. | Low (Delete) |
| **Dead 3D VRM Dependencies** | `package.json:12,13,19` | `three`, `@pixiv/three-vrm`, `@types/three` installed but zero imports in `src/`. | 150MB dead install weight; slower CI and Docker builds. | Low (Remove) |
| **Misnamed Middleware** | `src/proxy.ts:1-62` | Next.js App Router only executes `middleware.ts`; `proxy.ts` is ignored. | API routes left unprotected by default. | Low (Rename) |
| **Orphaned UI Components** | `src/components/CaptionLine.tsx`<br>`src/components/SofiaPanel.tsx`<br>`src/components/ScoreRing.tsx`<br>`src/components/CategoryBars.tsx` | Components exist in `src/components/` with zero callers. | Code clutter, misleading capabilities. | Low (Delete / Wire) |
| **Orphaned Voice Hook** | `src/hooks/useVoiceInput.ts` | 293 lines of Web Speech API STT and volume analysis left unimported. | Dead code; Push-to-Talk unbuilt. | Medium (Wire to UI) |
| **Simulated Action Handlers** | `src/lib/actions/restart-sofia.ts`<br>`src/lib/actions/sync-obsidian-vault.ts`<br>`src/lib/actions/tail-wazuh-alerts.ts` | Return hardcoded static strings instead of executing operations. | Model and user deceived into believing actions ran. | Medium (Implement/Disable) |
| **Test Schema Drift** | `tests/*.test.ts` | 4 test suites manually duplicate DDL schemas instead of calling `initDatabase()`. | Tests test obsolete schemas; miss migrations and columns. | Low (Export `initDatabase`) |
| **Collector Schism** | `agent-pc/agent.py` vs<br>`scripts/agent-pc.py` | Two competing collectors with incompatible auth headers, payloads, and polling. | Double code maintenance, telemetry bugs. | Low (Deprecate `agent.py`) |
| **Missing Primary Keys & Indexes** | `src/lib/db.ts:36-176` | Zero secondary indexes across 14 tables; non-monotonic string IDs. | Full table scans, risk of PRIMARY KEY collisions. | Low (Add DDL indexes) |
| **Un-parameterized SQL** | `src/lib/tools.ts:458`<br>`src/lib/brain.ts:395` | `WHERE status = '${args.status}'` raw string interpolation. | Critical SQL injection vulnerability. | Low (Parametrize) |

---

## 2. Redundancy & Dead Code Catalog

### Files Eligible for Immediate Deletion:
1. `src/lib/brain.ts` lines 174–488: Delete obsolete `SOFIA_TOOLS` and `executeSofiaTool`.
2. `src/components/CaptionLine.tsx`: Either wire into `Stage.tsx` for typewriter effect or delete.
3. `src/components/SofiaPanel.tsx`: Delete (replaced by `src/components/Pane.tsx`).
4. `src/components/ScoreRing.tsx`: Delete (replaced by SVG ring in `src/components/Stage.tsx`).
5. `src/components/CategoryBars.tsx`: Delete (replaced by `chart` pane).
6. `agent-pc/agent.py`: Deprecate in favor of `scripts/agent-pc.py`.
7. `public/models/`: Does not exist; remove any lingering documentation references.

### Dependencies Eligible for Immediate Removal:
```bash
pnpm remove three @pixiv/three-vrm @types/three
```

---

## 3. Architecture Refactoring Targets

1. **State Isolation**:
   Move `SofiaLiveSession` and `AudioContext` from `src/app/page.tsx` to a global provider in `src/app/layout.tsx` so voice connectivity persists across all page navigations.
2. **Session Identification**:
   Add `session_id TEXT NOT NULL` to `messages` and create a `conversations` table to eliminate global flat message collisions.
3. **Database WAL Mode**:
   Add `PRAGMA journal_mode = WAL;` and `PRAGMA busy_timeout = 5000;` to `src/lib/db.ts`.
