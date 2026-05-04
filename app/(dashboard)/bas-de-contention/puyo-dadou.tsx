'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  X, Play, Trophy, Loader2, Volume2, VolumeX, ArrowLeft,
  Award, Sparkles,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────────────────────

const GRID_W = 6;
const GRID_H = 12;
const CELL = 48;                       // taille d'une case en px
const BOARD_W = GRID_W * CELL;
const BOARD_H = GRID_H * CELL;

const INITIAL_FALL_MS = 800;           // vitesse de chute initiale
const SOFT_DROP_MS = 60;               // chute accélérée (touche bas)
const SPEED_UP_EVERY_MS = 30000;       // accélère toutes les 30 s
const SPEED_UP_FACTOR = 0.85;          // *0.85 à chaque accélération
const MIN_FALL_MS = 200;
const POP_DURATION_MS = 380;
const GRAVITY_STEP_MS = 60;            // délai entre 2 étapes de gravité
const CHAIN_BONUS = [1, 2, 4, 8, 16, 32, 64];

const COLORS = ['dadou', 'momo', 'pierre', 'flo', 'marie'] as const;
type Color = typeof COLORS[number];

const IMG: Record<Color, string> = {
  dadou:  '/chop-dadou/dadou.png',
  momo:   '/chop-dadou/momo.png',
  pierre: '/chop-dadou/pierre.png',
  flo:    '/chop-dadou/flo.png',
  marie:  '/chop-dadou/marie.png',
};

const NAMES: Record<Color, string> = {
  dadou: 'Dadou', momo: 'Momo', pierre: 'Pierre', flo: 'Flo', marie: 'Elo',
};

// 4 orientations : satellite par rapport à l'axe
//   0 = haut (sat au-dessus)
//   1 = droite
//   2 = bas
//   3 = gauche
const ROT_OFFSETS: Array<[number, number]> = [
  [-1, 0], [0, +1], [+1, 0], [0, -1],
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS GRILLE
// ─────────────────────────────────────────────────────────────────────────────

function emptyGrid(): (Color | null)[][] {
  return Array.from({ length: GRID_H }, () => Array<Color | null>(GRID_W).fill(null));
}

function applyGravity(grid: (Color | null)[][]): (Color | null)[][] {
  const next = emptyGrid();
  for (let c = 0; c < GRID_W; c++) {
    let writeRow = GRID_H - 1;
    for (let r = GRID_H - 1; r >= 0; r--) {
      if (grid[r][c]) {
        next[writeRow][c] = grid[r][c];
        writeRow--;
      }
    }
  }
  return next;
}

function findMatches(grid: (Color | null)[][]): Array<Array<[number, number]>> {
  const visited = new Set<string>();
  const result: Array<Array<[number, number]>> = [];
  for (let r = 0; r < GRID_H; r++) {
    for (let c = 0; c < GRID_W; c++) {
      const k = `${r}-${c}`;
      if (visited.has(k) || !grid[r][c]) continue;
      const target = grid[r][c];
      const cluster: Array<[number, number]> = [];
      const stack: Array<[number, number]> = [[r, c]];
      while (stack.length) {
        const [cr, cc] = stack.pop()!;
        const kk = `${cr}-${cc}`;
        if (visited.has(kk)) continue;
        visited.add(kk);
        if (grid[cr]?.[cc] !== target) continue;
        cluster.push([cr, cc]);
        for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nr = cr + dr, nc = cc + dc;
          if (nr < 0 || nr >= GRID_H || nc < 0 || nc >= GRID_W) continue;
          if (!visited.has(`${nr}-${nc}`)) stack.push([nr, nc]);
        }
      }
      if (cluster.length >= 4) result.push(cluster);
    }
  }
  return result;
}

function randColor(): Color {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPABASE
// ─────────────────────────────────────────────────────────────────────────────

interface ScoreRecord {
  id: string;
  player_name: string;
  score: number;
  chains_max: number;
  created_at: string;
}

async function fetchScores(): Promise<ScoreRecord[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from('puyo_dadou_scores')
    .select('*')
    .order('score', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(10);
  if (error) throw new Error(error.message);
  return (data ?? []) as ScoreRecord[];
}

async function insertScore(payload: { player_name: string; score: number; chains_max: number }): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from('puyo_dadou_scores').insert(payload);
  if (error) throw new Error(error.message);
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSANT
// ─────────────────────────────────────────────────────────────────────────────

interface FallingPair {
  axisR: number;
  axisC: number;
  axisColor: Color;
  satColor: Color;
  rotation: 0 | 1 | 2 | 3;
}

function satOf(p: FallingPair): { r: number; c: number } {
  const [dr, dc] = ROT_OFFSETS[p.rotation];
  return { r: p.axisR + dr, c: p.axisC + dc };
}

function isFree(grid: (Color | null)[][], r: number, c: number): boolean {
  if (c < 0 || c >= GRID_W) return false;
  if (r >= GRID_H) return false;
  if (r < 0) return true; // au-dessus du plateau = libre
  return !grid[r][c];
}

function pairFits(grid: (Color | null)[][], p: FallingPair): boolean {
  if (!isFree(grid, p.axisR, p.axisC)) return false;
  const s = satOf(p);
  if (!isFree(grid, s.r, s.c)) return false;
  return true;
}

export function PuyoDadouModal({ open, onClose, onBack }: { open: boolean; onClose: () => void; onBack?: () => void }) {
  const qc = useQueryClient();

  const [phase, setPhase] = useState<'menu' | 'play' | 'over' | 'scores'>('menu');
  const [grid, setGrid] = useState<(Color | null)[][]>(() => emptyGrid());
  const [falling, setFalling] = useState<FallingPair | null>(null);
  const [nextPair, setNextPair] = useState<{ axis: Color; sat: Color }>({ axis: 'dadou', sat: 'momo' });
  const [popping, setPopping] = useState<Set<string>>(new Set());
  const [score, setScore] = useState(0);
  const [chainsMax, setChainsMax] = useState(0);
  const [muted, setMuted] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [scoreSaved, setScoreSaved] = useState(false);
  const [softDrop, setSoftDrop] = useState(false);
  const [fallSpeed, setFallSpeed] = useState(INITIAL_FALL_MS);
  const [chainProcessing, setChainProcessing] = useState(false);

  // Refs miroir
  const phaseRef = useRef(phase); useEffect(() => { phaseRef.current = phase; }, [phase]);
  const gridRef = useRef(grid); useEffect(() => { gridRef.current = grid; }, [grid]);
  const fallingRef = useRef<FallingPair | null>(null); useEffect(() => { fallingRef.current = falling; }, [falling]);
  const chainProcessingRef = useRef(false); useEffect(() => { chainProcessingRef.current = chainProcessing; }, [chainProcessing]);
  const softDropRef = useRef(false); useEffect(() => { softDropRef.current = softDrop; }, [softDrop]);

  // ── Audio ────────────────────────────────────────────────────────────────
  const themeRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const touchBufRef = useRef<AudioBuffer | null>(null);
  const popBufRef = useRef<AudioBuffer | null>(null);
  const gameOverBufRef = useRef<AudioBuffer | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const theme = new Audio('/chop-dadou/puyo-theme.mp3');
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

    loadBuffer('/chop-dadou/touch.mp3').then(b => { touchBufRef.current = b; });
    loadBuffer('/chop-dadou/pop.mp3').then(b => { popBufRef.current = b; });
    loadBuffer('/chop-dadou/game-over.mp3').then(b => { gameOverBufRef.current = b; });

    return () => {
      theme.pause();
      themeRef.current = null;
      ctx.close().catch(() => {});
      audioCtxRef.current = null;
    };
  }, []);

  const playSfx = useCallback((kind: 'touch' | 'pop' | 'gameover') => {
    if (muted) return;
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const buf =
      kind === 'touch' ? touchBufRef.current :
      kind === 'pop'   ? popBufRef.current :
                         gameOverBufRef.current;
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = kind === 'pop' ? 0.9 : 0.8;
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
      setGrid(emptyGrid());
      setFalling(null);
      setPopping(new Set());
      setScore(0);
      setChainsMax(0);
      setPlayerName('');
      setScoreSaved(false);
      setSoftDrop(false);
      setChainProcessing(false);
      setFallSpeed(INITIAL_FALL_MS);
    }
  }, [open]);

  // ── Spawn d'une paire ───────────────────────────────────────────────────
  const spawnPair = useCallback(() => {
    const { axis: axisColor, sat: satColor } = nextPair;
    const startC = Math.floor(GRID_W / 2) - 1;
    const newPair: FallingPair = {
      axisR: 1, axisC: startC,
      axisColor, satColor, rotation: 0,
    };
    // Game over ?
    const g = gridRef.current;
    if (!pairFits(g, newPair)) {
      themeRef.current?.pause();
      playSfx('gameover');
      setPhase('over');
      return;
    }
    setFalling(newPair);
    setNextPair({ axis: randColor(), sat: randColor() });
  }, [nextPair, playSfx]);

  // ── Démarrage ────────────────────────────────────────────────────────────
  const startGame = () => {
    setGrid(emptyGrid());
    setScore(0);
    setChainsMax(0);
    setScoreSaved(false);
    setFallSpeed(INITIAL_FALL_MS);
    setNextPair({ axis: randColor(), sat: randColor() });
    setPhase('play');
    if (themeRef.current && !muted) {
      themeRef.current.currentTime = 0;
      themeRef.current.play().catch(() => {});
    }
    // Le premier spawn est déclenché par l'effet ci-dessous
  };

  // Spawn la première paire dès qu'on entre en play
  useEffect(() => {
    if (phase !== 'play') return;
    if (fallingRef.current) return;
    spawnPair();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ── Accélération progressive ────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'play') return;
    const t = setInterval(() => {
      setFallSpeed(s => Math.max(MIN_FALL_MS, Math.round(s * SPEED_UP_FACTOR)));
    }, SPEED_UP_EVERY_MS);
    return () => clearInterval(t);
  }, [phase]);

  // ── Verrouillage de la paire et résolution des chaînes ─────────────────
  const lockPair = useCallback(async (pairToLock: FallingPair) => {
    setFalling(null);
    setChainProcessing(true);
    // Place les 2 puyos
    let g = gridRef.current.map(row => row.slice());
    const sat = satOf(pairToLock);
    if (pairToLock.axisR >= 0 && pairToLock.axisR < GRID_H)
      g[pairToLock.axisR][pairToLock.axisC] = pairToLock.axisColor;
    if (sat.r >= 0 && sat.r < GRID_H)
      g[sat.r][sat.c] = pairToLock.satColor;
    g = applyGravity(g);
    setGrid(g);
    playSfx('touch');

    // Boucle de chaînes
    let chain = 0;
    const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
    while (true) {
      await wait(120);
      const matches = findMatches(g);
      if (matches.length === 0) break;
      chain++;
      const allPopped = new Set<string>();
      let totalCount = 0;
      matches.forEach(cluster => {
        cluster.forEach(([r, c]) => allPopped.add(`${r}-${c}`));
        totalCount += cluster.length;
      });
      // Score : nb puyos × multiplicateur de chaîne × bonus longueur
      const chainMult = CHAIN_BONUS[Math.min(chain - 1, CHAIN_BONUS.length - 1)];
      const groupBonus = matches.reduce((sum, cl) => sum + Math.max(0, cl.length - 4) * 2, 0);
      setScore(s => s + totalCount * 10 * chainMult + groupBonus * 10);
      setChainsMax(m => Math.max(m, chain));

      setPopping(allPopped);
      playSfx('pop');
      await wait(POP_DURATION_MS);
      // Retire les puyos
      g = g.map(row => row.slice());
      allPopped.forEach(k => {
        const [r, c] = k.split('-').map(Number);
        g[r][c] = null;
      });
      g = applyGravity(g);
      setGrid(g);
      setPopping(new Set());
      await wait(GRAVITY_STEP_MS);
    }
    setChainProcessing(false);
    spawnPair();
  }, [playSfx, spawnPair]);

  const lockPairRef = useRef<(p: FallingPair) => void>(() => {});
  lockPairRef.current = lockPair;

  // ── Chute auto ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'play') return;
    if (chainProcessing) return;
    const interval = softDrop ? SOFT_DROP_MS : fallSpeed;
    const t = setInterval(() => {
      const fb = fallingRef.current;
      if (!fb) return;
      const moved: FallingPair = { ...fb, axisR: fb.axisR + 1 };
      if (pairFits(gridRef.current, moved)) {
        setFalling(moved);
      } else {
        // Verrouillage
        lockPairRef.current(fb);
      }
    }, interval);
    return () => clearInterval(t);
  }, [phase, fallSpeed, softDrop, chainProcessing]);

  // ── Contrôles ────────────────────────────────────────────────────────────
  const tryMove = useCallback((dc: number) => {
    const fb = fallingRef.current;
    if (!fb || chainProcessingRef.current) return;
    const moved: FallingPair = { ...fb, axisC: fb.axisC + dc };
    if (pairFits(gridRef.current, moved)) setFalling(moved);
  }, []);

  const tryRotate = useCallback(() => {
    const fb = fallingRef.current;
    if (!fb || chainProcessingRef.current) return;
    const newRot = ((fb.rotation + 1) % 4) as 0 | 1 | 2 | 3;
    let attempt: FallingPair = { ...fb, rotation: newRot };
    if (pairFits(gridRef.current, attempt)) { setFalling(attempt); return; }
    // Wall kick : essaye de décaler de 1 case
    for (const dc of [-1, +1, -2, +2]) {
      attempt = { ...fb, rotation: newRot, axisC: fb.axisC + dc };
      if (pairFits(gridRef.current, attempt)) { setFalling(attempt); return; }
    }
    // Échec → ne tourne pas
  }, []);

  const hardDrop = useCallback(() => {
    const fb = fallingRef.current;
    if (!fb || chainProcessingRef.current) return;
    let p = fb;
    while (true) {
      const next: FallingPair = { ...p, axisR: p.axisR + 1 };
      if (pairFits(gridRef.current, next)) p = next;
      else break;
    }
    lockPairRef.current(p);
  }, []);

  // Clavier
  useEffect(() => {
    if (phase !== 'play') return;
    const onDown = (e: KeyboardEvent) => {
      if (e.repeat && e.key !== 'ArrowDown') return;
      if (e.key === 'ArrowLeft')      { e.preventDefault(); tryMove(-1); }
      else if (e.key === 'ArrowRight'){ e.preventDefault(); tryMove(+1); }
      else if (e.key === 'ArrowUp')   { e.preventDefault(); tryRotate(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setSoftDrop(true); }
      else if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); hardDrop(); }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') setSoftDrop(false);
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, [phase, tryMove, tryRotate, hardDrop]);

  // ── Sauvegarde du score ─────────────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: insertScore,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['puyo_dadou_scores'] });
      toast.success('Score enregistré !');
      setScoreSaved(true);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSaveScore = () => {
    const name = playerName.trim();
    if (!name) { toast.error('Entrez votre nom'); return; }
    saveMut.mutate({ player_name: name, score, chains_max: chainsMax });
  };

  // ── Top 10 ──────────────────────────────────────────────────────────────
  const { data: scoreboard = [], isLoading: loadingScores } = useQuery({
    queryKey: ['puyo_dadou_scores'],
    queryFn: fetchScores,
    enabled: phase === 'scores' || phase === 'over',
  });

  // ─────────────────────────────────────────────────────────────────────────
  // RENDU
  // ─────────────────────────────────────────────────────────────────────────

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4 overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at center, #0a3d2e 0%, #062416 70%, #000 100%)' }}>
      {/* Petites étoiles */}
      <div className="absolute inset-0 pointer-events-none">
        {Array.from({ length: 50 }).map((_, i) => (
          <div key={i} className="absolute"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              width: 2 + Math.random() * 3,
              height: 2 + Math.random() * 3,
              background: '#a7f3d0',
              borderRadius: '50%',
              opacity: 0.3 + Math.random() * 0.5,
              boxShadow: '0 0 6px rgba(167,243,208,0.7)',
            }}
          />
        ))}
      </div>

      <div className="relative w-full max-w-3xl rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.7)] flex flex-col max-h-[96vh] overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #0c4a6e 0%, #082f49 100%)',
          border: '6px solid #34d399',
        }}>
        <div className="h-3" style={{ background: 'repeating-linear-gradient(135deg, #34d399 0 18px, #10b981 18px 36px)' }} />

        {/* Boutons */}
        <div className="absolute top-3 right-3 flex items-center gap-2 z-30">
          <button onClick={() => setMuted(m => !m)}
            className="w-9 h-9 rounded-full bg-emerald-700 hover:bg-emerald-800 text-white shadow-md flex items-center justify-center"
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

        {/* Header */}
        <div className="px-6 pt-4 pb-2 text-center">
          <h2 className="inline-block text-2xl sm:text-4xl font-black tracking-tight"
            style={{
              color: '#ecfdf5',
              textShadow: '2px 2px 0 #047857, 4px 4px 8px rgba(0,0,0,0.5)',
              fontFamily: '"Comic Sans MS", "Chalkboard SE", system-ui, sans-serif',
            }}>
            🟢 Puyo-Dadou 🟢
          </h2>
          {phase === 'play' && (
            <div className="flex items-center justify-center gap-4 mt-2 flex-wrap">
              <div className="flex items-center gap-2 text-emerald-100 font-bold text-lg">
                <Award className="h-5 w-5" />
                <span className="text-2xl text-yellow-300 tabular-nums" style={{ minWidth: '4ch', display: 'inline-block', textAlign: 'right' }}>{score}</span>
              </div>
              <div className="text-emerald-200 font-bold text-sm">Chaîne max : {chainsMax}</div>
            </div>
          )}
        </div>

        <div className="px-3 sm:px-6 pb-4 flex-1 overflow-y-auto">

          {/* MENU */}
          {phase === 'menu' && (
            <div className="flex flex-col items-center gap-4 py-4 text-center anim-fadein">
              <p className="text-emerald-100 text-sm sm:text-base max-w-md">
                Aligne <strong>4 têtes identiques ou plus</strong> (horizontal ou vertical) pour les faire éclater.
                Les têtes au-dessus tombent et peuvent déclencher des chaînes pour des combos énormes !
              </p>
              <div className="flex flex-wrap gap-3 justify-center">
                {COLORS.map(c => (
                  <div key={c} className="flex flex-col items-center gap-1">
                    <Puyo color={c} size={44} />
                    <span className="text-[10px] text-emerald-200 font-bold uppercase">{NAMES[c]}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 mt-2">
                <button onClick={startGame}
                  className="px-6 py-3 rounded-2xl bg-gradient-to-b from-emerald-400 to-emerald-600 text-white font-black text-lg shadow-lg flex items-center gap-2 active:scale-95 hover:scale-105 transition-transform border-2 border-emerald-900">
                  <Play className="h-5 w-5 fill-current" /> JOUER
                </button>
                <button onClick={() => setPhase('scores')}
                  className="px-5 py-3 rounded-2xl bg-gradient-to-b from-purple-600 to-purple-800 text-white font-bold shadow-lg flex items-center gap-2 active:scale-95 hover:scale-105 border-2 border-purple-900">
                  <Trophy className="h-5 w-5" /> Top 10
                </button>
              </div>
            </div>
          )}

          {/* JEU */}
          {phase === 'play' && (
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-start gap-3">
                <Board grid={grid} falling={falling} popping={popping} />
                {/* Aperçu prochaine paire */}
                <div className="flex flex-col items-center gap-2 px-3 py-3 rounded-xl bg-emerald-900/40 border border-emerald-700 flex-shrink-0" style={{ minWidth: 64 }}>
                  <div className="text-[10px] uppercase font-bold text-emerald-300 tracking-wide whitespace-nowrap">Suivant</div>
                  <Puyo color={nextPair.sat} size={40} />
                  <Puyo color={nextPair.axis} size={40} />
                </div>
              </div>
              {/* Contrôles tactiles */}
              <div className="flex items-center justify-center gap-2 mt-2 select-none flex-wrap">
                <button type="button"
                  onClick={() => tryMove(-1)}
                  className="w-14 h-14 rounded-2xl bg-gradient-to-b from-emerald-500 to-emerald-700 text-white text-2xl font-black border-2 border-emerald-900 shadow-lg active:scale-95"
                  title="Gauche (←)"
                >‹</button>
                <button type="button"
                  onClick={tryRotate}
                  className="w-14 h-14 rounded-2xl bg-gradient-to-b from-cyan-400 to-cyan-600 text-white text-xl font-black border-2 border-cyan-800 shadow-lg active:scale-95"
                  title="Tourner (↑)"
                >↻</button>
                <button type="button"
                  onClick={() => tryMove(+1)}
                  className="w-14 h-14 rounded-2xl bg-gradient-to-b from-emerald-500 to-emerald-700 text-white text-2xl font-black border-2 border-emerald-900 shadow-lg active:scale-95"
                  title="Droite (→)"
                >›</button>
                <button type="button"
                  onMouseDown={() => setSoftDrop(true)}
                  onMouseUp={() => setSoftDrop(false)}
                  onMouseLeave={() => setSoftDrop(false)}
                  onTouchStart={(e) => { e.preventDefault(); setSoftDrop(true); }}
                  onTouchEnd={(e) => { e.preventDefault(); setSoftDrop(false); }}
                  className="w-14 h-14 rounded-2xl bg-gradient-to-b from-amber-400 to-amber-600 text-white text-xl font-black border-2 border-amber-900 shadow-lg active:scale-95"
                  title="Descente rapide (↓)"
                >▼</button>
                <button type="button"
                  onClick={hardDrop}
                  className="px-5 h-14 rounded-2xl bg-gradient-to-b from-red-500 to-red-700 text-white text-base font-black border-2 border-red-900 shadow-lg active:scale-95"
                  title="Drop (espace)"
                >DROP</button>
              </div>
              <p className="text-[10px] text-emerald-300 italic">PC : ← → ↑ ↓ pour déplacer/tourner, espace pour drop</p>
            </div>
          )}

          {/* GAME OVER */}
          {phase === 'over' && (
            <div className="flex flex-col items-center gap-4 py-3 anim-fadein">
              <h3 className="text-2xl sm:text-3xl font-black text-rose-300 flex items-center gap-2">
                <Sparkles className="h-7 w-7 text-yellow-400" /> Partie terminée <Sparkles className="h-7 w-7 text-yellow-400" />
              </h3>
              <div className="bg-emerald-900/60 rounded-3xl border-4 border-emerald-500 px-8 py-5 shadow-xl text-center">
                <p className="text-xs uppercase font-bold text-emerald-300 tracking-widest">Score final</p>
                <p className="text-7xl font-black text-yellow-300 leading-none mt-1 tabular-nums">{score}</p>
                <p className="text-sm text-emerald-200 mt-2">Chaîne max : {chainsMax}</p>
              </div>
              {!scoreSaved ? (
                <div className="w-full max-w-xs flex flex-col gap-2">
                  <input type="text" value={playerName} onChange={e => setPlayerName(e.target.value)}
                    placeholder="Ton nom" maxLength={20}
                    className="w-full px-3 py-2 rounded-xl border-2 border-emerald-300 bg-white text-center font-semibold focus:outline-none focus:border-emerald-500" />
                  <button onClick={handleSaveScore} disabled={saveMut.isPending}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-700 text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2 border-2 border-emerald-900">
                    {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />} Enregistrer
                  </button>
                </div>
              ) : <p className="text-emerald-300 font-bold">✓ Score enregistré</p>}
              <div className="flex flex-wrap justify-center gap-2 mt-2">
                <button onClick={startGame}
                  className="px-4 py-2 rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-700 text-white font-bold flex items-center gap-2 border-2 border-emerald-900">
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

          {/* SCORES */}
          {phase === 'scores' && (
            <div className="py-3 anim-fadein">
              <div className="bg-white rounded-2xl border-4 border-emerald-300 overflow-hidden shadow-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gradient-to-b from-emerald-200 to-emerald-100 text-emerald-900">
                    <tr>
                      <th className="px-3 py-2 text-left">Rang</th>
                      <th className="px-3 py-2 text-left">Joueur</th>
                      <th className="px-3 py-2 text-right">Score</th>
                      <th className="px-3 py-2 text-right hidden sm:table-cell">Chaîne</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingScores && (
                      <tr><td colSpan={4} className="text-center py-6 text-slate-400">
                        <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                      </td></tr>
                    )}
                    {!loadingScores && scoreboard.length === 0 && (
                      <tr><td colSpan={4} className="text-center py-6 text-slate-400 italic">Aucun score — sois le premier !</td></tr>
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
                        <td className="px-3 py-2 text-right text-xs text-slate-500 hidden sm:table-cell">x{s.chains_max}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-center mt-4">
                <button onClick={() => setPhase('menu')}
                  className="px-5 py-2 rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-700 text-white font-bold border-2 border-emerald-900">
                  Retour
                </button>
              </div>
            </div>
          )}

        </div>

        <div className="h-3" style={{ background: 'repeating-linear-gradient(135deg, #34d399 0 18px, #10b981 18px 36px)' }} />
      </div>

      <style>{`
        @keyframes puyo-pop {
          0%   { transform: scale(1)   rotate(0deg);   opacity: 1; }
          50%  { transform: scale(1.4) rotate(15deg);  opacity: 0.8; }
          100% { transform: scale(0)   rotate(180deg); opacity: 0; }
        }
        .anim-puyo-pop { animation: puyo-pop 0.38s ease-out forwards; }
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
// SOUS-COMPOSANTS
// ─────────────────────────────────────────────────────────────────────────────

function Puyo({ color, size = CELL }: { color: Color; size?: number }) {
  return (
    <div
      style={{
        width: size, height: size, borderRadius: '50%', overflow: 'hidden',
        boxShadow: 'inset 0 -4px 8px rgba(0,0,0,0.4), inset 0 4px 8px rgba(255,255,255,0.4), 0 2px 4px rgba(0,0,0,0.3)',
        background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.6), transparent 60%), #1e293b',
        border: '2px solid #fff',
      }}
    >
      <img src={IMG[color]} alt={color} className="w-full h-full object-cover" />
    </div>
  );
}

function Board({
  grid, falling, popping,
}: {
  grid: (Color | null)[][];
  falling: FallingPair | null;
  popping: Set<string>;
}) {
  const sat = falling ? satOf(falling) : null;
  return (
    <div
      className="relative select-none flex-shrink-0"
      style={{
        width: BOARD_W,
        height: BOARD_H,
        background: 'linear-gradient(180deg, #0c4a6e 0%, #082f49 100%)',
        border: '3px solid #34d399',
        borderRadius: 12,
        boxShadow: 'inset 0 0 24px rgba(0,0,0,0.6)',
      }}
    >
      {/* Quadrillage */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage:
          'linear-gradient(to right, rgba(52,211,153,0.08) 1px, transparent 1px),' +
          'linear-gradient(to bottom, rgba(52,211,153,0.08) 1px, transparent 1px)',
        backgroundSize: `${100 / GRID_W}% ${100 / GRID_H}%`,
      }} />

      {/* Puyos verrouillés */}
      {grid.map((row, r) => row.map((color, c) => {
        if (!color) return null;
        const popped = popping.has(`${r}-${c}`);
        return (
          <div key={`${r}-${c}`}
            style={{
              position: 'absolute',
              left: `${(c / GRID_W) * 100}%`,
              top:  `${(r / GRID_H) * 100}%`,
              width: `${100 / GRID_W}%`,
              height: `${100 / GRID_H}%`,
              padding: 1,
            }}>
            <div className={popped ? 'anim-puyo-pop' : ''} style={{ width: '100%', height: '100%' }}>
              <Puyo color={color} size={CELL} />
            </div>
          </div>
        );
      }))}

      {/* Paire en chute (axe + satellite) */}
      {falling && falling.axisR >= 0 && (
        <div style={{
          position: 'absolute',
          left: `${(falling.axisC / GRID_W) * 100}%`,
          top:  `${(falling.axisR / GRID_H) * 100}%`,
          width: `${100 / GRID_W}%`,
          height: `${100 / GRID_H}%`,
          padding: 1,
        }}>
          <Puyo color={falling.axisColor} size={CELL} />
        </div>
      )}
      {falling && sat && sat.r >= 0 && (
        <div style={{
          position: 'absolute',
          left: `${(sat.c / GRID_W) * 100}%`,
          top:  `${(sat.r / GRID_H) * 100}%`,
          width: `${100 / GRID_W}%`,
          height: `${100 / GRID_H}%`,
          padding: 1,
        }}>
          <Puyo color={falling.satColor} size={CELL} />
        </div>
      )}
    </div>
  );
}
