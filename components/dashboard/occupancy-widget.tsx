'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import {
  BedDouble, Settings, X, Save, Loader2, TrendingUp, Maximize2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useEffectiveRole } from '@/lib/use-effective-role';

const SETTING_START = 'occupancy_start_date';

interface ResidentRow {
  id: string;
  archived: boolean | null;
  date_entree: string | null;
  date_sortie: string | null;
  room: string | null;
  last_name: string | null;
}

function toDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s + 'T12:00:00');
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetween(start: Date, end: Date): number {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1);
}

export function OccupancyWidget() {
  const supabase = createClient();
  const qc = useQueryClient();
  const isAdmin = useEffectiveRole() === 'admin';
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    return d;
  }, []);
  const isoToday = today.toISOString().slice(0, 10);

  // Date de début par défaut :
  // - 2026 : 1er mai (mise en service du module, pas de données antérieures)
  // - 2027+ : 1er janvier
  const defaultStart = useMemo(() => {
    const y = today.getFullYear();
    return y === 2026 ? '2026-05-01' : `${y}-01-01`;
  }, [today]);

  // ── Settings (date de début uniquement ; total chambres dérivé des résidents)
  const { data: startDate = defaultStart } = useQuery({
    queryKey: ['settings', SETTING_START, defaultStart],
    queryFn: async () => {
      const { data } = await supabase.from('settings').select('value').eq('key', SETTING_START).maybeSingle();
      const v = data?.value;
      const saved = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
      // Si la valeur sauvegardée est d'une année antérieure à l'année courante,
      // on passe au 1er janvier de l'année courante (réinitialisation auto).
      if (saved) {
        const savedYear = parseInt(saved.slice(0, 4));
        if (savedYear < today.getFullYear()) {
          const newStart = `${today.getFullYear()}-01-01`;
          await supabase.from('settings').upsert({
            key: SETTING_START, value: newStart, updated_at: new Date().toISOString(),
          }, { onConflict: 'key' });
          return newStart;
        }
        return saved;
      }
      // Aucune valeur : on insère la valeur par défaut
      await supabase.from('settings').upsert({
        key: SETTING_START, value: defaultStart, updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });
      return defaultStart;
    },
    staleTime: 60_000,
  });

  // ── Résidents (tous, y compris archivés, pour le calcul historique)
  const { data: residents = [] } = useQuery({
    queryKey: ['residents-occupancy'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('residents')
        .select('id, archived, date_entree, date_sortie, room, last_name');
      if (error) throw error;
      return (data ?? []) as ResidentRow[];
    },
    staleTime: 30_000,
  });

  // Nombre total de chambres = nombre de lignes résidents actifs (occupées + placeholders vides)
  // Méthode identique à la page PAP (resident row = 1 chambre).
  const totalRooms = useMemo(
    () => residents.filter(r => !r.archived).length,
    [residents],
  );

  // ── Computation
  const stats = useMemo(() => {
    const start = toDate(startDate) || today;
    if (start.getTime() > today.getTime() || totalRooms <= 0) {
      return { rate: 0, occupiedDays: 0, totalDays: 0, monthly: [] as { label: string; rate: number }[] };
    }
    const periodDays = daysBetween(start, today);
    const possible = totalRooms * periodDays;

    // Person-days
    let occupiedDays = 0;
    for (const r of residents) {
      // Ignore les chambres placeholder vides (résident sans nom)
      if (!r.last_name?.trim()) continue;
      const entree = toDate(r.date_entree) || start;
      const sortie = r.date_sortie ? toDate(r.date_sortie) : (r.archived ? null : today);
      // Si pas de sortie et archivé sans date → on ignore (donnée incomplète)
      if (r.archived && !r.date_sortie) continue;
      const rStart = entree.getTime() > start.getTime() ? entree : start;
      const rEnd = sortie && sortie.getTime() < today.getTime() ? sortie : today;
      if (rEnd.getTime() < rStart.getTime()) continue;
      occupiedDays += daysBetween(rStart, rEnd);
    }
    const rate = possible > 0 ? (occupiedDays / possible) * 100 : 0;

    // Monthly breakdown (depuis start jusqu'à today, max 12 mois en arrière)
    const monthly: { label: string; rate: number }[] = [];
    const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
    let cur = new Date(start.getFullYear(), start.getMonth(), 1, 12, 0, 0);
    const endMonth = new Date(today.getFullYear(), today.getMonth(), 1, 12, 0, 0);
    while (cur.getTime() <= endMonth.getTime()) {
      const monthStart = new Date(Math.max(cur.getTime(), start.getTime()));
      monthStart.setHours(12, 0, 0, 0);
      const nextMonth = new Date(cur.getFullYear(), cur.getMonth() + 1, 0, 12, 0, 0); // dernier jour du mois
      const monthEnd = new Date(Math.min(nextMonth.getTime(), today.getTime()));
      monthEnd.setHours(12, 0, 0, 0);
      const mDays = daysBetween(monthStart, monthEnd);
      const mPossible = totalRooms * mDays;
      let mOccupied = 0;
      for (const r of residents) {
        if (!r.last_name?.trim()) continue;
        if (r.archived && !r.date_sortie) continue;
        const entree = toDate(r.date_entree) || monthStart;
        const sortie = r.date_sortie ? toDate(r.date_sortie) : (r.archived ? null : today);
        const rStart = entree.getTime() > monthStart.getTime() ? entree : monthStart;
        const rEnd = sortie && sortie.getTime() < monthEnd.getTime() ? sortie : monthEnd;
        if (rEnd.getTime() < rStart.getTime()) continue;
        mOccupied += daysBetween(rStart, rEnd);
      }
      monthly.push({
        label: `${monthNames[cur.getMonth()]} ${String(cur.getFullYear()).slice(2)}`,
        rate: mPossible > 0 ? (mOccupied / mPossible) * 100 : 0,
      });
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1, 12, 0, 0);
    }

    return { rate, occupiedDays, totalDays: possible, monthly };
  }, [residents, totalRooms, startDate, today]);

  // ── Save settings mutation
  const saveSettings = useMutation({
    mutationFn: async ({ start }: { start: string }) => {
      await supabase.from('settings').upsert({
        key: SETTING_START, value: start, updated_at: new Date().toISOString(),
      }, { onConflict: 'key' });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', SETTING_START] });
      setSettingsOpen(false);
      toast.success('Réglages enregistrés');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const ratePct = Math.round(stats.rate * 10) / 10;
  const rateColor = ratePct >= 95 ? '#16a34a' : ratePct >= 85 ? '#0284c7' : ratePct >= 70 ? '#d97706' : '#dc2626';

  const fmtFR = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR');

  return (
    <>
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 cursor-pointer hover:shadow-md hover:border-blue-200 transition-all relative group"
        onClick={() => setDetailsOpen(true)}
        role="button"
        title="Voir le détail">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <BedDouble className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">Taux d&apos;occupation</p>
              <p className="text-xs text-slate-500">
                Année {new Date(startDate + 'T12:00:00').getFullYear()} · depuis le {fmtFR(startDate)}
              </p>
              {startDate === '2026-05-01' && (
                <p className="text-[10px] text-amber-700 mt-0.5 italic">
                  Pas d&apos;informations antérieures pour cette année (module mis en service en mai 2026).
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg text-slate-400">
              <Maximize2 className="h-3.5 w-3.5" />
            </span>
            {isAdmin && (
              <button onClick={e => { e.stopPropagation(); setSettingsOpen(true); }}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700"
                title="Réglages (admin)">
                <Settings className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {totalRooms === 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
            Aucune chambre détectée. Ajoute d&apos;abord les résidents dans « Gestion des résidents ».
          </div>
        ) : (
          <>
            <div className="flex items-end gap-2 mb-3">
              <span className="text-4xl font-extrabold tabular-nums" style={{ color: rateColor }}>{ratePct}</span>
              <span className="text-xl font-bold text-slate-400 pb-1">%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-2 mb-2">
              <div className="h-2 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, ratePct)}%`, background: rateColor }} />
            </div>
            <p className="text-[11px] text-slate-500">
              {totalRooms} chambres · {Math.round(stats.occupiedDays)} jours-résidents sur {Math.round(stats.totalDays)} possibles
            </p>

            {stats.monthly.length > 1 && (
              <div className="mt-4">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" /> Évolution mensuelle
                </p>
                <div className="flex items-end gap-1 h-20">
                  {stats.monthly.map((m, i) => {
                    const h = Math.max(2, Math.min(100, m.rate));
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                        <div className="text-[8px] text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
                          {Math.round(m.rate)}%
                        </div>
                        <div className="w-full rounded-t transition-all"
                          style={{ height: `${h}%`, background: rateColor, opacity: 0.7 + (m.rate / 100) * 0.3 }}
                          title={`${m.label} : ${Math.round(m.rate * 10) / 10}%`} />
                        <div className="text-[9px] text-slate-400 -rotate-45 origin-top-left">{m.label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {settingsOpen && (
        <SettingsModal
          totalRooms={totalRooms}
          startDate={startDate}
          saving={saveSettings.isPending}
          onClose={() => setSettingsOpen(false)}
          onSave={(start) => saveSettings.mutate({ start })}
        />
      )}

      {detailsOpen && (
        <DetailsModal
          startDate={startDate}
          today={today}
          totalRooms={totalRooms}
          residents={residents}
          rate={stats.rate}
          monthly={stats.monthly}
          onClose={() => setDetailsOpen(false)}
        />
      )}
    </>
  );
}

function SettingsModal({
  totalRooms, startDate, saving, onClose, onSave,
}: {
  totalRooms: number;
  startDate: string;
  saving: boolean;
  onClose: () => void;
  onSave: (start: string) => void;
}) {
  const [start, setStart] = useState(startDate);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold text-slate-900">Réglages — Taux d&apos;occupation</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700">
            <b>{totalRooms}</b> chambres détectées dans « Gestion des résidents ».
            <p className="text-[11px] text-slate-500 mt-0.5 italic">
              Le total est mis à jour automatiquement quand une chambre est ajoutée ou retirée.
            </p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1 uppercase">Date de début de comptage</label>
            <input type="date" value={start}
              onChange={e => setStart(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400" />
            <p className="text-[11px] text-slate-500 mt-1">
              Le taux d&apos;occupation sera calculé entre cette date et aujourd&apos;hui.
            </p>
          </div>
        </div>
        <div className="flex gap-2 justify-end p-4 border-t">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
            Annuler
          </button>
          <button onClick={() => onSave(start)} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal détails (clic sur le widget) ───────────────────────────────────────

function DetailsModal({
  startDate, today, totalRooms, residents, rate, monthly, onClose,
}: {
  startDate: string;
  today: Date;
  totalRooms: number;
  residents: ResidentRow[];
  rate: number;
  monthly: { label: string; rate: number }[];
  onClose: () => void;
}) {
  const start = toDate(startDate) || today;
  const fmt = (iso: string | null | undefined) => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR') : '—';

  // Période visible
  const periodDays = daysBetween(start, today);

  // Entrées et sorties sur la période
  const namedResidents = residents.filter(r => r.last_name?.trim());
  const entries = namedResidents
    .filter(r => r.date_entree && toDate(r.date_entree)!.getTime() >= start.getTime() && toDate(r.date_entree)!.getTime() <= today.getTime())
    .sort((a, b) => (b.date_entree || '').localeCompare(a.date_entree || ''));
  const exits = namedResidents
    .filter(r => r.date_sortie && toDate(r.date_sortie)!.getTime() >= start.getTime() && toDate(r.date_sortie)!.getTime() <= today.getTime())
    .sort((a, b) => (b.date_sortie || '').localeCompare(a.date_sortie || ''));

  // Durée moyenne de séjour des sortis dans la période
  const avgStayDays = (() => {
    if (exits.length === 0) return null;
    const total = exits.reduce((sum, r) => {
      const e = toDate(r.date_entree) || start;
      const s = toDate(r.date_sortie)!;
      return sum + Math.max(0, Math.floor((s.getTime() - e.getTime()) / 86400000));
    }, 0);
    return Math.round(total / exits.length);
  })();

  // Chambres actuellement occupées vs vides
  const currentlyOccupied = namedResidents.filter(r => !r.archived).length;
  const currentlyEmpty = totalRooms - currentlyOccupied;

  const ratePct = Math.round(rate * 10) / 10;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="font-semibold text-slate-900">Détail du taux d&apos;occupation</h2>
            <p className="text-xs text-slate-500">
              Année {start.getFullYear()} · {fmt(startDate)} → {today.toLocaleDateString('fr-FR')} ({periodDays} jours)
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5">
          {/* Résumé chiffré */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Taux moyen" value={`${ratePct}%`} accent="blue" />
            <Stat label="Chambres" value={`${currentlyOccupied}/${totalRooms}`} sub={`${currentlyEmpty} vide${currentlyEmpty > 1 ? 's' : ''}`} accent="slate" />
            <Stat label="Entrées (période)" value={`${entries.length}`} accent="emerald" />
            <Stat label="Sorties (période)" value={`${exits.length}`} accent="amber" />
          </div>

          {avgStayDays !== null && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700">
              Durée moyenne de séjour (parmi les sortis sur la période) : <b>{avgStayDays} jours</b>
              {avgStayDays > 365 ? ` (~${(avgStayDays / 365).toFixed(1)} ans)` : ''}
            </div>
          )}

          {/* Tableau mensuel */}
          {monthly.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">Évolution mensuelle</h3>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="text-left px-3 py-2">Mois</th>
                      <th className="text-right px-3 py-2">Taux</th>
                      <th className="px-3 py-2">Visualisation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthly.map((m, i) => {
                      const pct = Math.round(m.rate * 10) / 10;
                      const color = pct >= 95 ? '#16a34a' : pct >= 85 ? '#0284c7' : pct >= 70 ? '#d97706' : '#dc2626';
                      return (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="px-3 py-2 font-medium text-slate-700">{m.label}</td>
                          <td className="px-3 py-2 text-right font-bold tabular-nums" style={{ color }}>{pct}%</td>
                          <td className="px-3 py-2">
                            <div className="w-full bg-slate-100 rounded-full h-2">
                              <div className="h-2 rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Entrées récentes */}
          {entries.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-emerald-700 uppercase tracking-wide mb-2">Entrées sur la période ({entries.length})</h3>
              <div className="border border-emerald-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {entries.map(r => (
                      <tr key={r.id} className="border-t border-emerald-100 first:border-t-0">
                        <td className="px-3 py-1.5 text-slate-700">
                          {(r.last_name || '').toUpperCase()} · Ch. {r.room || '—'}
                        </td>
                        <td className="px-3 py-1.5 text-right text-xs text-slate-500">{fmt(r.date_entree)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sorties récentes */}
          {exits.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2">Sorties sur la période ({exits.length})</h3>
              <div className="border border-amber-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {exits.map(r => (
                      <tr key={r.id} className="border-t border-amber-100 first:border-t-0">
                        <td className="px-3 py-1.5 text-slate-700">
                          {(r.last_name || '').toUpperCase()} · Ch. {r.room || '—'}
                        </td>
                        <td className="px-3 py-1.5 text-right text-xs text-slate-500">{fmt(r.date_sortie)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end p-4 border-t">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent: 'blue' | 'slate' | 'emerald' | 'amber' }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
    slate: 'bg-slate-50 border-slate-200 text-slate-800',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
  };
  return (
    <div className={`border rounded-lg px-3 py-2 ${colors[accent]}`}>
      <div className="text-2xl font-bold leading-none">{value}</div>
      <div className="text-[11px] font-medium mt-1 opacity-80">{label}</div>
      {sub && <div className="text-[10px] opacity-60 mt-0.5">{sub}</div>}
    </div>
  );
}
