export type AppCategory = 'work' | 'leisure' | 'neutral' | 'unknown';

export interface ActivityEvent {
  id: string;
  ts: string;
  source: string;
  kind: 'window' | 'web' | 'manual' | 'heartbeat' | 'commit' | 'review';
  category: AppCategory;
  app: string;
  title?: string;
  duration_s: number;
  meta?: Record<string, unknown> | string;
}

export interface DayStats {
  date: string;
  active_min: number;
  work_min: number;
  leisure_min: number;
  neutral_min: number;
  commits: number;
  woke_at: string | null;
  bed_at: string | null;
  coverage: number; // 0 to 1
}

export interface ScoreComponents {
  wake: number;     // 0-1 (weight 2)
  focus: number;    // 0-1 (weight 3)
  output: number;   // 0-1 (weight 2)
  leisure: number;  // 0-1 (weight 2)
  sleep: number;    // 0-1 (weight 1)
}

export interface DayScore {
  date: string;
  score: number; // 0-10
  components: ScoreComponents;
  verdict: {
    text: string;
    woke_at: string | null;
    commits: number;
    leisure_pct: number;
    focus_hours: number;
    streak_days: number;
    consequence_eligible: boolean;
    suggested_intensity: number;
  };
  intensity: number;
  status: 'normal' | 'rest' | 'sick' | 'travel';
}

export interface PersonalityDials {
  strictness: number;  // 1-10 (default 7)
  warmth: number;      // 1-10 (default 6)
  teasing: number;     // 1-10 (default 6)
  formality: number;   // 1-10 (default 4)
  verbosity: number;   // 1-10 (default 3)
}

export interface SofiaSettings {
  target_wake_time: string; // "07:30"
  target_bed_time: string;  // "23:30"
  daily_focus_hours: number; // default 5.0
  daily_output_goal: number; // commits + tasks, default 6
  score_weights: {
    wake: number;
    focus: number;
    output: number;
    leisure: number;
    sleep: number;
  };
  personality: PersonalityDials;
  hermes: {
    base_url: string;
    model: string;
    provider: string;
    computer_use_enabled: boolean;
  };
  voice: {
    provider: 'edge' | 'elevenlabs' | 'browser';
    elevenlabs_voice_id?: string;
    auto_speak: boolean;
    voice_name: string;
    rate: number;
    pitch: number;
    live_voice?: string;
    live_model?: string;
  };
  consequences: {
    master_switch: boolean;
    enabled_rungs: {
      words: boolean;
      friction: boolean;
      alarm: boolean;
      stakes: boolean;
      haptic: boolean;
      stimulus: boolean;
    };
    hard_ceiling: number; // max 100
    daily_cap: number;    // default 2
    min_gap_minutes: number; // default 30
    kill_switch_active: boolean;
    dry_run_mode: boolean;
  };
  privacy: {
    window_titles: 'off' | 'counts_only' | 'full';
    web_domains: 'off' | 'counts_only' | 'full';
  };
  proactivity: {
    daily_cap: number; // default 8
    quiet_hours_start: string; // "23:00"
    quiet_hours_end: string;   // "07:00"
    muted_until: string | null;
    rest_day: boolean;
  };
}

export const defaultSettings: SofiaSettings = {
  target_wake_time: '07:30',
  target_bed_time: '23:30',
  daily_focus_hours: 5.0,
  daily_output_goal: 6,
  score_weights: {
    wake: 2,
    focus: 3,
    output: 2,
    leisure: 2,
    sleep: 1,
  },
  personality: {
    strictness: 7,
    warmth: 6,
    teasing: 6,
    formality: 4,
    verbosity: 3,
  },
  hermes: {
    base_url: 'https://ai-proxy.zenova.services/v1',
    model: 'deepseek-v4.1-flash',
    provider: 'litellm',
    computer_use_enabled: false,
  },
  voice: {
    provider: 'edge',
    elevenlabs_voice_id: 'EXAVITQu4vr4xnSDxMaL',
    auto_speak: true,
    voice_name: 'en-US-AvaNeural',
    rate: 1.0,
    pitch: 1.05,
    live_voice: 'Aoede',
    live_model: 'gemini-3.8-live',
  },
  consequences: {
    master_switch: false,
    enabled_rungs: {
      words: true,
      friction: true,
      alarm: false,
      stakes: false,
      haptic: false,
      stimulus: false,
    },
    hard_ceiling: 50,
    daily_cap: 2,
    min_gap_minutes: 30,
    kill_switch_active: false,
    dry_run_mode: true,
  },
  privacy: {
    window_titles: 'counts_only',
    web_domains: 'counts_only',
  },
  proactivity: {
    daily_cap: 8,
    quiet_hours_start: '23:00',
    quiet_hours_end: '07:00',
    muted_until: null,
    rest_day: false,
  },
};

export type SofiaExpression =
  | 'neutral'
  | 'pleased'
  | 'amused'
  | 'disappointed'
  | 'concerned'
  | 'focused'
  | 'sleepy'
  | 'stern';

export interface ChatMessage {
  id: string;
  ts: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  mood?: SofiaExpression;
  tool_calls?: Array<{
    name: string;
    args: Record<string, unknown>;
    result?: unknown;
  }>;
  session_id?: string;
  channel?: string;
}

export interface TaskItem {
  id: string;
  title: string;
  due?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  est_min: number;
  done_at?: string;
  created_at: string;
}

export interface MemoryNote {
  id: string;
  text: string;
  tags: string[];
  created_at: string;
  pinned: boolean;
}

export interface FocusSession {
  id: string;
  start: string;
  end: string | null;
  goal_min: number;
  result: 'completed' | 'interrupted' | 'drifted' | 'active';
  distraction_count: number;
}

export interface ConsequenceLogEntry {
  id: string;
  ts: string;
  kind: 'words' | 'friction' | 'alarm' | 'stakes' | 'haptic' | 'stimulus';
  intensity: number;
  reason: string;
  approved_by: string;
  status: 'fired' | 'blocked_by_policy' | 'cancelled_by_user' | 'dry_run';
}
