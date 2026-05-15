'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, RotateCcw, X, Upload, Printer, ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import QRCode from 'qrcode';

const SETTING_KEY = 'matelas_couss_label_calibration';

export interface LabelCalibration {
  page_margin_top: number;   // mm
  page_margin_left: number;  // mm
  label_width: number;       // mm
  label_height: number;      // mm
  col_gap: number;           // mm
  row_gap: number;           // mm
  columns: number;
  rows: number;
  qr_size: number;           // mm
  font_size: number;         // pt
  show_type: boolean;
  show_serial: boolean;
}

export const DEFAULT_CALIBRATION: LabelCalibration = {
  page_margin_top: 8,
  page_margin_left: 4.5,
  label_width: 48.5,
  label_height: 33.9,
  col_gap: 0,
  row_gap: 0,
  columns: 4,
  rows: 8,
  qr_size: 22,
  font_size: 8,
  show_type: true,
  show_serial: true,
};

function NumericInput({
  value, onChange, step = 0.5, min, max, suffix,
}: {
  value: number; onChange: (v: number) => void;
  step?: number; min?: number; max?: number; suffix?: string;
}) {
  const set = (v: number) => {
    if (min !== undefined && v < min) v = min;
    if (max !== undefined && v > max) v = max;
    onChange(Math.round(v * 10) / 10);
  };
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => set(value - step)}
        className="w-7 h-7 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 font-bold text-sm flex items-center justify-center">−</button>
      <input type="number" value={value} step={step}
        onChange={e => set(Number(e.target.value))}
        className="w-20 text-center border border-slate-200 rounded px-2 py-1 text-sm outline-none focus:border-slate-400" />
      <button onClick={() => set(value + step)}
        className="w-7 h-7 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 font-bold text-sm flex items-center justify-center">+</button>
      {suffix && <span className="text-xs text-slate-500 ml-1">{suffix}</span>}
    </div>
  );
}

export default function CalibrationEtiquettesQRPage() {
  const supabase = createClient();
  const qc = useQueryClient();
  const [values, setValues] = useState<LabelCalibration>(DEFAULT_CALIBRATION);
  const [recordId, setRecordId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [bgUrl, setBgUrl] = useState<string | null>('/etiquettes-test.pdf');
  const [bgFile, setBgFile] = useState<File | null>(null);
  const [useDefaultBg, setUseDefaultBg] = useState(true);
  const [demoQrUrl, setDemoQrUrl] = useState<string>('');
  const bgInputRef = useRef<HTMLInputElement>(null);

  // ── Load from Supabase
  const { data: setting } = useQuery({
    queryKey: ['settings', SETTING_KEY],
    queryFn: async () => {
      const { data } = await supabase.from('settings').select('value').eq('key', SETTING_KEY).maybeSingle();
      return data?.value as Partial<LabelCalibration> | null;
    },
  });

  useEffect(() => {
    if (setting && typeof setting === 'object') {
      setValues({ ...DEFAULT_CALIBRATION, ...setting });
    }
  }, [setting]);

  // Debug placeholder QR (synthétique pour l'aperçu)
  useEffect(() => {
    QRCode.toDataURL('MAT-DEMO', { width: 160, margin: 0 }).then(setDemoQrUrl);
  }, []);

  // ── Auto-save (debounced)
  useEffect(() => {
    const t = setTimeout(async () => {
      const payload = { key: SETTING_KEY, value: values, updated_at: new Date().toISOString() };
      await supabase.from('settings').upsert(payload, { onConflict: 'key' });
      qc.invalidateQueries({ queryKey: ['settings', SETTING_KEY] });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values]);

  const setVal = (k: keyof LabelCalibration, v: number | boolean) =>
    setValues(prev => ({ ...prev, [k]: v }));

  // ── Background upload
  const handleBg = (file: File | null) => {
    if (bgUrl && !useDefaultBg) URL.revokeObjectURL(bgUrl);
    if (!file) {
      setBgFile(null);
      setUseDefaultBg(true);
      setBgUrl('/etiquettes-test.pdf');
      return;
    }
    setBgFile(file);
    setUseDefaultBg(false);
    setBgUrl(URL.createObjectURL(file));
  };

  // ── Compute label positions
  const positions = useMemo(() => {
    const out: { x: number; y: number; idx: number }[] = [];
    for (let r = 0; r < values.rows; r++) {
      for (let c = 0; c < values.columns; c++) {
        out.push({
          x: values.page_margin_left + c * (values.label_width + values.col_gap),
          y: values.page_margin_top + r * (values.label_height + values.row_gap),
          idx: r * values.columns + c + 1,
        });
      }
    }
    return out;
  }, [values]);

  // ── Print test sheet (borders only)
  const printTest = () => {
    const w = window.open('', '_blank');
    if (!w) { toast.error('Autorisez les popups'); return; }
    const cells = positions.map(p => `<div style="position:absolute;left:${p.x}mm;top:${p.y}mm;width:${values.label_width}mm;height:${values.label_height}mm;border:0.3mm solid #000;box-sizing:border-box;display:flex;align-items:center;justify-content:center;font-family:Arial;font-size:8pt;color:#666">${p.idx}</div>`).join('');
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Test calibration étiquettes</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif}@page{size:A4 portrait;margin:0}.page{position:relative;width:210mm;height:297mm}@media print{body{-webkit-print-color-adjust:exact}}</style>
</head><body><div class="page">${cells}</div></body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  return (
    <div className="min-h-screen" style={{ background: '#dde4ee' }}>
      <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0ea5a4, #0d6e6d)' }}>
        <div className="relative z-10 max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center gap-1.5 text-white/60 text-xs mb-4">
            <Link href="/" className="hover:text-white/90">Accueil</Link>
            <span>›</span>
            <Link href="/matelas-coussins" className="hover:text-white/90">Matelas / Coussins</Link>
            <span>›</span>
            <span className="text-white/90">Calibration étiquettes QR</span>
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <Link href="/matelas-coussins"
              className="w-10 h-10 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center text-white">
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-white">Calibration des étiquettes QR</h1>
              <p className="text-white/70 text-sm">Caler les dimensions sur ta planche d&apos;autocollants A4</p>
            </div>
            <div className="flex items-center gap-2">
              {saved && <span className="text-xs text-emerald-300 bg-emerald-900/20 px-2 py-1 rounded">Sauvegardé</span>}
              <button onClick={() => setValues(DEFAULT_CALIBRATION)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/15 text-white text-sm hover:bg-white/25">
                <RotateCcw className="h-4 w-4" /> Réinitialiser
              </button>
              <button onClick={printTest}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white text-teal-700 text-sm font-semibold hover:bg-teal-50">
                <Printer className="h-4 w-4" /> Imprimer test bordures
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        {/* Réglages */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-4 h-fit">
          <div>
            <h2 className="text-sm font-bold text-slate-800 mb-2">Dimensions (mm)</h2>
            <div className="space-y-2 text-xs text-slate-700">
              <div className="flex items-center justify-between gap-2">
                <span>Marge haut</span>
                <NumericInput value={values.page_margin_top} onChange={v => setVal('page_margin_top', v)} step={0.5} min={0} suffix="mm" />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>Marge gauche</span>
                <NumericInput value={values.page_margin_left} onChange={v => setVal('page_margin_left', v)} step={0.5} min={0} suffix="mm" />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>Largeur étiquette</span>
                <NumericInput value={values.label_width} onChange={v => setVal('label_width', v)} step={0.5} min={5} suffix="mm" />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>Hauteur étiquette</span>
                <NumericInput value={values.label_height} onChange={v => setVal('label_height', v)} step={0.5} min={5} suffix="mm" />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>Espace colonnes</span>
                <NumericInput value={values.col_gap} onChange={v => setVal('col_gap', v)} step={0.5} min={0} suffix="mm" />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>Espace lignes</span>
                <NumericInput value={values.row_gap} onChange={v => setVal('row_gap', v)} step={0.5} min={0} suffix="mm" />
              </div>
            </div>
          </div>

          <div className="border-t pt-3">
            <h2 className="text-sm font-bold text-slate-800 mb-2">Grille</h2>
            <div className="space-y-2 text-xs text-slate-700">
              <div className="flex items-center justify-between gap-2">
                <span>Colonnes</span>
                <NumericInput value={values.columns} onChange={v => setVal('columns', Math.round(v))} step={1} min={1} max={10} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>Lignes</span>
                <NumericInput value={values.rows} onChange={v => setVal('rows', Math.round(v))} step={1} min={1} max={20} />
              </div>
              <p className="text-[11px] text-slate-500 italic">
                Total : {values.columns * values.rows} étiquettes / page
              </p>
            </div>
          </div>

          <div className="border-t pt-3">
            <h2 className="text-sm font-bold text-slate-800 mb-2">Contenu de l&apos;étiquette</h2>
            <div className="space-y-2 text-xs text-slate-700">
              <div className="flex items-center justify-between gap-2">
                <span>Taille QR</span>
                <NumericInput value={values.qr_size} onChange={v => setVal('qr_size', v)} step={0.5} min={5} suffix="mm" />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span>Taille texte</span>
                <NumericInput value={values.font_size} onChange={v => setVal('font_size', v)} step={0.5} min={5} suffix="pt" />
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={values.show_type} onChange={e => setVal('show_type', e.target.checked)} />
                Afficher le type/modèle
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={values.show_serial} onChange={e => setVal('show_serial', e.target.checked)} />
                Afficher le n° de série
              </label>
            </div>
          </div>

          <div className="border-t pt-3">
            <h2 className="text-sm font-bold text-slate-800 mb-2">Fond d&apos;aperçu (optionnel)</h2>
            <p className="text-[11px] text-slate-500 mb-2">
              Charge une photo ou PDF d&apos;une planche réelle pour superposer la grille rouge dessus.
            </p>
            <div className="flex gap-2">
              <button onClick={() => bgInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50">
                <Upload className="h-3.5 w-3.5" /> Charger
              </button>
              {bgFile && (
                <button onClick={() => handleBg(null)}
                  title="Revenir au fond de test par défaut"
                  className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-red-600 hover:bg-red-50">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <input ref={bgInputRef} type="file" accept="image/*,application/pdf" className="hidden"
                onChange={e => handleBg(e.target.files?.[0] || null)} />
            </div>
            <p className="text-[11px] text-slate-500 mt-1 truncate">
              {bgFile ? bgFile.name : 'Planche de test par défaut (PDF fourni)'}
            </p>
          </div>

          <p className="text-[10px] text-slate-400 italic flex items-center gap-1">
            <Save className="h-3 w-3" /> Sauvegarde automatique
          </p>
        </div>

        {/* Aperçu */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 overflow-auto">
          <p className="text-xs text-slate-500 mb-3">
            Aperçu A4 à l&apos;échelle. Les rectangles rouges montrent où les étiquettes seront imprimées.
            Imprime une page de test, superpose-la avec une vraie planche pour vérifier.
          </p>
          <div className="border border-slate-300 mx-auto"
            style={{ width: '210mm', height: '297mm', background: 'white', position: 'relative', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
            {bgUrl && bgFile && /\.(png|jpe?g|gif|webp)$/i.test(bgFile.name) && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={bgUrl} alt="fond"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', opacity: 0.5 }} />
            )}
            {bgUrl && (useDefaultBg || /\.pdf$/i.test(bgFile?.name || '')) && (
              <object data={bgUrl} type="application/pdf"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.55, pointerEvents: 'none' }} />
            )}
            {positions.map(p => (
              <div key={p.idx} style={{
                position: 'absolute', left: `${p.x}mm`, top: `${p.y}mm`,
                width: `${values.label_width}mm`, height: `${values.label_height}mm`,
                border: '0.3mm solid #dc2626',
                boxSizing: 'border-box',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: '0.5mm',
              }}>
                {demoQrUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={demoQrUrl} alt="qr"
                    style={{ width: `${values.qr_size}mm`, height: `${values.qr_size}mm` }} />
                )}
                {values.show_type && (
                  <div style={{ fontSize: `${values.font_size}pt`, color: '#0f172a', fontFamily: 'Arial', lineHeight: 1 }}>
                    Matelas — Type X
                  </div>
                )}
                {values.show_serial && (
                  <div style={{ fontSize: `${values.font_size}pt`, color: '#0f172a', fontFamily: 'Arial', fontWeight: 700, lineHeight: 1 }}>
                    MAT-{String(p.idx).padStart(3, '0')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
