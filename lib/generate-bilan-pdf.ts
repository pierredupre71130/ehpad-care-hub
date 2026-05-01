import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface PdfCalibration {
  nom_x: number; nom_y_from_top: number;
  prenom_x: number; prenom_y_from_top: number;
  prescripteur_x: number; prescripteur_y_from_top: number;
  jour_x: number; jour_y_from_top: number;
  mois_x: number; mois_y_from_top: number;
  annee_x: number; annee_y_from_top: number;
  check_x_offset: number; check_y_offset: number;
  nfs_y_extra: number;
  nb_echantillons_x: number; nb_echantillons_y_from_top: number;
  presc_jour_x: number; presc_jour_y_from_top: number;
  presc_mois_x: number; presc_mois_y_from_top: number;
  presc_annee_x: number; presc_annee_y_from_top: number;
  ajeun_x: number; ajeun_y_from_top: number;
  poids_x: number; poids_y_from_top: number;
  template_pdf_url?: string | null;
}

export interface GeneratePdfParams {
  patientName: string;
  prenom?: string;
  prescripteur?: string;
  datePrescription?: string;           // DD/MM/YYYY ou __/MM/YYYY
  datePrescriptionOrdonnance?: string; // DD/MM/YYYY
  aJeun?: boolean;
  poids?: number | null;
  examens: string[];
  croixSeulement?: boolean;            // true = page blanche (sans fond), false = utilise le template
  templateUrl?: string;                // URL du template PDF (défaut: /bilan-template.pdf)
  calibration?: Partial<PdfCalibration>;
  examCoords?: Record<string, [number, number]>;
}

// ─── Defaults ──────────────────────────────────────────────────────────────────

export const PDF_CALIBRATION_DEFAULTS: PdfCalibration = {
  // Feuille UBILAB MS-PRE-ENR-031-15 — vierge
  // Nom du PATIENT (après le libellé)
  nom_x: 120, nom_y_from_top: 28,
  // Prénom
  prenom_x: 80, prenom_y_from_top: 42,
  // PRESCRIPTEUR (après le libellé)
  prescripteur_x: 305, prescripteur_y_from_top: 42,
  // "Date de la prescription : ___/___/____"
  jour_x: 367, jour_y_from_top: 65,
  mois_x: 385, mois_y_from_top: 65,
  annee_x: 402, annee_y_from_top: 65,
  // Offset global appliqué aux coordonnées de cases à cocher
  check_x_offset: 37, check_y_offset: 57,
  nfs_y_extra: -11,
  // "Nb d'échantillons prélevés : ..." (haut droite)
  nb_echantillons_x: 488, nb_echantillons_y_from_top: 62,
  // Date ordonnance = même ligne que date de prescription
  presc_jour_x: 367, presc_jour_y_from_top: 65,
  presc_mois_x: 385, presc_mois_y_from_top: 65,
  presc_annee_x: 402, presc_annee_y_from_top: 65,
  // Patient à jeun : la case □ devant "Oui"
  ajeun_x: 122, ajeun_y_from_top: 105,
  // Poids du patient (champ "Créatinine (Poids : ......... Kg)")
  poids_x: 178, poids_y_from_top: 228,
};

// ─── Examens hors formulaire → texte libre ─────────────────────────────────────

const TEXT_EXAMS: Record<string, string> = {
  'Phénobarbitalémie': 'Phénobarbitalémie (tube rouge) A jeun',
};

// ─── Tube par examen ───────────────────────────────────────────────────────────

export const EXAM_TUBE: Record<string, string> = {
  'β-HCG': 'vert', 'BHCG': 'vert', 'NT-pro-BNP': 'vert', 'Troponine': 'vert',
  'Phosphatases alcalines': 'vert', 'PAL': 'vert', 'Iono complet': 'vert', 'Ionogramme': 'vert',
  'CPK': 'vert', 'Urée': 'vert', 'LDH': 'vert', 'Créatinine': 'vert', 'Calcium': 'vert',
  'Iono simple': 'vert', 'Calcium corrigé': 'vert', 'Potassium': 'vert', 'Phosphore': 'vert',
  'Réserve alcaline': 'vert', 'EAL': 'vert', 'Cholestérol': 'vert', 'Protéines totales': 'vert',
  'Triglycérides': 'vert', 'Acide urique': 'vert', 'Ferritine': 'vert',
  'Lipase': 'vert', 'Amylase': 'vert', 'Bilirubine': 'vert', 'Coef. transferrine': 'vert',
  'SGOT': 'vert', 'Transferrine': 'vert', 'SGPT': 'vert', 'Gamma GT': 'vert', 'Magnésium': 'vert',
  'T4L': 'vert', 'T3L': 'vert', 'TSH': 'vert', 'T.S.H': 'vert',
  'Albumine': 'vert', 'Albuminémie': 'vert', 'CRP': 'vert', 'IgG': 'vert', 'Alcoolémie': 'vert',
  'Haptoglobine': 'vert', 'Procalcitonine': 'vert', 'Préalbumine': 'vert',
  'NFS': 'violet', 'Numération formule': 'violet', 'Plaquettes': 'violet',
  'Réticulocytes': 'violet', 'Vitesse de sédimentation': 'violet', 'VS': 'violet',
  'Groupe sanguin': 'violet', 'Coombs direct': 'violet', 'RAI': 'violet',
  'Hémoglobine glyquée': 'violet',
  'Glycémie': 'gris', 'Glycémie à jeun': 'gris', 'Cycle glycémique': 'gris',
  'TP/INR': 'bleu', 'INR': 'bleu', 'TCK': 'bleu', 'Fibrinogène': 'bleu',
  'D-dimères': 'bleu', 'Anti Xa': 'bleu', 'PDF': 'bleu', 'TCA': 'bleu',
  'Electrophorèse protéines': 'jaune', 'Immunoélectrophorèse': 'jaune',
  'Calcium ionisé': 'jaune', 'Vitamine B12': 'jaune', 'Folates': 'jaune',
  'Vitamine B9': 'jaune', 'CDT': 'jaune', 'Béta2microglobuline': 'jaune', 'Vitamine D': 'jaune',
  'Hépatite A IgG': 'rouge', 'BW': 'rouge', 'Syphilis': 'rouge',
  'Hépatite A IgM': 'rouge', 'Borréliose': 'rouge', 'Hépatite B Ag HBs': 'rouge',
  'EBV': 'rouge', 'Hépatite B Ac anti HBs': 'rouge', 'HIV': 'rouge',
  'Hépatite B Ac anti HBc': 'rouge', 'Toxoplasmose': 'rouge', 'Hépatite C': 'rouge',
  'CMV': 'rouge', 'Hépatite E': 'rouge', 'Rubéole': 'rouge',
  'Facteurs rhumatoïdes': 'rouge', 'Ac anti-CCP': 'rouge',
  'Prolactine': 'rouge', 'Cortisol': 'rouge', 'Oestradiol': 'rouge',
  'Parathormone': 'rouge', 'PTH': 'rouge', 'Progestérone': 'rouge',
  'FSH': 'rouge', 'LH': 'rouge', 'Testostérone': 'rouge', 'AMH': 'rouge',
  'ACE': 'rouge', 'CA 15-3': 'rouge', 'AFP': 'rouge', 'CA 125': 'rouge',
  'CA 19-9': 'rouge', 'PSA': 'rouge', 'PSA libre': 'rouge',
  'Lithium': 'rouge', 'Digoxine': 'rouge', 'Paracétamol': 'rouge',
  'Vancomycine': 'rouge', 'Gentamicine': 'rouge', 'Amikacine': 'rouge',
  'Phénobarbitalémie': 'rouge',
};

// ─── Coordonnées cases à cocher (coordonnées PDF en points) ───────────────────

export const DEFAULT_CHECK_COORDS: Record<string, [number, number]> = {
  // === VERT - BIOCHIMIE-ENZYMOLOGIE ===
  'β-HCG': [18, 649], 'BHCG': [18, 649],
  'NT-pro-BNP': [18, 636], 'Troponine': [120, 636],
  'Phosphatases alcalines': [120, 623], 'PAL': [120, 623],
  'Iono complet': [18, 623], 'Ionogramme': [18, 623], 'CPK': [200, 623],
  'Urée': [18, 610], 'LDH': [120, 610],
  'Créatinine': [18, 597], 'Calcium': [120, 597],
  'Iono simple': [18, 584], 'Calcium corrigé': [120, 584],
  'Potassium': [18, 571], 'Phosphore': [120, 571],
  'Réserve alcaline': [18, 558], 'EAL': [120, 558],
  'Cholestérol': [120, 545], 'Protéines totales': [18, 545],
  'Glycémie': [18, 532], 'Triglycérides': [120, 532],
  'Acide urique': [18, 519], 'Ferritine': [120, 519],
  'Lipase': [18, 506], 'Amylase': [70, 506],
  'Bilirubine': [18, 493], 'Coef. transferrine': [120, 493],
  'SGOT': [18, 480], 'Transferrine': [120, 480],
  'SGPT': [70, 480], 'Gamma GT': [200, 480],
  'Magnésium': [120, 467], 'T4L': [18, 467], 'T3L': [50, 467],
  'TSH': [82, 467], 'T.S.H': [82, 467],
  'Albumine': [18, 454], 'Albuminémie': [18, 454], 'CRP': [120, 454],
  'IgG': [18, 441], 'Alcoolémie': [120, 441],
  'Haptoglobine': [18, 428], 'Procalcitonine': [120, 428], 'Préalbumine': [200, 428],
  // === VIOLET - HEMATOLOGIE ===
  'NFS': [18, 369], 'Numération formule': [18, 369], 'Plaquettes': [18, 367],
  'Réticulocytes': [120, 380], 'Vitesse de sédimentation': [120, 367], 'VS': [120, 367],
  'Groupe sanguin': [18, 407], 'Coombs direct': [120, 407], 'RAI': [120, 394],
  // === VIOLET - Hémoglobine glyquée ===
  'Hémoglobine glyquée': [18, 347],
  // === GRIS ===
  'Glycémie à jeun': [18, 312], 'Cycle glycémique': [140, 299],
  // === BLEU - HEMOSTASE ===
  'TP/INR': [18, 246], 'INR': [18, 246], 'TCK': [18, 233],
  'Fibrinogène': [120, 246], 'D-dimères': [120, 233],
  'Anti Xa': [18, 220], 'PDF': [120, 220], 'TCA': [18, 207],
  // === JAUNE - BIOCHIMIE SPECIALISEE ===
  'Electrophorèse protéines': [310, 649], 'Immunoélectrophorèse': [310, 636],
  'Calcium ionisé': [310, 623], 'Vitamine B12': [390, 623],
  'Folates': [470, 623], 'Vitamine B9': [470, 623],
  'CDT': [310, 610], 'Béta2microglobuline': [390, 610], 'Vitamine D': [310, 597],
  // === SEROLOGIE ===
  'Hépatite A IgG': [310, 558], 'BW': [450, 558], 'Syphilis': [450, 558],
  'Hépatite A IgM': [310, 545], 'Borréliose': [450, 545],
  'Hépatite B Ag HBs': [310, 532], 'EBV': [450, 532],
  'Hépatite B Ac anti HBs': [310, 519], 'HIV': [450, 519],
  'Hépatite B Ac anti HBc': [310, 506], 'Toxoplasmose': [450, 506],
  'Hépatite C': [310, 493], 'CMV': [450, 493],
  'Hépatite E': [310, 480], 'Rubéole': [450, 480],
  'Facteurs rhumatoïdes': [310, 467], 'Ac anti-CCP': [450, 467],
  // === HORMONOLOGIE ===
  'Prolactine': [310, 432], 'Cortisol': [390, 432], 'Oestradiol': [450, 432],
  'Parathormone': [310, 419], 'PTH': [310, 419], 'Progestérone': [390, 419],
  'FSH': [310, 406], 'LH': [390, 406], 'Testostérone': [310, 393], 'AMH': [390, 393],
  // === MARQUEURS TUMORAUX ===
  'ACE': [310, 362], 'CA 15-3': [390, 362], 'AFP': [450, 362],
  'CA 125': [310, 349], 'CA 19-9': [390, 349], 'PSA': [450, 349], 'PSA libre': [490, 349],
  // === MEDICAMENTS ===
  'Lithium': [310, 312], 'Digoxine': [310, 299], 'Paracétamol': [390, 299],
  'Vancomycine': [450, 299], 'Gentamicine': [310, 286], 'Amikacine': [390, 286],
  'Phénobarbitalémie': [310, 273],
};

// ─── Aliases ───────────────────────────────────────────────────────────────────

export const EXAM_ALIASES: Record<string, string> = {
  'Ionogramme': 'Iono complet', 'Iono': 'Iono complet',
  'β-HCG': 'BHCG',
  'Phosphatases alcalines': 'PAL',
  'Albuminémie': 'Albumine',
  'HBG': 'Hémoglobine glyquée', 'HbA1c': 'Hémoglobine glyquée', 'HBA1C': 'Hémoglobine glyquée',
  'Calcémie': 'Calcium',
  'Vit B12': 'Vitamine B12', 'Vitamine B12': 'Vitamine B12',
  'Vit D': 'Vitamine D',
  'Vit B9': 'Folates', 'Folates (Vit B9)': 'Folates',
  'INR / TP': 'INR', 'INR/TP': 'INR',
  'Anti Xa': 'Anti Xa',
  'Bilirubine T': 'Bilirubine',
};

const AJEUN_KEYWORDS = ['glycémie', 'glycemie', 'eal'];

function normalize(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function resolveExam(
  name: string,
  coordsMap: Record<string, [number, number]> = DEFAULT_CHECK_COORDS,
): string | null {
  if (!name) return null;
  const n = name.trim();
  if (EXAM_ALIASES[n]) return EXAM_ALIASES[n];
  for (const key of Object.keys(coordsMap)) {
    if (key.toLowerCase() === n.toLowerCase()) return key;
  }
  for (const key of Object.keys(coordsMap)) {
    if (normalize(n).includes(normalize(key)) || normalize(key).includes(normalize(n))) return key;
  }
  return null;
}

export function isAJeunRequired(examens: string[]): boolean {
  return examens.some(e => {
    const n = normalize(e);
    return AJEUN_KEYWORDS.some(kw => n.includes(normalize(kw)));
  });
}

export function isCreatininePresent(examens: string[]): boolean {
  return examens.some(e => normalize(e).includes('creatinine') || normalize(e).includes('créatinine'));
}

// ─── Main generator ────────────────────────────────────────────────────────────

export async function generateBilanPDF(params: GeneratePdfParams): Promise<Uint8Array> {
  const {
    patientName, prenom, prescripteur,
    datePrescription, datePrescriptionOrdonnance,
    aJeun, poids, examens,
    croixSeulement = false,
    templateUrl,
    calibration: calibOverride,
    examCoords: examCoordsOverride,
  } = params;

  const calib: PdfCalibration = { ...PDF_CALIBRATION_DEFAULTS, ...calibOverride };
  const coordsMap: Record<string, [number, number]> = examCoordsOverride ?? DEFAULT_CHECK_COORDS;

  let pdfDoc: PDFDocument;
  let width: number;
  let height: number;

  // ── Charger le template ou créer une page blanche ─────────────────────────
  if (!croixSeulement) {
    const url = templateUrl ?? calib.template_pdf_url ?? '/bilan-template.pdf';
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const bytes = await resp.arrayBuffer();
      pdfDoc = await PDFDocument.load(bytes);
    } catch {
      // fallback page blanche si le template est inaccessible
      pdfDoc = await PDFDocument.create();
      width = 595.28; height = 841.89;
      pdfDoc.addPage([width, height]);
    }
  } else {
    pdfDoc = await PDFDocument.create();
    width = 595.28; height = 841.89;
    pdfDoc.addPage([width, height]);
  }

  const page = pdfDoc.getPages()[0];
  const size = page.getSize();
  width = size.width;
  height = size.height;

  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0, 0, 0);
  const textSize = 8;
  const checkSize = 9;

  // ── Textes fixes ──────────────────────────────────────────────────────────
  if (patientName) {
    page.drawText(patientName.toUpperCase(), {
      x: calib.nom_x, y: height - calib.nom_y_from_top,
      size: textSize, font: helveticaBold, color: black,
    });
  }
  if (prenom) {
    page.drawText(prenom, {
      x: calib.prenom_x, y: height - calib.prenom_y_from_top,
      size: textSize, font: helvetica, color: black,
    });
  }
  if (prescripteur) {
    page.drawText(prescripteur, {
      x: calib.prescripteur_x, y: height - calib.prescripteur_y_from_top,
      size: textSize, font: helvetica, color: black,
    });
  }

  // Date prélèvement
  if (datePrescription) {
    const parts = datePrescription.split('/');
    const day = (parts[0] || '').padStart(2, '0');
    const month = (parts[1] || '').padStart(2, '0');
    const year = parts[2] || '';
    page.drawText(day, { x: calib.jour_x, y: height - calib.jour_y_from_top, size: textSize, font: helvetica, color: black });
    page.drawText(month, { x: calib.mois_x, y: height - calib.mois_y_from_top, size: textSize, font: helvetica, color: black });
    page.drawText(year, { x: calib.annee_x, y: height - calib.annee_y_from_top, size: textSize, font: helvetica, color: black });
  }

  // Date ordonnance
  if (datePrescriptionOrdonnance) {
    let day2 = '', month2 = '', year2 = '';
    if (datePrescriptionOrdonnance.includes('-')) {
      const p = datePrescriptionOrdonnance.split('-');
      year2 = p[0]; month2 = (p[1] || '').padStart(2, '0'); day2 = (p[2] || '').padStart(2, '0');
    } else {
      const p = datePrescriptionOrdonnance.split('/');
      day2 = (p[0] || '').padStart(2, '0'); month2 = (p[1] || '').padStart(2, '0'); year2 = p[2] || '';
    }
    page.drawText(day2, { x: calib.presc_jour_x, y: height - calib.presc_jour_y_from_top, size: textSize, font: helvetica, color: black });
    page.drawText(month2, { x: calib.presc_mois_x, y: height - calib.presc_mois_y_from_top, size: textSize, font: helvetica, color: black });
    page.drawText(year2, { x: calib.presc_annee_x, y: height - calib.presc_annee_y_from_top, size: textSize, font: helvetica, color: black });
  }

  // Nombre de tubes
  const tubesUsed = new Set<string>();
  for (const exam of (examens || [])) {
    const resolved = resolveExam(exam, coordsMap);
    if (!resolved || !EXAM_TUBE[resolved]) continue;
    const tubeColor = EXAM_TUBE[resolved];
    if (tubeColor === 'violet') {
      if (['Groupe sanguin', 'Coombs direct', 'RAI'].includes(resolved)) tubesUsed.add('violet_gs');
      else if (['NFS', 'Numération formule', 'Réticulocytes', 'Plaquettes', 'Vitesse de sédimentation', 'VS'].includes(resolved)) tubesUsed.add('violet_nfs');
      else if (resolved === 'Hémoglobine glyquée') tubesUsed.add('violet_hba1c');
    } else {
      tubesUsed.add(tubeColor);
    }
  }
  const nbTubes = tubesUsed.size || 1;
  page.drawText(String(nbTubes), {
    x: calib.nb_echantillons_x, y: height - calib.nb_echantillons_y_from_top,
    size: textSize, font: helveticaBold, color: black,
  });

  // ── Cases à cocher ────────────────────────────────────────────────────────
  const checked = new Set<string>();
  for (const exam of (examens || [])) {
    const resolved = resolveExam(exam, coordsMap);
    if (!resolved) continue;
    if (checked.has(resolved)) continue;
    checked.add(resolved);

    const coords = coordsMap[resolved] ?? DEFAULT_CHECK_COORDS[resolved];
    if (!coords) continue;
    const [cx, cy] = coords;

    if (TEXT_EXAMS[resolved]) {
      page.drawText(TEXT_EXAMS[resolved], {
        x: cx + calib.check_x_offset, y: cy + calib.check_y_offset,
        size: 9, font: helvetica, color: black,
      });
      continue;
    }

    let extraY = 0;
    if (resolved === 'NFS' || resolved === 'Numération formule') extraY = calib.nfs_y_extra || 0;
    page.drawText('X', {
      x: cx + calib.check_x_offset, y: cy + calib.check_y_offset + extraY,
      size: checkSize, font: helveticaBold, color: black,
    });
  }

  // À jeun
  if (aJeun) {
    page.drawText('X', {
      x: calib.ajeun_x, y: height - calib.ajeun_y_from_top,
      size: checkSize, font: helveticaBold, color: black,
    });
  }

  // Poids
  if (poids !== undefined && poids !== null) {
    page.drawText(String(poids), {
      x: calib.poids_x, y: height - calib.poids_y_from_top,
      size: textSize, font: helvetica, color: black,
    });
  }

  return pdfDoc.save();
}

// ─── Open PDF in new tab ────────────────────────────────────────────────────────

export function openPdfBlob(bytes: Uint8Array) {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
