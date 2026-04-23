import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/api-auth';

// GET /api/admin/announcements — liste toutes les annonces
export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('announcements')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// POST /api/admin/announcements — crée une annonce
export async function POST(req: NextRequest) {
  const { response } = await requireAdmin();
  if (response) return response;

  const body = await req.json();
  const { message, target_type, target_value, expires_at } = body as {
    message: string;
    target_type: 'all' | 'role' | 'user';
    target_value?: string | null;
    expires_at?: string | null;
  };

  if (!message?.trim()) {
    return NextResponse.json({ error: 'Message requis' }, { status: 400 });
  }

  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('announcements')
    .insert({
      message: message.trim(),
      target_type: target_type ?? 'all',
      target_value: target_value ?? null,
      expires_at: expires_at ?? null,
      created_by: user?.id ?? null,
      active: true,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
