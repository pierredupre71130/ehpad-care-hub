// Liste de catégories thérapeutiques + mots-clés (DCI et noms commerciaux).
// Portée depuis l'application TAFPLAN (Python) — purement côté client.

export const MED_CATEGORIES: Record<string, string[]> = {
  'Antalgiques': [
    'paracetamol', 'doliprane', 'efferalgan', 'dafalgan', 'perfalgan',
    'tramadol', 'topalgic', 'contramal', 'zamudol', 'monoalgic',
    'morphine', 'sevredol', 'oramorph', 'skenan', 'moscontin',
    'oxycodone', 'oxycontin', 'oxynorm', 'oxymorphon',
    'codeine', 'codoliprane', 'dafalgan codeine', 'efferalgan codeine',
    'ibuprofen', 'nurofen', 'advil', 'brufen',
    'fentanyl', 'durogesic', 'abstral', 'actiq',
    'nalbuphine', 'nubain', 'acupan', 'nefopam',
    'ketamine', 'lamaline', 'neo-codion', 'antarene',
    'buprenorphine', 'temgesic',
  ],
  'Psychotropes': [
    'alprazolam', 'xanax', 'diazepam', 'valium', 'lorazepam', 'temesta',
    'oxazepam', 'seresta', 'bromazepam', 'lexomil', 'prazepam', 'lysanxia',
    'clorazepate', 'tranxene', 'zolpidem', 'stilnox', 'zopiclone', 'imovane',
    'clonazepam', 'rivotril', 'nitrazepam', 'mogadon',
    'sertraline', 'zoloft', 'fluoxetine', 'prozac', 'paroxetine', 'deroxat',
    'escitalopram', 'seroplex', 'citalopram', 'seropram', 'venlafaxine', 'effexor',
    'mirtazapine', 'norset', 'duloxetine', 'cymbalta', 'amitriptyline', 'laroxyl',
    'clomipramine', 'anafranil', 'maprotiline', 'ludiomil', 'agomelatine', 'valdoxan',
    'milnacipran', 'ixel', 'fluvoxamine', 'floxyfral', 'bupropion', 'wellbutrin',
    'risperidone', 'risperdal', 'olanzapine', 'zyprexa', 'quetiapine', 'xeroquel',
    'haloperidol', 'haldol', 'loxapine', 'loxapac', 'clozapine', 'leponex',
    'aripiprazole', 'abilify', 'tiapride', 'tiapridal', 'cyamemazine', 'tercian',
    'levomepromazine', 'nozinan', 'ziprasidone', 'zeldox', 'amisulpride', 'solian',
    'chlorpromazine', 'largactil', 'pipotiazine', 'piportil',
    'lithium', 'teralithe', 'valproate', 'depakote', 'depakine',
    'donepezil', 'aricept', 'rivastigmine', 'exelon', 'galantamine', 'reminyl',
    'memantine', 'ebixa', 'axura',
  ],
  'Traitements cardiaques': [
    'ramipril', 'triatec', 'perindopril', 'coversyl', 'enalapril', 'renitec',
    'lisinopril', 'zestril', 'captopril', 'lopril', 'fosinopril', 'fozitec',
    'valsartan', 'nisis', 'irbesartan', 'aprovel', 'losartan', 'cozaar',
    'olmesartan', 'alteis', 'telmisartan', 'micardis', 'candesartan', 'atacand',
    'bisoprolol', 'cardensiel', 'metoprolol', 'seloken', 'carvedilol', 'kredex',
    'nebivolol', 'temerit', 'atenolol', 'tenormin', 'propranolol', 'avlocardyl',
    'amlodipine', 'amlor', 'lercanidipine', 'zanidip', 'nifedipine', 'adalate',
    'felodipine', 'plendil', 'diltiazem', 'tildiem', 'verapamil', 'isoptine',
    'furosemide', 'lasilix', 'bumetanide', 'indapamide', 'fludex',
    'hydrochlorothiazide', 'esidrex', 'spironolactone', 'aldactone',
    'eplerenone', 'inspra', 'amiloride', 'modamide',
    'digoxine', 'digoxin', 'amiodarone', 'cordarone', 'flecainide', 'flecaine',
    'sotalol', 'sotalex',
    'isosorbide', 'risordan', 'trinitrine', 'monicor', 'nicorandil', 'ikorel',
    'atorvastatine', 'tahor', 'simvastatine', 'zocor', 'rosuvastatine', 'crestor',
    'pravastatine', 'elisor', 'fluvastatine', 'lescol', 'ezetimibe', 'ezetrol',
    'sacubitril', 'entresto', 'ivabradine', 'procoralan',
  ],
  'Anticoagulants': [
    'warfarine', 'coumadine', 'acenocoumarol', 'sintrom', 'fluindione', 'previscan',
    'rivaroxaban', 'xarelto', 'apixaban', 'eliquis', 'dabigatran', 'pradaxa',
    'edoxaban', 'lixiana',
    'heparine', 'heparin', 'enoxaparine', 'lovenox', 'tinzaparine', 'innohep',
    'dalteparine', 'fragmine', 'nadroparine', 'fraxiparine', 'fondaparinux', 'arixtra',
    'aspirine', 'kardegic', 'aspegic', 'clopidogrel', 'plavix', 'ticagrelor', 'brilique',
    'prasugrel', 'efient', 'dipyridamole', 'persantine', 'ticlopidine', 'ticlid',
  ],
  'Traitements respiratoires': [
    'ventoline', 'salbutamol', 'bricanyl', 'terbutaline', 'bambuterol',
    'seretide', 'symbicort', 'fostair', 'trimbow', 'duoresp',
    'spiriva', 'tiotropium', 'anoro', 'umeclidinium', 'incruse',
    'atrovent', 'ipratropium', 'onbrez', 'indacaterol', 'striverdi', 'formoterol',
    'trelegy', 'relvar', 'braltus',
    'pulmicort', 'budesonide', 'flixotide', 'fluticasone', 'becotide', 'beclometasone',
    'montelukast', 'singulair', 'zafirlukast', 'accolate',
    'carbocisteine', 'rhinathiol', 'acetylcysteine', 'mucomyst', 'fluimucil',
    'roflumilast', 'daxas',
  ],
  'Traitements diabète': [
    'insuline', 'insulin', 'novorapid', 'humalog', 'apidra', 'fiasp',
    'lantus', 'toujeo', 'tresiba', 'abasaglar', 'levemir', 'glargine', 'detemir',
    'novomix', 'humalog mix', 'mixtard',
    'metformine', 'glucophage', 'stagid', 'glucinan',
    'sitagliptine', 'januvia', 'vildagliptine', 'galvus', 'saxagliptine', 'onglyza',
    'linagliptine', 'trajenta', 'alogliptine', 'vipidia',
    'empagliflozine', 'jardiance', 'dapagliflozine', 'forxiga', 'canagliflozine', 'invokana',
    'liraglutide', 'victoza', 'semaglutide', 'ozempic', 'dulaglutide', 'trulicity',
    'glimepiride', 'amarel', 'glipizide', 'minidiab', 'gliclazide', 'diamicron',
    'acarbose', 'glucor', 'repaglinide', 'novonorm',
  ],
  'Antibiotiques': [
    'amoxicilline', 'clamoxyl', 'augmentin', 'amoxiclav',
    'azithromycine', 'zithromax', 'clarithromycine', 'zeclar', 'spiramycine', 'rovamycine',
    'ciprofloxacine', 'ciflox', 'levofloxacine', 'tavanic', 'ofloxacine', 'oflocet',
    'doxycycline', 'vibramycine', 'tetracycline',
    'metronidazole', 'flagyl', 'secnidazole', 'flagentyl',
    'trimethoprime', 'bactrim', 'cotrimoxazole',
    'nitrofurantoine', 'furadantine', 'macrobid',
    'cefuroxime', 'zinnat', 'cefixime', 'oroken', 'cefpodoxime', 'orelox',
    'fosfomycine', 'monuril',
    'linezolide', 'zyvoxid', 'vancomycine', 'clindamycine', 'dalacine',
    'pivmecillinam', 'selexid', 'amikacine', 'gentamicine',
  ],
};

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function classifyMedication(drugLine: string): string | null {
  const n = normalize(drugLine);
  for (const [category, keywords] of Object.entries(MED_CATEGORIES)) {
    if (keywords.some(kw => n.includes(kw))) return category;
  }
  return null;
}

function formatPatientName(raw: string): string {
  const trimmed = raw.trim();
  // PDF format: "NOM (née PRENOM_JEUNE) PRENOM"
  const mF = trimmed.match(/^(.+?)\s*\(née?[^)]*\)\s+(\S.+)$/i);
  const mM = trimmed.match(/^(.+?)\s*\(né\s[^)]*\)\s+(\S.+)$/i);

  const titleCase = (s: string) =>
    s.toLowerCase().replace(/(^|[-\s])(\p{L})/gu, (_m, sep, l) => sep + l.toUpperCase());

  if (mF && /née/i.test(trimmed)) {
    return `Mme ${titleCase(mF[2].trim())} ${titleCase(mF[1].trim())}`;
  }
  if (mM) {
    return `M. ${titleCase(mM[2].trim())} ${titleCase(mM[1].trim())}`;
  }
  const mTrunc = trimmed.match(/^(.+?)\s*\(n[ée]/i);
  if (mTrunc) {
    const civil = /née/i.test(trimmed) ? 'Mme' : 'M.';
    return `${civil} ${titleCase(mTrunc[1].trim())}`;
  }
  const words = trimmed.split(/\s+/);
  if (words.length >= 2) {
    const first = titleCase(words[words.length - 1]);
    const last = titleCase(words.slice(0, -1).join(' '));
    return `${first} ${last}`;
  }
  return titleCase(trimmed);
}

export interface MedResult {
  resident: string;
  room: string;
  drug: string;
  category: string;
}

// Extraction par page (le texte est déjà découpé page par page côté appelant)
export function extractMedicationsFromPages(pageTexts: string[]): MedResult[] {
  const out: MedResult[] = [];
  const seen = new Set<string>();

  for (const text of pageTexts) {
    if (!text.trim()) continue;

    const patientMatch = text.match(/Patient\s*:\s*(.+)/);
    const patient = patientMatch ? formatPatientName(patientMatch[1]) : 'Résident inconnu';

    const roomMatch = text.match(/Chambre\s*[:\-]?\s*(\w+)/i);
    const room = roomMatch ? roomMatch[1].trim() : '';

    const blocks = text.split(/Début le \d{2}\/\d{2}\/\d{2,4} à \d{2}:\d{2}/);

    for (let i = 1; i < blocks.length; i++) {
      const block = blocks[i];
      const head = block.slice(0, 300);
      const hasDose = /\d+\s*(mg|mL|UI|µg|mcg|ug|g\b)/i.test(head);
      const hasForm = /\b(comprim[ée]|g[ée]lule|sachet|ampoule|cpr|g[ée]l|pdr|buvable|sirop|patch|goutte|solution|suspension)\b/i.test(head);
      if (!hasDose && !hasForm) continue;

      let drugLine: string | null = null;
      for (const line of block.split('\n')) {
        const l = line.trim();
        if (!l || ['c', 'g', 'j', 'h', 'mg', 'mL'].includes(l)) continue;
        if (/^\d{2}:\d{2}/.test(l)) continue;
        if (/^\d+[.,]?\d*\s*(mg|mL|UI|g|µg)/i.test(l)) continue;
        if (l.length > 3) { drugLine = l; break; }
      }
      if (!drugLine) continue;

      const category = classifyMedication(drugLine);
      if (!category) continue;

      const key = `${patient}|${normalize(drugLine.slice(0, 40))}`;
      if (seen.has(key)) continue;
      seen.add(key);

      out.push({
        resident: patient,
        room,
        drug: drugLine.slice(0, 80).trim(),
        category,
      });
    }
  }

  return out.sort((a, b) =>
    a.resident.localeCompare(b.resident) || a.category.localeCompare(b.category),
  );
}

export async function extractMedicationsFromFile(file: File): Promise<MedResult[]> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const pageTexts: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let text = '';
    let lastY: number | null = null;
    for (const it of content.items as Array<{ str: string; transform?: number[] }>) {
      const y = it.transform ? it.transform[5] : null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 3) text += '\n';
      else if (text.length > 0 && it.str && !text.endsWith(' ') && !it.str.startsWith(' ')) text += ' ';
      text += it.str;
      if (it.str.trim() && y !== null) lastY = y;
    }
    pageTexts.push(text);
  }
  return extractMedicationsFromPages(pageTexts);
}
