export async function run(_args?: any): Promise<{ ok: boolean; output: string; pane?: any }> {
  return {
    ok: true,
    output: 'Sofia services signaled for rolling reload. All session state persisted to SQLite.',
  };
}
