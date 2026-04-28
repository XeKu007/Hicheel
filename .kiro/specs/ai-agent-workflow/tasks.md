# Implementation Plan: AI Agent Workflow

## Overview

Implement four interconnected AI-powered capabilities on top of the existing Next.js 15 / Prisma / Redis / Stack Auth stack: an AI Assistant Chat Interface, an Automated Workflow Engine, a Reorder Suggestion Engine, and an Autonomous AI Agent. All features are org-scoped and follow existing patterns.

## Tasks

- [x] 1. Database schema and migrations
  - Add new enums (`WorkflowTriggerType`, `WorkflowActionType`, `WorkflowRunStatus`, `ConditionResult`, `InsightType`, `InsightSeverity`, `AgentRunStatus`) to `prisma/schema.prisma`
  - Add new models: `ChatSession`, `ChatMessage`, `WorkflowRule`, `WorkflowRun`, `ConsumptionRecord`, `ReorderSuggestion`, `AgentInsight`, `AgentRun` with all `organizationId` foreign keys and cascade deletes
  - Add `Organization` relations for all new models
  - Run `prisma migrate dev` to generate and apply the migration
  - _Requirements: 3.1, 4.7, 6.1, 6.5, 8.3, 8.11, 11.1, 11.4_

- [x] 2. AI provider factory and rate limiting
  - [x] 2.1 Create `lib/ai/provider.ts` implementing `getAIModel()` that reads `AI_PROVIDER`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` from env and returns the appropriate Vercel AI SDK model instance
    - Default to `openai` with a startup warning if `AI_PROVIDER` is unrecognized
    - Throw a descriptive error if the required API key is missing
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [x] 2.2 Write unit tests for `getAIModel()`
    - Test OpenAI default, Anthropic selection, missing key error, unknown provider warning
    - _Requirements: 10.1–10.5_

- [x] 3. Read Tool_Calls
  - [x] 3.1 Create `lib/ai/tools/read.ts` implementing the five read tools (`countProducts`, `listLowStockProducts`, `getProductByName`, `listTopValueProducts`, `getInventorySummary`) using Vercel AI SDK `tool()` with Zod schemas, all scoped to `organizationId`
    - Return structured error to LLM on Zod validation failure
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 3.2 Write property test for Tool_Call idempotence (Property 1)
    - **Property 1: Tool_Call Idempotence**
    - **Validates: Requirements 2.6**

  - [x] 3.3 Write property test for Tool_Call org isolation (Property 2)
    - **Property 2: Tool_Call Org Isolation**
    - **Validates: Requirements 1.6, 2.2, 11.2**

- [-] 4. Chat session persistence and API route
  - [x] 4.1 Create `lib/actions/ai/chat.ts` with helpers to create/load `ChatSession` and persist `ChatMessage` records, scoped to org context; implement cache read/write under `org:{id}:member:{mid}:chat:recent` (TTL 300s) with invalidation on new message
    - Auto-create session on first message if none exists
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x] 4.2 Create `app/api/ai/chat/route.ts` POST handler that calls `getOrgContext()`, enforces rate limit (60/org/hr), loads last 20 messages, calls `streamText()` with read tools (always) + write tools (MANAGER+ only), streams SSE response, and persists messages after stream completes
    - Return 429 with `{ error, resetsAt }` on rate limit exceeded
    - Wrap `streamText` in try/catch; return safe error message on AI provider failure
    - _Requirements: 1.1, 1.2, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12_

  - [x] 4.3 Write property test for chat message persistence round-trip (Property 3)
    - **Property 3: Chat Message Persistence Round-Trip**
    - **Validates: Requirements 1.8, 3.1, 3.3**

  - [x] 4.4 Write property test for chat history bounded at 20 (Property 4)
    - **Property 4: Chat History Bounded at 20**
    - **Validates: Requirements 1.9**

  - [x] 4.5 Write property test for rate limit enforcement (Property 5)
    - **Property 5: Rate Limit Enforcement**
    - **Validates: Requirements 1.11**

  - [x] 4.6 Write unit tests for chat route
    - Test: new session created on first message, cache key invalidated after save, AI provider error returns safe message, streaming delivers chunked SSE
    - _Requirements: 3.2, 3.5, 1.10, 1.7_

- [x] 5. Chat UI page
  - Create `app/ai/page.tsx` (server component) and `app/ai/client.tsx` (client component) implementing the streaming chat interface using Vercel AI SDK `useChat` hook
  - Display last 20 messages on load; stream partial responses progressively
  - Show rate limit error with reset time on 429; show safe error message on provider failure
  - Accessible to all authenticated Members
  - _Requirements: 1.1, 1.3, 1.4, 1.7, 1.9, 1.10, 1.12_

- [ ] 6. Write Tool_Calls with confirmation flow
  - [x] 6.1 Create `lib/ai/tools/write.ts` implementing `createProduct`, `updateProduct`, `deleteProduct` tools with Zod validation; check MANAGER+ role inside each tool before any DB mutation; call `writeAuditLog` and invalidate `org:{id}:dashboard` and `org:{id}:inventory:*` on success
    - Return structured error to LLM if role is STAFF or input is invalid
    - _Requirements: 13.1, 13.2, 13.6, 13.7, 13.8, 13.9, 13.10, 13.12_

  - [x] 6.2 Update the system prompt in `app/api/ai/chat/route.ts` to instruct the model to detect write intent, present a bilingual confirmation prompt, and only invoke write tools after explicit user confirmation
    - _Requirements: 13.3, 13.4, 13.5, 13.11_

  - [x] 6.3 Write property test for write tool role enforcement (Property 17)
    - **Property 17: Write Tool_Call Role Enforcement**
    - **Validates: Requirements 13.2**

  - [x] 6.4 Write property test for write tool audit log (Property 18)
    - **Property 18: Write Tool_Call Audit Log**
    - **Validates: Requirements 13.7**

  - [x] 6.5 Write property test for write tool cache invalidation (Property 19)
    - **Property 19: Write Tool_Call Cache Invalidation**
    - **Validates: Requirements 13.12**

  - [x] 6.6 Write property test for createProduct input validation (Property 20)
    - **Property 20: createProduct Input Validation**
    - **Validates: Requirements 13.9, 13.10**

- [x] 7. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Workflow rule validation
  - [x] 8.1 Create `lib/ai/workflow-validation.ts` with a `validateWorkflowRule` function using Zod + `cron-parser`; validate trigger type enum, cron expression syntax, email format, and HTTPS webhook URL; return descriptive field-level errors without persisting on failure
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 8.2 Write property test for cron expression validation round-trip (Property 6)
    - **Property 6: Cron Expression Validation Round-Trip**
    - **Validates: Requirements 5.2, 5.6**

  - [x] 8.3 Write property test for workflow validation rejects invalid inputs (Property 7)
    - **Property 7: Workflow Validation Rejects Invalid Inputs**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**

- [ ] 9. Workflow engine server actions and cron route
  - [x] 9.1 Create `lib/actions/ai/workflows.ts` with Server Actions for CRUD on `WorkflowRule` (create, update, toggle enabled, delete, list with last 50 runs); integrate `validateWorkflowRule`; scope all queries to org context
    - _Requirements: 4.1, 4.2, 4.9, 4.10, 4.11, 4.12_

  - [x] 9.2 Implement `evaluateWorkflowRules(organizationId, triggerType, context)` in `lib/actions/ai/workflows.ts` that loads enabled rules matching the trigger, evaluates conditions, executes actions, and records a `WorkflowRun` for every evaluation regardless of outcome; catch per-rule action failures and continue
    - Call from `maybeCreateAlerts()` for `ANOMALY_DETECTED` trigger and from product mutation actions for `QUANTITY_BELOW`/`QUANTITY_ABOVE`
    - _Requirements: 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [x] 9.3 Create `app/api/workflows/run/route.ts` POST handler protected by `CRON_SECRET` header that triggers cron-scheduled workflow rules for all orgs
    - _Requirements: 4.3, 12.3_

  - [x] 9.4 Write property test for workflow run always recorded (Property 8)
    - **Property 8: Workflow Run Always Recorded**
    - **Validates: Requirements 4.7**

  - [x] 9.5 Write property test for workflow failure isolation (Property 9)
    - **Property 9: Workflow Failure Isolation**
    - **Validates: Requirements 4.8**

- [x] 10. Workflow management UI
  - Create `app/workflows/page.tsx` (server component, MANAGER+ only) and `app/workflows/client.tsx` (client component) with a form to create/edit/toggle/delete `WorkflowRule` records and a table showing the last 50 `WorkflowRun` records per rule
  - Return 403 for STAFF role
  - _Requirements: 4.1, 4.2, 4.9, 4.12_

- [ ] 11. Consumption record tracking
  - [x] 11.1 Update `lib/actions/products.ts` (`updateProduct`, `dispatchProduct`, `adjustQuantity`) to create a `ConsumptionRecord` whenever `newQty < previousQty`, with `consumed = previousQty - newQty`
    - _Requirements: 6.1_

  - [x] 11.2 Write property test for consumption record created on quantity decrease (Property 10)
    - **Property 10: Consumption Record Created on Quantity Decrease**
    - **Validates: Requirements 6.1**

- [ ] 12. Reorder suggestion engine
  - [x] 12.1 Create `lib/actions/ai/reorder.ts` implementing `computeReorderSuggestions(organizationId)`: read `ConsumptionRecord` for last 30 days per product, skip products with fewer than 3 records, compute `dailyRate` and `daysUntilStockout`, generate `ReorderSuggestion` for products where `daysUntilStockout <= 14` with `suggestedReorderQty = ceil(30 × dailyRate)`; cache under `org:{id}:reorder:suggestions` (TTL 3600s); invalidate on product quantity update
    - _Requirements: 6.2, 6.3, 6.4, 6.5, 6.9, 6.10, 6.11, 6.12_

  - [x] 12.2 Write property test for days-until-stockout invariant (Property 11)
    - **Property 11: Days-Until-Stockout Invariant**
    - **Validates: Requirements 6.3, 6.12**

  - [x] 12.3 Write property test for reorder suggestion threshold (Property 12)
    - **Property 12: Reorder Suggestion Threshold**
    - **Validates: Requirements 6.4, 6.5**

  - [x] 12.4 Write property test for insufficient data guard (Property 13)
    - **Property 13: Insufficient Data Guard**
    - **Validates: Requirements 6.11**

- [ ] 13. Reorder AI explanations and refresh cron
  - [x] 13.1 Add `generateReorderExplanation(organizationId, productId, suggestion)` to `lib/actions/ai/reorder.ts` that calls the AI provider with consumption context; cache per product under `org:{id}:reorder:explanation:{productId}` (TTL 3600s); fall back to `null` with a UI fallback message if provider is unavailable
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 13.2 Create `app/api/reorder/refresh/route.ts` POST handler protected by `CRON_SECRET` that calls `computeReorderSuggestions` for all orgs and invalidates the suggestions cache
    - _Requirements: 6.8, 12.3_

- [x] 14. Reorder suggestions UI
  - Create `app/reorder/page.tsx` (server component, MANAGER+ only) and `app/reorder/client.tsx` displaying `ReorderSuggestion` records ordered by `daysUntilStockout` ascending, with AI explanation or fallback message per suggestion
  - Return 403 for STAFF role
  - _Requirements: 6.6, 6.7, 7.1, 7.4_

- [x] 15. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 16. Autonomous agent — severity classification and insight generation
  - [x] 16.1 Create `lib/actions/ai/agent.ts` implementing `classifyInsightSeverity(type, daysUntilStockout?, spikePercent?)` pure function and `runAgentScan(organizationId)` that scans all products, evaluates the three conditions (stockout ≤7 days, anomaly spike >50%, dead stock >30 days), classifies severity per Requirements 9.1–9.5, calls AI provider for descriptions (falls back to rule-based text if unavailable), and persists `AgentInsight` records and an `AgentRun` log entry
    - _Requirements: 8.2, 8.3, 8.4, 8.10, 8.11, 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 16.2 Write property test for agent severity classification — stockout (Property 14)
    - **Property 14: Agent Severity Classification — Stockout**
    - **Validates: Requirements 9.1, 9.3**

  - [x] 16.3 Write property test for agent severity classification — anomaly spike (Property 15)
    - **Property 15: Agent Severity Classification — Anomaly Spike**
    - **Validates: Requirements 9.2, 9.4**

  - [x] 16.4 Write property test for dead stock severity (Property 16)
    - **Property 16: Dead Stock Severity**
    - **Validates: Requirements 9.5**

- [x] 17. Autonomous agent cron route and resolve action
  - [x] 17.1 Create `app/api/agent/run/route.ts` POST handler protected by `CRON_SECRET` that calls `runAgentScan` for all orgs
    - _Requirements: 8.1, 12.3_

  - [x] 17.2 Add `resolveAgentInsight(insightId)` Server Action in `lib/actions/ai/agent.ts` that marks the insight resolved, records resolver member ID and timestamp, and invalidates `org:{id}:agent:insights`
    - _Requirements: 8.7, 8.8_

- [x] 18. Agent insights UI
  - Create `app/agent/page.tsx` (server component, MANAGER+ only) and `app/agent/client.tsx` displaying unresolved `AgentInsight` records ordered by severity desc then timestamp desc; render HIGH severity with `var(--red)` and MEDIUM with `var(--amber)`; include a resolve button per insight
  - Return 403 for STAFF role
  - _Requirements: 8.5, 8.6, 8.7, 9.6_

- [ ] 19. Update `vercel.json` and sidebar
  - [x] 19.1 Add the two new cron entries to `vercel.json`: `{ "path": "/api/agent/run", "schedule": "0 */6 * * *" }` and `{ "path": "/api/reorder/refresh", "schedule": "0 2 * * *" }`
    - _Requirements: 8.1, 6.8_

  - [x] 19.2 Update `components/sidebar.tsx` to add an "AI" section with four nav items: `/ai` (MessageSquare, all roles), `/workflows` (GitBranch, MANAGER+), `/reorder` (RefreshCw, MANAGER+), `/agent` (Bot, MANAGER+) using icons from `lucide-react`
    - _Requirements: 1.1, 4.1, 6.6, 8.5_

- [x] 20. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests use **fast-check** (TypeScript-native); tag each test with `// Feature: ai-agent-workflow, Property N: <text>`
- All AI provider calls are server-side only — never expose API keys to the client
- Background job routes (`/api/agent/run`, `/api/reorder/refresh`, `/api/workflows/run`) must validate the `CRON_SECRET` header before executing
