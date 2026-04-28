# Implementation Plan: StockFlow Advanced Features

## Overview

Implement six advanced features on top of the existing Next.js 15 / Prisma / Redis / Stack Auth stack: a SUPER_ADMIN server monitoring dashboard with Prometheus metrics, a compliance-grade audit trail for MANAGERs, multi-currency support for seven currency codes, a daily standup digest via Vercel Cron, a product image gallery view toggle, and global keyboard shortcuts with an accessible reference panel.

All code is TypeScript. Implementation follows existing patterns: `getOrgContext()` for auth/RBAC, `org:{organizationId}:*` Redis key namespacing, Prisma for persistence, and Server Actions for mutations.

---

## Tasks

- [x] 1. Extend Prisma schema for audit trail and multi-currency
  - Add `AuditActionType` enum with values `CREATE`, `UPDATE`, `DELETE`, `ROLE_CHANGE`, `MEMBERSHIP` to `prisma/schema.prisma`
  - Add `currency String @default("MNT")` field to the `Organization` model
  - Add `auditLogs AuditLog[]` relation to the `Organization` model
  - Add `AuditLog` model with all fields, indexes, and `onDelete: Cascade` FK exactly as specified in the design
  - Run `npx prisma db push` and `npx prisma generate` to apply and regenerate the client
  - _Requirements: 2.1, 2.8, 3.1, 3.2_

- [x] 2. Implement multi-currency formatter
  - [x] 2.1 Create `lib/i18n/currency.ts` additions — `SUPPORTED_CURRENCIES`, `CurrencyCode`, `CURRENCY_FORMATS`, `formatCurrencyByCode`, and `parseCurrencyString`
    - `SUPPORTED_CURRENCIES` constant array: `["MNT", "USD", "EUR", "CNY", "JPY", "KRW", "GBP"]`
    - `CURRENCY_FORMATS` record mapping each code to its symbol, decimals, separators as specified in the design
    - `formatCurrencyByCode(value, code)` — throws for unsupported codes; returns `"Invalid amount"` for negative values
    - `parseCurrencyString(formatted, code)` — returns `null` if unparseable
    - _Requirements: 3.1, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [ ]* 2.2 Write unit tests for `formatCurrencyByCode` and `parseCurrencyString`
    - `formatCurrencyByCode(12500, "MNT")` → `"₮12,500"`
    - `formatCurrencyByCode(1234.56, "USD")` → `"$1,234.56"`
    - `formatCurrencyByCode(1234.56, "EUR")` → `"€1,234.56"`
    - `formatCurrencyByCode(0, "JPY")` → `"¥0"`
    - `parseCurrencyString("₮12,500", "MNT")` → `12500`
    - `parseCurrencyString("$1,234.56", "USD")` → `1234.56`
    - `parseCurrencyString("invalid", "USD")` → `null`
    - `formatCurrencyByCode(-1, "USD")` → `"Invalid amount"`
    - _Requirements: 3.3, 3.4, 3.5, 3.6_

  - [ ]* 2.3 Write property test for currency formatting correctness — Property 5
    - **Property 5: Currency formatting correctness by code**
    - Use `fc.float({min:0, max:1e9, noNaN:true})` and `fc.constantFrom(...SUPPORTED_CURRENCIES)`
    - Assert result starts with the correct symbol; no decimal point when `decimals === 0`; exactly two decimal places when `decimals === 2`
    - **Validates: Requirements 3.3, 3.4, 3.5, 3.6**

  - [ ]* 2.4 Write property test for currency round-trip — Property 6
    - **Property 6: Currency formatting round-trip**
    - Use `fc.integer({min:0, max:1e9})` and `fc.constantFrom(...SUPPORTED_CURRENCIES)`
    - Assert `parseCurrencyString(formatCurrencyByCode(n, code), code) === n`
    - **Validates: Requirements 3.8**

  - [ ]* 2.5 Write property test for unsupported currency rejection — Property 7
    - **Property 7: Unsupported currency codes are rejected**
    - Use `fc.string().filter(s => !SUPPORTED_CURRENCIES.includes(s as CurrencyCode))`
    - Assert `formatCurrencyByCode` throws and `updateOrgCurrency` returns a validation error
    - **Validates: Requirements 3.7**

- [x] 3. Implement `updateOrgCurrency` server action and org settings UI
  - [x] 3.1 Add `updateOrgCurrency(formData)` to `lib/actions/org.ts`
    - Validate the submitted code against `SUPPORTED_CURRENCIES` via Zod; return a user-facing error for unsupported codes
    - Call `requireRole(ctx, "MANAGER")`
    - Update `Organization.currency` in Prisma
    - Invalidate `user:{userId}:orgContext` cache key so the new currency is reflected immediately
    - _Requirements: 3.2, 3.7, 3.9_

  - [ ]* 3.2 Write property test for currency persistence round-trip — Property 8
    - **Property 8: Currency persistence round-trip**
    - Use `fc.constantFrom(...SUPPORTED_CURRENCIES)`
    - After `updateOrgCurrency(C)`, read the org from DB and assert `currency === C`
    - **Validates: Requirements 3.2**

  - [x] 3.3 Add "Display Currency" card to `app/org/settings/page.tsx`
    - Read `org.currency` from the `Organization` record
    - Render a `<select>` with all 7 supported currency codes and their labels
    - Wire the form to the `updateOrgCurrency` server action
    - _Requirements: 3.2, 3.9_

- [x] 4. Checkpoint — currency layer complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement audit trail — `AuditLog` actions
  - [x] 5.1 Create `lib/actions/audit.ts` with `writeAuditLog` and `getAuditLogs`
    - Export `AuditActionType`, `AuditEntityType`, and `AuditLogEntry` types as specified in the design
    - `writeAuditLog(entry)` — fire-and-forget safe; errors are caught and logged to `console.error`; never propagates to caller
    - `getAuditLogs(params)` — cursor-based pagination on `(createdAt DESC, id DESC)`; supports filtering by `actorMemberId`, `actionType`, `entityType`, `dateFrom`, `dateTo`; default limit 50
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8_

  - [ ]* 5.2 Write unit tests for `writeAuditLog` and `getAuditLogs`
    - `writeAuditLog` DB failure → does not throw; logs error to console
    - `getAuditLogs` with no filters → returns entries sorted by `createdAt` desc
    - `getAuditLogs` with `actorMemberId` filter → returns only entries for that actor
    - _Requirements: 2.3, 2.4, 2.6_

  - [ ]* 5.3 Write property test for AuditLog entry completeness — Property 2
    - **Property 2: AuditLog entry completeness on product mutation**
    - Use `fc.record({ actionType: fc.constantFrom("CREATE","UPDATE","DELETE"), actorMemberId: fc.string({minLength:1}), actorDisplayName: fc.string({minLength:1}), organizationId: fc.string({minLength:1}), entityId: fc.string({minLength:1}), entityName: fc.string({minLength:1}) })`
    - Assert all required fields are non-null on the written entry
    - **Validates: Requirements 2.1, 2.2**

  - [ ]* 5.4 Write property test for audit log ordering — Property 3
    - **Property 3: Audit log entries are returned in reverse-chronological order**
    - Use `fc.array(fc.record({ createdAt: fc.date() }), {minLength:2})`
    - Assert no entry in the result has a `createdAt` later than the entry before it
    - **Validates: Requirements 2.3**

  - [ ]* 5.5 Write property test for audit log filter correctness — Property 4
    - **Property 4: Audit log filter correctness**
    - Use `fc.record({ filter: fc.constantFrom("actorMemberId","actionType","entityType"), value: fc.string({minLength:1}) })`
    - Assert every returned entry satisfies all active filter criteria simultaneously
    - **Validates: Requirements 2.4**

- [x] 6. Integrate `writeAuditLog` into product and membership actions
  - [x] 6.1 Update `lib/actions/products.ts` to call `writeAuditLog` fire-and-forget
    - In `createProduct`: after `prisma.product.create`, call `void writeAuditLog({ actionType: "CREATE", entityType: "Product", ... before: null, after: created })` 
    - In `updateProduct`: after `prisma.product.update`, call `void writeAuditLog({ actionType: "UPDATE", ..., before: existing, after: parsed.data })`
    - In `deleteProduct`: before `prisma.product.deleteMany`, fetch the product snapshot; after deletion call `void writeAuditLog({ actionType: "DELETE", ..., before: snapshot, after: null })`
    - Use `void writeAuditLog(...).catch(() => {})` pattern — must never block or throw
    - _Requirements: 2.1, 2.6_

  - [x] 6.2 Update `lib/actions/membership.ts` to call `writeAuditLog` for role changes and membership actions
    - In `approveMembershipRequest` for `UPDATE_ROLE`: call `void writeAuditLog({ actionType: "ROLE_CHANGE", entityType: "Member", ... })`
    - In `approveMembershipRequest` for `ADD`/`REMOVE`: call `void writeAuditLog({ actionType: "MEMBERSHIP", entityType: "Member", ... })`
    - In `inviteMember`: call `void writeAuditLog({ actionType: "MEMBERSHIP", entityType: "Invitation", ... })`
    - _Requirements: 2.2, 2.6_

- [x] 7. Build `/org/audit` page
  - Create `app/org/audit/page.tsx` as a server component
  - Call `requireRole(ctx, "MANAGER")` at the top
  - Accept `searchParams` for `cursor`, `actorMemberId`, `actionType`, `entityType`, `dateFrom`, `dateTo`
  - Call `getAuditLogs(params)` and render entries in reverse-chronological order
  - Each entry shows: actor avatar/initials, action badge, entity name, changed fields summary, relative timestamp
  - Include filter controls (actor select, action type select, entity type select, date range inputs)
  - Implement cursor-based "Load more" / next-page navigation using `nextCursor`
  - _Requirements: 2.3, 2.4, 2.7, 2.8_

- [x] 8. Add "Audit Log" link to sidebar navigation
  - Update `components/sidebar.tsx` to add `{ name: "Audit Log", href: "/org/audit", icon: ClipboardList }` to `orgNavigation` — visible only when `role === "MANAGER" || role === "SUPER_ADMIN"`
  - _Requirements: 2.3_

- [x] 9. Checkpoint — audit trail complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement Prometheus metrics endpoint
  - Create `app/api/metrics/route.ts`
  - Install and import `prom-client`; call `collectDefaultMetrics()`
  - Define and export the five required metrics: `httpRequestCount` (Counter), `httpRequestDuration` (Histogram), `dbConnectionCount` (Gauge), `redisCacheHitRate` (Gauge), `memoryUsageMb` (Gauge)
  - `GET` handler: validate `Authorization: Bearer ${METRICS_SECRET}` header; return 401 if missing/invalid; return Prometheus text format with correct `Content-Type`
  - _Requirements: 1.3, 1.4, 1.7, 1.8_

  - [ ]* 10.1 Write property test for metrics output completeness — Property 1
    - **Property 1: Metrics output contains all required metric names**
    - Use `fc.record({ requests: fc.nat(), duration: fc.float({min:0}) })` to simulate recorded values
    - Assert the output string contains all five metric names: `http_requests_total`, `http_request_duration_ms`, `db_connections_active`, `redis_cache_hit_rate`, `memory_usage_mb`
    - **Validates: Requirements 1.3**

- [x] 11. Build `/admin/monitoring` page and `GrafanaEmbed` component
  - Create `app/admin/monitoring/page.tsx` as a server component
  - Call `requireRole(ctx, "SUPER_ADMIN")` — middleware will redirect non-SUPER_ADMINs with 403 to `/dashboard`
  - Render `<GrafanaEmbed />` client component
  - Create `components/grafana-embed.tsx` as a client component:
    - Renders an `<iframe>` pointing to `process.env.NEXT_PUBLIC_GRAFANA_EMBED_URL`
    - Shows a loading skeleton while `onLoad` has not yet fired
    - Shows "Monitoring unavailable" error message and a retry button if the iframe fails to load (`onError`)
  - Add `{ name: "Monitoring", href: "/admin/monitoring", icon: Activity }` to sidebar — visible only when `role === "SUPER_ADMIN"`
  - _Requirements: 1.1, 1.2, 1.5, 1.6_

- [x] 12. Implement daily standup digest — cron job and Redis storage
  - [x] 12.1 Add Vercel Cron configuration to `vercel.json`
    - Add `"crons": [{ "path": "/api/digest/run", "schedule": "0 1 * * *" }]` (01:00 UTC = 09:00 Ulaanbaatar)
    - _Requirements: 4.1_

  - [x] 12.2 Create `app/api/digest/run/route.ts`
    - `POST` handler: validate `Authorization: Bearer ${CRON_SECRET}` header; return 401 if invalid
    - Fetch all `Organization` records with their `currency` field
    - For each org, compute `DigestReport` for the previous calendar day in Ulaanbaatar time (UTC+8):
      - `totalInventoryValue`: sum of `price * quantity` for all products
      - `newProductsCount`: products with `createdAt` in the previous day window
      - `dispatchCount`: `StaffAction` records with `type = PRODUCT_UPDATED` and `quantityAfter < quantityBefore` in the window
      - `newAlertsCount`: `Alert` records created in the window
      - `dismissedAlertsCount`: `Alert` records dismissed in the window
    - Store each report in Redis under `org:{organizationId}:digest:latest` with 48h TTL
    - On failure: log error and retry once after 5 minutes via `setTimeout`
    - _Requirements: 4.1, 4.2, 4.5, 4.6_

  - [ ]* 12.3 Write property test for DigestReport field completeness — Property 9
    - **Property 9: DigestReport contains all required fields**
    - Use `fc.record({ orgId: fc.string({minLength:1}), totalInventoryValue: fc.float({min:0}), newProductsCount: fc.nat(), dispatchCount: fc.nat(), newAlertsCount: fc.nat(), dismissedAlertsCount: fc.nat() })`
    - Assert all required fields are non-null on the computed report (including zero-activity orgs)
    - **Validates: Requirements 4.2**

- [x] 13. Build `DigestCard` component and wire into dashboard
  - Create `components/digest-card.tsx` as a server component
  - Read `org:{organizationId}:digest:latest` from Redis
  - If no report exists, render a placeholder card: "No digest available yet."
  - If report exists, render a "Yesterday's Summary" card with all `DigestReport` fields; format `totalInventoryValue` using `formatCurrencyByCode(value, report.currencyCode)`
  - Add `<DigestCard />` to `app/dashboard/page.tsx` — render only when `role === "MANAGER" || role === "SUPER_ADMIN"`
  - _Requirements: 4.3, 4.4, 4.7, 4.8_

  - [ ]* 13.1 Write property test for digest card role visibility — Property 10
    - **Property 10: Digest card visibility matches role**
    - Use `fc.constantFrom("STAFF","MANAGER","SUPER_ADMIN")`
    - Assert the card is rendered if and only if role is `MANAGER` or `SUPER_ADMIN`
    - **Validates: Requirements 4.7**

- [x] 14. Checkpoint — monitoring and digest complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 15. Implement gallery view — hook and component
  - [x] 15.1 Create `lib/hooks/use-view-preference.ts`
    - Export `ViewMode = "table" | "gallery"` type
    - `useViewPreference(key = "inventory-view"): [ViewMode, (v: ViewMode) => void]`
    - Reads/writes `localStorage[key]`; defaults to `"table"` if no entry or if `localStorage` is unavailable (SSR / private browsing — catch the exception)
    - _Requirements: 5.8_

  - [ ]* 15.2 Write property test for view preference localStorage round-trip — Property 13
    - **Property 13: View preference localStorage round-trip**
    - Use `fc.constantFrom("table", "gallery")`
    - Assert `read(write(v)) === v`
    - **Validates: Requirements 5.8**

  - [x] 15.3 Create `components/gallery-view.tsx` as a client component
    - Props: `items: Product[]`, `onAdjust: (id, delta) => void`, `onDelete: (id) => void`
    - CSS grid layout: 1 col `<640px`, 2 cols `640–1023px`, 4 cols `≥1024px` (use Tailwind responsive classes or CSS media queries)
    - Each card: product image at full card width (or placeholder icon if `imageUrl` is null or broken — use `onError` to swap to placeholder), product name, SKU (if present), current quantity, stock status badge
    - Card click → `router.push(\`/add-product?id=\${product.id}\`)`
    - _Requirements: 5.2, 5.4, 5.6, 5.7, 5.9_

  - [ ]* 15.4 Write property test for gallery card display fields — Property 12
    - **Property 12: Gallery card contains all required display fields**
    - Use `fc.record({ name: fc.string({minLength:1}), quantity: fc.nat(), imageUrl: fc.option(fc.webUrl()) })`
    - Assert rendered card contains name, quantity, status badge; image rendered when `imageUrl` non-null; placeholder rendered when null
    - **Validates: Requirements 5.4, 5.7**

- [x] 16. Wire gallery view toggle into `InventoryClient`
  - Update `app/inventory/client.tsx`:
    - Import `useViewPreference` and `GalleryView`
    - Add a toggle button to the toolbar (table icon / grid icon) that calls `setViewMode`
    - Conditionally render `<InventoryTable>` or `<GalleryView>` based on `viewMode`
    - All existing filter/pagination state (`q`, `page`, `filter`) is shared between both views — no state reset on toggle
    - Add `id="inventory-search"` to the search input (needed for keyboard shortcut `` ` ``)
    - _Requirements: 5.1, 5.2, 5.3, 5.5_

  - [ ]* 16.1 Write property test for gallery view toggle round-trip — Property 11
    - **Property 11: Gallery view toggle is a round-trip**
    - Use `fc.record({ q: fc.string(), filter: fc.constantFrom("all","in_stock","low","critical"), page: fc.nat({max:100}) })`
    - Assert toggling table→gallery→table restores the same `q`, `filter`, and `page` state
    - **Validates: Requirements 5.2, 5.3, 5.5**

- [x] 17. Checkpoint — gallery view complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 18. Implement keyboard shortcuts — hook and panel
  - [x] 18.1 Create `lib/hooks/use-keyboard-shortcuts.ts`
    - Export `ShortcutDefinition` interface: `{ key: string; description: string; action: () => void }`
    - `useKeyboardShortcuts(shortcuts: ShortcutDefinition[]): void`
    - Registers a single `keydown` listener on `document` on mount; removes it on unmount
    - Skips if `event.target` is `INPUT`, `TEXTAREA`, or has `contenteditable` attribute
    - Falls back to `event.keyCode` mapping if `event.key` is `undefined`
    - _Requirements: 6.1, 6.3, 6.6, 6.7_

  - [ ]* 18.2 Write unit tests for `useKeyboardShortcuts`
    - Key pressed while `<input>` focused → action not called
    - Key pressed while `<textarea>` focused → action not called
    - Key pressed while no input focused → action called
    - _Requirements: 6.2, 6.3_

  - [ ]* 18.3 Write property test for shortcuts blocked when input focused — Property 14
    - **Property 14: Keyboard shortcuts fire only when no input is focused**
    - Use `fc.constantFrom("n","d","a","\`","?")` and `fc.constantFrom("INPUT","TEXTAREA")`
    - Assert the shortcut action is not called when the event target is an input element
    - **Validates: Requirements 6.3**

  - [ ]* 18.4 Write property test for listener lifecycle — Property 15
    - **Property 15: Keyboard shortcut listener lifecycle**
    - Simulate mount/unmount cycles
    - Assert `document.addEventListener` is called once on mount and `document.removeEventListener` is called once on unmount, resulting in zero net listeners after unmount
    - **Validates: Requirements 6.6**

  - [x] 18.5 Create `components/keyboard-shortcut-panel.tsx` as a client component
    - `role="dialog"`, `aria-modal="true"`, `aria-label="Keyboard shortcuts"`
    - Renders a table of all registered shortcuts (key → description)
    - Visible close button; closes on `Escape` key or click outside the panel
    - _Requirements: 6.4, 6.5, 6.8_

- [ ] 19. Register global shortcuts in layout
  - Create `components/global-shortcuts.tsx` as a client component
  - Call `useKeyboardShortcuts` with the full shortcut map: `N` → `router.push("/add-product")`, `D` → `router.push("/dispatch")`, `A` → `router.push("/alerts")`, `` ` `` → `document.getElementById("inventory-search")?.focus()`, `?` → open `KeyboardShortcutPanel`
  - Render `<KeyboardShortcutPanel>` conditionally based on panel open state
  - Import and render `<GlobalShortcuts />` in `app/layout.tsx`
  - _Requirements: 6.1, 6.2, 6.4, 6.5_

- [x] 20. Final checkpoint — full test suite and type check
  - Ensure all non-optional tests pass
  - Run `npx tsc --noEmit` to confirm zero TypeScript errors across the entire project
  - Verify `/api/metrics` returns 401 without the bearer token and 200 with it
  - Verify `/admin/monitoring` redirects non-SUPER_ADMIN users
  - Verify `/org/audit` redirects non-MANAGER users
  - Ask the user if any questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Property tests use [fast-check](https://github.com/dubzzz/fast-check) with a minimum of 100 iterations each
- Each property test references the property number from the design document for traceability
- `writeAuditLog` is always fire-and-forget — it must never block or throw in the calling action
- The `METRICS_SECRET` and `CRON_SECRET` environment variables must be set in `.env` and Vercel project settings before deploying
- `prom-client` must be added to `package.json` dependencies before implementing task 10
- The Vercel Cron job in task 12 only runs on Vercel deployments; for local development, trigger `POST /api/digest/run` manually with the `CRON_SECRET` header
