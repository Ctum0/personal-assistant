import os from 'os';

export async function run(_args?: any): Promise<{ ok: boolean; output: string; pane?: any }> {
  try {
    const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(1);
    const freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(1);
    const usedMem = ((os.totalmem() - os.freemem()) / 1024 / 1024 / 1024).toFixed(1);
    const uptimeHours = (os.uptime() / 3600).toFixed(1);
    const cpus = os.cpus().length;
    const loadAvg = os.loadavg().map((l) => l.toFixed(2)).join(', ');

    const output = `System: ${os.hostname()} (${os.type()} ${os.arch()})\nUptime: ${uptimeHours} hrs | CPUs: ${cpus} | Load: ${loadAvg}\nMemory: ${usedMem}GB / ${totalMem}GB (${freeMem}GB free)`;

    return {
      ok: true,
      output,
      pane: {
        id: `pane-sys-${Date.now()}`,
        kind: 'stat',
        title: 'System Health',
        data: {
          metrics: [
            { label: 'Uptime', value: `${uptimeHours} hrs` },
            { label: 'RAM Used', value: `${usedMem} GB` },
            { label: 'RAM Total', value: `${totalMem} GB` },
            { label: 'Load (1,5,15m)', value: loadAvg },
          ],
        },
      },
    };
  } catch (err: any) {
    return { ok: false, output: `System status error: ${err.message}` };
  }
}
