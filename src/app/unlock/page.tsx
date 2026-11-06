'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { SofiaAvatar } from '@/components/SofiaAvatar';
import { KeyRound, ArrowRight, ShieldCheck, AlertCircle } from 'lucide-react';

export default function UnlockPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Automatic check: if dev mode / unconfigured, redirect straight to /
  useEffect(() => {
    fetch('/api/auth')
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated || data.devMode) {
          router.replace('/');
        }
      })
      .catch(() => {});
  }, [router]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim() || isSubmitting) return;

    setError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      });

      if (res.ok) {
        const trimmed = token.trim();
        document.cookie = `sofia_token=${encodeURIComponent(trimmed)}; path=/; max-age=2592000; SameSite=Lax`;
        try {
          localStorage.setItem('sofia_token', trimmed);
          localStorage.setItem('sofia_api_token', trimmed);
        } catch {}
        window.location.href = '/';
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Invalid authentication token');
      }
    } catch {
      setError('Connection failure. Please retry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#080205] text-rose-50 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-radial from-rose-950/30 via-burgundy-950/20 to-transparent blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-sm w-full flex flex-col items-center text-center space-y-6">
        {/* Sofia Avatar Silhouette */}
        <div className="relative">
          <SofiaAvatar expression="focused" size="lg" />
          <div className="w-48 h-[1px] mx-auto mt-2 bg-gradient-to-r from-transparent via-rose-500/60 to-transparent shadow-[0_0_10px_rgba(225,29,72,0.5)]" />
        </div>

        {/* Title */}
        <div className="space-y-1">
          <h1 className="text-xl font-bold font-mono tracking-wider text-rose-50 glow-text-burgundy">
            SOFIA
          </h1>
          <p className="text-xs font-mono text-rose-300/80">
            Private Companion Terminal · Authentication Required
          </p>
        </div>

        {/* Unlock Form */}
        <form
          onSubmit={handleUnlock}
          className="w-full glass-panel border border-burgundy-700/50 rounded-2xl p-5 space-y-4 shadow-2xl backdrop-blur-xl"
        >
          <div className="relative flex items-center">
            <KeyRound className="w-4 h-4 text-rose-400 absolute left-3.5 pointer-events-none" />
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Enter SOFIA_AUTH_TOKEN"
              className="w-full bg-[#110209]/80 border border-burgundy-800/40 rounded-xl pl-10 pr-4 py-2.5 text-sm font-mono text-rose-100 placeholder:text-rose-400/40 focus:outline-none focus:ring-1 focus:ring-rose-500 min-h-[44px]"
              autoFocus
            />
          </div>

          {error && (
            <div className="flex items-center space-x-2 text-xs font-mono text-rose-300 bg-rose-950/60 border border-rose-600/40 px-3 py-2 rounded-xl">
              <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !token.trim()}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-rose-700 via-burgundy-600 to-crimson-600 hover:from-rose-600 hover:to-crimson-500 disabled:opacity-40 text-white font-medium text-sm font-mono transition-all shadow-[0_0_20px_rgba(225,29,72,0.4)] flex items-center justify-center space-x-2 min-h-[44px]"
          >
            <span>{isSubmitting ? 'Verifying...' : 'Unlock Sofia'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="flex items-center space-x-1.5 text-[10px] font-mono text-rose-400/60">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400/70" />
          <span>Single-user encrypted session</span>
        </div>
      </div>
    </div>
  );
}
