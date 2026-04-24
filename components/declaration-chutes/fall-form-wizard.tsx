'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  User, MapPin, AlertTriangle, Activity, ClipboardCheck,
  ChevronLeft, ChevronRight, Check, Loader2,
} from 'lucide-react';
import type { ChuteFormData } from './types';
import {
  LIEUX, ACTIVITES, CHAUSSAGES,
  FACTEURS_INTRINSEQUES, FACTEURS_EXTRINSEQUES,
  CONSEQUENCES, ACTIONS_IMMEDIATES, ACTIONS_PREVENTIVES,
  DEFAULT_FORM, GRAVITY_CONFIG, getGravity,
} from './types';

// ── Composants de saisie partagés ─────────────────────────────────────────────

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-sm font-semibold text-slate-700 mb-2">
      {children}{required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  );
}

function TextInput({
  value, onChange, placeholder, disabled, type = 'text', className,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string;
  disabled?: boolean; type?: string; className?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={cn(
        'w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-800 placeholder:text-slate-400',
        'focus:outline-none focus:border-orange-400 focus:ring-1 focus:ring-orange-100',
        'disabled:bg-slate-50 disabled:cursor-not-allowed',
        className,
      )}
    />
  );
}

function RadioGroup({
  options, value, onChange, disabled,
}: {
  options: readonly string[]; value: string;
  onChange: (v: string) => void; disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => (
        <label
          key={opt}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm cursor-pointer transition-colors select-none',
            value === opt
              ? 'bg-orange-600 border-orange-600 text-white font-medium'
              : 'bg-white border-slate-200 text-slate-700 hover:border-orange-300 hover:bg-orange-50',
            disabled && 'opacity-60 cursor-not-allowed pointer-events-none',
          )}
        >
          <input type="radio" className="sr-only" checked={value === opt}
            onChange={() => !disabled && onChange(opt)} disabled={disabled} />
          {opt}
        </label>
      ))}
    </div>
  );
}

function CheckGroup({
  options, values, onChange, disabled,
}: {
  options: readonly string[]; values: string[];
  onChange: (v: string[]) => void; disabled?: boolean;
}) {
  const toggle = (opt: string) => {
    if (disabled) return;
    onChange(values.includes(opt) ? values.filter(v => v !== opt) : [...values, opt]);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => {
        const checked = values.includes(opt);
        return (
          <label
            key={opt}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm cursor-pointer transition-colors select-none',
              checked
                ? 'bg-orange-600 border-orange-600 text-white font-medium'
                : 'bg-white border-slate-200 text-slate-700 hover:border-orange-300 hover:bg-orange-50',
              disabled && 'opacity-60 cursor-not-allowed pointer-events-none',
            )}
          >
            <input type="checkbox" className="sr-only" checked={checked}
              onChange={() => toggle(opt)} disabled={disabled} />
            {checked && <Check className="h-3 w-3 flex-shrink-0" />}
            {opt}
          </label>
        );
      })}
    </div>
  );
}

function AltreInput({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="mt-2 ml-1">
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Précisez..."
        disabled={disabled}
        className="w-full max-w-sm px-3 py-1.5 rounded-lg border border-orange-200 bg-orange-50/60 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-orange-400 disabled:opacity-60"
      />
    </div>
  );
}

// ── Étapes du formulaire ──────────────────────────────────────────────────────

type StepProps = { form: ChuteFormData; update: (p: Partial<ChuteFormData>) => void; disabled?: boolean };

function Step1({ form, update, disabled }: StepProps) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <FieldLabel required>Nom du patient</FieldLabel>
          <TextInput value={form.patient_nom} onChange={v => update({ patient_nom: v })} placeholder="Nom de famille" disabled={disabled} />
        </div>
        <div>
          <FieldLabel>Prénom</FieldLabel>
          <TextInput value={form.patient_prenom ?? ''} onChange={v => update({ patient_prenom: v })} placeholder="Prénom" disabled={disabled} />
        </div>
        <div>
          <FieldLabel>Sexe</FieldLabel>
          <RadioGroup options={['Homme', 'Femme'] as const} value={form.sexe ?? ''} onChange={v => update({ sexe: v })} disabled={disabled} />
        </div>
        <div>
          <FieldLabel>Âge</FieldLabel>
          <input
            type="number" min={0} max={150}
            value={form.age ?? ''}
            onChange={e => update({ age: e.target.value ? parseInt(e.target.value, 10) : undefined })}
            placeholder="Âge"
            disabled={disabled}
            className="w-24 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-orange-400 disabled:bg-slate-50"
          />
        </div>
        <div>
          <FieldLabel>Chambre</FieldLabel>
          <TextInput value={form.chambre ?? ''} onChange={v => update({ chambre: v })} placeholder="N° chambre" disabled={disabled} className="max-w-xs" />
        </div>
        <div>
          <FieldLabel>Unité / Service</FieldLabel>
          <TextInput value={form.unite ?? ''} onChange={v => update({ unite: v })} placeholder="Ex : Long séjour, Mapad…" disabled={disabled} />
        </div>
      </div>
    </div>
  );
}

function Step2({ form, update, disabled }: StepProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <FieldLabel required>Date de la chute</FieldLabel>
          <TextInput type="date" value={form.date_chute} onChange={v => update({ date_chute: v })} disabled={disabled} className="max-w-xs" />
        </div>
        <div>
          <FieldLabel>Heure</FieldLabel>
          <TextInput type="time" value={form.heure_chute ?? ''} onChange={v => update({ heure_chute: v })} disabled={disabled} className="max-w-xs" />
        </div>
      </div>

      <div>
        <FieldLabel required>Lieu de la chute</FieldLabel>
        <RadioGroup options={LIEUX} value={form.lieu ?? ''} onChange={v => update({ lieu: v, lieu_autre: '' })} disabled={disabled} />
        {form.lieu === 'Autre' && <AltreInput value={form.lieu_autre ?? ''} onChange={v => update({ lieu_autre: v })} disabled={disabled} />}
      </div>

      <div>
        <FieldLabel required>Activité en cours lors de la chute</FieldLabel>
        <RadioGroup options={ACTIVITES} value={form.activite ?? ''} onChange={v => update({ activite: v, activite_autre: '' })} disabled={disabled} />
        {form.activite === 'Autre' && <AltreInput value={form.activite_autre ?? ''} onChange={v => update({ activite_autre: v })} disabled={disabled} />}
      </div>

      <div>
        <FieldLabel required>Chaussage au moment de la chute</FieldLabel>
        <RadioGroup options={CHAUSSAGES} value={form.chaussage ?? ''} onChange={v => update({ chaussage: v, chaussage_autre: '' })} disabled={disabled} />
        {form.chaussage === 'Autre' && <AltreInput value={form.chaussage_autre ?? ''} onChange={v => update({ chaussage_autre: v })} disabled={disabled} />}
      </div>

      <div>
        <FieldLabel required>Chute témoin</FieldLabel>
        <RadioGroup options={['Oui', 'Non'] as const} value={form.temoin ?? ''} onChange={v => update({ temoin: v })} disabled={disabled} />
      </div>
    </div>
  );
}

function Step3({ form, update, disabled }: StepProps) {
  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
        Cochez au moins un facteur dans chaque catégorie.
      </div>
      <div>
        <FieldLabel required>Facteurs intrinsèques <span className="font-normal text-slate-500">(liés au patient)</span></FieldLabel>
        <CheckGroup
          options={FACTEURS_INTRINSEQUES}
          values={form.facteurs_intrinseques ?? []}
          onChange={v => update({ facteurs_intrinseques: v })}
          disabled={disabled}
        />
        {(form.facteurs_intrinseques ?? []).includes('Autre') && (
          <AltreInput value={form.facteurs_intrinseques_autre ?? ''} onChange={v => update({ facteurs_intrinseques_autre: v })} disabled={disabled} />
        )}
      </div>

      <div>
        <FieldLabel required>Facteurs extrinsèques <span className="font-normal text-slate-500">(liés à l'environnement)</span></FieldLabel>
        <CheckGroup
          options={FACTEURS_EXTRINSEQUES}
          values={form.facteurs_extrinseques ?? []}
          onChange={v => update({ facteurs_extrinseques: v })}
          disabled={disabled}
        />
        {(form.facteurs_extrinseques ?? []).includes('Autre') && (
          <AltreInput value={form.facteurs_extrinseques_autre ?? ''} onChange={v => update({ facteurs_extrinseques_autre: v })} disabled={disabled} />
        )}
      </div>
    </div>
  );
}

function Step4({ form, update, disabled }: StepProps) {
  return (
    <div className="space-y-6">
      <div>
        <FieldLabel required>Conséquences de la chute</FieldLabel>
        <CheckGroup
          options={CONSEQUENCES}
          values={form.consequences ?? []}
          onChange={v => update({ consequences: v })}
          disabled={disabled}
        />
        {(form.consequences ?? []).includes('Autre') && (
          <AltreInput value={form.consequences_autre ?? ''} onChange={v => update({ consequences_autre: v })} disabled={disabled} />
        )}
      </div>

      <div>
        <FieldLabel required>Actions immédiates réalisées</FieldLabel>
        <CheckGroup
          options={ACTIONS_IMMEDIATES}
          values={form.actions_immediates ?? []}
          onChange={v => update({ actions_immediates: v })}
          disabled={disabled}
        />
        {(form.actions_immediates ?? []).includes('Autre') && (
          <AltreInput value={form.actions_immediates_autre ?? ''} onChange={v => update({ actions_immediates_autre: v })} disabled={disabled} />
        )}
      </div>

      <div>
        <FieldLabel required>Actions préventives mises en place</FieldLabel>
        <CheckGroup
          options={ACTIONS_PREVENTIVES}
          values={form.actions_preventives ?? []}
          onChange={v => update({ actions_preventives: v })}
          disabled={disabled}
        />
        {(form.actions_preventives ?? []).includes('Autre') && (
          <AltreInput value={form.actions_preventives_autre ?? ''} onChange={v => update({ actions_preventives_autre: v })} disabled={disabled} />
        )}
      </div>
    </div>
  );
}

function Step5({ form, update, disabled }: StepProps) {
  const gravity = getGravity(form.consequences ?? []);
  const gc = GRAVITY_CONFIG[gravity];

  const Tags = ({ values, autre }: { values?: string[]; autre?: string }) => (
    <div className="flex flex-wrap gap-1 mt-1">
      {(values ?? []).map(v => (
        <span key={v} className="px-2 py-0.5 bg-white border border-slate-200 rounded text-xs text-slate-700">{v}</span>
      ))}
      {autre && <span className="px-2 py-0.5 bg-orange-50 border border-orange-200 rounded text-xs text-orange-700">Autre : {autre}</span>}
    </div>
  );

  const Row = ({ label, value }: { label: string; value?: string | number | null }) =>
    value != null && value !== '' ? (
      <div className="flex gap-2 text-sm">
        <span className="text-slate-500 min-w-24 flex-shrink-0">{label} :</span>
        <span className="font-medium text-slate-800">{value}</span>
      </div>
    ) : null;

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">{title}</p>
      {children}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Badge gravité */}
      <div className={cn('flex items-center gap-3 px-4 py-3 rounded-xl border-2', gc.bg, gc.border)}>
        <div className={cn('w-3 h-3 rounded-full flex-shrink-0', gc.dot)} />
        <div>
          <span className="text-sm font-bold">Gravité estimée : <span className={gc.text}>{gc.label}</span></span>
          <p className="text-xs text-slate-500 mt-0.5">Calculée d'après les conséquences saisies</p>
        </div>
      </div>

      <Section title="Patient">
        <Row label="Nom" value={`${form.patient_nom} ${form.patient_prenom ?? ''}`.trim()} />
        <Row label="Sexe" value={form.sexe} />
        <Row label="Âge" value={form.age} />
        <Row label="Chambre" value={form.chambre} />
        <Row label="Unité" value={form.unite} />
      </Section>

      <Section title="Circonstances">
        <Row label="Date" value={form.date_chute ? new Date(form.date_chute + 'T12:00:00').toLocaleDateString('fr-FR') : ''} />
        <Row label="Heure" value={form.heure_chute} />
        <Row label="Lieu" value={form.lieu === 'Autre' ? `Autre : ${form.lieu_autre}` : form.lieu} />
        <Row label="Activité" value={form.activite === 'Autre' ? `Autre : ${form.activite_autre}` : form.activite} />
        <Row label="Chaussage" value={form.chaussage === 'Autre' ? `Autre : ${form.chaussage_autre}` : form.chaussage} />
        <Row label="Témoin" value={form.temoin} />
      </Section>

      <Section title="Facteurs de risque">
        <p className="text-xs font-semibold text-slate-500">Intrinsèques</p>
        <Tags values={form.facteurs_intrinseques} autre={(form.facteurs_intrinseques ?? []).includes('Autre') ? form.facteurs_intrinseques_autre : undefined} />
        <p className="text-xs font-semibold text-slate-500 mt-2">Extrinsèques</p>
        <Tags values={form.facteurs_extrinseques} autre={(form.facteurs_extrinseques ?? []).includes('Autre') ? form.facteurs_extrinseques_autre : undefined} />
      </Section>

      <Section title="Conséquences & Actions">
        <p className="text-xs font-semibold text-slate-500">Conséquences</p>
        <Tags values={form.consequences} autre={(form.consequences ?? []).includes('Autre') ? form.consequences_autre : undefined} />
        <p className="text-xs font-semibold text-slate-500 mt-2">Actions immédiates</p>
        <Tags values={form.actions_immediates} autre={(form.actions_immediates ?? []).includes('Autre') ? form.actions_immediates_autre : undefined} />
        <p className="text-xs font-semibold text-slate-500 mt-2">Actions préventives</p>
        <Tags values={form.actions_preventives} autre={(form.actions_preventives ?? []).includes('Autre') ? form.actions_preventives_autre : undefined} />
      </Section>

      {/* Déclarant */}
      <div className="space-y-4 pt-2">
        <div>
          <FieldLabel>Nom du déclarant</FieldLabel>
          <TextInput value={form.declarant ?? ''} onChange={v => update({ declarant: v })} placeholder="Votre nom et fonction" disabled={disabled} className="max-w-sm" />
        </div>
        <div>
          <FieldLabel>Informations complémentaires</FieldLabel>
          <textarea
            value={form.informations_complementaires ?? ''}
            onChange={e => update({ informations_complementaires: e.target.value })}
            placeholder="Contexte, circonstances particulières, remarques…"
            rows={3}
            disabled={disabled}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-orange-400 resize-none disabled:bg-slate-50"
          />
        </div>
      </div>
    </div>
  );
}

// ── Wizard principal ──────────────────────────────────────────────────────────

const STEPS = [
  { label: 'Patient',        icon: User            },
  { label: 'Circonstances', icon: MapPin           },
  { label: 'Facteurs',      icon: AlertTriangle    },
  { label: 'Conséquences',  icon: Activity         },
  { label: 'Validation',    icon: ClipboardCheck   },
] as const;

export interface FallFormWizardProps {
  onSubmit: (data: ChuteFormData) => Promise<void>;
  onCancel?: () => void;
  initialData?: Partial<ChuteFormData>;
  isEdit?: boolean;
  readOnly?: boolean;
}

export function FallFormWizard({
  onSubmit, onCancel, initialData, isEdit = false, readOnly = false,
}: FallFormWizardProps) {
  const [step, setStep]         = useState(0);
  const [form, setForm]         = useState<ChuteFormData>({ ...DEFAULT_FORM, ...initialData });
  const [submitting, setSubmit] = useState(false);
  const [errors, setErrors]     = useState<string[]>([]);

  const update = (patch: Partial<ChuteFormData>) => setForm(prev => ({ ...prev, ...patch }));

  const validate = (s: number): string[] => {
    const e: string[] = [];
    if (s === 0 && !form.patient_nom.trim()) e.push('Le nom du patient est requis');
    if (s === 1) {
      if (!form.date_chute) e.push('La date est requise');
      if (!form.lieu)       e.push('Le lieu est requis');
      if (!form.activite)   e.push("L'activité est requise");
      if (!form.chaussage)  e.push('Le chaussage est requis');
      if (!form.temoin)     e.push('Précisez si la chute a été témoin');
    }
    if (s === 2) {
      if (!(form.facteurs_intrinseques ?? []).length) e.push('Au moins un facteur intrinsèque est requis');
      if (!(form.facteurs_extrinseques ?? []).length) e.push('Au moins un facteur extrinsèque est requis');
    }
    if (s === 3) {
      if (!(form.consequences ?? []).length)      e.push('Au moins une conséquence est requise');
      if (!(form.actions_immediates ?? []).length) e.push('Au moins une action immédiate est requise');
      if (!(form.actions_preventives ?? []).length) e.push('Au moins une action préventive est requise');
    }
    return e;
  };

  const handleNext = () => {
    const errs = validate(step);
    if (errs.length) { setErrors(errs); return; }
    setErrors([]);
    setStep(s => s + 1);
  };

  const handlePrev = () => { setErrors([]); setStep(s => s - 1); };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmit(true);
    try { await onSubmit(form); }
    finally { setSubmit(false); }
  };

  const StepComp = [Step1, Step2, Step3, Step4, Step5][step];

  return (
    <div className="space-y-6">
      {/* Barre de progression */}
      <div className="flex items-start">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const done   = i < step;
          const active = i === step;
          return (
            <div key={i} className="flex items-center flex-1">
              <div className="flex flex-col items-center gap-1 flex-shrink-0">
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center transition-colors',
                  done   ? 'bg-orange-600 text-white' :
                  active ? 'bg-orange-100 border-2 border-orange-500 text-orange-700' :
                           'bg-slate-100 text-slate-400',
                )}>
                  {done ? <Check className="h-4 w-4" /> : <Icon className="h-3.5 w-3.5" />}
                </div>
                <span className={cn(
                  'text-[10px] font-medium hidden sm:block text-center leading-tight max-w-14',
                  active ? 'text-orange-700' : done ? 'text-orange-500' : 'text-slate-400',
                )}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn('flex-1 h-0.5 mb-4 mx-1', i < step ? 'bg-orange-400' : 'bg-slate-200')} />
              )}
            </div>
          );
        })}
      </div>

      {/* Titre de l'étape */}
      <h3 className="text-base font-bold text-slate-800">
        Étape {step + 1} / {STEPS.length} — {STEPS[step].label}
      </h3>

      {/* Erreurs */}
      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 space-y-1">
          {errors.map((e, i) => <p key={i} className="text-sm text-red-700">• {e}</p>)}
        </div>
      )}

      {/* Contenu de l'étape */}
      <StepComp form={form} update={update} disabled={readOnly} />

      {/* Navigation */}
      {!readOnly && (
        <div className="flex items-center justify-between pt-4 border-t border-slate-100">
          <button
            onClick={step === 0 ? onCancel : handlePrev}
            disabled={step === 0 && !onCancel}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            {step === 0 ? 'Annuler' : 'Précédent'}
          </button>

          {step < STEPS.length - 1 ? (
            <button
              onClick={handleNext}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 transition-colors"
            >
              Suivant
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {isEdit ? 'Enregistrer les modifications' : 'Valider la déclaration'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
