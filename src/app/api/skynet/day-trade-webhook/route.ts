import { NextResponse } from 'next/server';
import { guardMutation } from '@/lib/apiGuard';


export async function POST(request: Request) {
  const guard = guardMutation(request, { endpoint: 'skynet:day-trade-webhook', maxRequests: 60 });
  if (guard) return guard;

  try {
    await request.json();
    
    // In a real application, you might broadcast this to the frontend via WebSockets or save it
    // For now, we simulate receiving the high-frequency tick data
    
    return NextResponse.json({ success: true, message: 'Signal received successfully' });
  } catch (error) {
    console.error('[Day Trading Webhook] Error:', error);
    return NextResponse.json({ success: false, error: 'Invalid payload' }, { status: 400 });
  }
}
