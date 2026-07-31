// src/composables/useSoDpCheck.ts
import { computed, type Ref } from "vue";

export function useSoDpCheck(
  soNetto: Ref<number>,
  soDp: Ref<number>,
  additionalValue: Ref<number> // total qty*harga dari grid Ukuran SO DTF yang lagi diisi
) {
  // Begitu SO DTF ini ditambahkan, SO otomatis "naik kelas" jadi punya custom order
  // → minimal DP SELALU 50%, terlepas dari status soHasCustomOrDtf sebelumnya.
  const projectedNetto = computed(() => (soNetto.value || 0) + (additionalValue.value || 0));
  const projectedMinDp = computed(() => Math.round(0.5 * projectedNetto.value));
  const isSufficient = computed(() => (soDp.value || 0) >= projectedMinDp.value);
  const shortfall = computed(() => Math.max(0, projectedMinDp.value - (soDp.value || 0)));

  return { projectedNetto, projectedMinDp, isSufficient, shortfall };
}
