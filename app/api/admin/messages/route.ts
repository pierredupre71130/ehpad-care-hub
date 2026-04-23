import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Interdit' }, { status: 403 });

  const { data: messages } = await admin.from('messages').select('*').order('created_at', { ascending: false });
  if (!messages?.length) return NextResponse.json([]);

  // group by conversation_id
  const convMap = new Map<string, {
    conversation_id: string;
    sender_name: string | null;
    last_message: string;
    last_at: string;
    unread_count: number;
  }>();
  for (const msg of messages) {
    const cid = msg.conversation_id as string;
    if (!convMap.has(cid)) {
      convMap.set(cid, {
        conversation_id: cid,
        sender_name: null,
        last_message: msg.content as string,
        last_at: msg.created_at as string,
        unread_count: 0,
      });
    }
    if (msg.sender_type === 'user' && !msg.read_by_admin) convMap.get(cid)!.unread_count++;
    if (msg.sender_type === 'user' && msg.sender_name && !convMap.get(cid)!.sender_name) {
      convMap.get(cid)!.sender_name = msg.sender_name as string;
    }
  }

  const ids = [...convMap.keys()];
  const { data: profiles } = await admin.from('profiles').select('id, display_name, role').in('id', ids);
  const pMap = new Map((profiles ?? []).map((p: { id: string; display_name: string | null; role: string | null }) => [p.id, p]));

  const result = [...convMap.values()].map(c => ({
    ...c,
    display_name: pMap.get(c.conversation_id)?.display_name ?? c.sender_name ?? 'Utilisateur',
    role: pMap.get(c.conversation_id)?.role ?? null,
  })).sort((a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime());

  return NextResponse.json(result);
}
