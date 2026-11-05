import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROUTES = [
  { name: 'Home', path: '/' },
  { name: 'Chat', path: '/chat' },
  { name: 'Computer Use', path: '/computer-use' },
  { name: 'Timeline', path: '/timeline' },
  { name: 'History', path: '/history' },
  { name: 'Tasks', path: '/tasks' },
  { name: 'Memory', path: '/memory' },
  { name: 'Settings', path: '/settings' },
];

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function run() {
  console.log(`Starting Axe-core accessibility audit against ${BASE_URL}...`);
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  const auditResults = {};
  let totalViolations = 0;

  for (const route of ROUTES) {
    const url = `${BASE_URL}${route.path}`;
    console.log(`Auditing ${route.name} (${url})...`);
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
      // Wait a moment for dynamic hydration/rendering
      await page.waitForTimeout(1000);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])
        .analyze();

      auditResults[route.name] = {
        url,
        violations: results.violations.map(v => ({
          id: v.id,
          impact: v.impact,
          description: v.description,
          help: v.help,
          helpUrl: v.helpUrl,
          nodesCount: v.nodes.length,
          nodes: v.nodes.map(n => ({
            html: n.html,
            target: n.target,
            failureSummary: n.failureSummary,
          })),
        })),
        passesCount: results.passes.length,
        incompleteCount: results.incomplete.length,
      };

      const violationCount = results.violations.reduce((sum, v) => sum + v.nodes.length, 0);
      totalViolations += violationCount;
      console.log(`  -> Found ${results.violations.length} violation rules (${violationCount} instances)`);
    } catch (err) {
      console.error(`  -> Failed to audit ${route.name}:`, err.message);
      auditResults[route.name] = { error: err.message };
    }
  }

  await browser.close();

  const outDir = path.resolve(process.cwd(), 'reports/uiux/baseline');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const jsonPath = path.join(outDir, 'axe-scan-results.json');
  fs.writeFileSync(jsonPath, JSON.stringify(auditResults, null, 2));
  console.log(`\nAudit completed! Total violations across all routes: ${totalViolations}`);
  console.log(`Detailed results saved to ${jsonPath}`);
}

run().catch(console.error);
