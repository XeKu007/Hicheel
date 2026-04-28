"use server";

import { getOrgContext } from "@/lib/org";
import { prisma } from "@/lib/prisma";
import { invalidateCache } from "@/lib/redis";
import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/index";

/**
 * Persists the Member's language preference and invalidates their org context cache.
 */
export async function setLocale(locale: Locale): Promise<{ error?: string }> {
  const ctx = await getOrgContext();

  if (!SUPPORTED_LOCALES.includes(locale as Locale)) {
    return { error: `Unsupported locale: "${locale}". Supported: ${SUPPORTED_LOCALES.join(", ")}` };
  }

  await prisma.member.update({
    where: { id: ctx.memberId },
    data: { locale },
  });

  await invalidateCache([`user:${ctx.userId}:orgContext`]);
  return {};
}
