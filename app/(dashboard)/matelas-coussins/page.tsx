'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BedDouble, Plus, Trash2, Pencil, X, QrCode, Camera, Printer, Search,
  Loader2, Eye, ChevronRight, UserPlus, UserMinus, Settings, Tag,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { useModuleAccess } from '@/lib/use-module-access';
import { fetchColorOverrides, type ColorOverrides } from '@/lib/module-colors';
import { MODULES } from '@/components/dashboard/module-config';
import QRCode from 'qrcode';

// ── Types ────────────────────────────────────────────────────────────────────

type Kind = 'matelas' | 'coussin';

interface ItemType {
  id: string;
  kind: Kind;
  name: string;
}

interface Item {
  id: string;
  kind: Kind;
  type_id: string | null;
  type_name: string | null;
  serial_number: string;
  resident_id: string | null;
  resident_name: string | null;
  status: 'disponible' | 'attribue' | 'maintenance' | 'rebut';
  notes: string | null;
  assigned_at: string | null;
  created_at: string;
}

interface Resident {
  id: string;
  title: string;
  first_name: string;
  last_name: string;
  room: string;
}

const STATUS_OPTIONS: { value: Item['status']; label: string; color: string }[] = [
  { value: 'disponible', label: 'Disponible', color: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  { value: 'attribue', label: 'Attribué', color: 'bg-blue-100 text-blue-700 border-blue-300' },
  { value: 'maintenance', label: 'Maintenance', color: 'bg-amber-100 text-amber-700 border-amber-300' },
  { value: 'rebut', label: 'Rebut', color: 'bg-slate-100 text-slate-600 border-slate-300' },
];

function statusInfo(s: Item['status']) {
  return STATUS_OPTIONS.find(o => o.value === s) ?? STATUS_OPTIONS[0];
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MatelasCoussinsPage() {
  const supabase = createClient();
  const qc = useQueryClient();
  const access = useModuleAccess('matelasCoussins');
  const readOnly = access === 'read';

  const { data: colorOverrides = {} } = useQuery<ColorOverrides>({
    queryKey: ['settings', 'module_colors'],
    queryFn: fetchColorOverrides,
    staleTime: 30000,
  });
  const mod = MODULES.find(m => m.id === 'matelasCoussins');
  const colorFrom = colorOverrides['matelasCoussins']?.from ?? mod?.cardFrom ?? '#0ea5a4';
  const colorTo = colorOverrides['matelasCoussins']?.to ?? mod?.cardTo ?? '#0d6e6d';

  const [activeTab, setActiveTab] = useState<Kind>('matelas');
  const [search, setSearch] = useState('');
  const [showTypes, setShowTypes] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [assigning, setAssigning] = useState<Item | null>(null);
  const [qrTarget, setQrTarget] = useState<Item | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [printAll, setPrintAll] = useState<Kind | null>(null);

  // ── Queries ─────────────────────────────────────────────────
  const { data: items = [], isLoading: loadingItems } = useQuery({
    queryKey: ['mat_couss_items'],
    queryFn: async () => {
      const { data, error } = await supabase.from('mat_couss_items').select('*').order('serial_number');
      if (error) throw error;
      return (data ?? []) as Item[];
    },
  });

  const { data: types = [] } = useQuery({
    queryKey: ['mat_couss_types'],
    queryFn: async () => {
      const { data, error } = await supabase.from('mat_couss_types').select('*').order('name');
      if (error) throw error;
      return (data ?? []) as ItemType[];
    },
  });

  const { data: residents = [] } = useQuery({
    queryKey: ['residents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('residents').select('id, title, first_name, last_name, room')
        .eq('archived', false).order('last_name');
      if (error) throw error;
      return (data ?? []) as Resident[];
    },
  });

  // ── Filtered list ───────────────────────────────────────────
  const filteredItems = useMemo(() => {
    const q = search.toLowerCase().trim();
    return items
      .filter(i => i.kind === activeTab)
      .filter(i => !q ||
        i.serial_number.toLowerCase().includes(q) ||
        (i.type_name || '').toLowerCase().includes(q) ||
        (i.resident_name || '').toLowerCase().includes(q));
  }, [items, activeTab, search]);

  const stats = useMemo(() => {
    const kindItems = items.filter(i => i.kind === activeTab);
    return {
      total: kindItems.length,
      disponible: kindItems.filter(i => i.status === 'disponible').length,
      attribue: kindItems.filter(i => i.status === 'attribue').length,
      maintenance: kindItems.filter(i => i.status === 'maintenance').length,
    };
  }, [items, activeTab]);

  const typesForTab = types.filter(t => t.kind === activeTab);

  // ── Mutations ───────────────────────────────────────────────
  const saveItem = useMutation({
    mutationFn: async (input: Partial<Item>) => {
      const payload = { ...input, updated_at: new Date().toISOString() };
      if (input.id) {
        const { error } = await supabase.from('mat_couss_items').update(payload).eq('id', input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('mat_couss_items').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mat_couss_items'] });
      toast.success('Enregistré');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('mat_couss_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mat_couss_items'] }); toast.success('Supprimé'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const assignToResident = useMutation({
    mutationFn: async ({ itemId, resident }: { itemId: string; resident: Resident | null }) => {
      const payload = resident
        ? {
            resident_id: resident.id,
            resident_name: `${resident.last_name} ${resident.first_name}`.trim(),
            status: 'attribue',
            assigned_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
        : {
            resident_id: null,
            resident_name: null,
            status: 'disponible',
            assigned_at: null,
            updated_at: new Date().toISOString(),
          };
      const { error } = await supabase.from('mat_couss_items').update(payload).eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mat_couss_items'] });
      setAssigning(null);
      toast.success('Affectation mise à jour');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Lookup item by serial (for QR scanning) ─────────────────
  const itemBySerial = useCallback(
    (serial: string) => items.find(i => i.serial_number.trim() === serial.trim()) ?? null,
    [items],
  );

  if (loadingItems) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: '#dde4ee' }}>
      {/* Header */}
      <div className="relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${colorFrom}, ${colorTo})` }}>
        <div className="relative z-10 max-w-6xl mx-auto px-6 py-5">
          <div className="flex items-center gap-1.5 text-white/60 text-xs mb-4">
            <Link href="/" className="hover:text-white/90">Accueil</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-white/90">Matelas / Coussins</span>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
              <BedDouble className="h-6 w-6 text-white" strokeWidth={1.5} />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-white">Matelas / Coussins</h1>
              <p className="text-white/70 text-sm">Antiescarres — inventaire et affectation</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setScanOpen(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white text-teal-700 text-sm font-semibold hover:bg-teal-50 transition-colors">
                <Camera className="h-4 w-4" /> Scanner un QR
              </button>
              <button onClick={() => setPrintAll(activeTab)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/15 text-white text-sm hover:bg-white/25 transition-colors">
                <Printer className="h-4 w-4" /> Imprimer QR
              </button>
              <button onClick={() => setShowTypes(true)} disabled={readOnly}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/15 text-white text-sm hover:bg-white/25 transition-colors disabled:opacity-40">
                <Settings className="h-4 w-4" /> Types
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">

        {readOnly && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-sm text-blue-700 font-medium">
            <Eye className="h-4 w-4" /> Vous consultez cette page en lecture seule.
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-white border border-slate-200 rounded-2xl p-1.5 shadow-sm w-fit">
          {(['matelas', 'coussin'] as const).map(k => (
            <button key={k} onClick={() => { setActiveTab(k); setSearch(''); }}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
                activeTab === k ? 'bg-teal-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}>
              <BedDouble className="h-3.5 w-3.5" />
              {k === 'matelas' ? 'Matelas' : 'Coussins'}
            </button>
          ))}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <div className="text-2xl font-bold text-slate-800">{stats.total}</div>
            <div className="text-xs text-slate-500 font-medium">Total</div>
          </div>
          <div className="bg-emerald-50 rounded-xl border border-emerald-200 px-4 py-3">
            <div className="text-2xl font-bold text-emerald-700">{stats.disponible}</div>
            <div className="text-xs text-emerald-600 font-medium">Disponibles</div>
          </div>
          <div className="bg-blue-50 rounded-xl border border-blue-200 px-4 py-3">
            <div className="text-2xl font-bold text-blue-700">{stats.attribue}</div>
            <div className="text-xs text-blue-600 font-medium">Attribués</div>
          </div>
          <div className="bg-amber-50 rounded-xl border border-amber-200 px-4 py-3">
            <div className="text-2xl font-bold text-amber-700">{stats.maintenance}</div>
            <div className="text-xs text-amber-600 font-medium">Maintenance</div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="bg-white rounded-xl border border-slate-200 p-3 flex gap-3 items-center flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher (n° série, type, résident)…"
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-slate-400" />
          </div>
          <button onClick={() => setShowAdd(true)} disabled={readOnly}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-40 transition-colors">
            <Plus className="h-4 w-4" /> Ajouter un {activeTab}
          </button>
        </div>

        {/* Inventory list */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {filteredItems.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-12">
              Aucun {activeTab} trouvé. Cliquez sur « Ajouter » pour en enregistrer un.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b text-xs uppercase tracking-wide text-slate-500">
                  <th className="text-left px-3 py-2">N° de série</th>
                  <th className="text-left px-3 py-2">Type</th>
                  <th className="text-left px-3 py-2">Statut</th>
                  <th className="text-left px-3 py-2">Résident attribué</th>
                  <th className="text-right px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map(it => {
                  const s = statusInfo(it.status);
                  return (
                    <tr key={it.id} className="border-b last:border-0 hover:bg-slate-50/50">
                      <td className="px-3 py-2 font-mono text-slate-800 font-semibold">{it.serial_number}</td>
                      <td className="px-3 py-2 text-slate-600">{it.type_name || <span className="text-slate-300 italic">—</span>}</td>
                      <td className="px-3 py-2">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${s.color}`}>{s.label}</span>
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {it.resident_name || <span className="text-slate-300 italic">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1 justify-end flex-wrap">
                          <button onClick={() => setQrTarget(it)} title="QR code"
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors">
                            <QrCode className="h-4 w-4" />
                          </button>
                          {it.resident_id ? (
                            <button onClick={() => assignToResident.mutate({ itemId: it.id, resident: null })}
                              disabled={readOnly} title="Retirer de l'affectation"
                              className="p-1.5 rounded-lg hover:bg-amber-100 text-amber-600 transition-colors disabled:opacity-40">
                              <UserMinus className="h-4 w-4" />
                            </button>
                          ) : (
                            <button onClick={() => setAssigning(it)} disabled={readOnly} title="Affecter à un résident"
                              className="p-1.5 rounded-lg hover:bg-blue-100 text-blue-600 transition-colors disabled:opacity-40">
                              <UserPlus className="h-4 w-4" />
                            </button>
                          )}
                          <button onClick={() => setEditing(it)} disabled={readOnly} title="Modifier"
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors disabled:opacity-40">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button onClick={() => { if (confirm(`Supprimer ${it.serial_number} ?`)) deleteItem.mutate(it.id); }}
                            disabled={readOnly} title="Supprimer"
                            className="p-1.5 rounded-lg hover:bg-red-100 text-red-500 transition-colors disabled:opacity-40">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modals */}
      {showAdd && (
        <ItemFormModal
          kind={activeTab}
          types={typesForTab}
          onClose={() => setShowAdd(false)}
          onSave={async input => {
            await saveItem.mutateAsync({ ...input, kind: activeTab });
            setShowAdd(false);
          }}
        />
      )}
      {editing && (
        <ItemFormModal
          kind={editing.kind}
          types={types.filter(t => t.kind === editing.kind)}
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async input => {
            await saveItem.mutateAsync({ ...input, id: editing.id, kind: editing.kind });
            setEditing(null);
          }}
        />
      )}
      {assigning && (
        <AssignModal
          item={assigning}
          residents={residents}
          onClose={() => setAssigning(null)}
          onAssign={r => assignToResident.mutate({ itemId: assigning.id, resident: r })}
        />
      )}
      {qrTarget && <QRPreviewModal item={qrTarget} onClose={() => setQrTarget(null)} />}
      {showTypes && (
        <TypesModal
          kind={activeTab}
          types={typesForTab}
          onClose={() => setShowTypes(false)}
        />
      )}
      {scanOpen && (
        <ScannerModal
          onClose={() => setScanOpen(false)}
          onResult={serial => {
            const found = itemBySerial(serial);
            setScanOpen(false);
            if (!found) { toast.error(`Aucun matériel avec n° ${serial}`); return; }
            setActiveTab(found.kind);
            setAssigning(found);
          }}
        />
      )}
      {printAll && (
        <PrintAllQRModal
          kind={printAll}
          items={items.filter(i => i.kind === printAll)}
          onClose={() => setPrintAll(null)}
        />
      )}
    </div>
  );
}

// ── Item form modal ──────────────────────────────────────────────────────────

function ItemFormModal({
  kind, types, initial, onClose, onSave,
}: {
  kind: Kind;
  types: ItemType[];
  initial?: Item;
  onClose: () => void;
  onSave: (input: Partial<Item>) => Promise<void> | void;
}) {
  const [serial, setSerial] = useState(initial?.serial_number || '');
  const [typeId, setTypeId] = useState(initial?.type_id || '');
  const [status, setStatus] = useState<Item['status']>(initial?.status || 'disponible');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [saving, setSaving] = useState(false);

  // Auto-select unique coussin type
  useEffect(() => {
    if (!initial && kind === 'coussin' && types.length === 1 && !typeId) setTypeId(types[0].id);
  }, [kind, types, initial, typeId]);

  const submit = async () => {
    if (!serial.trim()) { toast.error('Numéro de série requis'); return; }
    setSaving(true);
    try {
      const t = types.find(x => x.id === typeId);
      await onSave({
        serial_number: serial.trim(),
        type_id: typeId || null,
        type_name: t?.name || null,
        status,
        notes: notes.trim() || null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold text-slate-900">
            {initial ? 'Modifier' : 'Ajouter'} un {kind}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1 uppercase">N° de série *</label>
            <input value={serial} onChange={e => setSerial(e.target.value)} autoFocus
              placeholder="Ex : MAT-001"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono outline-none focus:border-teal-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1 uppercase">Type</label>
            <select value={typeId} onChange={e => setTypeId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-teal-400">
              <option value="">— Aucun —</option>
              {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {types.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">Aucun type défini. Ouvrez « Types » pour en ajouter.</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1 uppercase">Statut</label>
            <select value={status} onChange={e => setStatus(e.target.value as Item['status'])}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-teal-400">
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1 uppercase">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-teal-400 resize-y" />
          </div>
        </div>
        <div className="flex gap-2 justify-end p-4 border-t">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
            Annuler
          </button>
          <button onClick={submit} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-50">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {initial ? 'Enregistrer' : 'Ajouter'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Assign modal ─────────────────────────────────────────────────────────────

function AssignModal({
  item, residents, onClose, onAssign,
}: {
  item: Item;
  residents: Resident[];
  onClose: () => void;
  onAssign: (r: Resident) => void;
}) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return residents
      .filter(r => !q ||
        r.last_name.toLowerCase().includes(q) ||
        r.first_name.toLowerCase().includes(q) ||
        (r.room || '').toLowerCase().includes(q))
      .slice(0, 80);
  }, [residents, search]);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="font-semibold text-slate-900">Affecter à un résident</h2>
            <p className="text-xs text-slate-500 font-mono">{item.serial_number}{item.type_name && ` · ${item.type_name}`}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher (nom, chambre)…"
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-slate-400" />
          </div>
        </div>
        <div className="overflow-y-auto p-3 space-y-1.5">
          {filtered.length === 0
            ? <p className="text-sm text-slate-400 text-center py-6">Aucun résident</p>
            : filtered.map(r => (
              <button key={r.id} onClick={() => onAssign(r)}
                className="w-full text-left flex items-center justify-between px-3 py-2 rounded-xl hover:bg-teal-50 border border-slate-100 hover:border-teal-200 transition-colors">
                <div>
                  <div className="text-sm font-medium text-slate-800">{r.title} {r.last_name} {r.first_name}</div>
                  <div className="text-xs text-slate-500">Ch. {r.room}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-300" />
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}

// ── Types management modal ──────────────────────────────────────────────────

function TypesModal({
  kind, types, onClose,
}: {
  kind: Kind;
  types: ItemType[];
  onClose: () => void;
}) {
  const supabase = createClient();
  const qc = useQueryClient();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const refresh = () => qc.invalidateQueries({ queryKey: ['mat_couss_types'] });

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    const { error } = await supabase.from('mat_couss_types').insert({ kind, name });
    if (error) toast.error(error.message); else { setNewName(''); refresh(); }
  };

  const save = async (id: string, name: string) => {
    if (!name.trim()) return;
    const { error } = await supabase.from('mat_couss_types').update({ name: name.trim() }).eq('id', id);
    if (error) toast.error(error.message); else { setEditingId(null); refresh(); }
  };

  const del = async (id: string, name: string) => {
    if (!confirm(`Supprimer le type "${name}" ?`)) return;
    const { error } = await supabase.from('mat_couss_types').delete().eq('id', id);
    if (error) toast.error(error.message); else refresh();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="font-semibold text-slate-900">Types — {kind === 'matelas' ? 'Matelas' : 'Coussins'}</h2>
            <p className="text-xs text-slate-500">Modèles disponibles pour ce {kind}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4 border-b">
          <div className="flex gap-2">
            <input value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && add()}
              placeholder={`Nouveau type de ${kind}…`}
              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-teal-400" />
            <button onClick={add} disabled={!newName.trim()}
              className="flex items-center gap-1 px-3 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-40">
              <Plus className="h-4 w-4" /> Ajouter
            </button>
          </div>
        </div>
        <div className="overflow-y-auto p-3 space-y-1.5">
          {types.length === 0
            ? <p className="text-sm text-slate-400 text-center py-6">Aucun type défini</p>
            : types.map(t => (
              <div key={t.id} className="flex items-center justify-between gap-2 px-3 py-2 border border-slate-100 rounded-lg">
                {editingId === t.id ? (
                  <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') save(t.id, editValue); if (e.key === 'Escape') setEditingId(null); }}
                    className="flex-1 px-2 py-1 border border-teal-300 rounded text-sm" />
                ) : (
                  <span className="flex items-center gap-2 text-sm text-slate-800">
                    <Tag className="h-3.5 w-3.5 text-slate-400" />
                    {t.name}
                  </span>
                )}
                <div className="flex gap-1">
                  {editingId === t.id ? (
                    <>
                      <button onClick={() => save(t.id, editValue)} className="text-xs text-green-600 hover:underline">OK</button>
                      <button onClick={() => setEditingId(null)} className="text-xs text-slate-400 hover:underline">Annuler</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => { setEditingId(t.id); setEditValue(t.name); }}
                        className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => del(t.id, t.name)}
                        className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                    </>
                  )}
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// ── QR preview modal (single item) ──────────────────────────────────────────

function QRPreviewModal({ item, onClose }: { item: Item; onClose: () => void }) {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    QRCode.toDataURL(item.serial_number, { width: 320, margin: 2 })
      .then(setDataUrl)
      .catch(e => toast.error(`QR : ${e.message}`));
  }, [item.serial_number]);

  const handlePrint = () => {
    const w = window.open('', '_blank');
    if (!w) { toast.error('Autorisez les popups'); return; }
    w.document.write(`<!DOCTYPE html><html><head><title>QR — ${item.serial_number}</title>
<style>body{margin:0;padding:30mm;font-family:Arial,sans-serif;text-align:center}
img{width:80mm;height:80mm}h1{font-size:18pt;margin:8mm 0 2mm}p{font-size:11pt;color:#555;margin:1mm 0}
@page{size:A4 portrait;margin:0}@media print{body{padding:30mm}}</style>
</head><body>
<img src="${dataUrl}"/>
<h1>${item.serial_number}</h1>
<p>${item.kind === 'matelas' ? 'Matelas' : 'Coussin'}${item.type_name ? ` — ${item.type_name}` : ''}</p>
</body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold text-slate-900">QR code</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-6 flex flex-col items-center gap-3">
          {dataUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={dataUrl} alt={item.serial_number} className="w-64 h-64" />
            : <Loader2 className="h-8 w-8 animate-spin text-slate-300" />}
          <div className="text-center">
            <div className="font-mono font-bold text-slate-800">{item.serial_number}</div>
            <div className="text-xs text-slate-500">
              {item.kind === 'matelas' ? 'Matelas' : 'Coussin'}{item.type_name && ` — ${item.type_name}`}
            </div>
          </div>
        </div>
        <div className="flex gap-2 justify-end p-4 border-t">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
            Fermer
          </button>
          <button onClick={handlePrint} disabled={!dataUrl}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-40">
            <Printer className="h-4 w-4" /> Imprimer
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Print all QR codes ──────────────────────────────────────────────────────

function PrintAllQRModal({ kind, items, onClose }: { kind: Kind; items: Item[]; onClose: () => void }) {
  const [generating, setGenerating] = useState(false);

  const generate = async () => {
    if (items.length === 0) { toast.info('Aucun élément à imprimer'); return; }
    setGenerating(true);
    try {
      const cards = await Promise.all(items.map(async it => {
        const data = await QRCode.toDataURL(it.serial_number, { width: 220, margin: 1 });
        return `<div class="card">
          <img src="${data}" alt="${it.serial_number}"/>
          <div class="serial">${it.serial_number}</div>
          <div class="meta">${it.type_name || ''}</div>
        </div>`;
      }));
      const w = window.open('', '_blank');
      if (!w) { toast.error('Autorisez les popups'); return; }
      w.document.write(`<!DOCTYPE html><html><head><title>QR — ${kind}</title>
<style>*{box-sizing:border-box}
body{margin:0;padding:8mm;font-family:Arial,sans-serif}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6mm}
.card{border:1px dashed #94a3b8;border-radius:4mm;padding:4mm;text-align:center;page-break-inside:avoid}
.card img{width:50mm;height:50mm}
.serial{font-family:monospace;font-weight:bold;font-size:12pt;margin-top:2mm}
.meta{font-size:9pt;color:#64748b;margin-top:1mm}
@page{size:A4 portrait;margin:8mm}
@media print{body{padding:0}}</style>
</head><body>
<div class="grid">${cards.join('')}</div>
</body></html>`);
      w.document.close();
      setTimeout(() => w.print(), 500);
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold text-slate-900">Imprimer tous les QR</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-sm text-slate-600">
            Génère une planche A4 portrait avec un QR par {kind} (3 colonnes).
          </p>
          <p className="text-xs text-slate-500">
            <span className="font-semibold">{items.length}</span> {kind}{items.length > 1 ? 's' : ''} à imprimer.
          </p>
        </div>
        <div className="flex gap-2 justify-end p-4 border-t">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
            Annuler
          </button>
          <button onClick={generate} disabled={generating || items.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 disabled:opacity-40">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            Générer
          </button>
        </div>
      </div>
    </div>
  );
}

// ── QR scanner modal ─────────────────────────────────────────────────────────

function ScannerModal({ onClose, onResult }: { onClose: () => void; onResult: (text: string) => void }) {
  const containerId = 'mat-couss-qr-scanner';
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Dynamic import to avoid SSR issues
        const mod = await import('html5-qrcode');
        if (cancelled) return;
        const { Html5Qrcode } = mod;
        const scanner = new Html5Qrcode(containerId);
        scannerRef.current = scanner as unknown as typeof scannerRef.current;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          decoded => {
            scanner.stop().finally(() => onResult(decoded));
          },
          () => { /* ignore frame errors */ },
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Caméra inaccessible');
      }
    })();
    return () => {
      cancelled = true;
      const s = scannerRef.current;
      if (s) s.stop().catch(() => {}).finally(() => s.clear());
    };
  }, [onResult]);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold text-slate-900">Scanner un QR code</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-4 space-y-3">
          {error
            ? <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>
            : <p className="text-xs text-slate-500">Pointez la caméra vers le QR code du matelas ou coussin.</p>}
          <div id={containerId} className="rounded-lg overflow-hidden bg-black" />
        </div>
      </div>
    </div>
  );
}
