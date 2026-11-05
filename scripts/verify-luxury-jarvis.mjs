import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function verifyLuxuryJarvis() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });

  const page = await context.newPage();
  console.log('Navigating to http://localhost:3000/...');
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });

  // Wait 4 seconds for VRM model and particles to load
  await page.waitForTimeout(4000);

  // Check scroll metrics
  const scrollMetrics = await page.evaluate(() => {
    return {
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
      overflow: window.getComputedStyle(document.body).overflow,
    };
  });
  console.log('Scroll metrics:', scrollMetrics);

  // Check visual elements
  const audit = await page.evaluate(() => {
    return {
      hasSplitCards: !!document.querySelector('.grid-cols-12'),
      hasTopPillBars: !!document.body.innerText.includes('HERMES AI ONLINE • :8642'),
      hasInspectButtons: !!document.querySelector('button[aria-label*="view"]'),
      hasCircularDais: !!document.querySelector('.rounded-full'),
      hasCaptionLine: !!document.querySelector('footer p'),
      hasCommandInput: !!document.querySelector('#jarvis-command-input'),
    };
  });
  console.log('Audit Results:', JSON.stringify(audit, null, 2));

  const screenshotDir = path.join(process.cwd(), 'reports', 'uiux', 'screenshots');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  // 1. Capture primary Luxury Jarvis Companion Stage
  const consolePath = path.join(screenshotDir, 'luxury-jarvis-companion-console.png');
  await page.screenshot({ path: consolePath });
  console.log('Saved primary stage screenshot to:', consolePath);

  // 2. Open Command Console Drawer and capture
  const consoleButton = await page.$('button[title*="Command Console"]');
  if (consoleButton) {
    await consoleButton.click();
    await page.waitForTimeout(600);
    const drawerPath = path.join(screenshotDir, 'luxury-jarvis-console-drawer.png');
    await page.screenshot({ path: drawerPath });
    console.log('Saved drawer screenshot to:', drawerPath);
  }

  await browser.close();
}

verifyLuxuryJarvis().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
