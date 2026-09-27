import { NextResponse } from 'next/server';

type GuardOptions = {
  endpoint: string;
  windowMs?: number;
  maxRequests?: number;
  allowSameOrigin?: boolean;
  /**
   * 端點專用權杖（例如 GOD 辦公室的 ingest 專用 token）。
   * 與全域權杖等效，但只對此端點有效；未傳時行為與修改前完全一致。
   */
  extraTokens?: readonly string[];
};

type RateBucket = {
  count: number;
  resetAt: number;
};

const rateBuckets = new Map<string, RateBucket>();

function requestHost(request: Request): string {
  return request.headers.get('x-skynet-proxied-from') || request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
}

function requestIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for') || '';
  return request.headers.get('cf-connecting-ip') || forwarded.split(',')[0]?.trim() || 'unknown';
}

function sameHostUrl(value: string | null, host: string): boolean {
  if (!value || !host) return false;
  try {
    return new URL(value).host === host;
  } catch {
    return false;
  }
}

function extractToken(request: Request): string {
  const auth = request.headers.get('authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return request.headers.get('x-skynet-api-token') || '';
}

/**
 * 比對送來的權杖是否有效。
 * 空字串一律視為無效 —— 避免「未設定」被誤判為「比對成功」。
 * 順序：全域權杖優先，再比對端點專用權杖。
 */
function matchesAnyToken(
  supplied: string,
  configuredToken: string,
  extraTokens?: readonly string[],
): boolean {
  if (!supplied) return false;
  if (configuredToken && supplied === configuredToken) return true;
  return (extraTokens ?? []).some((token) => Boolean(token) && token === supplied);
}

function checkRateLimit(request: Request, options: Required<Pick<GuardOptions, 'windowMs' | 'maxRequests'>> & Pick<GuardOptions, 'endpoint'>) {
  const now = Date.now();
  const key = `${options.endpoint}:${requestIp(request)}`;
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return null;
  }
  current.count += 1;
  if (current.count > options.maxRequests) {
    return NextResponse.json(
      { error: 'rate_limited', retryAfterMs: Math.max(0, current.resetAt - now) },
      { status: 429 }
    );
  }
  return null;
}

export function guardMutation(request: Request, options: GuardOptions): NextResponse | null {
  const windowMs = options.windowMs ?? 60_000;
  const maxRequests = options.maxRequests ?? 24;
  const limited = checkRateLimit(request, { endpoint: options.endpoint, windowMs, maxRequests });
  if (limited) return limited;

  const configuredToken = process.env.SKYNET_DASHBOARD_API_TOKEN || process.env.SKYNET_API_WRITE_TOKEN || '';
  const suppliedToken = extractToken(request);
  if (matchesAnyToken(suppliedToken, configuredToken, options.extraTokens)) return null;

  const host = requestHost(request);
  const sameOrigin =
    sameHostUrl(request.headers.get('origin'), host) ||
    sameHostUrl(request.headers.get('referer'), host);

  if (sameOrigin && (!configuredToken || options.allowSameOrigin)) {
    return null;
  }

  return NextResponse.json(
    {
      error: 'forbidden_mutation',
      message: configuredToken
        ? 'Missing or invalid dashboard write token.'
        : 'Mutation requires a same-origin browser request or SKYNET_DASHBOARD_API_TOKEN.',
    },
    { status: 403 }
  );
}

export function sanitizeUpstreamError(status: number) {
  return { error: 'upstream_error', status };
}
