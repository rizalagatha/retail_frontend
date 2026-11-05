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

// Harga sama untuk kaos warna dan putih
const rata = (a3: number, a4: number, a5: number): HargaUkuran => ({
  A3: { WARNA: a3, PUTIH: a3 },
  A4: { WARNA: a4, PUTIH: a4 },
  A5: { WARNA: a5, PUTIH: a5 },
});

// Satu-satunya tempat harga jasa. Menambah/mengubah harga cukup di sini.
export const JASA_CUSTOM: JasaCustom[] = [
  {
    mode: "luas",
    kode: "SD",
    nama: "Sablon DTF",
    minPerTitik: 0,
    tarif: [{ minQty: 1, hargaPerCm2: 25 }],
  },
  {
    mode: "luas",
    kode: "DP",
    nama: "DTF Premium",
    minPerTitik: 0,
    tarif: [{ minQty: 1, hargaPerCm2: 35 }],
  },
  {
    mode: "luas",
    kode: "BR",
    nama: "Bordir Komputer",
    minPerTitik: 5000,
    tarif: [
      { minQty: 1, hargaPerCm2: 1000 },
      { minQty: 11, hargaPerCm2: 500 },
      { minQty: 20, hargaPerCm2: 250 },
      { minQty: 500, hargaPerCm2: 100 },
    ],
  },
  {
    mode: "ukuran",
    kode: "SB",
    nama: "Sablon Plastisol",
    bedaWarnaKaos: false,
    tarif: [{ minQty: 1, harga: rata(35000, 20000, 10000) }],
  },
  {
    // Berlaku mulai 1 Mei 2026
    mode: "ukuran",
    kode: "TG",
    nama: "DTG",
    bedaWarnaKaos: true,
    tarif: [
      {
        minQty: 1,
        harga: {
          A3: { WARNA: 50000, PUTIH: 40000 },
          A4: { WARNA: 36000, PUTIH: 30000 },
          A5: { WARNA: 26000, PUTIH: 22500 },
        },
      },
      {
        minQty: 10,
        harga: {
          A3: { WARNA: 36000, PUTIH: 35000 },
          A4: { WARNA: 28000, PUTIH: 27000 },
          A5: { WARNA: 23000, PUTIH: 21000 },
        },
      },
    ],
  },
];

const rp = (n: number) => new Intl.NumberFormat("id-ID").format(n);

// Ambil tarif dengan minQty terbesar yang masih <= qty
const pilihTarif = <T extends { minQty: number }>(tarif: T[], qty: number): T =>
  [...tarif].sort((a, b) => b.minQty - a.minQty).find((t) => qty >= t.minQty) ?? tarif[0];

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
    const luas = Math.max(0, t.panjang || 0) * Math.max(0, t.lebar || 0);
    return { nama: t.nama, luas, harga: Math.max(luas * hargaPerCm2, jasa.minPerTitik) };
  });
  const satuan = perTitik.reduce((sum, t) => sum + t.harga, 0);

  const bagian: string[] = [];
  if (jasa.tarif.length > 1) bagian.push(`Tarif Rp ${rp(hargaPerCm2)}/cm² untuk ${qty} pcs`);
  if (jasa.minPerTitik > 0) bagian.push(`minimal Rp ${rp(jasa.minPerTitik)} per titik`);
  return { satuan, total: satuan * qty, perTitik, catatan: bagian.join(", ") };
};
