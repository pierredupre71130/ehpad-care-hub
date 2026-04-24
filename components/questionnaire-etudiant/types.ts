// Types et constantes pour le module Questionnaire Étudiants

export type StatutEtudiant = 'esi' | 'eas';
export type AnneeEtude = '1' | '2' | '3';
export type NoteItem = '1' | '2' | '3' | '4' | '';

// ─── Questions ────────────────────────────────────────────────────────────────

export interface Question {
  key: string;
  label: string;
  esiOnly?: boolean;
}

export const QUESTIONS_BASE: Question[] = [
  { key: 'accueil',             label: 'Accueil' },
  { key: 'deroulement',         label: 'Déroulement du stage' },
  { key: 'planning',            label: 'Planning' },
  { key: 'encadrement_as',      label: 'Encadrement par AS' },
  { key: 'encadrement_ide',     label: 'Encadrement par IDE' },
  { key: 'objectifs',           label: 'Atteinte des objectifs' },
  { key: 'relationnel_ash',     label: 'Relationnel équipe ASH' },
  { key: 'relationnel_as',      label: 'Relationnel équipe AS' },
  { key: 'relationnel_ide',     label: 'Relationnel équipe IDE' },
  { key: 'relationnel_tuteurs', label: 'Relationnel tuteurs' },
];

export const QUESTIONS_ESI: Question[] = [
  { key: 'objectifs_role_propre',   label: 'Objectifs rôle propre',        esiOnly: true },
  { key: 'objectifs_prescription',  label: 'Objectifs sur prescription',   esiOnly: true },
];

export const ALL_QUESTION_KEYS = [
  ...QUESTIONS_BASE.map(q => q.key),
  ...QUESTIONS_ESI.map(q => q.key),
];

// ─── Échelle de satisfaction ──────────────────────────────────────────────────

export const SCALE = [
  { value: '1', label: 'Non satisfaisant',       short: 'Non Satisf.',  color: '#ef4444' },
  { value: '2', label: 'Moyennement satisfaisant', short: 'Moyen. Satisf.', color: '#f97316' },
  { value: '3', label: 'Satisfaisant',            short: 'Satisfaisant', color: '#84cc16' },
  { value: '4', label: 'Très satisfaisant',       short: 'Très Satisf.', color: '#22c55e' },
] as const;

// ─── Entités ──────────────────────────────────────────────────────────────────

export interface QuestionnaireRecord {
  id: string;
  date_soumission: string;       // timestamptz
  annee_scolaire: string;        // e.g. "2024-2025"
  statut_etudiant: StatutEtudiant;
  annee_etude: AnneeEtude;
  // Notes 1-4
  accueil?: NoteItem;
  deroulement?: NoteItem;
  planning?: NoteItem;
  encadrement_as?: NoteItem;
  encadrement_ide?: NoteItem;
  objectifs?: NoteItem;
  objectifs_role_propre?: NoteItem;
  objectifs_prescription?: NoteItem;
  relationnel_ash?: NoteItem;
  relationnel_as?: NoteItem;
  relationnel_ide?: NoteItem;
  relationnel_tuteurs?: NoteItem;
  // Qualitatif
  commentaires?: string;
  suggestions?: string;
  // Annotation tuteur (ajoutée a posteriori)
  note_tuteur?: string;
  created_at?: string;
  updated_at?: string;
}

export type QuestionnaireFormData = Omit<QuestionnaireRecord, 'id' | 'created_at' | 'updated_at'>;

export interface RatingPoint {
  key: string;
  label: string;
  avg: number;
}

export interface AnalyseRecord {
  id: string;
  titre: string;
  statut_etudiant?: string;
  annee_scolaire?: string;
  questionnaire_ids: string[];
  stats: { total: number; moyenne: number };
  ratings_data: RatingPoint[];
  created_at?: string;
}

export interface RapportIARecord {
  id: string;
  titre?: string;
  statut_filtre?: string;
  nb_reponses?: number;
  resultats?: {
    type: 'rapport_ia';
    rapport_text: string;
    filtres_label: string;
  };
  commentaires?: string;
  created_at: string;
}

// ─── Utilitaires ──────────────────────────────────────────────────────────────

export function getAnneeScolaire(date = new Date()): string {
  const y = date.getFullYear();
  const m = date.getMonth(); // 0-based, 7 = août
  return m >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

export function noteLabel(v?: NoteItem | string): string {
  return SCALE.find(s => s.value === v)?.label ?? '—';
}

export function noteColor(v?: NoteItem | string): string {
  return SCALE.find(s => s.value === v)?.color ?? '#e2e8f0';
}

export function computeAvg(records: QuestionnaireRecord[], key: string): number {
  const vals = records
    .map(r => parseFloat((r as unknown as Record<string, string>)[key] ?? ''))
    .filter(n => !isNaN(n));
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function computeGlobalAvg(records: QuestionnaireRecord[]): number {
  let sum = 0, count = 0;
  records.forEach(r => {
    const questions = r.statut_etudiant === 'esi'
      ? [...QUESTIONS_BASE, ...QUESTIONS_ESI]
      : QUESTIONS_BASE;
    questions.forEach(q => {
      const v = parseFloat((r as unknown as Record<string, string>)[q.key] ?? '');
      if (!isNaN(v)) { sum += v; count++; }
    });
  });
  return count > 0 ? sum / count : 0;
}

// ─── Formulaire vide ──────────────────────────────────────────────────────────

export const DEFAULT_FORM: QuestionnaireFormData = {
  date_soumission: new Date().toISOString(),
  annee_scolaire: getAnneeScolaire(),
  statut_etudiant: 'esi',
  annee_etude: '1',
  accueil: '',
  deroulement: '',
  planning: '',
  encadrement_as: '',
  encadrement_ide: '',
  objectifs: '',
  objectifs_role_propre: '',
  objectifs_prescription: '',
  relationnel_ash: '',
  relationnel_as: '',
  relationnel_ide: '',
  relationnel_tuteurs: '',
  commentaires: '',
  suggestions: '',
  note_tuteur: '',
};
