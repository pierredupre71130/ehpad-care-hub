'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, X, Check, Trash2, Kanban, Calendar, ClipboardList, StickyNote, Info, Loader2, ChevronRight } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Projet {
  id: string; titre: string; categorie: string; label_libre: string;
  statut: string; priorite: string; date_cible: string | null; objectif: string;
  created_at: string; updated_at: string;
}
interface ActionItem {
  id: string; projet_id: string; titre: string; responsable: string;
  date_echeance: string | null; fait: boolean; ordre: number; created_at: string;
}
interface Note { id: string; projet_id: string; contenu: string; created_at: string; }

// ── Constantes ────────────────────────────────────────────────────────────────

const STATUTS = [
  { key: 'A_planifier', label: 'À planifier', color: '#64748b', bg: '#f8fafc', border: '#cbd5e1' },
  { key: 'En_cours',    label: 'En cours',    color: '#2563eb', bg: '#eff6ff', border: '#93c5fd' },
  { key: 'Termine',     label: 'Terminé',     color: '#16a34a', bg: '#f0fdf4', border: '#86efac' },
  { key: 'En_pause',    label: 'En pause',    color: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
];

const CATEGORIES = ['Général', 'IDE', 'AS', 'ASH', 'ASN', 'ANIM'];

const CAT: Record<string, { color: string; bg: string }> = {
  'IDE':     { color: '#1d4ed8', bg: '#dbeafe' },
  'AS':      { color: '#15803d', bg: '#dcfce7' },
  'ASH':     { color: '#c2410c', bg: '#ffedd5' },
  'ASN':     { color: '#7e22ce', bg: '#f3e8ff' },
  'ANIM':    { color: '#be185d', bg: '#fce7f3' },
  'Général': { color: '#475569', bg: '#f1f5f9' },
};

const PRIO: Record<string, { dot: string; label: string }> = {
  'Haute':   { dot: '#dc2626', label: 'Haute' },
  'Normale': { dot: '#2563eb', label: 'Normale' },
  'Basse':   { dot: '#9ca3af', label: 'Basse' },
};

const sb = createClient();

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function isOverdue(iso: string | null) {
  if (!iso) return false;
  return new Date(iso + 'T00:00:00') < new Date(new Date().toDateString());
}

// ── Composant carte projet ────────────────────────────────────────────────────

function ProjectCard({ projet, progress, onClick }: {
  projet: Projet; progress: { total: number; done: number }; onClick: () => void;
}) {
  const cat = CAT[projet.categorie] ?? CAT['Général'];
  const prio = PRIO[projet.priorite] ?? PRIO['Normale'];
  const overdue = isOverdue(projet.date_cible);
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : null;

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl border border-slate-200 p-3 cursor-pointer hover:shadow-md hover:border-slate-300 transition-all group"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold"
          style={{ background: cat.bg, color: cat.color }}>
          {projet.categorie}
        </span>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: prio.dot }} title={prio.label} />
          <ChevronRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-slate-500 transition-colors" />
        </div>
      </div>

      <p className="font-semibold text-slate-800 text-sm leading-snug mb-1">{projet.titre}</p>

      {projet.label_libre && (
        <p className="text-[11px] text-slate-400 mb-1 truncate">{projet.label_libre}</p>
      )}

      {projet.date_cible && (
        <div className={`flex items-center gap-1 text-[11px] font-medium mb-2 ${overdue ? 'text-red-500' : 'text-slate-400'}`}>
          <Calendar className="h-3 w-3" />
          {fmtDate(projet.date_cible)}{overdue && ' ⚠'}
        </div>
      )}

      {pct !== null && (
        <div>
          <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
            <span>{progress.done}/{progress.total} actions</span>
            <span>{pct}%</span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Modale création projet ────────────────────────────────────────────────────

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [titre, setTitre] = useState('');
  const [categorie, setCategorie] = useState('Général');
  const [label, setLabel] = useState('');
  const [priorite, setPriorite] = useState('Normale');
  const [dateCible, setDateCible] = useState('');
  const [objectif, setObjectif] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titre.trim()) return;
    setSaving(true);
    const { error } = await sb.from('projets_idec').insert({
      titre: titre.trim(),
      categorie,
      label_libre: label.trim(),
      statut: 'A_planifier',
      priorite,
      date_cible: dateCible || null,
      objectif: objectif.trim(),
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Projet créé');
    onCreated();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800">Nouveau projet</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">Titre *</label>
            <input value={titre} onChange={e => setTitre(e.target.value)} required
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Ex: Formation soins de bouche IDE" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Catégorie</label>
              <select value={categorie} onChange={e => setCategorie(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Priorité</label>
              <select value={priorite} onChange={e => setPriorite(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option>Haute</option><option>Normale</option><option>Basse</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">Thème / label libre</label>
            <input value={label} onChange={e => setLabel(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Ex: Restauration, Bientraitance…" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">Date cible</label>
            <input type="date" value={dateCible} onChange={e => setDateCible(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">Objectif</label>
            <textarea value={objectif} onChange={e => setObjectif(e.target.value)} rows={2}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
              placeholder="Décrire l'objectif du projet…" />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
              Annuler
            </button>
            <button type="submit" disabled={saving || !titre.trim()}
              className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Création…' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Panneau détail projet ─────────────────────────────────────────────────────

function DetailPanel({ projetId, onClose, onDeleted, onUpdated }: {
  projetId: string; onClose: () => void; onDeleted: () => void; onUpdated: () => void;
}) {
  const [tab, setTab] = useState<'infos' | 'actions' | 'notes'>('infos');
  const qc = useQueryClient();

  const { data: projet, isLoading: loadingP } = useQuery<Projet>({
    queryKey: ['projet-detail', projetId],
    queryFn: async () => {
      const { data, error } = await sb.from('projets_idec').select('*').eq('id', projetId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: actions = [], isLoading: loadingA } = useQuery<ActionItem[]>({
    queryKey: ['projet-actions', projetId],
    queryFn: async () => {
      const { data } = await sb.from('projets_idec_actions').select('*').eq('projet_id', projetId).order('ordre').order('created_at');
      return (data ?? []) as ActionItem[];
    },
  });

  const { data: notes = [], isLoading: loadingN } = useQuery<Note[]>({
    queryKey: ['projet-notes', projetId],
    queryFn: async () => {
      const { data } = await sb.from('projets_idec_notes').select('*').eq('projet_id', projetId).order('created_at', { ascending: false });
      return (data ?? []) as Note[];
    },
  });

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['projet-detail', projetId] });
    qc.invalidateQueries({ queryKey: ['projet-actions', projetId] });
    qc.invalidateQueries({ queryKey: ['projet-notes', projetId] });
    qc.invalidateQueries({ queryKey: ['projets-idec'] });
    qc.invalidateQueries({ queryKey: ['projets-actions-summary'] });
    onUpdated();
  }, [qc, projetId, onUpdated]);

  if (loadingP) return (
    <div className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-white shadow-2xl z-40 flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
    </div>
  );
  if (!projet) return null;

  return (
    <div className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-white shadow-2xl z-40 flex flex-col" style={{ paddingBottom: 56 }}>
      {/* En-tête */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 flex-shrink-0">
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 flex-shrink-0">
          <X className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-slate-800 truncate">{projet.titre}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: (CAT[projet.categorie] ?? CAT['Général']).bg, color: (CAT[projet.categorie] ?? CAT['Général']).color }}>
              {projet.categorie}
            </span>
            {projet.label_libre && <span className="text-[11px] text-slate-400">{projet.label_libre}</span>}
          </div>
        </div>
        {/* Changement de statut rapide */}
        <select value={projet.statut} onChange={async e => {
          await sb.from('projets_idec').update({ statut: e.target.value, updated_at: new Date().toISOString() }).eq('id', projetId);
          invalidate();
        }} className="text-xs border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400 flex-shrink-0">
          {STATUTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>

      {/* Onglets */}
      <div className="flex border-b border-slate-100 flex-shrink-0">
        {([['infos', 'Infos', Info], ['actions', 'Actions', ClipboardList], ['notes', 'Notes', StickyNote]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors border-b-2 ${
              tab === key ? 'border-blue-500 text-blue-600' : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}>
            <Icon className="h-3.5 w-3.5" />{label}
          </button>
        ))}
      </div>

      {/* Contenu onglets */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'infos' && <InfosTab projet={projet} onSaved={invalidate} />}
        {tab === 'actions' && <ActionsTab projetId={projetId} actions={actions} loading={loadingA} onChanged={invalidate} />}
        {tab === 'notes' && <NotesTab projetId={projetId} notes={notes} loading={loadingN} onChanged={invalidate} />}
      </div>

      {/* Supprimer projet */}
      <div className="px-4 py-3 border-t border-slate-100 flex-shrink-0">
        <button onClick={async () => {
          if (!confirm('Supprimer ce projet et toutes ses données ?')) return;
          const { error } = await sb.from('projets_idec').delete().eq('id', projetId);
          if (error) { toast.error(error.message); return; }
          toast.success('Projet supprimé');
          onDeleted();
        }} className="w-full py-2 rounded-xl border border-red-200 text-red-500 text-sm font-semibold hover:bg-red-50 transition-colors">
          Supprimer ce projet
        </button>
      </div>
    </div>
  );
}

// ── Onglet Infos ──────────────────────────────────────────────────────────────

function InfosTab({ projet, onSaved }: { projet: Projet; onSaved: () => void }) {
  const [titre, setTitre] = useState(projet.titre);
  const [categorie, setCategorie] = useState(projet.categorie);
  const [label, setLabel] = useState(projet.label_libre);
  const [priorite, setPriorite] = useState(projet.priorite);
  const [dateCible, setDateCible] = useState(projet.date_cible ?? '');
  const [objectif, setObjectif] = useState(projet.objectif);
  const [saving, setSaving] = useState(false);

  const dirty = titre !== projet.titre || categorie !== projet.categorie || label !== projet.label_libre
    || priorite !== projet.priorite || dateCible !== (projet.date_cible ?? '') || objectif !== projet.objectif;

  const handleSave = async () => {
    if (!titre.trim()) return;
    setSaving(true);
    const { error } = await sb.from('projets_idec').update({
      titre: titre.trim(), categorie, label_libre: label.trim(),
      priorite, date_cible: dateCible || null, objectif: objectif.trim(),
      updated_at: new Date().toISOString(),
    }).eq('id', projet.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Projet mis à jour');
    onSaved();
  };

  return (
    <div className="p-4 space-y-3">
      <div>
        <label className="text-xs font-semibold text-slate-500 mb-1 block">Titre</label>
        <input value={titre} onChange={e => setTitre(e.target.value)}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1 block">Catégorie</label>
          <select value={categorie} onChange={e => setCategorie(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-500 mb-1 block">Priorité</label>
          <select value={priorite} onChange={e => setPriorite(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
            <option>Haute</option><option>Normale</option><option>Basse</option>
          </select>
        </div>
      </div>
      <div>
        <label className="text-xs font-semibold text-slate-500 mb-1 block">Thème / label libre</label>
        <input value={label} onChange={e => setLabel(e.target.value)}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="Restauration, Bientraitance…" />
      </div>
      <div>
        <label className="text-xs font-semibold text-slate-500 mb-1 block">Date cible</label>
        <input type="date" value={dateCible} onChange={e => setDateCible(e.target.value)}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
      </div>
      <div>
        <label className="text-xs font-semibold text-slate-500 mb-1 block">Objectif</label>
        <textarea value={objectif} onChange={e => setObjectif(e.target.value)} rows={4}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
          placeholder="Décrire l'objectif, le contexte…" />
      </div>
      {dirty && (
        <button onClick={handleSave} disabled={saving || !titre.trim()}
          className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
          {saving ? 'Enregistrement…' : 'Enregistrer les modifications'}
        </button>
      )}
    </div>
  );
}

// ── Onglet Actions ────────────────────────────────────────────────────────────

function ActionsTab({ projetId, actions, loading, onChanged }: {
  projetId: string; actions: ActionItem[]; loading: boolean; onChanged: () => void;
}) {
  const [newTitre, setNewTitre] = useState('');
  const [newResp, setNewResp] = useState('');
  const [newDate, setNewDate] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitre.trim()) return;
    setAdding(true);
    const { error } = await sb.from('projets_idec_actions').insert({
      projet_id: projetId, titre: newTitre.trim(),
      responsable: newResp.trim(), date_echeance: newDate || null,
      ordre: actions.length,
    });
    setAdding(false);
    if (error) { toast.error(error.message); return; }
    setNewTitre(''); setNewResp(''); setNewDate('');
    onChanged();
  };

  const toggleFait = async (action: ActionItem) => {
    await sb.from('projets_idec_actions').update({ fait: !action.fait }).eq('id', action.id);
    onChanged();
  };

  const deleteAction = async (id: string) => {
    await sb.from('projets_idec_actions').delete().eq('id', id);
    onChanged();
  };

  return (
    <div className="p-4">
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
      ) : (
        <div className="space-y-2 mb-4">
          {actions.length === 0 && (
            <p className="text-slate-400 text-sm text-center py-4">Aucune action pour le moment</p>
          )}
          {actions.map(a => (
            <div key={a.id} className={`flex items-start gap-2 p-2.5 rounded-lg border transition-colors ${a.fait ? 'bg-green-50 border-green-200' : 'bg-white border-slate-200'}`}>
              <button onClick={() => toggleFait(a)}
                className={`w-5 h-5 rounded flex-shrink-0 border-2 flex items-center justify-center transition-colors mt-0.5 ${a.fait ? 'bg-green-500 border-green-500' : 'border-slate-300 hover:border-green-400'}`}>
                {a.fait && <Check className="h-3 w-3 text-white" />}
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${a.fait ? 'line-through text-slate-400' : 'text-slate-700'}`}>{a.titre}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {a.responsable && <span className="text-[11px] text-slate-400">{a.responsable}</span>}
                  {a.date_echeance && (
                    <span className={`text-[11px] font-medium ${isOverdue(a.date_echeance) && !a.fait ? 'text-red-500' : 'text-slate-400'}`}>
                      {fmtDate(a.date_echeance)}
                    </span>
                  )}
                </div>
              </div>
              <button onClick={() => deleteAction(a.id)} className="text-slate-300 hover:text-red-400 transition-colors flex-shrink-0 mt-0.5">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleAdd} className="border border-slate-200 rounded-xl p-3 space-y-2">
        <p className="text-xs font-semibold text-slate-500">Ajouter une action</p>
        <input value={newTitre} onChange={e => setNewTitre(e.target.value)} required
          className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="Description de l'action *" />
        <div className="grid grid-cols-2 gap-2">
          <input value={newResp} onChange={e => setNewResp(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="Responsable" />
          <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <button type="submit" disabled={adding || !newTitre.trim()}
          className="w-full py-1.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1.5 transition-colors">
          <Plus className="h-3.5 w-3.5" /> Ajouter
        </button>
      </form>
    </div>
  );
}

// ── Onglet Notes ──────────────────────────────────────────────────────────────

function NotesTab({ projetId, notes, loading, onChanged }: {
  projetId: string; notes: Note[]; loading: boolean; onChanged: () => void;
}) {
  const [contenu, setContenu] = useState('');
  const [adding, setAdding] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contenu.trim()) return;
    setAdding(true);
    const { error } = await sb.from('projets_idec_notes').insert({ projet_id: projetId, contenu: contenu.trim() });
    setAdding(false);
    if (error) { toast.error(error.message); return; }
    setContenu('');
    onChanged();
  };

  return (
    <div className="p-4">
      <form onSubmit={handleAdd} className="mb-4">
        <textarea ref={textareaRef} value={contenu} onChange={e => setContenu(e.target.value)} rows={3}
          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none mb-2"
          placeholder="Idée, annotation, compte-rendu informel…" />
        <button type="submit" disabled={adding || !contenu.trim()}
          className="w-full py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1.5 transition-colors">
          <Plus className="h-3.5 w-3.5" /> Ajouter une note
        </button>
      </form>

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
      ) : (
        <div className="space-y-2">
          {notes.length === 0 && <p className="text-slate-400 text-sm text-center py-4">Aucune note pour le moment</p>}
          {notes.map(n => (
            <div key={n.id} className="bg-amber-50 border border-amber-200 rounded-xl p-3 group relative">
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{n.contenu}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-[11px] text-slate-400">
                  {new Date(n.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
                <button onClick={async () => {
                  await sb.from('projets_idec_notes').delete().eq('id', n.id);
                  onChanged();
                }} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-all">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function ProjetsIdecPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    if (profile && !isAdmin) router.push('/');
  }, [profile, isAdmin, router]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: projets = [], isLoading: loadingP } = useQuery<Projet[]>({
    queryKey: ['projets-idec'],
    queryFn: async () => {
      const { data, error } = await sb.from('projets_idec').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as Projet[];
    },
    enabled: isAdmin,
  });

  const { data: actionsSummary = [] } = useQuery<Pick<ActionItem, 'id' | 'projet_id' | 'fait'>[]>({
    queryKey: ['projets-actions-summary'],
    queryFn: async () => {
      const { data } = await sb.from('projets_idec_actions').select('id, projet_id, fait');
      return (data ?? []) as Pick<ActionItem, 'id' | 'projet_id' | 'fait'>[];
    },
    enabled: isAdmin,
  });

  const progressMap = useMemo(() => {
    const map = new Map<string, { total: number; done: number }>();
    for (const p of projets) {
      const acts = actionsSummary.filter(a => a.projet_id === p.id);
      map.set(p.id, { total: acts.length, done: acts.filter(a => a.fait).length });
    }
    return map;
  }, [projets, actionsSummary]);

  const projetsByStatut = useMemo(() => {
    const map: Record<string, Projet[]> = {};
    for (const s of STATUTS) map[s.key] = [];
    for (const p of projets) {
      if (map[p.statut]) map[p.statut].push(p);
    }
    return map;
  }, [projets]);

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['projets-idec'] });
    qc.invalidateQueries({ queryKey: ['projets-actions-summary'] });
  }, [qc]);

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen" style={{ background: '#0f1f3d', paddingBottom: 56 }}>

      {/* Header */}
      <div className="sticky top-0 z-10" style={{ background: '#0f1f3d' }}>
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/" className="text-white/50 hover:text-white/80 transition-colors text-xs">← Accueil</Link>
          <div className="flex items-center gap-2 flex-1">
            <div className="w-9 h-9 rounded-xl bg-blue-600/30 flex items-center justify-center flex-shrink-0">
              <Kanban className="h-5 w-5 text-blue-300" />
            </div>
            <div>
              <h1 className="text-white font-bold text-lg leading-none">Planification IDEC</h1>
              <p className="text-white/40 text-xs mt-0.5">{projets.length} projet{projets.length > 1 ? 's' : ''}</p>
            </div>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors">
            <Plus className="h-4 w-4" /> Nouveau projet
          </button>
        </div>
      </div>

      {/* Kanban */}
      {loadingP ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-white/40" />
        </div>
      ) : (
        <div className="max-w-7xl mx-auto px-4 pb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {STATUTS.map(statut => {
              const col = projetsByStatut[statut.key] ?? [];
              return (
                <div key={statut.key} className="flex flex-col gap-3">
                  {/* En-tête colonne */}
                  <div className="flex items-center gap-2 px-1">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: statut.color }} />
                    <span className="text-sm font-bold text-white/80">{statut.label}</span>
                    <span className="ml-auto text-xs text-white/40 font-mono">{col.length}</span>
                  </div>
                  {/* Cartes */}
                  <div className="flex flex-col gap-2 min-h-[120px]">
                    {col.map(p => (
                      <ProjectCard key={p.id} projet={p}
                        progress={progressMap.get(p.id) ?? { total: 0, done: 0 }}
                        onClick={() => setSelectedId(p.id)} />
                    ))}
                    {col.length === 0 && (
                      <div className="border-2 border-dashed border-white/10 rounded-xl h-20 flex items-center justify-center">
                        <span className="text-white/20 text-xs">Aucun projet</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Overlay + panneau détail */}
      {selectedId && (
        <>
          <div className="fixed inset-0 z-30 bg-black/30" onClick={() => setSelectedId(null)} />
          <DetailPanel
            projetId={selectedId}
            onClose={() => setSelectedId(null)}
            onDeleted={() => { setSelectedId(null); invalidate(); }}
            onUpdated={invalidate}
          />
        </>
      )}

      {/* Modale création */}
      {showCreate && (
        <CreateModal onClose={() => setShowCreate(false)} onCreated={invalidate} />
      )}
    </div>
  );
}
