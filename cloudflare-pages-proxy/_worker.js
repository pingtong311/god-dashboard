const TARGET_ORIGIN = 'https://skynet-dashboard.xpornky1122.workers.dev';

function shouldBypassBrowserCache(pathname) {
  if (pathname.startsWith('/api/')) return true;
  if (pathname.startsWith('/_next/static/')) return false;
  if (/\.(?:js|css|woff2?|png|jpg|jpeg|svg|ico|webp)$/i.test(pathname)) return false;
  return true;
}

export default {
  async fetch(request) {
    const incomingUrl = new URL(request.url);
    const targetUrl = new URL(TARGET_ORIGIN);
    targetUrl.pathname = incomingUrl.pathname;
    targetUrl.search = incomingUrl.search;

    const proxiedRequest = new Request(targetUrl.toString(), request);
    proxiedRequest.headers.set('x-skynet-proxied-from', incomingUrl.host);

    const response = await fetch(proxiedRequest, {
      cf: shouldBypassBrowserCache(incomingUrl.pathname)
        ? { cacheTtl: 0, cacheEverything: false }
        : undefined,
    });
    const headers = new Headers(response.headers);
    headers.set('x-skynet-pages-proxy', 'worker');
    if (shouldBypassBrowserCache(incomingUrl.pathname)) {
      headers.set('cache-control', 'no-store, max-age=0');
      headers.set('pragma', 'no-cache');
      headers.set('expires', '0');
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
