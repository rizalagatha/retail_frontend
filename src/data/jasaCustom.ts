import { reactive, ref } from "vue";
import api from "@/services/api";

export type UkuranCetak = "A3" | "A4" | "A5";
export type WarnaKaos = "WARNA" | "PUTIH";

export const UKURAN_CETAK: UkuranCetak[] = ["A3", "A4", "A5"];
export const WARNA_KAOS: { value: WarnaKaos; label: string }[] = [
  { value: "WARNA", label: "Kaos warna" },
  { value: "PUTIH", label: "Kaos putih" },
];

export interface TitikCetak {
  nama: string;
  panjang: number;
  lebar: number;
}

export interface HasilTitik {
  nama: string;
  luas: number;
  harga: number;
}

export interface HasilEstimasi {
  satuan: number;
  total: number;
  perTitik: HasilTitik[];
  catatan: string;
}

interface TarifLuas {
  minQty: number;
  hargaPerCm2: number;
}

type HargaUkuran = Record<UkuranCetak, Record<WarnaKaos, number>>;

interface TarifUkuran {
  minQty: number;
  harga: HargaUkuran;
}

export interface JasaLuas {
  mode: "luas";
  kode: string;
  nama: string;
  minPerTitik: number;
  tarif: TarifLuas[];
}

export interface JasaUkuran {
  mode: "ukuran";
  kode: string;
  nama: string;
  bedaWarnaKaos: boolean;
  tarif: TarifUkuran[];
}

export type JasaCustom = JasaLuas | JasaUkuran;

// ===== Tarif: sumber tunggal ada di server (GET /so/public/tarif-jasa) =====
// Yang ada di sini hanya salinan untuk estimasi di layar. Harga yang disimpan tetap dihitung server.

const KUNCI_CACHE = "kaosan-tarif-jasa-v1";

// Diisi lewat muatJasa(). Array reaktif yang diubah di tempat, jadi pemakai lama tetap jalan.
export const JASA_CUSTOM = reactive<JasaCustom[]>([]);
export const jasaMemuat = ref(false);
// true hanya bila gagal memuat DAN belum ada tarif sama sekali (cache pun kosong)
export const jasaGagal = ref(false);

const adaObjek = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const angka = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;

const parseTarifLuas = (raw: unknown): TarifLuas | null => {
  if (!adaObjek(raw)) return null;
  const minQty = angka(raw.minQty);
  const hargaPerCm2 = angka(raw.hargaPerCm2);
  if (minQty === null || minQty < 1 || hargaPerCm2 === null) return null;
  return { minQty, hargaPerCm2 };
};

const ambilHarga = (raw: unknown, u: UkuranCetak): Record<WarnaKaos, number> | null => {
  if (!adaObjek(raw)) return null;
  const baris = raw[u];
  if (!adaObjek(baris)) return null;
  const warna = angka(baris.WARNA);
  const putih = angka(baris.PUTIH);
  return warna !== null && putih !== null ? { WARNA: warna, PUTIH: putih } : null;
};

const parseHargaUkuran = (raw: unknown): HargaUkuran | null => {
  const a3 = ambilHarga(raw, "A3");
  const a4 = ambilHarga(raw, "A4");
  const a5 = ambilHarga(raw, "A5");
  return a3 && a4 && a5 ? { A3: a3, A4: a4, A5: a5 } : null;
};

const parseTarifUkuran = (raw: unknown): TarifUkuran | null => {
  if (!adaObjek(raw)) return null;
  const minQty = angka(raw.minQty);
  const harga = parseHargaUkuran(raw.harga);
  if (minQty === null || minQty < 1 || !harga) return null;
  return { minQty, harga };
};

const parseJasa = (raw: unknown): JasaCustom | null => {
  if (!adaObjek(raw)) return null;
  const kode = typeof raw.kode === "string" ? raw.kode.trim().toUpperCase() : "";
  const nama = typeof raw.nama === "string" ? raw.nama.trim() : "";
  if (!/^[A-Z]{2}$/.test(kode) || !nama) return null;
  const tarifRaw: unknown[] = Array.isArray(raw.tarif) ? raw.tarif : [];

  if (raw.mode === "luas") {
    const minPerTitik = angka(raw.minPerTitik);
    const tarif = tarifRaw.map(parseTarifLuas).filter((t): t is TarifLuas => t !== null);
    if (minPerTitik === null || !tarif.length || tarif.length !== tarifRaw.length) return null;
    return { mode: "luas", kode, nama, minPerTitik, tarif };
  }
  if (raw.mode === "ukuran") {
    const tarif = tarifRaw.map(parseTarifUkuran).filter((t): t is TarifUkuran => t !== null);
    if (!tarif.length || tarif.length !== tarifRaw.length) return null;
    return { mode: "ukuran", kode, nama, bedaWarnaKaos: raw.bedaWarnaKaos === true, tarif };
  }
  return null;
};

// Satu jasa rusak = seluruh respons ditolak (lebih aman daripada tarif setengah jalan)
const terapkan = (data: unknown): boolean => {
  const arr: unknown[] = Array.isArray(data) ? data : [];
  const daftar = arr.map(parseJasa).filter((j): j is JasaCustom => j !== null);
  if (!daftar.length || daftar.length !== arr.length) return false;
  JASA_CUSTOM.splice(0, JASA_CUSTOM.length, ...daftar);
  return true;
};

// Salinan terakhir dari server, supaya layar tidak kosong saat koneksi lambat
try {
  const cache = localStorage.getItem(KUNCI_CACHE);
  if (cache) terapkan(JSON.parse(cache) as unknown);
} catch {
  // cache rusak atau diblokir: abaikan, nanti diambil dari server
}

let sedangMemuat: Promise<void> | null = null;

export const muatJasa = (): Promise<void> => {
  if (sedangMemuat) return sedangMemuat;
  jasaMemuat.value = true;
  jasaGagal.value = false;
  sedangMemuat = api
    .get<unknown>("/so/public/tarif-jasa")
    .then(({ data }) => {
      if (!terapkan(data)) throw new Error("Format tarif tidak dikenal");
      try {
        localStorage.setItem(KUNCI_CACHE, JSON.stringify(data));
      } catch {
        // penyimpanan penuh: tarif tetap terpakai di memori
      }
    })
    .catch(() => {
      jasaGagal.value = JASA_CUSTOM.length === 0;
    })
    .finally(() => {
      jasaMemuat.value = false;
      sedangMemuat = null;
    });
  return sedangMemuat;
};

const rp = (n: number) => new Intl.NumberFormat("id-ID").format(n);

// Ambil tarif dengan minQty terbesar yang masih <= qty
const pilihTarif = <T extends { minQty: number }>(tarif: T[], qty: number): T =>
  [...tarif].sort((a, b) => b.minQty - a.minQty).find((t) => qty >= t.minQty) ?? tarif[0];

// Server membulatkan dimensi ke 2 desimal sebelum menghitung: samakan agar estimasi = harga tersimpan
const dim = (n: number) => Math.round(Math.max(0, n || 0) * 100) / 100;

export const hitungEstimasi = (
  jasa: JasaCustom,
  qty: number,
  ukuran: UkuranCetak,
  warna: WarnaKaos,
  titiks: TitikCetak[]
): HasilEstimasi => {
  // !(qty >= 1) juga menangkap NaN / input kosong
  if (!(qty >= 1) || titiks.length === 0) return { satuan: 0, total: 0, perTitik: [], catatan: "" };

  if (jasa.mode === "ukuran") {
    const harga = pilihTarif(jasa.tarif, qty).harga[ukuran][jasa.bedaWarnaKaos ? warna : "WARNA"];
    const satuan = harga * titiks.length;
    return {
      satuan,
      total: satuan * qty,
      perTitik: titiks.map((t): HasilTitik => ({ nama: t.nama, luas: 0, harga })),
      catatan: "",
    };
  }

  const hargaPerCm2 = pilihTarif(jasa.tarif, qty).hargaPerCm2;
  const perTitik = titiks.map((t): HasilTitik => {
    const luas = dim(t.panjang) * dim(t.lebar);
    return {
      nama: t.nama,
      luas,
      harga: Math.round(Math.max(luas * hargaPerCm2, jasa.minPerTitik)),
    };
  });
  const satuan = perTitik.reduce((sum, t) => sum + t.harga, 0);

  const bagian: string[] = [];
  if (jasa.tarif.length > 1) bagian.push(`Tarif Rp ${rp(hargaPerCm2)}/cm² untuk ${qty} pcs`);
  if (jasa.minPerTitik > 0) bagian.push(`minimal Rp ${rp(jasa.minPerTitik)} per titik`);
  return { satuan, total: satuan * qty, perTitik, catatan: bagian.join(", ") };
};
