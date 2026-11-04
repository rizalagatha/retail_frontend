import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import api from "@/services/api";

const STORAGE_KEY = "kaosan-cart-v1";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_LINES = 50;
const MAX_QTY = 99;
const REFRESH_GAP_MS = 60_000;

export interface CartLine {
  kode: string;
  ukuran: string;
  nama: string;
  gambar: string | null;
  harga: number;
  hargaPromo: number | null;
  stok: number;
  qty: number;
}
export type CartLineInput = Omit<CartLine, "qty">;
export interface CartToko {
  kode: string;
  nama: string;
}
export type AddResult = "ok" | "beda-toko" | "penuh";

interface StokRow {
  kode: string;
  ukuran: string;
  harga: number;
  harga_promo?: number | null;
  stok: number;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const keyOf = (kode: string, ukuran: string) => `${kode}||${ukuran}`;

// Isi localStorage bisa diubah user: validasi tiap field, jangan percaya bentuknya
const parseLine = (raw: unknown): CartLine | null => {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const kode = str(r.kode).trim();
  const ukuran = str(r.ukuran).trim();
  const qty = Math.floor(num(r.qty));
  if (!kode || !ukuran || qty < 1) return null;
  return {
    kode,
    ukuran,
    nama: str(r.nama),
    gambar: typeof r.gambar === "string" ? r.gambar : null,
    harga: Math.max(0, num(r.harga)),
    hargaPromo: r.hargaPromo ? Math.max(0, num(r.hargaPromo)) : null,
    stok: Math.max(0, Math.floor(num(r.stok))),
    qty: Math.min(qty, MAX_QTY),
  };
};

const hydrate = (): { toko: string; tokoNama: string; lines: CartLine[] } | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Record<string, unknown>;
    if (p.v !== 1 || Date.now() - num(p.updatedAt) > MAX_AGE_MS) return null;
    const unik = new Map<string, CartLine>();
    (Array.isArray(p.lines) ? p.lines : []).forEach((x: unknown) => {
      const l = parseLine(x);
      if (l && unik.size < MAX_LINES) unik.set(keyOf(l.kode, l.ukuran), l);
    });
    const toko = str(p.toko).trim();
    if (!toko || !unik.size) return null;
    return { toko, tokoNama: str(p.tokoNama), lines: [...unik.values()] };
  } catch {
    return null;
  }
};

export const useCartStore = defineStore("cart", () => {
  const saved = hydrate();
  const toko = ref(saved?.toko ?? "");
  const tokoNama = ref(saved?.tokoNama ?? "");
  const lines = ref<CartLine[]>(saved?.lines ?? []);
  const open = ref(false);
  const refreshing = ref(false);
  const refreshError = ref(false);
  let lastRefresh = 0;

  const unitPrice = (l: CartLine) => (l.hargaPromo && l.hargaPromo > 0 ? l.hargaPromo : l.harga);
  const bermasalah = (l: CartLine) => l.stok <= 0 || l.qty > l.stok;
  const bisaNaik = (l: CartLine) => l.qty < Math.min(l.stok, MAX_QTY);

  const count = computed(() => lines.value.reduce((s, l) => s + l.qty, 0));
  const subtotal = computed(() => lines.value.reduce((s, l) => s + unitPrice(l) * l.qty, 0));
  const adaMasalah = computed(() => lines.value.some(bermasalah));

  const find = (kode: string, ukuran: string) =>
    lines.value.find((l) => l.kode === kode && l.ukuran === ukuran);
  const qtyOf = (kode: string, ukuran: string) => find(kode, ukuran)?.qty ?? 0;

  const resetBilaKosong = () => {
    if (!lines.value.length) {
      toko.value = "";
      tokoNama.value = "";
    }
  };

  const add = (t: CartToko, input: CartLineInput): AddResult => {
    if (lines.value.length && toko.value !== t.kode) return "beda-toko";
    const ada = find(input.kode, input.ukuran);
    if (ada) {
      ada.stok = input.stok;
      ada.harga = input.harga;
      ada.hargaPromo = input.hargaPromo;
      if (!bisaNaik(ada)) return "penuh";
      ada.qty += 1;
    } else {
      if (lines.value.length >= MAX_LINES || input.stok < 1) return "penuh";
      lines.value.push({ ...input, qty: 1 });
    }
    toko.value = t.kode;
    tokoNama.value = t.nama;
    return "ok";
  };

  const ubahQty = (kode: string, ukuran: string, delta: 1 | -1) => {
    const l = find(kode, ukuran);
    if (!l) return;
    if (delta > 0 && !bisaNaik(l)) return;
    l.qty += delta;
    if (l.qty < 1) hapus(kode, ukuran);
  };

  const hapus = (kode: string, ukuran: string) => {
    lines.value = lines.value.filter((l) => !(l.kode === kode && l.ukuran === ukuran));
    resetBilaKosong();
  };

  const kosongkan = () => {
    lines.value = [];
    resetBilaKosong();
  };

  // Buang barang yang habis, turunkan qty yang melebihi stok
  const sesuaikan = () => {
    lines.value = lines.value
      .filter((l) => l.stok > 0)
      .map((l) => ({ ...l, qty: Math.min(l.qty, l.stok) }));
    resetBilaKosong();
  };

  // Ambil ulang stok dan harga dari server: yang tersimpan di perangkat hanya cuplikan lama
  const refresh = async (force = false) => {
    if (!toko.value || !lines.value.length) return;
    if (!force && Date.now() - lastRefresh < REFRESH_GAP_MS) return;
    refreshing.value = true;
    refreshError.value = false;
    try {
      const { data } = await api.get<StokRow[]>("/so/public/cek-stok", {
        params: { cabang: toko.value, q: "" },
      });
      const peta = new Map<string, StokRow>();
      data.forEach((r) => peta.set(keyOf(r.kode, r.ukuran), r));
      lines.value.forEach((l) => {
        const r = peta.get(keyOf(l.kode, l.ukuran));
        l.stok = r ? Math.max(0, Math.floor(num(r.stok))) : 0;
        if (r) {
          l.harga = num(r.harga);
          l.hargaPromo = r.harga_promo ? num(r.harga_promo) : null;
        }
      });
      lastRefresh = Date.now();
    } catch {
      refreshError.value = true;
    } finally {
      refreshing.value = false;
    }
  };

  watch(
    [toko, tokoNama, lines],
    () => {
      try {
        if (!lines.value.length) {
          localStorage.removeItem(STORAGE_KEY);
          return;
        }
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            v: 1,
            toko: toko.value,
            tokoNama: tokoNama.value,
            updatedAt: Date.now(),
            lines: lines.value,
          })
        );
      } catch {
        // Penyimpanan penuh atau diblokir: keranjang tetap jalan di memori
      }
    },
    { deep: true }
  );

  return {
    toko,
    tokoNama,
    lines,
    open,
    refreshing,
    refreshError,
    count,
    subtotal,
    adaMasalah,
    unitPrice,
    bermasalah,
    bisaNaik,
    qtyOf,
    add,
    ubahQty,
    hapus,
    kosongkan,
    sesuaikan,
    refresh,
  };
});
