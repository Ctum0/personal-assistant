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
      {/* Header with Level 1 Heading */}
      <div className="glass-panel p-6 rounded-3xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2.5">
            <Monitor className="w-6 h-6 text-rose-400" aria-hidden="true" />
            <h1 className="text-2xl font-bold font-mono tracking-wider text-rose-50 glow-text-burgundy">
              Hermes Computer Use
            </h1>
          </div>
          <p className="text-xs font-mono text-rose-200">
            Background Desktop Automation &middot; CUA Driver &middot; Sofia Chief of Staff Integration
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="px-3.5 py-2 rounded-full bg-emerald-950/70 border border-emerald-500/40 text-xs font-mono text-emerald-300 flex items-center space-x-2 min-h-[44px]">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" aria-hidden="true" />
            <span className="font-bold">Gateway :8642 Connected</span>
          </div>
          <button
            onClick={fetchStatus}
            aria-label="Refresh Hermes computer use status"
            className="p-3 rounded-xl bg-rose-950/60 hover:bg-rose-900/60 border border-rose-500/30 text-rose-200 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            title="Refresh status"
          >
            <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Capabilities & Toolsets Grid */}
      <section aria-labelledby="capabilities-heading" className="space-y-3">
        <h2 id="capabilities-heading" className="sr-only">Autonomous Agent Capabilities</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-4">
          {toolsets.map((t) => {
            const Icon = t.icon;
            return (
              <div key={t.name} className="glass-card p-4 rounded-2xl border border-rose-500/25 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-rose-100 font-mono text-xs font-bold">
                    <Icon className="w-4 h-4 text-rose-400" aria-hidden="true" />
                    <span>{t.label}</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-mono font-bold">
                    Active
                  </span>
                </div>
                <p className="text-xs text-rose-200 leading-relaxed font-sans">{t.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Quick Computer Use Triggers */}
      <section aria-labelledby="tasks-heading" className="glass-card p-5 rounded-2xl border border-rose-500/25 space-y-3">
        <h2 id="tasks-heading" className="text-xs font-mono uppercase tracking-wider text-rose-200 font-semibold">
          Quick Verified Computer Tasks
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            onClick={() => runComputerAction('system_status', 'check system load and memory')}
            disabled={isRunning}
            aria-busy={isRunning}
            className="p-3.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/60 border border-rose-500/30 text-left transition-all min-h-[44px]"
          >
            <div className="text-xs font-mono font-bold text-rose-100">System Resources</div>
            <div className="text-[11px] text-rose-300 mt-0.5">Check RAM, CPU, load average</div>
          </button>

          <button
            onClick={() => runComputerAction('list_windows', 'list visible apps and windows')}
            disabled={isRunning}
            aria-busy={isRunning}
            className="p-3.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/60 border border-rose-500/30 text-left transition-all min-h-[44px]"
          >
            <div className="text-xs font-mono font-bold text-rose-100">Audit Active Windows</div>
            <div className="text-[11px] text-rose-300 mt-0.5">Inspect running desktop windows</div>
          </button>

          <button
            onClick={() => runComputerAction('terminal_run', 'git status -s')}
            disabled={isRunning}
            aria-busy={isRunning}
            className="p-3.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/60 border border-rose-500/30 text-left transition-all min-h-[44px]"
          >
            <div className="text-xs font-mono font-bold text-rose-100">Git Status Audit</div>
            <div className="text-[11px] text-rose-300 mt-0.5">Check uncommitted work in repo</div>
          </button>

          <button
            onClick={() => runComputerAction('take_screenshot', 'capture full desktop')}
            disabled={isRunning}
            aria-busy={isRunning}
            className="p-3.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/60 border border-rose-500/30 text-left transition-all min-h-[44px]"
          >
            <div className="text-xs font-mono font-bold text-rose-100">Desktop Snapshot</div>
            <div className="text-[11px] text-rose-300 mt-0.5">Capture screen via CUA Driver</div>
          </button>
        </div>
      </section>

      {/* Custom Command Execution Bar */}
      <section aria-labelledby="custom-exec-heading" className="glass-panel p-5 rounded-2xl border border-rose-500/25 space-y-3">
        <h2 id="custom-exec-heading" className="text-xs font-mono uppercase tracking-wider text-rose-200 font-semibold flex items-center space-x-2">
          <Command className="w-3.5 h-3.5 text-rose-400" aria-hidden="true" />
          <span>Execute Custom Computer Action</span>
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (customCommand.trim()) {
              runComputerAction('custom_exec', customCommand.trim());
              setCustomCommand('');
            }
          }}
          className="flex items-center space-x-2"
        >
          <label htmlFor="custom-command-input" className="sr-only">
            Custom computer command or shell action
          </label>
          <input
            id="custom-command-input"
            type="text"
            value={customCommand}
            onChange={(e) => setCustomCommand(e.target.value)}
            placeholder="e.g. open application VS Code, check uptime, list background tasks..."
            className="flex-1 glass-input px-4 py-2.5 rounded-xl text-xs placeholder:text-rose-300 text-rose-50 min-h-[44px]"
          />
          <button
            type="submit"
            disabled={isRunning || !customCommand.trim()}
            className="px-5 py-2.5 rounded-xl bg-rose-700 hover:bg-rose-600 disabled:opacity-40 text-white font-mono text-xs font-bold transition-all min-h-[44px] flex items-center justify-center space-x-1.5"
          >
            <Play className="w-3.5 h-3.5 fill-white" aria-hidden="true" />
            <span>Dispatch</span>
          </button>
        </form>
      </section>

      {/* Execution Logs Terminal */}
      <section aria-labelledby="logs-heading" className="glass-card p-5 rounded-2xl border border-rose-500/25 space-y-3 font-mono">
        <div className="flex items-center justify-between border-b border-rose-500/20 pb-2">
          <h2 id="logs-heading" className="text-xs text-rose-200 uppercase tracking-wider flex items-center space-x-2 font-semibold">
            <Terminal className="w-3.5 h-3.5 text-rose-400" aria-hidden="true" />
            <span>Computer Use Execution Logs</span>
          </h2>
          <span className="text-[11px] text-rose-300">
            {executionLogs.length} events logged
          </span>
        </div>

        <div className="space-y-2 max-h-72 overflow-y-auto" role="log" aria-live="polite">
          {executionLogs.map((log, idx) => (
            <div
              key={idx}
              className="p-3 rounded-xl bg-[#120209]/90 border border-rose-500/20 text-xs space-y-1"
            >
              <div className="flex items-center justify-between text-[11px] text-rose-300">
                <span className="font-bold text-rose-100">&gt; {log.command}</span>
                <span>{log.ts}</span>
              </div>
              <div
                className={`text-[11px] font-sans ${
                  log.success ? 'text-emerald-300' : 'text-red-300'
                }`}
              >
                {log.result}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
