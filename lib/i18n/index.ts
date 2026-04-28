import { en } from "./en";
import { mn } from "./mn";

export type { TranslationKeys } from "./en";
export type Locale = "en" | "mn";

export const SUPPORTED_LOCALES: Locale[] = ["en", "mn"];
export const DEFAULT_LOCALE: Locale = "en";

const locales: Record<Locale, typeof en> = { en, mn };

/**
 * Returns the translation object for the given locale.
 * Falls back to 'en' for unrecognized locale values.
 */
export function getTranslations(locale: string): typeof en {
  const resolved = SUPPORTED_LOCALES.includes(locale as Locale)
    ? (locale as Locale)
    : DEFAULT_LOCALE;
  // Explicit lookup to avoid dynamic key access
  return resolved === "mn" ? locales.mn : locales.en;
}

/**
 * Resolves a locale string to a supported Locale, defaulting to 'en'.
 */
export function resolveLocale(locale: string | null | undefined): Locale {
  if (locale && SUPPORTED_LOCALES.includes(locale as Locale)) {
    return locale as Locale;
  }
  return DEFAULT_LOCALE;
}
