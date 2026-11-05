'use client';

import React, { useState, useEffect } from 'react';
import {
  Settings,
  Sliders,
  Cpu,
  Volume2,
  ShieldAlert,
  Save,
  CheckCircle2,
  RotateCcw,
  Zap,
} from 'lucide-react';
import { SofiaSettings, defaultSettings } from '@/lib/types';

export default function SettingsPage() {
  const [settings, setSettings] = useState<SofiaSettings>(defaultSettings);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          setSettings(data);
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6 pb-14">
      {/* Header */}
      <div className="glass-panel p-6 rounded-3xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2.5">
            <Settings className="w-6 h-6 text-rose-400" />
            <h1 className="text-2xl font-bold font-mono tracking-wider text-rose-50 glow-text-burgundy">
              System Settings & Rules
            </h1>
          </div>
          <p className="text-xs font-mono text-rose-300/70">
            Personality Dials &middot; Accountability Goals &middot; Hermes AI &middot; Consequence Safety
          </p>
        </div>

        <button
          type="submit"
          disabled={isSaving}
          className="flex items-center space-x-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-rose-700 to-crimson-600 hover:from-rose-600 hover:to-crimson-500 text-white font-mono text-xs font-bold shadow-[0_0_20px_rgba(225,29,72,0.4)] transition-all"
        >
          {saveSuccess ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-300" />
              <span>Saved!</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Personality Dials (Section 2 from Spec) */}
        <div className="glass-card p-6 rounded-3xl border border-rose-500/20 space-y-5">
          <div className="flex items-center space-x-2 text-rose-100 font-mono text-sm font-bold border-b border-rose-500/15 pb-3">
            <Sliders className="w-4 h-4 text-rose-400" />
            <span>Sofia Personality Dials (1 to 10)</span>
          </div>

          <div className="space-y-4">
            {/* Strictness */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-rose-200">Strictness (Push when slipping)</span>
                <span className="text-rose-400 font-bold">{settings.personality.strictness} / 10</span>
              </div>
              <input
                type="range"
                min={1}
                max={10}
                value={settings.personality.strictness}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    personality: { ...settings.personality, strictness: Number(e.target.value) },
                  })
                }
                className="w-full accent-rose-500 bg-rose-950/60"
              />
            </div>

            {/* Warmth */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-rose-200">Warmth (Frequency of praise & check-ins)</span>
                <span className="text-rose-400 font-bold">{settings.personality.warmth} / 10</span>
              </div>
              <input
                type="range"
                min={1}
                max={10}
                value={settings.personality.warmth}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    personality: { ...settings.personality, warmth: Number(e.target.value) },
                  })
                }
                className="w-full accent-rose-500 bg-rose-950/60"
              />
            </div>

            {/* Teasing */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-rose-200">Teasing (Dry humor & light mockery)</span>
                <span className="text-rose-400 font-bold">{settings.personality.teasing} / 10</span>
              </div>
              <input
                type="range"
                min={1}
                max={10}
                value={settings.personality.teasing}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    personality: { ...settings.personality, teasing: Number(e.target.value) },
                  })
                }
                className="w-full accent-rose-500 bg-rose-950/60"
              />
            </div>

            {/* Formality */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-rose-200">Formality (Casual vs Chief of Staff)</span>
                <span className="text-rose-400 font-bold">{settings.personality.formality} / 10</span>
              </div>
              <input
                type="range"
                min={1}
                max={10}
                value={settings.personality.formality}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    personality: { ...settings.personality, formality: Number(e.target.value) },
                  })
                }
                className="w-full accent-rose-500 bg-rose-950/60"
              />
            </div>

            {/* Verbosity */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-rose-200">Verbosity (Line length; default under 80 words)</span>
                <span className="text-rose-400 font-bold">{settings.personality.verbosity} / 10</span>
              </div>
              <input
                type="range"
                min={1}
                max={10}
                value={settings.personality.verbosity}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    personality: { ...settings.personality, verbosity: Number(e.target.value) },
                  })
                }
                className="w-full accent-rose-500 bg-rose-950/60"
              />
            </div>
          </div>
        </div>

        {/* 2. Accountability Goals & Score Weights */}
        <div className="glass-card p-6 rounded-3xl border border-rose-500/20 space-y-5">
          <div className="flex items-center space-x-2 text-rose-100 font-mono text-sm font-bold border-b border-rose-500/15 pb-3">
            <Zap className="w-4 h-4 text-rose-400" />
            <span>Accountability Goals</span>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs font-mono">
            <div className="space-y-1.5">
              <label className="text-rose-300">Target Wake Time</label>
              <input
                type="time"
                value={settings.target_wake_time}
                onChange={(e) => setSettings({ ...settings, target_wake_time: e.target.value })}
                className="w-full glass-input px-3 py-2 rounded-xl text-xs font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-rose-300">Target Bedtime</label>
              <input
                type="time"
                value={settings.target_bed_time}
                onChange={(e) => setSettings({ ...settings, target_bed_time: e.target.value })}
                className="w-full glass-input px-3 py-2 rounded-xl text-xs font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-rose-300">Daily Focus Goal (Hours)</label>
              <input
                type="number"
                step="0.5"
                min={1}
                max={14}
                value={settings.daily_focus_hours}
                onChange={(e) =>
                  setSettings({ ...settings, daily_focus_hours: Number(e.target.value) })
                }
                className="w-full glass-input px-3 py-2 rounded-xl text-xs font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-rose-300">Daily Output Goal (Commits)</label>
              <input
                type="number"
                min={1}
                max={30}
                value={settings.daily_output_goal}
                onChange={(e) =>
                  setSettings({ ...settings, daily_output_goal: Number(e.target.value) })
                }
                className="w-full glass-input px-3 py-2 rounded-xl text-xs font-mono"
              />
            </div>
          </div>
        </div>

        {/* 3. Hermes AI & Computer Use Integration */}
        <div className="glass-card p-6 rounded-3xl border border-rose-500/20 space-y-5">
          <div className="flex items-center space-x-2 text-rose-100 font-mono text-sm font-bold border-b border-rose-500/15 pb-3">
            <Cpu className="w-4 h-4 text-rose-400" />
            <span>Hermes AI & Computer Use Configuration</span>
          </div>

          <div className="space-y-3 text-xs font-mono">
            <div className="space-y-1">
              <label className="text-rose-300">Hermes API Server Base URL</label>
              <input
                type="text"
                value={settings.hermes.base_url}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    hermes: { ...settings.hermes, base_url: e.target.value },
                  })
                }
                className="w-full glass-input px-3 py-2 rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-rose-300">Provider</label>
                <input
                  type="text"
                  value={settings.hermes.provider}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      hermes: { ...settings.hermes, provider: e.target.value },
                    })
                  }
                  className="w-full glass-input px-3 py-2 rounded-xl"
                />
              </div>

              <div className="space-y-1">
                <label className="text-rose-300">Model</label>
                <input
                  type="text"
                  value={settings.hermes.model}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      hermes: { ...settings.hermes, model: e.target.value },
                    })
                  }
                  className="w-full glass-input px-3 py-2 rounded-xl"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <span className="text-rose-200">Enable Background Computer Use (CUA Driver)</span>
              <input
                type="checkbox"
                checked={settings.hermes.computer_use_enabled}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    hermes: { ...settings.hermes, computer_use_enabled: e.target.checked },
                  })
                }
                className="rounded bg-rose-950 border-rose-500/40 text-rose-600 focus:ring-0"
              />
            </div>
          </div>
        </div>

        {/* 4. Consequence Ladder & Safety Limits (Section 11) */}
        <div className="glass-card p-6 rounded-3xl border border-rose-500/20 space-y-5">
          <div className="flex items-center space-x-2 text-rose-100 font-mono text-sm font-bold border-b border-rose-500/15 pb-3">
            <ShieldAlert className="w-4 h-4 text-red-400" />
            <span>Consequence Ladder & Hard Safety Limits</span>
          </div>

          <div className="space-y-3 text-xs font-mono">
            {/* Master Switch */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-rose-950/40 border border-rose-500/20">
              <div className="space-y-0.5">
                <div className="font-bold text-rose-100">Master Consequence Switch</div>
                <div className="text-[10px] text-rose-400/60 font-sans">
                  Default OFF. Auto-expires after 7 days if not renewed.
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.consequences.master_switch}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    consequences: { ...settings.consequences, master_switch: e.target.checked },
                  })
                }
                className="rounded bg-rose-950 border-rose-500/40 text-rose-600 focus:ring-0"
              />
            </div>

            {/* Dry run mode */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-rose-950/40 border border-rose-500/20">
              <div className="space-y-0.5">
                <div className="font-bold text-rose-100">Dry-Run Mode (2-Week Trial)</div>
                <div className="text-[10px] text-rose-400/60 font-sans">
                  Logs what Sofia would have triggered with device disconnected.
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.consequences.dry_run_mode}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    consequences: { ...settings.consequences, dry_run_mode: e.target.checked },
                  })
                }
                className="rounded bg-rose-950 border-rose-500/40 text-rose-600 focus:ring-0"
              />
            </div>

            {/* Ceiling and Daily Cap */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <label className="text-rose-300">Hard Intensity Ceiling (%)</label>
                <input
                  type="number"
                  min={10}
                  max={100}
                  value={settings.consequences.hard_ceiling}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      consequences: {
                        ...settings.consequences,
                        hard_ceiling: Number(e.target.value),
                      },
                    })
                  }
                  className="w-full glass-input px-3 py-2 rounded-xl"
                />
              </div>

              <div className="space-y-1">
                <label className="text-rose-300">Daily Action Cap</label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={settings.consequences.daily_cap}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      consequences: {
                        ...settings.consequences,
                        daily_cap: Number(e.target.value),
                      },
                    })
                  }
                  className="w-full glass-input px-3 py-2 rounded-xl"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
