'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  TestTube2, ChevronDown, ChevronUp, Plus, X, Check, Loader2,
  Printer, ChevronLeft, ChevronRight, Search, Pencil, Trash2, Save,
  Calendar, Lock, Eye,
} from 'lucide-react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { fetchColorOverrides, darkenHex, type ColorOverrides } from '@/lib/module-colors';
import { MODULES } from '@/components/dashboard/module-config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import GenerateDatesModal from './generate-dates-modal';
import { PdfCalibration, PDF_CALIBRATION_DEFAULTS, DEFAULT_CHECK_COORDS } from '@/lib/generate-bilan-pdf';
import { useModuleAccess } from '@/lib/use-module-access';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Resident {
  id: string; room: string; title: string;
  first_name: string; last_name: string;
  floor: 'RDC' | '1ER'; medecin: string | null;
  date_naissance?: string | null;
}
interface BilanReferentiel {
  id: string; code: string; label: string;
  frequence: string | null; examens: string[];
}
interface BilanSpecial {
  id: string; code: string; nom: string; indication: string | null;
}
interface PlanningBilanCell {
  id: string; resident_id: string; annee: number; mois: number;
  bilan_ref_code: string | null; extra_examens: string[];
  bilan_label: string | null; jour: number | null;
  jours: number[]; periodicite: number | null;
}
interface MedecinBilanConfig {
  id: string; medecin_name: string; jours: string[];
}
interface PoidsMesure {
  id: string; resident_id: string; date: string; poids_kg: number;
}
interface ExamCalibration {
  id: string; exam_name: string; x: number; y: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_REFS = [
  { code: 'B3', label: 'Bilan trimestriel', frequence: 'Tous les 3 mois',
    examens: ['NFS', 'Ionogramme', 'Urée', 'Créatinine'] },
  { code: 'B6', label: 'Bilan semestriel', frequence: 'Tous les 6 mois',
    examens: ['NFS', 'Ionogramme', 'Urée', 'Créatinine', 'Albuminémie', 'Bilirubine T', 'SGOT', 'SGPT', 'Gamma GT', 'PAL', 'Ferritine', 'Glycémie'] },
  { code: 'BC', label: 'Bilan complet annuel', frequence: '1 fois/an',
    examens: ['NFS', 'Ionogramme', 'Urée', 'Créatinine', 'Albuminémie', 'Bilirubine T', 'SGOT', 'SGPT', 'Gamma GT', 'PAL', 'Ferritine', 'Glycémie', 'TSH', 'Folates (Vit B9)', 'Vit B12', 'Vit D', 'Calcémie', 'EAL'] },
];

const QUICK_SPECIALS_DEFAULT = [
  { code: 'HBG', nom: 'HbA1c', indication: 'Diabète' },
  { code: 'TSH', nom: 'TSH', indication: 'Dysthyroïdie' },
  { code: 'PSA', nom: 'PSA', indication: 'Prostate' },
  { code: 'VIT D', nom: 'Vit D', indication: 'Carence' },
  { code: 'PTH', nom: 'PTH', indication: 'Parathyroïde' },
  { code: 'INR', nom: 'INR/TP', indication: 'Anticoagulant' },
  { code: 'AXIA', nom: 'Anti Xa', indication: 'HBPM' },
  { code: 'DIG', nom: 'Digoxine', indication: 'Dosage' },
  { code: 'LIT', nom: 'Lithiémie', indication: 'Lithium' },
  { code: 'FERR', nom: 'Ferritine', indication: 'Carence fer' },
  { code: 'CRP', nom: 'CRP', indication: 'Inflammation' },
];

const JOURS_SEMAINE = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MOIS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
const MOIS_FULL = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

function refColor(code: string | null) {
  if (code === 'B3') return { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300', badge: 'bg-green-200 text-green-900' };
  if (code === 'B6') return { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300', badge: 'bg-blue-200 text-blue-900' };
  if (code === 'BC') return { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300', badge: 'bg-orange-200 text-orange-900' };
  return { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-300', badge: 'bg-slate-200 text-slate-800' };
}

function cellLabel(cell: PlanningBilanCell): string {
  const parts: string[] = [];
  if (cell.bilan_ref_code) parts.push(cell.bilan_ref_code);
  const extras = (cell.extra_examens || []).map(e => e.length > 5 ? e.slice(0, 3).toUpperCase() : e.toUpperCase());
  parts.push(...extras);
  let lbl = parts.join('+');
  if (cell.periodicite && cell.periodicite > 1) lbl += `×${cell.periodicite}`;
  return lbl || '?';
}

// ─── Collapsible Section ───────────────────────────────────────────────────────

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white border border-slate-200 rounded-xl mb-3 overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-slate-50 transition-colors">
        <span className="text-slate-400">{icon}</span>
        <span className="font-semibold text-slate-700 text-sm flex-1">{title}</span>
        {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>
      {open && <div className="border-t border-slate-100 p-5">{children}</div>}
    </div>
  );
}

// ─── Médecin Jours Section ────────────────────────────────────────────────────

function MedecinJoursSection({ residents, configs, onSave }: {
  residents: Resident[];
  configs: MedecinBilanConfig[];
  onSave: (medecinName: string, jours: string[], existingId?: string) => void;
}) {
  const medecins = useMemo(() => [...new Set(residents.map(r => r.medecin).filter(Boolean) as string[])].sort(), [residents]);
  const [localJours, setLocalJours] = useState<Record<string, string[]>>({});

  useEffect(() => {
    const init: Record<string, string[]> = {};
    medecins.forEach(m => {
      const cfg = configs.find(c => c.medecin_name === m);
      init[m] = cfg?.jours ?? [];
    });
    setLocalJours(init);
  }, [medecins, configs]);

  const toggle = (med: string, jour: string) => {
    setLocalJours(prev => {
      const cur = prev[med] ?? [];
      return { ...prev, [med]: cur.includes(jour) ? cur.filter(j => j !== jour) : [...cur, jour] };
    });
  };

  return (
    <div className="space-y-3">
      {medecins.length === 0 && <p className="text-sm text-slate-400 italic">Aucun médecin renseigné dans les résidents.</p>}
      {medecins.map(med => {
        const cfg = configs.find(c => c.medecin_name === med);
        const jours = localJours[med] ?? [];
        return (
          <div key={med} className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium text-slate-700 w-40 flex-shrink-0">Dr. {med}</span>
            <div className="flex gap-1.5 flex-wrap">
              {JOURS_SEMAINE.map(j => (
                <button key={j} onClick={() => toggle(med, j)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors capitalize
                    ${jours.includes(j) ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-600 border-slate-300 hover:border-red-300'}`}>
                  {j.slice(0, 3)}
                </button>
              ))}
            </div>
            <button onClick={() => onSave(med, jours, cfg?.id)}
              className="flex items-center gap-1 px-3 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs transition-colors">
              <Save className="h-3 w-3" /> Enregistrer
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Référentiel Section ──────────────────────────────────────────────────────

function BilanReferentielSection({ refs, onCreate, onUpdate, onDelete }: {
  refs: BilanReferentiel[];
  onCreate: (d: Omit<BilanReferentiel, 'id'>) => void;
  onUpdate: (id: string, d: Partial<BilanReferentiel>) => void;
  onDelete: (id: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<BilanReferentiel>>({});
  const [newCode, setNewCode] = useState(''); const [newLabel, setNewLabel] = useState('');
  const [newFreq, setNewFreq] = useState(''); const [newExamens, setNewExamens] = useState('');
  const [adding, setAdding] = useState(false);

  const startEdit = (r: BilanReferentiel) => { setEditingId(r.id); setEditData({ ...r }); };
  const saveEdit = () => { if (editingId) { onUpdate(editingId, editData); setEditingId(null); } };

  return (
    <div className="space-y-3">
      {refs.map(r => {
        const c = refColor(r.code);
        if (editingId === r.id) return (
          <div key={r.id} className="border border-blue-200 rounded-xl p-4 bg-blue-50 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <Input value={editData.code ?? ''} onChange={e => setEditData(d => ({ ...d, code: e.target.value }))} placeholder="Code" className="h-8 text-sm" />
              <Input value={editData.label ?? ''} onChange={e => setEditData(d => ({ ...d, label: e.target.value }))} placeholder="Libellé" className="h-8 text-sm" />
              <Input value={editData.frequence ?? ''} onChange={e => setEditData(d => ({ ...d, frequence: e.target.value }))} placeholder="Fréquence" className="h-8 text-sm" />
            </div>
            <Input value={(editData.examens ?? []).join(', ')}
              onChange={e => setEditData(d => ({ ...d, examens: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
              placeholder="Examens (séparés par des virgules)" className="h-8 text-sm" />
            <div className="flex gap-2">
              <button onClick={saveEdit} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs hover:bg-blue-700"><Check className="h-3 w-3" /> Enregistrer</button>
              <button onClick={() => setEditingId(null)} className="px-3 py-1.5 rounded-lg bg-white border text-xs text-slate-600 hover:bg-slate-50">Annuler</button>
            </div>
          </div>
        );
        return (
          <div key={r.id} className={`border ${c.border} rounded-xl p-4 ${c.bg}`}>
            <div className="flex items-center gap-3">
              <span className={`font-bold text-sm px-2.5 py-1 rounded-lg ${c.badge}`}>{r.code}</span>
              <div className="flex-1">
                <div className="font-semibold text-sm text-slate-800">{r.label}</div>
                {r.frequence && <div className="text-xs text-slate-500">{r.frequence}</div>}
              </div>
              <span className="text-xs text-slate-500">{r.examens.length} examens</span>
              <button onClick={() => startEdit(r)} className="p-1.5 rounded-lg hover:bg-white/60 text-slate-500 transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
              <button onClick={() => onDelete(r.id)} className="p-1.5 rounded-lg hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {r.examens.map(e => <span key={e} className="text-xs bg-white/70 px-2 py-0.5 rounded-full text-slate-600">{e}</span>)}
            </div>
          </div>
        );
      })}
      {adding ? (
        <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <Input value={newCode} onChange={e => setNewCode(e.target.value.toUpperCase())} placeholder="Code (ex: B3)" className="h-8 text-sm" />
            <Input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Libellé" className="h-8 text-sm" />
            <Input value={newFreq} onChange={e => setNewFreq(e.target.value)} placeholder="Fréquence" className="h-8 text-sm" />
          </div>
          <Input value={newExamens} onChange={e => setNewExamens(e.target.value)} placeholder="Examens séparés par des virgules" className="h-8 text-sm" />
          <div className="flex gap-2">
            <button onClick={() => {
              if (!newCode || !newLabel) return;
              onCreate({ code: newCode, label: newLabel, frequence: newFreq || null, examens: newExamens.split(',').map(s => s.trim()).filter(Boolean) });
              setNewCode(''); setNewLabel(''); setNewFreq(''); setNewExamens(''); setAdding(false);
            }} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs hover:bg-blue-700"><Check className="h-3 w-3" /> Ajouter</button>
            <button onClick={() => setAdding(false)} className="px-3 py-1.5 rounded-lg bg-white border text-xs text-slate-600">Annuler</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-600 text-sm transition-colors w-full justify-center">
          <Plus className="h-4 w-4" /> Ajouter un référentiel
        </button>
      )}
    </div>
  );
}

// ─── Bilans Spéciaux Section ──────────────────────────────────────────────────

function BilanSpeciauxSection({ specials, onCreate, onDelete }: {
  specials: BilanSpecial[];
  onCreate: (d: Omit<BilanSpecial, 'id'>) => void;
  onDelete: (id: string) => void;
}) {
  const [newCode, setNewCode] = useState('');
  const [newNom, setNewNom] = useState('');
  const [newInd, setNewInd] = useState('');
  const existingCodes = useMemo(() => specials.map(s => s.code), [specials]);

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs text-slate-500 mb-2 font-medium">Ajout rapide :</p>
        <div className="flex flex-wrap gap-2">
          {QUICK_SPECIALS_DEFAULT.filter(q => !existingCodes.includes(q.code)).map(q => (
            <button key={q.code} onClick={() => onCreate({ code: q.code, nom: q.nom, indication: q.indication })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 hover:bg-blue-100 border border-slate-200 hover:border-blue-300 text-xs text-slate-700 hover:text-blue-700 transition-colors">
              <Plus className="h-3 w-3" /> {q.code} <span className="text-slate-400">— {q.indication}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        {specials.map(s => (
          <div key={s.id} className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            <span className="font-bold text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full w-16 text-center">{s.code}</span>
            <span className="text-sm font-medium text-slate-700 flex-1">{s.nom}</span>
            {s.indication && <span className="text-xs text-slate-400 italic">{s.indication}</span>}
            <button onClick={() => onDelete(s.id)} className="p-1 rounded hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        ))}
      </div>
      <div className="flex gap-2 pt-1">
        <Input value={newCode} onChange={e => setNewCode(e.target.value.toUpperCase())} placeholder="Code" className="h-8 text-sm w-24" />
        <Input value={newNom} onChange={e => setNewNom(e.target.value)} placeholder="Nom" className="h-8 text-sm w-40" />
        <Input value={newInd} onChange={e => setNewInd(e.target.value)} placeholder="Indication" className="h-8 text-sm flex-1" />
        <button onClick={() => {
          if (!newCode || !newNom) return;
          onCreate({ code: newCode, nom: newNom, indication: newInd || null });
          setNewCode(''); setNewNom(''); setNewInd('');
        }} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs hover:bg-blue-700 flex-shrink-0">
          <Plus className="h-3 w-3" /> Ajouter
        </button>
      </div>
    </div>
  );
}

// ─── Cell Editor Modal ────────────────────────────────────────────────────────

function CellEditorModal({ resident, mois, annee, existing, refs, specials, onSave, onDelete, onClose }: {
  resident: Resident; mois: number; annee: number;
  existing: PlanningBilanCell | null;
  refs: BilanReferentiel[]; specials: BilanSpecial[];
  onSave: (data: Omit<PlanningBilanCell, 'id'>) => void;
  onDelete: () => void; onClose: () => void;
}) {
  const [refCode, setRefCode] = useState<string | null>(existing?.bilan_ref_code ?? null);
  const [extras, setExtras] = useState<string[]>(existing?.extra_examens ?? []);
  const [periodicite, setPeriodicite] = useState(existing?.periodicite ?? 1);
  const [jours, setJours] = useState<number[]>(existing?.jours?.length ? existing.jours : existing?.jour ? [existing.jour] : []);
  const [jourInputs, setJourInputs] = useState<string[]>(
    existing?.jours?.length ? existing.jours.map(String) : existing?.jour ? [String(existing.jour)] : ['']
  );
  const [extraInput, setExtraInput] = useState('');

  useEffect(() => {
    const count = periodicite > 1 ? periodicite : 1;
    setJourInputs(prev => {
      const next = [...prev];
      while (next.length < count) next.push('');
      return next.slice(0, count);
    });
  }, [periodicite]);

  const addExtra = (code: string) => { if (!extras.includes(code)) setExtras(e => [...e, code]); };
  const removeExtra = (code: string) => setExtras(e => e.filter(x => x !== code));

  const handleSave = () => {
    const joursNum = jourInputs.map(j => parseInt(j)).filter(j => !isNaN(j) && j >= 1 && j <= 31);
    const parts: string[] = [];
    if (refCode) parts.push(refCode);
    parts.push(...extras.map(e => e.length > 5 ? e.slice(0, 3).toUpperCase() : e.toUpperCase()));
    let label = parts.join('+');
    if (periodicite > 1) label += `×${periodicite}`;
    onSave({
      resident_id: resident.id, annee, mois,
      bilan_ref_code: refCode, extra_examens: extras,
      bilan_label: label, periodicite: periodicite > 1 ? periodicite : null,
      jour: joursNum[0] ?? null, jours: joursNum,
    });
  };

  const c = refColor(refCode);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <TestTube2 className="h-4 w-4 text-red-500" />
            {resident.title} {resident.last_name} {resident.first_name}
            <span className="text-slate-400 font-normal">— {MOIS_FULL[mois - 1]} {annee}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Référentiel */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Référentiel</p>
            <div className="flex flex-wrap gap-2">
              {refs.map(r => {
                const rc = refColor(r.code);
                const selected = refCode === r.code;
                return (
                  <button key={r.code} onClick={() => setRefCode(selected ? null : r.code)}
                    className={`px-3 py-1.5 rounded-lg border text-sm font-semibold transition-all ${selected ? `${rc.bg} ${rc.text} ${rc.border} ring-2 ring-offset-1` : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                    {r.code}
                    <span className="font-normal text-xs ml-1 opacity-70">{r.examens.length} ex.</span>
                  </button>
                );
              })}
              <button onClick={() => setRefCode(null)}
                className={`px-3 py-1.5 rounded-lg border text-sm transition-all ${refCode === null ? 'bg-slate-200 text-slate-700 border-slate-300' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'}`}>
                Aucun
              </button>
            </div>
            {refCode && (() => {
              const r = refs.find(r => r.code === refCode);
              return r ? (
                <div className={`mt-2 px-3 py-2 rounded-lg ${c.bg} text-xs text-slate-600`}>
                  {r.examens.join(' · ')}
                </div>
              ) : null;
            })()}
          </div>

          {/* Examens supplémentaires */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Examens supplémentaires</p>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {specials.map(s => (
                <button key={s.code} onClick={() => extras.includes(s.code) ? removeExtra(s.code) : addExtra(s.code)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${extras.includes(s.code) ? 'bg-purple-100 text-purple-800 border-purple-300' : 'bg-white text-slate-600 border-slate-200 hover:border-purple-300'}`}>
                  {s.code}
                </button>
              ))}
            </div>
            {extras.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {extras.map(e => (
                  <span key={e} className="flex items-center gap-1 bg-purple-100 text-purple-800 text-xs px-2.5 py-0.5 rounded-full">
                    {e}
                    <button onClick={() => removeExtra(e)}><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input value={extraInput} onChange={e => setExtraInput(e.target.value.toUpperCase())}
                placeholder="Autre examen..." className="h-8 text-sm flex-1"
                onKeyDown={e => { if (e.key === 'Enter' && extraInput) { addExtra(extraInput); setExtraInput(''); } }} />
              <button onClick={() => { if (extraInput) { addExtra(extraInput); setExtraInput(''); } }}
                className="px-3 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm transition-colors">
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Périodicité */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Périodicité par mois</p>
            <div className="flex gap-2">
              {[1, 2, 3, 4].map(n => (
                <button key={n} onClick={() => setPeriodicite(n)}
                  className={`px-4 py-1.5 rounded-lg border text-sm font-medium transition-colors ${periodicite === n ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}`}>
                  {n === 1 ? '1×' : `${n}×/mois`}
                </button>
              ))}
            </div>
          </div>

          {/* Jours */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              {periodicite > 1 ? `${periodicite} jours dans le mois` : 'Jour dans le mois (optionnel)'}
            </p>
            <div className="flex gap-2 flex-wrap">
              {jourInputs.map((j, i) => (
                <div key={i} className="flex items-center gap-1">
                  {periodicite > 1 && <span className="text-xs text-slate-400">J{i + 1}</span>}
                  <Input type="number" min={1} max={31} value={j}
                    onChange={e => setJourInputs(prev => { const n = [...prev]; n[i] = e.target.value; return n; })}
                    placeholder="j" className="h-8 w-16 text-sm text-center" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          {existing ? (
            <button onClick={onDelete} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-red-600 hover:bg-red-50 text-sm transition-colors">
              <Trash2 className="h-4 w-4" /> Supprimer
            </button>
          ) : <div />}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border text-sm text-slate-600 hover:bg-slate-50 transition-colors">Annuler</button>
            <button onClick={handleSave}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 transition-colors">
              <Check className="h-4 w-4" /> Enregistrer
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Planning Grid ─────────────────────────────────────────────────────────────

function PlanningGrid({ residents, cells, refs, specials, annee, floor, onFloorChange, onCellSave, onCellDelete, onMonthClick }: {
  residents: Resident[]; cells: PlanningBilanCell[];
  refs: BilanReferentiel[]; specials: BilanSpecial[];
  annee: number; floor: 'RDC' | '1ER';
  onFloorChange: (f: 'RDC' | '1ER') => void;
  onCellSave: (data: Omit<PlanningBilanCell, 'id'>, existingId?: string) => void;
  onCellDelete: (id: string) => void;
  onMonthClick: (mois: number) => void;
}) {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ resident: Resident; mois: number } | null>(null);

  const filtered = useMemo(() => {
    const base = residents.filter(r => r.floor === floor)
      .sort((a, b) => parseInt(a.room || '0') - parseInt(b.room || '0'));
    if (!search) return base;
    const q = search.toLowerCase();
    return base.filter(r => `${r.last_name} ${r.first_name} ${r.room}`.toLowerCase().includes(q));
  }, [residents, floor, search]);

  const cellMap = useMemo(() => {
    const map: Record<string, PlanningBilanCell> = {};
    cells.forEach(c => { map[`${c.resident_id}_${c.mois}`] = c; });
    return map;
  }, [cells]);

  // Nombre de bilans planifiés par mois (tous étages)
  const countByMonth = useMemo(() => {
    const counts: Record<number, number> = {};
    cells.forEach(c => { counts[c.mois] = (counts[c.mois] || 0) + 1; });
    return counts;
  }, [cells]);

  const currentMonth = new Date().getFullYear() === annee ? new Date().getMonth() + 1 : null;

  const handlePrint = () => {
    const refColors: Record<string, string> = { B3: '#dcfce7', B6: '#dbeafe', BC: '#ffedd5' };
    const monthsHtml = MOIS.map((m, i) => {
      const isCur = i + 1 === currentMonth;
      return `<th style="padding:4px;text-align:center;font-size:9px;min-width:55px;${isCur ? 'background:#3b82f6;color:white;' : 'background:#475569;color:#e2e8f0;'}border-right:1px solid #94a3b8;">${m}</th>`;
    }).join('');
    const rows = filtered.map((r, idx) => {
      const cellsHtml = Array.from({ length: 12 }, (_, i) => {
        const cell = cellMap[`${r.id}_${i + 1}`];
        const isCur = i + 1 === currentMonth;
        if (!cell) return `<td style="padding:3px;text-align:center;${isCur ? 'background:#eff6ff;' : ''}border-right:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;color:#cbd5e1;font-size:8px;">·</td>`;
        const bg = refColors[cell.bilan_ref_code ?? ''] ?? '#f1f5f9';
        return `<td style="padding:3px;text-align:center;background:${bg};${isCur ? 'border-left:2px solid #3b82f6;border-right:2px solid #3b82f6;' : 'border-right:1px solid #e2e8f0;'}border-bottom:1px solid #e2e8f0;"><div style="font-size:9px;font-weight:600;">${cellLabel(cell)}</div></td>`;
      }).join('');
      return `<tr style="background:${idx % 2 === 0 ? '#fff' : '#f8fafc'};"><td style="padding:4px 6px;font-size:9px;font-weight:600;white-space:nowrap;border-right:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;"><span style="color:#94a3b8;margin-right:4px;">${r.room}</span>${(r.last_name || '').toUpperCase()} ${r.first_name || ''}</td>${cellsHtml}</tr>`;
    }).join('');
    const legend = `<div style="display:flex;gap:10px;margin-bottom:8px;font-size:9px;align-items:center;"><span style="font-weight:600;color:#475569;">Légende :</span><span style="display:flex;align-items:center;gap:3px;"><span style="display:inline-block;width:10px;height:10px;background:#dcfce7;border:1px solid #86efac;border-radius:2px;"></span> B3 Trimestriel</span><span style="display:flex;align-items:center;gap:3px;"><span style="display:inline-block;width:10px;height:10px;background:#dbeafe;border:1px solid #93c5fd;border-radius:2px;"></span> B6 Semestriel</span><span style="display:flex;align-items:center;gap:3px;"><span style="display:inline-block;width:10px;height:10px;background:#ffedd5;border:1px solid #fdba74;border-radius:2px;"></span> BC Complet</span></div>`;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Planning bilans — ${floor} ${annee}</title><style>@page{size:A4 landscape;margin:8mm;}*{box-sizing:border-box;margin:0;padding:0;}body{font-family:system-ui,sans-serif;}table{width:100%;border-collapse:collapse;}h1{font-size:12px;font-weight:700;margin-bottom:6px;color:#1e293b;}</style></head><body><h1>Planning annuel des bilans sanguins — ${floor} — ${annee}</h1>${legend}<table><thead><tr><th style="background:#334155;color:white;padding:4px 8px;text-align:left;font-size:10px;border-right:1px solid #475569;min-width:120px;">Résident</th>${monthsHtml}</tr></thead><tbody>${rows}</tbody></table></body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;border:none;opacity:0;';
    document.body.appendChild(iframe);
    iframe.onload = () => { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); setTimeout(() => { document.body.removeChild(iframe); URL.revokeObjectURL(url); }, 2000); };
    iframe.src = url;
  };

  const editingCell = editing ? cellMap[`${editing.resident.id}_${editing.mois}`] ?? null : null;

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm flex-1 max-w-xs">
          <Search className="h-4 w-4 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un résident…"
            className="text-sm outline-none bg-transparent flex-1 text-slate-700" />
        </div>
        <div className="flex-1" />
        {/* Legend */}
        <div className="flex items-center gap-2 text-xs">
          {[{ code: 'B3', label: 'Trimestriel', bg: 'bg-green-100', border: 'border-green-300', text: 'text-green-800' },
            { code: 'B6', label: 'Semestriel', bg: 'bg-blue-100', border: 'border-blue-300', text: 'text-blue-800' },
            { code: 'BC', label: 'Complet', bg: 'bg-orange-100', border: 'border-orange-300', text: 'text-orange-800' },
          ].map(({ code, label, bg, border, text }) => (
            <span key={code} className={`flex items-center gap-1 px-2 py-0.5 rounded-md border ${bg} ${border} ${text} font-medium`}>
              <span className={`w-2.5 h-2.5 rounded-sm border ${bg} ${border} inline-block`} />
              {code} — {label}
            </span>
          ))}
        </div>
        <button onClick={handlePrint} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-sm transition-colors shadow-sm">
          <Printer className="h-3.5 w-3.5" /> Imprimer
        </button>
        {(['RDC', '1ER'] as const).map(f => (
          <button key={f} onClick={() => onFloorChange(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${floor === f ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {f}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-slate-700 text-white">
              <th className="sticky left-0 bg-slate-800 text-left px-3 py-2.5 font-semibold border-r border-slate-600 min-w-44">Résident</th>
              {MOIS.map((m, i) => {
                const moisNum = i + 1;
                const isCur = moisNum === currentMonth;
                const count = countByMonth[moisNum] || 0;
                return (
                  <th key={m} className={`px-1 py-1.5 text-center min-w-[68px] ${isCur ? 'bg-red-600 text-white' : ''}`}>
                    <button
                      onClick={() => onMonthClick(moisNum)}
                      className={`w-full flex flex-col items-center gap-0.5 px-1 py-1 rounded-lg transition-colors ${
                        isCur ? 'hover:bg-red-700' : 'hover:bg-slate-600'
                      }`}
                      title={`${MOIS_FULL[i]} — ${count} bilan(s) planifié(s). Cliquer pour gérer.`}
                    >
                      <span className="font-medium text-xs">{m}</span>
                      {count > 0 && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                          isCur ? 'bg-white/20 text-white' : 'bg-slate-500 text-slate-200'
                        }`}>
                          {count}
                        </span>
                      )}
                      {count === 0 && (
                        <span className="opacity-0 text-[10px]">·</span>
                      )}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 && (
              <tr><td colSpan={13} className="text-center py-8 text-slate-400 text-sm italic">Aucun résident trouvé</td></tr>
            )}
            {filtered.map((r, idx) => (
              <tr key={r.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                <td className="sticky left-0 px-3 py-2 font-medium text-slate-700 border-r border-slate-200 bg-inherit whitespace-nowrap">
                  <span className="text-slate-400 mr-1.5 text-[11px]">{r.room}</span>
                  {(r.last_name || '').toUpperCase()} {r.first_name}
                </td>
                {Array.from({ length: 12 }, (_, i) => {
                  const mois = i + 1;
                  const cell = cellMap[`${r.id}_${mois}`];
                  const isCur = mois === currentMonth;
                  if (!cell) return (
                    <td key={mois} className={`px-1 py-1 text-center ${isCur ? 'bg-red-50 border-x-2 border-red-300' : ''}`}>
                      <button onClick={() => setEditing({ resident: r, mois })}
                        className="w-full h-8 rounded-lg border border-dashed border-slate-200 hover:border-blue-400 hover:bg-blue-50 text-slate-300 hover:text-blue-400 transition-colors flex items-center justify-center">
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  );
                  const c = refColor(cell.bilan_ref_code);
                  return (
                    <td key={mois} className={`px-1 py-1 text-center ${isCur ? 'border-x-2 border-red-400' : ''}`}>
                      <button onClick={() => setEditing({ resident: r, mois })}
                        className={`w-full px-1.5 py-1 rounded-lg border ${c.bg} ${c.border} hover:opacity-80 transition-opacity`}>
                        <div className={`text-[11px] font-bold leading-tight ${c.text}`}>{cellLabel(cell)}</div>
                        {cell.jours?.length > 0 ? (
                          <div className={`text-[10px] font-medium leading-tight mt-0.5 ${c.text} opacity-80`}>
                            {cell.jours.map((j: number) => `${j}`).join(' · ')}
                          </div>
                        ) : (
                          <div className="text-[9px] text-slate-400 leading-tight mt-0.5">—</div>
                        )}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <CellEditorModal
          resident={editing.resident} mois={editing.mois} annee={annee}
          existing={editingCell} refs={refs} specials={specials}
          onSave={(data) => { onCellSave(data, editingCell?.id); setEditing(null); }}
          onDelete={() => { if (editingCell) onCellDelete(editingCell.id); setEditing(null); }}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

// ── Network background (header) ───────────────────────────────────────────────

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

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function BilansSanguinsPage() {
  const qc = useQueryClient();
  const supabase = createClient();
  const access = useModuleAccess('bilansSanguins');
  const readOnly = access === 'read';
  const [annee, setAnnee] = useState(new Date().getFullYear());
  const [floor, setFloor] = useState<'RDC' | '1ER'>('RDC');
  const [generateModal, setGenerateModal] = useState<{ mois: number } | null>(null);
  const [calibPwdTarget, setCalibPwdTarget] = useState<string | null>(null);
  const [calibPwdInput, setCalibPwdInput] = useState('');
  const [calibPwdError, setCalibPwdError] = useState(false);

  const { data: colorOverrides = {} } = useQuery<ColorOverrides>({
    queryKey: ['settings', 'module_colors'],
    queryFn: fetchColorOverrides,
    staleTime: 30000,
  });
  const bilansModule = MODULES.find(m => m.id === 'bilansSanguins');
  const colorFrom = colorOverrides['bilansSanguins']?.from ?? bilansModule?.cardFrom ?? '#d84040';
  const colorTo   = colorOverrides['bilansSanguins']?.to   ?? bilansModule?.cardTo   ?? '#b01818';

  const openCalibWithPassword = (href: string) => {
    setCalibPwdInput('');
    setCalibPwdError(false);
    setCalibPwdTarget(href);
  };

  const handleCalibPwdSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (calibPwdInput === 'mapad2022') {
      sessionStorage.setItem('ehpad_admin_unlocked', 'true');
      window.location.href = calibPwdTarget!;
    } else {
      setCalibPwdError(true);
      setCalibPwdInput('');
    }
  };

  // ── Queries ──
  const { data: residents = [] } = useQuery<Resident[]>({
    queryKey: ['residents'],
    queryFn: async () => {
      const { data, error } = await supabase.from('residents').select('*').eq('archived', false).order('room');
      if (error) throw new Error(error.message);
      return data as Resident[];
    },
  });

  const { data: refs = [] } = useQuery<BilanReferentiel[]>({
    queryKey: ['bilan_referentiel'],
    queryFn: async () => {
      const { data, error } = await supabase.from('bilan_referentiel').select('*').order('created_at');
      if (error) throw new Error(error.message);
      return data as BilanReferentiel[];
    },
  });

  const { data: specials = [] } = useQuery<BilanSpecial[]>({
    queryKey: ['bilan_special'],
    queryFn: async () => {
      const { data, error } = await supabase.from('bilan_special').select('*').order('created_at');
      if (error) throw new Error(error.message);
      return data as BilanSpecial[];
    },
  });

  const { data: cells = [] } = useQuery<PlanningBilanCell[]>({
    queryKey: ['planning_bilan_cell', annee],
    queryFn: async () => {
      const { data, error } = await supabase.from('planning_bilan_cell').select('*').eq('annee', annee);
      if (error) throw new Error(error.message);
      return data as PlanningBilanCell[];
    },
  });

  const { data: medecinConfigs = [] } = useQuery<MedecinBilanConfig[]>({
    queryKey: ['medecin_bilan_config'],
    queryFn: async () => {
      const { data, error } = await supabase.from('medecin_bilan_config').select('*');
      if (error) throw new Error(error.message);
      return data as MedecinBilanConfig[];
    },
  });

  const { data: mesures = [] } = useQuery<PoidsMesure[]>({
    queryKey: ['poids'],
    queryFn: async () => {
      const pageSize = 1000;
      let all: PoidsMesure[] = [];
      let page = 0;
      while (true) {
        const { data, error } = await supabase
          .from('poids_mesure').select('*').order('date')
          .range(page * pageSize, (page + 1) * pageSize - 1);
        if (error) throw new Error(error.message);
        all = all.concat((data ?? []) as PoidsMesure[]);
        if (!data || data.length < pageSize) break;
        page++;
      }
      return all;
    },
    staleTime: 60_000,
  });

  const { data: pdfCalib } = useQuery<PdfCalibration | null>({
    queryKey: ['pdf_calibration'],
    queryFn: async () => {
      const { data, error } = await supabase.from('pdf_calibration').select('*').limit(1).single();
      if (error) return null;
      return { ...PDF_CALIBRATION_DEFAULTS, ...data } as PdfCalibration;
    },
  });

  const { data: examCalibRows = [] } = useQuery<ExamCalibration[]>({
    queryKey: ['exam_calibration'],
    queryFn: async () => {
      const { data, error } = await supabase.from('exam_calibration').select('*');
      if (error) return [];
      return data as ExamCalibration[];
    },
  });

  const examCoords = useMemo(() => {
    if (examCalibRows.length === 0) return DEFAULT_CHECK_COORDS;
    const map: Record<string, [number, number]> = { ...DEFAULT_CHECK_COORDS };
    examCalibRows.forEach(r => { map[r.exam_name] = [r.x, r.y]; });
    return map;
  }, [examCalibRows]);

  // ── Mutations ──
  const createRef = useMutation({
    mutationFn: async (d: Omit<BilanReferentiel, 'id'>) => { const { error } = await supabase.from('bilan_referentiel').insert(d); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bilan_referentiel'] }); toast.success('Référentiel créé'); },
    onError: (e: Error) => toast.error(e.message),
  });
  const updateRef = useMutation({
    mutationFn: async ({ id, ...d }: Partial<BilanReferentiel> & { id: string }) => { const { error } = await supabase.from('bilan_referentiel').update(d).eq('id', id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bilan_referentiel'] }); toast.success('Référentiel modifié'); },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteRef = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('bilan_referentiel').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bilan_referentiel'] }); toast.success('Référentiel supprimé'); },
    onError: (e: Error) => toast.error(e.message),
  });
  const createSpecial = useMutation({
    mutationFn: async (d: Omit<BilanSpecial, 'id'>) => { const { error } = await supabase.from('bilan_special').insert(d); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bilan_special'] }); toast.success('Bilan spécial ajouté'); },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteSpecial = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('bilan_special').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bilan_special'] }); toast.success('Bilan spécial supprimé'); },
    onError: (e: Error) => toast.error(e.message),
  });
  const saveMedecinConfig = useMutation({
    mutationFn: async ({ name, jours, existingId }: { name: string; jours: string[]; existingId?: string }) => {
      if (existingId) { const { error } = await supabase.from('medecin_bilan_config').update({ jours }).eq('id', existingId); if (error) throw error; }
      else { const { error } = await supabase.from('medecin_bilan_config').insert({ medecin_name: name, jours }); if (error) throw error; }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['medecin_bilan_config'] }); toast.success('Configuration enregistrée'); },
    onError: (e: Error) => toast.error(e.message),
  });
  const saveCell = useMutation({
    mutationFn: async ({ data, existingId }: { data: Omit<PlanningBilanCell, 'id'>; existingId?: string }) => {
      if (existingId) { const { error } = await supabase.from('planning_bilan_cell').update(data).eq('id', existingId); if (error) throw error; }
      else { const { error } = await supabase.from('planning_bilan_cell').insert(data); if (error) throw error; }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['planning_bilan_cell', annee] }); toast.success('Bilan enregistré'); },
    onError: (e: Error) => toast.error(e.message),
  });
  const deleteCell = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('planning_bilan_cell').delete().eq('id', id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['planning_bilan_cell', annee] }); toast.success('Bilan supprimé'); },
    onError: (e: Error) => toast.error(e.message),
  });

  // ── Modal handlers ──
  const handleModalSave = async (results: { cellId: string; jours: number[] }[]) => {
    for (const { cellId, jours } of results) {
      const jour = jours[0] ?? null;
      await supabase.from('planning_bilan_cell').update({ jours, jour }).eq('id', cellId);
    }
    qc.invalidateQueries({ queryKey: ['planning_bilan_cell', annee] });
    toast.success('Dates enregistrées');
  };

  const handleModalClear = async (results: { cellId: string; jours: number[] }[]) => {
    for (const { cellId } of results) {
      await supabase.from('planning_bilan_cell').update({ jours: [], jour: null }).eq('id', cellId);
    }
    qc.invalidateQueries({ queryKey: ['planning_bilan_cell', annee] });
    toast.success('Dates effacées');
  };

  // Cells pour le mois du modal
  const cellsForModal = useMemo(() => {
    if (!generateModal) return [];
    return cells.filter(c => c.mois === generateModal.mois);
  }, [cells, generateModal]);

  return (
    <>
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
                <span className="text-white/90">Bilans Sanguins</span>
              </div>

              {/* Icon + title + controls */}
              <div className="flex flex-wrap items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
                  <TestTube2 className="h-6 w-6 text-white" strokeWidth={1.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-2xl font-bold text-white">Bilans Sanguins</h1>
                  <p className="text-white/70 text-sm hidden sm:block">Planning annuel · {residents.length} résidents</p>
                </div>

                {/* Year navigation */}
                <div className="flex items-center gap-1 bg-black/20 rounded-xl px-2 py-1">
                  <button onClick={() => setAnnee(a => a - 1)}
                    className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="font-bold text-white text-sm w-12 text-center">{annee}</span>
                  <button onClick={() => setAnnee(a => a + 1)}
                    className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                {/* Calibration buttons */}
                <button
                  onClick={() => openCalibWithPassword('/calibration-pdf-bilan')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/20 hover:bg-white/20 text-white text-xs font-medium transition-colors">
                  <Lock className="h-3 w-3 opacity-70" /> Calibration PDF
                </button>
                <button
                  onClick={() => openCalibWithPassword('/calibration-examens')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/20 hover:bg-white/20 text-white text-xs font-medium transition-colors">
                  <Lock className="h-3 w-3 opacity-70" /> Calibration examens
                </button>
              </div>
            </div>
          </div>

          {/* ── Contenu ── */}
          <div className="max-w-6xl mx-auto px-6 py-6">

            {readOnly && (
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 mb-4 text-sm text-blue-700 font-medium">
                <Eye className="h-4 w-4 flex-shrink-0" />
                Vous consultez cette page en lecture seule.
              </div>
            )}

            <Section title="Jours de prélèvement par médecin" icon={<Calendar className="h-4 w-4" />}>
              <MedecinJoursSection residents={residents} configs={medecinConfigs}
                onSave={readOnly ? () => {} : (name, jours, existingId) => saveMedecinConfig.mutate({ name, jours, existingId })} />
            </Section>

            <Section title="Référentiel des bilans biologiques" icon={<TestTube2 className="h-4 w-4" />}>
              <BilanReferentielSection refs={refs}
                onCreate={readOnly ? () => {} : d => createRef.mutate(d)}
                onUpdate={readOnly ? () => {} : (id, d) => updateRef.mutate({ id, ...d })}
                onDelete={readOnly ? () => {} : id => deleteRef.mutate(id)} />
            </Section>

            <Section title="Bilans spéciaux" icon={<TestTube2 className="h-4 w-4" />}>
              <BilanSpeciauxSection specials={specials}
                onCreate={readOnly ? () => {} : d => createSpecial.mutate(d)}
                onDelete={readOnly ? () => {} : id => deleteSpecial.mutate(id)} />
            </Section>

            {/* Planning annuel */}
            <div className="bg-white rounded-2xl border border-white/60 shadow-sm p-5">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-bold text-slate-800 flex items-center gap-2">
                  <TestTube2 className="h-5 w-5 text-red-500" /> Planning annuel des bilans
                </h2>
                <p className="text-xs text-slate-400 hidden sm:block">Cliquez sur un mois pour gérer les dates</p>
              </div>
              <PlanningGrid
                residents={residents} cells={cells} refs={refs} specials={specials}
                annee={annee} floor={floor} onFloorChange={setFloor}
                onCellSave={readOnly ? () => {} : (data, existingId) => saveCell.mutate({ data, existingId })}
                onCellDelete={readOnly ? () => {} : id => deleteCell.mutate(id)}
                onMonthClick={mois => setGenerateModal({ mois })}
              />
            </div>
          </div>

        </div>{/* fin z-index: 1 */}
      </div>

      {/* GenerateDatesModal */}
      {generateModal && (
        <GenerateDatesModal
          mois={generateModal.mois}
          annee={annee}
          cellsForMonth={cellsForModal}
          allCells={cells}
          residents={residents}
          medecinConfigs={medecinConfigs}
          referentiels={refs}
          mesures={mesures}
          calibration={pdfCalib ?? PDF_CALIBRATION_DEFAULTS}
          examCoords={examCoords}
          onSave={handleModalSave}
          onClear={handleModalClear}
          onClose={() => setGenerateModal(null)}
        />
      )}

      {/* ══ Modale mot de passe Calibration ══ */}
      {calibPwdTarget && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-7 w-full max-w-xs">
            <div className="flex flex-col items-center gap-2 mb-5">
              <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center">
                <Lock className="h-6 w-6 text-slate-500" />
              </div>
              <h2 className="text-base font-bold text-slate-900">Accès administrateur</h2>
              <p className="text-xs text-slate-500 text-center">
                {calibPwdTarget === '/calibration-pdf-bilan' ? 'Calibration PDF Bilan' : 'Calibration des examens'}
              </p>
            </div>
            <form onSubmit={handleCalibPwdSubmit} className="flex flex-col gap-3">
              <input
                type="password"
                value={calibPwdInput}
                onChange={e => { setCalibPwdInput(e.target.value); setCalibPwdError(false); }}
                placeholder="Mot de passe"
                autoFocus
                className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-slate-400 transition-colors ${
                  calibPwdError ? 'border-red-400 bg-red-50' : 'border-slate-300'
                }`}
              />
              {calibPwdError && <p className="text-xs text-red-500">Mot de passe incorrect</p>}
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                >
                  Déverrouiller
                </button>
                <button
                  type="button"
                  onClick={() => setCalibPwdTarget(null)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
