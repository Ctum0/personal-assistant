import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

async function verifyLivingPresence() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });

  const page = await context.newPage();
  console.log('Navigating to http://localhost:3000/...');
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });

  // Wait 4 seconds for VRM model to load and render onto canvas
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

  // Check for deleted inspection elements (should be 0 or null)
  const inspectionAudit = await page.evaluate(() => {
    return {
      hasPerspectivePills: !!document.querySelector('button[aria-label*="view"]'),
      hasOrbitHint: !!document.body.innerText.includes('Orbit 360°'),
      hasDiagnosticsDrawer: !!document.body.innerText.includes('VRM Diagnostics'),
      canvasBoxStyle: (() => {
        const canvas = document.querySelector('canvas');
        if (!canvas) return null;
        const parent = canvas.parentElement;
        return {
          parentClasses: parent?.className,
          border: window.getComputedStyle(parent).border,
          boxShadow: window.getComputedStyle(parent).boxShadow,
        };
      })(),
    };
  });
  console.log('Inspection Audit:', JSON.stringify(inspectionAudit, null, 2));

  // Save screenshot
  const screenshotDir = path.join(process.cwd(), 'reports', 'uiux', 'screenshots');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  const screenshotPath = path.join(screenshotDir, 'living-ai-presence-console.png');
  await page.screenshot({ path: screenshotPath });
  console.log('Screenshot saved to:', screenshotPath);

  await browser.close();
}

verifyLivingPresence().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
