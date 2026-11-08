import type { NextConfig } from "next";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Content hash of the capture worklet.
 *
 * /worklets/* is served with `cache-control: public, max-age=14400` and sits
 * behind Cloudflare, so a hardcoded `?v=2` meant a fixed bug: a browser that had
 * once loaded the broken worklet kept running it for four hours after a deploy,
 * and no amount of redeploying could reach it. Hashing the bytes gives every
 * change a new URL, so there is never anything stale to serve.
 */
function workletVersion(): string {
  try {
    const buf = readFileSync(join(process.cwd(), "public", "worklets", "pcm-16k.js"));
    return createHash("sha256").update(buf).digest("hex").slice(0, 12);
  } catch {
    return "dev";
  }
}

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["msedge-tts"],
  env: {
    NEXT_PUBLIC_WORKLET_V: workletVersion(),
    // Bumped on every build. The client compares this against /api/build-id on
    // load: an open tab running yesterday's bundle is how fixes "don't arrive".
    NEXT_PUBLIC_BUILD_ID: Date.now().toString(36),
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
