import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';

interface ConsigneItem {
  room: string;
  nom: string;
  floor: string;
  note: string;
}

export async function POST(req: NextRequest) {
  // Vérification : utilisateur connecté requis pour envoyer des données médicales
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  try {
    const { date, ideNom, ideEmail, cadreEmail, consignes } = await req.json() as {
      date: string;
      ideNom: string;
      ideEmail: string;
      cadreEmail: string;
      consignes: ConsigneItem[];
    };

    const to: string[] = [];
    if (ideEmail?.trim()) to.push(ideEmail.trim());
    if (cadreEmail?.trim() && cadreEmail.trim() !== ideEmail?.trim()) to.push(cadreEmail.trim());

    if (to.length === 0) {
      return NextResponse.json(
        { error: 'Aucun email destinataire configuré. Renseignez les emails dans Paramètres Astreintes.' },
        { status: 400 }
      );
    }

    const dateStr = new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
    const heureStr = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    const tableRows = consignes.map(c => `
      <div style="border:1px solid #e2e8f0;border-radius:10px;margin-bottom:10px;overflow:hidden;">
        <!-- En-tête de la carte : chambre + nom + étage -->
        <div style="background:#f1f5f9;padding:10px 14px;display:flex;align-items:center;gap:10px;">
          <span style="background:#1a3560;color:white;font-size:12px;font-weight:700;padding:3px 9px;border-radius:20px;white-space:nowrap;">Ch. ${c.room}</span>
          <span style="font-size:14px;font-weight:700;color:#1e293b;">${c.nom}</span>
          <span style="font-size:12px;color:#64748b;margin-left:auto;white-space:nowrap;">${c.floor}</span>
        </div>
        <!-- Consigne -->
        <div style="padding:10px 14px;font-size:13px;color:#334155;line-height:1.6;white-space:pre-wrap;word-break:break-word;">${c.note.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
      </div>
    `).join('');

    const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:720px;margin:32px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1a3560 0%,#0e6e80 100%);padding:24px 28px;">
      <h1 style="margin:0;color:white;font-size:20px;font-weight:700;">Consignes de Nuit</h1>
      <p style="margin:4px 0 0;color:rgba(255,255,255,0.75);font-size:13px;">Résidence La Fourrier</p>
    </div>

    <!-- Infos -->
    <div style="padding:20px 28px;border-bottom:1px solid #e2e8f0;background:#f8fafc;">
      <table style="border-collapse:collapse;">
        <tr>
          <td style="padding:3px 0;color:#64748b;font-size:13px;width:160px;">📅 Date</td>
          <td style="padding:3px 0;font-weight:600;font-size:13px;text-transform:capitalize;">${dateStr}</td>
        </tr>
        <tr>
          <td style="padding:3px 0;color:#64748b;font-size:13px;">🕐 Envoyé à</td>
          <td style="padding:3px 0;font-size:13px;">${heureStr}</td>
        </tr>
        <tr>
          <td style="padding:3px 0;color:#64748b;font-size:13px;">👤 IDE d'astreinte</td>
          <td style="padding:3px 0;font-weight:700;font-size:14px;color:#0e6e80;">${ideNom || '—'}</td>
        </tr>
        <tr>
          <td style="padding:3px 0;color:#64748b;font-size:13px;">📋 Résidents</td>
          <td style="padding:3px 0;font-size:13px;">${consignes.length} résident${consignes.length > 1 ? 's' : ''} avec consigne${consignes.length > 1 ? 's' : ''}</td>
        </tr>
      </table>
    </div>

    <!-- Cards -->
    <div style="padding:20px 20px;">
      <h2 style="margin:0 0 14px;font-size:15px;color:#1e293b;font-weight:700;">Consignes par résident</h2>
      ${consignes.length === 0
        ? '<p style="color:#94a3b8;font-style:italic;font-size:13px;">Aucune consigne pour cette nuit.</p>'
        : tableRows
      }
    </div>

    <!-- Footer -->
    <div style="padding:16px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;">
      <p style="margin:0;font-size:11px;color:#94a3b8;">
        Email généré automatiquement par EHPAD Care Hub — Résidence La Fourrier
      </p>
    </div>
  </div>
</body>
</html>`;

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: `EHPAD Care Hub <${FROM_EMAIL}>`,
      to,
      subject: `Consignes de nuit — ${dateStr} — IDE : ${ideNom || 'Non renseigné'}`,
      html,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Audit
    const admin = createAdminClient();
    await admin.from('audit_logs').insert({
      user_id: user.id,
      user_email: user.email ?? null,
      action: 'consignes_email_sent',
      resource: 'consignes_nuit',
      details: { date, recipients: to, resident_count: consignes.length, ide: ideNom },
    });

    return NextResponse.json({ ok: true, recipients: to });
  } catch (err: unknown) {
    console.error('[send-consignes-nuit]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
