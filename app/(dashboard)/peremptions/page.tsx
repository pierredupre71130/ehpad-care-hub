'use client';

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Loader2, ChevronRight, ChevronDown, ChevronUp, AlertTriangle,
  ShieldCheck, ShieldOff, Plus, Trash2, Download, Upload,
  RefreshCw, Search, ChevronsUpDown, Info, Package,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import Link from 'next/link';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  Produit: string;
  Category: string;
  SubCategory: string;
  Peremption: string;
  ColorPriority: number;
  UrgencyGroup: number;
}

interface AppData {
  lastModificationDate: string | null;
  modificationLog: Array<{ productName: string; newDate: string }>;
  customCategories: Record<string, string>;
  products: Product[];
}

// ─── Category maps ────────────────────────────────────────────────────────────

const BASE_CATEGORY_MAP: Record<string, string> = {
  '.': 'Traitements oraux',
  '1': 'Bac 1',
  '2': 'Bac 2',
  '3': 'Bac 3',
  'A': 'Aérosols',
  'B': 'Buvables',
  'C': 'Collyres',
  'F': 'Frigo',
  'I': 'Injectables',
  'N': 'Voie nasale',
  'O': 'Produits auriculaires',
  'S': 'Sprays',
  'T': 'Toxiques',
  'U': 'Usage externe',
  'Urg': "Sac d'urgences",
  'Pans': 'Pansements / Solutés',
  'Pomm': 'Armoire Pommades',
  'Prel': 'Étagères Prélèvements',
};

const SUB_CATEGORY_MAP: Record<string, string> = {
  'A': 'A - longue sacoche noire',
  'B': 'B - sacoche verte',
  'C': 'C - sac urgence',
};

// ─── Default CSV ──────────────────────────────────────────────────────────────

const DEFAULT_CSV = `Produit;Peremption
.Acenocoumarol;1/10/2025
.Acetylsalicylique (kardegic) 75;1/3/2026
.acide folique 5mg;1/1/2027
.alginate NA bicar 10ml;1/8/2026
.allopurinol 100mg;1/4/2026
.alprazolam 0.25mg;1/10/2025
.amiodarone 200mg;1/1/2027
.amlodipine5mg;1/1/2027
.amox Ac Clavu 1G/125mg;1/7/2026
.amox Ac Clavu 500/62.5mg;1/5/2026
.amoxicilline 1G;1/6/2026
.apixaban 2.5mg;1/8/2026
.apixaban 5mg;1/9/2025
.bisoprolol 2.5mg;1/12/2025
.cefixime 200mg;1/2/2026
.cefpodoxime 100mg;1/1/2027
.cholestyramine (questran);1/12/2026
.colchicine 1mg;1/12/2027
.cotrimoxazole 800/160mg;1/5/2028
.desloratadine 5mg;1/8/2027
.domperidone 10mg;1/1/2026
.fer 66mg;1/6/2026
.fluindione 20mg;1/12/2025
.fosfomycine Tr. 3g;1/4/2027
.furosemide 20mg;1/4/2026
.furosemide 40mg;1/2/2027
.furosemide 500mg;1/1/2026
.hydroxyzine 25mg;1/9/2026
.IPP pantoprazole 20mg;1/3/2027
.IPP pantoprazole 40mg;1/4/2027
.IPP pour sonde 15mg;1/10/2025
.ketoprofene LP100mg;1/5/2026
.lactobacillus 340mg;1/4/2027
.lercanidipine 10mg;1/2/2026
.levothyroxine 50ug;1/2/2026
.loperamide 2mg;1/3/2027
.lorazepam 1mg;1/8/2025
.metoclopramide 10mg;1/9/2026
.metopimazine 7.5mg;1/9/2026
.nicardipine LP50mg;1/2/2026
.nitrofuradantine 50mg;1/8/2026
.ofloxacine 200mg;1/4/2026
.ondansetron 8mg;1/12/2026
.oxazepam 10mg;1/12/2028
.oxazepam 50mg;1/4/2028
.paracetamol disp.l 500mg;1/1/2027
.paracetamol gel 500mg;1/3/2027
.paracetamol+opium 500mg/25m;1/1/2026
.phloroglucinol 80mg;1/10/2027
.placebo gel bleue T3;1/2/2026
.potassium chlorure 600mg;1/5/2027
.prednisolone 20mg;1/2/2026
.prednisolone 5mg;1/9/2026
.pristinamycine 500mg;1/10/2027
.racedotril 100mg;1/12/2026
.risperidone 0.5mg;1/1/2027
.rivaroxaban 15mg;1/9/2025
.sodium chlorure 500;1/12/2026
.tiapride 100mg;1/2/2026
.tramadol ( orozamudol )50mg;1/2/2026
.tramadol LP 50mg;1/5/2026
.tramadol+paracetamol37.5/325mg;1/6/2026
.trimebutine 100mg;1/9/2027
.zopiclone 3.75mg;1/5/2027
.zopiclone 7.5mg;1/2/2027
1 Lactulose;1/10/2027
1 Macrogol;1/12/2027
2 Diosmectite;1/9/2027
2 Paraffine;1/12/2027
2 polystyrene sulf.;1/12/2027
2 preparation colique;1/1/2030
3 Minilavement;1/12/2027
3 Normacol;1/11/2027
A Budesonide 1/2.5;1/11/2027
A budesonide+formoterol 200/6ug;1/3/2027
A fluticasone 250;1/8/2025
A Fluticazone+Salmeterol 250/25;1/4/2026
A Fluticazone+Salmeterol 500/50;1/12/2025
A ipratropium 0.5/2;1/1/2027
A Salbutamol 100;1/10/2026
A Salbutamol 5/2.5;1/2/2027
A Terbutaline 5mg/2;1/6/2027
A Tiotropium 18;1/4/2026
A Trinitrine 0.30;1/8/2026
B Alimémazine 4%;1/4/2027
B Amitriptyline 40mg;1/6/2027
B Amphotericine B 10%;1/8/2026
B Clonazepam 2.5mg;1/9/2025
B Cyamemazine 40mg;1/10/2026
B Ferrostane 0,68;1/5/2027
B Fluconazole50mg;1/1/2026
B Haloperidol 2mg;1/1/2027
B Helicidine 0.5mg;1/5/2027
B Levomepromazine 4%;1/10/2025
B Loxapine 25mg;1/6/2027
B Pipampérone 40mg;1/4/2026
B Risperdone 1mg;1/3/2027
B Tramadol 100mg;1/6/2027
B Valproate de sodium 200;1/7/2026
C Aminoside 0.3%;1/4/2027
C Antiseptique collyre;1/12/2025
C Carbomere 0.3%;1/5/2026
C Cromoglicate 2%;1/5/2027
C Dexometh.+Oxytetra;1/6/2026
C Dorzol.+Timolol 20mg;1/11/2025
C Prostaglandine;1/6/2026
C Solution lavage oc.;1/7/2027
F abasaglar;1/10/2025
F aranesp 150;1/6/2027
F aranesp 300;
F dafalgan suppo;1/10/2026
F eductyl;1/10/2025
F Energix 20ug;1/8/2026
F glucagon;1/12/2025
F levemir;1/4/2026
F novorapid;1/1/2026
F revaxis;1/10/2026
F toujeo;1/10/2026
F victoza;1/10/2026
F vogalene suppo;1/6/2027
F xalacom;1/1/2026
I Acide tranexamique500mg;1/2/2026
I Amox+ AC clavu 1g/200mg;1/4/2026
I Ceftriaxone 1g;1/8/2025
I Clomazepam 1mg;1/11/2025
I Cyamémazine 50mg;1/9/2025
I Dexamethasone 4mg;1/11/2025
I Enoxaparine 2000;1/9/2026
I Enoxaparine 4000;1/1/2027
I Flumozémil 0.5mg;1/9/2025
I Furosemide 20mg;1/9/2025
I Glucose 30%;1/1/2026
I Héparine calcique 12500;1/3/2026
I Lidocaine 200mg;1/4/2026
I Loxapine 50mg-2ml;1/3/2027
I Methylprednisolone 20mg;1/6/2026
I Metoclopramide 10mg-2ml;1/5/2029
I Midazolam 5mg;1/11/2027
I Naloxone 0.4mg;1/8/2026
I Nefopam 20mg;1/3/2027
I Scopolamine 0.5mg;1/4/2026
I Sodium Chlorure 1g;1/3/2027
I Tiapride 100mg;1/12/2026
I Tinzaparine 14000;1/4/2026
I Vitamine K1 10mg;1/11/2025
N Corticoide susp. nasale;1/2/2027
N Solution bain de bouche;1/3/2026
O poire auriculaire;
O Xylene 5g;1/8/2027
S Aequasyal;1/2/2027
S Lidocaine buccale5%;1/7/2027
T Abstral 100;
T Actiskenan 5mg;1/9/2025
T Durogesic 12;1/4/2027
T Durogesic 25;1/4/2027
T Durogesic 50;1/7/2026
T Morphine 1mg;1/5/2026
T Oramorphe flacon;1/7/2025
T Oxycodone LP 20mg;1/12/2026
T Oxycontin LP 10mg;
T Oxycontin LP 5mg;1/12/2026
T Oxynormoro 5;1/8/2026
U Lidocaine patch 700mg;1/5/2027
U Scopolamine patch 1mg;1/1/2028
UrgAADRENALINE 5;1/9/25
UrgAAIGUILLES 19G;1/12/26
UrgAATROPINE 0,5;1/12/25
UrgABISEPTINE;1/7/25
UrgACHAMP STERIL;1/11/25
UrgACOMPRESSES;1/6/29
UrgACORDARONE 150;1/11/25
UrgAG10% 500ML;1/2/26
UrgAGARROT;
UrgAGLUCOSE 30%;1/7/25
UrgAKT 14G;1/9/25
UrgAKT 16G;1/11/25
UrgAKT 18G;1/9/29
UrgAKT 20G;1/12/26
UrgAKT 22G;1/12/28
UrgALASILIX 20;1/9/26
UrgALIDOCAINE;1/8/26
UrgAMARQUEUR;
UrgAMIDAZOLAN 5;1/2/28
UrgANACL 0,9% 250ML;1/4/26
UrgANACL 0.9 500ML;1/7/26
UrgANATISPRAY;1/8/26
UrgAPERFUSEUR 3V;1/5/27
UrgARISORDAN 10;1/8/25
UrgASERINGUES 10ML;1/10/26
UrgASERINGUES 5ML;1/9/26
UrgASOLUTION HYDRO AL.;1/9/25
UrgATEGADERM;1/12/27
UrgAVENTOLINE;1/8/26
UrgBAMPOULE;
UrgBCANULE GUEDEL T3;1/3/27
UrgBCANULE GUEDEL T4;1/10/28
UrgBFILTRE ANTIBACTERIEN;1/2/28
UrgBLAME 1 LARYN 4;1/9/26
UrgBLARYNGOSCOPE + LAME;1/9/26
UrgBLUNETTES PROTECTION;
UrgBMASQUE FACIAL 4;1/11/25
UrgBMASQUE FACIAL 5;1/5/25
UrgBMASQUE O2 HAUTE C.;1/12/26
UrgBPILES LR14;
UrgBPINCE MAGILL 20;1/7/29
UrgBSONDE ASPI TRACHEO 14;1/9/28
UrgBTUYAU DE CONNECTION;
UrgCBALLON+FILTRE;
UrgCBOITE GANTS;
UrgCMANOMETRE ASPI MURALE;
UrgCPATCH 1  DEFIB;1/8/27
UrgCPATCH 2  DEFIB;1/8/27
UrgCTUBES PRISE DE SANG;1/9/25
Pans1 Aiguilles hypo 16G;1/9/28
Pans1 Aiguilles hypo 18G;1/1/29
Pans1 Aiguilles hypo 21G;1/3/27
Pans1 Aiguilles hypo 25G;1/12/28
Pans1 Aiguilles stylo insul;1/5/27
Pans1 Bandelettes gly.;1/10/25
Pans1 Bandelettes Urinaires;1/8/25
Pans1 Bistouri;1/1/30
Pans1 Bouchons perf;1/3/27
Pans1 Canules Nasales O2;1/8/29
Pans1 Capuchon transfert;1/11/26
Pans1 Catheter court 20G;1/12/26
Pans1 Catheter court 22G;1/12/28
Pans1 Champ Soin Fenetré;1/11/25
Pans1 Ciseaux Droits Sté;1/5/29
Pans1 Colle dermique;1/10/25
Pans1 Corps prélèvement;
Pans1 Coton Hydrophile;
Pans1 Eau sté aquapack;1/7/29
Pans1 Etui pénien 25mm;1/10/28
Pans1 Etui pénien 30mm;1/6/25
Pans1 Etui pénien 35mm;1/8/28
Pans1 Gel lubrifiant KY sté;1/4/26
Pans1 Lancettes Gly.;1/7/28
Pans1 Lidocaine cathejell;1/11/26
Pans1 Masque O2 Haute conc.;1/8/28
Pans1 Microperfuseur Cathé 22g;1/3/28
Pans1 Nebulisateur Masque;1/12/25
Pans1 Perfuseur 1 voie;1/6/29
Pans1 Perfuseur 3 voies;1/7/29
Pans1 Pince anatomique;1/6/29
Pans1 Pince Ote agraphe;1/1/28
Pans1 Plateau sté;1/8/29
Pans1 Poche urine 2l non sté;
Pans1 Poche urine 2l sté;1/11/28
Pans1 Prolongateur 3 voies;1/4/26
Pans1 Régulateur de débit;1/2/29
Pans1 SE Surgipro 3-0;1/4/28
Pans1 SE Surgipro 4-0;1/3/28
Pans1 Seringue 10ml;1/12/28
Pans1 Seringue 1ml;1/8/28
Pans1 Seringue 20ml;1/10/28
Pans1 Seringue 50ml;1/9/28
Pans1 Seringue 5ml;1/1/29
Pans1 Set Sondage urinaire;1/8/27
Pans1 Set suture;1/9/27
Pans1 Sonde Aspi CH16;1/9/27
Pans1 Sonde Foley 3v CH18;1/10/27
Pans1 Sonde Foley CH16;1/1/29
Pans1 Sonde Rectale CH20;1/8/28
Pans1 Sonde vesicale CH14;1/11/27
Pans1 Tubulure O2;1/9/26
Pans1 Unité prlevmnt 23G;1/3/26
Pans1 Uro Tainer;1/9/26
Pans2 Bande Cont;
Pans2 Bande Cont Rosidal K;1/7/27
Pans2 Bande crepe 10X4;1/9/28
Pans2 Bande crepe 15X4;1/12/28
Pans2 Bande ext 10X4;1/11/27
Pans2 Boule Sté;1/2/27
Pans2 Compresse Gaz 17X45;1/1/28
Pans2 Compresse Hémostatique;1/10/28
Pans2 Compresse Non sté;1/1/28
Pans2 Compresse sté;1/4/29
Pans2 Curette sté;1/1/29
Pans2 Filet tubule tete;
Pans2 Gant sté T7 1/2;1/7/26
Pans2 Mis Bas T2;
Pans2 Mis Bas T3;
Pans2 Mis Bas T4;
Pans2 Mis Bas T5;
Pans2 Pansement abs non sté;1/2/28
Pans2 Pansement abs sté;1/3/29
Pans2 Pansement adh 10X15 sylaplaie;1/7/26
Pans2 Pansement adh 10X8 sylaplaie;1/1/28
Pans2 Pansement adh 5X7.2 sylaplaie;1/6/28
Pans2 pansement adh tégaderm 10x12;1/2/27
Pans2 Pansement adh tégaderm 7X8.5;1/11/26
Pans2 Pansement Charbon;1/1/28
Pans2 Pansement gras 10X10;1/9/28
Pans2 Pansement gras 10X40;1/2/27
Pans2 Pansement Hydro adh 12.5X12.5;1/2/29
Pans2 Pansement hydro adh 8X8;1/2/29
Pans2 Pansement hydro duoderm E 10X10;1/6/28
Pans2 Pansement hydro duoderm EM 12.5X12.5;1/9/28
Pans2 Pansement hydro fibre aquacel ex 12,5X12,5;1/1/29
Pans2 Pansement hydro fibre meche;1/4/29
Pans2 Pansement hydro gel intrasite;1/8/26
Pans2 Pansement hydro non adh 12.5X12;1/6/28
Pans2 Pansement hydro non adh 17.5X17;1/11/28
Pans2 Pansement hydrocell aquacell Foam Sacrum;1/2/29
Pans2 Pansement hydrocoll duoderm sacrum;1/2/26
Pans2 Pansement interface urgotul 10X10;1/11/26
Pans2 Pansement interface urgotul 15X20;1/1/27
Pans2 Pansement interface urgotul 5X5;1/7/26
Pans2 Povidone iodée;1/6/28
Pans2 set de psmnt;1/2/27
Pans2 Sparadrap ext 10X10;1/6/28
Pans2 Sparadrap ext 10X5;1/5/28
Pans2 Sparadrap support tissu 5X5;1/8/26
Pans2 Sparadrap uporeux 5X2;1/6/28
Pans2 Sparadrap uporeux 5X5;1/2/27
Pans2 Suture cut adh;1/2/27
Pans3 Chlorure sodium 0.9 1000ml;1/11/26
Pans3 Chlorure sodium 0.9 500ml;1/12/25
Pans3 Chlorure sodium 0.9 50ml;1/9/25
Pans3 Eau PPI;1/1/26
Pans3 Eau sté pour irrig 500ml;1/9/25
Pans3 GLUCIDION G5 1000ml;1/12/25
Pans3 Glucose 10% 500ml;1/3/26
Pans3 Glucose 2.5 1000ml;1/10/25
Pans3 Glucose 2.5 500ml;1/10/25
Pans3 Glucose 30% 500ml;1/12/25
Pans3 Glucose 5% 1000ml;1/11/26
Pans3 Glucose 5% 500ml;1/12/25
Pomm4 Physiodose 0.9;1/3/27
Pomm4 alcool;1/12/26
Pomm4 anti adh;1/7/26
Pomm4 bépanthene;1/10/26
Pomm4 Beta alcoolique;1/1/27
Pomm4 Beta dermique;1/1/26
Pomm4 béta gel;1/7/27
Pomm4 Beta scrub;1/12/26
Pomm4 Beta vaginale;1/10/26
Pomm4 betneval;1/9/26
Pomm4 Biseptine;1/10/26
Pomm4 cerat galien;1/9/25
Pomm4 clarelux;1/1/26
Pomm4 cold cream;1/10/25
Pomm4 creme zinc;
Pomm4 dakin;1/12/25
Pomm4 Dermocort. Locapred;1/2/26
Pomm4 Dermocort. Nerisone betneval;1/9/26
Pomm4 eau oxygénée;1/6/26
Pomm4 econazole creme;1/9/26
Pomm4 econazole poudre;1/12/26
Pomm4 eosine;1/3/27
Pomm4 flector;1/9/26
Pomm4 fucidate de sodium;1/12/26
Pomm4 glycerol vaseline paraffine;1/1/29
Pomm4 hemoclar;1/8/25
Pomm4 liniment;1/8/26
Pomm4 Talc;1/8/26
Pomm4 vaseline;1/1/29
Pomm5 Batonnet soin de bouche;1/10/28
Pomm5 Embout tymp Hillrom;
Pomm5 poche aspi 1500ml sté;
Pomm5 tubulure aspi sté;1/7/28
Pomm5 tubulure aspi valve sté;1/3/28
PrelECBU;1/4/27
PrelPrélevement Bactério;
PrelPrélevement labo COVID;1/2/26
PrelRecueil unrines 24h;1/12/26
PrelTROD;1/8/27`;

// ─── Date Utilities ───────────────────────────────────────────────────────────

function parseDate(str: string): Date | null {
  if (!str || !str.trim()) return null;
  const parts = str.trim().split('/');
  if (parts.length !== 3) return null;
  const d = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  let y = parseInt(parts[2], 10);
  if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
  if (y < 100) y += 2000;
  const date = new Date(y, m, d);
  if (isNaN(date.getTime())) return null;
  return date;
}

function dateToInput(str: string): string {
  const d = parseDate(str);
  if (!d) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function inputToPeremption(input: string): string {
  if (!input) return '';
  const [yyyy, mm, dd] = input.split('-');
  return `${parseInt(dd)}/${parseInt(mm)}/${yyyy}`;
}

function getDiffDays(peremption: string): number | null {
  const d = parseDate(peremption);
  if (!d) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.floor((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function computeColorPriority(peremption: string): 1 | 2 | 3 | 4 | 5 {
  if (!peremption || !peremption.trim()) return 5;
  const diff = getDiffDays(peremption);
  if (diff === null) return 5;
  if (diff < 0) return 1;
  if (diff < 30) return 2;
  if (diff < 90) return 3;
  return 4;
}

function computeUrgencyGroup(peremption: string): 1 | 2 {
  const cp = computeColorPriority(peremption);
  return cp <= 2 ? 1 : 2;
}

function addSortData(products: Product[]): Product[] {
  return products.map(p => ({
    ...p,
    ColorPriority: computeColorPriority(p.Peremption),
    UrgencyGroup: computeUrgencyGroup(p.Peremption),
  }));
}

function todayFormatted(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ─── CSV Processing ───────────────────────────────────────────────────────────

const MULTI_CHAR_PREFIXES = ['Urg', 'Pans', 'Pomm', 'Prel'];

function extractPrefix(raw: string): { prefix: string; rest: string } {
  for (const mp of MULTI_CHAR_PREFIXES) {
    if (raw.startsWith(mp)) {
      return { prefix: mp, rest: raw.slice(mp.length) };
    }
  }
  // single char prefix
  const prefix = raw[0] ?? '';
  const rest = raw.slice(1);
  return { prefix, rest };
}

function processCsv(csv: string, categoryMap: Record<string, string>): Product[] {
  const lines = csv.split('\n').map(l => l.trim()).filter(Boolean);
  const products: Product[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const semiIdx = line.indexOf(';');
    if (semiIdx === -1) continue;
    const rawName = line.slice(0, semiIdx).trim();
    const peremption = line.slice(semiIdx + 1).trim();
    if (!rawName) continue;

    const { prefix, rest } = extractPrefix(rawName);
    const categoryName = categoryMap[prefix] ?? prefix;

    let subCategory = '';
    let produitName = rest;

    if (prefix === 'Urg') {
      // next char after prefix is subcategory (A/B/C)
      const sub = rest[0] ?? '';
      if (sub === 'A' || sub === 'B' || sub === 'C') {
        subCategory = sub;
        produitName = rest.slice(1);
      } else {
        produitName = rest;
      }
    } else if (prefix === 'Pans' || prefix === 'Pomm' || prefix === 'Prel') {
      // remove leading digits+space
      produitName = rest.replace(/^\d+\s*/, '');
    } else {
      // single char: rest is " Produit name", trim leading space
      produitName = rest.startsWith(' ') ? rest.slice(1) : rest;
    }

    const categoryLabel = `${categoryName} (${prefix})`;

    products.push({
      id: generateId(),
      Produit: produitName,
      Category: categoryLabel,
      SubCategory: subCategory,
      Peremption: peremption,
      ColorPriority: computeColorPriority(peremption),
      UrgencyGroup: computeUrgencyGroup(peremption),
    });
  }

  return products;
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

async function loadFromSupabase(): Promise<AppData | null> {
  const sb = createClient();
  const { data, error } = await sb
    .from('peremptions_store')
    .select('data')
    .eq('key', 'main')
    .single();
  if (error || !data) return null;
  return data.data as AppData;
}

async function saveToSupabase(appData: AppData): Promise<void> {
  const sb = createClient();
  await sb
    .from('peremptions_store')
    .upsert({ key: 'main', data: appData, updated_at: new Date().toISOString() });
}

// ─── Default data builder ─────────────────────────────────────────────────────

function buildDefaultData(): AppData {
  const allCategoryMap = { ...BASE_CATEGORY_MAP };
  const products = processCsv(DEFAULT_CSV, allCategoryMap);
  return {
    lastModificationDate: null,
    modificationLog: [],
    customCategories: {},
    products,
  };
}

// ─── Category filter order helpers ───────────────────────────────────────────

const SPECIAL_ORDER = ['Urg', 'Pans', 'Pomm', 'Prel'];

function getCategoryPrefix(categoryLabel: string): string {
  const m = categoryLabel.match(/\(([^)]+)\)$/);
  return m ? m[1] : '';
}

function sortCategories(categories: string[]): string[] {
  const specials = SPECIAL_ORDER.map(p =>
    categories.find(c => getCategoryPrefix(c) === p)
  ).filter(Boolean) as string[];
  const normals = categories
    .filter(c => !SPECIAL_ORDER.includes(getCategoryPrefix(c)))
    .sort((a, b) => a.localeCompare(b, 'fr'));
  return [...normals, ...specials];
}

// ─── Row color ────────────────────────────────────────────────────────────────

function rowBg(cp: number): string {
  if (cp === 1) return 'bg-red-600 text-white font-bold';
  if (cp === 2) return 'bg-orange-200';
  if (cp === 3) return 'bg-yellow-100';
  return '';
}

// ─── Filter button color ──────────────────────────────────────────────────────

function filterBtnClass(prefix: string, active: boolean): string {
  if (prefix === 'Urg') return active ? 'bg-amber-500 text-white border-amber-600' : 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200';
  if (prefix === 'Pans') return active ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200';
  if (prefix === 'Pomm') return active ? 'bg-purple-600 text-white border-purple-700' : 'bg-purple-100 text-purple-800 border-purple-300 hover:bg-purple-200';
  if (prefix === 'Prel') return active ? 'bg-slate-600 text-white border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200';
  return active ? 'bg-green-700 text-white border-green-800' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50';
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────

type SortKey = 'Produit' | 'Category' | 'Peremption';
type SortDir = 'asc' | 'desc';

export default function PeremptionsPage() {
  const queryClient = useQueryClient();

  // ── State ──────────────────────────────────────────────────────────────────
  const [appData, setAppData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('all');

  const [searchText, setSearchText] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('Produit');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number | 'all'>(10);

  const [alertOpen, setAlertOpen] = useState(true);
  const [infoOpen, setInfoOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminMode, setAdminMode] = useState(false);

  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminPasswordError, setAdminPasswordError] = useState('');

  // edit date inline
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');

  // add product form
  const [newProduit, setNewProduit] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newDate, setNewDate] = useState('');

  // manage categories
  const [newCatName, setNewCatName] = useState('');
  const [newCatPrefix, setNewCatPrefix] = useState('');

  // reset confirm
  const [resetPwInput, setResetPwInput] = useState('');
  const [resetPwError, setResetPwError] = useState('');

  // file input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load data ──────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const remote = await loadFromSupabase();
        if (remote && remote.products && remote.products.length > 0) {
          setAppData({ ...remote, products: addSortData(remote.products) });
        } else {
          setAppData(buildDefaultData());
        }
      } catch {
        setAppData(buildDefaultData());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Save helper ────────────────────────────────────────────────────────────
  const saveData = useCallback(async (data: AppData) => {
    setAppData(data);
    try {
      await saveToSupabase(data);
    } catch {
      toast.error('Erreur lors de la sauvegarde Supabase');
    }
  }, []);

  // ── Derived state ──────────────────────────────────────────────────────────

  const categoryMap = useMemo<Record<string, string>>(() => {
    if (!appData) return BASE_CATEGORY_MAP;
    return { ...BASE_CATEGORY_MAP, ...appData.customCategories };
  }, [appData]);

  const allCategories = useMemo<string[]>(() => {
    if (!appData) return [];
    const set = new Set(appData.products.map(p => p.Category));
    return sortCategories(Array.from(set));
  }, [appData]);

  // products with re-computed priorities
  const products = useMemo<Product[]>(() => {
    if (!appData) return [];
    return addSortData(appData.products);
  }, [appData]);

  // alerts: <30j and not expired
  const alertProducts = useMemo(() =>
    products.filter(p => p.ColorPriority === 2),
    [products]
  );

  // filtered
  const filtered = useMemo(() => {
    let list = products;
    if (selectedCategory !== 'all') {
      list = list.filter(p => p.Category === selectedCategory);
      if (selectedSubCategory !== 'all') {
        list = list.filter(p => p.SubCategory === selectedSubCategory);
      }
    }
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      list = list.filter(p =>
        p.Produit.toLowerCase().includes(q) || p.Category.toLowerCase().includes(q)
      );
    }
    return list;
  }, [products, selectedCategory, selectedSubCategory, searchText]);

  // sorted
  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      // primary: urgency group
      if (a.UrgencyGroup !== b.UrgencyGroup) return a.UrgencyGroup - b.UrgencyGroup;
      // secondary: chosen sort
      let cmp = 0;
      if (sortKey === 'Produit') cmp = a.Produit.localeCompare(b.Produit, 'fr');
      else if (sortKey === 'Category') cmp = a.Category.localeCompare(b.Category, 'fr');
      else if (sortKey === 'Peremption') {
        const da = parseDate(a.Peremption);
        const db = parseDate(b.Peremption);
        if (!da && !db) cmp = 0;
        else if (!da) cmp = 1;
        else if (!db) cmp = -1;
        else cmp = da.getTime() - db.getTime();
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [filtered, sortKey, sortDir]);

  // paginated
  const { paginated, totalPages } = useMemo(() => {
    if (pageSize === 'all') return { paginated: sorted, totalPages: 1 };
    const total = Math.max(1, Math.ceil(sorted.length / pageSize));
    const safeP = Math.min(page, total);
    const start = (safeP - 1) * pageSize;
    return { paginated: sorted.slice(start, start + pageSize), totalPages: total };
  }, [sorted, page, pageSize]);

  // ensure page is valid
  useEffect(() => {
    if (pageSize !== 'all') {
      const total = Math.max(1, Math.ceil(sorted.length / (pageSize as number)));
      if (page > total) setPage(total);
    }
  }, [sorted.length, pageSize, page]);

  // ── Sort toggle ────────────────────────────────────────────────────────────
  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(1);
  }

  // ── Category filter ────────────────────────────────────────────────────────
  function selectCategory(cat: string) {
    setSelectedCategory(cat);
    setSelectedSubCategory('all');
    setPage(1);
  }

  // ── Admin password ─────────────────────────────────────────────────────────
  function tryAdminLogin() {
    if (adminPasswordInput === todayFormatted()) {
      setAdminMode(true);
      setAdminPasswordError('');
      setAdminPasswordInput('');
      toast.success('Mode administrateur activé');
    } else {
      setAdminPasswordError('Mot de passe incorrect');
    }
  }

  function exitAdmin() {
    setAdminMode(false);
    setAdminOpen(false);
    toast.info('Mode administrateur désactivé');
  }

  // ── Edit date inline ───────────────────────────────────────────────────────
  function startEdit(product: Product) {
    setEditingId(product.id);
    setEditingValue(dateToInput(product.Peremption));
  }

  async function commitEdit(productId: string) {
    if (!appData) return;
    const product = appData.products.find(p => p.id === productId);
    if (!product) return;
    const newPeremption = inputToPeremption(editingValue);
    const now = todayFormatted();
    const newLog = [
      { productName: product.Produit, newDate: newPeremption || '(vide)' },
      ...appData.modificationLog,
    ].slice(0, 10);
    const updated: AppData = {
      ...appData,
      lastModificationDate: now,
      modificationLog: newLog,
      products: appData.products.map(p =>
        p.id === productId ? { ...p, Peremption: newPeremption } : p
      ),
    };
    setEditingId(null);
    await saveData(updated);
    toast.success(`Date mise à jour : ${product.Produit}`);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingValue('');
  }

  // ── Delete product ─────────────────────────────────────────────────────────
  async function deleteProduct(productId: string) {
    if (!appData) return;
    const product = appData.products.find(p => p.id === productId);
    if (!product) return;
    if (!confirm(`Supprimer "${product.Produit}" ?`)) return;
    const updated: AppData = {
      ...appData,
      products: appData.products.filter(p => p.id !== productId),
    };
    await saveData(updated);
    toast.success(`Produit supprimé : ${product.Produit}`);
  }

  // ── Add product ────────────────────────────────────────────────────────────
  async function addProduct() {
    if (!appData || !newProduit.trim() || !newCategory) {
      toast.error('Nom et catégorie requis');
      return;
    }
    const peremption = newDate ? inputToPeremption(newDate) : '';
    const newProduct: Product = {
      id: generateId(),
      Produit: newProduit.trim(),
      Category: newCategory,
      SubCategory: '',
      Peremption: peremption,
      ColorPriority: computeColorPriority(peremption),
      UrgencyGroup: computeUrgencyGroup(peremption),
    };
    const now = todayFormatted();
    const newLog = [
      { productName: newProduct.Produit, newDate: peremption || '(vide)' },
      ...appData.modificationLog,
    ].slice(0, 10);
    const updated: AppData = {
      ...appData,
      lastModificationDate: now,
      modificationLog: newLog,
      products: [...appData.products, newProduct],
    };
    await saveData(updated);
    setNewProduit('');
    setNewCategory('');
    setNewDate('');
    toast.success(`Produit ajouté : ${newProduct.Produit}`);
  }

  // ── Add custom category ───────────────────────────────────────────────────
  async function addCustomCategory() {
    if (!appData || !newCatName.trim() || !newCatPrefix.trim()) {
      toast.error('Nom et préfixe requis');
      return;
    }
    const prefix = newCatPrefix.trim();
    if (BASE_CATEGORY_MAP[prefix]) {
      toast.error('Ce préfixe existe déjà dans les catégories de base');
      return;
    }
    const updated: AppData = {
      ...appData,
      customCategories: { ...appData.customCategories, [prefix]: newCatName.trim() },
    };
    await saveData(updated);
    setNewCatName('');
    setNewCatPrefix('');
    toast.success('Catégorie ajoutée');
  }

  async function deleteCustomCategory(prefix: string) {
    if (!appData) return;
    const hasProducts = appData.products.some(p => getCategoryPrefix(p.Category) === prefix);
    if (hasProducts) {
      toast.error('Impossible de supprimer une catégorie utilisée par des produits');
      return;
    }
    const newCustom = { ...appData.customCategories };
    delete newCustom[prefix];
    await saveData({ ...appData, customCategories: newCustom });
    toast.success('Catégorie supprimée');
  }

  // ── Save JSON ─────────────────────────────────────────────────────────────
  function saveJson() {
    if (!appData) return;
    const json = JSON.stringify(appData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const today = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `stock_ehpad_sauvegarde_${today}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Sauvegarde téléchargée');
  }

  // ── Load JSON ─────────────────────────────────────────────────────────────
  function loadJsonFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string) as AppData;
        if (!parsed.products) throw new Error('Format invalide');
        await saveData({ ...parsed, products: addSortData(parsed.products) });
        toast.success('Sauvegarde chargée');
      } catch {
        toast.error('Erreur : fichier JSON invalide');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  // ── Reset to defaults ─────────────────────────────────────────────────────
  async function resetToDefaults() {
    if (resetPwInput !== todayFormatted()) {
      setResetPwError('Mot de passe incorrect');
      return;
    }
    if (!confirm('Réinitialiser toutes les données aux valeurs par défaut ? Cette action est irréversible.')) return;
    const def = buildDefaultData();
    await saveData(def);
    setResetPwInput('');
    setResetPwError('');
    toast.success('Données réinitialisées');
  }

  // ── Sort icon ─────────────────────────────────────────────────────────────
  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronsUpDown className="inline ml-1 w-3 h-3 opacity-40" />;
    return sortDir === 'asc'
      ? <ChevronUp className="inline ml-1 w-3 h-3" />
      : <ChevronDown className="inline ml-1 w-3 h-3" />;
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex items-center gap-3 text-gray-600">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Chargement des données…</span>
        </div>
      </div>
    );
  }

  if (!appData) return null;

  const isUrgSelected = selectedCategory !== 'all' && getCategoryPrefix(selectedCategory) === 'Urg';
  const customCatPrefixes = Object.keys(appData.customCategories);
  const customCategories = allCategories.filter(c => customCatPrefixes.includes(getCategoryPrefix(c)));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-green-700 to-teal-600 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-4">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1 text-green-200 text-sm mb-2">
            <Link href="/" className="hover:text-white transition-colors">Accueil</Link>
            <ChevronRight className="w-4 h-4" />
            <span className="text-white font-medium">Péremptions</span>
          </nav>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Package className="w-7 h-7 text-green-200" />
              <div>
                <h1 className="text-2xl font-bold">Gestion des Péremptions</h1>
                <p className="text-green-200 text-sm">Stock EHPAD — {products.length} produits</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {alertProducts.length > 0 && (
                <Badge className="bg-orange-500 text-white text-sm px-3 py-1">
                  <AlertTriangle className="w-3 h-3 mr-1 inline" />
                  {alertProducts.length} alerte{alertProducts.length > 1 ? 's' : ''}
                </Badge>
              )}
              {adminMode && (
                <Badge className="bg-red-500 text-white text-sm px-3 py-1">
                  <ShieldCheck className="w-3 h-3 mr-1 inline" />
                  Admin
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">

        {/* ── Alert panel ──────────────────────────────────────────────────── */}
        {alertProducts.length > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl shadow-sm overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-4 py-3 bg-orange-100 hover:bg-orange-150 transition-colors"
              onClick={() => setAlertOpen(o => !o)}
            >
              <div className="flex items-center gap-2 text-orange-800 font-semibold">
                <AlertTriangle className="w-5 h-5 text-orange-500" />
                Produits expirant dans moins de 30 jours
                <span className="bg-orange-500 text-white rounded-full px-2 py-0.5 text-xs font-bold ml-1">
                  {alertProducts.length}
                </span>
              </div>
              {alertOpen ? <ChevronUp className="w-4 h-4 text-orange-600" /> : <ChevronDown className="w-4 h-4 text-orange-600" />}
            </button>
            {alertOpen && (
              <div className="px-4 py-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {alertProducts.map(p => {
                    const diff = getDiffDays(p.Peremption);
                    return (
                      <div key={p.id} className="flex items-center justify-between bg-white border border-orange-200 rounded-lg px-3 py-2 text-sm">
                        <span className="font-medium text-gray-800 truncate mr-2">{p.Produit}</span>
                        <span className="text-orange-700 font-semibold whitespace-nowrap">
                          {diff !== null ? `J-${diff}` : ''} ({p.Peremption})
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Info section ─────────────────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
            onClick={() => setInfoOpen(o => !o)}
          >
            <div className="flex items-center gap-2 text-gray-700 font-semibold">
              <Info className="w-4 h-4 text-teal-600" />
              Informations & Outils
            </div>
            {infoOpen ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
          </button>
          {infoOpen && (
            <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">Dernière modification :</span>{' '}
                    {appData.lastModificationDate ?? 'Aucune'}
                  </p>
                  {appData.modificationLog.length > 0 && (
                    <div className="mt-2">
                      <p className="text-sm font-medium text-gray-700 mb-1">10 dernières modifications :</p>
                      <ul className="text-xs text-gray-600 space-y-0.5 max-h-40 overflow-y-auto">
                        {appData.modificationLog.map((m, i) => (
                          <li key={i} className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-teal-400 flex-shrink-0" />
                            <span className="truncate">{m.productName}</span>
                            <span className="text-gray-400 flex-shrink-0">→</span>
                            <span className="text-teal-700 flex-shrink-0">{m.newDate}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <Button variant="outline" size="sm" onClick={saveJson} className="justify-start">
                    <Download className="w-4 h-4 mr-2" />
                    Sauvegarder (Télécharger JSON)
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="justify-start">
                    <Upload className="w-4 h-4 mr-2" />
                    Charger une sauvegarde
                  </Button>
                  <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={loadJsonFile} />
                  {!adminMode ? (
                    <Button variant="outline" size="sm" onClick={() => setAdminOpen(o => !o)} className="justify-start text-amber-700 border-amber-300 hover:bg-amber-50">
                      <ShieldCheck className="w-4 h-4 mr-2" />
                      Mode Administrateur
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={exitAdmin} className="justify-start text-red-700 border-red-300 hover:bg-red-50">
                      <ShieldOff className="w-4 h-4 mr-2" />
                      Quitter le mode Admin
                    </Button>
                  )}
                </div>
              </div>

              {/* Admin login */}
              {adminOpen && !adminMode && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-amber-800 mb-2">Mot de passe administrateur</p>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      placeholder="DD/MM/YYYY"
                      value={adminPasswordInput}
                      onChange={e => setAdminPasswordInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && tryAdminLogin()}
                      className="max-w-xs text-sm"
                    />
                    <Button size="sm" onClick={tryAdminLogin} className="bg-amber-600 hover:bg-amber-700 text-white">
                      Valider
                    </Button>
                  </div>
                  {adminPasswordError && <p className="text-red-600 text-xs mt-1">{adminPasswordError}</p>}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Admin panel ───────────────────────────────────────────────────── */}
        {adminMode && (
          <div className="bg-red-50 border border-red-200 rounded-xl shadow-sm p-4 space-y-4">
            <h2 className="font-bold text-red-800 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              Panneau Administrateur
            </h2>

            {/* Add product */}
            <div className="bg-white border border-red-100 rounded-lg p-3">
              <p className="text-sm font-semibold text-gray-700 mb-2">Ajouter un produit</p>
              <div className="flex flex-wrap gap-2">
                <Input
                  placeholder="Nom du produit"
                  value={newProduit}
                  onChange={e => setNewProduit(e.target.value)}
                  className="text-sm flex-1 min-w-[160px]"
                />
                <select
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  className="border border-gray-300 rounded-md px-2 py-1 text-sm flex-1 min-w-[160px]"
                >
                  <option value="">— Catégorie —</option>
                  {allCategories.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <Input
                  type="date"
                  value={newDate}
                  onChange={e => setNewDate(e.target.value)}
                  className="text-sm w-44"
                />
                <Button size="sm" onClick={addProduct} className="bg-green-700 hover:bg-green-800 text-white">
                  <Plus className="w-4 h-4 mr-1" />
                  Ajouter
                </Button>
              </div>
            </div>

            {/* Manage categories */}
            <div className="bg-white border border-red-100 rounded-lg p-3">
              <p className="text-sm font-semibold text-gray-700 mb-2">Gérer les catégories personnalisées</p>
              <div className="flex flex-wrap gap-2 mb-3">
                <Input
                  placeholder="Nom (ex: Divers)"
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  className="text-sm flex-1 min-w-[140px]"
                />
                <Input
                  placeholder="Préfixe (ex: Div)"
                  value={newCatPrefix}
                  onChange={e => setNewCatPrefix(e.target.value)}
                  className="text-sm w-36"
                />
                <Button size="sm" onClick={addCustomCategory} className="bg-teal-700 hover:bg-teal-800 text-white">
                  <Plus className="w-4 h-4 mr-1" />
                  Ajouter
                </Button>
              </div>
              {customCategories.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {customCategories.map(c => {
                    const prefix = getCategoryPrefix(c);
                    return (
                      <div key={c} className="flex items-center gap-1 bg-gray-100 rounded-full px-3 py-1 text-sm">
                        <span>{c}</span>
                        <button
                          onClick={() => deleteCustomCategory(prefix)}
                          className="text-red-500 hover:text-red-700 ml-1"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-gray-500">Aucune catégorie personnalisée</p>
              )}
            </div>

            {/* Reset */}
            <div className="bg-white border border-red-100 rounded-lg p-3">
              <p className="text-sm font-semibold text-red-700 mb-2">Réinitialiser aux données par défaut</p>
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder="Mot de passe (DD/MM/YYYY)"
                  value={resetPwInput}
                  onChange={e => setResetPwInput(e.target.value)}
                  className="text-sm max-w-xs"
                />
                <Button size="sm" variant="destructive" onClick={resetToDefaults}>
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Réinitialiser
                </Button>
              </div>
              {resetPwError && <p className="text-red-600 text-xs mt-1">{resetPwError}</p>}
            </div>
          </div>
        )}

        {/* ── Main card ─────────────────────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">

          {/* Color legend */}
          <div className="flex flex-wrap items-center gap-3 px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs text-gray-600">
            <span className="font-medium">Légende :</span>
            <span className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-red-600 border border-red-700 inline-block" /> Périmé</span>
            <span className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-orange-300 border border-orange-400 inline-block" /> &lt; 30 jours</span>
            <span className="flex items-center gap-1"><span className="w-4 h-4 rounded bg-yellow-200 border border-yellow-400 inline-block" /> &lt; 3 mois</span>
          </div>

          {/* Category filters */}
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => selectCategory('all')}
                className={cn(
                  'px-3 py-1 rounded-md border text-xs font-medium transition-colors',
                  selectedCategory === 'all'
                    ? 'bg-green-700 text-white border-green-800'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                )}
              >
                Afficher Tout
              </button>
              {allCategories.map(cat => {
                const prefix = getCategoryPrefix(cat);
                const isActive = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    onClick={() => selectCategory(cat)}
                    className={cn(
                      'px-3 py-1 rounded-md border text-xs font-medium transition-colors',
                      filterBtnClass(prefix, isActive)
                    )}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Urg sub-category filters */}
          {isUrgSelected && (
            <div className="px-4 py-2 border-b border-amber-100 bg-amber-50">
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setSelectedSubCategory('all')}
                  className={cn(
                    'px-3 py-1 rounded-md border text-xs font-medium transition-colors',
                    selectedSubCategory === 'all'
                      ? 'bg-amber-500 text-white border-amber-600'
                      : 'bg-white text-amber-800 border-amber-300 hover:bg-amber-50'
                  )}
                >
                  Tout le Sac
                </button>
                {Object.entries(SUB_CATEGORY_MAP).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setSelectedSubCategory(key)}
                    className={cn(
                      'px-3 py-1 rounded-md border text-xs font-medium transition-colors',
                      selectedSubCategory === key
                        ? 'bg-amber-500 text-white border-amber-600'
                        : 'bg-white text-amber-800 border-amber-300 hover:bg-amber-50'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Search + page size */}
          <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[180px] max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Rechercher un produit ou catégorie…"
                value={searchText}
                onChange={e => { setSearchText(e.target.value); setPage(1); }}
                className="pl-8 text-sm"
              />
            </div>
            <div className="flex items-center gap-1.5 text-sm text-gray-600 ml-auto">
              <span>Afficher</span>
              <select
                value={pageSize}
                onChange={e => { setPageSize(e.target.value === 'all' ? 'all' : Number(e.target.value)); setPage(1); }}
                className="border border-gray-300 rounded px-2 py-1 text-sm"
              >
                {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                <option value="all">Tous</option>
              </select>
              <span>par page</span>
            </div>
            <span className="text-xs text-gray-500">{filtered.length} produit{filtered.length > 1 ? 's' : ''}</span>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th
                    className="px-4 py-3 text-left font-semibold text-gray-700 cursor-pointer select-none hover:bg-gray-100 transition-colors"
                    onClick={() => toggleSort('Produit')}
                  >
                    Produit <SortIcon col="Produit" />
                  </th>
                  <th
                    className="px-4 py-3 text-left font-semibold text-gray-700 cursor-pointer select-none hover:bg-gray-100 transition-colors"
                    onClick={() => toggleSort('Category')}
                  >
                    Catégorie (Lieu) <SortIcon col="Category" />
                  </th>
                  <th
                    className="px-4 py-3 text-left font-semibold text-gray-700 cursor-pointer select-none hover:bg-gray-100 transition-colors"
                    onClick={() => toggleSort('Peremption')}
                  >
                    Date de Péremption <SortIcon col="Peremption" />
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginated.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                      Aucun produit trouvé
                    </td>
                  </tr>
                ) : paginated.map(product => {
                  const isEditing = editingId === product.id;
                  const bgClass = rowBg(product.ColorPriority);
                  const diff = getDiffDays(product.Peremption);
                  const categoryLabel = product.SubCategory
                    ? `${product.Category} — ${SUB_CATEGORY_MAP[product.SubCategory] ?? product.SubCategory}`
                    : product.Category;

                  return (
                    <tr
                      key={product.id}
                      className={cn(
                        'border-b border-gray-100 hover:brightness-95 transition-all',
                        bgClass
                      )}
                    >
                      <td className="px-4 py-2.5 font-medium">{product.Produit}</td>
                      <td className="px-4 py-2.5 text-xs">{categoryLabel}</td>
                      <td
                        className="px-4 py-2.5 cursor-pointer"
                        onClick={() => !isEditing && startEdit(product)}
                        title="Cliquer pour modifier la date"
                      >
                        {isEditing ? (
                          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <input
                              type="date"
                              value={editingValue}
                              autoFocus
                              onChange={e => setEditingValue(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') commitEdit(product.id);
                                if (e.key === 'Escape') cancelEdit();
                              }}
                              onBlur={() => commitEdit(product.id)}
                              className="border rounded px-1 py-0.5 text-sm bg-white text-gray-900"
                            />
                          </div>
                        ) : (
                          <span className="hover:underline underline-offset-2">
                            {product.Peremption || '—'}
                            {diff !== null && diff >= 0 && diff < 90 && (
                              <span className="ml-1 text-xs opacity-75">(J-{diff})</span>
                            )}
                            {diff !== null && diff < 0 && (
                              <span className="ml-1 text-xs opacity-90">(périmé)</span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {adminMode && (
                          <button
                            onClick={() => deleteProduct(product.id)}
                            className="text-red-500 hover:text-red-700 transition-colors p-1 rounded hover:bg-red-50"
                            title="Supprimer ce produit"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pageSize !== 'all' && totalPages > 1 && (
            <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
              <p className="text-xs text-gray-500">
                Page {Math.min(page, totalPages)} / {totalPages} — {sorted.length} produit{sorted.length > 1 ? 's' : ''}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(1)}
                  disabled={page <= 1}
                  className="h-7 px-2 text-xs"
                >
                  «
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="h-7 px-2 text-xs"
                >
                  ‹
                </Button>
                {/* Page numbers */}
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const safeP = Math.min(page, totalPages);
                  let start = Math.max(1, safeP - 2);
                  const end = Math.min(totalPages, start + 4);
                  start = Math.max(1, end - 4);
                  return start + i;
                }).filter(n => n >= 1 && n <= totalPages).map(n => (
                  <Button
                    key={n}
                    variant={n === Math.min(page, totalPages) ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setPage(n)}
                    className={cn('h-7 px-2.5 text-xs', n === Math.min(page, totalPages) && 'bg-green-700 hover:bg-green-800')}
                  >
                    {n}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="h-7 px-2 text-xs"
                >
                  ›
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(totalPages)}
                  disabled={page >= totalPages}
                  className="h-7 px-2 text-xs"
                >
                  »
                </Button>
              </div>
            </div>
          )}

          {pageSize === 'all' && (
            <div className="px-4 py-2 border-t border-gray-100">
              <p className="text-xs text-gray-500">{sorted.length} produit{sorted.length > 1 ? 's' : ''} affichés</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
