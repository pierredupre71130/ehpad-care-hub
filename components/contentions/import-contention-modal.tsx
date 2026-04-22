'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, Settings, AlertCircle, CheckCircle2, AlertTriangle } from 'lucide-react';
import { ImportKeywordConfig } from './import-keyword-config';
import { parseNursingText, extractContentionGroups, type Keywords, type ContentionGroup, type ResidentForMatching } from '@/lib/import-parser';
import { createClient } from '@/lib/supabase/client';

const DEFAULT_KEYWORDS: Keywords = {
  lit: ['SANGLE VENTRALE', 'CONTENTIONS LIT'],
  fauteuil: ['CONTENTIONS FAUTEUIL'],
  'barrière gauche': ['barrière gauche'],
  'barrière droite': ['barrière droite'],
  'barrière x2': ['BARRIERES AU LIT', 'BARRIÈRES AU LIT'],
  'si besoin': ['Note médecin : si besoin', 'Si besoin'],
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  residents: ResidentForMatching[];
  keywords: Keywords;
  onKeywordsSaved: (kw: Keywords) => void;
  onImport: () => void;
}

async function extractTextFromPDF(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    let lastY: number | null = null;
    for (const item of textContent.items as Array<{ str: string; transform?: number[] }>) {
      const y = item.transform ? item.transform[5] : null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 3) {
        fullText += '\n';
      } else if (fullText.length > 0 && item.str && !fullText.endsWith(' ') && !item.str.startsWith(' ')) {
        fullText += ' ';
      }
      fullText += item.str;
      if (item.str.trim() && y !== null) lastY = y;
    }
    fullText += '\n';
  }
  return fullText;
}

export function ImportContentionModal({ open, onOpenChange, residents, keywords, onKeywordsSaved, onImport }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<ContentionGroup[]>([]);
  const [error, setError] = useState('');
  const [debugText, setDebugText] = useState('');
  const [showConfig, setShowConfig] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;
    setFile(uploadedFile);
    setGroups([]);
    setError('');
    setDebugText('');
    setLoading(true);
    try {
      let rawText = '';
      if (uploadedFile.type === 'application/pdf') {
        rawText = await extractTextFromPDF(uploadedFile);
      } else {
        rawText = await uploadedFile.text();
      }
      setDebugText(rawText);
      const patients = parseNursingText(rawText);
      const newGroups = extractContentionGroups(patients, residents, keywords);
      if (newGroups.length === 0) {
        setError('Aucune contention détectée. Vérifiez les mots-clés ou le contenu du fichier.');
      } else {
        setGroups(newGroups);
      }
    } catch (err: unknown) {
      setError(`Erreur lors du traitement : ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    const toProcess = groups.filter(g => g.resident_id);
    if (toProcess.length === 0) { alert('Associez au moins un résident avant de valider'); return; }
    setLoading(true);
    const sb = createClient();
    try {
      const { data: allExisting } = await sb.from('contentions').select('*').eq('type_suivi', 'contention');
      for (const group of toProcess) {
        const resident = residents.find(r => r.id === group.resident_id);
        if (!resident) continue;
        const residentName = `${resident.first_name || ''} ${resident.last_name || ''}`.trim();
        for (const c of group.contentions.filter(c => c.selected)) {
          const existing = (allExisting || []).find(
            (e: { nom: string; traitement: string }) => e.nom === residentName && e.traitement === c.type
          );
          if (existing) {
            if (!!existing.dotation_nominative === !!c.si_besoin) continue;
            await sb.from('contentions').update({ dotation_nominative: c.si_besoin || false, date_debut: c.date_prescription || existing.date_debut || '', updated_at: new Date().toISOString() }).eq('id', existing.id);
          } else {
            await sb.from('contentions').insert({
              nom: residentName, chambre: resident.room || '', traitement: c.type, type_suivi: 'contention',
              date_debut: c.date_prescription || '', date_fin: '', pas_de_fin: true,
              dotation_nominative: c.si_besoin || false, poso_matin: false, poso_midi: false, poso_soir: false, prescripteur: '',
            });
          }
        }
      }
      onImport();
      onOpenChange(false);
      setFile(null);
      setGroups([]);
    } catch (err: unknown) {
      alert(`Erreur lors de l'import : ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="flex items-center gap-2">
                Importer des contentions depuis un fichier PDF
              </DialogTitle>
              <div className="flex gap-2">
                <Button onClick={() => onKeywordsSaved(DEFAULT_KEYWORDS)} size="sm" variant="ghost" className="text-xs text-slate-500">
                  Réinitialiser
                </Button>
                <Button onClick={() => setShowConfig(true)} size="sm" variant="outline" className="gap-1">
                  <Settings className="h-4 w-4" /> Config
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-sm font-semibold mb-2 block">Charger le fichier PDF</Label>
              <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-blue-500 transition cursor-pointer bg-slate-50">
                <Input type="file" accept=".pdf,.txt,.text" onChange={handleFileUpload} disabled={loading} className="hidden" id="pdf-file-input" />
                <label htmlFor="pdf-file-input" className="cursor-pointer block">
                  <Upload className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-sm text-slate-600">
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Traitement en cours...
                      </span>
                    ) : file ? (
                      <><strong>{file.name}</strong> ✓ — cliquez pour changer</>
                    ) : (
                      <>Glissez-déposez ou cliquez pour sélectionner</>
                    )}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">PDF ou TXT</p>
                </label>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded p-3">
                <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            {groups.length > 0 && (
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded p-3 flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-blue-800">
                    <strong>{groups.length} patient(s) avec contention(s) détecté(s).</strong> Vérifiez et associez chaque patient à un résident.
                  </p>
                </div>
                {groups.map((group, gi) => (
                  <div key={gi} className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                    <div className="mb-2">
                      <Label className="text-sm font-semibold block mb-1">Patient : {group.patient_name}</Label>
                      <select
                        value={group.resident_id}
                        onChange={(e) => { const updated = [...groups]; updated[gi].resident_id = e.target.value; setGroups(updated); }}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 bg-white"
                      >
                        <option value="">— Sélectionner un résident —</option>
                        {[...residents].sort((a, b) => (a.last_name || '').localeCompare(b.last_name || '', 'fr')).map(r => (
                          <option key={r.id} value={r.id}>{r.last_name} {r.first_name || ''} — Ch. {r.room}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      {group.contentions.map((c, ci) => (
                        <label key={ci} className="flex items-start gap-3 p-2 border rounded bg-white hover:bg-slate-50 cursor-pointer transition">
                          <input
                            type="checkbox"
                            checked={c.selected}
                            onChange={(e) => { const updated = [...groups]; updated[gi].contentions[ci].selected = e.target.checked; setGroups(updated); }}
                            className="w-4 h-4 mt-1"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300">{c.type}</span>
                              {c.si_besoin && <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-orange-100 text-orange-700 border border-orange-300">Si besoin</span>}
                              {c.date_prescription && <span className="text-xs text-slate-600">depuis {c.date_prescription}</span>}
                            </div>
                            {c.matched_line && <p className="text-xs text-slate-400 mt-1 italic">« {c.matched_line} »</p>}
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {debugText && (
              <details className="border border-slate-200 rounded p-2 bg-slate-50">
                <summary className="text-xs text-slate-500 cursor-pointer font-medium">Debug — texte extrait du PDF</summary>
                <pre className="text-xs bg-white border border-slate-100 rounded p-2 mt-2 whitespace-pre-wrap max-h-60 overflow-y-auto">{debugText}</pre>
              </details>
            )}
          </div>

          {groups.length > 0 && (
            <div className="flex gap-2 pt-4 border-t">
              <Button
                onClick={handleConfirmImport}
                disabled={!groups.some(g => g.resident_id && g.contentions.some(c => c.selected)) || loading}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
              >
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Import en cours...</> : <><CheckCircle2 className="h-4 w-4" /> Valider l'import</>}
              </Button>
              <Button onClick={() => onOpenChange(false)} variant="outline" disabled={loading}>Annuler</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ImportKeywordConfig
        open={showConfig}
        onOpenChange={setShowConfig}
        initialConfig={keywords}
        onSave={(newConfig) => { onKeywordsSaved(newConfig); }}
      />
    </>
  );
}
