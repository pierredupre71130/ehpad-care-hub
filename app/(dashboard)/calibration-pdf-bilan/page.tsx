'use client';

import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, RotateCcw, Loader2, Crosshair, X, ChevronLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { HomeButton } from '@/components/ui/home-button';
import { toast } from 'sonner';
import { PDF_CALIBRATION_DEFAULTS, PdfCalibration, generateBilanPDF, openPdfBlob } from '@/lib/generate-bilan-pdf';

const SECTIONS = [
  { label: 'Nom du patient',                xKey: 'nom_x',             yKey: 'nom_y_from_top' },
  { label: 'Prénom du patient',             xKey: 'prenom_x',          yKey: 'prenom_y_from_top' },
  { label: 'Prescripteur',                  xKey: 'prescripteur_x',    yKey: 'prescripteur_y_from_top' },
  { label: 'Date prélèvement — Jour',       xKey: 'jour_x',            yKey: 'jour_y_from_top' },
  { label: 'Date prélèvement — Mois',       xKey: 'mois_x',            yKey: 'mois_y_from_top' },
  { label: 'Date prélèvement — Année',      xKey: 'annee_x',           yKey: 'annee_y_from_top' },
  { label: 'Date prescription — Jour',      xKey: 'presc_jour_x',      yKey: 'presc_jour_y_from_top' },
  { label: 'Date prescription — Mois',      xKey: 'presc_mois_x',      yKey: 'presc_mois_y_from_top' },
  { label: 'Date prescription — Année',     xKey: 'presc_annee_x',     yKey: 'presc_annee_y_from_top' },
  { label: 'Patient à jeun (croix)',         xKey: 'ajeun_x',           yKey: 'ajeun_y_from_top' },
  { label: 'Poids du patient',              xKey: 'poids_x',           yKey: 'poids_y_from_top' },
  { label: 'Cases à cocher (offset global)', xKey: 'check_x_offset',    yKey: 'check_y_offset' },
  { label: "Nombre d'échantillons",         xKey: 'nb_echantillons_x', yKey: 'nb_echantillons_y_from_top' },
] as const;

function NumericInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => onChange(value - 1)}
        className="w-7 h-7 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 font-bold text-sm flex items-center justify-center">−</button>
      <input type="number" value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-20 text-center border border-slate-200 rounded px-2 py-1 text-sm outline-none focus:border-slate-400" />
      <button onClick={() => onChange(value + 1)}
        className="w-7 h-7 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 font-bold text-sm flex items-center justify-center">+</button>
    </div>
  );
}

export default function CalibrationPDFBilanPage() {
  const qc = useQueryClient();
  const supabase = createClient();
  const [values, setValues] = useState<PdfCalibration>({ ...PDF_CALIBRATION_DEFAULTS });
  const [recordId, setRecordId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [clickTarget, setClickTarget] = useState<{ xKey: string; yKey: string; label: string } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const naturalSizeRef = useRef<{ width: number; height: number } | null>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  // Load calibration from Supabase
  useEffect(() => {
    supabase.from('pdf_calibration').select('*').limit(1).then(({ data }) => {
      if (data && data.length > 0) {
        setRecordId(data[0].id);
        setValues({ ...PDF_CALIBRATION_DEFAULTS, ...data[0] });
      }
    });
  }, []);

  const handleChange = (key: string, val: number) =>
    setValues(prev => ({ ...prev, [key]: val }));

  // Auto-save debounced
  useEffect(() => {
    if (!recordId) return;
    const t = setTimeout(async () => {
      await supabase.from('pdf_calibration').update(values).eq('id', recordId);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }, 1500);
    return () => clearTimeout(t);
  }, [values, recordId]);

  // Generate preview
  const generatePreview = async () => {
    setPreviewLoading(true);
    try {
      const bytes = await generateBilanPDF({
        patientName: 'DUPONT', prenom: 'Jean',
        prescripteur: 'Dr Martin',
        datePrescription: '06/04/2026',
        datePrescriptionOrdonnance: '01/04/2026',
        aJeun: true, poids: 72.5,
        examens: ['NFS', 'Glycémie', 'Créatinine', 'SGOT', 'NT-pro-BNP', 'TP/INR', 'PSA'],
        croixSeulement: false, // utilise le template /bilan-template.pdf
        calibration: values,
      });
      const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(url);
    } catch (err) {
      console.error(err);
    }
    setPreviewLoading(false);
  };

  // Auto-preview on value change
  useEffect(() => {
    const t = setTimeout(generatePreview, 600);
    return () => clearTimeout(t);
  }, [values]);

  // Render PDF to canvas
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
        const containerWidth = canvas.parentElement?.clientWidth || 400;
        const dpr = window.devicePixelRatio || 1;
        const displayScale = Math.min(containerWidth / vp0.width, 600 / vp0.height);
        const vp = page.getViewport({ scale: displayScale * dpr });
        canvas.width = vp.width;
        canvas.height = vp.height;
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

  // Click-to-position on canvas
  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!clickTarget || !canvasRef.current || !naturalSizeRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;
    if (cssX < 0 || cssX > rect.width || cssY < 0 || cssY > rect.height) return;
    const { width: W, height: H } = naturalSizeRef.current;
    const pdfX = Math.round(cssX / rect.width * W);
    const pdfY = Math.round(cssY / rect.height * H);
    handleChange(clickTarget.xKey, pdfX);
    handleChange(clickTarget.yKey, pdfY);
    setClickTarget(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (recordId) {
        const { error } = await supabase.from('pdf_calibration').update(values).eq('id', recordId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('pdf_calibration').insert(values).select().single();
        if (error) throw error;
        if (data) setRecordId(data.id);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast.success('Calibration enregistrée');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (confirm('Remettre tous les réglages aux valeurs par défaut ?'))
      setValues({ ...PDF_CALIBRATION_DEFAULTS });
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
          <h1 className="text-lg font-bold text-slate-800">Calibration PDF Bilan</h1>
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
        <p className="text-sm text-slate-500 mb-6">
          Cliquez <strong>Positionner</strong> sur un champ, puis cliquez directement sur l'aperçu PDF pour placer le texte.
          <span className="ml-2 text-slate-400">1 pt ≈ 0,35 mm · 3 pts ≈ 1 mm</span>
        </p>

        {/* Template PDF URL */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
          <h2 className="font-semibold text-slate-700 text-sm mb-2">URL du formulaire de bilan (optionnel)</h2>
          <p className="text-xs text-slate-400 mb-2">
            Si renseignée, la feuille de bilan sera utilisée comme fond. Sinon, impression croix seulement sur page blanche.
          </p>
          <input
            type="url"
            value={values.template_pdf_url || ''}
            onChange={e => setValues(v => ({ ...v, template_pdf_url: e.target.value || null }))}
            placeholder="https://... URL publique vers votre feuille de bilan PDF"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-slate-400"
          />
        </div>

        <div className="grid grid-cols-5 gap-6">
          {/* Left: controls */}
          <div className="col-span-3 space-y-3">
            {SECTIONS.map(({ label, xKey, yKey }) => (
              <div key={label} className="bg-white border border-slate-200 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                  <h2 className="font-semibold text-slate-700 text-sm">{label}</h2>
                  {clickTarget?.label === label ? (
                    <button onClick={() => setClickTarget(null)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-100 text-red-600 text-xs hover:bg-red-200 transition-colors">
                      <X className="h-3 w-3" /> Annuler
                    </button>
                  ) : (
                    <button onClick={() => setClickTarget({ xKey, yKey, label })}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 text-xs hover:bg-slate-50 transition-colors">
                      <Crosshair className="h-3 w-3" /> Positionner
                    </button>
                  )}
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm text-slate-600">Position X</p>
                    <NumericInput value={(values as unknown as Record<string, number>)[xKey]} onChange={val => handleChange(xKey, val)} />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm text-slate-600">Position Y (depuis le haut)</p>
                    <NumericInput value={(values as unknown as Record<string, number>)[yKey]} onChange={val => handleChange(yKey, val)} />
                  </div>
                </div>
              </div>
            ))}

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <h2 className="font-semibold text-slate-700 text-sm mb-3 border-b border-slate-100 pb-2">NFS — Décalage Y supplémentaire</h2>
              <div className="flex items-center justify-between gap-4">
                <p className="text-xs text-slate-400">Négatif = vers le haut</p>
                <NumericInput value={values.nfs_y_extra} onChange={val => handleChange('nfs_y_extra', val)} />
              </div>
            </div>
          </div>

          {/* Right: PDF preview */}
          <div className="col-span-2">
            <div className="bg-white border border-slate-200 rounded-xl p-4 sticky top-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">
                {clickTarget ? `→ Positionner : ${clickTarget.label}` : 'Aperçu PDF'}
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
                {!previewUrl && !previewLoading && (
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">
                    Génération de l'aperçu...
                  </div>
                )}
              </div>
              <button onClick={() => {
                generateBilanPDF({
                  patientName: 'DUPONT', prenom: 'Jean', prescripteur: 'Dr Martin',
                  datePrescription: '06/04/2026', datePrescriptionOrdonnance: '01/04/2026',
                  aJeun: true, poids: 72.5,
                  examens: ['NFS', 'Glycémie', 'Créatinine', 'SGOT', 'TP/INR', 'PSA'],
                  croixSeulement: false, calibration: values,
                }).then(openPdfBlob);
              }} className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50 transition-colors">
                Ouvrir l'aperçu en PDF
              </button>
            </div>
          </div>
        </div>
      </div>

      <HomeButton />
    </div>
  );
}
