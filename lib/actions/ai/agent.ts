"use server";

import { generateText } from "ai";
import { getAIModel } from "@/lib/ai/provider";
import { prisma } from "@/lib/prisma";
import { getOrgContext } from "@/lib/org";
import { invalidateCache } from "@/lib/redis";
import {
  classifyInsightSeverity,
  getRuleBasedDescription,
  type InsightType,
  type InsightSeverity,
} from "@/lib/ai/agent-utils";

// ─── AI Description Generator ────────────────────────────────────────────────

async function generateInsightDescription(
  type: InsightType,
  severity: InsightSeverity,
  productName: string,
  daysUntilStockout?: number,
  spikePercent?: number
): Promise<string> {
  try {
    const model = getAIModel();
    let context = "";

    if (type === "STOCKOUT_RISK") {
      context = `Product "${productName}" is predicted to stock out in ${daysUntilStockout} days (severity: ${severity}).`;
    } else if (type === "ANOMALY_SPIKE") {
      context = `Product "${productName}" has an anomalous consumption spike of ${spikePercent?.toFixed(0)}% above normal (severity: ${severity}).`;
    } else {
      context = `Product "${productName}" has had zero consumption for more than 30 days (potential dead stock).`;
    }

    const prompt = `You are an inventory management assistant. Generate a concise 1-2 sentence actionable insight for the following inventory condition:

${context}

Provide a clear, actionable recommendation for the inventory manager.`;

    const { text } = await generateText({ model, prompt });
    return text;
  } catch {
    return getRuleBasedDescription(type, severity, productName, daysUntilStockout, spikePercent);
  }
}

// ─── Agent Scan ───────────────────────────────────────────────────────────────

const AGENT_STOCKOUT_THRESHOLD_DAYS = 7;
const WINDOW_DAYS = 30;
const RECENT_PERIOD_DAYS = 15;
const ANOMALY_SPIKE_THRESHOLD = 50;

export async function runAgentScan(organizationId: string): Promise<void> {
  const agentRun = await prisma.agentRun.create({
    data: { organizationId, status: "FAILURE" },
  });

  try {
    const now = new Date();
    const windowStart = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const recentStart = new Date(now.getTime() - RECENT_PERIOD_DAYS * 24 * 60 * 60 * 1000);

    // Delete previous unresolved insights before creating new ones to avoid accumulation
    await prisma.agentInsight.deleteMany({
      where: { organizationId, resolved: false },
    });

    // Fetch products + aggregated consumption in parallel using DB groupBy
    type GroupByResult = { productId: string; _sum: { consumed: number | null }; _count: { id: number } };
    const [products, recentAgg, previousAgg] = await Promise.all([
      prisma.product.findMany({
        where: { organizationId },
        select: { id: true, name: true, quantity: true },
        take: 5000, // Safety limit for large orgs
      }),
      prisma.consumptionRecord.groupBy({
        by: ["productId"],
        where: { organizationId, recordedAt: { gte: recentStart } },
        _sum: { consumed: true },
        _count: { id: true },
      }) as unknown as Promise<GroupByResult[]>,
      prisma.consumptionRecord.groupBy({
        by: ["productId"],
        where: { organizationId, recordedAt: { gte: windowStart, lt: recentStart } },
        _sum: { consumed: true },
        _count: { id: true },
      }) as unknown as Promise<GroupByResult[]>,
    ]);

    const recentByProduct = new Map(
      recentAgg.map(r => [r.productId, { total: r._sum.consumed ?? 0, count: r._count.id }])
    );
    const previousByProduct = new Map(
      previousAgg.map(r => [r.productId, { total: r._sum.consumed ?? 0, count: r._count.id }])
    );

    // Build insight candidates synchronously, then generate AI descriptions in parallel
    type InsightCandidate = {
      type: InsightType;
      product: { id: string; name: string; quantity: number };
      daysUntilStockout?: number;
      spikePercent?: number;
      severity: InsightSeverity;
    };

    const candidates: InsightCandidate[] = [];

    for (const product of products) {
      const recent = recentByProduct.get(product.id);
      const previous = previousByProduct.get(product.id);
      const totalCount = (recent?.count ?? 0) + (previous?.count ?? 0);
      const recentTotal = recent?.total ?? 0;
      const previousTotal = previous?.total ?? 0;

      // a. Stockout risk
      if (totalCount >= 3) {
        const totalConsumed = recentTotal + previousTotal;
        const dailyRate = totalConsumed / WINDOW_DAYS;
        if (dailyRate > 0) {
          const daysUntilStockout = Math.floor(product.quantity / dailyRate);
          if (daysUntilStockout <= AGENT_STOCKOUT_THRESHOLD_DAYS) {
            candidates.push({
              type: "STOCKOUT_RISK",
              product,
              daysUntilStockout,
              severity: classifyInsightSeverity("STOCKOUT_RISK", daysUntilStockout),
            });
          }
        }
      }

      // b. Anomaly spike
      if (previousTotal > 0) {
        const spikePercent = ((recentTotal - previousTotal) / previousTotal) * 100;
        if (recentTotal > previousTotal && spikePercent > ANOMALY_SPIKE_THRESHOLD) {
          candidates.push({
            type: "ANOMALY_SPIKE",
            product,
            spikePercent,
            severity: classifyInsightSeverity("ANOMALY_SPIKE", undefined, spikePercent),
          });
        }
      }

      // c. Dead stock
      if (totalCount === 0 && product.quantity > 0) {
        candidates.push({
          type: "DEAD_STOCK",
          product,
          severity: classifyInsightSeverity("DEAD_STOCK"),
        });
      }
    }

    // Generate all AI descriptions in parallel
    const insightsToCreate = await Promise.all(
      candidates.map(async (c) => {
        const description = await generateInsightDescription(
          c.type, c.severity, c.product.name, c.daysUntilStockout, c.spikePercent
        );
        return {
          organizationId,
          insightType: c.type,
          productId: c.product.id,
          productName: c.product.name,
          description,
          severity: c.severity,
        };
      })
    );

    if (insightsToCreate.length > 0) {
      await prisma.agentInsight.createMany({
        data: insightsToCreate.map((i) => ({
          organizationId: i.organizationId,
          insightType: i.insightType,
          productId: i.productId,
          productName: i.productName,
          description: i.description,
          severity: i.severity,
        })),
      });
    }

    await prisma.agentRun.update({
      where: { id: agentRun.id },
      data: { completedAt: new Date(), insightsGenerated: insightsToCreate.length, status: "SUCCESS" },
    });
  } catch (error) {
    await prisma.agentRun.update({
      where: { id: agentRun.id },
      data: { completedAt: new Date(), errorMessage: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
}

// ─── Resolve Agent Insight ────────────────────────────────────────────────────

export async function resolveAgentInsight(insightId: string): Promise<void> {
  const { memberId, organizationId } = await getOrgContext();

  // Verify insight belongs to this org before updating
  const insight = await prisma.agentInsight.findFirst({
    where: { id: insightId, organizationId },
    select: { id: true },
  });
  if (!insight) throw new Error("Insight not found.");

  await prisma.agentInsight.update({
    where: { id: insightId },
    data: { resolved: true, resolvedById: memberId, resolvedAt: new Date() },
  });

  void invalidateCache([`org:${organizationId}:agent:insights`]).catch(() => {});
}
