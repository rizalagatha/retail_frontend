<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from "vue";
import { useRouter } from "vue-router";
import api from "@/services/api";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { format, subDays } from "date-fns";
import PageLayout from "@/components/PageLayout.vue";
import MasterProductSearchModal from "@/components/lookup/MasterProductSearchModal.vue";
import * as XLSX from "xlsx";
import { AxiosError } from "axios";
import AppDataTable from "@/components/AppDataTable.vue";

// --- Tipe Data ---
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

interface SuratJalanHeader {
  Nomor: string;
  Tanggal: string;
  Store: string; // Kode Cabang
  Nama_Store: string; // Nama Cabang
  Kategori: "UTAMA" | "PENOLONG";
  NomorTerima: string;
  TglTerima?: string;
  NoMinta: string;
  NoSTBJ: string;
  Ngedit: "WAIT" | "ACC" | "TOLAK" | "";
  Closing: "Y" | "N";
  Keterangan: string;
  Usr: string;
  NoInvoice: string;
  NoManifest?: string;
  TotalQty: number;
  [key: string]: unknown;
}

interface SuratJalanDetail {
  Kode: string;
  Nama: string; // Nama Barang
  Ukuran: string;
  Jumlah: number;
  [key: string]: unknown;
}

// interface Product {
//   kode: string;
//   nama: string;
//   [key: string]: unknown;
// }

interface ColumnFilter {
  type: "multi" | "custom";
  values?: (string | number)[];
  operator?: string;
  value?: string | number;
}

interface SuratJalanExportDetail {
  "Nomor SJ": string;
  Tanggal?: string | Date;
  "Kode Store": string;
  "Nama Store": string;
  "No Minta Barang": string;
  Keterangan: string;
  "No Terima": string;
  "Tgl Terima"?: string | Date;
  "Kode Barang": string;
  "Nama Barang": string;
  Ukuran: string;
  Jumlah: number;
  [key: string]: unknown;
}

interface Cabang {
  kode: string;
  nama: string;
}

// --- Inisialisasi ---
const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "213";

// --- State ---
const filters = reactive<{
  startDate: string;
  endDate: string;
  cabang: string | null;
  kodeBarang: string;
  namaBarang: string;
}>({
  startDate: format(subDays(new Date(), 7), "yyyy-MM-dd"),
  endDate: format(new Date(), "yyyy-MM-dd"),
  cabang: authStore.user?.cabang === "KDC" ? "" : authStore.user?.cabang || "",
  kodeBarang: "",
  namaBarang: "",
});
const loading = reactive({ master: false, pengajuan: false });
const masterData = ref<SuratJalanHeader[]>([]);
const selected = ref<SuratJalanHeader[]>([]);
const expanded = ref<string[]>([]);
const cabangList = ref<Cabang[]>([]);
const loadingDetails = ref(new Set<string>());
const details = ref<Record<string, SuratJalanDetail[]>>({});
const dialog = reactive({ pengajuan: false, searchProduct: false, confirm: false });
const pengajuan = reactive({
  nomor: "",
  tanggal: "",
  keterangan: "",
  urut: 1,
  alasan: "",
});
const confirmAction = ref<(() => void) | null>(null);
const confirmText = ref("");

// --- State Filter & Resize ---
const columnFilters = ref<Record<string, ColumnFilter>>({});
const customFilterDialog = ref(false);
const customFilter = reactive({ key: "", operator: "=", value: "" });
const resizingColumn = ref<DataTableHeader | null>(null);
const startX = ref(0);
const startWidth = ref(0);

// --- Computed Properties ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed(() => (isSingleSelected.value ? selected.value[0] : null));

// --- Logic Kolom No Invoice (KDC & KPR) ---
const showInvoiceColumn = computed(() => {
  const cb = authStore.user?.cabang;
  return cb === "KDC" || cb === "KPR";
});

// Menghitung colspan footer secara dinamis berdasarkan posisi kolom TotalQty,
// supaya tidak perlu update manual tiap kali kolom ditambah/dihapus.
const totalQtyColumnIndex = computed(() =>
  masterHeaders.value.findIndex((h) => h.key === "TotalQty")
);

// +1 untuk kolom checkbox bawaan v-data-table (show-select) yang tidak
// tercatat di array masterHeaders.
const beforeTotalQtyColspan = computed(() => totalQtyColumnIndex.value + 1);

const afterTotalQtyColspan = computed(
  () => masterHeaders.value.length - totalQtyColumnIndex.value - 1
);

// --- Header Definisi (Resizable) ---
const masterHeaders = computed<DataTableHeader[]>(() => {
  const baseHeaders: DataTableHeader[] = [
    { title: "", key: "data-table-expand", width: 50, fixed: true },
    { title: "Nomor", key: "Nomor", width: 160, fixed: true },
    { title: "Tanggal", key: "Tanggal", width: 110 },
    { title: "Store", key: "Store", width: 80 },
    { title: "Nama Store", key: "Nama_Store", width: 200 },
  ];

  // Tambahkan No. Manifest di samping kiri No. Invoice
  baseHeaders.push({ title: "No. Manifest", key: "NoManifest", width: 160 });

  // Tambahkan No. Invoice HANYA untuk KDC atau KPR
  if (showInvoiceColumn.value) {
    baseHeaders.push({ title: "No. Invoice", key: "NoInvoice", width: 150 });
  }

  // Lanjutkan sisa kolom
  baseHeaders.push(
    { title: "No. Minta", key: "NoMinta", width: 150 },
    { title: "No. Terima", key: "NomorTerima", width: 150 },
    { title: "Tgl Terima", key: "TglTerima", width: 110 },
    { title: "No. STBJ", key: "NoSTBJ", width: 150 },
    { title: "Total Qty", key: "TotalQty", width: 100, align: "end" },
    { title: "Keterangan", key: "Keterangan", width: 300 },
    { title: "User", key: "Usr", width: 100 },
    { title: "Kategori", key: "Kategori", width: 130, align: "center" },
    { title: "Closing", key: "Closing", width: 80, align: "center" }
  );

  return baseHeaders;
});

const detailHeaders = [
  { title: "Kode", key: "Kode", width: "150px" },
  { title: "Nama Barang", key: "Nama", width: "300px" },
  { title: "Ukuran", key: "Ukuran", width: "80px" },
  { title: "Jumlah", key: "Jumlah", align: "end", width: "100px" },
] as const;

// --- Logic Filter Client-Side ---
const filteredList = computed(() => {
  let data = [...masterData.value];

  for (const key in columnFilters.value) {
    const f = columnFilters.value[key];

    // MULTI FILTER
    if (f.type === "multi" && f.values) {
      data = data.filter((row) => f.values!.includes(row[key] as string | number));
    }

    // CUSTOM FILTER
    if (f.type === "custom" && f.value !== undefined) {
      const target = String(f.value).toLowerCase();
      data = data.filter((row) => {
        const v = row[key];
        if (v === null || v === undefined) return false;
        const s = String(v).toLowerCase();

        switch (f.operator) {
          case "=":
            return s === target;
          case "!=":
            return s !== target;
          case ">":
            return Number(s) > Number(target);
          case ">=":
            return Number(s) >= Number(target);
          case "<":
            return Number(s) < Number(target);
          case "<=":
            return Number(s) <= Number(target);
          case "contains":
            return s.includes(target);
          case "starts":
            return s.startsWith(target);
          case "ends":
            return s.endsWith(target);
          default:
            return true;
        }
      });
    }
  }
  return data;
});

// --- Method: Hitung Total Qty Per Halaman ---
const calculateTotalQtyPerPage = (items: Array<{ raw?: SuratJalanHeader; TotalQty?: number }>) => {
  return items.reduce((sum: number, item) => {
    return sum + (Number(item.raw?.TotalQty || item.TotalQty) || 0);
  }, 0);
};

// --- Methods: Filter Logic ---
const uniqueValues = (key: string): Array<string | number> => {
  return Array.from(
    new Set(
      masterData.value
        .map((i) => i[key] as string | number | null | undefined)
        .filter((v): v is string | number => v !== null && v !== undefined && v !== "")
    )
  ).sort((a, b) => String(a).localeCompare(String(b)));
};

const formatFilterValue = (key: string, val: string | number) => {
  if (!val) return "-";
  if (["Tanggal", "TglTerima"].includes(key)) {
    try {
      return format(new Date(String(val)), "dd/MM/yyyy");
    } catch {
      return val;
    }
  }
  return val;
};

const filterType = (key: string) => columnFilters.value[key]?.type ?? "";
const isFilterActive = (key: string) => Boolean(columnFilters.value[key]);
const clearColumnFilter = (key: string) => {
  delete columnFilters.value[key];
};

const toggleMultiSelectValue = (key: string, value: string | number) => {
  const f = columnFilters.value[key];
  if (!f || f.type !== "multi") {
    columnFilters.value[key] = { type: "multi", values: [value] };
    return;
  }
  const arr = f.values ?? [];
  if (arr.includes(value)) {
    f.values = arr.filter((v) => v !== value);
    if (f.values.length === 0) delete columnFilters.value[key];
  } else {
    f.values = [...arr, value];
  }
};

const openCustomFilter = (key: string) => {
  customFilter.key = key;
  customFilter.operator = "=";
  customFilter.value = "";
  customFilterDialog.value = true;
};

const applyCustomFilter = () => {
  columnFilters.value[customFilter.key] = {
    type: "custom",
    operator: customFilter.operator,
    value: customFilter.value,
  };
  customFilterDialog.value = false;
};

const resetAllFilters = () => {
  columnFilters.value = {};
};

// --- Methods: Resize Logic ---
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

// --- Logic Selection ---
const handleRowClick = (_event: Event, { item }: { item: SuratJalanHeader }) => {
  selected.value = [item];
};

// --- Method ---
const fetchMasterData = async () => {
  loading.master = true;
  masterData.value = [];
  selected.value = [];
  expanded.value = [];
  try {
    const response = await api.get("/surat-jalan", { params: filters });
    masterData.value = response.data;
  } catch (error: unknown) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal mengambil data.");
  } finally {
    loading.master = false;
  }
};

const fetchCabangList = async () => {
  try {
    const response = await api.get("/surat-jalan/lookup/cabang");
    const list = response.data;

    // Jika user adalah KDC (Pusat), tambahkan opsi Semua Cabang di paling atas
    if (authStore.user?.cabang === "KDC") {
      list.unshift({ kode: "", nama: "SEMUA CABANG" });
    }

    cabangList.value = list;
  } catch (error: unknown) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal memuat daftar cabang.");
  }
};

const loadDetails = async (newlyExpandedItems: SuratJalanHeader[]) => {
  // Cari item yang baru diexpand yang datanya belum ada dan tidak sedang loading
  const itemToLoad = newlyExpandedItems.find(
    (item) => !details.value[item.Nomor] && !loadingDetails.value.has(item.Nomor)
  );
  if (!itemToLoad) return;

  const nomorToLoad = itemToLoad.Nomor;
  loadingDetails.value.add(nomorToLoad);
  try {
    const response = await api.get(`/surat-jalan/${nomorToLoad}`);
    details.value[nomorToLoad] = response.data;
  } catch {
    toast.error(`Gagal memuat detail untuk ${nomorToLoad}`);
    // Jika gagal, biarkan Vuetify yang mengatur array expanded
    // Cukup pastikan datanya kosong agar menampilkan pesan error
    details.value[nomorToLoad] = [];
  } finally {
    loadingDetails.value.delete(nomorToLoad);
  }
};

const printData = () => {
  if (!isSingleSelected.value) return;
  const item = selected.value[0];
  const url = router.resolve({
    name: "Cetak Surat Jalan", // Nama route baru
    params: { nomor: item.Nomor },
  }).href;
  window.open(url, "_blank");
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const handleNew = () => router.push({ name: "SuratJalanCreate" });

const handleEdit = () => {
  if (!selectedRow.value) return;
  if (selectedRow.value.NomorTerima)
    return toast.warning("Sudah ada penerimaan. Tidak bisa diubah.");
  if (selectedRow.value.NoSTBJ)
    return toast.warning("SJ Otomatis dari Terima STBJ. Tidak bisa diubah.");
  if (selectedRow.value.Closing === "Y")
    return toast.warning("Sudah Closing Stok Opname. Tidak bisa diubah.");
  router.push({ name: "SuratJalanEdit", params: { nomor: selectedRow.value.Nomor } });
};

const showDeleteConfirmation = () => {
  if (!selectedRow.value) return;
  confirmAction.value = executeDelete;
  confirmText.value = `Yakin ingin hapus Surat Jalan nomor ${selectedRow.value.Nomor}?`;
  dialog.confirm = true;
};
const executeDelete = async () => {
  if (!selectedRow.value) return;
  try {
    const response = await api.delete(`/surat-jalan/${selectedRow.value.Nomor}`);
    toast.success(response.data.message);
    fetchMasterData();
  } catch (error: unknown) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal menghapus data.");
  }
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const openPengajuanDialog = async () => {
  if (!selectedRow.value) return;
  // Validasi
  if (selectedRow.value.NomorTerima)
    return toast.warning("Sudah ada penerimaan. Tidak bisa diubah.");
  if (selectedRow.value.NoSTBJ)
    return toast.warning("SJ Otomatis dari Terima STBJ. Tidak bisa diubah.");

  loading.pengajuan = true;
  dialog.pengajuan = true;
  try {
    const response = await api.get(`/surat-jalan/request-status/${selectedRow.value.Nomor}`);
    pengajuan.nomor = selectedRow.value.Nomor;
    pengajuan.tanggal = selectedRow.value.Tanggal;
    pengajuan.keterangan = selectedRow.value.Keterangan;
    pengajuan.urut = response.data.nextUrut;
    pengajuan.alasan = response.data.alasan;
  } catch (error: unknown) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal mendapatkan status pengajuan.");
    dialog.pengajuan = false;
  } finally {
    loading.pengajuan = false;
  }
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const submitPengajuan = async () => {
  loading.pengajuan = true;
  try {
    const response = await api.post("/surat-jalan/submit-request", pengajuan);
    toast.success(response.data.message);
    dialog.pengajuan = false;
    fetchMasterData();
  } catch (error: unknown) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal mengirim pengajuan.");
  } finally {
    loading.pengajuan = false;
  }
};

const onMasterProductSelected = (product: { kode: string; nama: string }) => {
  filters.kodeBarang = product.kode;
  filters.namaBarang = product.nama;
  dialog.searchProduct = false;
};

const getStatusColor = (status: string) => {
  if (status === "WAIT") return "blue";
  if (status === "ACC") return "green";
  if (status === "TOLAK") return "red";
  return "grey";
};

// Helper Format Tanggal Indonesia
const formatDateIndo = (dateString: string | Date | null | undefined) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
};

// Helper Auto Width Columns
const getAutoColumnWidth = (data: Record<string, unknown>[]) => {
  if (data.length === 0) return [];
  return Object.keys(data[0]).map((key) => ({
    wch: Math.max(key.length + 5, 15),
  }));
};

// --- 2. Fungsi Export Data ---
const exportData = async (type: "header" | "detail") => {
  // === EXPORT HEADER ===
  if (type === "header") {
    // Casting masterData.value ke tipe yang benar
    const currentList = masterData.value as SuratJalanHeader[];

    if (currentList.length === 0) {
      toast.warning("Tidak ada data header untuk diekspor.");
      return;
    }

    try {
      toast.info("Membuat file Excel Header...");

      // Mapping & Formatting Tanggal
      const formattedHeader = currentList.map((item) => ({
        ...item,
        Tanggal: item.Tanggal ? formatDateIndo(item.Tanggal) : "",
        TglTerima: item.TglTerima ? formatDateIndo(item.TglTerima) : "",
      }));

      const worksheet = XLSX.utils.json_to_sheet(formattedHeader);

      // [FITUR] Auto Width
      worksheet["!cols"] = getAutoColumnWidth(formattedHeader);

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "SJ Header");
      XLSX.writeFile(workbook, "Export_Surat_Jalan_Header.xlsx");
      toast.success("File Header berhasil dibuat.");
    } catch (error: unknown) {
      const err = error as AxiosError<{ message?: string }>;
      toast.error(err.response?.data?.message || "Gagal membuat file Excel.");
    }

    // === EXPORT DETAIL ===
  } else if (type === "detail") {
    try {
      toast.info("Mengambil data detail dari server...");

      const response = await api.get<SuratJalanExportDetail[]>("/surat-jalan/export-details", {
        params: filters,
      });

      if (response.data.length === 0) {
        toast.warning("Tidak ada data detail untuk diekspor pada filter ini.");
        return;
      }

      toast.info("Membuat file Excel Detail...");

      // Mapping & Formatting Tanggal
      const formattedDetail = response.data.map((row) => ({
        ...row,
        Tanggal: row.Tanggal ? formatDateIndo(row.Tanggal) : "",
        "Tgl Terima": row["Tgl Terima"] ? formatDateIndo(row["Tgl Terima"]) : "",
      }));

      // Setup Layout Excel
      const title = "LAPORAN DETAIL SURAT JALAN (SJ)";
      const dateRange = `Periode : ${formatDateIndo(filters.startDate)} s/d ${formatDateIndo(
        filters.endDate
      )}`;
      const tableHeaders = Object.keys(formattedDetail[0]);

      const tableData = formattedDetail.map((row) => Object.values(row as Record<string, unknown>));

      const excelData = [[title], [dateRange], [], tableHeaders, ...tableData];

      const worksheet = XLSX.utils.aoa_to_sheet(excelData);

      // Merge Judul
      const merge = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: tableHeaders.length - 1 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: tableHeaders.length - 1 } },
      ];
      worksheet["!merges"] = merge;

      // [FITUR] Auto Width
      worksheet["!cols"] = tableHeaders.map((header) => ({ wch: Math.max(header.length + 5, 15) }));

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "SJ Detail");
      XLSX.writeFile(workbook, "Export_Surat_Jalan_Detail.xlsx");
      toast.success("File Detail berhasil dibuat.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error("Gagal mengekspor data detail: " + message);
    }
  }
};

onMounted(async () => {
  await fetchCabangList();
  if (authStore.can(MENU_ID, "view")) {
    fetchMasterData();
  } else {
    toast.error("Anda tidak memiliki hak akses untuk melihat data ini.");
    router.push("/");
  }
});

let debounceTimer: ReturnType<typeof setTimeout>;
// Watcher untuk memuat ulang data secara otomatis saat filter berubah
watch(
  filters,
  () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      fetchMasterData();
    }, 500); // Memberi jeda 500ms sebelum request
  },
  { deep: true }
);

// Watcher untuk membersihkan nama barang jika kode barang dikosongkan
watch(
  () => filters.kodeBarang,
  (newVal) => {
    if (!newVal) {
      filters.namaBarang = "";
    }
  }
);
</script>

<template>
  <PageLayout title="Surat Jalan ke Store" icon="mdi-truck-delivery">
    <template #header-actions>
      <v-btn
        v-if="authStore.can(MENU_ID, 'insert')"
        size="small"
        color="primary"
        prepend-icon="mdi-plus"
        @click="router.push({ name: 'SuratJalanCreate' })"
        >Baru</v-btn
      >
      <v-btn
        v-if="authStore.can(MENU_ID, 'edit')"
        size="small"
        :disabled="!isSingleSelected"
        prepend-icon="mdi-pencil"
        @click="handleEdit"
        >Ubah</v-btn
      >
      <v-btn
        v-if="authStore.can(MENU_ID, 'delete')"
        size="small"
        color="error"
        :disabled="!isSingleSelected"
        prepend-icon="mdi-delete"
        @click="showDeleteConfirmation"
        >Hapus</v-btn
      >
      <v-btn
        v-if="authStore.can(MENU_ID, 'view')"
        size="small"
        color="green"
        :disabled="!isSingleSelected"
        prepend-icon="mdi-printer"
        @click="printData"
        >Cetak</v-btn
      >
      <v-menu offset-y>
        <template v-slot:activator="{ props }">
          <v-btn size="small" color="teal" prepend-icon="mdi-file-excel" v-bind="props"
            >Export</v-btn
          >
        </template>
        <v-list density="compact">
          <v-list-item @click="exportData('header')"
            ><v-list-item-title>Export Header</v-list-item-title></v-list-item
          >
          <v-list-item @click="exportData('detail')"
            ><v-list-item-title>Export Detail</v-list-item-title></v-list-item
          >
        </v-list>
      </v-menu>
    </template>

    <div class="browse-content">
      <div class="filter-section">
        <v-divider vertical class="mx-2" />
        <v-label class="filter-label">Tanggal:</v-label>
        <v-text-field
          v-model="filters.startDate"
          type="date"
          density="compact"
          hide-details
          variant="outlined"
        />
        <v-label class="filter-label mx-2">s/d</v-label>
        <v-text-field
          v-model="filters.endDate"
          type="date"
          density="compact"
          hide-details
          variant="outlined"
        />

        <v-select
          label="Cabang"
          v-model="filters.cabang"
          :items="cabangList"
          item-title="nama"
          item-value="kode"
          density="compact"
          hide-details
          variant="outlined"
          class="ms-4"
          style="max-width: 200px"
        />

        <v-text-field
          v-model="filters.kodeBarang"
          placeholder="Kode Barang (F1)"
          density="compact"
          hide-details
          clearable
          variant="outlined"
          class="ms-4 field-kode-barang"
          style="min-width: 150px !important; max-width: 200px !important"
          @keydown.f1.prevent="dialog.searchProduct = true"
        >
        </v-text-field>

        <v-text-field
          v-model="filters.namaBarang"
          placeholder="Nama Barang"
          density="compact"
          hide-details
          readonly
          variant="outlined"
          class="filter-nama-barang ms-2 field-nama-barang"
          style="
            min-width: 250px !important;
            max-width: 350px !important;
            flex-shrink: 0 !important;
          "
        >
        </v-text-field>

        <v-spacer />

        <v-btn
          class="reset-filter-btn ms-2"
          color="error"
          variant="tonal"
          icon
          @click="resetAllFilters"
        >
          <v-icon size="18">mdi-filter-off</v-icon>
        </v-btn>

        <v-btn
          @click="fetchMasterData"
          icon="mdi-refresh"
          variant="text"
          size="small"
          class="ms-2"
        />
      </div>

      <div class="table-container">
        <AppDataTable
          v-model="selected"
          v-model:expanded="expanded"
          :headers="masterHeaders"
          :items="filteredList"
          :loading="loading.master"
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
                  v-if="['data-table-expand', 'data-table-select'].includes(header.key)"
                  :style="{ width: header.width + 'px' }"
                  class="resizable-header"
                >
                  <div class="header-content">
                    <span>{{ header.title }}</span>
                  </div>
                  <div class="resizer" @mousedown.stop="onResizeStart($event, header)" />
                </th>

                <th
                  v-else
                  :style="{ width: header.width + 'px' }"
                  class="resizable-header"
                  @click="toggleSort(header)"
                >
                  <div class="header-content">
                    <span>{{ header.title }}</span>
                    <v-icon v-if="isSorted(header)" size="14">{{ getSortIcon(header) }}</v-icon>

                    <v-menu location="bottom start" :close-on-content-click="false">
                      <template #activator="{ props }">
                        <v-icon
                          v-bind="props"
                          size="16"
                          class="ms-1"
                          @click.stop
                          :color="isFilterActive(header.key) ? 'blue' : ''"
                          :icon="
                            filterType(header.key) === 'custom'
                              ? 'mdi-filter-cog'
                              : filterType(header.key) === 'multi'
                              ? 'mdi-filter-multiple'
                              : 'mdi-filter-variant'
                          "
                        />
                      </template>
                      <v-list class="filter-menu" density="compact">
                        <v-list-item @click="clearColumnFilter(header.key)">
                          <v-list-item-title class="text-caption font-weight-bold text-error"
                            >(Clear Filter)</v-list-item-title
                          >
                        </v-list-item>
                        <v-divider />
                        <v-list-item
                          v-for="val in uniqueValues(header.key)"
                          :key="val"
                          @click="toggleMultiSelectValue(header.key, val)"
                        >
                          <template #prepend>
                            <v-checkbox-btn
                              :model-value="columnFilters[header.key]?.values?.includes(val)"
                              density="compact"
                            />
                          </template>
                          <v-list-item-title>{{
                            formatFilterValue(header.key, val)
                          }}</v-list-item-title>
                        </v-list-item>
                        <v-divider />
                        <v-list-item @click="openCustomFilter(header.key)">
                          <v-list-item-title class="text-caption text-primary"
                            >(Custom Filter...)</v-list-item-title
                          >
                        </v-list-item>
                      </v-list>
                    </v-menu>
                  </div>
                  <div class="resizer" @mousedown.stop="onResizeStart($event, header)" />
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

          <template #[`item.Nomor`]="{ item }">
            <strong :style="{ color: getStatusColor(item.Ngedit) }">{{ item.Nomor }}</strong>
          </template>

          <template #[`item.Tanggal`]="{ item }">
            {{ format(new Date(item.Tanggal as string), "dd-MM-yyyy") }}
          </template>

          <template #[`item.NomorTerima`]="{ item }">
            <span :class="!item.NomorTerima && 'text-red font-weight-bold'">
              {{ item.NomorTerima || "Belum" }}
            </span>
          </template>

          <template #[`item.TglTerima`]="{ item }">
            <span v-if="item.TglTerima">{{
              format(new Date(item.TglTerima as string), "dd-MM-yyyy")
            }}</span>
            <span v-else class="text-grey text-caption">-</span>
          </template>

          <template #[`item.NoSTBJ`]="{ item }">
            <span :class="item.NoSTBJ && 'text-blue font-weight-bold'">{{ item.NoSTBJ }}</span>
          </template>

          <template #[`item.NoManifest`]="{ item }">
            <span class="font-weight-medium text-indigo-darken-2">{{
              item.NoManifest || "-"
            }}</span>
          </template>

          <template #[`item.NoInvoice`]="{ item }">
            <span class="font-weight-medium text-blue-darken-2">{{ item.NoInvoice || "-" }}</span>
          </template>

          <template #[`item.Closing`]="{ item }">
            <v-chip size="x-small" :color="item.Closing === 'Y' ? 'green' : 'grey'">
              {{ item.Closing }}
            </v-chip>
          </template>

          <template #[`item.Kategori`]="{ item }">
            <v-chip
              size="x-small"
              :color="item.Kategori === 'PENOLONG' ? 'orange' : 'blue'"
              variant="tonal"
            >
              {{ item.Kategori === "PENOLONG" ? "Penolong" : "Utama" }}
            </v-chip>
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length" class="pa-0">
                <div class="detail-container">
                  <div class="detail-table-wrapper">
                    <div v-if="loadingDetails.has(item.Nomor)" class="state-container pa-4">
                      <v-progress-circular indeterminate color="primary"></v-progress-circular>
                      <div class="mt-2 text-caption">Memuat detail...</div>
                    </div>

                    <v-data-table
                      v-else-if="details[item.Nomor]"
                      :headers="detailHeaders"
                      :items="details[item.Nomor]"
                      density="compact"
                      class="detail-table"
                      :items-per-page="-1"
                      hide-default-footer
                    >
                      <template #[`item.Jumlah`]="{ item: detail }">
                        {{ detail.Jumlah }}
                      </template>
                      <template #bottom></template>
                    </v-data-table>

                    <div v-else class="text-center text-caption py-2">Tidak ada data detail.</div>
                  </div>
                </div>
              </td>
            </tr>
          </template>

          <template #[`body.append`]="{ items }">
            <tr class="sticky-footer-row">
              <td
                :colspan="beforeTotalQtyColspan"
                class="text-end font-weight-bold text-subtitle-2 bg-blue-lighten-5"
              >
                TOTAL QTY :
              </td>
              <td
                class="text-end font-weight-bold text-subtitle-2 bg-blue-lighten-5 text-blue-darken-4"
              >
                {{ calculateTotalQtyPerPage(items).toLocaleString("id-ID") }}
              </td>
              <td
                v-if="afterTotalQtyColspan > 0"
                :colspan="afterTotalQtyColspan"
                class="bg-blue-lighten-5"
              ></td>
            </tr>
          </template>
        </AppDataTable>
      </div>
    </div>

    <MasterProductSearchModal
      v-if="dialog.searchProduct"
      @close="dialog.searchProduct = false"
      @product-selected="onMasterProductSelected"
    />

    <v-dialog v-model="dialog.confirm" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">Konfirmasi</v-card-title>
        <v-card-text>{{ confirmText }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="dialog.confirm = false">Tidak</v-btn>
          <v-btn
            color="primary"
            variant="tonal"
            @click="
              confirmAction && confirmAction();
              dialog.confirm = false;
            "
            >Ya, Lanjutkan</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="customFilterDialog" max-width="350px">
      <v-card>
        <v-card-title class="text-subtitle-1 font-weight-bold">Custom Filter</v-card-title>
        <v-card-text>
          <v-select
            v-model="customFilter.operator"
            :items="['=', '!=', '>', '>=', '<', '<=', 'contains', 'starts', 'ends']"
            density="compact"
            hide-details
            class="mb-2"
          />
          <v-text-field
            v-model="customFilter.value"
            density="compact"
            hide-details
            autofocus
            placeholder="Value..."
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="customFilterDialog = false">Batal</v-btn>
          <v-btn color="primary" @click="applyCustomFilter">Terapkan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
/* Layout Full Height */
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

.table-container {
  flex-grow: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Table Style */
.desktop-table {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.desktop-table :deep(.v-table__wrapper) {
  flex-grow: 1;
  height: 100% !important;
}

.desktop-table :deep(table) {
  width: max-content;
  min-width: 100%;
}

/* Header Resize */
.resizable-header {
  position: relative;
  background-color: #e3f2fd !important;
  color: #0d47a1 !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;
  border-bottom: 2px solid #1976d2 !important;
  padding: 0 8px !important;
  user-select: none;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  cursor: pointer;
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 100%;
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
  border-right: 2px solid #1565c0;
}

/* Detail Sticky */
.detail-container {
  position: sticky;
  left: 0;
  background-color: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);

  /* [UBAH DI SINI] Gunakan padding 16px rata agar di kiri */
  padding: 16px;

  width: 100%;
  box-sizing: border-box;

  /* Pastikan konten flex di kiri */
  display: flex;
  justify-content: flex-start;
}

.detail-table-wrapper {
  width: 100%;
  max-width: 900px;
  /* Batasi lebar tabel detail agar rapi */

  background-color: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 4px;
  overflow: hidden;
}

.detail-table :deep(thead tr th) {
  background-color: rgba(var(--v-theme-on-surface), 0.04) !important;
  color: rgb(var(--v-theme-on-surface)) !important;
  font-size: 11px !important;
  height: 32px !important;
}

.state-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.filter-menu {
  max-height: 300px;
  overflow-y: auto;
}

.reset-filter-btn {
  width: 40px;
  height: 40px;

  border-radius: 6px !important;
  /* sama seperti input */
  background-color: rgba(211, 47, 47, 0.15) !important;
}

.reset-filter-btn:hover {
  background-color: rgba(211, 47, 47, 0.25) !important;
}

.filter-nama-barang :deep(input) {
  font-size: 11px !important;
}

/* Sticky Footer di dalam tabel body (Per Page) */
.sticky-footer-row td {
  position: sticky;
  bottom: 0;
  z-index: 3;
  border-top: 2px solid #1976d2 !important;
  border-bottom: none !important;
  height: 40px !important;
}

/* --- Override Global CSS untuk Field Kode & Nama Barang --- */
.field-kode-barang {
  flex-shrink: 0 !important;
  width: 150px !important;
}
.field-kode-barang :deep(.v-input__control),
.field-kode-barang :deep(.v-field) {
  width: 100% !important;
  min-width: 150px !important;
}

.field-nama-barang {
  flex-shrink: 0 !important;
  width: 300px !important; /* Sesuaikan lebar ideal yang diinginkan */
}
.field-nama-barang :deep(.v-input__control),
.field-nama-barang :deep(.v-field) {
  width: 100% !important;
  min-width: 300px !important;
}
</style>
