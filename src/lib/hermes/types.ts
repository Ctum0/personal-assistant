export interface HermesConfig {
  baseUrl: string;
  apiKey: string;
  sessionKey: string;
  timeoutMs: number;
}

export interface HermesMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface HermesRunRequest {
  input: string | HermesMessage[];
  session_id?: string;
  model?: string;
  instructions?: string;
  previous_response_id?: string;
  idempotency_key?: string;
}

export interface HermesRunResponse {
  run_id: string;
  status: 'queued' | 'started' | 'running' | 'completed' | 'failed' | 'stopped' | string;
  replayed?: boolean;
}

export interface HermesRunUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
}

export interface HermesRunRuntime {
  provider: string;
  model: string;
  route_source?: string;
}

export interface HermesRunStatus {
  object: string;
  run_id: string;
  status: 'queued' | 'started' | 'running' | 'completed' | 'failed' | 'stopped' | 'waiting_approval' | string;
  created_at: number;
  updated_at: number;
  session_id?: string;
  model?: string;
  output?: string;
  last_event?: string;
  usage?: HermesRunUsage;
  runtime?: HermesRunRuntime;
  completed?: boolean;
  partial?: boolean;
  interrupted?: boolean;
  error?: string | { message: string; type?: string };
}

export interface HermesSSEEvent {
  seq?: number;
  event: string;
  data: any;
}

export interface HermesSteerRequest {
  message: string;
}

export interface HermesApprovalRequest {
  choice?: 'once' | 'session' | 'always' | 'deny' | 'approve';
  action?: 'approve' | 'deny';
  request_id?: string;
  tool_call_id?: string;
  resolve_all?: boolean;
  feedback?: string;
}

export interface HermesCapabilities {
  object: string;
  platform: string;
  model: string;
  auth: {
    type: string;
    required: boolean;
  };
  runtime?: {
    mode: string;
    tool_execution?: string;
    split_runtime?: boolean;
    description?: string;
  };
  features?: {
    run_submission?: boolean;
    chat_completions?: boolean;
    run_status?: boolean;
    run_events_sse?: boolean;
    run_stop?: boolean;
    run_steer?: boolean;
    run_approval_response?: boolean;
    [key: string]: any;
  };
  endpoints?: Record<string, { method: string; path: string } | [string, string] | any>;
}

export interface HermesToolset {
  name: string;
  label?: string;
  description?: string;
  enabled: boolean;
  configured: boolean;
  tools?: string[];
}
