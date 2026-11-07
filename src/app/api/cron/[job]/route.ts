import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/lib/db';
import { executeProactiveJob } from '@/lib/proactive';
import { verifyApiAuth } from '@/lib/auth';

const JOB_ALIASES: Record<string, string> = {
  morning: 'wake_report',
  midday: 'midday_check',
  evening: 'daily_verdict',
  night: 'daily_verdict',
  evening_verdict: 'daily_verdict',
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ job: string }> }
) {
  try {
    const auth = verifyApiAuth(req);
    if (!auth.authorized) {
      return auth.response!;
    }

    const { job: rawJob } = await params;
    const job = JOB_ALIASES[rawJob] || rawJob;

    const searchParams = req.nextUrl.searchParams;
    const force = searchParams.get('force') === 'true';

    const validJobs = ['wake_report', 'midday_check', 'daily_verdict', 'github_sync'];
    if (!validJobs.includes(job)) {
      return NextResponse.json(
        {
          error: `Invalid cron job: ${rawJob}. Valid jobs: morning (wake_report), midday (midday_check), evening/night (daily_verdict), github_sync`,
        },
        { status: 400 }
      );
    }

    const db = getDatabase();
    const result = await executeProactiveJob(db, job, { force });

    // Optional Telegram push if configured
    if (
      result.sent &&
      result.text &&
      process.env.TELEGRAM_BOT_TOKEN &&
      process.env.TELEGRAM_CHAT_ID
    ) {
      try {
        await fetch(
          `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: process.env.TELEGRAM_CHAT_ID,
              text: `🌸 Sofia: ${result.text}`,
            }),
          }
        );
      } catch (tgErr) {
        console.warn('Failed to dispatch telegram notification:', tgErr);
      }
    }

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
