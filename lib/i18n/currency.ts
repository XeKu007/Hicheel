import type { Locale } from "./index";

export const SUPPORTED_CURRENCIES = ["MNT", "USD", "EUR", "CNY", "JPY", "KRW", "GBP"] as const;
export type CurrencyCode = typeof SUPPORTED_CURRENCIES[number];

export interface CurrencyFormat {
  symbol: string;
  decimals: number;
  symbolPosition: "prefix" | "suffix";
  thousandsSep: string;
  decimalSep: string;
}

export const CURRENCY_FORMATS: Record<CurrencyCode, CurrencyFormat> = {
  MNT: { symbol: "₮", decimals: 0, symbolPosition: "prefix", thousandsSep: ",", decimalSep: "." },
  USD: { symbol: "$", decimals: 2, symbolPosition: "prefix", thousandsSep: ",", decimalSep: "." },
  EUR: { symbol: "€", decimals: 2, symbolPosition: "prefix", thousandsSep: ",", decimalSep: "." },
  CNY: { symbol: "¥", decimals: 2, symbolPosition: "prefix", thousandsSep: ",", decimalSep: "." },
  JPY: { symbol: "¥", decimals: 0, symbolPosition: "prefix", thousandsSep: ",", decimalSep: "." },
  KRW: { symbol: "₩", decimals: 0, symbolPosition: "prefix", thousandsSep: ",", decimalSep: "." },
  GBP: { symbol: "£", decimals: 2, symbolPosition: "prefix", thousandsSep: ",", decimalSep: "." },
};

/**
 * Formats a non-negative number using the given currency code.
 * Returns "Invalid amount" for negative values.
 * Throws if currencyCode is not in SUPPORTED_CURRENCIES.
 */
export function formatCurrencyByCode(value: number, currencyCode: CurrencyCode): string {
  if (!SUPPORTED_CURRENCIES.includes(currencyCode)) {
    throw new Error(`Unsupported currency: ${currencyCode}`);
  }

  if (value < 0) {
    return "Invalid amount";
  }

  // Explicit lookup to avoid dynamic key access
  const fmt = CURRENCY_FORMATS[currencyCode as keyof typeof CURRENCY_FORMATS];

  // Format the number with correct decimal places and thousands separators
  const fixed = value.toFixed(fmt.decimals);
  const [intPart, decPart] = fixed.split(".");

  // Add thousands separators
  const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, fmt.thousandsSep);

  const numberStr =
    fmt.decimals > 0 ? `${intFormatted}${fmt.decimalSep}${decPart}` : intFormatted;

  return fmt.symbolPosition === "prefix"
    ? `${fmt.symbol}${numberStr}`
    : `${numberStr}${fmt.symbol}`;
}

/**
 * Parses a formatted currency string back to a number.
 * Returns null if the string cannot be parsed.
 */
export function parseCurrencyString(formatted: string, currencyCode: CurrencyCode): number | null {
  if (typeof formatted !== "string" || formatted === "") {
    return null;
  }

  const fmt = CURRENCY_FORMATS[currencyCode as keyof typeof CURRENCY_FORMATS];

  // Strip symbol
  let stripped = formatted;
  if (fmt.symbolPosition === "prefix" && stripped.startsWith(fmt.symbol)) {
    stripped = stripped.slice(fmt.symbol.length);
  } else if (fmt.symbolPosition === "suffix" && stripped.endsWith(fmt.symbol)) {
    stripped = stripped.slice(0, -fmt.symbol.length);
  } else {
    // Symbol not found — still attempt to parse
  }

  // Remove thousands separators
  stripped = stripped.split(fmt.thousandsSep).join("");

  // Normalize decimal separator to "."
  if (fmt.decimalSep !== ".") {
    stripped = stripped.replace(fmt.decimalSep, ".");
  }

  if (stripped === "") {
    return null;
  }

  const result = parseFloat(stripped);
  return isNaN(result) ? null : result;
}

/**
 * Formats a non-negative number into a locale-appropriate currency string.
 * Returns "Invalid amount" for negative values.
 *
 * en: 1234.56 → "1234.56" (two decimal places, no symbol)
 * mn: 12500   → "₮12,500" (₮ prefix, comma thousands separator, no decimals)
 */
export function formatCurrency(value: number, locale: Locale): string {
  if (value < 0) {
    return "Invalid amount";
  }

  if (locale === "mn") {
    // No decimal places, comma thousands separator, ₮ prefix
    const rounded = Math.round(value);
    const formatted = rounded.toLocaleString("en-US"); // produces comma-separated thousands
    return `₮${formatted}`;
  }

  // en: two decimal places, no symbol
  return value.toFixed(2);
}

/**
 * Parses a formatted MNT string (e.g. "₮12,500") back to a number.
 * Returns null if the string cannot be parsed.
 */
export function parseMNT(formatted: string): number | null {
  if (typeof formatted !== "string") {
    return null;
  }

  // Must start with ₮
  if (!formatted.startsWith("₮")) {
    return null;
  }

  // Remove ₮ prefix and all commas
  const stripped = formatted.slice(1).replace(/,/g, "");

  if (stripped === "") {
    return null;
  }

  // Must be a valid integer (no decimal point)
  if (!/^\d+$/.test(stripped)) {
    return null;
  }

  const result = parseInt(stripped, 10);
  return isNaN(result) ? null : result;
}
