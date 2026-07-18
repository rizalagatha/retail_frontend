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
    // Kategori REGULER dan SESIONAL sama-sama diperbolehkan (dewasa & anak) —
    // banyak Combed 24S (termasuk varian anak) di-kategorikan SESIONAL, bukan REGULER.
    kategoriAllowed: ["REGULER", "SESIONAL"],
    namaContains: "COMBED 24S",
  },
  minBelanjaFreeItem: 40000,
} as const;

// [BARU] Urutan ukuran standar, dari terkecil ke terbesar — dipakai untuk
// memastikan ukuran hadiah gratis tidak lebih besar dari barang yang dibeli.
const SIZE_ORDER: Record<string, number> = {
  XS: 1,
  S: 2,
  M: 3,
  L: 4,
  XL: 5,
  "2XL": 6,
  XXL: 6,
  "3XL": 7,
  XXXL: 7,
  "4XL": 8,
  XXXXL: 8,
  "5XL": 9,
  XXXXXL: 9,
};

/**
 * Cari peringkat ukuran (semakin besar angka = semakin besar ukurannya).
 * Ukuran numerik (mis. celana 28/29/30) diberi offset +100 agar tidak
 * bentrok dengan mapping standar. Ukuran tak dikenal dianggap paling besar
 * (999) — supaya default-nya "tolak" saat perbandingan, bukan "izinkan".
 */
const getSizeRank = (ukuran: string): number => {
  const s = (ukuran || "").toUpperCase().trim();
  if (SIZE_ORDER[s] !== undefined) return SIZE_ORDER[s];
  const numeric = parseInt(s, 10);
  if (!isNaN(numeric)) return numeric + 100;
  return 999;
};

/**
 * Cek apakah ukuran barang hadiah gratis diperbolehkan, dibandingkan
 * ukuran TERBESAR dari barang COMBED 24S (eligible) yang sudah dibeli
 * di keranjang. Hadiah harus sama atau lebih kecil — tidak boleh lebih besar.
 */
export const isFreeGiftSizeAllowed = (
  giftUkuran: string,
  purchasedItems: {
    kode?: string;
    nama?: string;
    kategori?: string;
    ukuran?: string;
    isFreeGift?: boolean;
  }[]
): boolean => {
  // [REVISI] Dasar ukuran sekarang dari SEMUA barang yang dibeli (bukan
  // cuma Combed 24S), karena pemicu minimal belanja sudah tidak terbatas
  // kategori tertentu.
  const purchasedSizes = purchasedItems
    .filter((item) => item.kode && !item.isFreeGift)
    .map((item) => getSizeRank(item.ukuran || ""));

  if (purchasedSizes.length === 0) return false; // tidak ada barang acuan, jangan izinkan

  const maxPurchasedRank = Math.max(...purchasedSizes);
  const giftRank = getSizeRank(giftUkuran);

  // [PERBAIKAN]: Mengizinkan ukuran hadiah maksimal 1 tingkat di atas ukuran terbesar yang dibeli
  return giftRank <= maxPurchasedRank + 1;
};

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
  const { kategoriAllowed, namaContains } = PROMO_GRAND_OPENING_K12.freeItemFilter;

  const namaUp = (item.nama || "").toUpperCase();
  const kategoriUp = (item.kategori || "").toUpperCase();

  if (!namaUp.includes(namaContains)) return false;
  return (kategoriAllowed as readonly string[]).includes(kategoriUp);
};

/**
 * Hitung subtotal barang di keranjang yang termasuk kategori hadiah gratis
 * (REGULER + nama mengandung COMBED 24S), dipakai untuk cek syarat minimal
 * belanja Rp40.000 sebelum tombol "Scan Hadiah Gratis" ditampilkan.
 */
export const calcFreeGiftEligibleSubtotal = (
  items: {
    kode?: string;
    nama?: string;
    kategori?: string;
    harga?: number;
    jumlah?: number;
    isFreeGift?: boolean;
  }[]
): number => {
  // [REVISI] Pemicu minimal belanja sekarang dari SEMUA pembelian, tidak
  // terbatas Combed 24S. Barang yang boleh JADI hadiah gratisnya sendiri
  // tetap dibatasi Combed 24S (lihat isEligibleFreeGiftItem, dipakai
  // terpisah di validasi scan barcode hadiah).
  return items.reduce((sum, item) => {
    if (!item.kode || item.isFreeGift) return sum;
    return sum + (item.harga || 0) * (item.jumlah || 0);
  }, 0);
};
