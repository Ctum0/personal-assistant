export type SofiaMood =
  | 'neutral'
  | 'pleased'
  | 'amused'
  | 'focused'
  | 'stern'
  | 'disappointed'
  | 'concerned'
  | 'sleepy';

export interface BasePane {
  id: string;
  title?: string;
  kind: string;
  pinned?: boolean;
  run_id?: string;
  status?: string;
}

export interface ChartDatum {
  label: string;
  value: number;
  color?: string;
}

export interface ChartPane extends BasePane {
  kind: 'chart';
  chart_type: 'bar' | 'line' | 'donut';
  data: ChartDatum[];
}

export interface StatMetric {
  label: string;
  value: string | number;
  change?: string;
  accent?: string;
}

export interface StatPane extends BasePane {
  kind: 'stat';
  metrics: StatMetric[];
}

export interface TablePane extends BasePane {
  kind: 'table';
  columns: string[];
  rows: Array<Array<string | number>>;
}

export interface TimelineEvent {
  time: string;
  title: string;
  category?: string;
  duration?: string;
}

export interface TimelinePane extends BasePane {
  kind: 'timeline';
  events: TimelineEvent[];
}

export interface WebPane extends BasePane {
  kind: 'web';
  url: string;
  title?: string;
  snippet?: string;
  published?: string;
  image?: string;
}

export interface ImagePane extends BasePane {
  kind: 'image';
  url: string;
  caption?: string;
  alt?: string;
}

export interface TodoItem {
  id: string;
  title: string;
  done: boolean;
  due?: string;
  priority?: number;
}

export interface TodoPane extends BasePane {
  kind: 'todo';
  items: TodoItem[];
}

export interface CodePane extends BasePane {
  kind: 'code';
  language: string;
  code: string;
}

export interface ApprovalPane extends BasePane {
  kind: 'approval';
  approval_id: string;
  tool_name: string;
  target?: string;
  risk_level: 'R0' | 'R1' | 'R2' | 'R3';
  preview: Record<string, any>;
  reason: string;
  expires_at: string;
  action_hash?: string;
  requires_strong_confirmation?: boolean;
}

export interface BrowserPane extends BasePane {
  kind: 'browser';
  session_id: string;
  url: string;
  title: string;
  lease_holder: 'HUMAN' | 'AGENT';
  status: 'active' | 'navigating' | 'closed' | 'error';
  expanded?: boolean;
}

export type Pane =
  | ChartPane
  | StatPane
  | TablePane
  | TimelinePane
  | WebPane
  | ImagePane
  | TodoPane
  | CodePane
  | ApprovalPane
  | BrowserPane;

export interface SofiaTurn {
  say: string;
  mood: SofiaMood;
  panes?: Pane[];
}
