import http from 'node:http';
import net from 'node:net';
import dns from 'node:dns';
import { isPrivateOrRestrictedIpv4, isPrivateOrRestrictedIpv6 } from '../lib/browser/security';

export interface EgressProxyOptions {
  port?: number;
  host?: string;
  allowedHosts?: string[];
  blockedHosts?: string[];
  lookupFn?: (host: string) => Promise<string[]>;
}

export interface EgressProxyInstance {
  server: http.Server;
  port: number;
  host: string;
  proxyUrl: string;
  close: () => Promise<void>;
}

/**
 * Dedicated Egress Forward Proxy for Chromium.
 * Enforces socket-level IP destination validation, DNS rebinding prevention with IP pinning,
 * and private subnet protection for all browser HTTP/HTTPS/WebSocket traffic.
 */
export async function startBrowserEgressProxy(options: EgressProxyOptions = {}): Promise<EgressProxyInstance> {
  const host = options.host || '127.0.0.1';
  const targetPort = options.port || 0; // 0 chooses a random free ephemeral port
  const lookup = options.lookupFn || (async (h: string) => {
    const records = await dns.promises.lookup(h, { all: true });
    return records.map((r) => r.address);
  });

  async function verifyDestination(destHost: string): Promise<{ allowed: boolean; safeIp?: string; reason?: string }> {
    const lowerHost = destHost.toLowerCase().trim();

    // 1. Static host blocking
    if (
      lowerHost === 'localhost' ||
      lowerHost.endsWith('.localhost') ||
      lowerHost === '127.0.0.1' ||
      lowerHost === '::1' ||
      lowerHost === '0.0.0.0' ||
      lowerHost === 'metadata.google.internal' ||
      lowerHost.endsWith('.internal') ||
      lowerHost.endsWith('.local') ||
      lowerHost.endsWith('.lan') ||
      lowerHost.endsWith('.onion')
    ) {
      return { allowed: false, reason: `Destination host '${destHost}' is an internal/restricted destination` };
    }

    // 2. Direct IP check
    if (net.isIP(lowerHost) !== 0) {
      if (isPrivateOrRestrictedIpv4(lowerHost) || isPrivateOrRestrictedIpv6(lowerHost)) {
        return { allowed: false, reason: `Direct IP destination '${destHost}' is restricted (SSRF protection)` };
      }
      return { allowed: true, safeIp: lowerHost };
    }

    // 3. DNS resolution with multi-record inspection & IP pinning
    try {
      const ips = await lookup(lowerHost);
      if (!ips || ips.length === 0) {
        return { allowed: false, reason: `DNS lookup returned no records for '${destHost}'` };
      }

      for (const ip of ips) {
        if (isPrivateOrRestrictedIpv4(ip) || isPrivateOrRestrictedIpv6(ip)) {
          return {
            allowed: false,
            reason: `Host '${destHost}' resolved to private/restricted IP '${ip}' (DNS rebinding / SSRF protection)`,
          };
        }
      }

      // Return the first validated public IP for socket pinning
      return { allowed: true, safeIp: ips[0] };
    } catch (err: any) {
      return { allowed: false, reason: `DNS resolution failed for '${destHost}': ${err.message}` };
    }
  }

  const server = http.createServer(async (req, res) => {
    // Standard HTTP Forward Proxy handler
    try {
      if (!req.url) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Bad Request: Missing URL');
        return;
      }

      const parsedUrl = new URL(req.url);
      const destHost = parsedUrl.hostname;
      const destPort = parseInt(parsedUrl.port || '80', 10);

      const verification = await verifyDestination(destHost);
      if (!verification.allowed || !verification.safeIp) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: 'EgressBlocked',
            destination: destHost,
            reason: verification.reason,
          })
        );
        return;
      }

      // Forward request pinned to the verified safe IP
      const proxyReq = http.request(
        {
          host: verification.safeIp,
          port: destPort,
          method: req.method,
          path: parsedUrl.pathname + parsedUrl.search,
          headers: {
            ...req.headers,
            host: destHost, // Preserve virtual host
          },
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
          proxyRes.pipe(res);
        }
      );

      proxyReq.on('error', (err) => {
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'text/plain' });
          res.end(`Bad Gateway: ${err.message}`);
        }
      });

      req.pipe(proxyReq);
    } catch (err: any) {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Egress Proxy Error: ${err.message}`);
      }
    }
  });

  // HTTPS CONNECT Tunneling handler (used for https://, wss://, etc.)
  server.on('connect', async (req, clientSocket, head) => {
    try {
      const [destHost, portStr] = (req.url || '').split(':');
      const destPort = parseInt(portStr || '443', 10);

      const verification = await verifyDestination(destHost);
      if (!verification.allowed || !verification.safeIp) {
        clientSocket.write('HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\n\r\nEgress Blocked: ' + verification.reason);
        clientSocket.destroy();
        return;
      }

      // Open TCP connection to the verified safe IP directly (prevents DNS rebinding during TLS handshake)
      const targetSocket = net.connect(destPort, verification.safeIp, () => {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head && head.length > 0) {
          targetSocket.write(head);
        }
        targetSocket.pipe(clientSocket);
        clientSocket.pipe(targetSocket);
      });

      targetSocket.on('error', () => {
        clientSocket.destroy();
      });

      clientSocket.on('error', () => {
        targetSocket.destroy();
      });
    } catch {
      clientSocket.destroy();
    }
  });

  return new Promise((resolve, reject) => {
    server.listen(targetPort, host, () => {
      const address = server.address() as net.AddressInfo;
      const actualPort = address.port;
      const proxyUrl = `http://${host}:${actualPort}`;
      resolve({
        server,
        port: actualPort,
        host,
        proxyUrl,
        close: async () => {
          return new Promise<void>((res) => {
            server.close(() => res());
          });
        },
      });
    });

    server.on('error', reject);
  });
}
