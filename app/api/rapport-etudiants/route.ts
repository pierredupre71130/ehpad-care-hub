import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY non configurée' }, { status: 503 });
  }

  const { stats, commentaires, suggestions, filtres } = await req.json();

  const prompt = `Tu es un expert en qualité des soins et en pédagogie hospitalière. Tu dois rédiger un rapport de synthèse professionnel en français sur la satisfaction des étudiants en stage dans un EHPAD (établissement d'hébergement pour personnes âgées dépendantes).

Ce rapport sera présenté à la cadre de santé de l'établissement. Il doit être structuré, professionnel et actionnable.

## Données analysées

**Période / Filtres** : ${filtres}

**Résultats quantitatifs** :
${stats}

**Commentaires libres des étudiants** :
${commentaires || 'Aucun commentaire renseigné.'}

**Suggestions des étudiants** :
${suggestions || 'Aucune suggestion renseignée.'}

---

## Instructions de rédaction

Rédige un rapport complet structuré avec exactement ces sections (utilise des titres markdown ##) :

## Synthèse exécutive
(3-4 phrases résumant les points clés à retenir)

## Résultats globaux
(Commentaire sur les moyennes, comparaison ESI/EAS si les deux sont présents, tendances générales)

## Analyse par domaine
Organise l'analyse en 4 sous-domaines :
### Accueil et intégration (accueil, déroulement, planning)
### Encadrement pédagogique (encadrement AS, encadrement IDE)
### Relations interprofessionnelles (relationnel ASH, AS, IDE, tuteurs)
### Atteinte des objectifs (objectifs généraux, rôle propre ESI, prescription ESI)

## Points forts identifiés
(Liste à puces des éléments les mieux notés et retours positifs des étudiants)

## Axes d'amélioration
(Liste à puces des points les moins bien notés et suggestions récurrentes)

## Verbatims significatifs
(Cite 3-5 commentaires représentatifs des étudiants, entre guillemets)

## Recommandations
(3-5 recommandations concrètes et actionnables pour la cadre de santé)

## Conclusion
(Synthèse positive et perspective)

---
Sois précis, factuel, et appuie-toi sur les données fournies. Évite le jargon excessif. Longueur cible : 600-900 mots.`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-8b:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
          },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `Erreur Gemini : ${err}` }, { status: 500 });
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    return NextResponse.json({ rapport: text });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
