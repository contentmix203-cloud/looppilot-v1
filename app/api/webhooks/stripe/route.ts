// app/api/webhooks/stripe/route.ts
// Verifies Stripe signature and updates Supabase profiles on subscription events.

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Do not pass apiVersion. Let the SDK use its bundled types to avoid TS literal mismatches.
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string);

// Admin client: service role ONLY (never expose in client)
function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

function tierFromPrice(priceId: string): 'pro_weekly' | 'pro_monthly' | null {
  if (priceId === process.env.STRIPE_PRICE_ID_WEEKLY) return 'pro_weekly';
  if (priceId === process.env.STRIPE_PRICE_ID_MONTHLY) return 'pro_monthly';
  return null;
}

// Some Stripe SDK versions don’t expose current_period_end on the type.
// Use a narrow helper type to access it safely.
type SubWithPeriodEnd = Stripe.Subscription & { current_period_end?: number };

async function applySubscription(sub: Stripe.Subscription): Promise<void> {
  const supabase = adminSupabase();

  const customerId = typeof sub.customer === 'string' ? sub.customer : undefined;
  if (!customerId) return;

  const firstItem = sub.items.data[0];
  const priceId = firstItem?.price?.id || '';
  const derivedTier = tierFromPrice(priceId);

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();

  if (!profile?.id) return;

  const isActive = sub.status === 'active' || sub.status === 'trialing';

  const unix = (sub as SubWithPeriodEnd).current_period_end ?? null;
  const endISO = isActive && unix ? new Date(unix * 1000).toISOString() : null;

  const plan_tier = isActive ? (derivedTier ?? 'pro_monthly') : 'free';

  await supabase
    .from('profiles')
    .update({ plan_tier, current_period_end: endISO })
    .eq('id', profile.id);
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get('stripe-signature');
  if (!signature) return new NextResponse('missing_signature', { status: 400 });

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET as string
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new NextResponse(`invalid_signature: ${msg}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const sess = event.data.object as Stripe.Checkout.Session;
        if (typeof sess.subscription === 'string') {
          const sub = await stripe.subscriptions.retrieve(sess.subscription);
          await applySubscription(sub);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        await applySubscription(sub);
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const supabase = adminSupabase();
        const customerId = typeof sub.customer === 'string' ? sub.customer : undefined;
        if (!customerId) break;

        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .maybeSingle();

        if (profile?.id) {
          await supabase
            .from('profiles')
            .update({ plan_tier: 'free', current_period_end: null })
            .eq('id', profile.id);
        }
        break;
      }
      default:
        // Ignore other events
        break;
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new NextResponse(`webhook_error: ${msg}`, { status: 500 });
  }
}
