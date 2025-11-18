// src/config/appConfig.ts
import type { RoundingPolicy as RP } from "@/utils/numberUtils";

// Vite uses import.meta.env, not process.env
const envPolicy =
  import.meta.env.VITE_APP_ROUNDING_POLICY ||
  import.meta.env.VITE_ROUNDING_POLICY ||
  "ROUND_1";

export const RoundingPolicy = envPolicy as RP;

export const AppConfig = {
  roundingPolicy: RoundingPolicy,
};
