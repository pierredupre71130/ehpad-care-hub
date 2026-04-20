'use client';

import { useState, useEffect, useRef } from 'react';
import { Save, RotateCcw, Loader2, Crosshair, X, Plus, Trash2, ChevronLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { HomeButton } from '@/components/ui/home-button';
import { toast } from 'sonner';
import { DEFAULT_CHECK_COORDS, PDF_CALIBRATION_DEFAULTS, generateBilanPDF, openPdfBlob } from '@/lib/generate-bilan-pdf';

interface ExamEntry {
  exam_name: string;
  x: number;
  y: number;
  dbId?: string;
}

function NumericInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-0.5">
      <button onClick={() => onChange(value - 1)}
        className="w-6 h-6 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs flex items-center justify-center font-bold">−</button>
      <input type="number" value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-14 text-center border border-slate-200 rounded px-1.5 py-0.5 text-xs outline-none focus:border-slate-400" />
      <button onClick={() => onChange(value + 1)}
        className="w-6 h-6 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs flex items-center justify-center font-bold">+</button>
    </div>
  );
}

export default function CalibrationExamensPage() {
  const supabase = createClient();
  const [exams, setExams] = useState<ExamEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [clickTarget, setClickTarget] = useState<{ name: string; idx: number } | null>(null);
  const [newExam, setNewExam] = useState('');
  // Offsets lus depuis pdf_calibration pour soustraire au clic
  const [checkXOff, setCheckXOff] = useState(PDF_CALIBRATION_DEFAULTS.check_x_offset);
  const [checkYOff, setCheckYOff] = useState(PDF_CALIBRATION_DEFAULTS.check_y_offset);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const naturalSizeRef = useRef<{ width: number; height: number } | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  // Load from DB, merge with defaults
  const loadExams = async () => {
    const { data } = await supabase.from('exam_calibration').select('*');
    const dbMap = new Map<string, { x: number; y: number; id: string }>();
    (data || []).forEach((r: { exam_name: string; x: number; y: number; id: string }) => {
      dbMap.set(r.exam_name, { x: r.x, y: r.y, id: r.id });
    });
    const items: ExamEntry[] = Object.entries(DEFAULT_CHECK_COORDS).map(([name, [x, y]]) => {
      const saved = dbMap.get(name);
      return { exam_name: name, x: saved?.x ?? x, y: saved?.y ?? y, dbId: saved?.id };
    });
    setExams(items);
  };

  useEffect(() => {
    loadExams();
    supabase.from('pdf_calibration').select('check_x_offset,check_y_offset').limit(1).then(({ data }) => {
      if (data?.[0]) {
        setCheckXOff(data[0].check_x_offset ?? PDF_CALIBRATION_DEFAULTS.check_x_offset);
        setCheckYOff(data[0].check_y_offset ?? PDF_CALIBRATION_DEFAULTS.check_y_offset);
      }
    });
  }, []);

  const handleChange = (idx: number, field: 'x' | 'y', val: number) => {
    setExams(prev => prev.map((e, i) => i === idx ? { ...e, [field]: val } : e));
  };

  const handleDelete = (idx: number) => setExams(prev => prev.filter((_, i) => i !== idx));

  const handleAddExam = () => {
    if (!newExam.trim()) return;
    const defaults = DEFAULT_CHECK_COORDS[newExam];
    setExams(prev => [...prev, { exam_name: newExam, x: defaults?.[0] ?? 0, y: defaults?.[1] ?? 0 }]);
    setNewExam('');
  };

  const handleReset = () => {
    if (confirm('Remettre tous les examens aux coordonnées par défaut ?')) {
      setExams(Object.entries(DEFAULT_CHECK_COORDS).map(([name, [x, y]]) => ({ exam_name: name, x, y })));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: existing, error: selErr } = await supabase.from('exam_calibration').select('*');
      if (selErr) throw selErr;
      const existingMap = new Map((existing || []).map((r: { exam_name: string; id: string }) => [r.exam_name, r.id]));

      for (const exam of exams) {
        if (existingMap.has(exam.exam_name)) {
          const { error } = await supabase.from('exam_calibration')
            .update({ x: exam.x, y: exam.y })
            .eq('id', existingMap.get(exam.exam_name));
          if (error) throw error;
        } else {
          const { error } = await supabase.from('exam_calibration')
            .insert({ exam_name: exam.exam_name, x: exam.x, y: exam.y });
          if (error) throw error;
        }
      }
      // Delete removed exams
      for (const [name, id] of existingMap) {
        if (!exams.some(e => e.exam_name === name)) {
          const { error } = await supabase.from('exam_calibration').delete().eq('id', id);
          if (error) throw error;
        }
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast.success('Coordonnées enregistrées');
      loadExams();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Preview generation — reçoit les examens en paramètre pour éviter les closures périmées
  const generatePreview = async (currentExams: ExamEntry[], highlight?: string[]) => {
    setPreviewLoading(true);
    try {
      const coordsMap: Record<string, [number, number]> = {};
      currentExams.forEach(e => { coordsMap[e.exam_name] = [e.x, e.y]; });
      const bytes = await generateBilanPDF({
        patientName: 'DUPONT', prenom: 'Jean', prescripteur: 'Dr Martin',
        datePrescription: '06/04/2026',
        examens: highlight ?? currentExams.map(e => e.exam_name),
        croixSeulement: false,
        examCoords: coordsMap,
      });
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setPreviewUrl(prev => { if (prev) URL.revokeObjectURL(prev); return url; });
    } catch (err) { console.error(err); }
    setPreviewLoading(false);
  };

  useEffect(() => {
    if (exams.length === 0) return;
    if (clickTarget) {
      // Aperçu immédiat avec uniquement l'examen sélectionné
      generatePreview(exams, [clickTarget.name]);
      return;
    }
    const t = setTimeout(() => generatePreview(exams), 600);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exams, clickTarget]);

  // Render canvas
  useEffect(() => {
    if (!previewUrl || !canvasRef.current) return;
    (async () => {
      try {
        if (renderTaskRef.current) { renderTaskRef.current.cancel(); renderTaskRef.current = null; }
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
        const resp = await fetch(previewUrl);
        const bytes = new Uint8Array(await resp.arrayBuffer());
        const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
        const page = await pdf.getPage(1);
        const vp0 = page.getViewport({ scale: 1 });
        naturalSizeRef.current = { width: vp0.width, height: vp0.height };
        const canvas = canvasRef.current!;
        const containerWidth = canvas.parentElement?.clientWidth || 300;
        const dpr = window.devicePixelRatio || 1;
        const displayScale = Math.min(containerWidth / vp0.width, 600 / vp0.height);
        const vp = page.getViewport({ scale: displayScale * dpr });
        canvas.width = vp.width; canvas.height = vp.height;
        canvas.style.width = (vp0.width * displayScale) + 'px';
        canvas.style.height = (vp0.height * displayScale) + 'px';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const task = page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport: vp } as any);
        renderTaskRef.current = task;
        await task.promise;
        renderTaskRef.current = null;
      } catch (err) {
        if ((err as { name?: string })?.name !== 'RenderingCancelledException') console.error(err);
      }
    })();
  }, [previewUrl]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!clickTarget || !canvasRef.current || !naturalSizeRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;
    if (cssX < 0 || cssX > rect.width || cssY < 0 || cssY > rect.height) return;
    const { width: W, height: H } = naturalSizeRef.current;
    // Soustrait les offsets : les coords stockées sont cx/cy, la croix est dessinée à cx+offX, cy+offY
    const pdfX = Math.round(cssX / rect.width * W) - checkXOff;
    // PDF Y=0 en bas, canvas Y=0 en haut
    const pdfY = Math.round((1 - cssY / rect.height) * H) - checkYOff;
    setExams(prev => prev.map((e, i) => i === clickTarget.idx ? { ...e, x: pdfX, y: pdfY } : e));
    setClickTarget(null);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <a href="/bilans-sanguins"
            className="flex items-center gap-1 text-slate-500 hover:text-slate-700 text-sm transition-colors">
            <ChevronLeft className="h-4 w-4" /> Bilans sanguins
          </a>
          <span className="text-slate-300">·</span>
          <h1 className="text-lg font-bold text-slate-800">Calibration des examens</h1>
        </div>
        <div className="flex gap-2">
          <button onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition-colors">
            <RotateCcw className="h-3.5 w-3.5" /> Défauts
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-white text-sm hover:bg-slate-700 disabled:opacity-50 transition-colors">
            <Save className="h-3.5 w-3.5" />
            {saving ? 'Sauvegarde...' : saved ? 'Sauvegardé ✓' : 'Sauvegarder'}
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        <p className="text-sm text-slate-500 mb-4">
          Cliquez <strong>Positionner</strong> sur un examen puis cliquez directement sur l'aperçu pour placer la case à cocher.
        </p>

        <div className="grid grid-cols-5 gap-6">
          {/* Left: exam list */}
          <div className="col-span-3 space-y-4">
            {/* Add exam */}
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex gap-2">
                <input
                  list="exam-defaults"
                  value={newExam}
                  onChange={e => setNewExam(e.target.value)}
                  placeholder="Ajouter un examen..."
                  className="flex-1 border border-slate-200 rounded px-3 py-2 text-sm outline-none focus:border-slate-400"
                  onKeyDown={e => { if (e.key === 'Enter') handleAddExam(); }}
                />
                <button onClick={handleAddExam}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-800 text-white text-sm hover:bg-slate-700 transition-colors">
                  <Plus className="h-4 w-4" /> Ajouter
                </button>
                <datalist id="exam-defaults">
                  {Object.keys(DEFAULT_CHECK_COORDS).map(name => <option key={name} value={name} />)}
                </datalist>
              </div>
            </div>

            {/* Table */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="grid grid-cols-6 gap-2 px-3 py-2.5 bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase">
                <div className="col-span-2">Examen</div>
                <div className="text-center">X</div>
                <div className="text-center">Y</div>
                <div className="text-center">Positionner</div>
                <div className="text-center">Suppr.</div>
              </div>
              <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
                {exams.map((exam, idx) => (
                  <div key={`${exam.exam_name}-${idx}`}
                    className={`grid grid-cols-6 gap-2 px-3 py-2 items-center transition-colors ${
                      clickTarget?.name === exam.exam_name ? 'bg-blue-50 border-l-4 border-blue-500' : 'hover:bg-slate-50'
                    }`}>
                    <div className="col-span-2 text-sm font-medium text-slate-700 truncate" title={exam.exam_name}>
                      {exam.exam_name}
                    </div>
                    <div className="flex justify-center">
                      <NumericInput value={exam.x} onChange={val => handleChange(idx, 'x', val)} />
                    </div>
                    <div className="flex justify-center">
                      <NumericInput value={exam.y} onChange={val => handleChange(idx, 'y', val)} />
                    </div>
                    <div className="flex justify-center">
                      {clickTarget?.name === exam.exam_name ? (
                        <button onClick={() => setClickTarget(null)}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-100 text-red-600 text-xs hover:bg-red-200 transition-colors">
                          <X className="h-3 w-3" /> Annuler
                        </button>
                      ) : (
                        <button onClick={() => setClickTarget({ name: exam.exam_name, idx })}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 text-slate-600 text-xs hover:bg-slate-50 transition-colors">
                          <Crosshair className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                    <div className="flex justify-center">
                      <button onClick={() => handleDelete(idx)}
                        className="p-1.5 rounded hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-3 py-2 border-t border-slate-100 text-xs text-slate-400">
                Total : {exams.length} examen(s)
              </div>
            </div>
          </div>

          {/* Right: PDF preview */}
          <div className="col-span-2">
            <div className="bg-white border border-slate-200 rounded-xl p-4 sticky top-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">
                {clickTarget ? `→ Positionner : ${clickTarget.name}` : 'Aperçu PDF'}
              </h3>
              <div
                onClick={handleCanvasClick}
                className="relative w-full bg-slate-100 rounded border border-slate-200 flex items-center justify-center overflow-hidden"
                style={{ minHeight: 400, cursor: clickTarget ? 'crosshair' : 'default' }}
              >
                <canvas ref={canvasRef} style={{ display: 'block', maxWidth: '100%' }} />
                {previewLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-100/80">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                  </div>
                )}
                {clickTarget && !previewLoading && (
                  <div className="absolute top-2 left-0 right-0 flex justify-center pointer-events-none">
                    <div className="bg-blue-600 text-white px-3 py-1 rounded text-xs font-medium shadow">
                      Cliquez pour positionner
                    </div>
                  </div>
                )}
              </div>
              <button onClick={() => generatePreview(exams)} disabled={previewLoading}
                className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 disabled:opacity-50 transition-colors">
                {previewLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Rafraîchir l\'aperçu'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <HomeButton />
    </div>
  );
}
