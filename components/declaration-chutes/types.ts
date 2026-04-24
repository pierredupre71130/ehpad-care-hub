// Types et constantes pour le module Déclaration de Chutes

export interface LogModification {
  date: string;
  user: string;
  changes: string;
}

export interface ChuteRecord {
  id: string;
  // Étape 1 — Patient
  patient_nom: string;
  patient_prenom?: string;
  sexe?: string;
  age?: number;
  date_naissance?: string;
  unite?: string;
  chambre?: string;
  // Étape 2 — Circonstances
  date_chute: string;
  heure_chute?: string;
  lieu?: string;
  lieu_autre?: string;
  activite?: string;
  activite_autre?: string;
  chaussage?: string;
  chaussage_autre?: string;
  temoin?: string;
  // Étape 3 — Facteurs
  facteurs_intrinseques?: string[];
  facteurs_intrinseques_autre?: string;
  facteurs_extrinseques?: string[];
  facteurs_extrinseques_autre?: string;
  // Étape 4 — Conséquences & Actions
  consequences?: string[];
  consequences_autre?: string;
  actions_immediates?: string[];
  actions_immediates_autre?: string;
  actions_preventives?: string[];
  actions_preventives_autre?: string;
  // Étape 5 — Déclarant
  declarant?: string;
  informations_complementaires?: string;
  // Analyse pharmaceutique
  pharma_complete?: boolean;
  pharma_par?: string;
  pharma_date?: string;
  medicaments?: string;
  nombre_medicaments?: number;
  polymedication?: boolean;
  classes_risque?: string[];
  modifications_recentes?: boolean;
  modifications_recentes_details?: string;
  commentaires_pharma?: string;
  // Audit
  log_modifications?: LogModification[];
  created_at?: string;
  updated_at?: string;
}

export type ChuteFormData = Omit<ChuteRecord, 'id' | 'created_at' | 'updated_at'>;

// ─── Listes d'options ─────────────────────────────────────────────────────────

export const LIEUX = [
  'Chambre', 'Couloir', 'Salle de bain/WC', 'Salle commune',
  'Extérieur', 'Escaliers', 'Autre',
] as const;

export const ACTIVITES = [
  'En se levant', 'En marchant', 'En se rendant aux toilettes',
  "Lors d'un transfert", 'Pendant la toilette', 'En dormant/Au repos', 'Autre',
] as const;

export const CHAUSSAGES = [
  'Chaussures fermées', 'Chaussons', 'Pieds nus',
  'Chaussettes seules', 'Chaussures inadaptées', 'Autre',
] as const;

export const FACTEURS_INTRINSEQUES = [
  'Troubles de la marche/équilibre', 'Troubles cognitifs/confusion',
  'Hypotension orthostatique', 'Malaise/vertige', 'Agitation', 'Troubles visuels',
  'Faiblesse musculaire', 'Douleur', 'Incontinence/urgence mictionnelle',
  'Médicaments (psychotropes, antihypertenseurs...)', 'Pathologie aiguë', 'Autre',
] as const;

export const FACTEURS_EXTRINSEQUES = [
  'Sol mouillé/glissant', 'Obstacle au sol', 'Éclairage insuffisant',
  'Lit/brancard trop haut', 'Barrières de lit absentes/mal positionnées',
  'Absence de chaussures adaptées', 'Matériel défectueux', 'Environnement encombré', 'Autre',
] as const;

export const CONSEQUENCES = [
  'Aucune lésion apparente', 'Douleur sans lésion visible', 'Hématome/ecchymose',
  'Plaie superficielle', 'Plaie profonde', 'Fracture suspectée', 'Fracture confirmée',
  'Traumatisme crânien', 'Hospitalisation/transfert', 'Décès', 'Autre',
] as const;

export const ACTIONS_IMMEDIATES = [
  "Évaluation de l'état de conscience", 'Prise des constantes', 'Examen clinique',
  'Surveillance renforcée', 'Appel du médecin',
  'Réalisation d\'examens (radio, scanner...)', 'Soins locaux (pansement...)',
  'Information de la famille', 'Autre',
] as const;

export const ACTIONS_PREVENTIVES = [
  'Réévaluation du risque de chute', "Adaptation de l'environnement",
  'Mise en place de barrières de lit', "Prescription de matériel d'aide",
  'Modification du traitement', 'Kinésithérapie/rééducation',
  'Chaussage adapté', 'Surveillance personnalisée', 'Autre',
] as const;

export const CLASSES_RISQUE = [
  'Benzodiazépines', 'Antidépresseurs', 'Neuroleptiques', 'Antihypertenseurs',
  'Hypoglycémiants', 'Anticoagulants', 'Anticholinergiques',
  'Opioïdes', 'Antiépileptiques', 'Antiparkinsoniens',
] as const;

// ─── Gravité ──────────────────────────────────────────────────────────────────

export type Gravity = 'critique' | 'grave' | 'moderee' | 'legere';

const CRITICAL = ['Fracture confirmée', 'Traumatisme crânien', 'Décès', 'Hospitalisation/transfert'];
const HIGH     = ['Fracture suspectée', 'Plaie profonde'];
const MODERATE = ['Hématome/ecchymose', 'Plaie superficielle'];

export function getGravity(consequences: string[] = []): Gravity {
  if (consequences.some(c => CRITICAL.includes(c))) return 'critique';
  if (consequences.some(c => HIGH.includes(c)))     return 'grave';
  if (consequences.some(c => MODERATE.includes(c))) return 'moderee';
  return 'legere';
}

export const GRAVITY_CONFIG: Record<Gravity, {
  label: string; bg: string; border: string; text: string; dot: string; badge: string;
}> = {
  critique: { label: 'Critique', bg: 'bg-red-50',    border: 'border-red-400',    text: 'text-red-700',    dot: 'bg-red-500',    badge: 'bg-red-100 text-red-700 border-red-200'       },
  grave:    { label: 'Grave',    bg: 'bg-orange-50', border: 'border-orange-400', text: 'text-orange-700', dot: 'bg-orange-500', badge: 'bg-orange-100 text-orange-700 border-orange-200' },
  moderee:  { label: 'Modérée', bg: 'bg-yellow-50', border: 'border-yellow-300', text: 'text-yellow-700', dot: 'bg-yellow-400', badge: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  legere:   { label: 'Légère',  bg: 'bg-green-50',  border: 'border-green-400',  text: 'text-green-700',  dot: 'bg-green-500',  badge: 'bg-green-100 text-green-700 border-green-200'   },
};

// ─── Formulaire vide par défaut ───────────────────────────────────────────────

export const DEFAULT_FORM: ChuteFormData = {
  patient_nom: '',
  patient_prenom: '',
  sexe: '',
  age: undefined,
  date_naissance: '',
  unite: '',
  chambre: '',
  date_chute: new Date().toISOString().split('T')[0],
  heure_chute: '',
  lieu: '',
  lieu_autre: '',
  activite: '',
  activite_autre: '',
  chaussage: '',
  chaussage_autre: '',
  temoin: '',
  facteurs_intrinseques: [],
  facteurs_intrinseques_autre: '',
  facteurs_extrinseques: [],
  facteurs_extrinseques_autre: '',
  consequences: [],
  consequences_autre: '',
  actions_immediates: [],
  actions_immediates_autre: '',
  actions_preventives: [],
  actions_preventives_autre: '',
  declarant: '',
  informations_complementaires: '',
  pharma_complete: false,
  log_modifications: [],
};
