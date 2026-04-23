import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json([], { status: 200 });
  const admin = createAdminClient();
  const { data } = await admin
    .from('messages')
    .select('*')
    .eq('conversation_id', user.id)
    .order('created_at', { ascending: true });
  // mark admin messages as read by user
  await admin.from('messages').update({ read_by_user: true })
    .eq('conversation_id', user.id).eq('sender_type', 'admin').eq('read_by_user', false);
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  const { content, sender_name } = await req.json();
  if (!content?.trim()) return NextResponse.json({ error: 'Vide' }, { status: 400 });
  const admin = createAdminClient();
  const { data, error } = await admin.from('messages').insert({
    conversation_id: user.id,
    sender_type: 'user',
    sender_name: sender_name?.trim() || null,
    content: content.trim(),
    read_by_admin: false,
    read_by_user: true,
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
