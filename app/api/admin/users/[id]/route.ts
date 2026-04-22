import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

// ── PATCH /api/admin/users/[id] — modifie rôle / nom ─────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { role, display_name, password } = body as {
    role?: string;
    display_name?: string;
    password?: string;
  };

  const admin = createAdminClient();

  // Mise à jour mot de passe si fourni
  if (password) {
    const { error } = await admin.auth.admin.updateUserById(id, { password });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Mise à jour profil
  const update: Record<string, string> = {};
  if (role) update.role = role;
  if (display_name !== undefined) update.display_name = display_name;

  if (Object.keys(update).length > 0) {
    await admin.from('profiles').update(update).eq('id', id);
  }

  return NextResponse.json({ success: true });
}

// ── DELETE /api/admin/users/[id] — supprime un utilisateur ───────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });

  const { id } = await params;
  const admin = createAdminClient();

  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await admin.from('profiles').delete().eq('id', id);

  return NextResponse.json({ success: true });
}
