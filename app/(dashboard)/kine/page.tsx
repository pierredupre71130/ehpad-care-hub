'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Loader2, X, Pencil, Trash2, Plus, Settings, Eye, Activity,
} from 'lucide-react';
import { useModuleAccess } from '@/lib/use-module-access';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import Link from 'next/link';

// ─────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────

const JOURS_SEMAINE = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

const TYPES_KINE_OPTIONS = [
  'Respiratoire',
  'Rééducation motrice',
  'Rééducation orthopédique',
  'Rééducation neurologique',
  'Drainage lymphatique',
  'Massage thérapeutique',
  'Autre',
];

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

interface Kinesitherapeute {
  id: string;
  nom: string;
  jours: string[];
  telephone?: string;
}

interface KineAssignation {
  id: string;
  resident_id: string;
  kine_id: string;
  kine_nom: string;
  types_kine: string[];
  notes: string;
  actif: boolean;
  created_at: string;
  updated_at: string;
}

interface Resident {
  id: string;
  room: string;
  floor: string;
  title: string;
  first_name: string;
  last_name: string;
}

// ─────────────────────────────────────────────────────────────
// HEADER – NETWORK BACKGROUND
// ─────────────────────────────────────────────────────────────

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

function NetworkBackground() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 1500 600"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
    >
      {EDGES.map(([i, j], idx) => (
        <line
          key={idx}
          x1={NODES[i][0]} y1={NODES[i][1]}
          x2={NODES[j][0]} y2={NODES[j][1]}
          stroke="#5eead4" strokeWidth="0.7" strokeOpacity="0.25"
        />
      ))}
      {NODES.map(([x, y], idx) => (
        <circle key={idx} cx={x} cy={y} r="3" fill="#5eead4" fillOpacity="0.35" />
      ))}
    </svg>
  );
}

function KineIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="18" cy="18" r="17" fill="white" fillOpacity="0.15" />
      {/* Simplified physio/activity icon */}
      <path d="M10 24 L14 16 L18 20 L22 12 L26 18" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="10" cy="24" r="1.5" fill="white" />
      <circle cx="26" cy="18" r="1.5" fill="white" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// SUPABASE FUNCTIONS
// ─────────────────────────────────────────────────────────────

async function fetchKineConfig(): Promise<Kinesitherapeute[]> {
  const sb = createClient();
  const { data } = await sb
    .from('settings')
    .select('value')
    .eq('key', 'kine_config')
    .maybeSingle();
  if (data?.value && Array.isArray(data.value)) return data.value as Kinesitherapeute[];
  return [];
}

async function saveKineConfig(list: Kinesitherapeute[]): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from('settings').upsert(
    { key: 'kine_config', value: list, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  );
  if (error) throw new Error(error.message);
}

async function fetchAssignations(): Promise<KineAssignation[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from('kine_assignations')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as KineAssignation[];
}

async function fetchResidents(): Promise<Resident[]> {
  const sb = createClient();
  // archived peut valoir false, null ou être absent — on exclut uniquement true
  const { data, error } = await sb
    .from('residents')
    .select('id, room, floor, title, first_name, last_name')
    .or('archived.eq.false,archived.is.null')
    .order('last_name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Resident[];
}

async function upsertAssignation(data: Partial<KineAssignation> & { resident_id: string; kine_id: string; kine_nom: string }): Promise<void> {
  const sb = createClient();
  if (data.id) {
    const { error } = await sb.from('kine_assignations').update({
      kine_id: data.kine_id,
      kine_nom: data.kine_nom,
      types_kine: data.types_kine ?? [],
      notes: data.notes ?? '',
      actif: data.actif ?? true,
      updated_at: new Date().toISOString(),
    }).eq('id', data.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await sb.from('kine_assignations').insert({
      resident_id: data.resident_id,
      kine_id: data.kine_id,
      kine_nom: data.kine_nom,
      types_kine: data.types_kine ?? [],
      notes: data.notes ?? '',
      actif: data.actif ?? true,
    });
    if (error) throw new Error(error.message);
  }
}

async function deleteAssignation(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from('kine_assignations').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ─────────────────────────────────────────────────────────────
// BADGE COULEUR POUR LES TYPES DE KINÉ
// ─────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  'Respiratoire':              'bg-sky-100 text-sky-700 border-sky-200',
  'Rééducation motrice':       'bg-teal-100 text-teal-700 border-teal-200',
  'Rééducation orthopédique':  'bg-indigo-100 text-indigo-700 border-indigo-200',
  'Rééducation neurologique':  'bg-purple-100 text-purple-700 border-purple-200',
  'Drainage lymphatique':      'bg-blue-100 text-blue-700 border-blue-200',
  'Massage thérapeutique':     'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Autre':                     'bg-slate-100 text-slate-600 border-slate-200',
};

function TypeBadge({ type }: { type: string }) {
  return (
    <span className={cn(
      'inline-block px-2 py-0.5 rounded-full text-[11px] font-medium border',
      TYPE_COLORS[type] ?? 'bg-slate-100 text-slate-600 border-slate-200'
    )}>
      {type}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// MODAL : GESTION DES KINÉSITHÉRAPEUTES
// ─────────────────────────────────────────────────────────────

function KineSettingsModal({
  initialList,
  onClose,
  onSaved,
}: {
  initialList: Kinesitherapeute[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [list, setList] = useState<Kinesitherapeute[]>(initialList);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ nom: string; telephone: string; jours: string[] }>({
    nom: '', telephone: '', jours: [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEdit = (k: Kinesitherapeute) => {
    setEditingId(k.id);
    setDraft({ nom: k.nom, telephone: k.telephone ?? '', jours: [...k.jours] });
  };

  const saveEdit = () => {
    if (!editingId) return;
    setList(l => l.map(k => k.id === editingId ? { ...k, ...draft } : k));
    setEditingId(null);
  };

  const cancelEdit = () => setEditingId(null);

  const addNew = () => {
    const newKine: Kinesitherapeute = {
      id: `k-${Date.now()}`,
      nom: '',
      jours: [],
      telephone: '',
    };
    setList(l => [...l, newKine]);
    setEditingId(newKine.id);
    setDraft({ nom: '', telephone: '', jours: [] });
  };

  const removeKine = (id: string) => {
    setList(l => l.filter(k => k.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const toggleJour = (jour: string) => {
    setDraft(d => ({
      ...d,
      jours: d.jours.includes(jour) ? d.jours.filter(j => j !== jour) : [...d.jours, jour],
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const clean = list
        .filter(k => k.nom.trim())
        .map(k => k.id === editingId ? { ...k, ...draft } : k);
      await saveKineConfig(clean);
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 className="font-bold text-slate-800 text-base flex items-center gap-2">
              <Settings className="h-4 w-4 text-teal-600" />
              Gestion des kinésithérapeutes
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">Nom, téléphone et jours de passage</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Liste */}
        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {list.map(k => (
            <div key={k.id} className="border border-slate-200 rounded-xl p-3">
              {editingId === k.id ? (
                <div className="space-y-3">
                  <input
                    autoFocus
                    value={draft.nom}
                    onChange={e => setDraft(d => ({ ...d, nom: e.target.value }))}
                    placeholder="Nom du kinésithérapeute…"
                    className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-teal-400"
                  />
                  <input
                    value={draft.telephone}
                    onChange={e => setDraft(d => ({ ...d, telephone: e.target.value }))}
                    placeholder="Téléphone…"
                    className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-teal-400"
                  />
                  <div>
                    <p className="text-xs font-semibold text-slate-600 mb-1.5">Jours de passage</p>
                    <div className="flex flex-wrap gap-1.5">
                      {JOURS_SEMAINE.map(jour => (
                        <label key={jour} className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={draft.jours.includes(jour)}
                            onChange={() => toggleJour(jour)}
                            className="accent-teal-600"
                          />
                          <span className="text-xs text-slate-700">{jour}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={saveEdit}
                      className="flex-1 bg-teal-600 text-white rounded-lg py-1.5 text-sm font-semibold hover:bg-teal-700 transition-colors"
                    >
                      Valider
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-slate-800">
                      {k.nom || <span className="text-slate-400 italic">sans nom</span>}
                    </div>
                    {k.telephone && (
                      <div className="text-xs text-slate-500">{k.telephone}</div>
                    )}
                    {k.jours.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {k.jours.map(j => (
                          <span key={j} className="text-[10px] bg-teal-50 text-teal-700 border border-teal-200 rounded-full px-1.5 py-0.5 font-medium">
                            {j}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => startEdit(k)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
                      title="Modifier"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => removeKine(k.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Supprimer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          {list.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-4 italic">
              Aucun kinésithérapeute enregistré.
            </p>
          )}
        </div>

        {/* Footer */}
        {error && (
          <p className="px-5 py-2 text-sm text-red-600 bg-red-50 border-t border-red-100">{error}</p>
        )}
        <div className="p-4 border-t flex gap-2">
          <button
            onClick={addNew}
            className="flex-1 flex items-center justify-center gap-1.5 border border-dashed border-slate-300 rounded-xl py-2 text-sm text-slate-600 hover:border-teal-400 hover:text-teal-700 hover:bg-teal-50 transition-colors"
          >
            <Plus className="h-4 w-4" /> Ajouter
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-teal-600 text-white rounded-xl py-2 text-sm font-semibold hover:bg-teal-700 disabled:opacity-60 transition-colors"
          >
            {saving ? <span className="flex items-center justify-center gap-1"><Loader2 className="h-4 w-4 animate-spin" /> Enregistrement…</span> : 'Sauvegarder'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MODAL : ASSIGNATION RÉSIDENT ↔ KINÉ
// ─────────────────────────────────────────────────────────────

interface AssignationFormData {
  id?: string;
  resident_id: string;
  kine_id: string;
  kine_nom: string;
  types_kine: string[];
  notes: string;
  actif: boolean;
}

function AssignationModal({
  kineList,
  residents,
  assignations,
  editTarget,
  onClose,
  onSaved,
}: {
  kineList: Kinesitherapeute[];
  residents: Resident[];
  assignations: KineAssignation[];
  editTarget: KineAssignation | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Résidents déjà assignés (actifs) — exclus du select si on crée une nouvelle assignation
  const assignedResidentIds = useMemo(
    () => new Set(assignations.map(a => a.resident_id)),
    [assignations]
  );

  const availableResidents = useMemo(() => {
    if (editTarget) return residents; // en édition, tous les résidents
    return residents.filter(r => !assignedResidentIds.has(r.id));
  }, [editTarget, residents, assignedResidentIds]);

  const [form, setForm] = useState<AssignationFormData>(() => {
    if (editTarget) {
      return {
        id: editTarget.id,
        resident_id: editTarget.resident_id,
        kine_id: editTarget.kine_id,
        kine_nom: editTarget.kine_nom,
        types_kine: [...editTarget.types_kine],
        notes: editTarget.notes,
        actif: editTarget.actif,
      };
    }
    return {
      resident_id: '',
      kine_id: '',
      kine_nom: '',
      types_kine: [],
      notes: '',
      actif: true,
    };
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleKineChange = (kineId: string) => {
    const kine = kineList.find(k => k.id === kineId);
    setForm(f => ({ ...f, kine_id: kineId, kine_nom: kine?.nom ?? '' }));
  };

  const toggleType = (type: string) => {
    setForm(f => ({
      ...f,
      types_kine: f.types_kine.includes(type)
        ? f.types_kine.filter(t => t !== type)
        : [...f.types_kine, type],
    }));
  };

  const handleSubmit = async () => {
    if (!form.resident_id) { setError('Veuillez sélectionner un résident.'); return; }
    if (!form.kine_id) { setError('Veuillez sélectionner un kinésithérapeute.'); return; }
    setSaving(true);
    setError(null);
    try {
      await upsertAssignation(form as AssignationFormData & { resident_id: string; kine_id: string; kine_nom: string });
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-bold text-slate-800 text-base">
            {editTarget ? 'Modifier l\'assignation' : 'Nouvelle assignation'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {/* Résident */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Résident</label>
            <select
              value={form.resident_id}
              onChange={e => setForm(f => ({ ...f, resident_id: e.target.value }))}
              disabled={!!editTarget}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400 disabled:bg-slate-50 disabled:cursor-not-allowed"
            >
              <option value="">— Sélectionner un résident —</option>
              {availableResidents.map(r => (
                <option key={r.id} value={r.id}>
                  Ch.{r.room} — {r.title} {r.last_name} {r.first_name}
                </option>
              ))}
            </select>
            {!editTarget && availableResidents.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">Tous les résidents ont déjà une assignation.</p>
            )}
          </div>

          {/* Kinésithérapeute */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Kinésithérapeute</label>
            {kineList.length === 0 ? (
              <p className="text-xs text-amber-600">
                Aucun kinésithérapeute configuré.{' '}
                <button onClick={onClose} className="underline">Gérer les kinés</button>
              </p>
            ) : (
              <select
                value={form.kine_id}
                onChange={e => handleKineChange(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400"
              >
                <option value="">— Sélectionner un kiné —</option>
                {kineList.map(k => (
                  <option key={k.id} value={k.id}>{k.nom}</option>
                ))}
              </select>
            )}
          </div>

          {/* Types de kiné */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Types de kinésithérapie</label>
            <div className="grid grid-cols-2 gap-1.5">
              {TYPES_KINE_OPTIONS.map(type => (
                <label key={type} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.types_kine.includes(type)}
                    onChange={() => toggleType(type)}
                    className="accent-teal-600"
                  />
                  <span className="text-sm text-slate-700">{type}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Observations, fréquence, objectifs…"
              rows={3}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-teal-400 resize-none"
            />
          </div>

          {/* Actif */}
          <div className="flex items-center gap-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={form.actif}
                onChange={e => setForm(f => ({ ...f, actif: e.target.checked }))}
                className="sr-only peer"
              />
              <div className="w-10 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600" />
            </label>
            <span className="text-sm font-semibold text-slate-700">Suivi actif</span>
          </div>
        </div>

        {/* Footer */}
        {error && (
          <p className="px-5 py-2 text-sm text-red-600 bg-red-50 border-t border-red-100">{error}</p>
        )}
        <div className="p-4 border-t flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 border border-slate-300 rounded-xl py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 bg-teal-600 text-white rounded-xl py-2 text-sm font-semibold hover:bg-teal-700 disabled:opacity-60 transition-colors"
          >
            {saving
              ? <span className="flex items-center justify-center gap-1"><Loader2 className="h-4 w-4 animate-spin" /> Enregistrement…</span>
              : editTarget ? 'Mettre à jour' : 'Enregistrer'
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PAGE PRINCIPALE
// ─────────────────────────────────────────────────────────────

export default function KinePage() {
  const queryClient = useQueryClient();
  const access = useModuleAccess('kine');
  const readOnly = access === 'read';

  // UI state
  const [showSettings, setShowSettings] = useState(false);
  const [showAssignation, setShowAssignation] = useState(false);
  const [editTarget, setEditTarget] = useState<KineAssignation | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Filtres
  const [searchText, setSearchText] = useState('');
  const [filterKineId, setFilterKineId] = useState('');
  const [filterJour, setFilterJour] = useState('');

  // ── KineConfig (React Query) ──────────────────────────────
  const { data: kineConfig = [], isLoading: loadingConfig } = useQuery({
    queryKey: ['settings', 'kine_config'],
    queryFn: fetchKineConfig,
  });

  // ── Résidents (React Query) ───────────────────────────────
  const { data: residents = [], isLoading: loadingResidents } = useQuery({
    queryKey: ['kine_residents'],
    queryFn: fetchResidents,
  });

  // ── Assignations : useState + fetch direct (pas de React Query) ──
  const [assignations, setAssignations] = useState<KineAssignation[]>([]);
  const [loadingAssignations, setLoadingAssignations] = useState(true);
  const [isAssignationsError, setIsAssignationsError] = useState(false);
  const [assignationsError, setAssignationsError] = useState<string | null>(null);

  const loadAssignations = useCallback(async () => {
    setLoadingAssignations(true);
    setIsAssignationsError(false);
    setAssignationsError(null);
    try {
      const data = await fetchAssignations();
      setAssignations(data);
    } catch (e) {
      setIsAssignationsError(true);
      setAssignationsError((e as Error).message);
    } finally {
      setLoadingAssignations(false);
    }
  }, []);

  // Chargement initial
  useEffect(() => { loadAssignations(); }, [loadAssignations]);

  // Map resident id → resident object
  const residentMap = useMemo(() => {
    const m: Record<string, Resident> = {};
    residents.forEach(r => { m[r.id] = r; });
    return m;
  }, [residents]);

  // Map kine id → kine object
  const kineMap = useMemo(() => {
    const m: Record<string, Kinesitherapeute> = {};
    kineConfig.forEach(k => { m[k.id] = k; });
    return m;
  }, [kineConfig]);

  // Filtrage
  const filtered = useMemo(() => {
    return assignations.filter(a => {
      const resident = residentMap[a.resident_id];
      const residentName = resident
        ? `${resident.title} ${resident.last_name} ${resident.first_name} ch${resident.room}`.toLowerCase()
        : '';

      if (searchText && !residentName.includes(searchText.toLowerCase()) &&
          !a.kine_nom.toLowerCase().includes(searchText.toLowerCase())) {
        return false;
      }
      if (filterKineId && a.kine_id !== filterKineId) return false;
      if (filterJour) {
        const kine = kineMap[a.kine_id];
        if (!kine || !kine.jours.includes(filterJour)) return false;
      }
      return true;
    });
  }, [assignations, residentMap, kineMap, searchText, filterKineId, filterJour]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Supprimer cette assignation ?')) return;
    setDeletingId(id);
    try {
      await deleteAssignation(id);
      await loadAssignations();
    } catch (e) {
      alert(`Erreur : ${(e as Error).message}`);
    } finally {
      setDeletingId(null);
    }
  }, [loadAssignations]);

  const handleEdit = useCallback((a: KineAssignation) => {
    setEditTarget(a);
    setShowAssignation(true);
  }, []);

  const handleModalSaved = useCallback(async () => {
    await loadAssignations();
    queryClient.invalidateQueries({ queryKey: ['settings', 'kine_config'] });
  }, [loadAssignations, queryClient]);

  const isLoading = loadingConfig || loadingAssignations || loadingResidents;

  return (
    <div className="min-h-screen" style={{ background: '#dde4ee' }}>

      {/* ══ HEADER ══════════════════════════════════════════════ */}
      <header
        className="relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0d9488 0%, #0f766e 100%)' }}
      >
        <div className="absolute inset-0 pointer-events-none">
          <NetworkBackground />
        </div>
        <div className="relative z-10 max-w-6xl mx-auto px-6 py-5">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-white/50 text-xs mb-4">
            <Link href="/" className="hover:text-white/80 transition-colors">Accueil</Link>
            <span>›</span>
            <span className="text-white/75">Kinésithérapie</span>
          </div>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <KineIcon />
              <div>
                <h1 className="text-2xl font-extrabold text-white tracking-tight leading-none">
                  Kinésithérapie
                </h1>
                <p className="text-sm text-white/60 mt-0.5">Résidence La Fourrier</p>
              </div>
            </div>
            {!readOnly && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowSettings(true)}
                  className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white border border-white/30 rounded-xl px-4 py-2 text-sm font-semibold transition-colors"
                >
                  <Settings className="h-4 w-4" />
                  Gérer les kinés
                </button>
                <button
                  onClick={() => { setEditTarget(null); setShowAssignation(true); }}
                  className="flex items-center gap-1.5 bg-white text-teal-700 hover:bg-white/90 rounded-xl px-4 py-2 text-sm font-semibold shadow-md transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Ajouter un résident
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ══ BANDEAU LECTURE SEULE ════════════════════════════════ */}
      {readOnly && (
        <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 mx-4 mt-4 text-sm text-blue-700 font-medium">
          <Eye className="h-4 w-4 flex-shrink-0" />
          Vous consultez cette page en lecture seule.
        </div>
      )}

      {/* ══ FILTRES ══════════════════════════════════════════════ */}
      <div className="max-w-6xl mx-auto px-4 pt-4 pb-2">
        <div className="bg-white rounded-xl shadow border border-slate-200 px-4 py-3 flex flex-wrap gap-3 items-center">
          {/* Recherche texte */}
          <input
            type="text"
            placeholder="Rechercher un résident ou un kiné…"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            className="flex-1 min-w-[200px] border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-teal-400"
          />
          {/* Filtre par kiné */}
          <select
            value={filterKineId}
            onChange={e => setFilterKineId(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-teal-400"
          >
            <option value="">Tous les kinés</option>
            {kineConfig.map(k => (
              <option key={k.id} value={k.id}>{k.nom}</option>
            ))}
          </select>
          {/* Filtre par jour */}
          <select
            value={filterJour}
            onChange={e => setFilterJour(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-teal-400"
          >
            <option value="">Tous les jours</option>
            {JOURS_SEMAINE.map(j => (
              <option key={j} value={j}>{j}</option>
            ))}
          </select>
          {/* Compteur */}
          <span className="text-xs text-slate-500 ml-auto whitespace-nowrap">
            {filtered.length} assignation{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* ══ ERREUR CHARGEMENT ════════════════════════════════════ */}
      {isAssignationsError && (
        <div className="max-w-6xl mx-auto px-4 pt-3">
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2 text-sm text-red-700">
            <span className="font-bold shrink-0">⚠️ Erreur base de données :</span>
            <span>{assignationsError ?? 'Impossible de charger les assignations.'}</span>
            <button
              onClick={loadAssignations}
              className="ml-auto shrink-0 underline text-red-600 hover:text-red-800"
            >
              Réessayer
            </button>
          </div>
        </div>
      )}

      {/* ══ CONTENU PRINCIPAL ════════════════════════════════════ */}
      <div className="max-w-6xl mx-auto px-4 pb-10">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-teal-400" />
          </div>
        ) : filtered.length === 0 ? (
          /* État vide */
          <div className="mt-4 bg-white rounded-xl shadow border border-slate-200 flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-16 h-16 rounded-full bg-teal-50 flex items-center justify-center">
              <Activity className="h-8 w-8 text-teal-400" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-slate-600 text-base">
                {assignations.length === 0
                  ? 'Aucune assignation kiné pour le moment'
                  : 'Aucun résultat pour ces filtres'}
              </p>
              <p className="text-sm text-slate-400 mt-1">
                {assignations.length === 0
                  ? 'Cliquez sur « Ajouter un résident » pour commencer.'
                  : 'Modifiez vos critères de recherche.'}
              </p>
            </div>
            {!readOnly && assignations.length === 0 && (
              <button
                onClick={() => { setEditTarget(null); setShowAssignation(true); }}
                className="flex items-center gap-1.5 bg-teal-600 text-white hover:bg-teal-700 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors"
              >
                <Plus className="h-4 w-4" />
                Ajouter un résident
              </button>
            )}
          </div>
        ) : (
          /* Tableau */
          <div className="mt-4 bg-white shadow rounded-xl border border-slate-200 overflow-x-auto">
            <table className="w-full border-collapse min-w-[900px]">
              <thead>
                <tr
                  className="text-white text-sm"
                  style={{ background: 'linear-gradient(90deg, #0d9488, #0f766e)' }}
                >
                  <th className="px-3 py-3 text-left font-semibold">Chambre</th>
                  <th className="px-3 py-3 text-left font-semibold">Résident</th>
                  <th className="px-3 py-3 text-left font-semibold">Kinésithérapeute</th>
                  <th className="px-3 py-3 text-left font-semibold">Jours</th>
                  <th className="px-3 py-3 text-left font-semibold">Types de kiné</th>
                  <th className="px-3 py-3 text-left font-semibold">Notes</th>
                  <th className="px-3 py-3 text-center font-semibold w-20">Actif</th>
                  {!readOnly && <th className="px-3 py-3 text-center font-semibold w-24">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((a, idx) => {
                  const resident = residentMap[a.resident_id];
                  const kine = kineMap[a.kine_id];
                  return (
                    <tr
                      key={a.id}
                      className={cn(
                        'border-t border-slate-100 text-sm transition-colors',
                        idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60',
                        'hover:bg-teal-50/40'
                      )}
                    >
                      {/* Chambre */}
                      <td className="px-3 py-3 font-bold text-teal-700 whitespace-nowrap">
                        {resident ? `Ch. ${resident.room}` : '—'}
                      </td>

                      {/* Résident */}
                      <td className="px-3 py-3 font-medium text-slate-800 whitespace-nowrap">
                        {resident
                          ? `${resident.title} ${resident.last_name} ${resident.first_name}`
                          : <span className="text-slate-400 italic">Résident introuvable</span>
                        }
                      </td>

                      {/* Kinésithérapeute */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="font-medium text-slate-700">{a.kine_nom}</div>
                        {kine?.telephone && (
                          <div className="text-xs text-slate-400">{kine.telephone}</div>
                        )}
                      </td>

                      {/* Jours */}
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {kine?.jours && kine.jours.length > 0
                            ? kine.jours.map(j => (
                                <span
                                  key={j}
                                  className="text-[10px] bg-teal-50 text-teal-700 border border-teal-200 rounded-full px-1.5 py-0.5 font-medium"
                                >
                                  {j}
                                </span>
                              ))
                            : <span className="text-slate-400 text-xs italic">—</span>
                          }
                        </div>
                      </td>

                      {/* Types de kiné */}
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {a.types_kine.length > 0
                            ? a.types_kine.map(t => (
                                <span
                                  key={t}
                                  className={cn(
                                    'inline-block px-2 py-0.5 rounded-full text-[11px] font-medium border',
                                    TYPE_COLORS[t] ?? 'bg-slate-100 text-slate-600 border-slate-200'
                                  )}
                                >
                                  {t}
                                </span>
                              ))
                            : <span className="text-slate-400 text-xs italic">—</span>
                          }
                        </div>
                      </td>

                      {/* Notes */}
                      <td className="px-3 py-3 text-slate-600 text-xs max-w-[200px]">
                        {a.notes
                          ? <span className="line-clamp-2">{a.notes}</span>
                          : <span className="text-slate-300 italic">—</span>
                        }
                      </td>

                      {/* Actif */}
                      <td className="px-3 py-3 text-center">
                        <span className={cn(
                          'inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold',
                          a.actif
                            ? 'bg-green-100 text-green-700 border border-green-200'
                            : 'bg-slate-100 text-slate-500 border border-slate-200'
                        )}>
                          {a.actif ? 'Actif' : 'Inactif'}
                        </span>
                      </td>

                      {/* Actions */}
                      {!readOnly && (
                        <td className="px-3 py-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => handleEdit(a)}
                              title="Modifier"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(a.id)}
                              disabled={deletingId === a.id}
                              title="Supprimer"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                            >
                              {deletingId === a.id
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <Trash2 className="h-3.5 w-3.5" />
                              }
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ══ MODALES ══════════════════════════════════════════════ */}
      {showSettings && (
        <KineSettingsModal
          initialList={kineConfig}
          onClose={() => setShowSettings(false)}
          onSaved={handleModalSaved}
        />
      )}

      {showAssignation && (
        <AssignationModal
          kineList={kineConfig}
          residents={residents}
          assignations={assignations}
          editTarget={editTarget}
          onClose={() => { setShowAssignation(false); setEditTarget(null); }}
          onSaved={handleModalSaved}
        />
      )}
    </div>
  );
}
