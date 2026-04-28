"use server";

import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/org";
import { validateWorkflowRule, type WorkflowRuleInput } from "@/lib/ai/workflow-validation";

// ─── Types ────────────────────────────────────────────────────────────────────

export type WorkflowRuleCreateInput = WorkflowRuleInput & { enabled?: boolean };
export type WorkflowRuleUpdateInput = Partial<WorkflowRuleInput> & { enabled?: boolean };

// ─── CRUD Server Actions ──────────────────────────────────────────────────────

export async function createWorkflowRule(input: WorkflowRuleCreateInput) {
  const ctx = await getOrgContext();

  const validation = validateWorkflowRule(input);
  if (!validation.success) {
    return { error: Object.values(validation.errors).join("; ") };
  }

  const rule = await prisma.workflowRule.create({
    data: {
      organizationId: ctx.organizationId,
      name: input.name,
      triggerType: input.triggerType as never,
      triggerConfig: input.triggerConfig as never,
      conditionExpr: input.conditionExpr ?? null,
      actionType: input.actionType as never,
      actionConfig: input.actionConfig as never,
      enabled: input.enabled ?? true,
    },
  });

  const { invalidateCache } = await import("@/lib/redis");
  void invalidateCache([`org:${ctx.organizationId}:workflow_rules`]).catch(() => {});

  return rule;
}

export async function updateWorkflowRule(id: string, input: WorkflowRuleUpdateInput) {
  const ctx = await getOrgContext();

  // Fetch existing to merge for validation
  const existing = await prisma.workflowRule.findFirst({
    where: { id, organizationId: ctx.organizationId },
  });
  if (!existing) return { error: "Workflow rule not found" };

  // Build merged input for validation
  const merged: WorkflowRuleInput = {
    name: input.name ?? existing.name,
    triggerType: (input.triggerType ?? existing.triggerType) as string,
    triggerConfig: (input.triggerConfig ?? existing.triggerConfig) as WorkflowRuleInput["triggerConfig"],
    actionType: (input.actionType ?? existing.actionType) as string,
    actionConfig: (input.actionConfig ?? existing.actionConfig) as WorkflowRuleInput["actionConfig"],
    conditionExpr: input.conditionExpr ?? existing.conditionExpr ?? undefined,
  };

  const validation = validateWorkflowRule(merged);
  if (!validation.success) {
    return { error: Object.values(validation.errors).join("; ") };
  }

  const updated = await prisma.workflowRule.update({
    where: { id, organizationId: ctx.organizationId },
    data: {
      name: merged.name,
      triggerType: merged.triggerType as never,
      triggerConfig: merged.triggerConfig as never,
      conditionExpr: merged.conditionExpr ?? null,
      actionType: merged.actionType as never,
      actionConfig: merged.actionConfig as never,
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    },
  });

  return updated;
}

export async function toggleWorkflowRule(id: string, enabled: boolean) {
  const ctx = await getOrgContext();

  const rule = await prisma.workflowRule.updateMany({
    where: { id, organizationId: ctx.organizationId },
    data: { enabled },
  });

  if (rule.count === 0) return { error: "Workflow rule not found" };
  return { success: true };
}

export async function deleteWorkflowRule(id: string) {
  const ctx = await getOrgContext();

  const result = await prisma.workflowRule.deleteMany({
    where: { id, organizationId: ctx.organizationId },
  });

  if (result.count === 0) return { error: "Workflow rule not found" };
  return { success: true };
}

export async function listWorkflowRules() {
  const ctx = await getOrgContext();
  const cacheKey = `org:${ctx.organizationId}:workflow_rules`;

  const { getCached, TTL } = await import("@/lib/redis");
  return getCached(
    cacheKey,
    () => prisma.workflowRule.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: "desc" },
      include: {
        runs: {
          orderBy: { triggeredAt: "desc" },
          take: 10,
        },
      },
    }),
    TTL.MEDIUM
  );
}

// ─── Workflow Evaluation (called internally from API routes / other actions) ──

/**
 * Evaluates all enabled workflow rules matching the given triggerType for an org.
 * Records a WorkflowRun for every rule regardless of outcome.
 * Catches per-rule failures and continues to the next rule.
 *
 * SECURITY: When called from a user context (e.g. UI), verifies the caller's org
 * matches organizationId. When called from a cron/internal context, pass
 * skipOrgCheck=true to bypass the session check.
 */
export async function evaluateWorkflowRules(
  organizationId: string,
  triggerType: string,
  context: Record<string, unknown>,
  skipOrgCheck = false
): Promise<void> {
  // Verify caller has access to this org (skip for cron/internal calls)
  if (!skipOrgCheck) {
    try {
      const ctx = await getOrgContext();
      if (ctx.organizationId !== organizationId) {
        console.warn(`[WorkflowEngine] Org mismatch: caller=${ctx.organizationId} requested=${organizationId}`);
        return;
      }
    } catch {
      // getOrgContext throws/redirects if no session — block the call
      console.warn(`[WorkflowEngine] No org context for organizationId=${organizationId}`);
      return;
    }
  }

  const rules = await prisma.workflowRule.findMany({
    where: {
      organizationId,
      enabled: true,
      triggerType: triggerType as never,
    },
  });

  for (const rule of rules) {
    let conditionResult: "TRUE" | "FALSE" | "SKIPPED" = "SKIPPED";
    let status: "SUCCESS" | "FAILURE" = "SUCCESS";
    let errorMessage: string | null = null;

    try {
      // Evaluate condition
      if (rule.conditionExpr) {
        conditionResult = evaluateCondition(rule.conditionExpr, context) ? "TRUE" : "FALSE";
        if (conditionResult === "FALSE") {
          // Condition not met — record SKIPPED action and continue
          await prisma.workflowRun.create({
            data: {
              organizationId,
              workflowRuleId: rule.id,
              conditionResult: "FALSE",
              actionType: rule.actionType,
              status: "SUCCESS",
              errorMessage: null,
            },
          });
          continue;
        }
      }

      // Execute action — may return an artifact string (e.g. GENERATE_REPORT)
      const artifact = await executeAction(rule.actionType as string, rule.actionConfig as Record<string, unknown>, context, organizationId);
      // artifact is only set for GENERATE_REPORT; store separately from errorMessage
      if (typeof artifact === "string") {
        errorMessage = null; // not an error
        // artifact is logged inside executeAction; no separate storage needed
      }

    } catch (err) {
      status = "FAILURE";
      errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[WorkflowEngine] Rule ${rule.id} (${rule.name}) failed:`, errorMessage);
    }

    // Record WorkflowRun regardless of outcome
    await prisma.workflowRun.create({
      data: {
        organizationId,
        workflowRuleId: rule.id,
        conditionResult,
        actionType: rule.actionType,
        status,
        errorMessage,
      },
    });
  }
}

// ─── Condition Evaluator ──────────────────────────────────────────────────────

function evaluateCondition(expr: string, context: Record<string, unknown>): boolean {
  try {
    // Whitelist: only allow simple key OP value expressions
    // key must be alphanumeric/underscore, value must be alphanumeric/dot/underscore
    // Prevents injection of arbitrary expressions
    const SAFE_EXPR = /^([a-zA-Z_]\w*)\s*(>|<|>=|<=|=|!=)\s*([a-zA-Z0-9_.]+)$/;
    const match = expr.trim().match(SAFE_EXPR);
    if (!match) {
      console.warn(`[WorkflowEngine] Rejected unsafe condition expression: "${expr}" — treating as FALSE`);
      return false;
    }

    const [, key, op, rawValue] = match;
    // Only allow known context keys — key is already validated by SAFE_EXPR regex (\w+)
    // Use hasOwnProperty to safely access context
    const contextVal = Object.prototype.hasOwnProperty.call(context, key)
      ? context[key as keyof typeof context]
      : undefined;

    // Numeric comparison
    const numVal = Number(rawValue);
    const numCtx = Number(contextVal);
    const isNumeric = !isNaN(numVal) && !isNaN(numCtx);

    if (isNumeric) {
      switch (op) {
        case ">":  return numCtx > numVal;
        case "<":  return numCtx < numVal;
        case ">=": return numCtx >= numVal;
        case "<=": return numCtx <= numVal;
        case "=":  return numCtx === numVal;
        case "!=": return numCtx !== numVal;
      }
    }

    // String comparison (= and != only)
    if (op === "=")  return String(contextVal) === rawValue;
    if (op === "!=") return String(contextVal) !== rawValue;

    console.warn(`[WorkflowEngine] Unsupported operator "${op}" for non-numeric values in "${expr}" — treating as FALSE`);
    return false;
  } catch {
    console.warn(`[WorkflowEngine] Condition evaluation error for "${expr}" — treating as FALSE`);
    return false;
  }
}

// ─── Action Executor ──────────────────────────────────────────────────────────

async function executeAction(
  actionType: string,
  actionConfig: Record<string, unknown>,
  context: Record<string, unknown>,
  organizationId: string
): Promise<string | void> {
  switch (actionType) {
    case "SEND_EMAIL": {
      // Log server-side only — never reaches browser console
      if (process.env.NODE_ENV !== "production") {
        console.log(`[WorkflowEngine] SEND_EMAIL to=${actionConfig.email} org=${organizationId}`);
      }
      break;
    }

    case "CREATE_ALERT": {
      await prisma.alert.create({
        data: {
          organizationId,
          type: (actionConfig.alertType as "LOW_STOCK" | "ANOMALY") ?? "LOW_STOCK",
          productId: String(context.productId ?? "workflow-generated"),
          productName: String(context.productName ?? "Unknown"),
          currentQty: typeof context.quantity === "number" ? context.quantity : null,
        },
      });
      break;
    }

    case "GENERATE_REPORT": {
      const report = `[WorkflowEngine] Report generated at ${new Date().toISOString()} for org=${organizationId}.`;
      if (process.env.NODE_ENV !== "production") {
        console.log(report, "Context:", JSON.stringify(context));
      }
      return report as unknown as void;
    }

    case "WEBHOOK": {
      const url = String(actionConfig.url ?? "");
      // Enforce HTTPS only — reject plain HTTP to prevent MITM attacks
      if (!url.startsWith("https://")) {
        throw new Error(`Webhook URL must use HTTPS. Got: ${url.slice(0, 50)}`);
      }
      // SSRF protection: block internal/private IP ranges
      try {
        const parsed = new URL(url);
        const hostname = parsed.hostname;
        // Reject raw IP addresses that are private/loopback
        const isLoopback = hostname === "localhost" || hostname === "127.0.0.1" ||
          hostname === "0.0.0.0" || hostname === "::1";
        const isPrivateIPv4 =
          /^10\./.test(hostname) ||
          /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
          /^192\.168\./.test(hostname) ||
          /^169\.254\./.test(hostname);
        // Reject numeric IPs entirely to prevent decimal/hex encoding tricks
        const isRawIP = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname === "::1";
        if (isLoopback || isPrivateIPv4 || isRawIP) {
          throw new Error(`Webhook URL points to internal network: ${hostname}`);
        }
      } catch (err) {
        if (err instanceof Error && err.message.includes("internal network")) throw err;
        throw new Error(`Invalid webhook URL format: ${url}`);
      }
      const payload = {
        ...(actionConfig.payload as Record<string, unknown> ?? {}),
        context,
        organizationId,
        triggeredAt: new Date().toISOString(),
      };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000); // 10s timeout
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Webhook POST to ${url} failed with status ${response.status}`);
        }
      } finally {
        clearTimeout(timeout);
      }
      break;
    }

    default:
      console.warn(`[WorkflowEngine] Unknown action type: ${actionType}`);
  }
}
