export function normalize(s: string): string {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

function normalizeDateFormat(dateStr: string): string | null {
  if (!dateStr) return null;
  const match = dateStr.match(/(\d{2})[\/-](\d{2})[\/-](\d{2,4})/);
  if (!match) return null;
  let [, day, month, year] = match;
  if (year.length === 2) {
    const yNum = parseInt(year, 10);
    year = (yNum > 50 ? '19' : '20') + year;
  }
  return `${year}-${month}-${day}`;
}

interface ParsedLine {
  texte: string;
  si_besoin: boolean;
  date_heure: string | null;
}

interface ParsedPatient {
  name: string;
  lignes: ParsedLine[];
}

export function parseNursingText(rawText: string): ParsedPatient[] {
  const cleaned = rawText.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1');
  const allLines = cleaned.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);

  const patientRe = /^Patient\s*:\s*(.+)$/i;
  const patientsMap: Record<string, ParsedPatient> = {};
  let currentKey: string | null = null;

  for (const line of allLines) {
    const m = line.match(patientRe);
    if (m) {
      const key = m[1].trim().toUpperCase();
      if (!patientsMap[key]) patientsMap[key] = { name: m[1].trim(), lignes: [] };
      currentKey = key;
    } else if (currentKey && line.length > 3) {
      const lNorm = normalize(line);
      const si_besoin = lNorm.includes('si besoin') || lNorm.includes('a la demande');
      const dateM = line.match(/(\d{2}\/\d{2}\/(\d{2}|\d{4}))/);
      patientsMap[currentKey].lignes.push({ texte: line, si_besoin, date_heure: dateM ? dateM[1] : null });
    }
  }

  return Object.values(patientsMap);
}

export interface ContentionGroup {
  patient_name: string;
  resident_id: string;
  contentions: Array<{
    type: string;
    date_prescription: string | null;
    si_besoin: boolean;
    matched_line: string;
    selected: boolean;
  }>;
}

export interface ResidentForMatching {
  id: string;
  last_name: string;
  first_name?: string;
  room?: string;
  floor?: string;
}

export type Keywords = Record<string, string[]>;

export function extractContentionGroups(
  patients: ParsedPatient[],
  residents: ResidentForMatching[],
  keywords: Keywords,
  floor?: string
): ContentionGroup[] {
  const seenNames = new Set<string>();
  const groups: ContentionGroup[] = [];

  for (const p of patients) {
    const key = normalize(p.name || '');
    if (seenNames.has(key)) continue;
    seenNames.add(key);

    let roomNumber: string | null = null;
    for (const ligne of p.lignes || []) {
      const roomMatch = ligne.texte.match(/[Cc]hambre\s*:?\s*[A-Za-z]*(\d+)/i);
      if (roomMatch) { roomNumber = roomMatch[1]; break; }
    }

    if (floor && roomNumber) {
      const num = parseInt(roomNumber, 10);
      const deducedFloor = !isNaN(num) ? (num >= 100 ? '1ER' : 'RDC') : null;
      if (deducedFloor && deducedFloor !== floor) continue;
    }

    const pParts = key.split(/\s+/).filter(w => w.length > 2);
    let residentId = '';
    if (pParts.length > 0) {
      const matched = residents.find(r => {
        const ln = normalize(r.last_name || '');
        const fn = normalize(r.first_name || '');
        const lnMatch = pParts.some(part => ln === part || (ln.length > 3 && levenshtein(ln, part) <= 1));
        const fnMatch = !fn || pParts.some(part => fn === part || (fn.length > 3 && levenshtein(fn, part) <= 1));
        return lnMatch && (fnMatch || pParts.length === 1);
      });
      if (matched) residentId = matched.id;
    }

    const contentionCategories = Object.fromEntries(
      Object.entries(keywords).filter(([cat]) => cat !== 'si besoin')
    );
    const siBesoinKeywords = keywords['si besoin'] || [];
    const contentionsByType: Record<string, ContentionGroup['contentions'][0]> = {};
    const lines = p.lignes || [];

    for (let i = 0; i < lines.length; i++) {
      const ligne = lines[i];
      const texteUpper = (ligne.texte || '').toUpperCase();

      for (const [cat, kwList] of Object.entries(contentionCategories)) {
        if (contentionsByType[cat]) continue;
        const matchedKw = kwList.find(kw => kw.trim() && texteUpper.includes(kw.toUpperCase()));
        if (matchedKw) {
          let date_prescription = ligne.date_heure ? normalizeDateFormat(ligne.date_heure) : null;
          let si_besoin = ligne.si_besoin || false;

          if (!si_besoin) {
            si_besoin = siBesoinKeywords.some(kw => normalize(ligne.texte || '').includes(normalize(kw)));
          }

          if (!date_prescription) {
            for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
              const up = (lines[j].texte || '').toUpperCase();
              const dm = up.match(/DEBUT\s+LE\s+(\d{2}\/\d{2}\/\d{2,4})/) || up.match(/(\d{2}\/\d{2}\/\d{2,4})/);
              if (dm) { date_prescription = normalizeDateFormat(dm[1]); break; }
            }
          }

          if (!si_besoin) {
            for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
              const n = normalize(lines[j].texte || '');
              if (n.includes('si besoin') || n.includes('a la demande')) { si_besoin = true; break; }
            }
          }

          contentionsByType[cat] = {
            type: cat,
            date_prescription,
            si_besoin,
            matched_line: ligne.texte,
            selected: true,
          };
        }
      }
    }

    const contentions = Object.values(contentionsByType);
    if (contentions.length > 0) {
      groups.push({ patient_name: p.name || '', resident_id: residentId, contentions });
    }
  }

  return groups;
}
