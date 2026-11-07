#!/usr/bin/env node
const readline = require('readline');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Auto-load from .env if missing from environment
function loadEnvFromProfiles() {
  const envPaths = [
    '/opt/data/profiles/sofia/.env',
    '/home/ctum/.hermes/profiles/sofia/.env',
    path.join(__dirname, '../../profiles/sofia/.env'),
  ];
  for (const envPath of envPaths) {
    try {
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const idx = trimmed.indexOf('=');
          if (idx > 0) {
            const key = trimmed.slice(0, idx).trim();
            const val = trimmed.slice(idx + 1).trim().replace(/^['"](.*)['"]$/, '$1');
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
        break;
      }
    } catch (_) {}
  }
}

loadEnvFromProfiles();

const SOFIA_ENDPOINT = process.env.SOFIA_MCP_URL || 'http://127.0.0.1:3005/api/mcp';
const SOFIA_TOKEN = process.env.SOFIA_API_TOKEN || process.env.SOFIA_AUTH_TOKEN || '';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

async function callSofiaMcp(payload) {
  return new Promise((resolve) => {
    try {
      const isHttps = SOFIA_ENDPOINT.startsWith('https:');
      const client = isHttps ? https : http;
      const url = new URL(SOFIA_ENDPOINT);

      const body = JSON.stringify(payload);
      const headers = {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      };
      if (SOFIA_TOKEN) {
        headers['Authorization'] = `Bearer ${SOFIA_TOKEN}`;
        headers['x-sofia-token'] = SOFIA_TOKEN;
      }

      const req = client.request(url, {
        method: 'POST',
        headers,
        timeout: 30000,
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json && typeof json === 'object' && json.jsonrpc === '2.0') {
              resolve(json);
            } else if (res.statusCode >= 400 || (json && json.error)) {
              resolve({
                jsonrpc: '2.0',
                id: payload.id !== undefined ? payload.id : null,
                error: {
                  code: -32603,
                  message: typeof json === 'object' && json.error ? (typeof json.error === 'string' ? json.error : json.error.message || JSON.stringify(json.error)) : `HTTP ${res.statusCode}: ${data.slice(0, 200)}`
                }
              });
            } else {
              resolve({
                jsonrpc: '2.0',
                id: payload.id !== undefined ? payload.id : null,
                result: json
              });
            }
          } catch (e) {
            resolve({
              jsonrpc: '2.0',
              id: payload.id !== undefined ? payload.id : null,
              error: {
                code: -32603,
                message: `Invalid JSON response: ${data.slice(0, 200)}`
              }
            });
          }
        });
      });

      req.on('error', (err) => {
        resolve({
          jsonrpc: '2.0',
          id: payload.id !== undefined ? payload.id : null,
          error: {
            code: -32603,
            message: `Network error: ${err.message}`
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          jsonrpc: '2.0',
          id: payload.id !== undefined ? payload.id : null,
          error: {
            code: -32603,
            message: 'Sofia MCP request timeout'
          }
        });
      });

      req.write(body);
      req.end();
    } catch (err) {
      resolve({
        jsonrpc: '2.0',
        id: payload.id !== undefined ? payload.id : null,
        error: {
          code: -32603,
          message: err.message || String(err)
        }
      });
    }
  });
}

rl.on('line', async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch (parseErr) {
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error' }
    }) + '\n');
    return;
  }

  try {
    // Standard MCP lifecycle
    if (msg.method === 'initialize') {
      const resp = {
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'sofia-browser', version: '1.0.0' }
        }
      };
      process.stdout.write(JSON.stringify(resp) + '\n');
      return;
    }

    if (msg.method === 'notifications/initialized') {
      return;
    }

    if (msg.method === 'ping') {
      const resp = { jsonrpc: '2.0', id: msg.id, result: {} };
      process.stdout.write(JSON.stringify(resp) + '\n');
      return;
    }

    // Forward tools/list and tools/call to Sofia application
    const result = await callSofiaMcp(msg);
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (err) {
    const errResp = {
      jsonrpc: '2.0',
      id: msg.id !== undefined ? msg.id : null,
      error: { code: -32603, message: err.message || String(err) }
    };
    process.stdout.write(JSON.stringify(errResp) + '\n');
  }
});
