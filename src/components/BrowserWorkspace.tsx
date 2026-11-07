'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserPane } from '@/lib/stage';
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Globe,
  Lock,
  Maximize2,
  Minimize2,
  UserCheck,
  Bot,
  AlertCircle,
  ShieldCheck,
  Loader2,
} from 'lucide-react';

interface BrowserWorkspaceProps {
  pane: BrowserPane;
  onDismiss?: () => void;
  onToggleExpand?: (expanded: boolean) => void;
}

export const BrowserWorkspace: React.FC<BrowserWorkspaceProps> = ({
  pane,
  onDismiss,
  onToggleExpand,
}) => {
  const [urlInput, setUrlInput] = useState(pane.url || 'https://github.com');
  const [currentUrl, setCurrentUrl] = useState(pane.url || 'https://github.com');
  const [title, setTitle] = useState(pane.title || 'Browser Workspace');
  const [leaseHolder, setLeaseHolder] = useState<'HUMAN' | 'AGENT'>(pane.lease_holder || 'HUMAN');
  const [isNavigating, setIsNavigating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(Boolean(pane.expanded));
  const [latestFrame, setLatestFrame] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastMoveSentRef = useRef<number>(0);

  // Synchronize URL input with pane url prop
  useEffect(() => {
    if (pane.url) {
      setUrlInput(pane.url);
      setCurrentUrl(pane.url);
    }
    if (pane.title) setTitle(pane.title);
    if (pane.lease_holder) setLeaseHolder(pane.lease_holder);
  }, [pane.url, pane.title, pane.lease_holder]);

  // Render JPEG frame onto Canvas
  const renderFrame = useCallback((base64Jpeg: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      canvas.width = 1280;
      canvas.height = 800;
      ctx.drawImage(img, 0, 0, 1280, 800);
    };
    img.src = `data:image/jpeg;base64,${base64Jpeg}`;
  }, []);

  // Connect to live visual screencast SSE stream and rehydrate session
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('sofia_token') || '' : '';
    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
    const streamUrl = `/api/browser/sessions/${encodeURIComponent(pane.session_id)}/stream${tokenParam}`;

    // Initial session rehydration
    fetch(`/api/browser/sessions/${encodeURIComponent(pane.session_id)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.session) {
          if (data.session.current_url) {
            setCurrentUrl(data.session.current_url);
            setUrlInput(data.session.current_url);
          }
          if (data.session.title) setTitle(data.session.title);
          if (data.session.lease_holder) setLeaseHolder(data.session.lease_holder);
        }
      })
      .catch(() => {});

    let eventSource: EventSource | null = null;

    try {
      // EventSource with query param token for seamless SSE authorization
      eventSource = new EventSource(streamUrl);

      eventSource.onopen = () => {
        setConnected(true);
        setErrorMsg(null);
      };

      eventSource.addEventListener('connected', () => {
        setConnected(true);
      });

      eventSource.addEventListener('frame', (e: MessageEvent) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload.data) {
            setLatestFrame(payload.data);
            renderFrame(payload.data);
          }
        } catch {}
      });

      eventSource.onerror = () => {
        setConnected(false);
      };
    } catch {
      setErrorMsg('Failed to connect to live visual stream');
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [pane.session_id, renderFrame]);

  // Dispatch human interaction event to backend input API
  const sendInput = useCallback(
    async (event: Record<string, any>) => {
      if (leaseHolder !== 'HUMAN') return;

      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('sofia_token') || '' : '';
        await fetch(`/api/browser/sessions/${encodeURIComponent(pane.session_id)}/input`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(event),
        });
      } catch {}
    },
    [pane.session_id, leaseHolder]
  );

  // Canvas Mouse Coordinates Translator
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = 1280 / rect.width;
    const scaleY = 800 / rect.height;
    const x = Math.round((e.clientX - rect.left) * scaleX);
    const y = Math.round((e.clientY - rect.top) * scaleY);
    return { x: Math.max(0, Math.min(1280, x)), y: Math.max(0, Math.min(800, y)) };
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const now = Date.now();
    if (now - lastMoveSentRef.current < 40) return; // Throttle cursor events to 25fps
    lastMoveSentRef.current = now;
    const { x, y } = getCanvasCoords(e);
    sendInput({ type: 'mousemove', x, y });
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasCoords(e);
    sendInput({ type: 'mousedown', x, y, button: e.button === 2 ? 'right' : 'left' });
  };

  const handleCanvasMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasCoords(e);
    sendInput({ type: 'mouseup', x, y, button: e.button === 2 ? 'right' : 'left' });
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { x, y } = getCanvasCoords(e);
    sendInput({ type: 'click', x, y, button: e.button === 2 ? 'right' : 'left' });
  };

  const handleCanvasWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    sendInput({ type: 'wheel', deltaX: e.deltaX, deltaY: e.deltaY });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (leaseHolder !== 'HUMAN') return;

    if (e.key === 'Tab') e.preventDefault();

    if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      sendInput({ type: 'type', text: e.key });
    } else {
      sendInput({ type: 'keydown', key: e.key });
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (leaseHolder !== 'HUMAN') return;
    if (e.key.length > 1) {
      sendInput({ type: 'keyup', key: e.key });
    }
  };

  // Navigate to URL action
  const handleNavigate = async (urlToNavigate: string) => {
    if (!urlToNavigate) return;
    setIsNavigating(true);
    setErrorMsg(null);

    let normalized = urlToNavigate.trim();
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      if (normalized.includes('.') && !normalized.includes(' ')) {
        normalized = `https://${normalized}`;
      } else {
        normalized = `https://www.google.com/search?q=${encodeURIComponent(normalized)}`;
      }
    }

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('sofia_token') || '' : '';
      const res = await fetch(`/api/browser/sessions/${encodeURIComponent(pane.session_id)}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action: 'navigate', url: normalized }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Navigation failed');
      }

      setCurrentUrl(data.result?.url || normalized);
      setUrlInput(data.result?.url || normalized);
      if (data.result?.title) setTitle(data.result.title);
    } catch (err: any) {
      setErrorMsg(err.message || 'Navigation error');
    } finally {
      setIsNavigating(false);
    }
  };

  // Quick navigation controls
  const handleHistoryAction = async (action: 'back' | 'forward') => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('sofia_token') || '' : '';
      const res = await fetch(`/api/browser/sessions/${encodeURIComponent(pane.session_id)}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.result?.url) {
        setCurrentUrl(data.result.url);
        setUrlInput(data.result.url);
      }
    } catch {}
  };

  // Toggle control lease between Human and Agent
  const handleLeaseToggle = async () => {
    const targetHolder = leaseHolder === 'HUMAN' ? 'AGENT' : 'HUMAN';
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('sofia_token') || '' : '';
      const res = await fetch(`/api/browser/sessions/${encodeURIComponent(pane.session_id)}/control`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ target_holder: targetHolder }),
      });
      const data = await res.json();
      if (res.ok) {
        setLeaseHolder(data.lease.holder);
      }
    } catch {}
  };

  const toggleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    if (onToggleExpand) onToggleExpand(next);
  };

  return (
    <div
      ref={containerRef}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      tabIndex={0}
      className={`browser-workspace flex flex-col rounded-2xl bg-[#0c0208]/95 border border-burgundy-800/50 shadow-[0_12px_40px_rgba(20,3,10,0.7)] backdrop-blur-2xl overflow-hidden transition-all duration-300 focus:outline-none focus:ring-1 focus:ring-rose-500/40 w-full ${
        expanded ? 'h-[680px]' : 'h-[540px] md:h-[580px] lg:h-[620px]'
      }`}
    >
      {/* Top Bar: Navigation controls + URL bar + Lease Pill */}
      <div className="flex items-center space-x-2 px-3 py-2 bg-[#16040e]/90 border-b border-burgundy-800/40 select-none">
        {/* Navigation arrows */}
        <div className="flex items-center space-x-1">
          <button
            onClick={() => handleHistoryAction('back')}
            title="Go Back"
            className="p-1 rounded-lg text-rose-300/80 hover:text-rose-100 hover:bg-rose-950/60 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleHistoryAction('forward')}
            title="Go Forward"
            className="p-1 rounded-lg text-rose-300/80 hover:text-rose-100 hover:bg-rose-950/60 transition-colors"
          >
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleNavigate(currentUrl)}
            title="Reload Page"
            className={`p-1 rounded-lg text-rose-300/80 hover:text-rose-100 hover:bg-rose-950/60 transition-colors ${
              isNavigating ? 'animate-spin text-rose-400' : ''
            }`}
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Omnibox / URL address bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleNavigate(urlInput);
          }}
          className="flex-1 flex items-center bg-[#090105] border border-rose-950/80 focus-within:border-rose-600/60 rounded-xl px-2.5 py-1 transition-all"
        >
          <Lock className="w-3 h-3 text-emerald-400/80 mr-1.5 shrink-0" />
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Search or enter web address"
            className="w-full bg-transparent text-xs font-mono text-rose-100 placeholder-rose-400/40 focus:outline-none"
          />
          {isNavigating && <Loader2 className="w-3 h-3 text-rose-400 animate-spin shrink-0 ml-1" />}
        </form>

        {/* Control Lease Pill */}
        <button
          onClick={handleLeaseToggle}
          title={
            leaseHolder === 'HUMAN'
              ? 'Human has control. Click to hand control to Sofia'
              : 'Sofia has control. Click to take manual human control'
          }
          className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-lg font-mono text-[10px] font-semibold border transition-all ${
            leaseHolder === 'HUMAN'
              ? 'bg-emerald-950/70 text-emerald-300 border-emerald-600/50 hover:bg-emerald-900/60'
              : 'bg-rose-950/70 text-rose-300 border-rose-600/50 hover:bg-rose-900/60'
          }`}
        >
          {leaseHolder === 'HUMAN' ? (
            <>
              <UserCheck className="w-3 h-3 text-emerald-400" />
              <span>You Control</span>
            </>
          ) : (
            <>
              <Bot className="w-3 h-3 text-rose-400 animate-pulse" />
              <span>Sofia Controls</span>
            </>
          )}
        </button>

        {/* Expand / Minimize Toggle */}
        <button
          onClick={toggleExpand}
          title={expanded ? 'Minimize Workspace' : 'Expand Workspace'}
          className="p-1 rounded-lg text-rose-400/80 hover:text-rose-100 hover:bg-rose-950/60 transition-colors"
        >
          {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Error banner if navigation failed or SSRF caught */}
      {errorMsg && (
        <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-rose-950/90 border-b border-rose-700/60 text-rose-200 text-xs">
          <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          <span className="truncate">{errorMsg}</span>
        </div>
      )}

      {/* Canvas Viewport: Real-time Chromium Screencast Display */}
      <div className="relative flex-1 bg-[#050003] flex items-center justify-center overflow-hidden cursor-crosshair">
        <canvas
          ref={canvasRef}
          onMouseMove={handleCanvasMouseMove}
          onMouseDown={handleCanvasMouseDown}
          onMouseUp={handleCanvasMouseUp}
          onClick={handleCanvasClick}
          onWheel={handleCanvasWheel}
          className="w-full h-full object-contain"
        />

        {/* Overlay when Sofia / Agent has control */}
        {leaseHolder === 'AGENT' && (
          <div className="absolute top-2 right-2 flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-rose-950/80 border border-rose-600/60 text-[10px] font-mono text-rose-200 pointer-events-none animate-fadeIn backdrop-blur-md">
            <Bot className="w-3 h-3 text-rose-400 animate-spin" />
            <span>Sofia Operating Browser</span>
          </div>
        )}

        {/* Connection status placeholder if waiting for first frame */}
        {!latestFrame && (
          <div className="absolute inset-0 flex flex-col items-center justify-center space-y-2 text-rose-400/70 font-mono text-xs">
            <Loader2 className="w-6 h-6 animate-spin text-rose-400" />
            <span>Connecting to isolated browser worker...</span>
          </div>
        )}
      </div>
    </div>
  );
};
