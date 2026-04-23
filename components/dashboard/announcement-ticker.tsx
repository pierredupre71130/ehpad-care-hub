'use client';

import { useEffect, useState } from 'react';
import { Megaphone, X, ChevronLeft, ChevronRight } from 'lucide-react';

interface Announcement {
  id: string;
  message: string;
}

const STORAGE_KEY = 'dismissed_announcements';

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

export function AnnouncementTicker() {
  const [all, setAll] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setDismissed(getDismissed());
    fetch('/api/announcements')
      .then(r => r.ok ? r.json() : [])
      .then((data: Announcement[]) => setAll(data))
      .catch(() => {});
  }, []);

  const visible = all.filter(a => !dismissed.has(a.id));

  useEffect(() => {
    // Recale l'index si nécessaire
    if (index >= visible.length && visible.length > 0) {
      setIndex(visible.length - 1);
    }
  }, [visible.length, index]);

  if (visible.length === 0) return null;

  const current = visible[index] ?? visible[0];

  const dismiss = () => {
    const next = new Set([...dismissed, current.id]);
    setDismissed(next);
    saveDismissed(next);
    setIndex(0);
  };

  const prev = () => setIndex(i => (i - 1 + visible.length) % visible.length);
  const next = () => setIndex(i => (i + 1) % visible.length);

  // Durée de défilement proportionnelle à la longueur du message
  const duration = Math.max(10, Math.min(30, current.message.length * 0.18));

  return (
    <>
      <style>{`
        @keyframes ehpad-ticker {
          0%   { transform: translateX(100vw); }
          100% { transform: translateX(-100%); }
        }
        .ehpad-ticker-text {
          display: inline-block;
          animation: ehpad-ticker ${duration}s linear infinite;
          white-space: nowrap;
          padding-right: 80px;
        }
      `}</style>

      <div
        className="fixed left-0 right-0 z-[25] flex items-center gap-0 select-none"
        style={{
          bottom: 68,
          height: 34,
          background: 'linear-gradient(90deg, #78350f 0%, #b45309 40%, #92400e 100%)',
          borderTop: '1px solid rgba(251,191,36,0.4)',
          borderBottom: '1px solid rgba(0,0,0,0.2)',
        }}
      >
        {/* Icône + compteur */}
        <div className="flex items-center gap-1.5 px-3 flex-shrink-0 border-r border-amber-600/40 h-full">
          <Megaphone className="h-3.5 w-3.5 text-amber-300" />
          {visible.length > 1 && (
            <span className="text-[10px] font-bold text-amber-200/80">
              {index + 1}/{visible.length}
            </span>
          )}
        </div>

        {/* Texte défilant */}
        <div className="flex-1 overflow-hidden h-full flex items-center">
          <span className="ehpad-ticker-text text-[11px] font-medium text-amber-50">
            {current.message}
          </span>
        </div>

        {/* Navigation (si plusieurs) */}
        {visible.length > 1 && (
          <div className="flex items-center flex-shrink-0 border-l border-amber-600/40 h-full">
            <button
              onClick={prev}
              className="px-1.5 h-full text-amber-200/70 hover:text-amber-50 hover:bg-amber-700/30 transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={next}
              className="px-1.5 h-full text-amber-200/70 hover:text-amber-50 hover:bg-amber-700/30 transition-colors"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Fermer */}
        <button
          onClick={dismiss}
          title="Masquer ce message"
          className="px-2.5 h-full flex items-center text-amber-200/70 hover:text-amber-50 hover:bg-amber-700/30 transition-colors flex-shrink-0 border-l border-amber-600/40"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </>
  );
}
