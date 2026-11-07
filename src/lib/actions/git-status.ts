import fs from 'fs';
import path from 'path';

export async function run(_args?: any): Promise<{ ok: boolean; output: string; pane?: any }> {
  try {
    const gitDir = path.join(process.cwd(), '.git');
    if (!fs.existsSync(gitDir)) {
      return { ok: true, output: 'Not a git repository or running inside container deployment' };
    }
    const headFile = path.join(gitDir, 'HEAD');
    let branch = 'unknown';
    if (fs.existsSync(headFile)) {
      const headContent = fs.readFileSync(headFile, 'utf8').trim();
      branch = headContent.startsWith('ref: refs/heads/')
        ? headContent.replace('ref: refs/heads/', '')
        : headContent.slice(0, 8);
    }
    const output = `Branch: ${branch}\nRepository verified safely without shell execution`;
    return {
      ok: true,
      output,
      pane: {
        id: `pane-git-${Date.now()}`,
        kind: 'timeline',
        title: `Git Status (${branch})`,
        data: {
          entries: [
            { time: 'Branch', app: 'git', title: branch },
          ],
        },
      },
    };
  } catch (err: any) {
    return { ok: false, output: `Git status check failed: ${err.message}` };
  }
}

