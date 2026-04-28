import { z } from "zod";
import { CronExpressionParser } from "cron-parser";

// ─── Supported Enums ─────────────────────────────────────────────────────────

const TRIGGER_TYPES = [
  "QUANTITY_BELOW",
  "QUANTITY_ABOVE",
  "CRON_SCHEDULE",
  "ANOMALY_DETECTED",
] as const;

const ACTION_TYPES = [
  "SEND_EMAIL",
  "CREATE_ALERT",
  "GENERATE_REPORT",
  "WEBHOOK",
] as const;

// ─── Input Type ──────────────────────────────────────────────────────────────

export interface WorkflowRuleInput {
  name: string;
  triggerType: string;
  triggerConfig: {
    cronExpression?: string;
    threshold?: number;
    productId?: string;
  };
  actionType: string;
  actionConfig: {
    email?: string;
    url?: string;
    payload?: Record<string, unknown>;
    alertType?: string;
  };
  conditionExpr?: string;
}

// ─── Base Zod Schema ─────────────────────────────────────────────────────────

const workflowRuleSchema = z.object({
  name: z.string().min(1, "Name is required"),
  triggerType: z.enum(TRIGGER_TYPES, {
    error: `Trigger type must be one of: ${TRIGGER_TYPES.join(", ")}`,
  }),
  triggerConfig: z.object({
    cronExpression: z.string().optional(),
    threshold: z.number().optional(),
    productId: z.string().optional(),
  }),
  actionType: z.enum(ACTION_TYPES, {
    error: `Action type must be one of: ${ACTION_TYPES.join(", ")}`,
  }),
  actionConfig: z.object({
    email: z.string().optional(),
    url: z.string().optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
    alertType: z.string().optional(),
  }),
  conditionExpr: z.string().optional(),
});

// ─── Validation Result ────────────────────────────────────────────────────────

export type ValidationResult =
  | { success: true }
  | { success: false; errors: Record<string, string> };

// ─── Main Validator ───────────────────────────────────────────────────────────

export function validateWorkflowRule(input: WorkflowRuleInput): ValidationResult {
  const errors: Record<string, string> = {};

  // Run base Zod schema validation
  const parsed = workflowRuleSchema.safeParse(input);

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path.join(".");
      errors[field || "root"] = issue.message;
    }
  }

  // Only run cross-field validations if base types are valid
  const triggerType = input.triggerType;
  const actionType = input.actionType;

  // Req 5.2 / 5.6: Validate cron expression when trigger is CRON_SCHEDULE
  if (triggerType === "CRON_SCHEDULE") {
    const cronExpr = input.triggerConfig?.cronExpression;
    if (!cronExpr) {
      errors["triggerConfig.cronExpression"] =
        "cronExpression is required when triggerType is CRON_SCHEDULE";
    } else {
      try {
        CronExpressionParser.parse(cronExpr);
      } catch (err) {
        errors["triggerConfig.cronExpression"] = `Invalid cron expression: ${
          err instanceof Error ? err.message : String(err)
        }`;
      }
    }
  }

  // Req 5.3: Validate email when action is SEND_EMAIL
  if (actionType === "SEND_EMAIL") {
    const email = input.actionConfig?.email;
    if (!email) {
      errors["actionConfig.email"] =
        "email is required when actionType is SEND_EMAIL";
    } else {
      const emailResult = z.string().email().safeParse(email);
      if (!emailResult.success) {
        errors["actionConfig.email"] = `Invalid email address: "${email}"`;
      }
    }
  }

  // Req 5.4: Validate HTTPS URL when action is WEBHOOK
  if (actionType === "WEBHOOK") {
    const url = input.actionConfig?.url;
    if (!url) {
      errors["actionConfig.url"] =
        "url is required when actionType is WEBHOOK";
    } else {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== "https:") {
          errors["actionConfig.url"] =
            `Webhook URL must use HTTPS scheme, got: "${parsed.protocol.replace(":", "")}"`;
        }
        // Reject raw IP addresses to prevent SSRF
        const hostname = parsed.hostname;
        const isRawIP = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname === "::1";
        if (isRawIP) {
          errors["actionConfig.url"] = `Webhook URL must use a domain name, not a raw IP address`;
        }
      } catch {
        errors["actionConfig.url"] = `Invalid URL: "${url}"`;
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }

  return { success: true };
}
