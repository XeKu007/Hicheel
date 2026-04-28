# Design Document — Stripe Billing

## Overview

This design adds Stripe-powered subscription billing to StockFlow. The system introduces three tiers (Starter, Pro, Enterprise), integrates Stripe Checkout for new subscriptions, Stripe Customer Portal for self-service management, and Stripe webhooks to keep the database in sync. Plan limits are enforced server-side in existing server actions, and upgrade prompts guide Starter-tier users toward paid plans when they hit those limits.

The implementation is intentionally thin on the client side: all Stripe interactions happen server-side (API routes and server actions), and the client only receives redirect URLs. This avoids exposing the Stripe secret key to the browser and keeps the surface area for security issues small.

---

## Architecture

```mermaid
flowchart TD
    subgraph Client
        A[Pricing Page] -->|POST /api/stripe/checkout| B
        C[Settings Page] -->|POST /api/stripe/portal| D
        E[Inventory / Members Page] -->|Server Action| F
    end

    subgraph API Routes
        B[/api/stripe/checkout] -->|stripe.checkout.sessions.create| S[Stripe API]
        D[/api/stripe/portal] -->|stripe.billingPortal.sessions.create| S
        G[/api/stripe/webhook] -->|stripe.webhooks.constructEvent| S
    end

    subgraph Server Actions
        F[products.ts / membership.ts] -->|checkPlanLimit| L[lib/billing.ts]
        L -->|prisma.organization.findUnique| DB[(PostgreSQL)]
    end

    subgraph Webhook Flow
        S -->|POST /api/stripe/webhook| G
        G -->|prisma.organization.update| DB
        G -->|invalidateCache| R[(Redis)]
    end

    subgraph Database
        DB
    end
```

**Key design decisions:**

- **No Stripe.js on the client.** Checkout and portal sessions are created server-side; the API routes return a redirect URL and the client navigates to it. This avoids loading the Stripe.js bundle on every page.
- **Webhook as source of truth.** The database is only updated via webhooks, not optimistically after checkout. This prevents race conditions between the checkout redirect and the webhook delivery.
- **Plan limits in server actions.** Enforcement happens at the action layer (not middleware) so the error message can be surfaced directly to the UI component that triggered the action.
- **Redis cache invalidation on plan change.** After any webhook updates an org's plan, all member OrgContext cache keys are deleted so the new plan is reflected immediately on the next request.

---

## Components and Interfaces

### `lib/billing.ts` — Plan Limits Utility

```typescript
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

/**
 * Returns the numeric resource limits for a given plan.
 * PRO and ENTERPRISE return Infinity for all resources.
 */
export function getPlanLimits(plan: Plan): PlanLimits

/**
 * Checks whether an organization is allowed to add one more of a given resource.
 * Reads the org's current plan from the database.
 */
export async function checkPlanLimit(
  organizationId: string,
  resource: "members" | "categories" | "products",
  currentCount: number
): Promise<LimitCheckResult>

/**
 * Returns a Stripe instance initialized from STRIPE_SECRET_KEY.
 * Throws a descriptive error if the env var is missing.
 */
export function getStripe(): Stripe

/**
 * Maps a Plan to the corresponding Stripe price ID from env vars.
 * Throws if the price ID env var is missing.
 */
export function getPriceId(plan: "PRO" | "ENTERPRISE"): string
```

### `/api/stripe/checkout` — POST

Accepts `{ plan: "PRO" | "ENTERPRISE" }` in the request body.

1. Calls `getOrgContext()` — returns 403 if role is not MANAGER or SUPER_ADMIN.
2. Creates or retrieves a Stripe customer using `stripeCustomerId` from the org record.
3. Creates a Stripe Checkout session with `mode: "subscription"`, the correct `price_id`, `metadata: { organizationId }`, `success_url: /dashboard?billing=success`, `cancel_url: /pricing?billing=cancelled`.
4. Returns `{ url: session.url }` — the client redirects to this URL.

### `/api/stripe/portal` — POST

1. Calls `getOrgContext()` — returns 403 if not MANAGER/SUPER_ADMIN.
2. Reads `stripeCustomerId` from the org. Returns 400 if null.
3. Creates a Stripe Billing Portal session with `return_url: /dashboard`.
4. Returns `{ url: session.url }`.

### `/api/stripe/webhook` — POST

Reads the raw request body (Next.js `request.text()`), verifies the Stripe signature using `STRIPE_WEBHOOK_SECRET`, then dispatches to event handlers:

| Event | Handler |
|---|---|
| `checkout.session.completed` | Update `stripeCustomerId`, `stripeSubscriptionId`, `stripeSubscriptionStatus`, `plan` |
| `customer.subscription.updated` | Update `plan`, `stripeSubscriptionStatus`, `planExpiresAt` |
| `customer.subscription.deleted` | Reset to `STARTER`, clear subscription fields |
| `invoice.payment_failed` | Set `stripeSubscriptionStatus = "past_due"` |
| `invoice.payment_succeeded` | Set `stripeSubscriptionStatus = "active"` |

After any plan-changing event, invalidates Redis OrgContext cache for all org members.

### `components/upgrade-prompt.tsx` — Client Component

```typescript
interface UpgradePromptProps {
  resource: "members" | "categories" | "products";
  current: number;
  limit: number;
  dismissible?: boolean; // defaults true
}
```

Renders a modal/banner with the specific limit reached, current usage vs. limit, and a CTA linking to `/pricing`. Uses `sessionStorage` to track dismissal state.

### `components/billing-status.tsx` — Server Component

Renders the billing section for the org settings page. Accepts the org's billing fields and renders:
- Plan badge (with "Free plan" for STARTER)
- Subscription status (with a `past_due` warning banner)
- Next billing date from `planExpiresAt`
- "Upgrade" CTA (STARTER) or "Manage billing" button (paid plans)

---

## Data Models

### Prisma Schema Changes

Add to the `Organization` model:

```prisma
enum Plan {
  STARTER
  PRO
  ENTERPRISE
}

model Organization {
  // ... existing fields ...

  plan                    Plan      @default(STARTER)
  stripeCustomerId        String?   @unique
  stripeSubscriptionId    String?
  stripeSubscriptionStatus String?
  planExpiresAt           DateTime?
}
```

**Field semantics:**

| Field | Type | Notes |
|---|---|---|
| `plan` | `Plan` enum | Current active plan. Updated by webhook only. |
| `stripeCustomerId` | `String?` | Unique — one Stripe customer per org. Set on first checkout. |
| `stripeSubscriptionId` | `String?` | Active subscription ID. Cleared on deletion. |
| `stripeSubscriptionStatus` | `String?` | Mirrors Stripe status: `active`, `past_due`, `cancelled`, etc. |
| `planExpiresAt` | `DateTime?` | `current_period_end` from Stripe. Used as next billing date display. |

### Plan Limits (Application Layer)

```typescript
const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  STARTER:    { members: 3,        categories: 5,        products: 100      },
  PRO:        { members: Infinity, categories: Infinity, products: Infinity },
  ENTERPRISE: { members: Infinity, categories: Infinity, products: Infinity },
};
```

### Stripe Price ID Mapping

```typescript
const PRICE_IDS: Record<"PRO" | "ENTERPRISE", string> = {
  PRO:        process.env.STRIPE_PRO_PRICE_ID!,
  ENTERPRISE: process.env.STRIPE_ENTERPRISE_PRICE_ID!,
};
```

### Subscription Status → Plan Mapping (Webhook)

When processing `checkout.session.completed`, the plan is derived from the Stripe price ID in the subscription line items:

```typescript
function planFromPriceId(priceId: string): Plan {
  if (priceId === process.env.STRIPE_PRO_PRICE_ID)        return "PRO";
  if (priceId === process.env.STRIPE_ENTERPRISE_PRICE_ID) return "ENTERPRISE";
  return "STARTER";
}
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Current plan indicator is shown for the matching plan card

*For any* plan value (`STARTER`, `PRO`, `ENTERPRISE`), when an authenticated Manager views the pricing page, exactly the plan card whose name matches the organization's current plan should display a "Current plan" indicator, and no other card should display it.

**Validates: Requirements 2.7**

---

### Property 2: Checkout session always carries the correct price ID

*For any* valid plan selection (`PRO` or `ENTERPRISE`), the Stripe Checkout session created by `/api/stripe/checkout` should use the price ID that corresponds to that plan as read from environment variables — never the price ID of the other plan.

**Validates: Requirements 3.2**

---

### Property 3: organizationId is always present in checkout session metadata

*For any* organization initiating a checkout, the Stripe Checkout session metadata must contain the exact `organizationId` of that organization so the webhook handler can correctly identify the organization on fulfillment.

**Validates: Requirements 3.3**

---

### Property 4: Non-Manager roles are always rejected from billing endpoints

*For any* caller whose role is `STAFF` (i.e., not `MANAGER` or `SUPER_ADMIN`), both `/api/stripe/checkout` and `/api/stripe/portal` must return a 403 response and must not create any Stripe session.

**Validates: Requirements 3.8, 4.5**

---

### Property 5: Invalid webhook signatures are always rejected with 400

*For any* incoming POST to `/api/stripe/webhook` where the Stripe signature header is absent, malformed, or does not match the signing secret, the handler must return a 400 response and must not process or persist any event data.

**Validates: Requirements 5.2**

---

### Property 6: checkout.session.completed correctly maps event data to org fields

*For any* valid `checkout.session.completed` event with any `organizationId` in metadata and any subscription data, after the webhook handler processes the event, the organization's `stripeCustomerId`, `stripeSubscriptionId`, `stripeSubscriptionStatus`, and `plan` fields must exactly reflect the values from the event.

**Validates: Requirements 5.3**

---

### Property 7: customer.subscription.updated correctly reflects new subscription state

*For any* valid `customer.subscription.updated` event for any organization, after processing, the organization's `plan`, `stripeSubscriptionStatus`, and `planExpiresAt` must exactly reflect the new subscription state from the event.

**Validates: Requirements 5.4**

---

### Property 8: payment_failed sets past_due without downgrading the plan

*For any* organization on any paid plan (`PRO` or `ENTERPRISE`), receiving an `invoice.payment_failed` webhook event must set `stripeSubscriptionStatus` to `"past_due"` while leaving the `plan` field unchanged.

**Validates: Requirements 5.6**

---

### Property 9: Webhook plan changes invalidate all member OrgContext cache keys

*For any* organization with any number of members, after a webhook event that changes the organization's plan is processed, the Redis OrgContext cache key for every member of that organization must be invalidated.

**Validates: Requirements 5.8**

---

### Property 10: STARTER plan limits are enforced for all resource types

*For any* `STARTER`-plan organization that is at or above the limit for any resource (`members`, `categories`, `products`), `checkPlanLimit` must return `{ allowed: false }` and the corresponding server action must reject the operation.

**Validates: Requirements 6.1, 6.2, 6.3, 6.4**

---

### Property 11: PRO and ENTERPRISE plans are never limit-blocked

*For any* `PRO` or `ENTERPRISE` organization with any resource count (including counts far exceeding STARTER limits), `checkPlanLimit` must always return `{ allowed: true }` for all resource types.

**Validates: Requirements 6.5**

---

### Property 12: getPlanLimits returns consistent limit values

*For any* plan value, `getPlanLimits` must return finite positive integers for `STARTER` and `Infinity` for `PRO` and `ENTERPRISE` for all three resource types, and the returned values must match the documented limits (3 members, 5 categories, 100 products for STARTER).

**Validates: Requirements 6.6**

---

### Property 13: checkPlanLimit result is internally consistent

*For any* organization and resource type, the result of `checkPlanLimit` must satisfy: `allowed === (current < limit)`, and `limit` must equal `getPlanLimits(org.plan)[resource]`.

**Validates: Requirements 6.7**

---

### Property 14: UpgradePrompt renders all required information for any limit scenario

*For any* combination of resource type (`members`, `categories`, `products`), current count, and limit value, the `UpgradePrompt` component must render the resource name, the current count, the limit, and a link to `/pricing`.

**Validates: Requirements 7.2**

---

### Property 15: Billing status section renders correctly for any org billing state

*For any* organization with any combination of `plan`, `stripeSubscriptionStatus`, and `planExpiresAt`, the billing status section on the settings page must render the plan name, subscription status, and next billing date (or "—" if null).

**Validates: Requirements 8.1**

---

## Error Handling

### Stripe API Errors

All Stripe API calls are wrapped in try/catch. On error:
- Log the error server-side with `console.error("[stripe/checkout]", err)`.
- Return a generic user-facing message: `"Payment service error. Please try again."` — never expose raw Stripe error messages or codes to the client.
- Do not expose `err.message` from Stripe errors in API responses.

### Webhook Processing Errors

- **Signature failure**: Return 400 immediately. Log the attempt.
- **Unknown event type**: Return 200 (Stripe expects 200 for unhandled events to stop retries).
- **Database error**: Return 500 so Stripe retries the event. Log the full error.
- **Missing `organizationId` in metadata**: Log a warning and return 200 (cannot recover; retrying won't help).

### Plan Limit Errors

Server actions return a structured error object:

```typescript
{
  error: "Member limit reached. Your Starter plan allows up to 3 members. Upgrade to Pro for unlimited members.",
  limitReached: true,
  resource: "members",
  current: 3,
  limit: 3,
}
```

The UI reads `limitReached: true` to render the `UpgradePrompt` component instead of a generic error toast.

### Missing Environment Variables

`getStripe()` and `getPriceId()` throw at call time if the required env var is absent:

```typescript
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error(
    "STRIPE_SECRET_KEY is not set. Add it to your environment variables."
  );
}
```

This surfaces the misconfiguration immediately during a request rather than producing a cryptic downstream error.

### Portal Without Customer

If a Manager requests a portal session but the org has no `stripeCustomerId`, the `/api/stripe/portal` route returns:

```json
{ "error": "No active subscription found. Start a subscription first." }
```

with a 400 status.

---

## Testing Strategy

### Unit Tests

Focus on pure functions and isolated logic:

- `getPlanLimits(plan)` — verify correct limits for each plan value.
- `checkPlanLimit(organizationId, resource, count)` — verify `allowed`, `limit`, `current` for all combinations of plan and resource.
- `planFromPriceId(priceId)` — verify correct plan mapping for known and unknown price IDs.
- `UpgradePrompt` component — verify rendered output contains resource name, counts, and `/pricing` link.
- `BillingStatus` component — verify rendered output for each plan/status combination.

### Property-Based Tests

Use [fast-check](https://github.com/dubzzz/fast-check) (TypeScript-native PBT library).

Each property test runs a minimum of 100 iterations.

Tag format: `// Feature: stripe-billing, Property N: <property text>`

**Property 10 — STARTER limit enforcement:**
Generate arbitrary resource counts at or above the STARTER limit for each resource type. Verify `checkPlanLimit` returns `allowed: false` for all of them.

**Property 11 — PRO/ENTERPRISE no limits:**
Generate arbitrary resource counts (including very large numbers). Verify `checkPlanLimit` always returns `allowed: true` for PRO and ENTERPRISE.

**Property 12 — getPlanLimits consistency:**
For each plan value, verify the returned limits match the documented constants and that PRO/ENTERPRISE return `Infinity`.

**Property 13 — checkPlanLimit internal consistency:**
Generate arbitrary (plan, resource, count) triples. Verify `allowed === (current < limit)` and `limit === getPlanLimits(plan)[resource]`.

**Property 4 — Non-Manager rejection:**
Generate arbitrary STAFF-role org contexts. Verify both billing endpoints return 403 without calling Stripe.

**Property 5 — Invalid signature rejection:**
Generate arbitrary request bodies with invalid/missing signatures. Verify the webhook handler returns 400 without touching the database.

**Property 6 — checkout.session.completed field mapping:**
Generate arbitrary checkout session event payloads with varying organizationIds and subscription data. Verify the org fields are updated to exactly match the event data.

**Property 8 — payment_failed preserves plan:**
Generate arbitrary orgs on PRO or ENTERPRISE. Send payment_failed events. Verify plan is unchanged and status is `past_due`.

**Property 9 — Cache invalidation completeness:**
Generate orgs with arbitrary numbers of members (1–20). Process a plan-changing webhook. Verify all member cache keys are deleted.

**Property 14 — UpgradePrompt rendering:**
Generate arbitrary (resource, current, limit) combinations. Verify the rendered component contains all required information.

**Property 15 — BillingStatus rendering:**
Generate arbitrary (plan, status, planExpiresAt) combinations. Verify the rendered section contains plan name, status, and date.

### Integration Tests

- `/api/stripe/checkout` — mock Stripe SDK, verify session creation parameters (price ID, metadata, URLs).
- `/api/stripe/portal` — mock Stripe SDK, verify portal session creation with correct customerId and return URL.
- Webhook handler end-to-end — use Stripe's test event fixtures, verify DB state after each event type.
- `approveMembershipRequest` with plan limit — verify rejection when org is at member limit.
- `createProduct` with plan limit — verify rejection when org is at product or category limit.

### Smoke Tests

- Verify all required env vars (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`, `STRIPE_ENTERPRISE_PRICE_ID`) are present in the test environment.
- Verify the Prisma schema has the new `Plan` enum and all new `Organization` fields.
