import {
  FileText,
  Moon,
  ClipboardList,
  UtensilsCrossed,
  Heart,
  Shield,
  Scale,
  Stethoscope,
  Pill,
  Syringe,
  TestTube2,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface ModuleConfig {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
  colorClass: string;
  iconBg: string;
  visibleRoles: string[] | null;
}

export const MODULES: ModuleConfig[] = [
  {
    id: 'consignes',
    label: 'Feuilles de Consignes',
    description: 'Consignes médicales par étage et section',
    href: '/consignes',
    icon: FileText,
    colorClass: 'border-blue-100 hover:border-blue-300 hover:bg-blue-50/60',
    iconBg: 'bg-blue-100 text-blue-600',
    visibleRoles: null,
  },
  {
    id: 'consignesNuit',
    label: 'Consignes de Nuit',
    description: "Tableau compact pour l'équipe nocturne",
    href: '/consignes-nuit',
    icon: Moon,
    colorClass: 'border-indigo-100 hover:border-indigo-300 hover:bg-indigo-50/60',
    iconBg: 'bg-indigo-100 text-indigo-600',
    visibleRoles: null,
  },
  {
    id: 'fichesDePoste',
    label: 'Fiches de Poste',
    description: 'AS Matin · Soir · Nuit · ASH · IDE',
    href: '/fiches-de-poste',
    icon: ClipboardList,
    colorClass: 'border-amber-100 hover:border-amber-300 hover:bg-amber-50/60',
    iconBg: 'bg-amber-100 text-amber-600',
    visibleRoles: null,
  },
  {
    id: 'etiquettesRepas',
    label: 'Étiquettes Repas',
    description: 'Régimes alimentaires et allergies',
    href: '/etiquettes-repas',
    icon: UtensilsCrossed,
    colorClass: 'border-green-100 hover:border-green-300 hover:bg-green-50/60',
    iconBg: 'bg-green-100 text-green-600',
    visibleRoles: null,
  },
  {
    id: 'pap',
    label: 'PAP',
    description: "Projets d'Accompagnement Personnalisé",
    href: '/pap',
    icon: Heart,
    colorClass: 'border-rose-100 hover:border-rose-300 hover:bg-rose-50/60',
    iconBg: 'bg-rose-100 text-rose-600',
    visibleRoles: ['psychologue', 'cadre', 'aide-soignante', 'as', 'admin'],
  },
  {
    id: 'contentions',
    label: 'Contentions',
    description: 'Suivi et import des contentions médicales',
    href: '/contentions',
    icon: Shield,
    colorClass: 'border-orange-100 hover:border-orange-300 hover:bg-orange-50/60',
    iconBg: 'bg-orange-100 text-orange-600',
    visibleRoles: null,
  },
  {
    id: 'surveillancePoids',
    label: 'Surveillance du Poids',
    description: 'Bilan nutritionnel annuel et suppléments',
    href: '/surveillance-poids',
    icon: Scale,
    colorClass: 'border-teal-100 hover:border-teal-300 hover:bg-teal-50/60',
    iconBg: 'bg-teal-100 text-teal-600',
    visibleRoles: ['dieteticienne', 'admin'],
  },
  {
    id: 'girNiveauSoin',
    label: 'GIR & Niveaux de Soin',
    description: 'Classification GIR 1-4 et niveaux A-D',
    href: '/gir-niveau-soin',
    icon: Stethoscope,
    colorClass: 'border-cyan-100 hover:border-cyan-300 hover:bg-cyan-50/60',
    iconBg: 'bg-cyan-100 text-cyan-600',
    visibleRoles: null,
  },
  {
    id: 'morphiniques',
    label: 'Dispensation Morphiniques',
    description: 'Fiches de dispensation des morphiniques',
    href: '/morphiniques',
    icon: Pill,
    colorClass: 'border-purple-100 hover:border-purple-300 hover:bg-purple-50/60',
    iconBg: 'bg-purple-100 text-purple-600',
    visibleRoles: null,
  },
  {
    id: 'vaccination',
    label: 'Vaccination',
    description: 'Suivi Covid & Grippe 2026',
    href: '/vaccination',
    icon: Syringe,
    colorClass: 'border-emerald-100 hover:border-emerald-300 hover:bg-emerald-50/60',
    iconBg: 'bg-emerald-100 text-emerald-600',
    visibleRoles: null,
  },
  {
    id: 'bilansSanguins',
    label: 'Bilans Sanguins',
    description: 'Catalogue UBILAB · Planning annuel',
    href: '/bilans-sanguins',
    icon: TestTube2,
    colorClass: 'border-red-100 hover:border-red-300 hover:bg-red-50/60',
    iconBg: 'bg-red-100 text-red-600',
    visibleRoles: null,
  },
  {
    id: 'residents',
    label: 'Gestion des Résidents',
    description: 'Données, régimes et informations résidents',
    href: '/residents',
    icon: Users,
    colorClass: 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/60',
    iconBg: 'bg-slate-100 text-slate-600',
    visibleRoles: null,
  },
];

export const ROLE_MODULES: Record<string, string[] | null> = {
  admin: null,
  psychologue: ['pap'],
  dieteticienne: ['surveillancePoids'],
  cadre: ['consignes', 'consignesNuit', 'fichesDePoste', 'etiquettesRepas', 'pap'],
  'aide-soignante': ['consignes', 'consignesNuit', 'fichesDePoste', 'etiquettesRepas', 'pap'],
  as: ['consignes', 'consignesNuit', 'fichesDePoste', 'etiquettesRepas', 'pap'],
  ide: ['consignes', 'consignesNuit', 'bilansSanguins', 'vaccination', 'contentions'],
};