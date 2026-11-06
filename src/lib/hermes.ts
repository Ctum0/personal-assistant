import { SofiaSettings } from './types';

export interface HermesMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface HermesCompletionOptions {
  messages: HermesMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  settings?: SofiaSettings;
}

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export function getHermesApiKey(settings?: SofiaSettings): string {
  if (process.env.HERMES_API_KEY) return process.env.HERMES_API_KEY;
  if (settings?.hermes?.api_key && settings.hermes.api_key !== 'hermes-sofia-api') {
    return settings.hermes.api_key;
  }
  try {
    const envPath = path.join(os.homedir(), '.hermes', '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('API_SERVER_KEY=')) {
          const key = trimmed.split('=', 2)[1].trim().replace(/^["']|["']$/g, '');
          if (key) return key;
        }
      }
    }
  } catch {
    // fallback
  }
  return settings?.hermes?.api_key || 'hermes-sofia-api';
}

export async function checkHermesStatus(settings: SofiaSettings): Promise<{
  online: boolean;
  port: number;
  provider: string;
  computerUseEnabled: boolean;
  toolsets: string[];
  error?: string;
}> {
  try {
    const baseUrl = settings.hermes.base_url || 'http://127.0.0.1:8642/v1';
    const apiKey = getHermesApiKey(settings);

    const res = await fetch(`${baseUrl}/toolsets`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      return {
        online: false,
        port: 8642,
        provider: settings.hermes.provider,
        computerUseEnabled: false,
        toolsets: [],
        error: `HTTP ${res.status}: ${res.statusText}`,
      };
    }

    const data = await res.json();
    const toolsetsList = Array.isArray(data.data)
      ? data.data.map((t: { name: string; enabled: boolean }) => t.name)
      : [];
    const cu = Array.isArray(data.data)
      ? data.data.find((t: { name: string; enabled: boolean }) => t.name === 'computer_use')?.enabled ?? false
      : false;

    return {
      online: true,
      port: 8642,
      provider: settings.hermes.provider,
      computerUseEnabled: cu,
      toolsets: toolsetsList,
    };
  } catch (err) {
    return {
      online: false,
      port: 8642,
      provider: settings.hermes.provider,
      computerUseEnabled: false,
      toolsets: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function callHermesChat(options: HermesCompletionOptions): Promise<string> {
  const baseUrl = options.settings?.hermes.base_url || 'http://127.0.0.1:8642/v1';
  const apiKey = getHermesApiKey(options.settings);
  const model = options.settings?.hermes.model || 'hermes-agent';

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: options.messages,
      temperature: options.temperature ?? 0.7,
      stream: false,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Hermes API error (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || 'No response from Hermes.';
}
