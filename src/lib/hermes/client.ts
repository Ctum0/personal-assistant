import { getHermesConfig, redactSensitive, SanitizedHermesConfig, getSanitizedHermesConfig } from './config';
import {
  HermesConfig,
  HermesRunRequest,
  HermesRunResponse,
  HermesRunStatus,
  HermesSSEEvent,
  HermesSteerRequest,
  HermesApprovalRequest,
  HermesCapabilities,
  HermesToolset,
  HermesMessage,
} from './types';

export class HermesClient {
  private customConfig?: Partial<HermesConfig & { enabled: boolean }>;

  constructor(customConfig?: Partial<HermesConfig & { enabled: boolean }>) {
    this.customConfig = customConfig;
  }

  private getConfig(): HermesConfig & { enabled: boolean } {
    const base = getHermesConfig();
    return { ...base, ...this.customConfig };
  }

  public getSanitizedConfig(): SanitizedHermesConfig {
    const config = this.getConfig();
    return {
      baseUrl: config.baseUrl,
      sessionKey: config.sessionKey,
      timeoutMs: config.timeoutMs,
      enabled: config.enabled,
      isConfigured: !!(config.apiKey && config.baseUrl),
    };
  }

  private validateConfig(): HermesConfig & { enabled: boolean } {
    const config = this.getConfig();
    if (!config.enabled) {
      throw new Error('Hermes integration is disabled (HERMES_ENABLED=false)');
    }
    if (!config.baseUrl) {
      throw new Error('Hermes base URL is not configured. Set HERMES_API_URL in environment variables.');
    }
    if (!config.apiKey) {
      throw new Error('Hermes API key is not configured. Set HERMES_API_KEY in environment variables.');
    }
    return config;
  }

  private getHeaders(extraHeaders?: Record<string, string>): { headers: Record<string, string>; config: HermesConfig } {
    const config = this.validateConfig();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      'X-Hermes-Session-Key': config.sessionKey,
      ...extraHeaders,
    };
    return { headers, config };
  }

  /**
   * Dispatches an asynchronous native agent run via POST /v1/runs.
   * Returns immediately with run_id and status.
   */
  async createRun(request: HermesRunRequest): Promise<HermesRunResponse> {
    const { headers, config } = this.getHeaders(
      request.idempotency_key ? { 'Idempotency-Key': request.idempotency_key } : undefined
    );
    const url = `${config.baseUrl}/v1/runs`;

    const body: Record<string, any> = {
      input: request.input,
    };
    if (request.session_id) body.session_id = request.session_id;
    if (request.model) body.model = request.model;
    if (request.instructions) body.instructions = request.instructions;
    if (request.previous_response_id) body.previous_response_id = request.previous_response_id;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(config.timeoutMs),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        throw new Error(`Hermes createRun failed (${res.status}): ${redactSensitive(errText)}`);
      }

      return (await res.json()) as HermesRunResponse;
    } catch (err: any) {
      throw new Error(redactSensitive(err.message || String(err)));
    }
  }

  /**
   * Polls the status and state of a run via GET /v1/runs/{run_id}.
   */
  async getRun(runId: string): Promise<HermesRunStatus> {
    const { headers, config } = this.getHeaders();
    const url = `${config.baseUrl}/v1/runs/${encodeURIComponent(runId)}`;
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(config.timeoutMs),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        throw new Error(`Hermes getRun failed (${res.status}): ${redactSensitive(errText)}`);
      }

      return (await res.json()) as HermesRunStatus;
    } catch (err: any) {
      throw new Error(redactSensitive(err.message || String(err)));
    }
  }

  /**
   * Subscribes to real-time execution events of a run via Server-Sent Events (SSE).
   */
  async streamRunEvents(
    runId: string,
    onEvent: (event: HermesSSEEvent) => void,
    options?: { signal?: AbortSignal; lastEventId?: string }
  ): Promise<void> {
    const config = this.validateConfig();
    const url = `${config.baseUrl}/v1/runs/${encodeURIComponent(runId)}/events`;
    const headers: Record<string, string> = {
      Accept: 'text/event-stream',
      Authorization: `Bearer ${config.apiKey}`,
      'X-Hermes-Session-Key': config.sessionKey,
    };
    if (options?.lastEventId) {
      headers['Last-Event-ID'] = options.lastEventId;
    }

    try {
      const res = await fetch(url, {
        method: 'GET',
        headers,
        signal: options?.signal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        throw new Error(`Hermes streamRunEvents failed (${res.status}): ${redactSensitive(errText)}`);
      }

      if (!res.body) {
        throw new Error('Hermes SSE response body is null');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() || '';

        for (const block of blocks) {
          if (!block.trim()) continue;
          let eventType = 'message';
          let dataStr = '';
          let seq: number | undefined;

          const lines = block.split('\n');
          let isComment = false;
          let commentText = '';
          for (const line of lines) {
            if (line.startsWith(':')) {
              isComment = true;
              commentText = line.slice(1).trim();
            } else if (line.startsWith('event:')) {
              eventType = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              dataStr = line.slice(5).trim();
            } else if (line.startsWith('id:')) {
              const parsedSeq = Number(line.slice(3).trim());
              if (!Number.isNaN(parsedSeq)) seq = parsedSeq;
            }
          }

          if (isComment) {
            onEvent({ event: 'comment', data: commentText, seq });
          } else if (dataStr) {
            try {
              const parsedData = JSON.parse(dataStr);
              onEvent({ event: eventType, data: parsedData, seq });
            } catch {
              onEvent({ event: eventType, data: dataStr, seq });
            }
          }
        }
      }
    } catch (err: any) {
      if (options?.signal?.aborted) return;
      throw new Error(redactSensitive(err.message || String(err)));
    }
  }

  /**
   * Injects dynamic steering / guidance into a running agent task via POST /v1/runs/{run_id}/steer.
   */
  async steerRun(runId: string, message: string): Promise<boolean> {
    const { headers, config } = this.getHeaders();
    const url = `${config.baseUrl}/v1/runs/${encodeURIComponent(runId)}/steer`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ message }),
        signal: AbortSignal.timeout(config.timeoutMs),
      });
      return res.ok;
    } catch (err: any) {
      throw new Error(redactSensitive(err.message || String(err)));
    }
  }

  /**
   * Submits interactive human approval or denial for consequential tool execution.
   */
  async approveRun(runId: string, approval: HermesApprovalRequest): Promise<boolean> {
    const { headers, config } = this.getHeaders();
    const url = `${config.baseUrl}/v1/runs/${encodeURIComponent(runId)}/approval`;

    // Normalize wire payload to Hermes v0.22.2 schema: choice ('once' | 'deny' | 'session' | 'always')
    let choice = approval.choice || 'once';
    if (approval.action === 'deny' || approval.choice === 'deny') {
      choice = 'deny';
    } else if (approval.action === 'approve' || approval.choice === 'approve') {
      choice = 'once';
    }

    const body: Record<string, any> = { choice };
    const reqId = approval.request_id || approval.tool_call_id;
    if (reqId) body.request_id = reqId;
    if (approval.resolve_all !== undefined) body.resolve_all = approval.resolve_all;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(config.timeoutMs),
      });
      return res.ok;
    } catch (err: any) {
      throw new Error(redactSensitive(err.message || String(err)));
    }
  }

  /**
   * Stops/cancels an active run via POST /v1/runs/{run_id}/stop.
   */
  async stopRun(runId: string): Promise<boolean> {
    const { headers, config } = this.getHeaders();
    const url = `${config.baseUrl}/v1/runs/${encodeURIComponent(runId)}/stop`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(config.timeoutMs),
      });
      return res.ok;
    } catch (err: any) {
      throw new Error(redactSensitive(err.message || String(err)));
    }
  }

  /**
   * Introspects available platform capabilities via GET /v1/capabilities.
   */
  async getCapabilities(): Promise<HermesCapabilities> {
    const { headers, config } = this.getHeaders();
    const url = `${config.baseUrl}/v1/capabilities`;
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        throw new Error(`Hermes getCapabilities failed (${res.status})`);
      }

      return (await res.json()) as HermesCapabilities;
    } catch (err: any) {
      throw new Error(redactSensitive(err.message || String(err)));
    }
  }

  /**
   * Retrieves active and configured toolsets via GET /v1/toolsets.
   */
  async getToolsets(): Promise<HermesToolset[]> {
    const { headers, config } = this.getHeaders();
    const url = `${config.baseUrl}/v1/toolsets`;
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        throw new Error(`Hermes getToolsets failed (${res.status})`);
      }

      const data = await res.json();
      return Array.isArray(data) ? data : data?.data || [];
    } catch (err: any) {
      throw new Error(redactSensitive(err.message || String(err)));
    }
  }

  /**
   * Synchronous / streaming OpenAI-compatible completions fallback via POST /v1/chat/completions.
   */
  async chatCompletions(
    messages: HermesMessage[],
    options?: { model?: string; maxTokens?: number }
  ): Promise<string> {
    const { headers, config } = this.getHeaders();
    const url = `${config.baseUrl}/v1/chat/completions`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: options?.model || 'hermes-agent',
          messages,
          max_tokens: options?.maxTokens || 800,
        }),
        signal: AbortSignal.timeout(config.timeoutMs),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        throw new Error(`Hermes chatCompletions failed (${res.status}): ${redactSensitive(errText)}`);
      }

      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    } catch (err: any) {
      throw new Error(redactSensitive(err.message || String(err)));
    }
  }

  /**
   * Polls a run until it reaches a terminal status ('completed', 'failed', 'stopped').
   */
  async pollRunUntilComplete(
    runId: string,
    options?: {
      maxWaitMs?: number;
      intervalMs?: number;
      onPoll?: (status: HermesRunStatus) => void;
    }
  ): Promise<HermesRunStatus> {
    const maxWaitMs = options?.maxWaitMs || 180000;
    const intervalMs = options?.intervalMs || 1000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const status = await this.getRun(runId);
      if (options?.onPoll) options.onPoll(status);

      if (['completed', 'failed', 'stopped'].includes(status.status)) {
        return status;
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error(`Hermes run ${runId} timed out after ${maxWaitMs}ms`);
  }
}

let defaultClient: HermesClient | null = null;

export function getHermesClient(): HermesClient {
  if (!defaultClient) {
    defaultClient = new HermesClient();
  }
  return defaultClient;
}
