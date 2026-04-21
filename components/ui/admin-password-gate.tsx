'use client';

import { useState, useEffect } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';

const ADMIN_PASSWORD = 'mapad2022';
const SESSION_KEY = 'ehpad_admin_unlocked';

interface AdminPasswordGateProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}

export function AdminPasswordGate({
  children,
  title = 'Zone administrateur',
  subtitle = 'Accès réservé aux administrateurs',
}: AdminPasswordGateProps) {
  const [unlocked, setUnlocked] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem(SESSION_KEY);
      if (stored === 'true') setUnlocked(true);
    }
    setMounted(true);
  }, []);

  // Don't render anything until hydrated (avoids flash of lock screen)
  if (!mounted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (unlocked) return <>{children}</>;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      sessionStorage.setItem(SESSION_KEY, 'true');
      setUnlocked(true);
      setError(false);
    } else {
      setError(true);
      setPassword('');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8 w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-6">
          <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center">
            <Lock className="h-7 w-7 text-slate-500" />
          </div>
          <div className="text-center">
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
            <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => { setPassword(e.target.value); setError(false); }}
              placeholder="Mot de passe administrateur"
              className={`w-full border rounded-lg px-3 py-2.5 pr-10 text-sm focus:outline-none focus:border-slate-400 transition-colors ${
                error ? 'border-red-400 bg-red-50 placeholder-red-300' : 'border-slate-300'
              }`}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {error && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <span>✕</span> Mot de passe incorrect
            </p>
          )}

          <button
            type="submit"
            className="w-full bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-white rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
          >
            Déverrouiller
          </button>
        </form>
      </div>
    </div>
  );
}
