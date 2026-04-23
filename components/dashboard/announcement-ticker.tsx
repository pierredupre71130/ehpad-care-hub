'use client';

import { useEffect, useRef, useState } from 'react';
import { Megaphone, X, ChevronLeft, ChevronRight } from 'lucide-react';

interface Announcement {
  id: string;
  message: string;
}

const STORAGE_KEY = 'dismissed_announcements';
const POLL_INTERVAL = 30_000; // 30 secondes

function getDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveDismissed(set: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch { /* ignore */ }
}

async function fetchAnnouncements(): Promise<Announcement[]> {
  try {
    const r = await fetch('/api/announcements');
    return r.ok ? r.json() : [];
  } catch {
    return [];
  }
}

export function AnnouncementTicker() {
  const [all, setAll] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [index, setIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Chargement initial + polling toutes les 30s
  useEffect(() => {
    setDismissed(getDismissed());

    fetchAnnouncements().then(setAll);

    intervalRef.current = setInterval(() => {
      fetchAnnouncements().then(setAll);
    }, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const visible = all.filter(a => !dismissed.has(a.id));

  // Recale l'index si nécessaire
  useEffect(() => {
    if (index >= visible.length && visible.length > 0) {
      setIndex(visible.length - 1);
    }
  }, [visible.length, index]);

  if (visible.length === 0) return null;

  const current = visible[index] ?? visible[0];

  // Vitesse fixe : ~70px/s — durée proportionnelle à la longueur
  // distance ≈ 100vw + longueur texte (estimée à ~9px/char)
  // On utilise une fenêtre "large" de 1400px + texte
  const estimatedTextPx = current.message.length * 9;
  const totalPx = 1400 + estimatedTextPx;
  const duration = Math.round(totalPx / 70); // secondes

  const dismiss = () => {
    const next = new Set([...dismissed, current.id]);
    setDismissed(next);
    saveDismissed(next);
    setIndex(0);
  };

  const prev = () => setIndex(i => (i - 1 + visible.length) % visible.length);
  const next = () => setIndex(i => (i + 1) % visible.length);

  return (
    <>
      <style>{`
        @keyframes ehpad-ticker {
          0%   { transform: translateX(100vw); }
          100% { transform: translateX(-${estimatedTextPx + 100}px); }
        }
        .ehpad-ticker-text {
          display: inline-block;
          animation: ehpad-ticker ${duration}s linear infinite;
          white-space: nowrap;
          padding-right: 120px;
        }
      `}</style>

      <div
        className="fixed left-0 right-0 z-[25] flex items-center gap-0 select-none"
        style={{
          bottom: 68,
          height: 40,
          background: '#111827',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          borderBottom: '1px solid rgba(0,0,0,0.4)',
        }}
      >
        {/* Icône + compteur */}
        <div className="flex items-center gap-2 px-3 flex-shrink-0 border-r border-white/10 h-full">
          <Megaphone className="h-4 w-4 text-white/70" />
          {visible.length > 1 && (
            <span className="text-[11px] font-bold text-white/50">
              {index + 1}/{visible.length}
            </span>
          )}
        </div>

        {/* Texte défilant */}
        <div className="flex-1 overflow-hidden h-full flex items-center">
          <span className="ehpad-ticker-text text-[14px] font-semibold text-white tracking-wide">
            {current.message}
          </span>
        </div>

        {/* Navigation (si plusieurs) */}
        {visible.length > 1 && (
          <div className="flex items-center flex-shrink-0 border-l border-white/10 h-full">
            <button
              onClick={prev}
              className="px-2 h-full text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={next}
              className="px-2 h-full text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Fermer */}
        <button
          onClick={dismiss}
          title="Masquer ce message"
          className="px-3 h-full flex items-center text-white/40 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0 border-l border-white/10"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </>
  );
}
