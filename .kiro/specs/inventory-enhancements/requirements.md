# Requirements Document

## Introduction

This feature extends the inventory management application with three capabilities: full Mongolian (MN) localization with MNT currency formatting, smart stock alerts and anomaly detection, and a gamification system with a leaderboard and badges. All three features are org-scoped — every piece of data, every alert, and every leaderboard entry is isolated to the requesting user's Organization. The implementation must follow existing patterns (Redis caching with `org:{id}:*` key namespacing, `getOrgContext()` for auth, Prisma for persistence, Server Actions for mutations) and must not degrade application performance.

---

## Glossary

- **System**: The inventory management application as a whole.
- **Organization**: A tenant entity representing a single company; all data in this spec is scoped to an Organization.
- **Member**: A user who belongs to an Organization with an assigned Role (`SUPER_ADMIN`, `MANAGER`, or `STAFF`).
- **Organization_Context**: The currently active Organization resolved from the authenticated session via `getOrgContext()`.
- **Product**: An inventory item that belongs to exactly one Organization.
- **Locale**: The active display language — either `en` (English) or `mn` (Mongolian).
- **Language_Preference**: A per-user setting that stores the user's chosen Locale, persisted in the database.
- **MNT**: Mongolian Tugrik, the currency of Mongolia, represented with the ₮ symbol.
- **Alert**: A system-generated notification scoped to an Organization, triggered by a stock event.
- **Low_Stock_Alert**: An Alert triggered when a Product's quantity falls at or below its `lowStockAt` threshold.
- **Anomaly_Alert**: An Alert triggered when a Product's quantity drops by more than 50% in a single update.
- **Alert_Status**: The read/dismissed state of an Alert — either `UNREAD` or `DISMISSED`.
- **Alert_Bell**: The notification icon in the UI header that displays the count of unread Alerts for the Organization.
- **Cache**: The Upstash Redis cache layer used to reduce database load.
- **Staff_Action**: A recorded event representing a Member performing a tracked inventory operation (product created, product updated, inventory checked).
- **Points**: A numeric score accumulated by a Member through Staff_Actions.
- **Leaderboard**: A ranked list of Members within an Organization ordered by Points, cached in Redis.
- **Badge**: A milestone award granted to a Member when a defined threshold of Staff_Actions is reached.
- **Badge_Type**: The category of a Badge — one of `FIRST_PRODUCT`, `HUNDRED_UPDATES`, `TOP_PERFORMER`, or `INVENTORY_CHECKER`.
- **Pretty_Printer**: A formatting function that serializes a structured value (e.g., a currency amount or a translated string key) back into its display representation.

---

## Requirements

### Requirement 1: Mongolian Language Support

**User Story:** As a Mongolian-speaking staff member, I want the application UI to display in Mongolian, so that I can use the inventory system in my native language without confusion.

#### Acceptance Criteria

1. THE System SHALL provide Mongolian (`mn`) and English (`en`) as the two supported Locales.
2. WHEN the active Locale is `mn`, THE System SHALL render all UI labels, navigation items, button text, form field labels, error messages, and status indicators in Mongolian.
3. WHEN the active Locale is `en`, THE System SHALL render all UI text in English, preserving the current behavior.
4. THE System SHALL expose a language switcher control in the sidebar that allows a Member to toggle between `mn` and `en` at any time.
5. WHEN a Member selects a Locale via the language switcher, THE System SHALL persist the Language_Preference to the database and apply the new Locale immediately without a full page reload.
6. WHEN an authenticated Member loads any page, THE System SHALL read the Member's Language_Preference from the database and apply the corresponding Locale before rendering.
7. IF a Member has no stored Language_Preference, THEN THE System SHALL default to `en`.
8. THE System SHALL store all translatable strings in structured locale files (one per Locale) so that adding a new language requires only adding a new locale file.

---

### Requirement 2: MNT Currency Formatting

**User Story:** As a Mongolian business owner, I want product prices displayed in Mongolian Tugrik (₮), so that I can read inventory values in the currency I use daily.

#### Acceptance Criteria

1. WHEN the active Locale is `mn`, THE System SHALL format all monetary values using the MNT symbol (₮) with no decimal places, placing the symbol before the numeric value (e.g., ₮12,500).
2. WHEN the active Locale is `en`, THE System SHALL format monetary values using the existing format (numeric value with two decimal places, no currency symbol).
3. THE Currency_Formatter SHALL format any non-negative numeric value into its locale-appropriate display string.
4. THE Pretty_Printer SHALL convert a formatted MNT display string back into a plain numeric value for storage and computation.
5. FOR ALL non-negative numeric values, formatting then parsing SHALL produce the original numeric value (round-trip property).
6. IF a monetary value is negative, THEN THE Currency_Formatter SHALL return a descriptive error rather than producing a display string.

---

### Requirement 3: Language Preference Persistence

**User Story:** As a returning user, I want my language preference remembered across sessions, so that I do not have to re-select my language every time I sign in.

#### Acceptance Criteria

1. THE System SHALL store the Language_Preference as a field on the Member record in the database, scoped to the Member's Organization.
2. WHEN a Member's Language_Preference is updated, THE System SHALL invalidate the Cache entry for that Member's Organization_Context so that subsequent page loads reflect the new Locale.
3. WHEN a Member's Language_Preference is updated, THE System SHALL respond within 500ms under normal load.
4. IF the stored Language_Preference value is not a recognized Locale, THEN THE System SHALL fall back to `en` and log a warning.

---

### Requirement 4: Low Stock Alerts

**User Story:** As a manager, I want to be notified when a product's quantity falls below its low-stock threshold, so that I can reorder inventory before it runs out.

#### Acceptance Criteria

1. WHEN a Product's quantity is updated and the new quantity is at or below the Product's `lowStockAt` value, THE System SHALL create a Low_Stock_Alert scoped to the Product's Organization.
2. WHEN a Low_Stock_Alert is created, THE System SHALL record the Product ID, Product name, current quantity, `lowStockAt` threshold, and creation timestamp on the Alert record.
3. THE System SHALL associate every Alert with exactly one Organization via a non-nullable `organizationId` foreign key.
4. IF a Product does not have a `lowStockAt` value set, THEN THE System SHALL not create a Low_Stock_Alert for that Product regardless of its quantity.
5. IF a Low_Stock_Alert with Alert_Status `UNREAD` already exists for the same Product within the Organization, THEN THE System SHALL not create a duplicate Alert.
6. WHEN a Product's quantity is updated to a value above its `lowStockAt` threshold, THE System SHALL automatically dismiss any existing UNREAD Low_Stock_Alert for that Product.

---

### Requirement 5: Anomaly Detection Alerts

**User Story:** As a manager, I want to be alerted when a product's stock drops suddenly, so that I can investigate potential theft, data entry errors, or unexpected consumption.

#### Acceptance Criteria

1. WHEN a Product's quantity is updated and the quantity decrease exceeds 50% of the previous quantity in a single update, THE System SHALL create an Anomaly_Alert scoped to the Product's Organization.
2. WHEN an Anomaly_Alert is created, THE System SHALL record the Product ID, Product name, previous quantity, new quantity, percentage drop, and creation timestamp on the Alert record.
3. IF the previous quantity is zero, THEN THE System SHALL not evaluate the anomaly condition for that update (division by zero guard).
4. IF the quantity increases or remains the same, THEN THE System SHALL not create an Anomaly_Alert.
5. WHEN an Anomaly_Alert is created, THE System SHALL invalidate the Cache key `org:{organizationId}:alerts:unread_count` so that the Alert_Bell reflects the new count immediately.

---

### Requirement 6: Alert Notification Bell

**User Story:** As a staff member, I want to see a notification badge on the alert bell showing how many unread alerts exist, so that I know at a glance whether anything requires my attention.

#### Acceptance Criteria

1. THE System SHALL display an Alert_Bell icon in the sidebar for all authenticated Members.
2. WHEN the Organization has one or more Alerts with Alert_Status `UNREAD`, THE System SHALL display a numeric badge on the Alert_Bell showing the total count of UNREAD Alerts for the Organization.
3. WHEN the Organization has no UNREAD Alerts, THE System SHALL display the Alert_Bell without a badge.
4. THE System SHALL cache the UNREAD Alert count under the key `org:{organizationId}:alerts:unread_count` with a TTL of 60 seconds.
5. WHEN a Member marks an Alert as dismissed, THE System SHALL invalidate the Cache key `org:{organizationId}:alerts:unread_count` so that the badge count updates on the next page load.
6. THE System SHALL render the Alert_Bell count within 200ms of page load under normal conditions.

---

### Requirement 7: Alert History Page

**User Story:** As a manager, I want to view a history of all alerts for my organization, so that I can review past stock events and track patterns over time.

#### Acceptance Criteria

1. THE System SHALL provide an alert history page accessible to all Members of the Organization at the route `/alerts`.
2. WHEN a Member navigates to the alert history page, THE System SHALL display all Alerts for the Organization ordered by creation timestamp descending.
3. WHEN displaying an Alert, THE System SHALL show the Alert type (Low_Stock_Alert or Anomaly_Alert), Product name, relevant quantities, Alert_Status, and creation timestamp.
4. THE System SHALL paginate the alert history list, displaying a maximum of 20 Alerts per page.
5. WHEN the active Locale is `mn`, THE System SHALL render all alert labels, status text, and timestamps on the alert history page in Mongolian.

---

### Requirement 8: Mark Alerts as Read or Dismissed

**User Story:** As a staff member, I want to mark alerts as dismissed after I have reviewed them, so that the notification count stays accurate and I can focus on new alerts.

#### Acceptance Criteria

1. WHEN a Member submits a dismiss action for an Alert, THE System SHALL set the Alert's Alert_Status to `DISMISSED` and record the dismissing Member's ID and dismissal timestamp.
2. WHEN an Alert is dismissed, THE System SHALL invalidate the Cache key `org:{organizationId}:alerts:unread_count`.
3. IF the Alert does not belong to the requesting Member's Organization_Context, THEN THE System SHALL return a not-found response without revealing that the Alert exists in another Organization.
4. IF the Alert already has Alert_Status `DISMISSED`, THEN THE System SHALL accept the request idempotently and return a success response without modifying the record.
5. THE System SHALL allow a Member to dismiss all UNREAD Alerts for the Organization in a single bulk action.
6. WHEN a bulk dismiss action is submitted, THE System SHALL set Alert_Status to `DISMISSED` on all UNREAD Alerts for the Organization and invalidate the Cache key `org:{organizationId}:alerts:unread_count`.

---

### Requirement 9: Staff Action Tracking

**User Story:** As a manager, I want the system to track which staff members are performing inventory actions, so that I can measure team engagement and reward top contributors.

#### Acceptance Criteria

1. WHEN a Member creates a Product, THE System SHALL record a Staff_Action of type `PRODUCT_CREATED` attributed to that Member and scoped to the Organization.
2. WHEN a Member updates a Product, THE System SHALL record a Staff_Action of type `PRODUCT_UPDATED` attributed to that Member and scoped to the Organization.
3. WHEN a Member views the inventory list page, THE System SHALL record a Staff_Action of type `INVENTORY_CHECKED` attributed to that Member and scoped to the Organization.
4. THE System SHALL associate every Staff_Action with exactly one Organization via a non-nullable `organizationId` foreign key and exactly one Member via a non-nullable `memberId` foreign key.
5. WHEN a Staff_Action is recorded, THE System SHALL invalidate the Cache key `org:{organizationId}:leaderboard` so that the Leaderboard reflects the new Points on the next load.
6. THE System SHALL record Staff_Actions asynchronously so that the primary inventory operation (create, update, view) is not blocked by action tracking.

---

### Requirement 10: Points System

**User Story:** As a staff member, I want to earn points for my inventory contributions, so that I feel recognized for my work and motivated to stay engaged.

#### Acceptance Criteria

1. THE System SHALL award 10 Points for each `PRODUCT_CREATED` Staff_Action.
2. THE System SHALL award 5 Points for each `PRODUCT_UPDATED` Staff_Action.
3. THE System SHALL award 1 Point for each `INVENTORY_CHECKED` Staff_Action.
4. THE Points_Calculator SHALL compute a Member's total Points by summing the point values of all Staff_Actions attributed to that Member within the Organization.
5. FOR ALL sequences of Staff_Actions attributed to a Member, the total Points computed SHALL equal the sum of the individual point values of each action (additive invariant).
6. WHEN a Member's Points total changes, THE System SHALL invalidate the Cache key `org:{organizationId}:leaderboard`.

---

### Requirement 11: Leaderboard

**User Story:** As an org member, I want to see a leaderboard of top contributors in my organization, so that I can see how I rank compared to my teammates.

#### Acceptance Criteria

1. THE System SHALL provide a leaderboard page accessible to all Members of the Organization at the route `/leaderboard`.
2. WHEN a Member navigates to the leaderboard page, THE System SHALL display the top 10 Members ranked by total Points within the Organization, showing each Member's display name, Points total, and rank.
3. THE System SHALL cache the Leaderboard data under the key `org:{organizationId}:leaderboard` with a TTL of 60 seconds.
4. WHEN the Leaderboard Cache is invalidated, THE System SHALL recompute the Leaderboard from the database on the next request and repopulate the Cache.
5. IF two Members have equal Points, THE System SHALL rank them by the timestamp of their most recent Staff_Action ascending (earlier activity ranks higher).
6. WHEN the active Locale is `mn`, THE System SHALL render all Leaderboard labels and rank indicators in Mongolian.
7. THE System SHALL display the requesting Member's own rank on the leaderboard page even if they are not in the top 10.

---

### Requirement 12: Badges

**User Story:** As a staff member, I want to earn badges for reaching milestones, so that I have visible recognition of my achievements within the organization.

#### Acceptance Criteria

1. THE System SHALL define the following Badge_Types and their award conditions:
   - `FIRST_PRODUCT`: awarded when a Member's `PRODUCT_CREATED` Staff_Action count reaches 1.
   - `HUNDRED_UPDATES`: awarded when a Member's `PRODUCT_UPDATED` Staff_Action count reaches 100.
   - `TOP_PERFORMER`: awarded when a Member holds the highest Points total in the Organization at the time of any Leaderboard recomputation.
   - `INVENTORY_CHECKER`: awarded when a Member's `INVENTORY_CHECKED` Staff_Action count reaches 50.
2. WHEN a Staff_Action is recorded and the recording Member meets the award condition for a Badge_Type they do not yet hold, THE System SHALL create a Badge record attributed to that Member and scoped to the Organization.
3. THE System SHALL associate every Badge with exactly one Organization via a non-nullable `organizationId` foreign key and exactly one Member via a non-nullable `memberId` foreign key.
4. IF a Member already holds a Badge of a given Badge_Type within the Organization, THEN THE System SHALL not create a duplicate Badge for that Member and Badge_Type.
5. WHEN a Badge is awarded, THE System SHALL invalidate the Cache key `org:{organizationId}:leaderboard` so that the badge display updates on the next Leaderboard load.
6. THE System SHALL display all Badges held by a Member on the leaderboard page next to that Member's name.
7. WHEN the active Locale is `mn`, THE System SHALL render all Badge names and descriptions in Mongolian.

---

### Requirement 13: Performance and Caching Constraints

**User Story:** As a developer, I want all new features to use the existing Redis caching patterns, so that the application's performance is not degraded by the additional data queries.

#### Acceptance Criteria

1. THE System SHALL namespace all new Cache keys with the `organizationId` prefix following the pattern `org:{organizationId}:{feature}:{key}`.
2. WHEN any cached data is modified by a mutation (alert dismissed, Staff_Action recorded, Badge awarded), THE System SHALL invalidate the relevant Cache keys using the existing `invalidateCache` utility.
3. THE System SHALL set a TTL of 60 seconds on all new Cache entries unless a shorter TTL is specified in these requirements.
4. IF the Redis Cache is unavailable, THE System SHALL fall back to direct database queries and continue operating without error, following the existing pattern in `getCached`.
5. THE System SHALL not introduce any synchronous database queries on the critical path of the `createProduct` or `updateProduct` Server Actions beyond what is required for data integrity; Points and Badge evaluation SHALL be performed asynchronously.

---

### Requirement 14: Org-Scoped Data Isolation for New Models

**User Story:** As a platform operator, I want all new data models to enforce org-scoping, so that alerts, leaderboard data, and badges from one organization are never visible to members of another organization.

#### Acceptance Criteria

1. THE System SHALL include a non-nullable `organizationId` foreign key on the Alert, Staff_Action, and Badge models, referencing the Organization table with cascade delete.
2. WHEN a Member queries Alerts, Staff_Actions, Leaderboard data, or Badges, THE System SHALL scope all database queries to the Member's Organization_Context.
3. IF a request references an Alert, Staff_Action, or Badge that does not belong to the requesting Member's Organization_Context, THEN THE System SHALL return a not-found response without revealing that the record exists in another Organization.
4. WHEN an Organization is deleted, THE System SHALL cascade-delete all associated Alerts, Staff_Actions, and Badges via the database foreign key constraint.
