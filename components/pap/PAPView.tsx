'use client';

import { X, Printer, Pencil } from 'lucide-react';
import Link from 'next/link';

interface Resident {
  id: string;
  title?: string;
  first_name: string;
  last_name: string;
  room: string;
  section?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PapData = Record<string, any>;

const RISQUES = [
  { key: 'risque_fugue', label: 'Risques de fugue ou de disparition' },
  { key: 'risque_addictions', label: 'Risques liés aux addictions' },
  { key: 'risque_chutes', label: 'Risques liés aux chutes' },
  { key: 'risque_denutrition', label: 'Risques liés à la dénutrition' },
  { key: 'risque_sexualite', label: 'Risques liés à la sexualité' },
  { key: 'risque_harcelement', label: 'Risques de harcèlement et/ou d\'abus' },
  { key: 'risque_radicalisation', label: 'Risque de radicalisation' },
  { key: 'risque_suicidaire', label: 'Risque suicidaire' },
];

const CAPACITE_LABELS: Record<string, string> = {
  informee: 'La personne a la capacité d\'être informée sur son PAP',
  capable_signer: 'La personne a la capacité de signer son PAP',
  refuse_signer: 'La personne refuse de signer son PAP',
  information_pas_capable: 'La personne a eu l\'information mais n\'a pas la capacité de signer',
  pas_capable: 'La personne n\'a pas la capacité de recevoir l\'information et de signer',
};

function Field({ label, value }: { label: string; value: string | boolean | null | undefined }) {
  if (!value && value !== false) return null;
  return (
    <div className="mb-2">
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-0.5">{label}</div>
      <div className="text-sm text-slate-800 bg-slate-50 border border-slate-100 rounded px-2 py-1.5 whitespace-pre-wrap">{String(value)}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="text-xs font-bold text-white bg-slate-700 uppercase px-3 py-1.5 rounded mb-2 tracking-wider">{title}</h3>
      <div className="px-1">{children}</div>
    </div>
  );
}

export default function PAPView({
  pap, resident, onClose, readOnly, archiveDate, editHref
}: {
  pap: PapData;
  resident: Resident;
  onClose: () => void;
  readOnly?: boolean;
  archiveDate?: string;
  editHref?: string;
}) {
  const fmtDate = (d: string | null | undefined) =>
    d ? new Date(d + 'T12:00:00').toLocaleDateString('fr-FR') : '—';

  const f = (label: string, value: string | null | undefined) => {
    if (!value) return '';
    return `<div class="field"><div class="field-label">${label}</div><div class="field-value">${String(value).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div></div>`;
  };
  const sec = (title: string, content: string) =>
    `<div class="section"><div class="section-title">${title}</div>${content}</div>`;

  const handlePrint = () => {
    const risquesActifs = RISQUES.filter(r => pap[r.key]).map(r => `<span class="risk-badge">${r.label}</span>`).join('');
    const risquesHtml = risquesActifs || `<span style="font-size:10px;color:#94a3b8">Aucun risque identifié</span>`;
    const body = `
      <h1>PAP — ${resident.title || ''} ${resident.last_name} ${resident.first_name}</h1>
      <div class="subtitle">Chambre ${resident.room} • ${resident.section}</div>
      ${sec('Informations générales', `<div class="grid2">${f('Date de naissance', fmtDate(pap.date_naissance))}${f('Service - Chambre', pap.service_chambre)}${f('Date de la réunion', fmtDate(pap.date_reunion))}${f('Date de réévaluation', fmtDate(pap.date_reevaluation))}</div>${f('Personnes présentes', pap.presents)}`)}
      ${sec('Souhait de la personne', `${f('Capacité de la personne', pap.capacite)}${f('Souhait de réaliser le projet', pap.souhait_projet)}${f('Souhait de participer', pap.souhait_participation)}${f('Souhait de faire participer l\'entourage', pap.souhait_entourage)}`)}
      ${sec('Renseignements généraux', `${f('Données d\'identité', pap.donnees_identite)}${f('Souhait de dénomination', pap.souhait_denomination)}${f('Contexte d\'entrée', pap.contexte_entree)}${f('Souhaits de fin de vie', pap.souhaits_fin_vie)}${f('Entourage', pap.entourage)}${f('Droit à l\'image', pap.droit_image)}`)}
      ${sec('Histoire de vie', `${f('Situation familiale', pap.situation_familiale)}${f('Vie professionnelle', pap.vie_professionnelle)}${f('Épisodes importants', pap.episodes_importants)}`)}
      ${sec('Habitudes de vie', `<div class="grid2">${f('Boire et manger', pap.besoin_boire_manger)}${f('Éliminer', pap.eliminer)}${f('Se mouvoir', pap.mouvoir_posture)}${f('Dormir', pap.dormir_reposer)}${f('Se vêtir', pap.vetir_devtir)}${f('Être propre', pap.propre_teguments)}${f('Éviter les dangers', pap.eviter_dangers)}${f('Communication', pap.communication)}${f('Croyances et valeurs', pap.croyances_valeurs)}${f('Occupation / récréation', pap.occupation_recreation)}${f('Besoin d\'apprendre', pap.apprendre)}${f('Ressenti / Adaptation', pap.ressenti_adaptation)}</div>`)}
      ${sec('Identification des risques', `<div class="risks">${risquesHtml}</div>${f('Autres risques', pap.risques_autres)}`)}
      ${sec('Remarques particulières', `${f('Accueil des premiers jours', pap.accueil_premiers_jours)}${f('Les soins', pap.soins)}${f('Les repas', pap.repas)}${f('Ambiance générale', pap.ambiance_generale)}${f('Autres remarques', pap.remarques_particulieres)}`)}
      ${sec('Objectifs et signature', `${f('Objectifs retenus', pap.objectifs)}${pap.capacite_information ? f('Capacité concernant l\'information', CAPACITE_LABELS[pap.capacite_information] || pap.capacite_information) : ''}${f('Date de signature', fmtDate(pap.date_signature))}<div class="signature-row"><div class="signature-box"><div class="signature-label">Signature du résident</div><div class="signature-area"></div></div><div class="signature-box"><div class="signature-label">Signature du référent</div><div class="signature-area"></div></div></div>`)}
    `;
    const win = window.open('', '_blank')!;
    win.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"/><title>PAP — ${resident.last_name}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:11px;color:#1e293b;background:white;padding:10mm}@page{size:A4 portrait;margin:10mm}h1{font-size:15px;font-weight:bold;color:#0f172a;margin-bottom:2px}.subtitle{font-size:10px;color:#64748b;margin-bottom:14px}.section{margin-bottom:12px;page-break-inside:avoid}.section-title{font-size:8px;font-weight:bold;color:white;background:#334155;text-transform:uppercase;letter-spacing:.08em;padding:3px 7px;border-radius:3px;margin-bottom:5px}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}.field{margin-bottom:5px;page-break-inside:avoid}.field-label{font-size:8px;font-weight:bold;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:1px}.field-value{font-size:10px;color:#1e293b;background:#f8fafc;border:1px solid #e2e8f0;border-radius:3px;padding:3px 7px;white-space:pre-wrap}.risks{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:5px}.risk-badge{font-size:8px;background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;border-radius:9999px;padding:2px 7px}.signature-row{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:14px}.signature-label{font-size:8px;font-weight:bold;color:#64748b;text-transform:uppercase;margin-bottom:3px}.signature-area{border:1px solid #cbd5e1;border-radius:4px;height:44px;background:#f8fafc}</style>
</head><body>${body}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl my-4">
        <div className="flex items-start justify-between px-6 py-4 border-b bg-white rounded-t-xl sticky top-0 z-10">
          <div>
            <h2 className="font-bold text-slate-900 text-lg">PAP — {resident.title} {resident.last_name} {resident.first_name}</h2>
            <p className="text-xs text-slate-500">Chambre {resident.room} • {resident.section}</p>
            {readOnly && archiveDate && (
              <p className="text-xs text-amber-600 font-medium mt-0.5">
                Version archivée du {new Date(archiveDate).toLocaleString('fr-FR')}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {editHref && !readOnly && (
              <Link href={editHref}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700 transition-colors">
                <Pencil className="h-4 w-4" /> Modifier
              </Link>
            )}
            <button onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-sm hover:bg-slate-50 transition-colors">
              <Printer className="h-4 w-4" /> Imprimer
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="px-6 py-5">
          <Section title="Informations générales">
            {pap.date_redaction && (
              <div className="mb-3 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg">
                <span className="text-xs font-semibold text-indigo-600">Date de rédaction : </span>
                <span className="text-sm font-bold text-indigo-800">{fmtDate(pap.date_redaction)}</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-x-4">
              <Field label="Date de naissance" value={fmtDate(pap.date_naissance)} />
              <Field label="Service - Chambre" value={pap.service_chambre} />
              <Field label="Date de la réunion" value={fmtDate(pap.date_reunion)} />
              <Field label="Date de réévaluation" value={fmtDate(pap.date_reevaluation)} />
            </div>
            <Field label="Personnes présentes" value={pap.presents} />
          </Section>

          <Section title="Souhait de la personne concernant son PAP">
            <Field label="Capacité de la personne" value={pap.capacite} />
            <Field label="Souhait de réaliser le projet personnalisé" value={pap.souhait_projet} />
            <Field label="Souhait de participer à la réalisation" value={pap.souhait_participation} />
            <Field label="Souhait de faire participer son entourage" value={pap.souhait_entourage} />
          </Section>

          <Section title="Renseignements généraux">
            <Field label="Données d'identité" value={pap.donnees_identite} />
            <Field label="Souhait concernant sa dénomination" value={pap.souhait_denomination} />
            <Field label="Contexte d'entrée" value={pap.contexte_entree} />
            <Field label="Souhaits de fin de vie" value={pap.souhaits_fin_vie} />
            <Field label="Entourage" value={pap.entourage} />
            <Field label="Droit à l'image" value={pap.droit_image} />
          </Section>

          <Section title="Histoire de vie">
            <Field label="Situation familiale" value={pap.situation_familiale} />
            <Field label="Vie professionnelle" value={pap.vie_professionnelle} />
            <Field label="Épisodes importants de sa vie" value={pap.episodes_importants} />
          </Section>

          <Section title="Habitudes de vie">
            <div className="grid grid-cols-2 gap-x-4">
              <Field label="Boire et manger" value={pap.besoin_boire_manger} />
              <Field label="Éliminer" value={pap.eliminer} />
              <Field label="Se mouvoir" value={pap.mouvoir_posture} />
              <Field label="Dormir et se reposer" value={pap.dormir_reposer} />
              <Field label="Se vêtir" value={pap.vetir_devtir} />
              <Field label="Être propre" value={pap.propre_teguments} />
              <Field label="Éviter les dangers" value={pap.eviter_dangers} />
              <Field label="Communication" value={pap.communication} />
              <Field label="Croyances et valeurs" value={pap.croyances_valeurs} />
              <Field label="Occupation / récréation" value={pap.occupation_recreation} />
              <Field label="Besoin d'apprendre" value={pap.apprendre} />
              <Field label="Ressenti / Adaptation" value={pap.ressenti_adaptation} />
            </div>
          </Section>

          <Section title="Identification des risques">
            <div className="flex flex-wrap gap-2 mb-2">
              {RISQUES.filter(r => pap[r.key]).map(r => (
                <span key={r.key} className="text-xs bg-red-50 text-red-700 border border-red-200 rounded-full px-2 py-0.5">{r.label}</span>
              ))}
              {RISQUES.every(r => !pap[r.key]) && <span className="text-xs text-slate-400">Aucun risque identifié</span>}
            </div>
            <Field label="Autres risques" value={pap.risques_autres} />
          </Section>

          <Section title="Remarques particulières">
            <Field label="Accueil des premiers jours" value={pap.accueil_premiers_jours} />
            <Field label="Les soins" value={pap.soins} />
            <Field label="Les repas" value={pap.repas} />
            <Field label="Ambiance générale" value={pap.ambiance_generale} />
            <Field label="Autres remarques" value={pap.remarques_particulieres} />
          </Section>

          <Section title="Objectifs et signature">
            <Field label="Objectifs retenus" value={pap.objectifs} />
            {pap.capacite_information && (
              <Field label="Capacité concernant l'information"
                value={CAPACITE_LABELS[pap.capacite_information] || pap.capacite_information} />
            )}
            <Field label="Date de signature" value={fmtDate(pap.date_signature)} />
            <div className="mt-6 grid grid-cols-2 gap-8">
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Signature du résident</div>
                <div className="border border-slate-300 rounded h-16 bg-slate-50" />
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Signature du référent</div>
                <div className="border border-slate-300 rounded h-16 bg-slate-50" />
              </div>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
