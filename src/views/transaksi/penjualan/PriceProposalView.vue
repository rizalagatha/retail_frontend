<script setup lang="ts">
import { ref, onMounted, watch, computed } from "vue";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { format } from "date-fns";
import { useRouter, useRoute, onBeforeRouteLeave } from "vue-router";
import AppDataTable from "@/components/AppDataTable.vue";

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
  cabang: string;
  created: string;
}

interface CabangOption {
  kode: string;
  nama: string;
}

// --- State ---
const proposals = ref<PriceProposal[]>([]);
const isLoading = ref(true);
const startDate = ref(format(new Date(), "yyyy-MM-dd"));
const endDate = ref(format(new Date(), "yyyy-MM-dd"));
const selectedCabang = ref<string | null>(
  authStore.user?.cabang === "KDC" ? "ALL" : authStore.user?.cabang || null
);
const belumApproval = ref(false);
const cabangList = ref<CabangOption[]>([]);
const selected = ref<PriceProposal[]>([]);
const filterOptions = ref<{ title: string; value: keyof PriceProposal }[]>([
  { title: "Nomor", value: "nomor" },
  { title: "Customer", value: "customer" },
  { title: "Jenis Kaos", value: "jenisKaos" },
  { title: "Keterangan", value: "keterangan" },
  { title: "Approval", value: "approval" },
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
  { title: "Nomor", key: "nomor", width: 150, fixed: true },
  { title: "Tanggal", key: "tanggal", width: 120 },
  { title: "Customer", key: "customer", width: 250 },
  { title: "Jenis Kaos", key: "jenisKaos", width: 200 },
  { title: "Keterangan", key: "keterangan", width: 300 },
  { title: "Approval", key: "approval", width: 120 },
  { title: "Cabang", key: "cabang", width: 120 },
  { title: "User", key: "created", width: 120 },
]);

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
    // Asumsi API ini ada untuk mengambil daftar cabang
    const response = await api.get("/offers/branch-options", {
      params: { userCabang: authStore.user?.cabang },
    });
    // Tambahkan opsi "ALL" jika user adalah KDC
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
    belumApproval: belumApproval.value,
    selectedFilterField: selectedFilterField.value,
    filterSearchValue: filterSearchValue.value,
  };
  sessionStorage.setItem(SESSION_STATE_KEY, JSON.stringify(stateToSave));
};

const fetchData = async () => {
  if (!startDate.value || !endDate.value) {
    return; // Hentikan fungsi jika salah satu tanggal kosong
  }
  isLoading.value = true;
  try {
    const response = await api.get("/price-proposals", {
      params: {
        startDate: startDate.value,
        endDate: endDate.value,
        cabang: selectedCabang.value,
        belumApproval: belumApproval.value,
      },
    });
    proposals.value = response.data;
  } catch {
    toast.error("Gagal memuat data pengajuan harga.");
  } finally {
    isLoading.value = false;
  }
};

const editProposal = () => {
  if (!isSingleSelected.value) return;
  const nomor = selected.value[0].nomor;
  router.push(`/transaksi/penjualan/pengajuan/pengajuan-harga/ubah/${nomor}`);
};

const deleteProposal = async (item: PriceProposal) => {
  try {
    // Asumsi endpoint hapus ada di /api/price-proposals/:nomor
    await api.delete(`/price-proposals/${item.nomor}`);
    toast.success(`Pengajuan harga ${item.nomor} berhasil dihapus.`);
    fetchData();
    selected.value = [];
  } catch {
    toast.error("Gagal menghapus pengajuan harga.");
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

const getRowTextColor = (item: PriceProposal) => {
  // Warnai merah jika kolom 'approval' kosong (belum di-approve)
  if (!item.approval) {
    return "text-red font-weight-bold";
  }
  return ""; // Warna default
};

onMounted(async () => {
  if (!authStore.isAuthenticated) return;

  if (authStore.can(MENU_ID, "view")) {
    hasViewPermission.value = true;

    // 1. Coba baca state pencarian dari Session Storage terlebih dahulu
    const savedState = sessionStorage.getItem(SESSION_STATE_KEY);

    if (savedState) {
      try {
        const parsedState = JSON.parse(savedState);

        // Kembalikan nilai filter dari session
        startDate.value = parsedState.startDate;
        endDate.value = parsedState.endDate;
        selectedCabang.value = parsedState.selectedCabang;
        belumApproval.value = parsedState.belumApproval;

        // Kembalikan nilai pencarian teks
        if (parsedState.selectedFilterField)
          selectedFilterField.value = parsedState.selectedFilterField;
        if (parsedState.filterSearchValue) filterSearchValue.value = parsedState.filterSearchValue;
      } catch (e) {
        console.error("Gagal membaca state filter dari sessionStorage", e);
      }
    } else {
      // 2. Jika tidak ada di memory (baru buka pertama kali)

      // Set default cabang
      selectedCabang.value =
        authStore.user?.cabang === "KDC" ? "ALL" : authStore.user?.cabang || "";
      belumApproval.value = true; // Default bawaan halaman ini

      // Timpa dengan Query URL (jika dialihkan dari Dashboard)
      const queryStartDate = route.query.startDate as string;
      const queryEndDate = route.query.endDate as string;
      const queryStatus = route.query.status as string;

      if (queryStartDate && queryEndDate) {
        startDate.value = queryStartDate;
        endDate.value = queryEndDate;
      }

      // Jika dari dashboard klik 'pending', pastikan checkbox tercentang
      if (queryStatus === "pending") {
        belumApproval.value = true;
      }
    }

    // 3. Fetch data berurutan
    await fetchCabangList();
    await fetchData();
  } else {
    isLoading.value = false;
    toast.error("Anda tidak memiliki izin untuk melihat halaman ini.");
  }
});

// --- Watcher Gabungan ---
// Pantau semua variabel yang bisa memicu fetch ulang ke backend
watch([selectedCabang, belumApproval, startDate, endDate], () => {
  saveStateToSession();
  if (hasViewPermission.value) fetchData();
});

// Pantau variabel pencarian frontend agar saat user mengetik, state-nya juga tersimpan
watch([filterSearchValue, selectedFilterField], () => {
  saveStateToSession();
});

// Deteksi saat user meninggalkan halaman ini
onBeforeRouteLeave((to, from, next) => {
  // Cek apakah halaman tujuan MASIH berhubungan dengan modul Pengajuan Harga.
  // Asumsi path untuk form ubah/baru mengandung string "pengajuan-harga"
  const isRelatedPage = to.path.includes("/pengajuan-harga");

  if (!isRelatedPage) {
    // Jika pergi ke menu lain (misal: ke dashboard atau invoice), bersihkan memori filter!
    sessionStorage.removeItem(SESSION_STATE_KEY);
  }

  next(); // Lanjutkan perpindahan halaman
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
            style="min-width: 140px"
          ></v-text-field>
          <span>s/d</span>
          <v-text-field
            v-model="endDate"
            type="date"
            density="compact"
            hide-details
            variant="outlined"
            style="min-width: 140px"
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
            style="max-width: 180px"
            :menu-props="{ class: 'compact-select-list' }"
          ></v-select>
        </div>
        <v-checkbox
          v-model="belumApproval"
          label="Belum Approve"
          hide-details
          density="compact"
        ></v-checkbox>
        <v-spacer></v-spacer>
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
        <v-spacer></v-spacer>
        <div class="d-flex align-center ga-2 text-caption">
          <v-icon color="red" icon="mdi-square-rounded" size="small"></v-icon> Belum Approval
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

          <template
            v-for="header in tableHeaders"
            #[`item.${header.key}`]="{ item }"
            :key="header.key"
          >
            <td :class="getRowTextColor(item)">
              <template v-if="header.key === 'tanggal'">
                {{ format(new Date(item.tanggal), "dd/MM/yyyy") }}
              </template>
              <template v-else-if="header.key === 'approval'">
                <v-chip :color="item.approval ? 'success' : 'grey'" variant="tonal" size="x-small">
                  {{ item.approval || "Belum" }}
                </v-chip>
              </template>
              <template v-else>
                {{ item[header.key] }}
              </template>
            </td>
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
  </PageLayout>
</template>

<style scoped>
:deep(.compact-select-list .v-list-item-title) {
  font-size: 11px !important;
}

/* Layout Utama Full Height */
.browse-content {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 64px - 32px);
  overflow: hidden;
  background-color: rgb(var(--v-theme-background));
  /* [FIX] */
}

/* Filter Section */
.filter-section {
  flex-shrink: 0;
  padding: 8px;
  /* [FIX DARK MODE] */
  background-color: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  color: rgb(var(--v-theme-on-surface));

  display: flex;
  align-items: center;
  gap: 12px;
}

/* [FIX] Styling Input dalam Filter */
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

/* Table Full Height & Scrollbar */
.desktop-table {
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: rgb(var(--v-theme-surface));
  /* [FIX] */
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

/* Header Resize */
.resizable-header {
  position: relative;
  /* [FIX] Gunakan variable tema global */
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
  /* [FIX] */
}

/* Pewarnaan Baris Merah (Belum Approve) */
:deep(td.text-red) {
  color: #d32f2f !important;
}

/* [FIX] Hover row pada baris merah di Dark Mode */
.v-theme--dark .desktop-table :deep(tr:hover td.text-red) {
  background-color: rgba(211, 47, 47, 0.2) !important;
}
</style>
