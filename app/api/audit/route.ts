import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  // Utilisateur connecté requis
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  const body = await req.json() as {
    action: string;
    resource?: string;
    details?: Record<string, unknown>;
  };

  if (!body.action) {
    return NextResponse.json({ error: 'action requis' }, { status: 400 });
  }

  // Récupère le rôle et email depuis profiles
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('role, display_name')
    .eq('id', user.id)
    .maybeSingle();

  // Récupère l'IP (Vercel fournit x-forwarded-for)
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    null;

  const { error } = await admin.from('audit_logs').insert({
    user_id: user.id,
    user_email: user.email ?? null,
    user_role: profile?.role ?? null,
    action: body.action,
    resource: body.resource ?? null,
    details: body.details ?? null,
    ip_address: ip,
  });

  if (error) {
    console.error('[audit]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
