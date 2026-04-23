import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

async function checkAdmin() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
  return profile?.role === 'admin' ? admin : null;
}

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await checkAdmin();
  if (!admin) return NextResponse.json({ error: 'Interdit' }, { status: 403 });
  const { id } = await params;
  const { data, error } = await admin
    .from('messages')
    .select('*')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await admin
    .from('messages')
    .update({ read_by_admin: true })
    .eq('conversation_id', id)
    .eq('sender_type', 'user')
    .eq('read_by_admin', false);
  return NextResponse.json(data ?? []);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await checkAdmin();
  if (!admin) return NextResponse.json({ error: 'Interdit' }, { status: 403 });
  const { id } = await params;
  const { content } = await req.json();
  if (!content?.trim()) return NextResponse.json({ error: 'Vide' }, { status: 400 });
  const { data, error } = await admin.from('messages').insert({
    conversation_id: id,
    sender_type: 'admin',
    sender_name: 'Administrateur',
    content: content.trim(),
    read_by_admin: true,
    read_by_user: false,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE — supprime une liste de messages par leurs IDs
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await checkAdmin();
  if (!admin) return NextResponse.json({ error: 'Interdit' }, { status: 403 });
  const { id } = await params;
  const { messageIds } = await req.json() as { messageIds: string[] };
  if (!Array.isArray(messageIds) || messageIds.length === 0) {
    return NextResponse.json({ error: 'Aucun message sélectionné' }, { status: 400 });
  }
  const { error } = await admin
    .from('messages')
    .delete()
    .eq('conversation_id', id)
    .in('id', messageIds);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: messageIds.length });
}
