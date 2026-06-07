// src/composables/useAutoPromo.ts
import { ref } from "vue";
import api from "@/services/api";
import { formatRupiah } from "@/utils/formatRupiah";

// ─── Types ────────────────────────────────────────────────
export interface ActivePromo {
  pro_nomor: string;
  pro_judul: string;
  pro_jenis: number;
  pro_f1: "Y" | "N";
  pro_totalrp: number;
  pro_totalqty: number;
  pro_disrp: number;
  pro_dispersen: number;
  pro_lipat: "Y" | "N";
  pro_basis: "ALL" | "KATEGORI" | "TIPE" | "ITEM";
  pro_exclude_kode: string;
  pro_include_kata: string;
  pro_mode_barang: "TRIGGER" | "DISCOUNT";
  pro_no_maps: boolean;
  pro_no_disc_member: boolean; // true = tidak bisa digabung diskon member P1
  level_exclude: string[];
}

export interface PromoResult {
  nomorPromo: string;
  namaPromo: string;
  diskonRp: number;
  diskonPersen1: number; // 0 jika pro_no_disc_member = true
  itemDiscounts: Map<string, { persen: number; rp: number }>;
}

export interface PromoItem {
  id: number;
  kode?: string;
  nama?: string;
  ukuran?: string;
  jumlah: number;
  harga?: number;
  diskonPersen?: number;
  diskonRp?: number;
  total?: number;
  kategori?: string;
  noPengajuanHarga?: string;
  noSoDtf?: string;
  terhitungPromo: boolean;
}

export interface PromoHeader {
  tanggal: string;
  gudang: { kode: string };
  customer: { level?: string; level_kode?: string };
  nomorSo: string;
  nomorPromo: string;
  namaPromo: string;
  diskonRp: number;
  diskonPersen1: number;
  diskonPersen2: number;
}

// ─── Composable ───────────────────────────────────────────
export function useAutoPromo(
  header: PromoHeader,
  items: { value: PromoItem[] },
  options?: {
    onNotify?: (msg: string, type: "success" | "warning" | "info") => void;
    skipIfFromSo?: boolean;
    isItemEligible?: (item: PromoItem) => boolean;
    onFakturPromoAvailable?: (promo: { nomor: string; nama: string; diskon: number }) => void;
    shouldSkipEvaluate?: () => boolean;
  }
) {
  const activePromos = ref<ActivePromo[]>([]);
  const appliedPromos = ref<string[]>([]);
  const notification = ref("");
  const isMapsApplied = ref(false);
  const isEvaluating = ref(false);
  const lastFetchKey = ref("");
  const itemDiscountMap = ref<Map<string, { nama: string; persen: number; rp: number }>>(new Map());
  const totalAppliedDiskon = ref(0);

  // ── Fetch ──────────────────────────────────────────────
  const fetchPromos = async (cabang: string, tanggal: string): Promise<void> => {
    const key = `${cabang}|${tanggal}`;
    if (key === lastFetchKey.value) return;
    try {
      const res = await api.get("/invoice-form/lookup/active-promos", {
        params: { tanggal, cabang },
      });
      activePromos.value = res.data ?? [];
      lastFetchKey.value = key;
    } catch (err) {
      console.error("[useAutoPromo] fetchPromos error:", err);
    }
  };

  // ── Helpers ────────────────────────────────────────────
  const isLevelExcluded = (promo: ActivePromo): boolean => {
    if (!promo.level_exclude?.length) return false;
    const lvl = String(
      header.customer.level_kode || (header.customer.level || "").charAt(0) || "1"
    );
    return promo.level_exclude.includes(lvl);
  };

  const isItemEligible = (item: PromoItem, promo: ActivePromo): boolean => {
    if (!item.kode) return false;

    if (options?.isItemEligible && !options.isItemEligible(item)) return false;

    const kodeUp = item.kode.toUpperCase();
    const namaUp = (item.nama || "").toUpperCase(); // [TAMBAH]

    // 1. Exclude kode barang tertentu
    if (promo.pro_exclude_kode) {
      const excludeKodes = promo.pro_exclude_kode
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      if (excludeKodes.includes(kodeUp)) return false;
    }

    // 2. Jasa murni selalu dikecualikan
    if (kodeUp.startsWith("JASA") || kodeUp.startsWith("JS")) return false;

    // 3. Berdasarkan pro_basis
    switch (promo.pro_basis) {
      case "ALL":
        // [TAMBAH] Cek include_kata meski basis ALL
        // Kalau include_kata diisi, item harus mengandung salah satu kata
        if (promo.pro_include_kata) {
          const includeKatas = promo.pro_include_kata
            .split(",")
            .map((s) => s.trim().toUpperCase())
            .filter(Boolean);
          return includeKatas.some((k) => namaUp.includes(k));
        }
        return true;

      case "KATEGORI":
        // [FIX] Kombinasi: harus REGULER DAN mengandung kata kunci (jika diisi)
        if ((item.kategori || "").toUpperCase() !== "REGULER") return false;
        if (promo.pro_include_kata) {
          const includeKatas = promo.pro_include_kata
            .split(",")
            .map((s) => s.trim().toUpperCase())
            .filter(Boolean);
          return includeKatas.some((k) => namaUp.includes(k));
        }
        return true; // REGULER tapi tanpa filter kata = semua REGULER lolos

      case "TIPE":
        // Filter berdasarkan kata kunci nama barang
        if (promo.pro_include_kata) {
          const includeKatas = promo.pro_include_kata
            .split(",")
            .map((s) => s.trim().toUpperCase())
            .filter(Boolean);
          return includeKatas.some((k) => namaUp.includes(k));
        }
        return true;

      case "ITEM":
        return true;

      default:
        return true;
    }
  };

  const calcEligibleTotal = (promo: ActivePromo): number =>
    items.value.reduce((sum, item) => {
      if (!item.kode) return sum;
      if (item.noPengajuanHarga) return sum;
      if (!isItemEligible(item, promo)) return sum;

      // [TAMBAH] Jika item ini punya diskon spesifik di itemDiscountMap,
      // skip dari hitungan diskon faktur (sudah dapat diskon sendiri)
      const key = `${item.kode}||${item.ukuran}`;
      if (itemDiscountMap.value.has(key)) return sum;

      return sum + (item.total || 0);
    }, 0);

  // ── Evaluasi Faktur ────────────────────────────────────
  const evaluateFakturPromos = (): {
    nomors: string[];
    namas: string[];
    totalDiskon: number;
    hasNoDiscMember: boolean;
  } => {
    const nomors: string[] = [];
    const namas: string[] = [];
    let totalDiskon = 0;
    let hasNoDiscMember = false;

    const fakturPromos = activePromos.value.filter(
      (p) =>
        p.pro_f1 === "N" &&
        (p.pro_jenis === 1 || p.pro_jenis === 3) &&
        p.pro_mode_barang !== "DISCOUNT" &&
        p.pro_nomor !== "PRO-2026-003"
    );

    for (const promo of fakturPromos) {
      if (isLevelExcluded(promo)) continue;

      const eligible = calcEligibleTotal(promo);
      if (promo.pro_totalrp > 0 && eligible < promo.pro_totalrp) continue;

      let diskon = 0;
      if (promo.pro_disrp > 0) {
        diskon =
          promo.pro_lipat === "Y"
            ? Math.floor(eligible / promo.pro_totalrp) * promo.pro_disrp
            : promo.pro_disrp;
      } else if (promo.pro_dispersen > 0) {
        diskon = (promo.pro_dispersen / 100) * eligible;
      }

      if (diskon <= 0) continue;

      totalDiskon += diskon;
      nomors.push(promo.pro_nomor);
      namas.push(promo.pro_judul);

      if (promo.pro_no_disc_member) hasNoDiscMember = true;
    }

    return { nomors, namas, totalDiskon, hasNoDiscMember };
  };

  // ── Evaluasi Per Item ──────────────────────────────────
  const evaluateItemPromos = async (): Promise<void> => {
    itemDiscountMap.value.clear();

    const itemPromos = activePromos.value.filter(
      (p) => p.pro_f1 === "N" && (p.pro_jenis === 4 || p.pro_mode_barang === "DISCOUNT")
    );
    if (!itemPromos.length) return;

    // Hitung total keranjang saat ini (sebelum diskon item)
    const totalKeranjang = items.value.reduce((sum, item) => {
      if (!item.kode) return sum;
      // Pakai harga × jumlah (gross), bukan item.total yang mungkin sudah kena diskon
      return sum + (item.harga || 0) * (item.jumlah || 0);
    }, 0);

    for (const promo of itemPromos) {
      if (isLevelExcluded(promo)) continue;

      // [FIX] Cek syarat minimum sebelum fetch API
      if (promo.pro_totalrp > 0 && totalKeranjang < promo.pro_totalrp) {
        // Syarat belum terpenuhi, skip promo ini
        continue;
      }

      try {
        const { data } = await api.get(`/invoice-form/lookup/promo-items/${promo.pro_nomor}`);
        for (const pi of data || []) {
          const key = `${pi.kode}||${pi.ukuran}`;
          const existing = itemDiscountMap.value.get(key);
          if (!existing || pi.discPersen > existing.persen) {
            itemDiscountMap.value.set(key, {
              nama: pi.nama || pi.kode,
              persen: pi.discPersen || 0,
              rp: pi.discRp || 0,
            });
          }
        }
      } catch (err) {
        console.error("[useAutoPromo] evaluateItemPromos error:", err);
      }
    }
  };

  const applyItemDiscounts = (): void => {
    if (!itemDiscountMap.value.size) return;
    items.value.forEach((item) => {
      if (!item.kode) return;
      const key = `${item.kode}||${item.ukuran}`;

      const disc = itemDiscountMap.value.get(key);
      if (disc) {
        // [FIX] Selalu terapkan diskon item spesifik, override apapun yang ada
        item.diskonPersen = disc.persen;
        item.diskonRp = disc.rp || Math.round(((item.harga || 0) * disc.persen) / 100);
        item.terhitungPromo = true;
        item.total = Math.max(0, (item.jumlah || 0) * ((item.harga || 0) - (item.diskonRp || 0)));
      }
      // [HAPUS] Jangan reset item yang tidak ada di map — biarkan kondisi aslinya
    });
  };

  // ── Evaluasi Utama ─────────────────────────────────────
  const evaluate = async (): Promise<PromoResult | null> => {
    if (options?.skipIfFromSo !== false && header.nomorSo) return null;
    if (options?.shouldSkipEvaluate?.()) return null;
    if (isEvaluating.value) return null;

    isEvaluating.value = true;

    try {
      await fetchPromos(header.gudang.kode, header.tanggal);

      if (!activePromos.value.length) {
        _clearApplied();
        return null;
      }

      await evaluateItemPromos();
      applyItemDiscounts();

      // [KUNCI PERBAIKAN: JANGAN LANGSUNG RETURN NULL]
      // Cek apakah promo yang menempel di header adalah promo otomatis.
      // Jika iya, izinkan sistem menghitung ulang kelipatan terbarunya!
      const nonMapsPromos = header.nomorPromo
        .split(",")
        .map((n) => n.trim())
        .filter((n) => n !== "" && n !== "PRO-2026-003");

      if (nonMapsPromos.length > 0) {
        // Cek apakah semua promo yg terpasang ada di dalam daftar promo aktif
        const isAllAutoPromo = nonMapsPromos.every((id) =>
          activePromos.value.some((ap) => ap.pro_nomor === id)
        );

        // Jika ada promo manual asing (misal custom dari manager), baru BLOKIR
        if (!isAllAutoPromo) return null;
      }

      // Hitung kelipatan promo terbaru berdasarkan nominal keranjang saat ini
      // Di sinilah kelipatan 2x (Misal 25.000) akan didapatkan!
      const { nomors, namas, totalDiskon, hasNoDiscMember } = evaluateFakturPromos();

      const newNomorStr = nomors.join(",");
      const currentNonMaps = nonMapsPromos.join(",");

      if (nomors.length > 0 && currentNonMaps !== newNomorStr) {
        if (options?.onFakturPromoAvailable) {
          const sortedCurrent = currentNonMaps.split(",").sort().join(",");
          const sortedNew = newNomorStr.split(",").sort().join(",");
          if (sortedCurrent !== sortedNew) {
            options.onFakturPromoAvailable({
              nomor: newNomorStr,
              nama: namas.join(" + "),
              diskon: totalDiskon,
            });
          }

          // Kembalikan header as-is (status quo) agar tidak menimpa state otomatis
          // dan biarkan UI yang memutuskan lewat dialog konfirmasi.
          return {
            nomorPromo: header.nomorPromo,
            namaPromo: header.namaPromo,
            diskonRp: header.diskonRp,
            diskonPersen1: header.diskonPersen1,
            itemDiscounts: itemDiscountMap.value,
          };
        }
      }

      // [KUNCI PERBAIKAN 2: AUTO-RESET JIKA SYARAT JATUH]
      // Jika total keranjang turun di bawah syarat promo
      if (!nomors.length && !itemDiscountMap.value.size) {
        if (appliedPromos.value.length > 0 || nonMapsPromos.length > 0) {
          _notify("⚠️ Syarat minimal belanja tidak terpenuhi. Promo dilepas.", "warning");
          _clearApplied();

          // Kembalikan diskonRp 0 agar UI langsung update mereset angka diskonnya
          return {
            nomorPromo: header.nomorPromo.includes("PRO-2026-003") ? "PRO-2026-003" : "",
            namaPromo: header.nomorPromo.includes("PRO-2026-003") ? "MAPS 5%" : "",
            diskonRp: 0,
            diskonPersen1: header.diskonPersen1,
            itemDiscounts: new Map(),
          };
        }
        _clearApplied();
        return null;
      }

      // Pertahankan Maps 5% jika sebelumnya sudah aktif
      const hasMaps = isMapsApplied.value || header.nomorPromo.includes("PRO-2026-003");
      const finalNomors = hasMaps ? [...nomors, "PRO-2026-003"] : [...nomors];
      const finalNamas = hasMaps ? [...namas, "MAPS 5%"] : [...namas];

      const prevApplied = appliedPromos.value.join(",");
      const newApplied = finalNomors.join(",");

      // [KUNCI PERBAIKAN 3: NOTIFIKASI KELIPATAN NAIK]
      // Trigger update UI jika nilai diskon naik (misal dari 12.500 jadi 25.000)
      if (prevApplied !== newApplied || totalAppliedDiskon.value !== totalDiskon) {
        let bannerMessage = ""; // Penampung pesan prioritas untuk Banner Biru UI

        if (nomors.length > 0) {
          const label = nomors.length > 1 ? `${nomors.length} Promo` : namas.join(" + ");
          bannerMessage = `✅ ${label} diterapkan otomatis: Hemat ${formatRupiah(totalDiskon)}`;

          // Kirim toast langsung (tanpa menimpa state notification berulang kali)
          options?.onNotify?.(bannerMessage, "success");

          if (hasNoDiscMember && header.diskonPersen1 > 0) {
            options?.onNotify?.(
              "ℹ️ Diskon member (P1) dinonaktifkan karena tidak bisa digabung dengan promo ini.",
              "info"
            );
          }
        }

        if (itemDiscountMap.value.size > 0) {
          const msg = `✅ Diskon item otomatis untuk ${itemDiscountMap.value.size} jenis barang`;
          options?.onNotify?.(msg, "success"); // Kirim toast

          // Jika TIDAK ADA promo faktur, baru gunakan pesan ini untuk Banner Biru
          if (!bannerMessage) bannerMessage = msg;
        }

        // Tulis ke state UI (Banner Biru) HANYA SEKALI dengan pesan prioritas
        notification.value = bannerMessage;
      }

      appliedPromos.value = finalNomors;
      totalAppliedDiskon.value = totalDiskon;

      // Hasil evaluasi terbaru dikirim ke UI
      return {
        nomorPromo: finalNomors.join(","),
        namaPromo: finalNamas.join(" + "),
        diskonRp: totalDiskon, // <--- INI AKAN MENARIK NOMINAL KELIPATAN TERBARU! (Misal: 25000)
        diskonPersen1: hasNoDiscMember ? 0 : header.diskonPersen1,
        itemDiscounts: itemDiscountMap.value,
      };
    } finally {
      isEvaluating.value = false;
    }
  };

  // ── Toggle Maps ────────────────────────────────────────
  const toggleMaps = (): void => {
    isMapsApplied.value = !isMapsApplied.value;

    if (isMapsApplied.value) {
      const hasNoMapsPromo = appliedPromos.value.some((n) => {
        const p = activePromos.value.find((ap) => ap.pro_nomor === n);
        return p?.pro_no_maps === true;
      });
      if (hasNoMapsPromo) {
        isMapsApplied.value = false;
        _notify("⚠️ Promo aktif tidak bisa dikombinasi dengan Promo Maps Review.", "warning");
        return;
      }
      if (!header.nomorPromo.includes("PRO-2026-003")) {
        header.nomorPromo = header.nomorPromo
          ? `${header.nomorPromo},PRO-2026-003`
          : "PRO-2026-003";
        header.namaPromo = header.namaPromo ? `${header.namaPromo} + MAPS 5%` : "MAPS 5%";
        header.diskonPersen2 = 5;
      }
      _notify("✅ Promo Maps Review 5% diterapkan.", "success");
    } else {
      header.nomorPromo = header.nomorPromo
        .replace(",PRO-2026-003", "")
        .replace("PRO-2026-003,", "")
        .replace("PRO-2026-003", "");
      header.namaPromo = header.namaPromo.replace(" + MAPS 5%", "").replace("MAPS 5%", "");
      header.diskonPersen2 = 0;
      _notify("ℹ️ Promo Maps Review dicabut.", "info");
    }
  };

  // ── Helpers internal ───────────────────────────────────
  const _clearApplied = (): void => {
    appliedPromos.value = [];
    itemDiscountMap.value.clear();
    notification.value = "";
    totalAppliedDiskon.value = 0;
  };

  const clear = (): void => {
    _clearApplied();
    isMapsApplied.value = false;
    header.nomorPromo = "";
    header.namaPromo = "";
    header.diskonRp = 0;
    header.diskonPersen1 = 0;
    header.diskonPersen2 = 0;
  };

  const _notify = (msg: string, type: "success" | "warning" | "info"): void => {
    notification.value = msg;
    options?.onNotify?.(msg, type);
  };

  // ── debouncedEvaluate ──────────────────────────────────
  let debounceTimer: ReturnType<typeof setTimeout>;
  const debouncedEvaluate = (): void => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const result = await evaluate();
      if (result) {
        header.nomorPromo = result.nomorPromo;
        header.namaPromo = result.namaPromo;
        header.diskonRp = result.diskonRp;
        header.diskonPersen1 = result.diskonPersen1;
      }
    }, 400);
  };

  const flushEvaluate = async (): Promise<void> => {
    clearTimeout(debounceTimer); // Cancel debounce yang belum jalan
    const result = await evaluate();
    if (result) {
      header.nomorPromo = result.nomorPromo;
      header.namaPromo = result.namaPromo;
      header.diskonRp = result.diskonRp;
      header.diskonPersen1 = result.diskonPersen1;
    }
  };

  return {
    activePromos,
    appliedPromos,
    notification,
    isMapsApplied,
    isEvaluating,
    itemDiscountMap,
    totalAppliedDiskon,
    fetchPromos,
    evaluate,
    debouncedEvaluate,
    flushEvaluate,
    toggleMaps,
    clear,
  };
}
