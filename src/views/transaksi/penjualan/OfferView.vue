<script setup lang="ts">
import { ref, onMounted, computed, watch, reactive } from "vue";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { useRouter, useRoute, onBeforeRouteLeave } from "vue-router";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import { formatRupiah } from "@/utils/formatRupiah";
import type { AxiosError } from "axios";

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

interface OfferDetail {
  nomor: string;
  tanggal: string;
  cus_nama: string;
  nama_barang: string;
  qty: number;
  harga: number;
  diskon: number;
  total: number;
  Tanggal?: string | Date;
  [key: string]: unknown; // Optional, jika ada field lain yang tidak pasti
}

interface OfferItem {
  nomor: string;
  Tanggal?: string | Date;
  [key: string]: unknown; // opsional, kalau ada field lain
}

const toast = useToast();
const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();
const MENU_ID = "42";

interface OfferHeader {
  nomor: string;
  tanggal: string;
  noSO: string;
  tanggalSO: string;
  top: number;
  tempo: string;
  ppn: number;
  "disc%": number;
  diskon: number;
  nominal: number;
  kdcus: string;
  nama: string;
  alamat: string;
  kota: string;
  telp: string;
  level: string;
  keterangan: string;
  alasan: string;
  created: string;
  alasanClose: string;
  noINV: string;
  userModified: string;
  dateModified: string;
}

interface OfferDetail {
  kode: string;
  barcode: string;
  nama: string;
  ukuran: string;
  qty: number;
  harga: number;
  diskon: number;
  total: number;
}

interface Branch {
  kode: string;
  nama: string;
}

interface ColumnFilter {
  type: "multi" | "custom";
  values?: (string | number)[];
  operator?: string;
  value?: string | number;
}

// --- State ---
const offerList = ref<OfferHeader[]>([]);
const filterOptions = ref([
  { title: "Nomor", value: "nomor" },
  { title: "Tanggal", value: "tanggal" },
  { title: "No. SO", value: "noSO" },
  { title: "Tanggal SO", value: "tanggalSO" },
  { title: "TOP", value: "top" },
  { title: "Tgl Tempo", value: "tempo" },
  { title: "PPN", value: "ppn" },
  { title: "Disc %", value: "disc%" },
  { title: "Diskon", value: "diskon" },
  { title: "Nominal", value: "nominal" },
  { title: "Kode Customer", value: "kdcus" },
  { title: "Nama Customer", value: "nama" },
  { title: "Alamat", value: "alamat" },
  { title: "Kota", value: "kota" },
  { title: "Telepon", value: "telp" },
  { title: "Level", value: "level" },
  { title: "Keterangan", value: "keterangan" },
  { title: "Alasan Close", value: "alasan" },
  { title: "User", value: "created" },
  { title: "Status", value: "status" },
]);
const isMounted = ref(false);
const selectedFilterField = ref("nomor"); // Filter default
const filterSearchValue = ref("");
const details = ref<{ [key: string]: OfferDetail[] }>({});
const isLoading = ref(true);
const expanded = ref<OfferHeader[]>([]);
const selected = ref<OfferHeader[]>([]);
const loadingDetails = ref<Set<string>>(new Set());
const branchList = ref<Branch[]>([]);
const isCloseDialogVisible = ref(false);
const closeReason = ref("");
const isClosing = ref(false);

const hasViewPermission = computed(() => authStore.can(MENU_ID, "view"));

const filters = reactive({
  startDate: format(new Date(), "yyyy-MM-dd"),
  endDate: format(new Date(), "yyyy-MM-dd"),
  cabang: authStore.user?.cabang === "KDC" ? "ALL" : authStore.user?.cabang || "",
});

const tableHeaders = ref<DataTableHeader[]>([
  { title: "", key: "data-table-expand", width: 50, fixed: true },
  { title: "Nomor", key: "nomor", width: 150, fixed: true },
  { title: "Tanggal", key: "tanggal", width: 100 },
  { title: "Kode Customer", key: "kdcus", width: 120 },
  { title: "Nama Customer", key: "nama", width: 250 },
  { title: "No. SO", key: "noSO", width: 150 },
  { title: "Tanggal SO", key: "tanggalSO", width: 120 },
  { title: "TOP", key: "top", align: "center", width: 70 },
  { title: "Tgl Tempo", key: "tempo", width: 100 },
  { title: "PPN", key: "ppn", align: "end", width: 100 },
  { title: "Disc %", key: "disc%", align: "end", width: 80 },
  { title: "Diskon", key: "diskon", align: "end", width: 100 },
  { title: "Nominal", key: "nominal", align: "end", width: 120 },
  { title: "Alamat", key: "alamat", width: 350 },
  { title: "Kota", key: "kota", width: 150 },
  { title: "Telepon", key: "telp", width: 120 },
  { title: "Level", key: "level", width: 150 },
  { title: "Keterangan", key: "keterangan", width: 250 },
  { title: "Alasan Close", key: "alasan", width: 250 },
  { title: "User", key: "created", width: 120 },
  { title: "User Modified", key: "userModified", width: 150 },
  { title: "Date Modified", key: "dateModified", width: 160 },
  { title: "Status", key: "status", align: "center", width: 120 },
]);

const detailHeaders = [
  { title: "KODE", key: "kode", width: "150px" },
  { title: "BARCODE", key: "barcode", width: "120px" },
  { title: "NAMA BARANG", key: "Nama", width: "400px" }, // Header Nama diperlebar
  { title: "UKURAN", key: "ukuran", width: "100px", align: "center" },
  { title: "QTY", key: "qty", align: "center", width: "80px" },
  { title: "HARGA", key: "harga", align: "end", width: "120px" },
  { title: "DISKON", key: "diskon", align: "end", width: "100px" },
  { title: "TOTAL", key: "total", align: "end", width: "130px" },
] as const;

// --- Filter ----
const columnFilters = ref<Record<string, ColumnFilter>>({});

// Custom filter dialog
const customFilterDialog = ref(false);
const customFilter = reactive({
  key: "",
  operator: "=",
  value: "",
});

// LocalStorage key
const LS_FILTER_KEY = "offer_table_filters";

const SESSION_STATE_KEY = "offer_browse_state";

// load existing filter
const saved = localStorage.getItem(LS_FILTER_KEY);
if (saved) {
  try {
    columnFilters.value = JSON.parse(saved);
  } catch {}
}

const uniqueValues = (key: keyof OfferHeader) => {
  const set = new Set(
    offerList.value
      .map((r) => r[key])
      .filter((v): v is string | number => v !== null && v !== undefined && v !== "")
  );

  return Array.from(set).sort();
};

const isFilterActive = (key: string) => {
  return Boolean(columnFilters.value[key]);
};

const filterType = (key: string) => {
  const f = columnFilters.value[key];
  if (!f) return "";
  if (f.type === "custom") return "custom";
  if (f.type === "multi") return "multi";
  return "";
};

const clearColumnFilter = (key: string) => {
  delete columnFilters.value[key];
};

// MULTI SELECT
const toggleMultiSelectValue = (key: string, value: string | number) => {
  const f = columnFilters.value[key];

  if (!f || f.type !== "multi") {
    columnFilters.value[key] = { type: "multi", values: [value] };
    return;
  }
  const arr = f.values || [];

  if (arr.includes(value)) {
    f.values = arr.filter((v) => v !== value);
    if (f.values.length === 0) delete columnFilters.value[key];
  } else {
    f.values = [...arr, value];
  }
};

// CUSTOM FILTER
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
  localStorage.removeItem(LS_FILTER_KEY);

  // Bersihkan teks pencarian
  filterSearchValue.value = "";

  // Bersihkan session storage khusus offer
  sessionStorage.removeItem(SESSION_STATE_KEY);

  // Tambahkan ini agar URL kembali bersih
  if (route.query.status || route.query.startDate) {
    router.replace({ query: {} });
  }

  // Reload data
  if (isMounted.value && hasViewPermission.value) {
    fetchData();
  }
};

const noFilterColumns = ["data-table-select", "data-table-expand"];

const formatFilterValue = (key: string, val: string | number | undefined | null): string => {
  // Kolom tanggal → format dd/MM/yyyy
  if (["tanggal", "tempo", "dateModified", "tanggalSO"].includes(key)) {
    if (!val) return "-";
    if (typeof val === "string" || typeof val === "number") {
      try {
        return format(new Date(val), "dd/MM/yyyy");
      } catch {
        return String(val);
      }
    }
  }

  // Default fallback
  return String(val ?? "-");
};

// --- Resize Logic ---
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

const isSingleSelected = computed(() => selected.value.length === 1);
const canBeClosed = computed(() => {
  if (!isSingleSelected.value) return false;
  const selectedOffer = selected.value[0];
  // Tombol aktif hanya jika penawaran belum jadi SO dan belum punya alasan (status Open)
  return !selectedOffer.noSO && !selectedOffer.alasan;
});

const filteredOffers = computed(() => {
  let data = [...offerList.value];

  if (route.query.status === "open") {
    // Open = Belum ada No. SO dan Belum ada Alasan Closing
    data = data.filter((r) => !r.noSO && !r.alasan);
  }

  // 1) FILTER HEADER (MULTI & CUSTOM)
  for (const key in columnFilters.value) {
    const f = columnFilters.value[key];

    if (f.type === "multi" && f.values) {
      const k = key as keyof OfferHeader;

      data = data.filter((r) => f.values!.includes(r[k] as string | number));
      continue;
    }

    if (f.type === "custom" && f.operator) {
      const cmp = String(f.value).toLowerCase();

      data = data.filter((row) => {
        const k = key as keyof OfferHeader;
        const v = row[k];
        if (v == null) return false;

        const val = String(v).toLowerCase();

        switch (f.operator) {
          case "=":
            return val === cmp;
          case "!=":
            return val !== cmp;
          case ">":
            return Number(val) > Number(cmp);
          case ">=":
            return Number(val) >= Number(cmp);
          case "<":
            return Number(val) < Number(cmp);
          case "<=":
            return Number(val) <= Number(cmp);
          case "contains":
            return val.includes(cmp);
          case "starts":
            return val.startsWith(cmp);
          case "ends":
            return val.endsWith(cmp);
        }
      });
    }
  }

  // 2) GLOBAL SEARCH (DIPINDAH KE PALING AKHIR)
  if (filterSearchValue.value) {
    const key = selectedFilterField.value;
    const term = filterSearchValue.value.toLowerCase();
    const k = key as keyof OfferHeader;

    data = data.filter((r) =>
      String(r[k] ?? "")
        .toLowerCase()
        .includes(term)
    );
  }

  return data;
});

// --- Methods ---
const handleRowClick = (_event: Event, { item }: { item: OfferHeader }) => {
  selected.value = [item];
};

const fetchBranches = async () => {
  try {
    const response = await api.get("/warehouses/list", {
      params: { userCabang: authStore.user?.cabang },
    });

    let data = response.data;

    // Tambahkan opsi 'ALL' jika user adalah KDC
    if (authStore.user?.cabang === "KDC") {
      data = [{ kode: "ALL", nama: "ALL STORE" }, ...data];
    }

    branchList.value = data;
  } catch (error: unknown) {
    const err = error as AxiosError<{ message?: string }>;

    toast.error(err.response?.data?.message || "Gagal memuat daftar cabang.");
  }
};

const fetchData = async () => {
  isLoading.value = true;
  try {
    const response = await api.get("/offers", {
      params: {
        // --- UBAH BAGIAN INI ---
        startDate: filters.startDate,
        endDate: filters.endDate,
        cabang: filters.cabang,
        // -----------------------
      },
    });
    offerList.value = response.data;
  } catch (error: unknown) {
    const err = error as AxiosError<{ message?: string }>;

    toast.error(err.response?.data?.message || "Gagal memuat data penawaran.");
  } finally {
    isLoading.value = false;
  }
};

// Method yang diperbaiki untuk load details
const loadDetails = async (expandedItems: OfferHeader[]) => {
  // Extract nomor dari expanded items
  const expandedNomors = expandedItems.map((item) => item.nomor);

  // Cari item yang baru di-expand (belum punya detail)
  for (const nomor of expandedNomors) {
    if (!details.value[nomor] && !loadingDetails.value.has(nomor)) {
      loadingDetails.value.add(nomor);

      try {
        const url = `/offers/${nomor}`;
        const response = await api.get(url);

        // Update details dengan spread operator untuk trigger reactivity
        details.value = {
          ...details.value,
          [nomor]: response.data,
        };
      } catch (error) {
        console.error(`Error loading detail for ${nomor}:`, error);
        toast.error(`Gagal memuat detail untuk nomor ${nomor}`);
        // Remove dari expanded jika gagal load
        expanded.value = expanded.value.filter((item) =>
          typeof item === "string" ? item !== nomor : item.nomor !== nomor
        );
      } finally {
        loadingDetails.value.delete(nomor);
      }
    } else {
    }
  }
};

const editOffer = () => {
  if (!isSingleSelected.value) return;
  const nomor = selected.value[0].nomor;
  router.push(`/transaksi/penjualan/penawaran/ubah/${nomor}`);
};

const openCloseDialog = () => {
  if (!canBeClosed.value) return; // Validasi tambahan
  closeReason.value = selected.value[0].alasan || ""; // Isi dengan alasan yang ada jika ada
  isCloseDialogVisible.value = true;
};

const submitCloseOffer = async () => {
  if (!closeReason.value) {
    toast.error("Alasan harus diisi.");
    return;
  }
  isClosing.value = true;
  try {
    const nomor = selected.value[0].nomor;
    await api.post("/offers/close", {
      nomor,
      alasan: closeReason.value,
    });
    toast.success("Penawaran berhasil ditutup.");
    isCloseDialogVisible.value = false;
    fetchData(); // Muat ulang data untuk melihat status baru
    selected.value = []; // Kosongkan seleksi
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal menutup penawaran.");
  } finally {
    isClosing.value = false;
  }
};

// Tambahkan helper ini di methods
const formatDateIndo = (dateString: string | Date) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  // Menggunakan 'id-ID' untuk output "27 Desember 2025"
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
};

// --- Update fungsi exportHeaderData ---
const exportHeaderData = () => {
  if (offerList.value.length === 0) {
    toast.warning("Tidak ada data header untuk diekspor.");
    return;
  }

  // Mapping data untuk memformat tanggal dan menyuntikkan Status sebelum masuk Excel
  const formattedData = offerList.value.map((item: OfferHeader) => {
    // [BARU] Tentukan status persis seperti di tampilan tabel UI
    let currentStatus = "Open";
    if (item.noSO) currentStatus = "Sudah Jadi SO";
    else if (item.alasan) currentStatus = "Closed";

    return {
      ...item,
      // Pastikan status dimasukkan ke dalam objek hasil map
      Status: currentStatus,
      Tanggal: item.tanggal ? formatDateIndo(item.tanggal) : "",
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(formattedData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Penawaran Header");
  XLSX.writeFile(workbook, "DaftarPenawaran_Header.xlsx");
  toast.success("Data header berhasil diekspor.");
};

// --- Update fungsi exportDetailData ---
const exportDetailData = async () => {
  toast.info("Menyiapkan data detail untuk diekspor...");
  try {
    const cabang = authStore.user?.cabang || "";
    const response = await api.get<OfferDetail[]>("/offers/export-details", {
      params: {
        startDate: filters.startDate,
        endDate: filters.endDate,
        cabang,
      },
    });

    // Format tanggal pada data yang diterima dari backend
    const dataToExport = response.data.map((row: OfferDetail) => ({
      ...row,
      // Sesuai query backend Anda, nama kolomnya adalah 'Tanggal'
      Tanggal: row.Tanggal ? formatDateIndo(row.Tanggal) : "",
    }));

    if (dataToExport.length === 0) {
      toast.warning("Tidak ada data detail untuk diekspor pada periode ini.");
      return;
    }

    // 1. Siapkan Judul dan Header
    const title = "FORM PENAWARAN";
    // Format tanggal untuk judul range (menggunakan helper yang sama biar konsisten)
    const dateRange = `Periode : ${formatDateIndo(filters.startDate)} s/d ${formatDateIndo(
      filters.endDate
    )}`;
    const tableHeaders = Object.keys(dataToExport[0]);

    // 2. Ubah data JSON menjadi array of arrays
    const tableData = dataToExport.map((row) => Object.values(row));

    // 3. Gabungkan semua bagian menjadi satu array besar
    const excelData = [
      [title],
      [dateRange],
      [], // Baris kosong
      tableHeaders,
      ...tableData,
    ];

    // 4. Buat worksheet
    const ws = XLSX.utils.aoa_to_sheet(excelData);

    // 5. Atur penggabungan sel (merge)
    const merge = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: tableHeaders.length - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: tableHeaders.length - 1 } },
    ];
    ws["!merges"] = merge;

    // Atur lebar kolom
    const colWidths = tableHeaders.map((header) => ({ wch: header.length + 5 }));
    ws["!cols"] = colWidths;

    // 6. Buat workbook dan unduh
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, ws, "Detail Penawaran");

    XLSX.writeFile(workbook, "DetailPenawaran.xlsx");
    toast.success("Data detail berhasil diekspor.");
  } catch (error: unknown) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal mengekspor data detail.");
    console.error("Export detail error:", error);
  }
};

const printData = (item: OfferItem) => {
  if (!item || !item.nomor) {
    toast.error("Silakan pilih satu data untuk dicetak.");
    return;
  }

  const url = router.resolve({
    name: "Cetak Penawaran",
    params: { nomor: item.nomor },
  }).href;

  window.open(url, "_blank");
};

const getRowTextColor = (item: OfferHeader) => {
  // Merah jika belum jadi SO dan belum ditutup (status Open)
  if (!item.noSO && !item.alasan) {
    return "text-red font-weight-bold";
  }
  // Biru jika tidak jadi SO (ditutup dengan alasan)
  if (!item.noSO && item.alasan) {
    return "text-blue font-weight-bold";
  }
  // Warna default untuk yang sudah jadi SO atau status lain
  return "";
};

const getStatusChip = (item: OfferHeader) => {
  if (item.noSO) return { text: "Sudah Jadi SO", color: "success" };
  if (item.alasan) return { text: "Closed", color: "blue-grey" };
  return { text: "Open", color: "grey" };
};

const saveStateToSession = () => {
  const stateToSave = {
    filters: filters,
    selectedFilterField: selectedFilterField.value,
    filterSearchValue: filterSearchValue.value,
  };
  sessionStorage.setItem(SESSION_STATE_KEY, JSON.stringify(stateToSave));
};

onMounted(async () => {
  if (hasViewPermission.value) {
    // 1. Coba baca state pencarian dari Session Storage terlebih dahulu
    const savedState = sessionStorage.getItem(SESSION_STATE_KEY);

    if (savedState) {
      try {
        const parsedState = JSON.parse(savedState);

        // Timpa filters dengan data dari memory browser
        if (parsedState.filters) {
          Object.assign(filters, parsedState.filters);
        }

        // Kembalikan juga kolom pencarian dan teks pencariannya
        if (parsedState.selectedFilterField) {
          selectedFilterField.value = parsedState.selectedFilterField;
        }
        if (parsedState.filterSearchValue) {
          filterSearchValue.value = parsedState.filterSearchValue;
        }
      } catch (e) {
        console.error("Gagal membaca state filter dari sessionStorage", e);
      }
    } else {
      // 2. Jika tidak ada di memory (baru buka pertama kali), gunakan Query URL
      const queryStartDate = route.query.startDate as string;
      const queryEndDate = route.query.endDate as string;

      if (queryStartDate && queryEndDate) {
        filters.startDate = queryStartDate;
        filters.endDate = queryEndDate;
      }
    }

    // 3. Muat daftar cabang
    await fetchBranches();

    // 4. Pastikan default terpilih dengan benar (Hanya jika bukan dari session storage)
    if (!savedState && authStore.user?.cabang === "KDC" && !route.query.cabang) {
      filters.cabang = "ALL";
    }

    // 5. Ambil data
    await fetchData();

    isMounted.value = true;
  } else {
    isLoading.value = false;
    toast.error("Anda tidak memiliki izin untuk melihat halaman ini.");
  }
});

// Watcher untuk expanded items sebagai backup
watch(
  expanded,
  (newExpanded) => {
    if (newExpanded.length > 0) {
      loadDetails(newExpanded);
    }
  },
  { deep: true }
);

watch(
  filters,
  () => {
    saveStateToSession(); // Simpan setiap kali filter tanggal/cabang berubah

    if (isMounted.value && hasViewPermission.value) {
      // Karena pencarian global dilakukan di frontend via computed 'filteredOffers',
      // memanggil fetchData() di sini akan mengambil ulang data dari backend
      // sesuai tanggal dan cabang yang baru dipilih.
      fetchData();
    }
  },
  { deep: true }
);

// PS: Anda mungkin juga ingin menambahkan watch untuk tanggal jika diperlukan
watch(
  () => [filters.startDate, filters.endDate],
  () => {
    if (isMounted.value && hasViewPermission.value) {
      fetchData();
    }
  }
);

watch(
  columnFilters,
  (val) => {
    localStorage.setItem(LS_FILTER_KEY, JSON.stringify(val));
  },
  { deep: true }
);

watch([filterSearchValue, selectedFilterField], () => {
  saveStateToSession(); // Simpan setiap kali teks pencarian berubah
  // Tidak perlu panggil fetchData() karena pencarian dilakukan di frontend (computed)
});

onBeforeRouteLeave((to, from, next) => {
  // Cek apakah halaman tujuan MASIH berhubungan dengan modul Penawaran.
  // Asumsi path modul penawaran Anda mengandung "/penawaran" (misal: /transaksi/penjualan/penawaran/ubah/xxx)
  const isRelatedPage = to.path.includes("/penawaran");

  if (!isRelatedPage) {
    // Jika pergi ke menu lain (misal: /dashboard atau /surat-pesanan), bersihkan memori!
    sessionStorage.removeItem(SESSION_STATE_KEY);
  }

  next(); // Lanjutkan perpindahan halaman
});
</script>

<template>
  <PageLayout title="Penawaran">
    <template #header-actions>
      <v-btn
        v-if="authStore.can(MENU_ID, 'insert')"
        size="small"
        color="primary"
        prepend-icon="mdi-plus"
        @click="router.push('/transaksi/penjualan/penawaran/new')"
        >Baru</v-btn
      >
      <v-btn
        v-if="authStore.can(MENU_ID, 'edit')"
        size="small"
        :disabled="!isSingleSelected"
        prepend-icon="mdi-pencil"
        @click="editOffer"
        >Ubah</v-btn
      >
      <!-- <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" color="error" :disabled="!isSingleSelected"
        prepend-icon="mdi-delete" @click="confirmDelete">Hapus</v-btn> -->
      <v-btn
        size="small"
        color="green"
        prepend-icon="mdi-printer"
        @click="printData(selected[0])"
        :disabled="selected.length !== 1"
      >
        Cetak
      </v-btn>
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
      <v-btn
        v-if="authStore.can(MENU_ID, 'edit')"
        size="small"
        :disabled="!canBeClosed"
        color="blue"
        prepend-icon="mdi-lock-outline"
        @click="openCloseDialog"
        >Close Penawaran</v-btn
      >
    </template>

    <div v-if="!hasViewPermission" class="text-center pa-8 text-grey">
      <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
      <h3 class="text-h6">Akses Ditolak</h3>
      <p class="body-1 mt-2">Anda tidak memiliki izin untuk melihat data ini.</p>
    </div>

    <div v-else class="browse-content">
      <!-- Filter Section -->
      <div class="filter-section">
        <div class="d-flex align-center ga-2">
          <span class="filter-label">Periode:</span>
          <v-text-field
            v-model="filters.startDate"
            type="date"
            density="compact"
            hide-details
            variant="outlined"
            style="width: 120px"
          ></v-text-field>
          <span>s/d</span>
          <v-text-field
            v-model="filters.endDate"
            type="date"
            density="compact"
            hide-details
            variant="outlined"
            style="width: 120px"
          ></v-text-field>
        </div>
        <div class="d-flex align-center ga-2">
          <span class="filter-label">Cabang:</span>
          <v-select
            v-model="filters.cabang"
            :items="branchList"
            item-title="nama"
            item-value="kode"
            density="compact"
            hide-details
            variant="outlined"
            style="width: 150px"
            :menu-props="{ class: 'compact-select-list' }"
          ></v-select>
        </div>
        <div class="d-flex align-center ga-2">
          <v-select
            v-model="selectedFilterField"
            :items="filterOptions"
            label="Filter Berdasarkan"
            density="compact"
            hide-details
            variant="outlined"
            style="width: 190px"
          ></v-select>
          <v-text-field
            v-model="filterSearchValue"
            label="Cari..."
            density="compact"
            hide-details
            variant="outlined"
            style="width: 180px"
            clearable
            prepend-inner-icon="mdi-magnify"
          ></v-text-field>
        </div>
        <v-btn
          color="error"
          variant="tonal"
          prepend-icon="mdi-filter-off"
          class="btn-detail reset-filter-btn ms-2"
          @click="resetAllFilters"
        >
          Reset Filter
        </v-btn>
        <v-spacer></v-spacer>
        <div class="legend-group">
          <span class="legend-open">● Open</span>
          <span class="legend-closed">● Tidak Jadi SO</span>
        </div>
        <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small"></v-btn>
      </div>

      <!-- Table Section -->
      <div class="table-container">
        <AppDataTable
          v-model="selected"
          :headers="tableHeaders"
          :items="filteredOffers"
          :loading="isLoading"
          item-value="nomor"
          density="compact"
          class="desktop-table header-browse-blue"
          fixed-header
          show-select
          return-object
          @update:expanded="loadDetails"
          @click:row="handleRowClick"
          :item-props="(item: OfferHeader) => ({ class: getRowTextColor(item) })"
        >
          <template #headers="{ columns, isSorted, getSortIcon, toggleSort }">
            <tr>
              <template v-for="header in columns" :key="header.key">
                <!-- HEADER TANPA FILTER -->
                <th
                  v-if="noFilterColumns.includes(header.key)"
                  :style="{
                    width: header.width + 'px',
                    minWidth: header.width + 'px',
                    maxWidth: header.width + 'px',
                  }"
                  class="resizable-header"
                >
                  <div class="header-content">
                    <span>{{ header.title }}</span>
                  </div>
                  <div class="resizer" @mousedown.stop="onResizeStart($event, header)"></div>
                </th>

                <!-- HEADER DENGAN FILTER -->
                <th
                  v-else
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
                    <!-- TITLE -->
                    <span>{{ header.title }}</span>

                    <!-- SORT ICON -->
                    <v-icon v-if="isSorted(header)" size="14" class="ms-1">
                      {{ getSortIcon(header) }}
                    </v-icon>

                    <!-- FILTER ICON -->
                    <v-menu location="bottom start">
                      <template #activator="{ props }">
                        <v-icon
                          size="16"
                          v-bind="props"
                          @click.stop
                          :color="isFilterActive(header.key) ? 'blue' : ''"
                          :icon="
                            filterType(header.key) === 'custom'
                              ? 'mdi-filter-cog'
                              : filterType(header.key) === 'multi'
                              ? 'mdi-filter-multiple'
                              : 'mdi-filter-variant'
                          "
                          class="ms-1"
                        />
                      </template>

                      <v-list class="filter-menu">
                        <v-list-item @click.stop="clearColumnFilter(header.key)">
                          <v-list-item-title>(Select All)</v-list-item-title>
                        </v-list-item>

                        <v-divider />

                        <!-- MULTI SELECT -->
                        <v-list-item
                          v-for="value in uniqueValues(header.key)"
                          :key="value"
                          @click.stop="toggleMultiSelectValue(header.key, value)"
                        >
                          <template #prepend>
                            <v-checkbox
                              density="compact"
                              :model-value="
                                columnFilters[header.key]?.type === 'multi' &&
                                columnFilters[header.key]?.values?.includes(value)
                              "
                              @click.stop="toggleMultiSelectValue(header.key, value)"
                            />
                          </template>
                          <v-list-item-title>
                            {{ formatFilterValue(header.key, value) }}
                          </v-list-item-title>
                        </v-list-item>

                        <v-divider />

                        <!-- CUSTOM FILTER -->
                        <v-list-item @click.stop="openCustomFilter(header.key)">
                          <v-list-item-title class="custom-filter-item">
                            (Custom Filter…)
                          </v-list-item-title>
                        </v-list-item>
                      </v-list>
                    </v-menu>
                  </div>

                  <div class="resizer" @mousedown.stop="onResizeStart($event, header)"></div>
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
            v-for="header in tableHeaders.filter((h) => h.key !== 'data-table-expand')"
            #[`item.${header.key}`]="{ item }"
            :key="header.key"
          >
            <td :class="getRowTextColor(item)">
              <template
                v-if="
                  header.key === 'tanggal' || header.key === 'tempo' || header.key === 'tanggalSO'
                "
              >
                {{ item[header.key] ? format(new Date(item[header.key]), "dd/MM/yyyy") : "-" }}
              </template>

              <template v-else-if="header.key === 'nominal'">
                {{ formatRupiah(item.nominal) }}
              </template>

              <template v-else-if="header.key === 'diskon'">
                {{ formatRupiah(item.diskon) }}
              </template>

              <template v-else-if="header.key === 'status'">
                <v-chip :color="getStatusChip(item).color" variant="tonal" size="x-small">
                  {{ getStatusChip(item).text }}
                </v-chip>
              </template>
              <template v-else-if="header.key === 'dateModified'">
                {{
                  item.dateModified
                    ? format(new Date(item.dateModified), "dd/MM/yyyy HH:mm:ss")
                    : "-"
                }}
              </template>

              <template v-else-if="header.key === 'userModified'">
                {{ item.userModified || "-" }}
              </template>
              <template v-else>
                {{ item[header.key] }}
              </template>
            </td>
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length" class="pa-0">
                <div class="detail-container">
                  <div class="detail-table-wrapper elevation-1">
                    <div v-if="loadingDetails.has(item.nomor)" class="text-center py-4">
                      <v-progress-circular indeterminate color="primary" />
                    </div>

                    <v-data-table
                      v-else-if="details[item.nomor]?.length"
                      :headers="detailHeaders"
                      :items="details[item.nomor]"
                      density="compact"
                      hide-default-footer
                      class="detail-table"
                    >
                      <template #[`item.Nama`]="{ value, item: detailItem }">
                        <span
                          :class="
                            detailItem.kode === 'CUSTOM' ? 'font-weight-bold text-primary' : ''
                          "
                        >
                          {{ value }}
                        </span>
                      </template>

                      <template #[`item.ukuran`]="{ value }">
                        <span class="text-uppercase">{{ value || "-" }}</span>
                      </template>

                      <template #[`item.harga`]="{ value }">{{ formatRupiah(value) }}</template>
                      <template #[`item.diskon`]="{ value }">{{ formatRupiah(value) }}</template>
                      <template #[`item.total`]="{ value }">{{ formatRupiah(value) }}</template>
                    </v-data-table>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </AppDataTable>
      </div>
    </div>

    <v-dialog v-model="isCloseDialogVisible" max-width="500px" persistent>
      <v-card>
        <v-card-title>
          <span class="text-h5">Isi Alasan Close Penawaran</span>
        </v-card-title>
        <v-card-text>
          <v-textarea
            v-model="closeReason"
            label="Alasan"
            rows="3"
            variant="outlined"
            autofocus
            :rules="[(v) => !!v || 'Alasan tidak boleh kosong']"
          ></v-textarea>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn text @click="isCloseDialogVisible = false">Batal</v-btn>
          <v-btn color="blue" :loading="isClosing" @click="submitCloseOffer">Simpan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="customFilterDialog" max-width="350px">
      <v-card>
        <v-card-title class="text-h6"> Custom Filter — {{ customFilter.key }} </v-card-title>

        <v-card-text>
          <v-select
            v-model="customFilter.operator"
            :items="[
              { title: '= sama dengan', value: '=' },
              { title: '≠ tidak sama', value: '!=' },
              { title: '> lebih besar', value: '>' },
              { title: '≥ lebih besar sama', value: '>=' },
              { title: '< lebih kecil', value: '<' },
              { title: '≤ lebih kecil sama', value: '<=' },
              { title: 'contains', value: 'contains' },
              { title: 'starts with', value: 'starts' },
              { title: 'ends with', value: 'ends' },
            ]"
            label="Operator"
            density="compact"
          />

          <v-text-field v-model="customFilter.value" label="Value" density="compact" autofocus />
        </v-card-text>

        <v-card-actions>
          <v-spacer />
          <v-btn text @click="customFilterDialog = false">Cancel</v-btn>
          <v-btn color="primary" @click="applyCustomFilter">OK</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
:deep(.compact-select-list .v-list-item-title) {
  font-size: 11px !important;
}

/* Warna Teks Status */
.desktop-table :deep(td.text-red) {
  color: #d32f2f !important;
  /* Merah Material Design */
}

.desktop-table :deep(td.text-blue) {
  color: #1976d2 !important;
  /* Biru Material Design */
}

.desktop-table :deep(tr:hover td.text-red) {
  background-color: #ffebee !important;
  /* Merah sangat muda */
}

/* --- Layout Baru (Mirip InvoiceBrowse) --- */

/* 1. Container Utama Full Height */
.browse-content {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 64px - 32px);
  overflow: hidden;
}

/* Filter section — kompak 11px */
.filter-section {
  flex-shrink: 0;
  display: flex; /* ← wajib ada */
  align-items: center;
  padding: 5px 10px;
  gap: 8px;
  flex-wrap: nowrap;
  background-color: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.filter-section :deep(.v-field) {
  font-size: 11px !important;
  min-height: 28px !important;
  height: 28px !important;
}

.filter-section :deep(.v-field__input) {
  font-size: 11px !important;
  min-height: 28px !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}

.filter-section :deep(.v-label) {
  font-size: 11px !important;
}

.filter-section :deep(input[type="date"]) {
  font-size: 11px !important;
  padding: 0 !important;
}

.filter-section :deep(.v-select__selection-text) {
  font-size: 11px !important;
}

.filter-section :deep(.v-field__append-inner .v-icon),
.filter-section :deep(.v-field__prepend-inner .v-icon) {
  font-size: 14px !important;
}

.filter-section :deep(input[type="date"]) {
  font-size: 11px !important;
  padding: 0 !important;
  text-align: center !important;
  width: 100% !important;
}

.filter-section :deep(.v-field__input) {
  justify-content: center !important;
}

.filter-label {
  color: rgba(var(--v-theme-on-surface), 0.7);
  font-weight: 600;
  font-size: 11px;
}

/* 3. Table Container (Flex Grow) */
.table-container {
  flex-grow: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 4. Sticky Footer Summary (Jika ada, di sini OfferView belum pakai summary, tapi siap) */
.footer-summary {
  flex-shrink: 0;
  z-index: 10;
}

/* --- Styling Table Scrollbar & Full Height --- */
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

/* --- Styling Header Resize --- */
.resizable-header {
  position: relative;
  background-color: var(--table-head-bg) !important;
  color: var(--table-head-text) !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 40px !important;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity)) !important;
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
  border-right: 2px solid #1565c0;
}

/* --- Styling Detail Row Sticky --- */
.detail-container {
  position: sticky;
  left: 0;
  z-index: 2;
  display: flex;
  justify-content: flex-start;
  align-items: flex-start;
  /* Mengikuti warna background tema */
  background-color: rgb(var(--v-theme-background));
  padding: 16px 16px 16px 64px;
  /* Gunakan border berbasis tema agar tidak terlalu kontras di dark mode */
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  width: fit-content;
  min-width: 100%;
  box-sizing: border-box;
}

.detail-table-wrapper {
  width: 100%;
  max-width: 900px;
  /* Gunakan border berbasis tema */
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 4px;
  overflow: hidden;
  background-color: rgb(var(--v-theme-surface));
}

.detail-table :deep(thead tr th) {
  /* Gunakan surface-variant untuk background header detail */
  background-color: rgb(var(--v-theme-surface-variant)) !important;
  /* [PERBAIKAN] Gunakan variabel on-surface-variant agar warna teks adaptif (terang di dark mode) */
  color: rgb(var(--v-theme-on-surface-variant)) !important;
  font-size: 10px !important;
  font-weight: bold !important;
  height: 32px !important;
  text-transform: uppercase;
}

/* Tambahkan ini agar border antar sel di detail table terlihat di dark mode */
.detail-table :deep(td),
.detail-table :deep(th) {
  border-bottom: 1px solid rgba(var(--v-border-color), 0.1) !important;
}

.filter-section .btn-detail {
  height: 36px !important;
  width: auto !important;
  min-width: 120px !important;
  padding: 0 16px !important;
  font-size: 0.875rem !important;
  text-transform: none !important;
  /* supaya tidak kapital semua */
}

.legend-group {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11px;
  white-space: nowrap;
}

.legend-open {
  color: #d32f2f;
  font-weight: 600;
}

.legend-closed {
  color: #1976d2;
  font-weight: 600;
}

/* Reset filter button — lebih kecil */
.reset-filter-btn {
  height: 28px !important;
  min-width: unset !important;
  padding: 0 10px !important;
  font-size: 11px !important;
}

.reset-filter-btn:hover {
  background-color: rgba(211, 47, 47, 0.25) !important;
}
</style>
