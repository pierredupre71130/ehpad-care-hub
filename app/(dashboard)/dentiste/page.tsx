'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Smile, Search, Loader2, ChevronRight, Eye, AlertTriangle, CalendarClock,
  Settings, X, Save, Trash2, Plus,
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

interface Visite {
  id: string;
  resident_id: string;
  resident_name: string | null;
  annee: number;
  date_visite: string | null;
  rdv_cabinet: string | null;
  notes: string | null;
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

function monthsBetween(isoDate: string, ref: Date = new Date()): number {
  const d = new Date(isoDate + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return Infinity;
  return (ref.getFullYear() - d.getFullYear()) * 12 + (ref.getMonth() - d.getMonth())
    - (ref.getDate() < d.getDate() ? 1 : 0);
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
  const [year, setYear] = useState(currentYear);
  const [search, setSearch] = useState('');
  const [floor, setFloor] = useState<'ALL' | 'RDC' | '1ER'>('ALL');
  const [showAlertSetting, setShowAlertSetting] = useState(false);
  const [showAlertList, setShowAlertList] = useState(false);

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

  const deleteVisite = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('dentiste_visites').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['dentiste_visites'] }); toast.success('Effacé'); },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Derived ────────────────────────────────────────────────
  // Toutes les années stockées (hors année 0 = visite d'entrée) + l'année courante + N-1
  const [extraYears, setExtraYears] = useState<number[]>([]);
  const availableYears = useMemo(() => {
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

  const visitesByResidentAll = useMemo(() => {
    const map = new Map<string, Visite[]>();
    allVisites.forEach(v => {
      const list = map.get(v.resident_id) ?? [];
      list.push(v);
      map.set(v.resident_id, list);
    });
    return map;
  }, [allVisites]);

  const lastVisitDate = (residentId: string): string | null => {
    const all = visitesByResidentAll.get(residentId) ?? [];
    const dates = all.map(v => v.date_visite).filter((d): d is string => !!d);
    if (dates.length === 0) return null;
    return dates.sort().pop()!;
  };

  // ── Alertes (résidents non vus depuis > alertMonths) ────────
  const residentsAlert = useMemo(() => {
    return residents.filter(r => {
      const last = lastVisitDate(r.id);
      if (!last) return true; // jamais vu = alerte
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
        <div className="relative z-10 max-w-6xl mx-auto px-6 py-5">
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

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
        {readOnly && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-sm text-blue-700 font-medium">
            <Eye className="h-4 w-4" /> Vous consultez cette page en lecture seule.
          </div>
        )}

        {/* Alerte > X mois */}
        {residentsAlert.length > 0 && (
          <button onClick={() => setShowAlertList(true)}
            className="w-full bg-amber-50 border border-amber-300 rounded-xl p-4 flex gap-3 items-start hover:bg-amber-100 transition-colors text-left">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="font-semibold text-amber-900 text-sm">
                {residentsAlert.length} résident{residentsAlert.length > 1 ? 's' : ''} non vu{residentsAlert.length > 1 ? 's' : ''} depuis plus de {alertMonths} mois
              </div>
              <div className="text-xs text-amber-700 mt-0.5">
                Cliquez pour voir la liste détaillée
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-amber-600" />
          </button>
        )}

        {/* Year tabs */}
        <div className="bg-white border border-slate-200 rounded-2xl p-1.5 shadow-sm flex flex-wrap gap-1">
          <button onClick={() => setYear(0)}
            className={`px-4 py-1.5 rounded-xl text-sm font-semibold transition-colors ${
              year === 0
                ? 'bg-violet-600 text-white'
                : 'bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200'
            }`}>
            Visite d&apos;entrée
          </button>
          <div className="w-px self-stretch bg-slate-200 mx-1" />
          {availableYears.map(y => (
            <button key={y} onClick={() => setYear(y)}
              className={`px-4 py-1.5 rounded-xl text-sm font-semibold transition-colors ${
                year === y ? 'bg-sky-600 text-white' : 'text-slate-500 hover:bg-slate-100'
              }`}>
              {y}
            </button>
          ))}
          <button onClick={() => {
            const min = availableYears[0] ?? currentYear;
            const max = availableYears[availableYears.length - 1] ?? currentYear;
            const def = String(max + 1);
            const input = window.prompt(
              `Quelle année ajouter ?\n(Années existantes : ${min} → ${max})`,
              def,
            );
            if (!input) return;
            const y = parseInt(input.trim());
            if (!Number.isInteger(y) || y < 1900 || y > 2200) {
              toast.error('Année invalide');
              return;
            }
            setExtraYears(prev => prev.includes(y) ? prev : [...prev, y]);
            setYear(y);
          }}
            title="Ajouter une année (passée ou future)"
            className="px-3 py-1.5 rounded-xl text-sm text-slate-400 hover:bg-slate-50 hover:text-slate-700">
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="bg-white rounded-xl border border-slate-200 p-3 flex gap-3 items-center flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un résident (nom, chambre)…"
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
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b text-xs uppercase tracking-wide text-slate-500">
                <th className="text-left px-3 py-2 w-20">Chambre</th>
                <th className="text-left px-3 py-2">Résident</th>
                <th className="text-left px-3 py-2 w-40">
                  {year === 0 ? "Date visite d'entrée" : `Visite dentiste ${year}`}
                </th>
                <th className="text-left px-3 py-2 w-40">
                  {year === 0 ? 'RDV Cabinet (entrée)' : `RDV Cabinet ${year}`}
                </th>
                <th className="text-left px-3 py-2">Notes</th>
                <th className="text-left px-3 py-2 w-28">Dernière visite</th>
              </tr>
            </thead>
            <tbody>
              {filteredResidents.map(r => {
                const v = visitesByResidentAndYear.get(`${r.id}_${year}`);
                const last = lastVisitDate(r.id);
                const overdueMonths = last ? monthsBetween(last) : Infinity;
                const isOverdue = overdueMonths >= alertMonths;
                return (
                  <ResidentRow
                    key={r.id}
                    resident={r}
                    visite={v}
                    year={year}
                    overdue={isOverdue}
                    lastDate={last}
                    readOnly={readOnly}
                    onSave={patch => saveVisite.mutate({ resident: r, annee: year, patch })}
                    onClear={() => v && deleteVisite.mutate(v.id)}
                  />
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
    </div>
  );
}

// ── Resident row with inline editable cells ─────────────────────────────────

function ResidentRow({
  resident, visite, year, overdue, lastDate, readOnly, onSave, onClear,
}: {
  resident: Resident;
  visite?: Visite;
  year: number;
  overdue: boolean;
  lastDate: string | null;
  readOnly: boolean;
  onSave: (patch: Partial<Visite>) => void;
  onClear: () => void;
}) {
  const [dateVisite, setDateVisite] = useState(visite?.date_visite || '');
  const [rdvCabinet, setRdvCabinet] = useState(visite?.rdv_cabinet || '');
  const [notes, setNotes] = useState(visite?.notes || '');
  const [editingNotes, setEditingNotes] = useState(false);

  useEffect(() => { setDateVisite(visite?.date_visite || ''); }, [visite?.date_visite]);
  useEffect(() => { setRdvCabinet(visite?.rdv_cabinet || ''); }, [visite?.rdv_cabinet]);
  useEffect(() => { setNotes(visite?.notes || ''); }, [visite?.notes]);

  const commitField = (field: keyof Visite, value: string) => {
    const trimmed = value.trim() || null;
    onSave({ [field]: trimmed });
  };

  return (
    <tr className={`border-b last:border-0 ${overdue ? 'bg-amber-50/40' : ''} hover:bg-slate-50/40`}>
      <td className="px-3 py-2 font-semibold text-slate-700">{resident.room}</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-800">
            {resident.title} {resident.last_name} {resident.first_name}
          </span>
          {overdue && (
            <span title="Non vu depuis longtemps"
              className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded-full">
              <AlertTriangle className="h-3 w-3" /> Alerte
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2">
        <input type="date" value={dateVisite || ''}
          onChange={e => setDateVisite(e.target.value)}
          onBlur={() => dateVisite !== (visite?.date_visite || '') && commitField('date_visite', dateVisite)}
          disabled={readOnly}
          className="w-full px-2 py-1 border border-slate-200 rounded text-sm outline-none focus:border-sky-400" />
      </td>
      <td className="px-3 py-2">
        <input type="date" value={rdvCabinet || ''}
          onChange={e => setRdvCabinet(e.target.value)}
          onBlur={() => rdvCabinet !== (visite?.rdv_cabinet || '') && commitField('rdv_cabinet', rdvCabinet)}
          disabled={readOnly}
          className="w-full px-2 py-1 border border-slate-200 rounded text-sm outline-none focus:border-sky-400" />
      </td>
      <td className="px-3 py-2">
        {editingNotes ? (
          <div className="flex gap-1 items-center">
            <input value={notes} onChange={e => setNotes(e.target.value)} autoFocus
              onKeyDown={e => { if (e.key === 'Enter') { commitField('notes', notes); setEditingNotes(false); } }}
              onBlur={() => { if (notes !== (visite?.notes || '')) commitField('notes', notes); setEditingNotes(false); }}
              className="flex-1 px-2 py-1 border border-sky-300 rounded text-sm outline-none" />
          </div>
        ) : (
          <button onClick={() => !readOnly && setEditingNotes(true)} disabled={readOnly}
            className="w-full text-left text-sm text-slate-600 px-2 py-1 hover:bg-slate-100 rounded min-h-[24px]">
            {notes || <span className="text-slate-300 italic">—</span>}
          </button>
        )}
      </td>
      <td className="px-3 py-2 text-xs whitespace-nowrap">
        {lastDate
          ? <span className={overdue ? 'text-amber-700 font-semibold' : 'text-slate-500'}>{fmtFR(lastDate)}</span>
          : <span className="text-slate-300 italic">Jamais</span>}
        {visite && !readOnly && (
          <button onClick={onClear}
            title="Effacer cette année"
            className="ml-2 p-1 rounded hover:bg-red-50 text-slate-300 hover:text-red-600">
            <Trash2 className="h-3 w-3 inline" />
          </button>
        )}
      </td>
    </tr>
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
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
            Annuler
          </button>
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
                      {r.title} {r.last_name} {r.first_name}
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
