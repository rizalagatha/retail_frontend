export interface ChangeLogItem {
  version: string;
  date: string;
  changes: string[];
  type?: "major" | "minor" | "patch"; // Opsional untuk warna
}

export const changelogData: ChangeLogItem[] = [
  {
    version: "1.2.0",
    date: "2025-12-10",
    type: "minor",
    changes: [
      "Fitur Baru: Pelunasan Invoice Marketplace (Shopee/Tiktok)",
      "Update: Perbaikan perhitungan sisa piutang di Invoice View",
      "Fix: Bug duplicate entry saat simpan pelunasan",
    ],
  },
  {
    version: "1.1.5",
    date: "2025-12-01",
    type: "patch",
    changes: ["Fix: Tampilan mobile pada tabel stok", "Update: Penambahan logo pada cetak struk"],
  },
  {
    version: "1.0.0",
    date: "2025-09-01",
    type: "major",
    changes: ["Rilis perdana aplikasi POS"],
  },
];
