import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/api-auth';

// ── PATCH /api/admin/users/[id] — modifie rôle / nom / mot de passe ──────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireAdmin();
  if (response) return response;

  const { id } = await params;
  const body = await req.json();
  const { role, display_name, password } = body as {
    role?: string;
    display_name?: string;
    password?: string;
  };

  const admin = createAdminClient();

  if (password) {
    const { error } = await admin.auth.admin.updateUserById(id, { password });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const updateData: Record<string, string | null> = {};
  if (role) updateData.role = role;
  if (display_name !== undefined) updateData.display_name = display_name ?? null;

  if (Object.keys(updateData).length > 0) {
    // Tente d'abord un UPDATE sur la ligne existante
    const { data: updated, error: updateErr } = await admin
      .from('profiles')
      .update(updateData)
      .eq('id', id)
      .select('id');

    if (updateErr) {
      console.error('[PATCH user] update error:', updateErr.message);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // Si aucune ligne mise à jour → le profil n'existe pas encore, on le crée
    if (!updated || updated.length === 0) {
      const { error: insertErr } = await admin
        .from('profiles')
        .insert({ id, ...updateData });
      if (insertErr) {
        console.error('[PATCH user] insert error:', insertErr.message);
        return NextResponse.json({ error: insertErr.message }, { status: 500 });
      }
    }
  }

  // Audit
  const { data: { user: adminUser } } = await (await createClient()).auth.getUser();
  await admin.from('audit_logs').insert({
    user_id: adminUser?.id ?? null,
    user_email: adminUser?.email ?? null,
    action: 'user_update',
    resource: 'users',
    details: { target_user_id: id, changes: { role, display_name, password_changed: !!password } },
  });

  return NextResponse.json({ success: true });
}

// ── DELETE /api/admin/users/[id] — supprime un utilisateur ───────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { response } = await requireAdmin();
  if (response) return response;

  const { id } = await params;
  const admin = createAdminClient();

  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await admin.from('profiles').delete().eq('id', id);

  // Audit
  const { data: { user: adminUser } } = await (await createClient()).auth.getUser();
  await admin.from('audit_logs').insert({
    user_id: adminUser?.id ?? null,
    user_email: adminUser?.email ?? null,
    action: 'user_delete',
    resource: 'users',
    details: { deleted_user_id: id },
  });

  return NextResponse.json({ success: true });
}
