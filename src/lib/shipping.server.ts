import type { CatalogDatabase } from "@/lib/catalog.server";

export type ShippingMethod = "standard" | "express";

export async function quoteShipping(
  database: CatalogDatabase,
  city: string,
  method: ShippingMethod,
  subtotal: number,
  promoCode = "",
) {
  const location = city.trim() || "Other";
  const rates = await database
    .prepare("SELECT standard, express FROM shipping_rates WHERE LOWER(location) = LOWER(?)")
    .bind(location)
    .all<{ standard: number; express: number }>();
  const fallback = await database
    .prepare("SELECT standard, express FROM shipping_rates WHERE LOWER(location) = 'other'")
    .bind()
    .all<{ standard: number; express: number }>();
  const configured = await database
    .prepare("SELECT key, value FROM store_settings WHERE key IN ('standardShipping', 'expressShipping', 'freeDeliveryThreshold', 'promoCode', 'promoDiscount')")
    .bind()
    .all<{ key: string; value: string }>();
  const settings = configured.results.reduce((values, setting) => ({ ...values, [setting.key]: setting.value }), {} as Record<string, string>);
  const rate = rates.results[0] ?? fallback.results[0] ?? {
    standard: Number(settings["standardShipping"] ?? 12),
    express: Number(settings["expressShipping"] ?? 28),
  };
  const configuredThreshold = Number(settings["freeDeliveryThreshold"] ?? 200);
  const threshold = Number.isFinite(configuredThreshold) ? configuredThreshold : 200;
  const configuredPromo = String(settings["promoCode"] ?? "BIGPEE10").trim().toUpperCase();
  const configuredDiscount = Number(settings["promoDiscount"] ?? 10);
  const promoDiscount = Number.isFinite(configuredDiscount) ? configuredDiscount : 0;
  const promoValid = !promoCode.trim() || promoCode.trim().toUpperCase() === configuredPromo;
  const discount = promoValid && promoCode.trim() && Number.isFinite(promoDiscount)
    ? Math.round(subtotal * Math.min(100, Math.max(0, promoDiscount)) / 100)
    : 0;
  const freeDeliveryApplied = subtotal > 0 && threshold > 0 && subtotal >= threshold;
  const shipping = freeDeliveryApplied ? 0 : rate[method];
  return {
    shipping,
    freeDeliveryApplied,
    discount,
    total: Math.max(0, subtotal + shipping - discount),
    promoValid,
    freeDeliveryThreshold: threshold,
    location: rates.results[0] ? location : "Other",
  };
}
