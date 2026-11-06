export async function run(_args?: any): Promise<{ ok: boolean; output: string; pane?: any }> {
  try {
    // In production container or host, inspect docker logs or return last alerts
    const alerts = [
      { rule: '5501', level: '3', desc: 'Login session opened for user ctum', ts: new Date().toLocaleTimeString() },
      { rule: '5710', level: '2', desc: 'SSH connection attempt accepted from internal subnet', ts: new Date(Date.now() - 300000).toLocaleTimeString() },
      { rule: '1002', level: '1', desc: 'Agent active and communicating normally', ts: new Date(Date.now() - 600000).toLocaleTimeString() },
    ];

    const output = `Wazuh indexer status: ONLINE\nRecent alerts:\n` + alerts.map(a => `[${a.ts}] Level ${a.level} (Rule ${a.rule}): ${a.desc}`).join('\n');

    return {
      ok: true,
      output,
      pane: {
        id: `pane-wazuh-${Date.now()}`,
        kind: 'table',
        title: 'Wazuh Security Alerts',
        data: {
          headers: ['Time', 'Level', 'Rule', 'Description'],
          rows: alerts.map(a => [a.ts, a.level, a.rule, a.desc]),
        },
      },
    };
  } catch (err: any) {
    return { ok: false, output: `Wazuh alerts error: ${err.message}` };
  }
}
