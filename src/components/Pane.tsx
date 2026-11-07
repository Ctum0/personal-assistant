'use client';

import React, { useState } from 'react';
import {
  Pane as PaneType,
  ChartPane,
  StatPane,
  TablePane,
  TimelinePane,
  WebPane,
  ImagePane,
  TodoPane,
  CodePane,
  ApprovalPane,
  BrowserPane,
} from '@/lib/stage';
import { BrowserWorkspace } from './BrowserWorkspace';
import {
  Pin,
  X,
  ExternalLink,
  Copy,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  Sparkles,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';

interface PaneProps {
  pane: PaneType;
  onDismiss: (id: string) => void;
  onPin: (id: string) => void;
}

export const Pane: React.FC<PaneProps> = ({ pane, onDismiss, onPin }) => {
  if (pane.kind === 'browser') {
    return <BrowserWorkspace pane={pane} onDismiss={() => onDismiss(pane.id)} />;
  }

  return (
    <div
      className="glass-panel border border-burgundy-700/40 rounded-2xl shadow-[0_12px_40px_rgba(20,3,10,0.7)] backdrop-blur-2xl overflow-hidden flex flex-col transition-all duration-300 w-full text-rose-100"
      style={{
        background: 'linear-gradient(145deg, rgba(28, 5, 15, 0.85) 0%, rgba(16, 2, 8, 0.92) 100%)',
      }}
    >
      {/* Pane Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-burgundy-800/40 bg-burgundy-950/40">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
          <h3 className="text-xs font-mono font-semibold tracking-wider text-rose-200 uppercase truncate max-w-[220px]">
            {pane.title || pane.kind}
          </h3>
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={() => onPin(pane.id)}
            title={pane.pinned ? 'Unpin pane' : 'Pin pane'}
            aria-label={pane.pinned ? 'Unpin pane' : 'Pin pane'}
            className={`p-1.5 rounded-lg transition-colors ${
              pane.pinned
                ? 'bg-rose-900/60 text-rose-300 border border-rose-500/40'
                : 'text-rose-400/70 hover:text-rose-200 hover:bg-rose-950/40'
            }`}
          >
            <Pin className={`w-3.5 h-3.5 ${pane.pinned ? 'fill-rose-400 rotate-45' : ''}`} />
          </button>
          <button
            onClick={() => onDismiss(pane.id)}
            title="Dismiss pane"
            aria-label="Dismiss pane"
            className="p-1.5 rounded-lg text-rose-400/70 hover:text-rose-200 hover:bg-rose-950/40 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Pane Content */}
      <div className="p-4 overflow-y-auto max-h-[380px] custom-scrollbar text-sm">
        {pane.kind === 'chart' && <ChartPaneContent pane={pane} />}
        {pane.kind === 'stat' && <StatPaneContent pane={pane} />}
        {pane.kind === 'table' && <TablePaneContent pane={pane} />}
        {pane.kind === 'timeline' && <TimelinePaneContent pane={pane} />}
        {pane.kind === 'web' && <WebPaneContent pane={pane} />}
        {pane.kind === 'image' && <ImagePaneContent pane={pane} />}
        {pane.kind === 'todo' && <TodoPaneContent pane={pane} />}
        {pane.kind === 'code' && <CodePaneContent pane={pane} />}
        {pane.kind === 'approval' && <ApprovalPaneContent pane={pane} onDismiss={onDismiss} />}
      </div>
    </div>
  );
};

/* -------------------------------------------------------------
 * Chart Pane (Pure SVG)
 * ------------------------------------------------------------- */
const ChartPaneContent: React.FC<{ pane: ChartPane }> = ({ pane }) => {
  const { chart_type, data } = pane;
  if (!data || data.length === 0) return <p className="text-xs text-rose-400/70 font-mono">No data</p>;

  const maxVal = Math.max(...data.map((d) => d.value), 1);

  if (chart_type === 'donut') {
    const total = data.reduce((acc, d) => acc + d.value, 0) || 1;
    const radius = 40;
    const circumference = 2 * Math.PI * radius;
    let accumulatedOffset = 0;

    const colors = ['#e11d48', '#be123c', '#9f1239', '#881337', '#f43f5e', '#fb7185'];

    return (
      <div className="flex flex-col items-center py-2 space-y-4">
        <div className="relative w-32 h-32 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r={radius} fill="none" stroke="#260614" strokeWidth="12" />
            {data.map((d, i) => {
              const strokeLength = (d.value / total) * circumference;
              const strokeDasharray = `${strokeLength} ${circumference - strokeLength}`;
              const strokeDashoffset = -accumulatedOffset;
              accumulatedOffset += strokeLength;
              const color = d.color || colors[i % colors.length];

              return (
                <circle
                  key={i}
                  cx="50"
                  cy="50"
                  r={radius}
                  fill="none"
                  stroke={color}
                  strokeWidth="12"
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  className="transition-all duration-500"
                />
              );
            })}
          </svg>
          <div className="absolute flex flex-col items-center">
            <span className="text-lg font-bold font-mono text-rose-100">{total}</span>
            <span className="text-[10px] text-rose-400/70 font-mono">Total</span>
          </div>
        </div>

        <div className="w-full grid grid-cols-2 gap-2 text-xs font-mono">
          {data.map((d, i) => (
            <div key={i} className="flex items-center space-x-2">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: d.color || colors[i % colors.length] }}
              />
              <span className="truncate text-rose-300">{d.label}:</span>
              <span className="font-bold text-rose-100">{d.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (chart_type === 'line') {
    const width = 280;
    const height = 110;
    const padding = 15;
    const plotWidth = width - padding * 2;
    const plotHeight = height - padding * 2;

    const points = data.map((d, i) => {
      const x = padding + (i / Math.max(data.length - 1, 1)) * plotWidth;
      const y = height - padding - (d.value / maxVal) * plotHeight;
      return { x, y, ...d };
    });

    const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(' ');
    const areaPoints = `${padding},${height - padding} ${polylinePoints} ${
      points[points.length - 1].x
    },${height - padding}`;

    return (
      <div className="py-2">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-28 overflow-visible">
          <defs>
            <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e11d48" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#e11d48" stopOpacity="0.0" />
            </linearGradient>
          </defs>
          <polygon points={areaPoints} fill="url(#lineGrad)" />
          <polyline
            points={polylinePoints}
            fill="none"
            stroke="#f43f5e"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {points.map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r="3.5"
              fill="#fff1f2"
              stroke="#e11d48"
              strokeWidth="2"
            />
          ))}
        </svg>
        <div className="flex justify-between text-[10px] font-mono text-rose-400/80 mt-2 px-1">
          {data.map((d, i) => (
            <span key={i}>{d.label}</span>
          ))}
        </div>
      </div>
    );
  }

  // Bar chart (default)
  return (
    <div className="space-y-2.5 py-1">
      {data.map((d, i) => {
        const pct = Math.round((d.value / maxVal) * 100);
        return (
          <div key={i} className="space-y-1">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-rose-300">{d.label}</span>
              <span className="font-bold text-rose-100">{d.value}</span>
            </div>
            <div className="w-full h-2 rounded-full bg-rose-950/60 overflow-hidden border border-rose-900/30">
              <div
                className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-rose-700 via-rose-500 to-crimson-400"
                style={{ width: `${pct}%`, backgroundColor: d.color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* -------------------------------------------------------------
 * Stat Pane
 * ------------------------------------------------------------- */
const StatPaneContent: React.FC<{ pane: StatPane }> = ({ pane }) => {
  return (
    <div className="grid grid-cols-2 gap-3 py-1">
      {pane.metrics.map((m, i) => (
        <div
          key={i}
          className="p-3 rounded-xl bg-burgundy-950/50 border border-burgundy-800/40 flex flex-col justify-between"
        >
          <span className="text-xs font-mono text-rose-300/80 truncate">{m.label}</span>
          <div className="mt-1 flex items-baseline space-x-2">
            <span className="text-2xl font-bold font-mono text-rose-50 tracking-tight">
              {m.value}
            </span>
            {m.change && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-900/40 text-rose-300 border border-rose-500/30">
                {m.change}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

/* -------------------------------------------------------------
 * Table Pane
 * ------------------------------------------------------------- */
const TablePaneContent: React.FC<{ pane: TablePane }> = ({ pane }) => {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs font-mono border-collapse">
        <thead>
          <tr className="border-b border-rose-900/50 text-rose-300">
            {pane.columns.map((col, i) => (
              <th key={i} className="pb-2 font-semibold">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-rose-950/50">
          {pane.rows.map((row, rIdx) => (
            <tr key={rIdx} className="hover:bg-rose-950/30 transition-colors">
              {row.map((cell, cIdx) => (
                <td key={cIdx} className="py-2 pr-2 text-rose-100">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/* -------------------------------------------------------------
 * Timeline Pane
 * ------------------------------------------------------------- */
const TimelinePaneContent: React.FC<{ pane: TimelinePane }> = ({ pane }) => {
  return (
    <div className="relative pl-5 space-y-3 py-1">
      <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-rose-900/40" />
      {pane.events.map((ev, i) => (
        <div key={i} className="relative group">
          <div className="absolute -left-[17px] top-1.5 w-2.5 h-2.5 rounded-full bg-rose-500 border-2 border-[#16030c] shadow-[0_0_8px_rgba(244,63,94,0.6)]" />
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-mono text-rose-400 font-semibold">{ev.time}</span>
            {ev.category && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-950 border border-rose-900/40 text-rose-300">
                {ev.category}
              </span>
            )}
          </div>
          <p className="text-sm text-rose-100 font-medium mt-0.5">{ev.title}</p>
          {ev.duration && (
            <span className="text-[11px] font-mono text-rose-400/70">{ev.duration}</span>
          )}
        </div>
      ))}
    </div>
  );
};

/* -------------------------------------------------------------
 * Web Reader Card Pane (NEVER iframe)
 * ------------------------------------------------------------- */
const WebPaneContent: React.FC<{ pane: WebPane }> = ({ pane }) => {
  let hostname = '';
  try {
    hostname = new URL(pane.url).hostname;
  } catch {
    hostname = pane.url;
  }

  return (
    <div className="space-y-3 py-1">
      {pane.image && (
        <div className="w-full h-32 rounded-xl overflow-hidden bg-rose-950/50">
          <img src={pane.image} alt={pane.title || 'Web'} className="w-full h-full object-cover" />
        </div>
      )}
      <div>
        <div className="flex items-center justify-between text-[11px] font-mono text-rose-400 mb-1">
          <span className="px-2 py-0.5 rounded-full bg-rose-950 border border-rose-800/40 text-rose-300">
            {hostname}
          </span>
          {pane.published && <span>{pane.published}</span>}
        </div>
        <a
          href={pane.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold text-rose-100 hover:text-white flex items-center space-x-1.5 group"
        >
          <span>{pane.title || pane.url}</span>
          <ExternalLink className="w-3.5 h-3.5 text-rose-400 group-hover:translate-x-0.5 transition-transform" />
        </a>
      </div>
      {pane.snippet && (
        <p className="text-xs text-rose-200/90 leading-relaxed font-sans">{pane.snippet}</p>
      )}
    </div>
  );
};

/* -------------------------------------------------------------
 * Image Pane
 * ------------------------------------------------------------- */
const ImagePaneContent: React.FC<{ pane: ImagePane }> = ({ pane }) => {
  return (
    <div className="space-y-2 py-1">
      <div className="w-full max-h-56 rounded-xl overflow-hidden bg-rose-950/40 border border-rose-900/30 flex items-center justify-center">
        <img
          src={pane.url}
          alt={pane.alt || pane.caption || 'Image'}
          className="w-full h-full object-contain hover:scale-105 transition-transform duration-300"
        />
      </div>
      {pane.caption && (
        <p className="text-xs font-mono text-rose-300 text-center">{pane.caption}</p>
      )}
    </div>
  );
};

/* -------------------------------------------------------------
 * Todo Pane (Interactive click-to-toggle)
 * ------------------------------------------------------------- */
const TodoPaneContent: React.FC<{ pane: TodoPane }> = ({ pane }) => {
  const [items, setItems] = useState(pane.items);

  const toggleItem = async (id: string) => {
    const next = items.map((it) => (it.id === id ? { ...it, done: !it.done } : it));
    setItems(next);

    const target = next.find((it) => it.id === id);
    if (target) {
      try {
        await fetch('/api/tasks', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, done: target.done }),
        });
      } catch (err) {
        console.warn('Failed to update task status:', err);
      }
    }
  };

  return (
    <div className="space-y-2 py-1">
      {items.map((it) => (
        <button
          key={it.id}
          onClick={() => toggleItem(it.id)}
          className="w-full flex items-center space-x-2.5 p-2 rounded-xl bg-burgundy-950/40 hover:bg-burgundy-900/40 border border-burgundy-800/30 text-left transition-colors"
        >
          {it.done ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <Circle className="w-4 h-4 text-rose-400/60 shrink-0" />
          )}
          <span
            className={`text-xs font-medium flex-1 ${
              it.done ? 'line-through text-rose-400/50' : 'text-rose-100'
            }`}
          >
            {it.title}
          </span>
          {it.due && (
            <span className="text-[10px] font-mono text-rose-400/70 shrink-0">{it.due}</span>
          )}
        </button>
      ))}
    </div>
  );
};

/* -------------------------------------------------------------
 * Code Pane
 * ------------------------------------------------------------- */
const CodePaneContent: React.FC<{ pane: CodePane }> = ({ pane }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(pane.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-2 py-1">
      <div className="flex items-center justify-between text-[11px] font-mono text-rose-400">
        <span className="uppercase px-2 py-0.5 rounded bg-rose-950 border border-rose-800/40">
          {pane.language}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center space-x-1 px-2 py-1 rounded bg-rose-950/80 hover:bg-rose-900/80 text-rose-300 hover:text-white transition-colors"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="p-3 rounded-xl bg-[#0d0107] border border-rose-900/40 font-mono text-xs text-rose-100 overflow-x-auto leading-relaxed">
        <code>{pane.code}</code>
      </pre>
    </div>
  );
};

/* -------------------------------------------------------------
 * Approval Pane (Server-Enforced Human Approval Gate)
 * ------------------------------------------------------------- */
const ApprovalPaneContent: React.FC<{ pane: ApprovalPane; onDismiss: (id: string) => void }> = ({
  pane,
}) => {
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmedRisk, setConfirmedRisk] = useState(!pane.requires_strong_confirmation);
  const [decision, setDecision] = useState<string | null>(pane.status && pane.status !== 'pending' ? pane.status : null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isR3 = pane.risk_level === 'R3';
  const previewJson = JSON.stringify(pane.preview || {}, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(previewJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const submitDecision = async (action: 'approve' | 'deny') => {
    if (action === 'approve' && isR3 && !confirmedRisk) {
      setErrorMsg('Please confirm acknowledgment of high-consequence risk before approving.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('sofia_token') : '';
      const res = await fetch(`/api/hermes/approvals/${encodeURIComponent(pane.approval_id)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action,
          expected_action_hash: pane.action_hash,
          confirmed_risk: isR3 ? confirmedRisk : undefined,
          reason: action === 'approve' ? 'Authorized by owner via Stage' : 'Denied by owner via Stage',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setDecision(action === 'approve' ? 'approved' : 'denied');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to submit approval decision');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3 py-1 text-xs">
      {/* Risk Badge & Tool Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-1.5">
          <span
            className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] uppercase border ${
              isR3
                ? 'bg-rose-950 text-rose-300 border-rose-600/60'
                : 'bg-amber-950 text-amber-300 border-amber-600/60'
            }`}
          >
            {pane.risk_level} Risk
          </span>
          <span className="font-mono text-rose-200 font-semibold">{pane.tool_name}</span>
        </div>
        {pane.expires_at && (
          <div className="flex items-center space-x-1 text-[10px] text-rose-400/80 font-mono">
            <Clock className="w-3 h-3" />
            <span>Expires: {new Date(pane.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        )}
      </div>

      {/* Target & Reason */}
      <div className="p-2.5 rounded-lg bg-burgundy-950/60 border border-burgundy-800/40 space-y-1">
        {pane.target && (
          <div className="text-rose-300">
            <span className="text-rose-400/70 font-mono">Target: </span>
            <span className="font-mono font-medium">{pane.target}</span>
          </div>
        )}
        <div className="text-rose-200/90 leading-relaxed">{pane.reason}</div>
      </div>

      {/* Structured Preview */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[11px] font-mono text-rose-400">
          <span>Action Parameters</span>
          <button
            onClick={handleCopy}
            className="flex items-center space-x-1 px-1.5 py-0.5 rounded hover:bg-rose-950/60 text-rose-400 hover:text-rose-200 transition-colors"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
        <pre className="p-2.5 rounded-lg bg-[#0a0105] border border-rose-900/40 font-mono text-[11px] text-rose-200 overflow-x-auto leading-relaxed max-h-36">
          <code>{previewJson}</code>
        </pre>
      </div>

      {/* R3 Strong Confirmation Checkbox */}
      {isR3 && !decision && (
        <label className="flex items-start space-x-2 p-2 rounded-lg bg-rose-950/40 border border-rose-900/50 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmedRisk}
            onChange={(e) => setConfirmedRisk(e.target.checked)}
            className="mt-0.5 rounded border-rose-700 text-rose-600 focus:ring-rose-500 bg-rose-950"
          />
          <span className="text-[11px] text-rose-200 leading-tight">
            I confirm that I understand this action performs consequential system/data modification.
          </span>
        </label>
      )}

      {/* Error message */}
      {errorMsg && (
        <div className="flex items-center space-x-1.5 p-2 rounded bg-rose-950/80 border border-rose-600/80 text-rose-200 text-[11px]">
          <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Decision Buttons or Status */}
      {decision ? (
        <div
          className={`flex items-center justify-center space-x-2 py-2 px-3 rounded-lg font-mono text-xs font-semibold ${
            decision === 'approved'
              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-600/50'
              : 'bg-rose-950/80 text-rose-300 border border-rose-600/50'
          }`}
        >
          {decision === 'approved' ? (
            <>
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Decision: Authorized (Executing...)</span>
            </>
          ) : (
            <>
              <ShieldAlert className="w-4 h-4 text-rose-400" />
              <span>Decision: Denied</span>
            </>
          )}
        </div>
      ) : (
        <div className="flex items-center space-x-2 pt-1">
          <button
            onClick={() => submitDecision('approve')}
            disabled={submitting || (isR3 && !confirmedRisk)}
            className="flex-1 py-2 px-3 rounded-lg bg-emerald-600/80 hover:bg-emerald-500 text-white font-mono font-semibold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_12px_rgba(16,185,129,0.3)]"
          >
            {submitting ? 'Submitting...' : 'Approve'}
          </button>
          <button
            onClick={() => submitDecision('deny')}
            disabled={submitting}
            className="flex-1 py-2 px-3 rounded-lg bg-rose-900/60 hover:bg-rose-800 text-rose-200 hover:text-white font-mono font-semibold text-xs transition-all border border-rose-700/50 disabled:opacity-40"
          >
            Deny
          </button>
        </div>
      )}
    </div>
  );
};
