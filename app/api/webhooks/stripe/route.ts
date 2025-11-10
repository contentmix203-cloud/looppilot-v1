// app/api/webhooks/stripe/route.ts
// Verifies Stripe signature. Updates profiles.plan_tier and current_period_end.

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2024-09-30.acacia',
});

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

function mapPriceToTier(priceId: string): 'pro_weekly' | 'pro_monthly' | null {
  if (priceId === process.env.STRIPE_PRICE_ID_WEEKLY) return 'pro_weekly';
  if (priceId === process.env.STRIPE_PRICE_ID_MONTHLY) return 'pro_monthly';
  return null;
}

async function applySubscriptionToProfile(
  supabase: ReturnType<typeof adminSupabase>,
  sub: Stripe.Subscription
) {
  const customerId = typeof sub.customer === 'string' ? sub.customer : undefined;
  if (!customerId) return;

  const priceId = sub.items.data[0]?.price?.id || '';
  const tier = mapPriceToTier(priceId);
  const endISO = sub.current_period_end
    ? new Date(sub.current_period_end * 1000).toISOString()
    : null;

  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  if (!data?.id) return;

  const active = sub.status === 'active' || sub.status === 'trialing';
  const plan_tier = active ? (tier ?? 'pro_monthly') : 'free';

  await supabase
    .from('profiles')
    .update({ plan_tier, current_period_end: plan_tier === 'free' ? null : endISO })
    .eq('id', data.id);
}

export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature');
  if (!sig) return new NextResponse('missing_signature', { status: 400 });

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET as string
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new NextResponse(`invalid_signature: ${message}`, { status: 400 });
  }

  const supabase = adminSupabase();

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const sess = event.data.object as Stripe.Checkout.Session;
        if (typeof sess.subscription === 'string') {
          const sub = await stripe.subscriptions.retrieve(sess.subscription);
          await applySubscriptionToProfile(supabase, sub);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        await applySubscriptionToProfile(supabase, sub);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === 'string' ? sub.customer : undefined;
        if (customerId) {
          const { data } = await supabase
            .from('profiles')
            .select('id')
            .eq('stripe_customer_id', customerId)
            .maybeSingle();
          if (data?.id) {
            await supabase
              .from('profiles')
              .update({ plan_tier: 'free', current_period_end: null })
              .eq('id', data.id);
          }
        }
        break;
      }
      // ignore other events
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new NextResponse(`webhook_error: ${message}`, { status: 500 });
  }
}
