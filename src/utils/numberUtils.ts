export type RoundingPolicy =
  | "ROUND_1"
  | "ROUND_0"
  | "NONE"
  | "ROUND_50"
  | "ROUND_500"
  | "ROUND_1000";

/**
 * Pembulatan baru:
 * - ROUND_1  → bulatkan biasa (Math.round), hanya hilangkan desimal
 * - ROUND_0  → Math.round
 * - NONE     → biarkan apa adanya
 * - ROUND_50 / 500 / 1000 → tetap kelipatan sesuai definisi lama
 */
export function applyRoundingPolicy(value: number, policy: RoundingPolicy): number {
  if (!isFinite(value)) return value;

  const n = Number(value || 0);

  switch (policy) {
    case "NONE":
      return n;

    case "ROUND_0":
      return Math.round(n);

    case "ROUND_1":
      // aturan baru → hilangkan desimal dengan Math.round biasa
      return Math.round(n);

    case "ROUND_50":
      return Math.round(n / 50) * 50;

    case "ROUND_500":
      return Math.round(n / 500) * 500;

    case "ROUND_1000":
      return Math.round(n / 1000) * 1000;

    default:
      return n;
  }
}

export function formatCurrency(value: number, policy: RoundingPolicy): string {
  const rounded = applyRoundingPolicy(Number(value || 0), policy);
  return new Intl.NumberFormat("id-ID").format(rounded);
}

export function roundForDisplay(value: number, policy: RoundingPolicy): number {
  return applyRoundingPolicy(Number(value || 0), policy);
}
