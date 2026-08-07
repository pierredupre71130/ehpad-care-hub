import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// ─── Villes autorisées ────────────────────────────────────────────────────────
const ALLOWED_CITIES = [
  'gueugnon',
  'paray-le-monial',
  'paray le monial',
];

function cityIsAllowed(raw: string): boolean {
  const city = decodeURIComponent(raw).toLowerCase().trim();
  return ALLOWED_CITIES.some(
    allowed => city === allowed || city.replace(/-/g, ' ') === allowed.replace(/-/g, ' ')
  );
}

// Routes toujours accessibles (sans auth ni filtre géo)
function isPublicPath(pathname: string): boolean {
  return pathname.startsWith('/login') || pathname === '/acces-refuse';
}

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // ── Supabase auth (refresh session cookies) ──────────────────────────────
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // ── Auth guard ────────────────────────────────────────────────────────────
  if (!user && !isPublicPath(pathname)) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (user && pathname.startsWith('/login')) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // ── Filtre géographique par ville (production Vercel uniquement) ──────────
  const isProduction = process.env.VERCEL === '1';

  if (isProduction && user && !isPublicPath(pathname)) {
    // Vérifier si l'utilisateur est admin (les admins passent sans contrôle géo)
    let isAdmin = false;
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      isAdmin = profile?.role === 'admin';
    } catch { /* en cas d'erreur DB, on laisse passer */ }

    if (!isAdmin) {
      const rawCity  = request.headers.get('x-vercel-ip-city') ?? '';
      const country  = request.headers.get('x-vercel-ip-country') ?? '';
      const region   = request.headers.get('x-vercel-ip-country-region') ?? '';

      // Autoriser si : France ET (ville reconnue OU département 71 OU ville non détectable)
      // La ville peut être absente sur les réseaux d'entreprise — on se fie alors au pays
      const cityUnknown = rawCity === '' || rawCity === '(non détecté)';
      const allowed = country === 'FR' && (cityIsAllowed(rawCity) || region === '71' || cityUnknown);

      if (!allowed) {
        return NextResponse.redirect(new URL('/acces-refuse', request.url));
      }
    }
  }

  // ── En-têtes de sécurité (RGPD / données médicales) ──────────────────────
  const response = supabaseResponse;

  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains'
    );
  }

  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=()'
  );

  response.headers.set(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      `img-src 'self' data: blob: ${process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://*.supabase.co'}`,
      `connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''} https://api.resend.com`,
      "font-src 'self'",
      "frame-ancestors 'none'",
    ].join('; ')
  );

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
