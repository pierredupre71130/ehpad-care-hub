'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  TriangleAlert, ChevronRight, Eye, X, Printer, Pencil, Trash2,
  Pill, CheckCircle2, Clock, Filter, Search, ChevronDown, ChevronUp,
  AlertCircle, TrendingUp, Users, Calendar,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart, Line,
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { useModuleAccess } from '@/lib/use-module-access';
import { useAuth } from '@/lib/auth-context';
import { useEffectiveRole } from '@/lib/use-effective-role';
import { FallFormWizard } from '@/components/declaration-chutes/fall-form-wizard';
import {
  type ChuteRecord, type ChuteFormData,
  getGravity, GRAVITY_CONFIG,
  CONSEQUENCES, FACTEURS_INTRINSEQUES, FACTEURS_EXTRINSEQUES,
  LIEUX, ACTIVITES, CLASSES_RISQUE,
} from '@/components/declaration-chutes/types';

// ── Supabase helpers ──────────────────────────────────────────────────────────

const TABLE = 'declaration_chutes';

const DATE_TIME_FIELDS = ['date_naissance', 'heure_chute', 'pharma_date', 'date_chute'] as const;

function sanitize<T extends Record<string, unknown>>(data: T): T {
  const out: Record<string, unknown> = { ...data };
  for (const f of DATE_TIME_FIELDS) {
    if (out[f] === '') out[f] = null;
  }
  return out as T;
}

async function fetchChutes(): Promise<ChuteRecord[]> {
  const sb = createClient();
  const { data, error } = await sb.from(TABLE).select('*').order('date_chute', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ChuteRecord[];
}

async function createChute(data: ChuteFormData): Promise<ChuteRecord> {
  const sb = createClient();
  const { data: rec, error } = await sb.from(TABLE).insert({ ...sanitize(data), updated_at: new Date().toISOString() }).select().single();
  if (error) throw error;
  return rec as ChuteRecord;
}

async function updateChute(id: string, data: Partial<ChuteFormData>): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from(TABLE).update({ ...sanitize(data), updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

async function deleteChute(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

// ── Helpers UI ────────────────────────────────────────────────────────────────

function fmtDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateTime(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function GravityBadge({ consequences }: { consequences?: string[] }) {
  const g = getGravity(consequences ?? []);
  const c = GRAVITY_CONFIG[g];
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border', c.badge)}>
      <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', c.dot)} />
      {c.label}
    </span>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs border border-slate-200">
      {children}
    </span>
  );
}

// ── Fall card (liste) ─────────────────────────────────────────────────────────

function FallCard({
  fall, onView, onEdit, onDelete, readOnly,
}: {
  fall: ChuteRecord;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  readOnly: boolean;
}) {
  const gravity = getGravity(fall.consequences ?? []);
  const gc = GRAVITY_CONFIG[gravity];
  const shownConseq = (fall.consequences ?? []).slice(0, 3);
  const remaining   = (fall.consequences ?? []).length - shownConseq.length;

  return (
    <div
      className={cn(
        'bg-white rounded-xl border-l-4 border border-slate-200 p-4 hover:shadow-md transition-shadow cursor-pointer',
        gc.border,
      )}
      onClick={onView}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-bold text-slate-800 text-sm">
              {fall.patient_nom} {fall.patient_prenom ?? ''}
            </span>
            {fall.chambre && <span className="text-xs text-slate-400">Ch. {fall.chambre}</span>}
            <GravityBadge consequences={fall.consequences} />
            {fall.pharma_complete && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-700 border border-teal-200">
                <Pill className="h-3 w-3" /> Pharma analysé
              </span>
            )}
          </div>

          {/* Infos */}
          <div className="flex items-center gap-3 text-xs text-slate-500 mb-2 flex-wrap">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {fmtDate(fall.date_chute)}
              {fall.heure_chute && ` à ${fall.heure_chute}`}
            </span>
            {fall.lieu && <span>📍 {fall.lieu === 'Autre' ? fall.lieu_autre : fall.lieu}</span>}
            {fall.unite && <span>🏥 {fall.unite}</span>}
          </div>

          {/* Conséquences */}
          <div className="flex flex-wrap gap-1">
            {shownConseq.map(c => <Tag key={c}>{c}</Tag>)}
            {remaining > 0 && <Tag>+{remaining} autre{remaining > 1 ? 's' : ''}</Tag>}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
          <button
            onClick={onView}
            title="Voir le détail"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <Eye className="h-4 w-4" />
          </button>
          {!readOnly && (
            <>
              <button
                onClick={onEdit}
                title="Modifier"
                className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={onDelete}
                title="Supprimer"
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Fall detail view ──────────────────────────────────────────────────────────

function FallDetail({
  fall, onClose, onEdit, onPharma, readOnly,
}: {
  fall: ChuteRecord;
  onClose: () => void;
  onEdit: () => void;
  onPharma: () => void;
  readOnly: boolean;
}) {
  const gravity = getGravity(fall.consequences ?? []);
  const gc = GRAVITY_CONFIG[gravity];

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">{title}</p>
      </div>
      <div className="px-4 py-3 space-y-1.5">{children}</div>
    </div>
  );

  const Row = ({ label, value }: { label: string; value?: string | number | null }) =>
    value != null && value !== '' ? (
      <div className="flex gap-3 text-sm">
        <span className="text-slate-500 min-w-32 flex-shrink-0">{label}</span>
        <span className="font-medium text-slate-800">{value}</span>
      </div>
    ) : null;

  const TagList = ({ values, autre, autreTxt }: { values?: string[]; autre?: string; autreTxt?: string }) => (
    <div className="flex flex-wrap gap-1.5">
      {(values ?? []).map(v => (
        <span key={v} className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-xs text-slate-700">{v}</span>
      ))}
      {autre && autreTxt && (
        <span className="px-2 py-0.5 bg-orange-50 border border-orange-200 rounded text-xs text-orange-700">Autre : {autreTxt}</span>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className={cn('w-2.5 h-2.5 rounded-full flex-shrink-0', gc.dot)} />
            <div>
              <h2 className="font-bold text-slate-800 text-base">
                {fall.patient_nom} {fall.patient_prenom ?? ''}
              </h2>
              <p className="text-xs text-slate-500">{fmtDate(fall.date_chute)}{fall.heure_chute ? ` à ${fall.heure_chute}` : ''}</p>
            </div>
            <GravityBadge consequences={fall.consequences} />
          </div>
          <div className="flex items-center gap-2">
            {!readOnly && (
              <button
                onClick={onEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" /> Modifier
              </button>
            )}
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors"
            >
              <Printer className="h-3.5 w-3.5" /> Imprimer
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body scrollable */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          <Section title="Patient">
            <Row label="Nom complet" value={`${fall.patient_nom} ${fall.patient_prenom ?? ''}`.trim()} />
            <Row label="Sexe" value={fall.sexe} />
            <Row label="Âge" value={fall.age} />
            <Row label="Chambre" value={fall.chambre} />
            <Row label="Unité" value={fall.unite} />
          </Section>

          <Section title="Circonstances">
            <Row label="Date" value={fmtDate(fall.date_chute)} />
            <Row label="Heure" value={fall.heure_chute} />
            <Row label="Lieu" value={fall.lieu === 'Autre' ? `Autre : ${fall.lieu_autre}` : fall.lieu} />
            <Row label="Activité" value={fall.activite === 'Autre' ? `Autre : ${fall.activite_autre}` : fall.activite} />
            <Row label="Chaussage" value={fall.chaussage === 'Autre' ? `Autre : ${fall.chaussage_autre}` : fall.chaussage} />
            <Row label="Chute témoin" value={fall.temoin} />
          </Section>

          <Section title="Facteurs de risque">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500">Intrinsèques (patient)</p>
              <TagList values={fall.facteurs_intrinseques} autre="Autre" autreTxt={(fall.facteurs_intrinseques ?? []).includes('Autre') ? fall.facteurs_intrinseques_autre : undefined} />
              <p className="text-xs font-semibold text-slate-500 mt-2">Extrinsèques (environnement)</p>
              <TagList values={fall.facteurs_extrinseques} autre="Autre" autreTxt={(fall.facteurs_extrinseques ?? []).includes('Autre') ? fall.facteurs_extrinseques_autre : undefined} />
            </div>
          </Section>

          <Section title="Conséquences">
            <TagList values={fall.consequences} autre="Autre" autreTxt={(fall.consequences ?? []).includes('Autre') ? fall.consequences_autre : undefined} />
          </Section>

          <Section title="Actions immédiates">
            <TagList values={fall.actions_immediates} autre="Autre" autreTxt={(fall.actions_immediates ?? []).includes('Autre') ? fall.actions_immediates_autre : undefined} />
          </Section>

          <Section title="Actions préventives">
            <TagList values={fall.actions_preventives} autre="Autre" autreTxt={(fall.actions_preventives ?? []).includes('Autre') ? fall.actions_preventives_autre : undefined} />
          </Section>

          {fall.informations_complementaires && (
            <Section title="Informations complémentaires">
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{fall.informations_complementaires}</p>
            </Section>
          )}

          {/* Analyse pharmaceutique */}
          <div className={cn(
            'border-2 rounded-xl overflow-hidden',
            fall.pharma_complete ? 'border-teal-300' : 'border-dashed border-slate-300',
          )}>
            <div className={cn('px-4 py-2.5 flex items-center justify-between', fall.pharma_complete ? 'bg-teal-50' : 'bg-slate-50')}>
              <div className="flex items-center gap-2">
                <Pill className={cn('h-4 w-4', fall.pharma_complete ? 'text-teal-600' : 'text-slate-400')} />
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Analyse pharmaceutique</span>
                {fall.pharma_complete
                  ? <span className="text-xs text-teal-600 font-semibold">✓ Complétée</span>
                  : <span className="text-xs text-slate-400">Non réalisée</span>
                }
              </div>
              {!readOnly && (
                <button
                  onClick={onPharma}
                  className={cn(
                    'text-xs font-medium px-3 py-1 rounded-lg border transition-colors',
                    fall.pharma_complete
                      ? 'text-teal-700 border-teal-300 bg-white hover:bg-teal-50'
                      : 'text-orange-700 border-orange-300 bg-white hover:bg-orange-50',
                  )}
                >
                  {fall.pharma_complete ? 'Modifier' : 'Réaliser l\'analyse'}
                </button>
              )}
            </div>
            {fall.pharma_complete && (
              <div className="px-4 py-3 space-y-1.5">
                <Row label="Analysé par" value={fall.pharma_par} />
                <Row label="Date" value={fall.pharma_date ? fmtDateTime(fall.pharma_date) : undefined} />
                <Row label="Médicaments" value={fall.medicaments} />
                <Row label="Nombre" value={fall.nombre_medicaments} />
                {fall.polymedication && <p className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-1 rounded">⚠ Polymédication (≥ 5 médicaments)</p>}
                {(fall.classes_risque ?? []).length > 0 && (
                  <>
                    <p className="text-xs text-slate-500 font-semibold">Classes à risque</p>
                    <div className="flex flex-wrap gap-1">
                      {(fall.classes_risque ?? []).map(c => (
                        <span key={c} className="px-2 py-0.5 bg-red-50 border border-red-200 text-xs text-red-700 rounded">{c}</span>
                      ))}
                    </div>
                  </>
                )}
                {fall.modifications_recentes && (
                  <p className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded">⚠ Modifications récentes de traitement</p>
                )}
                {fall.commentaires_pharma && (
                  <div>
                    <p className="text-xs text-slate-500 font-semibold mb-1">Commentaires</p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{fall.commentaires_pharma}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Déclarant */}
          {(fall.declarant || fall.created_at) && (
            <Section title="Déclaration">
              <Row label="Déclarant" value={fall.declarant} />
              <Row label="Créée le" value={fall.created_at ? fmtDateTime(fall.created_at) : undefined} />
            </Section>
          )}

          {/* Journal de modifications */}
          {(fall.log_modifications ?? []).length > 0 && (
            <Section title={`Journal (${fall.log_modifications!.length} modification${fall.log_modifications!.length > 1 ? 's' : ''})`}>
              <div className="space-y-2">
                {fall.log_modifications!.map((log, i) => (
                  <div key={i} className="flex gap-2 text-xs">
                    <span className="text-slate-400 flex-shrink-0">{fmtDateTime(log.date)}</span>
                    <span className="text-slate-600">par <strong>{log.user}</strong> — {log.changes}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Formulaire analyse pharmaceutique ─────────────────────────────────────────

interface PharmaForm {
  pharma_par: string;
  medicaments: string;
  nombre_medicaments: string;
  polymedication: boolean;
  classes_risque: string[];
  modifications_recentes: boolean;
  modifications_recentes_details: string;
  commentaires_pharma: string;
}

function PharmaModal({
  fall, onClose, onSave,
}: {
  fall: ChuteRecord;
  onClose: () => void;
  onSave: (data: Partial<ChuteFormData>) => Promise<void>;
}) {
  const [form, setForm] = useState<PharmaForm>({
    pharma_par: fall.pharma_par ?? '',
    medicaments: fall.medicaments ?? '',
    nombre_medicaments: fall.nombre_medicaments != null ? String(fall.nombre_medicaments) : '',
    polymedication: fall.polymedication ?? false,
    classes_risque: fall.classes_risque ?? [],
    modifications_recentes: fall.modifications_recentes ?? false,
    modifications_recentes_details: fall.modifications_recentes_details ?? '',
    commentaires_pharma: fall.commentaires_pharma ?? '',
  });
  const [saving, setSaving] = useState(false);

  const toggleClass = (c: string) => setForm(prev => ({
    ...prev,
    classes_risque: prev.classes_risque.includes(c)
      ? prev.classes_risque.filter(x => x !== c)
      : [...prev.classes_risque, c],
  }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const nbMeds = parseInt(form.nombre_medicaments, 10);
      await onSave({
        pharma_complete: true,
        pharma_par: form.pharma_par || undefined,
        pharma_date: new Date().toISOString(),
        medicaments: form.medicaments || undefined,
        nombre_medicaments: isNaN(nbMeds) ? undefined : nbMeds,
        polymedication: isNaN(nbMeds) ? form.polymedication : nbMeds >= 5,
        classes_risque: form.classes_risque,
        modifications_recentes: form.modifications_recentes,
        modifications_recentes_details: form.modifications_recentes_details || undefined,
        commentaires_pharma: form.commentaires_pharma || undefined,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const nbMeds = parseInt(form.nombre_medicaments, 10);
  const isPoly = !isNaN(nbMeds) ? nbMeds >= 5 : form.polymedication;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Pill className="h-5 w-5 text-teal-600" />
            <h2 className="font-bold text-slate-800">Analyse pharmaceutique</h2>
          </div>
          <p className="text-sm text-slate-500 flex-1 ml-4 truncate">
            {fall.patient_nom} {fall.patient_prenom ?? ''} — {fmtDate(fall.date_chute)}
          </p>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 ml-2">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Réalisé par</label>
            <input
              type="text" value={form.pharma_par}
              onChange={e => setForm(p => ({ ...p, pharma_par: e.target.value }))}
              placeholder="Pharmacien, IDE…"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-teal-400"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Liste des médicaments</label>
            <textarea
              value={form.medicaments}
              onChange={e => setForm(p => ({ ...p, medicaments: e.target.value }))}
              placeholder="Listez les médicaments pris par le patient…"
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm resize-none focus:outline-none focus:border-teal-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nombre de médicaments</label>
              <input
                type="number" min={0}
                value={form.nombre_medicaments}
                onChange={e => setForm(p => ({ ...p, nombre_medicaments: e.target.value }))}
                placeholder="0"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-teal-400"
              />
            </div>
            <div className="flex flex-col justify-end">
              {isPoly && (
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                  <span className="text-xs font-semibold text-amber-700">Polymédication (≥ 5)</span>
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Classes de médicaments à risque</label>
            <div className="flex flex-wrap gap-2">
              {CLASSES_RISQUE.map(c => {
                const checked = form.classes_risque.includes(c);
                return (
                  <button
                    key={c}
                    onClick={() => toggleClass(c)}
                    className={cn(
                      'px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors',
                      checked
                        ? 'bg-red-600 border-red-600 text-white'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-red-300 hover:bg-red-50',
                    )}
                  >
                    {checked && '✓ '}{c}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.modifications_recentes}
                onChange={e => setForm(p => ({ ...p, modifications_recentes: e.target.checked }))}
                className="w-4 h-4 accent-teal-600"
              />
              <span className="text-sm font-semibold text-slate-700">Modifications récentes de traitement</span>
            </label>
            {form.modifications_recentes && (
              <textarea
                value={form.modifications_recentes_details}
                onChange={e => setForm(p => ({ ...p, modifications_recentes_details: e.target.value }))}
                placeholder="Précisez les modifications…"
                rows={2}
                className="mt-2 w-full px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 text-sm resize-none focus:outline-none focus:border-amber-400"
              />
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Commentaires du pharmacien</label>
            <textarea
              value={form.commentaires_pharma}
              onChange={e => setForm(p => ({ ...p, commentaires_pharma: e.target.value }))}
              placeholder="Observations, recommandations…"
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm resize-none focus:outline-none focus:border-teal-400"
            />
          </div>
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-slate-100 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Enregistrement…' : 'Valider l\'analyse'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Statistiques ──────────────────────────────────────────────────────────────

const TRAUMATISME_KEYS = [
  'Traumatisme crânien', 'Fracture confirmée', 'Fracture suspectée',
  'Hospitalisation/transfert', 'Plaie profonde', 'Plaie superficielle',
  'Hématome/ecchymose', 'Douleur sans lésion visible',
];

function hasTraumatisme(consequences: string[] = []) {
  return consequences.some(c => TRAUMATISME_KEYS.includes(c));
}

function StatBar({ label, value, max, color = 'bg-orange-500' }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-600 w-44 truncate flex-shrink-0" title={label}>{label}</span>
      <div className="flex-1 bg-slate-100 rounded-full h-2">
        <div className={cn('h-2 rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-bold text-slate-700 w-6 text-right flex-shrink-0">{value}</span>
    </div>
  );
}

function StatsView({ falls }: { falls: ChuteRecord[] }) {
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const thisYear  = String(now.getFullYear());

  const total      = falls.length;
  const thisMonthN = falls.filter(f => f.date_chute?.startsWith(thisMonth)).length;
  const thisYearN  = falls.filter(f => f.date_chute?.startsWith(thisYear)).length;

  // Gravité
  const byGravity = { critique: 0, grave: 0, moderee: 0, legere: 0 };
  falls.forEach(f => { byGravity[getGravity(f.consequences ?? [])]++; });

  // Récidive (patients avec > 1 chute)
  const patientFalls: Record<string, number> = {};
  falls.forEach(f => {
    const key = `${f.patient_nom}|${f.patient_prenom ?? ''}`.toLowerCase();
    patientFalls[key] = (patientFalls[key] ?? 0) + 1;
  });
  const uniquePatients = Object.keys(patientFalls).length;
  const recidivists    = Object.values(patientFalls).filter(n => n > 1).length;
  const recidivismRate = uniquePatients > 0 ? Math.round((recidivists / uniquePatients) * 100) : 0;

  // Pharma
  const pharmaCompleted = falls.filter(f => f.pharma_complete).length;
  const pharmaRate      = total > 0 ? Math.round((pharmaCompleted / total) * 100) : 0;

  // Top lieux
  const lieuCount: Record<string, number> = {};
  falls.forEach(f => {
    const l = f.lieu === 'Autre' ? (f.lieu_autre || 'Autre') : (f.lieu ?? 'Non renseigné');
    lieuCount[l] = (lieuCount[l] ?? 0) + 1;
  });
  const topLieux = Object.entries(lieuCount).sort((a, b) => b[1] - a[1]).slice(0, 6);

  // Top facteurs intrinsèques
  const fiCount: Record<string, number> = {};
  falls.forEach(f => (f.facteurs_intrinseques ?? []).forEach(fi => { fiCount[fi] = (fiCount[fi] ?? 0) + 1; }));
  const topFI = Object.entries(fiCount).sort((a, b) => b[1] - a[1]).slice(0, 6);

  // Top facteurs extrinsèques
  const feCount: Record<string, number> = {};
  falls.forEach(f => (f.facteurs_extrinseques ?? []).forEach(fe => { feCount[fe] = (feCount[fe] ?? 0) + 1; }));
  const topFE = Object.entries(feCount).sort((a, b) => b[1] - a[1]).slice(0, 6);

  // Top conséquences
  const consCount: Record<string, number> = {};
  falls.forEach(f => (f.consequences ?? []).forEach(c => { consCount[c] = (consCount[c] ?? 0) + 1; }));
  const topCons = Object.entries(consCount).sort((a, b) => b[1] - a[1]).slice(0, 6);

  // Données mensuelles — on couvre toute la plage des données + mois courant
  const allKeys = falls
    .map(f => f.date_chute?.slice(0, 7))
    .filter(Boolean) as string[];
  const minKey = allKeys.length > 0 ? allKeys.reduce((a, b) => a < b ? a : b) : thisMonth;
  const maxKey = thisMonth;

  const monthlyData: Array<{ label: string; total: number; traumatisme: number; sansConsequence: number }> = [];
  {
    let cur = new Date(minKey + '-01');
    const end = new Date(maxKey + '-01');
    while (cur <= end) {
      const key   = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`;
      const label = cur.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
      const mFalls = falls.filter(f => f.date_chute?.startsWith(key));
      monthlyData.push({
        label,
        total: mFalls.length,
        traumatisme: mFalls.filter(f => hasTraumatisme(f.consequences ?? [])).length,
        sansConsequence: mFalls.filter(f =>
          (f.consequences ?? []).length === 0 ||
          (f.consequences ?? []).every(c => c === 'Aucune lésion apparente')
        ).length,
      });
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
  }

  const KPI = ({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color: string }) => (
    <div className={cn('rounded-xl border p-4', color)}>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-3xl font-black text-slate-800">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );

  if (total === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <TriangleAlert className="h-12 w-12 text-slate-200 mb-4" />
        <p className="text-slate-500 font-medium">Aucune déclaration enregistrée</p>
        <p className="text-sm text-slate-400 mt-1">Les statistiques apparaîtront ici une fois les premières chutes déclarées.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPI label="Total chutes" value={total} sub="toutes périodes" color="bg-slate-50 border-slate-200" />
        <KPI label="Ce mois" value={thisMonthN} sub={now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })} color="bg-orange-50 border-orange-200" />
        <KPI label="Cette année" value={thisYearN} sub={thisYear} color="bg-blue-50 border-blue-200" />
        <KPI label="Récidive" value={`${recidivismRate}%`} sub={`${recidivists} / ${uniquePatients} patients`} color="bg-purple-50 border-purple-200" />
      </div>

      {/* Gravité */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <p className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-orange-500" /> Répartition par gravité
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(['critique', 'grave', 'moderee', 'legere'] as const).map(g => {
            const gc = GRAVITY_CONFIG[g];
            const n  = byGravity[g];
            return (
              <div key={g} className={cn('rounded-lg border p-3 text-center', gc.bg, gc.border)}>
                <p className="text-2xl font-black text-slate-800">{n}</p>
                <p className={cn('text-xs font-semibold', gc.text)}>{gc.label}</p>
                <p className="text-xs text-slate-500">{total > 0 ? Math.round((n / total) * 100) : 0}%</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Graphique 1 — Évolution linéaire */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <p className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-blue-500" /> Évolution des chutes par mois
        </p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={monthlyData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
            <Tooltip
              contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e2e8f0' }}
              labelStyle={{ fontWeight: 600, color: '#1e293b' }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="monotone" dataKey="total" name="Total des chutes"
              stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }}
            />
            <Line
              type="monotone" dataKey="traumatisme" name="Avec traumatisme"
              stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Graphique 2 — Barres groupées par mois */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <p className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-orange-500" /> Répartition des conséquences par mois
        </p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={monthlyData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
            <Tooltip
              contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e2e8f0' }}
              labelStyle={{ fontWeight: 600, color: '#1e293b' }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="traumatisme" name="Avec traumatisme" fill="#ef4444" radius={[3, 3, 0, 0]} />
            <Bar dataKey="sansConsequence" name="Sans conséquence" fill="#22c55e" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Grille de stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {topLieux.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
            <p className="text-sm font-bold text-slate-700 mb-3">📍 Lieux fréquents</p>
            {topLieux.map(([l, n]) => <StatBar key={l} label={l} value={n} max={topLieux[0][1]} color="bg-blue-400" />)}
          </div>
        )}
        {topCons.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
            <p className="text-sm font-bold text-slate-700 mb-3">🩹 Conséquences fréquentes</p>
            {topCons.map(([c, n]) => <StatBar key={c} label={c} value={n} max={topCons[0][1]} color="bg-orange-500" />)}
          </div>
        )}
        {topFI.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
            <p className="text-sm font-bold text-slate-700 mb-3">🧑 Facteurs intrinsèques</p>
            {topFI.map(([f, n]) => <StatBar key={f} label={f} value={n} max={topFI[0][1]} color="bg-purple-500" />)}
          </div>
        )}
        {topFE.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2">
            <p className="text-sm font-bold text-slate-700 mb-3">🏥 Facteurs extrinsèques</p>
            {topFE.map(([f, n]) => <StatBar key={f} label={f} value={n} max={topFE[0][1]} color="bg-teal-500" />)}
          </div>
        )}
      </div>

      {/* Analyse pharmaceutique */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <p className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
          <Pill className="h-4 w-4 text-teal-600" /> Analyse pharmaceutique
        </p>
        <div className="flex items-center gap-4">
          <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden">
            <div className="h-3 bg-teal-500 rounded-full transition-all" style={{ width: `${pharmaRate}%` }} />
          </div>
          <span className="text-sm font-bold text-slate-700 flex-shrink-0">{pharmaCompleted} / {total}</span>
          <span className="text-sm text-teal-700 font-semibold flex-shrink-0">{pharmaRate}%</span>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          {total - pharmaCompleted} chute{total - pharmaCompleted > 1 ? 's' : ''} sans analyse pharmaceutique
        </p>
      </div>

      {/* Patients récidivistes */}
      {recidivists > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
            <Users className="h-4 w-4 text-purple-600" /> Patients récidivistes
          </p>
          <div className="space-y-1">
            {Object.entries(patientFalls)
              .filter(([, n]) => n > 1)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 8)
              .map(([key, n]) => {
                const parts = key.split('|');
                const name  = `${parts[0]} ${parts[1]}`.trim();
                return (
                  <div key={key} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
                    <span className="text-sm font-medium text-slate-700 capitalize">{name}</span>
                    <span className="text-xs font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">{n} chutes</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

type Tab = 'declare' | 'history' | 'stats';

export default function DeclarationChutesPage() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  const effectiveRole = useEffectiveRole();
  const access   = useModuleAccess('declarationChutes');
  const readOnly = access === 'read';
  const isAdmin  = effectiveRole === 'admin';

  const [tab, setTab]               = useState<Tab>('declare');
  const [success, setSuccess]       = useState(false);
  const [search, setSearch]         = useState('');
  const [dateFrom, setDateFrom]     = useState('');
  const [dateTo, setDateTo]         = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Modals
  const [viewFall, setViewFall]     = useState<ChuteRecord | null>(null);
  const [editFall, setEditFall]     = useState<ChuteRecord | null>(null);
  const [deleteFall, setDeleteFall] = useState<ChuteRecord | null>(null);
  const [pharmaFall, setPharmaFall] = useState<ChuteRecord | null>(null);

  // Data
  const { data: falls = [], isLoading } = useQuery({
    queryKey: ['declaration_chutes'],
    queryFn: fetchChutes,
  });

  const createMut = useMutation({
    mutationFn: createChute,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['declaration_chutes'] }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ChuteFormData> }) => updateChute(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['declaration_chutes'] });
      setEditFall(null);
      setViewFall(null);
      setPharmaFall(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteChute(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['declaration_chutes'] });
      setDeleteFall(null);
    },
  });

  // Filtres
  const filtered = useMemo(() => {
    return falls.filter(f => {
      if (search) {
        const q = search.toLowerCase();
        const matchName = `${f.patient_nom} ${f.patient_prenom ?? ''}`.toLowerCase().includes(q);
        const matchLieu = (f.lieu ?? '').toLowerCase().includes(q);
        const matchUnit = (f.unite ?? '').toLowerCase().includes(q);
        if (!matchName && !matchLieu && !matchUnit) return false;
      }
      if (dateFrom && f.date_chute < dateFrom) return false;
      if (dateTo   && f.date_chute > dateTo)   return false;
      return true;
    });
  }, [falls, search, dateFrom, dateTo]);

  const handleDeclare = async (data: ChuteFormData) => {
    await createMut.mutateAsync(data);
    setSuccess(true);
  };

  const handleEdit = async (data: ChuteFormData) => {
    if (!editFall) return;
    const log = [
      ...(editFall.log_modifications ?? []),
      { date: new Date().toISOString(), user: profile?.display_name ?? 'Inconnu', changes: 'Modification de la fiche' },
    ];
    await updateMut.mutateAsync({ id: editFall.id, data: { ...data, log_modifications: log } });
  };

  const handlePharma = async (data: Partial<ChuteFormData>) => {
    if (!pharmaFall) return;
    await updateMut.mutateAsync({ id: pharmaFall.id, data });
    // Refresh viewFall si ouvert
    if (viewFall?.id === pharmaFall.id) {
      const updated = falls.find(f => f.id === pharmaFall.id);
      if (updated) setViewFall({ ...updated, ...data } as ChuteRecord);
    }
    setPharmaFall(null);
  };

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'declare', label: 'Nouvelle déclaration', icon: <TriangleAlert className="h-4 w-4" /> },
    { id: 'history', label: `Historique (${falls.length})`,  icon: <Clock className="h-4 w-4" /> },
    { id: 'stats',   label: 'Statistiques', icon: <TrendingUp className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen" style={{ background: '#dde4ee' }}>

      {/* Header */}
      <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #c2410c 0%, #9a3412 100%)' }}>
        <div className="relative z-10 max-w-5xl mx-auto px-6 py-5">
          <div className="flex items-center gap-1.5 text-white/50 text-xs mb-4">
            <Link href="/" className="hover:text-white/80 transition-colors">Accueil</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-white/90">Déclaration de Chutes</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <TriangleAlert className="h-6 w-6 text-white" strokeWidth={1.5} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Déclaration de Chutes</h1>
              <p className="text-white/70 text-sm">Formulaire de déclaration · Historique · Analyses</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-5">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => { setTab(t.id); setSuccess(false); }}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors',
                  tab === t.id
                    ? 'bg-white text-orange-700 shadow-sm'
                    : 'text-white/70 hover:text-white hover:bg-white/15',
                )}
              >
                {t.icon}
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Lecture seule */}
      {readOnly && (
        <div className="max-w-5xl mx-auto px-4 mt-4">
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-sm text-blue-700 font-medium">
            <Eye className="h-4 w-4 flex-shrink-0" />
            Vous consultez ce module en lecture seule.
          </div>
        </div>
      )}

      {/* Contenu */}
      <div className="max-w-5xl mx-auto px-4 py-6 pb-20">

        {/* ── Déclarer ───────────────────────────────────────────────── */}
        {tab === 'declare' && (
          <>
            {success ? (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-10 flex flex-col items-center text-center gap-4">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-green-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-800">Déclaration enregistrée</h2>
                <p className="text-slate-500 text-sm max-w-sm">
                  La déclaration de chute a bien été enregistrée. Vous pouvez en déclarer une nouvelle ou consulter l'historique.
                </p>
                <div className="flex gap-3 mt-2">
                  <button
                    onClick={() => setSuccess(false)}
                    className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-sm font-semibold transition-colors"
                  >
                    Nouvelle déclaration
                  </button>
                  <button
                    onClick={() => { setTab('history'); setSuccess(false); }}
                    className="px-5 py-2.5 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-sm font-medium transition-colors"
                  >
                    Voir l'historique
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                {readOnly ? (
                  <div className="text-center py-10 text-slate-400">
                    <Eye className="h-10 w-10 mx-auto mb-3 opacity-40" />
                    <p className="font-medium">Accès en lecture seule</p>
                    <p className="text-sm mt-1">Vous ne pouvez pas créer de nouvelles déclarations.</p>
                  </div>
                ) : (
                  <FallFormWizard onSubmit={handleDeclare} />
                )}
              </div>
            )}
          </>
        )}

        {/* ── Historique ─────────────────────────────────────────────── */}
        {tab === 'history' && (
          <div className="space-y-4">
            {/* Barre de recherche / filtres */}
            <div className="bg-white rounded-2xl border border-slate-200 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Rechercher par nom, lieu, unité…"
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-orange-400"
                  />
                </div>
                <button
                  onClick={() => setShowFilters(v => !v)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors',
                    showFilters || dateFrom || dateTo
                      ? 'bg-orange-50 border-orange-300 text-orange-700'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50',
                  )}
                >
                  <Filter className="h-4 w-4" />
                  Filtres
                  {showFilters ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
              </div>
              {showFilters && (
                <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-100 flex-wrap">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-slate-500">Du</label>
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                      className="px-2 py-1.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-orange-400" />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-slate-500">Au</label>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                      className="px-2 py-1.5 text-sm rounded-lg border border-slate-200 focus:outline-none focus:border-orange-400" />
                  </div>
                  {(dateFrom || dateTo) && (
                    <button onClick={() => { setDateFrom(''); setDateTo(''); }}
                      className="text-xs text-slate-500 hover:text-slate-700 underline">
                      Réinitialiser
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Résultats */}
            {isLoading ? (
              <div className="py-12 text-center text-slate-400">Chargement…</div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center bg-white rounded-2xl border border-slate-200">
                <TriangleAlert className="h-10 w-10 mx-auto text-slate-200 mb-3" />
                <p className="text-slate-500 font-medium">
                  {falls.length === 0 ? 'Aucune déclaration enregistrée' : 'Aucun résultat pour ces filtres'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-slate-500 font-medium px-1">
                  {filtered.length} déclaration{filtered.length > 1 ? 's' : ''}
                  {filtered.length !== falls.length && ` (sur ${falls.length})`}
                </p>
                {filtered.map(f => (
                  <FallCard
                    key={f.id}
                    fall={f}
                    onView={() => setViewFall(f)}
                    onEdit={() => setEditFall(f)}
                    onDelete={() => setDeleteFall(f)}
                    readOnly={!isAdmin}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Statistiques ───────────────────────────────────────────── */}
        {tab === 'stats' && (
          isLoading
            ? <div className="py-12 text-center text-slate-400">Chargement…</div>
            : <StatsView falls={falls} />
        )}
      </div>

      {/* ── Modal : Détail ─────────────────────────────────────────────── */}
      {viewFall && (
        <FallDetail
          fall={viewFall}
          onClose={() => setViewFall(null)}
          onEdit={() => { setEditFall(viewFall); setViewFall(null); }}
          onPharma={() => { setPharmaFall(viewFall); }}
          readOnly={!isAdmin}
        />
      )}

      {/* ── Modal : Modifier ───────────────────────────────────────────── */}
      {editFall && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
              <h2 className="font-bold text-slate-800">Modifier la déclaration</h2>
              <p className="text-sm text-slate-500 ml-4">
                {editFall.patient_nom} — {fmtDate(editFall.date_chute)}
              </p>
              <button onClick={() => setEditFall(null)} className="ml-auto p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4">
              <FallFormWizard
                initialData={editFall}
                isEdit
                onSubmit={handleEdit}
                onCancel={() => setEditFall(null)}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Modal : Analyse pharmaceutique ─────────────────────────────── */}
      {pharmaFall && (
        <PharmaModal
          fall={pharmaFall}
          onClose={() => setPharmaFall(null)}
          onSave={handlePharma}
        />
      )}

      {/* ── Modal : Confirmation suppression ───────────────────────────── */}
      {deleteFall && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h2 className="font-bold text-slate-800 text-base mb-1">Supprimer cette déclaration ?</h2>
            <p className="text-sm text-slate-500 mb-1">
              {deleteFall.patient_nom} {deleteFall.patient_prenom ?? ''} — {fmtDate(deleteFall.date_chute)}
            </p>
            <p className="text-xs text-red-600 mb-5">Cette action est irréversible.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteFall(null)}
                className="flex-1 py-2.5 rounded-xl text-sm border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={() => deleteMut.mutate(deleteFall.id)}
                disabled={deleteMut.isPending}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleteMut.isPending ? 'Suppression…' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
