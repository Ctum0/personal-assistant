import { execSync } from 'child_process';

export async function run(_args?: any): Promise<{ ok: boolean; output: string; pane?: any }> {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim();
    const status = execSync('git status --short', { encoding: 'utf8' }).trim();
    const lastCommit = execSync('git log -1 --oneline', { encoding: 'utf8' }).trim();

    const output = `Branch: ${branch}\nLast Commit: ${lastCommit}\n${status ? `Changes:\n${status}` : 'Working tree clean'}`;

    return {
      ok: true,
      output,
      pane: {
        id: `pane-git-${Date.now()}`,
        kind: 'timeline',
        title: `Git Status (${branch})`,
        data: {
          entries: [
            { time: 'HEAD', app: 'git', title: lastCommit },
            { time: 'Status', app: 'git', title: status ? `${status.split('\n').length} modified file(s)` : 'Clean tree' },
          ],
        },
      },
    };
  } catch (err: any) {
    return { ok: false, output: `Git status failed: ${err.message}` };
  }
}
