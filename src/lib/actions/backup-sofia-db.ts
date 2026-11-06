import fs from 'fs';
import path from 'path';

export async function run(_args?: any): Promise<{ ok: boolean; output: string; pane?: any }> {
  try {
    const dbDir = path.join(process.cwd(), 'data');
    const sourceDb = path.join(dbDir, 'sofia.db');
    if (!fs.existsSync(sourceDb)) {
      return { ok: false, output: 'sofia.db not found' };
    }

    const backupDir = path.join(dbDir, 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const destDb = path.join(backupDir, `sofia-backup-${timestamp}.db`);
    fs.copyFileSync(sourceDb, destDb);
    const stat = fs.statSync(destDb);

    return {
      ok: true,
      output: `Backup created successfully at ${path.basename(destDb)} (${(stat.size / 1024).toFixed(1)} KB)`,
      pane: {
        id: `pane-backup-${Date.now()}`,
        kind: 'stat',
        title: 'Database Backup',
        data: {
          metrics: [
            { label: 'File', value: path.basename(destDb) },
            { label: 'Size', value: `${(stat.size / 1024).toFixed(1)} KB` },
            { label: 'Status', value: 'Complete' },
          ],
        },
      },
    };
  } catch (err: any) {
    return { ok: false, output: `Backup failed: ${err.message}` };
  }
}
