'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { ShieldAlert, Clock, LogOut } from 'lucide-react';

// ── Configuration ─────────────────────────────────────────────────────────────

const INACTIVITY_MS  = 30 * 60 * 1000;  // 30 min → déconnexion
const WARNING_MS     =  2 * 60 * 1000;  // avertissement 2 min avant
const WARN_AT_MS     = INACTIVITY_MS - WARNING_MS; // 28 min

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'] as const;

// ── Component ─────────────────────────────────────────────────────────────────

export function SessionGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, signOut } = useAuth();
  const [showWarning, setShowWarning]   = useState(false);
  const [countdown, setCountdown]       = useState(120); // secondes restantes
  const timeoutRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearAllTimers = useCallback(() => {
    if (timeoutRef.current)   clearTimeout(timeoutRef.current);
    if (warningRef.current)   clearTimeout(warningRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, []);

  const startCountdown = useCallback(() => {
    setCountdown(120);
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const resetTimer = useCallback(() => {
    if (!isAuthenticated) return;
    clearAllTimers();
    setShowWarning(false);

    // Planifie l'avertissement à 28 min
    warningRef.current = setTimeout(() => {
      setShowWarning(true);
      startCountdown();
      // Déconnexion forcée à 30 min
      timeoutRef.current = setTimeout(() => {
        signOut();
      }, WARNING_MS);
    }, WARN_AT_MS);
  }, [isAuthenticated, clearAllTimers, startCountdown, signOut]);

  // Démarre/arrête selon l'état d'authentification
  useEffect(() => {
    if (!isAuthenticated) {
      clearAllTimers();
      setShowWarning(false);
      return;
    }
    resetTimer();
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, resetTimer, { passive: true }));
    return () => {
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, resetTimer));
      clearAllTimers();
    };
  }, [isAuthenticated, resetTimer, clearAllTimers]);

  const handleStay = () => {
    resetTimer();
    setShowWarning(false);
  };

  const handleLogout = () => {
    clearAllTimers();
    signOut();
  };

  const formatCountdown = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}:${String(sec).padStart(2, '0')}` : `${sec}s`;
  };

  return (
    <>
      {children}

      {/* ── Modal d'avertissement ── */}
      {showWarning && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ background: 'rgba(15, 25, 50, 0.75)', backdropFilter: 'blur(6px)' }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">

            {/* Header orange */}
            <div className="px-6 py-5 flex items-center gap-4"
              style={{ background: 'linear-gradient(135deg, #c2410c, #ea580c)' }}>
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <ShieldAlert className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white leading-tight">Session inactive</h2>
                <p className="text-sm text-white/75 mt-0.5">Déconnexion automatique imminente</p>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-5">
              <p className="text-sm text-slate-600 leading-relaxed">
                Pour protéger les données médicales, votre session va être fermée automatiquement
                en raison d&apos;inactivité.
              </p>

              {/* Countdown */}
              <div className="mt-4 flex items-center justify-center gap-3 py-4 rounded-xl bg-orange-50 border border-orange-200">
                <Clock className="h-5 w-5 text-orange-500 flex-shrink-0" />
                <div className="text-center">
                  <div className="text-3xl font-bold tabular-nums text-orange-600">
                    {formatCountdown(countdown)}
                  </div>
                  <div className="text-xs text-orange-500 mt-0.5">avant déconnexion</div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="px-6 pb-5 flex gap-3">
              <button
                onClick={handleStay}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
                style={{ background: 'linear-gradient(135deg, #1a3560, #0e4a7a)' }}
              >
                Rester connecté
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Déconnecter
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
