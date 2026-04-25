'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BookUser, ChevronRight, Phone, PhoneOff, Plus, Pencil, Trash2,
  X, Check, Search, Wifi, WifiOff,
} from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { useModuleAccess } from '@/lib/use-module-access';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Resident {
  id: string;
  title?: string;
  first_name?: string;
  last_name: string;
  room?: string;
  floor?: string;
  archived?: boolean;
}

interface AnnuaireEntry {
  id: string;
  resident_id: string;
  phone_number: string;
  ligne_active: boolean;
  created_at: string;
  resident: Resident;
}

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function fetchAnnuaire(): Promise<AnnuaireEntry[]> {
  const sb = createClient();

  // 1. Récupérer toutes les entrées annuaire
  const { data: annRows, error: err1 } = await sb
    .from('annuaire_residents')
    .select('id, resident_id, phone_number, ligne_active, created_at');
  if (err1) throw err1;
  if (!annRows || annRows.length === 0) return [];

  // 2. Récupérer les résidents correspondants (non archivés)
  const ids = annRows.map(r => r.resident_id).filter(Boolean);
  const { data: resRows, error: err2 } = await sb
    .from('residents')
    .select('id,title,first_name,last_name,room,floor,archived')
    .in('id', ids)
    .eq('archived', false);
  if (err2) throw err2;

  const resMap = new Map((resRows ?? []).map(r => [r.id, r as Resident]));

  // 3. Joindre — ignorer les entrées sans résident actif
  return annRows
    .filter(e => resMap.has(e.resident_id))
    .map(e => ({ ...e, resident: resMap.get(e.resident_id)! })) as AnnuaireEntry[];
}

async function fetchResidents(): Promise<Resident[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from('residents')
    .select('id,title,first_name,last_name,room,floor,archived')
    .eq('archived', false)
    .order('last_name');
  if (error) throw error;
  return (data ?? []) as Resident[];
}

function roomNum(r?: string) {
  return parseInt((r ?? '').replace(/\D/g, '') || '0');
}

function sortEntries(entries: AnnuaireEntry[]) {
  return [...entries].sort((a, b) => {
    const fa = a.resident.floor ?? '', fb = b.resident.floor ?? '';
    if (fa !== fb) return fa < fb ? -1 : 1; // RDC avant 1ER
    const ra = roomNum(a.resident.room), rb = roomNum(b.resident.room);
    if (ra !== rb) return ra - rb;
    return (a.resident.last_name ?? '').localeCompare(b.resident.last_name ?? '');
  });
}

// ── Composant principal ───────────────────────────────────────────────────────

export default function AnnuairePage() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const access = useModuleAccess('annuaire');
  const isAdmin = profile?.role === 'admin';

  const [filterEtage, setFilterEtage] = useState<'all' | 'RDC' | '1ER'>('all');
  const [filterLigne, setFilterLigne] = useState<'all' | 'active' | 'inactive'>('all');
  const [search, setSearch]           = useState('');

  // Modals
  const [showAdd,  setShowAdd]   = useState(false);
  const [editEntry, setEditEntry] = useState<AnnuaireEntry | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<AnnuaireEntry | null>(null);

  // ── Data ──────────────────────────────────────────────────────────────────

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['annuaire_residents'],
    queryFn: fetchAnnuaire,
  });

  const { data: allResidents = [] } = useQuery({
    queryKey: ['residents'],
    queryFn: fetchResidents,
    enabled: isAdmin,
  });

  // Résidents pas encore dans l'annuaire
  const residentsInAnnuaire = new Set(entries.map(e => e.resident_id));
  const availableResidents  = allResidents.filter(r => !residentsInAnnuaire.has(r.id));

  // ── Filtrage ──────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sortEntries(entries.filter(e => {
      if (filterEtage !== 'all' && e.resident.floor !== filterEtage) return false;
      if (filterLigne === 'active'   && !e.ligne_active) return false;
      if (filterLigne === 'inactive' &&  e.ligne_active) return false;
      if (q) {
        const name = `${e.resident.last_name} ${e.resident.first_name ?? ''} ${e.resident.room ?? ''}`.toLowerCase();
        if (!name.includes(q) && !e.phone_number.includes(q)) return false;
      }
      return true;
    }));
  }, [entries, filterEtage, filterLigne, search]);

  const nbActive = entries.filter(e => {
    if (filterEtage !== 'all' && e.resident.floor !== filterEtage) return false;
    return e.ligne_active;
  }).length;

  // ── Mutations ─────────────────────────────────────────────────────────────

  const invalidate = () => qc.invalidateQueries({ queryKey: ['annuaire_residents'] });

  const toggleMut = useMutation({
    mutationFn: async ({ id, current }: { id: string; current: boolean }) => {
      const sb = createClient();
      const { error } = await sb.from('annuaire_residents')
        .update({ ligne_active: !current, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success('Ligne mise à jour'); },
    onError:   () => toast.error('Erreur de mise à jour'),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const sb = createClient();
      const { error } = await sb.from('annuaire_residents').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setDeleteEntry(null); toast.success('Entrée supprimée'); },
    onError:   () => toast.error('Erreur de suppression'),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1a3560]" />
    </div>
  );

  return (
    <div className="min-h-screen" style={{ background: '#dde4ee' }}>

      {/* ── Header ── */}
      <div className="relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1a3560 0%, #0e6e80 100%)' }}>
        <div className="relative z-10 max-w-5xl mx-auto px-6 py-5">
          <div className="flex items-center gap-1.5 text-white/50 text-xs mb-4">
            <Link href="/" className="hover:text-white/80 transition-colors">Accueil</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-white/90">Annuaire</span>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
              <BookUser className="h-6 w-6 text-white" strokeWidth={1.5} />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-white">Annuaire</h1>
              <p className="text-white/70 text-sm">Numéros internes des résidents</p>
            </div>
            {isAdmin && (
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl text-sm font-semibold transition-colors"
              >
                <Plus className="h-4 w-4" /> Ajouter un résident
              </button>
            )}
          </div>

          {/* Filtres dans le header */}
          <div className="flex flex-wrap gap-3 mt-5">
            {/* Étage */}
            <div className="flex bg-black/20 rounded-xl p-1 gap-1">
              {([['all','Tous'],['RDC','RDC'],['1ER','1er étage']] as const).map(([v,l]) => (
                <button key={v} onClick={() => setFilterEtage(v)}
                  className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                    filterEtage === v ? 'bg-white text-slate-800' : 'text-white/80 hover:text-white hover:bg-white/10'
                  )}>{l}</button>
              ))}
            </div>
            {/* Ligne */}
            <div className="flex bg-black/20 rounded-xl p-1 gap-1">
              {([['all','Toutes'],['active','Activée'],['inactive','Non activée']] as const).map(([v,l]) => (
                <button key={v} onClick={() => setFilterLigne(v)}
                  className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                    filterLigne === v ? 'bg-white text-slate-800' : 'text-white/80 hover:text-white hover:bg-white/10'
                  )}>{l}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Corps ── */}
      <div className="max-w-5xl mx-auto px-4 py-6 pb-20">

        {/* Barre de recherche + stats */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Rechercher un résident ou un numéro…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:border-[#0e6e80] shadow-sm"
            />
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600 bg-white rounded-xl px-4 py-2.5 border border-slate-200 shadow-sm whitespace-nowrap">
            <Wifi className="h-4 w-4 text-green-500" />
            <span className="font-semibold">{nbActive}</span> ligne{nbActive > 1 ? 's' : ''} activée{nbActive > 1 ? 's' : ''}
            <span className="text-slate-300 mx-1">·</span>
            <span className="text-slate-400">{filtered.length} affiché{filtered.length > 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Liste */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <PhoneOff className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Aucun résultat</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filtered.map(e => {
                const r = e.resident;
                const name = [r.title, r.last_name?.toUpperCase(), r.first_name].filter(Boolean).join(' ');
                return (
                  <div key={e.id}
                    className={cn(
                      'flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 transition-colors',
                      e.ligne_active && 'bg-green-50/40 hover:bg-green-50/60'
                    )}
                  >
                    {/* Étage badge */}
                    <span className={cn(
                      'text-[10px] font-bold px-2 py-1 rounded-lg flex-shrink-0 w-10 text-center',
                      r.floor === 'RDC' ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700'
                    )}>{r.floor}</span>

                    {/* Chambre */}
                    <span className="text-xs font-mono text-slate-400 w-12 shrink-0">Ch.{r.room}</span>

                    {/* Nom */}
                    <span className="font-semibold text-slate-800 flex-1 truncate text-sm">{name}</span>

                    {/* Numéro */}
                    <span className={cn(
                      'flex items-center gap-1.5 font-mono font-bold text-base px-3 py-1 rounded-xl shrink-0',
                      e.ligne_active
                        ? 'text-green-700 bg-green-100'
                        : 'text-slate-500 bg-slate-100'
                    )}>
                      <Phone className="h-3.5 w-3.5" />
                      {e.phone_number}
                    </span>

                    {/* Badge active */}
                    <span className={cn(
                      'text-[10px] font-bold px-2 py-1 rounded-full shrink-0 hidden sm:inline-flex items-center gap-1',
                      e.ligne_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'
                    )}>
                      {e.ligne_active ? <><Wifi className="h-2.5 w-2.5" /> Activée</> : <><WifiOff className="h-2.5 w-2.5" /> Non activée</>}
                    </span>

                    {/* Actions admin */}
                    {isAdmin && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => toggleMut.mutate({ id: e.id, current: e.ligne_active })}
                          title={e.ligne_active ? 'Désactiver la ligne' : 'Activer la ligne'}
                          className={cn(
                            'p-1.5 rounded-lg transition-colors',
                            e.ligne_active
                              ? 'text-green-600 hover:bg-green-100'
                              : 'text-slate-400 hover:bg-slate-100'
                          )}
                        >
                          {e.ligne_active ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
                        </button>
                        <button
                          onClick={() => setEditEntry(e)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Modifier le numéro"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteEntry(e)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Modal Ajouter ── */}
      {showAdd && (
        <AddModal
          residents={availableResidents}
          onClose={() => setShowAdd(false)}
          onSaved={() => { invalidate(); setShowAdd(false); }}
        />
      )}

      {/* ── Modal Modifier ── */}
      {editEntry && (
        <EditModal
          entry={editEntry}
          onClose={() => setEditEntry(null)}
          onSaved={() => { invalidate(); setEditEntry(null); }}
        />
      )}

      {/* ── Modal Supprimer ── */}
      {deleteEntry && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setDeleteEntry(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6"
            onClick={e => e.stopPropagation()}>
            <p className="font-bold text-slate-800 text-base mb-2">Supprimer cette entrée ?</p>
            <p className="text-sm text-slate-500 mb-6">
              {deleteEntry.resident.last_name?.toUpperCase()} {deleteEntry.resident.first_name} — {deleteEntry.phone_number}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteEntry(null)}
                className="flex-1 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors">
                Annuler
              </button>
              <button onClick={() => deleteMut.mutate(deleteEntry.id)}
                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-sm font-semibold transition-colors">
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Modal Ajouter ─────────────────────────────────────────────────────────────

function AddModal({ residents, onClose, onSaved }: {
  residents: Resident[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [search,      setSearch]      = useState('');
  const [selectedId,  setSelectedId]  = useState('');
  const [phone,       setPhone]       = useState('');
  const [active,      setActive]      = useState(false);
  const [saving,      setSaving]      = useState(false);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return residents.filter(r => {
      const txt = `${r.last_name} ${r.first_name ?? ''} ${r.room ?? ''} ${r.floor ?? ''}`.toLowerCase();
      return !q || txt.includes(q);
    }).sort((a, b) => {
      if (a.floor !== b.floor) return (a.floor ?? '') < (b.floor ?? '') ? -1 : 1;
      return roomNum(a.room) - roomNum(b.room);
    });
  }, [residents, search]);

  const handleSave = async () => {
    if (!selectedId || !phone.trim()) return;
    setSaving(true);
    try {
      const sb = createClient();
      const { error } = await sb.from('annuaire_residents').insert({
        resident_id: selectedId,
        phone_number: phone.trim(),
        ligne_active: active,
      });
      if (error) throw error;
      toast.success('Résident ajouté à l\'annuaire');
      onSaved();
    } catch { toast.error('Erreur lors de l\'ajout'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <p className="font-bold text-slate-800">Ajouter un résident</p>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4">
          {/* Recherche résident */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Résident
            </label>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Rechercher par nom, chambre…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-[#0e6e80]"
              />
            </div>
            <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">Aucun résident disponible</p>
              ) : filtered.map(r => {
                const name = [r.title, r.last_name?.toUpperCase(), r.first_name].filter(Boolean).join(' ');
                return (
                  <button key={r.id} onClick={() => setSelectedId(r.id)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors',
                      selectedId === r.id ? 'bg-[#0e6e80]/10 text-[#0e6e80]' : 'hover:bg-slate-50 text-slate-700'
                    )}
                  >
                    <span className={cn(
                      'text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0',
                      r.floor === 'RDC' ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700'
                    )}>{r.floor}</span>
                    <span className="text-xs text-slate-400 font-mono w-8 shrink-0">Ch.{r.room}</span>
                    <span className="font-medium flex-1 truncate">{name}</span>
                    {selectedId === r.id && <Check className="h-4 w-4 shrink-0 text-[#0e6e80]" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Numéro */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Numéro interne
            </label>
            <input
              type="text"
              placeholder="ex : 85 96"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-[#0e6e80] font-mono"
            />
          </div>

          {/* Ligne active */}
          <button
            onClick={() => setActive(v => !v)}
            className={cn(
              'w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-sm font-semibold',
              active
                ? 'bg-green-50 border-green-300 text-green-700'
                : 'bg-slate-50 border-slate-200 text-slate-500'
            )}
          >
            {active ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
            {active ? 'Ligne activée' : 'Ligne non activée'}
          </button>
        </div>

        <div className="px-5 pb-5 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors">
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={!selectedId || !phone.trim() || saving}
            className="flex-1 py-2.5 bg-[#1a3560] hover:bg-[#0e6e80] disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            {saving ? 'Ajout…' : 'Ajouter'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal Modifier ────────────────────────────────────────────────────────────

function EditModal({ entry, onClose, onSaved }: {
  entry: AnnuaireEntry;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [phone,  setPhone]  = useState(entry.phone_number);
  const [active, setActive] = useState(entry.ligne_active);
  const [saving, setSaving] = useState(false);

  const r = entry.resident;
  const name = [r.title, r.last_name?.toUpperCase(), r.first_name].filter(Boolean).join(' ');

  const handleSave = async () => {
    if (!phone.trim()) return;
    setSaving(true);
    try {
      const sb = createClient();
      const { error } = await sb.from('annuaire_residents')
        .update({ phone_number: phone.trim(), ligne_active: active, updated_at: new Date().toISOString() })
        .eq('id', entry.id);
      if (error) throw error;
      toast.success('Mis à jour');
      onSaved();
    } catch { toast.error('Erreur de mise à jour'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <p className="font-bold text-slate-800">Modifier</p>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg">
            <X className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        <p className="text-sm font-semibold text-slate-700 mb-4">
          {name} — Ch.{r.room}
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Numéro interne</label>
            <input
              type="text"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-[#0e6e80] font-mono"
            />
          </div>

          <button
            onClick={() => setActive(v => !v)}
            className={cn(
              'w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-sm font-semibold',
              active ? 'bg-green-50 border-green-300 text-green-700' : 'bg-slate-50 border-slate-200 text-slate-500'
            )}
          >
            {active ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
            {active ? 'Ligne activée' : 'Ligne non activée'}
          </button>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors">
            Annuler
          </button>
          <button onClick={handleSave} disabled={!phone.trim() || saving}
            className="flex-1 py-2.5 bg-[#1a3560] hover:bg-[#0e6e80] disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition-colors">
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}
