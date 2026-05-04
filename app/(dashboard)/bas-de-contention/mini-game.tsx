'use client';

import { useEffect, useState } from 'react';
import { X, Hammer } from 'lucide-react';
import { ChopDadouModal } from './chop-dadou';
import { BustADadouModal } from './bust-a-dadou';
import { PuyoDadouModal } from './puyo-dadou';
import { SnakeDadouModal } from './snake-dadou';

type GameChoice = 'chop' | 'bust' | 'puyo' | 'snake' | null;

/**
 * Modale d'accueil qui propose de choisir entre Chop-Dadou (whack-a-mole)
 * et Bust-a-Dadou (puzzle bobble). Une fois le jeu choisi, on lance la
 * modale dédiée. Un bouton "retour" permet de revenir au choix.
 */
export function MiniGameModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [chosen, setChosen] = useState<GameChoice>(null);

  useEffect(() => {
    if (!open) setChosen(null);
  }, [open]);

  if (!open) return null;

  if (chosen === 'chop') {
    return <ChopDadouModal open onClose={onClose} onBack={() => setChosen(null)} />;
  }
  if (chosen === 'bust') {
    return <BustADadouModal open onClose={onClose} onBack={() => setChosen(null)} />;
  }
  if (chosen === 'puyo') {
    return <PuyoDadouModal open onClose={onClose} onBack={() => setChosen(null)} />;
  }
  if (chosen === 'snake') {
    return <SnakeDadouModal open onClose={onClose} onBack={() => setChosen(null)} />;
  }

  // Écran de choix
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at center, #2a1208 0%, #0c0604 70%, #000 100%)' }}>

      {/* Petites étoiles ambiance */}
      <div className="absolute inset-0 pointer-events-none">
        {Array.from({ length: 40 }).map((_, i) => (
          <div key={i} className="absolute"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              width: 2 + Math.random() * 4,
              height: 2 + Math.random() * 4,
              background: '#fde68a',
              borderRadius: '50%',
              opacity: 0.3 + Math.random() * 0.5,
              boxShadow: '0 0 6px rgba(253,230,138,0.6)',
            }}
          />
        ))}
      </div>

      <div className="relative w-full max-w-xl rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] p-8"
        style={{
          background: 'linear-gradient(180deg, #fef3c7 0%, #fde68a 100%)',
          border: '8px solid #78350f',
        }}>

        <button onClick={onClose}
          className="absolute top-3 right-3 w-9 h-9 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-md flex items-center justify-center"
          title="Quitter">
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-3xl sm:text-4xl font-black text-center mb-6"
          style={{
            color: '#7c2d12',
            textShadow: '3px 3px 0 #fbbf24, 5px 5px 8px rgba(0,0,0,0.3)',
            fontFamily: '"Comic Sans MS", "Chalkboard SE", system-ui, sans-serif',
          }}>
          🎪 Choisis ton jeu 🎪
        </h2>

        <div className="grid grid-cols-2 sm:grid-cols-2 gap-4">
          <button onClick={() => setChosen('chop')}
            className="group bg-gradient-to-b from-orange-400 to-orange-600 text-white rounded-2xl p-5 border-4 border-orange-900 shadow-lg hover:scale-105 active:scale-95 transition-transform">
            <Hammer className="h-10 w-10 mx-auto mb-2" />
            <div className="text-xl font-black mb-1" style={{ textShadow: '1px 1px 0 rgba(0,0,0,0.4)' }}>
              Le Chop-Dadou
            </div>
            <div className="text-[11px] opacity-90">
              Whack-a-mole · Tape Dadou
            </div>
          </button>

          <button onClick={() => setChosen('bust')}
            className="group bg-gradient-to-b from-sky-400 to-sky-600 text-white rounded-2xl p-5 border-4 border-sky-900 shadow-lg hover:scale-105 active:scale-95 transition-transform">
            <span className="text-4xl mx-auto mb-2 block">🫧</span>
            <div className="text-xl font-black mb-1" style={{ textShadow: '1px 1px 0 rgba(0,0,0,0.4)' }}>
              Bust-a-Dadou
            </div>
            <div className="text-[11px] opacity-90">
              Puzzle Bobble · Aligne 3+
            </div>
          </button>

          <button onClick={() => setChosen('puyo')}
            className="group bg-gradient-to-b from-emerald-400 to-emerald-600 text-white rounded-2xl p-5 border-4 border-emerald-900 shadow-lg hover:scale-105 active:scale-95 transition-transform">
            <span className="text-4xl mx-auto mb-2 block">🟢</span>
            <div className="text-xl font-black mb-1" style={{ textShadow: '1px 1px 0 rgba(0,0,0,0.4)' }}>
              Puyo-Dadou
            </div>
            <div className="text-[11px] opacity-90">
              Puyo Puyo · Chaînes de 4+
            </div>
          </button>

          <button onClick={() => setChosen('snake')}
            className="group bg-gradient-to-b from-lime-400 to-lime-600 text-white rounded-2xl p-5 border-4 border-lime-900 shadow-lg hover:scale-105 active:scale-95 transition-transform">
            <span className="text-4xl mx-auto mb-2 block">🐍</span>
            <div className="text-xl font-black mb-1" style={{ textShadow: '1px 1px 0 rgba(0,0,0,0.4)' }}>
              Snake-Dadou
            </div>
            <div className="text-[11px] opacity-90">
              Mange, grandis, évite la queue
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
