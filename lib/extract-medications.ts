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
  'Contentions': [
    'contention', 'contentions', 'bas de contention', 'chaussettes de contention',
    'chaussette de contention', 'bandes', 'bande de contention', 'sangle', 'barriere', 'barrieres',
  ],
  'Compléments alimentaires': [
    'complement', 'fortimel', 'calcidose', 'optifibre', 'clinutren', 'renutryl',
    'nutridrink', 'ensure', 'fresubin', 'proteine', 'nutrition', 'dietetique',
    'protifar', 'resource',
  ],
};

// Catégories qui ne nécessitent pas la présence d'une posologie (mg, mL, comprimé…)
// pour être détectées dans un bloc — souvent absentes pour les contentions et
// compléments alimentaires.
const NO_DOSE_REQUIRED_CATEGORIES = new Set(['Contentions', 'Compléments alimentaires']);

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

  // Le PDF de planning a souvent un résident par page, mais certains résidents
  // s'étalent sur plusieurs pages : on garde le dernier "Patient :" rencontré
  // pour les pages de continuation et on accepte aussi les libellés multi-lignes
  // (ex. NOM (née XXX)\nPRENOM).
  let currentPatient = 'Résident inconnu';
  let currentRoom = '';

  for (const text of pageTexts) {
    if (!text.trim()) continue;

    // Cherche TOUS les "Patient : ..." dans la page (parfois plusieurs résidents par page)
    // et découpe la page en sections par résident.
    const patientRegex = /Patient\s*:\s*([^\n]+(?:\n[^\n]+)?)/g;
    const matches: { idx: number; name: string }[] = [];
    let m: RegExpExecArray | null;
    while ((m = patientRegex.exec(text)) !== null) {
      matches.push({ idx: m.index, name: formatPatientName(m[1].replace(/\n/g, ' ').trim()) });
    }

    // Sections = portions de texte entre deux "Patient :" successifs (si plusieurs)
    // ou la page entière (si zéro ou un seul).
    const sections: { patient: string; room: string; body: string }[] = [];
    if (matches.length === 0) {
      // Page de continuation, on utilise le dernier patient connu
      sections.push({ patient: currentPatient, room: currentRoom, body: text });
    } else {
      // Éventuel préfixe avant le premier match (rare — appartient au patient précédent)
      if (matches[0].idx > 0) {
        const prefix = text.slice(0, matches[0].idx);
        if (prefix.trim()) {
          sections.push({ patient: currentPatient, room: currentRoom, body: prefix });
        }
      }
      for (let i = 0; i < matches.length; i++) {
        const start = matches[i].idx;
        const end = i + 1 < matches.length ? matches[i + 1].idx : text.length;
        const body = text.slice(start, end);
        const roomMatch = body.match(/Chambre\s*[:\-]?\s*(\w+)/i);
        const room = roomMatch ? roomMatch[1].trim() : currentRoom;
        sections.push({ patient: matches[i].name, room, body });
      }
      // Mémorise pour les pages suivantes
      const last = matches[matches.length - 1];
      currentPatient = last.name;
      const lastBody = text.slice(last.idx);
      const lastRoom = lastBody.match(/Chambre\s*[:\-]?\s*(\w+)/i);
      if (lastRoom) currentRoom = lastRoom[1].trim();
    }

    for (const { patient, room, body } of sections) {
      const blocks = body.split(/Début le \d{2}\/\d{2}\/\d{2,4} à \d{2}:\d{2}/);

      for (let i = 1; i < blocks.length; i++) {
        const block = blocks[i];
        const head = block.slice(0, 300);
        const hasDose = /\d+\s*(mg|mL|UI|µg|mcg|ug|g\b)/i.test(head);
        const hasForm = /\b(comprim[ée]|g[ée]lule|sachet|ampoule|cpr|g[ée]l|pdr|buvable|sirop|patch|goutte|solution|suspension)\b/i.test(head);

        const headN = normalize(head);
        const isNoDoseCategory =
          MED_CATEGORIES['Contentions'].some(k => headN.includes(k)) ||
          MED_CATEGORIES['Compléments alimentaires'].some(k => headN.includes(k));

        if (!hasDose && !hasForm && !isNoDoseCategory) continue;

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
        let finalCategory: string | null = category;
        let finalLine = drugLine;
        if (!finalCategory) {
          for (const cat of NO_DOSE_REQUIRED_CATEGORIES) {
            const kws = MED_CATEGORIES[cat] || [];
            if (kws.some(k => headN.includes(k))) {
              finalCategory = cat;
              for (const line of block.split('\n')) {
                const lN = normalize(line);
                if (kws.some(k => lN.includes(k))) {
                  finalLine = line.trim();
                  break;
                }
              }
              break;
            }
          }
        }
        if (!finalCategory) continue;

        const key = `${patient}|${normalize(finalLine.slice(0, 40))}|${finalCategory}`;
        if (seen.has(key)) continue;
        seen.add(key);

        out.push({
          resident: patient,
          room,
          drug: finalLine.slice(0, 80).trim(),
          category: finalCategory,
        });
      }
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
