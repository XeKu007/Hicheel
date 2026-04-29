import { NextRequest, NextResponse } from "next/server";
import { getOrgContext } from "@/lib/org";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/billing";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  // 5 portal sessions/min per IP
  const limited = await rateLimit(request, { limit: 5, window: 60, identifier: "stripe:portal" });
  if (limited) return limited;

  // Stripe not configured
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Billing is not yet available. Please contact us to manage your subscription." },
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

    const org = await prisma.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { stripeCustomerId: true },
    });

    if (!org?.stripeCustomerId) {
      return NextResponse.json(
        { error: "No active subscription found. Start a subscription first." },
        { status: 400 }
      );
    }

    const stripe = getStripe();
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    const session = await stripe.billingPortal.sessions.create({
      customer: org.stripeCustomerId,
      return_url: `${baseUrl}/dashboard`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[stripe/portal]", err);
    return NextResponse.json(
      { error: "Payment service error. Please try again." },
      { status: 500 }
    );
  }
}