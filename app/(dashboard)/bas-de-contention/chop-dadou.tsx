'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  X, Play, Trophy, Loader2, Timer, Award,
  Volume2, VolumeX, Sparkles,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────

export type Difficulty = 'debutant' | 'facile' | 'complique' | 'challenge';

interface DiffSettings {
  moleSpeed: number;   // ms entre 2 apparitions
  decoyRatio: number;  // probabilité d'un leurre
  penalty: number;     // score retiré en cas de hit leurre
  label: string;
  color: string;
  emoji: string;
}

const SETTINGS: Record<Difficulty, DiffSettings> = {
  debutant:  { moleSpeed: 1000, decoyRatio: 0.15, penalty: 1, label: 'Débutant',  color: 'from-emerald-500 to-emerald-600', emoji: '🟢' },
  facile:    { moleSpeed: 850,  decoyRatio: 0.25, penalty: 1, label: 'Facile',    color: 'from-blue-500 to-blue-600',       emoji: '🔵' },
  complique: { moleSpeed: 700,  decoyRatio: 0.40, penalty: 2, label: 'Compliqué', color: 'from-orange-500 to-orange-600',   emoji: '🟠' },
  challenge: { moleSpeed: 550,  decoyRatio: 0.55, penalty: 3, label: 'Challenge', color: 'from-red-600 to-red-700',         emoji: '🔴' },
};

const GAME_TIME = 40;
const HERO = 'dadou';
const DECOYS = ['momo', 'pierre', 'flo', 'marie'] as const;

const IMG: Record<string, string> = {
  dadou:  '/chop-dadou/dadou.png',
  momo:   '/chop-dadou/momo.png',
  pierre: '/chop-dadou/pierre.png',
  flo:    '/chop-dadou/flo.png',
  marie:  '/chop-dadou/marie.png',
};

// Échelle visuelle par personnage (pour normaliser les tailles si certaines
// sources ont plus de blanc transparent autour). Ajuste si besoin.
const CHAR_SCALE: Record<string, number> = {
  dadou:  1.55,
  momo:   1.00,
  pierre: 1.00,
  flo:    1.00,
  marie:  1.00,
};

// Décalage vertical par personnage en % de la hauteur du trou. Positif =
// vers le bas (comble un vide transparent sous le perso dans le PNG).
const CHAR_OFFSET_Y: Record<string, number> = {
  dadou:  18,
  momo:   0,
  pierre: 0,
  flo:    0,
  marie:  0,
};

// ─────────────────────────────────────────────────────────────────────────────
// Supabase
// ─────────────────────────────────────────────────────────────────────────────

interface ScoreRecord {
  id: string;
  player_name: string;
  score: number;
  difficulty: Difficulty;
  created_at: string;
}

async function fetchScores(difficulty: Difficulty): Promise<ScoreRecord[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from('chop_dadou_scores')
    .select('*')
    .eq('difficulty', difficulty)
    .order('score', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(10);
  if (error) throw new Error(error.message);
  return (data ?? []) as ScoreRecord[];
}

async function insertScore(payload: { player_name: string; score: number; difficulty: Difficulty }): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from('chop_dadou_scores').insert(payload);
  if (error) throw new Error(error.message);
}

// ─────────────────────────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────────────────────────

interface MoleState {
  visible: boolean;
  character: string;
  hitState?: 'hit' | 'miss';
}

interface FloatPoint {
  id: number;
  text: string;
  color: string;
  hole: number;
}

const EMPTY_HOLES: MoleState[] = Array.from({ length: 9 }, () => ({ visible: false, character: HERO }));

export function ChopDadouModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();

  const [phase, setPhase] = useState<'menu' | 'play' | 'over' | 'scores'>('menu');
  const [difficulty, setDifficulty] = useState<Difficulty>('debutant');
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_TIME);
  const [holes, setHoles] = useState<MoleState[]>(EMPTY_HOLES);
  const [floats, setFloats] = useState<FloatPoint[]>([]);
  const [scoresTab, setScoresTab] = useState<Difficulty>('debutant');
  const [playerName, setPlayerName] = useState('');
  const [scoreSaved, setScoreSaved] = useState(false);
  const [muted, setMuted] = useState(false);

  const moleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Audio ────────────────────────────────────────────────────────────────
  // Musique de fond (instance unique loop)
  const themeRef = useRef<HTMLAudioElement | null>(null);
  // Pool d'instances pour les SFX, pour permettre la lecture rapide successive
  // sans devoir attendre la fin d'une lecture précédente.
  const slapPoolRef = useRef<HTMLAudioElement[]>([]);
  const ouchPoolRef = useRef<HTMLAudioElement[]>([]);
  const slapIdxRef = useRef(0);
  const ouchIdxRef = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const theme = new Audio('/chop-dadou/theme.mp3');
    theme.loop = true;
    theme.volume = 0.4;
    theme.preload = 'auto';
    themeRef.current = theme;

    const makePool = (src: string, volume: number, size = 4) =>
      Array.from({ length: size }, () => {
        const a = new Audio(src);
        a.volume = volume;
        a.preload = 'auto';
        return a;
      });

    slapPoolRef.current = makePool('/chop-dadou/slap.mp3', 0.8);
    ouchPoolRef.current = makePool('/chop-dadou/ouch.mp3', 1.0);

    return () => {
      theme.pause();
      themeRef.current = null;
      slapPoolRef.current.forEach(a => a.pause());
      ouchPoolRef.current.forEach(a => a.pause());
      slapPoolRef.current = [];
      ouchPoolRef.current = [];
    };
  }, []);

  const playSfx = useCallback((kind: 'slap' | 'ouch') => {
    if (muted) return;
    const pool = kind === 'slap' ? slapPoolRef.current : ouchPoolRef.current;
    const idxRef = kind === 'slap' ? slapIdxRef : ouchIdxRef;
    if (pool.length === 0) return;
    const a = pool[idxRef.current];
    idxRef.current = (idxRef.current + 1) % pool.length;
    try {
      a.currentTime = 0;
      a.play().catch(() => {});
    } catch {/* noop */}
  }, [muted]);

  useEffect(() => {
    const t = themeRef.current;
    if (!t) return;
    t.muted = muted;
  }, [muted]);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  const stopAllTimers = useCallback(() => {
    if (moleTimerRef.current) { clearInterval(moleTimerRef.current); moleTimerRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
  }, []);

  // ── Reset à la fermeture ─────────────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      stopAllTimers();
      themeRef.current?.pause();
      setPhase('menu');
      setScore(0);
      setTimeLeft(GAME_TIME);
      setHoles(EMPTY_HOLES);
      setFloats([]);
      setPlayerName('');
      setScoreSaved(false);
    }
  }, [open, stopAllTimers]);

  // ── Démarrage ────────────────────────────────────────────────────────────
  const startGame = (d: Difficulty) => {
    setDifficulty(d);
    setScore(0);
    setTimeLeft(GAME_TIME);
    setHoles(EMPTY_HOLES);
    setFloats([]);
    setScoreSaved(false);
    setPhase('play');
    // Démarrage musique (lazy : nécessite un user gesture pour être autorisé)
    if (themeRef.current && !muted) {
      themeRef.current.currentTime = 0;
      themeRef.current.play().catch(() => {});
    }
  };

  // ── Compte à rebours ─────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'play') return;
    countdownRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          stopAllTimers();
          themeRef.current?.pause();
          setPhase('over');
          setHoles(EMPTY_HOLES);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return stopAllTimers;
  }, [phase, stopAllTimers]);

  // ── Apparition des taupes ────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'play') return;
    const settings = SETTINGS[difficulty];
    moleTimerRef.current = setInterval(() => {
      setHoles(() => {
        const newHoles: MoleState[] = Array.from({ length: 9 }, () => ({ visible: false, character: HERO }));
        const idx = Math.floor(Math.random() * 9);
        const isDecoy = Math.random() < settings.decoyRatio;
        const character = isDecoy ? DECOYS[Math.floor(Math.random() * DECOYS.length)] : HERO;
        newHoles[idx] = { visible: true, character };
        return newHoles;
      });
    }, settings.moleSpeed);
    return () => { if (moleTimerRef.current) clearInterval(moleTimerRef.current); };
  }, [phase, difficulty]);

  // ── Hit ──────────────────────────────────────────────────────────────────
  const handleHit = (idx: number) => {
    if (phase !== 'play') return;
    const hole = holes[idx];
    if (!hole.visible) return;

    const settings = SETTINGS[difficulty];
    const isHero = hole.character === HERO;
    const delta = isHero ? +1 : -settings.penalty;

    if (isHero) {
      setScore(s => s + 1);
      playSfx('slap');
    } else {
      setScore(s => Math.max(0, s + delta));
      playSfx('ouch');
    }

    // Marque la mole comme touchée pour l'anim
    setHoles(prev => prev.map((h, i) =>
      i === idx ? { ...h, hitState: isHero ? 'hit' : 'miss' } : h,
    ));
    // Texte flottant
    const floatId = Date.now() + idx;
    setFloats(prev => [...prev, {
      id: floatId,
      text: delta > 0 ? `+${delta}` : `${delta}`,
      color: isHero ? '#10b981' : '#ef4444',
      hole: idx,
    }]);
    setTimeout(() => {
      setFloats(prev => prev.filter(f => f.id !== floatId));
    }, 800);
    // Disparition rapide
    setTimeout(() => {
      setHoles(prev => prev.map((h, i) => i === idx ? { ...h, visible: false, hitState: undefined } : h));
    }, 200);
  };

  const handleClose = () => {
    stopAllTimers();
    themeRef.current?.pause();
    onClose();
  };

  // ── Sauvegarde du score ─────────────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: insertScore,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chop_dadou_scores'] });
      toast.success('Score enregistré !');
      setScoreSaved(true);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSaveScore = () => {
    const name = playerName.trim();
    if (!name) { toast.error('Entrez votre nom'); return; }
    saveMut.mutate({ player_name: name, score, difficulty });
  };

  // ── Top 10 ──────────────────────────────────────────────────────────────
  const { data: scoreboard = [], isLoading: loadingScores } = useQuery({
    queryKey: ['chop_dadou_scores', scoresTab],
    queryFn: () => fetchScores(scoresTab),
    enabled: phase === 'scores' || phase === 'over',
  });

  // ── Confetti pour le game over ──────────────────────────────────────────
  const confetti = useMemo(() => {
    return Array.from({ length: 60 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 1.5,
      duration: 2.5 + Math.random() * 2.5,
      color: ['#f59e0b', '#ef4444', '#10b981', '#3b82f6', '#a855f7', '#ec4899', '#fbbf24'][i % 7],
      rot: Math.random() * 360,
      size: 6 + Math.random() * 6,
    }));
  }, []);

  if (!open) return null;

  // ─────────────────────────────────────────────────────────────────────────
  // Rendu
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4 overflow-hidden"
      style={{
        background: 'radial-gradient(ellipse at center, #5a3416 0%, #2c1608 60%, #0f0a06 100%)',
      }}
    >
      {/* Fond carnival animé : étoiles scintillantes */}
      <CarnivalBackground />

      {/* Carte principale */}
      <div className="relative w-full max-w-3xl rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] flex flex-col max-h-[96vh] overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #fef3c7 0%, #fde68a 100%)',
          border: '8px solid #78350f',
        }}
      >
        {/* Bandeau supérieur "tente foraine" */}
        <div className="relative h-3 sm:h-4" style={{
          background: 'repeating-linear-gradient(135deg, #b91c1c 0 18px, #fef3c7 18px 36px)',
        }} />

        {/* Bouton mute + close */}
        <div className="absolute top-3 right-3 flex items-center gap-2 z-20">
          <button
            onClick={() => setMuted(m => !m)}
            className="w-9 h-9 rounded-full bg-amber-700 hover:bg-amber-800 text-white shadow-md flex items-center justify-center transition-transform active:scale-95"
            title={muted ? 'Activer le son' : 'Couper le son'}
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <button
            onClick={handleClose}
            className="w-9 h-9 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-md flex items-center justify-center transition-transform active:scale-95"
            title="Quitter"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Header titre */}
        <div className="px-6 pt-5 pb-2 text-center relative z-10">
          <h2
            className="inline-block text-3xl sm:text-5xl font-black tracking-tight"
            style={{
              color: '#7c2d12',
              textShadow: '3px 3px 0 #fbbf24, 5px 5px 0 #92400e, 7px 7px 8px rgba(0,0,0,0.3)',
              fontFamily: '"Comic Sans MS", "Chalkboard SE", system-ui, sans-serif',
              transform: 'rotate(-2deg)',
            }}
          >
            🔨 Le Chop-Dadou 🔨
          </h2>

          {phase === 'play' && (
            <div className="flex items-center justify-center gap-4 sm:gap-8 mt-3 flex-wrap">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-lg sm:text-xl">
                <Award className="h-5 w-5" />
                <span>Score :</span>
                <span className="text-2xl sm:text-3xl text-emerald-700 font-black tabular-nums">{score}</span>
              </div>
              <div className="flex items-center gap-2 text-amber-900 font-bold text-lg sm:text-xl">
                <Timer className="h-5 w-5" />
                <span className={cn(
                  'text-2xl sm:text-3xl font-black tabular-nums',
                  timeLeft <= 5 ? 'text-red-600 animate-pulse' : 'text-amber-800',
                )}>
                  {timeLeft}s
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide bg-amber-200 text-amber-900 px-2 py-1 rounded-full">
                {SETTINGS[difficulty].emoji} {SETTINGS[difficulty].label}
              </div>
            </div>
          )}
        </div>

        {/* Corps */}
        <div className="px-3 sm:px-6 pb-6 flex-1 overflow-y-auto relative z-10">

          {/* ═══ MENU ═══ */}
          {phase === 'menu' && <Menu
            difficulty={difficulty}
            setDifficulty={setDifficulty}
            onStart={() => startGame(difficulty)}
            onScores={() => { setScoresTab(difficulty); setPhase('scores'); }}
          />}

          {/* ═══ JEU ═══ */}
          {phase === 'play' && (
            <div className="flex justify-center pt-2 sm:pt-4">
              <div className="grid grid-cols-3 gap-3 sm:gap-5">
                {holes.map((hole, idx) => (
                  <Hole
                    key={idx}
                    state={hole}
                    floatPoints={floats.filter(f => f.hole === idx)}
                    onClick={() => handleHit(idx)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ═══ FIN ═══ */}
          {phase === 'over' && <GameOver
            score={score}
            difficulty={difficulty}
            scoreSaved={scoreSaved}
            playerName={playerName}
            setPlayerName={setPlayerName}
            onSave={handleSaveScore}
            saving={saveMut.isPending}
            onReplay={() => startGame(difficulty)}
            onScores={() => { setScoresTab(difficulty); setPhase('scores'); }}
            onMenu={() => setPhase('menu')}
            confetti={confetti}
          />}

          {/* ═══ SCORES ═══ */}
          {phase === 'scores' && <ScoreBoard
            scoresTab={scoresTab}
            setScoresTab={setScoresTab}
            scoreboard={scoreboard}
            loading={loadingScores}
            onBack={() => setPhase('menu')}
          />}

        </div>

        {/* Bandeau inférieur "tente foraine" */}
        <div className="relative h-3 sm:h-4" style={{
          background: 'repeating-linear-gradient(135deg, #b91c1c 0 18px, #fef3c7 18px 36px)',
        }} />
      </div>

      {/* Animations CSS globales */}
      <style>{`
        @keyframes mole-pop {
          0%   { transform: translateY(105%) scale(0.85); }
          60%  { transform: translateY(-8%)  scale(1.05); }
          80%  { transform: translateY(2%)   scale(0.97); }
          100% { transform: translateY(0)    scale(1); }
        }
        @keyframes mole-idle {
          0%, 100% { transform: translateY(0) scale(1); }
          50%      { transform: translateY(-2%) scale(1.025); }
        }
        @keyframes mole-hit {
          0%   { transform: translateY(0)   scale(1)    rotate(0deg); }
          50%  { transform: translateY(20%) scale(1.1, 0.7) rotate(8deg); }
          100% { transform: translateY(120%) scale(0.7) rotate(-12deg); opacity: 0; }
        }
        @keyframes mole-miss {
          0%   { transform: translateY(0)   scale(1)    rotate(0deg); }
          50%  { transform: translateY(-10%) scale(1.05) rotate(-6deg); }
          100% { transform: translateY(120%) scale(0.85) rotate(6deg); opacity: 0; }
        }
        @keyframes float-up {
          0%   { transform: translate(-50%, 0)    scale(0.7); opacity: 0; }
          15%  { transform: translate(-50%, -10px) scale(1.3); opacity: 1; }
          100% { transform: translate(-50%, -70px) scale(1);   opacity: 0; }
        }
        @keyframes splash-burst {
          0%   { transform: scale(0)   rotate(0deg);   opacity: 0; }
          30%  { transform: scale(1.3) rotate(35deg);  opacity: 1; }
          100% { transform: scale(1.8) rotate(70deg);  opacity: 0; }
        }
        @keyframes dadou-glow {
          0%, 100% { box-shadow: inset 0 6px 14px rgba(0,0,0,0.6), 0 4px 0 #6b3410, 0 0 24px 4px rgba(239,68,68,0.55); }
          50%      { box-shadow: inset 0 6px 14px rgba(0,0,0,0.6), 0 4px 0 #6b3410, 0 0 36px 8px rgba(239,68,68,0.95); }
        }
        @keyframes confetti-fall {
          0%   { transform: translateY(-30px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(120vh) rotate(720deg); opacity: 0.4; }
        }
        @keyframes star-twinkle {
          0%, 100% { opacity: 0.2; transform: scale(0.8); }
          50%      { opacity: 0.9; transform: scale(1.1); }
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .anim-pop      { animation: mole-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
        .anim-idle     { animation: mole-idle 1.6s ease-in-out infinite; }
        .anim-hit      { animation: mole-hit 0.4s ease-in forwards; }
        .anim-miss     { animation: mole-miss 0.4s ease-in forwards; }
        .anim-float    { animation: float-up 0.8s ease-out forwards; }
        .anim-splash   { animation: splash-burst 0.5s ease-out forwards; }
        .anim-glow     { animation: dadou-glow 1.2s ease-in-out infinite; }
        .anim-confetti { animation: confetti-fall linear forwards; }
        .anim-twinkle  { animation: star-twinkle 2.4s ease-in-out infinite; }
        .anim-fadein   { animation: fade-in 0.4s ease-out forwards; }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sous-composants
// ─────────────────────────────────────────────────────────────────────────────

function CarnivalBackground() {
  // Étoiles aléatoires scintillantes en arrière-plan
  const stars = useMemo(() => Array.from({ length: 40 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: 2 + Math.random() * 4,
    delay: Math.random() * 3,
  })), []);
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {stars.map(s => (
        <div
          key={s.id}
          className="absolute anim-twinkle"
          style={{
            left: `${s.x}%`, top: `${s.y}%`,
            width: s.size, height: s.size,
            background: '#fde68a',
            borderRadius: '50%',
            boxShadow: '0 0 8px rgba(253, 230, 138, 0.6)',
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

function Menu({
  difficulty, setDifficulty, onStart, onScores,
}: {
  difficulty: Difficulty;
  setDifficulty: (d: Difficulty) => void;
  onStart: () => void;
  onScores: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-5 py-4 anim-fadein">
      <p className="text-amber-900 text-sm sm:text-base text-center max-w-md">
        Tape sur <strong>Dadou</strong> 🥷 pour marquer ! Évite <strong>Momo, Pierre, Flo et Marie</strong> ou tu perds des points. {GAME_TIME} secondes pour battre ton record.
      </p>

      {/* Aperçu personnages */}
      <div className="flex flex-wrap justify-center gap-2 max-w-md">
        <CharPreview name="dadou"  label="Dadou"  highlight />
        <CharPreview name="momo"   label="Momo" />
        <CharPreview name="pierre" label="Pierre" />
        <CharPreview name="flo"    label="Flo" />
        <CharPreview name="marie"  label="Marie" />
      </div>

      {/* Choix difficulté */}
      <div>
        <p className="text-xs font-bold text-amber-900 uppercase tracking-widest text-center mb-2">Choisis ta difficulté</p>
        <div className="flex flex-wrap gap-2 justify-center">
          {(Object.keys(SETTINGS) as Difficulty[]).map(d => (
            <button
              key={d}
              onClick={() => setDifficulty(d)}
              className={cn(
                'px-4 py-2 rounded-2xl font-bold text-white text-sm transition-all border-2 shadow-md bg-gradient-to-b',
                SETTINGS[d].color,
                difficulty === d ? 'scale-110 ring-4 ring-amber-400/60 border-amber-900' : 'opacity-75 hover:opacity-100 border-transparent hover:scale-105',
              )}
            >
              {SETTINGS[d].emoji} {SETTINGS[d].label}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap justify-center gap-3 mt-2">
        <button
          onClick={onStart}
          className="px-8 py-3 rounded-2xl bg-gradient-to-b from-emerald-500 to-emerald-700 text-white font-black text-xl shadow-lg flex items-center gap-2 active:scale-95 hover:scale-105 transition-transform border-2 border-emerald-900"
          style={{ textShadow: '1px 1px 0 rgba(0,0,0,0.3)' }}
        >
          <Play className="h-5 w-5 fill-current" />
          DÉMARRER !
        </button>
        <button
          onClick={onScores}
          className="px-5 py-3 rounded-2xl bg-gradient-to-b from-purple-600 to-purple-800 text-white font-bold text-base shadow-lg flex items-center gap-2 active:scale-95 hover:scale-105 transition-transform border-2 border-purple-900"
        >
          <Trophy className="h-5 w-5" />
          Top 10
        </button>
      </div>
    </div>
  );
}

function CharPreview({ name, label, highlight }: { name: string; label: string; highlight?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={cn(
        'w-12 h-12 rounded-full overflow-hidden border-2',
        highlight ? 'border-red-500 ring-2 ring-red-300' : 'border-amber-700',
      )} style={{ background: 'radial-gradient(circle at center top, #3a1f0a, #1a0d04)' }}>
        <img src={IMG[name]} alt={name} className="w-full h-full object-contain" style={{ transform: `translateY(${CHAR_OFFSET_Y[name] ?? 0}%) scale(${CHAR_SCALE[name] ?? 1})`, transformOrigin: 'bottom center' }} />
      </div>
      <span className={cn(
        'text-[10px] font-bold uppercase tracking-wide',
        highlight ? 'text-red-700' : 'text-amber-900',
      )}>{label}</span>
    </div>
  );
}

function Hole({
  state, floatPoints, onClick,
}: {
  state: MoleState;
  floatPoints: FloatPoint[];
  onClick: () => void;
}) {
  const isHero = state.character === HERO;
  const scale = CHAR_SCALE[state.character] ?? 1;

  let animClass = '';
  if (state.hitState === 'hit')  animClass = 'anim-hit';
  else if (state.hitState === 'miss') animClass = 'anim-miss';
  else if (state.visible) animClass = 'anim-pop';

  return (
    <div
      onMouseDown={onClick}
      onTouchStart={(e) => { e.preventDefault(); onClick(); }}
      className={cn(
        'relative w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-amber-900 overflow-visible cursor-pointer select-none',
        state.visible && isHero && !state.hitState && 'anim-glow',
      )}
      style={{
        background: 'radial-gradient(circle at center top, #3a1f0a 0%, #1a0d04 70%)',
        boxShadow: 'inset 0 6px 14px rgba(0,0,0,0.6), 0 4px 0 #6b3410',
      }}
    >
      {/* Lèvre claire en haut du trou */}
      <div className="absolute -inset-1 rounded-full pointer-events-none" style={{
        boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.3)',
      }} />

      {/* Mole */}
      <div className="absolute inset-0 overflow-hidden rounded-full">
        {state.visible && (
          <div className={cn('absolute inset-x-0 bottom-0 will-change-transform', animClass, !state.hitState && 'anim-idle')}>
            <img
              src={IMG[state.character]}
              alt={state.character}
              className="w-full h-full object-contain pointer-events-none drop-shadow-md"
              style={{
                aspectRatio: '1 / 1',
                transform: `translateY(${CHAR_OFFSET_Y[state.character] ?? 0}%) scale(${scale})`,
                transformOrigin: 'bottom center',
              }}
            />
          </div>
        )}
      </div>

      {/* Splash burst lors du hit */}
      {state.hitState && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="anim-splash text-5xl">
            {state.hitState === 'hit' ? '💥' : '💢'}
          </div>
        </div>
      )}

      {/* Texte flottant +1 / -2 */}
      {floatPoints.map(fp => (
        <div
          key={fp.id}
          className="absolute left-1/2 top-1/2 anim-float pointer-events-none font-black text-2xl tabular-nums"
          style={{
            color: fp.color,
            textShadow: '2px 2px 0 #fff, -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff',
          }}
        >
          {fp.text}
        </div>
      ))}
    </div>
  );
}

function GameOver({
  score, difficulty, scoreSaved, playerName, setPlayerName,
  onSave, saving, onReplay, onScores, onMenu, confetti,
}: {
  score: number;
  difficulty: Difficulty;
  scoreSaved: boolean;
  playerName: string;
  setPlayerName: (s: string) => void;
  onSave: () => void;
  saving: boolean;
  onReplay: () => void;
  onScores: () => void;
  onMenu: () => void;
  confetti: { id: number; left: number; delay: number; duration: number; color: string; rot: number; size: number }[];
}) {
  return (
    <div className="relative flex flex-col items-center gap-4 py-3 anim-fadein">
      {/* Confettis */}
      <div className="absolute inset-0 -top-10 -bottom-10 pointer-events-none overflow-hidden">
        {confetti.map(c => (
          <div key={c.id}
            className="absolute anim-confetti"
            style={{
              left: `${c.left}%`,
              top: '-10px',
              width: c.size, height: c.size,
              background: c.color,
              borderRadius: c.id % 3 === 0 ? '50%' : '2px',
              transform: `rotate(${c.rot}deg)`,
              animationDelay: `${c.delay}s`,
              animationDuration: `${c.duration}s`,
            }}
          />
        ))}
      </div>

      <h3 className="text-2xl sm:text-3xl font-black text-amber-900 flex items-center gap-2 z-10">
        <Sparkles className="h-7 w-7 text-yellow-500" />
        Partie terminée !
        <Sparkles className="h-7 w-7 text-yellow-500" />
      </h3>

      <div className="bg-white rounded-3xl border-4 border-amber-700 px-8 py-5 shadow-xl text-center z-10"
        style={{ background: 'linear-gradient(180deg, #fff 0%, #fef3c7 100%)' }}>
        <p className="text-xs uppercase font-bold text-amber-700 tracking-widest">Score final</p>
        <p className="text-7xl font-black text-emerald-600 leading-none mt-1 tabular-nums" style={{
          textShadow: '2px 2px 0 #064e3b',
        }}>{score}</p>
        <p className="text-sm text-amber-700 font-semibold mt-2">{SETTINGS[difficulty].emoji} {SETTINGS[difficulty].label}</p>
      </div>

      {!scoreSaved ? (
        <div className="w-full max-w-xs flex flex-col gap-2 z-10">
          <input
            type="text"
            value={playerName}
            onChange={e => setPlayerName(e.target.value)}
            placeholder="Ton nom pour le Top 10"
            maxLength={20}
            className="w-full px-3 py-2 rounded-xl border-2 border-amber-300 bg-white text-center font-semibold focus:outline-none focus:border-amber-500"
          />
          <button
            onClick={onSave}
            disabled={saving}
            className="w-full py-2.5 rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-700 text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2 border-2 border-emerald-900"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}
            Enregistrer le score
          </button>
        </div>
      ) : (
        <p className="text-emerald-700 font-bold z-10">✓ Score enregistré !</p>
      )}

      <div className="flex flex-wrap gap-2 mt-2 justify-center z-10">
        <button onClick={onReplay} className="px-4 py-2 rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-700 text-white font-bold flex items-center gap-2 border-2 border-emerald-900 hover:scale-105 active:scale-95 transition-transform">
          <Play className="h-4 w-4" /> Rejouer
        </button>
        <button onClick={onScores} className="px-4 py-2 rounded-xl bg-gradient-to-b from-purple-600 to-purple-800 text-white font-bold flex items-center gap-2 border-2 border-purple-900 hover:scale-105 active:scale-95 transition-transform">
          <Trophy className="h-4 w-4" /> Top 10
        </button>
        <button onClick={onMenu} className="px-4 py-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold border-2 border-amber-300 hover:scale-105 active:scale-95 transition-transform">
          Menu
        </button>
      </div>
    </div>
  );
}

function ScoreBoard({
  scoresTab, setScoresTab, scoreboard, loading, onBack,
}: {
  scoresTab: Difficulty;
  setScoresTab: (d: Difficulty) => void;
  scoreboard: ScoreRecord[];
  loading: boolean;
  onBack: () => void;
}) {
  const medal = (i: number): string => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`;
  return (
    <div className="py-3 anim-fadein">
      <div className="flex flex-wrap justify-center gap-2 mb-4">
        {(Object.keys(SETTINGS) as Difficulty[]).map(d => (
          <button
            key={d}
            onClick={() => setScoresTab(d)}
            className={cn(
              'px-3 py-1.5 rounded-xl font-bold text-sm transition-colors border-2 bg-gradient-to-b',
              scoresTab === d
                ? `${SETTINGS[d].color} text-white border-amber-900 shadow-md`
                : 'from-white to-slate-100 text-slate-700 border-slate-300 hover:border-slate-400',
            )}
          >
            {SETTINGS[d].emoji} {SETTINGS[d].label}
          </button>
        ))}
      </div>
      <div className="bg-white rounded-2xl border-4 border-amber-300 overflow-hidden shadow-lg">
        <table className="w-full text-sm">
          <thead className="bg-gradient-to-b from-amber-200 to-amber-100 text-amber-900">
            <tr>
              <th className="px-3 py-2 text-left">Rang</th>
              <th className="px-3 py-2 text-left">Joueur</th>
              <th className="px-3 py-2 text-right">Score</th>
              <th className="px-3 py-2 text-right hidden sm:table-cell">Date</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={4} className="text-center py-6 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin mx-auto" />
              </td></tr>
            )}
            {!loading && scoreboard.length === 0 && (
              <tr><td colSpan={4} className="text-center py-6 text-slate-400 italic">Aucun score pour ce niveau — sois le premier !</td></tr>
            )}
            {scoreboard.map((s, i) => (
              <tr key={s.id} className={cn(
                'border-t border-slate-100',
                i === 0 && 'bg-yellow-50',
                i === 1 && 'bg-slate-50',
                i === 2 && 'bg-orange-50',
              )}>
                <td className="px-3 py-2 font-bold text-lg">{medal(i)}</td>
                <td className="px-3 py-2 font-semibold">{s.player_name}</td>
                <td className="px-3 py-2 text-right font-black text-emerald-700 text-lg tabular-nums">{s.score}</td>
                <td className="px-3 py-2 text-right text-xs text-slate-500 hidden sm:table-cell">
                  {new Date(s.created_at).toLocaleDateString('fr-FR')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-center mt-4">
        <button
          onClick={onBack}
          className="px-5 py-2 rounded-xl bg-gradient-to-b from-amber-500 to-amber-700 text-white font-bold border-2 border-amber-900 hover:scale-105 active:scale-95 transition-transform"
        >
          Retour au menu
        </button>
      </div>
    </div>
  );
}
