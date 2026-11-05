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
      {/* Header with Level 1 Heading */}
      <div className="glass-panel p-6 rounded-3xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2.5">
            <Settings className="w-6 h-6 text-rose-400" aria-hidden="true" />
            <h1 className="text-2xl font-bold font-mono tracking-wider text-rose-50 glow-text-burgundy">
              System Settings & Rules
            </h1>
          </div>
          <p className="text-xs font-mono text-rose-200">
            Personality Dials &middot; Accountability Goals &middot; Hermes AI &middot; Consequence Safety
          </p>
        </div>

        <button
          type="submit"
          disabled={isSaving}
          className="flex items-center space-x-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-rose-700 to-crimson-600 hover:from-rose-600 hover:to-crimson-500 text-white font-mono text-xs font-bold shadow-[0_0_20px_rgba(225,29,72,0.4)] transition-all min-h-[44px]"
        >
          {saveSuccess ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-300" aria-hidden="true" />
              <span>Saved!</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" aria-hidden="true" />
              <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Personality Dials */}
        <section aria-labelledby="personality-heading" className="glass-card p-6 rounded-3xl border border-rose-500/25 space-y-5">
          <div className="flex items-center space-x-2 text-rose-100 font-mono text-sm font-bold border-b border-rose-500/20 pb-3">
            <Sliders className="w-4 h-4 text-rose-400" aria-hidden="true" />
            <h2 id="personality-heading">Sofia Personality Dials (1 to 10)</h2>
          </div>

          <div className="space-y-4">
            {/* Strictness */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-mono">
                <label htmlFor="setting-strictness" className="text-rose-100 font-medium">
                  Strictness (Push when slipping)
                </label>
                <span className="text-rose-300 font-bold" aria-hidden="true">
                  {settings.personality.strictness} / 10
                </span>
              </div>
              <input
                id="setting-strictness"
                name="strictness"
                type="range"
                min={1}
                max={10}
                value={settings.personality.strictness}
                aria-label="Strictness level"
                aria-valuemin={1}
                aria-valuemax={10}
                aria-valuenow={settings.personality.strictness}
                aria-valuetext={`${settings.personality.strictness} out of 10`}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    personality: { ...settings.personality, strictness: Number(e.target.value) },
                  })
                }
                className="w-full accent-rose-500 bg-rose-950/60 cursor-pointer min-h-[32px]"
              />
            </div>

            {/* Warmth */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-mono">
                <label htmlFor="setting-warmth" className="text-rose-100 font-medium">
                  Warmth (Frequency of praise & check-ins)
                </label>
                <span className="text-rose-300 font-bold" aria-hidden="true">
                  {settings.personality.warmth} / 10
                </span>
              </div>
              <input
                id="setting-warmth"
                name="warmth"
                type="range"
                min={1}
                max={10}
                value={settings.personality.warmth}
                aria-label="Warmth level"
                aria-valuemin={1}
                aria-valuemax={10}
                aria-valuenow={settings.personality.warmth}
                aria-valuetext={`${settings.personality.warmth} out of 10`}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    personality: { ...settings.personality, warmth: Number(e.target.value) },
                  })
                }
                className="w-full accent-rose-500 bg-rose-950/60 cursor-pointer min-h-[32px]"
              />
            </div>

            {/* Teasing */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-mono">
                <label htmlFor="setting-teasing" className="text-rose-100 font-medium">
                  Teasing (Dry humor & light mockery)
                </label>
                <span className="text-rose-300 font-bold" aria-hidden="true">
                  {settings.personality.teasing} / 10
                </span>
              </div>
              <input
                id="setting-teasing"
                name="teasing"
                type="range"
                min={1}
                max={10}
                value={settings.personality.teasing}
                aria-label="Teasing level"
                aria-valuemin={1}
                aria-valuemax={10}
                aria-valuenow={settings.personality.teasing}
                aria-valuetext={`${settings.personality.teasing} out of 10`}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    personality: { ...settings.personality, teasing: Number(e.target.value) },
                  })
                }
                className="w-full accent-rose-500 bg-rose-950/60 cursor-pointer min-h-[32px]"
              />
            </div>

            {/* Formality */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-mono">
                <label htmlFor="setting-formality" className="text-rose-100 font-medium">
                  Formality (Casual vs Chief of Staff)
                </label>
                <span className="text-rose-300 font-bold" aria-hidden="true">
                  {settings.personality.formality} / 10
                </span>
              </div>
              <input
                id="setting-formality"
                name="formality"
                type="range"
                min={1}
                max={10}
                value={settings.personality.formality}
                aria-label="Formality level"
                aria-valuemin={1}
                aria-valuemax={10}
                aria-valuenow={settings.personality.formality}
                aria-valuetext={`${settings.personality.formality} out of 10`}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    personality: { ...settings.personality, formality: Number(e.target.value) },
                  })
                }
                className="w-full accent-rose-500 bg-rose-950/60 cursor-pointer min-h-[32px]"
              />
            </div>

            {/* Verbosity */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-mono">
                <label htmlFor="setting-verbosity" className="text-rose-100 font-medium">
                  Verbosity (Line length; default under 80 words)
                </label>
                <span className="text-rose-300 font-bold" aria-hidden="true">
                  {settings.personality.verbosity} / 10
                </span>
              </div>
              <input
                id="setting-verbosity"
                name="verbosity"
                type="range"
                min={1}
                max={10}
                value={settings.personality.verbosity}
                aria-label="Verbosity level"
                aria-valuemin={1}
                aria-valuemax={10}
                aria-valuenow={settings.personality.verbosity}
                aria-valuetext={`${settings.personality.verbosity} out of 10`}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    personality: { ...settings.personality, verbosity: Number(e.target.value) },
                  })
                }
                className="w-full accent-rose-500 bg-rose-950/60 cursor-pointer min-h-[32px]"
              />
            </div>
          </div>
        </section>

        {/* 2. Accountability Goals & Score Weights */}
        <section aria-labelledby="goals-heading" className="glass-card p-6 rounded-3xl border border-rose-500/25 space-y-5">
          <div className="flex items-center space-x-2 text-rose-100 font-mono text-sm font-bold border-b border-rose-500/20 pb-3">
            <Zap className="w-4 h-4 text-rose-400" aria-hidden="true" />
            <h2 id="goals-heading">Accountability Goals</h2>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs font-mono">
            <div className="space-y-1.5">
              <label htmlFor="setting-wake-time" className="text-rose-200 font-medium">
                Target Wake Time
              </label>
              <input
                id="setting-wake-time"
                name="target_wake_time"
                type="time"
                value={settings.target_wake_time}
                onChange={(e) => setSettings({ ...settings, target_wake_time: e.target.value })}
                className="w-full glass-input px-3 py-2 rounded-xl text-xs font-mono min-h-[44px]"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="setting-bed-time" className="text-rose-200 font-medium">
                Target Bedtime
              </label>
              <input
                id="setting-bed-time"
                name="target_bed_time"
                type="time"
                value={settings.target_bed_time}
                onChange={(e) => setSettings({ ...settings, target_bed_time: e.target.value })}
                className="w-full glass-input px-3 py-2 rounded-xl text-xs font-mono min-h-[44px]"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="setting-focus-hours" className="text-rose-200 font-medium">
                Daily Focus Goal (Hours)
              </label>
              <input
                id="setting-focus-hours"
                name="daily_focus_hours"
                type="number"
                step="0.5"
                min={1}
                max={14}
                value={settings.daily_focus_hours}
                onChange={(e) =>
                  setSettings({ ...settings, daily_focus_hours: Number(e.target.value) })
                }
                className="w-full glass-input px-3 py-2 rounded-xl text-xs font-mono min-h-[44px]"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="setting-output-goal" className="text-rose-200 font-medium">
                Daily Output Goal (Commits)
              </label>
              <input
                id="setting-output-goal"
                name="daily_output_goal"
                type="number"
                min={1}
                max={30}
                value={settings.daily_output_goal}
                onChange={(e) =>
                  setSettings({ ...settings, daily_output_goal: Number(e.target.value) })
                }
                className="w-full glass-input px-3 py-2 rounded-xl text-xs font-mono min-h-[44px]"
              />
            </div>
          </div>
        </section>

        {/* 3. Hermes AI & Computer Use Integration */}
        <section aria-labelledby="hermes-heading" className="glass-card p-6 rounded-3xl border border-rose-500/25 space-y-5">
          <div className="flex items-center space-x-2 text-rose-100 font-mono text-sm font-bold border-b border-rose-500/20 pb-3">
            <Cpu className="w-4 h-4 text-rose-400" aria-hidden="true" />
            <h2 id="hermes-heading">Hermes AI & Computer Use Configuration</h2>
          </div>

          <div className="space-y-3 text-xs font-mono">
            <div className="space-y-1">
              <label htmlFor="setting-hermes-url" className="text-rose-200 font-medium">
                Hermes API Server Base URL
              </label>
              <input
                id="setting-hermes-url"
                name="hermes_base_url"
                type="text"
                value={settings.hermes.base_url}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    hermes: { ...settings.hermes, base_url: e.target.value },
                  })
                }
                className="w-full glass-input px-3 py-2 rounded-xl min-h-[44px]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="setting-hermes-provider" className="text-rose-200 font-medium">
                  Provider
                </label>
                <input
                  id="setting-hermes-provider"
                  name="hermes_provider"
                  type="text"
                  value={settings.hermes.provider}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      hermes: { ...settings.hermes, provider: e.target.value },
                    })
                  }
                  className="w-full glass-input px-3 py-2 rounded-xl min-h-[44px]"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="setting-hermes-model" className="text-rose-200 font-medium">
                  Model
                </label>
                <input
                  id="setting-hermes-model"
                  name="hermes_model"
                  type="text"
                  value={settings.hermes.model}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      hermes: { ...settings.hermes, model: e.target.value },
                    })
                  }
                  className="w-full glass-input px-3 py-2 rounded-xl min-h-[44px]"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <label htmlFor="setting-cua-enabled" className="text-rose-200 font-medium cursor-pointer">
                Enable Background Computer Use (CUA Driver)
              </label>
              <input
                id="setting-cua-enabled"
                name="computer_use_enabled"
                type="checkbox"
                checked={settings.hermes.computer_use_enabled}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    hermes: { ...settings.hermes, computer_use_enabled: e.target.checked },
                  })
                }
                className="w-5 h-5 rounded bg-rose-950 border-rose-500/40 text-rose-600 focus:ring-rose-500 cursor-pointer"
              />
            </div>
          </div>
        </section>

        {/* 4. Consequence Ladder & Safety Limits */}
        <section aria-labelledby="consequences-heading" className="glass-card p-6 rounded-3xl border border-rose-500/25 space-y-5">
          <div className="flex items-center space-x-2 text-rose-100 font-mono text-sm font-bold border-b border-rose-500/20 pb-3">
            <ShieldAlert className="w-4 h-4 text-red-400" aria-hidden="true" />
            <h2 id="consequences-heading">Consequence Ladder & Hard Safety Limits</h2>
          </div>

          <div className="space-y-3 text-xs font-mono">
            {/* Master Switch */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-rose-950/40 border border-rose-500/20">
              <label htmlFor="setting-master-switch" className="space-y-0.5 cursor-pointer flex-1 mr-3">
                <div className="font-bold text-rose-100">Master Consequence Switch</div>
                <div className="text-[11px] text-rose-300 font-sans">
                  Default OFF. Auto-expires after 7 days if not renewed.
                </div>
              </label>
              <input
                id="setting-master-switch"
                name="master_switch"
                type="checkbox"
                checked={settings.consequences.master_switch}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    consequences: { ...settings.consequences, master_switch: e.target.checked },
                  })
                }
                className="w-5 h-5 rounded bg-rose-950 border-rose-500/40 text-rose-600 focus:ring-rose-500 cursor-pointer"
              />
            </div>

            {/* Dry run mode */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-rose-950/40 border border-rose-500/20">
              <label htmlFor="setting-dry-run" className="space-y-0.5 cursor-pointer flex-1 mr-3">
                <div className="font-bold text-rose-100">Dry-Run Mode (2-Week Trial)</div>
                <div className="text-[11px] text-rose-300 font-sans">
                  Logs what Sofia would have triggered with device disconnected.
                </div>
              </label>
              <input
                id="setting-dry-run"
                name="dry_run_mode"
                type="checkbox"
                checked={settings.consequences.dry_run_mode}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    consequences: { ...settings.consequences, dry_run_mode: e.target.checked },
                  })
                }
                className="w-5 h-5 rounded bg-rose-950 border-rose-500/40 text-rose-600 focus:ring-rose-500 cursor-pointer"
              />
            </div>

            {/* Ceiling and Daily Cap */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="space-y-1">
                <label htmlFor="setting-hard-ceiling" className="text-rose-200 font-medium">
                  Hard Intensity Ceiling (%)
                </label>
                <input
                  id="setting-hard-ceiling"
                  name="hard_ceiling"
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
                  className="w-full glass-input px-3 py-2 rounded-xl min-h-[44px]"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="setting-daily-cap" className="text-rose-200 font-medium">
                  Daily Action Cap
                </label>
                <input
                  id="setting-daily-cap"
                  name="daily_cap"
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
                  className="w-full glass-input px-3 py-2 rounded-xl min-h-[44px]"
                />
              </div>
            </div>
          </div>
        </section>
      </div>
    </form>
  );
}
