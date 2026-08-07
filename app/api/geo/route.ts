import { type NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  return NextResponse.json({
    city:    request.headers.get('x-vercel-ip-city')    ?? '(absent)',
    country: request.headers.get('x-vercel-ip-country') ?? '(absent)',
    region:  request.headers.get('x-vercel-ip-country-region') ?? '(absent)',
    ip:      request.headers.get('x-forwarded-for')     ?? '(absent)',
  });
}
