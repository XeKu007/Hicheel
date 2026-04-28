// Feature: ai-agent-workflow, Property 6: Cron Expression Validation Round-Trip
// Feature: ai-agent-workflow, Property 7: Workflow Validation Rejects Invalid Inputs

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { CronExpressionParser } from "cron-parser";
import {
  validateWorkflowRule,
  type WorkflowRuleInput,
} from "../../lib/ai/workflow-validation";

// ─── Shared Arbitraries ───────────────────────────────────────────────────────

const VALID_TRIGGER_TYPES = [
  "QUANTITY_BELOW",
  "QUANTITY_ABOVE",
  "CRON_SCHEDULE",
  "ANOMALY_DETECTED",
] as const;

const VALID_ACTION_TYPES = [
  "SEND_EMAIL",
  "CREATE_ALERT",
  "GENERATE_REPORT",
  "WEBHOOK",
] as const;

// Known-valid cron expressions (5-field standard cron)
const VALID_CRON_EXPRESSIONS = [
  "* * * * *",
  "0 9 * * 1",
  "*/5 * * * *",
  "0 0 * * *",
  "30 6 * * 1-5",
  "0 12 1 * *",
  "15 14 1 * *",
  "0 22 * * 1-5",
  "23 0-20/2 * * *",
  "5 4 * * sun",
  "0 0,12 1 */2 *",
  "0 4 8-14 * *",
  "*/15 * * * *",
  "0 0 1 1 *",
  "0 9-17 * * 1-5",
] as const;

const validCronArb = fc.constantFrom(...VALID_CRON_EXPRESSIONS);

// Generates strings that are clearly not valid cron expressions
const invalidCronArb = fc
  .oneof(
    // Random short strings
    fc.string({ minLength: 1, maxLength: 10 }),
    // Too many fields
    fc.constant("* * * * * *"),
    // Too few fields
    fc.constant("* * * *"),
    // Non-numeric garbage
    fc.constant("abc def ghi"),
    // Empty string
    fc.constant(""),
    // Out-of-range values
    fc.constant("99 99 99 99 99"),
    fc.constant("60 * * * *"),
    fc.constant("* 25 * * *"),
  )
  .filter((s) => {
    // Filter out any strings that happen to be valid cron expressions
    try {
      CronExpressionParser.parse(s);
      return false; // valid — exclude
    } catch {
      return true; // invalid — keep
    }
  });

// Base valid workflow rule (non-CRON trigger, non-email/webhook action)
function baseValidRule(): WorkflowRuleInput {
  return {
    name: "Test Rule",
    triggerType: "QUANTITY_BELOW",
    triggerConfig: { threshold: 10 },
    actionType: "CREATE_ALERT",
    actionConfig: { alertType: "LOW_STOCK" },
  };
}

// ─── Property 6: Cron Expression Validation Round-Trip ───────────────────────

describe("Property 6: Cron Expression Validation Round-Trip", () => {
  /**
   * Validates: Requirements 5.2, 5.6
   *
   * For any syntactically valid cron expression, the Workflow_Rule_Validator
   * SHALL accept it; for any syntactically invalid cron expression, the
   * validator SHALL reject it with a descriptive error.
   */

  it("accepts all known-valid cron expressions when trigger is CRON_SCHEDULE", () => {
    fc.assert(
      fc.property(validCronArb, (cronExpression) => {
        const input: WorkflowRuleInput = {
          name: "Cron Rule",
          triggerType: "CRON_SCHEDULE",
          triggerConfig: { cronExpression },
          actionType: "CREATE_ALERT",
          actionConfig: { alertType: "SCHEDULED" },
        };

        const result = validateWorkflowRule(input);
        expect(result.success).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  it("rejects invalid cron expressions with an error on triggerConfig.cronExpression", () => {
    fc.assert(
      fc.property(invalidCronArb, (cronExpression) => {
        const input: WorkflowRuleInput = {
          name: "Bad Cron Rule",
          triggerType: "CRON_SCHEDULE",
          triggerConfig: { cronExpression },
          actionType: "CREATE_ALERT",
          actionConfig: { alertType: "SCHEDULED" },
        };

        const result = validateWorkflowRule(input);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.errors).toHaveProperty("triggerConfig.cronExpression");
          expect(typeof result.errors["triggerConfig.cronExpression"]).toBe("string");
          expect(result.errors["triggerConfig.cronExpression"].length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 }
    );
  });

  it("rejects CRON_SCHEDULE rules with missing cronExpression", () => {
    const input: WorkflowRuleInput = {
      name: "Missing Cron",
      triggerType: "CRON_SCHEDULE",
      triggerConfig: {},
      actionType: "CREATE_ALERT",
      actionConfig: {},
    };

    const result = validateWorkflowRule(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toHaveProperty("triggerConfig.cronExpression");
    }
  });
});

// ─── Property 7: Workflow Validation Rejects Invalid Inputs ──────────────────

describe("Property 7: Workflow Validation Rejects Invalid Inputs", () => {
  /**
   * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5
   *
   * For any Workflow_Rule submission where the trigger type is not in the
   * supported set, or the cron expression is invalid, or the email address is
   * syntactically invalid, or the webhook URL does not use HTTPS — the system
   * SHALL reject the rule and return a descriptive error identifying the
   * invalid field, without persisting the rule.
   */

  // Arbitrary for invalid trigger types (strings not in the supported set)
  const invalidTriggerTypeArb = fc
    .string({ minLength: 1, maxLength: 30 })
    .filter((s) => !(VALID_TRIGGER_TYPES as readonly string[]).includes(s));

  // Arbitrary for invalid email addresses (no @ or clearly malformed)
  const invalidEmailArb = fc.oneof(
    // No @ symbol
    fc.stringMatching(/^[a-zA-Z0-9]{3,15}$/),
    // @ at start
    fc.constant("@nodomain.com"),
    // @ at end
    fc.constant("noat@"),
    // Multiple @
    fc.constant("a@@b.com"),
    // Missing domain
    fc.constant("user@"),
    // Missing local part
    fc.constant("@domain.com"),
    // Plain string
    fc.constant("notanemail"),
    fc.constant("also not an email"),
  );

  // Arbitrary for non-HTTPS URLs
  const nonHttpsUrlArb = fc.oneof(
    // HTTP URLs
    fc.stringMatching(/^http:\/\/[a-z]{3,10}\.[a-z]{2,4}\/[a-z]{0,10}$/),
    fc.constant("http://example.com/webhook"),
    fc.constant("http://api.service.io/hook"),
    // FTP URLs
    fc.constant("ftp://files.example.com/hook"),
    // No protocol
    fc.constant("example.com/webhook"),
    // WS protocol
    fc.constant("ws://realtime.example.com/hook"),
  );

  it("rejects unsupported trigger types with error on triggerType field", () => {
    fc.assert(
      fc.property(invalidTriggerTypeArb, (triggerType) => {
        const input: WorkflowRuleInput = {
          ...baseValidRule(),
          triggerType,
        };

        const result = validateWorkflowRule(input);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.errors).toHaveProperty("triggerType");
          expect(typeof result.errors["triggerType"]).toBe("string");
          expect(result.errors["triggerType"].length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 }
    );
  });

  it("rejects invalid email addresses with error on actionConfig.email", () => {
    fc.assert(
      fc.property(invalidEmailArb, (email) => {
        const input: WorkflowRuleInput = {
          ...baseValidRule(),
          actionType: "SEND_EMAIL",
          actionConfig: { email },
        };

        const result = validateWorkflowRule(input);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.errors).toHaveProperty("actionConfig.email");
          expect(typeof result.errors["actionConfig.email"]).toBe("string");
          expect(result.errors["actionConfig.email"].length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 }
    );
  });

  it("rejects non-HTTPS webhook URLs with error on actionConfig.url", () => {
    fc.assert(
      fc.property(nonHttpsUrlArb, (url) => {
        const input: WorkflowRuleInput = {
          ...baseValidRule(),
          actionType: "WEBHOOK",
          actionConfig: { url },
        };

        const result = validateWorkflowRule(input);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.errors).toHaveProperty("actionConfig.url");
          expect(typeof result.errors["actionConfig.url"]).toBe("string");
          expect(result.errors["actionConfig.url"].length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 }
    );
  });

  it("rejects invalid cron expressions with error on triggerConfig.cronExpression", () => {
    fc.assert(
      fc.property(invalidCronArb, (cronExpression) => {
        const input: WorkflowRuleInput = {
          ...baseValidRule(),
          triggerType: "CRON_SCHEDULE",
          triggerConfig: { cronExpression },
          actionType: "CREATE_ALERT",
          actionConfig: {},
        };

        const result = validateWorkflowRule(input);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.errors).toHaveProperty("triggerConfig.cronExpression");
        }
      }),
      { numRuns: 100 }
    );
  });

  it("accepts valid rules with all fields correct", () => {
    // Valid HTTPS webhook
    const webhookResult = validateWorkflowRule({
      name: "Webhook Rule",
      triggerType: "QUANTITY_BELOW",
      triggerConfig: { threshold: 5 },
      actionType: "WEBHOOK",
      actionConfig: { url: "https://hooks.example.com/notify" },
    });
    expect(webhookResult.success).toBe(true);

    // Valid email action
    const emailResult = validateWorkflowRule({
      name: "Email Rule",
      triggerType: "QUANTITY_ABOVE",
      triggerConfig: { threshold: 100 },
      actionType: "SEND_EMAIL",
      actionConfig: { email: "admin@example.com" },
    });
    expect(emailResult.success).toBe(true);

    // Valid cron schedule
    const cronResult = validateWorkflowRule({
      name: "Cron Rule",
      triggerType: "CRON_SCHEDULE",
      triggerConfig: { cronExpression: "0 9 * * 1" },
      actionType: "GENERATE_REPORT",
      actionConfig: {},
    });
    expect(cronResult.success).toBe(true);
  });
});
