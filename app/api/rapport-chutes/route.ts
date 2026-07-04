import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'XAI_API_KEY non configurée' }, { status: 503 });
  }

  const { stats, periode } = await req.json();

  const prompt = `Tu es un expert en gestion des risques et en qualité des soins dans un EHPAD (établissement d'hébergement pour personnes âgées dépendantes). Tu dois rédiger un rapport d'analyse professionnel en français sur les chutes déclarées dans l'établissement.

Ce rapport sera présenté à la cadre de santé et à l'équipe pluridisciplinaire. Il doit être structuré, professionnel et orienté vers la prévention.

## Données analysées

**Période** : ${periode}

**Statistiques** :
${stats}

---

## Instructions de rédaction

Rédige un rapport complet structuré avec exactement ces sections (utilise des titres markdown ##) :

## Synthèse exécutive
(3-4 phrases résumant les points clés à retenir)

## Analyse quantitative
(Commentaire sur le volume de chutes, la gravité et le taux de récidive)

## Facteurs de risque identifiés
### Facteurs intrinsèques
(Analyse des facteurs liés au patient)
### Facteurs extrinsèques
(Analyse des facteurs liés à l'environnement)

## Analyse spatiale
(Commentaire sur les lieux de chutes les plus fréquents et les implications pratiques)

## Points de vigilance
(Liste à puces des éléments nécessitant une attention particulière : patients récidivistes, chutes graves, tendances préoccupantes)

## Recommandations
(3-5 recommandations concrètes et actionnables : prévention, formation, environnement, protocoles)

## Conclusion
(Synthèse et perspective pour la prévention des chutes)

---
Sois précis, factuel, et appuie-toi sur les données fournies. Évite le jargon excessif. Longueur cible : 500-800 mots.`;

  try {
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'grok-3-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 2048,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `Erreur IA : ${err}` }, { status: 500 });
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content ?? '';
    return NextResponse.json({ rapport: text });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
