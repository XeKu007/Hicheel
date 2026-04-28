# Requirements Document

## Introduction

This feature adds an AI-powered intelligence layer to the StockFlow inventory management application. It encompasses four capabilities: a natural-language chat assistant for querying inventory data (supporting both English and Mongolian), an automated workflow engine that executes Trigger → Condition → Action rules, an AI-driven reorder prediction engine based on historical consumption patterns, and a full autonomous AI agent that monitors inventory, detects anomalies, and surfaces actionable decisions. All features are org-scoped, follow existing Redis caching patterns (`org:{id}:*`), use `getOrgContext()` for authentication, Prisma for persistence, and Server Actions for mutations. The AI layer integrates with OpenAI or Anthropic via the Vercel AI SDK.

---

## Glossary

- **System**: The StockFlow inventory management application as a whole.
- **Organization**: A tenant entity representing a single company; all AI data is scoped to an Organization.
- **Organization_Context**: The currently active Organization resolved from the authenticated session via `getOrgContext()`.
- **Member**: A user who belongs to an Organization with an assigned Role (`SUPER_ADMIN`, `MANAGER`, or `STAFF`).
- **AI_Assistant**: The conversational chat interface that accepts natural-language queries about inventory and returns structured answers.
- **Chat_Session**: A sequence of Message records belonging to one Member within one Organization, persisted in the database.
- **Message**: A single turn in a Chat_Session — either a user query or an AI response.
- **Tool_Call**: A structured function invocation made by the AI_Assistant to query the database (e.g., count products, list low-stock items).
- **Workflow_Engine**: The rule execution subsystem that evaluates Workflow_Rules on a schedule or in response to inventory events.
- **Workflow_Rule**: A user-defined automation consisting of a Trigger, an optional Condition, and one or more Actions.
- **Trigger**: The event or schedule that initiates evaluation of a Workflow_Rule (e.g., `QUANTITY_BELOW`, `CRON_SCHEDULE`).
- **Condition**: An optional filter expression evaluated after a Trigger fires; the Action is only executed if the Condition is satisfied.
- **Action**: The operation performed when a Workflow_Rule fires (e.g., `SEND_EMAIL`, `CREATE_ALERT`, `GENERATE_REPORT`).
- **Workflow_Run**: A single execution record of a Workflow_Rule, capturing trigger time, condition result, action outcome, and status.
- **Reorder_Engine**: The subsystem that analyses historical consumption data and produces Reorder_Suggestions.
- **Consumption_Record**: A snapshot of a Product's quantity change recorded at the time of each inventory update, used as input to the Reorder_Engine.
- **Reorder_Suggestion**: A system-generated recommendation to reorder a specific Product, including predicted days-until-stockout and suggested order quantity.
- **Autonomous_Agent**: The background AI process that periodically scans inventory, detects anomalies, and generates Agent_Insights without user initiation.
- **Agent_Insight**: A structured recommendation or observation produced by the Autonomous_Agent (e.g., "Product X will stock out in 3 days", "Unusual spike in Product Y consumption").
- **AI_Provider**: The external LLM service used for natural-language processing — either OpenAI (`gpt-4o`) or Anthropic (`claude-3-5-sonnet`), configurable per Organization.
- **Vercel_AI_SDK**: The `ai` npm package used to stream LLM responses and define Tool_Calls in a provider-agnostic way.
- **Rate_Limit**: A per-Organization cap on AI API calls enforced via the existing Upstash Redis rate-limiting utility.
- **Cache**: The Upstash Redis cache layer used to reduce database and AI API load.
- **Pretty_Printer**: A formatting function that serializes a structured AI response or report back into a human-readable string.

---

## Requirements

### Requirement 1: AI Assistant Chat Interface

**User Story:** As a staff member, I want to ask natural-language questions about my inventory in English or Mongolian, so that I can get instant answers without navigating multiple pages.

#### Acceptance Criteria

1. THE System SHALL provide a chat interface accessible to all authenticated Members at the route `/ai`.
2. WHEN a Member submits a natural-language query, THE AI_Assistant SHALL return a response within 10 seconds under normal load.
3. THE AI_Assistant SHALL support queries in both English and Mongolian, detecting the query language automatically and responding in the same language.
4. THE AI_Assistant SHALL support at minimum the following query intents:
   - Count products matching a name or category (e.g., "jade бараа хэдтэй байна?")
   - List products below a stock threshold (e.g., "low stock байгаа бараануудыг жагсаа")
   - Retrieve the current quantity of a named product
   - List the top N most valuable products by total stock value
   - Summarize overall inventory health (total SKUs, total value, low-stock count)
5. THE AI_Assistant SHALL resolve each query intent by invoking the appropriate Tool_Call against the Organization's Prisma data, scoped to the Organization_Context.
6. WHEN a Tool_Call is invoked, THE System SHALL scope all database queries to the requesting Member's `organizationId` so that data from other Organizations is never returned.
7. THE System SHALL stream AI_Assistant responses to the client using the Vercel_AI_SDK streaming API so that partial responses are displayed progressively.
8. THE System SHALL persist each Message (user query and AI response) to the database as part of the Member's Chat_Session.
9. WHEN a Member loads the chat interface, THE System SHALL display the last 20 Messages from the Member's most recent Chat_Session.
10. IF the AI_Provider returns an error, THEN THE AI_Assistant SHALL display a descriptive error message to the Member without exposing internal API keys or stack traces.
11. THE System SHALL enforce a Rate_Limit of 60 AI_Assistant requests per Organization per hour using the existing Upstash rate-limiting utility.
12. IF the Rate_Limit is exceeded, THEN THE System SHALL return an HTTP 429 response with a message indicating when the limit resets.

---

### Requirement 2: AI Assistant Tool Definitions

**User Story:** As a developer, I want the AI assistant's database access to be defined as explicit Tool_Calls, so that the LLM cannot access data outside its defined scope and all queries are auditable.

#### Acceptance Criteria

1. THE System SHALL define each Tool_Call as a typed function with a name, description, and Zod-validated input schema registered with the Vercel_AI_SDK `tool()` helper.
2. THE System SHALL implement the following Tool_Calls at minimum:
   - `countProducts`: counts products matching an optional name filter within the Organization
   - `listLowStockProducts`: returns products whose quantity is at or below their `lowStockAt` threshold
   - `getProductByName`: returns a single product's name, SKU, quantity, price, and `lowStockAt` by name (case-insensitive)
   - `listTopValueProducts`: returns the top N products ranked by `price × quantity` descending
   - `getInventorySummary`: returns total SKU count, total inventory value, low-stock count, and out-of-stock count
3. WHEN a Tool_Call is executed, THE System SHALL validate all inputs against the Tool_Call's Zod schema before querying the database.
4. IF a Tool_Call input fails validation, THEN THE System SHALL return a structured error to the AI model so it can reformulate the query.
5. THE System SHALL not expose any Tool_Call that allows write operations (create, update, delete) on inventory data through the AI_Assistant interface.
6. FOR ALL valid Tool_Call inputs, executing the same Tool_Call twice with the same inputs and unchanged database state SHALL return equivalent results (idempotence property).

---

### Requirement 3: Chat Session Persistence

**User Story:** As a member, I want my chat history preserved across page reloads, so that I can refer back to previous answers without re-asking questions.

#### Acceptance Criteria

1. THE System SHALL persist Chat_Sessions and Messages in the database, scoped to the Member's `organizationId` and `memberId`.
2. WHEN a Member starts a new conversation, THE System SHALL create a new Chat_Session record with a creation timestamp.
3. WHEN a Message is saved, THE System SHALL record the role (`user` or `assistant`), content text, and creation timestamp.
4. THE System SHALL cache the last 20 Messages of the active Chat_Session under the key `org:{organizationId}:member:{memberId}:chat:recent` with a TTL of 300 seconds.
5. WHEN a new Message is persisted, THE System SHALL invalidate the Cache key `org:{organizationId}:member:{memberId}:chat:recent`.
6. IF a Member has no existing Chat_Session, THEN THE System SHALL create one automatically on the first message submission.
7. THE System SHALL scope all Chat_Session and Message queries to the requesting Member's Organization_Context so that chat history from other Organizations is never returned.

---

### Requirement 4: Automated Workflow Engine

**User Story:** As a manager, I want to create automation rules like "when quantity drops below 5, send an email to the supplier", so that routine inventory responses happen automatically without manual intervention.

#### Acceptance Criteria

1. THE System SHALL provide a workflow management page accessible to Members with `MANAGER` or `SUPER_ADMIN` role at the route `/workflows`.
2. THE System SHALL allow a Member to create a Workflow_Rule by specifying a Trigger type, an optional Condition, and one or more Actions.
3. THE System SHALL support the following Trigger types:
   - `QUANTITY_BELOW`: fires when a Product's quantity falls at or below a specified threshold value
   - `QUANTITY_ABOVE`: fires when a Product's quantity rises above a specified threshold value
   - `CRON_SCHEDULE`: fires on a recurring schedule defined by a cron expression (e.g., weekly report generation)
   - `ANOMALY_DETECTED`: fires when an Anomaly_Alert is created for any Product in the Organization
4. THE System SHALL support the following Action types:
   - `SEND_EMAIL`: sends an email to a specified recipient address with a configurable subject and body template
   - `CREATE_ALERT`: creates an Alert record of type `LOW_STOCK` or `ANOMALY` in the Organization
   - `GENERATE_REPORT`: generates a summary inventory report and stores it as a Workflow_Run artifact
   - `WEBHOOK`: sends an HTTP POST request to a specified URL with a configurable JSON payload
5. WHEN a `QUANTITY_BELOW` or `QUANTITY_ABOVE` Trigger fires, THE Workflow_Engine SHALL evaluate the Condition (if present) against the triggering Product's current data before executing the Action.
6. WHEN a `CRON_SCHEDULE` Trigger fires, THE Workflow_Engine SHALL execute the associated Action regardless of any specific Product state.
7. THE System SHALL record a Workflow_Run for every Trigger evaluation, capturing: Workflow_Rule ID, trigger timestamp, condition evaluation result (`true`, `false`, or `skipped`), action type, action outcome (`SUCCESS` or `FAILURE`), and any error message.
8. IF an Action execution fails, THEN THE Workflow_Engine SHALL record the failure in the Workflow_Run and continue processing other pending Workflow_Rules without halting.
9. THE System SHALL allow a Member to enable or disable a Workflow_Rule without deleting it.
10. WHEN a Workflow_Rule is disabled, THE Workflow_Engine SHALL not evaluate or execute that rule.
11. THE System SHALL scope all Workflow_Rules and Workflow_Runs to the requesting Member's Organization_Context.
12. THE System SHALL display the last 50 Workflow_Runs for each Workflow_Rule on the workflow management page.

---

### Requirement 5: Workflow Rule Validation

**User Story:** As a manager, I want the system to validate my workflow rules before saving them, so that I don't create broken automations that silently fail.

#### Acceptance Criteria

1. WHEN a Member submits a new Workflow_Rule, THE System SHALL validate that the Trigger type is one of the supported values before persisting the rule.
2. WHEN a Member submits a new Workflow_Rule with a `CRON_SCHEDULE` Trigger, THE System SHALL validate that the cron expression is syntactically valid before persisting the rule.
3. WHEN a Member submits a new Workflow_Rule with a `SEND_EMAIL` Action, THE System SHALL validate that the recipient address is a syntactically valid email address before persisting the rule.
4. WHEN a Member submits a new Workflow_Rule with a `WEBHOOK` Action, THE System SHALL validate that the target URL uses the HTTPS scheme before persisting the rule.
5. IF any validation fails, THEN THE System SHALL return a descriptive error message identifying the invalid field without persisting the Workflow_Rule.
6. THE Workflow_Rule_Validator SHALL accept any syntactically valid cron expression and reject any syntactically invalid one (round-trip property: a valid expression parsed and re-serialized SHALL produce an equivalent schedule).

---

### Requirement 6: AI-Powered Reorder Suggestions

**User Story:** As a manager, I want the system to predict when products will run out based on past consumption, so that I can reorder before stockouts occur.

#### Acceptance Criteria

1. THE System SHALL record a Consumption_Record each time a Product's quantity decreases, capturing: Product ID, Organization ID, quantity before, quantity after, quantity consumed (before − after), and timestamp.
2. THE Reorder_Engine SHALL compute a daily consumption rate for each Product by averaging the total quantity consumed over the most recent 30-day window.
3. WHEN the daily consumption rate for a Product is greater than zero, THE Reorder_Engine SHALL compute the predicted days-until-stockout as `current_quantity ÷ daily_consumption_rate`, rounded down to the nearest integer.
4. THE Reorder_Engine SHALL generate a Reorder_Suggestion for any Product whose predicted days-until-stockout is less than or equal to 14.
5. WHEN a Reorder_Suggestion is generated, THE System SHALL record: Product ID, Organization ID, current quantity, daily consumption rate, predicted days-until-stockout, suggested reorder quantity (equal to 30 × daily_consumption_rate, rounded up), and generation timestamp.
6. THE System SHALL provide a reorder suggestions page accessible to Members with `MANAGER` or `SUPER_ADMIN` role at the route `/reorder`.
7. WHEN a Member navigates to the reorder suggestions page, THE System SHALL display all active Reorder_Suggestions for the Organization ordered by predicted days-until-stockout ascending (most urgent first).
8. THE System SHALL refresh Reorder_Suggestions for the Organization once every 24 hours via a scheduled background job.
9. THE System SHALL cache Reorder_Suggestions under the key `org:{organizationId}:reorder:suggestions` with a TTL of 3600 seconds.
10. WHEN a Product's quantity is updated, THE System SHALL invalidate the Cache key `org:{organizationId}:reorder:suggestions` so that the next page load reflects updated predictions.
11. IF a Product has fewer than 3 Consumption_Records in the 30-day window, THEN THE Reorder_Engine SHALL not generate a Reorder_Suggestion for that Product (insufficient data guard).
12. FOR ALL Products with a positive daily consumption rate, the predicted days-until-stockout SHALL satisfy the invariant: `days_until_stockout = floor(current_quantity / daily_consumption_rate)`.

---

### Requirement 7: Reorder Suggestion AI Enhancement

**User Story:** As a manager, I want AI-generated explanations alongside reorder suggestions, so that I understand why the system is recommending a reorder and can make an informed decision.

#### Acceptance Criteria

1. WHEN a Reorder_Suggestion is displayed, THE System SHALL include an AI-generated natural-language explanation describing the consumption trend and the reason for the suggestion.
2. THE System SHALL generate the AI explanation by invoking the AI_Provider with the Product's consumption history summary as context.
3. THE System SHALL cache AI explanations per Reorder_Suggestion under the key `org:{organizationId}:reorder:explanation:{productId}` with a TTL of 3600 seconds.
4. IF the AI_Provider is unavailable, THEN THE System SHALL display the Reorder_Suggestion without an AI explanation and show a fallback message indicating that the explanation is temporarily unavailable.
5. THE System SHALL enforce the same Rate_Limit defined in Requirement 1 across both AI_Assistant and Reorder_Suggestion AI explanation requests.

---

### Requirement 8: Autonomous AI Agent

**User Story:** As a manager, I want an AI agent to autonomously monitor my inventory and surface important decisions, so that I don't have to manually check for issues every day.

#### Acceptance Criteria

1. THE Autonomous_Agent SHALL run on a configurable schedule (default: every 6 hours) as a background job triggered via the existing `/api/digest/run` pattern or a dedicated endpoint.
2. WHEN the Autonomous_Agent runs, THE System SHALL scan all Products in the Organization and evaluate the following conditions:
   - Products predicted to stock out within 7 days (using Reorder_Engine data)
   - Products with an anomalous consumption spike (>50% drop in a single period, consistent with existing anomaly detection)
   - Products that have had zero consumption for more than 30 days (potential dead stock)
3. WHEN the Autonomous_Agent identifies a condition, THE System SHALL generate an Agent_Insight record containing: Organization ID, insight type, affected Product ID, affected Product name, description, severity (`LOW`, `MEDIUM`, `HIGH`), and generation timestamp.
4. THE Autonomous_Agent SHALL use the AI_Provider to generate a natural-language description for each Agent_Insight, providing context and a recommended action.
5. THE System SHALL provide an agent insights page accessible to Members with `MANAGER` or `SUPER_ADMIN` role at the route `/agent`.
6. WHEN a Member navigates to the agent insights page, THE System SHALL display all unresolved Agent_Insights for the Organization ordered by severity descending, then by generation timestamp descending.
7. THE System SHALL allow a Member to mark an Agent_Insight as resolved, recording the resolving Member's ID and resolution timestamp.
8. WHEN an Agent_Insight is marked resolved, THE System SHALL invalidate the Cache key `org:{organizationId}:agent:insights`.
9. THE System SHALL cache Agent_Insights under the key `org:{organizationId}:agent:insights` with a TTL of 3600 seconds.
10. IF the AI_Provider is unavailable during an agent run, THEN THE Autonomous_Agent SHALL still create Agent_Insight records using rule-based descriptions (without LLM-generated text) and log the provider failure.
11. THE System SHALL record each Autonomous_Agent run in an Agent_Run log, capturing: Organization ID, run start time, run end time, number of insights generated, and status (`SUCCESS` or `FAILURE`).

---

### Requirement 9: Agent Insight Severity Classification

**User Story:** As a manager, I want agent insights classified by severity, so that I can prioritize which issues to address first.

#### Acceptance Criteria

1. THE Autonomous_Agent SHALL assign severity `HIGH` to any Agent_Insight where the affected Product is predicted to stock out within 3 days.
2. THE Autonomous_Agent SHALL assign severity `HIGH` to any Agent_Insight triggered by an anomalous consumption spike exceeding 70% of previous quantity.
3. THE Autonomous_Agent SHALL assign severity `MEDIUM` to any Agent_Insight where the affected Product is predicted to stock out within 4 to 7 days.
4. THE Autonomous_Agent SHALL assign severity `MEDIUM` to any Agent_Insight triggered by an anomalous consumption spike between 50% and 70% of previous quantity.
5. THE Autonomous_Agent SHALL assign severity `LOW` to any Agent_Insight identifying potential dead stock (zero consumption for more than 30 days).
6. WHEN displaying Agent_Insights, THE System SHALL render `HIGH` severity insights with a visually distinct indicator (red) and `MEDIUM` severity with amber, consistent with the existing `var(--red)` and `var(--amber)` CSS variables in `globals.css`.

---

### Requirement 10: AI Provider Configuration

**User Story:** As a super admin, I want to configure which AI provider and model the system uses, so that I can control costs and switch providers without code changes.

#### Acceptance Criteria

1. THE System SHALL read the AI_Provider selection from environment variables (`AI_PROVIDER`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`) at startup.
2. WHEN `AI_PROVIDER` is set to `openai`, THE System SHALL use the `gpt-4o` model via the Vercel_AI_SDK OpenAI provider.
3. WHEN `AI_PROVIDER` is set to `anthropic`, THE System SHALL use the `claude-3-5-sonnet-20241022` model via the Vercel_AI_SDK Anthropic provider.
4. IF `AI_PROVIDER` is not set or is set to an unrecognized value, THEN THE System SHALL default to `openai` and log a warning at startup.
5. IF the required API key for the configured AI_Provider is not present in the environment, THEN THE System SHALL throw a descriptive startup error identifying the missing variable.
6. THE System SHALL not expose AI API keys to the client — all AI_Provider calls SHALL be made exclusively from server-side code (Server Actions or API Route Handlers).

---

### Requirement 11: Org-Scoped Data Isolation for AI Models

**User Story:** As a platform operator, I want all AI-generated data to enforce org-scoping, so that chat history, workflow rules, reorder suggestions, and agent insights from one organization are never visible to members of another.

#### Acceptance Criteria

1. THE System SHALL include a non-nullable `organizationId` foreign key on the Chat_Session, Message, Workflow_Rule, Workflow_Run, Consumption_Record, Reorder_Suggestion, Agent_Insight, and Agent_Run models, referencing the Organization table with cascade delete.
2. WHEN a Member queries any AI-related data, THE System SHALL scope all database queries to the Member's Organization_Context.
3. IF a request references a Chat_Session, Workflow_Rule, Reorder_Suggestion, or Agent_Insight that does not belong to the requesting Member's Organization_Context, THEN THE System SHALL return a not-found response without revealing that the record exists in another Organization.
4. WHEN an Organization is deleted, THE System SHALL cascade-delete all associated Chat_Sessions, Messages, Workflow_Rules, Workflow_Runs, Consumption_Records, Reorder_Suggestions, Agent_Insights, and Agent_Runs via the database foreign key constraint.

---

### Requirement 12: Performance and Caching for AI Features

**User Story:** As a developer, I want all AI features to follow the existing caching and performance patterns, so that AI workloads do not degrade the core inventory application.

#### Acceptance Criteria

1. THE System SHALL namespace all new Cache keys with the `organizationId` prefix following the pattern `org:{organizationId}:{feature}:{key}`.
2. THE System SHALL execute all AI_Provider API calls asynchronously and SHALL NOT block the critical path of any inventory mutation (create, update, delete product).
3. THE Autonomous_Agent and Reorder_Engine background jobs SHALL run outside the Next.js request lifecycle, triggered via API route handlers protected by a shared secret header.
4. IF the Redis Cache is unavailable, THE System SHALL fall back to direct database queries and continue operating without error, following the existing pattern in `getCached`.
5. THE System SHALL set a maximum response timeout of 30 seconds on all AI_Provider streaming calls; IF the timeout is exceeded, THEN THE System SHALL close the stream and return a partial response with a timeout indicator.
6. THE System SHALL log the latency of every AI_Provider call to the existing metrics endpoint so that AI response times are observable.


---

### Requirement 13: AI Assistant Product Management

**User Story:** As a manager, I want to add, edit, and delete products through the AI Assistant using natural language in English or Mongolian, so that I can manage inventory without navigating separate pages.

#### Acceptance Criteria

1. WHEN a Member with `MANAGER` or `SUPER_ADMIN` role submits a natural-language product write request, THE AI_Assistant SHALL invoke the appropriate write Tool_Call (`createProduct`, `updateProduct`, or `deleteProduct`) to fulfill the request.
2. IF a Member with `STAFF` role attempts a write Tool_Call (`createProduct`, `updateProduct`, or `deleteProduct`), THEN THE AI_Assistant SHALL reject the request and respond with a message indicating that write operations require `MANAGER` or `SUPER_ADMIN` role.
3. WHEN the AI_Assistant identifies a write operation intent, THE AI_Assistant SHALL present a confirmation prompt to the Member before executing the Tool_Call (e.g., "jade бараа устгах уу? (тийм/үгүй)" / "Delete product jade? (yes/no)").
4. WHEN a Member confirms a write operation, THE AI_Assistant SHALL execute the corresponding Tool_Call and respond in the same language as the Member's original query.
5. WHEN a Member declines a write operation confirmation, THE AI_Assistant SHALL cancel the Tool_Call and acknowledge the cancellation in the same language as the Member's original query.
6. THE System SHALL implement the following write Tool_Calls:
   - `createProduct`: creates a new Product with the specified name, quantity, and price within the Organization_Context
   - `updateProduct`: updates one or more fields (name, quantity, price) of an existing Product identified by name within the Organization_Context
   - `deleteProduct`: deletes an existing Product identified by name within the Organization_Context
7. WHEN a write Tool_Call is executed, THE System SHALL call the existing `writeAuditLog` function to record the operation, capturing: actor Member ID, action type (`CREATE`, `UPDATE`, or `DELETE`), entity type `Product`, entity ID, entity name, and before/after state.
8. IF a write Tool_Call references a Product name that does not exist in the Organization_Context, THEN THE AI_Assistant SHALL respond with a clear not-found message in the same language as the Member's query (e.g., "jade нэртэй бараа олдсонгүй" / "Product named jade was not found").
9. WHEN a `createProduct` Tool_Call is executed, THE System SHALL validate that the name is non-empty, quantity is a non-negative integer, and price is a non-negative number before persisting the Product.
10. IF a `createProduct` Tool_Call input fails validation, THEN THE AI_Assistant SHALL respond with a descriptive error message identifying the invalid field in the same language as the Member's query.
11. THE AI_Assistant SHALL detect the language of the Member's query automatically and respond in the same language (English or Mongolian) for all write operation responses, confirmations, and error messages.
12. WHEN a write Tool_Call completes successfully, THE System SHALL invalidate the Cache keys `org:{organizationId}:dashboard` and `org:{organizationId}:inventory:*` so that subsequent inventory queries reflect the updated state.
