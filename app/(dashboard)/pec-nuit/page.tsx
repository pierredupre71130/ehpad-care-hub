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

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, Moon, Plus, Minus, X, ChevronLeft, ChevronRight, Lock, LockOpen, Printer } from 'lucide-react';
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
const PROTECTION_CHOICES = ['', 'XL', 'L', 'M', 'Molif', 'Pants XL', 'Pants L', 'Pants M', 'Perso.', 'Serviette H'];

/** Mot de passe admin requis pour supprimer une colonne. */
const ADMIN_PASSWORD = 'mapad2022';
/** Mot de passe requis pour activer l'édition des champs. */
const EDIT_PASSWORD = 'mapadnuit';

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

/** Normalise un numéro de chambre : supprime espaces, minuscule.
 *  Clé utilisée dans pec_nuit_protections pour éviter les problèmes de format. */
function normalizeRoom(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase();
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

/**
 * Protection par défaut d'un résident : si une seule colonne « protection »
 * (libellé présent dans PROTECTION_CHOICES) est renseignée, renvoie son
 * libellé ; sinon (0 ou plusieurs types) renvoie ''.
 */
function defaultProtection(
  rv: Record<string, number | boolean>, columns: Column[],
): string {
  const active = columns.filter(col => {
    if (!PROTECTION_CHOICES.includes(col.label)) return false;
    const v = rv[col.key];
    return col.type === 'check' ? v === true : typeof v === 'number' && v > 0;
  });
  return active.length === 1 ? active[0].label : '';
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

  const [editMode, setEditMode] = useState(false);
  const [activeFloor, setActiveFloor] = useState<Floor>('RDC');
  const [showAddCol, setShowAddCol] = useState(false);
  const [newColLabel, setNewColLabel] = useState('');
  const [newColType, setNewColType] = useState<ColType>('number');
  const [adminMode, setAdminMode] = useState(false);
  const [printFloor, setPrintFloor] = useState<Floor | null>(null);

  // canEdit = accès module + mode édition déverrouillé par mot de passe
  const canEdit = (access !== 'read') && editMode;

  const toggleEditMode = () => {
    if (editMode) {
      setEditMode(false);
      setAdminMode(false); // verrouiller aussi le mode admin
      return;
    }
    const pwd = prompt('Saisir le mot de passe pour activer l\'édition :');
    if (pwd == null) return;
    if (pwd === EDIT_PASSWORD) setEditMode(true);
    else alert('Mot de passe incorrect.');
  };

  const toggleAdminMode = () => {
    if (adminMode) { setAdminMode(false); return; }
    const pwd = prompt('Accès administrateur — saisir le mot de passe :');
    if (pwd == null) return;
    if (pwd === ADMIN_PASSWORD) setAdminMode(true);
    else alert('Mot de passe incorrect.');
  };

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
    if (!adminMode) {
      const pwd = prompt(
        'Suppression de colonne réservée à l\'administrateur.\n\n' +
        'Saisir le mot de passe admin :',
      );
      if (pwd == null) return; // annulé
      if (pwd !== ADMIN_PASSWORD) {
        alert('Mot de passe incorrect. La colonne n\'a pas été supprimée.');
        return;
      }
    }
    if (!confirm('Supprimer définitivement cette colonne ? Les valeurs saisies seront perdues.')) return;
    mutateColumns(c => c.filter(col => col.key !== key));
  };

  const moveColumn = (key: string, dir: 'left' | 'right') => {
    const current = qc.getQueryData<Column[]>(['pec_nuit_columns']) ?? DEFAULT_COLUMNS;
    const idx = current.findIndex(c => c.key === key);
    if (idx === -1) return;
    const newIdx = dir === 'left' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= current.length) return;
    const next = [...current];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    mutateColumns(() => next);
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
  // Clé = chambre normalisée (ex: '29p', '30sdb') pour correspondre directement
  // aux valeurs row.chambre de la page Prises en Charge sans dépendre du resident ID.
  const updateProtection = async (
    room: string, period: 'jour' | 'nuit', value: string,
  ) => {
    const key = normalizeRoom(room);
    // Préfixe numérique seul (ex: '32f' → '32') : sauvegardé en double pour que
    // prises-en-charge puisse retrouver la protection même si row.chambre ne contient
    // que le numéro (ex: room='32' dans residents, chambre='32 F' dans pec_rows).
    const prefix = key.match(/^(\d+)/)?.[1] ?? '';
    const current = qc.getQueryData<ProtectionsMap>(['pec_nuit_protections']) ?? {};
    const next: ProtectionsMap = {
      ...current,
      [key]: { ...(current[key] ?? {}), [period]: value },
      ...(prefix && prefix !== key
        ? { [prefix]: { ...(current[prefix] ?? {}), [period]: value } }
        : {}),
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
        <div className="relative z-10 px-4 sm:px-6 py-5">
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

      <main className="p-4 sm:p-6 space-y-5">
        {/* Totaux par étage */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {FLOORS.map(f => (
            <TotalsBox
              key={f}
              title={`Total ${f}`}
              subtitle="Mapad + Long séjour"
              columns={columns}
              totals={floorTotals[f]}
              onPrint={() => setPrintFloor(f)}
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

          <div className="flex items-center gap-2">
            {/* Contrôles d'édition — visibles uniquement en mode édition */}
            {canEdit && (
              <>
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
                {/* Bouton mode admin (réorganisation des colonnes) */}
                <button
                  onClick={toggleAdminMode}
                  title={adminMode ? 'Désactiver le mode admin' : 'Activer le mode admin (réorganiser les colonnes)'}
                  className={cn(
                    'h-9 px-3 rounded-xl text-sm font-semibold flex items-center gap-1.5 border transition-colors',
                    adminMode
                      ? 'bg-amber-500 border-amber-600 text-white hover:bg-amber-600'
                      : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300'
                  )}
                >
                  {adminMode ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                  Admin
                </button>
              </>
            )}

            {/* Bouton verrouillage/déverrouillage de l'édition — toujours visible */}
            <button
              onClick={toggleEditMode}
              title={editMode ? 'Verrouiller l\'édition' : 'Activer l\'édition (mot de passe requis)'}
              className={cn(
                'h-9 px-3 rounded-xl text-sm font-semibold flex items-center gap-1.5 border transition-colors',
                editMode
                  ? 'bg-emerald-500 border-emerald-600 text-white hover:bg-emerald-600'
                  : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300'
              )}
            >
              {editMode ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              {editMode ? 'Verrouiller' : 'Modifier'}
            </button>
          </div>
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
                adminMode={adminMode}
                onRemoveColumn={removeColumn}
                onMoveColumn={moveColumn}
                onUpdateCell={(residentId, colKey, v) => updateCell(sec.key, residentId, colKey, v)}
                onUpdateProtection={updateProtection}
              />
            );
          })
        )}
      </main>

      {printFloor && (
        <PrintView
          floor={printFloor}
          residents={residents}
          allValues={safeValues}
          columns={columns}
          protections={protections}
          onClose={() => setPrintFloor(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SECTION TABLE
// ─────────────────────────────────────────────────────────────

function SectionTable({
  title, floor, columns, residents, values, protections, canEdit, adminMode,
  onRemoveColumn, onMoveColumn, onUpdateCell, onUpdateProtection,
}: {
  title: string;
  floor: Floor;
  columns: Column[];
  residents: Resident[];
  values: ValuesMap;
  protections: ProtectionsMap;
  canEdit: boolean;
  adminMode: boolean;
  onRemoveColumn: (key: string) => void;
  onMoveColumn: (key: string, dir: 'left' | 'right') => void;
  onUpdateCell: (residentId: string, colKey: string, value: number | boolean) => void;
  onUpdateProtection: (room: string, period: 'jour' | 'nuit', value: string) => void;
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
              {columns.map((col, colIdx) => (
                <th key={col.key} className={cn(
                  'sticky top-0 z-20 border border-slate-200 px-2 py-2 font-semibold whitespace-nowrap bg-slate-100 shadow-[inset_0_-1px_0_#cbd5e1]',
                  adminMode && 'bg-amber-50'
                )}>
                  {adminMode ? (
                    /* Mode admin : flèches gauche/droite + croix de suppression */
                    <div className="flex items-center justify-center gap-0.5">
                      <button
                        onClick={() => onMoveColumn(col.key, 'left')}
                        disabled={colIdx === 0}
                        title="Déplacer à gauche"
                        className="h-5 w-5 flex items-center justify-center rounded text-amber-600 hover:bg-amber-200 disabled:opacity-20 disabled:cursor-default transition-colors"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </button>
                      <span className="px-1">{col.label}</span>
                      <button
                        onClick={() => onMoveColumn(col.key, 'right')}
                        disabled={colIdx === columns.length - 1}
                        title="Déplacer à droite"
                        className="h-5 w-5 flex items-center justify-center rounded text-amber-600 hover:bg-amber-200 disabled:opacity-20 disabled:cursor-default transition-colors"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => onRemoveColumn(col.key)}
                        title="Supprimer la colonne"
                        className="h-5 w-5 flex items-center justify-center rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    /* Mode normal */
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
                  )}
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
              residents.map((r, rowIdx) => {
                const rv = values[r.id] ?? {};
                const prot = protections[normalizeRoom(r.room ?? '')] ?? {};
                const autoProtection = defaultProtection(rv, columns);
                const stripe = rowIdx % 2 !== 0;
                return (
                  <tr
                    key={r.id}
                    className={cn(
                      'transition-colors',
                      stripe ? 'bg-slate-50/80' : 'bg-white',
                      'hover:bg-indigo-50/50',
                    )}
                  >
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
                    <td className={cn(
                      'border border-slate-200 px-1 py-1',
                      stripe ? 'bg-indigo-100/50' : 'bg-indigo-50/60',
                    )}>
                      <ProtecSelect
                        value={prot.jour ?? autoProtection}
                        disabled={!canEdit}
                        onChange={v => onUpdateProtection(r.room ?? '', 'jour', v)}
                      />
                    </td>
                    <td className={cn(
                      'border border-slate-200 px-1 py-1',
                      stripe ? 'bg-indigo-100/50' : 'bg-indigo-50/60',
                    )}>
                      <ProtecSelect
                        value={prot.nuit ?? autoProtection}
                        disabled={!canEdit}
                        onChange={v => onUpdateProtection(r.room ?? '', 'nuit', v)}
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
  title, subtitle, columns, totals, onPrint,
}: { title: string; subtitle: string; columns: Column[]; totals: Record<string, number>; onPrint?: () => void }) {
  const numberCols = columns.filter(c => c.type === 'number');
  return (
    <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200/70 overflow-hidden">
      <header className="flex items-center justify-between px-4 py-2.5 bg-indigo-900 text-white">
        <h2 className="text-sm font-bold uppercase tracking-wide">{title}</h2>
        <div className="flex items-center gap-2">
          {onPrint && (
            <button
              onClick={onPrint}
              title="Imprimer cet étage (× 14 nuits)"
              className="h-6 w-6 rounded flex items-center justify-center text-white/60 hover:text-white hover:bg-white/20 transition-colors"
            >
              <Printer className="h-3.5 w-3.5" />
            </button>
          )}
          <span className="text-xs text-white/60">{subtitle}</span>
        </div>
      </header>
      <div className="p-3 grid grid-cols-3 sm:grid-cols-5 gap-2">
        {numberCols.map(c => {
          const qteNuit = totals[c.key] ?? 0;
          return (
            <div
              key={c.key}
              className="rounded-lg bg-indigo-50/70 ring-1 ring-indigo-100 px-2 py-1.5 text-center"
            >
              <div className="text-[10px] font-semibold uppercase tracking-wide text-indigo-500 leading-tight truncate">
                {c.label}
              </div>
              <div className="text-xl font-bold text-slate-900 tabular-nums">{qteNuit}</div>
              <div className="text-[11px] font-semibold text-indigo-700 tabular-nums mt-0.5">
                × 14 = {qteNuit * 14}
              </div>
            </div>
          );
        })}
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

// ─────────────────────────────────────────────────────────────
// IMPRESSION
// ─────────────────────────────────────────────────────────────

function PrintSectionTable({
  residents, values, columns, protections,
}: {
  residents: Resident[];
  values: ValuesMap;
  columns: Column[];
  protections: ProtectionsMap;
}) {
  if (residents.length === 0) {
    return <p style={{ color: '#999', fontStyle: 'italic', marginBottom: '12px' }}>Aucun résident.</p>;
  }
  return (
    <table className="pv-table">
      <thead>
        <tr>
          <th style={{ textAlign: 'left', minWidth: '160px' }}>Nom</th>
          <th>Ch.</th>
          {columns.map(c => <th key={c.key}>{c.label}</th>)}
          <th>Protec. Jr</th>
          <th>Protec. Nuit</th>
        </tr>
      </thead>
      <tbody>
        {residents.map(r => {
          const rv = values[r.id] ?? {};
          const prot = protections[normalizeRoom(r.room ?? '')] ?? {};
          const autoP = defaultProtection(rv, columns);
          return (
            <tr key={r.id}>
              <td style={{ textAlign: 'left' }}>
                <strong>{r.last_name.toUpperCase()}</strong>
                {r.first_name ? ` ${r.first_name}` : ''}
              </td>
              <td>{r.room ?? ''}</td>
              {columns.map(c => (
                <td key={c.key}>
                  {c.type === 'check'
                    ? (rv[c.key] === true ? '✓' : '')
                    : (typeof rv[c.key] === 'number' && (rv[c.key] as number) > 0
                        ? String(rv[c.key])
                        : '')}
                </td>
              ))}
              <td>{(prot.jour ?? autoP) || '—'}</td>
              <td>{(prot.nuit ?? autoP) || '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function PrintCommandeTable({
  totals, columns,
}: { totals: Record<string, number>; columns: Column[] }) {
  const numCols = columns.filter(c => c.type === 'number');
  return (
    <table className="pv-table pv-commande" style={{ maxWidth: '480px' }}>
      <thead>
        <tr>
          <th style={{ textAlign: 'left' }}>Article</th>
          <th>Qté / nuit</th>
          <th>× 14</th>
          <th>Total 2 semaines</th>
        </tr>
      </thead>
      <tbody>
        {numCols.map(c => {
          const qteNuit = totals[c.key] ?? 0;
          return (
            <tr key={c.key}>
              <td style={{ textAlign: 'left' }}>{c.label}</td>
              <td>{qteNuit}</td>
              <td style={{ color: '#666' }}>14</td>
              <td>{qteNuit * 14}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function PrintView({
  floor, residents, allValues, columns, protections, onClose,
}: {
  floor: Floor;
  residents: Resident[];
  allValues: AllValues;
  columns: Column[];
  protections: ProtectionsMap;
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 250);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const handler = () => onClose();
    window.addEventListener('afterprint', handler);
    return () => window.removeEventListener('afterprint', handler);
  }, [onClose]);

  const floorRes = residents.filter(r => (r.floor ?? '').toUpperCase() === floor && !r.archived);
  const mapadRes = floorRes.filter(r => sectionOf(r) === 'mapad').sort(sortByRoom);
  const longRes  = floorRes.filter(r => sectionOf(r) === 'long').sort(sortByRoom);
  const totals   = computeFloorTotals(floor, residents, allValues, columns);
  const numCols  = columns.filter(c => c.type === 'number');
  const today    = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div id="pec-print-view">
      {/* eslint-disable-next-line react/no-danger */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body * { visibility: hidden; }
          #pec-print-view, #pec-print-view * { visibility: visible; }
          #pec-print-view { position: absolute; top: 0; left: 0; width: 100%; padding: 0; }
          .pv-no-print { display: none !important; }
          @page { size: A4 landscape; margin: 1.2cm; }
        }
        @media screen {
          #pec-print-view {
            position: fixed; inset: 0; z-index: 9999;
            background: white; overflow-y: auto; padding: 24px;
          }
        }
        .pv-table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-bottom: 1.4em; }
        .pv-table th, .pv-table td { border: 1px solid #c8c8d8; padding: 3px 6px; text-align: center; }
        .pv-table th { background: #1e1b4b; color: white; font-weight: 600; }
        .pv-table tbody tr:nth-child(even) td { background: #f4f4fb; }
        .pv-commande td:last-child { font-weight: 700; font-size: 11pt; color: #1e1b4b; }
        .pv-h2 { font-size: 12pt; font-weight: 700; margin: 1em 0 0.4em; color: #1e1b4b;
                 border-bottom: 2px solid #1e1b4b; padding-bottom: 3px; }
      `}} />

      {/* Barre d'action (écran seulement) */}
      <div className="pv-no-print" style={{
        position: 'sticky', top: 0, background: 'white', zIndex: 10,
        borderBottom: '1px solid #e2e8f0', padding: '12px 0 12px',
        marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <h1 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>
          Aperçu impression — PEC Nuit {floor}
        </h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => window.print()}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '6px 16px', borderRadius: '8px',
              background: '#4338ca', color: 'white', border: 'none',
              fontSize: '14px', fontWeight: 600, cursor: 'pointer',
            }}
          >
            <Printer style={{ width: '16px', height: '16px' }} /> Imprimer
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '6px 16px', borderRadius: '8px',
              background: 'white', color: '#475569',
              border: '1px solid #e2e8f0', fontSize: '14px', cursor: 'pointer',
            }}
          >
            Fermer
          </button>
        </div>
      </div>

      {/* Contenu imprimé */}
      <div style={{ fontFamily: 'Arial, sans-serif' }}>
        {/* En-tête */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '16px' }}>
          <div>
            <h1 style={{ fontSize: '20pt', fontWeight: 700, margin: 0, color: '#1e1b4b' }}>
              PEC Nuit — {floor}
            </h1>
            <p style={{ fontSize: '10pt', color: '#666', margin: '4px 0 0' }}>Édité le {today}</p>
          </div>
          <div style={{ fontSize: '10pt', color: '#888', textAlign: 'right' }}>
            EHPAD — Prises en charge de nuit
          </div>
        </div>

        {/* MAPAD */}
        <div className="pv-h2">
          MAPAD · {floor} &nbsp;<span style={{ fontWeight: 400, fontSize: '10pt' }}>({mapadRes.length} résident{mapadRes.length > 1 ? 's' : ''})</span>
        </div>
        <PrintSectionTable
          residents={mapadRes}
          values={allValues[floor].mapad}
          columns={columns}
          protections={protections}
        />

        {/* Long séjour */}
        <div className="pv-h2">
          Long séjour · {floor} &nbsp;<span style={{ fontWeight: 400, fontSize: '10pt' }}>({longRes.length} résident{longRes.length > 1 ? 's' : ''})</span>
        </div>
        <PrintSectionTable
          residents={longRes}
          values={allValues[floor].long}
          columns={columns}
          protections={protections}
        />

        {/* Total par nuit */}
        <div className="pv-h2">Total {floor} — par nuit</div>
        <table className="pv-table" style={{ maxWidth: '700px' }}>
          <thead>
            <tr>{numCols.map(c => <th key={c.key}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            <tr>
              {numCols.map(c => (
                <td key={c.key} style={{ fontWeight: 700, fontSize: '13pt' }}>
                  {totals[c.key] ?? 0}
                </td>
              ))}
            </tr>
          </tbody>
        </table>

        {/* Commande × 14 */}
        <div className="pv-h2">Tableau des comptes — × 14 nuits (2 semaines)</div>
        <PrintCommandeTable totals={totals} columns={columns} />
      </div>
    </div>
  );
}
