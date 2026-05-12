'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Smile, Search, Loader2, ChevronRight, Eye, AlertTriangle, CalendarClock,
  Settings, X, Save, Plus, Trash2, MessageSquare,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useModuleAccess } from '@/lib/use-module-access';
import { fetchColorOverrides, type ColorOverrides } from '@/lib/module-colors';
import { MODULES } from '@/components/dashboard/module-config';

// ── Types ────────────────────────────────────────────────────────────────────

interface Resident {
  id: string;
  title: string;
  first_name: string;
  last_name: string;
  room: string;
  floor?: string | null;
  archived?: boolean;
}

interface VisitEntry {
  id: string;
  date: string; // YYYY-MM-DD
  type: 'visite' | 'rdv';
  note: string | null;
}

interface Visite {
  id: string;
  resident_id: string;
  resident_name: string | null;
  annee: number; // 0 = visite d'entrée
  date_visite: string | null;        // legacy
  rdv_cabinet: string | null;        // legacy single
  rdv_cabinets: string | null;       // legacy CSV
  notes: string | null;              // legacy single note
  entries: VisitEntry[] | null;      // nouveau modèle (jsonb)
  created_at?: string;
  updated_at?: string;
}

const SETTING_ALERT_MONTHS = 'dentiste_alert_months';

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtFR(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR');
}

function shortInitial(prenom: string | null | undefined): string {
  if (!prenom) return '';
  const first = prenom.trim().charAt(0);
  if (!first) return '';
  return first.toUpperCase() + '.';
}

function monthsBetween(isoDate: string, ref: Date = new Date()): number {
  const d = new Date(isoDate + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return Infinity;
  return (ref.getFullYear() - d.getFullYear()) * 12 + (ref.getMonth() - d.getMonth())
    - (ref.getDate() < d.getDate() ? 1 : 0);
}

function parseCsvDates(csv: string | null | undefined): string[] {
  if (!csv) return [];
  return csv.split(',').map(s => s.trim()).filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s));
}

function allRdvDates(v: Visite | undefined): string[] {
  if (!v) return [];
  const list = parseCsvDates(v.rdv_cabinets);
  if (v.rdv_cabinet && /^\d{4}-\d{2}-\d{2}$/.test(v.rdv_cabinet) && !list.includes(v.rdv_cabinet)) {
    list.push(v.rdv_cabinet);
  }
  return list.sort();
}

function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// Lit la liste des entrées (visites + rdv) en repliant sur les champs legacy
// si la colonne `entries` n'est pas encore renseignée pour cette ligne.
function getEntries(v: Visite | undefined): VisitEntry[] {
  if (!v) return [];
  if (Array.isArray(v.entries) && v.entries.length > 0) return [...v.entries].sort(byDateAsc);
  const out: VisitEntry[] = [];
  if (v.date_visite && /^\d{4}-\d{2}-\d{2}$/.test(v.date_visite)) {
    out.push({ id: newId(), date: v.date_visite, type: 'visite', note: v.notes || null });
  }
  allRdvDates(v).forEach(d => out.push({ id: newId(), date: d, type: 'rdv', note: null }));
  return out.sort(byDateAsc);
}

function byDateAsc(a: VisitEntry, b: VisitEntry): number {
  return a.date.localeCompare(b.date);
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function DentistePage() {
  const supabase = createClient();
  const qc = useQueryClient();
  const access = useModuleAccess('dentiste');
  const readOnly = access === 'read';

  const { data: colorOverrides = {} } = useQuery<ColorOverrides>({
    queryKey: ['settings', 'module_colors'],
    queryFn: fetchColorOverrides,
    staleTime: 30000,
  });
  const mod = MODULES.find(m => m.id === 'dentiste');
  const colorFrom = colorOverrides['dentiste']?.from ?? mod?.cardFrom ?? '#0891b2';
  const colorTo = colorOverrides['dentiste']?.to ?? mod?.cardTo ?? '#075985';

  const currentYear = new Date().getFullYear();
  const [search, setSearch] = useState('');
  const [floor, setFloor] = useState<'ALL' | 'RDC' | '1ER'>('ALL');
  const [extraYears, setExtraYears] = useState<number[]>([]);
  const [showAlertSetting, setShowAlertSetting] = useState(false);
  const [showAlertList, setShowAlertList] = useState(false);
  const [editing, setEditing] = useState<{ resident: Resident; annee: number; entries: VisitEntry[] } | null>(null);

  // ── Settings (alert threshold) ──────────────────────────────
  const { data: alertMonths = 12 } = useQuery({
    queryKey: ['settings', SETTING_ALERT_MONTHS],
    queryFn: async () => {
      const { data } = await supabase.from('settings').select('value').eq('key', SETTING_ALERT_MONTHS).maybeSingle();
      const v = data?.value;
      if (typeof v === 'number') return v;
      if (typeof v === 'string') return parseInt(v) || 12;
      return 12;
    },
    staleTime: 60_000,
  });

  // ── Queries ────────────────────────────────────────────────
  const { data: residents = [], isLoading: loadingResidents } = useQuery({
    queryKey: ['residents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('residents').select('id, title, first_name, last_name, room, floor, archived')
        .eq('archived', false).order('last_name');
      if (error) throw error;
      return (data ?? []) as Resident[];
    },
  });

  const { data: allVisites = [], isLoading: loadingVisites } = useQuery({
    queryKey: ['dentiste_visites'],
    queryFn: async () => {
      const { data, error } = await supabase.from('dentiste_visites').select('*');
      if (error) throw error;
      return (data ?? []) as Visite[];
    },
  });

  // ── Mutations ──────────────────────────────────────────────
  const saveVisite = useMutation({
    mutationFn: async ({ resident, annee, patch }: { resident: Resident; annee: number; patch: Partial<Visite> }) => {
      const existing = allVisites.find(v => v.resident_id === resident.id && v.annee === annee);
      const payload: Partial<Visite> = {
        resident_id: resident.id,
        resident_name: `${resident.last_name} ${resident.first_name}`.trim(),
        annee,
        ...patch,
        updated_at: new Date().toISOString(),
      };
      if (existing) {
        const { error } = await supabase.from('dentiste_visites').update(payload).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('dentiste_visites').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dentiste_visites'] }),
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Derived ────────────────────────────────────────────────
  // Toutes les années stockées (hors année 0 = visite d'entrée) + l'année courante + N-1
  const yearColumns = useMemo(() => {
    const ys = new Set<number>();
    allVisites.forEach(v => { if (v.annee > 0) ys.add(v.annee); });
    ys.add(currentYear);
    ys.add(currentYear - 1);
    extraYears.forEach(y => ys.add(y));
    return [...ys].sort((a, b) => a - b);
  }, [allVisites, currentYear, extraYears]);

  const visitesByResidentAndYear = useMemo(() => {
    const map = new Map<string, Visite>();
    allVisites.forEach(v => map.set(`${v.resident_id}_${v.annee}`, v));
    return map;
  }, [allVisites]);

  const visitesByResident = useMemo(() => {
    const map = new Map<string, Visite[]>();
    allVisites.forEach(v => {
      const list = map.get(v.resident_id) ?? [];
      list.push(v);
      map.set(v.resident_id, list);
    });
    return map;
  }, [allVisites]);

  const lastVisitDate = (residentId: string): string | null => {
    const all = visitesByResident.get(residentId) ?? [];
    const dates: string[] = [];
    all.forEach(v => getEntries(v).forEach(e => dates.push(e.date)));
    if (dates.length === 0) return null;
    return dates.sort().pop()!;
  };

  // ── Alertes ─────────────────────────────────────────────────
  const residentsAlert = useMemo(() => {
    return residents.filter(r => {
      const last = lastVisitDate(r.id);
      if (!last) return true;
      return monthsBetween(last) >= alertMonths;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [residents, allVisites, alertMonths]);

  // ── Filter ─────────────────────────────────────────────────
  const filteredResidents = useMemo(() => {
    const q = search.toLowerCase().trim();
    return residents
      .filter(r => floor === 'ALL' || (r.floor || '').toUpperCase() === floor)
      .filter(r => !q ||
        `${r.last_name} ${r.first_name} ${r.room}`.toLowerCase().includes(q))
      .sort((a, b) => {
        const na = parseInt((a.room || '').replace(/\D/g, '') || '0');
        const nb = parseInt((b.room || '').replace(/\D/g, '') || '0');
        return na - nb;
      });
  }, [residents, search, floor]);

  const addYearColumn = () => {
    const max = yearColumns[yearColumns.length - 1] ?? currentYear;
    const def = String(max + 1);
    const input = window.prompt(`Quelle année ajouter ?`, def);
    if (!input) return;
    const y = parseInt(input.trim());
    if (!Number.isInteger(y) || y < 1900 || y > 2200) {
      toast.error('Année invalide'); return;
    }
    setExtraYears(prev => prev.includes(y) ? prev : [...prev, y]);
  };

  if (loadingResidents || loadingVisites) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: '#dde4ee' }}>
      <div className="relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${colorFrom}, ${colorTo})` }}>
        <div className="relative z-10 max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center gap-1.5 text-white/60 text-xs mb-4">
            <Link href="/" className="hover:text-white/90">Accueil</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-white/90">Dentiste</span>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
              <Smile className="h-6 w-6 text-white" strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-white">Dentiste</h1>
              <p className="text-white/70 text-sm">Suivi des passages et rendez-vous au cabinet</p>
            </div>
            <button onClick={() => setShowAlertSetting(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/15 text-white text-sm hover:bg-white/25 transition-colors">
              <Settings className="h-4 w-4" /> Alerte ({alertMonths} mois)
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        {readOnly && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-sm text-blue-700 font-medium">
            <Eye className="h-4 w-4" /> Vous consultez cette page en lecture seule.
          </div>
        )}

        {residentsAlert.length > 0 && (
          <button onClick={() => setShowAlertList(true)}
            className="w-full bg-amber-50 border border-amber-300 rounded-xl p-4 flex gap-3 items-start hover:bg-amber-100 transition-colors text-left">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="font-semibold text-amber-900 text-sm">
                {residentsAlert.length} résident{residentsAlert.length > 1 ? 's' : ''} non vu{residentsAlert.length > 1 ? 's' : ''} depuis plus de {alertMonths} mois
              </div>
              <div className="text-xs text-amber-700 mt-0.5">Cliquez pour voir la liste détaillée</div>
            </div>
            <ChevronRight className="h-4 w-4 text-amber-600" />
          </button>
        )}

        {/* Toolbar */}
        <div className="bg-white rounded-xl border border-slate-200 p-3 flex gap-3 items-center flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher (nom, chambre)…"
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-slate-400" />
          </div>
          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg p-1">
            {([['ALL', 'Tous'], ['RDC', 'RDC'], ['1ER', '1er']] as const).map(([val, lbl]) => (
              <button key={val} onClick={() => setFloor(val)}
                className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                  floor === val ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-white'
                }`}>
                {lbl}
              </button>
            ))}
          </div>
          <button onClick={addYearColumn}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700">
            <Plus className="h-3.5 w-3.5" /> Ajouter une année
          </button>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="text-sm border-collapse" style={{ minWidth: '100%' }}>
            <thead>
              <tr className="bg-slate-50 border-b text-xs uppercase tracking-wide text-slate-500">
                <th className="text-center px-1.5 py-2 sticky left-0 bg-slate-50 z-10 w-12 border-r">Ch.</th>
                <th className="text-left px-2 py-2 sticky left-12 bg-slate-50 z-10 border-r whitespace-nowrap" style={{ width: '1%' }}>Résident</th>
                <th className="text-left px-2 py-2 bg-violet-50 border-r border-violet-200" style={{ minWidth: 170 }}>
                  Visite d&apos;entrée
                </th>
                {yearColumns.map(y => (
                  <th key={y} className="text-left px-2 py-2 border-r" style={{ minWidth: 170 }}>
                    Visite dentiste {y}
                  </th>
                ))}
                <th className="text-left px-2 py-2 w-28">Dernière</th>
              </tr>
            </thead>
            <tbody>
              {filteredResidents.map(r => {
                const last = lastVisitDate(r.id);
                const overdue = !last || monthsBetween(last) >= alertMonths;
                return (
                  <tr key={r.id} className={`border-b last:border-0 ${overdue ? 'bg-amber-50/30' : ''} hover:bg-slate-50/40`}>
                    <td className="px-1.5 py-1.5 text-center font-semibold text-slate-700 sticky left-0 bg-white z-10 border-r whitespace-nowrap">
                      {r.room}
                    </td>
                    <td className="px-2 py-1.5 sticky left-12 bg-white z-10 border-r whitespace-nowrap">
                      <span className="font-medium text-slate-800">
                        {(r.last_name || '').toUpperCase()} {shortInitial(r.first_name)}
                      </span>
                      {overdue && (
                        <AlertTriangle className="h-3 w-3 text-amber-600 inline-block ml-1" />
                      )}
                    </td>
                    <YearCell
                      visite={visitesByResidentAndYear.get(`${r.id}_0`)}
                      readOnly={readOnly}
                      tone="violet"
                      onEdit={() => setEditing({
                        resident: r, annee: 0,
                        entries: getEntries(visitesByResidentAndYear.get(`${r.id}_0`)),
                      })}
                    />
                    {yearColumns.map(y => (
                      <YearCell
                        key={y}
                        visite={visitesByResidentAndYear.get(`${r.id}_${y}`)}
                        readOnly={readOnly}
                        onEdit={() => setEditing({
                          resident: r, annee: y,
                          entries: getEntries(visitesByResidentAndYear.get(`${r.id}_${y}`)),
                        })}
                      />
                    ))}
                    <td className="px-2 py-1.5 text-xs whitespace-nowrap">
                      {last
                        ? <span className={overdue ? 'text-amber-700 font-semibold' : 'text-slate-500'}>{fmtFR(last)}</span>
                        : <span className="text-slate-300 italic">Jamais</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showAlertSetting && (
        <AlertSettingsModal current={alertMonths} onClose={() => setShowAlertSetting(false)} />
      )}

      {showAlertList && (
        <AlertListModal
          residents={residentsAlert}
          alertMonths={alertMonths}
          lastVisitDate={lastVisitDate}
          onClose={() => setShowAlertList(false)}
        />
      )}

      {editing && (
        <EntriesEditModal
          title={`${(editing.resident.last_name || '').toUpperCase()} ${shortInitial(editing.resident.first_name)}`}
          subtitle={editing.annee === 0 ? "Visite d'entrée" : `Année ${editing.annee}`}
          initial={editing.entries}
          onClose={() => setEditing(null)}
          onSave={list => {
            // Migration : on écrit entries, on neutralise les champs legacy
            saveVisite.mutate({
              resident: editing.resident,
              annee: editing.annee,
              patch: {
                entries: list,
                date_visite: null,
                rdv_cabinet: null,
                rdv_cabinets: null,
                notes: null,
              },
            });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

// ── Year cell ────────────────────────────────────────────────────────────────

function YearCell({
  visite, readOnly, onEdit, tone,
}: {
  visite?: Visite;
  readOnly: boolean;
  onEdit: () => void;
  tone?: 'violet';
}) {
  const entries = getEntries(visite);
  const bg = tone === 'violet' ? 'bg-violet-50/30' : '';
  const border = tone === 'violet' ? 'border-violet-200' : '';

  return (
    <td className={`px-1.5 py-1 border-r align-top ${bg} ${border}`} style={{ minWidth: 170 }}>
      <button onClick={onEdit} disabled={readOnly}
        className="w-full text-left space-y-0.5 hover:bg-white rounded p-1 transition-colors disabled:cursor-default">
        {entries.length === 0 ? (
          <span className="text-[11px] text-slate-300 italic">Ajouter une visite ou un RDV</span>
        ) : (
          entries.map(e => (
            <div key={e.id} className="flex items-start gap-1 text-[11px] leading-tight">
              <span className={`shrink-0 text-[9px] font-bold uppercase px-1 py-px rounded ${
                e.type === 'visite'
                  ? 'bg-sky-100 text-sky-700'
                  : 'bg-emerald-100 text-emerald-700'
              }`} title={e.type === 'visite' ? 'Visite dentiste' : 'RDV au cabinet'}>
                {e.type === 'visite' ? 'V' : 'C'}
              </span>
              <span className="font-semibold text-slate-800 whitespace-nowrap">{fmtFR(e.date)}</span>
              {e.note && (
                <MessageSquare className="h-3 w-3 text-amber-600 shrink-0" />
              )}
            </div>
          ))
        )}
        {entries.some(e => e.note) && (
          <div className="text-[10px] text-amber-900 bg-amber-50/60 border border-amber-200 rounded px-1 py-0.5 mt-0.5">
            {entries.filter(e => e.note).map(e => `${fmtFR(e.date)} : ${e.note}`).join(' · ')}
          </div>
        )}
      </button>
    </td>
  );
}

// ── Entries edit modal (multiple visits + multiple RDV, each with note) ─────

function EntriesEditModal({
  title, subtitle, initial, onClose, onSave,
}: {
  title: string;
  subtitle: string;
  initial: VisitEntry[];
  onClose: () => void;
  onSave: (list: VisitEntry[]) => void;
}) {
  const [list, setList] = useState<VisitEntry[]>(() => [...initial]);
  const [newDate, setNewDate] = useState('');
  const [newType, setNewType] = useState<'visite' | 'rdv'>('visite');

  const sorted = [...list].sort(byDateAsc);

  const add = () => {
    if (!newDate || !/^\d{4}-\d{2}-\d{2}$/.test(newDate)) return;
    setList(prev => [...prev, { id: newId(), date: newDate, type: newType, note: null }]);
    setNewDate('');
  };

  const update = (id: string, patch: Partial<VisitEntry>) =>
    setList(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));

  const remove = (id: string) =>
    setList(prev => prev.filter(e => e.id !== id));

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="font-semibold text-slate-900">{title}</h2>
            <p className="text-xs text-slate-500">{subtitle}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-4 border-b space-y-2">
          <label className="block text-xs font-semibold text-slate-600 uppercase">Ajouter une entrée</label>
          <div className="flex gap-2">
            <select value={newType} onChange={e => setNewType(e.target.value as 'visite' | 'rdv')}
              className="px-2 py-2 border border-slate-200 rounded-lg text-sm focus:border-sky-400 outline-none">
              <option value="visite">Visite dentiste</option>
              <option value="rdv">RDV cabinet</option>
            </select>
            <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && add()}
              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400" />
            <button onClick={add} disabled={!newDate}
              className="flex items-center gap-1 px-3 py-2 rounded-lg bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700 disabled:opacity-40">
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-3 space-y-2">
          {sorted.length === 0 ? (
            <p className="text-sm text-slate-400 italic text-center py-4">Aucune entrée</p>
          ) : sorted.map(e => (
            <div key={e.id} className="border border-slate-200 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <select value={e.type}
                  onChange={ev => update(e.id, { type: ev.target.value as 'visite' | 'rdv' })}
                  className={`text-xs font-semibold rounded border px-2 py-1 outline-none ${
                    e.type === 'visite' ? 'bg-sky-50 border-sky-300 text-sky-800' : 'bg-emerald-50 border-emerald-300 text-emerald-800'
                  }`}>
                  <option value="visite">Visite dentiste</option>
                  <option value="rdv">RDV cabinet</option>
                </select>
                <input type="date" value={e.date}
                  onChange={ev => update(e.id, { date: ev.target.value })}
                  className="flex-1 px-2 py-1 border border-slate-200 rounded text-sm outline-none focus:border-sky-400 min-w-[130px]" />
                <button onClick={() => remove(e.id)}
                  title="Supprimer cette entrée"
                  className="p-1 rounded hover:bg-red-50 text-red-500">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <textarea value={e.note || ''} rows={2}
                placeholder="Note associée à cette date (optionnel)…"
                onChange={ev => update(e.id, { note: ev.target.value })}
                className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm outline-none focus:border-amber-400 resize-y" />
            </div>
          ))}
        </div>

        <div className="flex gap-2 justify-end p-4 border-t">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
            Annuler
          </button>
          <button
            onClick={() => onSave(list.map(e => ({ ...e, note: e.note?.trim() || null })))}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700">
            <Save className="h-4 w-4" /> Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}


// ── Alert settings modal ─────────────────────────────────────────────────────

function AlertSettingsModal({ current, onClose }: { current: number; onClose: () => void }) {
  const supabase = createClient();
  const qc = useQueryClient();
  const [value, setValue] = useState(current);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('settings')
      .upsert({ key: SETTING_ALERT_MONTHS, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    qc.invalidateQueries({ queryKey: ['settings', SETTING_ALERT_MONTHS] });
    toast.success('Alerte mise à jour');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold text-slate-900">Seuil d&apos;alerte</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-sm text-slate-600">
            Déclencher l&apos;alerte si un résident n&apos;a pas été vu depuis plus de&nbsp;:
          </p>
          <div className="flex items-center gap-2">
            <input type="number" min={1} max={60} value={value}
              onChange={e => setValue(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-24 px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-sky-400" />
            <span className="text-sm text-slate-700">mois</span>
          </div>
        </div>
        <div className="flex gap-2 justify-end p-4 border-t">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">Annuler</button>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Alert list modal ─────────────────────────────────────────────────────────

function AlertListModal({
  residents, alertMonths, lastVisitDate, onClose,
}: {
  residents: Resident[];
  alertMonths: number;
  lastVisitDate: (id: string) => string | null;
  onClose: () => void;
}) {
  const sorted = useMemo(() => {
    return [...residents].sort((a, b) => {
      const la = lastVisitDate(a.id);
      const lb = lastVisitDate(b.id);
      if (!la && !lb) return (a.last_name || '').localeCompare(b.last_name || '');
      if (!la) return -1;
      if (!lb) return 1;
      return la.localeCompare(lb);
    });
  }, [residents, lastVisitDate]);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b bg-amber-50">
          <div>
            <h2 className="font-semibold text-amber-900">Résidents à voir</h2>
            <p className="text-xs text-amber-700">
              Non vus depuis plus de {alertMonths} mois — {sorted.length} concerné{sorted.length > 1 ? 's' : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-amber-700/70 hover:text-amber-900">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-3 space-y-1.5">
          {sorted.length === 0
            ? <p className="text-sm text-slate-400 text-center py-6">Aucun résident en alerte 🎉</p>
            : sorted.map(r => {
              const last = lastVisitDate(r.id);
              return (
                <div key={r.id} className="flex items-center justify-between gap-3 border border-slate-100 rounded-xl px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-800 truncate">
                      {(r.last_name || '').toUpperCase()} {shortInitial(r.first_name)}
                    </div>
                    <div className="text-xs text-slate-500">Ch. {r.room}</div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs shrink-0">
                    <CalendarClock className="h-3.5 w-3.5 text-amber-600" />
                    <span className="font-semibold text-amber-700">
                      {last ? fmtFR(last) : 'Jamais vu'}
                    </span>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

