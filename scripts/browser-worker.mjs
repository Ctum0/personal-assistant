#!/usr/bin/env node
/**
 * Launcher for isolated browser worker
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workerTs = join(__dirname, 'browser-worker.ts');

const child = spawn('npx', ['tsx', workerTs], {
  stdio: 'inherit',
  env: process.env,
});

child.on('exit', (code) => {
  process.exit(code || 0);
});
