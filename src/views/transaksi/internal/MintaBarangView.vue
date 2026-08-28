<script setup lang="ts">
import { ref, onMounted, computed, watch, reactive } from "vue";
import { useRouter } from "vue-router";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { format, parseISO } from "date-fns";
import { AxiosError } from "axios";
import AppDataTable from "@/components/AppDataTable.vue";

const toast = useToast();
const authStore = useAuthStore();
const router = useRouter();
const MENU_ID = "37";

// --- Interface Header (Wajib untuk Resize) ---
interface DataTableHeader {
  title: string;
  key: string;
  width?: number;
  fixed?: boolean;
  align?: "start" | "center" | "end";
  minWidth?: string | number;
  maxWidth?: string | number;
  sortable?: boolean;
}

interface MintaBarangHeader {
  Nomor: string;
  Tanggal: string;
  NoSO?: string;
  NoPL?: string;
  TglPL?: string;
  NoSJ?: string;
  TglSJ?: string;
  TerimaSJ?: string;
  TglTerima?: string;
  TotalMinta?: number;
  TotalKirimSJ?: number;
  Kesesuaian?: number;
  Keterangan?: string;
  Otomatis?: "Y" | "N";
  Created?: string;
  Closing?: "Y" | "N";
  [key: string]: unknown;
}

interface MintaBarangDetail {
  Kode: string;
  Barcode: string;
  Nama: string;
  Ukuran?: string;
  StokMinimal?: number;
  StokMaximal?: number;
  Jumlah?: number;
  SJ?: number;
}

interface Cabang {
  kode: string;
  nama: string;
}

interface PendingAlokasi {
  id: string;
  kode: string;
  nama: string;
  ukuran?: string;
  urgensi: string;
  qty_kebutuhan: number;
  qty_alokasi: number;
}

interface ExportDetailRow {
  Nomor?: string;
  Tanggal?: string;
  NoSO?: string;
  NoPL?: string;
  TglPL?: string;
  NoSJ?: string;
  TglSJ?: string;
  TerimaSJ?: string;
  TglTerima?: string;
  Customer?: string;
  KodeBarang?: string;
  NamaBarang?: string;
  Ukuran?: string;
  JumlahMinta?: number;
  JumlahSJ?: number;
  [key: string]: unknown; // Fallback jika ada properti lain
}

// --- State ---
const list = ref<MintaBarangHeader[]>([]);
const details = ref<{ [nomor: string]: MintaBarangDetail[] }>({});
const isLoading = ref(true);
const filters = reactive({
  startDate: format(new Date(), "yyyy-MM-dd"),
  endDate: format(new Date(), "yyyy-MM-dd"),
  cabang: authStore.user?.cabang === "KDC" ? "ALL" : authStore.user?.cabang || "",
  jenisPermintaan: "semua", // 'semua', 'manual', 'otomatis'
  statusClosing: "ALL", // ('ALL' = Semua, 'N' = Aktif, 'Y' = Closed)
});

const cabangList = ref<Cabang[]>([]);
const selected = ref<MintaBarangHeader[]>([]);
const expanded = ref<string[]>([]);
const loadingDetails = ref(new Set<string>());

const isConfirmDeleteVisible = ref(false);
const itemToDelete = ref<MintaBarangHeader | null>(null);
const confirmDialogText = ref("");

const isReviewModalVisible = ref(false);
const pendingList = ref<PendingAlokasi[]>([]);
const selectedPending = ref<string[]>([]);
const isGenerating = ref(false);
const isConfirmGenerateVisible = ref(false);

const openGenerateDialog = () => {
  isConfirmGenerateVisible.value = true;
};

const executeGenerate = async () => {
  isConfirmGenerateVisible.value = false;
  // Panggil fungsi handleGenerateAutomasi yang sudah kita buat
  await handleGenerateAutomasi();
};

// --- Computed ---
const hasViewPermission = computed(() => authStore.can(MENU_ID, "view"));
const canInsert = computed(
  () => authStore.can(MENU_ID, "insert") && authStore.user?.cabang !== "KDC"
);
const canEdit = computed(() => authStore.can(MENU_ID, "edit"));
const canDelete = computed(
  () => authStore.can(MENU_ID, "delete") && authStore.user?.cabang !== "KDC"
);
const isSingleSelected = computed(() => selected.value.length === 1);
const pendingCount = computed(() => pendingList.value.length);

// --- Header Definisi (Ref & Width Angka) ---
const headers = ref<DataTableHeader[]>([
  { title: "", key: "data-table-expand", width: 50, fixed: true },
  { title: "Nomor", key: "Nomor", width: 180, fixed: true },
  { title: "Tanggal", key: "Tanggal", width: 110 },
  { title: "No. PL", key: "NoPL", width: 180 },
  { title: "Tgl PL", key: "TglPL", width: 110 },
  { title: "No. SO", key: "NoSO", width: 180 },
  { title: "No. SJ", key: "NoSJ", width: 180 },
  { title: "Tgl SJ", key: "TglSJ", width: 110 },
  { title: "Terima SJ", key: "TerimaSJ", width: 110 },
  { title: "Tgl Terima", key: "TglTerima", width: 110 },
  { title: "Kesesuaian", key: "Kesesuaian", align: "center", width: 110 },
  { title: "Keterangan", key: "Keterangan", width: 300 },
  { title: "Otomatis", key: "Otomatis", align: "center", width: 100 },
  { title: "User", key: "Created", width: 120 },
  { title: "Closing", key: "Closing", align: "center", width: 80 },
]);

const detailHeaders = [
  { title: "Kode", key: "Kode", width: "150px" },
  { title: "Barcode", key: "Barcode", width: "120px" },
  { title: "Nama Barang", key: "Nama", width: "250px" },
  { title: "Ukuran", key: "Ukuran", width: "80px" },
  { title: "Stok Minimal", key: "StokMinimal", align: "end", width: "100px" },
  { title: "Stok Maximal", key: "StokMaximal", align: "end", width: "100px" },
  { title: "Jumlah", key: "Jumlah", align: "end", width: "100px" },
  { title: "SJ", key: "SJ", align: "end", width: "100px" },
] as const;

const modalHeaders = [
  { title: "Kode Barang", key: "kode", width: "160px" },
  { title: "Nama Lengkap Barang", key: "nama" },
  { title: "Ukuran", key: "ukuran", width: "80px", align: "center" },
  { title: "Urgensi", key: "urgensi", align: "center", width: "100px" },
  { title: "Kebutuhan", key: "qty_kebutuhan", align: "center", width: "100px" },
  { title: "Jatah (Diberikan)", key: "qty_alokasi", align: "center", width: "120px" },
] as const;

// --- Logic Resize Column ---
const resizingColumn = ref<DataTableHeader | null>(null);
const startX = ref(0);
const startWidth = ref(0);

const onResizeStart = (e: MouseEvent, column: DataTableHeader) => {
  e.preventDefault();
  e.stopPropagation();
  resizingColumn.value = column;
  startX.value = e.pageX;
  startWidth.value = typeof column.width === "number" ? column.width : 100;
  document.addEventListener("mousemove", onResizeMove);
  document.addEventListener("mouseup", onResizeEnd);
  document.body.style.cursor = "col-resize";
};

const onResizeMove = (e: MouseEvent) => {
  if (!resizingColumn.value) return;
  const diff = e.pageX - startX.value;
  resizingColumn.value.width = Math.max(50, startWidth.value + diff);
};

const onResizeEnd = () => {
  resizingColumn.value = null;
  document.removeEventListener("mousemove", onResizeMove);
  document.removeEventListener("mouseup", onResizeEnd);
  document.body.style.cursor = "";
};

// --- Logic Selected Row ---
const handleRowClick = (_event: Event, { item }: { item: MintaBarangHeader }) => {
  selected.value = [item];
};

// --- Methods ---
const fetchPendingAlokasi = async () => {
  try {
    const response = await api.get("/minta-barang/pending-alokasi");
    pendingList.value = response.data;
  } catch (err: unknown) {
    const error = err as AxiosError<{ message?: string }>;
    toast.error(error.response?.data?.message || "Gagal memuat daftar alokasi pending.");
  }
};

const fetchCabangList = async () => {
  try {
    const response = await api.get("/minta-barang/lookup/cabang");
    cabangList.value = response.data;
  } catch (err: unknown) {
    const error = err as AxiosError<{ message?: string }>;

    toast.error(error.response?.data?.message || "Gagal memuat daftar cabang.");
  }
};

const fetchData = async () => {
  isLoading.value = true;
  try {
    const response = await api.get("/minta-barang", {
      params: {
        startDate: filters.startDate,
        endDate: filters.endDate,
        cabang: filters.cabang,
        jenisPermintaan: filters.jenisPermintaan,
        statusClosing: filters.statusClosing,
      },
    });

    // Kalkulasi persentase di sini
    list.value = response.data.map((item: MintaBarangHeader) => {
      const minta = Number(item.TotalMinta) || 1; // hindari division by 0
      const kirim = Number(item.TotalKirimSJ) || 0;
      const pct = Math.round((kirim / minta) * 100);

      return {
        ...item,
        Kesesuaian: item.NoSJ ? pct : 0, // Hanya hitung jika SJ sudah ada
      };
    });
  } catch (err: unknown) {
    const error = err as AxiosError<{ message?: string }>;
    toast.error(error.response?.data?.message || "Gagal memuat data.");
  } finally {
    isLoading.value = false;
  }
};

const loadDetails = async (newlyExpandedItems: MintaBarangHeader[]) => {
  const itemToLoad = newlyExpandedItems.find(
    (item) => !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor)
  );
  if (!itemToLoad) return;

  const nomorToLoad = itemToLoad.Nomor;
  loadingDetails.value.add(nomorToLoad);

  try {
    const response = await api.get<MintaBarangDetail[]>(`/minta-barang/${nomorToLoad}`);
    details.value[nomorToLoad] = response.data;
  } catch {
    toast.error(`Gagal memuat detail untuk ${nomorToLoad}`);
    expanded.value = expanded.value.filter((nomor) => nomor !== nomorToLoad);
  } finally {
    loadingDetails.value.delete(nomorToLoad);
  }
};

const getRowTextColor = (item: MintaBarangHeader) => {
  // 1. Prioritas Utama: Jika sudah Closing -> Abu-abu (Final)
  if (item.Closing === "Y") {
    return "text-grey font-weight-bold"; // Abu-abu
  }

  // 2. Jika sudah diterima (TerimaSJ terisi) -> HITAM (Tanpa class tambahan)
  if (item.TerimaSJ && item.TerimaSJ !== "") {
    return "text-black";
  }

  // 3. Jika sudah ada NoSJ ATAU NoPL tapi belum diterima -> BIRU (Dalam Proses)
  if ((item.NoSJ && item.NoSJ !== "") || (item.NoPL && item.NoPL !== "")) {
    return "text-blue font-weight-bold";
  }

  // 4. Jika belum diproses sama sekali (PL & SJ kosong) -> MERAH
  return "text-red font-weight-bold";
};

const editItem = () => {
  if (!isSingleSelected.value) return;
  const item = selected.value[0];
  if (item.Otomatis === "Y") return toast.warning("Permintaan Otomatis tidak bisa diubah.");

  // Proteksi: Jika sudah masuk PL atau sudah jadi SJ, jangan boleh ubah
  if (item.NoPL || item.NoSJ) {
    return toast.warning("Sudah diproses ke Packing List/SJ, tidak bisa diubah.");
  }

  if (item.Closing === "Y") return toast.warning("Transaksi sudah Closing, tidak bisa diubah.");
  router.push(`/transaksi/internal/minta-barang/ubah/${item.Nomor}`);
};

const showDeleteConfirmation = () => {
  if (!isSingleSelected.value) return;
  const item = selected.value[0];
  if (item.Otomatis === "Y") return toast.warning("Permintaan Otomatis tidak bisa dihapus.");

  // [GANTI] Proteksi menggunakan NoPL
  if (item.NoPL) return toast.warning("Sudah diproses ke Packing List/SJ, tidak bisa dihapus.");

  if (item.Closing === "Y") return toast.warning("Transaksi sudah Closing, tidak bisa dihapus.");

  itemToDelete.value = item;
  confirmDialogText.value = `Anda yakin ingin menghapus data Nomor: ${item.Nomor}?`;
  isConfirmDeleteVisible.value = true;
};

const executeDelete = async () => {
  if (!itemToDelete.value) return;
  try {
    await api.delete(`/minta-barang/${itemToDelete.value.Nomor}`);
    toast.success(`Permintaan Barang ${itemToDelete.value.Nomor} berhasil dihapus.`);
    fetchData();
    selected.value = [];
  } catch (error) {
    const axiosError = error as AxiosError<{ message: string }>;
    toast.error(axiosError.response?.data?.message || "Gagal menghapus data.");
  } finally {
    isConfirmDeleteVisible.value = false;
    itemToDelete.value = null;
  }
};

const handleNew = () => router.push({ name: "MintaBarangCreate" });

const proceedToCreate = () => {
  // Langsung join array-nya, tidak perlu di-map lagi
  const ids = selectedPending.value.join(",");

  // Gunakan nama route (name) agar lebih aman dari 404 Not Found
  // karena di handleNew Anda menggunakan name: "MintaBarangCreate"
  router.push({
    name: "MintaBarangCreate",
    query: { alokasiIds: ids },
  });
};

// Fungsi untuk memilih/membatalkan pilihan saat baris diklik
const toggleRowSelection = (
  _event: Event,
  { item }: { item: PendingAlokasi | { raw: PendingAlokasi } }
) => {
  const row = "raw" in item ? item.raw : item;
  const id = row.id;

  const index = selectedPending.value.indexOf(id);

  if (index === -1) {
    selectedPending.value.push(id);
  } else {
    selectedPending.value.splice(index, 1);
  }
};

// --- 3. Fungsi Export Data ---
const exportHeaderData = async () => {
  if (list.value.length === 0) return toast.warning("Tidak ada data untuk diekspor.");
  toast.info("Menyiapkan file export header...");

  try {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Minta Barang Header");

    const borderThin = {
      top: { style: "thin" as const },
      left: { style: "thin" as const },
      bottom: { style: "thin" as const },
      right: { style: "thin" as const },
    };

    const cols = [
      { header: "Nomor", key: "Nomor", width: 20, align: "left" as const },
      { header: "Tanggal", key: "Tanggal", width: 13, align: "center" as const },
      { header: "No. SO", key: "NoSO", width: 20, align: "left" as const },
      { header: "No. PL", key: "NoPL", width: 20, align: "left" as const },
      { header: "Tgl PL", key: "TglPL", width: 13, align: "center" as const },
      { header: "No. SJ", key: "NoSJ", width: 20, align: "left" as const },
      { header: "Tgl SJ", key: "TglSJ", width: 13, align: "center" as const },
      { header: "Terima SJ", key: "TerimaSJ", width: 20, align: "left" as const },
      { header: "Tgl Terima", key: "TglTerima", width: 13, align: "center" as const },
      { header: "Kesesuaian", key: "Kesesuaian", width: 13, align: "center" as const },
      { header: "Keterangan", key: "Keterangan", width: 30, align: "left" as const },
      { header: "Otomatis", key: "Otomatis", width: 12, align: "center" as const },
      { header: "User", key: "Created", width: 15, align: "center" as const },
      { header: "Closing", key: "Closing", width: 12, align: "center" as const },
    ];

    sheet.columns = cols.map((c) => ({ width: c.width }));

    const headerRow = sheet.addRow(cols.map((c) => c.header));
    headerRow.height = 22;
    headerRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { bold: true, color: { argb: "FF0D47A1" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3F2FD" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = borderThin;
    });

    list.value.forEach((item) => {
      const values = cols.map((c) => {
        if (["Tanggal", "TglPL", "TglSJ", "TglTerima"].includes(c.key)) {
          try {
            return item[c.key] ? format(parseISO(item[c.key] as string), "dd/MM/yyyy") : "-";
          } catch {
            return "-";
          }
        }
        if (c.key === "Otomatis") return item.Otomatis === "Y" ? "Otomatis" : "Manual";
        if (c.key === "Closing") return item.Closing === "Y" ? "Closed" : "Open";
        if (c.key === "Kesesuaian") return item.NoSJ ? `${item.Kesesuaian}%` : "-";

        return (item[c.key as keyof MintaBarangHeader] as string | number) ?? "";
      });

      const row = sheet.addRow(values);
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        cell.border = borderThin;
        cell.alignment = { horizontal: cols[colNum - 1]?.align ?? "left", vertical: "middle" };

        // Warnai kesesuaian
        if (cols[colNum - 1].key === "Kesesuaian" && item.NoSJ) {
          const pct = Number(item.Kesesuaian) || 0;
          cell.font = {
            bold: true,
            color: { argb: pct >= 100 ? "FF2E7D32" : pct > 0 ? "FFEF6C00" : "FFC62828" },
          };
        }
      });
    });

    sheet.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Export_MintaBarang_Header_${filters.startDate}_${filters.endDate}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("File Header berhasil diekspor.");
  } catch (error) {
    console.error(error);
    toast.error("Gagal mengekspor data header.");
  }
};

const exportDetailData = async () => {
  toast.info("Mengambil data detail dari server...");
  try {
    // [FIX 1] Ganti any[] menjadi ExportDetailRow[]
    const response = await api.get<ExportDetailRow[]>("/minta-barang/export-details", {
      params: filters,
    });

    if (!response.data?.length) return toast.warning("Tidak ada data detail untuk diekspor.");

    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Minta Barang Detail");

    // [FIX 2] Buang Partial<ExcelJS.Borders> dan gunakan 'as const' agar otomatis dikenali TypeScript
    const borderThin = {
      top: { style: "thin" as const },
      left: { style: "thin" as const },
      bottom: { style: "thin" as const },
      right: { style: "thin" as const },
    };

    const cols = [
      { header: "Nomor", key: "Nomor", width: 20, align: "left" as const },
      { header: "Tanggal", key: "Tanggal", width: 13, align: "center" as const },
      { header: "No. SO", key: "NoSO", width: 18, align: "left" as const },
      { header: "No. PL", key: "NoPL", width: 20, align: "left" as const },
      { header: "Tgl PL", key: "TglPL", width: 13, align: "center" as const },
      { header: "No. SJ", key: "NoSJ", width: 20, align: "left" as const },
      { header: "Tgl SJ", key: "TglSJ", width: 13, align: "center" as const },
      { header: "Terima SJ", key: "TerimaSJ", width: 20, align: "left" as const },
      { header: "Tgl Terima", key: "TglTerima", width: 13, align: "center" as const },
      { header: "Customer", key: "Customer", width: 25, align: "left" as const },
      { header: "Kode Barang", key: "KodeBarang", width: 15, align: "left" as const },
      { header: "Nama Barang", key: "NamaBarang", width: 35, align: "left" as const },
      { header: "Ukuran", key: "Ukuran", width: 10, align: "center" as const },
      { header: "Jml Minta", key: "JumlahMinta", width: 12, align: "right" as const, fmt: "#,##0" },
      { header: "Jml SJ", key: "JumlahSJ", width: 12, align: "right" as const, fmt: "#,##0" },
      { header: "Kesesuaian", key: "Kesesuaian", width: 12, align: "center" as const },
    ];

    sheet.columns = cols.map((c) => ({ width: c.width }));

    const headerRow = sheet.addRow(cols.map((c) => c.header));
    headerRow.height = 22;
    headerRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { bold: true, color: { argb: "FF0D47A1" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3F2FD" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = borderThin;
    });

    // Coloring alternating rows by "Nomor"
    const nomorColors: Record<string, string> = {};
    let toggle = false;
    let prevNomor = "";

    response.data.forEach((row) => {
      const nomor = String(row.Nomor || "");
      if (!(nomor in nomorColors)) {
        nomorColors[nomor] = toggle ? "FFF3F8FD" : "FFFAFAFA";
        toggle = !toggle;
      }
      const isNewNomor = nomor !== prevNomor;
      prevNomor = nomor;

      // Hitung Kesesuaian On the Fly
      const minta = Number(row.JumlahMinta) || 1;
      const kirim = Number(row.JumlahSJ) || 0;
      const pctValue = Math.round((kirim / minta) * 100);

      const values = cols.map((c) => {
        if (
          [
            "Nomor",
            "Tanggal",
            "NoSO",
            "NoPL",
            "TglPL",
            "NoSJ",
            "TglSJ",
            "TerimaSJ",
            "TglTerima",
            "Customer",
          ].includes(c.key)
        ) {
          // Hide duplicates for cleaner UI
          if (!isNewNomor) return "";
        }

        if (["Tanggal", "TglPL", "TglSJ", "TglTerima"].includes(c.key)) {
          try {
            return row[c.key] ? format(parseISO(String(row[c.key])), "dd/MM/yyyy") : "-";
          } catch {
            return "-";
          }
        }

        if (c.key === "Kesesuaian") return row.NoSJ ? `${pctValue}%` : "-";

        return (row[c.key] as string | number) ?? "";
      });

      const dataRow = sheet.addRow(values);
      dataRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
        const colDef = cols[colNum - 1];
        cell.border = {
          left: { style: "thin" as const },
          right: { style: "thin" as const },
          bottom: { style: "thin" as const },
          top: isNewNomor ? { style: "medium" as const } : { style: "thin" as const },
        };
        cell.alignment = { horizontal: colDef.align, vertical: "middle" };
        if (colDef.fmt) cell.numFmt = colDef.fmt;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: nomorColors[nomor] } };

        if (colDef.key === "Kesesuaian" && row.NoSJ) {
          cell.font = {
            bold: true,
            color: { argb: pctValue >= 100 ? "FF2E7D32" : pctValue > 0 ? "FFEF6C00" : "FFC62828" },
          };
        }
      });
    });

    sheet.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Export_MintaBarang_Detail_${filters.startDate}_${filters.endDate}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("File Detail berhasil diekspor.");
  } catch (error) {
    console.error(error);
    toast.error("Gagal mengekspor data detail.");
  }
};

const handleGenerateAutomasi = async () => {
  isGenerating.value = true;
  try {
    const res = await api.post("/minta-barang-form/generate-automasi");
    toast.success(res.data.message);
    fetchData();
  } catch (err: unknown) {
    const error = err as AxiosError<{ message?: string }>;
    toast.error(error.response?.data?.message || "Gagal menjalankan automasi.");
  } finally {
    isGenerating.value = false;
  }
};

onMounted(() => {
  fetchCabangList();
  fetchData();
  fetchPendingAlokasi();
});

watch(filters, () => fetchData(), { deep: true });
</script>

<template>
  <PageLayout title="Minta Barang ke DC" desktop-mode icon="mdi-package-up">
    <template #header-actions>
      <v-btn
        v-if="authStore.user?.cabang === 'KDC' && authStore.can(MENU_ID, 'insert')"
        size="small"
        color="orange-darken-3"
        prepend-icon="mdi-auto-fix"
        @click="openGenerateDialog"
        :loading="isGenerating"
      >
        Generate Automasi
      </v-btn>
      <v-btn size="small" color="orange" @click="isReviewModalVisible = true">
        Review Alokasi Otomatis ({{ pendingCount }})
      </v-btn>
      <v-btn
        v-if="canInsert"
        size="small"
        color="primary"
        prepend-icon="mdi-plus"
        @click="handleNew"
        >Baru</v-btn
      >
      <v-btn
        v-if="canEdit"
        size="small"
        :disabled="!isSingleSelected"
        prepend-icon="mdi-pencil"
        @click="editItem"
        >Ubah</v-btn
      >
      <v-btn
        v-if="canDelete"
        size="small"
        :disabled="!isSingleSelected"
        prepend-icon="mdi-delete"
        color="error"
        @click="showDeleteConfirmation"
        >Hapus</v-btn
      >
      <v-menu offset-y v-if="authStore.can(MENU_ID, 'view')">
        <template v-slot:activator="{ props }">
          <v-btn color="teal" size="small" prepend-icon="mdi-file-excel" v-bind="props">
            Export Data
          </v-btn>
        </template>
        <v-list density="compact">
          <v-list-item @click="exportHeaderData" value="header">
            <template v-slot:prepend>
              <v-icon icon="mdi-table-headers-eye" size="small" class="mr-2"></v-icon>
            </template>
            <v-list-item-title>Export Header</v-list-item-title>
          </v-list-item>

          <v-list-item @click="exportDetailData" value="detail">
            <template v-slot:prepend>
              <v-icon icon="mdi-file-document-multiple-outline" size="small" class="mr-2"></v-icon>
            </template>
            <v-list-item-title>Export Detail</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </template>

    <div v-if="!hasViewPermission" class="state-container">
      <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
      <h3 class="text-h6">Akses Ditolak</h3>
    </div>

    <div v-else class="browse-content">
      <div class="filter-section">
        <span class="filter-label">Periode:</span>
        <v-text-field
          v-model="filters.startDate"
          type="date"
          density="compact"
          hide-details
          variant="outlined"
        />
        <span class="mx-2">s/d</span>
        <v-text-field
          v-model="filters.endDate"
          type="date"
          density="compact"
          hide-details
          variant="outlined"
        />
        <span class="filter-label ms-4">Cabang:</span>
        <v-select
          v-model="filters.cabang"
          :items="cabangList"
          item-title="nama"
          item-value="kode"
          density="compact"
          hide-details
          variant="outlined"
        />
        <v-radio-group
          v-model="filters.jenisPermintaan"
          inline
          hide-details
          density="compact"
          class="ms-4"
        >
          <v-radio label="Semua" value="semua" />
          <v-radio label="Manual" value="manual" />
          <v-radio label="Otomatis" value="otomatis" />
        </v-radio-group>

        <span class="filter-label ms-4">Status:</span>
        <v-select
          v-model="filters.statusClosing"
          :items="[
            { title: 'Semua', value: 'ALL' },
            { title: 'Aktif (Open)', value: 'N' },
            { title: 'Closed', value: 'Y' },
          ]"
          item-title="title"
          item-value="value"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 130px"
        />

        <v-spacer />

        <div class="legend-group">
          <div class="legend-item legend-red">
            <v-icon size="small">mdi-circle-medium</v-icon> Belum Proses
          </div>
          <div class="legend-item legend-blue">
            <v-icon size="small">mdi-circle-medium</v-icon> Dalam Proses
          </div>
          <div class="legend-item legend-black">
            <v-icon size="small">mdi-circle-medium</v-icon> Selesai (Diterima)
          </div>
          <div class="legend-item legend-grey">
            <v-icon size="small">mdi-circle-medium</v-icon> Transaksi Closed
          </div>
        </div>

        <v-btn
          @click="fetchData"
          icon="mdi-refresh"
          variant="text"
          size="small"
          title="Terapkan Filter"
        />
      </div>

      <div class="table-container">
        <AppDataTable
          v-model="selected"
          v-model:expanded="expanded"
          :headers="headers"
          :items="list"
          :loading="isLoading"
          item-value="Nomor"
          density="compact"
          class="desktop-table header-browse-blue"
          fixed-header
          show-select
          return-object
          show-expand
          @update:expanded="loadDetails"
          @click:row="handleRowClick"
        >
          <template #headers="{ columns, isSorted, getSortIcon, toggleSort }">
            <tr>
              <template v-for="header in columns" :key="header.key">
                <th
                  :style="{
                    width: header.width + 'px',
                    minWidth: header.width + 'px',
                    maxWidth: header.width + 'px',
                  }"
                  class="resizable-header"
                  :class="{
                    'text-center': header.align === 'center',
                    'text-end': header.align === 'end',
                  }"
                  @click="toggleSort(header)"
                >
                  <div class="header-content">
                    <span>{{ header.title }}</span>
                    <v-icon v-if="isSorted(header)" size="small" class="ms-1">
                      {{ getSortIcon(header) }}
                    </v-icon>
                  </div>
                  <div
                    class="resizer"
                    @mousedown.stop="onResizeStart($event, header)"
                    @click.stop
                  ></div>
                </th>
              </template>
            </tr>
          </template>

          <template #[`item.data-table-expand`]="{ internalItem, toggleExpand, isExpanded }">
            <v-btn
              icon="mdi-chevron-down"
              :class="{ 'rotate-180': isExpanded(internalItem) }"
              size="x-small"
              variant="text"
              @click.stop="toggleExpand(internalItem)"
            />
          </template>

          <template
            v-for="header in headers.filter((h) => h.key !== 'data-table-expand')"
            #[`item.${header.key}`]="{ item }"
            :key="header.key"
          >
            <td :class="getRowTextColor(item)">
              <template
                v-if="
                  header.key === 'Tanggal' ||
                  header.key === 'TglPL' ||
                  header.key === 'TglSJ' ||
                  header.key === 'TglTerima'
                "
              >
                {{
                  item[header.key] ? format(parseISO(String(item[header.key])), "dd/MM/yyyy") : "-"
                }}
              </template>

              <template v-else-if="header.key === 'Kesesuaian'">
                <div v-if="!item.NoSJ" class="text-grey font-italic">-</div>
                <div v-else>
                  <v-tooltip location="top" open-delay="200">
                    <template v-slot:activator="{ props }">
                      <span
                        v-bind="props"
                        class="font-weight-bold cursor-pointer hover-underline"
                        :class="
                          item.Kesesuaian >= 100
                            ? 'text-success'
                            : item.Kesesuaian > 0
                            ? 'text-orange-darken-3'
                            : 'text-error'
                        "
                      >
                        {{ item.Kesesuaian }}%
                      </span>
                    </template>
                    <div class="text-caption">
                      <div><strong>Diminta:</strong> {{ item.TotalMinta }} Pcs</div>
                      <div><strong>Dikirim (SJ):</strong> {{ item.TotalKirimSJ }} Pcs</div>
                    </div>
                  </v-tooltip>
                </div>
              </template>

              <template v-else-if="header.key === 'Otomatis'">
                <v-chip size="x-small" :color="item.Otomatis === 'Y' ? 'cyan' : 'purple'" label>
                  {{ item.Otomatis === "Y" ? "Otomatis" : "Manual" }}
                </v-chip>
              </template>

              <!-- TAMBAHKAN BLOK CLOSING INI -->
              <template v-else-if="header.key === 'Closing'">
                <v-chip
                  size="x-small"
                  :color="item.Closing === 'Y' ? 'grey-darken-1' : 'success'"
                  variant="flat"
                  class="font-weight-bold text-uppercase"
                >
                  {{ item.Closing === "Y" ? "Closed" : "Open" }}
                </v-chip>
              </template>
              <!-- ========================= -->

              <template v-else>
                {{ item[header.key] }}
              </template>
            </td>
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length" class="pa-0">
                <div class="detail-container">
                  <div class="detail-table-wrapper">
                    <div
                      v-if="loadingDetails.has(item.Nomor)"
                      class="text-center pa-4 text-caption"
                    >
                      Memuat detail...
                    </div>
                    <v-data-table
                      v-else-if="details[item.Nomor] && details[item.Nomor].length"
                      :headers="detailHeaders"
                      :items="details[item.Nomor]"
                      item-value="Kode"
                      density="compact"
                      class="detail-table"
                      :items-per-page="-1"
                      hide-default-footer
                    >
                      <template #bottom></template>
                    </v-data-table>
                    <div v-else class="text-center py-2 text-caption">Tidak ada data detail.</div>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </AppDataTable>
      </div>
    </div>

    <v-dialog v-model="isConfirmDeleteVisible" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">Konfirmasi Hapus</v-card-title>
        <v-card-text>{{ confirmDialogText }}</v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn text @click="isConfirmDeleteVisible = false">Batal</v-btn>
          <v-btn color="error" variant="tonal" @click="executeDelete">Ya, Hapus</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="isConfirmGenerateVisible" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">Konfirmasi Automasi</v-card-title>
        <v-card-text>
          Proses ini akan menghitung alokasi stok untuk semua cabang. Lanjutkan?
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="grey-darken-1" variant="text" @click="isConfirmGenerateVisible = false"
            >Batal</v-btn
          >
          <v-btn color="orange-darken-3" variant="tonal" @click="executeGenerate"
            >Ya, Lanjutkan</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="isReviewModalVisible" max-width="1100px" persistent scrollable>
      <v-card class="rounded-lg bg-grey-lighten-4">
        <v-toolbar color="blue-darken-3" density="comfortable">
          <v-icon start class="ml-4">mdi-auto-fix</v-icon>
          <v-toolbar-title class="text-subtitle-1 font-weight-bold">
            Review Alokasi Otomatis
            <v-chip class="ml-2" color="white" variant="flat" size="small" style="color: #1565c0">
              {{ pendingCount }} Item Menunggu
            </v-chip>
          </v-toolbar-title>
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" @click="isReviewModalVisible = false" />
        </v-toolbar>

        <v-card-text class="pa-4">
          <div class="mb-3 text-caption text-medium-emphasis d-flex align-center">
            <v-icon size="small" class="mr-1">mdi-cursor-default-click</v-icon>
            Tips: Anda bisa mengklik di mana saja pada baris tabel untuk memilih/membatalkan
            pilihan.
          </div>

          <v-card class="elevation-1 border rounded-lg overflow-hidden">
            <v-data-table
              v-model="selectedPending"
              :headers="modalHeaders"
              :items="pendingList"
              item-value="id"
              show-select
              density="comfortable"
              class="review-table"
              hover
              @click:row="toggleRowSelection"
            >
              <template #[`item.urgensi`]="{ item }">
                <v-chip
                  size="small"
                  :color="item.urgensi === 'KRITIS' ? 'error' : 'warning'"
                  variant="flat"
                  class="font-weight-bold"
                >
                  {{ item.urgensi }}
                </v-chip>
              </template>

              <template #[`item.qty_alokasi`]="{ item }">
                <div
                  class="bg-blue-lighten-5 text-blue-darken-3 font-weight-black pa-1 rounded text-center"
                >
                  {{ item.qty_alokasi }}
                </div>
              </template>
            </v-data-table>
          </v-card>
        </v-card-text>

        <v-card-actions class="pa-4 bg-white border-t">
          <v-btn
            variant="text"
            color="grey-darken-2"
            class="font-weight-bold text-none"
            @click="isReviewModalVisible = false"
          >
            Tutup
          </v-btn>
          <v-spacer />
          <v-btn
            color="orange-darken-3"
            variant="flat"
            class="font-weight-bold text-none px-6"
            :disabled="selectedPending.length === 0"
            @click="proceedToCreate"
          >
            Buat Permintaan ({{ selectedPending.length }} Terpilih)
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
/* --- Layout Full Height --- */
.browse-content {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 64px - 32px);
  overflow: hidden;
}

.filter-section {
  flex-shrink: 0;
  padding: 8px;
  display: flex;
  align-items: center;
  gap: 12px;

  background-color: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.filter-section :deep(.v-field),
.filter-section :deep(.v-field--variant-outlined),
.filter-section :deep(.v-field--variant-filled) {
  background-color: rgb(var(--v-theme-surface)) !important;
}

.filter-section:deep(.v-field--variant-filled .v-field__overlay) {
  background-color: rgb(var(--v-theme-surface)) !important;
}

.table-container {
  flex-grow: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* --- Tabel Style --- */
.desktop-table {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.desktop-table :deep(.v-table__wrapper) {
  flex-grow: 1;
  height: 100% !important;
  overflow-x: auto !important;
  overflow-y: auto !important;
}

.desktop-table :deep(table) {
  width: max-content;
  min-width: 100%;
}

/* --- Header Resize --- */
.resizable-header {
  position: relative;

  background-color: rgb(var(--v-theme-primary)) !important;
  color: rgb(var(--v-theme-on-primary)) !important;

  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;

  border-bottom: 2px solid rgb(var(--v-theme-primary)) !important;
  padding: 0 8px !important;

  user-select: none;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.header-content {
  display: flex;
  align-items: center;
  width: 100%;
  height: 100%;
}

.resizable-header.text-center .header-content {
  justify-content: center;
}

.resizable-header.text-end .header-content {
  justify-content: flex-end;
}

.resizer {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 5px;
  cursor: col-resize;
  z-index: 10;
}

.resizer:hover,
.resizable-header:hover .resizer {
  border-right: 2px solid rgb(var(--v-theme-on-primary));
}

/* --- Detail Sticky --- */
.detail-container {
  position: sticky;
  left: 0;
  z-index: 2;

  display: flex;
  justify-content: flex-start;
  align-items: flex-start;

  background-color: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);

  padding: 16px 16px 16px 64px;
  width: fit-content;
  min-width: 100%;
  box-sizing: border-box;
}

.detail-table-wrapper {
  width: 100%;
  max-width: 800px;

  background-color: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 4px;
  overflow: hidden;
}

/* Pewarnaan Baris */
:deep(td.text-red) {
  color: rgb(var(--v-theme-error)) !important;
}

:deep(td.text-blue) {
  color: rgb(var(--v-theme-primary)) !important;
}

.detail-table :deep(thead tr th) {
  background-color: rgba(var(--v-theme-on-surface), 0.06) !important;
  color: rgb(var(--v-theme-on-surface)) !important;
}

/* --- Aturan Layout Legend --- */
.legend-group {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 10px;
  align-items: center;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-weight: 600;
}

/* --- Paksa Pewarnaan Langsung pada Elemen Icon dan Teks --- */
.legend-red,
.legend-red :deep(.v-icon) {
  color: #f44336 !important;
}
.legend-blue,
.legend-blue :deep(.v-icon) {
  color: #2196f3 !important;
}
.legend-black,
.legend-black :deep(.v-icon) {
  color: #000000 !important;
}
.legend-grey,
.legend-grey :deep(.v-icon) {
  color: #9e9e9e !important;
}

.state-container {
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.compact-table :deep(.v-table__wrapper) {
  max-height: 500px; /* Biar scrollable kalau datanya banyak */
}

.compact-table :deep(th),
.compact-table :deep(td) {
  font-size: 11px !important;
  padding: 4px 8px !important;
  height: 30px !important;
}

.compact-table :deep(th) {
  background-color: #f5f5f5 !important;
  font-weight: bold !important;
  text-transform: uppercase;
}

/* Styling Khusus Tabel Review Alokasi */
.review-table :deep(tbody tr) {
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.review-table :deep(tbody tr:hover) {
  background-color: #f5f5f5 !important;
}

/* Ubah warna baris yang di-ceklis (selected) */
.review-table :deep(tbody tr.v-data-table__selected) {
  background-color: #e3f2fd !important; /* Warna biru muda */
}

.review-table :deep(th) {
  background-color: #fafafa !important;
  font-weight: bold !important;
  color: #424242 !important;
  text-transform: uppercase;
}

.hover-underline:hover {
  text-decoration: underline;
  text-decoration-style: dashed;
  text-underline-offset: 3px;
}
</style>
