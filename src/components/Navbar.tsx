'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Sparkles,
  Home,
  MessageSquare,
  Monitor,
  Clock,
  TrendingUp,
  CheckSquare,
  BookOpen,
  Settings,
  ShieldAlert,
  Radio,
  Cpu,
} from 'lucide-react';

export const Navbar: React.FC = () => {
  const pathname = usePathname();
  const [hermesOnline, setHermesOnline] = useState(true);
  const [killSwitch, setKillSwitch] = useState(false);

  // Home page is a dedicated full-bleed luxury Jarvis companion console
  if (pathname === '/') {
    return null;
  }

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          setKillSwitch(data.consequences?.kill_switch_active ?? false);
        }
      } catch {
        // silent
      }
    };
    checkStatus();
  }, []);

  const toggleKillSwitch = async () => {
    const nextVal = !killSwitch;
    setKillSwitch(nextVal);
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consequences: { kill_switch_active: nextVal },
        }),
      });
    } catch {
      // rollback
      setKillSwitch(!nextVal);
    }
  };

  const navItems = [
    { label: 'Home', href: '/', icon: Home },
    { label: 'Chat', href: '/chat', icon: MessageSquare },
    { label: 'Computer Use', href: '/computer-use', icon: Monitor },
    { label: 'Timeline', href: '/timeline', icon: Clock },
    { label: 'History', href: '/history', icon: TrendingUp },
    { label: 'Tasks', href: '/tasks', icon: CheckSquare },
    { label: 'Memory', href: '/memory', icon: BookOpen },
    { label: 'Settings', href: '/settings', icon: Settings },
  ];

  return (
    <header className="sticky top-0 z-50 w-full glass-panel border-b border-rose-500/25 backdrop-blur-2xl">
      <div className="max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        {/* Brand */}
        <Link
          href="/"
          className="flex items-center space-x-3 group rounded-xl p-1 -ml-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-700 via-wine-600 to-rose-400 p-0.5 shadow-[0_0_15px_rgba(225,29,72,0.5)] flex items-center justify-center group-hover:scale-105 transition-all">
            <div className="w-full h-full bg-[#18030d] rounded-[10px] flex items-center justify-center">
              <span className="text-sm font-bold font-mono text-rose-200">S</span>
            </div>
          </div>
          <div className="flex flex-col">
            <div className="flex items-center space-x-1.5">
              <span className="text-lg font-bold font-mono tracking-wider text-rose-50 glow-text-burgundy">
                SOFIA
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-rose-950/80 border border-rose-500/30 text-rose-300 font-mono uppercase">
                v1.0
              </span>
            </div>
            <span className="text-[10px] font-mono text-rose-300 -mt-0.5 tracking-tight">
              Personal AI Companion
            </span>
          </div>
        </Link>

        {/* Navigation Items (Desktop) */}
        <nav className="hidden md:flex items-center space-x-1" aria-label="Main Navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-rose-900/50 text-rose-100 border border-rose-400/50 shadow-[0_0_15px_rgba(225,29,72,0.3)] font-semibold'
                    : 'text-rose-200 hover:text-white hover:bg-rose-950/60'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-rose-300' : 'text-rose-300'}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Live Status + Emergency Kill Switch */}
        <div className="flex items-center space-x-3">
          {/* Hermes & CUA Driver badge */}
          <div className="hidden lg:flex items-center space-x-2 px-3 py-1.5 rounded-full bg-rose-950/60 border border-rose-500/30 text-[11px] font-mono text-rose-200">
            <span className="flex h-2 w-2 relative" aria-hidden="true">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span>Hermes AI :8642</span>
            <span className="text-rose-500/40" aria-hidden="true">|</span>
            <span className="text-rose-200">CUA Background</span>
          </div>

          {/* Kill Switch Toggle Button */}
          <button
            onClick={toggleKillSwitch}
            aria-pressed={killSwitch}
            aria-label={
              killSwitch
                ? 'Kill switch active: click to restore automated physical and audio consequences'
                : 'Emergency kill switch: click to instantly stop all physical and audio consequences'
            }
            className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-mono border transition-all min-h-[38px] ${
              killSwitch
                ? 'bg-red-600 text-white border-red-400 shadow-[0_0_18px_rgba(239,68,68,0.8)] animate-pulse font-bold'
                : 'bg-rose-950/60 hover:bg-rose-900/60 text-rose-200 border-rose-500/30'
            }`}
            title="Emergency Safety Kill Switch: Stops all physical or audio consequences instantly"
          >
            <ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{killSwitch ? 'KILL SWITCH ACTIVE' : 'Kill Switch'}</span>
          </button>
        </div>
      </div>

      {/* Mobile nav bar with accessible touch targets */}
      <nav className="md:hidden flex items-center justify-around py-1.5 border-t border-rose-500/20 px-1 overflow-x-auto" aria-label="Mobile Navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={`flex flex-col items-center justify-center p-2 rounded-xl text-[10px] min-h-[44px] min-w-[44px] transition-all ${
                isActive ? 'text-white font-bold bg-rose-900/40' : 'text-rose-300 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4 mb-0.5" aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </header>
  );
};
