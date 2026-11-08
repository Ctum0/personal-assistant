import { NextResponse } from "next/server";

/**
 * The build id baked into the running bundle, so an open tab can tell that the
 * server it is talking to has moved on. Without this a browser keeps executing
 * yesterday's code and every deploy looks like "nothing changed".
 *
 * No `dynamic = "force-dynamic"` here: `cacheComponents: true` rejects route
 * segment config outright (Turbopack build error), and the no-store header is
 * what actually keeps it fresh.
 */
export async function GET() {
  return NextResponse.json(
    { id: process.env.NEXT_PUBLIC_BUILD_ID || "dev" },
    { headers: { "cache-control": "no-store" } },
  );
}
