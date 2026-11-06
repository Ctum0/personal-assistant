import { getDatabase, rebuildDayStats } from '../src/lib/db';

const targetDate = process.argv[2] || new Date().toISOString().slice(0, 10);
console.log(`[ROLLUP] Rebuilding day_stats for date: ${targetDate}`);

try {
  const db = getDatabase();
  const stats = rebuildDayStats(db, targetDate);
  console.log(`[ROLLUP SUCCESS]`, {
    date: stats.date,
    active_min: stats.active_min,
    work_min: stats.work_min,
    leisure_min: stats.leisure_min,
    commits: stats.commits,
    coverage: stats.coverage,
  });
} catch (err) {
  console.error(`[ROLLUP ERROR] Failed to rebuild day_stats:`, err);
  process.exit(1);
}
