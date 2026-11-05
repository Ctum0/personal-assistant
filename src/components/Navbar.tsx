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
    <header className="sticky top-0 z-50 w-full glass-panel border-b border-rose-500/20 backdrop-blur-2xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <Link href="/" className="flex items-center space-x-3 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-700 via-wine-600 to-rose-400 p-0.5 shadow-[0_0_15px_rgba(225,29,72,0.5)] flex items-center justify-center group-hover:scale-105 transition-all">
            <div className="w-full h-full bg-[#18030d] rounded-[10px] flex items-center justify-center">
              <span className="text-sm font-bold font-mono text-rose-300">S</span>
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
            <span className="text-[10px] font-mono text-rose-300/60 -mt-0.5 tracking-tight">
              Personal AI Companion
            </span>
          </div>
        </Link>

        {/* Navigation Items */}
        <nav className="hidden md:flex items-center space-x-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-rose-900/40 text-rose-200 border border-rose-500/40 shadow-[0_0_15px_rgba(225,29,72,0.25)]'
                    : 'text-rose-200/70 hover:text-rose-100 hover:bg-rose-950/40'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-rose-400' : 'text-rose-300/60'}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Live Status + Emergency Kill Switch */}
        <div className="flex items-center space-x-3">
          {/* Hermes & CUA Driver badge */}
          <div className="hidden lg:flex items-center space-x-2 px-3 py-1 rounded-full bg-rose-950/50 border border-rose-500/20 text-[11px] font-mono text-rose-300">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span>Hermes AI :8642</span>
            <span className="text-rose-500/40">|</span>
            <span className="text-rose-300/80">CUA Background</span>
          </div>

          {/* Kill Switch Toggle Button */}
          <button
            onClick={toggleKillSwitch}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-mono border transition-all ${
              killSwitch
                ? 'bg-red-600 text-white border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.7)] animate-pulse'
                : 'bg-rose-950/40 hover:bg-rose-900/50 text-rose-300/80 border-rose-500/30'
            }`}
            title="Emergency Safety Kill Switch: Stops all physical or audio consequences instantly"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>{killSwitch ? 'KILL SWITCH ACTIVE' : 'Kill Switch'}</span>
          </button>
        </div>
      </div>

      {/* Mobile nav bar */}
      <div className="md:hidden flex items-center justify-around py-2 border-t border-rose-500/10 px-2 overflow-x-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center p-1.5 rounded-lg text-[10px] ${
                isActive ? 'text-rose-300 font-bold' : 'text-rose-300/60'
              }`}
            >
              <Icon className="w-4 h-4 mb-0.5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </header>
  );
};
