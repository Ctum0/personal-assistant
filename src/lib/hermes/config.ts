import { HermesConfig } from './types';

export interface SanitizedHermesConfig {
  baseUrl: string;
  sessionKey: string;
  timeoutMs: number;
  enabled: boolean;
  isConfigured: boolean;
}

/**
 * Redacts potential secrets, bearer tokens, or query keys from strings before logging or surfacing.
 */
export function redactSensitive(input: string): string {
  if (!input) return input;
  return input
    .replace(/(Bearer\s+)[A-Za-z0-9_\-\.]{6,}/gi, '$1[REDACTED]')
    .replace(/(api[_-]?key[:=]\s*)[A-Za-z0-9_\-\.]{6,}/gi, '$1[REDACTED]')
    .replace(/([?&]key=)[A-Za-z0-9_\-\.]{6,}/gi, '$1[REDACTED]');
}

/**
 * Resolves the canonical configuration for the Hermes Agent Gateway.
 * Precedence:
 * 1. HERMES_API_URL -> HERMES_URL -> HERMES_BASE_URL -> HERMES_BRIDGE_URL -> LAPTOP_HERMES_URL -> Environment default
 * 2. HERMES_API_KEY -> API_SERVER_KEY -> LAPTOP_HERMES_KEY
 * 3. HERMES_SESSION_KEY (default: 'sofia-primary')
 * 4. HERMES_ENABLED ('true' | '1' | 'false' | '0') or SOFIA_HERMES_PRIMARY
 */
export function getHermesConfig(): HermesConfig & { enabled: boolean } {
  const isProduction = process.env.NODE_ENV === 'production';

  const rawEnabled = process.env.HERMES_ENABLED;
  const explicitFalse = rawEnabled === 'false' || rawEnabled === '0';
  const explicitTrue = rawEnabled === 'true' || rawEnabled === '1';

  const primaryOverride = process.env.SOFIA_HERMES_PRIMARY;
  const primaryFalse = primaryOverride === 'false' || primaryOverride === '0';
  const primaryTrue = primaryOverride === 'true' || primaryOverride === '1';

  // Resolve API URL
  const envUrl =
    process.env.HERMES_API_URL ||
    process.env.HERMES_URL ||
    process.env.HERMES_BASE_URL ||
    process.env.HERMES_BRIDGE_URL ||
    process.env.LAPTOP_HERMES_URL;

  let baseUrl = '';
  if (envUrl) {
    baseUrl = envUrl.trim().replace(/\/+$/, '').replace(/\/v1$/, '');
  } else if (isProduction) {
    // In production Coolify, default to internal reverse-proxy domain
    baseUrl = 'https://hermes.ctum.org';
  } else {
    // In local development, default to local machine gateway
    baseUrl = (process.env.HERMES_LOCAL_URL || 'http://127.0.0.1:8642').replace(/\/+$/, '').replace(/\/v1$/, '');
  }

  // Resolve API Key strictly from environment
  const apiKey = (
    process.env.HERMES_API_KEY ||
    process.env.API_SERVER_KEY ||
    process.env.LAPTOP_HERMES_KEY ||
    ''
  ).trim();

  const sessionKey = (process.env.HERMES_SESSION_KEY || 'sofia-primary').trim();
  const timeoutMs = Number(process.env.HERMES_TIMEOUT_MS) || 120000;

  let enabled = true;
  if (primaryFalse || explicitFalse) {
    enabled = false;
  } else if (primaryTrue || explicitTrue) {
    enabled = true;
  } else {
    // Default enabled unless explicitly disabled, as long as credentials or URL are present
    enabled = Boolean(apiKey || envUrl || !isProduction);
  }

  return {
    baseUrl,
    apiKey,
    sessionKey,
    timeoutMs,
    enabled,
  };
}

/**
 * Returns a sanitized configuration object safe to expose or log.
 * Never includes raw API keys.
 */
export function getSanitizedHermesConfig(): SanitizedHermesConfig {
  const cfg = getHermesConfig();
  return {
    baseUrl: cfg.baseUrl,
    sessionKey: cfg.sessionKey,
    timeoutMs: cfg.timeoutMs,
    enabled: cfg.enabled,
    isConfigured: !!(cfg.apiKey && cfg.baseUrl),
  };
}
