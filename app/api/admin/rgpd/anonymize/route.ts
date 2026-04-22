import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/api-auth';

export async function POST(req: NextRequest) {
  const { response } = await requireAdmin();
  if (response) return response;

  const { residentId } = await req.json() as { residentId: string };
  if (!residentId) {
    return NextResponse.json({ error: 'residentId requis' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Récupère le résident pour l'audit
  const { data: resident } = await admin.from('residents').select('last_name, first_name').eq('id', residentId).maybeSingle();

  // Anonymise les données personnelles (garde les données médicales)
  const { error } = await admin.from('residents').update({
    last_name: 'ANONYMISÉ',
    first_name: null,
    title: null,
    photo_url: null,
    // Les champs médicaux (régimes, niveaux de soin...) sont conservés
  }).eq('id', residentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Audit
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  await admin.from('audit_logs').insert({
    user_id: user?.id ?? null,
    user_email: user?.email ?? null,
    action: 'rgpd_anonymize',
    resource: 'residents',
    details: {
      resident_id: residentId,
      resident_name: resident ? `${resident.last_name} ${resident.first_name ?? ''}`.trim() : residentId,
    },
  });

  return NextResponse.json({ ok: true });
}
