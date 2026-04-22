import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
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

  const upsertData: Record<string, string> = { id };
  if (role) upsertData.role = role;
  if (display_name !== undefined) upsertData.display_name = display_name;

  if (Object.keys(upsertData).length > 1) {
    await admin.from('profiles').upsert(upsertData, { onConflict: 'id' });
  }

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

  return NextResponse.json({ success: true });
}
