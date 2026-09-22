import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const { pathname } = request.nextUrl;

  // /api/skynet/futures 是 TAIFEX EOD 收盤快照（一天一份、不可變），
  // 需要 route 層的 s-maxage=600 生效（CDN 級快取），故排除在 no-store 之外。
  const allowCaching = pathname === '/api/skynet/futures';

  if (pathname === '/review' || (pathname.startsWith('/api/skynet/') && !allowCaching)) {
    response.headers.set('cache-control', 'no-store, max-age=0');
    response.headers.set('pragma', 'no-cache');
    response.headers.set('expires', '0');
  }

  return response;
}

export const config = {
  matcher: ['/review', '/api/skynet/:path*'],
};
