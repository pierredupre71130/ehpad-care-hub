'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Syringe, RefreshCw, ChevronDown, ChevronUp, Archive, X, Save, Zap, Printer, Loader2, Info, Eye, ClipboardList,
} from 'lucide-react';
import { useModuleAccess } from '@/lib/use-module-access';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { fetchColorOverrides, darkenHex, type ColorOverrides } from '@/lib/module-colors';
import { MODULES } from '@/components/dashboard/module-config';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Resident {
  id: string;
  first_name?: string;
  last_name: string;
  room?: string;
  floor?: string;
  archived?: boolean;
  date_sortie?: string;
}

interface Vaccination {
  id: string;
  resident_id?: string;
  resident_name: string;
  archived?: boolean;
  year: number;
  covid_inj1?: string | null;
  covid_inj2?: string | null;
  covid_inj3?: string | null;
  grippe_inj1?: string | null;
  infos?: string | null;
}

interface VaccinationLT {
  id: string;
  resident_id?: string;
  resident_name: string;
  archived?: boolean;
  tetanos_date?: string | null;
  pneumovax_date?: string | null;
  notes?: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear();

const COVID_OPTIONS = [
  { value: 'Accepte C',         label: 'Accepte C',         effect: 'attente' },
  { value: 'Accepte famille C', label: 'Accepte famille C', effect: 'attente' },
  { value: 'Refus C',           label: 'Refus C',           effect: 'refus'   },
  { value: 'Refus famille C',   label: 'Refus famille C',   effect: 'refus'   },
  { value: 'STOP Dr C',         label: 'STOP (décidé par Dr)', effect: 'stop' },
];

const GRIPPE_OPTIONS = [
  { value: 'Accepte G',         label: 'Accepte G',         effect: 'attente' },
  { value: 'Accepte famille G', label: 'Accepte famille G', effect: 'attente' },
  { value: 'Refus G',           label: 'Refus G',           effect: 'refus'   },
  { value: 'Refus famille G',   label: 'Refus famille G',   effect: 'refus'   },
  { value: 'STOP Dr G',         label: 'STOP (décidé par Dr)', effect: 'stop' },
];

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function fetchResidents(): Promise<Resident[]> {
  const sb = createClient();
  const { data, error } = await sb.from('residents').select('*').eq('archived', false).order('last_name');
  if (error) throw new Error(error.message);
  return (data ?? []) as Resident[];
}

async function fetchVaccinations(): Promise<Vaccination[]> {
  const sb = createClient();
  const { data, error } = await sb.from('vaccination').select('*').order('resident_name');
  if (error) throw new Error(error.message);
  return (data ?? []) as Vaccination[];
}

async function fetchVaccinationsLT(): Promise<VaccinationLT[]> {
  const sb = createClient();
  const { data, error } = await sb.from('vaccination_long_terme').select('*').order('resident_name');
  if (error) throw new Error(error.message);
  return (data ?? []) as VaccinationLT[];
}

// ── Utility ───────────────────────────────────────────────────────────────────

function normalizeDate(val: string): string {
  if (!val) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
  const m = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return val;
}

function displayDate(val: string): string {
  if (!val) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    const [y, mo, d] = val.split('-');
    return `${d}/${mo}/${y}`;
  }
  return val;
}

function parseInfos(infos: string | null | undefined): { covid: string; grippe: string } {
  if (!infos) return { covid: '', grippe: '' };
  const parts: Record<string, string> = {};
  infos.split('|').forEach(p => {
    const [k, v] = p.split(':');
    if (k && v) parts[k.trim()] = v.trim();
  });
  return { covid: parts.covid || '', grippe: parts.grippe || '' };
}

function encodeInfos(covid: string, grippe: string): string | null {
  const parts: string[] = [];
  if (covid) parts.push(`covid:${covid}`);
  if (grippe) parts.push(`grippe:${grippe}`);
  return parts.join('|') || null;
}

function nextTetanosDate(isoDate: string | null | undefined): string {
  if (!isoDate) return '—';
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '—';
  return `${m[3]}/${m[2]}/${parseInt(m[1]) + 10}`;
}

function isTetanosOverdue(isoDate: string | null | undefined): boolean {
  if (!isoDate) return false;
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const due = new Date(parseInt(m[1]) + 10, parseInt(m[2]) - 1, parseInt(m[3]));
  return due < new Date();
}

// ── CellDisplay ───────────────────────────────────────────────────────────────

function CellDisplay({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-slate-300 text-xs">—</span>;
  const v = value.toLowerCase();
  const isDate    = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const isRefus   = v.includes('refus');
  const isAccepte = v === 'accepte';
  const isStop    = v === 'stop';
  const isAttente = v === 'en attente';
  if (isDate)    return <span className="text-green-700 font-medium text-xs">{displayDate(value)}</span>;
  if (isRefus)   return <span className="text-red-500 font-semibold text-xs">{value}</span>;
  if (isAccepte) return <span className="text-blue-600 font-semibold text-xs">✓ Accepte</span>;
  if (isStop)    return <span className="text-orange-600 font-semibold text-xs">⛔ STOP Dr</span>;
  if (isAttente) return <span className="text-amber-500 font-medium text-xs">{value}</span>;
  return <span className="text-slate-500 text-xs">{value}</span>;
}

// ── EditableCell ──────────────────────────────────────────────────────────────

function EditableCell({ value, field, recordId, onSaved, tableName = 'vaccination', readOnly }: {
  value: string | null | undefined;
  field: string;
  recordId: string;
  onSaved: () => void;
  tableName?: string;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value || '');
  const [lot, setLot] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setVal(value || ''); }, [value]);
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  const save = async (newVal: string, lotVal: string) => {
    setSaving(true);
    const toSave = normalizeDate(newVal) || null;
    const updates: Record<string, string | null> = { [field]: toSave, updated_at: new Date().toISOString() };
    if (lotVal && tableName === 'vaccination') updates.infos = `Lot: ${lotVal}`;
    const sb = createClient();
    const { error } = await sb.from(tableName).update(updates).eq('id', recordId);
    setSaving(false);
    setEditing(false);
    setLot('');
    if (error) { toast.error(error.message); return; }
    onSaved();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') save(val, lot);
    if (e.key === 'Escape') setEditing(false);
  };

  if (editing) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-lg shadow-lg p-4 w-full max-w-sm">
          <h3 className="font-semibold text-slate-900 mb-3">Enregistrer injection</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Date d&apos;injection *</label>
              <input
                ref={inputRef}
                type="text"
                value={val}
                onChange={e => setVal(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="JJ/MM/AAAA"
                className="w-full border border-green-400 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-green-400"
              />
            </div>
            {tableName === 'vaccination' && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Numéro de lot (optionnel)</label>
                <input
                  type="text"
                  value={lot}
                  onChange={e => setLot(e.target.value)}
                  placeholder="ex: AB12345"
                  className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-slate-300"
                />
              </div>
            )}
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => save(val, lot)}
              disabled={!val || saving}
              className="flex-1 p-1.5 bg-green-500 hover:bg-green-600 text-white rounded text-xs font-medium disabled:opacity-50 flex items-center justify-center gap-1"
            >
              <Save className="h-3 w-3" /> Enregistrer
            </button>
            <button onClick={() => { setEditing(false); setLot(''); }} className="flex-1 p-1.5 bg-slate-200 rounded text-xs font-medium">
              Annuler
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={readOnly ? undefined : () => setEditing(true)}
      className={`${readOnly ? 'cursor-default' : 'cursor-pointer'} px-1 py-0.5 rounded hover:bg-slate-100 min-w-[60px] min-h-[22px] flex items-center justify-center`}
    >
      <CellDisplay value={value} />
    </div>
  );
}

// ── InfosCell — dropdowns Covid + Grippe ──────────────────────────────────────

function InfosCell({ record, onSaved, readOnly }: { record: Vaccination; onSaved: () => void; readOnly?: boolean }) {
  const [saving, setSaving] = useState(false);
  const { covid: covidVal, grippe: grippeVal } = parseInfos(record.infos);

  const applyChoice = async (type: 'covid' | 'grippe', opt: { value: string; effect: string } | null) => {
    setSaving(true);
    const newCovid = type === 'covid' ? (opt?.value || '') : covidVal;
    const newGrippe = type === 'grippe' ? (opt?.value || '') : grippeVal;
    const updates: Record<string, string | null> = {
      infos: encodeInfos(newCovid, newGrippe),
      updated_at: new Date().toISOString(),
    };

    if (type === 'covid') {
      if (opt?.effect === 'refus') {
        updates.covid_inj1 = 'REFUS';
        updates.covid_inj2 = 'REFUS';
        updates.covid_inj3 = 'REFUS';
      } else if (opt?.effect === 'attente') {
        if (!record.covid_inj1 || record.covid_inj1 === 'REFUS' || record.covid_inj1 === 'STOP') updates.covid_inj1 = 'Accepte';
        if (!record.covid_inj2 || record.covid_inj2 === 'REFUS' || record.covid_inj2 === 'STOP') updates.covid_inj2 = 'Accepte';
        if (!record.covid_inj3 || record.covid_inj3 === 'REFUS' || record.covid_inj3 === 'STOP') updates.covid_inj3 = 'Accepte';
      } else if (opt?.effect === 'stop') {
        updates.covid_inj1 = 'STOP';
        updates.covid_inj2 = 'STOP';
        updates.covid_inj3 = 'STOP';
      } else {
        updates.covid_inj1 = null;
        updates.covid_inj2 = null;
        updates.covid_inj3 = null;
      }
    }

    if (type === 'grippe') {
      if (opt?.effect === 'refus') {
        updates.grippe_inj1 = 'REFUS';
      } else if (opt?.effect === 'attente') {
        if (!record.grippe_inj1 || record.grippe_inj1 === 'REFUS' || record.grippe_inj1 === 'STOP') updates.grippe_inj1 = 'Accepte';
      } else if (opt?.effect === 'stop') {
        updates.grippe_inj1 = 'STOP';
      } else {
        updates.grippe_inj1 = null;
      }
    }

    const sb = createClient();
    const { error } = await sb.from('vaccination').update(updates).eq('id', record.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    onSaved();
  };

  return (
    <div className="flex flex-col gap-1 min-w-[190px]">

      {/* Covid */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wide w-10 flex-shrink-0">Covid</span>
        <Select
          value={covidVal || '__none__'}
          disabled={readOnly}
          onValueChange={v => {
            if (v === '__clear__') { applyChoice('covid', null); return; }
            if (v === '__none__') return;
            const opt = COVID_OPTIONS.find(o => o.value === v);
            if (opt) applyChoice('covid', opt);
          }}
        >
          <SelectTrigger className={`h-6 px-2 text-xs border flex-1 ${
            covidVal?.toLowerCase().includes('refus')
              ? 'border-red-300 bg-red-50 text-red-700'
              : covidVal?.toLowerCase() === 'stop dr c'
              ? 'border-orange-300 bg-orange-50 text-orange-700'
              : covidVal
              ? 'border-blue-200 bg-blue-50 text-blue-800'
              : 'border-slate-200'
          }`}>
            <SelectValue placeholder="— choisir —" />
          </SelectTrigger>
          <SelectContent>
            {COVID_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            {covidVal && <SelectItem value="__clear__">— Effacer</SelectItem>}
          </SelectContent>
        </Select>
      </div>

      {/* Séparateur */}
      <div className="border-t border-slate-100 my-0.5" />

      {/* Grippe */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-bold text-purple-500 uppercase tracking-wide w-10 flex-shrink-0">Grippe</span>
        <Select
          value={grippeVal || '__none__'}
          disabled={readOnly}
          onValueChange={v => {
            if (v === '__clear__') { applyChoice('grippe', null); return; }
            if (v === '__none__') return;
            const opt = GRIPPE_OPTIONS.find(o => o.value === v);
            if (opt) applyChoice('grippe', opt);
          }}
        >
          <SelectTrigger className={`h-6 px-2 text-xs border flex-1 ${
            grippeVal?.toLowerCase().includes('refus')
              ? 'border-red-300 bg-red-50 text-red-700'
              : grippeVal?.toLowerCase() === 'stop dr g'
              ? 'border-orange-300 bg-orange-50 text-orange-700'
              : grippeVal
              ? 'border-purple-200 bg-purple-50 text-purple-800'
              : 'border-slate-200'
          }`}>
            <SelectValue placeholder="— choisir —" />
          </SelectTrigger>
          <SelectContent>
            {GRIPPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            {grippeVal && <SelectItem value="__clear__">— Effacer</SelectItem>}
          </SelectContent>
        </Select>
      </div>

      {saving && <span className="text-[10px] text-slate-300 animate-pulse text-center">…</span>}
    </div>
  );
}

// ── BulkInjectModal ───────────────────────────────────────────────────────────

function BulkInjectModal({ column, label, records, onClose, onDone }: {
  column: string;
  label: string;
  records: Vaccination[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [date, setDate] = useState('');
  const [lot, setLot] = useState('');
  const [saving, setSaving] = useState(false);

  const eligible = records.filter(r => {
    const v = (r as unknown as Record<string, string | null | undefined>)[column];
    if (!v) return true;
    return !v.toLowerCase().includes('refus');
  });

  const handleSave = async () => {
    if (!date) return;
    setSaving(true);
    const normalized = normalizeDate(date);
    const sb = createClient();
    await Promise.all(eligible.map(rec => {
      const updates: Record<string, string | null> = {
        [column]: normalized,
        updated_at: new Date().toISOString(),
      };
      if (lot && !rec.infos) updates.infos = `Lot: ${lot}`;
      return sb.from('vaccination').update(updates).eq('id', rec.id);
    }));
    setSaving(false);
    toast.success(`Injection enregistrée pour ${eligible.length} résident(s)`);
    onDone();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bold text-slate-900 text-lg">Injection en masse</h2>
            <p className="text-sm text-slate-500">Colonne : <span className="font-semibold text-blue-700">{label}</span></p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="bg-blue-50 rounded-lg px-4 py-2 mb-4 text-sm text-blue-700">
          {eligible.length} résident{eligible.length > 1 ? 's' : ''} éligible{eligible.length > 1 ? 's' : ''} (sans REFUS)
          {records.length - eligible.length > 0 && (
            <span className="ml-2 text-red-500">· {records.length - eligible.length} exclus (REFUS)</span>
          )}
        </div>

        <div className="space-y-3 mb-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Date d&apos;injection *</label>
            <input
              type="text"
              value={date}
              onChange={e => setDate(e.target.value)}
              placeholder="JJ/MM/AAAA"
              autoFocus
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Numéro de lot (optionnel)</label>
            <input
              type="text"
              value={lot}
              onChange={e => setLot(e.target.value)}
              placeholder="ex: AB12345"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-300"
            />
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={!date || saving}
            className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            <Zap className="h-4 w-4" />
            {saving ? 'Enregistrement…' : `Appliquer à ${eligible.length} résident${eligible.length > 1 ? 's' : ''}`}
          </button>
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

// ── RecoPanel — recommandations médicales ─────────────────────────────────────

function RecoPanel({ title, color, children }: { title: string; color: 'teal' | 'cyan'; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const cls = color === 'teal'
    ? { bg: 'bg-teal-50', border: 'border-teal-200', title: 'text-teal-800', btn: 'text-teal-700 hover:bg-teal-100', icon: 'text-teal-500' }
    : { bg: 'bg-cyan-50', border: 'border-cyan-200', title: 'text-cyan-800', btn: 'text-cyan-700 hover:bg-cyan-100', icon: 'text-cyan-500' };
  return (
    <div className={`${cls.bg} border ${cls.border} rounded-lg mb-3`}>
      <button onClick={() => setOpen(o => !o)} className={`w-full flex items-center justify-between px-4 py-2.5 ${cls.btn} transition-colors rounded-lg`}>
        <div className="flex items-center gap-2">
          <Info className={`w-4 h-4 ${cls.icon}`} />
          <span className={`text-sm font-semibold ${cls.title}`}>{title}</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

// ── VaccLTRow — ligne tétanos / pneumovax ─────────────────────────────────────

function VaccLTRow({ resident, record, field, onSaved, onCreateRecord, readOnly }: {
  resident: Resident;
  record?: VaccinationLT | null;
  field: 'tetanos_date' | 'pneumovax_date';
  onSaved: () => void;
  onCreateRecord?: () => void;
  readOnly?: boolean;
}) {
  const value = record ? record[field] : null;
  const displayName = `${(resident.last_name || '').toUpperCase()} ${resident.first_name || ''}`;
  const showNext = field === 'tetanos_date';
  const overdue = showNext ? isTetanosOverdue(value) : false;
  const nextDate = showNext ? nextTetanosDate(value) : null;

  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
      <td className="px-3 py-2 sticky left-0 bg-white font-medium text-slate-800 text-sm whitespace-nowrap">
        {displayName}
        {resident.room && <span className="ml-2 text-xs text-slate-400">Ch. {resident.room}</span>}
      </td>
      <td className="px-2 py-1.5 text-center">
        {record ? (
          <EditableCell value={value} field={field} recordId={record.id} onSaved={onSaved} tableName="vaccination_long_terme" readOnly={readOnly} />
        ) : (!readOnly && onCreateRecord) ? (
          <button onClick={onCreateRecord} className="text-xs text-green-600 hover:underline">+ Ajouter</button>
        ) : (
          <span className="text-slate-300 text-xs">—</span>
        )}
      </td>
      {showNext && (
        <td className="px-3 py-2 text-center text-xs">
          {value ? (
            <span className={overdue ? 'text-red-600 font-semibold' : 'text-slate-500'}>
              {nextDate} {overdue && '⚠️'}
            </span>
          ) : (
            <span className="text-slate-300">—</span>
          )}
        </td>
      )}
      <td className="px-3 py-2 text-center">
        {record ? (
          <EditableCell value={record.notes} field="notes" recordId={record.id} onSaved={onSaved} tableName="vaccination_long_terme" readOnly={readOnly} />
        ) : (
          <span className="text-slate-300 text-xs">—</span>
        )}
      </td>
    </tr>
  );
}

// ── VacRow ────────────────────────────────────────────────────────────────────

function VacRow({ resident, record, onSaved, showYear = false, onCreateRecord, readOnly }: {
  resident?: Resident | null;
  record?: Vaccination | null;
  onSaved: () => void;
  showYear?: boolean;
  onCreateRecord?: () => void;
  readOnly?: boolean;
}) {
  const [resetting, setSaving] = useState(false);

  const handleReset = async () => {
    if (!record) return;
    setSaving(true);
    const sb = createClient();
    await sb.from('vaccination').update({
      covid_inj1: null, covid_inj2: null, covid_inj3: null, grippe_inj1: null, infos: null,
      updated_at: new Date().toISOString(),
    }).eq('id', record.id);
    setSaving(false);
    onSaved();
  };

  const displayName = resident
    ? `${(resident.last_name || '').toUpperCase()} ${resident.first_name || ''}`
    : record?.resident_name || '';

  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50 transition-colors group">
      {showYear && (
        <td className="px-3 py-1.5 text-xs font-semibold text-slate-600">{record?.year}</td>
      )}
      <td className="px-3 py-2 sticky left-0 bg-white font-medium text-slate-800 text-sm whitespace-nowrap">
        {displayName}
        {resident?.room && <span className="ml-2 text-xs text-slate-400">Ch. {resident.room}</span>}
      </td>
      {record ? (
        <>
          <td className="px-2 py-1.5 text-center">
            <EditableCell value={record.covid_inj1} field="covid_inj1" recordId={record.id} onSaved={onSaved} readOnly={readOnly} />
          </td>
          <td className="px-2 py-1.5 text-center">
            <EditableCell value={record.covid_inj2} field="covid_inj2" recordId={record.id} onSaved={onSaved} readOnly={readOnly} />
          </td>
          <td className="px-2 py-1.5 text-center">
            <EditableCell value={record.covid_inj3} field="covid_inj3" recordId={record.id} onSaved={onSaved} readOnly={readOnly} />
          </td>
          <td className="px-2 py-1.5 text-center">
            <EditableCell value={record.grippe_inj1} field="grippe_inj1" recordId={record.id} onSaved={onSaved} readOnly={readOnly} />
          </td>
          <td className="px-2 py-1.5">
            <InfosCell record={record} onSaved={onSaved} readOnly={readOnly} />
          </td>
          <td className="px-2 py-1.5 print:hidden">
            {!readOnly && (
              <button
                onClick={handleReset}
                disabled={resetting}
                title="Réinitialiser la ligne"
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </td>
        </>
      ) : (
        <>
          <td className="px-3 py-2 text-center"><span className="text-slate-200 text-xs">—</span></td>
          <td className="px-3 py-2 text-center"><span className="text-slate-200 text-xs">—</span></td>
          <td className="px-3 py-2 text-center"><span className="text-slate-200 text-xs">—</span></td>
          <td className="px-3 py-2 text-center"><span className="text-slate-200 text-xs">—</span></td>
          <td className="px-3 py-2">
            {!readOnly && onCreateRecord && (
              <button onClick={onCreateRecord} className="text-xs text-green-600 hover:underline">
                + Ajouter
              </button>
            )}
          </td>
          <td className="px-2 py-1.5 print:hidden" />
        </>
      )}
    </tr>
  );
}

// ── ColHeader ─────────────────────────────────────────────────────────────────

function ColHeader({ label, colorClass, onBulk, readOnly }: { label: string; colorClass: string; onBulk: () => void; readOnly?: boolean }) {
  return (
    <th className={`px-3 py-2 text-center ${colorClass}`}>
      <div className="flex flex-col items-center gap-1">
        <span className="font-bold text-xs">{label}</span>
        {!readOnly && (
          <button
            onClick={onBulk}
            title="Injection en masse"
            className="flex items-center gap-0.5 text-xs opacity-60 hover:opacity-100 bg-white/70 hover:bg-white px-1.5 py-0.5 rounded transition-all print:hidden"
          >
            <Zap className="h-2.5 w-2.5" /> masse
          </button>
        )}
      </div>
    </th>
  );
}

// ── Network background ────────────────────────────────────────────────────────

const NODES: [number, number][] = [
  [60,80],[180,30],[320,110],[480,55],[630,130],[790,40],[940,105],[1100,25],[1260,90],[1420,50],
  [100,220],[250,175],[410,240],[570,195],[720,260],[880,185],[1030,245],[1190,170],[1350,230],[1470,195],
  [40,380],[200,340],[360,410],[530,360],[680,420],[840,355],[1000,395],[1160,330],[1320,400],[1460,360],
  [120,540],[280,500],[440,565],[600,510],[760,570],[920,505],[1080,555],[1240,490],[1390,545],[1490,510],
];
const EDGES: [number, number][] = (() => {
  const e: [number, number][] = [];
  for (let i = 0; i < NODES.length; i++)
    for (let j = i + 1; j < NODES.length; j++) {
      const dx = NODES[i][0] - NODES[j][0], dy = NODES[i][1] - NODES[j][1];
      if (dx * dx + dy * dy < 220 * 220) e.push([i, j]);
    }
  return e;
})();

// ── Dense page background network ────────────────────────────────────────────
const PG_NODES: [number, number][] = (() => {
  const pts: [number, number][] = [];
  const cols = 16, rows = 11;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = Math.round((c / (cols - 1)) * 1500);
      const y = Math.round((r / (rows - 1)) * 1000);
      const ox = ((c * 7 + r * 13) % 50) - 25;
      const oy = ((r * 11 + c * 17) % 50) - 25;
      pts.push([Math.max(0, Math.min(1500, x + ox)), Math.max(0, Math.min(1000, y + oy))]);
    }
  }
  return pts;
})();
const PG_EDGES: [number, number][] = (() => {
  const e: [number, number][] = [];
  for (let i = 0; i < PG_NODES.length; i++)
    for (let j = i + 1; j < PG_NODES.length; j++) {
      const dx = PG_NODES[i][0] - PG_NODES[j][0], dy = PG_NODES[i][1] - PG_NODES[j][1];
      if (dx * dx + dy * dy < 160 * 160) e.push([i, j]);
    }
  return e;
})();

function NetworkBackground() {
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 1500 600" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
      {EDGES.map(([i, j], idx) => (
        <line key={idx} x1={NODES[i][0]} y1={NODES[i][1]} x2={NODES[j][0]} y2={NODES[j][1]}
          stroke="#8aabcc" strokeWidth="0.7" strokeOpacity="0.3" />
      ))}
      {NODES.map(([x, y], idx) => (
        <circle key={idx} cx={x} cy={y} r="3" fill="#8aabcc" fillOpacity="0.4" />
      ))}
    </svg>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function VaccinationPage() {
  const queryClient = useQueryClient();
  const access = useModuleAccess('vaccination');
  const readOnly = access === 'read';

  const { data: colorOverrides = {} } = useQuery<ColorOverrides>({
    queryKey: ['settings', 'module_colors'],
    queryFn: fetchColorOverrides,
    staleTime: 30000,
  });
  const vacModule = MODULES.find(m => m.id === 'vaccination');
  const colorFrom = colorOverrides['vaccination']?.from ?? vacModule?.cardFrom ?? '#0d9080';
  const colorTo   = colorOverrides['vaccination']?.to   ?? vacModule?.cardTo   ?? '#087060';

  const [activeTab, setActiveTab] = useState<'covid-grippe' | 'tetanos' | 'pneumovax'>('covid-grippe');
  const [search, setSearch] = useState('');
  const [floorFilter, setFloorFilter] = useState('ALL');
  const [showArchivedSection, setShowArchivedSection] = useState(false);
  const [archiveOpenName, setArchiveOpenName] = useState<string | null>(null);
  const [bulkModal, setBulkModal] = useState<{ column: string; label: string; records: Vaccination[] } | null>(null);
  const [sheetModal, setSheetModal] = useState(false);
  const [sheetType, setSheetType] = useState<'covid_inj1' | 'covid_inj2' | 'covid_inj3' | 'grippe_inj1'>('grippe_inj1');
  const [sheetFloor, setSheetFloor] = useState<'ALL' | 'RDC' | '1ER'>('ALL');
  const pastYears = [...Array(Math.max(0, CURRENT_YEAR - 2022))].map((_, i) => CURRENT_YEAR - 1 - i);
  const [selectedPastYear, setSelectedPastYear] = useState<number | null>(pastYears[0] ?? null);

  const { data: residents = [], isLoading: loadingResidents } = useQuery({
    queryKey: ['residents'],
    queryFn: fetchResidents,
  });

  const { data: vaccinations = [], isLoading: loadingVac } = useQuery({
    queryKey: ['vaccinations'],
    queryFn: fetchVaccinations,
  });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['vaccinations'] });
  }, [queryClient]);

  const createMutation = useMutation({
    mutationFn: async (data: Omit<Vaccination, 'id'>) => {
      const sb = createClient();
      const { error } = await sb.from('vaccination').insert(data);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
    onError: (e) => toast.error((e as Error).message),
  });

  const { data: vaccinationsLT = [], isLoading: loadingLT } = useQuery({
    queryKey: ['vaccinations_lt'],
    queryFn: fetchVaccinationsLT,
  });

  const invalidateLT = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['vaccinations_lt'] });
  }, [queryClient]);

  const createMutationLT = useMutation({
    mutationFn: async (data: Omit<VaccinationLT, 'id'>) => {
      const sb = createClient();
      const { error } = await sb.from('vaccination_long_terme').insert(data);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidateLT,
    onError: (e) => toast.error((e as Error).message),
  });

  const loading = loadingResidents || loadingVac || loadingLT;

  // ── Derived data ──────────────────────────────────────────────────────────

  const getVaccinsForResident = useCallback((resident: Resident): Vaccination[] => {
    const byId = vaccinations.filter(v => v.resident_id === resident.id);
    if (byId.length) return byId;
    const fullKey = `${resident.last_name} ${resident.first_name || ''}`.toLowerCase().trim();
    const byFullName = vaccinations.filter(v => (v.resident_name || '').toLowerCase().trim() === fullKey);
    if (byFullName.length) return byFullName;
    const lastName = (resident.last_name || '').toLowerCase().trim();
    return vaccinations.filter(v => {
      const vName = (v.resident_name || '').toLowerCase().trim();
      return vName === lastName || vName.startsWith(lastName + ' ') || vName.startsWith(lastName + '.');
    });
  }, [vaccinations]);

  const activeResidents = residents
    .filter(r => !r.archived)
    .filter(r => floorFilter === 'ALL' || r.floor === floorFilter)
    .filter(r => {
      const q = search.toLowerCase();
      return !q || `${r.last_name} ${r.first_name || ''}`.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const na = parseInt((a.room || '').replace(/\D/g, '') || '0');
      const nb = parseInt((b.room || '').replace(/\D/g, '') || '0');
      return na - nb;
    });

  const archivedResidents = residents
    .filter(r => r.archived)
    .sort((a, b) => (a.last_name || '').localeCompare(b.last_name || ''));

  const allResidentIds = new Set(residents.map(r => r.id));
  const orphanVaccinations = vaccinations.filter(v => {
    if (!v.archived) return false;
    if (v.resident_id && allResidentIds.has(v.resident_id)) return false;
    const vName = (v.resident_name || '').toLowerCase().trim();
    return !residents.find(r => {
      const rFull = `${r.last_name} ${r.first_name || ''}`.toLowerCase().trim();
      const rLast = (r.last_name || '').toLowerCase().trim();
      return rFull === vName || vName === rLast || vName.startsWith(rLast + ' ');
    });
  });
  const orphanByName: Record<string, Vaccination[]> = {};
  orphanVaccinations.forEach(v => {
    const k = (v.resident_name || '').trim();
    if (!orphanByName[k]) orphanByName[k] = [];
    orphanByName[k].push(v);
  });
  const orphanNames = Object.keys(orphanByName).sort();

  // Stats (all active, all floors)
  const allActiveCurrentYear = residents
    .filter(r => !r.archived)
    .map(r => getVaccinsForResident(r).find(v => v.year === CURRENT_YEAR))
    .filter(Boolean) as Vaccination[];

  const getLTRecord = useCallback((resident: Resident): VaccinationLT | undefined => {
    return vaccinationsLT.find(v =>
      v.resident_id === resident.id ||
      (v.resident_name || '').toLowerCase().trim() === `${resident.last_name} ${resident.first_name || ''}`.toLowerCase().trim()
    );
  }, [vaccinationsLT]);

  const isAccepteOrAttente = (v: string | null | undefined) =>
    !!v && (v.toLowerCase() === 'accepte' || v.toLowerCase() === 'en attente');

  const covidEnAttente = allActiveCurrentYear.filter(r =>
    [r.covid_inj1, r.covid_inj2, r.covid_inj3].some(isAccepteOrAttente)
  ).length;
  const grippeEnAttente = allActiveCurrentYear.filter(r =>
    isAccepteOrAttente(r.grippe_inj1)
  ).length;

  const currentYearRecords = activeResidents
    .map(r => getVaccinsForResident(r).find(v => v.year === CURRENT_YEAR))
    .filter(Boolean) as Vaccination[];

  const COL_HEADERS = [
    { field: 'covid_inj1', label: `${CURRENT_YEAR} — Covid Inj. 1`, colorClass: 'bg-blue-50 text-blue-700' },
    { field: 'covid_inj2', label: `${CURRENT_YEAR} — Covid Inj. 2`, colorClass: 'bg-blue-50 text-blue-700' },
    { field: 'covid_inj3', label: `${CURRENT_YEAR} — Covid Inj. 3`, colorClass: 'bg-blue-50 text-blue-700' },
    { field: 'grippe_inj1', label: `${CURRENT_YEAR} — Grippe`,     colorClass: 'bg-purple-50 text-purple-700' },
  ];

  // ── Print ─────────────────────────────────────────────────────────────────

  const handlePrint = () => {
    const rows = activeResidents.map(r => {
      const rec = getVaccinsForResident(r).find(v => v.year === CURRENT_YEAR);
      const d = (v: string | null | undefined) => {
        if (!v) return '—';
        if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return displayDate(v);
        return v;
      };
      return `<tr>
        <td>${(r.last_name || '').toUpperCase()} ${r.first_name || ''}</td>
        <td style="text-align:center">${r.room || '—'}</td>
        <td style="text-align:center">${d(rec?.covid_inj1)}</td>
        <td style="text-align:center">${d(rec?.covid_inj2)}</td>
        <td style="text-align:center">${d(rec?.covid_inj3)}</td>
        <td style="text-align:center">${d(rec?.grippe_inj1)}</td>
        <td>${rec?.infos || ''}</td>
      </tr>`;
    }).join('');
    const win = window.open('', '_blank')!;
    win.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/>
<title>Vaccination ${CURRENT_YEAR}</title>
<style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:11px;margin:10mm;color:#1e293b}
h1{font-size:16px;font-weight:bold;margin-bottom:2px}.sub{font-size:10px;color:#64748b;margin-bottom:10px}
table{width:100%;border-collapse:collapse}th{background:#334155;color:white;padding:5px 8px;text-align:left;font-size:10px}
td{border:1px solid #e2e8f0;padding:4px 8px}tr:nth-child(even){background:#f8fafc}
@page{size:A4 landscape;margin:10mm}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style>
</head><body>
<h1>Vaccination — Résidents ${CURRENT_YEAR}</h1>
<div class="sub">Imprimé le ${new Date().toLocaleDateString('fr-FR')} — ${activeResidents.length} résidents</div>
<table><thead><tr><th>Résident</th><th>Chambre</th><th>Covid Inj.1</th><th>Covid Inj.2</th><th>Covid Inj.3</th><th>Grippe</th><th>Infos/Statut</th></tr></thead>
<tbody>${rows}</tbody></table>
</body></html>`);
    win.document.close();
    setTimeout(() => { win.print(); }, 300);
  };

  // ── Feuille de vaccination (à remplir au moment de l'injection) ───────────

  const printVaccinationSheet = () => {
    const SHEET_LABELS: Record<typeof sheetType, string> = {
      covid_inj1: 'Covid — Injection 1',
      covid_inj2: 'Covid — Injection 2',
      covid_inj3: 'Covid — Injection 3',
      grippe_inj1: 'Grippe',
    };
    const label = SHEET_LABELS[sheetType];
    const floorLabel = sheetFloor === 'ALL' ? 'Tous les étages' : sheetFloor === 'RDC' ? 'Rez-de-chaussée' : '1er étage';

    const list = residents
      .filter(r => !r.archived)
      .filter(r => sheetFloor === 'ALL' || r.floor === sheetFloor)
      .sort((a, b) => {
        const fa = (a.floor || '').localeCompare(b.floor || '');
        if (fa !== 0) return fa;
        const na = parseInt((a.room || '').replace(/\D/g, '') || '0');
        const nb = parseInt((b.room || '').replace(/\D/g, '') || '0');
        return na - nb;
      });

    const rows = list.map(r => {
      const rec = getVaccinsForResident(r).find(v => v.year === CURRENT_YEAR);
      const raw = rec?.[sheetType] as string | null | undefined;
      const v = (raw || '').trim();
      const isRefus = v.toUpperCase() === 'REFUS' || /refus/i.test(v);
      const isStop = v.toUpperCase() === 'STOP' || /stop/i.test(v);
      const isDate = /^\d{4}-\d{2}-\d{2}$/.test(v);

      let statusCell = '';
      let tempCell = '<td class="temp"></td>';
      let checkCell = '<td class="check"><div class="checkbox"></div></td>';

      if (isRefus) {
        statusCell = '<td class="status refus">REFUS</td>';
        tempCell = '<td class="temp muted">—</td>';
        checkCell = '<td class="check muted">—</td>';
      } else if (isStop) {
        statusCell = '<td class="status stop">STOP Dr</td>';
        tempCell = '<td class="temp muted">—</td>';
        checkCell = '<td class="check muted">—</td>';
      } else if (isDate) {
        statusCell = `<td class="status done">Déjà fait — ${displayDate(v)}</td>`;
        tempCell = '<td class="temp muted">—</td>';
        checkCell = '<td class="check muted">—</td>';
      } else {
        statusCell = '<td class="status accept">À vacciner</td>';
      }

      return `<tr>
        <td class="room">${r.room || '—'}</td>
        <td class="floor">${r.floor || ''}</td>
        <td class="name">${(r.last_name || '').toUpperCase()} ${r.first_name || ''}</td>
        ${statusCell}
        ${tempCell}
        ${checkCell}
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/>
<title>Feuille — ${label}</title>
<style>
  *{box-sizing:border-box}
  body{font-family:Arial,sans-serif;font-size:12px;margin:10mm;color:#1e293b}
  h1{font-size:18px;font-weight:bold;margin-bottom:2px}
  .sub{font-size:11px;color:#64748b;margin-bottom:12px}
  .meta{display:flex;gap:18px;margin-bottom:10px;font-size:11px}
  .meta b{color:#0f172a}
  table{width:100%;border-collapse:collapse;margin-top:6px}
  th{background:#0f766e;color:white;padding:7px 8px;text-align:left;font-size:11px;border:1px solid #0f766e}
  td{border:1px solid #cbd5e1;padding:6px 8px;font-size:12px}
  td.room{text-align:center;font-weight:600;width:55px}
  td.floor{text-align:center;width:55px;color:#64748b;font-size:10px}
  td.name{font-weight:600}
  td.status{text-align:center;font-weight:700;width:130px}
  td.status.refus{background:#fee2e2;color:#b91c1c}
  td.status.stop{background:#ffedd5;color:#c2410c}
  td.status.done{background:#dcfce7;color:#166534;font-weight:500}
  td.status.accept{background:#eff6ff;color:#1e40af}
  td.temp{width:90px;text-align:center}
  td.temp.muted, td.check.muted{background:#f8fafc;color:#cbd5e1;text-align:center}
  td.check{width:60px;text-align:center}
  .checkbox{width:18px;height:18px;border:2px solid #475569;border-radius:3px;display:inline-block}
  tr:nth-child(even) td:not(.status){background:#f8fafc}
  .signature{margin-top:18px;display:flex;gap:30px;font-size:11px}
  .signature .box{flex:1}
  .signature .box .label{color:#64748b;margin-bottom:4px}
  .signature .box .area{border-bottom:1px solid #94a3b8;height:38px}
  @page{size:A4 portrait;margin:10mm}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style>
</head><body>
<h1>Feuille de vaccination — ${label}</h1>
<div class="sub">Imprimée le ${new Date().toLocaleDateString('fr-FR')}</div>
<div class="meta">
  <div><b>Étage :</b> ${floorLabel}</div>
  <div><b>Année :</b> ${CURRENT_YEAR}</div>
  <div><b>Résidents :</b> ${list.length}</div>
</div>
<table>
  <thead>
    <tr>
      <th style="text-align:center">Chambre</th>
      <th style="text-align:center">Étage</th>
      <th>Résident</th>
      <th style="text-align:center">Statut</th>
      <th style="text-align:center">Température</th>
      <th style="text-align:center">Fait</th>
    </tr>
  </thead>
  <tbody>${rows || '<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:20px">Aucun résident</td></tr>'}</tbody>
</table>
<div class="signature">
  <div class="box"><div class="label">Soignant·e</div><div class="area"></div></div>
  <div class="box"><div class="label">Date</div><div class="area"></div></div>
</div>
</body></html>`;

    const win = window.open('', '_blank')!;
    win.document.write(html);
    win.document.close();
    setTimeout(() => { win.print(); }, 300);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen relative" style={{ background: '#dde4ee' }}>
      {/* Dense page background network */}
      <div className="print:hidden" style={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.5 }}
          viewBox="0 0 1500 1000" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
          {PG_EDGES.map(([i, j], idx) => (
            <line key={idx} x1={PG_NODES[i][0]} y1={PG_NODES[i][1]} x2={PG_NODES[j][0]} y2={PG_NODES[j][1]}
              stroke={darkenHex(colorFrom, 30)} strokeWidth="0.8" />
          ))}
          {PG_NODES.map(([x, y], idx) => (
            <circle key={idx} cx={x} cy={y} r="3" fill={darkenHex(colorFrom, 20)} />
          ))}
        </svg>
      </div>

      {sheetModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setSheetModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h2 className="font-semibold text-slate-900">Préparer la feuille de vaccination</h2>
                <p className="text-xs text-slate-500">Choisissez le vaccin et l&apos;étage</p>
              </div>
              <button onClick={() => setSheetModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">Vaccin</label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ['covid_inj1', 'Covid — Inj. 1'],
                    ['covid_inj2', 'Covid — Inj. 2'],
                    ['covid_inj3', 'Covid — Inj. 3'],
                    ['grippe_inj1', 'Grippe'],
                  ] as const).map(([val, lbl]) => (
                    <button key={val} onClick={() => setSheetType(val)}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        sheetType === val
                          ? 'border-teal-500 bg-teal-50 text-teal-800'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}>
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">Étage</label>
                <div className="flex gap-2">
                  {([
                    ['ALL', 'Tous'],
                    ['RDC', 'Rez-de-chaussée'],
                    ['1ER', '1er étage'],
                  ] as const).map(([val, lbl]) => (
                    <button key={val} onClick={() => setSheetFloor(val)}
                      className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        sheetFloor === val
                          ? 'border-teal-500 bg-teal-50 text-teal-800'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}>
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 justify-end p-4 border-t">
              <button onClick={() => setSheetModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition-colors">
                Annuler
              </button>
              <button onClick={() => { printVaccinationSheet(); setSheetModal(false); }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors">
                <Printer className="h-4 w-4" /> Imprimer la feuille
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkModal && (
        <BulkInjectModal
          column={bulkModal.column}
          label={bulkModal.label}
          records={bulkModal.records}
          onClose={() => setBulkModal(null)}
          onDone={() => { setBulkModal(null); invalidate(); }}
        />
      )}

      <div className="relative" style={{ zIndex: 1 }}>
        {/* ── Gradient Header ── */}
        <div className="print:hidden relative overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${colorFrom} 0%, ${colorTo} 100%)` }}>
          <div className="absolute inset-0 pointer-events-none"><NetworkBackground /></div>
          <div className="relative z-10 max-w-6xl mx-auto px-6 py-5">
            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 text-white/50 text-xs mb-4">
              <Link href="/" className="hover:text-white/80 transition-colors">Accueil</Link>
              <span>›</span>
              <span className="text-white/90">Vaccination</span>
            </div>
            {/* Icon + title + controls */}
            <div className="flex flex-wrap items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
                <Syringe className="h-6 w-6 text-white" strokeWidth={1.5} />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold text-white">Vaccination</h1>
                <p className="text-white/70 text-sm hidden sm:block">Suivi Covid &amp; Grippe — Année {CURRENT_YEAR}</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => setSheetModal(true)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white text-teal-700 hover:bg-teal-50 text-sm font-semibold transition-colors">
                  <ClipboardList className="h-4 w-4" /> Feuille de vaccination
                </button>
                <button onClick={handlePrint}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/20 hover:bg-white/20 text-white text-sm font-medium transition-colors">
                  <Printer className="h-4 w-4" /> Imprimer
                </button>
                <button onClick={invalidate}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/20 hover:bg-white/20 text-white text-sm font-medium transition-colors">
                  <RefreshCw className="h-4 w-4" /> Actualiser
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-6">

        {/* ── Onglets ──────────────────────────────────────────────────────── */}
        <div className="flex gap-1 mb-6 bg-white border border-slate-200 rounded-2xl p-1.5 shadow-sm w-fit">
          {([
            { id: 'covid-grippe', label: 'Covid & Grippe', color: 'blue' },
            { id: 'tetanos',      label: 'Tétanos',        color: 'teal' },
            { id: 'pneumovax',    label: 'Pneumovax',      color: 'cyan' },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
                activeTab === tab.id
                  ? tab.color === 'blue'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : tab.color === 'teal'
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
            >
              <Syringe className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {readOnly && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 mb-4 text-sm text-blue-700 font-medium">
            <Eye className="h-4 w-4 flex-shrink-0" />
            Vous consultez cette page en lecture seule.
          </div>
        )}

        {/* Filtres — visibles sur tous les onglets */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un résident..."
            className="w-64 pl-3 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-300 bg-white"
          />
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1">
            {([['ALL', 'Tous'], ['RDC', 'RDC'], ['1ER', '1er']] as [string, string][]).map(([val, lbl]) => (
              <button
                key={val}
                onClick={() => setFloorFilter(val)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${floorFilter === val ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-800'}`}
              >
                {lbl}
              </button>
            ))}
          </div>
        </div>

        {/* ── Contenu onglet Covid & Grippe ────────────────────────────────── */}
        {activeTab === 'covid-grippe' && (<>

        {/* Stats */}
        <div className="flex flex-wrap gap-3 mb-5">
          <div className="flex items-center gap-3 bg-white border border-blue-200 rounded-xl px-5 py-3 min-w-[200px] shadow-sm">
            <div className="p-2 bg-blue-100 rounded-full">
              <Syringe className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <div className="text-xs text-blue-500 font-medium uppercase tracking-wide">Covid — Accepte</div>
              <div className="text-2xl font-bold text-blue-800">{covidEnAttente}</div>
              <div className="text-xs text-blue-400">résident{covidEnAttente > 1 ? 's' : ''} à vacciner</div>
            </div>
          </div>
          <div className="flex items-center gap-3 bg-white border border-purple-200 rounded-xl px-5 py-3 min-w-[200px] shadow-sm">
            <div className="p-2 bg-purple-100 rounded-full">
              <Syringe className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <div className="text-xs text-purple-500 font-medium uppercase tracking-wide">Grippe — Accepte</div>
              <div className="text-2xl font-bold text-purple-800">{grippeEnAttente}</div>
              <div className="text-xs text-purple-400">résident{grippeEnAttente > 1 ? 's' : ''} à vacciner</div>
            </div>
          </div>
        </div>

        {/* Légende */}
        <div className="flex flex-wrap gap-3 mb-4">
          {[
            { el: <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />, label: 'Date injectée' },
            { el: <span className="text-blue-600 font-bold text-xs">✓</span>, label: 'Accepte' },
            { el: <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />, label: 'REFUS' },
            { el: <Zap className="h-3 w-3 text-slate-500" />, label: 'Cliquer sur en-tête pour injection en masse' },
            { el: <span>✏️</span>, label: 'Cliquer sur une cellule pour éditer' },
          ].map(({ el, label }, i) => (
            <span key={i} className="flex items-center gap-1.5 bg-white/90 shadow-sm border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-700 font-medium">
              {el}{label}
            </span>
          ))}
        </div>

        {/* Table année courante */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-4">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
            <span className="font-semibold text-slate-800 text-sm">Résidents actuels — {CURRENT_YEAR}</span>
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{activeResidents.length} résidents</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100 text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-3 py-2 text-left sticky left-0 bg-slate-100 z-10">Résident</th>
                  {COL_HEADERS.map(col => (
                    <ColHeader
                      key={col.field}
                      label={col.label}
                      colorClass={col.colorClass}
                      onBulk={() => setBulkModal({ column: col.field, label: col.label, records: currentYearRecords })}
                      readOnly={readOnly}
                    />
                  ))}
                  <th className="px-3 py-2 text-left min-w-[210px]">Infos / Statut</th>
                  <th className="px-3 py-2 w-8 print:hidden" />
                </tr>
              </thead>
              <tbody>
                {activeResidents.map(resident => {
                  const allRecs = getVaccinsForResident(resident);
                  const currentRecord = allRecs.find(r => r.year === CURRENT_YEAR);
                  return (
                    <VacRow
                      key={resident.id}
                      resident={resident}
                      record={currentRecord}
                      onSaved={invalidate}
                      readOnly={readOnly}
                      onCreateRecord={!currentRecord && !readOnly ? () => {
                        createMutation.mutate({
                          resident_id: resident.id,
                          resident_name: `${resident.last_name} ${resident.first_name || ''}`.trim(),
                          year: CURRENT_YEAR,
                          archived: false,
                        });
                      } : undefined}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Années précédentes */}
        {pastYears.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden mb-4">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
              <span className="font-semibold text-slate-700 text-sm">Années précédentes — résidents actuels</span>
            </div>
            <div className="flex gap-1 px-4 pt-3 pb-0 overflow-x-auto border-b border-slate-100">
              {pastYears.map(year => (
                <button
                  key={year}
                  onClick={() => setSelectedPastYear(year)}
                  className={`px-4 py-2 rounded-t-lg text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    selectedPastYear === year ? 'border-slate-800 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {year}
                </button>
              ))}
            </div>
            <div className="overflow-x-auto">
              {selectedPastYear && (() => {
                const rows = residents
                  .filter(r => !r.archived)
                  .filter(r => floorFilter === 'ALL' || r.floor === floorFilter)
                  .map(r => ({ resident: r, rec: getVaccinsForResident(r).find(v => v.year === selectedPastYear) }))
                  .filter(({ rec }) => !!rec);
                if (rows.length === 0) return (
                  <p className="px-4 py-6 text-center text-sm text-slate-400 italic">Aucune donnée pour {selectedPastYear}</p>
                );
                return (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-xs text-slate-400">
                        <th className="px-3 py-1.5 text-left sticky left-0 bg-slate-50">Résident</th>
                        <th className="px-3 py-1.5 text-center">Covid Inj. 1</th>
                        <th className="px-3 py-1.5 text-center">Covid Inj. 2</th>
                        <th className="px-3 py-1.5 text-center">Covid Inj. 3</th>
                        <th className="px-3 py-1.5 text-center">Grippe</th>
                        <th className="px-3 py-1.5 text-left">Infos / Statut</th>
                        <th className="px-3 py-1.5 w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ resident, rec }) => (
                        <VacRow key={resident.id} resident={resident} record={rec} onSaved={invalidate} readOnly={readOnly} />
                      ))}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          </div>
        )}

        </>)}
        {/* ── Contenu onglet Tétanos ───────────────────────────────────────── */}
        {activeTab === 'tetanos' && (
        <div className="bg-white rounded-xl border border-teal-200 overflow-hidden mb-4">
          <div className="px-4 py-3 border-b border-teal-100 bg-teal-50 flex items-center gap-2">
            <Syringe className="h-4 w-4 text-teal-600" />
            <span className="font-semibold text-teal-800 text-sm">Tétanos — Suivi des rappels</span>
            <span className="ml-auto text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full">{activeResidents.length} résidents</span>
          </div>
          <div className="px-4 pt-3">
            <RecoPanel title="Recommandations — Tétanos en EHPAD" color="teal">
              <ul className="mt-2 space-y-1.5 text-xs text-teal-900">
                <li className="flex gap-2"><span className="font-bold">🔁</span><span><strong>Rappel tous les 10 ans</strong> chez l&apos;adulte (vaccin dT ou dTP selon statut polio/coqueluche)</span></li>
                <li className="flex gap-2"><span className="font-bold">📋</span><span>En EHPAD, si la date du dernier rappel est <strong>inconnue</strong> : administrer une dose, puis rappel dans 10 ans</span></li>
                <li className="flex gap-2"><span className="font-bold">📅</span><span>Calendrier vaccinal français : rappel à 65 ans puis tous les 10 ans (75, 85…)</span></li>
                <li className="flex gap-2"><span className="font-bold">⚠️</span><span>Les résidents ≥ 65 ans reçoivent le vaccin <strong>dT</strong> (diphtérie-tétanos, sans coqueluche)</span></li>
                <li className="flex gap-2"><span className="font-bold">💊</span><span>Vaccins disponibles : Revaxis® (dTP), Imovax® Tétanos, DT Polio Merieux®</span></li>
              </ul>
            </RecoPanel>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-teal-50 text-xs text-teal-700 uppercase tracking-wide">
                  <th className="px-3 py-2 text-left sticky left-0 bg-teal-50 z-10">Résident</th>
                  <th className="px-3 py-2 text-center">Dernière injection</th>
                  <th className="px-3 py-2 text-center">Prochain rappel (J+10 ans)</th>
                  <th className="px-3 py-2 text-center">Notes</th>
                </tr>
              </thead>
              <tbody>
                {activeResidents.map(resident => {
                  const ltRec = getLTRecord(resident);
                  return (
                    <VaccLTRow
                      key={resident.id}
                      resident={resident}
                      record={ltRec}
                      field="tetanos_date"
                      onSaved={invalidateLT}
                      readOnly={readOnly}
                      onCreateRecord={!ltRec && !readOnly ? () => createMutationLT.mutate({
                        resident_id: resident.id,
                        resident_name: `${resident.last_name} ${resident.first_name || ''}`.trim(),
                        archived: false,
                      }) : undefined}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        )}
        {/* ── Contenu onglet Pneumovax ─────────────────────────────────────── */}
        {activeTab === 'pneumovax' && (
        <div className="bg-white rounded-xl border border-cyan-200 overflow-hidden mb-4">
          <div className="px-4 py-3 border-b border-cyan-100 bg-cyan-50 flex items-center gap-2">
            <Syringe className="h-4 w-4 text-cyan-600" />
            <span className="font-semibold text-cyan-800 text-sm">Pneumovax — Vaccination antipneumococcique</span>
            <span className="ml-auto text-xs bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded-full">{activeResidents.length} résidents</span>
          </div>
          <div className="px-4 pt-3">
            <RecoPanel title="Recommandations — Pneumocoque en EHPAD" color="cyan">
              <ul className="mt-2 space-y-1.5 text-xs text-cyan-900">
                <li className="flex gap-2"><span className="font-bold">💉</span><span><strong>1 dose unique de Pneumovax 23</strong> (vaccin polysaccharidique) recommandée chez toute personne ≥ 65 ans</span></li>
                <li className="flex gap-2"><span className="font-bold">🔁</span><span>Revaccination à <strong>5 ans</strong> uniquement si : splénectomie, asplénisme fonctionnel, immunodépression sévère, néphrose</span></li>
                <li className="flex gap-2"><span className="font-bold">📋</span><span>En EHPAD : <strong>1 seule injection</strong> suffit pour la grande majorité des résidents (sauf cas particuliers)</span></li>
                <li className="flex gap-2"><span className="font-bold">⏱️</span><span>Si non vacciné : possible de faire d&apos;abord <strong>Prevenar 13®</strong> (conjugué), puis Pneumovax 23 à 8 semaines minimum</span></li>
                <li className="flex gap-2"><span className="font-bold">💊</span><span>Vaccin disponible : <strong>Pneumovax® 23</strong> (Valneva) — pris en charge à 100% pour les ≥ 65 ans</span></li>
              </ul>
            </RecoPanel>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-cyan-50 text-xs text-cyan-700 uppercase tracking-wide">
                  <th className="px-3 py-2 text-left sticky left-0 bg-cyan-50 z-10">Résident</th>
                  <th className="px-3 py-2 text-center">Date de vaccination</th>
                  <th className="px-3 py-2 text-center">Notes / Observations</th>
                </tr>
              </thead>
              <tbody>
                {activeResidents.map(resident => {
                  const ltRec = getLTRecord(resident);
                  return (
                    <VaccLTRow
                      key={resident.id}
                      resident={resident}
                      record={ltRec}
                      field="pneumovax_date"
                      onSaved={invalidateLT}
                      readOnly={readOnly}
                      onCreateRecord={!ltRec && !readOnly ? () => createMutationLT.mutate({
                        resident_id: resident.id,
                        resident_name: `${resident.last_name} ${resident.first_name || ''}`.trim(),
                        archived: false,
                      }) : undefined}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        )}
        {/* Résidents sortis */}
        <div className="flex justify-end mb-2">
          <button
            onClick={() => setShowArchivedSection(v => !v)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              showArchivedSection
                ? 'bg-amber-700 text-white border-amber-700'
                : 'bg-white text-amber-700 border-amber-300 hover:bg-amber-50'
            }`}
          >
            <Archive className="h-4 w-4" />
            Résidents sortis — historique
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${showArchivedSection ? 'bg-amber-600 text-white' : 'bg-amber-100 text-amber-700'}`}>
              {archivedResidents.length + orphanNames.length}
            </span>
          </button>
        </div>

        {showArchivedSection && (
          <div className="bg-white rounded-xl border border-amber-200 overflow-hidden mb-4">
            <div className="px-4 py-3 border-b border-amber-100 bg-amber-50 flex items-center gap-2">
              <Archive className="h-4 w-4 text-amber-600" />
              <span className="font-semibold text-amber-800 text-sm">Résidents sortis — données historiques</span>
            </div>
            <div className="divide-y divide-slate-100">
              {archivedResidents.length === 0 && orphanNames.length === 0 && (
                <p className="px-4 py-4 text-sm text-slate-400 italic">Aucun résident archivé.</p>
              )}
              {[
                ...archivedResidents.map(r => ({ key: r.id, name: `${r.last_name} ${r.first_name || ''}`.trim(), resident: r as Resident | null, orphan: false })),
                ...orphanNames.map(n => ({ key: `orphan-${n}`, name: n, resident: null, orphan: true })),
              ]
                .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
                .map(({ key, name, resident, orphan }) => {
                  const lastName = resident ? (resident.last_name || '').toLowerCase().trim() : '';
                  const recs = orphan
                    ? orphanByName[name].sort((a, b) => b.year - a.year)
                    : vaccinations.filter(v => {
                        if (v.resident_id === resident?.id) return true;
                        const vName = (v.resident_name || '').toLowerCase().trim();
                        const fullName = name.toLowerCase().trim();
                        return vName === fullName || vName === lastName || vName.startsWith(lastName + ' ');
                      }).sort((a, b) => b.year - a.year);
                  const isOpen = archiveOpenName === key;
                  return (
                    <div key={key}>
                      <button
                        onClick={() => setArchiveOpenName(isOpen ? null : key)}
                        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 text-left"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-700">{name}</span>
                          {resident?.room && <span className="text-xs text-slate-400">Ch. {resident.room}</span>}
                          {resident?.date_sortie && <span className="text-xs text-slate-400">Sorti le {resident.date_sortie}</span>}
                          {orphan && <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">historique</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400">{recs.length} entrée{recs.length > 1 ? 's' : ''}</span>
                          {isOpen ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                        </div>
                      </button>
                      {isOpen && (
                        <div className="border-t border-slate-100 overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-slate-50 text-xs text-slate-400">
                                <th className="px-3 py-1.5 text-left">Année</th>
                                <th className="px-3 py-1.5 text-left">Résident</th>
                                <th className="px-3 py-1.5 text-center">Covid Inj. 1</th>
                                <th className="px-3 py-1.5 text-center">Covid Inj. 2</th>
                                <th className="px-3 py-1.5 text-center">Covid Inj. 3</th>
                                <th className="px-3 py-1.5 text-center">Grippe</th>
                                <th className="px-3 py-1.5 text-left">Infos / Statut</th>
                                <th className="px-3 py-1.5 w-8" />
                              </tr>
                            </thead>
                            <tbody>
                              {recs.length === 0 && (
                                <tr><td colSpan={8} className="px-3 py-3 text-center text-xs text-slate-400 italic">Aucune vaccination enregistrée</td></tr>
                              )}
                              {recs.map(rec => (
                                <VacRow key={rec.id} resident={resident} record={rec} onSaved={invalidate} showYear readOnly={readOnly} />
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        )}
        </div>{/* fin max-w-7xl */}
      </div>{/* fin zIndex: 1 */}
    </div>
  );
}
