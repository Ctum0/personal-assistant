import { chromium, Browser, BrowserContext, Page, CDPSession } from 'playwright';
import { validateDestinationUrl } from '../lib/browser/security';
import { BrowserInputEvent, BrowserPageInfo } from '../lib/browser/types';
import { RemoteBrowserClient } from './remote-browser-client';

export interface ScreencastFrame {
  data: string; // base64 JPEG
  metadata: {
    offsetTop: number;
    pageScaleFactor: number;
    deviceWidth: number;
    deviceHeight: number;
    scrollOffsetX: number;
    scrollOffsetY: number;
    timestamp?: number;
  };
}

export type ScreencastListener = (frame: ScreencastFrame) => void;

interface ActiveBrowserSession {
  context: BrowserContext;
  page: Page;
  cdp: CDPSession;
  screencastListeners: Set<ScreencastListener>;
  latestFrame: ScreencastFrame | null;
  lastActivity: number;
  currentUrl: string;
  currentTitle: string;
}

export interface BrowserManagerOptions {
  proxyUrl?: string;
  allowLoopbackForTesting?: boolean;
}

export class BrowserManager {
  private static instance: BrowserManager | null = null;
  private browser: Browser | null = null;
  private sessions = new Map<string, ActiveBrowserSession>();
  private initializingPromise: Promise<Browser> | null = null;
  private proxyUrl?: string;
  public allowLoopbackForTesting: boolean = false;

  constructor(options?: BrowserManagerOptions) {
    this.proxyUrl = options?.proxyUrl;
    this.allowLoopbackForTesting = options?.allowLoopbackForTesting || false;
  }

  public static getInstance(options?: BrowserManagerOptions): BrowserManager {
    if (!BrowserManager.instance) {
      BrowserManager.instance = new BrowserManager(options);
    } else if (options) {
      if (options.proxyUrl && !BrowserManager.instance.proxyUrl) {
        BrowserManager.instance.proxyUrl = options.proxyUrl;
      }
      if (options.allowLoopbackForTesting !== undefined) {
        BrowserManager.instance.allowLoopbackForTesting = options.allowLoopbackForTesting;
      }
    }
    return BrowserManager.instance;
  }

  public static resetInstanceForTesting(options?: BrowserManagerOptions): BrowserManager {
    BrowserManager.instance = new BrowserManager(options);
    return BrowserManager.instance;
  }

  /**
   * Initializes or reuses the shared Playwright Chromium instance.
   */
  public async getBrowser(): Promise<Browser> {
    if (this.browser && this.browser.isConnected()) {
      return this.browser;
    }

    if (this.initializingPromise) {
      return this.initializingPromise;
    }

    this.initializingPromise = (async () => {
      const launchArgs = [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--disable-default-apps',
        '--disable-quic',
        '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
        '--disable-webrtc-hw-decoding',
        '--disable-webrtc-hw-encoding',
      ];

      if (this.proxyUrl) {
        launchArgs.push(`--proxy-server=${this.proxyUrl}`);
      }

      const browser = await chromium.launch({
        headless: true,
        args: launchArgs,
      });

      this.browser = browser;
      this.initializingPromise = null;
      return browser;
    })();

    return this.initializingPromise;
  }

  /**
   * Ensures an isolated browser context and page exist for the given session ID.
   */
  public async ensureSession(sessionId: string, initialUrl: string = 'about:blank'): Promise<ActiveBrowserSession> {
    const existing = this.sessions.get(sessionId);
    if (existing && !existing.page.isClosed()) {
      existing.lastActivity = Date.now();
      return existing;
    }

    const browser = await this.getBrowser();

    // Isolated incognito browser context for least privilege and data isolation
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Sofia/1.0',
      ignoreHTTPSErrors: false,
    });

    const page = await context.newPage();

    // 1. Server-side network & SSRF interception on EVERY request and redirect
    await page.route('**/*', async (route) => {
      const requestUrl = route.request().url();
      const validation = await validateDestinationUrl(requestUrl, {
        allowLoopbackForTesting: this.allowLoopbackForTesting,
      });

      if (!validation.allowed) {
        // Abort forbidden destinations (loopback, private ranges, cloud metadata)
        await route.abort('blockedbyclient').catch(() => {});
        return;
      }

      await route.continue().catch(() => {});
    });

    // 2. Track page navigation and title changes
    let currentUrl = initialUrl;
    let currentTitle = 'New Tab';

    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        currentUrl = frame.url();
      }
    });

    page.on('load', async () => {
      currentUrl = page.url();
      currentTitle = await page.title().catch(() => 'Browser Workspace');
    });

    // 3. Attach private Chrome DevTools Protocol session for Screencast streaming
    const cdp = await context.newCDPSession(page);
    const sessionObj: ActiveBrowserSession = {
      context,
      page,
      cdp,
      screencastListeners: new Set(),
      latestFrame: null,
      lastActivity: Date.now(),
      currentUrl,
      currentTitle,
    };

    this.sessions.set(sessionId, sessionObj);

    // 4. Start Screencast frame generation
    await cdp.send('Page.enable').catch(() => {});
    await cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 75,
      maxWidth: 1280,
      maxHeight: 800,
      everyNthFrame: 1,
    }).catch(() => {});

    cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId: frameSessionId }: any) => {
      try {
        await cdp.send('Page.screencastFrameAck', { sessionId: frameSessionId }).catch(() => {});
      } catch {}

      const frame: ScreencastFrame = { data, metadata };
      sessionObj.latestFrame = frame;

      for (const listener of sessionObj.screencastListeners) {
        try {
          listener(frame);
        } catch {}
      }
    });

    // Navigate to initial URL if not about:blank
    if (initialUrl && initialUrl !== 'about:blank') {
      await this.navigate(sessionId, initialUrl).catch(() => {});
    }

    return sessionObj;
  }

  /**
   * Navigates the browser session to a destination URL with SSRF checks.
   */
  public async navigate(
    sessionId: string,
    url: string,
    options?: { timeout?: number }
  ): Promise<{ url: string; title: string; status: number }> {
    const session = await this.ensureSession(sessionId);
    session.lastActivity = Date.now();

    // Validate target destination
    const validation = await validateDestinationUrl(url, {
      allowLoopbackForTesting: this.allowLoopbackForTesting,
    });
    if (!validation.allowed) {
      throw new Error(`Navigation blocked by security policy: ${validation.reason}`);
    }

    const response = await session.page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: options?.timeout || 15000,
    });

    const status = response ? response.status() : 200;
    session.currentUrl = session.page.url();
    session.currentTitle = await session.page.title().catch(() => 'Browser Workspace');

    return {
      url: session.currentUrl,
      title: session.currentTitle,
      status,
    };
  }

  /**
   * Navigates back in browser history.
   */
  public async goBack(sessionId: string): Promise<boolean> {
    const session = await this.ensureSession(sessionId);
    session.lastActivity = Date.now();
    const res = await session.page.goBack({ waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => null);
    session.currentUrl = session.page.url();
    session.currentTitle = await session.page.title().catch(() => '');
    return !!res;
  }

  /**
   * Navigates forward in browser history.
   */
  public async goForward(sessionId: string): Promise<boolean> {
    const session = await this.ensureSession(sessionId);
    session.lastActivity = Date.now();
    const res = await session.page.goForward({ waitUntil: 'domcontentloaded', timeout: 5000 }).catch(() => null);
    session.currentUrl = session.page.url();
    session.currentTitle = await session.page.title().catch(() => '');
    return !!res;
  }

  /**
   * Clicks an element by CSS selector or coordinates.
   */
  public async click(
    sessionId: string,
    options: { selector?: string; x?: number; y?: number }
  ): Promise<boolean> {
    const session = await this.ensureSession(sessionId);
    session.lastActivity = Date.now();

    if (options.selector) {
      await session.page.click(options.selector, { timeout: 5000 });
      return true;
    }

    if (options.x !== undefined && options.y !== undefined) {
      await session.page.mouse.click(options.x, options.y);
      return true;
    }

    throw new Error('Either selector or x, y coordinates must be provided for click');
  }

  /**
   * Types text into a selector or directly to the active element.
   */
  public async type(sessionId: string, text: string, selector?: string): Promise<boolean> {
    const session = await this.ensureSession(sessionId);
    session.lastActivity = Date.now();

    // Check if the target is a password or credential field
    const isPasswordField = await session.page
      .evaluate((sel) => {
        let targetEl: Element | null = null;
        if (sel) {
          targetEl = document.querySelector(sel);
        } else {
          targetEl = document.activeElement;
        }
        if (!targetEl) return false;
        const input = targetEl as HTMLInputElement;
        const type = (input.type || '').toLowerCase();
        const autocomplete = (input.autocomplete || '').toLowerCase();
        return (
          type === 'password' ||
          autocomplete.includes('password') ||
          autocomplete === 'current-password' ||
          autocomplete === 'new-password'
        );
      }, selector)
      .catch(() => false);

    if (isPasswordField) {
      throw new Error(
        'Agent credential typing is strictly forbidden: sensitive password fields must be filled manually by the human owner'
      );
    }

    if (selector) {
      await session.page.fill(selector, text, { timeout: 5000 });
    } else {
      await session.page.keyboard.type(text);
    }
    return true;
  }

  /**
   * Presses a specific keyboard key (e.g. Enter, Backspace, Escape, Tab).
   */
  public async pressKey(sessionId: string, key: string): Promise<boolean> {
    const session = await this.ensureSession(sessionId);
    session.lastActivity = Date.now();
    await session.page.keyboard.press(key);
    return true;
  }

  /**
   * Scrolls the page in the specified direction.
   */
  public async scroll(
    sessionId: string,
    direction: 'up' | 'down' | 'top' | 'bottom',
    amount: number = 300
  ): Promise<boolean> {
    const session = await this.ensureSession(sessionId);
    session.lastActivity = Date.now();

    if (direction === 'top') {
      await session.page.evaluate(() => window.scrollTo(0, 0));
    } else if (direction === 'bottom') {
      await session.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    } else if (direction === 'up') {
      await session.page.mouse.wheel(0, -amount);
    } else {
      await session.page.mouse.wheel(0, amount);
    }

    return true;
  }

  /**
   * Pauses for a specified duration.
   */
  public async wait(sessionId: string, ms: number = 1000): Promise<boolean> {
    const session = await this.ensureSession(sessionId);
    session.lastActivity = Date.now();
    const clampedMs = Math.min(Math.max(ms, 100), 10000);
    await session.page.waitForTimeout(clampedMs);
    return true;
  }

  /**
   * Retrieves high-level page information for agent reasoning and Stage display.
   */
  public async getPageInfo(sessionId: string): Promise<BrowserPageInfo> {
    const session = await this.ensureSession(sessionId);
    session.lastActivity = Date.now();

    const url = session.page.url();
    const title = await session.page.title().catch(() => '');

    const textSnippet = await session.page.evaluate(() => {
      const clone = document.body.cloneNode(true) as HTMLElement;
      // Remove scripts, styles, noscript
      const removeElements = clone.querySelectorAll('script, style, noscript, svg');
      removeElements.forEach((el) => el.remove());
      return clone.innerText.slice(0, 1500).replace(/\s+/g, ' ').trim();
    }).catch(() => '');

    const interactiveCount = await session.page.evaluate(() => {
      return document.querySelectorAll('button, a, input, select, textarea').length;
    }).catch(() => 0);

    return {
      url,
      title,
      status: 200,
      textSnippet,
      interactiveElementsCount: interactiveCount,
      canGoBack: true,
      canGoForward: true,
      viewport: { width: 1280, height: 800 },
    };
  }

  /**
   * Returns a clean, text-based structural snapshot of the visible page.
   * Perfect for LLM context assembly without raw HTML overhead.
   */
  public async getSnapshot(sessionId: string): Promise<string> {
    const session = await this.ensureSession(sessionId);
    session.lastActivity = Date.now();

    const snapshot = await session.page.evaluate(() => {
      const title = document.title;
      const url = window.location.href;

      const interactive = Array.from(document.querySelectorAll('a, button, input, select, textarea'))
        .slice(0, 30)
        .map((el, i) => {
          const tag = el.tagName.toLowerCase();
          const input = el as HTMLInputElement;
          const inputType = (input.type || '').toLowerCase();
          const autocomplete = (input.autocomplete || '').toLowerCase();

          let text = '';
          if (inputType === 'password' || autocomplete.includes('password')) {
            text = '[REDACTED_PASSWORD]';
          } else if (autocomplete.includes('cc-') || autocomplete === 'cc-number' || autocomplete === 'cc-csc') {
            text = '[REDACTED_FINANCIAL]';
          } else {
            text = (el as HTMLElement).innerText || input.value || input.placeholder || '';
          }

          const href = (el as HTMLAnchorElement).href ? ` href="${(el as HTMLAnchorElement).href}"` : '';
          return `[${i + 1}] <${tag}${href}>${text.trim()}</${tag}>`;
        })
        .join('\n');

      return `PAGE TITLE: ${title}\nURL: ${url}\n\nINTERACTIVE ELEMENTS:\n${interactive}`;
    }).catch((err) => `Failed to retrieve snapshot: ${err.message}`);

    return snapshot;
  }

  /**
   * Captures a high-resolution PNG screenshot.
   */
  public async screenshot(sessionId: string): Promise<Buffer> {
    const session = await this.ensureSession(sessionId);
    session.lastActivity = Date.now();
    return await session.page.screenshot({ type: 'png' });
  }

  /**
   * Dispatches human mouse and keyboard input directly into the browser page.
   */
  public async dispatchInput(sessionId: string, event: BrowserInputEvent): Promise<boolean> {
    const session = await this.ensureSession(sessionId);
    session.lastActivity = Date.now();
    const { page } = session;

    switch (event.type) {
      case 'mousemove':
        if (event.x !== undefined && event.y !== undefined) {
          await page.mouse.move(event.x, event.y);
        }
        break;

      case 'mousedown':
        if (event.x !== undefined && event.y !== undefined) {
          await page.mouse.move(event.x, event.y);
        }
        await page.mouse.down({ button: event.button || 'left' });
        break;

      case 'mouseup':
        if (event.x !== undefined && event.y !== undefined) {
          await page.mouse.move(event.x, event.y);
        }
        await page.mouse.up({ button: event.button || 'left' });
        break;

      case 'click':
        if (event.x !== undefined && event.y !== undefined) {
          await page.mouse.click(event.x, event.y, {
            button: event.button || 'left',
            clickCount: event.clickCount || 1,
          });
        }
        break;

      case 'wheel':
        await page.mouse.wheel(event.deltaX || 0, event.deltaY || 0);
        break;

      case 'keydown':
        if (event.key) {
          await page.keyboard.down(event.key);
        }
        break;

      case 'keyup':
        if (event.key) {
          await page.keyboard.up(event.key);
        }
        break;

      case 'type':
        if (event.text) {
          await page.keyboard.type(event.text);
        }
        break;

      default:
        return false;
    }

    return true;
  }

  /**
   * Subscribes a listener to receive real-time screencast frames for a session.
   */
  public subscribeScreencast(sessionId: string, listener: ScreencastListener): () => void {
    let session = this.sessions.get(sessionId);
    if (!session) {
      // Create session lazily on subscription
      this.ensureSession(sessionId).then((s) => {
        s.screencastListeners.add(listener);
        if (s.latestFrame) {
          try {
            listener(s.latestFrame);
          } catch {}
        }
      });
      return () => {
        const s = this.sessions.get(sessionId);
        if (s) s.screencastListeners.delete(listener);
      };
    }

    session.screencastListeners.add(listener);
    if (session.latestFrame) {
      try {
        listener(session.latestFrame);
      } catch {}
    }

    return () => {
      const s = this.sessions.get(sessionId);
      if (s) s.screencastListeners.delete(listener);
    };
  }

  /**
   * Returns the most recent screencast frame for rehydration on connect.
   */
  public getLatestFrame(sessionId: string): ScreencastFrame | null {
    const session = this.sessions.get(sessionId);
    return session ? session.latestFrame : null;
  }

  /**
   * Closes a single browser session context.
   */
  public async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    this.sessions.delete(sessionId);
    try {
      session.screencastListeners.clear();
      await session.context.close();
    } catch {}
  }

  /**
   * Closes all active sessions and the Chromium browser instance.
   */
  public async closeAll(): Promise<void> {
    for (const [id] of this.sessions) {
      await this.closeSession(id);
    }
    if (this.browser) {
      try {
        await this.browser.close();
      } catch {}
      this.browser = null;
    }
  }
}

export function getBrowserManager(): BrowserManager | RemoteBrowserClient {
  const workerUrl = process.env.BROWSER_WORKER_URL;
  if (workerUrl) {
    return new RemoteBrowserClient({
      workerUrl,
      workerSecret: process.env.BROWSER_WORKER_SECRET,
    });
  }

  if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_IN_PROCESS_BROWSER) {
    throw new Error(
      'Production Browser Isolation Error: BROWSER_WORKER_URL is not configured. Running Chromium inside the Next.js production process is forbidden. Please configure the isolated browser worker.'
    );
  }

  return BrowserManager.getInstance();
}
