import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Vérifie que le requêtant est authentifié ET a le rôle 'admin'.
 * Retourne { user, error } — si error est non-null, renvoyer directement la réponse.
 */
export async function requireAdmin(): Promise<
  | { user: { id: string }; response: null }
  | { user: null; response: NextResponse }
> {
  const sb = await createClient();
  const { data: { user }, error: authError } = await sb.auth.getUser();

  if (authError || !user) {
    return {
      user: null,
      response: NextResponse.json({ error: 'Non authentifié' }, { status: 401 }),
    };
  }

  // Vérifie le rôle dans profiles via le client admin (bypass RLS)
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role !== 'admin') {
    return {
      user: null,
      response: NextResponse.json(
        { error: 'Accès refusé — rôle administrateur requis' },
        { status: 403 }
      ),
    };
  }

  return { user: { id: user.id }, response: null };
}
