import crypto from 'node:crypto';

export type RiskLevel = 'R0' | 'R1' | 'R2' | 'R3';
export type ApprovalStatus =
  | 'pending'
  | 'decision_submitted'
  | 'approved'
  | 'denied'
  | 'expired'
  | 'awaiting_execution'
  | 'executed'
  | 'failed';

export interface RiskEvaluation {
  riskLevel: RiskLevel;
  level: RiskLevel;
  requiresApproval: boolean;
  requiresExplicitApproval: boolean;
  requiresStrongApproval: boolean;
  allowedWithoutApproval: boolean;
  reason: string;
}

/**
 * Standard tool catalog risk classification mapping.
 * R0: Read-only status, safe inspection, listing -> Execute & audit
 * R1: Reversible changes, opening URLs, creating ordinary workspace items -> Policy-controlled; log action
 * R2: External side-effects, sending messages, submissions -> Explicit approval required
 * R3: Deleting data, credentials, privilege escalation, shell commands -> Strong approval with safeguards
 */
const TOOL_RISK_MAP: Record<string, RiskLevel> = {
  // R0 - Read-only / Inspection
  get_stats: 'R0',
  show_stats_today: 'R0',
  stats_today: 'R0',
  show_chart: 'R0',
  show_timeline: 'R0',
  timeline_list: 'R0',
  list_tasks: 'R0',
  tasks_list: 'R0',
  search_memory: 'R0',
  memory_list: 'R0',
  hermes_schedule_list: 'R0',
  'system-status': 'R0',
  'git-status': 'R0',
  'tail-wazuh-alerts': 'R0',

  // R1 - Reversible / Workspace Operations
  remember: 'R1',
  create_task: 'R1',
  tasks_add: 'R1',
  tasks_done: 'R1',
  start_focus: 'R1',
  set_reminder: 'R1',
  show_web: 'R1',
  show_image: 'R1',
  set_mood: 'R1',
  'backup-sofia-db': 'R1',
  complete_task: 'R1',

  // R2 - External Side-Effects
  send_telegram: 'R2',
  ask_hermes: 'R2',
  computer_file_read: 'R2',
  browse_url: 'R2',
  hermes_schedule_add: 'R2',

  // Browser Workspace Tools (Default classifications)
  browser_get_page_info: 'R0',
  browser_get_snapshot: 'R0',
  browser_screenshot: 'R0',
  browser_wait: 'R0',
  browser_open: 'R1',
  browser_navigate: 'R1',
  browser_back: 'R1',
  browser_forward: 'R1',
  browser_scroll: 'R1',
  browser_click: 'R1',
  browser_type: 'R1',
  browser_press_key: 'R1',

  // R3 - High Stakes / Consequential / System Execution
  computer_run: 'R3',
  computer_file_write: 'R3',
  hermes_schedule_create: 'R3',
  hermes_schedule_delete: 'R3',
};

/**
 * Sensitive key patterns that must be sanitized from approval previews.
 */
const SENSITIVE_KEY_REGEX = /(?:api[_-]?key|token|secret|password|auth|bearer|cookie|credential|private[_-]?key)/i;

/**
 * Evaluates the risk level for an intended tool execution.
 * Default-deny: Unknown tools or invalid classifications default to R2 (or R3 for shell/db).
 */
export function evaluateToolRisk(toolName: string, args: Record<string, any> = {}): RiskEvaluation {
  const normalizedName = toolName.trim();
  const baseRisk = TOOL_RISK_MAP[normalizedName];

  let effectiveRisk: RiskLevel;
  let reason = '';

  if (!baseRisk) {
    // Unknown tools default to R2 (explicit approval) or R3 if shell/database
    if (normalizedName.includes('run') || normalizedName.includes('exec') || normalizedName.includes('database')) {
      effectiveRisk = 'R3';
      reason = `Unknown execution tool '${normalizedName}' requires strong approval (Default-deny policy).`;
    } else {
      effectiveRisk = 'R2';
      reason = `Unknown or unverified tool '${normalizedName}' requires explicit approval (Default-deny policy).`;
    }
  } else {
    effectiveRisk = baseRisk;
  }

  // Dynamic risk evaluation for browser operations considering context, accessible name, and side effects
  if (normalizedName === 'browser_click' || normalizedName === 'browser_action') {
    const combinedContext = [
      args.selector,
      args.accessibleName,
      args.ariaLabel,
      args.buttonText,
      args.role,
      args.formAction,
      args.actionType,
      args.targetUrl,
      args.contextSnippet,
      args.intendedOperation,
      args.target,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    const isDestructive = /(?:delete[-_]?account|purge|destroy|terminate|wipe|drop[-_]?table|cancel[-_]?account)/i.test(
      combinedContext
    );
    const isConsequential =
      /(?:submit|delete|remove|buy|pay|purchase|checkout|confirm|send|publish|post|transfer|upgrade|subscribe|order|update[-_]?email|change[-_]?password|save[-_]?settings|grant)/i.test(
        combinedContext
      ) ||
      args.role === 'submit' ||
      args.formAction ||
      args.actionType === 'submit';

    const isSafeToggle = /(?:accordion|tab|dropdown|menu[-_]?toggle|expand|collapse|theme|dark[-_]?mode)/i.test(
      combinedContext
    );

    if (isDestructive) {
      effectiveRisk = 'R3';
      reason = `Destructive browser action on '${combinedContext.slice(0, 50)}' requires strong WebAuthn/passkey confirmation.`;
    } else if (isConsequential) {
      effectiveRisk = 'R2';
      reason = `Consequential browser action '${combinedContext.slice(0, 50)}' (submission/external side effect) requires explicit owner approval.`;
    } else if (!isSafeToggle && (args.selector || args.action)) {
      // Ambiguous interactive actions fail closed to R2 if side effects cannot be ruled out
      if (args.ambiguous || args.unknown || (!args.role && !args.text && !args.accessibleName)) {
        effectiveRisk = 'R2';
        reason = `Ambiguous interactive browser action on '${(args.selector || '').slice(0, 40)}' requires explicit approval (Fail-closed policy).`;
      }
    }
  }

  if (normalizedName === 'browser_type') {
    const target = [args.selector, args.name, args.id, args.placeholder, args.ariaLabel]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const isSensitive = /(?:password|card|cvv|secret|token|ssn|auth|credit[-_]?card|pin)/i.test(target);
    if (isSensitive) {
      effectiveRisk = 'R3';
      reason = `Typing into sensitive credential or payment field requires strong approval and agent typing is strictly restricted.`;
    }
  }

  if (normalizedName === 'browser_press_key') {
    const key = String(args.key || '').trim().toLowerCase();
    if (key === 'enter' && (args.consequential || args.formSubmit || args.isForm)) {
      effectiveRisk = 'R2';
      reason = `Submitting form or committing action via Enter key requires explicit owner approval.`;
    }
  }

  // Dynamic risk evaluation for computer_run based on command inspect
  if (normalizedName === 'computer_run') {
    const cmd = String(args.command || args.cmd || '').trim();
    const isDestructive = /(?:rm\s+-|sudo\s|dd\s|mkfs|shutdown|reboot|chmod\s|chown\s|export\s|>\s|curl.*\|\s*sh)/i.test(cmd);
    const isCredentialAccess = /(?:\.ssh|\.gnupg|id_rsa|\.env|shadow|passwd|keyring)/i.test(cmd);
    const isReadOnly = /^(?:cat|ls|head|tail|grep|uname|whoami|date|df|free)\s+[^>|&;]+$/.test(cmd);

    if (isDestructive || isCredentialAccess) {
      effectiveRisk = 'R3';
      reason = `High-consequence shell command '${cmd.slice(0, 40)}' requires strong approval.`;
    } else if (isReadOnly && !isCredentialAccess) {
      effectiveRisk = 'R0';
      reason = `Read-only inspection command permitted without approval.`;
    } else {
      effectiveRisk = 'R3';
      reason = `Arbitrary shell command execution requires strong approval.`;
    }
  }

  // Database queries: drop/truncate/delete are R3
  if (normalizedName === 'database_query' || normalizedName.includes('database') || normalizedName.includes('sql')) {
    const query = String(args.query || args.sql || '').trim();
    if (/(?:DROP|TRUNCATE|DELETE|ALTER|GRANT|REVOKE)/i.test(query)) {
      effectiveRisk = 'R3';
      reason = `Destructive database query requires strong approval.`;
    } else {
      effectiveRisk = 'R2';
      reason = `Database query requires explicit approval.`;
    }
  }

  // If complete_task contains delete/purge flags, escalate to R3
  if (normalizedName === 'complete_task' && (args.delete || args.purge || args.destroy)) {
    effectiveRisk = 'R3';
    reason = 'Task deletion/purge operation escalated to R3 strong approval.';
  }

  if (!reason) {
    if (effectiveRisk === 'R0') {
      reason = `Read-only inspection action '${normalizedName}' permitted without approval.`;
    } else if (effectiveRisk === 'R1') {
      reason = `Low-risk action '${normalizedName}' permitted under standard workspace policy.`;
    } else if (effectiveRisk === 'R2') {
      reason = `Action '${normalizedName}' produces external side effects and requires explicit owner approval.`;
    } else {
      reason = `High-consequence action '${normalizedName}' modifies system or data and requires strong approval.`;
    }
  }

  const requiresApproval = effectiveRisk === 'R2' || effectiveRisk === 'R3';
  const requiresStrongApproval = effectiveRisk === 'R3';

  return {
    riskLevel: effectiveRisk,
    level: effectiveRisk,
    requiresApproval,
    requiresExplicitApproval: requiresApproval,
    requiresStrongApproval,
    allowedWithoutApproval: !requiresApproval,
    reason,
  };
}

/**
 * Deterministically serializes an object into canonical JSON with sorted keys.
 */
export function canonicalizeJson(value: any): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalizeJson).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalizeJson(value[k])).join(',') + '}';
}

/**
 * Computes a SHA-256 action hash bound to tool name, canonical arguments, and run context.
 */
export function computeActionHash(
  toolName: string,
  args: Record<string, any> = {},
  runId: string = ''
): string {
  const canonicalArgs = canonicalizeJson(args);
  const payload = `${toolName.trim()}:${canonicalArgs}:${runId.trim()}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Sanitizes arguments to create a safe preview representation.
 * Redacts secrets, tokens, passwords, cookies, and sensitive fields.
 */
export function sanitizeArgumentsPreview(value: any): any {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    let sanitizedStr = value
      .replace(/(Bearer\s+)[A-Za-z0-9_\-\.]{8,}/gi, '$1[REDACTED]')
      .replace(/(api[_-]?key[:=]\s*)[A-Za-z0-9_\-\.]{8,}/gi, '$1[REDACTED]');
    if (sanitizedStr.length > 300) {
      sanitizedStr = sanitizedStr.slice(0, 300) + '... [truncated]';
    }
    return sanitizedStr;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeArgumentsPreview);
  }
  if (typeof value === 'object') {
    const sanitized: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEY_REGEX.test(k)) {
        sanitized[k] = '[REDACTED]';
      } else {
        sanitized[k] = sanitizeArgumentsPreview(v);
      }
    }
    return sanitized;
  }
  return value;
}
