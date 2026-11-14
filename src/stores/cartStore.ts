import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import { isAxiosError } from "axios";
import api from "@/services/api";
import {
  JASA_CUSTOM,
  UKURAN_CETAK,
  WARNA_KAOS,
  hitungEstimasi,
  muatJasa,
  type HasilEstimasi,
  type JasaCustom,
  type TitikCetak,
  type UkuranCetak,
  type WarnaKaos,
} from "@/data/jasaCustom";

const STORAGE_KEY = "kaosan-cart-v1";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_LINES = 50;
export const MAX_QTY = 99;
const MAX_CUSTOM = 10;
const MAX_TITIK = 10;
const MAX_NAMA_CUSTOM = 60;
const MAX_NAMA_TITIK = 30;
// Batas dimensi sama dengan validasi server (1-500 cm)
export const MIN_DIM_CM = 1;
export const MAX_DIM_CM = 500;
const REFRESH_GAP_MS = 60_000;
const KIRIM_TIMEOUT_MS = 20_000;

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

// Jasa custom: yang disimpan hanya spesifikasi. Jumlah pcs = total qty kaos yang dipasangkan (kaos),
// harga selalu dihitung ulang dari tarif terbaru.
export interface CustomLine {
  id: string;
  jenis: string;
  nama: string;
  ukuran: UkuranCetak;
  warna: WarnaKaos;
  titiks: TitikCetak[];
  kaos: string[];
}
export type CustomLineInput = Omit<CustomLine, "id" | "kaos">;

export interface CartToko {
  kode: string;
  nama: string;
}
export type AddResult = "ok" | "beda-toko" | "penuh";
export type AddCustomResult = AddResult | "tidak-valid" | "beda-jenis";

// --- Kirim penawaran ke server ---
export interface PenawaranInput {
  nama: string;
  telp: string;
  alamat: string;
  turnstile: string;
  website: string; // honeypot: harus kosong
}
export interface StokKurang {
  nama: string;
  ukuran: string;
  diminta: number;
  tersisa: number;
}
export interface HasilPenawaran {
  nomor: string;
  tanggal: string;
  berlakuSampai: string;
  total: number;
  stokKurang: StokKurang[];
}
export class PenawaranError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "PenawaranError";
    this.status = status;
  }
}

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
    nama: str(r.nama).trim().slice(0, MAX_NAMA_TITIK),
    panjang: Math.min(Math.max(0, num(r.panjang)), MAX_DIM_CM),
    lebar: Math.min(Math.max(0, num(r.lebar)), MAX_DIM_CM),
  };
};

// Dipakai juga saat menambah: hasilnya salinan baru, tidak berbagi referensi dengan form.
// Keranjang lama (v1) menyimpan "qty" dan tanpa "kaos": qty diabaikan, kaos dianggap belum dipasangkan.
const parseCustom = (raw: unknown): CustomLine | null => {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id).trim();
  const jenis = str(r.jenis).trim().toUpperCase();
  const ukuran = UKURAN_CETAK.find((u) => u === r.ukuran);
  const warna = WARNA_KAOS.find((w) => w.value === r.warna)?.value;
  const titiks = (Array.isArray(r.titiks) ? r.titiks : [])
    .slice(0, MAX_TITIK)
    .map((t: unknown) => parseTitik(t))
    .filter((t): t is TitikCetak => t !== null);
  const kaos = [
    ...new Set(
      (Array.isArray(r.kaos) ? r.kaos : [])
        .map((k: unknown) => str(k).trim())
        .filter((k: string) => k !== "")
    ),
  ].slice(0, MAX_LINES);
  // Daftar jasa datang dari server (bisa belum termuat saat startup): cek bentuk kodenya saja
  if (!id || !ukuran || !warna || !titiks.length || !/^[A-Z]{2}$/.test(jenis)) return null;
  return {
    id,
    jenis,
    nama: str(r.nama).trim().slice(0, MAX_NAMA_CUSTOM),
    ukuran,
    warna,
    titiks,
    kaos,
  };
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
    const customs = new Map<string, CustomLine>();
    (Array.isArray(p.custom) ? p.custom : []).forEach((x: unknown) => {
      const c = parseCustom(x);
      if (c && customs.size < MAX_CUSTOM) customs.set(c.id, c);
    });
    // Pasangan kaos hanya boleh menunjuk kaos yang masih ada di keranjang
    const kodeAda = new Set([...unik.values()].map((l) => l.kode));
    customs.forEach((c) => {
      c.kaos = c.kaos.filter((k) => kodeAda.has(k));
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

const pesanDariServer = (data: unknown): string => {
  if (data && typeof data === "object" && "message" in data) {
    const m = (data as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m.trim().slice(0, 300);
  }
  return "";
};

const toPenawaranError = (e: unknown): PenawaranError => {
  if (!isAxiosError(e)) {
    return new PenawaranError("Terjadi kesalahan. Coba lagi sebentar lagi.", 0);
  }
  const status = e.response?.status ?? 0;
  const pesan = pesanDariServer(e.response?.data);
  if (status === 0) {
    return new PenawaranError(
      "Koneksi bermasalah atau server tidak merespons. Coba lagi sebentar lagi.",
      0
    );
  }
  if (pesan) return new PenawaranError(pesan, status);
  if (status === 429) {
    return new PenawaranError("Terlalu banyak percobaan. Coba lagi nanti.", status);
  }
  if (status === 413) return new PenawaranError("Data terlalu besar.", status);
  return new PenawaranError("Terjadi kesalahan di server. Coba lagi sebentar lagi.", status);
};

const parseHasil = (raw: unknown): HasilPenawaran | null => {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const nomor = str(r.nomor).trim();
  if (!nomor) return null;
  const stokKurang = (Array.isArray(r.stokKurang) ? r.stokKurang : []).flatMap(
    (x: unknown): StokKurang[] => {
      if (!x || typeof x !== "object") return [];
      const s = x as Record<string, unknown>;
      return [
        {
          nama: str(s.nama),
          ukuran: str(s.ukuran),
          diminta: Math.floor(num(s.diminta)),
          tersisa: Math.max(0, Math.floor(num(s.tersisa))),
        },
      ];
    }
  );
  return {
    nomor,
    tanggal: str(r.tanggal),
    berlakuSampai: str(r.berlakuSampai),
    total: Math.max(0, num(r.total)),
    stokKurang,
  };
};

export const useCartStore = defineStore("cart", () => {
  // Tarif jasa dari server; dipanggil di sini karena halaman estimasi dan keranjang sama-sama memakai store ini
  void muatJasa();

  const saved = hydrate();
  const toko = ref(saved?.toko ?? "");
  const tokoNama = ref(saved?.tokoNama ?? "");
  const lines = ref<CartLine[]>(saved?.lines ?? []);
  const custom = ref<CustomLine[]>(saved?.custom ?? []);
  const open = ref(false);
  const refreshing = ref(false);
  const refreshError = ref(false);
  const mengirim = ref(false);
  let lastRefresh = 0;

  const unitPrice = (l: CartLine) => (l.hargaPromo && l.hargaPromo > 0 ? l.hargaPromo : l.harga);
  const bermasalah = (l: CartLine) => l.stok <= 0 || l.qty > l.stok;
  const bisaNaik = (l: CartLine) => l.qty < MAX_QTY;

  // Kode kaos unik di keranjang (satu kode bisa punya beberapa ukuran)
  const kodeKaos = computed(() => [...new Set(lines.value.map((l) => l.kode))]);

  const jasaOf = (c: CustomLine): JasaCustom | undefined =>
    JASA_CUSTOM.find((j) => j.kode === c.jenis);
  // Jumlah pcs jasa = total qty semua ukuran dari kaos yang dipasangkan
  const qtyCustom = (c: CustomLine): number =>
    lines.value.reduce((s, l) => (c.kaos.includes(l.kode) ? s + l.qty : s), 0);
  const estimasiCustom = (c: CustomLine): HasilEstimasi | null => {
    const j = jasaOf(c);
    return j ? hitungEstimasi(j, qtyCustom(c), c.ukuran, c.warna, c.titiks) : null;
  };

  const terisi = computed(() => lines.value.length > 0 || custom.value.length > 0);
  // Badge: tiap baris jasa custom dihitung 1 (jumlahnya mengikuti kaos, bukan barang tersendiri)
  const count = computed(() => lines.value.reduce((s, l) => s + l.qty, 0) + custom.value.length);
  // Total barang dan total jasa sengaja TIDAK digabung: yang satu pasti, yang satu estimasi
  const subtotal = computed(() => lines.value.reduce((s, l) => s + unitPrice(l) * l.qty, 0));
  const subtotalJasa = computed(() =>
    custom.value.reduce((s, c) => s + (estimasiCustom(c)?.total ?? 0), 0)
  );
  const adaMasalah = computed(() => lines.value.some(bermasalah));
  const customBelumDipasang = computed(() => custom.value.filter((c) => c.kaos.length === 0));
  // Syarat server: ada kaos, dan setiap jasa custom sudah punya kaos
  const siapSimpan = computed(
    () => toko.value !== "" && lines.value.length > 0 && customBelumDipasang.value.length === 0
  );

  const find = (kode: string, ukuran: string) =>
    lines.value.find((l) => l.kode === kode && l.ukuran === ukuran);
  const qtyOf = (kode: string, ukuran: string) => find(kode, ukuran)?.qty ?? 0;

  const resetBilaKosong = () => {
    if (!terisi.value) {
      toko.value = "";
      tokoNama.value = "";
    }
  };

  // Kaos yang sudah tidak ada di keranjang dilepas dari semua jasa custom
  const rapikanKaos = () => {
    const ada = new Set(lines.value.map((l) => l.kode));
    custom.value.forEach((c) => {
      if (c.kaos.some((k) => !ada.has(k))) c.kaos = c.kaos.filter((k) => ada.has(k));
    });
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
      if (lines.value.length >= MAX_LINES) return "penuh";
      lines.value.push({ ...input, qty: 1 });
    }
    toko.value = t.kode;
    tokoNama.value = t.nama;
    return "ok";
  };

  // Jasa baru otomatis dipasangkan ke semua kaos yang ada di keranjang; customer bisa mengubahnya
  const addCustom = (t: CartToko, input: CustomLineInput): AddCustomResult => {
    if (terisi.value && toko.value !== t.kode) return "beda-toko";
    if (custom.value.length >= MAX_CUSTOM) return "penuh";
    const baris = parseCustom({ ...input, id: newId(), kaos: kodeKaos.value });
    if (!baris) return "tidak-valid";
    // Server hanya menerima satu jenis jasa per penawaran
    if (custom.value.some((c) => c.jenis !== baris.jenis)) return "beda-jenis";
    custom.value.push(baris);
    toko.value = t.kode;
    tokoNama.value = t.nama;
    return "ok";
  };

  const pasangKaos = (id: string, kode: string, pasang: boolean) => {
    const c = custom.value.find((x) => x.id === id);
    if (!c || !lines.value.some((l) => l.kode === kode)) return;
    const ada = c.kaos.includes(kode);
    if (pasang && !ada) c.kaos.push(kode);
    else if (!pasang && ada) c.kaos = c.kaos.filter((k) => k !== kode);
  };

  const namaCustom = (id: string, nama: string) => {
    const c = custom.value.find((x) => x.id === id);
    if (c) c.nama = nama.slice(0, MAX_NAMA_CUSTOM);
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
    rapikanKaos();
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
    rapikanKaos();
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

  // Simpan keranjang sebagai penawaran di server. Harga dan promo dihitung ulang server; yang dikirim
  // hanya kode, ukuran, jumlah, spesifikasi jasa, dan data customer. Keranjang TIDAK dikosongkan di sini:
  // pemanggil mengosongkannya setelah selesai memakai isinya (mis. untuk pesan WhatsApp).
  const kirimPenawaran = async (input: PenawaranInput): Promise<HasilPenawaran> => {
    if (mengirim.value) throw new PenawaranError("Penawaran sedang dikirim.", 0);
    if (!siapSimpan.value) {
      throw new PenawaranError("Keranjang belum lengkap. Pilih kaos untuk setiap jasa custom.", 0);
    }
    const payload = {
      cabang: toko.value,
      customer: { nama: input.nama, telp: input.telp, alamat: input.alamat },
      items: lines.value.map((l) => ({ kode: l.kode, ukuran: l.ukuran, qty: l.qty })),
      custom: custom.value.map((c) => ({
        jenis: c.jenis,
        nama: c.nama,
        ukuranCetak: c.ukuran,
        warna: c.warna,
        titiks: c.titiks.map((t) => ({ nama: t.nama, panjang: t.panjang, lebar: t.lebar })),
        kaos: [...c.kaos],
      })),
      turnstile: input.turnstile,
      website: input.website,
    };
    mengirim.value = true;
    let hasil: HasilPenawaran | null;
    try {
      const { data } = await api.post<unknown>("/so/public/penawaran", payload, {
        timeout: KIRIM_TIMEOUT_MS,
      });
      hasil = parseHasil(data);
    } catch (e) {
      throw toPenawaranError(e);
    } finally {
      mengirim.value = false;
    }
    if (!hasil) throw new PenawaranError("Respons server tidak dikenal.", 0);
    return hasil;
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
    mengirim,
    terisi,
    count,
    subtotal,
    subtotalJasa,
    adaMasalah,
    kodeKaos,
    customBelumDipasang,
    siapSimpan,
    unitPrice,
    bermasalah,
    bisaNaik,
    qtyOf,
    qtyCustom,
    jasaOf,
    estimasiCustom,
    add,
    addCustom,
    pasangKaos,
    namaCustom,
    ubahQty,
    hapus,
    hapusCustom,
    kosongkan,
    sesuaikan,
    refresh,
    kirimPenawaran,
  };
});
