// Pure utility functions for the autonomous agent — no "use server"

export type InsightType = "STOCKOUT_RISK" | "ANOMALY_SPIKE" | "DEAD_STOCK";
export type InsightSeverity = "LOW" | "MEDIUM" | "HIGH";

/**
 * Classifies the severity of an agent insight based on type and metrics.
 *
 * Severity rules (Requirements 9.1–9.5):
 * - STOCKOUT_RISK: HIGH if daysUntilStockout <= 3, MEDIUM if [4,7], LOW otherwise
 * - ANOMALY_SPIKE: HIGH if spikePercent > 70, MEDIUM if [50,70] inclusive, LOW otherwise
 * - DEAD_STOCK: always LOW
 */
export function classifyInsightSeverity(
  type: InsightType,
  daysUntilStockout?: number,
  spikePercent?: number
): InsightSeverity {
  if (type === "STOCKOUT_RISK") {
    if (daysUntilStockout === undefined) return "LOW";
    if (daysUntilStockout <= 3) return "HIGH";
    if (daysUntilStockout <= 7) return "MEDIUM";
    return "LOW";
  }

  if (type === "ANOMALY_SPIKE") {
    if (spikePercent === undefined) return "LOW";
    if (spikePercent > 70) return "HIGH";
    if (spikePercent >= 50) return "MEDIUM";
    return "LOW";
  }

  // DEAD_STOCK is always LOW
  return "LOW";
}

export function getRuleBasedDescription(
  type: InsightType,
  severity: InsightSeverity,
  productName: string,
  daysUntilStockout?: number,
  spikePercent?: number
): string {
  if (type === "STOCKOUT_RISK") {
    if (severity === "HIGH") {
      return `URGENT: ${productName} will stock out in ${daysUntilStockout} days. Immediate reorder required.`;
    }
    return `${productName} is predicted to stock out in ${daysUntilStockout} days. Consider reordering soon.`;
  }

  if (type === "ANOMALY_SPIKE") {
    if (severity === "HIGH") {
      return `Unusual spike detected: ${productName} consumption increased by ${spikePercent!.toFixed(0)}% — investigate immediately.`;
    }
    return `Elevated consumption detected for ${productName}: ${spikePercent!.toFixed(0)}% above normal.`;
  }

  return `${productName} has had no consumption in over 30 days. Consider liquidating or reviewing stock levels.`;
}
