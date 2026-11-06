import { DatabaseSync } from 'node:sqlite';
import { ingestEvents, rebuildDayStats } from './db';
import { ActivityEvent } from './types';

interface GitHubSyncOptions {
  username?: string;
  token?: string;
}

export async function syncGitHubActivity(
  db: DatabaseSync,
  options: GitHubSyncOptions = {}
): Promise<{ count: number; status: string }> {
  const username = options.username || process.env.GITHUB_USERNAME;
  const token = options.token || process.env.GITHUB_TOKEN;

  if (!username) {
    return { count: 0, status: 'skipped_no_username' };
  }

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'Sofia-Companion-Daemon',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const res = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}/events?per_page=30`, {
      headers,
    });

    if (!res.ok) {
      return { count: 0, status: `github_api_error_${res.status}` };
    }

    const eventsData = await res.json();
    if (!Array.isArray(eventsData)) {
      return { count: 0, status: 'invalid_response' };
    }

    const sofiaEvents: ActivityEvent[] = [];
    const today = new Date().toISOString().slice(0, 10);

    for (const evt of eventsData) {
      if (evt.type === 'PushEvent' && evt.payload?.commits) {
        for (const commit of evt.payload.commits) {
          sofiaEvents.push({
            id: `gh-commit-${commit.sha.slice(0, 12)}`,
            ts: evt.created_at || new Date().toISOString(),
            source: 'github',
            kind: 'commit',
            category: 'work',
            app: 'github',
            title: commit.message ? commit.message.split('\n')[0] : 'Git commit',
            duration_s: 0,
            meta: JSON.stringify({
              repo: evt.repo?.name,
              sha: commit.sha,
              author: commit.author?.name,
            }),
          });
        }
      } else if (evt.type === 'PullRequestReviewEvent') {
        sofiaEvents.push({
          id: `gh-review-${evt.id}`,
          ts: evt.created_at || new Date().toISOString(),
          source: 'github',
          kind: 'review',
          category: 'work',
          app: 'github',
          title: `PR Review: ${evt.payload?.pull_request?.title || evt.repo?.name || 'Review'}`,
          duration_s: 300,
          meta: JSON.stringify({
            repo: evt.repo?.name,
            pr: evt.payload?.pull_request?.number,
          }),
        });
      }
    }

    if (sofiaEvents.length > 0) {
      const inserted = ingestEvents(db, sofiaEvents);
      rebuildDayStats(db, today);
      return { count: inserted, status: 'synced' };
    }

    return { count: 0, status: 'no_new_events' };
  } catch (err) {
    return { count: 0, status: `error: ${String(err)}` };
  }
}
