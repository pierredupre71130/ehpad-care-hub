'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Printer, Loader2, BriefcaseMedical, Eye, Lock, Unlock, X } from 'lucide-react';
import { toast } from 'sonner';
import { useModuleAccess } from '@/lib/use-module-access';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { fetchColorOverrides, darkenHex, type ColorOverrides } from '@/lib/module-colors';
import { MODULES } from '@/components/dashboard/module-config';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

type TableColor = 'jaune' | 'vert' | 'vert-cercle' | 'bleu' | 'rose' | 'rose-triangle';
type Floor = 'RDC' | '1ER';

interface PecRow {
  id: string;
  floor: Floor;
  table_index: number;
  table_color: TableColor;
  row_order: number;
  chambre: string;
  nom: string;
  matin: string;
  apres_midi: string;
  protection: string;
}

interface Resident {
  id: string;
  title?: string;
  first_name?: string;
  last_name: string;
  room?: string;
  floor?: string;
  archived?: boolean;
}

// ── Données initiales (issues des photos) ────────────────────────────────────

const SEED_RDC: Omit<PecRow, 'id'>[] = [
  // ── Tableau 1 — JAUNE ──────────────────────────────────────────────────────
  { floor:'RDC', table_index:1, table_color:'jaune', row_order:0,  chambre:'25',     nom:'Mme Laureau',        matin:'Alité TC au lit - Chemise fendue',                                                                            apres_midi:'Alité - Après la collation = change',                                                                   protection:'T3 complète J/N' },
  { floor:'RDC', table_index:1, table_color:'jaune', row_order:1,  chambre:'26',     nom:'Me Delorme',         matin:'TC au lit - Chemise fendue le Mar-J-S-D\nSi jour de levé Habillage Levé L - Mer V',                          apres_midi:'*Si allitée 16h - change protection.\n*Si lever coucher après la collation + change',                    protection:'T3 complète J/N' },
  { floor:'RDC', table_index:1, table_color:'jaune', row_order:2,  chambre:'27',     nom:'Me Mielin',          matin:'Autonome (Aide pour le dos et les fesses uniquement) - bas de contention - Faire lit',                        apres_midi:'Se couche seule après le repas du soir vérifier - enlever bas',                                          protection:'Pull-ups J/N' },
  { floor:'RDC', table_index:1, table_color:'jaune', row_order:3,  chambre:'28',     nom:'Me Daviot',          matin:'Alité - TC au lit (veilleuse)',                                                                               apres_midi:'Change après collation',                                                                                protection:'T3 complète J/N' },
  { floor:'RDC', table_index:1, table_color:'jaune', row_order:4,  chambre:'29 P',   nom:'Mr Moreira',         matin:'TC lavabo - WC - Habillage - rasage - Aide habillage',                                                        apres_midi:'Coucher après repas soir - pyjama',                                                                     protection:'Pull-ups J/N' },
  { floor:'RDC', table_index:1, table_color:'jaune', row_order:5,  chambre:'29 F',   nom:'Me Moreira',         matin:'TC au lavabo - WC - Habillage - Fauteuil roulant',                                                            apres_midi:'Coucher après repas soir - enlever chaussette de contention',                                            protection:'T2 complète J/N' },
  { floor:'RDC', table_index:1, table_color:'jaune', row_order:6,  chambre:'30 SDB', nom:'Me Laqueriere',      matin:'TC au lit - Habillage - Fauteuil roulant',                                                                    apres_midi:'Coucher après le repas du soir - Déshabillage + change',                                                protection:'T3 complète J/N' },
  { floor:'RDC', table_index:1, table_color:'jaune', row_order:7,  chambre:'30 F',   nom:'Mme Philippe',       matin:'TC partielle au lavabo (demander) - Aide habillage',                                                          apres_midi:'Se couche seule après le repas du soir vérifier',                                                       protection:'Perso' },
  { floor:'RDC', table_index:1, table_color:'jaune', row_order:8,  chambre:'31 SDB', nom:'Mr Dury',            matin:'TC au lit - Habillage - Fauteuil roulant (lever à sa demande sinon chemise fendue)',                          apres_midi:'* Si lever : Coucher après la collation - Déshabillage + change\n* Si alité : change après la collation', protection:'T3 complète J/N' },
  { floor:'RDC', table_index:1, table_color:'jaune', row_order:9,  chambre:'31 P',   nom:'Mr Pequeur',         matin:'TC au lavabo - Rasage - Habillage SAD',                                                                       apres_midi:'Coucher après le repas du soir - Déshabillage SAD à vidanger',                                           protection:'Pull-ups J/N' },
  { floor:'RDC', table_index:1, table_color:'jaune', row_order:10, chambre:'32 P',   nom:'Me Krysik',          matin:'TC au lit - habillage - Fauteuil roulant - App aud - Chaussette de contention',                              apres_midi:'Coucher après le repas du soir - Déshabillage + change - Enlever chaussette de contention',              protection:'T2 complète J/N' },
  { floor:'RDC', table_index:1, table_color:'jaune', row_order:11, chambre:'32 F',   nom:'Me Reverdy',         matin:'TC au lit - habillage - fauteuil roulant',                                                                    apres_midi:'Coucher après repas du soir - déshabillage + change',                                                   protection:'T4 complète J/N' },

  // ── Tableau 2 — VERT CERCLE ────────────────────────────────────────────────
  { floor:'RDC', table_index:2, table_color:'vert-cercle', row_order:0,  chambre:'12P',  nom:'Mme Broin',       matin:'TC au lavabo - Aide habillage - Appareils auditifs - Bas de contention',                                      apres_midi:'Se couche seule après le repas du soir - Enlever bas + VNI la nuit (gère seule)',                        protection:'Pull-ups J/N' },
  { floor:'RDC', table_index:2, table_color:'vert-cercle', row_order:1,  chambre:'12F',  nom:'Me Pelletier',    matin:'TC lavabo - Aide habillage - Bas de contention',                                                              apres_midi:'Coucher après repas du soir - Aide Déshabillage + change',                                              protection:'T3 complète J/N' },
  { floor:'RDC', table_index:2, table_color:'vert-cercle', row_order:2,  chambre:'13P',  nom:'Me Charnier',     matin:'TC au lit - Habillage - Fauteuil roulant\nLever en fonction de son agressivité sinon chemise fendue',          apres_midi:'Change après la collation - Si lever coucher après la collation déshabillage + change',                  protection:'T3 complète J/N' },
  { floor:'RDC', table_index:2, table_color:'vert-cercle', row_order:3,  chambre:'13F',  nom:'Me Lauvergne',    matin:'TC au lit - Habillage - chaise percée à la demande - Fauteuil roulant - O2 2L J/N',                           apres_midi:'Coucher après collation (à sa demande) - Déshabillage + change',                                         protection:'T2 complète J/N' },
  { floor:'RDC', table_index:2, table_color:'vert-cercle', row_order:4,  chambre:'14 P', nom:'Me Moreau',       matin:'TC lavabo - WC - Habillage - Lever fauteuil roulant',                                                         apres_midi:'Coucher après le repas du soir - Déshabillage + change',                                                protection:'T3 complète J/N' },
  { floor:'RDC', table_index:2, table_color:'vert-cercle', row_order:5,  chambre:'14 F', nom:'Me Verduron',     matin:'TC lit - Habillage - Lever au fauteuil roulant',                                                              apres_midi:'Coucher 17h - Déshabillage',                                                                            protection:'T3 complète J/N' },
  { floor:'RDC', table_index:2, table_color:'vert-cercle', row_order:6,  chambre:'15 P', nom:'Me Limandat',     matin:'TC au lavabo - Aide habillage - Canne',                                                                       apres_midi:'Coucher après le repas du soir - Déshabillage',                                                         protection:'Pull-ups J/N' },
  { floor:'RDC', table_index:2, table_color:'vert-cercle', row_order:7,  chambre:'15 F', nom:'Me Potin',        matin:'TC au lavabo (peut être dans le refus, stimuler +++) - Fauteuil roulant',                                     apres_midi:'Coucher après le repas du soir - Déshabillage + change',                                                protection:'Pull-ups J/T4 complète N' },
  { floor:'RDC', table_index:2, table_color:'vert-cercle', row_order:8,  chambre:'16',   nom:'Me Benméridja',   matin:'TC au lavabo - Habillage - Déambulateur',                                                                     apres_midi:'Coucher après le repas du soir - Déshabillage + change si besoin - chaise percé pied du lit',            protection:'Pull-ups J/N' },
  { floor:'RDC', table_index:2, table_color:'vert-cercle', row_order:9,  chambre:'23 P', nom:'Me Ramos',        matin:'TC au lit - Aide à l\'habillage - Fauteuil roulant',                                                          apres_midi:'Coucher à 17h - Aide au déshabillage + change',                                                         protection:'T2 complète J/N' },
  { floor:'RDC', table_index:2, table_color:'vert-cercle', row_order:10, chambre:'23 F', nom:'Me Ubrecht',      matin:'TC au lavabo - habillage - fauteuil roulant (contention)',                                                     apres_midi:'Coucher après le repas du soir - Déshabillage + change - Contention lit',                                protection:'Pull-ups J/T2 complète N' },
  { floor:'RDC', table_index:2, table_color:'vert-cercle', row_order:11, chambre:'24',   nom:'Me Momessin',     matin:'TC au lavabo - WC - Habillage - Lunette - Fauteuil roulant',                                                  apres_midi:'Coucher après le repas du soir - Déshabillage + change (Chaise percée aux pieds du lit)',                protection:'Pull-ups J/N' },

  // ── Tableau 3 — VERT ──────────────────────────────────────────────────────
  { floor:'RDC', table_index:3, table_color:'vert', row_order:0,  chambre:'1',    nom:'Me Nyzak H',          matin:'Alité - TC au lit - Chemise fendue',                                                                          apres_midi:'Alité - Après la collation = change',                                                                   protection:'T2 complète J/N' },
  { floor:'RDC', table_index:3, table_color:'vert', row_order:1,  chambre:'2',    nom:'Me Polturat',         matin:'Demander si besoin d\'aide - Faire lit',                                                                      apres_midi:'Enlever chaussettes contention - Se couche seule (vérifier)',                                            protection:'Pull-ups J/N' },
  { floor:'RDC', table_index:3, table_color:'vert', row_order:2,  chambre:'3',    nom:'Mr Ben Soula',        matin:'Autonome - aide si besoin - Obligation douche tous les deux jours',                                            apres_midi:'Se couche seul',                                                                                        protection:'Pull-ups J/N' },
  { floor:'RDC', table_index:3, table_color:'vert', row_order:3,  chambre:'4',    nom:'Mr De Souza',         matin:'TC au lit - Rasage - Fauteuil roulant - Habillage - Dentier',                                                 apres_midi:'Coucher après le repas du soir - Déshabillage + change - Enlever dentier',                               protection:'T3 complète J/N' },
  { floor:'RDC', table_index:3, table_color:'vert', row_order:4,  chambre:'5',    nom:'Mr Pautet',           matin:'TC au lit - habillage - fauteuil roulant',                                                                    apres_midi:'Se couche seul - Vider Urinal',                                                                         protection:'Pull-ups J/N' },
  { floor:'RDC', table_index:3, table_color:'vert', row_order:5,  chambre:'6',    nom:'Me Dauvilaire',       matin:'Stimuler pour la toilette (gère seule + vérifier) sinon aide au besoin',                                      apres_midi:'Se couche seule après le repas du soir (vérifier)',                                                     protection:'Pull-ups J/N' },
  { floor:'RDC', table_index:3, table_color:'vert', row_order:6,  chambre:'7',    nom:'Mr Guinet',           matin:'Autonome - Aide enfiler haut - Faire lit',                                                                    apres_midi:'Se couche seul après le repas du soir (vérifier)',                                                      protection:'0' },
  { floor:'RDC', table_index:3, table_color:'vert', row_order:7,  chambre:'8',    nom:'Me Fernandes-Dantas', matin:'TC au lavabo - Aide habillage - O2 2L J/N',                                                                    apres_midi:'Se couche seule après repas du soir - Aide au déshabillage - chaise percé pied du lit',                  protection:'Pull-ups J/N' },
  { floor:'RDC', table_index:3, table_color:'vert', row_order:8,  chambre:'9 P',  nom:'Me Perette',          matin:'TC au lit - Habillage - Fauteuil roulant - Dentier + Apps auditifs',                                          apres_midi:'Coucher après le repas du soir - Déshabillage + change - Enlever dentier + Apps auditifs',               protection:'T2 complète J/N' },
  { floor:'RDC', table_index:3, table_color:'vert', row_order:9,  chambre:'9 F',  nom:'Me Rault',            matin:'TC lit - Habillage - Lever fauteuil roulant - Chaise percée à la demande la journée',                         apres_midi:'Coucher après le repas du soir - Déshabillage + change - O2 1L la nuit',                                 protection:'T4 complète J/N' },
  { floor:'RDC', table_index:3, table_color:'vert', row_order:10, chambre:'10',   nom:'Me Paquier',          matin:'TC au lit - Habillage - Fauteuil roulant - Dentier (Lever au verticalisateur)',                               apres_midi:'Coucher après le repas du soir - Déshabillage + Change - Enlever dentier - O2 2L la nuit',               protection:'Pull-ups J - T4 complète N' },
  { floor:'RDC', table_index:3, table_color:'vert', row_order:11, chambre:'11 P', nom:'Mr Martin',           matin:'TC au lavabo - rasage - wc - habillage',                                                                      apres_midi:'Coucher après repas du soir - déshabillage',                                                            protection:'Pull-ups J - T3 Complète N' },
  { floor:'RDC', table_index:3, table_color:'vert', row_order:12, chambre:'11 F', nom:'Mr Nivot Kiné L-M-V', matin:'TC au lit - Habillage - Fauteuil roulant - Rasage - Dentier + Apps auditifs',                                apres_midi:'Coucher après le repas - Déshabillage + change',                                                        protection:'T2 complète J/N' },
];

// ── Config tableaux ────────────────────────────────────────────────────────────

const FLOOR_TABLES: Record<Floor, { table_index: number; table_color: TableColor }[]> = {
  RDC: [
    { table_index: 1, table_color: 'jaune' },
    { table_index: 2, table_color: 'vert-cercle' },
    { table_index: 3, table_color: 'vert' },
  ],
  '1ER': [
    { table_index: 1, table_color: 'bleu' },
    { table_index: 2, table_color: 'rose-triangle' },
    { table_index: 3, table_color: 'rose' },
  ],
};

const FLOOR_DEFAULT_COLOR: Record<Floor, TableColor> = {
  RDC: 'jaune',
  '1ER': 'bleu',
};

// ── Données 1er étage ─────────────────────────────────────────────────────────

const SEED_1ER: Omit<PecRow, 'id'>[] = [
  // ── Tableau 1 — BLEU ──────────────────────────────────────────────────────
  { floor:'1ER', table_index:1, table_color:'bleu', row_order:0,  chambre:'125',       nom:'Mr Contassot',        matin:'TC au lavabo - Habillage - Déambulateur Bas de contention',                                                                                   apres_midi:'Coucher après le repas du soir - déshabillage + change Enlever bas de contention',              protection:'Pull-ups J/N' },
  { floor:'1ER', table_index:1, table_color:'bleu', row_order:1,  chambre:'126',       nom:'Me Devillard',        matin:'TC au lit * Si alliter Chemise fendue\n* Si lever Habillage + fauteuil roulant - Contention (Voir avec IDE si lever possible car souvent dans la diarhée)', apres_midi:'* Si alliter Change a 16h - Si lever coucher à 16h30 - Déshabillage + change',                  protection:'T3 complète J/N' },
  { floor:'1ER', table_index:1, table_color:'bleu', row_order:2,  chambre:'127',       nom:'Me Robin',            matin:'TC au lit - Chemise fendue (lever au fauteuil de confort) Contention STOMIE Fécale',                                                           apres_midi:'Après le collation = change + Coucher',                                                         protection:'T2 complète J/N' },
  { floor:'1ER', table_index:1, table_color:'bleu', row_order:3,  chambre:'128',       nom:'Me Boiret',           matin:'Alité -TC lit - Chemise fendue',                                                                                                               apres_midi:'Alité - Après la collation : change protection',                                                protection:'T3 complète J/N' },
  { floor:'1ER', table_index:1, table_color:'bleu', row_order:4,  chambre:'129 F',     nom:'Me Griviaud',         matin:'Alité -TC lit - Chemise fendue',                                                                                                               apres_midi:'Alité - Après la collation : change protection',                                                protection:'T3 complète J/N' },
  { floor:'1ER', table_index:1, table_color:'bleu', row_order:5,  chambre:'129 P',     nom:'Me Bardet',           matin:'TC au lit - Habillage - Fauteuil roulant',                                                                                                     apres_midi:'Coucher à 17h - Aide déshabillage + change de protection',                                      protection:'T3 complète J/N' },
  { floor:'1ER', table_index:1, table_color:'bleu', row_order:6,  chambre:'130 F',     nom:'Me Fereira',          matin:'TC au lavabo - WC - Habillage - lunette Fauteuil roulant Contention fauteuil',                                                                 apres_midi:'Coucher après le repas du soir - Déshabillage + change de protection - Contention lit',         protection:'T2 complète J/N' },
  { floor:'1ER', table_index:1, table_color:'bleu', row_order:7,  chambre:'130 Mur G', nom:'Mr Fereira',          matin:'TC au lit - Rasage - Aide habillage - Fauteuil roulant Contention fauteuil',                                                                   apres_midi:'Coucher après le repas du soir déshabillage + change Contention lit',                           protection:'T2 complète J/N' },
  { floor:'1ER', table_index:1, table_color:'bleu', row_order:8,  chambre:'131 P',     nom:'Me Meyer',            matin:'TC au lavabo - Aide habillage',                                                                                                                 apres_midi:'Se couche seule après le repas (Stimuler au déshabillage)',                                     protection:'Pull-ups J/N' },
  { floor:'1ER', table_index:1, table_color:'bleu', row_order:9,  chambre:'131 F',     nom:'Me Guinet',           matin:'TC au lit - Habillage - Fauteuil roulant',                                                                                                     apres_midi:'Coucher après le repas du soir - Déshabillage + change',                                        protection:'T3 complète J/N' },
  { floor:'1ER', table_index:1, table_color:'bleu', row_order:10, chambre:'132 F',     nom:'Me Cerqueira',        matin:'TC au lit - Habillage - Fauteuil roulant',                                                                                                     apres_midi:'Coucher après le repas du soir - Déshabillage + change',                                        protection:'Pull-ups J/ T2 complète N' },
  { floor:'1ER', table_index:1, table_color:'bleu', row_order:11, chambre:'132 D',     nom:'Me Thomas',           matin:"Demander si besoin d'aide sinon TC au lavabo - Stimuler à l'habillage",                                                                         apres_midi:'Se couche seule après le repas du soir (vérifier)',                                             protection:'Pull-ups J/N' },

  // ── Tableau 2 — ROSE TRIANGLE ─────────────────────────────────────────────
  { floor:'1ER', table_index:2, table_color:'rose-triangle', row_order:0,  chambre:'114',   nom:'Me Denis Kiné L-M-V',  matin:'TC au lavabo - Aide habillage',                                                                                                         apres_midi:'Coucher après le repas du soir - Déshabillage + Change (mettre vetements sur rampe dans couloir)', protection:'Pull-ups J/N' },
  { floor:'1ER', table_index:2, table_color:'rose-triangle', row_order:1,  chambre:'115',   nom:'Me Teibi Kiné L-V',    matin:'TC au lit - Habillage - Fauteuil roulant Bas de contention',                                                                            apres_midi:'Coucher après la collation - Déshabillage + change - Enlever chaussette de contention',         protection:'T2 complète J/N' },
  { floor:'1ER', table_index:2, table_color:'rose-triangle', row_order:2,  chambre:'116',   nom:'Mr Potignon',          matin:'TC au lavabo - Habillage - Rasage - fauteuil confort (chambre) - fauteuil roulant pour salle a manger',                                  apres_midi:'Mange dans sa chambre le soir - couche 17h',                                                    protection:'T3 complète J/N' },
  { floor:'1ER', table_index:2, table_color:'rose-triangle', row_order:3,  chambre:'117',   nom:'Me Bonnot J',          matin:'TC au lavabo - habillage - Fauteuil roulant - Chaussettes contention - 1 appareil auditif à droite - Dentier',                          apres_midi:'Coucher après repas du soir - deshabillage - enlever chaussettes contention - Enlever dentier',  protection:'pull-ups J/T2 complète N' },
  { floor:'1ER', table_index:2, table_color:'rose-triangle', row_order:4,  chambre:'118',   nom:'Me Simon',             matin:'TC au lavabo - Wc - Habillage - Chaussette de contention - Fauteuil roulant',                                                            apres_midi:'Coucher après le repas du soir - Déshabillage + Change - Enlever chaussette de contention',      protection:'T2 complète J/N' },
  { floor:'1ER', table_index:2, table_color:'rose-triangle', row_order:5,  chambre:'119',   nom:'Me Hery',              matin:'Aide toilette lavabo - WC - Aide habillage - Dentier',                                                                                   apres_midi:'Coucher après le repas du soir - Déshabillage (seule) + Change',                                protection:'T3 complète J/N' },
  { floor:'1ER', table_index:2, table_color:'rose-triangle', row_order:6,  chambre:'120',   nom:'Me Berger',            matin:'TC au lavabo (petite toilette au lit) - Habillage - Fauteuil roulant - Dentier',                                                          apres_midi:'Coucher après le repas du soir - Déshabillage',                                                 protection:'Pull-ups J/N' },
  { floor:'1ER', table_index:2, table_color:'rose-triangle', row_order:7,  chambre:'121',   nom:'Me Porterat',          matin:'TC au lavabo - WC - Habillage - Fauteuil roulant - Chaussettes contention',                                                              apres_midi:'Coucher après le repas du soir - Déshabillage + Change de protection - Enlever chaussettes de contention', protection:'T3 complète J/N' },
  { floor:'1ER', table_index:2, table_color:'rose-triangle', row_order:8,  chambre:'122',   nom:'Me Masset Kiné L-V',   matin:'TC au lit - WC - Habillage - Fauteuil roulant - Chaussette de contention',                                                              apres_midi:'Coucher à 16h30 + change de protection - Enlever chaussette de contention',                     protection:'T4 complète J/N' },
  { floor:'1ER', table_index:2, table_color:'rose-triangle', row_order:9,  chambre:'123 F', nom:'Me Dumagny',           matin:'TC au lavabo - aide Habillage - canne',                                                                                                  apres_midi:'Coucher après repas du soir - Déshabillage + Change SB',                                        protection:'Pull-ups J/N' },
  { floor:'1ER', table_index:2, table_color:'rose-triangle', row_order:10, chambre:'123 P', nom:'Me Tixier',            matin:"Demander si besoin d'aide sinon TC au lavabo - Stimuler à l'habillage",                                                                   apres_midi:'Se couche seule après le repas du soir (vérifier)',                                             protection:'Pull-ups J/N' },
  { floor:'1ER', table_index:2, table_color:'rose-triangle', row_order:11, chambre:'124',   nom:'Me Vail',              matin:'TC au lavabo ou au lit en fonction de son état - Habillage - Fauteuil roulant pour déplacement',                                          apres_midi:'Coucher après le repas du soir - Déshabillage + change',                                        protection:'Pull-ups J/ T2 complète N' },

  // ── Tableau 3 — ROSE ──────────────────────────────────────────────────────
  { floor:'1ER', table_index:3, table_color:'rose', row_order:0,  chambre:'101',  nom:'Me Dautin',            matin:"Autonome (voir besoin d'aide) - chaussettes de contention",                                                                                       apres_midi:'Se couche seule après le repas du soir (dire bonne nuit + enlever chaussette de contention)',  protection:'Pull-ups J/N' },
  { floor:'1ER', table_index:3, table_color:'rose', row_order:1,  chambre:'102',  nom:'',                     matin:'',                                                                                                                                                apres_midi:'',                                                                                              protection:'' },
  { floor:'1ER', table_index:3, table_color:'rose', row_order:2,  chambre:'103',  nom:'Me Perrot',            matin:'TC au lavabo - habillage - Canne',                                                                                                                 apres_midi:'Coucher après repas du soir - dehabillage + Change SB (mettre vetements sur rampe dans couloir)', protection:'Pull ups J/N' },
  { floor:'1ER', table_index:3, table_color:'rose', row_order:3,  chambre:'104',  nom:'Me Tavernier',         matin:'Aide à la toilette lavabo - WC - Aide habillage',                                                                                                  apres_midi:'Coucher après repas du soir - Aide au déshabillage - Change pull-ups',                          protection:'Pull-ups J/N' },
  { floor:'1ER', table_index:3, table_color:'rose', row_order:4,  chambre:'105',  nom:'Me Gattuso',           matin:'TC au lavabo - Aide habillage - Déambulateur',                                                                                                     apres_midi:'Coucher après le repas du soir (se déshabille seule, vérifier) - Enlever bas de contention',   protection:'Pull-ups J/N' },
  { floor:'1ER', table_index:3, table_color:'rose', row_order:5,  chambre:'106',  nom:'Me Besson',            matin:'TC au lavabo (dos + partie intime) - WC - aide Habillage - lunette - Fauteuil roulant',                                                            apres_midi:'Coucher après le repas du soir - Change',                                                       protection:'T3 complète J/N' },
  { floor:'1ER', table_index:3, table_color:'rose', row_order:6,  chambre:'107',  nom:'Me Bonnot MT Kiné L-V', matin:'TC au lit - Petite toilette liniment - Habillage - Lever fauteuil roulant',                                                                      apres_midi:'Coucher à 17h - Déshabillage + Change',                                                         protection:'T2 complète J/N' },
  { floor:'1ER', table_index:3, table_color:'rose', row_order:7,  chambre:'108',  nom:'Mr Jaquelin',          matin:'TC au lavabo - aide habillage et rasage',                                                                                                          apres_midi:'Coucher apres repas du soir - se deshabille seul',                                              protection:'' },
  { floor:'1ER', table_index:3, table_color:'rose', row_order:8,  chambre:'109',  nom:'Me Jobard',            matin:"TC au lavabo (s'habille seule, juste aide pull ups) - Chaussette de contention",                                                                   apres_midi:'Se couche seule après le repas du soir (dire bonne nuit + enlever chaussette de contention)',  protection:'Pull-ups J/N' },
  { floor:'1ER', table_index:3, table_color:'rose', row_order:9,  chambre:'110',  nom:'Me Rabillon',          matin:'TC au lit - Habillage - fauteuil roulant - Mettre bas de contention',                                                                              apres_midi:'Coucher après le repas du soir - Déshabillage + Change - Enlever bas de contention',            protection:'Pull-ups J/ T3 complète N' },
  { floor:'1ER', table_index:3, table_color:'rose', row_order:10, chambre:'111',  nom:'Mme Charles',          matin:'TC au lavabo - WC - Habillage - chaussettes contention - Fauteuil roulant',                                                                        apres_midi:'Coucher après le repas du soir - Déshabillage - Enlever chaussette',                            protection:'Pull-ups J/N' },
  { floor:'1ER', table_index:3, table_color:'rose', row_order:11, chambre:'112',  nom:'Me Bouton Kiné L-M-V', matin:'TC au lavabo - WC - Aide habillage - Lever fauteuil roulant',                                                                                     apres_midi:'Coucher après le repas du soir - Aide deshabillage + change',                                   protection:'Pull-ups J - T3 complète N' },
  { floor:'1ER', table_index:3, table_color:'rose', row_order:12, chambre:'113',  nom:'Me Arnoux',            matin:'TC au lavabo - Habillage - Déambulateur / Fauteuil de confort',                                                                                    apres_midi:'Se déshabille seule après le repas du soir - Aide au coucher + enlever Bande de contention',   protection:'Pull-ups J/N' },
];

// ── Network background ────────────────────────────────────────────────────────

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

// ── Badge couleur ──────────────────────────────────────────────────────────────

const OUTLINE = { textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000' } as React.CSSProperties;

function ColorBadge({ color }: { color: TableColor }) {
  if (color === 'jaune')
    return <span className="inline-flex items-center px-3 py-1 rounded font-bold text-sm bg-yellow-400 text-yellow-900">JAUNE</span>;
  if (color === 'vert-cercle')
    return (
      <span className="inline-flex items-center justify-center gap-2 px-3 py-1 rounded font-bold text-sm bg-green-600 text-white min-w-[72px]">
        <span className="w-4 h-4 rounded-full bg-white border-2 border-black flex-shrink-0" />
      </span>
    );
  if (color === 'vert')
    return <span className="inline-flex items-center px-3 py-1 rounded font-bold text-sm bg-green-600 text-white"><span style={OUTLINE}>VERT</span></span>;
  if (color === 'bleu')
    return <span className="inline-flex items-center px-3 py-1 rounded font-bold text-sm bg-blue-600 text-white">BLEU</span>;
  if (color === 'rose-triangle')
    return (
      <span className="inline-flex items-center justify-center gap-2 px-3 py-1 rounded font-bold text-sm bg-pink-400 text-white min-w-[72px]">
        <svg width="16" height="14" viewBox="0 0 14 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
          <path d="M7 1.5L12.5 10.5H1.5L7 1.5Z" fill="white" stroke="black" strokeWidth="1.2" strokeLinejoin="round"/>
        </svg>
      </span>
    );
  // rose
  return <span className="inline-flex items-center px-3 py-1 rounded font-bold text-sm bg-pink-400 text-white"><span style={OUTLINE}>ROSE</span></span>;
}

// ── Cellule éditable ───────────────────────────────────────────────────────────

function EditableCell({
  value,
  onSave,
  placeholder = '—',
  readOnly,
}: {
  value: string;
  onSave: (v: string) => void;
  placeholder?: string;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => { setDraft(value); }, [value]);

  const commit = () => {
    if (draft !== value) onSave(draft);
    setEditing(false);
  };

  if (editing) {
    return (
      <textarea
        autoFocus
        className="w-full text-xs border border-blue-400 rounded px-1.5 py-1 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400 min-h-[60px]"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Escape') { setDraft(value); setEditing(false); } }}
        rows={3}
      />
    );
  }

  return (
    <div
      onClick={readOnly ? undefined : () => { setDraft(value); setEditing(true); }}
      className={`text-xs rounded px-1 py-0.5 min-h-[28px] whitespace-pre-wrap leading-relaxed ${readOnly ? '' : 'cursor-text hover:bg-blue-50'}`}
      title={readOnly ? undefined : 'Cliquer pour modifier'}
    >
      {value || <span className="text-slate-300">{placeholder}</span>}
    </div>
  );
}

// ── Supabase helpers ───────────────────────────────────────────────────────────

async function fetchRows(floor: Floor): Promise<PecRow[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from('prise_en_charge')
    .select('*')
    .eq('floor', floor)
    .order('table_index')
    .order('row_order');
  if (error) throw new Error(error.message);
  return (data ?? []) as PecRow[];
}

async function fetchResidents(): Promise<Resident[]> {
  const sb = createClient();
  const { data, error } = await sb
    .from('residents')
    .select('id,title,first_name,last_name,room,floor,archived')
    .order('room');
  if (error) throw new Error(error.message);
  return (data ?? []) as Resident[];
}

// ── Page principale ────────────────────────────────────────────────────────────

export default function PrisesEnChargePage() {
  const qc = useQueryClient();
  const access = useModuleAccess('priseEnCharge');
  const baseReadOnly = access === 'read';
  const [activeFloor, setActiveFloor] = useState<Floor>('RDC');
  const [activeColor, setActiveColor] = useState<TableColor>('jaune');

  // ── Verrouillage modifications par mot de passe (mapad2022)
  // - État volontairement non persisté : perdu si on quitte la page.
  // - Expire après 30 minutes.
  const UNLOCK_PASSWORD = 'mapad2022';
  const UNLOCK_DURATION_MS = 30 * 60 * 1000;
  const [unlockedAt, setUnlockedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [showUnlock, setShowUnlock] = useState(false);
  const [pwInput, setPwInput] = useState('');

  // Refresh "now" toutes les 30s pour re-verrouiller automatiquement
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const isUnlocked = unlockedAt !== null && (now - unlockedAt < UNLOCK_DURATION_MS);
  const remainingMin = isUnlocked ? Math.max(0, Math.ceil((UNLOCK_DURATION_MS - (now - unlockedAt!)) / 60_000)) : 0;
  const readOnly = baseReadOnly || !isUnlocked;

  const tryUnlock = () => {
    if (pwInput === UNLOCK_PASSWORD) {
      setUnlockedAt(Date.now());
      setShowUnlock(false);
      setPwInput('');
      toast.success('Modifications déverrouillées pour 30 minutes');
    } else {
      toast.error('Mot de passe incorrect');
      setPwInput('');
    }
  };

  const lock = () => {
    setUnlockedAt(null);
    toast.info('Modifications verrouillées');
  };

  // Module color system
  const { data: colorOverrides = {} } = useQuery<ColorOverrides>({
    queryKey: ['settings', 'module_colors'],
    queryFn: fetchColorOverrides,
    staleTime: 30000,
  });
  const pecModule = MODULES.find(m => m.id === 'priseEnCharge');
  const colorFrom = colorOverrides['priseEnCharge']?.from ?? pecModule?.cardFrom ?? '#c2640a';
  const colorTo   = colorOverrides['priseEnCharge']?.to   ?? pecModule?.cardTo   ?? '#954a00';
  const [seeding, setSeeding] = useState(false);
  const seedingStarted = useRef(false);
  const syncedFloors = useRef<Set<string>>(new Set());

  const { data: rows = [], isLoading: loadingRows } = useQuery({
    queryKey: ['prise_en_charge', activeFloor],
    queryFn: () => fetchRows(activeFloor),
  });

  const { data: residents = [] } = useQuery({
    queryKey: ['residents'],
    queryFn: fetchResidents,
  });

  // ── Auto-seed si la table est vide pour ce floor ──────────────────────────
  useEffect(() => {
    if (loadingRows || rows.length > 0 || seedingStarted.current) return;

    const seedData = activeFloor === 'RDC' ? SEED_RDC : activeFloor === '1ER' ? SEED_1ER : null;
    if (!seedData) return;

    seedingStarted.current = true;
    const seed = async () => {
      setSeeding(true);
      const sb = createClient();
      const { error } = await sb.from('prise_en_charge').insert(seedData);
      if (error) {
        toast.error('Erreur lors de l\'initialisation : ' + error.message);
        seedingStarted.current = false;
      } else {
        qc.invalidateQueries({ queryKey: ['prise_en_charge', activeFloor] });
      }
      setSeeding(false);
    };
    seed();
  }, [loadingRows, rows.length, activeFloor, qc]);

  // ── Helpers résidents ─────────────────────────────────────────────────────
  const floorResidents = residents
    .filter(r => (r.floor ?? '').toUpperCase() === activeFloor && !r.archived)
    .sort((a, b) =>
      (a.room ?? '').localeCompare(b.room ?? '', undefined, { numeric: true, sensitivity: 'base' })
    );

  const residentByRoom = (room: string) =>
    floorResidents.find(r => (r.room ?? '') === room);

  const nomFromRoom = (room: string): string => {
    const r = residentByRoom(room);
    if (!r) return '';
    return [r.title, r.last_name].filter(Boolean).join(' ');
  };

  // ── Sync automatique chambre → nom depuis la table residents ──────────────
  useEffect(() => {
    if (loadingRows || rows.length === 0 || residents.length === 0) return;
    if (syncedFloors.current.has(activeFloor)) return;
    syncedFloors.current.add(activeFloor);

    const rowsToUpdate = rows.filter(row => {
      if (!row.chambre) return false;
      const expected = nomFromRoom(row.chambre);
      return expected && expected !== row.nom;
    });

    if (rowsToUpdate.length === 0) return;

    const sb = createClient();
    rowsToUpdate.forEach(async row => {
      const nom = nomFromRoom(row.chambre);
      const { error } = await sb
        .from('prise_en_charge')
        .update({ nom, updated_at: new Date().toISOString() })
        .eq('id', row.id);
      if (!error) {
        qc.setQueryData(['prise_en_charge', activeFloor], (prev: PecRow[] = []) =>
          prev.map(r => r.id === row.id ? { ...r, nom } : r)
        );
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingRows, rows.length, residents.length, activeFloor]);

  // ── Mutation : update champ ───────────────────────────────────────────────
  const updateField = async (id: string, field: string, value: string) => {
    const sb = createClient();
    const { error } = await sb
      .from('prise_en_charge')
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { toast.error(error.message); return; }
    qc.setQueryData(['prise_en_charge', activeFloor], (prev: PecRow[] = []) =>
      prev.map(r => r.id === id ? { ...r, [field]: value } : r)
    );
  };

  // Quand on change la chambre → auto-fill nom
  const updateChambre = async (id: string, chambre: string) => {
    const nom = nomFromRoom(chambre) || rows.find(r => r.id === id)?.nom || '';
    const sb = createClient();
    const { error } = await sb
      .from('prise_en_charge')
      .update({ chambre, nom, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { toast.error(error.message); return; }
    qc.setQueryData(['prise_en_charge', activeFloor], (prev: PecRow[] = []) =>
      prev.map(r => r.id === id ? { ...r, chambre, nom } : r)
    );
  };

  // ── Ajouter une ligne ─────────────────────────────────────────────────────
  const addRow = async (table_index: number, table_color: TableColor) => {
    const tableRows = rows.filter(r => r.table_index === table_index);
    const row_order = tableRows.length;
    const sb = createClient();
    const { data, error } = await sb
      .from('prise_en_charge')
      .insert({ floor: activeFloor, table_index, table_color, row_order, chambre: '', nom: '', matin: '', apres_midi: '', protection: '' })
      .select()
      .single();
    if (error) { toast.error(error.message); return; }
    qc.setQueryData(['prise_en_charge', activeFloor], (prev: PecRow[] = []) => [...prev, data as PecRow]);
  };

  // ── Imprimer le tableau sélectionné ─────────────────────────────────────
  const handlePrint = () => {
    const tableConfig = FLOOR_TABLES[activeFloor].find(t => t.table_color === activeColor);
    if (!tableConfig) return;
    const { table_index, table_color } = tableConfig;
    const tableRows = rows
      .filter(r => r.table_index === table_index)
      .sort((a, b) => a.row_order - b.row_order);

    const colorLabel =
      table_color === 'jaune' ? 'JAUNE' :
      table_color === 'vert-cercle' ? 'VERT (cercle)' :
      table_color === 'vert' ? 'VERT' :
      table_color === 'bleu' ? 'BLEU' :
      table_color === 'rose-triangle' ? 'ROSE (triangle)' : 'ROSE';

    const trRows = tableRows.map(row => `
      <tr>
        <td>${row.chambre || '—'}</td>
        <td>${row.nom || '—'}</td>
        <td>${(row.matin || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')}</td>
        <td>${(row.apres_midi || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')}</td>
        <td>${(row.protection || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>')}</td>
      </tr>
    `).join('');

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8"/>
  <style>
    body { margin: 0; padding: 8mm; font-family: Arial, sans-serif; font-size: 10px; }
    h1 { font-size: 13px; margin: 0 0 2px; color: #1e293b; }
    .sub { margin: 0 0 8px; color: #64748b; font-size: 10px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f1f5f9; padding: 5px 7px; text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: 0.04em; border: 1px solid #cbd5e1; color: #475569; }
    td { padding: 4px 7px; border: 1px solid #e2e8f0; vertical-align: top; font-size: 10px; line-height: 1.45; }
    tr:nth-child(even) td { background: #f8fafc; }
    @page { size: A4 landscape; margin: 8mm; }
  </style>
</head>
<body>
  <h1>Prises en Charge — ${activeFloor} — Tableau ${colorLabel}</h1>
  <p class="sub">Résidence La Fourrier — ${tableRows.length} résident${tableRows.length > 1 ? 's' : ''}</p>
  <table>
    <thead>
      <tr>
        <th style="width:55px">Chambre</th>
        <th style="width:110px">Nom</th>
        <th>Matin</th>
        <th>Après-midi / Soir</th>
        <th style="width:130px">Protection</th>
      </tr>
    </thead>
    <tbody>${trRows}</tbody>
  </table>
</body>
</html>`;

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:0;height:0;border:none';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument!;
    doc.open(); doc.write(html); doc.close();
    setTimeout(() => {
      iframe.contentWindow?.print();
      setTimeout(() => document.body.removeChild(iframe), 1000);
    }, 300);
  };

  // ── Rendu ─────────────────────────────────────────────────────────────────

  const isLoading = loadingRows || seeding;

  return (
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
            <span className="text-white/75">Prises en Charge</span>
          </div>

          <div className="flex items-center justify-between gap-4 flex-wrap">
            {/* Title */}
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <BriefcaseMedical className="h-6 w-6 text-white" strokeWidth={1.5} />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold text-white tracking-tight">Prises en Charge</h1>
                <p className="text-sm text-white/60 mt-0.5">Résidence La Fourrier</p>
              </div>
            </div>

            {/* Right side controls */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Onglets étage */}
              <div className="flex gap-1 bg-black/20 rounded-xl p-1">
                {(['RDC', '1ER'] as Floor[]).map(f => (
                  <button
                    key={f}
                    onClick={() => { setActiveFloor(f); setActiveColor(FLOOR_DEFAULT_COLOR[f]); }}
                    className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                      activeFloor === f
                        ? 'bg-white text-slate-800 shadow-sm'
                        : 'text-white/80 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>

              {/* Sélecteur de tableau (couleur) */}
              <div className="flex gap-1.5 bg-black/20 rounded-xl p-1.5">
                {FLOOR_TABLES[activeFloor].map(({ table_color }) => {
                  const bg =
                    table_color === 'jaune' ? 'bg-yellow-400 text-yellow-900' :
                    table_color === 'vert-cercle' ? 'bg-green-600 text-white' :
                    table_color === 'vert' ? 'bg-green-600 text-white' :
                    table_color === 'bleu' ? 'bg-blue-600 text-white' :
                    table_color === 'rose-triangle' ? 'bg-pink-400 text-white' :
                    'bg-pink-400 text-white';
                  const label =
                    table_color === 'jaune' ? 'JAUNE' :
                    table_color === 'vert' ? 'VERT' :
                    table_color === 'bleu' ? 'BLEU' :
                    table_color === 'rose' ? 'ROSE' : null;
                  return (
                    <button
                      key={table_color}
                      onClick={() => setActiveColor(table_color)}
                      className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border-2 transition-all text-xs font-semibold min-w-[72px] ${
                        activeColor === table_color
                          ? 'border-white shadow-lg scale-105'
                          : 'border-transparent hover:brightness-110'
                      } ${bg}`}
                    >
                      {table_color === 'vert-cercle' && <span className="w-3.5 h-3.5 rounded-full bg-white border-2 border-black flex-shrink-0" />}
                      {table_color === 'rose-triangle' && (
                        <svg width="14" height="12" viewBox="0 0 14 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
                          <path d="M7 1.5L12.5 10.5H1.5L7 1.5Z" fill="white" stroke="black" strokeWidth="1.2" strokeLinejoin="round"/>
                        </svg>
                      )}
                      {label && (
                        <span style={
                          table_color === 'vert' || table_color === 'rose'
                            ? { textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000' }
                            : undefined
                        }>{label}</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Imprimer */}
              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 border border-white/30 text-white text-sm font-medium transition-colors"
                title="Imprimer le tableau sélectionné"
              >
                <Printer className="h-4 w-4" />
                Imprimer
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Contenu */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {baseReadOnly && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 mb-4 text-sm text-blue-700 font-medium">
            <Eye className="h-4 w-4 flex-shrink-0" />
            Vous consultez cette page en lecture seule.
          </div>
        )}
        {!baseReadOnly && (
          <div className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 mb-4 text-sm">
            {isUnlocked ? (
              <>
                <div className="flex items-center gap-2 text-emerald-700 font-medium">
                  <Unlock className="h-4 w-4" />
                  Modifications déverrouillées · expire dans {remainingMin} min
                </div>
                <button onClick={lock}
                  className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-800 hover:bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                  <Lock className="h-3.5 w-3.5" /> Verrouiller maintenant
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-slate-600">
                  <Lock className="h-4 w-4" />
                  Les colonnes Chambre / Matin / Après-midi / Protection sont verrouillées.
                </div>
                <button onClick={() => { setShowUnlock(true); setPwInput(''); }}
                  className="flex items-center gap-1.5 text-xs text-white bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded-lg font-semibold">
                  <Unlock className="h-3.5 w-3.5" /> Déverrouiller
                </button>
              </>
            )}
          </div>
        )}

        {showUnlock && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowUnlock(false)}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b">
                <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                  <Lock className="h-4 w-4 text-amber-600" />
                  Déverrouiller les modifications
                </h2>
                <button onClick={() => setShowUnlock(false)} className="text-slate-400 hover:text-slate-700">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-5 space-y-3">
                <p className="text-sm text-slate-600">
                  Entrez le mot de passe administrateur pour modifier les colonnes Chambre, Matin, Après-midi / Soir et Protection.
                </p>
                <input
                  type="password" autoFocus value={pwInput}
                  onChange={e => setPwInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && tryUnlock()}
                  placeholder="Mot de passe…"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-amber-400" />
                <p className="text-[11px] text-slate-500 italic">
                  Le déverrouillage dure 30 minutes ou jusqu&apos;à ce que vous quittiez la page.
                </p>
              </div>
              <div className="flex gap-2 justify-end p-4 border-t">
                <button onClick={() => setShowUnlock(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">
                  Annuler
                </button>
                <button onClick={tryUnlock} disabled={!pwInput}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-50">
                  <Unlock className="h-4 w-4" /> Déverrouiller
                </button>
              </div>
            </div>
          </div>
        )}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">{seeding ? 'Initialisation des données…' : 'Chargement…'}</p>
          </div>
        ) : (() => {
          const tableConfig = FLOOR_TABLES[activeFloor].find(t => t.table_color === activeColor);
          if (!tableConfig) return null;
          const { table_index, table_color } = tableConfig;

          const tableRows = rows
            .filter(r => r.table_index === table_index)
            .sort((a, b) => a.row_order - b.row_order);

          return (
            <div className="bg-white rounded-2xl border border-white/60 shadow-sm overflow-hidden">
              {/* En-tête du tableau */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-slate-50">
                <ColorBadge color={table_color} />
                <span className="text-sm font-semibold text-slate-600">
                  {tableRows.length} résident{tableRows.length > 1 ? 's' : ''}
                </span>
              </div>

              {/* Tableau */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 text-xs font-semibold uppercase tracking-wide">
                      <th className="border border-slate-200 px-3 py-2 text-left w-24">Chambre</th>
                      <th className="border border-slate-200 px-3 py-2 text-left w-32">Nom</th>
                      <th className="border border-slate-200 px-3 py-2 text-left">Matin</th>
                      <th className="border border-slate-200 px-3 py-2 text-left">Après-midi / Soir</th>
                      <th className="border border-slate-200 px-3 py-2 text-left w-36">Protection</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((row, idx) => (
                      <tr key={row.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                        {/* Chambre — dropdown */}
                        <td className="border border-slate-200 px-2 py-1.5 align-top">
                          <select
                            value={row.chambre}
                            onChange={e => updateChambre(row.id, e.target.value)}
                            disabled={readOnly}
                            className="w-full text-xs border border-slate-200 rounded px-1.5 py-1 bg-white focus:outline-none focus:border-blue-400 disabled:bg-slate-50 disabled:cursor-not-allowed"
                          >
                            {row.chambre && !floorResidents.find(r => r.room === row.chambre) && (
                              <option value={row.chambre}>Ch. {row.chambre}</option>
                            )}
                            {floorResidents.map(r => (
                              <option key={r.id} value={r.room ?? ''}>
                                Ch. {r.room}
                              </option>
                            ))}
                            <option value="">— vide —</option>
                          </select>
                        </td>

                        {/* Nom — auto-rempli */}
                        <td className="border border-slate-200 px-2 py-1.5 align-top">
                          <span className="text-xs font-medium text-slate-700">
                            {row.nom || <span className="text-slate-300 italic">—</span>}
                          </span>
                        </td>

                        {/* Matin */}
                        <td className="border border-slate-200 px-2 py-1.5 align-top">
                          <EditableCell
                            value={row.matin}
                            onSave={v => updateField(row.id, 'matin', v)}
                            readOnly={readOnly}
                          />
                        </td>

                        {/* Après-midi / Soir */}
                        <td className="border border-slate-200 px-2 py-1.5 align-top">
                          <EditableCell
                            value={row.apres_midi}
                            onSave={v => updateField(row.id, 'apres_midi', v)}
                            readOnly={readOnly}
                          />
                        </td>

                        {/* Protection */}
                        <td className="border border-slate-200 px-2 py-1.5 align-top">
                          <EditableCell
                            value={row.protection}
                            onSave={v => updateField(row.id, 'protection', v)}
                            readOnly={readOnly}
                          />
                        </td>

                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Ajouter une ligne */}
              {!readOnly && (
                <div className="px-4 py-2 border-t border-slate-100 print:hidden">
                  <button
                    onClick={() => addRow(table_index, table_color)}
                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-blue-600 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Ajouter un résident
                  </button>
                </div>
              )}
            </div>
          );
        })()}
      </div>
      </div>{/* fin z-index: 1 */}
    </div>
  );
}
