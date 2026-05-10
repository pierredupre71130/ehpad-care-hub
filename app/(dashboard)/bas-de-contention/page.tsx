'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Footprints, ChevronRight, Plus, Pencil, Trash2, X, Check,
  Eye, Loader2, Search, ArrowLeft, Calculator, Sliders,
  Printer, Upload, Download, Link2, Link2Off, Gamepad2, FileText,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { useModuleAccess } from '@/lib/use-module-access';
import { useEffectiveRole } from '@/lib/use-effective-role';
import {
  calculateSize, buildResultFromCandidate, buildResultFromManual,
  SIZE_CHARTS,
  type CalcResult, type Candidate,
  type Sexe, type ProductType, type RawMesures, type Result,
} from './calc';
import { MiniGameModal } from './mini-game';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

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
  taille_recommandee?: string;
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

// Remplace l'intégralité des lignes (utilisé par l'import JSON)
async function replaceAllRows(rows: BasContentionInput[]): Promise<void> {
  const sb = createClient();
  const { error: delErr } = await sb.from(TABLE).delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (delErr) throw new Error(delErr.message);
  if (rows.length === 0) return;
  const { error: insErr } = await sb.from(TABLE).insert(rows);
  if (insErr) throw new Error(insErr.message);
}

// Réglage admin "Synchroniser avec la fiche résident"
const SETTING_SYNC_KEY = 'bas_contention_sync_residents';

async function fetchSyncSetting(): Promise<boolean> {
  const sb = createClient();
  const { data } = await sb.from('settings').select('value').eq('key', SETTING_SYNC_KEY).maybeSingle();
  return data?.value === true;
}

async function saveSyncSetting(value: boolean): Promise<void> {
  const sb = createClient();
  const { error } = await sb
    .from('settings')
    .upsert({ key: SETTING_SYNC_KEY, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
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

function formToInput(f: FormState, result: Result): BasContentionInput {
  // Extrait "Taille X (LONG|COURT|NORMAL)" depuis result.text pour respecter
  // la contrainte NOT NULL de la colonne taille_recommandee
  const tMatch = result?.text?.match(/Taille\s*:?\s*([0-9]+)/i);
  const variantMatch = result?.text?.match(/(LONG|COURT|NORMAL)/i);
  const taille_recommandee = tMatch
    ? `${tMatch[1]}${variantMatch ? ' ' + variantMatch[1].toUpperCase() : ''}`
    : (result?.text ?? '');

  return {
    // resident_id reste null tant que la synchro n'est pas activée :
    // residents.id n'est pas un UUID dans cette base, on le réintégrera
    // quand on branchera la synchro avec la fiche résident.
    resident_id: null,
    chambre: f.chambre.trim(),
    nom: f.nom.trim().toUpperCase(),
    prenom: formatProperCase(f.prenom.trim()),
    sexe: f.sexe,
    product_type: f.product_type,
    raw_mesures: f.raw_mesures,
    result,
    prioritize_mollet: f.prioritize_mollet,
    date_cmd_1: f.date_cmd_1 || null,
    date_cmd_2: f.date_cmd_2 || null,
    taille_recommandee,
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

// ─────────────────────────────────────────────────────────────────────────────
// VUE RÉSULTAT (perfect / conflict / error)
// ─────────────────────────────────────────────────────────────────────────────

function ResultView({
  calc, patientLabel, raw, productType, onChoose,
}: {
  calc: CalcResult;
  patientLabel: string;
  raw: RawMesures;
  productType: ProductType;
  onChoose: (r: Result) => void;
}) {
  if (calc.type === 'error') {
    return (
      <div className="space-y-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-red-700">{calc.result.text}</p>
          <p className="text-xs text-red-600 mt-1">
            Aucune taille ne correspond aux mesures saisies. Vérifiez les valeurs ou forcez une taille manuellement.
          </p>
        </div>
        <div className="text-xs text-slate-500">
          <span className="font-semibold">Patient :</span> {patientLabel}
        </div>
      </div>
    );
  }

  if (calc.type === 'perfect') {
    return (
      <div className="space-y-4">
        <div className="bg-green-50 border-2 border-green-300 rounded-xl p-5 text-center">
          <p className="text-xs uppercase font-bold text-green-700 mb-1">Résultat calculé</p>
          <p className="text-2xl font-bold text-green-800">{calc.result.text}</p>
        </div>
        <div className="text-xs text-slate-500">
          <span className="font-semibold">Patient :</span> {patientLabel}
        </div>
        <button
          onClick={() => onChoose(calc.result)}
          className="w-full py-3 rounded-xl text-sm font-semibold text-white bg-green-600 hover:bg-green-700 flex items-center justify-center gap-2"
        >
          <Check className="h-4 w-4" />
          Confirmer cette taille
        </button>
      </div>
    );
  }

  // type === 'conflict'
  const isBas = productType === 'Bas';
  const mainMeasureName = isBas ? 'Cuisse' : 'Mollet';
  const mainKey = isBas ? 'cuisse' : 'mollet';
  const mainValue = isBas ? raw.c : raw.b;

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-300 rounded-xl p-4">
        <p className="text-sm font-semibold text-amber-800">Plusieurs tailles compatibles</p>
        <p className="text-xs text-amber-700 mt-1">
          Les mesures correspondent à plusieurs tailles ou nécessitent un compromis. Choisissez la plus pertinente.
        </p>
      </div>

      <div className="space-y-2">
        {calc.candidates.map((c, idx) => {
          const labelHeight = calc.height ? `, ${calc.height}` : '';
          const aTone = c.matches.cheville === 'tolerance' ? 'text-amber-600' : (c.matches.cheville === 'fail' ? 'text-red-600' : 'text-slate-600');
          const mTone = c.matches[mainKey] === 'tolerance' ? 'text-amber-600' : (c.matches[mainKey] === 'fail' ? 'text-red-600' : 'text-slate-600');
          return (
            <button
              key={idx}
              onClick={() => onChoose(buildResultFromCandidate(c, calc.height))}
              className="w-full text-left rounded-xl border-2 border-slate-200 hover:border-cyan-400 hover:bg-cyan-50 p-3 transition-colors"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-bold text-slate-800">Taille {c.sizeData.size}{labelHeight}</span>
                {(c.matches.cheville === 'tolerance' || c.matches[mainKey] === 'tolerance') && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Tolérance</span>
                )}
              </div>
              <div className="text-xs space-y-0.5">
                <p className={aTone}>
                  Cheville : {raw.a || '—'} cm (req. {c.sizeData.cheville[0]}–{c.sizeData.cheville[1]} cm)
                </p>
                <p className={mTone}>
                  {mainMeasureName} : {mainValue || '—'} cm (req. {c.sizeData[mainKey][0]}–{c.sizeData[mainKey][1]} cm)
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VUE FORÇAGE MANUEL (grilles cliquables)
// ─────────────────────────────────────────────────────────────────────────────

function ManualView({
  sexe, raw, size, setSize, height, setHeight,
}: {
  sexe: Sexe;
  raw: RawMesures;
  size: string;
  setSize: (v: string) => void;
  height: '' | 'NORMAL' | 'LONG';
  setHeight: (v: '' | 'NORMAL' | 'LONG') => void;
}) {
  const chart = SIZE_CHARTS[sexe];

  return (
    <div className="space-y-4">
      <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
        <p className="text-xs text-purple-800">
          Sélectionnez une taille manuellement (cliquez une ligne ou utilisez le sélecteur).
          Mesures saisies : A:{raw.a || '—'} B:{raw.b || '—'} C:{raw.c || '—'} D:{raw.d || '—'} E:{raw.e || '—'}
        </p>
      </div>

      {/* Tableau cliquable */}
      <div>
        <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">
          Grille {sexe.toLowerCase()}
        </p>
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-2 py-1.5 text-left">Taille</th>
                <th className="px-2 py-1.5 text-left">A · Cheville</th>
                <th className="px-2 py-1.5 text-left">B · Mollet</th>
                <th className="px-2 py-1.5 text-left">C · Cuisse</th>
              </tr>
            </thead>
            <tbody>
              {chart.map(row => {
                const selected = String(row.size) === size;
                return (
                  <tr
                    key={row.size}
                    onClick={() => setSize(String(row.size))}
                    className={cn(
                      'cursor-pointer border-t border-slate-100 hover:bg-cyan-50 transition-colors',
                      selected && 'bg-cyan-100 font-semibold',
                    )}
                  >
                    <td className="px-2 py-1.5 font-bold">{row.size}</td>
                    <td className="px-2 py-1.5">{row.cheville[0]}–{row.cheville[1]}</td>
                    <td className="px-2 py-1.5">{row.mollet[0]}–{row.mollet[1]}</td>
                    <td className="px-2 py-1.5">{row.cuisse[0]}–{row.cuisse[1]}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sélecteurs */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Taille</label>
          <select
            value={size}
            onChange={e => setSize(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-cyan-500"
          >
            <option value="">— Choisir —</option>
            {chart.map(row => (
              <option key={row.size} value={row.size}>Taille {row.size}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Hauteur</label>
          <select
            value={height}
            onChange={e => setHeight(e.target.value as '' | 'NORMAL' | 'LONG')}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-cyan-500"
          >
            <option value="">— Aucune —</option>
            <option value="NORMAL">NORMAL</option>
            <option value="LONG">LONG</option>
          </select>
        </div>
      </div>

      <p className="text-[11px] text-slate-400 italic">
        Légende : Mi-Bas/Chaussette → NORMAL si D ≤ 40, LONG si D &gt; 40 · Bas → NORMAL si E ≤ 72, LONG si E &gt; 72.
      </p>
    </div>
  );
}

function PatientFormModal({
  initial, onClose, onSubmit, busy, onEasterEgg,
}: {
  initial: BasContentionRecord | null;
  onClose: () => void;
  onSubmit: (input: BasContentionInput) => void;
  busy: boolean;
  onEasterEgg?: () => void;
}) {
  const [form, setForm] = useState<FormState>(initial ? recordToForm(initial) : emptyForm());
  const [errors, setErrors] = useState<string[]>([]);
  const [step, setStep] = useState<'form' | 'result' | 'manual'>('form');
  const [calc, setCalc] = useState<CalcResult | null>(null);
  const [manualSize, setManualSize] = useState<string>('');
  const [manualHeight, setManualHeight] = useState<'' | 'NORMAL' | 'LONG'>('');

  const isChaussette = form.product_type === 'Chaussette';
  const isBas = form.product_type === 'Bas';

  const submitWithResult = (result: Result) => {
    onSubmit(formToInput(form, result));
  };

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
    // Easter-egg : combinaison magique → lance le jeu Chop-Dadou
    if (
      onEasterEgg &&
      form.chambre.trim() === '100' &&
      form.nom.trim().toUpperCase() === 'TARTANPION' &&
      form.prenom.trim().toUpperCase() === 'JEAN NICOLAS' &&
      form.raw_mesures.a?.trim() === '100' &&
      form.raw_mesures.b?.trim() === '100' &&
      form.raw_mesures.c?.trim() === '100' &&
      form.raw_mesures.e?.trim() === '100'
    ) {
      onEasterEgg();
      return;
    }
    const errs = validate();
    if (errs.length) { setErrors(errs); return; }
    setErrors([]);
    const c = calculateSize(form.sexe, form.product_type, form.raw_mesures, form.prioritize_mollet);
    setCalc(c);
    setStep('result');
  };

  const handleManualValidate = () => {
    const sz = parseInt(manualSize, 10);
    if (Number.isNaN(sz)) { toast.error('Sélectionnez une taille'); return; }
    submitWithResult(buildResultFromManual(sz, manualHeight));
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
          {step === 'form' && (<>
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
          </>)}

          {step === 'result' && calc && (
            <ResultView
              calc={calc}
              patientLabel={`${form.nom} ${form.prenom}`}
              raw={form.raw_mesures}
              productType={form.product_type}
              onChoose={result => submitWithResult(result)}
            />
          )}

          {step === 'manual' && (
            <ManualView
              sexe={form.sexe}
              raw={form.raw_mesures}
              size={manualSize}
              setSize={setManualSize}
              height={manualHeight}
              setHeight={setManualHeight}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 border-t border-slate-100 flex-shrink-0">
          {step === 'form' && (<>
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
              <Calculator className="h-4 w-4" />
              Calculer la taille
            </button>
          </>)}

          {step === 'result' && calc && (<>
            <button
              onClick={() => setStep('form')}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center justify-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Modifier les mesures
            </button>
            <button
              onClick={() => setStep('manual')}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 flex items-center justify-center gap-2"
            >
              <Sliders className="h-4 w-4" />
              Forcer manuellement
            </button>
          </>)}

          {step === 'manual' && (<>
            <button
              onClick={() => setStep(calc ? 'result' : 'form')}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center justify-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Retour
            </button>
            <button
              onClick={handleManualValidate}
              disabled={busy}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-cyan-700 hover:bg-cyan-800 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Valider la taille forcée
            </button>
          </>)}
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

  const isAdmin = role === 'admin';

  const [floor, setFloor] = useState<Floor>('rdc');
  const [search, setSearch] = useState('');
  const [editTarget, setEditTarget] = useState<BasContentionRecord | 'new' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BasContentionRecord | null>(null);
  const [bonCmd, setBonCmd] = useState<BasContentionRecord | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [gameOpen, setGameOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['bas_contention'],
    queryFn: fetchRows,
  });

  const { data: syncEnabled = false } = useQuery({
    queryKey: ['settings', SETTING_SYNC_KEY],
    queryFn: fetchSyncSetting,
  });

  const syncMut = useMutation({
    mutationFn: saveSyncSetting,
    onSuccess: (_, value) => {
      qc.invalidateQueries({ queryKey: ['settings', SETTING_SYNC_KEY] });
      toast.success(value ? 'Synchronisation activée' : 'Synchronisation désactivée');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const importMut = useMutation({
    mutationFn: replaceAllRows,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bas_contention'] });
      toast.success('Importation réussie');
    },
    onError: (err: Error) => toast.error(err.message),
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

  const toggleOne = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const allRdc  = useMemo(() => rows.filter(r => getFloor(r.chambre) === 'rdc'), [rows]);
  const allEtage = useMemo(() => rows.filter(r => getFloor(r.chambre) === 'etage'), [rows]);

  const exportableRows = (): BasContentionRecord[] => {
    if (selected.size > 0) return rows.filter(r => selected.has(r.id));
    return rows;
  };

  const handleExportJson = () => {
    const list = exportableRows();
    if (list.length === 0) { toast.info('Rien à exporter'); return; }
    const blob = new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bas-contention_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!confirm("Importer ce fichier remplacera TOUTES les données actuelles. Continuer ?")) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error('Format JSON invalide');

      // Support des deux formats : nouveau (snake_case) et legacy (camelCase
      // avec productType/rawMesures/date1/date2 issu de l'ancienne app)
      const frToIso = (s: unknown): string | null => {
        if (typeof s !== 'string' || !s.trim()) return null;
        const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
        if (!m) return null;
        const day = m[1].padStart(2, '0');
        const month = m[2].padStart(2, '0');
        const year = m[3].length === 2 ? `20${m[3]}` : m[3];
        return `${year}-${month}-${day}`;
      };
      const isoOrAsIs = (v: unknown): string | null => {
        if (typeof v !== 'string' || !v.trim()) return null;
        if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
        return frToIso(v);
      };
      const extractTaille = (resultText: string | undefined | null): string => {
        if (!resultText) return '';
        // Récupère le numéro après "Taille :" puis ajoute LONG/COURT/NORMAL
        const tMatch = resultText.match(/Taille\s*:?\s*([0-9]+)/i);
        const variantMatch = resultText.match(/(LONG|COURT|NORMAL)/i);
        if (!tMatch) return resultText;
        return `${tMatch[1]}${variantMatch ? ' ' + variantMatch[1].toUpperCase() : ''}`;
      };

      const inputs: BasContentionInput[] = parsed.map((r: Record<string, unknown>) => {
        const product_type =
          (r.product_type ?? r.productType) === 'Bas' ? 'Bas' : 'Chaussette';
        const raw_mesures = (r.raw_mesures ?? r.rawMesures ?? {}) as RawMesures;
        const result = (r.result ?? {}) as Result;
        const date_cmd_1 = isoOrAsIs(r.date_cmd_1 ?? r.date1);
        const date_cmd_2 = isoOrAsIs(r.date_cmd_2 ?? r.date2);
        const prioritize_mollet =
          typeof result?.text === 'string'
            ? /priorit[ée]\s*mollet/i.test(result.text)
            : r.prioritize_mollet !== false;
        const taille_recommandee = extractTaille(result?.text);

        return {
          resident_id: null,
          chambre: String(r.chambre ?? ''),
          nom: String(r.nom ?? '').toUpperCase(),
          prenom: formatProperCase(String(r.prenom ?? '')),
          sexe: (r.sexe === 'Homme' ? 'Homme' : 'Femme') as Sexe,
          product_type: product_type as ProductType,
          raw_mesures,
          result,
          prioritize_mollet,
          date_cmd_1,
          date_cmd_2,
          taille_recommandee,
        } as BasContentionInput;
      });
      importMut.mutate(inputs);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import échoué');
    }
  };

  const handlePrint = () => {
    if (selected.size === 0 && rows.length === 0) { toast.info('Rien à imprimer'); return; }
    if (selected.size === 0 && !confirm("Aucune ligne sélectionnée. Imprimer toutes les listes ?")) return;
    window.print();
  };

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
      <div className="relative overflow-hidden print:hidden" style={{ background: 'linear-gradient(135deg, #0e7490 0%, #155e75 100%)' }}>
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

            <button
              onClick={handlePrint}
              title="Imprimer / Enregistrer en PDF"
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/15 text-white hover:bg-white/25 text-sm font-semibold"
            >
              <Printer className="h-4 w-4" />
              <span className="hidden sm:inline">Imprimer</span>
            </button>

            {canEdit && (
              <>
                <button
                  onClick={handleExportJson}
                  title="Exporter en JSON"
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/15 text-white hover:bg-white/25 text-sm font-semibold"
                >
                  <Download className="h-4 w-4" />
                  <span className="hidden md:inline">Export JSON</span>
                </button>
                <button
                  onClick={handleImportClick}
                  title="Importer depuis un JSON"
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/15 text-white hover:bg-white/25 text-sm font-semibold"
                >
                  <Upload className="h-4 w-4" />
                  <span className="hidden md:inline">Import JSON</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={handleImportFile}
                />
                <button
                  onClick={() => setEditTarget('new')}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-cyan-800 hover:bg-cyan-50 text-sm font-semibold shadow-sm"
                >
                  <Plus className="h-4 w-4" />
                  <span className="hidden sm:inline">Nouveau patient</span>
                </button>
              </>
            )}
          </div>

          {isAdmin && (
            <div className="mt-3 flex items-center gap-2 text-xs text-white/85">
              <button
                onClick={() => syncMut.mutate(!syncEnabled)}
                disabled={syncMut.isPending}
                className={cn(
                  'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg font-semibold transition-colors',
                  syncEnabled
                    ? 'bg-emerald-400/30 hover:bg-emerald-400/40 text-white'
                    : 'bg-white/15 hover:bg-white/25 text-white/80',
                )}
                title="Réservé admin — synchronisera les cases du résident lié quand activé"
              >
                {syncEnabled ? <Link2 className="h-3.5 w-3.5" /> : <Link2Off className="h-3.5 w-3.5" />}
                Synchroniser avec la fiche résident
                <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-bold', syncEnabled ? 'bg-white text-emerald-700' : 'bg-slate-700 text-white/80')}>
                  {syncEnabled ? 'Activée' : 'Désactivée'}
                </span>
              </button>
              <span className="text-white/50 italic hidden md:inline">À venir : la synchro cochera automatiquement les cases dans la fiche résident.</span>
              <button
                onClick={() => { setEditTarget(null); setGameOpen(true); }}
                title="Lancer Le Chop-Dadou"
                className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-400/20 hover:bg-amber-400/30 text-amber-50 font-semibold transition-colors"
              >
                <Gamepad2 className="h-3.5 w-3.5" />
                Le Chop-Dadou
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Lecture seule ── */}
      {readOnly && (
        <div className="max-w-6xl mx-auto px-4 mt-4 print:hidden">
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-sm text-blue-700 font-medium">
            <Eye className="h-4 w-4 flex-shrink-0" />
            Vous consultez ce module en lecture seule.
          </div>
        </div>
      )}

      {/* ── CSS d'impression ── */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 8mm; }
          body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .bc-print-zone { display: block !important; }
          .bc-print-table { width: 100%; border-collapse: collapse; font-size: 11px; }
          .bc-print-table th, .bc-print-table td { border: 1px solid #475569; padding: 4px 6px; vertical-align: top; }
          .bc-print-table thead { background: #f1f5f9; }
          .bc-print-section { margin-bottom: 14px; page-break-inside: auto; }
          .bc-print-title { font-size: 14px; font-weight: 700; margin: 0 0 6px 0; color: #0e7490; }
          .bc-print-table tr { page-break-inside: avoid; }
          .bc-page-break { page-break-before: always; break-before: page; }
        }
        .bc-print-zone { display: none; }
      `}</style>

      {/* ── Corps ── */}
      <div className="max-w-6xl mx-auto px-4 py-6 pb-20 space-y-4 print:hidden">
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
                  <th className="px-2 py-2 w-8 text-center print:hidden">
                    <input
                      type="checkbox"
                      title="Tout sélectionner / désélectionner sur cet étage"
                      checked={filtered.length > 0 && filtered.every(r => selected.has(r.id))}
                      onChange={e => {
                        setSelected(prev => {
                          const next = new Set(prev);
                          if (e.target.checked) filtered.forEach(r => next.add(r.id));
                          else filtered.forEach(r => next.delete(r.id));
                          return next;
                        });
                      }}
                    />
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-16">Ch.</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Nom Prénom</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-16">Sexe</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Type</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Mesures (cm)</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Taille recommandée</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">1ère cmd</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide">2e cmd</th>
                  <th className="px-3 py-2 w-24 print:hidden" />
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={10} className="text-center py-12 text-slate-400">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                      Chargement…
                    </td>
                  </tr>
                )}
                {!isLoading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={10} className="text-center py-12 text-slate-400 text-sm">
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
                          <td colSpan={10} className="px-0 py-0">
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
                        <td className="px-2 py-2 text-center print:hidden">
                          <input
                            type="checkbox"
                            checked={selected.has(r.id)}
                            onChange={() => toggleOne(r.id)}
                          />
                        </td>
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
                        <td className="px-3 py-2 print:hidden">
                          <div className="flex gap-1 justify-end">
                            <button
                              onClick={() => setBonCmd(r)}
                              title="Bon de commande pharmacie"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
                            >
                              <FileText className="h-4 w-4" />
                            </button>
                            {canEdit && (
                              <>
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
                              </>
                            )}
                          </div>
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

      {/* ── Zone d'impression ── */}
      <div className="bc-print-zone">
        {(() => {
          const selectionMode = selected.size > 0;
          const filterFn = (r: BasContentionRecord) => !selectionMode || selected.has(r.id);
          const printRdc = allRdc.filter(filterFn);
          const printEtage = allEtage.filter(filterFn);
          const renderTable = (title: string, list: BasContentionRecord[]) => (
            <section className="bc-print-section">
              <h2 className="bc-print-title">{title}</h2>
              <table className="bc-print-table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>Ch.</th>
                    <th>Nom Prénom</th>
                    <th style={{ width: 50 }}>Sexe</th>
                    <th style={{ width: 80 }}>Type</th>
                    <th>Mesures (cm)</th>
                    <th>Taille recommandée</th>
                    <th style={{ width: 80 }}>1ère cmd</th>
                    <th style={{ width: 80 }}>2e cmd</th>
                  </tr>
                </thead>
                <tbody>
                  {list.length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign: 'center', color: '#94a3b8' }}>—</td></tr>
                  ) : (
                    list.map(r => (
                      <tr key={r.id}>
                        <td><strong>{r.chambre}</strong></td>
                        <td><strong>{r.nom}</strong> {r.prenom}</td>
                        <td>{r.sexe}</td>
                        <td>{r.product_type}</td>
                        <td>{summarizeMesures(r.raw_mesures) || '—'}</td>
                        <td>{r.result?.text || '—'}</td>
                        <td>{fmtDateFR(r.date_cmd_1)}</td>
                        <td>{fmtDateFR(r.date_cmd_2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </section>
          );
          return (
            <>
              {printRdc.length > 0 && renderTable('Suivi des Bas de Contention — RDC', printRdc)}
              {printRdc.length > 0 && printEtage.length > 0 && <div className="bc-page-break" />}
              {printEtage.length > 0 && renderTable('Suivi des Bas de Contention — 1er Étage', printEtage)}
              {printRdc.length === 0 && printEtage.length === 0 && (
                <p style={{ textAlign: 'center', color: '#94a3b8', marginTop: 40 }}>Aucune donnée à imprimer.</p>
              )}
            </>
          );
        })()}
      </div>

      {/* Modale formulaire */}
      {editTarget && (
        <PatientFormModal
          key={editTarget === 'new' ? 'new' : editTarget.id}
          initial={editTarget === 'new' ? null : editTarget}
          onClose={() => setEditTarget(null)}
          onSubmit={handleSubmit}
          busy={createMut.isPending || updateMut.isPending}
          onEasterEgg={() => { setEditTarget(null); setGameOpen(true); }}
        />
      )}

      {/* Mini-jeux : Chop-Dadou + Bust-a-Dadou */}
      <MiniGameModal open={gameOpen} onClose={() => setGameOpen(false)} />

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

      {bonCmd && (
        <BonCommandeModal record={bonCmd} onClose={() => setBonCmd(null)} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BON DE COMMANDE — modale + génération PDF (via fenêtre d'impression)
// ─────────────────────────────────────────────────────────────────────────────

function BonCommandeModal({ record, onClose }: { record: BasContentionRecord; onClose: () => void }) {
  const [quantity, setQuantity] = useState(1);
  const [orderRef, setOrderRef] = useState(`BC-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`);
  const today = new Date().toLocaleDateString('fr-FR');

  const handlePrint = () => {
    const w = window.open('', '_blank');
    if (!w) { toast.error('Autorisez les popups pour imprimer'); return; }

    const m = record.raw_mesures || {};
    const measureRow = (label: string, val: string | undefined) =>
      `<tr><td class="ml">${label}</td><td class="mv">${val ? `${val} cm` : '—'}</td></tr>`;

    const isBas = record.product_type === 'Bas';
    const result = record.result?.text || '—';

    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/>
<title>Bon de commande — ${record.nom} ${record.prenom}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;color:#0f172a;padding:14mm;font-size:11pt;line-height:1.45}
  @page{size:A4 portrait;margin:0}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0e7490;padding-bottom:8mm;margin-bottom:8mm}
  .ehpad{font-size:18pt;font-weight:700;color:#0e7490;letter-spacing:0.02em}
  .ehpad-sub{font-size:10pt;color:#64748b;margin-top:1mm}
  .meta{text-align:right;font-size:10pt;color:#475569}
  .meta b{color:#0f172a}
  h2{font-size:13pt;color:#0e7490;border-left:4px solid #0e7490;padding-left:6px;margin:6mm 0 3mm}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:3mm 8mm}
  .field{padding:3mm 4mm;border:1px solid #cbd5e1;border-radius:3mm;background:#f8fafc}
  .field .label{font-size:8.5pt;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:1mm;font-weight:700}
  .field .value{font-size:11pt;color:#0f172a;font-weight:500}
  .product-box{border:2px solid #0e7490;border-radius:4mm;padding:5mm;background:#ecfeff;margin-top:3mm}
  .product-title{font-size:14pt;font-weight:700;color:#0e7490;margin-bottom:2mm}
  .badges{display:flex;flex-wrap:wrap;gap:3mm;margin-top:2mm}
  .badge{display:inline-block;background:#0e7490;color:white;padding:1.5mm 4mm;border-radius:3mm;font-size:10pt;font-weight:600}
  .badge.alt{background:white;color:#0e7490;border:1.5px solid #0e7490}
  .qty{font-size:13pt;font-weight:700;color:#0f172a}
  table.measures{width:100%;border-collapse:collapse;margin-top:2mm}
  table.measures th{background:#475569;color:white;padding:2.5mm;text-align:left;font-size:9pt;text-transform:uppercase;letter-spacing:0.04em}
  table.measures td{border:1px solid #cbd5e1;padding:2.5mm;font-size:10.5pt}
  table.measures td.ml{font-weight:600;width:55%;color:#475569}
  table.measures td.mv{font-weight:700;color:#0f172a;text-align:right}
  .signature-row{display:grid;grid-template-columns:1fr 1fr;gap:10mm;margin-top:14mm}
  .signature-box .label{font-size:9.5pt;color:#64748b;font-weight:600;margin-bottom:1mm;text-transform:uppercase}
  .signature-box .area{border-bottom:1px solid #94a3b8;height:18mm}
  .footer{margin-top:14mm;padding-top:4mm;border-top:1px dashed #94a3b8;font-size:8.5pt;color:#94a3b8;text-align:center}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style>
</head><body>

<div class="header">
  <div>
    <div class="ehpad">EHPAD GUEUGNON</div>
    <div class="ehpad-sub">Bon de commande — Bas / Chaussettes de contention</div>
  </div>
  <div class="meta">
    <div><b>Bon n° :</b> ${orderRef}</div>
    <div><b>Date :</b> ${today}</div>
  </div>
</div>

<h2>Patient</h2>
<div class="grid2">
  <div class="field">
    <div class="label">Nom</div>
    <div class="value">${(record.nom || '').toUpperCase()}</div>
  </div>
  <div class="field">
    <div class="label">Prénom</div>
    <div class="value">${record.prenom || ''}</div>
  </div>
  <div class="field">
    <div class="label">Chambre</div>
    <div class="value">${record.chambre || '—'}</div>
  </div>
  <div class="field">
    <div class="label">Sexe</div>
    <div class="value">${record.sexe || '—'}</div>
  </div>
</div>

<h2>Produit demandé</h2>
<div class="product-box">
  <div class="product-title">${record.product_type === 'Bas' ? 'Bas de contention' : 'Chaussettes de contention'}</div>
  <div class="badges">
    <span class="badge">${result}</span>
    ${record.prioritize_mollet ? '<span class="badge alt">Priorité mollet</span>' : ''}
    <span class="badge alt">Sexe : ${record.sexe}</span>
    <span class="badge alt qty">Quantité : ${quantity} paire${quantity > 1 ? 's' : ''}</span>
  </div>
</div>

<h2>Mesures détaillées</h2>
<table class="measures">
  <thead><tr><th style="width:55%">Mesure</th><th style="text-align:right">Valeur</th></tr></thead>
  <tbody>
    ${measureRow('A — Tour de cheville', m.a)}
    ${isBas
      ? measureRow('C — Tour mi-cuisse / cuisse', m.c)
      : measureRow('B — Tour de mollet', m.b)}
    ${isBas
      ? measureRow('E — Hauteur (sol → pli inguinal)', m.e)
      : measureRow('D — Hauteur (sol → creux poplité)', m.d)}
    ${m.f ? measureRow('F — Mesure complémentaire', m.f) : ''}
  </tbody>
</table>

<div class="signature-row">
  <div class="signature-box">
    <div class="label">Cachet / Signature prescripteur</div>
    <div class="area"></div>
  </div>
  <div class="signature-box">
    <div class="label">Pharmacie — réception</div>
    <div class="area"></div>
  </div>
</div>

<div class="footer">
  EHPAD Gueugnon — Document généré le ${today}
</div>

</body></html>`;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  };

  const m = record.raw_mesures || {};
  const isBas = record.product_type === 'Bas';

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="font-semibold text-slate-900">Bon de commande</h2>
            <p className="text-xs text-slate-500">{record.nom?.toUpperCase()} {record.prenom} · Ch. {record.chambre}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1 uppercase">N° de bon</label>
              <input value={orderRef} onChange={e => setOrderRef(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono outline-none focus:border-teal-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1 uppercase">Quantité (paires)</label>
              <input type="number" min={1} max={20} value={quantity}
                onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-teal-400" />
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm space-y-1">
            <div className="text-xs font-semibold text-slate-500 uppercase mb-1">Récapitulatif</div>
            <div><b>Produit :</b> {isBas ? 'Bas de contention' : 'Chaussettes'} {record.sexe === 'Homme' ? '(Homme)' : '(Femme)'}</div>
            <div><b>Taille :</b> {record.result?.text || '—'}</div>
            {record.prioritize_mollet && <div className="text-amber-700 text-xs">Priorité mollet</div>}
            <div className="text-xs text-slate-500 pt-1">
              Mesures : {summarizeMesures(m) || '—'}
            </div>
          </div>

          <p className="text-xs text-slate-500 italic">
            Ouvre une fenêtre d&apos;impression — choisis « Enregistrer en PDF » dans la boîte de dialogue d&apos;impression pour envoyer le fichier à la pharmacie.
          </p>
        </div>
        <div className="flex gap-2 justify-end p-4 border-t">
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
            Annuler
          </button>
          <button onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors">
            <Printer className="h-4 w-4" /> Générer le bon
          </button>
        </div>
      </div>
    </div>
  );
}
