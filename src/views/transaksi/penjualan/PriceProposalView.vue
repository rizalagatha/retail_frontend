<script setup lang="ts">
import { ref, onMounted, watch, computed } from "vue";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { format } from "date-fns";
import { useRouter, useRoute, onBeforeRouteLeave } from "vue-router";
import AppDataTable from "@/components/AppDataTable.vue";
import type { AxiosError } from "axios";
import { formatRupiah } from "@/utils/formatRupiah";

const toast = useToast();
const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();
const MENU_ID = "38";

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

interface PriceProposal {
  nomor: string;
  tanggal: string;
  kdcus: string;
  customer: string;
  jenisKaos: string;
  keterangan: string;
  approval: string;
  status: string;
  statusUpdated: string | null;
  refSoSpk: string | null; // [BARU]
  cabang: string;
  created: string;
  kodeBarangDraft: string | null; // [BARU]
  kodeBarangFinal: string | null; // [BARU]
  ketersediaan: "Stok" | "Custom" | "Sublim";
  kodeCelanaDraft: string | null;
}

interface SizeDetail {
  ukuran: string;
  qty: number;
  harga: number;
  nama: string;
}

interface CabangOption {
  kode: string;
  nama: string;
}

// --- Status Label & Color (mirror dari backend STATUS_LABEL) ---
// Catatan: baru DRAFT yang aktif dipakai sekarang, sisanya scaffolding
// buat tahap berikutnya (ACC_CUSTOMER, ACC_FINANCE, dst) yang dikerjakan bertahap.
const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  LEGACY_APPROVED: "Disetujui (Data Lama)",
  ACC_CUSTOMER: "Acc Customer",
  ACC_FINANCE: "Acc Finance",
  MENUNGGU_DC: "Menunggu Validasi DC",
  ACC_DC: "Acc DC",
  PRODUKSI: "Produksi",
  BARANG_DITERIMA_DC: "Barang Diterima DC",
  READY_STORE: "Ready Store",
  CLOSED: "Closed",
  REJECTED: "Ditolak",
};

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "grey",
  LEGACY_APPROVED: "blue-grey",
  ACC_CUSTOMER: "blue",
  ACC_FINANCE: "indigo",
  MENUNGGU_DC: "amber-darken-2",
  ACC_DC: "deep-purple",
  PRODUKSI: "orange",
  BARANG_DITERIMA_DC: "amber",
  READY_STORE: "teal",
  CLOSED: "success",
  REJECTED: "error",
};

const getStatusLabel = (status: string) => STATUS_LABEL[status] || status || "Draft";
const getStatusColor = (status: string) => STATUS_COLOR[status] || "grey";

// --- State ---
const proposals = ref<PriceProposal[]>([]);
const isLoading = ref(true);
const startDate = ref(format(new Date(), "yyyy-MM-dd"));
const endDate = ref(format(new Date(), "yyyy-MM-dd"));
const selectedCabang = ref<string | null>(
  authStore.user?.cabang === "KDC" ? "ALL" : authStore.user?.cabang || null
);
const draftSaja = ref(false);
const cabangList = ref<CabangOption[]>([]);
const selected = ref<PriceProposal[]>([]);
const expanded = ref<PriceProposal[]>([]);
const sizeDetails = ref<{ [key: string]: SizeDetail[] }>({});
const loadingSizeDetails = ref<Set<string>>(new Set());
const filterOptions = ref<{ title: string; value: keyof PriceProposal }[]>([
  { title: "Nomor", value: "nomor" },
  { title: "Customer", value: "customer" },
  { title: "Ketersediaan", value: "ketersediaan" },
  { title: "Jenis Kaos", value: "jenisKaos" },
  { title: "Keterangan", value: "keterangan" },
  { title: "Status", value: "status" },
  { title: "Cabang", value: "cabang" },
  { title: "User", value: "created" },
]);
const selectedFilterField = ref<keyof PriceProposal>("nomor");
const filterSearchValue = ref("");

const hasViewPermission = ref(false);
const dialogDelete = ref(false);
const itemToDelete = ref<PriceProposal | null>(null);

const SESSION_STATE_KEY = "price_proposal_browse_state";

const tableHeaders = ref<DataTableHeader[]>([
  { title: "", key: "data-table-expand", width: 50, fixed: true },
  { title: "Nomor", key: "nomor", width: 150, fixed: true },
  { title: "Tanggal", key: "tanggal", width: 120 },
  { title: "Customer", key: "customer", width: 250 },
  { title: "Ketersediaan", key: "ketersediaan", width: 110 },
  { title: "Jenis Kaos", key: "jenisKaos", width: 200 },
  { title: "Keterangan", key: "keterangan", width: 300 },
  { title: "Status", key: "status", width: 130 },
  { title: "Cabang", key: "cabang", width: 120 },
  { title: "User", key: "created", width: 120 },
]);

const sizeDetailHeaders = [
  { title: "NAMA BARANG", key: "nama", width: "260px" },
  { title: "UKURAN", key: "ukuran", width: "100px", align: "center" },
  { title: "QTY", key: "qty", align: "center", width: "80px" },
  { title: "HARGA", key: "harga", align: "end", width: "140px" },
] as const;

const isGenerateSoDialogVisible = ref(false);
const soEligibility = ref<{
  eligible: boolean;
  checks: { isAccFinance: boolean; isMasukSuratPesanan: boolean; isDpTerpenuhi: boolean };
  totalHargaPh: number;
  totalDp: number;
  minimalDpNominal: number;
} | null>(null);
const soPrefill = ref<{
  kodeBarang: string;
  joKode: string;
  jeniskain: string;
  finishing: string;
  jumlah: number;
  custKaosanNama: string;
  matchedSales: { sal_kode: string; sal_nama: string } | null;
  kepentinganOptions: string[];
  keteranganProduksi: string;
} | null>(null);
const soDatelineRange = ref<{ minDate: string; maxDate: string } | null>(null);
const soForm = ref({
  namaSo: "",
  namaExt: "",
  kepentingan: "",
  salesKode: "",
  dateline: "",
  keteranganProduksi: "",
});
const isCheckingEligibility = ref(false);
const isLoadingPrefill = ref(false);
const isGeneratingSo = ref(false);

const canGenerateSo = computed(
  () => isSingleSelected.value && soEligibility.value?.eligible === true
);

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
const handleRowClick = (_event: Event, { item }: { item: PriceProposal }) => {
  selected.value = [item];
};

const isSingleSelected = computed(() => selected.value.length === 1);
const filteredProposals = computed(() => {
  if (!filterSearchValue.value) {
    return proposals.value;
  }
  return proposals.value.filter((item) => {
    const itemValue = item[selectedFilterField.value];
    if (itemValue) {
      return itemValue.toString().toLowerCase().includes(filterSearchValue.value.toLowerCase());
    }
    return false;
  });
});

// --- Methods ---
const fetchCabangList = async () => {
  try {
    const response = await api.get("/offers/branch-options", {
      params: { userCabang: authStore.user?.cabang },
    });
    if (authStore.user?.cabang === "KDC") {
      cabangList.value = [{ kode: "ALL", nama: "SEMUA CABANG" }, ...response.data];
    } else {
      cabangList.value = response.data;
    }
  } catch {
    toast.error("Gagal memuat daftar cabang.");
  }
};

const saveStateToSession = () => {
  const stateToSave = {
    startDate: startDate.value,
    endDate: endDate.value,
    selectedCabang: selectedCabang.value,
    draftSaja: draftSaja.value,
    selectedFilterField: selectedFilterField.value,
    filterSearchValue: filterSearchValue.value,
  };
  sessionStorage.setItem(SESSION_STATE_KEY, JSON.stringify(stateToSave));
};

const fetchData = async () => {
  if (!startDate.value || !endDate.value) {
    return;
  }
  isLoading.value = true;
  try {
    const response = await api.get("/price-proposals", {
      params: {
        startDate: startDate.value,
        endDate: endDate.value,
        cabang: selectedCabang.value,
        belumApproval: draftSaja.value,
      },
    });
    proposals.value = response.data;
  } catch {
    toast.error("Gagal memuat data pengajuan harga.");
  } finally {
    isLoading.value = false;
  }
};

const fetchDatelineRange = async () => {
  if (!soForm.value.kepentingan || !soPrefill.value) return;
  try {
    const response = await api.get("/price-proposals/so-dateline-range", {
      params: { kepentingan: soForm.value.kepentingan, joKode: soPrefill.value.joKode },
    });
    soDatelineRange.value = response.data;
    soForm.value.dateline = response.data.minDate;
  } catch (error) {
    console.error("Gagal memuat rentang dateline:", error);
  }
};

const loadSizeDetails = async (expandedItems: PriceProposal[]) => {
  const expandedNomors = expandedItems.map((item) => item.nomor);

  for (const nomor of expandedNomors) {
    if (!sizeDetails.value[nomor] && !loadingSizeDetails.value.has(nomor)) {
      loadingSizeDetails.value.add(nomor);
      try {
        const response = await api.get(`/price-proposals/${nomor}/size-details`);
        sizeDetails.value = { ...sizeDetails.value, [nomor]: response.data };
      } catch (error) {
        console.error(`Error loading size detail for ${nomor}:`, error);
        toast.error(`Gagal memuat detail ukuran untuk nomor ${nomor}`);
        expanded.value = expanded.value.filter((item) => item.nomor !== nomor);
      } finally {
        loadingSizeDetails.value.delete(nomor);
      }
    }
  }
};

const editProposal = () => {
  if (!isSingleSelected.value) return;
  const nomor = selected.value[0].nomor;
  router.push(`/transaksi/penjualan/pengajuan/pengajuan-harga/ubah/${nomor}`);
};

const getErrorMessage = (error: unknown, fallback: string): string => {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof (error as { response?: { data?: { message?: unknown } } }).response?.data?.message ===
      "string"
  ) {
    return (error as { response: { data: { message: string } } }).response.data.message;
  }
  return fallback;
};

const deleteProposal = async (item: PriceProposal) => {
  try {
    await api.delete(`/price-proposals/${item.nomor}`);
    toast.success(`Pengajuan harga ${item.nomor} berhasil dihapus.`);
    fetchData();
    selected.value = [];
  } catch (error: unknown) {
    toast.error(getErrorMessage(error, "Gagal menghapus pengajuan harga."));
  }
};

const confirmDelete = () => {
  if (!isSingleSelected.value) return;
  itemToDelete.value = selected.value[0];
  dialogDelete.value = true;
};

const deleteConfirmed = () => {
  if (itemToDelete.value) {
    deleteProposal(itemToDelete.value);
  }
  dialogDelete.value = false;
  itemToDelete.value = null;
};

const openGenerateSoDialog = async () => {
  if (!canGenerateSo.value) return;
  const nomor = selected.value[0].nomor;

  isLoadingPrefill.value = true;
  isGenerateSoDialogVisible.value = true;
  try {
    const response = await api.get(`/price-proposals/${nomor}/so-prefill`);
    soPrefill.value = response.data;
    soForm.value = {
      namaSo: "",
      namaExt: "",
      kepentingan: "",
      salesKode: soPrefill.value?.matchedSales?.sal_kode || "",
      dateline: "",
      keteranganProduksi: soPrefill.value?.keteranganProduksi || "",
    };
    soDatelineRange.value = null;
  } catch (error: unknown) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal memuat data prefill SO.");
    isGenerateSoDialogVisible.value = false;
  } finally {
    isLoadingPrefill.value = false;
  }
};

const submitGenerateSo = async () => {
  if (!soForm.value.namaSo) return toast.error("Nama SO wajib diisi.");
  if (!soForm.value.kepentingan) return toast.error("Kepentingan wajib dipilih.");
  if (!soForm.value.salesKode) return toast.error("Sales wajib dipilih.");
  if (!soForm.value.dateline) return toast.error("Dateline wajib diisi.");

  const nomor = selected.value[0].nomor;
  isGeneratingSo.value = true;
  try {
    const response = await api.post(`/price-proposals/${nomor}/generate-so`, soForm.value);
    toast.success(response.data.message);
    isGenerateSoDialogVisible.value = false;
    fetchData();
    selected.value = [];
  } catch (error: unknown) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || "Gagal generate SO.");
  } finally {
    isGeneratingSo.value = false;
  }
};

const openSoManksi = (soNomor: string) => {
  const routeData = router.resolve({ name: "SoManksiDetail", params: { nomor: soNomor } });
  window.open(routeData.href, "_blank");
};

const getRowTextColor = (item: PriceProposal) => {
  // [FIX] Hanya DRAFT asli yang ditandai merah — LEGACY_APPROVED (data lama
  // yang sudah pernah di-approve sebelum sistem status ini ada) tidak perlu
  // ditandai sebagai "belum diapa-apain".
  if (!item.status || item.status === "DRAFT") {
    return "text-red font-weight-bold";
  }
  return "";
};

onMounted(async () => {
  if (!authStore.isAuthenticated) return;

  if (authStore.can(MENU_ID, "view")) {
    hasViewPermission.value = true;

    const savedState = sessionStorage.getItem(SESSION_STATE_KEY);

    if (savedState) {
      try {
        const parsedState = JSON.parse(savedState);

        startDate.value = parsedState.startDate;
        endDate.value = parsedState.endDate;
        selectedCabang.value = parsedState.selectedCabang;
        draftSaja.value = parsedState.draftSaja ?? parsedState.belumApproval ?? false;

        if (parsedState.selectedFilterField)
          selectedFilterField.value = parsedState.selectedFilterField;
        if (parsedState.filterSearchValue) filterSearchValue.value = parsedState.filterSearchValue;
      } catch (e) {
        console.error("Gagal membaca state filter dari sessionStorage", e);
      }
    } else {
      selectedCabang.value =
        authStore.user?.cabang === "KDC" ? "ALL" : authStore.user?.cabang || "";
      draftSaja.value = true;

      const queryStartDate = route.query.startDate as string;
      const queryEndDate = route.query.endDate as string;
      const queryStatus = route.query.status as string;

      if (queryStartDate && queryEndDate) {
        startDate.value = queryStartDate;
        endDate.value = queryEndDate;
      }

      if (queryStatus === "pending" || queryStatus === "DRAFT") {
        draftSaja.value = true;
      }
    }

    await fetchCabangList();
    await fetchData();
  } else {
    isLoading.value = false;
    toast.error("Anda tidak memiliki izin untuk melihat halaman ini.");
  }
});

watch(
  expanded,
  (newExpanded) => {
    if (newExpanded.length > 0) {
      loadSizeDetails(newExpanded);
    }
  },
  { deep: true }
);

watch(
  () => soForm.value.kepentingan,
  () => {
    fetchDatelineRange();
  }
);

watch([selectedCabang, draftSaja, startDate, endDate], () => {
  saveStateToSession();
  if (hasViewPermission.value) fetchData();
});

watch([filterSearchValue, selectedFilterField], () => {
  saveStateToSession();
});

watch(selected, async (newSelected) => {
  if (newSelected.length !== 1) {
    soEligibility.value = null;
    return;
  }
  isCheckingEligibility.value = true;
  try {
    const response = await api.get(`/price-proposals/${newSelected[0].nomor}/so-eligibility`);
    soEligibility.value = response.data;
  } catch {
    soEligibility.value = null;
  } finally {
    isCheckingEligibility.value = false;
  }
});

onBeforeRouteLeave((to, from, next) => {
  const isRelatedPage = to.path.includes("/pengajuan-harga");

  if (!isRelatedPage) {
    sessionStorage.removeItem(SESSION_STATE_KEY);
  }

  next();
});
</script>

<template>
  <PageLayout title="Pengajuan Harga" desktop-mode icon="mdi-cash-plus">
    <template #header-actions>
      <v-btn
        v-if="authStore.can(MENU_ID, 'insert')"
        size="small"
        color="primary"
        prepend-icon="mdi-plus"
        @click="router.push('/transaksi/penjualan/pengajuan/pengajuan-harga/new')"
        >Baru</v-btn
      >
      <v-btn
        v-if="authStore.can(MENU_ID, 'edit')"
        size="small"
        :disabled="!isSingleSelected"
        prepend-icon="mdi-pencil"
        @click="editProposal"
        >Ubah</v-btn
      >
      <v-btn
        v-if="authStore.can(MENU_ID, 'delete')"
        size="small"
        color="error"
        :disabled="!isSingleSelected"
        prepend-icon="mdi-delete"
        @click="confirmDelete"
        >Hapus</v-btn
      >
      <v-btn
        v-if="canGenerateSo"
        size="small"
        color="success"
        prepend-icon="mdi-factory"
        @click="openGenerateSoDialog"
        >Generate SO Manksi</v-btn
      >
    </template>

    <div v-if="!hasViewPermission" class="state-container">
      <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
      <h3 class="text-h6">Akses Ditolak</h3>
    </div>

    <div v-else class="browse-content">
      <!-- Filter Section -->
      <div class="filter-section">
        <div class="d-flex align-center ga-2">
          <span class="filter-label">Periode:</span>
          <v-text-field
            v-model="startDate"
            type="date"
            density="compact"
            hide-details
            variant="outlined"
            style="width: 118px"
          ></v-text-field>
          <span>s/d</span>
          <v-text-field
            v-model="endDate"
            type="date"
            density="compact"
            hide-details
            variant="outlined"
            style="width: 118px"
          ></v-text-field>
        </div>
        <div class="d-flex align-center ga-2" style="min-width: 220px">
          <span class="filter-label">Cabang:</span>
          <v-select
            v-model="selectedCabang"
            :items="cabangList"
            item-title="nama"
            item-value="kode"
            density="compact"
            hide-details
            variant="outlined"
            style="width: 150px"
            :menu-props="{ class: 'compact-select-list' }"
          ></v-select>
        </div>
        <v-checkbox
          v-model="draftSaja"
          label="Draft Saja"
          hide-details
          density="compact"
        ></v-checkbox>
        <v-spacer></v-spacer>
        <v-divider vertical class="mx-2"></v-divider>
        <div class="d-flex align-center ga-1">
          <v-select
            v-model="selectedFilterField"
            :items="filterOptions"
            density="compact"
            hide-details
            variant="outlined"
            style="width: 160px"
            placeholder="Filter..."
          />
          <v-text-field
            v-model="filterSearchValue"
            density="compact"
            hide-details
            variant="outlined"
            style="width: 170px"
            clearable
            prepend-inner-icon="mdi-magnify"
            placeholder="Cari..."
          />
        </div>

        <v-spacer></v-spacer>
        <div class="legend-group">
          <span class="legend-pending">● Draft</span>
        </div>
        <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small"></v-btn>
      </div>

      <!-- Table Section -->
      <div class="table-container">
        <AppDataTable
          v-model="selected"
          :headers="tableHeaders"
          :items="filteredProposals"
          :loading="isLoading"
          item-value="nomor"
          density="compact"
          class="desktop-table header-browse-blue"
          fixed-header
          show-select
          return-object
          :items-per-page="50"
          @update:expanded="loadSizeDetails"
          @click:row="handleRowClick"
        >
          <template #[`item.data-table-expand`]="{ internalItem, toggleExpand, isExpanded }">
            <v-btn
              icon="mdi-chevron-down"
              :class="{ 'rotate-180': isExpanded(internalItem) }"
              size="x-small"
              variant="text"
              @click.stop="toggleExpand(internalItem)"
            />
          </template>

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

          <template
            v-for="header in tableHeaders.filter((h) => h.key !== 'data-table-expand')"
            #[`item.${header.key}`]="{ item }"
            :key="header.key"
          >
            <td :class="getRowTextColor(item)">
              <template v-if="header.key === 'tanggal'">
                {{ format(new Date(item.tanggal), "dd/MM/yyyy") }}
              </template>
              <template v-else-if="header.key === 'status'">
                <v-chip :color="getStatusColor(item.status)" variant="tonal" size="x-small">
                  {{ getStatusLabel(item.status) }}
                </v-chip>
              </template>
              <template v-else-if="header.key === 'ketersediaan'">
                <v-chip
                  :color="
                    item.ketersediaan === 'Sublim'
                      ? 'deep-purple'
                      : item.ketersediaan === 'Custom'
                      ? 'orange'
                      : 'grey'
                  "
                  variant="tonal"
                  size="x-small"
                  >{{ item.ketersediaan }}</v-chip
                >
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
                  <div class="detail-tables-row">
                    <!-- Tabel kiri: Detail Ukuran -->
                    <div class="detail-table-wrapper elevation-1">
                      <div class="detail-table-title">Detail Ukuran</div>
                      <div v-if="loadingSizeDetails.has(item.nomor)" class="text-center py-4">
                        <v-progress-circular indeterminate color="primary" size="24" />
                      </div>
                      <v-data-table
                        v-else-if="sizeDetails[item.nomor]?.length"
                        :headers="sizeDetailHeaders"
                        :items="sizeDetails[item.nomor]"
                        density="compact"
                        hide-default-footer
                        class="detail-table"
                      >
                        <template #[`item.harga`]="{ value }">{{ formatRupiah(value) }}</template>
                      </v-data-table>
                      <div v-else class="text-caption text-medium-emphasis pa-4">
                        Tidak ada detail ukuran.
                      </div>
                    </div>

                    <!-- Tabel kanan: Kode Barang & SPK -->
                    <div class="detail-info-wrapper elevation-1">
                      <div class="detail-table-title">Kode Barang & Produksi</div>
                      <div class="detail-info-row">
                        <span class="detail-label">Kode Barang Draft</span>
                        <span class="detail-value">{{ item.kodeBarangDraft || "-" }}</span>
                      </div>
                      <div class="detail-info-row">
                        <span class="detail-label">Kode Barang Final</span>
                        <span
                          class="detail-value"
                          :class="{ 'text-success font-weight-bold': item.kodeBarangFinal }"
                        >
                          {{ item.kodeBarangFinal || "Belum difinalisasi" }}
                        </span>
                      </div>
                      <div class="detail-info-row">
                        <span class="detail-label">Kode Barang Final</span>
                        <span
                          class="detail-value"
                          :class="{ 'text-success font-weight-bold': item.kodeBarangFinal }"
                        >
                          {{ item.kodeBarangFinal || "Belum difinalisasi" }}
                        </span>
                      </div>
                      <div v-if="item.kodeCelanaDraft" class="detail-info-row">
                        <span class="detail-label">Kode Barang Celana</span>
                        <span class="detail-value">{{ item.kodeCelanaDraft }}</span>
                      </div>
                      <div class="detail-info-row">
                        <span class="detail-label">Nomor SO/SPK</span>
                        <span class="detail-value">{{ item.refSoSpk || "-" }}</span>
                      </div>

                      <v-btn
                        v-if="item.refSoSpk"
                        size="x-small"
                        variant="tonal"
                        color="primary"
                        prepend-icon="mdi-open-in-new"
                        class="ma-2"
                        @click="openSoManksi(item.refSoSpk)"
                      >
                        Lihat SO Manksi
                      </v-btn>
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </AppDataTable>
      </div>
    </div>

    <v-dialog v-model="dialogDelete" max-width="500px">
      <v-card>
        <v-card-title class="text-h5">Konfirmasi Hapus</v-card-title>
        <v-card-text
          >Apakah Anda yakin ingin menghapus pengajuan harga nomor
          <strong>{{ itemToDelete?.nomor }}</strong
          >?</v-card-text
        >
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn variant="text" @click="dialogDelete = false">Batal</v-btn>
          <v-btn color="red-darken-1" variant="elevated" @click="deleteConfirmed">Hapus</v-btn>
          <v-spacer></v-spacer>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="isGenerateSoDialogVisible" max-width="480px" persistent>
      <v-card class="generate-so-card">
        <v-card-title class="generate-so-title">
          <v-icon icon="mdi-factory" color="success" class="mr-2"></v-icon>
          Generate SO Manksi
        </v-card-title>

        <v-card-text v-if="isLoadingPrefill" class="text-center py-8">
          <v-progress-circular indeterminate color="primary" />
        </v-card-text>

        <v-card-text v-else-if="soPrefill" class="generate-so-body">
          <!-- Info ringkas dari Pengajuan Harga -->
          <div class="so-info-grid mb-4">
            <div class="so-info-item">
              <span class="so-info-label">Kode Barang</span>
              <span class="so-info-value font-weight-bold">{{ soPrefill.kodeBarang }}</span>
            </div>
            <div class="so-info-item">
              <span class="so-info-label">Jenis Order</span>
              <span class="so-info-value">{{ soPrefill.joKode }}</span>
            </div>
            <div class="so-info-item">
              <span class="so-info-label">Jumlah</span>
              <span class="so-info-value">{{ soPrefill.jumlah }} pcs</span>
            </div>
            <div class="so-info-item so-info-item--full">
              <span class="so-info-label">Cust Kaosan</span>
              <span class="so-info-value">{{ soPrefill.custKaosanNama }}</span>
            </div>
          </div>

          <v-alert
            v-if="!soPrefill.matchedSales"
            type="warning"
            variant="tonal"
            density="compact"
            class="mb-4"
          >
            Sales tidak otomatis ketemu — pilih manual di bawah.
          </v-alert>

          <v-text-field
            v-model="soForm.namaSo"
            label="Nama SO"
            variant="outlined"
            density="compact"
            hide-details
            class="mb-3"
          ></v-text-field>

          <v-text-field
            v-model="soForm.namaExt"
            label="Nama Ext (opsional)"
            variant="outlined"
            density="compact"
            hide-details
            class="mb-3"
          ></v-text-field>

          <div class="so-form-row mb-3">
            <v-select
              v-model="soForm.kepentingan"
              :items="soPrefill.kepentinganOptions"
              label="Kepentingan"
              variant="outlined"
              density="compact"
              hide-details
            ></v-select>

            <v-text-field
              v-model="soForm.dateline"
              label="Dateline"
              type="date"
              :min="soDatelineRange?.minDate"
              :max="soDatelineRange?.maxDate"
              :hint="
                soDatelineRange
                  ? `Rentang: ${soDatelineRange.minDate} s/d ${soDatelineRange.maxDate}`
                  : ''
              "
              :persistent-hint="!!soDatelineRange"
              variant="outlined"
              density="compact"
            ></v-text-field>
          </div>

          <v-text-field
            v-model="soForm.salesKode"
            label="Kode Sales"
            readonly
            :hint="
              soPrefill.matchedSales
                ? `Terdeteksi: ${soPrefill.matchedSales.sal_nama}`
                : 'Sales tidak ditemukan otomatis — perbaiki data nama SC Master Sales.'
            "
            persistent-hint
            variant="outlined"
            density="compact"
            :color="soPrefill.matchedSales ? undefined : 'error'"
          ></v-text-field>

          <v-textarea
            v-model="soForm.keteranganProduksi"
            label="Keterangan Produksi"
            placeholder="Catatan untuk workshop DC saat SO diproses..."
            variant="outlined"
            density="compact"
            rows="3"
            auto-grow
            hide-details
          ></v-textarea>
        </v-card-text>

        <v-card-actions class="generate-so-actions">
          <v-spacer></v-spacer>
          <v-btn variant="text" @click="isGenerateSoDialogVisible = false">Batal</v-btn>
          <v-btn
            color="success"
            variant="flat"
            :loading="isGeneratingSo"
            :disabled="!soPrefill?.matchedSales"
            @click="submitGenerateSo"
          >
            Generate SO
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
:deep(.compact-select-list .v-list-item-title) {
  font-size: 11px !important;
}

.browse-content {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 64px - 32px);
  overflow: hidden;
  background-color: rgb(var(--v-theme-background));
}

.filter-section {
  flex-shrink: 0;
  display: flex;
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
  justify-content: center !important;
}

.filter-section :deep(.v-label) {
  font-size: 11px !important;
}

.filter-section :deep(input[type="date"]) {
  font-size: 11px !important;
  padding: 0 !important;
  text-align: center !important;
  width: 100% !important;
}

.filter-section :deep(.v-select__selection-text) {
  font-size: 11px !important;
}

.filter-section :deep(.v-field__append-inner .v-icon),
.filter-section :deep(.v-field__prepend-inner .v-icon) {
  font-size: 14px !important;
}

.filter-section :deep(.v-checkbox .v-label) {
  font-size: 11px !important;
}

.filter-section :deep(.v-checkbox .v-selection-control) {
  min-height: unset !important;
}

.filter-label {
  color: rgba(var(--v-theme-on-surface), 0.7);
  font-weight: 600;
  font-size: 11px;
}

.legend-group {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  white-space: nowrap;
}

.legend-pending {
  color: #d32f2f;
  font-weight: 600;
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
  background-color: rgb(var(--v-theme-surface));
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
  border-right: 2px solid rgba(var(--v-theme-on-surface), 0.5);
}

:deep(td.text-red) {
  color: #d32f2f !important;
}

.v-theme--dark .desktop-table :deep(tr:hover td.text-red) {
  background-color: rgba(211, 47, 47, 0.2) !important;
}
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

.detail-tables-row {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.detail-table-title {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: #ffffff;
  padding: 8px 12px;
  background-color: rgb(var(--v-theme-surface-variant));
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.detail-table-wrapper {
  min-width: 340px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 4px;
  overflow: hidden;
  background-color: rgb(var(--v-theme-surface));
}

.detail-info-wrapper {
  min-width: 380px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 4px;
  overflow: hidden;
  background-color: rgb(var(--v-theme-surface));
}

.detail-info-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 12px;
  font-size: 12px;
  border-bottom: 1px solid rgba(var(--v-border-color), 0.08);
}

.detail-info-row:last-child {
  border-bottom: none;
}

.detail-label {
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-weight: 600;
}

.detail-value {
  font-family: monospace;
}

.detail-table :deep(thead tr th) {
  background-color: rgb(var(--v-theme-surface-variant)) !important;
  color: #ffffff !important;
  font-size: 10px !important;
  font-weight: bold !important;
  height: 32px !important;
  text-transform: uppercase;
}

.detail-table :deep(td),
.detail-table :deep(th) {
  border-bottom: 1px solid rgba(var(--v-border-color), 0.1) !important;
}
.generate-so-card {
  border-radius: 12px;
}

.generate-so-title {
  display: flex;
  align-items: center;
  font-size: 18px;
  font-weight: 700;
  padding: 20px 24px 8px;
}

.generate-so-body {
  padding: 8px 24px 4px;
}

.so-info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 16px;
  padding: 12px 14px;
  background-color: rgba(var(--v-theme-on-surface), 0.05);
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 8px;
}

.so-info-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.so-info-item--full {
  grid-column: span 2;
}

.so-info-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: rgba(var(--v-theme-on-surface), 0.6);
}

.so-info-value {
  font-size: 11px;
  color: rgb(var(--v-theme-on-surface));
}

.so-form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  align-items: start;
}

.generate-so-actions {
  padding: 12px 24px 20px;
}

.generate-so-card :deep(.v-label),
.generate-so-card :deep(input),
.generate-so-card :deep(.v-field__input) {
  font-size: 11px !important;
}

.generate-so-card :deep(.v-messages__message) {
  font-size: 10px !important;
}
</style>
