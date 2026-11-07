export type BrowserControlHolder = 'HUMAN' | 'AGENT';

export type BrowserSessionStatus = 'active' | 'navigating' | 'closed' | 'error';

export interface StoredBrowserSession {
  id: string;
  user_id: string;
  conversation_id: string;
  title: string;
  current_url: string;
  status: BrowserSessionStatus;
  lease_holder: BrowserControlHolder;
  lease_expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface BrowserControlLeaseState {
  sessionId: string;
  holder: BrowserControlHolder;
  expiresAt: string;
  isExpired: boolean;
  canTakeControl: boolean;
}

export type BrowserInputType =
  | 'click'
  | 'mousedown'
  | 'mouseup'
  | 'mousemove'
  | 'wheel'
  | 'keydown'
  | 'keyup'
  | 'type';

export interface BrowserInputEvent {
  type: BrowserInputType;
  x?: number;
  y?: number;
  button?: 'left' | 'right' | 'middle';
  clickCount?: number;
  deltaX?: number;
  deltaY?: number;
  text?: string;
  key?: string;
}

export interface BrowserActionRequest {
  action:
    | 'open'
    | 'navigate'
    | 'back'
    | 'forward'
    | 'click'
    | 'type'
    | 'scroll'
    | 'press_key'
    | 'wait'
    | 'get_page_info'
    | 'get_snapshot'
    | 'screenshot';
  url?: string;
  selector?: string;
  text?: string;
  key?: string;
  direction?: 'up' | 'down' | 'top' | 'bottom';
  amount?: number;
  x?: number;
  y?: number;
  ms?: number;
  sessionId?: string;
}

export interface BrowserPageInfo {
  url: string;
  title: string;
  status: number;
  textSnippet: string;
  interactiveElementsCount?: number;
  canGoBack: boolean;
  canGoForward: boolean;
  viewport: { width: number; height: number };
}
