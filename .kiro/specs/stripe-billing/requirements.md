# Requirements Document

## Introduction

This feature adds Stripe-powered subscription billing to StockFlow. It introduces three pricing tiers (Starter, Pro, Enterprise), integrates Stripe Checkout for new subscriptions, Stripe Customer Portal for self-service billing management, and Stripe webhooks to keep the database in sync with subscription state. Plan limits are enforced at the application layer so Starter-tier organizations cannot exceed their resource quotas, and upgrade prompts guide users toward paid plans when they hit those limits.

## Glossary

- **Billing_System**: The StockFlow subsystem responsible for managing subscription plans, Stripe integration, and plan limit enforcement.
- **Organization**: A multi-tenant workspace in StockFlow, identified by `organizationId`, as defined in the Prisma `Organization` model.
- **Plan**: A subscription tier — one of `STARTER`, `PRO`, or `ENTERPRISE`.
- **Stripe_Checkout**: The Stripe-hosted payment page used to collect payment details and create a new subscription.
- **Stripe_Customer_Portal**: The Stripe-hosted self-service portal where subscribers can upgrade, downgrade, cancel, or update payment methods.
- **Stripe_Webhook**: An HTTP POST event sent by Stripe to notify StockFlow of subscription lifecycle changes.
- **Subscription**: A Stripe subscription record linked to an Organization, tracking plan, status, and billing period.
- **Plan_Limit**: A hard cap on a resource (members, categories, products) enforced for Starter-tier organizations.
- **Upgrade_Prompt**: A UI element shown when a Starter-tier user attempts an action that exceeds their Plan_Limit.
- **Manager**: An Organization member with the `MANAGER` role, as defined in the `Role` enum.
- **OrgContext**: The result of `getOrgContext()`, providing `organizationId`, `memberId`, `role`, and related fields.
- **Webhook_Handler**: The Next.js API route that receives and processes Stripe_Webhook events.
- **Billing_Portal_Session**: A short-lived Stripe session URL that redirects the user to the Stripe_Customer_Portal.

---

## Requirements

### Requirement 1: Subscription Data Model

**User Story:** As a developer, I want subscription state stored in the database, so that the application can enforce plan limits and display billing status without calling Stripe on every request.

#### Acceptance Criteria

1. THE `Organization` model SHALL be extended with the following fields: `plan` (enum: `STARTER`, `PRO`, `ENTERPRISE`, default `STARTER`), `stripeCustomerId` (nullable string), `stripeSubscriptionId` (nullable string), `stripeSubscriptionStatus` (nullable string), and `planExpiresAt` (nullable DateTime).
2. THE Billing_System SHALL store `stripeCustomerId` as a unique, nullable field on `Organization` to prevent duplicate Stripe customer records per organization.
3. WHEN a new Organization is created, THE Billing_System SHALL default its `plan` to `STARTER` and leave all Stripe fields as null.

---

### Requirement 2: Pricing Page — Plan Display and CTA

**User Story:** As a visitor or authenticated user, I want to see accurate plan details and actionable CTAs on the pricing page, so that I can choose the right plan and start a checkout or manage my subscription.

#### Acceptance Criteria

1. THE Billing_System SHALL display three plans on the pricing page: Starter (Free), Pro ($29/mo), and Enterprise ($100/mo).
2. THE Billing_System SHALL list the following features for the Starter plan: up to 3 members, 5 categories, 100 products, basic alerts, CSV export, 7-day activity log.
3. THE Billing_System SHALL list the following features for the Pro plan: unlimited members, unlimited products, advanced alerts and anomaly detection, multi-currency, daily digest, audit trail (90 days), gallery view, priority support.
4. THE Billing_System SHALL list the following features for the Enterprise plan: everything in Pro, Prometheus/Grafana monitoring, SSO/SAML, custom integrations, SLA guarantee, dedicated support, on-premise option.
5. WHEN an unauthenticated visitor clicks the Pro or Enterprise CTA, THE Billing_System SHALL redirect the visitor to the sign-up page with a `?plan=pro` or `?plan=enterprise` query parameter so the intended plan is preserved.
6. WHEN an authenticated Manager views the pricing page and their Organization's `plan` is `STARTER`, THE Billing_System SHALL display an active "Upgrade" CTA for Pro and Enterprise plans.
7. WHEN an authenticated Manager views the pricing page and their Organization's `plan` matches a displayed plan, THE Billing_System SHALL display a "Current plan" indicator on that plan card and a "Manage billing" CTA in place of the upgrade button.
8. WHEN an authenticated non-Manager member views the pricing page, THE Billing_System SHALL display plan information but SHALL disable checkout and portal CTAs with a tooltip indicating that only Managers can manage billing.

---

### Requirement 3: Stripe Checkout — Subscription Creation

**User Story:** As a Manager, I want to start a Stripe Checkout session for Pro or Enterprise, so that my organization can subscribe to a paid plan.

#### Acceptance Criteria

1. WHEN a Manager initiates checkout for Pro or Enterprise, THE Billing_System SHALL create or retrieve a Stripe customer record associated with the Organization's `stripeCustomerId`.
2. WHEN a Manager initiates checkout for Pro or Enterprise, THE Billing_System SHALL create a Stripe Checkout session in `subscription` mode with the correct price ID for the selected plan.
3. THE Billing_System SHALL attach `organizationId` as metadata on the Stripe Checkout session so the Webhook_Handler can identify the Organization on fulfillment.
4. WHEN a Stripe Checkout session is created successfully, THE Billing_System SHALL redirect the Manager to the Stripe-hosted checkout URL.
5. WHEN a Stripe Checkout session completes successfully, THE Billing_System SHALL redirect the Manager to `/dashboard?billing=success`.
6. WHEN a Manager cancels the Stripe Checkout flow, THE Billing_System SHALL redirect the Manager to `/pricing?billing=cancelled`.
7. IF the Stripe API returns an error during session creation, THEN THE Billing_System SHALL return a descriptive error message to the Manager without exposing raw Stripe error details.
8. WHEN a Manager initiates checkout, THE Billing_System SHALL verify the Manager's role via `getOrgContext()` and SHALL reject the request with a 403 status if the caller is not a Manager.

---

### Requirement 4: Stripe Customer Portal — Billing Management

**User Story:** As a Manager on a paid plan, I want to access the Stripe Customer Portal, so that I can upgrade, downgrade, cancel, or update my payment method without contacting support.

#### Acceptance Criteria

1. WHEN a Manager requests a billing portal session, THE Billing_System SHALL create a Stripe Billing Portal session using the Organization's `stripeCustomerId`.
2. WHEN a Billing_Portal_Session is created successfully, THE Billing_System SHALL redirect the Manager to the Stripe-hosted portal URL.
3. THE Billing_System SHALL set the portal return URL to `/dashboard` so the Manager is returned to the app after completing portal actions.
4. IF the Organization has no `stripeCustomerId`, THEN THE Billing_System SHALL return an error indicating that no active subscription exists and SHALL not attempt to create a portal session.
5. WHEN a Manager requests a billing portal session, THE Billing_System SHALL verify the Manager's role via `getOrgContext()` and SHALL reject the request with a 403 status if the caller is not a Manager.

---

### Requirement 5: Stripe Webhooks — Subscription Sync

**User Story:** As a developer, I want Stripe webhook events to update the database, so that the Organization's plan and subscription status always reflect the current Stripe state.

#### Acceptance Criteria

1. THE Webhook_Handler SHALL expose a POST endpoint at `/api/stripe/webhook` that accepts raw request bodies for Stripe signature verification.
2. THE Webhook_Handler SHALL verify every incoming request using the Stripe webhook signing secret and SHALL reject requests with invalid signatures with a 400 status.
3. WHEN the Webhook_Handler receives a `checkout.session.completed` event, THE Billing_System SHALL update the Organization's `stripeCustomerId`, `stripeSubscriptionId`, `stripeSubscriptionStatus`, and `plan` fields based on the session metadata and subscription data.
4. WHEN the Webhook_Handler receives a `customer.subscription.updated` event, THE Billing_System SHALL update the Organization's `plan`, `stripeSubscriptionStatus`, and `planExpiresAt` fields to reflect the new subscription state.
5. WHEN the Webhook_Handler receives a `customer.subscription.deleted` event, THE Billing_System SHALL set the Organization's `plan` to `STARTER`, clear `stripeSubscriptionId`, set `stripeSubscriptionStatus` to `cancelled`, and set `planExpiresAt` to null.
6. WHEN the Webhook_Handler receives an `invoice.payment_failed` event, THE Billing_System SHALL set the Organization's `stripeSubscriptionStatus` to `past_due` without downgrading the plan immediately.
7. WHEN the Webhook_Handler receives an `invoice.payment_succeeded` event for a subscription renewal, THE Billing_System SHALL set the Organization's `stripeSubscriptionStatus` to `active`.
8. AFTER the Billing_System updates an Organization's plan via webhook, THE Billing_System SHALL invalidate the Redis OrgContext cache for all members of that Organization so plan changes take effect immediately.
9. THE Webhook_Handler SHALL return a 200 status for all successfully processed events and a 400 status for signature verification failures.
10. IF the Webhook_Handler encounters a database error while processing an event, THEN THE Billing_System SHALL log the error and return a 500 status so Stripe retries the event.

---

### Requirement 6: Plan Limit Enforcement — Starter Tier

**User Story:** As a developer, I want Starter-tier organizations to be blocked from exceeding their resource limits, so that plan boundaries are respected and paid plans have clear value.

#### Acceptance Criteria

1. THE Billing_System SHALL enforce the following limits for `STARTER` plan organizations: maximum 3 members, maximum 5 distinct product categories, maximum 100 products.
2. WHEN a Manager attempts to invite a member and the Organization's active member count is 3 or more and the Organization's `plan` is `STARTER`, THE Billing_System SHALL reject the invitation with an error message indicating the member limit and referencing the upgrade path.
3. WHEN a Manager or Staff member attempts to create a product and the Organization's total product count is 100 or more and the Organization's `plan` is `STARTER`, THE Billing_System SHALL reject the creation with an error message indicating the product limit and referencing the upgrade path.
4. WHEN a Manager or Staff member attempts to create a product with a new category and the Organization's distinct category count is 5 or more and the Organization's `plan` is `STARTER`, THE Billing_System SHALL reject the creation with an error message indicating the category limit and referencing the upgrade path.
5. WHILE an Organization's `plan` is `PRO` or `ENTERPRISE`, THE Billing_System SHALL not enforce member, category, or product count limits.
6. THE Billing_System SHALL expose a `getPlanLimits(plan: Plan)` utility that returns the numeric limits for members, categories, and products for a given plan, returning `Infinity` for unlimited plans.
7. THE Billing_System SHALL expose a `checkPlanLimit(organizationId, resource, currentCount)` function that returns `{ allowed: boolean, limit: number, current: number }` for use in server actions and API routes.

---

### Requirement 7: Upgrade Prompts — In-App Limit UI

**User Story:** As a Starter-tier user who hits a plan limit, I want to see a clear upgrade prompt, so that I understand why my action was blocked and how to unlock more capacity.

#### Acceptance Criteria

1. WHEN a Starter-tier user's action is rejected due to a Plan_Limit, THE Billing_System SHALL display an Upgrade_Prompt that identifies the specific limit reached (members, categories, or products).
2. THE Upgrade_Prompt SHALL include the current usage, the Starter limit, and a CTA that navigates to `/pricing`.
3. WHEN a Starter-tier organization's product count reaches 90 or more (within 10 of the 100-product limit), THE Billing_System SHALL display a non-blocking warning banner on the inventory page indicating the approaching limit.
4. WHEN a Starter-tier organization's member count reaches 3 (at the limit), THE Billing_System SHALL display a non-blocking warning banner on the members page indicating the limit has been reached.
5. THE Upgrade_Prompt SHALL be dismissible per session and SHALL not block navigation to other parts of the app.

---

### Requirement 8: Billing Status in App Settings

**User Story:** As a Manager, I want to see my organization's current plan and billing status in the app settings, so that I can understand my subscription and access billing management.

#### Acceptance Criteria

1. THE Billing_System SHALL display the Organization's current `plan`, `stripeSubscriptionStatus`, and next billing date (derived from `planExpiresAt`) on the organization settings page.
2. WHEN the Organization's `plan` is `STARTER`, THE Billing_System SHALL display a "Free plan" badge and an "Upgrade" CTA on the settings page.
3. WHEN the Organization's `stripeSubscriptionStatus` is `past_due`, THE Billing_System SHALL display a prominent warning banner on the settings page indicating that payment has failed and prompting the Manager to update their payment method via the Stripe Customer Portal.
4. WHEN a Manager clicks "Manage billing" on the settings page, THE Billing_System SHALL initiate a Billing_Portal_Session and redirect the Manager to the Stripe Customer Portal.
5. WHEN the Organization's `plan` is `PRO` or `ENTERPRISE`, THE Billing_System SHALL display the plan name, billing amount, and a "Manage billing" button that opens the Stripe Customer Portal.

---

### Requirement 9: Security and Configuration

**User Story:** As a developer, I want all Stripe credentials and price IDs managed via environment variables, so that secrets are never hardcoded and environments can be configured independently.

#### Acceptance Criteria

1. THE Billing_System SHALL read the Stripe secret key from the `STRIPE_SECRET_KEY` environment variable and SHALL not hardcode it anywhere in source code.
2. THE Billing_System SHALL read the Stripe webhook signing secret from the `STRIPE_WEBHOOK_SECRET` environment variable.
3. THE Billing_System SHALL read the Pro plan price ID from `STRIPE_PRO_PRICE_ID` and the Enterprise plan price ID from `STRIPE_ENTERPRISE_PRICE_ID`.
4. THE Billing_System SHALL read the Stripe publishable key from `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` for any client-side Stripe.js usage.
5. IF any required Stripe environment variable is missing at runtime, THEN THE Billing_System SHALL throw a descriptive configuration error at startup rather than failing silently during a user request.
