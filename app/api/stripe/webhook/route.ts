import { NextResponse } from "next/server";
import { getStripe, planFromPriceId } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/redis";
import type Stripe from "stripe";

// Next.js: disable body parsing so we can verify the raw Stripe signature
export const dynamic = "force-dynamic";

async function invalidateOrgMemberCaches(organizationId: string) {
  try {
    const members = await prisma.member.findMany({
      where: { organizationId },
      select: { userId: true },
    });
    const keys = members.map(m => `org:${m.userId}:context`);
    if (keys.length > 0) await invalidateCache(keys);
  } catch (err) {
    console.error("[stripe/webhook] cache invalidation failed:", err);
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const organizationId = session.metadata?.organizationId;
  if (!organizationId) {
    console.warn("[stripe/webhook] checkout.session.completed missing organizationId in metadata");
    return;
  }

  const stripe = getStripe();
  const subscription = await stripe.subscriptions.retrieve(session.subscription as string, {
    expand: ["items.data.price"],
  });

  const priceId = subscription.items.data[0]?.price?.id ?? "";
  const plan = planFromPriceId(priceId);

  await prisma.organization.update({
    where: { id: organizationId },
    data: {
      stripeCustomerId:         session.customer as string,
      stripeSubscriptionId:     subscription.id,
      stripeSubscriptionStatus: subscription.status,
      plan,
    },
  });

  await invalidateOrgMemberCaches(organizationId);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const org = await prisma.organization.findFirst({
    where: { stripeSubscriptionId: subscription.id },
    select: { id: true },
  });
  if (!org) return;

  const priceId = subscription.items.data[0]?.price?.id ?? "";
  const plan = planFromPriceId(priceId);

  const subAny = subscription as unknown as Record<string, unknown>;
  const periodEnd = subAny.current_period_end as number | undefined;

  await prisma.organization.update({
    where: { id: org.id },
    data: {
      plan,
      stripeSubscriptionStatus: subscription.status,
      planExpiresAt: periodEnd ? new Date(periodEnd * 1000) : null,
    },
  });

  await invalidateOrgMemberCaches(org.id);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const org = await prisma.organization.findFirst({
    where: { stripeSubscriptionId: subscription.id },
    select: { id: true },
  });
  if (!org) return;

  await prisma.organization.update({
    where: { id: org.id },
    data: {
      plan:                     "STARTER",
      stripeSubscriptionId:     null,
      stripeSubscriptionStatus: "cancelled",
      planExpiresAt:            null,
    },
  });

  await invalidateOrgMemberCaches(org.id);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const inv = invoice as unknown as Record<string, unknown>;
  const subscriptionId = typeof inv.subscription === "string"
    ? inv.subscription
    : (inv.subscription as Record<string, unknown> | null)?.id as string | undefined;
  if (!subscriptionId) return;

  const org = await prisma.organization.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
    select: { id: true },
  });
  if (!org) return;

  // Set past_due WITHOUT changing the plan
  await prisma.organization.update({
    where: { id: org.id },
    data: { stripeSubscriptionStatus: "past_due" },
  });
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const inv = invoice as unknown as Record<string, unknown>;
  const subscriptionId = typeof inv.subscription === "string"
    ? inv.subscription
    : (inv.subscription as Record<string, unknown> | null)?.id as string | undefined;
  if (!subscriptionId) return;

  const org = await prisma.organization.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
    select: { id: true },
  });
  if (!org) return;

  await prisma.organization.update({
    where: { id: org.id },
    data: { stripeSubscriptionStatus: "active" },
  });
}

export async function POST(request: Request) {
  const body = await request.text();
  const sig  = request.headers.get("stripe-signature") ?? "";
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    console.error("[stripe/webhook] STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    console.warn("[stripe/webhook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case "invoice.payment_failed":
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      case "invoice.payment_succeeded":
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
      default:
        // Unknown event — return 200 so Stripe stops retrying
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[stripe/webhook] DB error processing event:", event.type, err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
