import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY non configurée' }, { status: 503 });
  }

  const { imageBase64, mimeType } = await req.json();

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mimeType || 'image/png', data: imageBase64 },
          },
          {
            type: 'text',
            text: `Tu es un OCR. Retranscris TOUT le texte visible dans cette image, ligne par ligne, exactement comme tu le vois.
Ne fais aucune interprétation, ne résume pas, ne filtre pas. Copie tout le texte tel quel, y compris les noms de patients, les numéros de chambre, les soins, les dates.`,
          },
        ],
      }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: err }, { status: res.status });
  }

  const data = await res.json();
  const text = data.content?.[0]?.text ?? '';
  return NextResponse.json({ text });
}
