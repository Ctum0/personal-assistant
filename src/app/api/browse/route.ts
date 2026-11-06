import { NextRequest, NextResponse } from 'next/server';

function isSsrfSafeUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    const host = parsed.hostname.toLowerCase();

    // Block localhost, loopback, IPv6 loopback
    if (host === 'localhost' || host === '::1' || host === '0.0.0.0') {
      return false;
    }

    // Block AWS/GCP/Cloud metadata
    if (host === '169.254.169.254') {
      return false;
    }

    // Check IPv4 private ranges: 127.*, 10.*, 192.168.*, 172.16-31.*
    const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4Match) {
      const octet1 = parseInt(ipv4Match[1], 10);
      const octet2 = parseInt(ipv4Match[2], 10);

      if (octet1 === 127) return false;
      if (octet1 === 10) return false;
      if (octet1 === 192 && octet2 === 168) return false;
      if (octet1 === 172 && octet2 >= 16 && octet2 <= 31) return false;
      if (octet1 === 169 && octet2 === 254) return false;
    }

    return true;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawUrl = typeof body.url === 'string' ? body.url.trim() : '';

    if (!rawUrl) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    if (!isSsrfSafeUrl(rawUrl)) {
      return NextResponse.json(
        { error: 'Invalid or restricted internal destination (SSRF protection)' },
        { status: 403 }
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(rawUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SofiaAI/1.0',
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      return NextResponse.json(
        { error: `Target URL returned HTTP ${res.status}` },
        { status: res.status }
      );
    }

    const html = await res.text();

    // Extract <title>
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';

    // Extract meta description or og:description
    const descMatch =
      html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
    const description = descMatch ? descMatch[1].trim() : '';

    // Extract og:image
    const imageMatch = html.match(
      /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i
    );
    const image = imageMatch ? imageMatch[1].trim() : undefined;

    // Body text snippet (strip scripts, styles, html tags)
    const cleanBody = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const snippet = description || cleanBody.slice(0, 500);

    return NextResponse.json({
      url: rawUrl,
      title: title || rawUrl,
      snippet: snippet.slice(0, 500),
      image,
      published: new Date().toLocaleDateString(),
    });
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return NextResponse.json({ error: 'Request timed out after 5 seconds' }, { status: 504 });
    }
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
