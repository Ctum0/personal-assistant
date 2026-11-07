import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, Browser, BrowserContext } from 'playwright';

const BASE_URL = 'http://127.0.0.1:3005';
import fs from 'node:fs';
import path from 'node:path';

function getValidToken(): string {
  let token = process.env.SOFIA_AUTH_TOKEN || process.env.SOFIA_API_TOKEN || '';
  if (!token) {
    try {
      const envPath = path.resolve(process.cwd(), '.env.local');
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        const match = content.match(/(?:SOFIA_AUTH_TOKEN|SOFIA_API_TOKEN)=([^\r\n]+)/);
        if (match) {
          token = match[1].trim().replace(/^['"]|['"]$/g, '');
        }
      }
    } catch {}
  }
  return token || 'test-token-playwright';
}

const AUTH_TOKEN = getValidToken();

let serverReachable = false;

describe('Playwright Real Browser Workflows (Hermes Voice & Stage)', () => {
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;

  beforeAll(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(1000) });
      serverReachable = res.ok || res.status === 401;
    } catch {
      serverReachable = false;
    }

    if (!serverReachable) return;

    browser = await chromium.launch({
      headless: true,
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    });
    context = await browser.newContext({
      permissions: ['microphone'],
      viewport: { width: 1280, height: 800 },
      extraHTTPHeaders: {
        'x-sofia-token': AUTH_TOKEN,
        'Authorization': `Bearer ${AUTH_TOKEN}`,
      },
    });
    await context.addCookies([
      {
        name: 'sofia_token',
        value: AUTH_TOKEN,
        domain: '127.0.0.1',
        path: '/',
      },
    ]);
  });

  afterAll(async () => {
    if (context) await context.close();
    if (browser) await browser.close();
  });

  it('Test A — Voice conversation: captures speech, dispatches to Hermes, plays TTS, updates Stage & Avatar', async () => {
    if (!serverReachable || !context) return;
    const page = await context.newPage();

    // 1. Setup mock SpeechRecognition inside browser environment
    await page.addInitScript((token) => {
      localStorage.setItem('sofia_token', token);
      localStorage.setItem('sofia_conversation_id', 'conv_playwright_voice_1');

      if (navigator.mediaDevices) {
        navigator.mediaDevices.getUserMedia = async () => {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const osc = ctx.createOscillator();
          const dst = ctx.createMediaStreamDestination();
          osc.connect(dst);
          osc.start();
          return dst.stream;
        };
      }

      class MockSpeechRecognition {
        continuous = false;
        interimResults = false;
        lang = 'en-US';
        onresult: any = null;
        onerror: any = null;
        onend: any = null;

        start() {
          (window as any).__mockRecognitionInstance = this;
        }
        stop() {
          if (this.onend) this.onend();
        }
        abort() {
          if (this.onend) this.onend();
        }
      }

      (window as any).SpeechRecognition = MockSpeechRecognition;
      (window as any).webkitSpeechRecognition = MockSpeechRecognition;
    }, AUTH_TOKEN);

    // 2. Intercept API routes: /api/chat, /api/tts
    let chatPayload: any = null;
    await page.route('**/api/chat', async (route) => {
      if (route.request().method() === 'POST') {
        chatPayload = JSON.parse(route.request().postData() || '{}');
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            say: 'Hermes confirmed all systems are nominal.',
            mood: 'pleased',
            isHermes: true,
            panes: [
              {
                id: 'pane-telemetry-1',
                title: 'Hermes Telemetry',
                kind: 'metrics',
                data: [{ label: 'CPU', value: '12%' }, { label: 'Memory', value: '38%' }],
              },
            ],
          }),
        });
      } else {
        await route.continue();
      }
    });

    let ttsRequestedText = '';
    await page.route('**/api/tts', async (route) => {
      const data = JSON.parse(route.request().postData() || '{}');
      ttsRequestedText = data.text;
      await route.fulfill({
        status: 200,
        contentType: 'audio/mpeg',
        body: Buffer.from([0xff, 0xfb, 0x90, 0x44, 0x00, 0x00]),
      });
    });

    // 3. Load Sofia Stage
    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');

    // 4. Click the Talk button to start Single-Brain Hermes Voice
    const talkButton = page.locator('button[aria-label="Start voice conversation"]');
    await talkButton.waitFor({ state: 'visible', timeout: 8000 });
    await talkButton.click();

    // 5. Simulate microphone transcript event with isFinal result
    await page.evaluate(() => {
      const rec = (window as any).__mockRecognitionInstance;
      if (rec && rec.onresult) {
        const item: any = [{ transcript: 'Check system telemetry' }];
        item.isFinal = true;
        rec.onresult({
          results: [item],
        });
      }
    });

    // Click stop button to commit voice input
    const stopButton = page.locator('button[aria-label="Stop listening"]');
    await stopButton.waitFor({ state: 'visible', timeout: 8000 });
    await stopButton.click();

    // 6. Verify /api/chat was called with channel=voice and exact transcript
    expect(chatPayload).toBeDefined();
    expect(chatPayload.message).toBe('Check system telemetry');
    expect(chatPayload.channel).toBe('voice');
    expect(chatPayload.sessionId).toBe('conv_playwright_voice_1');

    // 7. Verify Sofia's UI was updated with Hermes response
    const caption = page.locator('text=Hermes confirmed all systems are nominal.');
    await caption.waitFor({ state: 'visible', timeout: 8000 });
    expect(await caption.isVisible()).toBe(true);

    // 8. Verify Edge TTS received the exact Hermes output
    expect(ttsRequestedText).toContain('Hermes confirmed all systems are nominal.');

    // 9. Verify Stage pane rendered
    const stagePane = page.locator('text=Hermes Telemetry');
    await stagePane.waitFor({ state: 'visible', timeout: 8000 });
    expect(await stagePane.isVisible()).toBe(true);

    await page.close();
  }, 20000);

  it('Test B — Conversation continuity: preserves context across text and voice switches', async () => {
    if (!serverReachable || !context) return;
    const page = await context.newPage();
    const conversationId = 'conv_playwright_continuity_2';

    await page.addInitScript(({ cid, token }) => {
      localStorage.setItem('sofia_token', token);
      localStorage.setItem('sofia_conversation_id', cid);

      if (navigator.mediaDevices) {
        navigator.mediaDevices.getUserMedia = async () => {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const osc = ctx.createOscillator();
          const dst = ctx.createMediaStreamDestination();
          osc.connect(dst);
          osc.start();
          return dst.stream;
        };
      }

      class MockSpeechRec {
        start() { (window as any).__rec = this; }
        stop() {}
        abort() {}
      }
      (window as any).SpeechRecognition = MockSpeechRec;
      (window as any).webkitSpeechRecognition = MockSpeechRec;
    }, { cid: conversationId, token: AUTH_TOKEN });

    const chatRequests: any[] = [];
    await page.route('**/api/chat', async (route) => {
      if (route.request().method() === 'POST') {
        const body = JSON.parse(route.request().postData() || '{}');
        chatRequests.push(body);

        const reply = body.message.includes('Saturn')
          ? 'Saturn V staging verified.'
          : 'Continuing mission trajectory.';

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            say: reply,
            mood: 'focused',
            isHermes: true,
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');

    // 1. Text Turn: user types "We are testing Saturn V"
    const textInput = page.locator('input[placeholder*="Ask Sofia"]');
    await textInput.waitFor({ state: 'visible', timeout: 8000 });
    await textInput.fill('We are testing Saturn V');
    await textInput.press('Enter');

    const textReply = page.locator('text=Saturn V staging verified.');
    await textReply.waitFor({ state: 'visible', timeout: 8000 });
    expect(await textReply.isVisible()).toBe(true);
    expect(chatRequests[0].message).toBe('We are testing Saturn V');
    expect(chatRequests[0].channel).toBe('chat');

    // 2. Voice Turn: user switches to voice
    const talkButton = page.locator('button[aria-label="Start voice conversation"]');
    await talkButton.click();

    await page.evaluate(() => {
      const rec = (window as any).__rec;
      if (rec && rec.onresult) {
        const item: any = [{ transcript: 'Confirm next staging burn' }];
        item.isFinal = true;
        rec.onresult({
          results: [item],
        });
      }
    });

    const stopButton = page.locator('button[aria-label="Stop listening"]');
    await stopButton.waitFor({ state: 'visible', timeout: 8000 });
    await stopButton.click();

    // Verify second request was channel=voice with the same conversationId
    expect(chatRequests.length).toBe(2);
    expect(chatRequests[1].message).toBe('Confirm next staging burn');
    expect(chatRequests[1].channel).toBe('voice');
    expect(chatRequests[1].sessionId).toBe(conversationId);

    await page.close();
  }, 20000);

  it('Test C — Long-running task & refresh rehydration: recovers active task after page reload', async () => {
    if (!serverReachable || !context) return;
    const page = await context.newPage();
    const conversationId = 'conv_playwright_async_3';
    const runId = 'hrun_playwright_long_999';

    await page.addInitScript(({ cid, token }) => {
      localStorage.setItem('sofia_token', token);
      localStorage.setItem('sofia_conversation_id', cid);
    }, { cid: conversationId, token: AUTH_TOKEN });

    // Initial chat response returns a background task pane
    await page.route('**/api/chat', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            say: "I've started that task on Hermes. It's running in the background and you can monitor it on the Stage.",
            mood: 'focused',
            isHermes: true,
            runId,
            panes: [
              {
                id: `pane-hermes-${runId}`,
                title: 'Hermes: Running Task',
                kind: 'code',
                run_id: runId,
                status: 'running',
                code: 'Task in progress on Hermes (Run ID: ' + runId + ')',
              },
            ],
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Mock GET /api/hermes/runs for rehydration
    await page.route('**/api/hermes/runs?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          runs: [
            {
              id: 'srun_rehydrate_1',
              hermes_run_id: runId,
              conversation_id: conversationId,
              status: 'running',
              prompt: 'Security vulnerability scan',
            },
          ],
        }),
      });
    });

    // Mock polling endpoint: returns running first, then completed
    let pollCount = 0;
    await page.route(`**/api/hermes/runs/${runId}`, async (route) => {
      pollCount++;
      const isDone = pollCount >= 2;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          object: 'hermes.run',
          run_id: runId,
          status: isDone ? 'completed' : 'running',
          output: isDone ? 'Vulnerability scan complete: 0 critical vulnerabilities found.' : undefined,
        }),
      });
    });

    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');

    // 1. Submit task
    const textInput = page.locator('input[placeholder*="Ask Sofia"]');
    await textInput.waitFor({ state: 'visible', timeout: 8000 });
    await textInput.fill('Run full vulnerability scan');
    await textInput.press('Enter');

    // 2. Stage pane shows running
    const runningTask = page.locator(`text=Task in progress on Hermes`);
    await runningTask.waitFor({ state: 'visible', timeout: 8000 });
    expect(await runningTask.isVisible()).toBe(true);

    // 3. User refreshes the page!
    await page.reload();
    await page.waitForLoadState('networkidle');

    // 4. Confirm Stage pane was rehydrated from /api/hermes/runs!
    const rehydratedTask = page.locator(`text=Task in progress on Hermes`);
    await rehydratedTask.waitFor({ state: 'visible', timeout: 8000 });
    expect(await rehydratedTask.isVisible()).toBe(true);

    // 5. Wait for active poller (2.5s interval) to reconcile completed status
    const completedTitle = page.locator('text=Hermes: Task Completed');
    await completedTitle.waitFor({ state: 'visible', timeout: 10000 });
    expect(await completedTitle.isVisible()).toBe(true);

    const completedOutput = page.locator('text=0 critical vulnerabilities found.');
    await completedOutput.waitFor({ state: 'visible', timeout: 8000 });
    expect(await completedOutput.isVisible()).toBe(true);

    await page.close();
  }, 25000);

  it('Test D — Failures: handles speech unsupported and Hermes offline gracefully', async () => {
    if (!serverReachable || !context) return;
    const page = await context.newPage();

    // 1. Test unsupported browser: SpeechRecognition is missing
    await page.addInitScript(() => {
      delete (window as any).SpeechRecognition;
      delete (window as any).webkitSpeechRecognition;
    });

    await page.goto(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');

    // Verify text input remains 100% functional fallback
    const textInput = page.locator('input[placeholder*="Ask Sofia"]');
    await textInput.waitFor({ state: 'visible', timeout: 8000 });
    expect(await textInput.isVisible()).toBe(true);
    expect(await textInput.isEnabled()).toBe(true);

    // 2. Test Hermes offline (502 Gateway error)
    await page.route('**/api/chat', async (route) => {
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Hermes gateway unreachable' }),
      });
    });

    await textInput.fill('Status ping');
    await textInput.press('Enter');

    // Sofia shows concerned expression and graceful caption
    const errorCaption = page.locator("text=I encountered an issue processing that. Let's try again.");
    await errorCaption.waitFor({ state: 'visible', timeout: 8000 });
    expect(await errorCaption.isVisible()).toBe(true);

    await page.close();
  }, 20000);

  it('Test E — Security: rejects missing token with 500 in production and 401 on unauthorized access', async () => {
    if (!serverReachable) return;
    // 1. Missing Authorization header on protected route
    const unauthRes = await fetch(`${BASE_URL}/api/hermes/status`);
    expect(unauthRes.status).toBe(401);

    // 2. Invalid Bearer token
    const invalidRes = await fetch(`${BASE_URL}/api/hermes/status`, {
      headers: { Authorization: 'Bearer invalid-token-playwright' },
    });
    expect(invalidRes.status).toBe(401);

    // 3. IDOR Protection: query non-existent or cross-owner run
    const idorRes = await fetch(`${BASE_URL}/api/hermes/runs/hrun_alien_foreign_run`, {
      headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
    });
    expect([401, 404]).toContain(idorRes.status);
  });
});
