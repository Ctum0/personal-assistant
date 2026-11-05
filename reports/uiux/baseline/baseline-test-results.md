# Baseline Test Results — Sofia Personal AI Companion

**Date:** 2026-11-06  
**Auditor:** Antigravity 2.0 (Auditor)  

---

## 1. Automated Unit Test Execution

Executed: `pnpm vitest run`  
Test Runner: Vitest `v5.1.0`  
Environment: Node `v26.8.2`, Linux x86_64  

```text
 ✓ tests/policy.test.ts (6 tests) 11ms
   ✓ blocks if master switch is off
   ✓ blocks if kill switch is active
   ✓ clamps intensity to hard ceiling
   ✓ blocks during quiet hours (e.g. 2:00 AM)
   ✓ blocks if daily cap is reached
   ✓ blocks if 30-minute cooldown not met
 ✓ tests/scoring.test.ts (7 tests) 16ms
   ✓ computes wake score correctly: on or before target is 1.0, 4h late is 0.0
   ✓ computes focus score correctly
   ✓ computes output score correctly
   ✓ computes leisure score correctly: <=20% is 1.0, >=50% is 0.0
   ✓ computes sleep score correctly: 7-9h is 1.0, drops outside
   ✓ computes high score day (8+ commits, low leisure, early wake)
   ✓ handles low coverage (<80%) by disabling consequences

Test Files  2 passed (2)
     Tests  13 passed (13)
  Duration  229ms
```

**Status:** PASS (13/13 tests green, 0 failures).

---

## 2. Production Build Execution

Executed: `pnpm build`  
Build Engine: Next.js `16.4.5` (Turbopack)  

```text
✓ Compiled successfully in 503ms
✓ Finished TypeScript in 2.0s
✓ Collecting page data using 7 workers in 966ms
✓ Generating static pages using 7 workers (24/24) in 475ms
✓ Finalizing page optimization in 15ms
```

**Status:** PASS (All 24 application routes successfully generated).

---

## 3. Runtime Health & Services

- **Next.js Production Web Server**: Serving on port `3000` (PID `1693812`, status ACTIVE).
- **Hermes Gateway & API Server**: Serving on port `8642` (PID `1675458`, systemd user unit, status ACTIVE).
- **CUA Driver**: Version `0.21.0` installed and responsive in background desktop mode.
- **SQLite Database**: Initialized at `data/sofia.db` with WAL mode.
