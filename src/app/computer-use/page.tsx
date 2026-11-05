'use client';

import React, { useState, useEffect } from 'react';
import {
  Monitor,
  Cpu,
  Terminal,
  Globe,
  FileCode,
  ShieldCheck,
  Play,
  RotateCw,
  CheckCircle2,
  AlertCircle,
  Eye,
  Command,
} from 'lucide-react';

export default function ComputerUsePage() {
  const [hermesStatus, setHermesStatus] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [customCommand, setCustomCommand] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [executionLogs, setExecutionLogs] = useState<Array<{ ts: string; command: string; result: string; success: boolean }>>([
    {
      ts: 'Initial',
      command: 'hermes computer-use status',
      result: 'cua-driver: installed at ~/.hermes/tools/cua-driver-0.21.0-linux-x64/cua-driver (0.21.0) - Background mode ready.',
      success: true,
    },
  ]);

  const fetchStatus = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/computer-use');
      if (res.ok) {
        const data = await res.json();
        setHermesStatus(data);
      }
    } catch (err) {
      console.error('Error fetching Hermes status:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const runComputerAction = async (action: string, param?: string) => {
    setIsRunning(true);
    const cmdLabel = param ? `${action}: ${param}` : action;
    try {
      const res = await fetch('/api/computer-use', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, param }),
      });

      const data = await res.json();
      setExecutionLogs((prev) => [
        {
          ts: new Date().toLocaleTimeString(),
          command: cmdLabel,
          result: data.result || 'Executed successfully',
          success: data.success,
        },
        ...prev,
      ]);
    } catch (err) {
      setExecutionLogs((prev) => [
        {
          ts: new Date().toLocaleTimeString(),
          command: cmdLabel,
          result: `Failed: ${err instanceof Error ? err.message : String(err)}`,
          success: false,
        },
        ...prev,
      ]);
    } finally {
      setIsRunning(false);
    }
  };

  const toolsets = [
    { name: 'computer_use', label: 'CUA Driver (0.21.0)', desc: 'Background desktop control without cursor warp or focus steal', icon: Monitor, ready: true },
    { name: 'terminal', label: 'Terminal & Processes', desc: 'Execute system commands and background processes', icon: Terminal, ready: true },
    { name: 'browser', label: 'Browser Automation', desc: 'Headless / headed Chromium navigation, click, type & snapshot', icon: Globe, ready: true },
    { name: 'file', label: 'File Operations', desc: 'Read, write, patch and search project workspaces', icon: FileCode, ready: true },
    { name: 'web', label: 'Web Search & Extraction', desc: 'Online search and live page extraction', icon: Globe, ready: true },
    { name: 'skills', label: 'Autonomous Skills Hub', desc: 'Load and invoke specialized modular agent skills', icon: Cpu, ready: true },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="glass-panel p-6 rounded-3xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2.5">
            <Monitor className="w-6 h-6 text-rose-400" />
            <h1 className="text-2xl font-bold font-mono tracking-wider text-rose-50 glow-text-burgundy">
              Hermes Computer Use
            </h1>
          </div>
          <p className="text-xs font-mono text-rose-300/70">
            Background Desktop Automation &middot; CUA Driver &middot; Sofia Chief of Staff Integration
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="px-3.5 py-1.5 rounded-full bg-emerald-950/60 border border-emerald-500/40 text-xs font-mono text-emerald-300 flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>Gateway :8642 Connected</span>
          </div>
          <button
            onClick={fetchStatus}
            className="p-2 rounded-xl bg-rose-950/50 hover:bg-rose-900/60 border border-rose-500/30 text-rose-300 transition-colors"
            title="Refresh status"
          >
            <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Capabilities & Toolsets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {toolsets.map((t) => {
          const Icon = t.icon;
          return (
            <div key={t.name} className="glass-card p-4 rounded-2xl border border-rose-500/20 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-rose-200 font-mono text-xs font-bold">
                  <Icon className="w-4 h-4 text-rose-400" />
                  <span>{t.label}</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-mono">
                  Active
                </span>
              </div>
              <p className="text-[11px] text-rose-300/70 leading-relaxed font-sans">{t.desc}</p>
            </div>
          );
        })}
      </div>

      {/* Quick Computer Use Triggers */}
      <div className="glass-card p-5 rounded-2xl border border-rose-500/20 space-y-3">
        <h3 className="text-xs font-mono uppercase tracking-wider text-rose-200">
          Quick Verified Computer Tasks
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            onClick={() => runComputerAction('system_status', 'check system load and memory')}
            disabled={isRunning}
            className="p-3 rounded-xl bg-rose-950/50 hover:bg-rose-900/60 border border-rose-500/30 text-left transition-all"
          >
            <div className="text-xs font-mono font-bold text-rose-100">System Resources</div>
            <div className="text-[10px] text-rose-300/60 mt-0.5">Check RAM, CPU, load average</div>
          </button>

          <button
            onClick={() => runComputerAction('list_windows', 'list visible apps and windows')}
            disabled={isRunning}
            className="p-3 rounded-xl bg-rose-950/50 hover:bg-rose-900/60 border border-rose-500/30 text-left transition-all"
          >
            <div className="text-xs font-mono font-bold text-rose-100">Audit Active Windows</div>
            <div className="text-[10px] text-rose-300/60 mt-0.5">Inspect running desktop windows</div>
          </button>

          <button
            onClick={() => runComputerAction('terminal_run', 'git status -s')}
            disabled={isRunning}
            className="p-3 rounded-xl bg-rose-950/50 hover:bg-rose-900/60 border border-rose-500/30 text-left transition-all"
          >
            <div className="text-xs font-mono font-bold text-rose-100">Git Status Audit</div>
            <div className="text-[10px] text-rose-300/60 mt-0.5">Check uncommitted work in repo</div>
          </button>

          <button
            onClick={() => runComputerAction('terminal_run', 'curl -s http://127.0.0.1:8642/v1/capabilities')}
            disabled={isRunning}
            className="p-3 rounded-xl bg-rose-950/50 hover:bg-rose-900/60 border border-rose-500/30 text-left transition-all"
          >
            <div className="text-xs font-mono font-bold text-rose-100">Probe Hermes API</div>
            <div className="text-[10px] text-rose-300/60 mt-0.5">Verify tool catalog endpoints</div>
          </button>
        </div>
      </div>

      {/* Custom Command Execution Input */}
      <div className="glass-card p-5 rounded-2xl border border-rose-500/20 space-y-3">
        <h3 className="text-xs font-mono uppercase tracking-wider text-rose-200">
          Run Custom Hermes Computer Task
        </h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (customCommand.trim()) {
              runComputerAction('terminal_run', customCommand);
              setCustomCommand('');
            }
          }}
          className="flex items-center space-x-2"
        >
          <input
            type="text"
            value={customCommand}
            onChange={(e) => setCustomCommand(e.target.value)}
            placeholder="e.g. Audit running node services and verify gateway health..."
            className="flex-1 glass-input px-4 py-2.5 rounded-xl text-xs font-mono placeholder:text-rose-400/40 text-rose-50"
          />
          <button
            type="submit"
            disabled={isRunning || !customCommand.trim()}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-700 to-crimson-600 hover:from-rose-600 hover:to-crimson-500 disabled:opacity-40 text-white font-mono text-xs font-bold transition-all shadow-[0_0_15px_rgba(225,29,72,0.3)] flex items-center space-x-2"
          >
            <Play className={`w-3.5 h-3.5 ${isRunning ? 'animate-spin' : ''}`} />
            <span>Execute</span>
          </button>
        </form>
      </div>

      {/* Execution Console Logs */}
      <div className="glass-panel p-5 rounded-2xl border border-rose-500/20 space-y-3 font-mono">
        <div className="flex items-center justify-between text-xs text-rose-300/80 border-b border-rose-500/15 pb-2">
          <div className="flex items-center space-x-2">
            <Command className="w-4 h-4 text-rose-400" />
            <span>Computer Use Console</span>
          </div>
          <span className="text-[10px] text-rose-400/50">Background Daemon Logs</span>
        </div>

        <div className="space-y-3 max-h-96 overflow-y-auto pt-1">
          {executionLogs.map((log, idx) => (
            <div key={idx} className="p-3 rounded-xl bg-[#0d0107]/90 border border-rose-500/15 space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-rose-400/70 text-[10px]">
                <span className="text-rose-300 font-bold">&gt; {log.command}</span>
                <span>{log.ts}</span>
              </div>
              <pre className="text-rose-100 whitespace-pre-wrap font-mono text-[11px] leading-relaxed overflow-x-auto">
                {log.result}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
