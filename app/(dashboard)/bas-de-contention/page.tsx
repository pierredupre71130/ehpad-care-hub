'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Footprints, ChevronRight, Plus, Pencil, Trash2, X, Check,
  Eye, Loader2, Search,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { useModuleAccess } from '@/lib/use-module-access';
import { useEffectiveRole } from '@/lib/use-effective-role';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type Sexe = 'Femme' | 'Homme';
type ProductType = 'Chaussette' | 'Bas';

interface RawMesures {
  a?: string; b?: string; c?: string;
  d?: string; e?: string; f?: string;
}

interface Result {
  text?: string;
  className?: string;
}

interface BasContentionRecord {
  id: string;
  resident_id: string | null;
  chambre: string;
  nom: string;
  prenom: string;
  sexe: Sexe;
  product_type: ProductType;
  raw_mesures: RawMesures;
  result: Result;
  prioritize_mollet: boolean;
  date_cmd_1: string | null;
  date_cmd_2: string | null;
  created_at?: string;
  updated_at?: string;
}

type BasContentionInput = Omit<BasContentionRecord, 'id' | 'created_at' | 'updated_at'>;

interface ResidentLite {
  id: string;
  room: string;
  title: string;
  first_name: string;
  last_name: string;
}

const TABLE = 'bas_contention';
const PRODUCT_OPTIONS: ProductType[] = ['Chaussette', 'Bas'];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function getFloor(chambre: string): 'rdc' | 'etage' {
  const n = parseInt(chambre, 10);
  return !Number.isNaN(n) && n < 100 ? 'rdc' : 'etage';
}

function formatProperCase(str: string): string {
  if (!str) return '';
  return str.toLowerCase().replace(/(^|[-\s])(.)/g, (_m, sep, l) => sep + l.toUpperCase());
}

function compareChambre(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function summarizeMesures(m: RawMesures | null | undefined): string {
  if (!m) return '';
  const parts: string[] = [];
  if (m.a) parts.push(`A:${m.a}`);
  if (m.b) parts.push(`B:${m.b}`);
  if (m.c) parts.push(`C:${m.c}`);
  if (m.d) parts.push(`D:${m.d}`);
  if (m.e) parts.push(`E:${m.e}`);
  if (m.f) parts.push(`F:${m.f}`);
  return parts.join(' ');
}

function fmtDateFR(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR');
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPABASE
// ─────────────────────────────────────────────────────────────────────────────

async function fetchRows(): Promise<BasContentionRecord[]> {
  const sb = createClient();
  const { data, error } = await sb.from(TABLE).select('*');
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as BasContentionRecord[];
  rows.sort((a, b) => compareChambre(a.chambre, b.chambre));
  return rows;
}

async function fetchResidentsLite(): Promise<ResidentLite[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from('residents')
    .select('id, room, title, first_name, last_name')
    .eq('archived', false)
    .order('last_name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ResidentLite[];
}

async function createRow(payload: BasContentionInput): Promise<BasContentionRecord> {
  const sb = createClient();
  const { data, error } = await sb.from(TABLE).insert(payload).select().single();
  if (error) throw new Error(error.message);
  return data as BasContentionRecord;
}

async function updateRow(id: string, patch: Partial<BasContentionInput>): Promise<void> {
  const sb = createClient();
  const { error } = await sb
    .from(TABLE)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

async function deleteRow(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from(TABLE).delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTOCOMPLÉTION RÉSIDENT (pattern identique à Déclaration de chute)
// ─────────────────────────────────────────────────────────────────────────────

function PatientNameAutocomplete({
  value, onChange, onSelectResident, disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelectResident: (r: ResidentLite) => void;
  disabled?: boolean;
}) {
  const { data: residents = [] } = useQuery({
    queryKey: ['residents'],
    queryFn: fetchResidentsLite,
  });

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const suggestions = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return [];
    return residents
      .filter(r =>
        r.last_name?.toLowerCase().includes(q) ||
        r.first_name?.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [residents, value]);

  return (
    <div className="relative" ref={containerRef}>
      <input
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Commencez à saisir le nom…"
        disabled={disabled}
        autoComplete="off"
        className={cn(
          'w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-800 placeholder:text-slate-400',
          'focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-100',
          'disabled:bg-slate-50 disabled:cursor-not-allowed',
        )}
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-auto">
          {suggestions.map(r => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => { onSelectResident(r); setOpen(false); }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-cyan-50 flex items-center justify-between gap-2"
              >
                <span className="text-slate-800">
                  <span className="font-medium">{r.last_name}</span>{' '}
                  <span className="text-slate-600">{r.first_name}</span>
                </span>
                <span className="text-xs text-slate-400">Ch. {r.room}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODALE FORMULAIRE PATIENT
// ─────────────────────────────────────────────────────────────────────────────

interface FormState {
  resident_id: string | null;
  chambre: string;
  nom: string;
  prenom: string;
  sexe: Sexe;
  product_type: ProductType;
  raw_mesures: RawMesures;
  prioritize_mollet: boolean;
  date_cmd_1: string;
  date_cmd_2: string;
}

function emptyForm(): FormState {
  return {
    resident_id: null,
    chambre: '',
    nom: '',
    prenom: '',
    sexe: 'Femme',
    product_type: 'Chaussette',
    raw_mesures: {},
    prioritize_mollet: true,
    date_cmd_1: '',
    date_cmd_2: '',
  };
}

function recordToForm(r: BasContentionRecord): FormState {
  return {
    resident_id: r.resident_id,
    chambre: r.chambre,
    nom: r.nom,
    prenom: r.prenom,
    sexe: r.sexe,
    product_type: r.product_type,
    raw_mesures: r.raw_mesures ?? {},
    prioritize_mollet: r.prioritize_mollet,
    date_cmd_1: r.date_cmd_1 ?? '',
    date_cmd_2: r.date_cmd_2 ?? '',
  };
}

function formToInput(f: FormState, existing?: BasContentionRecord): BasContentionInput {
  return {
    resident_id: f.resident_id,
    chambre: f.chambre.trim(),
    nom: f.nom.trim().toUpperCase(),
    prenom: formatProperCase(f.prenom.trim()),
    sexe: f.sexe,
    product_type: f.product_type,
    raw_mesures: f.raw_mesures,
    result: existing?.result ?? {},
    prioritize_mollet: f.prioritize_mollet,
    date_cmd_1: f.date_cmd_1 || null,
    date_cmd_2: f.date_cmd_2 || null,
  };
}

function MesureInput({
  label, value, onChange, required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-700 mb-1">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="ex : 32 ou 31/33"
        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-100"
      />
    </div>
  );
}

function PatientFormModal({
  initial, onClose, onSubmit, busy,
}: {
  initial: BasContentionRecord | null;
  onClose: () => void;
  onSubmit: (input: BasContentionInput) => void;
  busy: boolean;
}) {
  const [form, setForm] = useState<FormState>(initial ? recordToForm(initial) : emptyForm());
  const [errors, setErrors] = useState<string[]>([]);

  const isChaussette = form.product_type === 'Chaussette';
  const isBas = form.product_type === 'Bas';

  const update = (patch: Partial<FormState>) => setForm(prev => ({ ...prev, ...patch }));
  const updateMes = (patch: Partial<RawMesures>) =>
    setForm(prev => ({ ...prev, raw_mesures: { ...prev.raw_mesures, ...patch } }));

  const handleSelectResident = (r: ResidentLite) => {
    const sexe: Sexe = r.title === 'Mr' ? 'Homme' : 'Femme';
    setForm(prev => ({
      ...prev,
      resident_id: r.id,
      nom: r.last_name ?? '',
      prenom: r.first_name ?? '',
      chambre: r.room ?? '',
      sexe,
    }));
  };

  const validate = (): string[] => {
    const e: string[] = [];
    if (!form.chambre.trim()) e.push('La chambre est requise');
    if (!form.nom.trim()) e.push('Le nom est requis');
    if (!form.prenom.trim()) e.push('Le prénom est requis');
    if (isChaussette) {
      if (!form.raw_mesures.a) e.push('Mesure A (cheville) requise');
      if (!form.raw_mesures.b) e.push('Mesure B (mollet) requise');
      if (!form.raw_mesures.d) e.push('Mesure D (hauteur genou) requise');
    }
    if (isBas) {
      if (!form.raw_mesures.a) e.push('Mesure A (cheville) requise');
      if (!form.raw_mesures.c) e.push('Mesure C (cuisse) requise');
      if (!form.raw_mesures.e) e.push('Mesure E (hauteur cuisse) requise');
    }
    return e;
  };

  const handleSubmit = () => {
    const errs = validate();
    if (errs.length) { setErrors(errs); return; }
    setErrors([]);
    onSubmit(formToInput(form, initial ?? undefined));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
          <h2 className="font-bold text-slate-800">
            {initial ? `Modifier · ${initial.nom} ${initial.prenom}` : 'Nouveau patient'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 space-y-1">
              {errors.map((e, i) => <p key={i} className="text-sm text-red-700">• {e}</p>)}
            </div>
          )}

          {/* Identité */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nom du patient <span className="text-red-400">*</span>
              </label>
              <PatientNameAutocomplete
                value={form.nom}
                onChange={v => update({ nom: v, resident_id: null })}
                onSelectResident={handleSelectResident}
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Sélectionnez un résident pour pré-remplir prénom, chambre et sexe.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Prénom <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.prenom}
                onChange={e => update({ prenom: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Chambre <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.chambre}
                onChange={e => update({ chambre: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Sexe</label>
              <div className="flex gap-2">
                {(['Femme', 'Homme'] as const).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => update({ sexe: s })}
                    className={cn(
                      'px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors',
                      form.sexe === s
                        ? 'bg-cyan-600 border-cyan-600 text-white'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-cyan-300',
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Type de produit</label>
              <div className="flex gap-2">
                {PRODUCT_OPTIONS.map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => update({ product_type: p })}
                    className={cn(
                      'px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors',
                      form.product_type === p
                        ? 'bg-cyan-600 border-cyan-600 text-white'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-cyan-300',
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Mesures */}
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Mesures (cm)</p>
            <p className="text-[11px] text-slate-400 mb-3">
              Saisir une valeur (ex. <code className="px-1 bg-slate-100 rounded">32</code>) ou côté gauche/droit (<code className="px-1 bg-slate-100 rounded">31/33</code>) — la plus grande sera utilisée pour le calcul.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {isChaussette && (
                <>
                  <MesureInput label="A · Cheville" value={form.raw_mesures.a ?? ''} onChange={v => updateMes({ a: v })} required />
                  <MesureInput label="B · Mollet" value={form.raw_mesures.b ?? ''} onChange={v => updateMes({ b: v })} required />
                  <MesureInput label="C · Cuisse (opt.)" value={form.raw_mesures.c ?? ''} onChange={v => updateMes({ c: v })} />
                  <MesureInput label="D · Hauteur genou" value={form.raw_mesures.d ?? ''} onChange={v => updateMes({ d: v })} required />
                  <MesureInput label="E · Hauteur cuisse (opt.)" value={form.raw_mesures.e ?? ''} onChange={v => updateMes({ e: v })} />
                  {form.sexe === 'Femme' && (
                    <MesureInput label="F · Hanches (opt.)" value={form.raw_mesures.f ?? ''} onChange={v => updateMes({ f: v })} />
                  )}
                </>
              )}
              {isBas && (
                <>
                  <MesureInput label="A · Cheville" value={form.raw_mesures.a ?? ''} onChange={v => updateMes({ a: v })} required />
                  <MesureInput label="B · Mollet (opt.)" value={form.raw_mesures.b ?? ''} onChange={v => updateMes({ b: v })} />
                  <MesureInput label="C · Cuisse" value={form.raw_mesures.c ?? ''} onChange={v => updateMes({ c: v })} required />
                  <MesureInput label="D · Hauteur genou (opt.)" value={form.raw_mesures.d ?? ''} onChange={v => updateMes({ d: v })} />
                  <MesureInput label="E · Hauteur cuisse" value={form.raw_mesures.e ?? ''} onChange={v => updateMes({ e: v })} required />
                  {form.sexe === 'Femme' && (
                    <MesureInput label="F · Hanches (opt.)" value={form.raw_mesures.f ?? ''} onChange={v => updateMes({ f: v })} />
                  )}
                </>
              )}
            </div>

            {isChaussette && (
              <label className="mt-3 flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.prioritize_mollet}
                  onChange={e => update({ prioritize_mollet: e.target.checked })}
                  className="w-4 h-4 accent-cyan-600"
                />
                <span><strong>Règle spéciale :</strong> prioriser la compatibilité du mollet</span>
              </label>
            )}
          </div>

          {/* Dates */}
          <div className="border-t border-slate-100 pt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Date 1ère commande</label>
              <input
                type="date"
                value={form.date_cmd_1}
                onChange={e => update({ date_cmd_1: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Date 2e commande</label>
              <input
                type="date"
                value={form.date_cmd_2}
                onChange={e => update({ date_cmd_2: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 border-t border-slate-100 flex-shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={busy}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-cyan-700 hover:bg-cyan-800 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {initial ? 'Enregistrer' : 'Ajouter'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE PRINCIPALE
// ─────────────────────────────────────────────────────────────────────────────

type Floor = 'rdc' | 'etage';

export default function BasDeContentionPage() {
  const qc = useQueryClient();
  const access = useModuleAccess('basDeContention');
  const readOnly = access === 'read';
  const role = useEffectiveRole();
  const canEdit = !readOnly && (role === 'admin' || role === 'ide');

  const [floor, setFloor] = useState<Floor>('rdc');
  const [search, setSearch] = useState('');
  const [editTarget, setEditTarget] = useState<BasContentionRecord | 'new' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BasContentionRecord | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['bas_contention'],
    queryFn: fetchRows,
  });

  const createMut = useMutation({
    mutationFn: createRow,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bas_contention'] });
      toast.success('Patient ajouté');
      setEditTarget(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<BasContentionInput> }) => updateRow(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bas_contention'] });
      toast.success('Modification enregistrée');
      setEditTarget(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMut = useMutation({
    mutationFn: deleteRow,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bas_contention'] });
      toast.success('Supprimé');
      setConfirmDelete(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const filtered = useMemo(() => {
    const f = floor;
    return rows
      .filter(r => getFloor(r.chambre) === f)
      .filter(r => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          r.nom.toLowerCase().includes(q) ||
          r.prenom.toLowerCase().includes(q) ||
          r.chambre.toLowerCase().includes(q)
        );
      });
  }, [rows, floor, search]);

  const handleSubmit = (input: BasContentionInput) => {
    if (editTarget && editTarget !== 'new') {
      updateMut.mutate({ id: editTarget.id, patch: input });
    } else {
      createMut.mutate(input);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: '#dde4ee' }}>
      {/* ── Header ── */}
      <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0e7490 0%, #155e75 100%)' }}>
        <div className="relative z-10 max-w-6xl mx-auto px-6 py-5">
          <div className="flex items-center gap-1.5 text-white/50 text-xs mb-4">
            <Link href="/" className="hover:text-white/80 transition-colors">Accueil</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-white/90">Bas de Contention</span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <Footprints className="h-6 w-6 text-white" strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-white">Bas de Contention</h1>
              <p className="text-white/70 text-sm">Suivi des prescriptions et tailles de contention</p>
            </div>

            {/* Floor tabs */}
            <div className="flex bg-black/20 rounded-xl p-1 gap-1">
              {(['rdc', 'etage'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFloor(f)}
                  className={cn(
                    'px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors',
                    floor === f ? 'bg-white text-cyan-800 shadow-sm' : 'text-white/80 hover:text-white hover:bg-white/10',
                  )}
                >
                  {f === 'rdc' ? 'RDC' : '1er Étage'}
                </button>
              ))}
            </div>

            {canEdit && (
              <button
                onClick={() => setEditTarget('new')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-cyan-800 hover:bg-cyan-50 text-sm font-semibold shadow-sm"
              >
                <Plus className="h-4 w-4" />
                Nouveau patient
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Lecture seule ── */}
      {readOnly && (
        <div className="max-w-6xl mx-auto px-4 mt-4">
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-sm text-blue-700 font-medium">
            <Eye className="h-4 w-4 flex-shrink-0" />
            Vous consultez ce module en lecture seule.
          </div>
        </div>
      )}

      {/* ── Corps ── */}
      <div className="max-w-6xl mx-auto px-4 py-6 pb-20 space-y-4">
        {/* Recherche */}
        <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3 flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher par nom, prénom, chambre…"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-cyan-500"
            />
          </div>
          <span className="text-xs text-slate-500 whitespace-nowrap">
            {filtered.length} patient{filtered.length > 1 ? 's' : ''}
          </span>
        </div>

        {/* Tableau */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-16">Ch.</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Nom Prénom</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-16">Sexe</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Type</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Mesures (cm)</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Taille recommandée</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">1ère cmd</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">2e cmd</th>
                  <th className="px-3 py-2 w-24" />
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-slate-400">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                      Chargement…
                    </td>
                  </tr>
                )}
                {!isLoading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-slate-400 text-sm">
                      {rows.length === 0 ? 'Aucun patient enregistré' : 'Aucun résultat pour ces filtres'}
                    </td>
                  </tr>
                )}
                {filtered.map((r, idx) => {
                  // Séparateur Mapad / Long Séjour
                  const prev = filtered[idx - 1];
                  let separator: React.ReactNode = null;
                  if (prev) {
                    const a = parseInt(prev.chambre, 10);
                    const b = parseInt(r.chambre, 10);
                    const isFloorRdc = floor === 'rdc';
                    if ((isFloorRdc && a <= 16 && b >= 17) || (!isFloorRdc && a <= 122 && b >= 123)) {
                      separator = (
                        <tr key={`sep-${r.id}`} aria-hidden>
                          <td colSpan={9} className="px-0 py-0">
                            <div className="h-1 bg-gradient-to-r from-transparent via-cyan-300 to-transparent" />
                          </td>
                        </tr>
                      );
                    }
                  }
                  return (
                    <Fragment key={r.id}>
                      {separator}
                      <tr
                        className={cn(
                          'border-b border-slate-100 hover:bg-slate-50/60',
                          r.sexe === 'Femme' ? 'bg-rose-50/30' : 'bg-blue-50/30',
                        )}
                      >
                        <td className="px-3 py-2 font-semibold text-slate-700">{r.chambre}</td>
                        <td className="px-3 py-2">
                          <span className="font-semibold text-slate-800">{r.nom}</span>{' '}
                          <span className="text-slate-600">{r.prenom}</span>
                        </td>
                        <td className="px-3 py-2 text-slate-600">{r.sexe}</td>
                        <td className="px-3 py-2 text-slate-700">{r.product_type}</td>
                        <td className="px-3 py-2 text-slate-600 text-xs whitespace-nowrap">
                          {summarizeMesures(r.raw_mesures) || '—'}
                        </td>
                        <td className="px-3 py-2">
                          {r.result?.text
                            ? <span className="font-medium text-slate-800">{r.result.text}</span>
                            : <span className="text-slate-300 italic text-xs">à calculer</span>}
                        </td>
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{fmtDateFR(r.date_cmd_1)}</td>
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{fmtDateFR(r.date_cmd_2)}</td>
                        <td className="px-3 py-2">
                          {canEdit && (
                            <div className="flex gap-1 justify-end">
                              <button
                                onClick={() => setEditTarget(r)}
                                title="Modifier"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setConfirmDelete(r)}
                                title="Supprimer"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modale formulaire */}
      {editTarget && (
        <PatientFormModal
          initial={editTarget === 'new' ? null : editTarget}
          onClose={() => setEditTarget(null)}
          onSubmit={handleSubmit}
          busy={createMut.isPending || updateMut.isPending}
        />
      )}

      {/* Confirmation suppression */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h2 className="font-bold text-slate-800 text-base mb-2">Supprimer ce patient ?</h2>
            <p className="text-sm text-slate-600 mb-1">
              {confirmDelete.nom} {confirmDelete.prenom} — Ch. {confirmDelete.chambre}
            </p>
            <p className="text-xs text-red-600 mb-5">Cette action est irréversible.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 py-2.5 rounded-xl text-sm border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                onClick={() => deleteMut.mutate(confirmDelete.id)}
                disabled={deleteMut.isPending}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMut.isPending ? 'Suppression…' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
