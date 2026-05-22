'use client';

/**
 * PEC Nuit — Prises en charge de nuit.
 * Un tableau de comptage des protections par étage (RDC / 1ER), chaque étage
 * divisé en deux sections : MAPAD et Long séjour.
 * Colonnes numériques (boutons +/-) sauf « Perso. » qui est une case à cocher.
 * Les colonnes sont personnalisables (ajout / suppression).
 * Stockage : table `settings` (clés pec_nuit_*).
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, Moon, Plus, Minus, Trash2, X } from 'lucide-react';
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
interface NuitRow {
  id: string;
  nom: string;
  chambre: string;
  values: Record<string, number | boolean>;
}

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

function rowsKey(floor: Floor, section: Section): string {
  return `pec_nuit_rows_${floor}_${section}`;
}

// ─────────────────────────────────────────────────────────────
// SUPABASE (settings)
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

async function fetchFloorTables(floor: Floor): Promise<Record<Section, NuitRow[]>> {
  const [mapad, long] = await Promise.all([
    fetchSetting<NuitRow[]>(rowsKey(floor, 'mapad'), []),
    fetchSetting<NuitRow[]>(rowsKey(floor, 'long'), []),
  ]);
  return {
    mapad: Array.isArray(mapad) ? mapad : [],
    long: Array.isArray(long) ? long : [],
  };
}

function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `id_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
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

  const { data: tables, isLoading } = useQuery({
    queryKey: ['pec_nuit_rows', activeFloor],
    queryFn: () => fetchFloorTables(activeFloor),
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
    const col: Column = { key: `col_${newId().slice(0, 8)}`, label, type: newColType };
    mutateColumns(c => [...c, col]);
    setNewColLabel('');
    setNewColType('number');
    setShowAddCol(false);
  };

  const removeColumn = (key: string) => {
    if (!confirm('Supprimer cette colonne ? Les valeurs saisies seront perdues.')) return;
    mutateColumns(c => c.filter(col => col.key !== key));
  };

  // ── Mutations lignes ──────────────────────────────────────
  const mutateTable = async (section: Section, updater: (rows: NuitRow[]) => NuitRow[]) => {
    const current = qc.getQueryData<Record<Section, NuitRow[]>>(['pec_nuit_rows', activeFloor])
      ?? { mapad: [], long: [] };
    const next = updater(current[section] ?? []);
    qc.setQueryData(['pec_nuit_rows', activeFloor], { ...current, [section]: next });
    try {
      await saveSetting(rowsKey(activeFloor, section), next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur de sauvegarde');
      qc.invalidateQueries({ queryKey: ['pec_nuit_rows', activeFloor] });
    }
  };

  const addRow = (section: Section) => {
    mutateTable(section, rows => [...rows, { id: newId(), nom: '', chambre: '', values: {} }]);
  };

  const removeRow = (section: Section, id: string) => {
    mutateTable(section, rows => rows.filter(r => r.id !== id));
  };

  const updateRowField = (section: Section, id: string, field: 'nom' | 'chambre', value: string) => {
    mutateTable(section, rows => rows.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const updateCellValue = (section: Section, id: string, colKey: string, value: number | boolean) => {
    mutateTable(section, rows => rows.map(r =>
      r.id === id ? { ...r, values: { ...r.values, [colKey]: value } } : r
    ));
  };

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
          SECTIONS.map(sec => (
            <SectionTable
              key={sec.key}
              title={sec.label}
              floor={activeFloor}
              columns={columns}
              rows={tables?.[sec.key] ?? []}
              canEdit={canEdit}
              onAddRow={() => addRow(sec.key)}
              onRemoveRow={id => removeRow(sec.key, id)}
              onRemoveColumn={removeColumn}
              onUpdateField={(id, field, v) => updateRowField(sec.key, id, field, v)}
              onUpdateCell={(id, colKey, v) => updateCellValue(sec.key, id, colKey, v)}
            />
          ))
        )}
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SECTION TABLE
// ─────────────────────────────────────────────────────────────

function SectionTable({
  title, floor, columns, rows, canEdit,
  onAddRow, onRemoveRow, onRemoveColumn, onUpdateField, onUpdateCell,
}: {
  title: string;
  floor: Floor;
  columns: Column[];
  rows: NuitRow[];
  canEdit: boolean;
  onAddRow: () => void;
  onRemoveRow: (id: string) => void;
  onRemoveColumn: (key: string) => void;
  onUpdateField: (id: string, field: 'nom' | 'chambre', value: string) => void;
  onUpdateCell: (id: string, colKey: string, value: number | boolean) => void;
}) {
  return (
    <section className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200/70 overflow-hidden">
      <header className="flex items-center justify-between px-4 py-2.5 bg-indigo-900 text-white">
        <h2 className="text-sm font-bold uppercase tracking-wide">
          {title} <span className="text-white/50 font-normal">· {floor}</span>
        </h2>
        <span className="text-xs text-white/60">{rows.length} résident{rows.length > 1 ? 's' : ''}</span>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-100 text-slate-600">
              <th className="border border-slate-200 px-2 py-2 text-left font-semibold min-w-[140px]">Nom</th>
              <th className="border border-slate-200 px-2 py-2 text-left font-semibold min-w-[80px]">Chambre</th>
              {columns.map(col => (
                <th key={col.key} className="border border-slate-200 px-2 py-2 font-semibold whitespace-nowrap">
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
              {canEdit && <th className="border border-slate-200 px-2 py-2 w-10" />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (canEdit ? 3 : 2)}
                  className="border border-slate-200 px-3 py-6 text-center text-slate-400 italic"
                >
                  Aucune ligne — utilisez « Ajouter une ligne » ci-dessous.
                </td>
              </tr>
            ) : (
              rows.map(row => (
                <tr key={row.id} className="hover:bg-indigo-50/40">
                  <td className="border border-slate-200 px-1 py-1">
                    <input
                      value={row.nom}
                      onChange={e => onUpdateField(row.id, 'nom', e.target.value)}
                      disabled={!canEdit}
                      placeholder="Nom"
                      className="w-full px-1.5 py-1 bg-transparent text-sm focus:bg-white focus:ring-1 focus:ring-indigo-300 rounded outline-none disabled:cursor-default"
                    />
                  </td>
                  <td className="border border-slate-200 px-1 py-1">
                    <input
                      value={row.chambre}
                      onChange={e => onUpdateField(row.id, 'chambre', e.target.value)}
                      disabled={!canEdit}
                      placeholder="Ch."
                      className="w-full px-1.5 py-1 bg-transparent text-sm text-center focus:bg-white focus:ring-1 focus:ring-indigo-300 rounded outline-none disabled:cursor-default"
                    />
                  </td>
                  {columns.map(col => (
                    <td key={col.key} className="border border-slate-200 px-1 py-1 text-center">
                      {col.type === 'check' ? (
                        <CheckCell
                          checked={row.values[col.key] === true}
                          disabled={!canEdit}
                          onChange={v => onUpdateCell(row.id, col.key, v)}
                        />
                      ) : (
                        <NumberCell
                          value={typeof row.values[col.key] === 'number' ? (row.values[col.key] as number) : 0}
                          disabled={!canEdit}
                          onChange={v => onUpdateCell(row.id, col.key, v)}
                        />
                      )}
                    </td>
                  ))}
                  {canEdit && (
                    <td className="border border-slate-200 px-1 py-1 text-center">
                      <button
                        onClick={() => onRemoveRow(row.id)}
                        title="Supprimer la ligne"
                        className="text-slate-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div className="px-3 py-2 border-t border-slate-100">
          <button
            onClick={onAddRow}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
          >
            <Plus className="h-4 w-4" /> Ajouter une ligne
          </button>
        </div>
      )}
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
