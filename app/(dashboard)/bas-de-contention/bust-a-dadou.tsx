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

const BUBBLE = 44;                    // diamètre d'une bulle en px
const HEX_DY = BUBBLE * Math.sqrt(3) / 2;
const COLS_EVEN = 9;                  // nb de bulles sur les rangées paires
const COLS_ODD  = COLS_EVEN - 1;      // une de moins sur les rangées impaires
const BOARD_W = COLS_EVEN * BUBBLE;
const BOARD_H = 600;                  // hauteur du plateau de jeu
const SHOOTER_Y = BOARD_H - 50;
const SHOOTER_X = BOARD_W / 2;
const DEATH_Y = BOARD_H - 90;         // ligne en dessous de laquelle = game over
const SHOT_SPEED = 14;                // px par frame (~60 fps)

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

// Niveaux fixes : grilles initiales et nb de couleurs
interface Level {
  rows: number;
  colors: number;     // nb de couleurs utilisées
  density: number;    // 0..1 — proba d'une cellule occupée
}
const LEVELS: Level[] = [
  { rows: 4, colors: 3, density: 0.85 },
  { rows: 5, colors: 4, density: 0.85 },
  { rows: 6, colors: 5, density: 0.85 },
];
const TOTAL_LEVELS = LEVELS.length;
// Au-delà des niveaux fixes : mode endless avec descente progressive
const ENDLESS_DESCEND_MS = 12000;     // ms entre 2 descentes en endless

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS GÉOMÉTRIE HEX (offset coords avec décalage des rangées impaires)
// ─────────────────────────────────────────────────────────────────────────────

function cellToXY(r: number, c: number): { x: number; y: number } {
  const offsetX = (r % 2 === 1) ? BUBBLE / 2 : 0;
  const x = c * BUBBLE + offsetX + BUBBLE / 2;
  const y = r * HEX_DY + BUBBLE / 2;
  return { x, y };
}

function colsForRow(r: number): number {
  return r % 2 === 0 ? COLS_EVEN : COLS_ODD;
}

function neighbors(r: number, c: number): Array<[number, number]> {
  const odd = r % 2 === 1;
  if (odd) {
    return [[r-1, c], [r-1, c+1], [r, c-1], [r, c+1], [r+1, c], [r+1, c+1]];
  }
  return [[r-1, c-1], [r-1, c], [r, c-1], [r, c+1], [r+1, c-1], [r+1, c]];
}

// Donne la cellule (r, c) la plus proche d'un point (x, y) — qui est libre
// et adjacente à une bulle existante ou à la rangée 0.
function findSnapCell(grid: (Color | null)[][], x: number, y: number): { r: number; c: number } | null {
  const candidates: Array<{ r: number; c: number; d: number }> = [];
  const seen = new Set<string>();
  // On considère les cellules adjacentes à toutes les bulles existantes
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (!grid[r][c]) continue;
      for (const [nr, nc] of neighbors(r, c)) {
        if (nr < 0 || nc < 0 || nc >= colsForRow(nr)) continue;
        if (nr >= grid.length || grid[nr][nc]) continue;
        const k = `${nr}-${nc}`;
        if (seen.has(k)) continue;
        seen.add(k);
        const p = cellToXY(nr, nc);
        const d = Math.hypot(p.x - x, p.y - y);
        candidates.push({ r: nr, c: nc, d });
      }
    }
  }
  // On considère aussi les cellules de la rangée 0 si elles sont libres
  for (let c = 0; c < colsForRow(0); c++) {
    if (!grid[0]?.[c]) {
      const k = `0-${c}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const p = cellToXY(0, c);
      const d = Math.hypot(p.x - x, p.y - y);
      candidates.push({ r: 0, c, d });
    }
  }
  candidates.sort((a, b) => a.d - b.d);
  return candidates[0] ?? null;
}

// Détecte le cluster connecté de même couleur depuis (r, c)
function findCluster(grid: (Color | null)[][], r: number, c: number): Array<[number, number]> {
  const target = grid[r]?.[c];
  if (!target) return [];
  const visited = new Set<string>();
  const stack: Array<[number, number]> = [[r, c]];
  const cluster: Array<[number, number]> = [];
  while (stack.length) {
    const [cr, cc] = stack.pop()!;
    const k = `${cr}-${cc}`;
    if (visited.has(k)) continue;
    visited.add(k);
    if (grid[cr]?.[cc] !== target) continue;
    cluster.push([cr, cc]);
    for (const [nr, nc] of neighbors(cr, cc)) {
      if (nr < 0 || nc < 0 || nc >= colsForRow(nr)) continue;
      if (nr >= grid.length) continue;
      if (!visited.has(`${nr}-${nc}`)) stack.push([nr, nc]);
    }
  }
  return cluster;
}

// Retourne l'ensemble des bulles "orphelines" (non connectées à la rangée 0)
function findOrphans(grid: (Color | null)[][]): Array<[number, number]> {
  const connected = new Set<string>();
  const stack: Array<[number, number]> = [];
  // On commence depuis toutes les bulles de la rangée 0
  for (let c = 0; c < colsForRow(0); c++) {
    if (grid[0]?.[c]) stack.push([0, c]);
  }
  while (stack.length) {
    const [r, c] = stack.pop()!;
    const k = `${r}-${c}`;
    if (connected.has(k)) continue;
    if (!grid[r]?.[c]) continue;
    connected.add(k);
    for (const [nr, nc] of neighbors(r, c)) {
      if (nr < 0 || nc < 0 || nc >= colsForRow(nr)) continue;
      if (nr >= grid.length) continue;
      stack.push([nr, nc]);
    }
  }
  const orphans: Array<[number, number]> = [];
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c] && !connected.has(`${r}-${c}`)) orphans.push([r, c]);
    }
  }
  return orphans;
}

// Génère une grille initiale pour un niveau donné
function makeInitialGrid(level: Level): (Color | null)[][] {
  const palette = COLORS.slice(0, level.colors);
  const grid: (Color | null)[][] = [];
  for (let r = 0; r < level.rows; r++) {
    const row: (Color | null)[] = [];
    for (let c = 0; c < colsForRow(r); c++) {
      row.push(Math.random() < level.density ? palette[Math.floor(Math.random() * palette.length)] : null);
    }
    grid.push(row);
  }
  // On complète avec des rangées vides jusqu'à la zone de mort, pour pouvoir
  // descendre/ajouter en endless.
  while (grid.length < 16) {
    grid.push(Array.from({ length: colsForRow(grid.length) }, () => null));
  }
  return grid;
}

// Couleurs encore présentes dans la grille (pour la prochaine bulle à tirer)
function colorsInGrid(grid: (Color | null)[][]): Color[] {
  const set = new Set<Color>();
  for (const row of grid) for (const cell of row) if (cell) set.add(cell);
  return Array.from(set);
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPABASE
// ─────────────────────────────────────────────────────────────────────────────

interface ScoreRecord {
  id: string;
  player_name: string;
  score: number;
  level_reached: number;
  created_at: string;
}

async function fetchScores(): Promise<ScoreRecord[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from('bust_dadou_scores')
    .select('*')
    .order('score', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(10);
  if (error) throw new Error(error.message);
  return (data ?? []) as ScoreRecord[];
}

async function insertScore(payload: { player_name: string; score: number; level_reached: number }): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from('bust_dadou_scores').insert(payload);
  if (error) throw new Error(error.message);
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPOSANT
// ─────────────────────────────────────────────────────────────────────────────

interface FlyingBubble {
  x: number; y: number;
  vx: number; vy: number;
  color: Color;
}

export function BustADadouModal({ open, onClose, onBack }: { open: boolean; onClose: () => void; onBack?: () => void }) {
  const qc = useQueryClient();

  const [phase, setPhase] = useState<'menu' | 'play' | 'over' | 'win' | 'scores'>('menu');
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(0); // index dans LEVELS (0..TOTAL_LEVELS-1)
  const [endlessRow, setEndlessRow] = useState(0); // descente cumulée en endless
  const [grid, setGrid] = useState<(Color | null)[][]>([]);
  const [currentColor, setCurrentColor] = useState<Color>('dadou');
  const [nextColor, setNextColor] = useState<Color>('momo');
  const [aimAngle, setAimAngle] = useState(-Math.PI / 2); // -π/2 = vers le haut
  const [flying, setFlying] = useState<FlyingBubble | null>(null);
  const [popping, setPopping] = useState<Set<string>>(new Set());
  const [muted, setMuted] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [scoreSaved, setScoreSaved] = useState(false);

  // Refs miroir
  const phaseRef = useRef(phase); useEffect(() => { phaseRef.current = phase; }, [phase]);
  const flyingRef = useRef<FlyingBubble | null>(null); useEffect(() => { flyingRef.current = flying; }, [flying]);
  const gridRef = useRef(grid); useEffect(() => { gridRef.current = grid; }, [grid]);

  // ── Audio ────────────────────────────────────────────────────────────────
  const themeRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const touchBufRef = useRef<AudioBuffer | null>(null);
  const popBufRef = useRef<AudioBuffer | null>(null);
  const gameOverBufRef = useRef<AudioBuffer | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const theme = new Audio('/chop-dadou/bust-theme.mp3');
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
      setScore(0);
      setLevel(0);
      setEndlessRow(0);
      setGrid([]);
      setFlying(null);
      setPopping(new Set());
      setPlayerName('');
      setScoreSaved(false);
    }
  }, [open]);

  // ── Démarrage d'un niveau ───────────────────────────────────────────────
  const startLevel = (lv: number) => {
    const lvl = lv < TOTAL_LEVELS ? LEVELS[lv] : LEVELS[TOTAL_LEVELS - 1];
    const newGrid = makeInitialGrid(lvl);
    setGrid(newGrid);
    setLevel(lv);
    setEndlessRow(0);
    const palette = COLORS.slice(0, lvl.colors);
    setCurrentColor(palette[Math.floor(Math.random() * palette.length)]);
    setNextColor(palette[Math.floor(Math.random() * palette.length)]);
    setFlying(null);
    setPopping(new Set());
    setPhase('play');
    if (themeRef.current && !muted) {
      themeRef.current.currentTime = 0;
      themeRef.current.play().catch(() => {});
    }
  };

  const startGame = () => {
    setScore(0);
    setScoreSaved(false);
    startLevel(0);
  };

  // ── Mode endless : descente du plateau ──────────────────────────────────
  useEffect(() => {
    if (phase !== 'play') return;
    if (level < TOTAL_LEVELS) return; // pas en endless
    const t = setInterval(() => {
      setGrid(prev => {
        if (prev.length === 0) return prev;
        // On insère une nouvelle rangée en haut, remplie aléatoirement
        const palette = COLORS.slice(0, 5);
        const newTop = Array.from({ length: COLS_EVEN }, () =>
          Math.random() < 0.85 ? palette[Math.floor(Math.random() * palette.length)] : null,
        );
        // On ajoute en haut, on retire la dernière rangée
        return [newTop, ...prev.slice(0, prev.length - 1)];
      });
      setEndlessRow(r => r + 1);
    }, ENDLESS_DESCEND_MS);
    return () => clearInterval(t);
  }, [phase, level]);

  // ── Animation : bulle volante ───────────────────────────────────────────
  // handleSnap est défini plus bas mais on en garde une ref toujours fraîche
  // pour que le requestAnimationFrame appelle la version à jour.
  const handleSnapRef = useRef<(x: number, y: number) => void>(() => {});

  useEffect(() => {
    if (phase !== 'play') return;
    let rafId: number;
    const step = () => {
      const fb = flyingRef.current;
      if (fb) {
        let nx = fb.x + fb.vx;
        let ny = fb.y + fb.vy;
        // Rebonds murs
        if (nx - BUBBLE/2 <= 0) { nx = BUBBLE/2; setFlying(f => f ? { ...f, vx: -f.vx } : null); }
        else if (nx + BUBBLE/2 >= BOARD_W) { nx = BOARD_W - BUBBLE/2; setFlying(f => f ? { ...f, vx: -f.vx } : null); }

        // Collision avec le plafond
        if (ny - BUBBLE/2 <= 0) {
          handleSnapRef.current(nx, BUBBLE/2);
          return;
        }
        // Collision avec une bulle existante
        const g = gridRef.current;
        let hit = false;
        for (let r = 0; r < g.length && !hit; r++) {
          for (let c = 0; c < g[r].length && !hit; c++) {
            if (!g[r][c]) continue;
            const p = cellToXY(r, c);
            const d = Math.hypot(p.x - nx, p.y - ny);
            if (d < BUBBLE * 0.92) hit = true;
          }
        }
        if (hit) {
          handleSnapRef.current(nx, ny);
          return;
        }
        setFlying(f => f ? { ...f, x: nx, y: ny } : null);
      }
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [phase]);

  // ── Snap d'une bulle volante sur la grille ──────────────────────────────
  const handleSnap = (x: number, y: number) => {
    const fb = flyingRef.current;
    if (!fb) return;
    const grid = gridRef.current;
    const cell = findSnapCell(grid, x, y);
    if (!cell) {
      setFlying(null);
      return;
    }
    playSfx('touch');
    // Place la bulle
    const newGrid = grid.map(row => row.slice());
    while (newGrid.length <= cell.r) {
      newGrid.push(Array.from({ length: colsForRow(newGrid.length) }, () => null));
    }
    newGrid[cell.r][cell.c] = fb.color;

    // Cluster ?
    const cluster = findCluster(newGrid, cell.r, cell.c);
    let popped = 0;
    let bonus = 0;
    if (cluster.length >= 3) {
      cluster.forEach(([r, c]) => { newGrid[r][c] = null; });
      popped += cluster.length;
      // Orphelines (cascade)
      const orphans = findOrphans(newGrid);
      orphans.forEach(([r, c]) => { newGrid[r][c] = null; });
      popped += orphans.length;
      bonus = orphans.length * 2; // bonus cascade
    }

    // Animation pop
    if (popped > 0) {
      const popKeys = new Set<string>();
      cluster.forEach(([r, c]) => popKeys.add(`${r}-${c}`));
      const orphans = findOrphans(grid.map(row => row.slice())); // pour anim
      orphans.forEach(([r, c]) => popKeys.add(`${r}-${c}`));
      setPopping(popKeys);
      setTimeout(() => setPopping(new Set()), 350);
      playSfx('pop');
    }

    // Score
    setScore(s => s + popped + bonus);

    // Check perte : une bulle est-elle au-delà de la death line ?
    let dead = false;
    for (let r = 0; r < newGrid.length && !dead; r++) {
      for (let c = 0; c < newGrid[r].length && !dead; c++) {
        if (newGrid[r][c]) {
          const p = cellToXY(r, c);
          if (p.y > DEATH_Y) dead = true;
        }
      }
    }
    if (dead) {
      setGrid(newGrid);
      setFlying(null);
      themeRef.current?.pause();
      playSfx('gameover');
      setPhase('over');
      return;
    }

    // Check victoire (grille vide) : passage au niveau suivant
    const empty = newGrid.every(row => row.every(cell => !cell));
    if (empty) {
      setGrid(newGrid);
      setFlying(null);
      const nextLv = level + 1;
      if (nextLv < TOTAL_LEVELS) {
        // Bonus de niveau et passage au suivant après une pause
        setScore(s => s + 50);
        setTimeout(() => startLevel(nextLv), 1200);
      } else if (nextLv === TOTAL_LEVELS) {
        // Tous les niveaux fixes terminés → endless
        setScore(s => s + 100);
        toast.success('Mode endless débloqué !', { duration: 2000 });
        setTimeout(() => startLevel(nextLv), 1500);
      }
      return;
    }

    // Préparer la prochaine bulle
    const palette = colorsInGrid(newGrid);
    const pool = palette.length > 0 ? palette : COLORS.slice(0, LEVELS[Math.min(level, TOTAL_LEVELS - 1)].colors);
    const next = pool[Math.floor(Math.random() * pool.length)];
    setCurrentColor(nextColor);
    setNextColor(next);
    setGrid(newGrid);
    setFlying(null);
  };

  // Met à jour la ref vers la dernière version de handleSnap à chaque render
  // pour que le rAF utilise toujours les valeurs de state à jour.
  handleSnapRef.current = handleSnap;

  // ── Sauvegarde du score ─────────────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: insertScore,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bust_dadou_scores'] });
      toast.success('Score enregistré !');
      setScoreSaved(true);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSaveScore = () => {
    const name = playerName.trim();
    if (!name) { toast.error('Entrez votre nom'); return; }
    saveMut.mutate({ player_name: name, score, level_reached: level + 1 });
  };

  // ── Top 10 ──────────────────────────────────────────────────────────────
  const { data: scoreboard = [], isLoading: loadingScores } = useQuery({
    queryKey: ['bust_dadou_scores'],
    queryFn: fetchScores,
    enabled: phase === 'scores' || phase === 'over',
  });

  // ── Aim & shoot ─────────────────────────────────────────────────────────
  const boardRef = useRef<HTMLDivElement | null>(null);

  const handleAim = (clientX: number, clientY: number) => {
    const board = boardRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    const px = (clientX - rect.left) * (BOARD_W / rect.width);
    const py = (clientY - rect.top)  * (BOARD_H / rect.height);
    const dx = px - SHOOTER_X;
    const dy = py - SHOOTER_Y;
    if (dy > -10) return; // si on vise vers le bas, on ignore
    const angle = Math.atan2(dy, dx);
    // limite l'angle entre -10° de l'horizontale gauche et -10° de l'horizontale droite
    const minA = -Math.PI + Math.PI / 18;  // ~−170°
    const maxA = -Math.PI / 18;             // ~−10°
    setAimAngle(Math.max(minA, Math.min(maxA, angle)));
  };

  const handleShoot = () => {
    if (phase !== 'play') return;
    if (flying) return;
    const vx = Math.cos(aimAngle) * SHOT_SPEED;
    const vy = Math.sin(aimAngle) * SHOT_SPEED;
    setFlying({ x: SHOOTER_X, y: SHOOTER_Y, vx, vy, color: currentColor });
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDU
  // ─────────────────────────────────────────────────────────────────────────

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4 overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at center, #0c1d36 0%, #050a14 70%, #000 100%)' }}>
      {/* Étoiles d'arrière-plan */}
      <div className="absolute inset-0 pointer-events-none">
        {Array.from({ length: 50 }).map((_, i) => (
          <div key={i} className="absolute"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              width: 2 + Math.random() * 3,
              height: 2 + Math.random() * 3,
              background: '#bae6fd',
              borderRadius: '50%',
              opacity: 0.3 + Math.random() * 0.6,
              boxShadow: '0 0 6px rgba(186,230,253,0.7)',
            }}
          />
        ))}
      </div>

      <div className="relative w-full max-w-3xl rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.7)] flex flex-col max-h-[96vh] overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)',
          border: '6px solid #38bdf8',
        }}>
        {/* Bandeau supérieur */}
        <div className="h-3" style={{ background: 'repeating-linear-gradient(135deg, #38bdf8 0 18px, #0ea5e9 18px 36px)' }} />

        {/* Boutons mute / back / close */}
        <div className="absolute top-3 right-3 flex items-center gap-2 z-30">
          <button onClick={() => setMuted(m => !m)}
            className="w-9 h-9 rounded-full bg-sky-700 hover:bg-sky-800 text-white shadow-md flex items-center justify-center transition-transform active:scale-95"
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
              color: '#f0f9ff',
              textShadow: '2px 2px 0 #0284c7, 4px 4px 8px rgba(0,0,0,0.5)',
              fontFamily: '"Comic Sans MS", "Chalkboard SE", system-ui, sans-serif',
            }}>
            🫧 Bust-a-Dadou 🫧
          </h2>
          {phase === 'play' && (
            <div className="flex items-center justify-center gap-4 sm:gap-6 mt-2 flex-wrap">
              <div className="flex items-center gap-2 text-sky-100 font-bold text-lg">
                <Award className="h-5 w-5" /> <span className="text-2xl text-yellow-300 tabular-nums">{score}</span>
              </div>
              <div className="text-sky-100 font-bold text-sm">
                {level < TOTAL_LEVELS ? `Niveau ${level + 1} / ${TOTAL_LEVELS}` : `Endless +${endlessRow}`}
              </div>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="px-3 sm:px-6 pb-4 flex-1 overflow-y-auto">

          {/* MENU */}
          {phase === 'menu' && (
            <div className="flex flex-col items-center gap-4 py-4 text-center anim-fadein">
              <p className="text-sky-100 text-sm sm:text-base max-w-md">
                Tire des têtes des persos pour faire des groupes de <strong>3 ou plus de la même couleur</strong>.
                Les bulles isolées (déconnectées du haut) tombent en cascade. Survis tant que tu peux !
              </p>
              <div className="flex flex-wrap gap-3 justify-center">
                {COLORS.map(c => (
                  <div key={c} className="flex flex-col items-center gap-1">
                    <Bubble color={c} size={48} />
                    <span className="text-[10px] text-sky-200 font-bold uppercase">{NAMES[c]}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 mt-2">
                <button onClick={startGame}
                  className="px-6 py-3 rounded-2xl bg-gradient-to-b from-sky-400 to-sky-600 text-white font-black text-lg shadow-lg flex items-center gap-2 active:scale-95 hover:scale-105 transition-transform border-2 border-sky-900">
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
            <div className="flex justify-center">
              <Board
                refEl={boardRef}
                grid={grid}
                flying={flying}
                popping={popping}
                aimAngle={aimAngle}
                currentColor={currentColor}
                nextColor={nextColor}
                onMove={(x, y) => handleAim(x, y)}
                onShoot={handleShoot}
              />
            </div>
          )}

          {/* GAME OVER */}
          {phase === 'over' && (
            <div className="flex flex-col items-center gap-4 py-3 anim-fadein">
              <h3 className="text-2xl sm:text-3xl font-black text-rose-300 flex items-center gap-2">
                <Sparkles className="h-7 w-7 text-yellow-400" /> Partie terminée <Sparkles className="h-7 w-7 text-yellow-400" />
              </h3>
              <div className="bg-slate-800 rounded-3xl border-4 border-sky-500 px-8 py-5 shadow-xl text-center">
                <p className="text-xs uppercase font-bold text-sky-300 tracking-widest">Score final</p>
                <p className="text-7xl font-black text-yellow-300 leading-none mt-1 tabular-nums">{score}</p>
                <p className="text-sm text-sky-200 mt-2">Niveau atteint : {level < TOTAL_LEVELS ? `${level + 1} / ${TOTAL_LEVELS}` : `Endless +${endlessRow}`}</p>
              </div>
              {!scoreSaved ? (
                <div className="w-full max-w-xs flex flex-col gap-2">
                  <input type="text" value={playerName} onChange={e => setPlayerName(e.target.value)}
                    placeholder="Ton nom" maxLength={20}
                    className="w-full px-3 py-2 rounded-xl border-2 border-sky-300 bg-white text-center font-semibold focus:outline-none focus:border-sky-500" />
                  <button onClick={handleSaveScore} disabled={saveMut.isPending}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-b from-sky-500 to-sky-700 text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2 border-2 border-sky-900">
                    {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />} Enregistrer
                  </button>
                </div>
              ) : <p className="text-emerald-300 font-bold">✓ Score enregistré</p>}
              <div className="flex flex-wrap justify-center gap-2 mt-2">
                <button onClick={startGame}
                  className="px-4 py-2 rounded-xl bg-gradient-to-b from-sky-500 to-sky-700 text-white font-bold flex items-center gap-2 border-2 border-sky-900">
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
              <div className="bg-white rounded-2xl border-4 border-sky-300 overflow-hidden shadow-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gradient-to-b from-sky-200 to-sky-100 text-sky-900">
                    <tr>
                      <th className="px-3 py-2 text-left">Rang</th>
                      <th className="px-3 py-2 text-left">Joueur</th>
                      <th className="px-3 py-2 text-right">Score</th>
                      <th className="px-3 py-2 text-right hidden sm:table-cell">Niveau</th>
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
                        <td className="px-3 py-2 text-right text-xs text-slate-500 hidden sm:table-cell">{s.level_reached}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-center mt-4">
                <button onClick={() => setPhase('menu')}
                  className="px-5 py-2 rounded-xl bg-gradient-to-b from-sky-500 to-sky-700 text-white font-bold border-2 border-sky-900">
                  Retour
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Bandeau inférieur */}
        <div className="h-3" style={{ background: 'repeating-linear-gradient(135deg, #38bdf8 0 18px, #0ea5e9 18px 36px)' }} />
      </div>

      <style>{`
        @keyframes bubble-pop {
          0%   { transform: scale(1); opacity: 1; }
          50%  { transform: scale(1.4); opacity: 0.8; }
          100% { transform: scale(0); opacity: 0; }
        }
        .anim-bubble-pop { animation: bubble-pop 0.35s ease-out forwards; }
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

function Bubble({ color, size = BUBBLE }: { color: Color; size?: number }) {
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
  refEl, grid, flying, popping, aimAngle, currentColor, nextColor, onMove, onShoot,
}: {
  refEl: React.MutableRefObject<HTMLDivElement | null>;
  grid: (Color | null)[][];
  flying: FlyingBubble | null;
  popping: Set<string>;
  aimAngle: number;
  currentColor: Color;
  nextColor: Color;
  onMove: (x: number, y: number) => void;
  onShoot: () => void;
}) {
  return (
    <div
      ref={refEl}
      onMouseMove={e => onMove(e.clientX, e.clientY)}
      onTouchMove={e => { if (e.touches[0]) onMove(e.touches[0].clientX, e.touches[0].clientY); }}
      onClick={onShoot}
      onTouchEnd={onShoot}
      className="relative cursor-crosshair select-none"
      style={{
        width: '100%',
        maxWidth: BOARD_W,
        aspectRatio: `${BOARD_W} / ${BOARD_H}`,
        background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
        border: '3px solid #38bdf8',
        borderRadius: 12,
        boxShadow: 'inset 0 0 24px rgba(0,0,0,0.6)',
        touchAction: 'none',
      }}
    >
      {/* Death line */}
      <div className="absolute pointer-events-none" style={{
        left: 0, right: 0, top: `${(DEATH_Y / BOARD_H) * 100}%`,
        height: 2, background: 'repeating-linear-gradient(to right, rgba(248,113,113,0.6) 0 8px, transparent 8px 16px)',
      }} />

      {/* Grille de bulles */}
      {grid.map((row, r) => row.map((color, c) => {
        if (!color) return null;
        const p = cellToXY(r, c);
        const popped = popping.has(`${r}-${c}`);
        return (
          <div key={`${r}-${c}`} className={popped ? 'anim-bubble-pop' : ''}
            style={{
              position: 'absolute',
              left: `${(p.x / BOARD_W) * 100}%`,
              top:  `${(p.y / BOARD_H) * 100}%`,
              width: `${(BUBBLE / BOARD_W) * 100}%`,
              aspectRatio: '1 / 1',
              transform: 'translate(-50%, -50%)',
            }}>
            <Bubble color={color} size={BUBBLE} />
          </div>
        );
      }))}

      {/* Bulle volante */}
      {flying && (
        <div style={{
          position: 'absolute',
          left: `${(flying.x / BOARD_W) * 100}%`,
          top:  `${(flying.y / BOARD_H) * 100}%`,
          width: `${(BUBBLE / BOARD_W) * 100}%`,
          aspectRatio: '1 / 1',
          transform: 'translate(-50%, -50%)',
        }}>
          <Bubble color={flying.color} size={BUBBLE} />
        </div>
      )}

      {/* Lanceur (cercle + flèche directionnelle) */}
      <div style={{
        position: 'absolute',
        left: `${(SHOOTER_X / BOARD_W) * 100}%`,
        top:  `${(SHOOTER_Y / BOARD_H) * 100}%`,
        width: `${(BUBBLE * 1.4 / BOARD_W) * 100}%`,
        aspectRatio: '1 / 1',
        transform: 'translate(-50%, -50%)',
      }}>
        <div className="relative w-full h-full">
          <div className="absolute inset-0 rounded-full"
            style={{
              background: 'radial-gradient(circle, #475569 0%, #1e293b 80%)',
              border: '3px solid #38bdf8',
              boxShadow: '0 4px 8px rgba(0,0,0,0.5)',
            }} />
          {/* Aiguille de visée */}
          <div className="absolute"
            style={{
              left: '50%', top: '50%',
              width: '80%', height: 6,
              transform: `translate(0, -50%) rotate(${aimAngle}rad)`,
              transformOrigin: '0% 50%',
              background: 'linear-gradient(to right, #fde047, transparent)',
              borderRadius: 3,
              pointerEvents: 'none',
            }} />
          {/* Bulle au centre du lanceur */}
          {!flying && (
            <div className="absolute" style={{
              left: '50%', top: '50%', width: '60%', aspectRatio: '1 / 1',
              transform: 'translate(-50%, -50%)',
            }}>
              <Bubble color={currentColor} />
            </div>
          )}
        </div>
      </div>

      {/* Aperçu prochaine bulle */}
      <div className="absolute" style={{
        right: 8, bottom: 8, width: 36, height: 36,
      }}>
        <Bubble color={nextColor} size={36} />
      </div>
    </div>
  );
}
