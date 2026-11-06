import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { executeProactiveJob } from '@/lib/proactive';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ job: string }> }
) {
  try {
    const { job } = await params;

    // Check CRON_SECRET if configured
    const expectedSecret = process.env.CRON_SECRET;
    if (expectedSecret) {
      const headerSecret = req.headers.get('x-cron-secret');
      if (headerSecret !== expectedSecret) {
        return NextResponse.json({ error: 'unauthorized_cron_secret' }, { status: 401 });
      }
    }

    const searchParams = req.nextUrl.searchParams;
    const force = searchParams.get('force') === 'true';

    const validJobs = ['wake_report', 'midday_check', 'daily_verdict', 'github_sync'];
    if (!validJobs.includes(job)) {
      return NextResponse.json(
        { error: `Invalid cron job: ${job}. Valid jobs: ${validJobs.join(', ')}` },
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
