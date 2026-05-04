'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  X, Play, Trophy, Loader2, Volume2, VolumeX, ArrowLeft, Award, Sparkles,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────────────────────

const GRID_W = 20;
const GRID_H = 20;
const CELL = 24;
const BOARD_W = GRID_W * CELL;
const BOARD_H = GRID_H * CELL;
const INITIAL_SPEED_MS = 160;
const SPEED_STEP_MS = 4;       // accélération à chaque aliment mangé
const MIN_SPEED_MS = 60;
const SCORE_PER_FOOD = 10;
const SCORE_PER_SEC = 1;

const COLORS = ['dadou', 'momo', 'pierre', 'flo', 'marie'] as const;
type Color = typeof COLORS[number];
const FOOD_COLORS: Color[] = ['momo', 'pierre', 'flo', 'marie'];
const HEAD_COLOR: Color = 'dadou';

const IMG: Record<Color, string> = {
  dadou:  '/chop-dadou/dadou.png',
  momo:   '/chop-dadou/momo.png',
  pierre: '/chop-dadou/pierre.png',
  flo:    '/chop-dadou/flo.png',
  marie:  '/chop-dadou/marie.png',
};

type Dir = 'up' | 'down' | 'left' | 'right';
const DIR_VEC: Record<Dir, { dx: number; dy: number }> = {
  up:    { dx: 0,  dy: -1 },
  down:  { dx: 0,  dy: +1 },
  left:  { dx: -1, dy: 0  },
  right: { dx: +1, dy: 0  },
};
const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

interface Segment { x: number; y: number; color: Color; }
interface Food    { x: number; y: number; color: Color; }

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function randPos(snake: Segment[]): { x: number; y: number } {
  const occupied = new Set(snake.map(s => `${s.x}-${s.y}`));
  while (true) {
    const x = Math.floor(Math.random() * GRID_W);
    const y = Math.floor(Math.random() * GRID_H);
    if (!occupied.has(`${x}-${y}`)) return { x, y };
  }
}

function randFood(snake: Segment[]): Food {
  const p = randPos(snake);
  return { ...p, color: FOOD_COLORS[Math.floor(Math.random() * FOOD_COLORS.length)] };
}

function initialSnake(): Segment[] {
  const cx = Math.floor(GRID_W / 2);
  const cy = Math.floor(GRID_H / 2);
  return [
    { x: cx,     y: cy, color: HEAD_COLOR },
    { x: cx - 1, y: cy, color: HEAD_COLOR },
    { x: cx - 2, y: cy, color: HEAD_COLOR },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPABASE
// ─────────────────────────────────────────────────────────────────────────────

interface ScoreRecord {
  id: string;
  player_name: string;
  score: number;
  food_count: number;
  time_survived: number;
  created_at: string;
}

async function fetchScores(): Promise<ScoreRecord[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from('snake_dadou_scores')
    .select('*')
    .order('score', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(10);
  if (error) throw new Error(error.message);
  return (data ?? []) as ScoreRecord[];
}

async function insertScore(payload: {
  player_name: string; score: number; food_count: number; time_survived: number;
}): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from('snake_dadou_scores').insert(payload);
  if (error) throw new Error(error.message);
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSANT
// ─────────────────────────────────────────────────────────────────────────────

export function SnakeDadouModal({ open, onClose, onBack }: { open: boolean; onClose: () => void; onBack?: () => void }) {
  const qc = useQueryClient();

  const [phase, setPhase] = useState<'menu' | 'play' | 'over' | 'scores'>('menu');
  const [snake, setSnake] = useState<Segment[]>(() => initialSnake());
  const [food, setFood] = useState<Food>(() => ({ x: 5, y: 5, color: 'momo' }));
  const [direction, setDirection] = useState<Dir>('right');
  const [pendingDir, setPendingDir] = useState<Dir>('right');
  const [speed, setSpeed] = useState(INITIAL_SPEED_MS);
  const [score, setScore] = useState(0);
  const [foodCount, setFoodCount] = useState(0);
  const [secondsAlive, setSecondsAlive] = useState(0);
  const [muted, setMuted] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [scoreSaved, setScoreSaved] = useState(false);

  const snakeRef = useRef(snake); useEffect(() => { snakeRef.current = snake; }, [snake]);
  const foodRef = useRef(food); useEffect(() => { foodRef.current = food; }, [food]);
  const directionRef = useRef(direction); useEffect(() => { directionRef.current = direction; }, [direction]);
  const pendingDirRef = useRef(pendingDir); useEffect(() => { pendingDirRef.current = pendingDir; }, [pendingDir]);
  const phaseRef = useRef(phase); useEffect(() => { phaseRef.current = phase; }, [phase]);

  // ── Audio ────────────────────────────────────────────────────────────────
  const themeRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const popBufRef = useRef<AudioBuffer | null>(null);
  const gameOverBufRef = useRef<AudioBuffer | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const theme = new Audio('/chop-dadou/snake-theme.mp3');
    theme.loop = true;
    theme.volume = 0.4;
    theme.preload = 'auto';
    themeRef.current = theme;

    const Ctx: typeof AudioContext | undefined =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    audioCtxRef.current = ctx;

    const loadBuffer = async (url: string) => {
      try {
        const res = await fetch(url);
        const buf = await res.arrayBuffer();
        return await ctx.decodeAudioData(buf);
      } catch { return null; }
    };

    loadBuffer('/chop-dadou/pop.mp3').then(b => { popBufRef.current = b; });
    loadBuffer('/chop-dadou/game-over.mp3').then(b => { gameOverBufRef.current = b; });

    return () => {
      theme.pause();
      themeRef.current = null;
      ctx.close().catch(() => {});
      audioCtxRef.current = null;
    };
  }, []);

  const playSfx = useCallback((kind: 'pop' | 'gameover') => {
    if (muted) return;
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const buf = kind === 'pop' ? popBufRef.current : gameOverBufRef.current;
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = 0.9;
    src.connect(gain); gain.connect(ctx.destination);
    src.start(0);
  }, [muted]);

  useEffect(() => {
    if (themeRef.current) themeRef.current.muted = muted;
  }, [muted]);

  // ── Reset à la fermeture ────────────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      themeRef.current?.pause();
      setPhase('menu');
      setSnake(initialSnake());
      setDirection('right');
      setPendingDir('right');
      setSpeed(INITIAL_SPEED_MS);
      setScore(0);
      setFoodCount(0);
      setSecondsAlive(0);
      setPlayerName('');
      setScoreSaved(false);
    }
  }, [open]);

  // ── Démarrage ────────────────────────────────────────────────────────────
  const startGame = () => {
    const s = initialSnake();
    setSnake(s);
    setFood(randFood(s));
    setDirection('right');
    setPendingDir('right');
    setSpeed(INITIAL_SPEED_MS);
    setScore(0);
    setFoodCount(0);
    setSecondsAlive(0);
    setScoreSaved(false);
    setPhase('play');
    if (themeRef.current && !muted) {
      themeRef.current.currentTime = 0;
      themeRef.current.play().catch(() => {});
    }
  };

  // ── Boucle de jeu ────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'play') return;
    const t = setInterval(() => {
      const dir = pendingDirRef.current;
      // Empêche le demi-tour instantané
      const cur = directionRef.current;
      const nextDir = OPPOSITE[cur] === dir ? cur : dir;
      if (nextDir !== cur) directionRef.current = nextDir;
      setDirection(nextDir);

      const { dx, dy } = DIR_VEC[nextDir];
      const head = snakeRef.current[0];
      const newHead = { x: head.x + dx, y: head.y + dy };

      // Collision murs
      if (newHead.x < 0 || newHead.x >= GRID_W || newHead.y < 0 || newHead.y >= GRID_H) {
        themeRef.current?.pause();
        playSfx('gameover');
        setPhase('over');
        return;
      }

      // Collision corps
      const body = snakeRef.current;
      // On exclut la dernière case (la queue va se libérer si pas d'eat)
      const willEat = newHead.x === foodRef.current.x && newHead.y === foodRef.current.y;
      const collisionLimit = willEat ? body.length : body.length - 1;
      for (let i = 0; i < collisionLimit; i++) {
        if (body[i].x === newHead.x && body[i].y === newHead.y) {
          themeRef.current?.pause();
          playSfx('gameover');
          setPhase('over');
          return;
        }
      }

      // Construit le nouveau serpent (modèle unshift + pop)
      // Chaque entité conserve sa position et sa couleur ; on ajoute une
      // nouvelle tête au début et on retire la queue (sauf si on mange).
      let next: Segment[];
      if (willEat) {
        // Croissance : on garde la queue. L'ancienne tête prend la couleur
        // de l'aliment qui vient d'être avalé (couleur juste derrière la
        // nouvelle tête, qui voyagera vers la queue au fil des déplacements).
        next = [
          { x: newHead.x, y: newHead.y, color: HEAD_COLOR },
          { x: body[0].x, y: body[0].y, color: foodRef.current.color },
          ...body.slice(1).map(s => ({ ...s })),
        ];
        playSfx('pop');
        setScore(s => s + SCORE_PER_FOOD);
        setFoodCount(c => c + 1);
        setSpeed(s => Math.max(MIN_SPEED_MS, s - SPEED_STEP_MS));
        setFood(randFood(next));
      } else {
        next = [
          { x: newHead.x, y: newHead.y, color: HEAD_COLOR },
          ...body.slice(0, -1).map(s => ({ ...s })),
        ];
      }

      setSnake(next);
    }, speed);
    return () => clearInterval(t);
  }, [phase, speed, playSfx]);

  // ── Chrono : score temps + secondes ─────────────────────────────────────
  useEffect(() => {
    if (phase !== 'play') return;
    const t = setInterval(() => {
      setSecondsAlive(s => s + 1);
      setScore(s => s + SCORE_PER_SEC);
    }, 1000);
    return () => clearInterval(t);
  }, [phase]);

  // ── Contrôles clavier ───────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'play') return;
    const onDown = (e: KeyboardEvent) => {
      let d: Dir | null = null;
      if (e.key === 'ArrowUp')         d = 'up';
      else if (e.key === 'ArrowDown')  d = 'down';
      else if (e.key === 'ArrowLeft')  d = 'left';
      else if (e.key === 'ArrowRight') d = 'right';
      if (d) {
        e.preventDefault();
        if (OPPOSITE[directionRef.current] !== d) setPendingDir(d);
      }
    };
    window.addEventListener('keydown', onDown);
    return () => window.removeEventListener('keydown', onDown);
  }, [phase]);

  const setDirIfValid = (d: Dir) => {
    if (OPPOSITE[directionRef.current] !== d) setPendingDir(d);
  };

  // ── Sauvegarde ───────────────────────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: insertScore,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['snake_dadou_scores'] });
      toast.success('Score enregistré !');
      setScoreSaved(true);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSaveScore = () => {
    const name = playerName.trim();
    if (!name) { toast.error('Entrez votre nom'); return; }
    saveMut.mutate({ player_name: name, score, food_count: foodCount, time_survived: secondsAlive });
  };

  const { data: scoreboard = [], isLoading: loadingScores } = useQuery({
    queryKey: ['snake_dadou_scores'],
    queryFn: fetchScores,
    enabled: phase === 'scores' || phase === 'over',
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4 overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at center, #1a3d12 0%, #0c1f08 70%, #000 100%)' }}>

      <div className="relative w-full max-w-2xl rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.7)] flex flex-col max-h-[96vh] overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #14532d 0%, #052e16 100%)',
          border: '6px solid #84cc16',
        }}>
        <div className="h-3" style={{ background: 'repeating-linear-gradient(135deg, #84cc16 0 18px, #65a30d 18px 36px)' }} />

        <div className="absolute top-3 right-3 flex items-center gap-2 z-30">
          <button onClick={() => setMuted(m => !m)}
            className="w-9 h-9 rounded-full bg-lime-700 hover:bg-lime-800 text-white shadow-md flex items-center justify-center"
            title={muted ? 'Activer le son' : 'Couper le son'}>
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          {onBack && (
            <button onClick={() => { themeRef.current?.pause(); onBack(); }}
              className="w-9 h-9 rounded-full bg-amber-600 hover:bg-amber-700 text-white shadow-md flex items-center justify-center"
              title="Retour menu">
              <ArrowLeft className="h-4 w-4" />
            </button>
          )}
          <button onClick={() => { themeRef.current?.pause(); onClose(); }}
            className="w-9 h-9 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-md flex items-center justify-center"
            title="Quitter">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 pt-4 pb-2 text-center">
          <h2 className="inline-block text-2xl sm:text-4xl font-black tracking-tight"
            style={{
              color: '#ecfccb',
              textShadow: '2px 2px 0 #4d7c0f, 4px 4px 8px rgba(0,0,0,0.5)',
              fontFamily: '"Comic Sans MS", "Chalkboard SE", system-ui, sans-serif',
            }}>
            🐍 Snake-Dadou 🐍
          </h2>
          {phase === 'play' && (
            <div className="flex items-center justify-center gap-4 mt-2 flex-wrap">
              <div className="flex items-center gap-2 text-lime-100 font-bold text-lg">
                <Award className="h-5 w-5" />
                <span className="text-2xl text-yellow-300 tabular-nums" style={{ minWidth: '4ch', display: 'inline-block', textAlign: 'right' }}>{score}</span>
              </div>
              <div className="text-lime-200 font-semibold text-sm">🍴 {foodCount}</div>
              <div className="text-lime-200 font-semibold text-sm">⏱ {secondsAlive}s</div>
            </div>
          )}
        </div>

        <div className="px-3 sm:px-6 pb-4 flex-1 overflow-y-auto">

          {phase === 'menu' && (
            <div className="flex flex-col items-center gap-4 py-4 text-center anim-fadein">
              <p className="text-lime-100 text-sm sm:text-base max-w-md">
                Dadou serpent grandit en mangeant les autres têtes. Évite les murs et ta propre queue.
                Plus tu manges, plus tu vas vite. Score = aliments × 10 + 1 par seconde de survie.
              </p>
              <div className="flex gap-3 mt-2">
                <button onClick={startGame}
                  className="px-6 py-3 rounded-2xl bg-gradient-to-b from-lime-400 to-lime-600 text-white font-black text-lg shadow-lg flex items-center gap-2 active:scale-95 hover:scale-105 transition-transform border-2 border-lime-900">
                  <Play className="h-5 w-5 fill-current" /> JOUER
                </button>
                <button onClick={() => setPhase('scores')}
                  className="px-5 py-3 rounded-2xl bg-gradient-to-b from-purple-600 to-purple-800 text-white font-bold shadow-lg flex items-center gap-2 active:scale-95 hover:scale-105 border-2 border-purple-900">
                  <Trophy className="h-5 w-5" /> Top 10
                </button>
              </div>
            </div>
          )}

          {phase === 'play' && (
            <div className="flex flex-col items-center gap-2">
              <Board snake={snake} food={food} />
              {/* D-pad */}
              <div className="grid grid-cols-3 gap-1 mt-2 select-none" style={{ width: 168 }}>
                <div />
                <button type="button" onClick={() => setDirIfValid('up')}
                  className="h-12 rounded-xl bg-gradient-to-b from-lime-500 to-lime-700 text-white text-2xl font-black border-2 border-lime-900 shadow-md active:scale-95"
                >↑</button>
                <div />
                <button type="button" onClick={() => setDirIfValid('left')}
                  className="h-12 rounded-xl bg-gradient-to-b from-lime-500 to-lime-700 text-white text-2xl font-black border-2 border-lime-900 shadow-md active:scale-95"
                >←</button>
                <button type="button" onClick={() => setDirIfValid('down')}
                  className="h-12 rounded-xl bg-gradient-to-b from-lime-500 to-lime-700 text-white text-2xl font-black border-2 border-lime-900 shadow-md active:scale-95"
                >↓</button>
                <button type="button" onClick={() => setDirIfValid('right')}
                  className="h-12 rounded-xl bg-gradient-to-b from-lime-500 to-lime-700 text-white text-2xl font-black border-2 border-lime-900 shadow-md active:scale-95"
                >→</button>
              </div>
              <p className="text-[10px] text-lime-300 italic">PC : flèches pour diriger</p>
            </div>
          )}

          {phase === 'over' && (
            <div className="flex flex-col items-center gap-4 py-3 anim-fadein">
              <h3 className="text-2xl sm:text-3xl font-black text-rose-300 flex items-center gap-2">
                <Sparkles className="h-7 w-7 text-yellow-400" /> Game over <Sparkles className="h-7 w-7 text-yellow-400" />
              </h3>
              <div className="bg-lime-900/60 rounded-3xl border-4 border-lime-500 px-8 py-5 shadow-xl text-center">
                <p className="text-xs uppercase font-bold text-lime-300 tracking-widest">Score final</p>
                <p className="text-7xl font-black text-yellow-300 leading-none mt-1 tabular-nums">{score}</p>
                <p className="text-sm text-lime-200 mt-2">🍴 {foodCount} aliments · ⏱ {secondsAlive}s</p>
              </div>
              {!scoreSaved ? (
                <div className="w-full max-w-xs flex flex-col gap-2">
                  <input type="text" value={playerName} onChange={e => setPlayerName(e.target.value)}
                    placeholder="Ton nom" maxLength={20}
                    className="w-full px-3 py-2 rounded-xl border-2 border-lime-300 bg-white text-center font-semibold focus:outline-none focus:border-lime-500" />
                  <button onClick={handleSaveScore} disabled={saveMut.isPending}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-b from-lime-500 to-lime-700 text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2 border-2 border-lime-900">
                    {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />} Enregistrer
                  </button>
                </div>
              ) : <p className="text-emerald-300 font-bold">✓ Score enregistré</p>}
              <div className="flex flex-wrap justify-center gap-2 mt-2">
                <button onClick={startGame}
                  className="px-4 py-2 rounded-xl bg-gradient-to-b from-lime-500 to-lime-700 text-white font-bold flex items-center gap-2 border-2 border-lime-900">
                  <Play className="h-4 w-4" /> Rejouer
                </button>
                <button onClick={() => setPhase('scores')}
                  className="px-4 py-2 rounded-xl bg-gradient-to-b from-purple-600 to-purple-800 text-white font-bold flex items-center gap-2 border-2 border-purple-900">
                  <Trophy className="h-4 w-4" /> Top 10
                </button>
                <button onClick={() => setPhase('menu')}
                  className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold border-2 border-slate-300">
                  Menu
                </button>
              </div>
            </div>
          )}

          {phase === 'scores' && (
            <div className="py-3 anim-fadein">
              <div className="bg-white rounded-2xl border-4 border-lime-300 overflow-hidden shadow-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gradient-to-b from-lime-200 to-lime-100 text-lime-900">
                    <tr>
                      <th className="px-3 py-2 text-left">Rang</th>
                      <th className="px-3 py-2 text-left">Joueur</th>
                      <th className="px-3 py-2 text-right">Score</th>
                      <th className="px-3 py-2 text-right hidden sm:table-cell">🍴</th>
                      <th className="px-3 py-2 text-right hidden sm:table-cell">⏱</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingScores && (
                      <tr><td colSpan={5} className="text-center py-6 text-slate-400">
                        <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                      </td></tr>
                    )}
                    {!loadingScores && scoreboard.length === 0 && (
                      <tr><td colSpan={5} className="text-center py-6 text-slate-400 italic">Aucun score — sois le premier !</td></tr>
                    )}
                    {scoreboard.map((s, i) => (
                      <tr key={s.id} className={cn(
                        'border-t border-slate-100',
                        i === 0 && 'bg-yellow-50',
                        i === 1 && 'bg-slate-50',
                        i === 2 && 'bg-orange-50',
                      )}>
                        <td className="px-3 py-2 font-bold text-lg">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</td>
                        <td className="px-3 py-2 font-semibold">{s.player_name}</td>
                        <td className="px-3 py-2 text-right font-black text-emerald-700 text-lg tabular-nums">{s.score}</td>
                        <td className="px-3 py-2 text-right text-xs text-slate-500 hidden sm:table-cell">{s.food_count}</td>
                        <td className="px-3 py-2 text-right text-xs text-slate-500 hidden sm:table-cell">{s.time_survived}s</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-center mt-4">
                <button onClick={() => setPhase('menu')}
                  className="px-5 py-2 rounded-xl bg-gradient-to-b from-lime-500 to-lime-700 text-white font-bold border-2 border-lime-900">
                  Retour
                </button>
              </div>
            </div>
          )}

        </div>

        <div className="h-3" style={{ background: 'repeating-linear-gradient(135deg, #84cc16 0 18px, #65a30d 18px 36px)' }} />
      </div>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .anim-fadein { animation: fade-in 0.4s ease-out forwards; }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PLATEAU
// ─────────────────────────────────────────────────────────────────────────────

function Board({ snake, food }: { snake: Segment[]; food: Food }) {
  return (
    <div
      className="relative select-none flex-shrink-0"
      style={{
        width: BOARD_W,
        height: BOARD_H,
        background: 'linear-gradient(180deg, #1a4727 0%, #0a1f12 100%)',
        border: '3px solid #84cc16',
        borderRadius: 12,
        boxShadow: 'inset 0 0 24px rgba(0,0,0,0.6)',
      }}
    >
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage:
          'linear-gradient(to right, rgba(132,204,22,0.06) 1px, transparent 1px),' +
          'linear-gradient(to bottom, rgba(132,204,22,0.06) 1px, transparent 1px)',
        backgroundSize: `${100 / GRID_W}% ${100 / GRID_H}%`,
      }} />
      {/* Aliment */}
      <div style={{
        position: 'absolute',
        left: food.x * CELL,
        top:  food.y * CELL,
        width: CELL,
        height: CELL,
        padding: 1,
      }}>
        <Avatar color={food.color} />
      </div>
      {/* Serpent */}
      {snake.map((seg, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: seg.x * CELL,
          top:  seg.y * CELL,
          width: CELL,
          height: CELL,
          padding: 1,
          zIndex: snake.length - i,
        }}>
          <Avatar color={seg.color} isHead={i === 0} />
        </div>
      ))}
    </div>
  );
}

function Avatar({ color, isHead = false }: { color: Color; isHead?: boolean }) {
  return (
    <div
      style={{
        width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden',
        boxShadow: isHead
          ? 'inset 0 -2px 6px rgba(0,0,0,0.4), inset 0 2px 6px rgba(255,255,255,0.4), 0 0 6px 1px rgba(132,204,22,0.6)'
          : 'inset 0 -2px 4px rgba(0,0,0,0.3), inset 0 2px 4px rgba(255,255,255,0.3)',
        background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.5), transparent 60%), #1e293b',
        border: isHead ? '2px solid #fde047' : '1px solid #fff',
      }}
    >
      <img src={IMG[color]} alt={color} className="w-full h-full object-cover" />
    </div>
  );
}
