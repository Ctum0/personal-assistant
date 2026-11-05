import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROUTES = [
  { name: 'dashboard', path: '/' },
  { name: 'chat', path: '/chat' },
  { name: 'computer-use', path: '/computer-use' },
  { name: 'timeline', path: '/timeline' },
  { name: 'history', path: '/history' },
  { name: 'tasks', path: '/tasks' },
  { name: 'memory', path: '/memory' },
  { name: 'settings', path: '/settings' },
];

const BASE_URL = 'http://localhost:3000';
const OUT_DIR = path.resolve(process.cwd(), 'reports/uiux/screenshots/spacious');

async function capture() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();

  for (const viewport of [
    { width: 1440, height: 900, label: '1440' },
    { width: 1680, height: 950, label: '1680' }
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();

    for (const route of ROUTES) {
      const url = `${BASE_URL}${route.path}`;
      console.log(`Capturing ${route.name} at ${viewport.width}x${viewport.height}...`);
      await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(600);

      const filePath = path.join(OUT_DIR, `${route.name}-${viewport.label}.png`);
      await page.screenshot({ path: filePath, fullPage: false });
    }
    await context.close();
  }

  await browser.close();
  console.log(`All spacious screenshots captured in ${OUT_DIR}`);
}

capture().catch(console.error);
