'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  GraduationCap, ChevronRight, Eye, X, Pencil, Trash2, Save,
  BarChart2, ClipboardList, FileText, CheckCircle2, Clock,
  TrendingUp, ChevronDown, ChevronUp, AlertCircle, Printer,
} from 'lucide-react';
import Link from 'next/link';
import {
  ResponsiveContainer,
  LineChart, Line,
  BarChart, Bar,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { useModuleAccess } from '@/lib/use-module-access';
import {
  type QuestionnaireRecord, type QuestionnaireFormData, type AnalyseRecord, type RatingPoint,
  QUESTIONS_BASE, QUESTIONS_ESI, SCALE, DEFAULT_FORM,
  getAnneeScolaire, computeAvg, computeGlobalAvg,
} from '@/components/questionnaire-etudiant/types';

// ── Supabase helpers ──────────────────────────────────────────────────────────

const TABLE   = 'questionnaire_etudiant';
const ANALYSE = 'analyse_questionnaire';

async function fetchQuestionnaires(): Promise<QuestionnaireRecord[]> {
  const sb = createClient();
  const { data, error } = await sb.from(TABLE).select('*').order('date_soumission', { ascending: false });
  if (error) throw error;
  return (data ?? []) as QuestionnaireRecord[];
}

async function createQuestionnaire(data: QuestionnaireFormData): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from(TABLE).insert({ ...data, updated_at: new Date().toISOString() });
  if (error) throw error;
}

async function updateQuestionnaire(id: string, data: Partial<QuestionnaireFormData>): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from(TABLE).update({ ...data, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

async function deleteQuestionnaire(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

async function fetchAnalyses(): Promise<AnalyseRecord[]> {
  const sb = createClient();
  const { data, error } = await sb.from(ANALYSE).select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AnalyseRecord[];
}

async function saveAnalyse(data: Omit<AnalyseRecord, 'id' | 'created_at'>): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from(ANALYSE).insert(data);
  if (error) throw error;
}

async function deleteAnalyse(id: string): Promise<void> {
  const sb = createClient();
  const { error } = await sb.from(ANALYSE).delete().eq('id', id);
  if (error) throw error;
}

// ── Helpers UI ────────────────────────────────────────────────────────────────

function fmtDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDatetime(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const STATUT_LABEL: Record<string, string> = { esi: 'ESI', eas: 'EAS' };
const ANNEE_LABEL:  Record<string, string> = { '1': '1ère année', '2': '2ème année', '3': '3ème année' };
const NOTE_COLOR = ['', '#ef4444', '#f97316', '#84cc16', '#22c55e'];
const NOTE_LABEL = ['', 'Non satisfaisant', 'Moyen. satisf.', 'Satisfaisant', 'Très satisf.'];

function NoteBadge({ value }: { value?: string }) {
  if (!value) return <span className="text-slate-300 text-sm">—</span>;
  const v = parseInt(value, 10);
  return (
    <span
      className="inline-flex items-center justify-center w-8 h-8 rounded-full text-white text-sm font-bold"
      style={{ backgroundColor: NOTE_COLOR[v] ?? '#e2e8f0' }}
      title={NOTE_LABEL[v]}
    >
      {value}
    </span>
  );
}

// ── Formulaire questionnaire ──────────────────────────────────────────────────

function QuestionnaireForm({
  initial, onSubmit, onCancel, isEdit = false,
}: {
  initial?: Partial<QuestionnaireFormData>;
  onSubmit: (data: QuestionnaireFormData) => Promise<void>;
  onCancel?: () => void;
  isEdit?: boolean;
}) {
  const [form, setForm] = useState<QuestionnaireFormData>({ ...DEFAULT_FORM, ...initial });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const set = useCallback(<K extends keyof QuestionnaireFormData>(key: K, val: QuestionnaireFormData[K]) => {
    setForm(prev => ({ ...prev, [key]: val }));
  }, []);

  const isEsi = form.statut_etudiant === 'esi';

  const validate = () => {
    const errs: string[] = [];
    const qs = isEsi ? [...QUESTIONS_BASE, ...QUESTIONS_ESI] : QUESTIONS_BASE;
    const missing = qs.filter(q => !(form as unknown as Record<string, string>)[q.key]).map(q => q.label);
    if (missing.length > 0) errs.push(`Veuillez noter : ${missing.join(', ')}`);
    return errs;
  };

  const handleSubmit = async () => {
    const errs = validate();
    if (errs.length > 0) { setErrors(errs); return; }
    setSaving(true);
    try { await onSubmit(form); }
    finally { setSaving(false); }
  };

  const RadioRow = ({ q }: { q: { key: string; label: string } }) => (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="py-3 pr-4 pl-4 text-sm text-slate-700 font-medium">{q.label}</td>
      {SCALE.map(s => (
        <td key={s.value} className="text-center py-3 px-2">
          <label className="flex flex-col items-center gap-1 cursor-pointer group">
            <input
              type="radio"
              name={q.key}
              value={s.value}
              checked={(form as unknown as Record<string, string>)[q.key] === s.value}
              onChange={() => set(q.key as keyof QuestionnaireFormData, s.value as QuestionnaireFormData[keyof QuestionnaireFormData])}
              className="sr-only"
            />
            <span
              className={cn(
                'w-9 h-9 rounded-full border-2 flex items-center justify-center text-sm font-bold transition-all',
                (form as unknown as Record<string, string>)[q.key] === s.value
                  ? 'text-white border-transparent'
                  : 'text-slate-400 border-slate-200 group-hover:border-slate-400',
              )}
              style={(form as unknown as Record<string, string>)[q.key] === s.value
                ? { backgroundColor: s.color, borderColor: s.color }
                : {}}
            >
              {s.value}
            </span>
          </label>
        </td>
      ))}
    </tr>
  );

  return (
    <div className="space-y-6">
      {/* Identité */}
      <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 space-y-4">
        <p className="text-xs font-bold text-violet-700 uppercase tracking-wide">Informations étudiant</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Statut</label>
            <div className="flex gap-2">
              {(['esi', 'eas'] as const).map(s => (
                <button key={s} type="button" onClick={() => set('statut_etudiant', s)}
                  className={cn('flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all',
                    form.statut_etudiant === s
                      ? 'bg-violet-600 border-violet-600 text-white'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-violet-300',
                  )}
                >
                  {s.toUpperCase()}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {isEsi ? 'Étudiant·e en soins infirmiers' : 'Étudiant·e aide-soignant·e'}
            </p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Année d'étude</label>
            <div className="flex gap-2">
              {(['1', '2', '3'] as const).map(y => (
                <button key={y} type="button" onClick={() => set('annee_etude', y)}
                  className={cn('flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all',
                    form.annee_etude === y
                      ? 'bg-violet-600 border-violet-600 text-white'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-violet-300',
                  )}
                >
                  {y}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Année scolaire</label>
            <input
              type="text"
              value={form.annee_scolaire}
              onChange={e => set('annee_scolaire', e.target.value)}
              placeholder="2024-2025"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-violet-400"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Date du questionnaire</label>
            <input
              type="date"
              value={form.date_soumission?.slice(0, 10)}
              onChange={e => set('date_soumission', new Date(e.target.value).toISOString())}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-violet-400"
            />
          </div>
        </div>
      </div>

      {/* Tableau de notation */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Évaluation — Niveau de satisfaction</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left py-2 px-4 text-xs text-slate-500 font-semibold">Critère</th>
                {SCALE.map(s => (
                  <th key={s.value} className="text-center py-2 px-2 w-24">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
                        style={{ backgroundColor: s.color }}>{s.value}</span>
                      <span className="text-[10px] text-slate-500 leading-tight">{s.short}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {QUESTIONS_BASE.map(q => <RadioRow key={q.key} q={q} />)}
              {isEsi && (
                <>
                  <tr>
                    <td colSpan={5} className="py-2 px-4 bg-violet-50 text-xs font-semibold text-violet-700">
                      Questions spécifiques ESI
                    </td>
                  </tr>
                  {QUESTIONS_ESI.map(q => <RadioRow key={q.key} q={q} />)}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Commentaires / Suggestions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <label className="block text-sm font-semibold text-slate-700 mb-2">Commentaires libres</label>
          <textarea
            value={form.commentaires ?? ''}
            onChange={e => set('commentaires', e.target.value)}
            rows={4}
            placeholder="Vos observations sur le stage…"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm resize-none focus:outline-none focus:border-violet-400"
          />
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <label className="block text-sm font-semibold text-slate-700 mb-2">Suggestions d'amélioration</label>
          <textarea
            value={form.suggestions ?? ''}
            onChange={e => set('suggestions', e.target.value)}
            rows={4}
            placeholder="Vos propositions pour améliorer le stage…"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm resize-none focus:outline-none focus:border-violet-400"
          />
        </div>
      </div>

      {errors.length > 0 && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-red-700 space-y-0.5">
            {errors.map((e, i) => <p key={i}>{e}</p>)}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        {onCancel && (
          <button onClick={onCancel} className="flex-1 py-3 rounded-xl text-sm border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
            Annuler
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="flex-1 py-3 rounded-xl text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Enregistrement…' : isEdit ? 'Mettre à jour' : 'Soumettre le questionnaire'}
        </button>
      </div>
    </div>
  );
}

// ── Détail d'un questionnaire ─────────────────────────────────────────────────

function QuestionnaireDetail({
  q, onClose, onEdit, onTuteur, readOnly,
}: {
  q: QuestionnaireRecord;
  onClose: () => void;
  onEdit: () => void;
  onTuteur: (note: string) => Promise<void>;
  readOnly: boolean;
}) {
  const [tuteurMode, setTuteurMode] = useState(false);
  const [tuteurNote, setTuteurNote] = useState(q.note_tuteur ?? '');
  const [saving, setSaving] = useState(false);

  const isEsi = q.statut_etudiant === 'esi';
  const qs = isEsi ? [...QUESTIONS_BASE, ...QUESTIONS_ESI] : QUESTIONS_BASE;

  const handleSaveTuteur = async () => {
    setSaving(true);
    try { await onTuteur(tuteurNote); setTuteurMode(false); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-slate-800 text-base">
                {STATUT_LABEL[q.statut_etudiant]} — {ANNEE_LABEL[q.annee_etude]}
              </span>
              <span className="text-xs bg-violet-100 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full font-semibold">
                {q.annee_scolaire}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{fmtDatetime(q.date_soumission)}</p>
          </div>
          <div className="flex items-center gap-2">
            {!readOnly && (
              <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors">
                <Pencil className="h-3.5 w-3.5" /> Modifier
              </button>
            )}
            <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition-colors">
              <Printer className="h-3.5 w-3.5" /> Imprimer
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* Tableau des notes */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Évaluations</p>
            </div>
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left text-xs text-slate-500 font-semibold px-4 py-2">Critère</th>
                  <th className="text-center text-xs text-slate-500 font-semibold px-4 py-2">Note</th>
                  <th className="text-left text-xs text-slate-500 font-semibold px-4 py-2">Libellé</th>
                </tr>
              </thead>
              <tbody>
                {qs.map(question => {
                  const val = (q as unknown as Record<string, string>)[question.key];
                  return (
                    <tr key={question.key} className={cn('border-b border-slate-100 last:border-0', question.esiOnly && 'bg-violet-50/50')}>
                      <td className="px-4 py-2.5 text-sm text-slate-700">{question.label}</td>
                      <td className="px-4 py-2.5 text-center"><NoteBadge value={val} /></td>
                      <td className="px-4 py-2.5 text-sm text-slate-500">{val ? NOTE_LABEL[parseInt(val)] : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {(q.commentaires || q.suggestions) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {q.commentaires && (
                <div className="border border-slate-200 rounded-xl p-4">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Commentaires</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{q.commentaires}</p>
                </div>
              )}
              {q.suggestions && (
                <div className="border border-slate-200 rounded-xl p-4">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Suggestions</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{q.suggestions}</p>
                </div>
              )}
            </div>
          )}

          {/* Note tuteur */}
          <div className={cn('border-2 rounded-xl overflow-hidden', q.note_tuteur ? 'border-violet-300' : 'border-dashed border-slate-300')}>
            <div className={cn('px-4 py-2.5 flex items-center justify-between', q.note_tuteur ? 'bg-violet-50' : 'bg-slate-50')}>
              <div className="flex items-center gap-2">
                <FileText className={cn('h-4 w-4', q.note_tuteur ? 'text-violet-600' : 'text-slate-400')} />
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600">Note du tuteur / référent</span>
                {q.note_tuteur && <span className="text-xs text-violet-600 font-semibold">✓ Renseignée</span>}
              </div>
              {!readOnly && (
                <button
                  onClick={() => setTuteurMode(v => !v)}
                  className={cn('text-xs font-medium px-3 py-1 rounded-lg border transition-colors',
                    q.note_tuteur
                      ? 'text-violet-700 border-violet-300 bg-white hover:bg-violet-50'
                      : 'text-orange-700 border-orange-300 bg-white hover:bg-orange-50',
                  )}
                >
                  {q.note_tuteur ? 'Modifier' : 'Ajouter une note'}
                </button>
              )}
            </div>
            {tuteurMode && !readOnly ? (
              <div className="px-4 py-3 space-y-2">
                <textarea
                  value={tuteurNote}
                  onChange={e => setTuteurNote(e.target.value)}
                  rows={3}
                  placeholder="Observations, contexte, points d'attention du tuteur…"
                  className="w-full px-3 py-2 rounded-lg border border-violet-200 bg-violet-50 text-sm resize-none focus:outline-none focus:border-violet-400"
                />
                <div className="flex gap-2">
                  <button onClick={() => setTuteurMode(false)} className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Annuler</button>
                  <button onClick={handleSaveTuteur} disabled={saving} className="text-xs px-3 py-1.5 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50">
                    {saving ? 'Enregistrement…' : 'Valider'}
                  </button>
                </div>
              </div>
            ) : q.note_tuteur ? (
              <div className="px-4 py-3">
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{q.note_tuteur}</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Distribution bar (4 couleurs) ─────────────────────────────────────────────

function DistributionBar({ records, questionKey, label }: {
  records: QuestionnaireRecord[];
  questionKey: string;
  label: string;
}) {
  const counts = [0, 0, 0, 0];
  let total = 0;
  records.forEach(r => {
    const v = parseInt((r as unknown as Record<string, string>)[questionKey] ?? '', 10);
    if (v >= 1 && v <= 4) { counts[v - 1]++; total++; }
  });
  const avg = total > 0 ? counts.reduce((s, c, i) => s + c * (i + 1), 0) / total : 0;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-700 font-medium">{label}</span>
        <span className="text-sm font-bold text-violet-700">{avg > 0 ? avg.toFixed(2) : '—'}</span>
      </div>
      {total > 0 ? (
        <div className="flex h-5 rounded-full overflow-hidden">
          {SCALE.map((s, i) => {
            const pct = (counts[i] / total) * 100;
            return pct > 0 ? (
              <div
                key={s.value}
                title={`${s.label} : ${counts[i]} (${Math.round(pct)}%)`}
                style={{ width: `${pct}%`, backgroundColor: s.color }}
                className="flex items-center justify-center text-white text-[10px] font-bold"
              >
                {pct > 8 ? counts[i] : ''}
              </div>
            ) : null;
          })}
        </div>
      ) : (
        <div className="h-5 bg-slate-100 rounded-full" />
      )}
      <div className="flex gap-3 flex-wrap">
        {SCALE.map((s, i) => (
          <span key={s.value} className="flex items-center gap-1 text-[10px] text-slate-500">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: s.color }} />
            {s.short} ({counts[i]})
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Vue Analyses ──────────────────────────────────────────────────────────────

const COMPARE_COLORS = ['#7c3aed', '#3b82f6', '#f97316', '#22c55e', '#ec4899'];

function AnalysesView({ allRecords, readOnly }: { allRecords: QuestionnaireRecord[]; readOnly: boolean }) {
  const qc = useQueryClient();
  const [filterStatut, setFilterStatut] = useState<'all' | 'esi' | 'eas'>('all');
  const [filterAnnee, setFilterAnnee]   = useState<string>('all');
  const [showCompare, setShowCompare]   = useState(false);
  const [saveTitle, setSaveTitle]       = useState('');
  const [saving, setSaving]             = useState(false);

  const { data: savedAnalyses = [] } = useQuery({
    queryKey: ['analyse_questionnaire'],
    queryFn: fetchAnalyses,
  });

  const deleteAnalyseMut = useMutation({
    mutationFn: deleteAnalyse,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['analyse_questionnaire'] }),
  });

  const saveAnalyseMut = useMutation({
    mutationFn: saveAnalyse,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['analyse_questionnaire'] }); setSaveTitle(''); },
  });

  const anneesScolaires = useMemo(() =>
    [...new Set(allRecords.map(r => r.annee_scolaire))].sort().reverse(),
    [allRecords]
  );

  const filtered = useMemo(() => allRecords.filter(r => {
    if (filterStatut !== 'all' && r.statut_etudiant !== filterStatut) return false;
    if (filterAnnee  !== 'all' && r.annee_scolaire  !== filterAnnee)  return false;
    return true;
  }), [allRecords, filterStatut, filterAnnee]);

  const globalAvg = computeGlobalAvg(filtered);
  const questions = filterStatut === 'eas' ? QUESTIONS_BASE : [...QUESTIONS_BASE, ...QUESTIONS_ESI];

  const handleSave = async () => {
    if (!saveTitle.trim() || filtered.length === 0) return;
    setSaving(true);
    try {
      const ratings_data: RatingPoint[] = questions.map(q => ({
        key: q.key, label: q.label, avg: computeAvg(filtered, q.key),
      }));
      await saveAnalyseMut.mutateAsync({
        titre: saveTitle.trim(),
        statut_etudiant: filterStatut === 'all' ? undefined : filterStatut,
        annee_scolaire:  filterAnnee  === 'all' ? undefined : filterAnnee,
        questionnaire_ids: filtered.map(r => r.id),
        stats: { total: filtered.length, moyenne: parseFloat(globalAvg.toFixed(2)) },
        ratings_data,
      });
    } finally { setSaving(false); }
  };

  // Données comparaison : 1 ligne par question
  const compareData = useMemo(() => {
    if (savedAnalyses.length < 2) return [];
    return [...QUESTIONS_BASE, ...QUESTIONS_ESI].map(q => {
      const row: Record<string, string | number> = { label: q.label };
      savedAnalyses.forEach(a => {
        const pt = (a.ratings_data ?? []).find((r: RatingPoint) => r.key === q.key);
        if (pt) row[a.titre] = parseFloat(pt.avg.toFixed(2));
      });
      return row;
    });
  }, [savedAnalyses]);

  return (
    <div className="space-y-5">
      {/* Filtres */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Filtrer les questionnaires à analyser</p>
        <div className="flex flex-wrap gap-3">
          <div className="flex gap-1">
            {[['all', 'Tous'], ['esi', 'ESI'], ['eas', 'EAS']].map(([v, l]) => (
              <button key={v} onClick={() => setFilterStatut(v as 'all' | 'esi' | 'eas')}
                className={cn('px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
                  filterStatut === v ? 'bg-violet-600 border-violet-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-violet-300',
                )}>{l}</button>
            ))}
          </div>
          <select value={filterAnnee} onChange={e => setFilterAnnee(e.target.value)}
            className="px-3 py-1.5 rounded-lg text-sm border border-slate-200 bg-white focus:outline-none focus:border-violet-400">
            <option value="all">Toutes les années scolaires</option>
            {anneesScolaires.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <p className="text-xs text-slate-400 mt-2">{filtered.length} questionnaire{filtered.length !== 1 ? 's' : ''} sélectionné{filtered.length !== 1 ? 's' : ''}</p>
      </div>

      {filtered.length === 0 ? (
        <div className="py-12 text-center bg-white rounded-2xl border border-slate-200">
          <BarChart2 className="h-10 w-10 mx-auto text-slate-200 mb-3" />
          <p className="text-slate-500 font-medium">Aucun questionnaire pour ces filtres</p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Questionnaires</p>
              <p className="text-3xl font-black text-slate-800">{filtered.length}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Moyenne globale</p>
              <p className="text-3xl font-black text-slate-800">{globalAvg.toFixed(2)}</p>
              <p className="text-xs text-slate-400 mt-0.5">sur 4</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Satisfaction</p>
              <p className="text-3xl font-black text-slate-800">{Math.round((globalAvg / 4) * 100)}%</p>
            </div>
          </div>

          {/* Distribution */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-sm font-bold text-slate-700 mb-5">Distribution des réponses par question</p>
            <div className="space-y-5">
              {questions.map(q => (
                <div key={q.key}>
                  {q.key === 'objectifs_role_propre' && (
                    <p className="text-xs font-semibold text-violet-600 uppercase tracking-wide mb-4 border-t border-violet-100 pt-3">
                      Questions spécifiques ESI
                    </p>
                  )}
                  <DistributionBar records={filtered} questionKey={q.key} label={q.label} />
                </div>
              ))}
            </div>
          </div>

          {/* Sauvegarder */}
          {!readOnly && (
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                <Save className="h-4 w-4 text-violet-600" /> Sauvegarder cette analyse
              </p>
              <div className="flex gap-2">
                <input
                  type="text" value={saveTitle}
                  onChange={e => setSaveTitle(e.target.value)}
                  placeholder={`ex : ESI ${filterAnnee !== 'all' ? filterAnnee : getAnneeScolaire()} — ${filtered.length} questionnaires`}
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-violet-400"
                />
                <button onClick={handleSave} disabled={!saveTitle.trim() || saving}
                  className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700 disabled:opacity-40 transition-colors">
                  {saving ? 'Enregistrement…' : 'Sauvegarder'}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Analyses sauvegardées */}
      {savedAnalyses.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-violet-600" /> Analyses sauvegardées ({savedAnalyses.length})
            </p>
            {savedAnalyses.length >= 2 && (
              <button onClick={() => setShowCompare(v => !v)}
                className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
                  showCompare ? 'bg-violet-600 border-violet-600 text-white' : 'border-violet-300 text-violet-700 hover:bg-violet-50',
                )}>
                <TrendingUp className="h-3.5 w-3.5" /> Comparer
                {showCompare ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
            )}
          </div>

          <div className="space-y-2">
            {savedAnalyses.map(a => (
              <div key={a.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{a.titre}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {a.stats.total} questionnaire{a.stats.total !== 1 ? 's' : ''} · moy. {Number(a.stats.moyenne).toFixed(2)}/4 · {fmtDate(a.created_at)}
                  </p>
                </div>
                {!readOnly && (
                  <button onClick={() => deleteAnalyseMut.mutate(a.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Graphique de comparaison */}
          {showCompare && compareData.length > 0 && (
            <div className="pt-3 border-t border-slate-100">
              <p className="text-sm font-bold text-slate-700 mb-4">Comparaison — scores moyens par question</p>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={compareData} margin={{ top: 5, right: 20, left: -10, bottom: 90 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} angle={-35} textAnchor="end" interval={0} height={90} />
                  <YAxis domain={[0, 4]} ticks={[0, 1, 2, 3, 4]} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e2e8f0' }} labelStyle={{ fontWeight: 600 }} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  {savedAnalyses.slice(0, 5).map((a, i) => (
                    <Line key={a.id} type="monotone" dataKey={a.titre}
                      stroke={COMPARE_COLORS[i % COMPARE_COLORS.length]} strokeWidth={2}
                      dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Graphiques de satisfaction ────────────────────────────────────────────────

const RADAR_LABELS: Record<string, string> = {
  accueil: 'Accueil', deroulement: 'Déroulement', planning: 'Planning',
  encadrement_as: 'Encadr. AS', encadrement_ide: 'Encadr. IDE',
  objectifs: 'Objectifs', relationnel_ash: 'Relat. ASH',
  relationnel_as: 'Relat. AS', relationnel_ide: 'Relat. IDE',
  relationnel_tuteurs: 'Tuteurs',
};

const PIE_COLORS = ['#ef4444', '#f97316', '#84cc16', '#22c55e'];

function GraphiquesView({ allRecords }: { allRecords: QuestionnaireRecord[] }) {
  const [filterAnnee, setFilterAnnee] = useState('all');

  const anneesScolaires = useMemo(() =>
    [...new Set(allRecords.map(r => r.annee_scolaire))].sort().reverse(),
    [allRecords]
  );

  const records = useMemo(() =>
    filterAnnee === 'all' ? allRecords : allRecords.filter(r => r.annee_scolaire === filterAnnee),
    [allRecords, filterAnnee]
  );

  const esiRecs = records.filter(r => r.statut_etudiant === 'esi');
  const easRecs = records.filter(r => r.statut_etudiant === 'eas');

  const avgEsi = computeGlobalAvg(esiRecs);
  const avgEas = computeGlobalAvg(easRecs);

  // Radar : 10 questions communes
  const radarData = QUESTIONS_BASE.map(q => ({
    question: RADAR_LABELS[q.key] ?? q.label,
    ESI: parseFloat(computeAvg(esiRecs, q.key).toFixed(2)),
    EAS: parseFloat(computeAvg(easRecs, q.key).toFixed(2)),
  }));

  // Barres groupées par question (toutes questions)
  const barData = QUESTIONS_BASE.map(q => ({
    label: RADAR_LABELS[q.key] ?? q.label,
    ESI: parseFloat(computeAvg(esiRecs, q.key).toFixed(2)),
    EAS: parseFloat(computeAvg(easRecs, q.key).toFixed(2)),
  }));
  const barDataEsi = QUESTIONS_ESI.map(q => ({
    label: q.label.replace('Objectifs ', 'Obj. '),
    ESI: parseFloat(computeAvg(esiRecs, q.key).toFixed(2)),
    EAS: 0,
  }));

  // Évolution par année scolaire
  const evolutionData = useMemo(() => {
    return anneesScolaires.map(yr => {
      const yrEsi = allRecords.filter(r => r.annee_scolaire === yr && r.statut_etudiant === 'esi');
      const yrEas = allRecords.filter(r => r.annee_scolaire === yr && r.statut_etudiant === 'eas');
      return {
        annee: yr,
        ESI: yrEsi.length > 0 ? parseFloat(computeGlobalAvg(yrEsi).toFixed(2)) : null,
        EAS: yrEas.length > 0 ? parseFloat(computeGlobalAvg(yrEas).toFixed(2)) : null,
        nESI: yrEsi.length,
        nEAS: yrEas.length,
      };
    }).reverse(); // chronologique
  }, [allRecords, anneesScolaires]);

  // Répartition des notes (donut) pour ESI et EAS
  function buildPie(recs: QuestionnaireRecord[]) {
    const counts = [0, 0, 0, 0];
    recs.forEach(r => {
      QUESTIONS_BASE.forEach(q => {
        const v = parseInt((r as unknown as Record<string, string>)[q.key] ?? '', 10);
        if (v >= 1 && v <= 4) counts[v - 1]++;
      });
    });
    const total = counts.reduce((a, b) => a + b, 0);
    return SCALE.map((s, i) => ({
      name: s.short,
      value: counts[i],
      pct: total > 0 ? Math.round((counts[i] / total) * 100) : 0,
    }));
  }
  const pieEsi = buildPie(esiRecs);
  const pieEas = buildPie(easRecs);

  if (allRecords.length === 0) {
    return (
      <div className="py-20 text-center bg-white rounded-2xl border border-slate-200">
        <BarChart2 className="h-12 w-12 mx-auto text-slate-200 mb-4" />
        <p className="text-slate-500 font-medium">Aucune donnée disponible</p>
      </div>
    );
  }

  const CustomTooltipRadar = ({ active, payload }: { active?: boolean; payload?: { name: string; value: number }[] }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-lg text-xs">
        {payload.map(p => (
          <p key={p.name} className="font-semibold" style={{ color: p.name === 'ESI' ? '#7c3aed' : '#3b82f6' }}>
            {p.name} : {p.value.toFixed(2)} / 4
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Filtre */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4 flex-wrap">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Année scolaire</span>
        <div className="flex gap-1 flex-wrap">
          <button onClick={() => setFilterAnnee('all')}
            className={cn('px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
              filterAnnee === 'all' ? 'bg-violet-600 border-violet-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-violet-300')}>
            Toutes
          </button>
          {anneesScolaires.map(a => (
            <button key={a} onClick={() => setFilterAnnee(a)}
              className={cn('px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
                filterAnnee === a ? 'bg-violet-600 border-violet-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-violet-300')}>
              {a}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">ESI</p>
          <p className="text-3xl font-black text-slate-800">{esiRecs.length}</p>
          <p className="text-xs text-slate-400 mt-0.5">questionnaire{esiRecs.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">EAS</p>
          <p className="text-3xl font-black text-slate-800">{easRecs.length}</p>
          <p className="text-xs text-slate-400 mt-0.5">questionnaire{easRecs.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Moy. ESI</p>
          <p className="text-3xl font-black text-violet-700">{esiRecs.length > 0 ? avgEsi.toFixed(2) : '—'}</p>
          <p className="text-xs text-slate-400 mt-0.5">sur 4</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Moy. EAS</p>
          <p className="text-3xl font-black text-blue-700">{easRecs.length > 0 ? avgEas.toFixed(2) : '—'}</p>
          <p className="text-xs text-slate-400 mt-0.5">sur 4</p>
        </div>
      </div>

      {/* Radar ESI vs EAS */}
      {esiRecs.length > 0 && easRecs.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-violet-600" />
            Profil de satisfaction ESI vs EAS — 10 critères communs
          </p>
          <ResponsiveContainer width="100%" height={320}>
            <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
              <PolarGrid stroke="#e2e8f0" />
              <PolarAngleAxis dataKey="question" tick={{ fontSize: 11, fill: '#475569' }} />
              <PolarRadiusAxis angle={90} domain={[0, 4]} tick={{ fontSize: 10, fill: '#94a3b8' }} tickCount={5} />
              <Radar name="ESI" dataKey="ESI" stroke="#7c3aed" fill="#7c3aed" fillOpacity={0.25} strokeWidth={2} dot />
              <Radar name="EAS" dataKey="EAS" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} strokeWidth={2} dot />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Tooltip content={<CustomTooltipRadar />} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Barres groupées par question */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <p className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
          <BarChart2 className="h-4 w-4 text-blue-500" />
          Scores moyens par question
        </p>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart
            data={barData}
            margin={{ top: 5, right: 20, left: -10, bottom: 60 }}
            barCategoryGap="30%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} angle={-30} textAnchor="end" interval={0} height={70} />
            <YAxis domain={[0, 4]} ticks={[0, 1, 2, 3, 4]} tick={{ fontSize: 11, fill: '#64748b' }} />
            <Tooltip
              contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e2e8f0' }}
              formatter={(v: number) => [`${v.toFixed(2)} / 4`, '']}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {esiRecs.length > 0 && <Bar dataKey="ESI" fill="#7c3aed" radius={[3, 3, 0, 0]} />}
            {easRecs.length > 0 && <Bar dataKey="EAS" fill="#3b82f6" radius={[3, 3, 0, 0]} />}
          </BarChart>
        </ResponsiveContainer>
        {/* Questions ESI uniquement */}
        {esiRecs.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-xs font-semibold text-violet-600 uppercase tracking-wide mb-3">Questions spécifiques ESI</p>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={barDataEsi} margin={{ top: 5, right: 20, left: -10, bottom: 40 }} barCategoryGap="40%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} angle={-20} textAnchor="end" interval={0} height={50} />
                <YAxis domain={[0, 4]} ticks={[0, 1, 2, 3, 4]} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [`${v.toFixed(2)} / 4`, 'ESI']} />
                <Bar dataKey="ESI" fill="#7c3aed" radius={[3, 3, 0, 0]} maxBarSize={60} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Évolution par année scolaire */}
      {evolutionData.length >= 2 && (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <p className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-500" />
            Évolution de la satisfaction globale par année scolaire
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={evolutionData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="annee" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis domain={[0, 4]} ticks={[0, 1, 2, 3, 4]} tick={{ fontSize: 11, fill: '#64748b' }} />
              <Tooltip
                contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #e2e8f0' }}
                formatter={(v: number, name: string, props: { payload: { nESI: number; nEAS: number } }) => {
                  const n = name === 'ESI' ? props.payload.nESI : props.payload.nEAS;
                  return [`${v.toFixed(2)} / 4 (n=${n})`, name];
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="ESI" stroke="#7c3aed" strokeWidth={2.5} dot={{ r: 5 }} activeDot={{ r: 7 }} connectNulls />
              <Line type="monotone" dataKey="EAS" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 5 }} activeDot={{ r: 7 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Répartition des notes — donuts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {esiRecs.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-sm font-bold text-slate-700 mb-1">Répartition des notes — ESI</p>
            <p className="text-xs text-slate-400 mb-4">{esiRecs.length} questionnaire{esiRecs.length !== 1 ? 's' : ''}</p>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieEsi} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} label={({ name, pct }) => pct > 5 ? `${name} ${pct}%` : ''} labelLine={false}>
                  {pieEsi.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                </Pie>
                <Tooltip formatter={(v: number, _: string, props: { payload: { name: string; pct: number } }) => [`${v} réponses (${props.payload.pct}%)`, props.payload.name]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-2 justify-center mt-1">
              {SCALE.map((s, i) => (
                <span key={s.value} className="flex items-center gap-1 text-xs text-slate-600">
                  <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: PIE_COLORS[i] }} />
                  {s.short} ({pieEsi[i]?.value ?? 0})
                </span>
              ))}
            </div>
          </div>
        )}
        {easRecs.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <p className="text-sm font-bold text-slate-700 mb-1">Répartition des notes — EAS</p>
            <p className="text-xs text-slate-400 mb-4">{easRecs.length} questionnaire{easRecs.length !== 1 ? 's' : ''}</p>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieEas} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} label={({ name, pct }) => pct > 5 ? `${name} ${pct}%` : ''} labelLine={false}>
                  {pieEas.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                </Pie>
                <Tooltip formatter={(v: number, _: string, props: { payload: { name: string; pct: number } }) => [`${v} réponses (${props.payload.pct}%)`, props.payload.name]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-2 justify-center mt-1">
              {SCALE.map((s, i) => (
                <span key={s.value} className="flex items-center gap-1 text-xs text-slate-600">
                  <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: PIE_COLORS[i] }} />
                  {s.short} ({pieEas[i]?.value ?? 0})
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Rapport IA ────────────────────────────────────────────────────────────────

function RapportIAView({ allRecords }: { allRecords: QuestionnaireRecord[] }) {
  const [filterStatut, setFilterStatut] = useState<'all' | 'esi' | 'eas'>('all');
  const [filterAnnee,  setFilterAnnee]  = useState('all');
  const [loading, setLoading]           = useState(false);
  const [rapport,  setRapport]          = useState('');
  const [error,    setError]            = useState('');

  const anneesScolaires = useMemo(() =>
    [...new Set(allRecords.map(r => r.annee_scolaire))].sort().reverse(),
    [allRecords]
  );

  const records = useMemo(() => {
    return allRecords.filter(r => {
      if (filterStatut !== 'all' && r.statut_etudiant !== filterStatut) return false;
      if (filterAnnee  !== 'all' && r.annee_scolaire  !== filterAnnee)  return false;
      return true;
    });
  }, [allRecords, filterStatut, filterAnnee]);

  const esiRecs = records.filter(r => r.statut_etudiant === 'esi');
  const easRecs = records.filter(r => r.statut_etudiant === 'eas');

  const buildStats = () => {
    const lines: string[] = [];
    const groups: { label: string; recs: QuestionnaireRecord[] }[] = [];
    if (esiRecs.length > 0) groups.push({ label: 'ESI', recs: esiRecs });
    if (easRecs.length > 0) groups.push({ label: 'EAS', recs: easRecs });

    groups.forEach(({ label, recs }) => {
      lines.push(`\n### ${label} (n=${recs.length}) — Moyenne globale : ${computeGlobalAvg(recs).toFixed(2)}/4`);
      const qs = label === 'ESI' ? [...QUESTIONS_BASE, ...QUESTIONS_ESI] : QUESTIONS_BASE;
      qs.forEach(q => {
        const avg = computeAvg(recs, q.key);
        if (avg > 0) lines.push(`- ${q.label} : ${avg.toFixed(2)}/4`);
      });
    });
    return lines.join('\n');
  };

  const buildCommentaires = () => {
    return records
      .filter(r => r.commentaires?.trim())
      .map(r => `[${r.statut_etudiant.toUpperCase()} ${r.annee_etude}e année ${r.annee_scolaire}] "${r.commentaires}"`)
      .join('\n');
  };

  const buildSuggestions = () => {
    return records
      .filter(r => r.suggestions?.trim())
      .map(r => `[${r.statut_etudiant.toUpperCase()} ${r.annee_etude}e année ${r.annee_scolaire}] "${r.suggestions}"`)
      .join('\n');
  };

  const handleGenerate = async () => {
    if (records.length === 0) return;
    setLoading(true);
    setRapport('');
    setError('');
    try {
      const filtres = [
        filterStatut !== 'all' ? filterStatut.toUpperCase() : 'ESI + EAS',
        filterAnnee  !== 'all' ? `Année scolaire ${filterAnnee}` : 'Toutes années scolaires',
        `${records.length} questionnaire${records.length > 1 ? 's' : ''}`,
      ].join(' · ');

      const res = await fetch('/api/rapport-etudiants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stats: buildStats(),
          commentaires: buildCommentaires(),
          suggestions: buildSuggestions(),
          filtres,
        }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else setRapport(data.rapport ?? '');
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  // Rendu Markdown simple → HTML
  const renderMarkdown = (md: string) => {
    return md
      .replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold text-slate-800 mt-6 mb-2 pb-1 border-b border-slate-200">$1</h2>')
      .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold text-violet-700 mt-4 mb-1">$1</h3>')
      .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-slate-700">$1</li>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^(?!<[hli])(.+)$/gm, '<p class="text-slate-700 mb-2">$1</p>')
      .replace(/<\/li>\n<li/g, '</li><li')
      .replace(/(<li.*<\/li>)/gs, '<ul class="space-y-1 mb-3">$1</ul>');
  };

  const filtresLabel = [
    filterStatut !== 'all' ? filterStatut.toUpperCase() : 'ESI + EAS',
    filterAnnee  !== 'all' ? filterAnnee : 'Toutes années',
  ].join(' · ');

  return (
    <div className="space-y-5">
      {/* Paramètres */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <p className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-violet-600" />
          Configurer le rapport
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Population</label>
            <div className="flex gap-2">
              {[['all', 'ESI + EAS'], ['esi', 'ESI uniquement'], ['eas', 'EAS uniquement']].map(([v, l]) => (
                <button key={v} onClick={() => setFilterStatut(v as 'all' | 'esi' | 'eas')}
                  className={cn('flex-1 py-2 rounded-xl text-xs font-semibold border-2 transition-all',
                    filterStatut === v ? 'bg-violet-600 border-violet-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-violet-300'
                  )}>{l}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Période</label>
            <select value={filterAnnee} onChange={e => setFilterAnnee(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border-2 border-slate-200 text-sm bg-white focus:outline-none focus:border-violet-400">
              <option value="all">Toutes les années scolaires</option>
              {anneesScolaires.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>

        {/* Résumé des données sélectionnées */}
        <div className="flex items-center gap-3 p-3 bg-violet-50 border border-violet-200 rounded-xl mb-4 flex-wrap">
          <span className="text-xs font-semibold text-violet-700">{filtresLabel}</span>
          <span className="text-xs text-slate-500">—</span>
          <span className="text-xs text-slate-600">{records.length} questionnaire{records.length !== 1 ? 's' : ''}</span>
          {esiRecs.length > 0 && <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">ESI : {esiRecs.length} (moy. {computeGlobalAvg(esiRecs).toFixed(2)}/4)</span>}
          {easRecs.length > 0 && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">EAS : {easRecs.length} (moy. {computeGlobalAvg(easRecs).toFixed(2)}/4)</span>}
        </div>

        <button
          onClick={handleGenerate}
          disabled={loading || records.length === 0}
          className={cn(
            'w-full py-3.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2',
            loading || records.length === 0
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-violet-600 to-violet-700 hover:from-violet-700 hover:to-violet-800 text-white shadow-md hover:shadow-lg',
          )}
        >
          {loading ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Génération en cours…
            </>
          ) : (
            <>
              ✨ Générer le rapport IA
            </>
          )}
        </button>
        {records.length === 0 && (
          <p className="text-xs text-slate-400 text-center mt-2">Aucun questionnaire pour cette sélection</p>
        )}
      </div>

      {/* Erreur */}
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Rapport généré */}
      {rapport && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          {/* Header rapport */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-violet-50 to-white">
            <div>
              <p className="font-bold text-slate-800 text-base flex items-center gap-2">
                ✨ Rapport de satisfaction — {filtresLabel}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Généré le {new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })} · {records.length} questionnaire{records.length !== 1 ? 's' : ''} analysé{records.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-sm"
            >
              <Printer className="h-4 w-4" /> Imprimer
            </button>
          </div>

          {/* Corps du rapport */}
          <div
            id="rapport-print"
            className="px-6 py-5 prose max-w-none"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(rapport) }}
          />

          {/* Graphiques récapitulatifs sous le rapport */}
          <div className="px-6 pb-6 border-t border-slate-100 pt-4 space-y-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Données graphiques associées</p>
            {/* Barres ESI vs EAS */}
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={QUESTIONS_BASE.map(q => ({
                  label: RADAR_LABELS[q.key] ?? q.label,
                  ...(esiRecs.length > 0 ? { ESI: parseFloat(computeAvg(esiRecs, q.key).toFixed(2)) } : {}),
                  ...(easRecs.length > 0 ? { EAS: parseFloat(computeAvg(easRecs, q.key).toFixed(2)) } : {}),
                }))}
                margin={{ top: 5, right: 20, left: -10, bottom: 60 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} angle={-30} textAnchor="end" interval={0} height={70} />
                <YAxis domain={[0, 4]} ticks={[0, 1, 2, 3, 4]} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [`${v.toFixed(2)} / 4`, '']} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {esiRecs.length > 0 && <Bar dataKey="ESI" fill="#7c3aed" radius={[3, 3, 0, 0]} />}
                {easRecs.length > 0 && <Bar dataKey="EAS" fill="#3b82f6" radius={[3, 3, 0, 0]} />}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

type Tab = 'form' | 'history' | 'analyses' | 'graphiques' | 'rapport';

export default function QuestionnairesEtudiantsPage() {
  const qc = useQueryClient();
  const access   = useModuleAccess('questionnairesEtudiants');
  const readOnly = access === 'read';

  const [tab, setTab]         = useState<Tab>('form');
  const [success, setSuccess] = useState(false);

  const [filterStatut,  setFilterStatut]  = useState<'all' | 'esi' | 'eas'>('all');
  const [filterAnneeE,  setFilterAnneeE]  = useState('all');
  const [filterAnneeSco, setFilterAnneeSco] = useState('all');

  const [viewQ,   setViewQ]   = useState<QuestionnaireRecord | null>(null);
  const [editQ,   setEditQ]   = useState<QuestionnaireRecord | null>(null);
  const [deleteQ, setDeleteQ] = useState<QuestionnaireRecord | null>(null);

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['questionnaire_etudiant'],
    queryFn: fetchQuestionnaires,
  });

  const createMut = useMutation({
    mutationFn: createQuestionnaire,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['questionnaire_etudiant'] }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<QuestionnaireFormData> }) => updateQuestionnaire(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['questionnaire_etudiant'] }); setEditQ(null); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteQuestionnaire(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['questionnaire_etudiant'] }); setDeleteQ(null); },
  });

  const anneesScolaires = useMemo(() => [...new Set(records.map(r => r.annee_scolaire))].sort().reverse(), [records]);

  const filtered = useMemo(() => records.filter(r => {
    if (filterStatut   !== 'all' && r.statut_etudiant !== filterStatut)   return false;
    if (filterAnneeE   !== 'all' && r.annee_etude     !== filterAnneeE)   return false;
    if (filterAnneeSco !== 'all' && r.annee_scolaire  !== filterAnneeSco) return false;
    return true;
  }), [records, filterStatut, filterAnneeE, filterAnneeSco]);

  const handleSubmit = async (data: QuestionnaireFormData) => {
    await createMut.mutateAsync(data);
    setSuccess(true);
  };

  const handleEdit = async (data: QuestionnaireFormData) => {
    if (!editQ) return;
    await updateMut.mutateAsync({ id: editQ.id, data });
  };

  const handleTuteur = async (note: string) => {
    if (!viewQ) return;
    await updateMut.mutateAsync({ id: viewQ.id, data: { note_tuteur: note } });
    setViewQ(prev => prev ? { ...prev, note_tuteur: note } : prev);
  };

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'form',       label: 'Formulaire',                    icon: <ClipboardList className="h-4 w-4" /> },
    { id: 'history',    label: `Historique (${records.length})`, icon: <Clock className="h-4 w-4" /> },
    { id: 'analyses',   label: 'Analyses',                      icon: <BarChart2 className="h-4 w-4" /> },
    { id: 'graphiques', label: 'Graphiques',                    icon: <TrendingUp className="h-4 w-4" /> },
    { id: 'rapport',    label: 'Rapport IA ✨',                 icon: <FileText className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen" style={{ background: '#dde4ee' }}>

      {/* Header violet */}
      <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)' }}>
        <div className="relative z-10 max-w-5xl mx-auto px-6 py-5">
          <div className="flex items-center gap-1.5 text-white/50 text-xs mb-4">
            <Link href="/" className="hover:text-white/80 transition-colors">Accueil</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-white/90">Questionnaires Étudiants</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <GraduationCap className="h-6 w-6 text-white" strokeWidth={1.5} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Questionnaires Étudiants</h1>
              <p className="text-white/70 text-sm">Satisfaction de stage ESI / EAS · Analyses · Comparaisons</p>
            </div>
          </div>
          <div className="flex gap-1 mt-5">
            {TABS.map(t => (
              <button key={t.id} onClick={() => { setTab(t.id); setSuccess(false); }}
                className={cn('flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors',
                  tab === t.id ? 'bg-white text-violet-700 shadow-sm' : 'text-white/70 hover:text-white hover:bg-white/15',
                )}>
                {t.icon}
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {readOnly && (
        <div className="max-w-5xl mx-auto px-4 mt-4">
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-sm text-blue-700 font-medium">
            <Eye className="h-4 w-4 flex-shrink-0" /> Vous consultez ce module en lecture seule.
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 py-6 pb-20">

        {/* ── Formulaire ── */}
        {tab === 'form' && (
          success ? (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-10 flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-slate-800">Questionnaire enregistré</h2>
              <p className="text-slate-500 text-sm max-w-sm">Merci pour votre retour ! Votre questionnaire de satisfaction a bien été enregistré.</p>
              <div className="flex gap-3 mt-2">
                <button onClick={() => setSuccess(false)} className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-semibold transition-colors">
                  Nouveau questionnaire
                </button>
                <button onClick={() => { setTab('history'); setSuccess(false); }} className="px-5 py-2.5 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-sm font-medium transition-colors">
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
                </div>
              ) : (
                <QuestionnaireForm onSubmit={handleSubmit} />
              )}
            </div>
          )
        )}

        {/* ── Historique ── */}
        {tab === 'history' && (
          <div className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Filtres</p>
              <div className="flex flex-wrap gap-3">
                <div className="flex gap-1">
                  {[['all', 'Tous'], ['esi', 'ESI'], ['eas', 'EAS']].map(([v, l]) => (
                    <button key={v} onClick={() => setFilterStatut(v as 'all' | 'esi' | 'eas')}
                      className={cn('px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
                        filterStatut === v ? 'bg-violet-600 border-violet-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-violet-300',
                      )}>{l}</button>
                  ))}
                </div>
                <div className="flex gap-1">
                  {[['all', 'Toutes années'], ['1', '1ère'], ['2', '2ème'], ['3', '3ème']].map(([v, l]) => (
                    <button key={v} onClick={() => setFilterAnneeE(v)}
                      className={cn('px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors',
                        filterAnneeE === v ? 'bg-violet-600 border-violet-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-violet-300',
                      )}>{l}</button>
                  ))}
                </div>
                <select value={filterAnneeSco} onChange={e => setFilterAnneeSco(e.target.value)}
                  className="px-3 py-1.5 rounded-lg text-sm border border-slate-200 bg-white focus:outline-none focus:border-violet-400">
                  <option value="all">Toutes années scolaires</option>
                  {anneesScolaires.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <p className="text-xs text-slate-400 mt-2">{filtered.length} résultat{filtered.length !== 1 ? 's' : ''}</p>
            </div>

            {isLoading ? (
              <div className="py-12 text-center text-slate-400">Chargement…</div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center bg-white rounded-2xl border border-slate-200">
                <GraduationCap className="h-10 w-10 mx-auto text-slate-200 mb-3" />
                <p className="text-slate-500 font-medium">
                  {records.length === 0 ? 'Aucun questionnaire enregistré' : 'Aucun résultat pour ces filtres'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map(r => {
                  const qs  = r.statut_etudiant === 'esi' ? [...QUESTIONS_BASE, ...QUESTIONS_ESI] : QUESTIONS_BASE;
                  const avg = computeGlobalAvg([r]);
                  return (
                    <div key={r.id} onClick={() => setViewQ(r)}
                      className="bg-white rounded-xl border-l-4 border-l-violet-400 border border-slate-200 p-4 hover:shadow-md transition-shadow cursor-pointer">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-bold text-slate-800 text-sm">{STATUT_LABEL[r.statut_etudiant]} — {ANNEE_LABEL[r.annee_etude]}</span>
                            <span className="text-xs bg-violet-100 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full font-semibold">{r.annee_scolaire}</span>
                            {r.note_tuteur && (
                              <span className="text-xs bg-green-100 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">✓ Note tuteur</span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400 mb-2">{fmtDate(r.date_soumission)}</p>
                          <div className="flex flex-wrap gap-1">
                            {qs.slice(0, 6).map(q => {
                              const v = (r as unknown as Record<string, string>)[q.key];
                              return v ? (
                                <span key={q.key} title={q.label}
                                  className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold"
                                  style={{ backgroundColor: NOTE_COLOR[parseInt(v)] }}>
                                  {v}
                                </span>
                              ) : null;
                            })}
                            {qs.length > 6 && <span className="text-xs text-slate-400 self-center">+{qs.length - 6}</span>}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-2xl font-black text-violet-700">{avg > 0 ? avg.toFixed(1) : '—'}</p>
                          <p className="text-xs text-slate-400">/4</p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                          <button onClick={() => setViewQ(r)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"><Eye className="h-4 w-4" /></button>
                          {!readOnly && (
                            <>
                              <button onClick={() => setEditQ(r)} className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50"><Pencil className="h-4 w-4" /></button>
                              <button onClick={() => setDeleteQ(r)} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Analyses ── */}
        {tab === 'analyses' && (
          isLoading
            ? <div className="py-12 text-center text-slate-400">Chargement…</div>
            : <AnalysesView allRecords={records} readOnly={readOnly} />
        )}

        {/* ── Analyses graphiques ── */}
        {tab === 'graphiques' && (
          isLoading
            ? <div className="py-12 text-center text-slate-400">Chargement…</div>
            : <GraphiquesView allRecords={records} />
        )}

        {/* ── Rapport IA ── */}
        {tab === 'rapport' && (
          isLoading
            ? <div className="py-12 text-center text-slate-400">Chargement…</div>
            : <RapportIAView allRecords={records} />
        )}
      </div>

      {/* Modals */}
      {viewQ && (
        <QuestionnaireDetail q={viewQ} onClose={() => setViewQ(null)}
          onEdit={() => { setEditQ(viewQ); setViewQ(null); }}
          onTuteur={handleTuteur} readOnly={readOnly} />
      )}

      {editQ && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
              <h2 className="font-bold text-slate-800">Modifier le questionnaire</h2>
              <button onClick={() => setEditQ(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </div>
            <div className="overflow-y-auto flex-1 px-5 py-4">
              <QuestionnaireForm initial={editQ} isEdit onSubmit={handleEdit} onCancel={() => setEditQ(null)} />
            </div>
          </div>
        </div>
      )}

      {deleteQ && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h2 className="font-bold text-slate-800 text-base mb-1">Supprimer ce questionnaire ?</h2>
            <p className="text-sm text-slate-500 mb-1">
              {STATUT_LABEL[deleteQ.statut_etudiant]} — {ANNEE_LABEL[deleteQ.annee_etude]} — {fmtDate(deleteQ.date_soumission)}
            </p>
            <p className="text-xs text-red-600 mb-5">Cette action est irréversible.</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteQ(null)} className="flex-1 py-2.5 rounded-xl text-sm border border-slate-200 text-slate-600 hover:bg-slate-50">Annuler</button>
              <button onClick={() => deleteMut.mutate(deleteQ.id)} disabled={deleteMut.isPending}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50">
                {deleteMut.isPending ? 'Suppression…' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
