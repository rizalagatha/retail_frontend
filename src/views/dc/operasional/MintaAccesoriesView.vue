<script setup lang="ts">
import { ref, onMounted, computed, watch, reactive } from "vue";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { useRouter, useRoute, onBeforeRouteLeave } from "vue-router";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import axios from "axios";

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

interface AccesoriesHeader {
  nomor: string;
  tanggal: string;
  cab: string;
  keterangan: string;
  usr: string;
  status: string;
  approve: string;
  alasanClose: string;
  created: string;
  [key: string]: unknown;
}

interface AccesoriesDetail {
  nomor: string;
  kode: string;
  nama: string;
  satuan: string;
  jumlah: number;
  realisasi: number;
  keterangan: string;
  [key: string]: unknown;
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

interface RealisasiItem {
  nomor: string;
  tanggal: string;
  approve: string;
  jumlah: number;
  ket: string;
  [key: string]: unknown;
}

interface RealisasiDetailItem {
  realisasi_nomor: string;
  kode: string;
  nama: string;
  satuan: string;
  jumlah: number;
}

interface DetailPayload {
  realisasi: RealisasiItem[];
  items: AccesoriesDetail[];
  realisasiDetails: RealisasiDetailItem[]; // [BARU]
}

// --- State ---
const toast = useToast();
const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();
const MENU_ID = "225";

const dataList = ref<AccesoriesHeader[]>([]);
const filterOptions = ref([
  { title: "Nomor", value: "nomor" },
  { title: "Tanggal", value: "tanggal" },
  { title: "Cabang", value: "cab" },
  { title: "Keterangan", value: "keterangan" },
  { title: "User", value: "usr" },
  { title: "Status", value: "status" },
  { title: "Approve", value: "approve" },
]);

const isMounted = ref(false);
const selectedFilterField = ref("nomor"); // Filter default
const filterSearchValue = ref("");
const details = ref<{ [key: string]: DetailPayload }>({});
const isLoading = ref(true);
const expanded = ref<AccesoriesHeader[]>([]);
const selected = ref<AccesoriesHeader[]>([]);
const loadingDetails = ref<Set<string>>(new Set());
const branchList = ref<Branch[]>([]);

const isCloseDialogVisible = ref(false);
const closeReason = ref("");
const isClosing = ref(false);

const isConfirmDialogVisible = ref(false);
const confirmText = ref("");
const pendingAction = ref<(() => void) | null>(null);

const hasViewPermission = computed(() => authStore.can(MENU_ID, "view"));

const selectedRealisasiMap = ref<Record<string, string>>({});

const filters = reactive({
  startDate: format(new Date(), "yyyy-MM-dd"),
  endDate: format(new Date(), "yyyy-MM-dd"),
  cabang: "P03", // Terkunci mati di P03
});

const tableHeaders = ref<DataTableHeader[]>([
  { title: "", key: "data-table-expand", width: 50, fixed: true },
  { title: "Nomor", key: "nomor", width: 150, fixed: true },
  { title: "Tanggal", key: "tanggal", width: 100 },
  { title: "Cabang", key: "cab", width: 100 },
  { title: "Keterangan", key: "keterangan", width: 350 },
  { title: "User", key: "usr", width: 120 },
  { title: "Waktu Input", key: "created", width: 150 },
  { title: "Alasan Close", key: "alasanClose", width: 250 },
  { title: "Approve", key: "approve", align: "center", width: 120 },
  { title: "Status", key: "status", align: "center", width: 120 },
]);

const realisasiHeaders: DataTableHeader[] = [
  { title: "No. Realisasi", key: "nomor", width: 120 },
  { title: "Tgl. Realisasi", key: "tanggal", width: 100 },
  { title: "Approve", key: "approve", width: 100, align: "center" },
  { title: "Jumlah", key: "jumlah", align: "end", width: 80 },
  { title: "Keterangan", key: "ket" },
  { title: "Aksi", key: "actions", width: 90, align: "center" }, // [BARU] Kolom Aksi
];

const detailHeaders: DataTableHeader[] = [
  { title: "KODE", key: "kode", width: 120 },
  { title: "NAMA BARANG", key: "nama", minWidth: "200px" },
  { title: "SATUAN", key: "satuan", width: 80, align: "center" },
  { title: "NOTE", key: "note", minWidth: "150px" },
  { title: "JUMLAH", key: "jumlah", align: "end", width: 90 },
  { title: "REALISASI", key: "realisasi", align: "end", width: 90 },
  { title: "KETERANGAN", key: "keterangan", minWidth: "150px" },
];

const detailRealisasiHeaders: DataTableHeader[] = [
  { title: "No.", key: "index", width: 50, align: "center" },
  { title: "KODE", key: "kode", width: 100 },
  { title: "NAMA BARANG", key: "nama" },
  { title: "SATUAN", key: "satuan", width: 80, align: "center" },
  { title: "JUMLAH", key: "jumlah", align: "end", width: 80 },
];

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
const LS_FILTER_KEY = "minta_acc_table_filters";
const SESSION_STATE_KEY = "minta_acc_browse_state";

// load existing filter
const saved = localStorage.getItem(LS_FILTER_KEY);
if (saved) {
  try {
    columnFilters.value = JSON.parse(saved);
  } catch {}
}

const uniqueValues = (key: string): string[] => {
  const set = new Set(
    dataList.value
      .map((r) => String(r[key]))
      .filter((v) => v !== "null" && v !== "undefined" && v !== "")
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
  filterSearchValue.value = "";
  sessionStorage.removeItem(SESSION_STATE_KEY);

  if (route.query.status || route.query.startDate) {
    router.replace({ query: {} });
  }

  if (isMounted.value && hasViewPermission.value) {
    fetchData();
  }
};

const noFilterColumns = ["data-table-select", "data-table-expand"];

const formatFilterValue = (key: string, val: string | number | undefined | null): string => {
  if (["tanggal", "created"].includes(key)) {
    if (!val) return "-";
    if (typeof val === "string" || typeof val === "number") {
      try {
        return format(new Date(val), "dd/MM/yyyy");
      } catch {
        return String(val);
      }
    }
  }
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
  const item = selected.value[0];
  return item.status === "OPEN";
});

const canBeDeleted = computed(() => {
  if (!isSingleSelected.value) return false;
  const item = selected.value[0];
  return item.status === "OPEN";
});

const filteredItems = computed(() => {
  let data = [...dataList.value];

  // 1) FILTER HEADER (MULTI & CUSTOM)
  for (const key in columnFilters.value) {
    const f = columnFilters.value[key];

    if (f.type === "multi" && f.values) {
      data = data.filter((r) => f.values!.includes(r[key] as string | number));
      continue;
    }

    if (f.type === "custom" && f.operator) {
      const cmp = String(f.value).toLowerCase();

      data = data.filter((row) => {
        const v = row[key];
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

  // 2) GLOBAL SEARCH
  if (filterSearchValue.value) {
    const key = selectedFilterField.value;
    const term = filterSearchValue.value.toLowerCase();

    data = data.filter((r) =>
      String(r[key] ?? "")
        .toLowerCase()
        .includes(term)
    );
  }

  return data;
});

// --- Methods ---

const selectRealisasiRow = (masterNomor: string, realisasiNomor: string) => {
  selectedRealisasiMap.value[masterNomor] = realisasiNomor;
};

const handleRowClick = (_event: Event, { item }: { item: AccesoriesHeader }) => {
  selected.value = [item];
};

const fetchBranches = async () => {
  try {
    const response = await api.get("/warehouses/list", {
      params: { userCabang: authStore.user?.cabang },
    });
    let data = response.data;
    if (authStore.user?.cabang === "KDC") {
      data = [{ kode: "ALL", nama: "ALL STORE" }, ...data];
    }
    branchList.value = data;
  } catch (error) {
    toast.error("Gagal memuat daftar cabang.", error);
  }
};

const fetchData = async () => {
  isLoading.value = true;
  try {
    const response = await api.get("/minta-accesories", {
      params: {
        startDate: filters.startDate,
        endDate: filters.endDate,
        cabang: filters.cabang,
      },
    });
    dataList.value = response.data;
  } catch (error) {
    toast.error("Gagal memuat data permintaan.", error);
  } finally {
    isLoading.value = false;
  }
};

const loadDetails = async (expandedItems: AccesoriesHeader[]) => {
  const expandedNomors = expandedItems.map((item) => item.nomor);

  for (const nomor of expandedNomors) {
    if (!details.value[nomor] && !loadingDetails.value.has(nomor)) {
      loadingDetails.value.add(nomor);
      try {
        const url = `/minta-accesories/${nomor}/details`;
        const response = await api.get(url);
        details.value = {
          ...details.value,
          [nomor]: response.data,
        };

        // Otomatis klik/pilih realisasi pertama agar tabel 3 tidak kosong
        if (response.data.realisasi && response.data.realisasi.length > 0) {
          selectedRealisasiMap.value[nomor] = response.data.realisasi[0].nomor;
        }
      } catch (error) {
        toast.error(`Gagal memuat detail untuk nomor ${nomor}`, error);
        expanded.value = expanded.value.filter((item) =>
          typeof item === "string" ? item !== nomor : item.nomor !== nomor
        );
      } finally {
        loadingDetails.value.delete(nomor);
      }
    }
  }
};

const editItem = () => {
  if (!isSingleSelected.value) return;
  const nomor = selected.value[0].nomor;
  router.push(`/gudang-dc/operasional/minta-accesories/ubah/${nomor}`);
};

const confirmDelete = () => {
  if (!canBeDeleted.value) return;
  showConfirmation(
    executeDelete,
    `Anda yakin ingin menghapus permintaan ${selected.value[0].nomor}?`
  );
};

const executeDelete = async () => {
  const nomor = selected.value[0].nomor;
  try {
    await api.delete(`/minta-accesories/${nomor}`);
    toast.success("Permintaan berhasil dihapus.");
    fetchData();
    selected.value = [];
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      toast.error(error.response?.data?.message || "Gagal menghapus data.");
    } else {
      toast.error("Gagal menghapus data.");
    }
  }
};

const openCloseDialog = () => {
  if (!canBeClosed.value) return;
  closeReason.value = "";
  isCloseDialogVisible.value = true;
};

const submitCloseManual = async () => {
  if (!closeReason.value) {
    toast.error("Alasan harus diisi.");
    return;
  }
  isClosing.value = true;
  try {
    const nomor = selected.value[0].nomor;
    await api.put(`/minta-accesories/${nomor}/close-manual`, {
      alasan: closeReason.value,
    });
    toast.success("Permintaan berhasil di-close manual.");
    isCloseDialogVisible.value = false;
    fetchData();
    selected.value = [];
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      toast.error(error.response?.data?.message || "Gagal menutup permintaan.");
    } else {
      toast.error("Gagal menutup permintaan.");
    }
  } finally {
    isClosing.value = false;
  }
};

const handleCreate = async () => {
  try {
    // Panggil API untuk cek tunggakan approve
    const response = await api.get("/minta-accesories/check-unapproved");

    if (response.data.count > 0) {
      toast.warning(
        "Permintaanmu ada yang belum di-approve > 1 hari.\nSilakan di-approve dulu supaya bisa membuat permintaan baru."
      );
      return;
    }

    // Jika tidak ada tunggakan, lanjut ke halaman create
    router.push("/gudang-dc/operasional/minta-accesories/new");
  } catch (error) {
    toast.error("Gagal mengecek status approve realisasi.", error);
  }
};

const approveRealisasi = async (prominNomor: string, mintaNomor: string) => {
  showConfirmation(async () => {
    try {
      await api.put(`/minta-accesories/realisasi/${prominNomor}/approve`);
      toast.success("Berhasil di-approve!");

      // [PERBAIKAN] Gunakan dataList dan .nomor
      const itemToReload = dataList.value.find((i) => i.nomor === mintaNomor);
      if (itemToReload) {
        loadingDetails.value.delete(mintaNomor);
        await loadDetails([itemToReload]);
      }

      fetchData(); // Refresh master table
    } catch (error) {
      toast.error("Gagal melakukan approve.", error);
    }
  }, "Yakin ingin melakukan Approve (Penerimaan) untuk realisasi ini?");
};

const showConfirmation = (action: () => void, text: string) => {
  pendingAction.value = action;
  confirmText.value = text;
  isConfirmDialogVisible.value = true;
};

const executePendingAction = () => {
  if (pendingAction.value) pendingAction.value();
  isConfirmDialogVisible.value = false;
};

const closeConfirmDialog = () => {
  isConfirmDialogVisible.value = false;
  pendingAction.value = null;
};

const formatDateIndo = (dateString: string | Date) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
};

const exportHeaderData = () => {
  if (dataList.value.length === 0) {
    toast.warning("Tidak ada data header untuk diekspor.");
    return;
  }
  const formattedData = dataList.value.map((item: AccesoriesHeader) => ({
    ...item,
    tanggal: item.tanggal ? formatDateIndo(item.tanggal) : "",
    created: item.created ? format(new Date(item.created), "dd/MM/yyyy HH:mm:ss") : "",
  }));

  const worksheet = XLSX.utils.json_to_sheet(formattedData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Header Permintaan");
  XLSX.writeFile(workbook, "Daftar_MintaAccesories_Header.xlsx");
  toast.success("Data header berhasil diekspor.");
};

const exportDetailData = async () => {
  toast.info("Menyiapkan data detail untuk diekspor...");
  try {
    const cabang = filters.cabang;
    const response = await api.get<AccesoriesDetail[]>("/minta-accesories/export-details", {
      params: {
        startDate: filters.startDate,
        endDate: filters.endDate,
        cabang,
      },
    });

    const dataToExport = response.data.map((row: AccesoriesDetail) => ({
      ...row,
      tanggal: row.tanggal ? formatDateIndo(String(row.tanggal)) : "",
    }));

    if (dataToExport.length === 0) {
      toast.warning("Tidak ada data detail untuk diekspor pada periode ini.");
      return;
    }

    const title = "LAPORAN KEBUTUHAN ACCESORIES";
    const dateRange = `Periode : ${formatDateIndo(filters.startDate)} s/d ${formatDateIndo(
      filters.endDate
    )}`;
    const tableHeadersExcel = Object.keys(dataToExport[0]);
    const tableData = dataToExport.map((row) => Object.values(row));

    const excelData = [[title], [dateRange], [], tableHeadersExcel, ...tableData];

    const ws = XLSX.utils.aoa_to_sheet(excelData);
    const merge = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: tableHeadersExcel.length - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: tableHeadersExcel.length - 1 } },
    ];
    ws["!merges"] = merge;
    const colWidths = tableHeadersExcel.map((header) => ({ wch: header.length + 5 }));
    ws["!cols"] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, ws, "Detail Permintaan");

    XLSX.writeFile(workbook, "Detail_MintaAccesories.xlsx");
    toast.success("Data detail berhasil diekspor.");
  } catch (error) {
    toast.error("Gagal mengekspor data detail.", error);
  }
};

const printItem = () => {
  if (!isSingleSelected.value) return;
  const nomor = selected.value[0].nomor;
  const url = router.resolve({
    name: "MintaAccesoriesPrint",
    params: { nomor },
  }).href;
  window.open(url, "_blank");
};

const getRowTextColor = (item: AccesoriesHeader) => {
  if (item.status === "OPEN") return "text-red font-weight-bold";
  if (item.status === "ONPROSES") return "text-blue font-weight-bold";
  if (item.status === "DICLOSE") return "text-grey font-italic";
  return "";
};

const getStatusChip = (item: AccesoriesHeader) => {
  if (item.status === "CLOSE") return { text: "CLOSE", color: "success" };
  if (item.status === "DICLOSE") return { text: "DICLOSE", color: "grey-darken-1" };
  if (item.status === "ONPROSES") return { text: "ONPROSES", color: "primary" };
  return { text: "OPEN", color: "error" };
};

const getApproveChip = (approveStat: string) => {
  if (approveStat === "Y") return { text: "APPROVED", color: "success" };
  if (approveStat === "N") return { text: "WAITING", color: "warning" };
  return { text: "-", color: "grey" };
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
    const savedState = sessionStorage.getItem(SESSION_STATE_KEY);

    if (savedState) {
      try {
        const parsedState = JSON.parse(savedState);
        if (parsedState.filters) {
          // Timpa semua KECUALI cabang
          filters.startDate = parsedState.filters.startDate || filters.startDate;
          filters.endDate = parsedState.filters.endDate || filters.endDate;
        }
        if (parsedState.selectedFilterField)
          selectedFilterField.value = parsedState.selectedFilterField;
        if (parsedState.filterSearchValue) filterSearchValue.value = parsedState.filterSearchValue;
      } catch {
        // Abaikan error parsing JSON
      }
    } else {
      const queryStartDate = route.query.startDate as string;
      const queryEndDate = route.query.endDate as string;
      if (queryStartDate && queryEndDate) {
        filters.startDate = queryStartDate;
        filters.endDate = queryEndDate;
      }
    }

    await fetchBranches();
    await fetchData();
    isMounted.value = true;
  } else {
    isLoading.value = false;
    toast.error("Anda tidak memiliki izin untuk melihat halaman ini.");
  }
});

watch(
  expanded,
  (newExpanded) => {
    if (newExpanded.length > 0) loadDetails(newExpanded);
  },
  { deep: true }
);

watch(
  filters,
  () => {
    saveStateToSession();
    if (isMounted.value && hasViewPermission.value) fetchData();
  },
  { deep: true }
);

watch(
  columnFilters,
  (val) => {
    localStorage.setItem(LS_FILTER_KEY, JSON.stringify(val));
  },
  { deep: true }
);

watch([filterSearchValue, selectedFilterField], () => {
  saveStateToSession();
});

onBeforeRouteLeave((to, from, next) => {
  const isRelatedPage = to.path.includes("/minta-accesories");
  if (!isRelatedPage) sessionStorage.removeItem(SESSION_STATE_KEY);
  next();
});
</script>

<template>
  <PageLayout title="Permintaan Kebutuhan Kaosan">
    <template #header-actions>
      <v-btn
        v-if="authStore.can(MENU_ID, 'insert')"
        size="small"
        color="primary"
        prepend-icon="mdi-plus"
        @click="handleCreate"
        >Baru</v-btn
      >
      <v-btn
        v-if="authStore.can(MENU_ID, 'edit')"
        size="small"
        :disabled="!isSingleSelected"
        prepend-icon="mdi-pencil"
        @click="editItem"
        >Ubah</v-btn
      >
      <v-btn
        v-if="authStore.can(MENU_ID, 'delete')"
        size="small"
        color="error"
        :disabled="!canBeDeleted"
        prepend-icon="mdi-delete"
        @click="confirmDelete"
        >Hapus</v-btn
      >

      <v-btn
        size="small"
        color="green"
        prepend-icon="mdi-printer"
        @click="printItem"
        :disabled="!isSingleSelected"
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
        >Close Manual</v-btn
      >
    </template>

    <div v-if="!hasViewPermission" class="text-center pa-8 text-grey">
      <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
      <h3 class="text-h6">Akses Ditolak</h3>
      <p class="body-1 mt-2">Anda tidak memiliki izin untuk melihat data ini.</p>
    </div>

    <div v-else class="browse-content">
      <div class="filter-section">
        <div class="d-flex align-center ga-2">
          <span class="filter-label">Periode:</span>
          <v-text-field
            v-model="filters.startDate"
            type="date"
            density="compact"
            hide-details
            variant="outlined"
            style="min-width: 130px"
          ></v-text-field>
          <span>s/d</span>
          <v-text-field
            v-model="filters.endDate"
            type="date"
            density="compact"
            hide-details
            variant="outlined"
            style="min-width: 130px"
          ></v-text-field>
        </div>
        <div class="d-flex align-center ga-2" style="min-width: 220px">
          <span class="filter-label">Cabang:</span>
          <v-text-field
            model-value="P03"
            density="compact"
            hide-details
            variant="filled"
            style="max-width: 100px"
            readonly
          ></v-text-field>
        </div>
        <v-divider vertical class="mx-2"></v-divider>
        <div class="d-flex align-center ga-2">
          <v-select
            v-model="selectedFilterField"
            :items="filterOptions"
            label="Filter Berdasarkan"
            density="compact"
            hide-details
            variant="outlined"
            style="max-width: 180px"
          ></v-select>
          <v-text-field
            v-model="filterSearchValue"
            label="Cari..."
            density="compact"
            hide-details
            variant="outlined"
            style="min-width: 250px"
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
        <div class="d-flex align-center ga-2 text-caption font-weight-bold">
          <v-icon color="red" icon="mdi-square-rounded" size="small"></v-icon> OPEN
          <v-icon color="blue" icon="mdi-square-rounded" size="small"></v-icon> ONPROSES
          <v-icon color="grey-darken-1" icon="mdi-square-rounded" size="small"></v-icon> CLOSE
        </div>
        <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small"></v-btn>
      </div>

      <div class="table-container">
        <AppDataTable
          v-model="selected"
          :headers="tableHeaders"
          :items="filteredItems"
          :loading="isLoading"
          item-value="nomor"
          density="compact"
          class="desktop-table header-browse-blue"
          fixed-header
          show-select
          return-object
          @update:expanded="loadDetails"
          @click:row="handleRowClick"
          :item-props="(item) => ({ class: getRowTextColor(item) })"
        >
          <template #headers="{ columns, isSorted, getSortIcon, toggleSort }">
            <tr>
              <template v-for="header in columns" :key="header.key">
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
                    <span>{{ header.title }}</span>

                    <v-icon v-if="isSorted(header)" size="14" class="ms-1">
                      {{ getSortIcon(header) }}
                    </v-icon>

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
              <template v-if="header.key === 'tanggal'">
                {{ item.tanggal ? format(new Date(item.tanggal), "dd/MM/yyyy") : "-" }}
              </template>

              <template v-else-if="header.key === 'created'">
                {{ item.created ? format(new Date(item.created), "dd/MM/yyyy HH:mm:ss") : "-" }}
              </template>

              <template v-else-if="header.key === 'status'">
                <v-chip :color="getStatusChip(item).color" variant="tonal" size="x-small">
                  {{ getStatusChip(item).text }}
                </v-chip>
              </template>

              <template v-else-if="header.key === 'approve'">
                <v-chip
                  :color="getApproveChip(item.approve).color"
                  variant="outlined"
                  size="x-small"
                >
                  {{ getApproveChip(item.approve).text }}
                </v-chip>
              </template>

              <template v-else>
                {{ item[header.key] }}
              </template>
            </td>
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length" class="pa-0">
                <div
                  class="bg-blue-grey-lighten-5 pa-3 w-100"
                  style="box-shadow: inset 0px 4px 8px -4px rgba(0, 0, 0, 0.1)"
                >
                  <div v-if="loadingDetails.has(item.nomor)" class="text-center py-4 w-100">
                    <v-progress-circular indeterminate color="primary" />
                  </div>

                  <div v-else class="d-flex flex-column ga-3 w-100">
                    <v-card class="elevation-1 border" rounded="lg">
                      <div
                        class="bg-blue-darken-2 text-white text-caption font-weight-bold px-3 py-1 d-flex align-center"
                      >
                        Detail Data (Permintaan)
                      </div>
                      <v-data-table
                        :headers="detailHeaders"
                        :items="details[item.nomor]?.items || []"
                        density="compact"
                        hide-default-footer
                        class="detail-table"
                      >
                        <template #[`item.jumlah`]="{ value }">
                          <span class="font-weight-bold">{{ value }}</span>
                        </template>

                        <template #[`item.realisasi`]="{ value, item: dtl }">
                          <span
                            class="font-weight-bold"
                            :class="value >= dtl.jumlah ? 'text-success' : 'text-orange-darken-3'"
                          >
                            {{ value }}
                          </span>
                        </template>
                      </v-data-table>
                    </v-card>

                    <v-row
                      v-if="details[item.nomor]?.realisasi?.length > 0"
                      dense
                      class="w-100 ma-0"
                    >
                      <v-col cols="12" md="6" class="pa-1 pl-0">
                        <v-card class="elevation-1 border h-100" rounded="lg">
                          <div
                            class="bg-indigo-darken-1 text-white text-caption font-weight-bold px-3 py-1 d-flex align-center justify-space-between"
                          >
                            <span>Realisasi : F7 = Approve</span>
                          </div>
                          <v-data-table
                            :headers="realisasiHeaders"
                            :items="details[item.nomor]?.realisasi || []"
                            density="compact"
                            hide-default-footer
                            class="detail-table"
                            hover
                            @click:row="
                              (_, { item: rowItem }) =>
                                selectRealisasiRow(item.nomor, rowItem.nomor)
                            "
                            :item-props="
                              (rowItem) => ({
                                class:
                                  selectedRealisasiMap[item.nomor] === rowItem.nomor
                                    ? 'bg-blue-lighten-5 font-weight-bold'
                                    : 'cursor-pointer',
                              })
                            "
                          >
                            <template #[`item.jumlah`]="{ value }">
                              <span class="text-red font-weight-bold">{{ value }}</span>
                            </template>
                            <template #[`item.actions`]="{ item: dtl }">
                              <v-btn
                                v-if="!dtl.approve"
                                size="x-small"
                                color="success"
                                variant="flat"
                                @click.stop="approveRealisasi(dtl.nomor, item.nomor)"
                              >
                                Approve
                              </v-btn>
                              <div v-else class="text-success font-weight-bold">
                                {{ dtl.approve }}
                              </div>
                            </template>
                          </v-data-table>
                        </v-card>
                      </v-col>

                      <v-col cols="12" md="6" class="pa-1 pr-0">
                        <v-card class="elevation-1 border h-100" rounded="lg">
                          <div
                            class="bg-grey-darken-2 text-white text-caption font-weight-bold px-3 py-1 d-flex align-center"
                          >
                            Isi Barang ({{ selectedRealisasiMap[item.nomor] || "Pilih Realisasi" }})
                          </div>
                          <v-data-table
                            :headers="detailRealisasiHeaders"
                            :items="
                              (details[item.nomor]?.realisasiDetails || []).filter(
                                (d) => d.realisasi_nomor === selectedRealisasiMap[item.nomor]
                              )
                            "
                            density="compact"
                            hide-default-footer
                            class="detail-table"
                          >
                            <template #[`item.index`]="{ index }">
                              {{ index + 1 }}
                            </template>
                            <template #[`item.jumlah`]="{ value }">
                              <span class="font-weight-bold">{{ value }}</span>
                            </template>
                          </v-data-table>
                        </v-card>
                      </v-col>
                    </v-row>

                    <v-alert
                      v-else
                      type="info"
                      variant="tonal"
                      density="compact"
                      class="text-caption"
                    >
                      Belum ada data realisasi dari pihak Garment/Produksi.
                    </v-alert>
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
        <v-card-title class="bg-blue text-white">
          <span class="text-h6">Close Manual Permintaan</span>
        </v-card-title>
        <v-card-text class="pt-4">
          <p class="text-caption text-grey-darken-1 mb-2">
            Menutup permintaan secara manual akan merubah status menjadi
            <strong>DICLOSE</strong> meskipun barang belum terealisasi sepenuhnya.
          </p>
          <v-textarea
            v-model="closeReason"
            label="Alasan Close Manual"
            rows="3"
            variant="outlined"
            autofocus
            :rules="[(v) => !!v || 'Alasan tidak boleh kosong']"
          ></v-textarea>
        </v-card-text>
        <v-card-actions class="pa-4">
          <v-spacer></v-spacer>
          <v-btn variant="text" @click="isCloseDialogVisible = false">Batal</v-btn>
          <v-btn color="blue" variant="flat" :loading="isClosing" @click="submitCloseManual"
            >Simpan</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="isConfirmDialogVisible" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold bg-error text-white">
          Konfirmasi Hapus
        </v-card-title>
        <v-card-text class="pt-4">
          {{ confirmText }}
        </v-card-text>
        <v-card-actions class="pa-4">
          <v-spacer></v-spacer>
          <v-btn color="grey-darken-1" variant="text" @click="closeConfirmDialog">Tidak</v-btn>
          <v-btn color="error" variant="flat" @click="executePendingAction">Ya, Hapus</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="customFilterDialog" max-width="350px">
      <v-card>
        <v-card-title class="text-h6 bg-primary text-white">
          Filter Kolom: {{ customFilter.key }}
        </v-card-title>
        <v-card-text class="pt-4">
          <v-select
            v-model="customFilter.operator"
            :items="[
              { title: '= sama dengan', value: '=' },
              { title: '≠ tidak sama', value: '!=' },
              { title: '> lebih besar', value: '>' },
              { title: '≥ lebih besar sama', value: '>=' },
              { title: '< lebih kecil', value: '<' },
              { title: '≤ lebih kecil sama', value: '<=' },
              { title: 'mengandung kata (contains)', value: 'contains' },
              { title: 'berawalan (starts with)', value: 'starts' },
              { title: 'berakhiran (ends with)', value: 'ends' },
            ]"
            label="Operator"
            density="compact"
            variant="outlined"
            class="mb-3"
          />
          <v-text-field
            v-model="customFilter.value"
            label="Nilai / Teks"
            density="compact"
            variant="outlined"
            autofocus
            @keydown.enter="applyCustomFilter"
          />
        </v-card-text>
        <v-card-actions class="pa-4">
          <v-spacer />
          <v-btn text @click="customFilterDialog = false">Batal</v-btn>
          <v-btn color="primary" variant="flat" @click="applyCustomFilter">Terapkan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
:deep(.compact-select-list .v-list-item-title) {
  font-size: 11px !important;
}

.desktop-table :deep(td.text-red) {
  color: #d32f2f !important;
}

.desktop-table :deep(td.text-blue) {
  color: #1976d2 !important;
}

.desktop-table :deep(tr:hover td.text-red) {
  background-color: #ffebee !important;
}

/* --- Layout Baru --- */
.browse-content {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 64px - 32px);
  overflow: hidden;
}

.filter-section {
  flex-shrink: 0;
  padding: 8px;
  background-color: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  color: rgb(var(--v-theme-on-surface));
  display: flex;
  align-items: center;
  gap: 12px;
}

.filter-section :deep(.v-field) {
  background-color: rgb(var(--v-theme-background)) !important;
  color: rgb(var(--v-theme-on-surface));
}

.filter-section :deep(input) {
  color: rgb(var(--v-theme-on-surface));
}

.filter-label {
  color: rgba(var(--v-theme-on-surface), 0.7);
  font-weight: 600;
  font-size: 11px;
}

.table-container {
  flex-grow: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

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
  background-color: rgb(var(--v-theme-background));
  padding: 16px 16px 16px 64px;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  width: fit-content;
  min-width: 100%;
  box-sizing: border-box;
}

.detail-table-wrapper {
  width: 100%;
  max-width: 900px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 4px;
  overflow: hidden;
  background-color: rgb(var(--v-theme-surface));
}

.detail-table :deep(thead tr th) {
  background-color: rgb(var(--v-theme-surface-variant)) !important;
  color: rgb(var(--v-theme-on-surface-variant)) !important;
  font-size: 10px !important;
  font-weight: bold !important;
  height: 32px !important;
  text-transform: uppercase;
}

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
}

.reset-filter-btn {
  color: #d32f2f !important;
  background-color: rgba(211, 47, 47, 0.15) !important;
}

.reset-filter-btn:hover {
  background-color: rgba(211, 47, 47, 0.25) !important;
}
</style>
