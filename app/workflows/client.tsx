"use client";

import { useState, useTransition } from "react";
import React from "react";
import {
  createWorkflowRule,
  updateWorkflowRule,
  toggleWorkflowRule,
  deleteWorkflowRule,
  listWorkflowRules,
} from "@/lib/actions/ai/workflows";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkflowRun {
  id: string;
  triggeredAt: string;
  conditionResult: string;
  actionType: string;
  status: string;
  errorMessage: string | null;
}

interface WorkflowRule {
  id: string;
  name: string;
  triggerType: string;
  triggerConfig: Record<string, unknown>;
  conditionExpr: string | null;
  actionType: string;
  actionConfig: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
  runs: WorkflowRun[];
}

type TriggerType = "QUANTITY_BELOW" | "QUANTITY_ABOVE" | "CRON_SCHEDULE" | "ANOMALY_DETECTED";
type ActionType = "SEND_EMAIL" | "CREATE_ALERT" | "GENERATE_REPORT" | "WEBHOOK";

interface FormState {
  name: string;
  triggerType: TriggerType;
  cronExpr: string;
  threshold: string;
  actionType: ActionType;
  email: string;
  webhookUrl: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  triggerType: "QUANTITY_BELOW",
  cronExpr: "",
  threshold: "",
  actionType: "SEND_EMAIL",
  email: "",
  webhookUrl: "",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildTriggerConfig(form: FormState): Record<string, unknown> {
  if (form.triggerType === "CRON_SCHEDULE") return { cron: form.cronExpr };
  if (form.triggerType === "QUANTITY_BELOW" || form.triggerType === "QUANTITY_ABOVE") {
    return { threshold: Number(form.threshold) };
  }
  return {};
}

function buildActionConfig(form: FormState): Record<string, unknown> {
  if (form.actionType === "SEND_EMAIL") return { email: form.email };
  if (form.actionType === "WEBHOOK") return { url: form.webhookUrl };
  return {};
}

function formFromRule(rule: WorkflowRule): FormState {
  const tc = rule.triggerConfig;
  const ac = rule.actionConfig;
  return {
    name: rule.name,
    triggerType: rule.triggerType as TriggerType,
    cronExpr: typeof tc.cron === "string" ? tc.cron : "",
    threshold: tc.threshold !== undefined ? String(tc.threshold) : "",
    actionType: rule.actionType as ActionType,
    email: typeof ac.email === "string" ? ac.email : "",
    webhookUrl: typeof ac.url === "string" ? ac.url : "",
  };
}

function statusBadge(status: string) {
  const ok = status === "SUCCESS";
  return (
    <span className={ok ? "badge badge-ok" : "badge badge-low"}>
      {status}
    </span>
  );
}

function conditionBadge(result: string) {
  if (result === "TRUE") return <span className="badge badge-ok">TRUE</span>;
  if (result === "FALSE") return <span className="badge badge-warn">FALSE</span>;
  return <span className="badge badge-info">SKIPPED</span>;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function WorkflowsClient({ initialRules }: { initialRules: WorkflowRule[] }) {
  const [rules, setRules] = useState<WorkflowRule[]>(initialRules);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function refreshRules() {
    const fresh = await listWorkflowRules();
    type RuleWithRuns = typeof fresh[number] & { runs: { id: string; triggeredAt: Date; conditionResult: string; actionType: string; status: string; errorMessage: string | null }[] };
    setRules(
      (fresh as unknown as RuleWithRuns[]).map((r) => ({
        id: r.id,
        name: r.name,
        triggerType: r.triggerType as string,
        triggerConfig: r.triggerConfig as Record<string, unknown>,
        conditionExpr: r.conditionExpr ?? null,
        actionType: r.actionType as string,
        actionConfig: r.actionConfig as Record<string, unknown>,
        enabled: r.enabled,
        createdAt: r.createdAt.toISOString(),
        runs: r.runs.map((run) => ({
          id: run.id,
          triggeredAt: run.triggeredAt.toISOString(),
          conditionResult: run.conditionResult as string,
          actionType: run.actionType as string,
          status: run.status as string,
          errorMessage: run.errorMessage ?? null,
        })),
      }))
    );
  }

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
    setShowForm(true);
  }

  function openEdit(rule: WorkflowRule) {
    setEditingId(rule.id);
    setForm(formFromRule(rule));
    setError(null);
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const input = {
      name: form.name,
      triggerType: form.triggerType,
      triggerConfig: buildTriggerConfig(form),
      actionType: form.actionType,
      actionConfig: buildActionConfig(form),
    };

    startTransition(async () => {
      const result = editingId
        ? await updateWorkflowRule(editingId, input)
        : await createWorkflowRule(input);

      if (result && "error" in result) {
        setError(result.error);
        return;
      }

      await refreshRules();
      setShowForm(false);
      setEditingId(null);
    });
  }

  function handleToggle(id: string, enabled: boolean) {
    startTransition(async () => {
      await toggleWorkflowRule(id, enabled);
      setRules((prev) =>
        prev.map((r) => (r.id === id ? { ...r, enabled } : r))
      );
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this workflow rule?")) return;
    startTransition(async () => {
      await deleteWorkflowRule(id);
      setRules((prev) => prev.filter((r) => r.id !== id));
    });
  }

  const showCron = form.triggerType === "CRON_SCHEDULE";
  const showThreshold = form.triggerType === "QUANTITY_BELOW" || form.triggerType === "QUANTITY_ABOVE";
  const showEmail = form.actionType === "SEND_EMAIL";
  const showWebhook = form.actionType === "WEBHOOK";

  return (
    <>
      {/* Toolbar */}
      <div className="toolbar">
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>
          Workflow Rules
        </span>
        <span style={{ fontSize: 11, color: "var(--text-3)", marginLeft: 8 }}>
          {rules.length} rule{rules.length !== 1 ? "s" : ""}
        </span>
        <div style={{ marginLeft: "auto" }}>
          <button className="btn-accent" onClick={openCreate}>
            + New Rule
          </button>
        </div>
      </div>

      {/* Create / Edit Form */}
      {showForm && (
        <div style={{ padding: "20px 20px 0", borderBottom: "1px solid var(--border-dim)" }}>
          <div style={{ maxWidth: 560 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)", marginBottom: 16 }}>
              {editingId ? "Edit Workflow Rule" : "New Workflow Rule"}
            </div>

            {error && (
              <div style={{ background: "rgba(255,68,68,0.08)", border: "1px solid rgba(255,68,68,0.2)", borderRadius: 5, padding: "8px 12px", fontSize: 12, color: "var(--red)", marginBottom: 14 }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ display: "grid", gap: 12 }}>
                {/* Name */}
                <div>
                  <label className="form-label">Name</label>
                  <input
                    className="input-field"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Low stock alert"
                    required
                  />
                </div>

                {/* Trigger type */}
                <div>
                  <label className="form-label">Trigger Type</label>
                  <select
                    className="input-field"
                    value={form.triggerType}
                    onChange={(e) => setForm((f) => ({ ...f, triggerType: e.target.value as TriggerType }))}
                  >
                    <option value="QUANTITY_BELOW">Quantity Below</option>
                    <option value="QUANTITY_ABOVE">Quantity Above</option>
                    <option value="CRON_SCHEDULE">Cron Schedule</option>
                    <option value="ANOMALY_DETECTED">Anomaly Detected</option>
                  </select>
                </div>

                {/* Cron expression */}
                {showCron && (
                  <div>
                    <label className="form-label">Cron Expression</label>
                    <input
                      className="input-field"
                      value={form.cronExpr}
                      onChange={(e) => setForm((f) => ({ ...f, cronExpr: e.target.value }))}
                      placeholder="e.g. 0 9 * * 1"
                    />
                  </div>
                )}

                {/* Threshold */}
                {showThreshold && (
                  <div>
                    <label className="form-label">Threshold (quantity)</label>
                    <input
                      className="input-field"
                      type="number"
                      min={0}
                      value={form.threshold}
                      onChange={(e) => setForm((f) => ({ ...f, threshold: e.target.value }))}
                      placeholder="e.g. 10"
                    />
                  </div>
                )}

                {/* Action type */}
                <div>
                  <label className="form-label">Action Type</label>
                  <select
                    className="input-field"
                    value={form.actionType}
                    onChange={(e) => setForm((f) => ({ ...f, actionType: e.target.value as ActionType }))}
                  >
                    <option value="SEND_EMAIL">Send Email</option>
                    <option value="CREATE_ALERT">Create Alert</option>
                    <option value="GENERATE_REPORT">Generate Report</option>
                    <option value="WEBHOOK">Webhook</option>
                  </select>
                </div>

                {/* Email */}
                {showEmail && (
                  <div>
                    <label className="form-label">Email Address</label>
                    <input
                      className="input-field"
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      placeholder="alerts@example.com"
                    />
                  </div>
                )}

                {/* Webhook URL */}
                {showWebhook && (
                  <div>
                    <label className="form-label">Webhook URL</label>
                    <input
                      className="input-field"
                      type="url"
                      value={form.webhookUrl}
                      onChange={(e) => setForm((f) => ({ ...f, webhookUrl: e.target.value }))}
                      placeholder="https://hooks.example.com/..."
                    />
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, paddingBottom: 20 }}>
                  <button type="submit" className="btn-accent" disabled={isPending}>
                    {isPending ? "Saving…" : editingId ? "Save Changes" : "Create Rule"}
                  </button>
                  <button type="button" className="btn-ghost" onClick={cancelForm}>
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rules list */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {rules.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-3)", fontSize: 12 }}>
            No workflow rules yet. Create one to get started.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Trigger</th>
                <th>Action</th>
                <th>Enabled</th>
                <th>Runs</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <React.Fragment key={rule.id}>
                  <tr key={rule.id}>
                    <td style={{ fontWeight: 500, color: "var(--text-1)" }}>{rule.name}</td>
                    <td>
                      <span className="tag-mono">{rule.triggerType}</span>
                    </td>
                    <td>
                      <span className="tag-mono">{rule.actionType}</span>
                    </td>
                    <td>
                      <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={(e) => handleToggle(rule.id, e.target.checked)}
                          style={{ accentColor: "var(--accent)", width: 14, height: 14 }}
                        />
                        <span style={{ fontSize: 11, color: rule.enabled ? "var(--accent)" : "var(--text-3)" }}>
                          {rule.enabled ? "On" : "Off"}
                        </span>
                      </label>
                    </td>
                    <td>
                      <button
                        className="btn-ghost"
                        style={{ fontSize: 11, padding: "3px 8px" }}
                        onClick={() => setExpandedId(expandedId === rule.id ? null : rule.id)}
                      >
                        {rule.runs.length} run{rule.runs.length !== 1 ? "s" : ""} {expandedId === rule.id ? "▲" : "▼"}
                      </button>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button className="btn-ghost" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => openEdit(rule)}>
                          Edit
                        </button>
                        <button
                          className="btn-ghost"
                          style={{ fontSize: 11, padding: "3px 8px", color: "var(--red)", borderColor: "rgba(255,68,68,0.2)" }}
                          onClick={() => handleDelete(rule.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Expanded runs */}
                  {expandedId === rule.id && (
                    <tr key={`${rule.id}-runs`}>
                      <td colSpan={6} style={{ padding: 0, background: "var(--bg-surface)" }}>
                        <div style={{ padding: "12px 16px" }}>
                          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-3)", marginBottom: 8 }}>
                            Last {rule.runs.length} Run{rule.runs.length !== 1 ? "s" : ""}
                          </div>
                          {rule.runs.length === 0 ? (
                            <div style={{ fontSize: 11, color: "var(--text-3)" }}>No runs yet.</div>
                          ) : (
                            <table className="data-table" style={{ fontSize: 11 }}>
                              <thead>
                                <tr>
                                  <th>Triggered At</th>
                                  <th>Condition</th>
                                  <th>Action</th>
                                  <th>Status</th>
                                  <th>Error / Artifact</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rule.runs.map((run) => (
                                  <tr key={run.id}>
                                    <td className="mono" style={{ fontSize: 11, color: "var(--text-2)" }}>
                                      {new Date(run.triggeredAt).toLocaleString()}
                                    </td>
                                    <td>{conditionBadge(run.conditionResult)}</td>
                                    <td><span className="tag-mono">{run.actionType}</span></td>
                                    <td>{statusBadge(run.status)}</td>
                                    <td style={{ color: "var(--text-2)", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {run.errorMessage ?? "—"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
