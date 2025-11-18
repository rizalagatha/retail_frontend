// formatRupiah.ts
import { formatCurrency, RoundingPolicy } from "@/utils/numberUtils";
import { AppConfig } from "@/config/appConfig";

export const formatRupiah = (value: number): string => {
  const policy = AppConfig.roundingPolicy as RoundingPolicy;
  return formatCurrency(Number(value || 0), policy);
};
