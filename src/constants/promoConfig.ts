// src/constants/promoConfig.ts

/**
 * Konfigurasi promo-promo khusus yang perilakunya di-hardcode
 * (bukan murni data-driven dari tabel promo), karena mekanismenya
 * unik dan tidak representable lewat form promo standar.
 */

// --- MAPS REVIEW 5% (sudah ada sebelumnya, didokumentasikan di sini agar terpusat) ---
export const PROMO_MAPS_REVIEW = "PRO-2026-003";

// --- GRAND OPENING K12 ---
export const PROMO_GRAND_OPENING_K12 = {
  proNomor: "PRO-2025-004",
  cabang: "K12",
  // Kriteria pencarian barang untuk item hadiah gratis
  freeItemFilter: {
    kategori: "REGULER",
    namaContains: "COMBED 24S",
  },
} as const;

/**
 * Cek apakah promo Grand Opening K12 sedang berlaku untuk konteks transaksi ini.
 * @param cabang Kode cabang user saat ini
 * @param activePromoNomors Daftar pro_nomor yang sedang aktif (dari activePromos composable)
 */
export const isGrandOpeningK12Active = (cabang: string, activePromoNomors: string[]): boolean => {
  return (
    cabang === PROMO_GRAND_OPENING_K12.cabang &&
    activePromoNomors.includes(PROMO_GRAND_OPENING_K12.proNomor)
  );
};

/**
 * Cek apakah sebuah item barang cocok sebagai kandidat "hadiah gratis"
 * untuk promo Grand Opening K12 (kategori Reguler + nama mengandung COMBED 24S).
 */
export const isEligibleFreeGiftItem = (item: { kategori?: string; nama?: string }): boolean => {
  const { kategori, namaContains } = PROMO_GRAND_OPENING_K12.freeItemFilter;
  const matchKategori = (item.kategori || "").toUpperCase() === kategori;
  const matchNama = (item.nama || "").toUpperCase().includes(namaContains);
  return matchKategori && matchNama;
};
