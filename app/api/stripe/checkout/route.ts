import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServerClient } from '@supabase/ssr';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Do NOT pass apiVersion. Let the SDK use its bundled types.
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

function siteUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
}

function getSupabaseServer(req: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(_cookies) {
          // no-op
        },
      },
    }
  );
}

// Optional GET for quick deploy verification (OK text). Keep or remove.
export async function GET() {
  return new NextResponse('OK', { status: 200, headers: { Allow: 'GET, POST' } });
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseServer(req);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const priceId = typeof body?.priceId === 'string' ? body.priceId : '';
    if (!priceId) {
      return NextResponse.json({ error: 'missing_priceId' }, { status: 400 });
    }

    const { data: prof } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user.id)
      .single();

    let customerId = (prof?.stripe_customer_id as string) || null;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email || undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;

      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId!,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${siteUrl()}/dashboard?upgrade=success`,
      cancel_url: `${siteUrl()}/dashboard?upgrade=cancel`,
      metadata: { supabase_user_id: user.id },
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: 'checkout_failed', message }, { status: 500 });
  }
}
