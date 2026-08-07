import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

// ─── Villes autorisées (comparaison insensible à la casse) ───────────────────
// Vercel utilise MaxMind GeoLite2 ; les noms peuvent varier légèrement.
const ALLOWED_CITIES = [
  'gueugnon',
  'paray-le-monial',
  'paray le monial',
];

function cityIsAllowed(raw: string): boolean {
  const city = decodeURIComponent(raw).toLowerCase().trim();
  return ALLOWED_CITIES.some(allowed =>
    city === allowed || city.replace(/-/g, ' ') === allowed.replace(/-/g, ' ')
  );
}

// ─── Routes publiques (jamais filtrées) ──────────────────────────────────────
function isPublicPath(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname === '/acces-refuse' ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    /\.\w+$/.test(pathname) // fichiers statiques (.ico, .png, etc.)
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Toujours laisser passer les routes publiques
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // En développement local, désactiver le filtre géo (headers Vercel absents)
  const isProduction = process.env.VERCEL === '1';

  // ── Construire la réponse de base (nécessaire pour rafraîchir les cookies) ──
  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  // ── Vérification du rôle admin via la session Supabase ───────────────────
  let isAdmin = false;
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return request.cookies.getAll(); },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              request.cookies.set(name, value);
              response.cookies.set(name, value, options);
            });
          },
        },
      }
    );

    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      isAdmin = profile?.role === 'admin';
    }
  } catch {
    // En cas d'erreur (ex: Supabase injoignable), on laisse le filtre géo décider
  }

  // Les admins connectés passent toujours, quelle que soit leur localisation
  if (isAdmin) return response;

  // ── Filtre géographique (production uniquement) ───────────────────────────
  if (isProduction) {
    const rawCity = request.headers.get('x-vercel-ip-city') ?? '';
    const country = request.headers.get('x-vercel-ip-country') ?? '';

    // Bloquer si hors France ou ville non autorisée
    if (country !== 'FR' || !cityIsAllowed(rawCity)) {
      const url = request.nextUrl.clone();
      url.pathname = '/acces-refuse';
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
