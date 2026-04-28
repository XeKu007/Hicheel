"use client";

import { useState, useTransition } from "react";
import { resolveAgentInsight } from "@/lib/actions/ai/agent";

interface AgentInsight {
  id: string;
  productName: string;
  insightType: string;
  severity: string;
  description: string;
  generatedAt: Date;
}

function severityColor(severity: string): string {
  if (severity === "HIGH") return "var(--red)";
  if (severity === "MEDIUM") return "var(--amber)";
  return "var(--text-2)";
}

function formatInsightType(type: string): string {
  return type.replace(/_/g, " ");
}

export default function AgentClient({ insights: initial }: { insights: AgentInsight[] }) {
  const [insights, setInsights] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  function handleResolve(id: string) {
    setResolvingId(id);
    startTransition(async () => {
      await resolveAgentInsight(id);
      setInsights((prev) => prev.filter((i) => i.id !== id));
      setResolvingId(null);
    });
  }

  if (insights.length === 0) {
    return (
      <div style={{ padding: "48px 16px", textAlign: "center", color: "var(--text-3)" }}>
        No active agent insights
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="data-table" style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th>Product</th>
            <th>Type</th>
            <th>Severity</th>
            <th>Description</th>
            <th>Generated At</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {insights.map((insight) => (
            <tr key={insight.id}>
              <td style={{ fontWeight: 500 }}>{insight.productName}</td>
              <td style={{ fontSize: 12, color: "var(--text-2)" }}>
                {formatInsightType(insight.insightType)}
              </td>
              <td>
                <span
                  className="badge"
                  style={{ color: severityColor(insight.severity), fontWeight: 600 }}
                >
                  {insight.severity}
                </span>
              </td>
              <td style={{ maxWidth: 360, fontSize: 12, color: "var(--text-2)" }}>
                {insight.description}
              </td>
              <td style={{ fontSize: 12, color: "var(--text-3)", whiteSpace: "nowrap" }}>
                {new Date(insight.generatedAt).toLocaleString()}
              </td>
              <td>
                <button
                  className="btn btn-sm"
                  disabled={pending && resolvingId === insight.id}
                  onClick={() => handleResolve(insight.id)}
                  style={{ fontSize: 12 }}
                >
                  {pending && resolvingId === insight.id ? "Resolving…" : "Resolve"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
