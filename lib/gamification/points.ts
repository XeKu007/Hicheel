import { StaffActionType } from "@prisma/client";

export const POINT_VALUES: Record<StaffActionType, number> = {
  PRODUCT_CREATED: 10,
  PRODUCT_UPDATED: 5,
  INVENTORY_CHECKED: 1,
};

/**
 * Computes total points from an array of StaffAction records.
 * Pure function — no DB access.
 */
export function calculatePoints(actions: { type: StaffActionType }[]): number {
  return actions.reduce((sum, a) => sum + POINT_VALUES[a.type], 0);
}
