// Logique de calcul des tailles de bas / chaussettes de contention.
// Reprend la grille et les règles du fichier HTML d'origine (TOLERANCE ±1 cm,
// priorité mollet pour les chaussettes, hauteur NORMAL/LONG selon D ou E).

export type Sexe = 'Femme' | 'Homme';
export type ProductType = 'Chaussette' | 'Bas';

export interface RawMesures {
  a?: string; b?: string; c?: string;
  d?: string; e?: string; f?: string;
}

export interface ParsedMesures {
  a: number | null; b: number | null; c: number | null;
  d: number | null; e: number | null; f: number | null;
}

export interface Result {
  text?: string;
  className?: string;
}

export interface SizeRow {
  size: number;
  cheville: [number, number];
  mollet: [number, number];
  cuisse: [number, number];
}

export type MatchType = 'perfect' | 'tolerance' | 'fail';

export interface Candidate {
  sizeData: SizeRow;
  matches: { cheville: MatchType; mollet: MatchType; cuisse: MatchType };
}

export type CalcResult =
  | { type: 'perfect'; result: Result }
  | { type: 'conflict'; candidates: Candidate[]; height: '' | 'NORMAL' | 'LONG' }
  | { type: 'error'; result: Result };

export const TOLERANCE = 1;

export const SIZE_CHARTS: Record<Sexe, SizeRow[]> = {
  Femme: [
    { size: 0, cheville: [16, 18], mollet: [26, 29], cuisse: [42, 52] },
    { size: 1, cheville: [18, 20], mollet: [29, 32], cuisse: [45, 56] },
    { size: 2, cheville: [20, 23], mollet: [32, 36], cuisse: [48, 59] },
    { size: 3, cheville: [23, 26], mollet: [36, 40], cuisse: [51, 62] },
    { size: 4, cheville: [26, 29], mollet: [40, 44], cuisse: [54, 65] },
    { size: 5, cheville: [29, 33], mollet: [43, 48], cuisse: [62, 74] },
  ],
  Homme: [
    { size: 1, cheville: [19, 21], mollet: [32, 36], cuisse: [50, 60] },
    { size: 2, cheville: [21, 24], mollet: [36, 40], cuisse: [53, 63] },
    { size: 3, cheville: [24, 27], mollet: [40, 44], cuisse: [56, 66] },
    { size: 4, cheville: [27, 30], mollet: [44, 48], cuisse: [59, 69] },
    { size: 5, cheville: [30, 33], mollet: [48, 52], cuisse: [65, 75] },
  ],
};

/** Parse "32" ou "31/33" → max(31, 33). Retourne null si vide / invalide. */
export function parseMeasurement(value: string | undefined | null): number | null {
  const str = String(value ?? '').replace(',', '.').trim();
  if (!str) return null;
  if (str.includes('/')) {
    const parts = str.split('/').map(p => parseFloat(p));
    const valid = parts.filter(n => !Number.isNaN(n));
    return valid.length ? Math.max(...valid) : null;
  }
  const n = parseFloat(str);
  return Number.isNaN(n) ? null : n;
}

export function parseAll(raw: RawMesures): ParsedMesures {
  return {
    a: parseMeasurement(raw.a),
    b: parseMeasurement(raw.b),
    c: parseMeasurement(raw.c),
    d: parseMeasurement(raw.d),
    e: parseMeasurement(raw.e),
    f: parseMeasurement(raw.f),
  };
}

export function getHeightLabel(m: ParsedMesures): '' | 'NORMAL' | 'LONG' {
  if (m.d != null) return m.d > 40 ? 'LONG' : 'NORMAL';
  if (m.e != null) return m.e > 72 ? 'LONG' : 'NORMAL';
  return '';
}

function getMatchType(value: number | null, range: [number, number] | undefined): MatchType {
  if (value == null || !range) return 'perfect';
  if (value >= range[0] && value <= range[1]) return 'perfect';
  if (
    (value > range[1] && value <= range[1] + TOLERANCE) ||
    (value < range[0] && value >= range[0] - TOLERANCE)
  ) return 'tolerance';
  return 'fail';
}

export function calculateSize(
  sexe: Sexe,
  productType: ProductType,
  raw: RawMesures,
  prioritizeMollet = true,
): CalcResult {
  const m = parseAll(raw);
  const chart = SIZE_CHARTS[sexe];
  const isChaussette = productType === 'Chaussette';
  const isBas = !isChaussette;
  const height = getHeightLabel(m);

  // Règle spéciale : pour les chaussettes, si on priorise le mollet et qu'une
  // seule taille convient pour le mollet, on la valide si la cheville est
  // compatible (perfect ou tolérance).
  if (prioritizeMollet && isChaussette && m.b != null) {
    const calfCandidates = chart.filter(s => getMatchType(m.b, s.mollet) !== 'fail');
    if (calfCandidates.length === 1) {
      const main = calfCandidates[0];
      if (getMatchType(m.a, main.cheville) !== 'fail') {
        return {
          type: 'perfect',
          result: {
            text: `Taille : ${main.size}${height ? ', ' + height : ''} (Priorité Mollet)`,
            className: 'highlight-result',
          },
        };
      }
    }
  }

  const candidates: Candidate[] = [];
  for (const size of chart) {
    const matches = {
      cheville: getMatchType(m.a, size.cheville),
      mollet:   getMatchType(m.b, size.mollet),
      cuisse:   getMatchType(m.c, size.cuisse),
    };
    const mainMeasure: 'mollet' | 'cuisse' = isBas ? 'cuisse' : 'mollet';
    const mainProvided = isBas ? m.c != null : m.b != null;
    if (matches.cheville !== 'fail' || (mainProvided && matches[mainMeasure] !== 'fail')) {
      candidates.push({ sizeData: size, matches });
    }
  }

  if (candidates.length === 0) {
    return { type: 'error', result: { text: 'Mesures hors grille', className: 'error-result' } };
  }

  const requiredFields: Array<'cheville' | 'mollet' | 'cuisse'> =
    isBas ? ['cheville', 'cuisse'] : ['cheville', 'mollet'];

  const perfects = candidates.filter(c =>
    requiredFields.every(f => c.matches[f] === 'perfect'),
  );

  if (perfects.length === 1 && candidates.length === 1) {
    const main = perfects[0];
    return {
      type: 'perfect',
      result: {
        text: `Taille : ${main.sizeData.size}${height ? ', ' + height : ''}`,
        className: 'highlight-result',
      },
    };
  }

  return { type: 'conflict', candidates, height };
}

export function buildResultFromManual(
  size: number,
  height: '' | 'NORMAL' | 'LONG',
): Result {
  const text = height
    ? `[M] Taille : ${size}, ${height}`
    : `[M] Taille : ${size}`;
  return { text, className: 'manual-result' };
}

export function buildResultFromCandidate(
  candidate: Candidate,
  height: '' | 'NORMAL' | 'LONG',
): Result {
  return {
    text: `Taille : ${candidate.sizeData.size}${height ? ', ' + height : ''}`,
    className: 'highlight-result',
  };
}
