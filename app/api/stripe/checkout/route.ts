import { NextRequest, NextResponse } from "next/server";
import { getOrgContext } from "@/lib/org";
import { prisma } from "@/lib/prisma";
import { getStripe, getPriceId } from "@/lib/billing";
import { rateLimit } from "@/lib/rate-limit";
import { z } from "zod";

const BodySchema = z.object({
  plan: z.enum(["PRO", "ENTERPRISE"]),
});

export async function POST(request: NextRequest) {
  // 5 checkout attempts/min per IP — Stripe calls are expensive
  const limited = await rateLimit(request, { limit: 5, window: 60, identifier: "stripe:checkout" });
  if (limited) return limited;

  // Stripe not configured — return informative error
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PRO_PRICE_ID) {
    return NextResponse.json(
      { error: "Billing is not yet available. Please contact us to upgrade your plan." },
      { status: 503 }
    );
  }

  try {
    const ctx = await getOrgContext();

    if (ctx.role !== "MANAGER" && ctx.role !== "SUPER_ADMIN") {
      return NextResponse.json(
        { error: "Only Managers can manage billing." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid plan selection." }, { status: 400 });
    }

    const { plan } = parsed.data;
    const stripe = getStripe();

    // Get or create Stripe customer
    const org = await prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { stripeCustomerId: true, name: true },
    });

    let customerId = org?.stripeCustomerId ?? null;

    if (!customerId) {
      const customer = await stripe.customers.create({
        name: org?.name ?? ctx.organizationId,
        email: ctx.userEmail ?? undefined,
        metadata: { organizationId: ctx.organizationId },
      });
      customerId = customer.id;

      await prisma.organization.update({
        where: { id: ctx.organizationId },
        data: { stripeCustomerId: customerId },
      });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: getPriceId(plan), quantity: 1 }],
      metadata: { organizationId: ctx.organizationId },
      success_url: `${baseUrl}/dashboard?billing=success`,
      cancel_url:  `${baseUrl}/pricing?billing=cancelled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[stripe/checkout]", err);
    return NextResponse.json(
      { error: "Payment service error. Please try again." },
      { status: 500 }
    );
  }
}
