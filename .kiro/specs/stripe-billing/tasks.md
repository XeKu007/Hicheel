# Implementation Plan: Stripe Billing

## Overview

Implement Stripe-powered subscription billing across the full stack: Prisma schema migration, a `lib/billing.ts` utility, three API routes (checkout, portal, webhook), plan limit enforcement in existing server actions, two new UI components, and updates to the settings and pricing pages. Property-based tests cover all 15 correctness properties from the design using fast-check.

## Tasks

- [x] 1. Prisma schema migration — Plan enum and Organization billing fields
  - Add `Plan` enum (`STARTER`, `PRO`, `ENTERPRISE`) to `prisma/schema.prisma`
  - Extend the `Organization` model with: `plan Plan @default(STARTER)`, `stripeCustomerId String? @unique`, `stripeSubscriptionId String?`, `stripeSubscriptionStatus String?`, `planExpiresAt DateTime?`
  - Run `prisma migrate dev --name add_billing_fields` to generate and apply the migration
  - Run `prisma generate` to update the Prisma client
  - _Requirements: 1.1, 1.2, 1.3_

- [-] 2. Implement `lib/billing.ts` — plan limits utility
  - [x] 2.1 Implement `getPlanLimits`, `checkPlanLimit`, `getStripe`, and `getPriceId`
    - Export `Plan` type and `PlanLimits` / `LimitCheckResult` interfaces
    - Define `PLAN_LIMITS` constant: `STARTER` → `{ members: 3, categories: 5, products: 100 }`, `PRO`/`ENTERPRISE` → all `Infinity`
    - Implement `getPlanLimits(plan: Plan): PlanLimits` — pure lookup, no I/O
    - Implement `checkPlanLimit(organizationId, resource, currentCount)` — reads org plan from DB via Prisma, returns `{ allowed, limit, current }`
    - Implement `getStripe()` — throws descriptive error if `STRIPE_SECRET_KEY` is missing, otherwise returns `new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" })`
    - Implement `getPriceId(plan: "PRO" | "ENTERPRISE")` — throws if env var is missing
    - _Requirements: 6.6, 6.7, 9.1, 9.3, 9.5_

  - [ ]* 2.2 Write property test — Property 12: `getPlanLimits` returns consistent limit values
    - **Property 12: getPlanLimits returns consistent limit values**
    - Use `fc.constantFrom("STARTER", "PRO", "ENTERPRISE")` as the plan arbitrary
    - Assert STARTER returns `{ members: 3, categories: 5, products: 100 }`
    - Assert PRO and ENTERPRISE return `Infinity` for all three resources
    - **Validates: Requirements 6.6**

  - [ ]* 2.3 Write property test — Property 13: `checkPlanLimit` result is internally consistent
    - **Property 13: checkPlanLimit result is internally consistent**
    - Generate arbitrary `(plan, resource, currentCount)` triples using fast-check
    - Mock Prisma to return an org with the generated plan
    - Assert `allowed === (current < limit)` and `limit === getPlanLimits(plan)[resource]`
    - **Validates: Requirements 6.7**

  - [ ]* 2.4 Write property test — Property 10: STARTER plan limits are enforced for all resource types
    - **Property 10: STARTER plan limits are enforced for all resource types**
    - Generate counts at or above each STARTER limit (members ≥ 3, categories ≥ 5, products ≥ 100)
    - Mock Prisma to return a STARTER org
    - Assert `checkPlanLimit` returns `{ allowed: false }` for all generated inputs
    - **Validates: Requirements 6.1, 6.2, 6.3, 6.4**

  - [ ]* 2.5 Write property test — Property 11: PRO and ENTERPRISE plans are never limit-blocked
    - **Property 11: PRO and ENTERPRISE plans are never limit-blocked**
    - Generate arbitrary large counts (including values far above STARTER limits) with `fc.nat({ max: 1_000_000 })`
    - Mock Prisma to return PRO and ENTERPRISE orgs
    - Assert `checkPlanLimit` always returns `{ allowed: true }` for all resource types
    - **Validates: Requirements 6.5**

- [x] 3. Implement `/api/stripe/checkout` route
  - Create `app/api/stripe/checkout/route.ts` as a POST handler
  - Call `getOrgContext()` and return 403 if role is not `MANAGER` or `SUPER_ADMIN`
  - Parse `{ plan: "PRO" | "ENTERPRISE" }` from the request body; return 400 on invalid input
  - Create or retrieve a Stripe customer using `stripeCustomerId` from the org record (upsert pattern: if `stripeCustomerId` exists use it, otherwise create and save)
  - Call `stripe.checkout.sessions.create` with `mode: "subscription"`, correct `price_id` from `getPriceId(plan)`, `metadata: { organizationId }`, `success_url: /dashboard?billing=success`, `cancel_url: /pricing?billing=cancelled`
  - Return `{ url: session.url }` on success; wrap Stripe errors and return a generic message
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.7, 3.8_

  - [ ]* 3.1 Write property test — Property 2: Checkout session always carries the correct price ID
    - **Property 2: Checkout session always carries the correct price ID**
    - Generate arbitrary `plan` values (`"PRO"` | `"ENTERPRISE"`) using `fc.constantFrom`
    - Mock Stripe SDK and Prisma; call the route handler
    - Assert the mocked `stripe.checkout.sessions.create` was called with the price ID matching `getPriceId(plan)` and never the other plan's price ID
    - **Validates: Requirements 3.2**

  - [ ]* 3.2 Write property test — Property 3: `organizationId` is always present in checkout session metadata
    - **Property 3: organizationId is always present in checkout session metadata**
    - Generate arbitrary `organizationId` strings using `fc.string({ minLength: 1 })`
    - Mock Prisma to return an org with the generated ID; mock Stripe
    - Assert `metadata.organizationId` in the Stripe call exactly equals the org's ID
    - **Validates: Requirements 3.3**

  - [ ]* 3.3 Write property test — Property 4: Non-Manager roles are always rejected from billing endpoints
    - **Property 4: Non-Manager roles are always rejected from billing endpoints**
    - Generate arbitrary STAFF-role org contexts using `fc.record`
    - Mock `getOrgContext()` to return the generated context
    - Assert both `/api/stripe/checkout` and `/api/stripe/portal` return 403 and that `stripe.checkout.sessions.create` / `stripe.billingPortal.sessions.create` are never called
    - **Validates: Requirements 3.8, 4.5**

- [x] 4. Implement `/api/stripe/portal` route
  - Create `app/api/stripe/portal/route.ts` as a POST handler
  - Call `getOrgContext()` and return 403 if role is not `MANAGER` or `SUPER_ADMIN`
  - Read `stripeCustomerId` from the org; return `{ error: "No active subscription found. Start a subscription first." }` with 400 if null
  - Call `stripe.billingPortal.sessions.create` with `customer: stripeCustomerId`, `return_url: /dashboard`
  - Return `{ url: session.url }` on success; wrap Stripe errors
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 5. Implement `/api/stripe/webhook` route — all 5 event types
  - [x] 5.1 Create webhook route with signature verification
    - Create `app/api/stripe/webhook/route.ts`
    - Export `export const config = { api: { bodyParser: false } }` (or equivalent Next.js raw body config)
    - Read raw body via `request.text()`; verify with `stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)`
    - Return 400 on signature failure; log the attempt
    - _Requirements: 5.1, 5.2, 9.2_

  - [x] 5.2 Handle `checkout.session.completed`
    - Extract `organizationId` from `session.metadata`; log warning and return 200 if missing
    - Expand the subscription to get line items and derive `plan` via `planFromPriceId(priceId)`
    - Update org: `stripeCustomerId`, `stripeSubscriptionId`, `stripeSubscriptionStatus`, `plan`
    - Invalidate Redis OrgContext cache for all org members
    - _Requirements: 5.3, 5.8_

  - [x] 5.3 Handle `customer.subscription.updated`
    - Look up org by `stripeSubscriptionId`
    - Update org: `plan`, `stripeSubscriptionStatus`, `planExpiresAt` (from `current_period_end`)
    - Invalidate Redis OrgContext cache for all org members
    - _Requirements: 5.4, 5.8_

  - [x] 5.4 Handle `customer.subscription.deleted`
    - Look up org by `stripeSubscriptionId`
    - Reset: `plan = STARTER`, `stripeSubscriptionId = null`, `stripeSubscriptionStatus = "cancelled"`, `planExpiresAt = null`
    - Invalidate Redis OrgContext cache for all org members
    - _Requirements: 5.5, 5.8_

  - [x] 5.5 Handle `invoice.payment_failed` and `invoice.payment_succeeded`
    - For `payment_failed`: look up org by `stripeSubscriptionId`; set `stripeSubscriptionStatus = "past_due"` without changing `plan`
    - For `payment_succeeded`: look up org by `stripeSubscriptionId`; set `stripeSubscriptionStatus = "active"`
    - Return 200 for unknown event types; return 500 on DB errors so Stripe retries
    - _Requirements: 5.6, 5.7, 5.9, 5.10_

  - [ ]* 5.6 Write property test — Property 5: Invalid webhook signatures are always rejected with 400
    - **Property 5: Invalid webhook signatures are always rejected with 400**
    - Generate arbitrary request bodies and invalid/missing signature headers using `fc.string()`
    - Assert the handler returns 400 and that no Prisma write methods are called
    - **Validates: Requirements 5.2**

  - [ ]* 5.7 Write property test — Property 6: `checkout.session.completed` correctly maps event data to org fields
    - **Property 6: checkout.session.completed correctly maps event data to org fields**
    - Generate arbitrary checkout session event payloads (varying `organizationId`, `customerId`, `subscriptionId`, `status`) using `fc.record`
    - Mock Prisma; process the event through the handler
    - Assert the Prisma `update` call receives exactly the values from the event
    - **Validates: Requirements 5.3**

  - [ ]* 5.8 Write property test — Property 7: `customer.subscription.updated` correctly reflects new subscription state
    - **Property 7: customer.subscription.updated correctly reflects new subscription state**
    - Generate arbitrary subscription update payloads with varying plan, status, and `current_period_end` values
    - Assert the org fields after processing exactly match the event data
    - **Validates: Requirements 5.4**

  - [ ]* 5.9 Write property test — Property 8: `payment_failed` sets `past_due` without downgrading the plan
    - **Property 8: payment_failed sets past_due without downgrading the plan**
    - Generate arbitrary orgs on `PRO` or `ENTERPRISE` using `fc.constantFrom("PRO", "ENTERPRISE")`
    - Send `invoice.payment_failed` events through the handler
    - Assert `stripeSubscriptionStatus === "past_due"` and `plan` is unchanged
    - **Validates: Requirements 5.6**

  - [ ]* 5.10 Write property test — Property 9: Webhook plan changes invalidate all member OrgContext cache keys
    - **Property 9: Webhook plan changes invalidate all member OrgContext cache keys**
    - Generate orgs with 1–20 members using `fc.array(fc.record(...), { minLength: 1, maxLength: 20 })`
    - Mock Redis `invalidateCache`; process a plan-changing webhook event
    - Assert every member's OrgContext cache key appears in the invalidation call
    - **Validates: Requirements 5.8**

- [ ] 6. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [-] 7. Plan limit enforcement in `lib/actions/products.ts`
  - [x] 7.1 Enforce product count limit in `createProduct`
    - Before the `prisma.product.create` call, count existing products for the org
    - Call `checkPlanLimit(organizationId, "products", count)`
    - If `!allowed`, return a structured error: `{ error: "...", limitReached: true, resource: "products", current, limit }`
    - Do not redirect; return the error object so the UI can render `UpgradePrompt`
    - _Requirements: 6.1, 6.3_

  - [x] 7.2 Enforce category count limit in `createProduct`
    - If the submitted `category` value is non-empty and not already present in the org's distinct categories, count distinct categories
    - Call `checkPlanLimit(organizationId, "categories", distinctCategoryCount)`
    - If `!allowed`, return a structured error with `resource: "categories"`
    - _Requirements: 6.1, 6.4_

- [ ] 8. Plan limit enforcement in `lib/actions/membership.ts`
  - [x] 8.1 Enforce member count limit in `approveMembershipRequest` for ADD actions
    - Before the `$transaction` block, count current active members for the org
    - Call `checkPlanLimit(organizationId, "members", memberCount)`
    - If `!allowed`, return `{ error: "...", limitReached: true, resource: "members", current, limit }` without executing the transaction
    - _Requirements: 6.1, 6.2_

- [x] 9. Implement `components/upgrade-prompt.tsx` — client component
  - Create `components/upgrade-prompt.tsx` as a `"use client"` component
  - Accept props: `resource: "members" | "categories" | "products"`, `current: number`, `limit: number`, `dismissible?: boolean` (default `true`)
  - Render a modal/banner showing: the specific resource name, current usage vs. limit, and a CTA `<Link href="/pricing">Upgrade plan</Link>`
  - Use `sessionStorage` to persist dismissal state keyed by `resource`; hide the prompt if dismissed
  - _Requirements: 7.1, 7.2, 7.5_

  - [ ]* 9.1 Write property test — Property 14: `UpgradePrompt` renders all required information for any limit scenario
    - **Property 14: UpgradePrompt renders all required information for any limit scenario**
    - Generate arbitrary `(resource, current, limit)` combinations using `fc.record` and `fc.nat()`
    - Render the component with `@testing-library/react`
    - Assert the rendered output contains the resource name, current count, limit, and a link to `/pricing`
    - **Validates: Requirements 7.2**

- [x] 10. Implement `components/billing-status.tsx` — server component
  - Create `components/billing-status.tsx` as a server component (no `"use client"` directive)
  - Accept props: `plan: Plan`, `stripeSubscriptionStatus: string | null`, `planExpiresAt: Date | null`, `isManager: boolean`
  - Render: plan badge (`"Free plan"` for STARTER, plan name for others), subscription status, next billing date from `planExpiresAt` (or `"—"` if null)
  - Show a `past_due` warning banner when `stripeSubscriptionStatus === "past_due"`
  - Show "Upgrade" CTA (links to `/pricing`) for STARTER; show "Manage billing" button (POSTs to `/api/stripe/portal`) for paid plans
  - Disable CTAs and show tooltip for non-Manager viewers
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ]* 10.1 Write property test — Property 15: Billing status section renders correctly for any org billing state
    - **Property 15: Billing status section renders correctly for any org billing state**
    - Generate arbitrary `(plan, stripeSubscriptionStatus, planExpiresAt)` combinations using `fc.record` and `fc.option(fc.date())`
    - Render the component with `@testing-library/react`
    - Assert the rendered output contains the plan name, subscription status, and either the formatted date or `"—"`
    - **Validates: Requirements 8.1**

- [x] 11. Update `app/org/settings/page.tsx` — add billing section
  - Import and render `<BillingStatus>` component after the "Organization Info" card and before the "Danger Zone" card
  - Pass `plan`, `stripeSubscriptionStatus`, `planExpiresAt` from the org record, and `isManager: true` (page already requires MANAGER role)
  - Wrap in a `<div className="card">` with the same styling as existing cards
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 12. Update `app/page.tsx` — pricing section and plan-aware CTAs
  - [x] 12.1 Fix Enterprise price to `$100/mo`
    - Change the Enterprise plan price from `"Custom"` to `"$100"` with `period: "/mo"` in the pricing data array
    - Update the CTA from `"Contact us"` to `"Get started"` for Enterprise
    - _Requirements: 2.1_

  - [x] 12.2 Add plan-aware CTAs for authenticated users
    - Convert `app/page.tsx` to an async server component
    - Call `getOrgContext()` wrapped in a try/catch (unauthenticated visitors will throw; catch and treat as `null`)
    - For unauthenticated visitors: Pro and Enterprise CTAs link to `/sign-up?plan=pro` and `/sign-up?plan=enterprise` respectively; Starter CTA links to `/sign-up`
    - For authenticated Managers on STARTER: Pro and Enterprise CTAs POST to `/api/stripe/checkout` with the appropriate plan
    - For authenticated Managers whose plan matches a card: show "Current plan" indicator and a "Manage billing" button that POSTs to `/api/stripe/portal`
    - For authenticated non-Managers: show plan info but disable checkout/portal CTAs with a tooltip
    - _Requirements: 2.5, 2.6, 2.7, 2.8_

  - [ ]* 12.3 Write property test — Property 1: Current plan indicator is shown for the matching plan card
    - **Property 1: Current plan indicator is shown for the matching plan card**
    - Generate arbitrary `plan` values using `fc.constantFrom("STARTER", "PRO", "ENTERPRISE")`
    - Render the pricing section with a mocked authenticated Manager context for each plan
    - Assert exactly one card shows the "Current plan" indicator and it matches the org's plan
    - **Validates: Requirements 2.7**

- [x] 13. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties using fast-check (minimum 100 iterations each)
- Unit tests validate specific examples and edge cases
- The webhook route requires `export const config = { api: { bodyParser: false } }` or the Next.js equivalent to receive raw bodies for Stripe signature verification
- All Stripe API calls must be server-side only; never expose `STRIPE_SECRET_KEY` to the client
- Plan changes are only written via webhooks — never optimistically after checkout — to prevent race conditions
- After any webhook updates an org's plan, invalidate Redis OrgContext cache for all org members so the new plan is reflected on the next request
