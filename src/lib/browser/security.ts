import dns from 'node:dns';
import net from 'node:net';

export interface UrlValidationResult {
  allowed: boolean;
  reason?: string;
  normalizedUrl?: string;
  resolvedIps?: string[];
}

/**
 * Checks if an IPv4 address string falls into private, loopback, link-local, or cloud metadata ranges.
 */
export function isPrivateOrRestrictedIpv4(ip: string): boolean {
  if (net.isIP(ip) !== 4) {
    return false;
  }
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return true; // Malformed IP defaults to blocked
  }

  const [b0, b1] = parts;

  // 0.0.0.0/8 - Current network
  if (b0 === 0) return true;

  // 127.0.0.0/8 - Loopback
  if (b0 === 127) return true;

  // 10.0.0.0/8 - Private Class A
  if (b0 === 10) return true;

  // 172.16.0.0/12 - Private Class B (172.16.x.x - 172.31.x.x)
  if (b0 === 172 && b1 >= 16 && b1 <= 31) return true;

  // 192.168.0.0/16 - Private Class C
  if (b0 === 192 && b1 === 168) return true;

  // 169.254.0.0/16 - Link-local / Cloud Metadata (169.254.169.254)
  if (b0 === 169 && b1 === 254) return true;

  // 100.64.0.0/10 - Carrier-grade NAT (100.64.0.0 - 100.127.255.255)
  if (b0 === 100 && b1 >= 64 && b1 <= 127) return true;

  // 224.0.0.0/4 - Multicast
  if (b0 >= 224 && b0 <= 239) return true;

  // 240.0.0.0/4 - Reserved
  if (b0 >= 240) return true;

  return false;
}

/**
 * Checks if an IPv6 address string falls into loopback, link-local, unique-local, or mapped IPv4 private ranges.
 */
export function isPrivateOrRestrictedIpv6(ip: string): boolean {
  if (net.isIP(ip) !== 6) {
    return false;
  }
  const lower = ip.toLowerCase().trim();

  // IPv6 Loopback (::1)
  if (lower === '::1' || lower === '0:0:0:0:0:0:0:1' || lower === '::') {
    return true;
  }

  // Link-local: fe80::/10 (fe80: to febf:)
  if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) {
    return true;
  }

  // Unique local address (ULA): fc00::/7 (fc00: to fdff:)
  if (lower.startsWith('fc') || lower.startsWith('fd')) {
    return true;
  }

  // IPv4-mapped IPv6: ::ffff:x.x.x.x
  if (lower.startsWith('::ffff:') || lower.startsWith('0:0:0:0:0:ffff:')) {
    const lastPart = lower.split(':').pop() || '';
    if (lastPart.includes('.')) {
      return isPrivateOrRestrictedIpv4(lastPart);
    }
  }

  return false;
}

/**
 * Validates a target URL against SSRF, internal network traversal, cloud metadata endpoints,
 * and DNS rebinding attacks.
 */
export async function validateDestinationUrl(
  rawUrl: string,
  options?: {
    resolveDns?: boolean;
    lookupFn?: (host: string) => Promise<string[]>;
    allowLoopbackForTesting?: boolean;
  }
): Promise<UrlValidationResult> {
  const resolveDns = options?.resolveDns ?? true;
  const allowLoopback = options?.allowLoopbackForTesting ?? false;

  if (!rawUrl || typeof rawUrl !== 'string') {
    return { allowed: false, reason: 'URL must be a non-empty string' };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { allowed: false, reason: 'Malformed URL' };
  }

  // 1. Strict Protocol Whitelist: HTTP and HTTPS only
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { allowed: false, reason: `Protocol '${parsed.protocol}' is forbidden; only http and https are permitted` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // 2. Reject credentials embedded in URL (e.g. http://user:pass@host)
  if (parsed.username || parsed.password) {
    return { allowed: false, reason: 'Embedded URL user credentials are strictly forbidden' };
  }

  // If allowLoopbackForTesting is explicitly set (e.g. local fixture server), permit 127.0.0.1 and localhost
  if (allowLoopback && (hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1')) {
    return {
      allowed: true,
      normalizedUrl: parsed.toString(),
      resolvedIps: ['127.0.0.1'],
    };
  }

  // 3. Static hostname blocking (localhost, cloud metadata, internal domains)
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '0.0.0.0' ||
    hostname === 'metadata.google.internal' ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.lan') ||
    hostname.endsWith('.onion')
  ) {
    return { allowed: false, reason: `Destination host '${hostname}' is an internal or restricted destination` };
  }

  // 4. If hostname is already a raw IPv4 or IPv6 address, check immediately
  if (net.isIP(hostname) !== 0) {
    if (isPrivateOrRestrictedIpv4(hostname) || isPrivateOrRestrictedIpv6(hostname)) {
      return { allowed: false, reason: `IP address '${hostname}' belongs to a private, loopback, or metadata subnet` };
    }
  }

  // 5. DNS Resolution Verification (Protects against DNS Rebinding & Dynamic Private Resolves)
  if (resolveDns) {
    try {
      let resolvedIps: string[] = [];

      if (options?.lookupFn) {
        resolvedIps = await options.lookupFn(hostname);
      } else {
        const records = await dns.promises.lookup(hostname, { all: true });
        resolvedIps = records.map((r) => r.address);
      }

      if (resolvedIps.length === 0) {
        return { allowed: false, reason: `DNS resolution returned no IP addresses for '${hostname}'` };
      }

      for (const ip of resolvedIps) {
        if (isPrivateOrRestrictedIpv4(ip) || isPrivateOrRestrictedIpv6(ip)) {
          return {
            allowed: false,
            reason: `Host '${hostname}' resolves to private/restricted IP '${ip}' (SSRF/DNS-rebinding protection)`,
            resolvedIps,
          };
        }
      }

      return {
        allowed: true,
        normalizedUrl: parsed.toString(),
        resolvedIps,
      };
    } catch (err: any) {
      return {
        allowed: false,
        reason: `DNS lookup failed for host '${hostname}': ${err.message || String(err)}`,
      };
    }
  }

  return {
    allowed: true,
    normalizedUrl: parsed.toString(),
  };
}
