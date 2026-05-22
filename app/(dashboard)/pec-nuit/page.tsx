'use client';

/**
 * PEC Nuit — Prises en charge de nuit.
 * Un tableau de comptage des protections par étage (RDC / 1ER), chaque étage
 * divisé en deux sections : MAPAD et Long séjour.
 * Les lignes sont les résidents (table residents, filtrés par étage + section).
 * Colonnes numériques (boutons +/-) sauf « Perso. » qui est une case à cocher.
 * Les colonnes sont personnalisables (ajout / suppression).
 * Stockage des valeurs : table `settings` (clés pec_nuit_*).
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, Moon, Plus, Minus, X } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useModuleAccess } from '@/lib/use-module-access';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

type Floor = 'RDC' | '1ER';
type Section = 'mapad' | 'long';
type ColType = 'number' | 'check';

interface Column { key: string; label: string; type: ColType; }
interface Resident {
  id: string;
  room?: string;
  floor?: string;
  section?: string;
  title?: string;
  first_name?: string;
  last_name: string;
  archived?: boolean;
}
/** residentId → colKey → valeur */
type ValuesMap = Record<string, Record<string, number | boolean>>;
/** residentId → { jour, nuit } — alimente la colonne Protection de Prises en Charge */
type ProtectionsMap = Record<string, { jour?: string; nuit?: string }>;

/** Choix de protection (jour / nuit) — partagés avec Prises en Charge */
const PROTECTION_CHOICES = ['', 'XL', 'L', 'M', 'Molif', 'Pants XL', 'Pants L', 'Pants M', 'Perso.'];

const FLOORS: Floor[] = ['RDC', '1ER'];
const SECTIONS: { key: Section; label: string }[] = [
  { key: 'mapad', label: 'MAPAD' },
  { key: 'long', label: 'Long séjour' },
];

const DEFAULT_COLUMNS: Column[] = [
  { key: 'xl',       label: 'XL',             type: 'number' },
  { key: 'l',        label: 'L',              type: 'number' },
  { key: 'm',        label: 'M',              type: 'number' },
  { key: 'molif',    label: 'Molif',          type: 'number' },
  { key: 'pants_xl', label: 'Pants XL',       type: 'number' },
  { key: 'pants_l',  label: 'Pants L',        type: 'number' },
  { key: 'pants_m',  label: 'Pants M',        type: 'number' },
  { key: 'perso',    label: 'Perso.',         type: 'check'  },
  { key: 'abso',     label: 'Abso',           type: 'number' },
  { key: 'chemise',  label: 'Chemise fendue', type: 'number' },
];

function valuesKey(floor: Floor, section: Section): string {
  return `pec_nuit_values_${floor}_${section}`;
}

function sectionOf(r: Resident): Section {
  return (r.section ?? '').toLowerCase().includes('long') ? 'long' : 'mapad';
}

function sortByRoom(a: Resident, b: Resident): number {
  const na = parseInt(a.room ?? '0', 10);
  const nb = parseInt(b.room ?? '0', 10);
  if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
  return (a.room ?? '').localeCompare(b.room ?? '', 'fr', { numeric: true });
}

// ─────────────────────────────────────────────────────────────
// SUPABASE
// ─────────────────────────────────────────────────────────────

async function fetchSetting<T>(key: string, fallback: T): Promise<T> {
  const sb = createClient();
  const { data } = await sb.from('settings').select('value').eq('key', key).maybeSingle();
  return data && data.value != null ? (data.value as T) : fallback;
}

async function saveSetting(key: string, value: unknown): Promise<void> {
  const sb = createClient();
  const { error } = await sb
    .from('settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
}

async function fetchColumns(): Promise<Column[]> {
  const cols = await fetchSetting<Column[]>('pec_nuit_columns', DEFAULT_COLUMNS);
  return Array.isArray(cols) && cols.length ? cols : DEFAULT_COLUMNS;
}

async function fetchResidents(): Promise<Resident[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from('residents')
    .select('id,room,floor,section,title,first_name,last_name,archived')
    .eq('archived', false)
    .order('last_name');
  if (error) throw new Error(error.message);
  return (data ?? []) as Resident[];
}

type AllValues = Record<Floor, Record<Section, ValuesMap>>;

function emptyAllValues(): AllValues {
  return { RDC: { mapad: {}, long: {} }, '1ER': { mapad: {}, long: {} } };
}

async function fetchAllValues(): Promise<AllValues> {
  const slots: { floor: Floor; section: Section }[] = [];
  for (const floor of FLOORS) {
    for (const section of ['mapad', 'long'] as Section[]) {
      slots.push({ floor, section });
    }
  }
  const results = await Promise.all(
    slots.map(s => fetchSetting<ValuesMap>(valuesKey(s.floor, s.section), {})),
  );
  const out = emptyAllValues();
  slots.forEach((s, i) => {
    const v = results[i];
    out[s.floor][s.section] = v && typeof v === 'object' ? v : {};
  });
  return out;
}

function newColKey(): string {
  const rnd = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `col_${rnd}`;
}

/** Somme, par colonne numérique, sur tous les résidents d'un étage (Mapad + Long). */
function computeFloorTotals(
  floor: Floor, residents: Resident[], allValues: AllValues, columns: Column[],
): Record<string, number> {
  const totals: Record<string, number> = {};
  columns.filter(c => c.type === 'number').forEach(c => { totals[c.key] = 0; });
  residents
    .filter(r => (r.floor ?? '').toUpperCase() === floor && !r.archived)
    .forEach(r => {
      const rv = allValues[floor][sectionOf(r)][r.id] ?? {};
      for (const key of Object.keys(totals)) {
        const v = rv[key];
        if (typeof v === 'number') totals[key] += v;
      }
    });
  return totals;
}

// ─────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────

export default function PecNuitPage() {
  const qc = useQueryClient();
  const access = useModuleAccess('pecNuit');
  const canEdit = access !== 'read';

  const [activeFloor, setActiveFloor] = useState<Floor>('RDC');
  const [showAddCol, setShowAddCol] = useState(false);
  const [newColLabel, setNewColLabel] = useState('');
  const [newColType, setNewColType] = useState<ColType>('number');

  const { data: columns = DEFAULT_COLUMNS } = useQuery({
    queryKey: ['pec_nuit_columns'],
    queryFn: fetchColumns,
  });

  const { data: residents = [], isLoading: loadingResidents } = useQuery({
    queryKey: ['pec_nuit_residents'],
    queryFn: fetchResidents,
  });

  const { data: values, isLoading: loadingValues } = useQuery({
    queryKey: ['pec_nuit_values'],
    queryFn: fetchAllValues,
  });

  const { data: protections = {} } = useQuery({
    queryKey: ['pec_nuit_protections'],
    queryFn: () => fetchSetting<ProtectionsMap>('pec_nuit_protections', {}),
  });

  // ── Mutations colonnes ────────────────────────────────────
  const mutateColumns = async (updater: (c: Column[]) => Column[]) => {
    const current = qc.getQueryData<Column[]>(['pec_nuit_columns']) ?? DEFAULT_COLUMNS;
    const next = updater(current);
    qc.setQueryData(['pec_nuit_columns'], next);
    try {
      await saveSetting('pec_nuit_columns', next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur de sauvegarde');
      qc.invalidateQueries({ queryKey: ['pec_nuit_columns'] });
    }
  };

  const addColumn = () => {
    const label = newColLabel.trim();
    if (!label) { toast.error('Saisir un nom de colonne'); return; }
    const col: Column = { key: newColKey(), label, type: newColType };
    mutateColumns(c => [...c, col]);
    setNewColLabel('');
    setNewColType('number');
    setShowAddCol(false);
  };

  const removeColumn = (key: string) => {
    if (!confirm('Supprimer cette colonne ? Les valeurs saisies seront perdues.')) return;
    mutateColumns(c => c.filter(col => col.key !== key));
  };

  // ── Mutation valeurs ──────────────────────────────────────
  const updateCell = async (
    section: Section, residentId: string, colKey: string, value: number | boolean,
  ) => {
    const current = qc.getQueryData<AllValues>(['pec_nuit_values']) ?? emptyAllValues();
    const sectionMap = current[activeFloor][section] ?? {};
    const nextSection: ValuesMap = {
      ...sectionMap,
      [residentId]: { ...(sectionMap[residentId] ?? {}), [colKey]: value },
    };
    const next: AllValues = {
      ...current,
      [activeFloor]: { ...current[activeFloor], [section]: nextSection },
    };
    qc.setQueryData(['pec_nuit_values'], next);
    try {
      await saveSetting(valuesKey(activeFloor, section), nextSection);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur de sauvegarde');
      qc.invalidateQueries({ queryKey: ['pec_nuit_values'] });
    }
  };

  // ── Mutation protections (jour / nuit) ────────────────────
  const updateProtection = async (
    residentId: string, period: 'jour' | 'nuit', value: string,
  ) => {
    const current = qc.getQueryData<ProtectionsMap>(['pec_nuit_protections']) ?? {};
    const next: ProtectionsMap = {
      ...current,
      [residentId]: { ...(current[residentId] ?? {}), [period]: value },
    };
    qc.setQueryData(['pec_nuit_protections'], next);
    try {
      await saveSetting('pec_nuit_protections', next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur de sauvegarde');
      qc.invalidateQueries({ queryKey: ['pec_nuit_protections'] });
    }
  };

  const isLoading = loadingResidents || loadingValues;
  const floorResidents = residents.filter(
    r => (r.floor ?? '').toUpperCase() === activeFloor && !r.archived,
  );

  const safeValues = values ?? emptyAllValues();
  const floorTotals: Record<Floor, Record<string, number>> = {
    RDC: computeFloorTotals('RDC', residents, safeValues, columns),
    '1ER': computeFloorTotals('1ER', residents, safeValues, columns),
  };
  const combinedTotals: Record<string, number> = {};
  columns
    .filter(c => c.type === 'number')
    .forEach(c => {
      combinedTotals[c.key] = (floorTotals.RDC[c.key] ?? 0) + (floorTotals['1ER'][c.key] ?? 0);
    });

  return (
    <div className="min-h-screen pb-16" style={{ background: '#dde4ee' }}>
      {/* HEADER */}
      <header
        className="relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1e1b4b 0%, #3730a3 100%)' }}
      >
        <div className="relative z-10 max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center gap-1.5 text-white/50 text-xs mb-4">
            <Link href="/" className="hover:text-white/80 transition-colors">Accueil</Link>
            <span>›</span>
            <span className="text-white/75">PEC Nuit</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="h-11 w-11 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="h-12 w-12 rounded-2xl bg-white/15 flex items-center justify-center">
              <Moon className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-white tracking-tight leading-none">
                PEC Nuit
              </h1>
              <p className="text-sm text-white/60 mt-1">
                Prises en charge de nuit — comptage des protections
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 sm:p-6 space-y-5">
        {/* Totaux par étage */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {FLOORS.map(f => (
            <TotalsBox
              key={f}
              title={`Total ${f}`}
              subtitle="Mapad + Long séjour"
              columns={columns}
              totals={floorTotals[f]}
            />
          ))}
        </div>

        {/* Total des deux étages */}
        <TotalsBox
          title="Total général"
          subtitle="RDC + 1ER"
          columns={columns}
          totals={combinedTotals}
        />

        {/* Barre : étages + ajout colonne */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 bg-white rounded-xl p-1 ring-1 ring-slate-200 shadow-sm">
            {FLOORS.map(f => (
              <button
                key={f}
                onClick={() => setActiveFloor(f)}
                className={cn(
                  'px-5 py-1.5 rounded-lg text-sm font-semibold transition-colors',
                  activeFloor === f
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-500 hover:text-slate-800'
                )}
              >
                {f}
              </button>
            ))}
          </div>

          {canEdit && (
            <div className="flex items-center gap-2">
              {showAddCol ? (
                <div className="flex items-center gap-2 bg-white rounded-xl p-2 ring-1 ring-slate-200 shadow-sm">
                  <Input
                    value={newColLabel}
                    onChange={e => setNewColLabel(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addColumn(); }}
                    placeholder="Nom de la colonne"
                    autoFocus
                    className="h-8 w-44 text-sm"
                  />
                  <select
                    value={newColType}
                    onChange={e => setNewColType(e.target.value as ColType)}
                    className="h-8 rounded-md border border-slate-200 text-sm px-2 bg-white"
                  >
                    <option value="number">Nombre</option>
                    <option value="check">Case à cocher</option>
                  </select>
                  <Button size="sm" onClick={addColumn} className="h-8 bg-indigo-600 hover:bg-indigo-700">
                    Ajouter
                  </Button>
                  <button
                    onClick={() => { setShowAddCol(false); setNewColLabel(''); }}
                    className="h-8 w-8 flex items-center justify-center text-slate-400 hover:text-slate-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowAddCol(true)}
                  className="h-9 gap-1.5 bg-white"
                >
                  <Plus className="h-4 w-4" /> Ajouter une colonne
                </Button>
              )}
            </div>
          )}
        </div>

        {isLoading ? (
          <p className="text-sm text-slate-500 py-10 text-center">Chargement…</p>
        ) : (
          SECTIONS.map(sec => {
            const secResidents = floorResidents
              .filter(r => sectionOf(r) === sec.key)
              .sort(sortByRoom);
            return (
              <SectionTable
                key={sec.key}
                title={sec.label}
                floor={activeFloor}
                columns={columns}
                residents={secResidents}
                values={values?.[activeFloor]?.[sec.key] ?? {}}
                protections={protections}
                canEdit={canEdit}
                onRemoveColumn={removeColumn}
                onUpdateCell={(residentId, colKey, v) => updateCell(sec.key, residentId, colKey, v)}
                onUpdateProtection={updateProtection}
              />
            );
          })
        )}
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SECTION TABLE
// ─────────────────────────────────────────────────────────────

function SectionTable({
  title, floor, columns, residents, values, protections, canEdit,
  onRemoveColumn, onUpdateCell, onUpdateProtection,
}: {
  title: string;
  floor: Floor;
  columns: Column[];
  residents: Resident[];
  values: ValuesMap;
  protections: ProtectionsMap;
  canEdit: boolean;
  onRemoveColumn: (key: string) => void;
  onUpdateCell: (residentId: string, colKey: string, value: number | boolean) => void;
  onUpdateProtection: (residentId: string, period: 'jour' | 'nuit', value: string) => void;
}) {
  return (
    <section className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200/70 overflow-hidden">
      <header className="flex items-center justify-between px-4 py-2.5 bg-indigo-900 text-white">
        <h2 className="text-sm font-bold uppercase tracking-wide">
          {title} <span className="text-white/50 font-normal">· {floor}</span>
        </h2>
        <span className="text-xs text-white/60">
          {residents.length} résident{residents.length > 1 ? 's' : ''}
        </span>
      </header>

      <div className="overflow-auto max-h-[72vh]">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-slate-600">
              <th className="sticky top-0 z-20 border border-slate-200 px-2 py-2 text-left font-semibold min-w-[180px] bg-slate-100 shadow-[inset_0_-1px_0_#cbd5e1]">Nom</th>
              <th className="sticky top-0 z-20 border border-slate-200 px-2 py-2 text-center font-semibold min-w-[70px] bg-slate-100 shadow-[inset_0_-1px_0_#cbd5e1]">Chambre</th>
              {columns.map(col => (
                <th key={col.key} className="sticky top-0 z-20 border border-slate-200 px-2 py-2 font-semibold whitespace-nowrap bg-slate-100 shadow-[inset_0_-1px_0_#cbd5e1]">
                  <div className="flex items-center justify-center gap-1">
                    <span>{col.label}</span>
                    {canEdit && (
                      <button
                        onClick={() => onRemoveColumn(col.key)}
                        title="Supprimer la colonne"
                        className="text-slate-300 hover:text-red-500 transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </th>
              ))}
              <th className="sticky top-0 z-20 border border-slate-200 px-2 py-2 font-semibold whitespace-nowrap bg-indigo-50 text-indigo-800 min-w-[110px] shadow-[inset_0_-1px_0_#cbd5e1]">
                Protec. Jr
              </th>
              <th className="sticky top-0 z-20 border border-slate-200 px-2 py-2 font-semibold whitespace-nowrap bg-indigo-50 text-indigo-800 min-w-[110px] shadow-[inset_0_-1px_0_#cbd5e1]">
                Protec. Nuit
              </th>
            </tr>
          </thead>
          <tbody>
            {residents.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + 4}
                  className="border border-slate-200 px-3 py-6 text-center text-slate-400 italic"
                >
                  Aucun résident dans cette section.
                </td>
              </tr>
            ) : (
              residents.map(r => {
                const rv = values[r.id] ?? {};
                const prot = protections[r.id] ?? {};
                return (
                  <tr key={r.id} className="hover:bg-indigo-50/40">
                    <td className="border border-slate-200 px-2 py-1.5">
                      <span className="font-medium text-slate-800">
                        <span className="uppercase">{r.last_name}</span>
                        {r.first_name ? ` ${r.first_name}` : ''}
                      </span>
                    </td>
                    <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-600">
                      {r.room ?? ''}
                    </td>
                    {columns.map(col => (
                      <td key={col.key} className="border border-slate-200 px-1 py-1 text-center">
                        {col.type === 'check' ? (
                          <CheckCell
                            checked={rv[col.key] === true}
                            disabled={!canEdit}
                            onChange={v => onUpdateCell(r.id, col.key, v)}
                          />
                        ) : (
                          <NumberCell
                            value={typeof rv[col.key] === 'number' ? (rv[col.key] as number) : 0}
                            disabled={!canEdit}
                            onChange={v => onUpdateCell(r.id, col.key, v)}
                          />
                        )}
                      </td>
                    ))}
                    <td className="border border-slate-200 px-1 py-1 bg-indigo-50/40">
                      <ProtecSelect
                        value={prot.jour ?? ''}
                        disabled={!canEdit}
                        onChange={v => onUpdateProtection(r.id, 'jour', v)}
                      />
                    </td>
                    <td className="border border-slate-200 px-1 py-1 bg-indigo-50/40">
                      <ProtecSelect
                        value={prot.nuit ?? ''}
                        disabled={!canEdit}
                        onChange={v => onUpdateProtection(r.id, 'nuit', v)}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// CELLULES
// ─────────────────────────────────────────────────────────────

function NumberCell({
  value, disabled, onChange,
}: { value: number; disabled: boolean; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-center gap-0.5">
      <button
        onClick={() => onChange(Math.max(0, value - 1))}
        disabled={disabled || value <= 0}
        className="h-6 w-6 rounded-md flex items-center justify-center text-slate-500 hover:bg-rose-100 hover:text-rose-600 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className={cn(
        'w-7 text-center tabular-nums font-semibold',
        value > 0 ? 'text-slate-900' : 'text-slate-300'
      )}>
        {value}
      </span>
      <button
        onClick={() => onChange(value + 1)}
        disabled={disabled}
        className="h-6 w-6 rounded-md flex items-center justify-center text-slate-500 hover:bg-emerald-100 hover:text-emerald-600 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function TotalsBox({
  title, subtitle, columns, totals,
}: { title: string; subtitle: string; columns: Column[]; totals: Record<string, number> }) {
  const numberCols = columns.filter(c => c.type === 'number');
  return (
    <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200/70 overflow-hidden">
      <header className="flex items-center justify-between px-4 py-2.5 bg-indigo-900 text-white">
        <h2 className="text-sm font-bold uppercase tracking-wide">{title}</h2>
        <span className="text-xs text-white/60">{subtitle}</span>
      </header>
      <div className="p-3 grid grid-cols-3 sm:grid-cols-5 gap-2">
        {numberCols.map(c => (
          <div
            key={c.key}
            className="rounded-lg bg-indigo-50/70 ring-1 ring-indigo-100 px-2 py-1.5 text-center"
          >
            <div className="text-[10px] font-semibold uppercase tracking-wide text-indigo-500 leading-tight truncate">
              {c.label}
            </div>
            <div className="text-xl font-bold text-slate-900 tabular-nums">{totals[c.key] ?? 0}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProtecSelect({
  value, disabled, onChange,
}: { value: string; disabled: boolean; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={e => onChange(e.target.value)}
      className="w-full text-[12px] border border-slate-200 rounded px-1 py-1 bg-white focus:outline-none focus:border-indigo-400 disabled:bg-slate-50 disabled:cursor-not-allowed"
    >
      {PROTECTION_CHOICES.map(opt => (
        <option key={opt} value={opt}>{opt === '' ? '—' : opt}</option>
      ))}
    </select>
  );
}

function CheckCell({
  checked, disabled, onChange,
}: { checked: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={cn(
        'h-6 w-6 rounded-md border-2 flex items-center justify-center mx-auto transition-colors disabled:cursor-default',
        checked
          ? 'bg-indigo-600 border-indigo-600 text-white'
          : 'border-slate-300 bg-white hover:border-indigo-400'
      )}
    >
      {checked && (
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
    </button>
  );
}
