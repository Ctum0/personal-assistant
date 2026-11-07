import http from 'node:http';
import https from 'node:https';
import { BrowserInputEvent, BrowserPageInfo } from '../lib/browser/types';
import { ScreencastFrame, ScreencastListener } from './browser-manager';

export interface RemoteBrowserClientOptions {
  workerUrl: string;
  workerSecret?: string;
  timeoutMs?: number;
}

/**
 * Client communicating with the isolated remote Browser Worker service.
 * Used by Next.js API routes when BROWSER_WORKER_URL is configured.
 */
export class RemoteBrowserClient {
  private workerUrl: string;
  private workerSecret?: string;
  private timeoutMs: number;

  constructor(options: RemoteBrowserClientOptions) {
    this.workerUrl = options.workerUrl.replace(/\/+$/, '');
    this.workerSecret = options.workerSecret;
    this.timeoutMs = options.timeoutMs || 15000;
  }

  private getHeaders(extraHeaders: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...extraHeaders,
    };
    if (this.workerSecret) {
      headers['Authorization'] = `Bearer ${this.workerSecret}`;
    }
    return headers;
  }

  private async request(method: string, path: string, body?: any): Promise<any> {
    const url = `${this.workerUrl}${path}`;
    const headers = this.getHeaders();

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => res.statusText);
        throw new Error(`Browser worker returned HTTP ${res.status}: ${errorText}`);
      }

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return await res.json();
      }
      return await res.text();
    } catch (err: any) {
      throw new Error(`Failed to communicate with browser worker at ${this.workerUrl}: ${err.message}`);
    }
  }

  public async checkHealth(): Promise<{ status: string; egressProxyUrl?: string }> {
    return await this.request('GET', '/health');
  }

  public async ensureSession(sessionId: string, initialUrl: string = 'about:blank'): Promise<void> {
    await this.request('POST', `/sessions/${encodeURIComponent(sessionId)}/ensure`, { initialUrl });
  }

  public async navigate(sessionId: string, url: string): Promise<{ url: string; title: string; status: number }> {
    return await this.request('POST', `/sessions/${encodeURIComponent(sessionId)}/navigate`, { url });
  }

  public async goBack(sessionId: string): Promise<boolean> {
    const res = await this.request('POST', `/sessions/${encodeURIComponent(sessionId)}/back`);
    return !!res.success;
  }

  public async goForward(sessionId: string): Promise<boolean> {
    const res = await this.request('POST', `/sessions/${encodeURIComponent(sessionId)}/forward`);
    return !!res.success;
  }

  public async click(
    sessionId: string,
    options: { selector?: string; x?: number; y?: number }
  ): Promise<boolean> {
    const res = await this.request('POST', `/sessions/${encodeURIComponent(sessionId)}/click`, options);
    return !!res.success;
  }

  public async type(sessionId: string, text: string, selector?: string): Promise<boolean> {
    const res = await this.request('POST', `/sessions/${encodeURIComponent(sessionId)}/type`, { text, selector });
    return !!res.success;
  }

  public async pressKey(sessionId: string, key: string): Promise<boolean> {
    const res = await this.request('POST', `/sessions/${encodeURIComponent(sessionId)}/press_key`, { key });
    return !!res.success;
  }

  public async scroll(
    sessionId: string,
    direction: 'up' | 'down' | 'top' | 'bottom',
    amount: number = 300
  ): Promise<boolean> {
    const res = await this.request('POST', `/sessions/${encodeURIComponent(sessionId)}/scroll`, { direction, amount });
    return !!res.success;
  }

  public async wait(sessionId: string, ms: number = 1000): Promise<boolean> {
    const res = await this.request('POST', `/sessions/${encodeURIComponent(sessionId)}/wait`, { ms });
    return !!res.success;
  }

  public async getPageInfo(sessionId: string): Promise<BrowserPageInfo> {
    return await this.request('GET', `/sessions/${encodeURIComponent(sessionId)}/page_info`);
  }

  public async getSnapshot(sessionId: string): Promise<string> {
    const res = await this.request('GET', `/sessions/${encodeURIComponent(sessionId)}/snapshot`);
    return res.snapshot;
  }

  public async screenshot(sessionId: string): Promise<Buffer> {
    const url = `${this.workerUrl}/sessions/${encodeURIComponent(sessionId)}/screenshot`;
    const headers = this.getHeaders();
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(this.timeoutMs) });
    if (!res.ok) {
      throw new Error(`Worker screenshot failed: ${res.statusText}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  public async dispatchInput(sessionId: string, event: BrowserInputEvent): Promise<boolean> {
    const res = await this.request('POST', `/sessions/${encodeURIComponent(sessionId)}/input`, { event });
    return !!res.success;
  }

  public subscribeScreencast(sessionId: string, listener: ScreencastListener): () => void {
    const url = `${this.workerUrl}/sessions/${encodeURIComponent(sessionId)}/stream`;
    const controller = new AbortController();

    fetch(url, {
      headers: this.getHeaders({ Accept: 'text/event-stream' }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.body) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';

          for (const part of parts) {
            const line = part.trim();
            if (line.startsWith('data:')) {
              try {
                const frame = JSON.parse(line.slice(5).trim());
                this.latestFrames.set(sessionId, frame);
                listener(frame);
              } catch {}
            }
          }
        }
      })
      .catch(() => {});

    return () => {
      controller.abort();
    };
  }

  private latestFrames = new Map<string, ScreencastFrame>();

  public getLatestFrame(sessionId: string): ScreencastFrame | null {
    return this.latestFrames.get(sessionId) || null;
  }

  public async closeSession(sessionId: string): Promise<void> {
    await this.request('DELETE', `/sessions/${encodeURIComponent(sessionId)}`);
  }

  public async closeAll(): Promise<void> {
    // Optional shutdown hook
  }
}
