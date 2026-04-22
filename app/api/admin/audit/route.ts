import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/api-auth';

export async function GET(req: NextRequest) {
  const { response } = await requireAdmin();
  if (response) return response;

  const { searchParams } = new URL(req.url);
  const actionFilter = searchParams.get('action');

  const admin = createAdminClient();

  let query = admin
    .from('audit_logs')
    .select('id, created_at, user_email, user_role, action, resource, details, ip_address')
    .order('created_at', { ascending: false })
    .limit(500);

  if (actionFilter) {
    query = query.eq('action', actionFilter);
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ logs: data ?? [] });
}
