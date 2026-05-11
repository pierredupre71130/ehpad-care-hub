'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  X, Check, AlertTriangle, Info, Loader2, Lock, RotateCcw, Printer, CheckSquare, Square,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  generateBilanPDF, openPdfBlob, mergePdfBytes,
  isAJeunRequired, isCreatininePresent,
  PdfCalibration, DEFAULT_CHECK_COORDS,
} from '@/lib/generate-bilan-pdf';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Resident {
  id: string; room: string; title: string;
  first_name: string; last_name: string;
  floor: 'RDC' | '1ER'; medecin: string | null;
  date_naissance?: string | null;
}
interface BilanReferentiel {
  id: string; code: string; label: string;
  frequence: string | null; examens: string[];
}
interface PlanningBilanCell {
  id: string; resident_id: string; annee: number; mois: number;
  bilan_ref_code: string | null; extra_examens: string[];
  bilan_label: string | null; jour: number | null;
  jours: number[]; periodicite: number | null;
}
interface MedecinBilanConfig {
  id: string; medecin_name: string; jours: string[];
}
interface PoidsMesure {
  id: string; resident_id: string; date: string; poids_kg: number;
}

// ─── Date generation algorithm ────────────────────────────────────────────────

const JOUR_TO_WEEKDAY: Record<string, number> = {
  lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6,
};

function getDaysOfMonthForWeekdays(annee: number, mois: number, weekdays: number[]): number[] {
  const result: number[] = [];
  const daysInMonth = new Date(annee, mois, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const wd = new Date(annee, mois - 1, d).getDay();
    if (weekdays.includes(wd)) result.push(d);
  }
  return result;
}

function getHistoricalDay(residentId: string, mois: number, allCells: PlanningBilanCell[]): number | null {
  const previous = allCells.filter(c => c.resident_id === residentId && c.mois < mois);
  if (previous.length === 0) return null;
  const days = previous.flatMap(c =>
    c.jours && c.jours.length > 0 ? c.jours : (c.jour ? [c.jour] : [])
  );
  if (days.length === 0) return null;
  const freq: Record<number, number> = {};
  days.forEach(d => { freq[d] = (freq[d] || 0) + 1; });
  return parseInt(Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0], 10);
}

function assignDays(
  cell: PlanningBilanCell, resident: Resident | undefined,
  annee: number, mois: number,
  allCells: PlanningBilanCell[], medecinConfigs: MedecinBilanConfig[],
  loadCounter: Record<number, number>,
): { days: string[]; noConfig: boolean } {
  const periodicite = cell.periodicite || 1;
  const medecin = resident?.medecin || '';
  const config = medecinConfigs.find(c => c.medecin_name === medecin);
  const hasConfig = !!(config && config.jours && config.jours.length > 0);

  if (!hasConfig) return { days: Array(periodicite).fill(''), noConfig: true };

  const weekdays = config!.jours
    .map(j => JOUR_TO_WEEKDAY[j.toLowerCase()])
    .filter((v): v is number => v !== undefined);
  const allowedDays = getDaysOfMonthForWeekdays(annee, mois, weekdays);

  if (allowedDays.length === 0) return { days: Array(periodicite).fill(''), noConfig: true };

  const historicalDay = getHistoricalDay(cell.resident_id, mois, allCells);
  const result: string[] = [];

  for (let i = 0; i < periodicite; i++) {
    let candidates = allowedDays;
    if (periodicite > 1) {
      const daysInMonth = new Date(annee, mois, 0).getDate();
      const sliceSize = Math.floor(daysInMonth / periodicite);
      const sliceStart = sliceSize * i + 1;
      const sliceEnd = i === periodicite - 1 ? daysInMonth : sliceSize * (i + 1);
      candidates = allowedDays.filter(d => d >= sliceStart && d <= sliceEnd);
      if (candidates.length === 0) candidates = allowedDays;
    }
    const referenceDay = historicalDay && periodicite === 1 ? historicalDay : null;
    const sortedCandidates = [...candidates].sort((a, b) => {
      const loadA = loadCounter[a] || 0;
      const loadB = loadCounter[b] || 0;
      if (loadA !== loadB) return loadA - loadB;
      if (referenceDay) return Math.abs(a - referenceDay) - Math.abs(b - referenceDay);
      return 0;
    });
    const chosen = sortedCandidates[0] || candidates[0];
    result.push(String(chosen));
    loadCounter[chosen] = (loadCounter[chosen] || 0) + 1;
  }

  return { days: result, noConfig: false };
}

function cellHasDates(cell: PlanningBilanCell): boolean {
  if (cell.jours && cell.jours.length > 0 && cell.jours.some(j => j > 0)) return true;
  if (cell.jour && cell.jour > 0) return true;
  return false;
}

function getExamensForCell(cell: PlanningBilanCell, referentiels: BilanReferentiel[]): string[] {
  const examens: string[] = [];
  if (cell.bilan_ref_code) {
    const ref = referentiels.find(r => r.code === cell.bilan_ref_code);
    if (ref?.examens) examens.push(...ref.examens);
  }
  if (cell.extra_examens) examens.push(...cell.extra_examens);
  return examens;
}

const MOIS_LABELS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

// ─── Props ─────────────────────────────────────────────────────────────────────

export interface GenerateDatesModalProps {
  mois: number;
  annee: number;
  cellsForMonth: PlanningBilanCell[];
  allCells: PlanningBilanCell[];
  residents: Resident[];
  medecinConfigs: MedecinBilanConfig[];
  referentiels: BilanReferentiel[];
  mesures: PoidsMesure[];
  calibration?: PdfCalibration;
  examCoords?: Record<string, [number, number]>;
  onSave: (results: { cellId: string; jours: number[] }[]) => Promise<void>;
  onClear: (results: { cellId: string; jours: number[] }[]) => Promise<void>;
  onClose: () => void;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function GenerateDatesModal({
  mois, annee, cellsForMonth, allCells, residents, medecinConfigs, referentiels,
  mesures, calibration, examCoords, onSave, onClear, onClose,
}: GenerateDatesModalProps) {
  const [view, setView] = useState<'recap' | 'generate'>('recap');

  // Résidents actifs seulement
  const activeCells = cellsForMonth.filter(cell => {
    const r = residents.find(r => r.id === cell.resident_id);
    return r && (r.last_name || r.first_name);
  });

  // Calcul des assignations initiales
  const initialAssignments = useMemo(() => {
    const loadCounter: Record<number, number> = {};
    cellsForMonth.forEach(cell => {
      if (cellHasDates(cell)) {
        const days = cell.jours?.length > 0 ? cell.jours : (cell.jour ? [cell.jour] : []);
        days.forEach(d => { if (d > 0) loadCounter[d] = (loadCounter[d] || 0) + 1; });
      }
    });
    return activeCells.map(cell => {
      const resident = residents.find(r => r.id === cell.resident_id);
      const preFilled = cellHasDates(cell);
      if (preFilled) {
        const existingDays = cell.jours?.length > 0
          ? cell.jours.filter(j => j > 0)
          : (cell.jour ? [cell.jour] : []);
        return { cellId: cell.id, cell, resident, days: existingDays.map(String), noConfig: false, locked: true };
      }
      const { days, noConfig } = assignDays(cell, resident, annee, mois, allCells, medecinConfigs, loadCounter);
      return { cellId: cell.id, cell, resident, days, noConfig, locked: false };
    });
  }, [cellsForMonth, residents, allCells, medecinConfigs, annee, mois]);

  const [assignments, setAssignments] = useState(initialAssignments);
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [printingBatch, setPrintingBatch] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [croixSeulement, setCroixSeulement] = useState(true); // true = page blanche à imprimer sur la feuille vierge déjà dans le bac
  const [aJeunMap, setAJeunMap] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    cellsForMonth.forEach(cell => {
      const examens = getExamensForCell(cell, referentiels);
      if (isAJeunRequired(examens)) init[cell.id] = true;
    });
    return init;
  });

  const toggleAJeun = (cellId: string) =>
    setAJeunMap(prev => ({ ...prev, [cellId]: !prev[cellId] }));

  const updateDay = (cellId: string, dayIdx: number, value: string) => {
    setAssignments(prev => prev.map(a =>
      a.cellId === cellId && !a.locked
        ? { ...a, days: a.days.map((d, i) => i === dayIdx ? value : d) }
        : a
    ));
  };

  const loadPerDay = useMemo(() => {
    const counter: Record<number, number> = {};
    assignments.forEach(a => {
      a.days.forEach(d => {
        const n = parseInt(d, 10);
        if (!isNaN(n) && n > 0) counter[n] = (counter[n] || 0) + 1;
      });
    });
    return counter;
  }, [assignments]);

  const overloadedDays = Object.entries(loadPerDay).filter(([, v]) => v >= 3).map(([k]) => parseInt(k, 10));
  const noConfigCount = assignments.filter(a => !a.locked && a.noConfig).length;
  const lockedCount = assignments.filter(a => a.locked).length;
  const generatedCount = assignments.filter(a => !a.locked).length;
  const totalWithDates = assignments.filter(a => a.days.some(d => d && parseInt(d) > 0)).length;

  // ── Récapitulatif ──────────────────────────────────────────────────────────
  const recapCells = cellsForMonth.map(cell => {
    const resident = residents.find(r => r.id === cell.resident_id);
    const days = cell.jours?.length > 0
      ? cell.jours.filter(j => j > 0)
      : (cell.jour ? [cell.jour] : []);
    return { cell, resident, days };
  })
    .filter(r => r.resident && (r.resident.last_name || r.resident.first_name))
    .sort((a, b) => String(a.resident!.room).localeCompare(String(b.resident!.room), undefined, { numeric: true }));

  // ── PDF print ──────────────────────────────────────────────────────────────
  const getLatestWeight = (residentId: string): number | null => {
    const wRec = mesures
      .filter(m => m.resident_id === residentId)
      .sort((a, b) => b.date.localeCompare(a.date));
    return wRec[0]?.poids_kg ?? null;
  };

  const generateOneBytes = async (
    cell: PlanningBilanCell,
    resident: Resident,
    aJeunOverride?: boolean,
  ): Promise<Uint8Array> => {
    const examens = getExamensForCell(cell, referentiels);
    const days = cell.jours?.length > 0 ? cell.jours : (cell.jour ? [cell.jour] : []);
    const day = days[0] ? String(days[0]).padStart(2, '0') : '__';
    const monthStr = String(mois).padStart(2, '0');
    const datePrescription = `${day}/${monthStr}/${annee}`;
    const needsPoids = isCreatininePresent(examens);

    return generateBilanPDF({
      patientName: resident.last_name || '',
      prenom: resident.first_name || '',
      prescripteur: resident.medecin || '',
      datePrescription,
      datePrescriptionOrdonnance: datePrescription,
      examens,
      aJeun: aJeunOverride !== undefined ? aJeunOverride : (aJeunMap[cell.id] || false),
      poids: needsPoids ? getLatestWeight(resident.id) : undefined,
      croixSeulement,
      calibration,
      examCoords: examCoords ?? DEFAULT_CHECK_COORDS,
    });
  };

  const handlePrint = async (
    cell: PlanningBilanCell,
    resident: Resident,
    aJeunOverride?: boolean,
  ) => {
    setPrintingId(cell.id);
    try {
      const bytes = await generateOneBytes(cell, resident, aJeunOverride);
      openPdfBlob(bytes);
    } catch (err) {
      toast.error(`Erreur PDF : ${(err as Error).message}`);
    } finally {
      setPrintingId(null);
    }
  };

  const printBatch = async (cellsToPrint: typeof recapCells) => {
    setPrintingBatch(true);
    try {
      const parts: Uint8Array[] = [];
      for (const { cell, resident } of cellsToPrint) {
        if (!resident) continue;
        const bytes = await generateOneBytes(cell, resident, aJeunMap[cell.id] ?? false);
        parts.push(bytes);
      }
      if (parts.length === 0) return;
      const merged = await mergePdfBytes(parts);
      openPdfBlob(merged);
    } catch (err) {
      toast.error(`Erreur PDF : ${(err as Error).message}`);
    } finally {
      setPrintingBatch(false);
    }
  };

  const handlePrintAll = () => printBatch(recapCells);
  const handlePrintSelected = () => printBatch(recapCells.filter(({ cell }) => selectedIds.has(cell.id)));

  // ── Liste récapitulative du mois (PDF via fenêtre d'impression) ───────────
  const handlePrintList = () => {
    const w = window.open('', '_blank');
    if (!w) { toast.error('Autorisez les popups pour imprimer'); return; }
    const monthLabel = MOIS_LABELS[mois - 1];
    const rows = recapCells.map(({ cell, resident, days }) => {
      const examens = getExamensForCell(cell, referentiels);
      const jours = days.length > 0 ? days.join(', ') : '—';
      const aJeun = aJeunMap[cell.id] ? 'Oui' : '';
      const examensStr = examens.length > 0 ? examens.join(', ') : '';
      const safe = (s: string) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return `<tr>
        <td class="ch">${safe(resident?.room || '')}</td>
        <td class="nom"><b>${safe((resident?.last_name || '').toUpperCase())}</b> ${safe(resident?.first_name || '')}</td>
        <td class="md">${safe(resident?.medecin || '—')}</td>
        <td class="lab">${safe(cell.bilan_label || '')}</td>
        <td class="day">${jours}</td>
        <td class="ajn">${aJeun}</td>
        <td class="exam">${safe(examensStr)}</td>
      </tr>`;
    }).join('');
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/>
<title>Bilans sanguins — ${monthLabel} ${annee}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:10pt;color:#0f172a;padding:8mm}
  @page{size:A4 landscape;margin:8mm}
  h1{font-size:16pt;font-weight:700;color:#0f172a;margin-bottom:1mm}
  .sub{font-size:10pt;color:#64748b;margin-bottom:5mm}
  .stats{display:flex;gap:14px;font-size:10pt;color:#475569;margin-bottom:4mm}
  .stats b{color:#0f172a}
  table{width:100%;border-collapse:collapse;font-size:9.5pt}
  th{background:#1e293b;color:white;padding:4px 7px;text-align:left;font-size:9pt;text-transform:uppercase;letter-spacing:0.04em}
  td{border:1px solid #cbd5e1;padding:4px 7px;vertical-align:top}
  tr:nth-child(even) td{background:#f8fafc}
  td.ch{text-align:center;font-weight:600;width:28mm}
  td.nom{width:50mm}
  td.md{width:40mm;color:#475569}
  td.lab{width:50mm}
  td.day{width:22mm;text-align:center;font-weight:600}
  td.ajn{width:14mm;text-align:center;font-weight:700;color:#b45309}
  td.exam{font-size:8.5pt;color:#475569}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style>
</head><body>
<h1>Bilans sanguins — ${monthLabel} ${annee}</h1>
<div class="sub">Imprimé le ${new Date().toLocaleDateString('fr-FR')}</div>
<div class="stats">
  <span><b>Total :</b> ${recapCells.length} bilan(s)</span>
</div>
<table>
  <thead><tr>
    <th>Chambre</th>
    <th>Résident</th>
    <th>Médecin</th>
    <th>Bilan</th>
    <th>Jour(s)</th>
    <th>À jeun</th>
    <th>Examens</th>
  </tr></thead>
  <tbody>${rows || '<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:14px">Aucun bilan planifié</td></tr>'}</tbody>
</table>
</body></html>`;
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  const toggleSelected = (id: string) =>
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const allSelected = recapCells.length > 0 && recapCells.every(({ cell }) => selectedIds.has(cell.id));
  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(recapCells.map(({ cell }) => cell.id)));
  };

  // ── Save / Clear ───────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    const result = assignments
      .filter(a => !a.locked)
      .map(a => ({
        cellId: a.cellId,
        jours: a.days.map(d => parseInt(d, 10)).filter(n => !isNaN(n) && n > 0),
      }));
    await onSave(result);
    setSaving(false);
  };

  const handleClear = async () => {
    setClearing(true);
    const result = assignments
      .filter(a => !a.locked)
      .map(a => ({ cellId: a.cellId, jours: [] }));
    await onClear(result);
    setClearing(false);
  };

  const handleClearAll = async () => {
    if (!confirm('Effacer TOUTES les dates de ce mois (y compris les dates saisies manuellement) ?')) return;
    setClearing(true);
    const result = assignments.map(a => ({ cellId: a.cellId, jours: [] }));
    await onClear(result);
    setClearing(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div>
            <DialogTitle className="font-semibold text-slate-800 text-base">
              {MOIS_LABELS[mois - 1]} {annee}
            </DialogTitle>
            <p className="text-xs text-slate-500 mt-0.5">{recapCells.length} bilan(s) planifié(s)</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100 shrink-0">
          {(['recap', 'generate'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                view === v ? 'border-b-2 border-slate-800 text-slate-800' : 'text-slate-400 hover:text-slate-600'
              }`}>
              {v === 'recap' ? 'Récapitulatif' : 'Générer les dates'}
            </button>
          ))}
        </div>

        {view === 'recap' ? (
          <>
            <div className="overflow-y-auto flex-1 px-5 py-3 space-y-1.5">
              {recapCells.length === 0 ? (
                <p className="text-sm text-slate-400 italic text-center py-8">Aucun bilan planifié ce mois.</p>
              ) : recapCells.map(({ cell, resident, days }) => (
                <div key={cell.id} className={`flex items-center justify-between gap-3 border rounded-lg px-3 py-2 transition-colors ${
                  selectedIds.has(cell.id) ? 'border-indigo-300 bg-indigo-50/40' : 'border-slate-100'
                }`}>
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <button onClick={() => toggleSelected(cell.id)}
                      className="text-slate-400 hover:text-indigo-600 transition-colors shrink-0"
                      title={selectedIds.has(cell.id) ? 'Désélectionner' : 'Sélectionner pour impression'}>
                      {selectedIds.has(cell.id)
                        ? <CheckSquare className="h-4 w-4 text-indigo-600" />
                        : <Square className="h-4 w-4" />}
                    </button>
                    <span className="text-xs font-bold text-slate-500 w-12 shrink-0">Ch.{resident!.room}</span>
                    <span className="text-sm font-semibold text-slate-800 truncate min-w-0">
                      {resident!.last_name} {resident!.first_name || ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded font-medium max-w-[220px] truncate" title={cell.bilan_label ?? ''}>
                      {cell.bilan_label}
                    </span>
                    {days.length > 0 ? (
                      <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded font-medium">
                        {days.join(', ')}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 italic">pas de date</span>
                    )}
                    <button onClick={() => toggleAJeun(cell.id)} title="À jeun"
                      className={`px-1.5 py-0.5 rounded text-xs font-medium border transition-colors ${
                        aJeunMap[cell.id]
                          ? 'bg-amber-100 border-amber-300 text-amber-700'
                          : 'bg-white border-slate-200 text-slate-400 hover:text-slate-600'
                      }`}>
                      À jeun
                    </button>
                    <button onClick={() => handlePrint(cell, resident!)}
                      disabled={printingId === cell.id}
                      className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                      title="Imprimer la feuille de bilan">
                      {printingId === cell.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Printer className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-start gap-3 px-5 py-4 border-t border-slate-100 shrink-0 flex-wrap">
              <div className="flex flex-col gap-2">
                {recapCells.length > 0 && (
                  <button onClick={toggleAll}
                    className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors w-fit">
                    {allSelected
                      ? <CheckSquare className="h-3.5 w-3.5 text-indigo-600" />
                      : <Square className="h-3.5 w-3.5" />}
                    {allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
                  </button>
                )}
                <div className="flex flex-wrap gap-2">
                  <button onClick={handlePrintList}
                    disabled={recapCells.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 bg-emerald-50 text-sm hover:bg-emerald-100 disabled:opacity-50 transition-colors">
                    <Printer className="h-3.5 w-3.5" />
                    Imprimer la liste du mois
                  </button>
                  <button onClick={handlePrintAll}
                    disabled={printingId !== null || printingBatch || recapCells.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-sm hover:bg-slate-50 disabled:opacity-50 transition-colors">
                    <Printer className="h-3.5 w-3.5" />
                    Tout imprimer ({recapCells.length})
                  </button>
                  <button onClick={handlePrintSelected}
                    disabled={printingId !== null || printingBatch || selectedIds.size === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-40 transition-colors">
                    {printingBatch
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Printer className="h-3.5 w-3.5" />}
                    Imprimer la sélection ({selectedIds.size})
                  </button>
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-600">
                  <input type="checkbox" checked={croixSeulement}
                    onChange={e => setCroixSeulement(e.target.checked)}
                    className="accent-slate-700" />
                  Croix seulement (sans fond)
                </label>
              </div>
              <button onClick={onClose}
                className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                Fermer
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Warnings */}
            {noConfigCount > 0 && (
              <div className="mx-5 mt-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2 shrink-0">
                <Info className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-700">{noConfigCount} résident(s) sans config médecin — saisie manuelle requise.</p>
              </div>
            )}
            {lockedCount > 0 && (
              <div className="mx-5 mt-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg flex items-start gap-2 shrink-0">
                <Lock className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                <p className="text-xs text-slate-500">{lockedCount} bilan(s) avec dates déjà saisies — non modifiés.</p>
              </div>
            )}
            {overloadedDays.length > 0 && (
              <div className="mx-5 mt-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 shrink-0">
                <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-xs text-red-700">≥ 3 bilans le : {overloadedDays.map(d => `le ${d}`).join(', ')}. Pensez à redistribuer.</p>
              </div>
            )}

            {/* Liste */}
            <div className="overflow-y-auto flex-1 px-5 py-3 space-y-2">
              {assignments.length === 0 && (
                <p className="text-sm text-slate-400 italic text-center py-6">Aucun bilan planifié ce mois.</p>
              )}
              {assignments.map(a => {
                const periodicite = a.cell.periodicite || 1;
                return (
                  <div key={a.cellId} className={`border rounded-xl p-3 ${
                    a.locked ? 'border-slate-200 bg-slate-50 opacity-70'
                      : a.noConfig ? 'border-amber-200 bg-amber-50/40'
                      : 'border-slate-100 bg-white'
                  }`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {a.locked && <Lock className="h-3 w-3 text-slate-400 shrink-0" />}
                          <span className="font-semibold text-sm text-slate-800 truncate">
                            {a.resident ? `${a.resident.last_name} ${a.resident.first_name || ''}`.trim() : '—'}
                          </span>
                          {a.resident?.room && <span className="text-xs text-slate-400">ch. {a.resident.room}</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-xs text-slate-500">{a.cell.bilan_label}</span>
                          {periodicite > 1 && (
                            <span className="text-xs bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded font-medium">{periodicite}×/mois</span>
                          )}
                          {!a.locked && a.noConfig && (
                            <span className="text-xs text-amber-600 font-medium">⚠ Pas de config médecin</span>
                          )}
                          {a.locked && <span className="text-xs text-slate-400 italic">déjà renseigné</span>}
                        </div>
                        {a.resident?.medecin && (
                          <span className="text-xs text-slate-400">Dr {a.resident.medecin}</span>
                        )}
                      </div>
                      <div className="flex gap-2 items-center shrink-0">
                        {a.days.map((d, idx) => {
                          const dayNum = parseInt(d, 10);
                          const isOverloaded = !isNaN(dayNum) && dayNum > 0 && (loadPerDay[dayNum] || 0) >= 3;
                          return (
                            <div key={idx} className="flex flex-col items-center gap-0.5">
                              {periodicite > 1 && <span className="text-xs text-slate-400">{idx + 1}</span>}
                              <input type="number" min={1} max={31} value={d}
                                onChange={e => updateDay(a.cellId, idx, e.target.value)}
                                disabled={a.locked}
                                placeholder="Jour"
                                className={`w-16 text-sm text-center border rounded-lg px-2 py-1 outline-none focus:border-slate-400 ${
                                  a.locked
                                    ? 'border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed'
                                    : isOverloaded
                                    ? 'border-red-300 bg-red-50'
                                    : 'border-slate-200 bg-white'
                                }`}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="flex justify-between items-center px-5 py-4 border-t border-slate-100 gap-2 flex-wrap shrink-0">
              <p className="text-xs text-slate-400 max-w-[180px] truncate">
                {Object.entries(loadPerDay).sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
                  .map(([d, v]) => `${d}→${v}`).join('  ') || 'Aucune date'}
              </p>
              <div className="flex gap-2 flex-wrap">
                {generatedCount > 0 && (
                  <button onClick={handleClear} disabled={clearing}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-orange-200 text-orange-600 text-xs hover:bg-orange-50 disabled:opacity-50 transition-colors">
                    {clearing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                    Annuler dates générées
                  </button>
                )}
                {totalWithDates > 0 && (
                  <button onClick={handleClearAll} disabled={clearing}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 text-xs hover:bg-red-50 disabled:opacity-50 transition-colors">
                    {clearing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                    Effacer toutes les dates
                  </button>
                )}
                <button onClick={onClose}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                  Fermer
                </button>
                {generatedCount > 0 && (
                  <button onClick={handleSave} disabled={saving}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs hover:bg-slate-700 disabled:opacity-50 transition-colors">
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Enregistrer
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
