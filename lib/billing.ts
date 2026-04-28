import Stripe from "stripe";

// ─── Types ────────────────────────────────────────────────────────────────────

export type Plan = "STARTER" | "PRO" | "ENTERPRISE";

export interface PlanLimits {
  members: number;    // Infinity for unlimited
  categories: number; // Infinity for unlimited
  products: number;   // Infinity for unlimited
}

export interface LimitCheckResult {
  allowed: boolean;
  limit: number;
  current: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  STARTER:    { members: 3,        categories: 5,        products: 100      },
  PRO:        { members: Infinity, categories: Infinity, products: Infinity },
  ENTERPRISE: { members: Infinity, categories: Infinity, products: Infinity },
};

// ─── Plan utilities ───────────────────────────────────────────────────────────

/**
 * Returns the numeric resource limits for a given plan.
 * PRO and ENTERPRISE return Infinity for all resources.
 */
export function getPlanLimits(plan: Plan): PlanLimits {
  // Explicit switch avoids dynamic key access (security/detect-object-injection)
  switch (plan) {
    case "PRO":        return PLAN_LIMITS.PRO;
    case "ENTERPRISE": return PLAN_LIMITS.ENTERPRISE;
    default:           return PLAN_LIMITS.STARTER;
  }
}

/**
 * Checks whether an organization is allowed to add one more of a given resource.
 * Reads the org's current plan from the database.
 */
export async function checkPlanLimit(
  organizationId: string,
  resource: "members" | "categories" | "products",
  currentCount: number
): Promise<LimitCheckResult> {
  const { prisma } = await import("@/lib/prisma");

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { plan: true },
  });

  const plan = (org?.plan ?? "STARTER") as Plan;
  const limits = getPlanLimits(plan);
  // Explicit switch avoids dynamic key access
  const limit = resource === "members"
    ? limits.members
    : resource === "categories"
      ? limits.categories
      : limits.products;

  return {
    allowed: currentCount < limit,
    limit: limit === Infinity ? Infinity : limit,
    current: currentCount,
  };
}

// ─── Stripe utilities ─────────────────────────────────────────────────────────

let _stripe: Stripe | null = null;

/**
 * Returns a Stripe instance initialized from STRIPE_SECRET_KEY.
 * Throws a descriptive error if the env var is missing.
 */
export function getStripe(): Stripe {
  if (_stripe) return _stripe;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add it to your environment variables."
    );
  }

  _stripe = new Stripe(key, { apiVersion: "2026-04-22.dahlia" });
  return _stripe;
}

/**
 * Maps a Plan to the corresponding Stripe price ID from env vars.
 * Throws if the price ID env var is missing.
 */
export function getPriceId(plan: "PRO" | "ENTERPRISE"): string {
  if (plan === "PRO") {
    const id = process.env.STRIPE_PRO_PRICE_ID;
    if (!id) throw new Error("STRIPE_PRO_PRICE_ID is not set.");
    return id;
  }
  const id = process.env.STRIPE_ENTERPRISE_PRICE_ID;
  if (!id) throw new Error("STRIPE_ENTERPRISE_PRICE_ID is not set.");
  return id;
}

/**
 * Maps a Stripe price ID back to a Plan.
 */
export function planFromPriceId(priceId: string): Plan {
  if (priceId === process.env.STRIPE_PRO_PRICE_ID)        return "PRO";
  if (priceId === process.env.STRIPE_ENTERPRISE_PRICE_ID) return "ENTERPRISE";
  return "STARTER";
}

// ─── Limit error builder ──────────────────────────────────────────────────────

const RESOURCE_LABELS: Record<string, string> = {
  members:    "team members",
  categories: "inventory categories",
  products:   "products",
};

const RESOURCE_UPGRADE_HINTS: Record<string, string> = {
  members:    "Upgrade to Pro for unlimited team members.",
  categories: "Upgrade to Pro for unlimited categories.",
  products:   "Upgrade to Pro for unlimited products.",
};

export function buildLimitError(
  resource: "members" | "categories" | "products",
  current: number,
  limit: number
) {
  // Explicit lookup to avoid dynamic key access
  const label = resource === "members"
    ? RESOURCE_LABELS.members
    : resource === "categories"
      ? RESOURCE_LABELS.categories
      : RESOURCE_LABELS.products;
  const hint = resource === "members"
    ? RESOURCE_UPGRADE_HINTS.members
    : resource === "categories"
      ? RESOURCE_UPGRADE_HINTS.categories
      : RESOURCE_UPGRADE_HINTS.products;
  return {
    error: `${label.charAt(0).toUpperCase() + label.slice(1)} limit reached. Your Starter plan allows up to ${limit} ${label}. ${hint}`,
    limitReached: true as const,
    resource,
    current,
    limit,
  };
}
