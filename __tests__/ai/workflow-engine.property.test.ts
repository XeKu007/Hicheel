// Feature: ai-agent-workflow, Property 8: Workflow Run Always Recorded
// Feature: ai-agent-workflow, Property 9: Workflow Failure Isolation

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

// ── Mocks ──────────────────────────────────────────────────────────────────

// Mock "use server" — in Node/Vitest this is a no-op string, but we mock
// the modules that the server action depends on.

const mockWorkflowRunCreate = vi.fn();
const mockWorkflowRuleFindMany = vi.fn();
const mockAlertCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workflowRule: {
      findMany: (...args: unknown[]) => mockWorkflowRuleFindMany(...args),
    },
    workflowRun: {
      create: (...args: unknown[]) => mockWorkflowRunCreate(...args),
    },
    alert: {
      create: (...args: unknown[]) => mockAlertCreate(...args),
    },
  },
}));

// Mock getOrgContext — not needed for evaluateWorkflowRules (takes orgId directly)
vi.mock("@/lib/org", () => ({
  getOrgContext: vi.fn(),
}));

vi.mock("@/lib/ai/workflow-validation", () => ({
  validateWorkflowRule: vi.fn().mockReturnValue({ success: true }),
}));

// Import AFTER mocks are set up
import { evaluateWorkflowRules } from "../../lib/actions/ai/workflows";

// ── Helpers ────────────────────────────────────────────────────────────────

type WorkflowActionType = "SEND_EMAIL" | "CREATE_ALERT" | "GENERATE_REPORT" | "WEBHOOK";

function makeRule(overrides: Partial<{
  id: string;
  actionType: WorkflowActionType;
  conditionExpr: string | null;
  actionConfig: Record<string, unknown>;
}> = {}) {
  return {
    id: overrides.id ?? "rule-1",
    organizationId: "org-1",
    name: "Test Rule",
    triggerType: "CRON_SCHEDULE",
    triggerConfig: {},
    conditionExpr: overrides.conditionExpr ?? null,
    actionType: overrides.actionType ?? "SEND_EMAIL",
    actionConfig: overrides.actionConfig ?? { email: "test@example.com" },
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ── Arbitraries ────────────────────────────────────────────────────────────

const orgIdArb = fc.stringMatching(/^org-[a-z0-9]{4,8}$/);
const ruleIdArb = fc.stringMatching(/^rule-[a-z0-9]{4,8}$/);

const actionTypeArb = fc.constantFrom<WorkflowActionType>(
  "SEND_EMAIL",
  "CREATE_ALERT",
  "GENERATE_REPORT"
  // Exclude WEBHOOK to avoid real HTTP calls in tests
);

const conditionExprArb = fc.option(
  fc.constantFrom("quantity < 10", "quantity > 100", "status = active"),
  { nil: null }
);

// ── Property 8: Workflow Run Always Recorded ───────────────────────────────

describe("Property 8: Workflow Run Always Recorded", () => {
  /**
   * Validates: Requirements 4.7
   *
   * For any Workflow_Rule trigger evaluation (regardless of condition result
   * or action outcome), the system SHALL create exactly one Workflow_Run
   * record capturing the trigger timestamp, condition result, action type,
   * and status.
   */

  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkflowRunCreate.mockResolvedValue({ id: "run-1" });
    mockAlertCreate.mockResolvedValue({ id: "alert-1" });
  });

  it("creates exactly one WorkflowRun for a single rule regardless of action type", async () => {
    await fc.assert(
      fc.asyncProperty(
        orgIdArb,
        ruleIdArb,
        actionTypeArb,
        conditionExprArb,
        async (orgId, ruleId, actionType, conditionExpr) => {
          vi.clearAllMocks();
          mockWorkflowRunCreate.mockResolvedValue({ id: "run-1" });
          mockAlertCreate.mockResolvedValue({ id: "alert-1" });

          const rule = makeRule({ id: ruleId, actionType, conditionExpr });
          mockWorkflowRuleFindMany.mockResolvedValue([rule]);

          await evaluateWorkflowRules(orgId, "CRON_SCHEDULE", {});

          // Exactly one WorkflowRun must be created
          expect(mockWorkflowRunCreate).toHaveBeenCalledTimes(1);

          const call = mockWorkflowRunCreate.mock.calls[0][0];
          expect(call.data).toMatchObject({
            organizationId: orgId,
            workflowRuleId: ruleId,
            actionType,
          });
          expect(["SUCCESS", "FAILURE"]).toContain(call.data.status);
          expect(["TRUE", "FALSE", "SKIPPED"]).toContain(call.data.conditionResult);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("creates exactly one WorkflowRun even when condition is FALSE", async () => {
    await fc.assert(
      fc.asyncProperty(
        orgIdArb,
        ruleIdArb,
        async (orgId, ruleId) => {
          vi.clearAllMocks();
          mockWorkflowRunCreate.mockResolvedValue({ id: "run-1" });

          // Condition that will evaluate to FALSE: quantity < 10 but context has quantity=100
          const rule = makeRule({
            id: ruleId,
            actionType: "SEND_EMAIL",
            conditionExpr: "quantity < 10",
          });
          mockWorkflowRuleFindMany.mockResolvedValue([rule]);

          await evaluateWorkflowRules(orgId, "CRON_SCHEDULE", { quantity: 100 });

          // Still exactly one WorkflowRun recorded
          expect(mockWorkflowRunCreate).toHaveBeenCalledTimes(1);
          const call = mockWorkflowRunCreate.mock.calls[0][0];
          expect(call.data.conditionResult).toBe("FALSE");
        }
      ),
      { numRuns: 50 }
    );
  });

  it("creates exactly one WorkflowRun per rule for N rules", async () => {
    await fc.assert(
      fc.asyncProperty(
        orgIdArb,
        fc.integer({ min: 1, max: 10 }),
        async (orgId, ruleCount) => {
          vi.clearAllMocks();
          mockWorkflowRunCreate.mockResolvedValue({ id: "run-x" });
          mockAlertCreate.mockResolvedValue({ id: "alert-x" });

          const rules = Array.from({ length: ruleCount }, (_, i) =>
            makeRule({ id: `rule-${i}`, actionType: "SEND_EMAIL" })
          );
          mockWorkflowRuleFindMany.mockResolvedValue(rules);

          await evaluateWorkflowRules(orgId, "CRON_SCHEDULE", {});

          // One WorkflowRun per rule
          expect(mockWorkflowRunCreate).toHaveBeenCalledTimes(ruleCount);
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ── Property 9: Workflow Failure Isolation ─────────────────────────────────

describe("Property 9: Workflow Failure Isolation", () => {
  /**
   * Validates: Requirements 4.8
   *
   * For any set of enabled Workflow_Rules where one or more Action executions
   * fail, the Workflow_Engine SHALL still evaluate and attempt to execute all
   * remaining rules, recording each failure in its own Workflow_Run.
   */

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("continues evaluating remaining rules when one action fails", async () => {
    await fc.assert(
      fc.asyncProperty(
        orgIdArb,
        fc.integer({ min: 2, max: 8 }),
        fc.integer({ min: 0, max: 7 }),
        async (orgId, ruleCount, failingIndex) => {
          const actualFailingIndex = failingIndex % ruleCount;
          vi.clearAllMocks();

          const rules = Array.from({ length: ruleCount }, (_, i) =>
            makeRule({ id: `rule-${i}`, actionType: "SEND_EMAIL" })
          );
          mockWorkflowRuleFindMany.mockResolvedValue(rules);

          // WorkflowRun.create always succeeds
          mockWorkflowRunCreate.mockResolvedValue({ id: "run-x" });

          // Make the action for the failing rule throw by using WEBHOOK with bad URL
          // We simulate this by making the rule at failingIndex use WEBHOOK with no URL
          rules[actualFailingIndex] = makeRule({
            id: `rule-${actualFailingIndex}`,
            actionType: "WEBHOOK",
            actionConfig: { url: "" }, // empty URL will cause fetch to fail
          });

          // Mock global fetch to throw for empty URL
          const originalFetch = global.fetch;
          global.fetch = vi.fn().mockRejectedValue(new Error("Invalid URL"));

          try {
            await evaluateWorkflowRules(orgId, "CRON_SCHEDULE", {});
          } finally {
            global.fetch = originalFetch;
          }

          // All rules must have a WorkflowRun recorded
          expect(mockWorkflowRunCreate).toHaveBeenCalledTimes(ruleCount);

          // The failing rule's run must have status FAILURE
          const calls = mockWorkflowRunCreate.mock.calls;
          const failingCall = calls.find(
            (c) => c[0].data.workflowRuleId === `rule-${actualFailingIndex}`
          );
          expect(failingCall).toBeDefined();
          expect(failingCall![0].data.status).toBe("FAILURE");
          expect(failingCall![0].data.errorMessage).toBeTruthy();

          // All other rules must have status SUCCESS
          const otherCalls = calls.filter(
            (c) => c[0].data.workflowRuleId !== `rule-${actualFailingIndex}`
          );
          for (const call of otherCalls) {
            expect(call[0].data.status).toBe("SUCCESS");
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("records FAILURE with errorMessage for each failing rule", async () => {
    await fc.assert(
      fc.asyncProperty(
        orgIdArb,
        fc.integer({ min: 1, max: 5 }),
        async (orgId, failCount) => {
          vi.clearAllMocks();
          mockWorkflowRunCreate.mockResolvedValue({ id: "run-x" });

          // All rules fail via WEBHOOK with bad URL
          const rules = Array.from({ length: failCount }, (_, i) =>
            makeRule({
              id: `rule-${i}`,
              actionType: "WEBHOOK",
              actionConfig: { url: "" },
            })
          );
          mockWorkflowRuleFindMany.mockResolvedValue(rules);

          const originalFetch = global.fetch;
          global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

          try {
            await evaluateWorkflowRules(orgId, "CRON_SCHEDULE", {});
          } finally {
            global.fetch = originalFetch;
          }

          // All rules must have a WorkflowRun
          expect(mockWorkflowRunCreate).toHaveBeenCalledTimes(failCount);

          // All must be FAILURE with errorMessage
          for (const call of mockWorkflowRunCreate.mock.calls) {
            expect(call[0].data.status).toBe("FAILURE");
            expect(typeof call[0].data.errorMessage).toBe("string");
            expect(call[0].data.errorMessage!.length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("does not throw even when all rules fail", async () => {
    await fc.assert(
      fc.asyncProperty(
        orgIdArb,
        fc.integer({ min: 1, max: 5 }),
        async (orgId, ruleCount) => {
          vi.clearAllMocks();
          mockWorkflowRunCreate.mockResolvedValue({ id: "run-x" });

          const rules = Array.from({ length: ruleCount }, (_, i) =>
            makeRule({
              id: `rule-${i}`,
              actionType: "WEBHOOK",
              actionConfig: { url: "" },
            })
          );
          mockWorkflowRuleFindMany.mockResolvedValue(rules);

          const originalFetch = global.fetch;
          global.fetch = vi.fn().mockRejectedValue(new Error("All fail"));

          // Must not throw
          await expect(
            evaluateWorkflowRules(orgId, "CRON_SCHEDULE", {})
          ).resolves.toBeUndefined();

          global.fetch = originalFetch;
        }
      ),
      { numRuns: 50 }
    );
  });
});
