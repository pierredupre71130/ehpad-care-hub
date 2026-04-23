import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

// GET /api/announcements — renvoie les annonces actives pour l'utilisateur courant
export async function GET() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json([], { status: 200 });

  // Récupère le rôle du profil
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  const role = profile?.role ?? null;
  const now = new Date().toISOString();

  // Annonces actives ciblant : tous | ce rôle | cet utilisateur
  const { data, error } = await admin
    .from('announcements')
    .select('id, message, target_type, target_value')
    .eq('active', true)
    .or(
      [
        'target_type.eq.all',
        role ? `and(target_type.eq.role,target_value.eq.${role})` : null,
        `and(target_type.eq.user,target_value.eq.${user.id})`,
      ]
        .filter(Boolean)
        .join(',')
    )
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json([], { status: 200 });
  return NextResponse.json(data ?? []);
}
