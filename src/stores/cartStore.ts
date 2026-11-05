import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import api from "@/services/api";
import {
  JASA_CUSTOM,
  UKURAN_CETAK,
  WARNA_KAOS,
  hitungEstimasi,
  type HasilEstimasi,
  type JasaCustom,
  type TitikCetak,
  type UkuranCetak,
  type WarnaKaos,
} from "@/data/jasaCustom";

const STORAGE_KEY = "kaosan-cart-v1";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_LINES = 50;
const MAX_QTY = 99;
const MAX_CUSTOM = 10;
const MAX_CUSTOM_QTY = 999;
const MAX_TITIK = 10;
const MAX_DIM_CM = 500;
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

// Jasa custom: yang disimpan hanya spesifikasi, harga selalu dihitung ulang dari tarif terbaru
export interface CustomLine {
  id: string;
  jenis: string;
  qty: number;
  ukuran: UkuranCetak;
  warna: WarnaKaos;
  titiks: TitikCetak[];
}
export type CustomLineInput = Omit<CustomLine, "id">;

export interface CartToko {
  kode: string;
  nama: string;
}
export type AddResult = "ok" | "beda-toko" | "penuh";
export type AddCustomResult = AddResult | "tidak-valid";

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
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

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

const parseTitik = (raw: unknown): TitikCetak | null => {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return {
    nama: str(r.nama).trim().slice(0, 40),
    panjang: Math.min(Math.max(0, num(r.panjang)), MAX_DIM_CM),
    lebar: Math.min(Math.max(0, num(r.lebar)), MAX_DIM_CM),
  };
};

// Dipakai juga saat menambah: hasilnya salinan baru, tidak berbagi referensi dengan form
const parseCustom = (raw: unknown): CustomLine | null => {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id).trim();
  const jenis = str(r.jenis).trim();
  const ukuran = UKURAN_CETAK.find((u) => u === r.ukuran);
  const warna = WARNA_KAOS.find((w) => w.value === r.warna)?.value;
  const qty = Math.floor(num(r.qty));
  const titiks = (Array.isArray(r.titiks) ? r.titiks : [])
    .slice(0, MAX_TITIK)
    .map((t: unknown) => parseTitik(t))
    .filter((t): t is TitikCetak => t !== null);
  if (!id || !ukuran || !warna || qty < 1 || !titiks.length) return null;
  if (!JASA_CUSTOM.some((j) => j.kode === jenis)) return null;
  return { id, jenis, qty: Math.min(qty, MAX_CUSTOM_QTY), ukuran, warna, titiks };
};

const hydrate = (): {
  toko: string;
  tokoNama: string;
  lines: CartLine[];
  custom: CustomLine[];
} | null => {
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
    // Keranjang lama belum punya field "custom": dianggap kosong
    const customs = new Map<string, CustomLine>();
    (Array.isArray(p.custom) ? p.custom : []).forEach((x: unknown) => {
      const c = parseCustom(x);
      if (c && customs.size < MAX_CUSTOM) customs.set(c.id, c);
    });
    const toko = str(p.toko).trim();
    if (!toko || (!unik.size && !customs.size)) return null;
    return {
      toko,
      tokoNama: str(p.tokoNama),
      lines: [...unik.values()],
      custom: [...customs.values()],
    };
  } catch {
    return null;
  }
};

export const useCartStore = defineStore("cart", () => {
  const saved = hydrate();
  const toko = ref(saved?.toko ?? "");
  const tokoNama = ref(saved?.tokoNama ?? "");
  const lines = ref<CartLine[]>(saved?.lines ?? []);
  const custom = ref<CustomLine[]>(saved?.custom ?? []);
  const open = ref(false);
  const refreshing = ref(false);
  const refreshError = ref(false);
  let lastRefresh = 0;

  const unitPrice = (l: CartLine) => (l.hargaPromo && l.hargaPromo > 0 ? l.hargaPromo : l.harga);
  const bermasalah = (l: CartLine) => l.stok <= 0 || l.qty > l.stok;
  const bisaNaik = (l: CartLine) => l.qty < Math.min(l.stok, MAX_QTY);

  const jasaOf = (c: CustomLine): JasaCustom | undefined =>
    JASA_CUSTOM.find((j) => j.kode === c.jenis);
  const estimasiCustom = (c: CustomLine): HasilEstimasi | null => {
    const j = jasaOf(c);
    return j ? hitungEstimasi(j, c.qty, c.ukuran, c.warna, c.titiks) : null;
  };
  const bisaNaikCustom = (c: CustomLine) => c.qty < MAX_CUSTOM_QTY;

  const terisi = computed(() => lines.value.length > 0 || custom.value.length > 0);
  // Badge: tiap baris jasa custom dihitung 1 (qty-nya adalah jumlah kaos yang dicetak, bukan barang)
  const count = computed(() => lines.value.reduce((s, l) => s + l.qty, 0) + custom.value.length);
  // Total barang dan total jasa sengaja TIDAK digabung: yang satu pasti, yang satu estimasi
  const subtotal = computed(() => lines.value.reduce((s, l) => s + unitPrice(l) * l.qty, 0));
  const subtotalJasa = computed(() =>
    custom.value.reduce((s, c) => s + (estimasiCustom(c)?.total ?? 0), 0)
  );
  const adaMasalah = computed(() => lines.value.some(bermasalah));

  const find = (kode: string, ukuran: string) =>
    lines.value.find((l) => l.kode === kode && l.ukuran === ukuran);
  const qtyOf = (kode: string, ukuran: string) => find(kode, ukuran)?.qty ?? 0;

  const resetBilaKosong = () => {
    if (!terisi.value) {
      toko.value = "";
      tokoNama.value = "";
    }
  };

  const add = (t: CartToko, input: CartLineInput): AddResult => {
    if (terisi.value && toko.value !== t.kode) return "beda-toko";
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

  const addCustom = (t: CartToko, input: CustomLineInput): AddCustomResult => {
    if (terisi.value && toko.value !== t.kode) return "beda-toko";
    if (custom.value.length >= MAX_CUSTOM) return "penuh";
    const baris = parseCustom({ ...input, id: newId() });
    if (!baris) return "tidak-valid";
    custom.value.push(baris);
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

  const ubahQtyCustom = (id: string, delta: 1 | -1) => {
    const c = custom.value.find((x) => x.id === id);
    if (!c) return;
    if (delta > 0 && !bisaNaikCustom(c)) return;
    c.qty += delta;
    if (c.qty < 1) hapusCustom(id);
  };

  const hapus = (kode: string, ukuran: string) => {
    lines.value = lines.value.filter((l) => !(l.kode === kode && l.ukuran === ukuran));
    resetBilaKosong();
  };

  const hapusCustom = (id: string) => {
    custom.value = custom.value.filter((c) => c.id !== id);
    resetBilaKosong();
  };

  const kosongkan = () => {
    lines.value = [];
    custom.value = [];
    resetBilaKosong();
  };

  // Buang barang yang habis, turunkan qty yang melebihi stok (jasa custom tidak punya stok)
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
    [toko, tokoNama, lines, custom],
    () => {
      try {
        if (!terisi.value) {
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
            custom: custom.value,
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
    custom,
    open,
    refreshing,
    refreshError,
    terisi,
    count,
    subtotal,
    subtotalJasa,
    adaMasalah,
    unitPrice,
    bermasalah,
    bisaNaik,
    qtyOf,
    jasaOf,
    estimasiCustom,
    bisaNaikCustom,
    add,
    addCustom,
    ubahQty,
    ubahQtyCustom,
    hapus,
    hapusCustom,
    kosongkan,
    sesuaikan,
    refresh,
  };
});
