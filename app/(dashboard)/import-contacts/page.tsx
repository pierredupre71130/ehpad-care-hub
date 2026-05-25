'use client';

/**
 * Outil d'import des personnes à prévenir depuis le fichier PDF 30/04/2026.
 * Données extraites manuellement du PDF : col.2=NOM résident, col.3=PRÉNOM,
 * col.7=Chambre, col.8=Personne de confiance, col.9=Personne à prévenir,
 * col.10=Rue, col.11=CP/Ville, col.13=Téléphone.
 *
 * Ce module permet de vérifier chaque ligne avant d'écrire dans la DB.
 */

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, FileText, CheckCircle2, XCircle, AlertTriangle,
  Search, ChevronDown, ChevronUp, Check, SkipForward, Eye,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface PdfEntry {
  res_nom: string;
  res_prenom: string;
  res_chambre: string;
  /** Nom (NOM PRENOM) de la personne à prévenir */
  contact_nom: string;
  contact_prenom: string;
  /** Lien de parenté */
  contact_lien: string;
  contact_adresse: string;
  contact_ville: string;
  contact_tel: string;
  contact_mobile: string;
  /** Texte brut de la colonne 8 (personne de confiance) */
  confiance_texte: string;
  /** Marquer cette ligne comme "pas de contact" */
  skip?: boolean;
  note?: string;
}

interface DbResident {
  id: string;
  room: string;
  title: string;
  first_name: string;
  last_name: string;
  dsi?: Record<string, unknown> | null;
}

type RowStatus = 'pending' | 'applied' | 'skipped' | 'no_match';

interface ImportRow extends PdfEntry {
  id: string;
  matched?: DbResident;
  status: RowStatus;
}

// ─────────────────────────────────────────────────────────────────────────────
// DONNÉES EXTRAITES DU PDF (30/04/2026)
// ─────────────────────────────────────────────────────────────────────────────

const PDF_DATA: PdfEntry[] = [
  // ── Page 1 ────────────────────────────────────────────────────────────────
  { res_nom: 'ARNOULT', res_prenom: 'Colette', res_chambre: '113',
    contact_nom: 'ARNOULT', contact_prenom: 'Olivier', contact_lien: 'Fils',
    contact_adresse: '1 Ville de Franche Comté', contact_ville: '95150 TAVERNY',
    contact_tel: '06 19 29 35 68', contact_mobile: '',
    confiance_texte: 'CURATELLE EN COURS / PERROT Nicole Fille', note: '' },

  { res_nom: 'BARDEI', res_prenom: 'Violette', res_chambre: '129',
    contact_nom: '', contact_prenom: '', contact_lien: 'Fille',
    contact_adresse: '27 rue des fredins', contact_ville: '71130 GUEUGNON',
    contact_tel: '03 85 65 31 51', contact_mobile: '07 86 46 65 96',
    confiance_texte: 'PERROT Nicole Fille',
    note: 'Nom du contact non renseigné dans le PDF (juste "Fille")' },

  { res_nom: 'BENMERIDJA', res_prenom: 'Khaddoudja', res_chambre: '16',
    contact_nom: 'BENMERIDJA', contact_prenom: 'Nour Eddine', contact_lien: 'Fils',
    contact_adresse: '3 rue du frère Bieny', contact_ville: '54180 HEILLECOURT',
    contact_tel: '06 19 22 27 68', contact_mobile: '',
    confiance_texte: 'Fils BENMERIDJA Nour Eddine', note: '' },

  { res_nom: 'BENSOULA', res_prenom: 'Cyrille', res_chambre: '3',
    contact_nom: '', contact_prenom: '', contact_lien: '',
    contact_adresse: '', contact_ville: '',
    contact_tel: '07 83 78 43 92', contact_mobile: '',
    confiance_texte: 'Nouveau Personne de confiance',
    skip: true, note: 'Aucune personne à prévenir identifiée dans le PDF' },

  { res_nom: 'BERGER', res_prenom: 'Nicole', res_chambre: '120',
    contact_nom: 'CHARLES', contact_prenom: 'Fabrice', contact_lien: 'Fils',
    contact_adresse: '37 LE REUIL DU PLESSIS', contact_ville: '71130 GUEUGNON',
    contact_tel: '06 89 55 04 34', contact_mobile: '',
    confiance_texte: 'Référente Fille', note: '' },

  { res_nom: 'BOIRET', res_prenom: 'Antoinette', res_chambre: '128',
    contact_nom: 'UHLRICH BOIRET', contact_prenom: 'Josephe Rose', contact_lien: 'Fille',
    contact_adresse: '8 rue Jean Mermoz', contact_ville: '71600 SAINT YAN',
    contact_tel: '06 87 20 14 27', contact_mobile: '',
    confiance_texte: 'Référente Fille', note: '' },

  { res_nom: 'BONNOT', res_prenom: 'Jeannine', res_chambre: '117',
    contact_nom: 'GENTY', contact_prenom: 'Martine', contact_lien: 'Fille',
    contact_adresse: '18 rue de la pépinière', contact_ville: '71130 GUEUGNON',
    contact_tel: '06 89 54 80 85', contact_mobile: '06 81 78 46 72',
    confiance_texte: 'Référente Fille', note: '' },

  { res_nom: 'BONNOT', res_prenom: 'Marie Thérèse', res_chambre: '107',
    contact_nom: 'BAUDOT', contact_prenom: 'Alain', contact_lien: 'Neveu',
    contact_adresse: 'Vaveau', contact_ville: '71420 DOMPIERRE SOUS SANVIGNES',
    contact_tel: '06 22 64 04 91', contact_mobile: '',
    confiance_texte: 'BAUDOT Alain Neveu (référent)', note: '' },

  { res_nom: 'BOUTON', res_prenom: 'Denise', res_chambre: '112',
    contact_nom: 'BOUTON', contact_prenom: 'Françoise', contact_lien: 'Fille',
    contact_adresse: '79 rue Francois Moine', contact_ville: '71130 GUEUGNON',
    contact_tel: '06 77 34 62 72', contact_mobile: '',
    confiance_texte: 'BOUTON Françoise Fille (référent)', note: '' },

  { res_nom: 'BROIN', res_prenom: 'Micheline', res_chambre: '12',
    contact_nom: 'CHAGNARD', contact_prenom: 'Christine', contact_lien: 'Fille',
    contact_adresse: '13 Route de Beaune Racconay', contact_ville: '71590 GERGY',
    contact_tel: '07 68 22 92 85', contact_mobile: '06 63 30 24 72',
    confiance_texte: 'Référent', note: '' },

  { res_nom: 'CERQUEIRA', res_prenom: 'Yvette', res_chambre: '132',
    contact_nom: 'CERQUEIRA', contact_prenom: 'Maurice', contact_lien: 'Conjoint',
    contact_adresse: '13 rue des souces', contact_ville: '71130 GUEUGNON',
    contact_tel: '06 17 62 74 73', contact_mobile: '',
    confiance_texte: 'Conjoint', note: '' },

  { res_nom: 'CHARLES', res_prenom: 'Andrée', res_chambre: '111',
    contact_nom: 'LACHAIZE', contact_prenom: 'Brigitte', contact_lien: 'Fille',
    contact_adresse: '21 rue frédéric chopin', contact_ville: '21000 DIJON',
    contact_tel: '06 96 48 32 86', contact_mobile: '',
    confiance_texte: 'Personne de confiance Fille LACHAIZE Brigitte', note: '' },

  { res_nom: 'CHARNIER', res_prenom: 'Armande', res_chambre: '13',
    contact_nom: 'CHARNIER', contact_prenom: 'Jean Luc', contact_lien: 'Fils',
    contact_adresse: '50 Lotissement les fresnes', contact_ville: '71130 GUEUGNON',
    contact_tel: '06 71 69 79 24', contact_mobile: '',
    confiance_texte: 'Référent', note: '' },

  { res_nom: 'CONTASSOT', res_prenom: 'Lazare', res_chambre: '125',
    contact_nom: 'CONTASSOT', contact_prenom: 'Michel', contact_lien: 'Fils',
    contact_adresse: '24 Rue de paris', contact_ville: '71130 GUEUGNON',
    contact_tel: '06 26 25 51', contact_mobile: '06 26 76 52 83',
    confiance_texte: 'CONTASSOT Michel Fils (référent)', note: '' },

  { res_nom: 'DAUTUN', res_prenom: 'Denise', res_chambre: '101',
    contact_nom: 'SCHAEFFER', contact_prenom: 'Stephanie', contact_lien: 'Fille',
    contact_adresse: '27 rue F Ducarouge', contact_ville: '71160 DIGOIN',
    contact_tel: '06 82 43 25 77', contact_mobile: '',
    confiance_texte: 'SCHAEFFER Stephanie Fille', note: '' },

  { res_nom: 'DAUVILLAIRE', res_prenom: 'Madeleine', res_chambre: '6',
    contact_nom: 'BOUCHOT', contact_prenom: 'Mireille', contact_lien: 'Fille',
    contact_adresse: '324 chemin de St Maurice', contact_ville: '71600 ST YAN',
    contact_tel: '06 48 20 47 58', contact_mobile: '',
    confiance_texte: 'fille BOUCHOT Mireille', note: '' },

  { res_nom: 'DAVIOT', res_prenom: 'Vincenza', res_chambre: '28',
    contact_nom: 'HASTINGS', contact_prenom: 'Antoine', contact_lien: 'Tuteur',
    contact_adresse: 'CH PCB-Site EHPAD Charolles - 6 rue du prieuré', contact_ville: '71120 CHAROLLES',
    contact_tel: '03 85 88 20 11', contact_mobile: '07 09 69 68 46',
    confiance_texte: 'tuteur Antoine HASTINGS', note: '' },

  { res_nom: 'DELORME', res_prenom: 'Renée', res_chambre: '28',
    contact_nom: 'DELORME', contact_prenom: 'Jean-Pierre', contact_lien: 'Fils',
    contact_adresse: '102 Impasse Le Perthuis de Lay', contact_ville: '71130 GUEUGNON',
    contact_tel: '06 95 11 34 57', contact_mobile: '',
    confiance_texte: 'DELORME J.J. fils (référent)', note: '' },

  { res_nom: 'DENIS', res_prenom: 'Françoise', res_chambre: '114',
    contact_nom: 'ORGANO', contact_prenom: 'Sophie', contact_lien: 'UDAF',
    contact_adresse: '3 Esplanade des Provins', contact_ville: '71120 CHAROLLES',
    contact_tel: '03 85 88 32 65', contact_mobile: '',
    confiance_texte: 'ROUSSEL Josephe sœur (référent)', note: '' },

  { res_nom: 'DE SOUSA', res_prenom: 'Joaquim', res_chambre: '4',
    contact_nom: 'ORGANO', contact_prenom: 'Sophie', contact_lien: 'UDAF',
    contact_adresse: '3 Esplanade des Provins', contact_ville: '71120 CHAROLLES',
    contact_tel: '03 85 88 32 65', contact_mobile: '',
    confiance_texte: '', note: '' },

  { res_nom: 'DEVILLARD', res_prenom: 'Lucette', res_chambre: '126',
    contact_nom: 'DEVILLARD', contact_prenom: 'Philippe', contact_lien: 'Fils',
    contact_adresse: 'Availly', contact_ville: '71160 RIGNY SUR ARROUX',
    contact_tel: '03 85 53 04 62', contact_mobile: '',
    confiance_texte: 'DEVILLARD Philippe fils (référente)', note: '' },

  // ── Page 2 ────────────────────────────────────────────────────────────────
  { res_nom: 'DUMAGNY', res_prenom: 'Jeanne', res_chambre: '123',
    contact_nom: 'DUMAGNY', contact_prenom: 'Nathalie', contact_lien: 'Fille',
    contact_adresse: '284 rue des croisades Bat g', contact_ville: '34280 LA GRANDE MOTTE',
    contact_tel: '06 13 81 56 47', contact_mobile: '',
    confiance_texte: 'Fille',
    note: 'UDAF 71 Charolles - MME REVY PERROT également à prévenir' },

  { res_nom: 'DURY', res_prenom: 'Daniel', res_chambre: '132',
    contact_nom: 'FERNANDES', contact_prenom: 'Maurice', contact_lien: 'Fils',
    contact_adresse: '3 Esplanade des bruyères', contact_ville: '71120 CHAROLLES',
    contact_tel: '03 85 88 32 85', contact_mobile: '',
    confiance_texte: 'Personne de confiance Fils', note: '' },

  { res_nom: 'FERNANDES', res_prenom: 'Rosa', res_chambre: '8',
    contact_nom: 'FERREIRA', contact_prenom: 'Pierre Yves', contact_lien: 'Fils',
    contact_adresse: '46 rue des bruyères', contact_ville: '71130 GUEUGNON',
    contact_tel: '06 10 94 81 34', contact_mobile: '',
    confiance_texte: 'Personne de confiance : Fils', note: '' },

  { res_nom: 'FERREIRA', res_prenom: 'Gabrielle', res_chambre: '130',
    contact_nom: 'FERREIRA', contact_prenom: 'Pierre Yves', contact_lien: 'Fils',
    contact_adresse: '58 bis rue de la Liberté', contact_ville: '71130 GUEUGNON',
    contact_tel: '06 62 13 34 97', contact_mobile: '',
    confiance_texte: 'Personne de confiance : Fils', note: '' },

  { res_nom: 'GATTUSO', res_prenom: 'Pasqualina', res_chambre: '105',
    contact_nom: 'MERMIER', contact_prenom: 'Vincenza', contact_lien: 'Fille',
    contact_adresse: '200 chemin Sainte Catherine', contact_ville: '74580 VIRY',
    contact_tel: '06 23 49 88 13', contact_mobile: '',
    confiance_texte: 'Fille Personne de confiance', note: '' },

  { res_nom: 'GRIVIAUD', res_prenom: 'Marie', res_chambre: '129',
    contact_nom: 'HASTINGS', contact_prenom: 'Antoine', contact_lien: 'Tuteur',
    contact_adresse: 'CH PCB-Site EHPAD Charolles - 6 rue du prieuré', contact_ville: '71120 CHAROLLES',
    contact_tel: '03 85 88 20 11', contact_mobile: '07 88 69 68 46',
    confiance_texte: 'Référent', note: '' },

  { res_nom: 'GUINET', res_prenom: 'Fabrice', res_chambre: '7',
    contact_nom: 'UDAF 71 Charolles - MME RODRIGUES', contact_prenom: '', contact_lien: 'Tuteur UDAF',
    contact_adresse: '35 Ter rue de l\'Héritan - CS 90810', contact_ville: '71120 CHAROLLES',
    contact_tel: '03 85 88 32 65', contact_mobile: '',
    confiance_texte: 'Tutelle', note: '' },

  { res_nom: 'GUINET', res_prenom: 'Jeannine', res_chambre: '131',
    contact_nom: 'UDAF 71 - Mme WOJTCZAK', contact_prenom: '', contact_lien: 'Tuteur UDAF',
    contact_adresse: '35 Ter rue de l\'Héritan - CS 90810', contact_ville: '71120 CHAROLLES',
    contact_tel: '03 85 88 32 65', contact_mobile: '',
    confiance_texte: 'TUTELLE', note: '' },

  { res_nom: 'HERY', res_prenom: 'Renée', res_chambre: '119',
    contact_nom: 'HERY', contact_prenom: 'Jacques', contact_lien: 'Neveu',
    contact_adresse: '4 place du Port Villiers', contact_ville: '71100 CHALON SUR SAONE',
    contact_tel: '06 09 80 54 38', contact_mobile: '',
    confiance_texte: 'Curatelle Antoine HASTINGS (référent)', note: '' },

  { res_nom: 'HUBRECHT', res_prenom: 'Denise', res_chambre: '23',
    contact_nom: 'HASTINGS', contact_prenom: 'Antoine', contact_lien: 'Curateur',
    contact_adresse: 'CH PCB-Site EHPAD Charolles - 6 rue du prieuré', contact_ville: '71120 CHAROLLES',
    contact_tel: '03 85 88 20 11', contact_mobile: '07 88 69 68 46',
    confiance_texte: 'Curatelle Antoine HASTINGS', note: '' },

  { res_nom: 'JACQUELIN', res_prenom: 'Christophe', res_chambre: '108',
    contact_nom: 'JACQUELIN', contact_prenom: 'Mickaël', contact_lien: 'Fils',
    contact_adresse: '68 route de Digoin', contact_ville: '03510 MOLINET',
    contact_tel: '06 80 98 01 02', contact_mobile: '',
    confiance_texte: 'Tuteur Fils', note: '' },

  { res_nom: 'JOBARD', res_prenom: 'Marie Claude', res_chambre: '124',
    contact_nom: 'VERNISSE', contact_prenom: 'Corinne', contact_lien: 'Nièce',
    contact_adresse: '5 route de Luneau', contact_ville: '03510 CHASSENARD',
    contact_tel: '06 37 58 20 74', contact_mobile: '',
    confiance_texte: 'Référent Nièce', note: '' },

  { res_nom: 'KRYSIK', res_prenom: 'Odette', res_chambre: '32',
    contact_nom: 'BASSY', contact_prenom: 'Danielle', contact_lien: 'Fille',
    contact_adresse: '4 Chemin de la forêt', contact_ville: '71600 PARAY LE MONIAL',
    contact_tel: '05 76 46 74 78', contact_mobile: '',
    confiance_texte: 'Fille', note: '' },

  { res_nom: 'LAQUERRIERE', res_prenom: 'Nicole', res_chambre: '30',
    contact_nom: 'HASTINGS', contact_prenom: 'Antoine', contact_lien: 'Curateur',
    contact_adresse: 'CH PCB-Site EHPAD Charolles - 6 rue du prieuré', contact_ville: '71120 CHAROLLES',
    contact_tel: '03 85 88 20 11', contact_mobile: '07 88 69 68 46',
    confiance_texte: 'Sauvegarde de Justice', note: '' },

  { res_nom: 'LAUREAU', res_prenom: 'Marie Claude', res_chambre: '25',
    contact_nom: 'LAUVERGER', contact_prenom: 'Monique', contact_lien: 'Nièce',
    contact_adresse: '85 rue du bourg', contact_ville: '71130 UXEAU',
    contact_tel: '06 58 90 74 04', contact_mobile: '',
    confiance_texte: 'FILLE', note: '' },

  { res_nom: 'LAUVERONE', res_prenom: 'Paulette', res_chambre: '13',
    contact_nom: 'PORTERAT', contact_prenom: 'Carole', contact_lien: 'Fille',
    contact_adresse: '10 rue Pierre Canton', contact_ville: '71350 ST LOUP GEANGES',
    contact_tel: '07 70 09 64 98', contact_mobile: '',
    confiance_texte: 'UDAF 71', note: '' },

  { res_nom: 'LIMANDAT', res_prenom: 'Michelle', res_chambre: '15',
    contact_nom: 'RIBEIRO', contact_prenom: 'Françoise', contact_lien: '',
    contact_adresse: '3 Esplanade des Provins', contact_ville: '71120 CHAROLLES',
    contact_tel: '03 85 69 04 04', contact_mobile: '',
    confiance_texte: 'SAUVEGARDE 71', note: '' },

  { res_nom: 'MAGNIEN', res_prenom: 'Colette', res_chambre: '106',
    contact_nom: 'PALLOT', contact_prenom: 'Michel', contact_lien: 'Fils',
    contact_adresse: '6 rue Forestale - Bat D/65-66', contact_ville: '71300 MONTCEAU LES MINES',
    contact_tel: '06 13 95 40 61', contact_mobile: '',
    confiance_texte: 'SŒUR Personne de confiance', note: '' },

  { res_nom: 'MARTIN', res_prenom: 'Georges', res_chambre: '11',
    contact_nom: 'HASTINGS', contact_prenom: 'Antoine', contact_lien: 'Curateur',
    contact_adresse: 'CH PCB-Site EHPAD Charolles - 6 rue du prieuré', contact_ville: '71120 CHAROLLES',
    contact_tel: '03 85 88 20 11', contact_mobile: '06 10 85 63 82',
    confiance_texte: 'Personne de confiance Antoine', note: '' },

  { res_nom: 'MASSET', res_prenom: 'Pascaline', res_chambre: '122',
    contact_nom: 'HASTINGS', contact_prenom: 'Antoine', contact_lien: 'Tuteur',
    contact_adresse: 'CH PCB-Site EHPAD Charolles - 6 rue du prieuré', contact_ville: '71120 CHAROLLES',
    contact_tel: '03 85 88 20 11', contact_mobile: '07 88 69 68 46',
    confiance_texte: '', note: '' },

  { res_nom: 'MEYER', res_prenom: 'Françoise', res_chambre: '131',
    contact_nom: 'MEYER', contact_prenom: 'Bernadette', contact_lien: 'Fille',
    contact_adresse: '9 Rue de Saint Eusèbe', contact_ville: '71450 BLANZY',
    contact_tel: '06 61 24 93 98', contact_mobile: '',
    confiance_texte: 'MEYER Bernadette Fille (référente)', note: '' },

  { res_nom: 'MIELLIN', res_prenom: 'Renée', res_chambre: '27',
    contact_nom: 'MIELLIN', contact_prenom: 'Laurent', contact_lien: 'Fils',
    contact_adresse: '3 rue de Limoges', contact_ville: '71130 GUEUGNON',
    contact_tel: '07 51 36 51 77', contact_mobile: '06 61 11 75 20',
    confiance_texte: 'FILS', note: '' },

  { res_nom: 'MOMMESSIN', res_prenom: 'Marie Jeanne', res_chambre: '24',
    contact_nom: 'IAFRATI', contact_prenom: 'Agnès', contact_lien: 'Fille',
    contact_adresse: '119 route de St Germain', contact_ville: '71120 CHAROLLES',
    contact_tel: '03 33 94 68 83', contact_mobile: '',
    confiance_texte: 'IAFRATI Agnès Fille (référente)', note: '' },

  { res_nom: 'MOREAU', res_prenom: 'Danièle', res_chambre: '14',
    contact_nom: 'MOREAU', contact_prenom: 'Adeline', contact_lien: 'Famille',
    contact_adresse: '5 rue St Pierre Chanel', contact_ville: '01000 BOURG EN BRESSE',
    contact_tel: '03 85 88 32 65', contact_mobile: '',
    confiance_texte: 'tutelle Antoine HASTINGS',
    note: 'Deux contacts : MOREAU Adeline et MOREAU Marine' },

  { res_nom: 'MOREIRA', res_prenom: 'Jacqueline', res_chambre: '29',
    contact_nom: 'PAILLARD', contact_prenom: 'Valérie', contact_lien: 'Fille',
    contact_adresse: '38 bis rue jean Bouverl', contact_ville: '71130 GUEUGNON',
    contact_tel: '06 05 10 41 29', contact_mobile: '',
    confiance_texte: 'Référente fille', note: '' },

  // ── Page 3 ────────────────────────────────────────────────────────────────
  { res_nom: 'MOREIRA', res_prenom: 'Joaquim', res_chambre: '29',
    contact_nom: 'PAILLARD', contact_prenom: 'Valérie', contact_lien: 'Fille',
    contact_adresse: '38 bis rue jean Bouverl', contact_ville: '71130 GUEUGNON',
    contact_tel: '06 05 10 41 29', contact_mobile: '',
    confiance_texte: 'Référente fille', note: '' },

  { res_nom: 'NIVOT', res_prenom: 'Lucien', res_chambre: '11',
    contact_nom: 'NIVOT', contact_prenom: 'Claude', contact_lien: 'Fils',
    contact_adresse: '481 impasse des loges', contact_ville: '71130 UXEAU',
    contact_tel: '06 70 96 77 50', contact_mobile: '03 95 85 02 53',
    confiance_texte: 'Personne de confiance Fils', note: '' },

  { res_nom: 'NYZAK', res_prenom: 'Henriette', res_chambre: '1',
    contact_nom: 'MAILLET', contact_prenom: 'Claude', contact_lien: 'Fils',
    contact_adresse: '1 Place de l\'Eglise', contact_ville: '71130 GUEUGNON',
    contact_tel: '06 16 47 83 55', contact_mobile: '',
    confiance_texte: '', note: '' },

  { res_nom: 'PAQUIER', res_prenom: 'Denise', res_chambre: '10',
    contact_nom: 'TILLIER', contact_prenom: 'Joëlle', contact_lien: 'Fille',
    contact_adresse: '8 rue pierre et marie Curie', contact_ville: '71760 GRURY',
    contact_tel: '06 69 41 43 83', contact_mobile: '',
    confiance_texte: 'référente', note: '' },

  { res_nom: 'PAUILLET', res_prenom: 'Jean', res_chambre: '5',
    contact_nom: 'HASTINGS', contact_prenom: 'Antoine', contact_lien: 'Curateur',
    contact_adresse: 'CH PCB-Site EHPAD Charolles - 6 rue du prieuré', contact_ville: '71120 CHAROLLES',
    contact_tel: '03 85 88 20 11', contact_mobile: '07 88 69 68 46',
    confiance_texte: 'Curateur Antoine HASTINGS', note: '' },

  { res_nom: 'PECQUEUR', res_prenom: 'Jean Claude', res_chambre: '31',
    contact_nom: '', contact_prenom: '', contact_lien: '',
    contact_adresse: '', contact_ville: '',
    contact_tel: '', contact_mobile: '',
    confiance_texte: '',
    skip: true, note: '⚠ PAS DE FAMILLE / PAS DE TUTELLE (mention dans le PDF)' },

  { res_nom: 'PELLETIER', res_prenom: 'Andrée', res_chambre: '12',
    contact_nom: 'HASTINGS', contact_prenom: 'Antoine', contact_lien: 'Curateur',
    contact_adresse: 'CH PCB-Site EHPAD Charolles - 6 rue du prieuré', contact_ville: '71120 CHAROLLES',
    contact_tel: '03 85 88 20 11', contact_mobile: '07 88 69 68 46',
    confiance_texte: 'référente', note: '' },

  { res_nom: 'PERRETTE', res_prenom: 'Marie', res_chambre: '31',
    contact_nom: 'BLANCHARD', contact_prenom: 'Monique', contact_lien: 'Fille',
    contact_adresse: '721 chemin des chazzeaux', contact_ville: '71130 VENDENESSE SUR ARROUX',
    contact_tel: '03 85 25 49 19', contact_mobile: '07 71 72 55 30',
    confiance_texte: 'Personne de confiance Fille', note: '' },

  { res_nom: 'PERROT', res_prenom: 'Simone', res_chambre: '103',
    contact_nom: 'PERROT', contact_prenom: 'Jean Pierre', contact_lien: 'Fils',
    contact_adresse: '148 impasse de la combette', contact_ville: '71420 GENELARD',
    contact_tel: '06 03 08 06 01', contact_mobile: '',
    confiance_texte: 'Personne de confiance fils', note: '' },

  { res_nom: 'PHILIPPE', res_prenom: 'Marie Thérèse', res_chambre: '30',
    contact_nom: 'CHARNET', contact_prenom: 'Jean-Claude', contact_lien: 'Frère',
    contact_adresse: '19 chemin du vieux bourg', contact_ville: '71120 CHAROLLES',
    contact_tel: '06 15 35 01 33', contact_mobile: '',
    confiance_texte: 'Habilitation familiale FRERE / fille Personne de confiance', note: '' },

  { res_nom: 'POLTURAT', res_prenom: 'Marie Thérèse', res_chambre: '2',
    contact_nom: 'NAGORSKI', contact_prenom: 'Emilie', contact_lien: 'Petite-fille',
    contact_adresse: '2A chemin du Chenolet', contact_ville: '71130 GUEUGNON',
    contact_tel: '06 60 25 85 58', contact_mobile: '',
    confiance_texte: 'NAGORSKI Emilie Petite fille Personne de confiance', note: '' },

  { res_nom: 'PORTERAT', res_prenom: 'Evelyne', res_chambre: '121',
    contact_nom: 'HASTINGS', contact_prenom: 'Antoine', contact_lien: 'Tuteur',
    contact_adresse: 'CH PCB-Site EHPAD Charolles - 6 rue du prieuré', contact_ville: '71120 CHAROLLES',
    contact_tel: '03 85 88 20 11', contact_mobile: '07 88 69 68 46',
    confiance_texte: 'Sauvegarde de Justice', note: '⚠ À vérifier : contact peu lisible dans le PDF' },

  { res_nom: 'POTIGNON', res_prenom: 'Jean Paul', res_chambre: '116',
    contact_nom: 'POTIN', contact_prenom: 'Benoît', contact_lien: 'Fils',
    contact_adresse: '11 rue des poliers', contact_ville: '71130 GUEUGNON',
    contact_tel: '06 71 60 24 04', contact_mobile: '',
    confiance_texte: 'RABILLON Philippe Frère Référent', note: '' },

  { res_nom: 'RABILLON', res_prenom: 'Marie Josephe', res_chambre: '15',
    contact_nom: 'RABILLON', contact_prenom: 'Philippe', contact_lien: 'Fils',
    contact_adresse: '547 chemin des espagnoles', contact_ville: '13140 MIRAMAS',
    contact_tel: '07 97 71 33 76', contact_mobile: '',
    confiance_texte: 'RABILLON Philippe Frère Référent', note: '' },

  { res_nom: 'RAMUS', res_prenom: 'Germaine', res_chambre: '110',
    contact_nom: 'RAMOS', contact_prenom: 'Joel', contact_lien: 'Fils',
    contact_adresse: '23 route de Misée', contact_ville: '71130 CLESSY',
    contact_tel: '06 52 70 52 89', contact_mobile: '05 49 07 86 94',
    confiance_texte: 'Ramos Joel Référent', note: '' },

  { res_nom: 'RAULI', res_prenom: 'Marie Augustine', res_chambre: '23',
    contact_nom: 'PETIT', contact_prenom: 'Françoise', contact_lien: 'Fille',
    contact_adresse: 'Impasse les petites coupes', contact_ville: '71130 GUEUGNON',
    contact_tel: '06 64 97 02 77', contact_mobile: '',
    confiance_texte: 'PETIT Françoise fille', note: '' },

  { res_nom: 'REVENOX', res_prenom: 'Jeannine', res_chambre: '32',
    contact_nom: '', contact_prenom: '', contact_lien: '',
    contact_adresse: '', contact_ville: '',
    contact_tel: '', contact_mobile: '',
    confiance_texte: '',
    skip: true, note: '⚠ AUCUN RENSEIGNEMENT (mention dans le PDF)' },

  { res_nom: 'ROBIN', res_prenom: 'Véronique', res_chambre: '127',
    contact_nom: 'HASTINGS', contact_prenom: 'Antoine', contact_lien: 'Tuteur',
    contact_adresse: 'CH PCB-Site EHPAD Charolles - 6 rue du prieuré', contact_ville: '71120 CHAROLLES',
    contact_tel: '03 85 88 20 11', contact_mobile: '07 88 69 68 46',
    confiance_texte: 'Antoine HASTINGS', note: '' },

  { res_nom: 'SIMON', res_prenom: 'Yvette', res_chambre: '118',
    contact_nom: 'FERRERA', contact_prenom: 'Dominique', contact_lien: 'Fille',
    contact_adresse: '297 av. Jean Jaurès', contact_ville: '69150 DECINES',
    contact_tel: '06 13 58 90 30', contact_mobile: '06 18 83 88 04',
    confiance_texte: 'FERRERA Dominique fille / SIMON Daniel Fils Référée',
    note: '2ème contact : SIMON Daniel (Fils)' },

  { res_nom: 'TAVERNIER', res_prenom: 'Geneviève', res_chambre: '115',
    contact_nom: 'MARTIN', contact_prenom: 'René', contact_lien: 'Frère',
    contact_adresse: '6 chemin du bois roux', contact_ville: '71140 CHALMOUX',
    contact_tel: '06 85 68 20 11', contact_mobile: '',
    confiance_texte: 'MARTIN René frère', note: '' },

  { res_nom: 'TEIBI', res_prenom: 'Tassadite', res_chambre: '114',
    contact_nom: 'HASTINGS', contact_prenom: 'Antoine', contact_lien: 'Tuteur',
    contact_adresse: 'CH PCB-Site EHPAD Charolles - 6 rue du prieuré', contact_ville: '71120 CHAROLLES',
    contact_tel: '03 85 88 20 11', contact_mobile: '07 88 69 68 46',
    confiance_texte: 'ZERROUKI Fatima Sœur Référente', note: '' },

  { res_nom: 'THOMAS', res_prenom: 'Evelyne', res_chambre: '132',
    contact_nom: 'HASTINGS', contact_prenom: 'Antoine', contact_lien: 'Tuteur',
    contact_adresse: 'CH PCB-Site EHPAD Charolles - 6 rue du prieuré', contact_ville: '71120 CHAROLLES',
    contact_tel: '03 85 88 20 11', contact_mobile: '07 88 69 68 46',
    confiance_texte: 'Sauvegarde de Justice Antoine HASTINGS', note: '' },

  { res_nom: 'TIXIER', res_prenom: 'Janine', res_chambre: '123',
    contact_nom: 'DUFOUR', contact_prenom: 'Martine', contact_lien: 'Fille',
    contact_adresse: '1453 route de la Palissade', contact_ville: '74420 MARLY SUR ARROUX',
    contact_tel: '06 13 83 42 81', contact_mobile: '',
    confiance_texte: 'Fille DUFOUR Martine', note: '' },

  { res_nom: 'VAIL', res_prenom: 'Solange', res_chambre: '124',
    contact_nom: 'VAIL', contact_prenom: 'Michel', contact_lien: 'Famille',
    contact_adresse: '17 Avenue Charles de Gaulle', contact_ville: '71600 PARAY LE MONIAL',
    contact_tel: '06 64 33 70 66', contact_mobile: '',
    confiance_texte: 'VAIL Michel', note: '' },
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['\s-]/g, '')
    .toLowerCase()
    .trim();
}

function matchScore(pdf: PdfEntry, res: DbResident): number {
  const pNom = normalize(pdf.res_nom);
  const rNom = normalize(res.last_name);
  const pPre = normalize(pdf.res_prenom);
  const rPre = normalize(res.first_name ?? '');
  const pCh = pdf.res_chambre.replace(/\s/g, '').toLowerCase();
  const rCh = (res.room ?? '').replace(/\s/g, '').toLowerCase();

  let score = 0;
  if (rNom === pNom) score += 10;
  else if (rNom.includes(pNom) || pNom.includes(rNom)) score += 5;
  if (rPre && pPre && rPre === pPre) score += 5;
  else if (rPre && pPre && (rPre.startsWith(pPre.slice(0, 4)) || pPre.startsWith(rPre.slice(0, 4)))) score += 2;
  if (rCh === pCh) score += 3;
  else if (rCh.startsWith(pCh) || pCh.startsWith(rCh)) score += 1;
  return score;
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function ImportContactsPage() {
  const [residents, setResidents] = useState<DbResident[]>([]);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'applied' | 'skipped' | 'no_match'>('all');
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [overwriteExisting, setOverwriteExisting] = useState(false);

  // Load residents and build rows
  useEffect(() => {
    (async () => {
      const sb = createClient();
      const { data } = await sb
        .from('residents')
        .select('id,room,title,first_name,last_name,dsi')
        .eq('archived', false)
        .order('last_name');
      const dbRes = (data ?? []) as DbResident[];
      setResidents(dbRes);

      const built: ImportRow[] = PDF_DATA.map((e, i) => {
        const candidates = dbRes
          .map(r => ({ r, score: matchScore(e, r) }))
          .filter(x => x.score >= 7)
          .sort((a, b) => b.score - a.score);
        const matched = candidates[0]?.r;
        return {
          ...e,
          id: `row-${i}`,
          matched,
          status: e.skip ? 'skipped' : (matched ? 'pending' : 'no_match'),
        };
      });
      setRows(built);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    let list = rows;
    if (filter !== 'all') list = list.filter(r => r.status === filter);
    if (search.trim()) {
      const q = normalize(search);
      list = list.filter(r =>
        normalize(r.res_nom).includes(q) ||
        normalize(r.res_prenom).includes(q) ||
        normalize(r.contact_nom).includes(q)
      );
    }
    return list;
  }, [rows, filter, search]);

  const stats = useMemo(() => ({
    total: rows.length,
    pending: rows.filter(r => r.status === 'pending').length,
    applied: rows.filter(r => r.status === 'applied').length,
    skipped: rows.filter(r => r.status === 'skipped').length,
    no_match: rows.filter(r => r.status === 'no_match').length,
  }), [rows]);

  const applyRow = async (row: ImportRow) => {
    if (!row.matched) return;
    setApplyingId(row.id);
    try {
      const sb = createClient();
      const { data: cur } = await sb
        .from('residents')
        .select('dsi')
        .eq('id', row.matched.id)
        .single();
      const currentDsi = (cur?.dsi as Record<string, unknown>) ?? {};
      const existingPP = currentDsi.personne_prevenir as Record<string, unknown> | undefined;

      if (existingPP && Object.keys(existingPP).length > 0 && !overwriteExisting) {
        if (!confirm(
          `${row.matched.last_name} ${row.matched.first_name} a déjà une personne à prévenir :\n` +
          `"${existingPP.nom ?? ''} ${existingPP.prenom ?? ''}"\n\n` +
          `Voulez-vous l'écraser ?`
        )) {
          setApplyingId(null);
          return;
        }
      }

      const newPP = {
        nom: row.contact_nom,
        prenom: row.contact_prenom,
        lien: row.contact_lien,
        adresse: [row.contact_adresse, row.contact_ville].filter(Boolean).join(', '),
        tel: row.contact_tel,
        mobile: row.contact_mobile,
        personne_confiance: false,
      };
      await sb.from('residents').update({
        dsi: { ...currentDsi, personne_prevenir: newPP },
      }).eq('id', row.matched.id);

      setRows(prev => prev.map(r => r.id === row.id ? { ...r, status: 'applied' } : r));
    } catch (e) {
      alert(`Erreur : ${(e as Error).message}`);
    } finally {
      setApplyingId(null);
    }
  };

  const skipRow = (id: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, status: 'skipped' } : r));
  };

  const resetRow = (id: string) => {
    setRows(prev => prev.map(r => {
      if (r.id !== id) return r;
      return { ...r, status: r.skip ? 'skipped' : (r.matched ? 'pending' : 'no_match') };
    }));
  };

  const rematchRow = (id: string, residentId: string) => {
    const res = residents.find(r => r.id === residentId);
    setRows(prev => prev.map(r =>
      r.id === id ? { ...r, matched: res, status: res ? 'pending' : 'no_match' } : r
    ));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#dde4ee' }}>
        <p className="text-slate-500">Chargement…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-16" style={{ background: '#dde4ee' }}>
      {/* HEADER */}
      <header style={{ background: 'linear-gradient(135deg, #1a3560 0%, #0e6e80 100%)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5">
          <div className="flex items-center gap-1.5 text-white/50 text-xs mb-4">
            <Link href="/" className="hover:text-white/80 transition-colors">Accueil</Link>
            <span>›</span>
            <span className="text-white/75">Import contacts — PDF 30/04/2026</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/"
              className="h-11 w-11 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="h-12 w-12 rounded-2xl bg-white/15 flex items-center justify-center">
              <FileText className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-white tracking-tight leading-none">
                Import — Personnes à prévenir
              </h1>
              <p className="text-sm text-white/60 mt-1">
                Données extraites du PDF du 30/04/2026 · {stats.total} résidents
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">

        {/* STATS */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'En attente', count: stats.pending, color: 'amber', status: 'pending' },
            { label: 'Appliqués', count: stats.applied, color: 'emerald', status: 'applied' },
            { label: 'Ignorés', count: stats.skipped, color: 'slate', status: 'skipped' },
            { label: 'Non trouvés', count: stats.no_match, color: 'red', status: 'no_match' },
          ].map(s => (
            <button
              key={s.status}
              onClick={() => setFilter(filter === s.status ? 'all' : s.status as typeof filter)}
              className={cn(
                'bg-white rounded-xl shadow-sm ring-1 px-4 py-3 text-center transition-all',
                filter === s.status ? 'ring-2 ring-offset-1' : 'ring-slate-200/70 hover:shadow-md',
                s.color === 'amber' && filter === s.status && 'ring-amber-500',
                s.color === 'emerald' && filter === s.status && 'ring-emerald-500',
                s.color === 'slate' && filter === s.status && 'ring-slate-400',
                s.color === 'red' && filter === s.status && 'ring-red-400',
              )}
            >
              <div className={cn(
                'text-3xl font-bold',
                s.color === 'amber' ? 'text-amber-600' :
                s.color === 'emerald' ? 'text-emerald-600' :
                s.color === 'red' ? 'text-red-500' : 'text-slate-400'
              )}>{s.count}</div>
              <div className="text-xs text-slate-500 font-medium">{s.label}</div>
            </button>
          ))}
        </div>

        {/* OPTIONS */}
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-200/70 px-4 py-3 flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher un résident ou contact…"
              className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={overwriteExisting}
              onChange={e => setOverwriteExisting(e.target.checked)}
              className="accent-blue-600"
            />
            Écraser si déjà renseigné
          </label>
          <div className="text-xs text-slate-400">{filtered.length} ligne{filtered.length > 1 ? 's' : ''} affichée{filtered.length > 1 ? 's' : ''}</div>
        </div>

        {/* INFO */}
        <div className="bg-blue-50 ring-1 ring-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800 flex gap-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-blue-600" />
          <p>
            <strong>Vérifiez chaque ligne</strong> avant d&apos;appliquer.
            Développez une ligne pour voir exactement ce qui sera écrit dans la fiche résident.
            Seul le champ <em>Personne à prévenir</em> (DSI) est modifié — les autres données ne bougent pas.
          </p>
        </div>

        {/* TABLE */}
        <div className="space-y-2">
          {filtered.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-8 italic">Aucune ligne à afficher.</p>
          )}
          {filtered.map(row => (
            <RowCard
              key={row.id}
              row={row}
              residents={residents}
              expanded={expanded === row.id}
              applying={applyingId === row.id}
              onToggle={() => setExpanded(expanded === row.id ? null : row.id)}
              onApply={() => applyRow(row)}
              onSkip={() => skipRow(row.id)}
              onReset={() => resetRow(row.id)}
              onRematch={resId => rematchRow(row.id, resId)}
            />
          ))}
        </div>
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROW CARD
// ─────────────────────────────────────────────────────────────────────────────

function RowCard({
  row, residents, expanded, applying,
  onToggle, onApply, onSkip, onReset, onRematch,
}: {
  row: ImportRow;
  residents: DbResident[];
  expanded: boolean;
  applying: boolean;
  onToggle: () => void;
  onApply: () => void;
  onSkip: () => void;
  onReset: () => void;
  onRematch: (resId: string) => void;
}) {
  const statusColor = {
    pending: 'border-l-amber-400 bg-amber-50/30',
    applied: 'border-l-emerald-400 bg-emerald-50/30',
    skipped: 'border-l-slate-300 bg-slate-50/50 opacity-60',
    no_match: 'border-l-red-400 bg-red-50/20',
  }[row.status];

  const StatusIcon = {
    pending: () => <div className="h-2 w-2 rounded-full bg-amber-400" />,
    applied: () => <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
    skipped: () => <XCircle className="h-4 w-4 text-slate-400" />,
    no_match: () => <AlertTriangle className="h-4 w-4 text-red-400" />,
  }[row.status];

  const existingPP = row.matched?.dsi
    ? (row.matched.dsi as Record<string, unknown>).personne_prevenir as {
        nom?: string; prenom?: string; lien?: string;
        adresse?: string; tel?: string; mobile?: string;
      } | undefined
    : undefined;
  const hasExisting = !!(existingPP && Object.keys(existingPP).length > 0 && (existingPP.nom || existingPP.tel));

  return (
    <div className={cn('bg-white rounded-xl shadow-sm ring-1 ring-slate-200/70 overflow-hidden border-l-4', statusColor)}>
      {/* SUMMARY ROW */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50/50 transition-colors"
        onClick={onToggle}
      >
        <StatusIcon />

        {/* Résident PDF */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-900 text-sm">
              <span className="uppercase">{row.res_nom}</span> {row.res_prenom}
            </span>
            <span className="text-xs text-slate-400">CH {row.res_chambre}</span>
            {row.matched ? (
              <span className="text-[10px] bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 px-1.5 py-0.5 rounded-full font-semibold">
                → {row.matched.last_name} {row.matched.first_name} (Ch.{row.matched.room})
              </span>
            ) : (
              <span className="text-[10px] bg-red-100 text-red-600 ring-1 ring-red-200 px-1.5 py-0.5 rounded-full font-semibold">
                Non trouvé en DB
              </span>
            )}
            {hasExisting && row.status === 'pending' && (
              <span className="text-[10px] bg-orange-100 text-orange-700 ring-1 ring-orange-200 px-1.5 py-0.5 rounded-full font-semibold">
                Déjà renseigné
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-0.5 truncate">
            {row.skip
              ? <span className="italic text-slate-400">{row.note}</span>
              : <>{row.contact_nom} {row.contact_prenom}{row.contact_lien ? ` (${row.contact_lien})` : ''} · {row.contact_tel}</>
            }
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
          {row.status === 'pending' && !row.skip && row.matched && (
            <button
              onClick={onApply}
              disabled={applying}
              className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1 disabled:opacity-60 transition-colors"
            >
              {applying ? '…' : <><Check className="h-3 w-3" /> Appliquer</>}
            </button>
          )}
          {row.status === 'pending' && (
            <button
              onClick={onSkip}
              className="h-8 px-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 text-xs flex items-center gap-1 transition-colors"
            >
              <SkipForward className="h-3 w-3" /> Ignorer
            </button>
          )}
          {(row.status === 'applied' || row.status === 'skipped') && (
            <button
              onClick={onReset}
              className="h-8 px-2 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-100 text-xs transition-colors"
            >
              Réinitialiser
            </button>
          )}
          <button
            onClick={onToggle}
            className="h-8 w-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* EXPANDED DETAIL */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 py-4 space-y-4 bg-slate-50/50">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Données actuelles */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                Données actuelles en DB
              </p>
              {row.matched ? (
                hasExisting ? (
                  <div className="bg-orange-50 ring-1 ring-orange-200 rounded-lg p-3 text-sm space-y-1">
                    {existingPP?.nom && <p><span className="text-slate-500">Nom :</span> {String(existingPP.nom)} {String(existingPP.prenom ?? '')}</p>}
                    {existingPP?.lien && <p><span className="text-slate-500">Lien :</span> {String(existingPP.lien)}</p>}
                    {existingPP?.adresse && <p><span className="text-slate-500">Adresse :</span> {String(existingPP.adresse)}</p>}
                    {existingPP?.tel && <p><span className="text-slate-500">Tél :</span> {String(existingPP.tel)}</p>}
                    {existingPP?.mobile && <p><span className="text-slate-500">Mobile :</span> {String(existingPP.mobile)}</p>}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 italic">Aucune personne à prévenir actuellement.</p>
                )
              ) : (
                <p className="text-sm text-red-500 italic">Résident non trouvé en base.</p>
              )}
            </div>

            {/* Ce qui sera écrit */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                Ce qui sera écrit <span className="text-blue-500">(à vérifier !)</span>
              </p>
              {row.skip ? (
                <div className="bg-slate-100 rounded-lg p-3 text-sm text-slate-500 italic">
                  {row.note || 'Aucune donnée à importer pour ce résident.'}
                </div>
              ) : (
                <div className="bg-blue-50 ring-1 ring-blue-200 rounded-lg p-3 text-sm space-y-1">
                  <p><span className="text-slate-500">Nom :</span> <strong>{row.contact_nom}</strong></p>
                  <p><span className="text-slate-500">Prénom :</span> <strong>{row.contact_prenom}</strong></p>
                  <p><span className="text-slate-500">Lien :</span> {row.contact_lien || <span className="italic text-slate-400">—</span>}</p>
                  <p><span className="text-slate-500">Adresse :</span> {row.contact_adresse}{row.contact_adresse && row.contact_ville ? ', ' : ''}{row.contact_ville}</p>
                  <p><span className="text-slate-500">Tél :</span> {row.contact_tel || <span className="italic text-slate-400">—</span>}</p>
                  {row.contact_mobile && <p><span className="text-slate-500">Mobile :</span> {row.contact_mobile}</p>}
                  {row.confiance_texte && (
                    <p className="text-[11px] text-slate-400 pt-1 border-t border-blue-100">
                      <span className="font-semibold">Confiance PDF :</span> {row.confiance_texte}
                    </p>
                  )}
                  {row.note && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1 mt-1">
                      ⚠ {row.note}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Changer la correspondance DB */}
          {row.status !== 'applied' && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Corriger la correspondance résident
              </p>
              <select
                value={row.matched?.id ?? ''}
                onChange={e => onRematch(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:border-blue-400 w-full sm:w-auto max-w-md"
              >
                <option value="">— Non associé —</option>
                {residents
                  .sort((a, b) => a.last_name.localeCompare(b.last_name, 'fr'))
                  .map(r => (
                    <option key={r.id} value={r.id}>
                      {r.last_name} {r.first_name} (Ch. {r.room})
                    </option>
                  ))}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
