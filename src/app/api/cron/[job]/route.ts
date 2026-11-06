import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { executeProactiveJob } from '@/lib/proactive';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ job: string }> }
) {
  try {
    const { job: requestedJob } = await params;
    const job = requestedJob === 'evening_verdict' ? 'daily_verdict' : requestedJob;

    // Check Bearer token or CRON_SECRET if configured
    const expectedToken = process.env.SOFIA_API_TOKEN || process.env.CRON_SECRET;
    if (expectedToken) {
      const authHeader = req.headers.get('authorization');
      const bearerToken = authHeader?.replace(/^Bearer\s+/i, '').trim();
      const cronSecret = req.headers.get('x-cron-secret');

      if (bearerToken !== expectedToken && cronSecret !== expectedToken) {
        return NextResponse.json({ error: 'unauthorized_token' }, { status: 401 });
      }
    }

    const searchParams = req.nextUrl.searchParams;
    const force = searchParams.get('force') === 'true';

    const validJobs = ['wake_report', 'midday_check', 'daily_verdict', 'github_sync'];
    if (!validJobs.includes(job)) {
      return NextResponse.json(
        { error: `Invalid cron job: ${requestedJob}. Valid jobs: wake_report, midday_check, evening_verdict (daily_verdict), github_sync` },
        { status: 400 }
      );
    }

    const db = getDatabase();
    const result = await executeProactiveJob(db, job, { force });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ job: string }> }
) {
  return POST(req, context);
}
