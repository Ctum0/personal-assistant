import { NextRequest, NextResponse } from 'next/server';
import { verifyApiAuth } from '@/lib/auth';
import { getHermesClient } from '@/lib/hermes';
import { getSanitizedHermesConfig } from '@/lib/hermes/config';

export async function GET(req: NextRequest) {
  const auth = verifyApiAuth(req);
  if (!auth.authorized) {
    return auth.response!;
  }

  const sanitizedConfig = getSanitizedHermesConfig();
  if (!sanitizedConfig.enabled || !sanitizedConfig.isConfigured) {
    return NextResponse.json({
      status: 'disabled_or_unconfigured',
      config: sanitizedConfig,
      online: false,
      message: 'Hermes is either disabled or missing required environment configuration (HERMES_API_KEY)',
    });
  }

  try {
    const client = getHermesClient();
    const capabilities = await Promise.race([
      client.getCapabilities(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Capabilities check timed out after 4000ms')), 4000)
      ),
    ]);

    return NextResponse.json({
      status: 'healthy',
      config: sanitizedConfig,
      online: true,
      platform: capabilities.platform,
      model: capabilities.model,
      authRequired: capabilities.auth?.required ?? true,
      runtimeMode: capabilities.runtime?.mode,
    });
  } catch (err: any) {
    return NextResponse.json({
      status: 'unreachable',
      config: sanitizedConfig,
      online: false,
      error: err.message || 'Failed to reach Hermes gateway',
    });
  }
}
