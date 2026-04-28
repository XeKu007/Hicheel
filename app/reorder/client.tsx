"use client";

interface ReorderSuggestion {
  productId: string;
  productName: string;
  currentQuantity: number;
  dailyConsumptionRate: number;
  daysUntilStockout: number;
  suggestedReorderQty: number;
  explanation: string | null;
}

function urgencyColor(days: number): string {
  if (days <= 3) return "var(--red, #ef4444)";
  if (days <= 7) return "var(--amber, #f59e0b)";
  return "var(--text-1, inherit)";
}

export default function ReorderClient({ suggestions }: { suggestions: ReorderSuggestion[] }) {
  if (suggestions.length === 0) {
    return (
      <div style={{ padding: "48px 16px", textAlign: "center", color: "var(--text-3)" }}>
        No reorder suggestions at this time.
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="data-table" style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th>Product</th>
            <th>Current Qty</th>
            <th>Days Until Stockout</th>
            <th>Daily Rate</th>
            <th>Suggested Reorder Qty</th>
            <th>AI Explanation</th>
          </tr>
        </thead>
        <tbody>
          {suggestions.map((s) => (
            <tr key={s.productId}>
              <td style={{ fontWeight: 500 }}>{s.productName}</td>
              <td>{s.currentQuantity}</td>
              <td>
                <span
                  className="badge"
                  style={{ color: urgencyColor(s.daysUntilStockout), fontWeight: 600 }}
                >
                  {s.daysUntilStockout}d
                </span>
              </td>
              <td>{s.dailyConsumptionRate.toFixed(2)}/day</td>
              <td>{s.suggestedReorderQty}</td>
              <td style={{ maxWidth: "320px", fontSize: "12px", color: "var(--text-2)" }}>
                {s.explanation ?? (
                  <span style={{ color: "var(--text-3)", fontStyle: "italic" }}>
                    AI explanation temporarily unavailable
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
