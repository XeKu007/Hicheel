# Implementation Plan: Inventory Enhancements

## Overview

Implement three capabilities on top of the existing Next.js 15 / Prisma / Redis stack:
1. **Mongolian (MN) Localization** — locale files, currency formatter, per-member language preference, language switcher.
2. **Smart Stock Alerts** — low-stock and anomaly detection, alert bell, alert history page, dismiss actions.
3. **Gamification** — staff action tracking, points, leaderboard, badges.

All code is TypeScript. Implementation follows existing patterns: `getOrgContext()`, `getCached`/`invalidateCache`, Server Actions, org-scoped Prisma queries.

---

## Tasks

- [x] 1. Extend Prisma schema with new enums and models
  - Add `Locale`, `AlertType`, `AlertStatus`, `StaffActionType`, `BadgeType` enums to `prisma/schema.prisma`
  - Add `locale Locale @default(en)` field to the `Member` model
  - Add `staffActions StaffAction[]` and `badges Badge[]` relations to `Member`
  - Add `alerts Alert[]`, `staffActions StaffAction[]`, `badges Badge[]` relations to `Organization`
  - Add `Alert`, `StaffAction`, `Badge` models with all fields, indexes, and `onDelete: Cascade` foreign keys exactly as specified in the design
  - Run `npx prisma db push` to apply the schema changes
  - Run `npx prisma generate` to regenerate the Prisma client
  - _Requirements: 4.3, 5.2, 9.4, 12.3, 14.1, 14.4_

- [x] 2. Implement i18n locale files and helpers
  - [x] 2.1 Create `lib/i18n/en.ts` with all translation keys (nav, alerts, leaderboard, badges, currency, and any additional UI strings needed by pages)
    - Export `en` as a `const` object and export `TranslationKeys` type derived from it
    - _Requirements: 1.2, 1.3, 1.8_

  - [x] 2.2 Create `lib/i18n/mn.ts` mirroring the exact shape of `en` with Mongolian strings
    - Must satisfy `mn: TranslationKeys` — TypeScript will enforce completeness
    - _Requirements: 1.1, 1.2, 1.8_

  - [ ]* 2.3 Write property test for translation completeness (Property 1)
    - **Property 1: Translation completeness**
    - For every key in `en` and every locale in `["en", "mn"]`, `getTranslations(locale)[key]` must be a non-empty string
    - Use `fc.constantFrom(...Object.keys(en))` and `fc.constantFrom("en", "mn")`
    - **Validates: Requirements 1.2, 1.3, 1.8**

  - [x] 2.4 Create `lib/i18n/index.ts` with `getTranslations` and `resolveLocale`
    - `getTranslations(locale: string): TranslationKeys` — falls back to `en` for unrecognized locales
    - `resolveLocale(locale: string | null | undefined): Locale` — returns `"en"` for null/undefined/unrecognized
    - Export `Locale`, `SUPPORTED_LOCALES`, `DEFAULT_LOCALE`
    - _Requirements: 1.6, 1.7, 3.4_

  - [x] 2.5 Create `lib/i18n/currency.ts` with `formatCurrency` and `parseMNT`
    - `formatCurrency(value: number, locale: Locale): string` — throws/returns error string for negative values
    - `parseMNT(formatted: string): number | null`
    - `en`: `1234.56` → `"1234.56"` (two decimal places); `mn`: `12500` → `"₮12,500"` (₮ prefix, comma thousands, no decimals)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.6_

  - [ ]* 2.6 Write unit tests for `formatCurrency` and `parseMNT`
    - `formatCurrency(0, "mn")` → `"₮0"`
    - `formatCurrency(12500, "mn")` → `"₮12,500"`
    - `formatCurrency(1234.56, "en")` → `"1234.56"`
    - `parseMNT("₮12,500")` → `12500`
    - `parseMNT("invalid")` → `null`
    - `resolveLocale(null)` → `"en"`; `resolveLocale("fr")` → `"en"`
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [ ]* 2.7 Write property test for currency formatting (Property 3)
    - **Property 3: Currency formatting is locale-appropriate**
    - Use `fc.float({ min: 0, max: 1e9, noNaN: true })` and `fc.constantFrom("en", "mn")`
    - mn: result starts with `₮` and contains no `.`; en: result has exactly two decimal places and no `₮`
    - **Validates: Requirements 2.1, 2.2, 2.3**

  - [ ]* 2.8 Write property test for MNT round-trip (Property 4)
    - **Property 4: MNT formatting round-trip**
    - Use `fc.integer({ min: 0, max: 1e9 })`
    - `parseMNT(formatCurrency(n, "mn")) === n`
    - **Validates: Requirements 2.4, 2.5**

- [x] 3. Update `lib/org.ts` to include `memberId` and `locale` in `OrgContext`
  - Add `memberId: string` and `locale: Locale` to the `OrgContext` interface
  - Update `getOrgContext()` to read `member.id` and `member.locale` from the DB query result
  - Pass `memberId` and `locale` (via `resolveLocale`) into the constructed `ctx` object
  - The cache key `user:{userId}:orgContext` already exists — no key change needed, but the cached shape now includes the new fields
  - _Requirements: 1.6, 9.1, 9.2, 9.3_

- [x] 4. Implement locale server action and language switcher
  - [x] 4.1 Create `lib/actions/locale.ts` with `setLocale(locale: Locale): Promise<void>`
    - Validate that `locale` is a supported value; fall back to `en` and log a warning if not
    - Update `Member.locale` in the DB scoped to `ctx.organizationId` and `ctx.userId`
    - Invalidate `user:{userId}:orgContext` cache key via `invalidateCache`
    - _Requirements: 1.5, 3.1, 3.2, 3.3_

  - [x] 4.2 Create `components/language-switcher.tsx` as a client component
    - Toggle button showing current locale (`EN` / `MN`)
    - Calls `setLocale` server action on click and triggers `router.refresh()` to apply new locale
    - Styled to match the dark theme (bg `#0a0a0f`, cyan `#38bdf8`, purple `#a855f7`)
    - _Requirements: 1.4, 1.5_

  - [ ]* 4.3 Write property test for locale persistence round-trip (Property 2)
    - **Property 2: Locale persistence round-trip**
    - Use `fc.constantFrom("en", "mn")`
    - After `setLocale(L)`, reading `Member.locale` from DB returns `L`
    - **Validates: Requirements 1.5, 1.6, 3.1**

- [x] 5. Implement gamification — points, badges, and action tracking
  - [x] 5.1 Create `lib/gamification/points.ts`
    - Export `POINT_VALUES: Record<StaffActionType, number>` with values `{ PRODUCT_CREATED: 10, PRODUCT_UPDATED: 5, INVENTORY_CHECKED: 1 }`
    - Export `calculatePoints(actions: Pick<StaffAction, "type">[]): number` — pure function, no DB access
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [ ]* 5.2 Write unit tests for `calculatePoints`
    - `calculatePoints([])` → `0`
    - Mixed action array → correct weighted sum
    - _Requirements: 10.4, 10.5_

  - [ ]* 5.3 Write property test for points additive invariant (Property 10)
    - **Property 10: Points additive invariant**
    - Use `fc.array(fc.constantFrom("PRODUCT_CREATED", "PRODUCT_UPDATED", "INVENTORY_CHECKED"))`
    - `calculatePoints(actions) === 10 * created + 5 * updated + 1 * checked`
    - **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5**

  - [x] 5.4 Create `lib/gamification/badges.ts`
    - Export `BADGE_THRESHOLDS` constant as specified in the design
    - Export `evaluateAndAwardBadges(memberId, organizationId, actionType): Promise<void>`
    - Use `prisma.badge.create` with the `@@unique([memberId, organizationId, type])` constraint to prevent duplicates (catch unique constraint errors silently)
    - Invalidate `org:{organizationId}:leaderboard` cache after awarding any badge
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

  - [ ]* 5.5 Write property test for badge award idempotency (Property 13)
    - **Property 13: Badge award idempotency**
    - For a member who already holds badge type T, triggering the award condition again must not increase the badge count
    - **Validates: Requirements 12.4**

  - [x] 5.6 Create `lib/gamification/actions.ts` with `trackStaffAction`
    - `trackStaffAction({ memberId, organizationId, type }): Promise<void>`
    - Creates a `StaffAction` record in the DB
    - Calls `evaluateAndAwardBadges` asynchronously (fire-and-forget)
    - Invalidates `org:{organizationId}:leaderboard` cache
    - Wraps all DB writes in try/catch — errors are swallowed; tracking must never break the primary flow
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 10.6_

- [ ] 6. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement alert creation logic and update product actions
  - [x] 7.1 Create `lib/actions/alerts.ts` with all alert server actions
    - `getAlerts(page: number): Promise<{ alerts: Alert[]; total: number }>` — paginated, 20 per page, ordered by `createdAt` desc, scoped to org
    - `getUnreadAlertCount(): Promise<number>` — cached under `org:{organizationId}:alerts:unread_count` with 60s TTL
    - `dismissAlert(alertId: string): Promise<void>` — sets status to `DISMISSED`, records `dismissedById` and `dismissedAt`; idempotent; returns not-found if alert belongs to another org
    - `dismissAllAlerts(): Promise<void>` — bulk `updateMany` on UNREAD alerts for the org; invalidates unread count cache
    - All mutations invalidate `org:{organizationId}:alerts:unread_count`
    - _Requirements: 6.2, 6.4, 6.5, 7.1, 7.2, 7.4, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [ ]* 7.2 Write unit tests for alert dismiss idempotency
    - Dismissing an already-dismissed alert → success, no DB write
    - Bulk dismiss with 0 UNREAD alerts → success, no DB write
    - _Requirements: 8.4, 8.6_

  - [ ]* 7.3 Write property test for low stock alert creation (Property 5)
    - **Property 5: Low stock alert creation with complete data**
    - Use `fc.record({ qty: fc.integer({min:0}), lowStockAt: fc.integer({min:1}) })` where `qty <= lowStockAt`
    - Alert created with all required fields non-null
    - **Validates: Requirements 4.1, 4.2, 4.3**

  - [ ]* 7.4 Write property test for no duplicate low stock alerts (Property 6)
    - **Property 6: No duplicate low stock alerts**
    - Product with existing UNREAD alert, trigger low stock condition again → alert count unchanged
    - **Validates: Requirements 4.5**

  - [ ]* 7.5 Write property test for low stock auto-dismiss (Property 7)
    - **Property 7: Low stock alert auto-dismiss**
    - Product with UNREAD alert, update qty above `lowStockAt` → alert status = DISMISSED
    - **Validates: Requirements 4.6**

  - [ ]* 7.6 Write property test for anomaly alert creation (Property 8)
    - **Property 8: Anomaly alert creation with complete data**
    - Use `fc.integer({min:1})` prevQty, `fc.float({min:0, max:0.49})` ratio → newQty = prevQty * ratio
    - Alert created with all required fields non-null
    - **Validates: Requirements 5.1, 5.2**

  - [ ]* 7.7 Write property test for no anomaly on non-decreasing quantity (Property 9)
    - **Property 9: No anomaly alert on non-decreasing quantity**
    - `fc.integer({min:0})` prevQty, `fc.integer({min:0})` newQty where `newQty >= prevQty`
    - No ANOMALY alert created
    - **Validates: Requirements 5.4**

  - [x] 7.8 Add `maybeCreateAlerts` helper inside `lib/actions/products.ts`
    - Implement the alert creation logic from the design: low-stock check (upsert via findFirst + conditional create), auto-dismiss on recovery, anomaly check (>50% drop, previous qty > 0)
    - Use `Promise.all` to parallelize low-stock and anomaly checks
    - Invalidate `org:{organizationId}:alerts:unread_count` if any alert was created/dismissed
    - _Requirements: 4.1, 4.2, 4.4, 4.5, 4.6, 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 7.9 Update `createProduct` in `lib/actions/products.ts` to call `trackStaffAction`
    - After the `prisma.product.create` call, fire-and-forget `trackStaffAction({ memberId: ctx.memberId, organizationId: ctx.organizationId, type: "PRODUCT_CREATED" })`
    - Use `void trackStaffAction(...).catch(() => {})` pattern
    - _Requirements: 9.1, 9.6_

  - [x] 7.10 Update `updateProduct` in `lib/actions/products.ts` to call `trackStaffAction` and `maybeCreateAlerts`
    - After `prisma.product.update`, call `maybeCreateAlerts` (synchronous, on critical path for data integrity)
    - Fire-and-forget `trackStaffAction` with type `PRODUCT_UPDATED`
    - _Requirements: 4.1, 4.6, 5.1, 9.2, 9.6_

- [x] 8. Implement leaderboard server action
  - [x] 8.1 Create `lib/actions/leaderboard.ts` with `getLeaderboard(): Promise<LeaderboardData>`
    - Export `LeaderboardEntry` and `LeaderboardData` interfaces as specified in the design
    - Query all `StaffAction` records for the org, group by `memberId`, compute points via `calculatePoints`
    - Sort by points descending; tie-break by most recent `StaffAction.createdAt` ascending (earlier = better rank)
    - Return top 10 as `entries`; if requesting member is in top 10, set `selfEntry` to `null`; otherwise compute their rank and include as `selfEntry`
    - Cache under `org:{organizationId}:leaderboard` with 60s TTL via `getCached`
    - Include each member's badges from the `Badge` table
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.7, 12.6_

  - [ ]* 8.2 Write unit tests for leaderboard edge cases
    - Fewer than 10 members → returns all members
    - `selfEntry` is `null` when requesting member is in top 10
    - _Requirements: 11.2, 11.7_

  - [ ]* 8.3 Write property test for leaderboard ranking correctness (Property 11)
    - **Property 11: Leaderboard ranking correctness**
    - Use `fc.array(fc.record({points: fc.integer({min:0})}), {minLength:1, maxLength:20})`
    - Results ≤ 10, sorted descending by points
    - **Validates: Requirements 11.2**

  - [ ]* 8.4 Write property test for leaderboard tie-breaking (Property 12)
    - **Property 12: Leaderboard tie-breaking**
    - Two members with equal points, different `lastActionAt` → earlier `lastActionAt` gets lower rank number
    - **Validates: Requirements 11.5**

  - [ ]* 8.5 Write property test for badge display completeness (Property 14)
    - **Property 14: Badge display completeness**
    - Member with N badges → leaderboard entry includes all N badge types
    - **Validates: Requirements 12.6**

- [ ] 9. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Build UI components — AlertBell and updated Sidebar
  - [x] 10.1 Create `components/alert-bell.tsx` as a server component
    - Calls `getUnreadAlertCount()` to get the badge number
    - Renders a bell icon (lucide `Bell`) with a cyan badge showing the count when > 0
    - Links to `/alerts`
    - Styled to match the dark theme
    - _Requirements: 6.1, 6.2, 6.3, 6.6_

  - [x] 10.2 Update `components/sidebar.tsx` to include new nav links, `AlertBell`, and `LanguageSwitcher`
    - Add `Alerts` (`/alerts`) and `Leaderboard` (`/leaderboard`) to the navigation array
    - Import and render `<AlertBell />` in the sidebar header area (next to the logo/org name)
    - Import and render `<LanguageSwitcher locale={locale} />` in the bottom user section
    - Accept `locale` prop and pass it to `LanguageSwitcher`
    - Use translated nav labels via `getTranslations(locale)` for nav item names
    - _Requirements: 1.4, 6.1, 11.1_

- [x] 11. Build alert history page
  - Create `app/alerts/page.tsx` as a server component
  - Call `getOrgContext()` to get `locale` and `organizationId`
  - Accept `searchParams` for `page` (default 1); call `getAlerts(page)` for paginated data
  - Render alert list showing: type badge (LOW_STOCK / ANOMALY), product name, relevant quantities, status, creation timestamp
  - Include dismiss button per alert (calls `dismissAlert` server action) and a "Dismiss All" button (calls `dismissAllAlerts`)
  - Use `<Pagination />` component for page navigation
  - Render all labels via `getTranslations(locale)` for MN support
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 8.1, 8.5_

- [x] 12. Build leaderboard page
  - Create `app/leaderboard/page.tsx` as a server component
  - Call `getOrgContext()` to get `locale` and `memberId`
  - Call `getLeaderboard()` to get `entries` and `selfEntry`
  - Render top 10 table with rank, display name, points, and badge icons
  - If `selfEntry` is non-null, render a separate "Your Rank" section below the table
  - Render all labels via `getTranslations(locale)` for MN support
  - Badge icons/names use `getTranslations(locale).badges[badge.type]`
  - _Requirements: 11.1, 11.2, 11.6, 11.7, 12.6, 12.7_

- [x] 13. Pass locale through to all existing pages
  - Update `app/dashboard/page.tsx`, `app/inventory/page.tsx`, `app/add-product/page.tsx`, `app/settings/page.tsx`, `app/org/members/page.tsx`, `app/org/approvals/page.tsx`, `app/org/settings/page.tsx` to:
    - Read `locale` from `ctx` (already returned by updated `getOrgContext()`)
    - Pass `locale` to `<Sidebar locale={locale} ... />`
    - Format any currency values displayed on the page using `formatCurrency(value, locale)`
  - Update `app/inventory/page.tsx` to fire-and-forget `trackStaffAction` with type `INVENTORY_CHECKED` after resolving org context
  - _Requirements: 1.2, 1.3, 1.6, 2.1, 2.2, 9.3_

- [x] 14. Final checkpoint — type check and schema validation
  - Run `npx prisma generate` to ensure the Prisma client is up to date
  - Run `npx tsc --noEmit` to verify there are no TypeScript errors across the codebase
  - Fix any type errors surfaced by the type check
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests use [fast-check](https://github.com/dubzzz/fast-check) and validate universal correctness properties
- Unit tests validate specific examples and edge cases
- `trackStaffAction` and `evaluateAndAwardBadges` are always fire-and-forget — they must never block or break the primary inventory operations
- Alert creation inside `updateProduct` is synchronous (on the critical path for data integrity) but uses `Promise.all` internally to parallelize checks
