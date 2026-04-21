'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Printer, Pencil, Check, X, Loader2, ArrowLeft, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { createClient } from '@/lib/supabase/client';
import { HomeButton } from '@/components/ui/home-button';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

interface FicheDePoste {
  id: string;
  poste: string;
  contenu: string;
  updated_at: string;
}

// ── Contenu par défaut ────────────────────────────────────────────────────────

const DEFAULTS: Record<string, string> = {
  'AS Matin': `FICHE DE TÂCHES - AS MATIN EHPAD GUEUGNON
Date d'application : 24 juil. 2024

06h45 / 06h50 - Habillage

06h50 / 07h00 - Transmissions avec l'équipe de nuit

07h00 / 08h15 - Réalisation des soins d'hygiène, de confort et préventifs (douches et toilettes)
Réfection des lits, traçabilité des soins

08h15 / 08h50 - Installation des résidents alités en binôme avec l'ASH
Aide à la prise du petit déjeuner en chambre

08h50 / 09h00 - Pause

09h00 / 11h30 - Réalisation des soins d'hygiène, de confort et préventifs
Douche ou toilette complète au lit
Réfection des lits

11h30 / 12h00 - Installation des résidents en SAM
Installation des résidents en chambre
Préparation des plateaux repas en collaboration avec l'IDE pour les traitements

12h00 / 12h50 - Distribution et aide au repas en chambre

12h50 / 13h00 - Installation des résidents sur les lieux de vie ou en chambre pour la sieste

13h00 / 13h20 - Pause

13h20 / 14h00 - Gestion logistique : fiches repas et commandes
Ateliers selon organisation hebdomadaire : PVI ou ateliers bien être

14h00 / 14h20 - Transmissions en équipe pluri disciplinaire

14h20 / 14h25 - Déshabillage

14h25 - Fin de poste`,

  'AS Soir': `FICHE DE TÂCHES - AS SOIR EHPAD GUEUGNON
Date d'application : 25 juil. 2024

12h40 / 12h45 - Habillage

12h45 / 12h50 - Distribution du café en SAM

12h50 / 14h00 - Accompagnement des résidents en chambre ou sur les lieux de vie
Réalisations des soins d'hygiène, de confort et préventifs
Traçabilité des soins effectués

14h00 / 14h20 - Transmissions en équipe pluridisciplinaire

14h20 / 14h50 - Préparation de la collation

14h50 / 16h00 - Distribution et aide à la prise de la collation en chambre et sur les lieux de vie
Ramassage de la collation, ouverture des lits
Traçabilité des soins effectués

16h00 / 16h10 - Pause

16h10 / 17h30 - Réalisations des soins d'hygiène, de confort et préventifs

17h30 / 17h45 - Accompagnement des résidents en SAM
Installation des résidents en chambre
Préparation des plateau repas en collaboration avec l'IDE pour les traitements

17h45 / 18h30 - Distribution et aide à la prise des repas en chambre

18h30 / 19h55 - Accompagnement des résidents en chambre et préparation pour la nuit
Réalisations des soins d'hygiène, de confort et préventifs
Traçabilité des soins effectués

19h55 / 20h15 - Pause

20h15 / 20h20 - Déshabillage

20h20 - Fin de poste`,

  'AS Nuit': `FICHE DE TÂCHES - AS NUIT EHPAD GUEUGNON
Date d'application : 24 juil. 2024

21h00 / 21h05 - Habillage

21h05 / 21h20 - Prise de connaissance des transmissions pour la nuit

21h20 / 23h30 - Réinstallation des résidents pour la nuit
Réalisations des soins d'hygiène, de confort et préventifs
Distribution des produits de soins et protections
Surveillance si besoin des paramètres vitaux
Aide à la prise des traitements sur délégation IDE
Traçabilité des soins effectuées

23h30 / 00h00 - Préparation des chariots AS pour le lendemain

00h00 / 00h30 - Pause

00h40 / 02h00 - Gestion de la logistique : commande de linge et / ou de protections

02h00 / 04h45 - Surveillance des résidents et réponse aux sollicitations

04h45 / 06h45 - Réinstallation des résidents pour la nuit
Réalisations des soins d'hygiène, de confort et préventifs
Traçabilité des soins effectuées

06h45 / 06h55 - Transmissions à l'équipe de jour

06h55 / 07h00 - Déshabillage

07h00 - Fin de poste`,

  'ASH Matin': `FICHE DE TÂCHES - ASH MATIN EHPAD GUEUGNON
Date d'application : 24 juil. 2024

07h00 / 07h05 - Habillage

07h05 / 07h30 - Préparation des chariots ménage (Secteur vert et rose)
Prise des températures des frigos (Secteur jaune)
Préparation des petits déjeuners
Mise du couvert en SAM (secteur bleu)

07h30 / 08h30 - Aide à l'installation des résidents pour le petit déjeuner, service en chambre des plateaux

08h30 / 08h45 - Débarrassage des plateaux et descente de la vaisselle en cuisine

08h50 / 09h00 - Pause

09h00 / 11h40 - Entretien des chambres
Mise en tension du chauffe assiettes, eau sur table

11h40 / 12h50 - Installation des résidents en SAM
Récupération du chariot repas en cuisine
Service et aide au repas en SAM

12h50 / 13h00 - Descente du chariot repas en cuisine après débarrassage de la vaisselle et nettoyage de la SAM

13h00 / 13h20 - Pause

13h20 / 14h00 - Activité selon calendrier établis des taches à la semaine (Linge, commande, ménage de fond, entretien matériel)

14h00 / 14h20 - Transmissions en équipe pluri disciplinaire

14h20 / 14h25 - Déshabillage

14h25 - Fin de poste`,

  'ASH Soir': `FICHE DE TÂCHES - ASH SOIR EHPAD GUEUGNON
Date d'application : 24 juil. 2024

11h30 / 11h35 - Habillage

11h35 / 12h15 - Entretien des chambres

12h15 / 13h00 - Fin du service en salle à manger : préparation du fromage et dessert à l'assiette
Descente du chariot repas en cuisine après débarrassage de la vaisselle et nettoyage de la SAM

13h00 / 13h20 - Pause

13h20 / 14h00 - Mise du couvert en SAM pour le diner
Préparation des plateaux du petit déjeuner
Activité selon calendrier établis des taches à la semaine (Linge, commande, ménage de fond, entretien matériel)

14h00 / 14h20 - Transmissions en équipe pluri disciplinaire

14h20 / 17h00 - Activité selon calendrier établis des taches à la semaine (Linge, commande, ménage de fond, entretien matériel)

16h00 / 16h10 - Pause

17h00 / 17h45 - Vérification des stocks, mise du pain et de l'eau sur les tables, en SAM
Mise en tension du chauffe assiettes
Récupération du chariot repas en cuisine

17h45 / 18h30 - Service du repas en SAM

18h30 / 19h05 - Descente du chariot repas après débarrassage des tables et nettoyage de la SAM
Descente des poubelles

19h05 / 19h10 - Déshabillage`,

  'IDE Matin': `FICHE DE TÂCHES - IDE MATIN EHPAD GUEUGNON
Date d'application : 24 juil. 2024

06h45 / 06h50 - Habillage

06h50 / 07h00 - Transmissions avec l'équipe de nuit

07h00 / 08h50 - Distribution des traitements en chambre, surveillance des paramètres vitaux

08h50 / 09h00 - Pause

09h00 / 12h00 - Tour de soins divers, pansements, visite médicale

12h00 / 12h30 - Distribution des médicaments en SAM

12h30 / 13h00 - Transmissions sur le DSI

13h00 / 13h20 - Pause

13h20 / 14h00 - Rangement, validation des stocks
Validation des soins faits

14h00 / 14h20 - Transmissions en équipe pluridisciplinaire

14h20 / 14h25 - Déshabillage

14h25 - Fin de poste`,

  'IDE Soir': `FICHE DE TÂCHES - IDE SOIR EHPAD GUEUGNON
Date d'application : 24 juil. 2024

13h20 / 13h25 - Habillage

13h25 / 14h00 - Vérification et déblisterage des médicaments pour l'après-midi

14h00 / 14h20 - Transmissions en équipe pluridisciplinaire

14h20 / 16h00 - Vérification et déblisterage des médicaments pour l'après-midi (suite)

16h00 / 16h10 - Pause

16h10 / 17h45 - Tour de soins divers : glycémie capillaire, administration des collyres, aérosol

17h45 / 18h30 - Distribution des médicaments sur les lieux de vie et en chambre

18h30 / 19h30 - Distribution des traitements pour la nuit

19h30 / 20h00 - Traçabilité des soins sur DSI et cahier de transmissions nuit

20h00 / 20h20 - Pause

20h20 / 20h55 - Préparation des RDV pour le lendemain + BS
Validation des soins faits

20h55 / 21h00 - Déshabillage

21h00 - Fin de poste`,
};

// ── Config postes (accueil) ───────────────────────────────────────────────────

const POSTES_CONFIG = [
  [
    { label: 'AS Matin',  bg: 'bg-yellow-50 border-yellow-300 hover:bg-yellow-100 text-yellow-800',  dot: 'bg-yellow-400' },
    { label: 'AS Soir',   bg: 'bg-orange-50 border-orange-300 hover:bg-orange-100 text-orange-800',  dot: 'bg-orange-400' },
    { label: 'AS Nuit',   bg: 'bg-indigo-50 border-indigo-300 hover:bg-indigo-100 text-indigo-800',  dot: 'bg-indigo-400' },
  ],
  [
    { label: 'ASH Matin', bg: 'bg-emerald-50 border-emerald-300 hover:bg-emerald-100 text-emerald-800', dot: 'bg-emerald-400' },
    { label: 'ASH Soir',  bg: 'bg-teal-50 border-teal-300 hover:bg-teal-100 text-teal-800',           dot: 'bg-teal-400' },
  ],
  [
    { label: 'IDE Matin', bg: 'bg-rose-50 border-rose-300 hover:bg-rose-100 text-rose-800',           dot: 'bg-rose-400' },
    { label: 'IDE Soir',  bg: 'bg-pink-50 border-pink-300 hover:bg-pink-100 text-pink-800',           dot: 'bg-pink-400' },
  ],
];

const ALL_POSTES = POSTES_CONFIG.flat();

// ── Supabase helpers ──────────────────────────────────────────────────────────

async function fetchFiches(): Promise<FicheDePoste[]> {
  const sb = createClient();
  const { data, error } = await sb.from('fiche_de_poste').select('*');
  if (error) throw new Error(error.message);
  return (data ?? []) as FicheDePoste[];
}

// ── FicheView ─────────────────────────────────────────────────────────────────

function FicheContent({ text }: { text: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 text-sm leading-relaxed">
      {text.split('\n').map((line, i) => {
        const isTitle = line.startsWith('FICHE DE');
        const isHoraire = /^\d{1,2}h/.test(line.trim());
        if (line.trim() === '') return <div key={i} className="h-2" />;
        return (
          <p
            key={i}
            className={
              isTitle
                ? 'font-bold text-slate-900 text-base uppercase mb-2'
                : isHoraire
                ? 'font-bold text-blue-800 mt-4 mb-1'
                : 'text-slate-700 mb-0.5 pl-3'
            }
          >
            {line}
          </p>
        );
      })}
    </div>
  );
}

function FicheView({
  fiche,
  poste,
  onSave,
}: {
  fiche: FicheDePoste | undefined;
  poste: string;
  onSave: (id: string | undefined, poste: string, contenu: string) => Promise<void>;
}) {
  const content = fiche?.contenu ?? DEFAULTS[poste] ?? '';
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const handleEdit = () => {
    setEditValue(content);
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setEditValue('');
  };

  const handleSave = async () => {
    await onSave(fiche?.id, poste, editValue);
    setEditing(false);
    setEditValue('');
  };

  return (
    <div>
      {/* Actions */}
      <div className="flex justify-end gap-2 mb-4 print:hidden">
        {editing ? (
          <>
            <Button size="sm" variant="ghost" onClick={handleCancel} className="text-red-500 hover:text-red-700">
              <X className="h-4 w-4 mr-1" /> Annuler
            </Button>
            <Button size="sm" onClick={handleSave} className="bg-green-600 hover:bg-green-700 text-white">
              <Check className="h-4 w-4 mr-1" /> Enregistrer
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={handleEdit}>
            <Pencil className="h-4 w-4 mr-1" /> Modifier
          </Button>
        )}
      </div>

      {editing ? (
        <Textarea
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          className="font-mono text-sm min-h-[600px] w-full"
        />
      ) : (
        <FicheContent text={content} />
      )}
    </div>
  );
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function FichesDePostePage() {
  const queryClient = useQueryClient();
  const [selectedPoste, setSelectedPoste] = useState<string | null>(null);

  const { data: fiches = [], isLoading } = useQuery({
    queryKey: ['fiches_de_poste'],
    queryFn: fetchFiches,
  });

  const saveMutation = useMutation({
    mutationFn: async ({ id, poste, contenu }: { id: string | undefined; poste: string; contenu: string }) => {
      const sb = createClient();
      if (id) {
        const { error } = await sb.from('fiche_de_poste').update({ contenu, updated_at: new Date().toISOString() }).eq('id', id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await sb.from('fiche_de_poste').insert({ poste, contenu });
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fiches_de_poste'] });
      toast.success('Fiche enregistrée');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSave = (id: string | undefined, poste: string, contenu: string) =>
    saveMutation.mutateAsync({ id, poste, contenu });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  // ── Vue fiche ──
  if (selectedPoste) {
    const fiche = fiches.find(f => f.poste === selectedPoste);
    const cfg = ALL_POSTES.find(p => p.label === selectedPoste);

    return (
      <div className="min-h-screen bg-slate-50">
        {/* Header */}
        <div className="print:hidden sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <HomeButton />
              <button
                onClick={() => setSelectedPoste(null)}
                className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 text-sm transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Tous les postes
              </button>
              <span className="text-slate-300">·</span>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${cfg?.dot ?? 'bg-slate-400'}`} />
                <h1 className="text-lg font-bold text-slate-800">{selectedPoste}</h1>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5">
              <Printer className="h-4 w-4" /> Imprimer
            </Button>
          </div>
        </div>

        {/* Titre pour impression */}
        <div className="hidden print:block p-8 pb-0">
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Fiche de Poste — {selectedPoste}</h1>
          <p className="text-xs text-slate-400 mb-6">EHPAD Gueugnon</p>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-6">
          <FicheView
            fiche={fiche}
            poste={selectedPoste}
            onSave={handleSave}
          />
        </div>
      </div>
    );
  }

  // ── Vue accueil ──
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <HomeButton />
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-slate-600" />
            <h1 className="text-xl font-bold text-slate-800">Fiches de Poste</h1>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <p className="text-slate-500 mb-8">Sélectionnez votre poste pour consulter votre fiche</p>

        <div className="space-y-4">
          {POSTES_CONFIG.map((ligne, i) => (
            <div
              key={i}
              className="grid gap-4"
              style={{ gridTemplateColumns: `repeat(${ligne.length}, minmax(0, 1fr))` }}
            >
              {ligne.map(poste => {
                const hasFiche = fiches.some(f => f.poste === poste.label);
                return (
                  <button
                    key={poste.label}
                    onClick={() => setSelectedPoste(poste.label)}
                    className={`relative rounded-xl border-2 p-6 transition-all shadow-sm cursor-pointer font-bold text-lg ${poste.bg}`}
                  >
                    {poste.label}
                    {hasFiche && (
                      <span className="absolute top-2 right-2 text-[10px] font-medium bg-white/70 px-1.5 py-0.5 rounded-full text-slate-500">
                        modifiée
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
