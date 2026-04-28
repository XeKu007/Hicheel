# Requirements Document

## Introduction

StockFlow-д 5 шинэ feature нэмэх: SUPER_ADMIN-д зориулсан Prometheus/Grafana серверийн мониторинг dashboard; MANAGER-д зориулсан audit trail (бүрэн өөрчлөлтийн түүх), multi-currency дэмжлэг (MNT/USD/EUR), болон өдөр тутмын standup digest; бүх role-д зориулсан product image gallery view болон keyboard shortcuts. Эдгээр feature нь StockFlow-ийн Next.js 15 / Prisma / Redis / Stack Auth стек дээр суурилна.

---

## Glossary

- **StockFlow**: Энэхүү inventory management application.
- **System**: StockFlow application (Next.js 15 backend + frontend).
- **SUPER_ADMIN**: Хамгийн өндөр эрхтэй хэрэглэгч — бүх org-ийн мониторинг хийх боломжтой.
- **MANAGER**: Org-ийн удирдлагын эрхтэй хэрэглэгч — audit, currency, digest тохиргоо хийх боломжтой.
- **STAFF**: Энгийн хэрэглэгч — inventory харах, засах боломжтой.
- **OrgContext**: Хэрэглэгчийн одоогийн org, role, locale агуулсан session context (`lib/org.ts`).
- **Organization**: Prisma `Organization` model — нэг tenant.
- **Product**: Prisma `Product` model — inventory дэх нэг бараа.
- **StaffAction**: Prisma `StaffAction` model — хэн юуг хэзээ хийсэн бүртгэл.
- **AuditLog**: Шинэ Prisma model — бүх өөрчлөлтийн compliance-зориулалтын бүртгэл.
- **Currency**: Org-ийн тохиргоонд хадгалагдах валютын код (MNT, USD, EUR, гэх мэт).
- **DigestReport**: Өдөр тутмын санхүүгийн болон үйл ажиллагааны товч тайлан.
- **GalleryView**: Inventory хуудсан дахь зургийн grid харагдац.
- **TableView**: Inventory хуудсан дахь хүснэгтийн харагдац (одоогийн default).
- **KeyboardShortcut**: Тодорхой товчлуурын хослолоор хурдан үйлдэл хийх боломж.
- **Prometheus**: Metrics цуглуулах open-source monitoring систем.
- **Grafana**: Metrics дүрслэх open-source dashboard систем.
- **MetricsEndpoint**: `/api/metrics` — Prometheus-д зориулсан HTTP endpoint.
- **Digest_Scheduler**: Өдөр бүр 09:00 MNT цагт digest тооцоолж dashboard-д хадгалах background job.
- **Pretty_Printer**: Structured data-г human-readable форматад хөрвүүлэгч.

---

## Requirements

### Requirement 1: Server Monitoring Dashboard (SUPER_ADMIN)

**User Story:** As a SUPER_ADMIN, I want to see system health and resource metrics in a single dashboard, so that I can monitor the StockFlow infrastructure without switching between tools.

#### Acceptance Criteria

1. WHEN a SUPER_ADMIN navigates to `/admin/monitoring`, THE System SHALL display a Grafana-embedded dashboard showing real-time metrics.
2. WHEN a non-SUPER_ADMIN user attempts to access `/admin/monitoring`, THE System SHALL return an HTTP 403 response and redirect to `/dashboard`.
3. THE MetricsEndpoint SHALL expose the following metrics in Prometheus text format: HTTP request count by route and status code, HTTP request duration in milliseconds (p50, p95, p99), active database connection count, Redis cache hit rate, and current memory usage in megabytes.
4. WHEN the MetricsEndpoint receives a request without a valid `METRICS_SECRET` bearer token, THE System SHALL return an HTTP 401 response.
5. WHILE the Grafana dashboard is loading, THE System SHALL display a loading skeleton in place of each panel.
6. IF the Grafana embed URL is unreachable, THEN THE System SHALL display an error message stating "Monitoring unavailable" and a retry button.
7. THE MetricsEndpoint SHALL respond within 500ms under normal operating conditions.
8. WHERE Prometheus scrape interval is configured, THE MetricsEndpoint SHALL support scrape intervals as low as 15 seconds without returning errors.

---

### Requirement 2: Audit Trail (MANAGER)

**User Story:** As a MANAGER, I want a complete history of who changed what and when, so that I can satisfy compliance requirements and investigate incidents.

#### Acceptance Criteria

1. WHEN any Member performs a create, update, or delete operation on a Product, THE System SHALL write an AuditLog entry containing: actor member ID, actor display name, organization ID, action type (CREATE / UPDATE / DELETE), entity type, entity ID, a JSON snapshot of changed fields (before and after values), and a UTC timestamp.
2. WHEN any MANAGER performs a role change or membership action, THE System SHALL write an AuditLog entry with the same fields as criterion 1.
3. WHEN a MANAGER navigates to `/org/audit`, THE System SHALL display AuditLog entries for the MANAGER's organization in reverse-chronological order, paginated at 50 entries per page.
4. WHILE viewing the audit log, THE System SHALL allow filtering by: actor member, action type, entity type, and date range (from / to).
5. THE System SHALL retain AuditLog entries for a minimum of 90 days before they are eligible for archival.
6. IF an AuditLog write fails, THEN THE System SHALL log the failure to the server error log and SHALL NOT roll back the originating operation.
7. THE System SHALL display each AuditLog entry with: actor avatar/initials, action badge, entity name, changed fields summary, and relative timestamp (e.g. "2 hours ago").
8. WHERE the organization has more than 1000 AuditLog entries, THE System SHALL support cursor-based pagination to maintain response times below 300ms.

---

### Requirement 3: Multi-Currency Support (MANAGER)

**User Story:** As a MANAGER, I want to select the organization's display currency in org settings, so that all monetary values are shown in the correct currency for my team.

#### Acceptance Criteria

1. THE System SHALL support the following currency codes: MNT (Mongolian Tögrög), USD (US Dollar), EUR (Euro), CNY (Chinese Yuan), JPY (Japanese Yen), KRW (South Korean Won), GBP (British Pound).
2. WHEN a MANAGER saves a currency selection in `/org/settings`, THE System SHALL persist the selected currency code to the Organization record and invalidate the org's Redis cache.
3. WHEN any page renders a monetary value for a Member of an organization, THE System SHALL format the value using the organization's saved currency code and the locale-appropriate symbol, decimal separator, and grouping separator.
4. WHEN the organization currency is MNT, THE System SHALL format values as `₮N` with no decimal places and comma thousands separators (e.g. `₮12,500`).
5. WHEN the organization currency is USD, THE System SHALL format values as `$N.NN` with two decimal places (e.g. `$1,234.56`).
6. WHEN the organization currency is EUR, THE System SHALL format values as `€N.NN` with two decimal places (e.g. `€1,234.56`).
7. IF an unsupported currency code is submitted, THEN THE System SHALL reject the request with a validation error and SHALL NOT update the Organization record.
8. THE Pretty_Printer SHALL format any Currency value back into a parseable string such that parsing the formatted output produces the original numeric value (round-trip property).
9. WHEN a MANAGER changes the currency, THE System SHALL reflect the new currency on all pages within the same page load without requiring a full browser refresh of cached data.

---

### Requirement 4: Daily Standup Digest (MANAGER)

**User Story:** As a MANAGER, I want a daily digest showing yesterday's financial totals and activity summary at 09:00 MNT, so that I can start each day with a clear picture of inventory health.

#### Acceptance Criteria

1. THE Digest_Scheduler SHALL compute the DigestReport for each organization once per day at 09:00 Ulaanbaatar time (UTC+8).
2. THE DigestReport SHALL include the following fields for the previous calendar day (00:00–23:59 Ulaanbaatar time): total inventory value in the organization's currency, number of new products added, number of dispatch operations performed, number of new alerts generated, and number of alerts dismissed.
3. WHEN a MANAGER views the dashboard, THE System SHALL display the most recent DigestReport in a dedicated "Yesterday's Summary" card.
4. WHEN no DigestReport exists for the previous day (e.g. first day of use), THE System SHALL display a placeholder card stating "No digest available yet."
5. IF the Digest_Scheduler fails to compute a DigestReport, THEN THE System SHALL log the error and retry once after 5 minutes.
6. THE System SHALL store DigestReport data in Redis with a TTL of 48 hours.
7. WHILE a MANAGER is viewing the dashboard, THE System SHALL display the DigestReport card only to Members with MANAGER or SUPER_ADMIN role.
8. THE DigestReport SHALL display the total inventory value formatted using the organization's saved currency (see Requirement 3).

---

### Requirement 5: Product Image Gallery View (All Roles)

**User Story:** As any user, I want to toggle between a table view and an image gallery view in the inventory page, so that I can visually browse products by their images.

#### Acceptance Criteria

1. THE System SHALL display a toggle button in the inventory toolbar that switches between TableView and GalleryView.
2. WHEN a user clicks the toggle button while in TableView, THE System SHALL render GalleryView showing all currently filtered and paginated products as image cards.
3. WHEN a user clicks the toggle button while in GalleryView, THE System SHALL render TableView restoring the previous table layout.
4. WHILE in GalleryView, THE System SHALL display each product card with: the product image at full card width (or a placeholder icon if no image exists), the product name, the SKU (if present), the current quantity, and the stock status badge.
5. WHILE in GalleryView, THE System SHALL maintain all active search filters and pagination state.
6. WHEN a user clicks a product card in GalleryView, THE System SHALL open the existing product detail/edit view.
7. IF a product has no `imageUrl`, THEN THE System SHALL display a neutral placeholder image in the gallery card.
8. THE System SHALL persist the user's view preference (TableView or GalleryView) in `localStorage` so that the preference is restored on next visit.
9. WHERE the viewport width is less than 640px, THE System SHALL render GalleryView in a single-column layout; where the viewport width is 640px–1023px, THE System SHALL render a two-column layout; where the viewport width is 1024px or greater, THE System SHALL render a four-column layout.

---

### Requirement 6: Keyboard Shortcuts (All Roles)

**User Story:** As a power user, I want keyboard shortcuts for common actions, so that I can navigate and operate StockFlow without reaching for the mouse.

#### Acceptance Criteria

1. THE System SHALL activate the following global keyboard shortcuts when no text input or textarea element is focused:
   - `N` → navigate to `/add-product`
   - `D` → navigate to `/dispatch`
   - `A` → navigate to `/alerts`
   - `` ` `` (backtick) → focus the inventory search input
2. WHEN a keyboard shortcut is triggered, THE System SHALL execute the corresponding action within 100ms of the keydown event.
3. WHILE a text input, textarea, or contenteditable element is focused, THE System SHALL NOT intercept any keyboard shortcut keys.
4. THE System SHALL display a keyboard shortcut reference panel when the user presses `?` (Shift+/).
5. WHEN the shortcut reference panel is open, THE System SHALL close it when the user presses `Escape` or clicks outside the panel.
6. THE System SHALL register and unregister keyboard event listeners on component mount and unmount respectively to prevent memory leaks.
7. WHERE the user's browser does not support the `KeyboardEvent.key` property, THE System SHALL fall back to `KeyboardEvent.keyCode` for shortcut detection.
8. THE System SHALL make the keyboard shortcut reference panel accessible with `role="dialog"`, `aria-modal="true"`, and a visible close button.
