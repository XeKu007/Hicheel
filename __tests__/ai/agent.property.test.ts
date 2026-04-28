// Feature: ai-agent-workflow, Property 14: Agent Severity Classification — Stockout
// Feature: ai-agent-workflow, Property 15: Agent Severity Classification — Anomaly Spike
// Feature: ai-agent-workflow, Property 16: Dead Stock Severity

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { classifyInsightSeverity } from "../../lib/ai/agent-utils";

// ── Property 14: Agent Severity Classification — Stockout ─────────────────────

describe("Property 14: Agent Severity Classification — Stockout", () => {
  /**
   * Validates: Requirements 9.1, 9.3
   *
   * For any daysUntilStockout <= 3, severity SHALL be HIGH.
   * For any daysUntilStockout in [4, 7], severity SHALL be MEDIUM.
   * For any daysUntilStockout > 7, severity SHALL be LOW.
   */

  it("assigns HIGH severity when daysUntilStockout <= 3", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 3 }),
        (days) => {
          const severity = classifyInsightSeverity("STOCKOUT_RISK", days);
          expect(severity).toBe("HIGH");
        }
      ),
      { numRuns: 100 }
    );
  });

  it("assigns MEDIUM severity when daysUntilStockout is in [4, 7]", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 4, max: 7 }),
        (days) => {
          const severity = classifyInsightSeverity("STOCKOUT_RISK", days);
          expect(severity).toBe("MEDIUM");
        }
      ),
      { numRuns: 100 }
    );
  });

  it("assigns LOW severity when daysUntilStockout > 7", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 8, max: 10_000 }),
        (days) => {
          const severity = classifyInsightSeverity("STOCKOUT_RISK", days);
          expect(severity).toBe("LOW");
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── Property 15: Agent Severity Classification — Anomaly Spike ────────────────

describe("Property 15: Agent Severity Classification — Anomaly Spike", () => {
  /**
   * Validates: Requirements 9.2, 9.4
   *
   * For any spikePercent > 70, severity SHALL be HIGH.
   * For any spikePercent in [50, 70] inclusive, severity SHALL be MEDIUM.
   */

  it("assigns HIGH severity when spikePercent > 70", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 70.001, max: 10_000, noNaN: true }),
        (spike) => {
          const severity = classifyInsightSeverity("ANOMALY_SPIKE", undefined, spike);
          expect(severity).toBe("HIGH");
        }
      ),
      { numRuns: 100 }
    );
  });

  it("assigns MEDIUM severity when spikePercent is in [50, 70] inclusive", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 50, max: 70, noNaN: true }),
        (spike) => {
          const severity = classifyInsightSeverity("ANOMALY_SPIKE", undefined, spike);
          expect(severity).toBe("MEDIUM");
        }
      ),
      { numRuns: 100 }
    );
  });

  it("assigns LOW severity when spikePercent < 50", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 49.999, noNaN: true }),
        (spike) => {
          const severity = classifyInsightSeverity("ANOMALY_SPIKE", undefined, spike);
          expect(severity).toBe("LOW");
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── Property 16: Dead Stock Severity ─────────────────────────────────────────

describe("Property 16: Dead Stock Severity", () => {
  /**
   * Validates: Requirements 9.5
   *
   * For any DEAD_STOCK insight, severity SHALL always be LOW.
   */

  it("always assigns LOW severity for DEAD_STOCK regardless of other parameters", () => {
    fc.assert(
      fc.property(
        fc.option(fc.integer({ min: 0, max: 10_000 }), { nil: undefined }),
        fc.option(fc.double({ min: 0, max: 10_000, noNaN: true }), { nil: undefined }),
        (days, spike) => {
          const severity = classifyInsightSeverity("DEAD_STOCK", days, spike);
          expect(severity).toBe("LOW");
        }
      ),
      { numRuns: 100 }
    );
  });
});
