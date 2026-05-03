'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Play, Trophy, Loader2, Timer, Award } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ─────────────────────────────────────────────────────────────────────────────
// Difficultés et constantes du gameplay
// ─────────────────────────────────────────────────────────────────────────────

export type Difficulty = 'debutant' | 'facile' | 'complique' | 'challenge';

interface DiffSettings {
  moleSpeed: number;   // ms entre 2 apparitions
  decoyRatio: number;  // probabilité d'un leurre
  penalty: number;     // score retiré en cas de hit leurre
  label: string;
  color: string;
}

const SETTINGS: Record<Difficulty, DiffSettings> = {
  debutant:  { moleSpeed: 1000, decoyRatio: 0.15, penalty: 1, label: 'Débutant',  color: 'bg-emerald-500' },
  facile:    { moleSpeed: 850,  decoyRatio: 0.25, penalty: 1, label: 'Facile',    color: 'bg-blue-500'    },
  complique: { moleSpeed: 700,  decoyRatio: 0.40, penalty: 2, label: 'Compliqué', color: 'bg-orange-500'  },
  challenge: { moleSpeed: 550,  decoyRatio: 0.55, penalty: 3, label: 'Challenge', color: 'bg-red-600'     },
};

const GAME_TIME = 40;
const HERO = 'dadou';
const DECOYS = ['momo', 'pierre', 'flo', 'marie'] as const;

const IMG: Record<string, string> = {
  dadou:  '/chop-dadou/dadou.jpg',
  momo:   '/chop-dadou/momo.jpg',
  pierre: '/chop-dadou/pierre.jpg',
  flo:    '/chop-dadou/flo.jpg',
  marie:  '/chop-dadou/marie.jpg',
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
}

const EMPTY_HOLES: MoleState[] = Array.from({ length: 9 }, () => ({ visible: false, character: HERO }));

export function ChopDadouModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();

  const [phase, setPhase] = useState<'menu' | 'play' | 'over' | 'scores'>('menu');
  const [difficulty, setDifficulty] = useState<Difficulty>('debutant');
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_TIME);
  const [holes, setHoles] = useState<MoleState[]>(EMPTY_HOLES);
  const [splashes, setSplashes] = useState<boolean[]>(Array(9).fill(false));
  const [scoresTab, setScoresTab] = useState<Difficulty>('debutant');
  const [playerName, setPlayerName] = useState('');
  const [scoreSaved, setScoreSaved] = useState(false);

  const moleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Cleanup intervals ────────────────────────────────────────────────────
  const stopAllTimers = useCallback(() => {
    if (moleTimerRef.current) { clearInterval(moleTimerRef.current); moleTimerRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
  }, []);

  // ── Reset à la fermeture ────────────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      stopAllTimers();
      setPhase('menu');
      setScore(0);
      setTimeLeft(GAME_TIME);
      setHoles(EMPTY_HOLES);
      setPlayerName('');
      setScoreSaved(false);
    }
  }, [open, stopAllTimers]);

  // ── Démarrage de la partie ───────────────────────────────────────────────
  const startGame = (d: Difficulty) => {
    setDifficulty(d);
    setScore(0);
    setTimeLeft(GAME_TIME);
    setHoles(EMPTY_HOLES);
    setSplashes(Array(9).fill(false));
    setScoreSaved(false);
    setPhase('play');
  };

  // ── Compte à rebours ─────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'play') return;
    countdownRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          stopAllTimers();
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
    if (hole.character === HERO) {
      setScore(s => s + 1);
    } else {
      setScore(s => Math.max(0, s - settings.penalty));
    }
    setHoles(prev => prev.map((h, i) => i === idx ? { ...h, visible: false } : h));
    setSplashes(prev => prev.map((s, i) => i === idx ? true : s));
    setTimeout(() => {
      setSplashes(prev => prev.map((s, i) => i === idx ? false : s));
    }, 400);
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

  const handleClose = () => {
    stopAllTimers();
    onClose();
  };

  // ── Scores Top 10 ────────────────────────────────────────────────────────
  const { data: scoreboard = [], isLoading: loadingScores } = useQuery({
    queryKey: ['chop_dadou_scores', scoresTab],
    queryFn: () => fetchScores(scoresTab),
    enabled: phase === 'scores' || phase === 'over',
  });

  if (!open) return null;

  // ─────────────────────────────────────────────────────────────────────────
  // Rendu
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{
        background: 'radial-gradient(ellipse at center, #5a3416 0%, #2c1608 100%)',
      }}
    >
      {/* Carte principale style "stand de fête foraine" */}
      <div className="relative w-full max-w-2xl bg-gradient-to-b from-amber-100 to-amber-50 rounded-3xl border-[6px] border-amber-900 shadow-2xl flex flex-col max-h-[95vh]">

        {/* Bouton fermer */}
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 w-9 h-9 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-md flex items-center justify-center z-10"
          title="Quitter"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="px-6 pt-6 pb-3 text-center">
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight"
              style={{
                color: '#5a2e0a',
                textShadow: '2px 2px 0 rgba(0,0,0,0.15)',
                fontFamily: '"Comic Sans MS", "Chalkboard SE", system-ui, sans-serif',
              }}>
            🔨 Le Chop-Dadou 🔨
          </h2>
          {phase === 'play' && (
            <div className="flex items-center justify-center gap-6 mt-3">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-xl">
                <Award className="h-5 w-5" /> Score : <span className="text-2xl text-emerald-700">{score}</span>
              </div>
              <div className="flex items-center gap-2 text-amber-900 font-bold text-xl">
                <Timer className="h-5 w-5" /> <span className={cn('text-2xl', timeLeft <= 5 ? 'text-red-600 animate-pulse' : 'text-amber-800')}>{timeLeft}s</span>
              </div>
            </div>
          )}
        </div>

        {/* Corps */}
        <div className="px-4 sm:px-6 pb-4 flex-1 overflow-y-auto">

          {/* ═══ MENU ═══ */}
          {phase === 'menu' && (
            <div className="flex flex-col items-center gap-5 py-3">
              <p className="text-amber-900 text-sm sm:text-base text-center max-w-md">
                Tape sur <strong>Dadou</strong> 🥷 pour marquer ! Évite <strong>Momo, Pierre, Flo et Marie</strong> ou tu perds des points. {GAME_TIME} secondes pour battre ton record.
              </p>
              <div>
                <p className="text-xs font-bold text-amber-900 uppercase tracking-widest text-center mb-2">Choisis ta difficulté</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {(Object.keys(SETTINGS) as Difficulty[]).map(d => (
                    <button
                      key={d}
                      onClick={() => setDifficulty(d)}
                      className={cn(
                        'px-4 py-2 rounded-xl font-bold text-white text-sm transition-all border-2',
                        SETTINGS[d].color,
                        difficulty === d ? 'scale-110 shadow-lg border-amber-900' : 'opacity-70 hover:opacity-100 border-transparent',
                      )}
                    >
                      {SETTINGS[d].label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => startGame(difficulty)}
                  className="px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-lg shadow-lg flex items-center gap-2 active:scale-95 transition-transform"
                >
                  <Play className="h-5 w-5" />
                  Démarrer !
                </button>
                <button
                  onClick={() => { setScoresTab(difficulty); setPhase('scores'); }}
                  className="px-5 py-3 rounded-2xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-base shadow-lg flex items-center gap-2 active:scale-95 transition-transform"
                >
                  <Trophy className="h-5 w-5" />
                  Top 10
                </button>
              </div>
            </div>
          )}

          {/* ═══ JEU ═══ */}
          {phase === 'play' && (
            <div className="flex justify-center">
              <div className="grid grid-cols-3 gap-3 sm:gap-4">
                {holes.map((hole, idx) => (
                  <Hole
                    key={idx}
                    state={hole}
                    splash={splashes[idx]}
                    onClick={() => handleHit(idx)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ═══ FIN ═══ */}
          {phase === 'over' && (
            <div className="flex flex-col items-center gap-4 py-3">
              <h3 className="text-2xl font-black text-amber-900">Partie terminée !</h3>
              <div className="bg-white rounded-2xl border-4 border-amber-700 px-6 py-4 shadow-lg text-center">
                <p className="text-xs uppercase font-bold text-amber-700 tracking-widest">Score final</p>
                <p className="text-6xl font-black text-emerald-600 leading-none mt-1">{score}</p>
                <p className="text-xs text-amber-700 mt-1">Difficulté : {SETTINGS[difficulty].label}</p>
              </div>

              {!scoreSaved ? (
                <div className="w-full max-w-xs flex flex-col gap-2">
                  <input
                    type="text"
                    value={playerName}
                    onChange={e => setPlayerName(e.target.value)}
                    placeholder="Ton nom pour le Top 10"
                    maxLength={20}
                    className="w-full px-3 py-2 rounded-xl border-2 border-amber-300 bg-white text-center font-semibold focus:outline-none focus:border-amber-500"
                  />
                  <button
                    onClick={handleSaveScore}
                    disabled={saveMut.isPending}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}
                    Enregistrer le score
                  </button>
                </div>
              ) : (
                <p className="text-emerald-700 font-bold">✓ Score enregistré !</p>
              )}

              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => startGame(difficulty)}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-2"
                >
                  <Play className="h-4 w-4" /> Rejouer
                </button>
                <button
                  onClick={() => { setScoresTab(difficulty); setPhase('scores'); }}
                  className="px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold flex items-center gap-2"
                >
                  <Trophy className="h-4 w-4" /> Top 10
                </button>
                <button
                  onClick={() => setPhase('menu')}
                  className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold"
                >
                  Menu
                </button>
              </div>
            </div>
          )}

          {/* ═══ SCORES ═══ */}
          {phase === 'scores' && (
            <div className="py-3">
              <div className="flex flex-wrap justify-center gap-2 mb-3">
                {(Object.keys(SETTINGS) as Difficulty[]).map(d => (
                  <button
                    key={d}
                    onClick={() => setScoresTab(d)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg font-semibold text-sm transition-colors border-2',
                      scoresTab === d
                        ? `${SETTINGS[d].color} text-white border-amber-900`
                        : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300',
                    )}
                  >
                    {SETTINGS[d].label}
                  </button>
                ))}
              </div>
              <div className="bg-white rounded-2xl border-2 border-amber-300 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-amber-100 text-amber-900">
                    <tr>
                      <th className="px-3 py-2 text-left">Rang</th>
                      <th className="px-3 py-2 text-left">Joueur</th>
                      <th className="px-3 py-2 text-right">Score</th>
                      <th className="px-3 py-2 text-right hidden sm:table-cell">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingScores && (
                      <tr><td colSpan={4} className="text-center py-6 text-slate-400">
                        <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                      </td></tr>
                    )}
                    {!loadingScores && scoreboard.length === 0 && (
                      <tr><td colSpan={4} className="text-center py-6 text-slate-400 italic">Aucun score pour ce niveau</td></tr>
                    )}
                    {scoreboard.map((s, i) => (
                      <tr key={s.id} className={cn(i === 0 && 'bg-yellow-50', 'border-t border-slate-100')}>
                        <td className="px-3 py-2 font-bold">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</td>
                        <td className="px-3 py-2 font-semibold">{s.player_name}</td>
                        <td className="px-3 py-2 text-right font-bold text-emerald-700">{s.score}</td>
                        <td className="px-3 py-2 text-right text-xs text-slate-500 hidden sm:table-cell">
                          {new Date(s.created_at).toLocaleDateString('fr-FR')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-center mt-3">
                <button
                  onClick={() => setPhase('menu')}
                  className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold"
                >
                  Retour au menu
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Composant Trou
// ─────────────────────────────────────────────────────────────────────────────

function Hole({ state, splash, onClick }: { state: MoleState; splash: boolean; onClick: () => void }) {
  return (
    <div
      onMouseDown={onClick}
      onTouchStart={(e) => { e.preventDefault(); onClick(); }}
      className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-amber-900 overflow-hidden cursor-pointer select-none"
      style={{
        background: '#000',
        boxShadow: 'inset 0 8px 18px rgba(0,0,0,0.9), 0 4px 0 #6b3410',
      }}
    >
      <div
        className={cn(
          'absolute inset-x-0 bottom-0 transition-transform duration-150 ease-out',
          state.visible ? 'translate-y-0' : 'translate-y-full',
        )}
      >
        <img
          src={IMG[state.character]}
          alt={state.character}
          className="w-full h-full object-contain pointer-events-none drop-shadow-md"
          style={{ aspectRatio: '1 / 1' }}
        />
      </div>
      {splash && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-4xl animate-ping-once">
          💥
        </div>
      )}
    </div>
  );
}
