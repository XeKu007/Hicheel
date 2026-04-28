import { StaffActionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/redis";
import { evaluateAndAwardBadges } from "./badges";

export async function trackStaffAction(params: {
  memberId: string;
  organizationId: string;
  type: StaffActionType;
  productId?: string;
  productName?: string;
  quantityBefore?: number;
  quantityAfter?: number;
}): Promise<void> {
  try {
    const { memberId, organizationId, type, productId, productName, quantityBefore, quantityAfter } = params;

    await prisma.staffAction.create({
      data: {
        memberId,
        organizationId,
        type,
        productId: productId ?? null,
        productName: productName ?? null,
        quantityBefore: quantityBefore ?? null,
        quantityAfter: quantityAfter ?? null,
      },
    });

    void Promise.all([
      evaluateAndAwardBadges(memberId, organizationId, type).catch((err) => {
        console.error("[trackStaffAction] Badge evaluation failed:", err);
      }),
      invalidateCache([`org:${organizationId}:leaderboard`]).catch(() => {}),
    ]);
  } catch {
    // Swallow all errors
  }
}
