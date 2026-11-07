# AUDIT REPORT: AGENT 9 — BACKEND, DATABASE & DATA INTEGRITY AUDITOR

**Target System**: JARVIS / Sofia Personal AI Companion (`agitated-archimedes`)  
**Auditor**: Agent 9 — Backend, Database & Data Integrity Auditor  
**Date**: November 2026  
**Scope**: `src/lib/db.ts`, `data/sofia.db`, API routes, scripts (`rollup.ts`, `backup.sh`), actions (`backup-sofia-db.ts`), tools (`tools.ts`, `brain.ts`), schema definitions, locking, concurrency, and integrity.  
**Deliverable File Path**: `audit/06-agent-reports/backend-database.md`

---

## EXECUTIVE SUMMARY

A rigorous, evidence-based audit of the Sofia backend data layer reveals an architecture that functions under minimal development loads, but possesses **critical vulnerabilities, concurrency race conditions, and catastrophic data loss / corruption vectors** under production concurrency and scale.

### Key Severity Findings
| Severity | Category | Issue Description | Location |
| :--- | :--- | :--- | :--- |
| **CRITICAL** | Security / Integrity | **SQL Injection Vulnerabilities**: `args.status` directly interpolated into raw SQL query strings. | `src/lib/tools.ts:458`, `src/lib/brain.ts:395` |
| **CRITICAL** | Corruption Risk | **Unsafe Live Database Backup**: Uses filesystem `fs.copyFileSync` on active SQLite DB, risking torn pages and corrupt backups. | `src/lib/actions/backup-sofia-db.ts:19` |
| **HIGH** | Concurrency / Locking | **Rollback Journal (`DELETE`) Mode & Zero Busy Timeout**: `PRAGMA busy_timeout = 0`, `PRAGMA journal_mode = delete`. Any concurrent write from worker scripts (`rollup.ts`), backup scripts, or API routes immediately crashes with `SQLITE_BUSY`. | `src/lib/db.ts:27-33`, empirical DB inspection |
| **HIGH** | Performance / Scaling | **Zero Secondary Indices Across All 16 Tables**: Every date query (`WHERE ts LIKE 'YYYY-MM-DD%'`), timeline calculation, task count, and chat history fetch triggers a full-table scan and filesort. | `src/lib/db.ts:36-176`, empirical `sqlite_master` check |
| **HIGH** | Integrity | **Zero Foreign Keys & Missing Domain Constraints**: Referential integrity is unenforced (`PRAGMA foreign_keys = 0`), zero `REFERENCES` clauses exist, and invalid states can be freely inserted. | `src/lib/db.ts:36-176` |
| **HIGH** | Scalability / Perf | **Un-transactioned Batch Ingestion**: `ingestEvents` inserts events one by one in autocommit mode without `BEGIN/COMMIT`, forcing an `fsync` per event with `synchronous = FULL`. | `src/lib/db.ts:402-425` |
| **MEDIUM** | Architecture | **Silent `try/catch` Migration Anti-Pattern**: 4 blind `ALTER TABLE` statements executed on every single startup with empty catch blocks, masking true database failures and precluding versioned migrations. | `src/lib/db.ts:178-183` |
| **MEDIUM** | Security / Auth | **Plaintext Token Storage**: Device token stored in plaintext in the `token_hash` column of `devices`. | `src/app/api/ingest/heartbeat/route.ts:14-17` |
| **MEDIUM** | Test Fragility | **Test Schema Drift**: `initDatabase` is unexported; all test files manually duplicate diverging DDL schemas, leading to silent test/prod divergence. | `tests/rollup.test.ts`, `tests/brain.test.ts`, `tests/cron.test.ts` |
| **MEDIUM** | Resilience | **Absence of Restore Automation & Retention**: No `scripts/restore.sh`, no retention/pruning policy for `events` (projected 1M rows/yr). | Repository-wide |

---

## 1. DATABASE ARCHITECTURE & SCHEMA INSPECTION

### 1.1 Runtime, Driver & Connection Lifecycle
- **Driver**: Node.js built-in `node:sqlite` (`DatabaseSync`), introduced experimentally in Node v22.5.0. Verified running on Node **v26.8.2**.
- **Location**: `src/lib/db.ts:23` targets `data/sofia.db`.
- **Connection Model** (`src/lib/db.ts:25-33`):
  ```typescript
  let _db: DatabaseSync | null = null;
  export function getDatabase(): DatabaseSync {
    if (!_db) {
      _db = new DatabaseSync(DB_PATH);
      initDatabase(_db);
    }
    return _db;
  }
  ```
  **Architectural Flaws**:
  1. **Next.js Dev / HMR Singleton Leak**: Next.js Fast Refresh and route module reloading create new module contexts. Because `_db` is a local file-level variable and not attached to `globalThis`, multiple `DatabaseSync` instances can be opened across hot reloads, colliding on database locks.
  2. **Multi-Process Disconnect**: Next.js standalone servers, external CLI workers (`scripts/rollup.ts`), and bash scripts (`scripts/backup.sh`) instantiate completely separate process connections to `sofia.db`. Because `PRAGMA busy_timeout` is defaulted to 0, simultaneous access causes immediate crashes.
  3. **Blocking Synchronous IO in Node.js Event Loop**: `DatabaseSync` is purely synchronous. Every `.run()`, `.get()`, and `.all()` blocks the entire Node.js main thread. If a large batch ingestion or slow query takes 300ms, all HTTP handling, WebSockets, and SSE streams for all users stall.

### 1.2 Table-by-Table Schema Inspection (16 Tables)
Empirically verified via `sqlite3 data/sofia.db ".schema"` and `sqlite_master`:

1. **`events`** (`src/lib/db.ts:38-48`):
   - Columns: `id TEXT PRIMARY KEY, ts TEXT NOT NULL, source TEXT NOT NULL, kind TEXT NOT NULL, category TEXT NOT NULL, app TEXT NOT NULL, title TEXT, duration_s INTEGER NOT NULL, meta TEXT`.
   - *Issues*: No index on `ts` or `(source, kind, ts)`. No check constraint on `category IN ('work', 'leisure', 'neutral', 'unknown')`.
2. **`day_stats`** (`src/lib/db.ts:50-60, 179-180`):
   - Columns: `date TEXT PRIMARY KEY, active_min INTEGER NOT NULL, work_min INTEGER NOT NULL, leisure_min INTEGER NOT NULL, neutral_min INTEGER NOT NULL, commits INTEGER NOT NULL, woke_at TEXT, bed_at TEXT, coverage REAL NOT NULL, offline_min INTEGER NOT NULL DEFAULT 0, tasks_done INTEGER NOT NULL DEFAULT 0`.
   - *Issues*: No CHECK on `coverage` (`0.0 <= coverage <= 1.0`). `woke_at` / `bed_at` store arbitrary strings without formatting constraints.
3. **`day_scores`** (`src/lib/db.ts:62-69`):
   - Columns: `date TEXT PRIMARY KEY, score REAL NOT NULL, components TEXT NOT NULL, verdict_json TEXT NOT NULL, intensity INTEGER NOT NULL, status TEXT NOT NULL`.
   - *Issues*: No foreign key to `day_stats(date)`. No check on `score BETWEEN 0 AND 100` or `status IN ('normal', 'rest', 'sick', 'travel')`.
4. **`day_summaries`** (`src/lib/db.ts:71-74`):
   - Columns: `date TEXT PRIMARY KEY, text TEXT NOT NULL`.
   - *Issues*: No foreign key to `day_stats(date)`.
5. **`messages`** (`src/lib/db.ts:76-83`):
   - Columns: `id TEXT PRIMARY KEY, ts TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, mood TEXT, tool_calls TEXT`.
   - *Issues*: Queried by `ORDER BY ts DESC LIMIT 30` in `/api/chat` with **no index on `ts`**. No CHECK constraint on `role`.
6. **`memory_notes`** (`src/lib/db.ts:85-91`):
   - Columns: `id TEXT PRIMARY KEY, text TEXT NOT NULL, tags TEXT NOT NULL, created_at TEXT NOT NULL, pinned INTEGER NOT NULL DEFAULT 0`.
   - *Issues*: Queried by `ORDER BY pinned DESC, created_at DESC` with **no index**. Tag storage is inconsistent (JSON stringified array vs comma-separated strings).
7. **`tasks`** (`src/lib/db.ts:93-101`):
   - Columns: `id TEXT PRIMARY KEY, title TEXT NOT NULL, due TEXT, status TEXT NOT NULL, est_min INTEGER NOT NULL, done_at TEXT, created_at TEXT NOT NULL`.
   - *Issues*: Frequent queries on `status`, `done_at`, and `created_at` without any indices. No CHECK constraint on `status`.
8. **`focus_sessions`** (`src/lib/db.ts:103-110`):
   - Columns: `id TEXT PRIMARY KEY, start TEXT NOT NULL, end TEXT, goal_min INTEGER NOT NULL, result TEXT NOT NULL, distraction_count INTEGER NOT NULL DEFAULT 0`.
   - *Issues*: Queried and updated by `WHERE result = 'active'` without index on `result`.
9. **`rules`** (`src/lib/db.ts:112-117, 181`):
   - Columns: `id TEXT PRIMARY KEY, match_type TEXT NOT NULL, pattern TEXT NOT NULL, category TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT ""`.
   - *Issues*: Scanned sequentially on every unclassified event in `classifyAppOrDomain`.
10. **`settings`** (`src/lib/db.ts:119-122`):
    - Columns: `key TEXT PRIMARY KEY, value TEXT NOT NULL`. Holds monolithic JSON string for key `'global'`.
11. **`consequence_log`** (`src/lib/db.ts:124-132`):
    - Columns: `id TEXT PRIMARY KEY, ts TEXT NOT NULL, kind TEXT NOT NULL, intensity INTEGER NOT NULL, reason TEXT NOT NULL, approved_by TEXT NOT NULL, status TEXT NOT NULL`.
12. **`devices`** (`src/lib/db.ts:134-140`):
    - Columns: `id TEXT PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT NOT NULL, last_seen TEXT, kind TEXT NOT NULL`.
    - *Issues*: Plaintext token stored in `token_hash`.
13. **`tts_usage`** (`src/lib/db.ts:142-148`):
    - Columns: `id TEXT PRIMARY KEY, provider TEXT NOT NULL, chars INTEGER NOT NULL, month TEXT NOT NULL, created_at TEXT NOT NULL`.
    - *Issues*: Queried with `WHERE month = ? AND provider = ?` on every TTS request without an index.
14. **`schedules`** (`src/lib/db.ts:150-159, 182`):
    - Columns: `id TEXT PRIMARY KEY, name TEXT NOT NULL, cron TEXT NOT NULL, action TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, last_run TEXT, next_run TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))`.
15. **`proactive_log`** (`src/lib/db.ts:161-168`):
    - Columns: `id TEXT PRIMARY KEY, ts TEXT NOT NULL, job TEXT NOT NULL, text TEXT NOT NULL, channel TEXT NOT NULL, suppressed_reason TEXT`.
    - *Issues*: Queried with `WHERE ts >= ? AND suppressed_reason IS NULL` on every proactive guardrail evaluation without an index.
16. **`live_usage`** (`src/lib/db.ts:170-175`):
    - Columns: `id TEXT PRIMARY KEY, date TEXT NOT NULL, seconds REAL NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))`.
    - *Issues*: Aggregated with `WHERE date = ?` without an index.

### 1.3 Test Schema Drift & Divergence
Because `initDatabase` is unexported (`src/lib/db.ts:36`), every test suite (`tests/rollup.test.ts`, `tests/brain.test.ts`, `tests/cron.test.ts`, `tests/live.test.ts`) re-implements raw DDL independently.
- **Drift Evidence**: `tests/brain.test.ts:24-34` defines `day_stats` **without** `offline_min` and `tasks_done` columns. If any test path invokes `rebuildDayStats`, the query fails with `no such column: offline_min`.
- **Inconsistent Tables**: `live.test.ts` creates `live_usage`, while other suites omit it entirely.

---

## 2. CONCURRENCY, LOCKING & WAL MODE ANALYSIS

### 2.1 Empirical SQLite PRAGMA Audit
Direct inspection of `data/sofia.db` via CLI reveals the active SQLite engine configuration:

```sql
PRAGMA journal_mode;  -- Result: delete
PRAGMA busy_timeout;  -- Result: 0
PRAGMA foreign_keys;  -- Result: 0
PRAGMA synchronous;   -- Result: 2 (FULL)
```

### 2.2 Concurrency Failure Mechanisms
1. **Contention Under Rollback Journal (`DELETE`) Mode**:
   In `DELETE` journal mode, SQLite requires an exclusive lock on the database file for any write. While writing, **all reads and writes are blocked**.
2. **Crash on Zero Busy Timeout (`busy_timeout = 0`)**:
   When `busy_timeout` is 0 ms, SQLite immediately raises `SQLITE_BUSY: database is locked` upon the slightest lock collision rather than waiting.
   - Scenario: `scripts/backup.sh` initiates a database backup. An incoming ActivityWatch event hits `/api/ingest/events`. Next.js immediately throws a 500 error because the DB is locked by the backup process.
   - Scenario: The rollup cron worker executes `npx tsx scripts/rollup.ts`. A user sends a chat message via `/api/chat`. The chat message insertion fails or crashes the worker.
3. **Synchronous I/O Stalls (`synchronous = FULL`)**:
   Under `synchronous = FULL` (mode 2) in `DELETE` journal mode, SQLite executes two physical disk `fsync` calls for every write transaction (one to the rollback journal, one to the database).
4. **SSE Stream Contention**:
   `src/app/api/stream/route.ts:29-43` sets up a 15-second interval timer per connected SSE client. Each interval executes `getDayStats` (which falls back to `rebuildDayStats` if cache is missed) and `getDayScore`. If multiple browser tabs are open, constant read transactions run against the single database connection, blocking or being blocked by write operations.

---

## 3. MIGRATIONS & SCHEMA EVOLUTION GAPS

### 3.1 The `try/catch` Migration Anti-Pattern
In `src/lib/db.ts:178-183`:
```typescript
// Migration guards for columns added in v2
try { db.exec('ALTER TABLE day_stats ADD COLUMN offline_min INTEGER NOT NULL DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE day_stats ADD COLUMN tasks_done INTEGER NOT NULL DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE rules ADD COLUMN created_at TEXT NOT NULL DEFAULT ""'); } catch {}
try { db.exec('ALTER TABLE schedules ADD COLUMN created_at TEXT NOT NULL DEFAULT ""'); } catch {}
```

### 3.2 Critical Architectural Deficiencies
1. **No Migration History / Versioning**: Neither `PRAGMA user_version` nor a `_migrations` table exists.
2. **Error Masking**: The empty `catch {}` blocks catch and suppress all errors indiscriminately. If SQLite fails due to disk corruption (`SQLITE_CORRUPT`), disk full (`SQLITE_FULL`), or permission errors, the system continues silently with missing columns.
3. **Performance Overhead on Boot**: These 4 failing statements are executed on every single application bootstrap.
4. **Inability to Perform Complex Migrations**: Column renames, type conversions, table reorganizations, or data backfills cannot be handled by blind `ALTER TABLE ADD COLUMN`.
5. **No Rollback Capability**: No down-migrations exist.

---

## 4. INTEGRITY CONSTRAINTS & SECURITY / FOREIGN KEY AUDIT

### 4.1 Critical SQL Injection Vulnerabilities
Two distinct files contain severe raw SQL string interpolation vulnerabilities:

#### Vulnerability 1: `src/lib/tools.ts:456-461`
```typescript
case 'list_tasks': {
  let sql = 'SELECT id, title, status, est_min FROM tasks';
  if (args.status && args.status !== 'all') {
    sql += ` WHERE status = '${args.status}'`;  // <--- SQL INJECTION
  }
  sql += ' ORDER BY created_at DESC LIMIT 10';
  const tasks = db.prepare(sql).all() ...
```

#### Vulnerability 2: `src/lib/brain.ts:392-398`
```typescript
case 'list_tasks': {
  let sql = 'SELECT id, title, status, est_min FROM tasks';
  if (args.status && args.status !== 'all') {
    sql += ` WHERE status = '${args.status}'`;  // <--- SQL INJECTION
  }
  sql += ' ORDER BY created_at DESC LIMIT 10';
  const tasks = db.prepare(sql).all() ...
```
**Impact**: An attacker or an adversarial prompt can inject arbitrary SQLite statements via `status` (e.g. `' OR '1'='1`, `'; DROP TABLE tasks; --`, or `' UNION SELECT id, token_hash, name, last_seen FROM devices --`).

### 4.2 Total Absence of Foreign Keys
In `initDatabase` (`src/lib/db.ts:36-176`), **zero foreign key constraints exist**:
- `day_scores` has no foreign key to `day_stats(date)`.
- `day_summaries` has no foreign key to `day_stats(date)`.
- `events` has no foreign key to `devices(id)`.
- `proactive_log` has no foreign key to `schedules(id)`.
Furthermore, `PRAGMA foreign_keys` is not turned on at connection time. Orphaned records can accumulate without restriction.

### 4.3 Missing CHECK Constraints & Domain Integrity
None of the tables enforce domain constraints:
- `tasks.status`: Does not enforce `CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled'))`.
- `events.category`: Does not enforce `CHECK (category IN ('work', 'leisure', 'neutral', 'unknown'))`.
- `day_scores.score`: Does not enforce `CHECK (score >= 0.0 AND score <= 100.0)`.
- `day_scores.status`: Does not enforce `CHECK (status IN ('normal', 'rest', 'sick', 'travel'))`.
- `focus_sessions.result`: Does not enforce `CHECK (result IN ('active', 'completed', 'interrupted', 'abandoned'))`.

### 4.4 Non-Transactional Batch Ingestion
In `src/lib/db.ts:402-432` (`ingestEvents`):
```typescript
for (const e of events) {
  // insert.run(...) executed outside of a transaction!
  insert.run(id, ts, source, kind, category, app, title, duration, meta);
  count++;
  datesToRecalc.add(ts.slice(0, 10));
}
```
If a batch contains 500 events, 500 independent autocommit transactions are executed. If event 250 fails, the first 249 remain in the database, resulting in partial batch insertion.

### 4.5 Race Conditions in `rebuildDayStats`
`rebuildDayStats` (`src/lib/db.ts:434-546`) reads all events for a date, aggregates metrics in JavaScript memory, writes to `day_stats`, computes day score in JavaScript, and writes to `day_scores`.
Because this entire read-compute-write cycle runs outside a database transaction:
- Two concurrent event ingestions for the same day will read stale event sets simultaneously.
- The second write will overwrite the first with incomplete statistics.

### 4.6 Unhashed Device Token Storage
In `src/app/api/ingest/heartbeat/route.ts:13-17`:
```typescript
db.prepare(`
  INSERT INTO devices (id, name, token_hash, last_seen, kind)
  VALUES (?, ?, ?, ?, 'pc')
  ON CONFLICT(id) DO UPDATE SET last_seen = ?, kind = 'pc'
`).run(deviceId, deviceId, tokenHeader || 'unauthenticated', nowIso, nowIso);
```
The raw `tokenHeader` is stored directly into the `token_hash` column without hashing (e.g. SHA-256), compromising device credentials if the database is exposed.

---

## 5. BACKUP, ARCHIVAL & DATA RECOVERY AUDIT

### 5.1 Catastrophic Flaw in `backup-sofia-db.ts`
In `src/lib/actions/backup-sofia-db.ts:17-21`:
```typescript
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const destDb = path.join(backupDir, `sofia-backup-${timestamp}.db`);
fs.copyFileSync(sourceDb, destDb);
```
**CRITICAL FAILURE**: Using `fs.copyFileSync` on a live, open SQLite database file is an explicit violation of SQLite operational rules. If a write is occurring during `copyFileSync`, the destination file will contain **torn pages, out-of-order writes, or uncommitted journal/WAL state**, resulting in an unrecoverable, corrupt backup (`SQLITE_CORRUPT`).
Furthermore:
- The backup is uncompressed.
- Old backups are never purged (disk fills indefinitely).
- No integrity check (`PRAGMA integrity_check`) is performed.

### 5.2 Audit of `scripts/backup.sh`
In `scripts/backup.sh:19-28`:
```bash
sqlite3 "${DB_FILE}" ".backup '${BACKUP_FILE}'"
gzip -f "${BACKUP_FILE}"
find "${BACKUP_DIR}" -name "sofia_backup_*.db.gz" -mtime +14 -delete || true
```
**Assessment**:
- **Positive**: Uses SQLite's online backup API via `.backup`, which acquires the proper locks and copies pages safely.
- **Deficiencies**:
  1. Does not specify a `busy_timeout`. If Next.js holds a write lock, the script immediately terminates with exit code 1.
  2. Does not checkpoint the WAL journal before backup.
  3. Does not run `PRAGMA integrity_check` on the target database before or after backup.
  4. Retention uses `-mtime +14`, but does not guarantee keeping a minimum number of backups (e.g., if the backup fails for 14 days, all historical backups are wiped).

### 5.3 Complete Absence of Restore Automation
There is **no restore script** (`scripts/restore.sh`), no verification test, and no disaster recovery runbook in the repository. Restoring requires manual, error-prone shell commands.

### 5.4 Data Retention & Table Growth
The `events` table stores window switch and activity events polled every 60 seconds.
- Volume: 1,500 to 4,000 rows/day (~100,000/month, ~1.2 million/year).
- Unbounded Growth: There is zero retention policy, no archival mechanism, and no automated `VACUUM`.
- Query Degradation: `rebuildDayStats` executes `SELECT category, duration_s, ts FROM events WHERE ts LIKE ?`. On a table with 1,000,000 rows without an index, every single event ingestion will scan 1,000,000 rows.

---

## 6. DATABASE HARDENING & PERFORMANCE PLAN

### 6.1 Database Configuration & Pragmas Remediation
Update `getDatabase()` in `src/lib/db.ts` to attach to `globalThis` and enforce optimal SQLite PRAGMAs on every connection:

```typescript
const globalForDb = globalThis as unknown as { _sofiaDb?: DatabaseSync };

export function getDatabase(): DatabaseSync {
  if (!globalForDb._sofiaDb) {
    const db = new DatabaseSync(DB_PATH);
    
    // Performance & Concurrency Hardening
    db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;
      PRAGMA cache_size = -64000; -- 64MB cache
      PRAGMA temp_store = MEMORY;
    `);

    initDatabase(db);
    globalForDb._sofiaDb = db;
  }
  return globalForDb._sofiaDb;
}
```

### 6.2 Essential Secondary Index DDL
Execute the following index creations in `initDatabase`:

```sql
-- Events table: query by date and github commits
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
CREATE INDEX IF NOT EXISTS idx_events_source_kind_ts ON events(source, kind, ts);

-- Tasks table: status filtering and completion date queries
CREATE INDEX IF NOT EXISTS idx_tasks_status_done_at ON tasks(status, done_at);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);

-- Messages: chat history retrieval
CREATE INDEX IF NOT EXISTS idx_messages_ts ON messages(ts DESC);

-- Memory notes: pinned and recency sorting
CREATE INDEX IF NOT EXISTS idx_memory_notes_pinned_created ON memory_notes(pinned DESC, created_at DESC);

-- Proactive log: guardrail checks
CREATE INDEX IF NOT EXISTS idx_proactive_log_ts_suppressed ON proactive_log(ts DESC, suppressed_reason);

-- Focus sessions: active session lookup
CREATE INDEX IF NOT EXISTS idx_focus_sessions_result ON focus_sessions(result);

-- TTS usage: monthly provider budget tracking
CREATE INDEX IF NOT EXISTS idx_tts_usage_month_provider ON tts_usage(month, provider);

-- Live usage: daily accumulation
CREATE INDEX IF NOT EXISTS idx_live_usage_date ON live_usage(date);
```

### 6.3 SQL Injection Remediation
Refactor `list_tasks` in both `src/lib/tools.ts:456-466` and `src/lib/brain.ts:392-404` to use parameterized queries:

```typescript
case 'list_tasks': {
  let query = 'SELECT id, title, status, est_min FROM tasks';
  const params: string[] = [];
  
  if (args.status && args.status !== 'all') {
    query += ' WHERE status = ?';
    params.push(args.status);
  }
  query += ' ORDER BY created_at DESC LIMIT 10';
  
  const tasks = (params.length > 0 
    ? db.prepare(query).all(params[0]) 
    : db.prepare(query).all()) as Array<{
    id: string;
    title: string;
    status: string;
    est_min: number;
  }>;
```

### 6.4 Transactional Ingestion Refactor
Wrap `ingestEvents` in a transaction:

```typescript
export function ingestEvents(db: DatabaseSync, events: Array<Partial<ActivityEvent>>): number {
  const insert = db.prepare(`
    INSERT OR REPLACE INTO events (id, ts, source, kind, category, app, title, duration_s, meta)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let count = 0;
  const datesToRecalc = new Set<string>();

  db.exec('BEGIN IMMEDIATE');
  try {
    for (const e of events) {
      const id = e.id || `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const ts = e.ts || new Date().toISOString();
      const source = e.source || 'agent-pc';
      const kind = e.kind || 'window';
      const app = e.app || 'Unknown';
      const title = e.title || '';
      const category = e.category || classifyAppOrDomain(db, app, title);
      const duration = Math.max(1, e.duration_s || 60);
      const meta = JSON.stringify(e.meta || {});

      insert.run(id, ts, source, kind, category, app, title, duration, meta);
      count++;
      datesToRecalc.add(ts.slice(0, 10));
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  for (const d of datesToRecalc) {
    rebuildDayStats(db, d);
  }

  return count;
}
```

### 6.5 Safe Online Backup API Refactor
Replace `fs.copyFileSync` in `src/lib/actions/backup-sofia-db.ts` with SQLite's native `VACUUM INTO`:

```typescript
export async function run(_args?: any): Promise<{ ok: boolean; output: string; pane?: any }> {
  try {
    const dbDir = path.join(process.cwd(), 'data');
    const backupDir = path.join(dbDir, 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const destDb = path.join(backupDir, `sofia-backup-${timestamp}.db`);
    
    // Use native SQLite VACUUM INTO for online, crash-safe, defragmented backup
    const db = getDatabase();
    db.prepare('VACUUM INTO ?').run(destDb);

    // Verify backup integrity
    const backupConn = new DatabaseSync(destDb);
    const check = backupConn.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
    backupConn.close();

    if (check.integrity_check !== 'ok') {
      fs.unlinkSync(destDb);
      return { ok: false, output: `Backup integrity check failed: ${check.integrity_check}` };
    }

    const stat = fs.statSync(destDb);
    return {
      ok: true,
      output: `Backup created and verified at ${path.basename(destDb)} (${(stat.size / 1024).toFixed(1)} KB)`,
    };
  } catch (err: any) {
    return { ok: false, output: `Backup failed: ${err.message}` };
  }
}
```

### 6.6 Export `initDatabase` for Testing
Export `initDatabase` from `src/lib/db.ts` and refactor `tests/rollup.test.ts`, `tests/brain.test.ts`, `tests/cron.test.ts`, and `tests/live.test.ts` to invoke `initDatabase(testDb)` directly, eliminating hundreds of lines of fragile, duplicate, out-of-sync DDL definitions.
