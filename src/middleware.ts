import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const { pathname } = request.nextUrl;

  if (pathname === '/review' || pathname.startsWith('/api/skynet/')) {
    response.headers.set('cache-control', 'no-store, max-age=0');
    response.headers.set('pragma', 'no-cache');
    response.headers.set('expires', '0');
  }

  return response;
}

export const config = {
  matcher: ['/review', '/api/skynet/:path*'],
};
