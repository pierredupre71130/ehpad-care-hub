import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

// ── GET /api/admin/users — liste tous les utilisateurs ────────────────────────
export async function GET() {
  // Vérification session
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const admin = createAdminClient();

  // Récupère les utilisateurs Auth
  const { data: authData, error: authErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });

  // Récupère les profils
  const { data: profiles } = await admin.from('profiles').select('id, role, display_name');
  const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]));

  const users = authData.users.map(u => ({
    id: u.id,
    email: u.email ?? '',
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at ?? null,
    role: profileMap[u.id]?.role ?? 'ide',
    display_name: profileMap[u.id]?.display_name ?? '',
  }));

  return NextResponse.json({ users });
}

// ── POST /api/admin/users — crée un utilisateur ───────────────────────────────
export async function POST(req: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const body = await req.json();
  const { email, password, display_name, role } = body as {
    email: string;
    password: string;
    display_name: string;
    role: string;
  };

  if (!email || !password || !role) {
    return NextResponse.json({ error: 'Champs manquants' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Crée l'utilisateur dans Supabase Auth
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (createErr) return NextResponse.json({ error: createErr.message }, { status: 400 });

  const newId = created.user.id;

  // Upsert profil
  await admin.from('profiles').upsert({
    id: newId,
    email,
    role,
    display_name: display_name || null,
  }, { onConflict: 'id' });

  return NextResponse.json({ id: newId, email, role, display_name });
}
