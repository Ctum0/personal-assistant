import * as backupSofiaDb from './backup-sofia-db';
import * as systemStatus from './system-status';
import * as gitStatus from './git-status';
import * as tailWazuhAlerts from './tail-wazuh-alerts';
import * as syncObsidianVault from './sync-obsidian-vault';
import * as restartSofia from './restart-sofia';

export type ActionHandler = {
  run: (args?: any) => Promise<{ ok: boolean; output: string; pane?: any }>;
};

export const ALLOWED_ACTIONS: Record<string, ActionHandler> = {
  'backup-sofia-db': backupSofiaDb,
  'backup_db': backupSofiaDb,
  'system-status': systemStatus,
  'system_status': systemStatus,
  'git-status': gitStatus,
  'git_status': gitStatus,
  'tail-wazuh-alerts': tailWazuhAlerts,
  'wazuh_alerts': tailWazuhAlerts,
  'sync-obsidian-vault': syncObsidianVault,
  'obsidian_sync': syncObsidianVault,
  'restart-sofia': restartSofia,
  'restart_sofia': restartSofia,
};

export async function executeNamedAction(actionId: string, args?: any) {
  const handler = ALLOWED_ACTIONS[actionId];
  if (!handler) {
    throw new Error(
      `Action '${actionId}' is not allowlisted. Available actions: ${Object.keys(ALLOWED_ACTIONS).filter(k => k.includes('-')).join(', ')}`
    );
  }
  return await handler.run(args);
}
