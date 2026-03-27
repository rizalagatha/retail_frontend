<script setup lang="ts">
import { ref, onMounted, computed, watch } from "vue";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import { format, parseISO, subDays } from "date-fns";
import { useRouter, onBeforeRouteLeave } from "vue-router";
import axios from "axios";
import AppDataTable from "@/components/AppDataTable.vue";

// Interface Header (Wajib untuk Resize)
interface DataTableHeader {
  title: string;
  key: string;
  width?: number | string;
  fixed?: boolean;
  align?: "start" | "center" | "end";
  minWidth?: string | number;
  maxWidth?: string | number;
  sortable?: boolean;
}

interface LhkHeader {
  NomorLhk: string;
  Tanggal: string;
  NamaCabang: string;
  user_create: string;
  cab: string;
  jo_kode: string; // Kode (SD/BR)
  NamaJenisOrder: string; // Nama (SABLON DTF/BORDIR)
  PanjangMtr: number;
  BuanganMtr: number;
  LuasRiil: number;
  TotalLuasSistem: number;
  Selisih: number;
  Ratio: number; // Pastikan ini ada
  TotalJumlahSistem: number; //
  TotalJumlahRiil: number; //
  TotalReject: number; //
  [key: string]: unknown;
}

interface LhkDetail {
  SoDtf: string;
  NamaDtf: string;
  Titik: number; // Kolom baru
  JumlahRiil: number; // Jumlah Kaos
  TotalTitik: number; // Kolom baru
  Reject: number;
  LuasSistem: number;
}

const toast = useToast();
const authStore = useAuthStore();
const router = useRouter();
const MENU_ID = "41";

// --- State ---
const list = ref<LhkHeader[]>([]);
const details = ref<{ [key: string]: LhkDetail[] }>({});
const expanded = ref<string[]>([]);
const loadingDetails = ref<Set<string>>(new Set());
const isLoading = ref(true);
const startDate = ref(format(subDays(new Date(), 7), "yyyy-MM-dd"));
const endDate = ref(format(new Date(), "yyyy-MM-dd"));
const cabangList = ref<{ kode: string; nama: string }[]>([]);
const selectedCabang = ref(authStore.user?.cabang || "");
const selected = ref<LhkHeader[]>([]);
const jenisOrderList = ref<{ kode: string; nama: string }[]>([]);
const selectedJenisOrder = ref("ALL");

const isConfirmDialogVisible = ref(false);
const itemToDelete = ref<LhkHeader | null>(null);

// Key untuk Session Storage
const SESSION_STATE_KEY = "lhk_browse_state";

// --- Header Utama (LHK) ---
const headers = computed<DataTableHeader[]>(() => {
  const base: DataTableHeader[] = [
    { title: "", key: "data-table-expand", width: 50, fixed: true },
    { title: "NOMOR LHK", key: "NomorLhk", width: 220, fixed: true },
    { title: "TANGGAL", key: "Tanggal", width: 120 },
    // Kolom Baru: JENIS ORDER
    { title: "JENIS ORDER", key: "NamaJenisOrder", width: 150 },
    { title: "STORE", key: "NamaCabang", width: 150 },
    { title: "USER", key: "user_create", width: 100 },
    // KOLOM BARU
    { title: "SISTEM (PCS)", key: "TotalJumlahSistem", width: 100, align: "center" },
    { title: "RIIL (PCS)", key: "TotalJumlahRiil", width: 100, align: "center" },
    { title: "REJECT", key: "TotalReject", width: 80, align: "center" },

    { title: "PEMAKAIAN (CM)", key: "PanjangMtr", width: 120, align: "end" as const },
    { title: "BUANGAN (CM)", key: "BuanganMtr", width: 120, align: "end" as const },
    { title: "RIIL (CM²)", key: "LuasRiil", width: 110, align: "end" as const },
    { title: "SISTEM (CM²)", key: "TotalLuasSistem", width: 110, align: "end" as const },
    { title: "± SELISIH", key: "Selisih", width: 100, align: "end" as const },
  ];

  if (authStore.user?.cabang === "KDC") {
    base.push({ title: "RATIO (%)", key: "Ratio", width: 100, align: "end" as const });
  }

  return base;
});

// --- Header Detail (SO DTF) ---
const detailHeaders: DataTableHeader[] = [
  { title: "No. SO DTF", key: "SoDtf", width: "160px" },
  { title: "Nama DTF", key: "NamaDtf", width: "250px" },
  { title: "Jml Titik", key: "Titik", width: "100px", align: "center" },
  { title: "Jml Kaos", key: "JumlahRiil", width: "100px", align: "center" },
  { title: "Total Titik", key: "TotalTitik", width: "100px", align: "center" },
  { title: "Reject", key: "Reject", width: "80px", align: "center" },
  { title: "Sistem (cm²)", key: "LuasSistem", width: "120px", align: "end" },
];

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
const handleRowClick = (_event: Event, { item }: { item: LhkHeader }) => {
  selected.value = [item];
};

const getItemId = (item: LhkHeader) => item.NomorLhk;

// --- Computed ---
const hasViewPermission = computed(() => authStore.can(MENU_ID, "view"));
const isSingleSelected = computed(() => selected.value.length === 1);
const canEditOrDelete = computed(() => {
  if (!isSingleSelected.value) return false;
  const userCabang = authStore.user?.cabang; // Misal: 'K01'
  // Baris ini butuh properti 'cab' ada di data yang diambil dari API
  const recordCabang = selected.value[0].cab;
  if (userCabang === "KDC") return true;
  // Jika recordCabang undefined, maka 'K01' === undefined hasilnya false
  return userCabang === recordCabang;
});

const footerProps = { "items-per-page-options": [10, 25, 50, -1] };

// --- Methods ---

// --- Fungsi Menyimpan State ke Session Storage ---
const saveStateToSession = () => {
  const stateToSave = {
    startDate: startDate.value,
    endDate: endDate.value,
    selectedCabang: selectedCabang.value,
    selectedJenisOrder: selectedJenisOrder.value, // [BARU] Simpan ke memory
  };
  sessionStorage.setItem(SESSION_STATE_KEY, JSON.stringify(stateToSave));
};

const fetchCabangList = async () => {
  try {
    const res = await api.get("/lhk-so-dtf/cabang-list");
    cabangList.value = res.data;

    // [FITUR KDC] Tambahkan filter ALL
    if (authStore.user?.cabang === "KDC") {
      const hasAll = cabangList.value.some((c) => c.kode === "ALL");
      if (!hasAll) {
        cabangList.value.unshift({ kode: "ALL", nama: "SEMUA STORE" });
      }
      selectedCabang.value = "ALL";
    }
  } catch (err) {
    toast.error("Gagal memuat daftar cabang.", err);
  }
};

// [BARU] Mengambil daftar jenis order dari backend
const fetchJenisOrderList = async () => {
  try {
    const res = await api.get("/lhk-so-dtf/jenis-order"); // Sesuaikan dengan endpoint API Anda
    jenisOrderList.value = [
      { kode: "ALL", nama: "SEMUA JENIS" }, // Opsi default
      ...res.data,
    ];
  } catch (err) {
    toast.error("Gagal memuat daftar jenis order.", err);
  }
};

const fetchData = async () => {
  if (!startDate.value || !endDate.value || !selectedCabang.value || !selectedJenisOrder.value)
    return;
  isLoading.value = true;
  try {
    const res = await api.get("/lhk-so-dtf", {
      params: {
        startDate: startDate.value,
        endDate: endDate.value,
        cabang: selectedCabang.value,
        jenisOrder: selectedJenisOrder.value, // [BARU] Kirim ke backend
      },
    });
    list.value = res.data;
  } catch (_err) {
    toast.error("Gagal memuat data LHK.", _err);
  } finally {
    isLoading.value = false;
  }
};

const loadDetails = async (newlyExpanded: LhkHeader[]) => {
  const item = newlyExpanded.find(
    (i) => !details.value[i.NomorLhk] && !loadingDetails.value.has(i.NomorLhk)
  );
  if (!item) return;

  loadingDetails.value.add(item.NomorLhk);
  try {
    const res = await api.get(`/lhk-so-dtf/detail-list/${item.NomorLhk}`);
    details.value[item.NomorLhk] = res.data;
  } catch (_err) {
    toast.error(`Gagal memuat rincian untuk ${item.NomorLhk}`, _err);
  } finally {
    loadingDetails.value.delete(item.NomorLhk);
  }
};

const showDeleteConfirmation = () => {
  if (!isSingleSelected.value) return;
  itemToDelete.value = selected.value[0];
  isConfirmDialogVisible.value = true;
};

const deleteItem = async () => {
  if (!itemToDelete.value) return;
  try {
    // Menggunakan path parameter /:nomorLhk
    await api.delete(`/lhk-so-dtf/${itemToDelete.value.NomorLhk}`);
    toast.success("Data LHK berhasil dihapus.");
    fetchData();
    selected.value = [];
  } catch (err) {
    let msg = "Gagal menghapus data.";
    if (axios.isAxiosError(err)) msg = err.response?.data?.message || msg;
    toast.error(msg);
  } finally {
    isConfirmDialogVisible.value = false;
  }
};

const handleEdit = () => {
  if (selected.value.length !== 1) return;
  router.push({
    path: "/transaksi/penjualan/dtf/lhk-so-dtf/edit",
    query: { nomorLhk: selected.value[0].NomorLhk },
  });
};

onMounted(async () => {
  if (hasViewPermission.value) {
    const savedState = sessionStorage.getItem(SESSION_STATE_KEY);

    if (savedState) {
      try {
        const parsedState = JSON.parse(savedState);
        if (parsedState.startDate) startDate.value = parsedState.startDate;
        if (parsedState.endDate) endDate.value = parsedState.endDate;
        if (parsedState.selectedCabang) selectedCabang.value = parsedState.selectedCabang;
        if (parsedState.selectedJenisOrder)
          selectedJenisOrder.value = parsedState.selectedJenisOrder; // [BARU]
      } catch (e) {
        console.error("Gagal membaca state filter dari sessionStorage", e);
      }
    } else {
      selectedCabang.value =
        authStore.user?.cabang === "KDC" ? "ALL" : authStore.user?.cabang || "";
      selectedJenisOrder.value = "ALL"; // [BARU] Set default

      // ... (kode query URL biarkan sama) ...
    }

    // 3. Fetch data referensi dan data tabel berurutan
    await fetchCabangList();
    await fetchJenisOrderList(); // [BARU] Panggil API jenis order
    await fetchData();
  }
});

// [BARU] Tambahkan selectedJenisOrder ke dalam watch
watch([startDate, endDate, selectedCabang, selectedJenisOrder], () => {
  if (hasViewPermission.value) {
    saveStateToSession();
    fetchData();
  }
});

// Deteksi saat user meninggalkan halaman ini
onBeforeRouteLeave((to, from, next) => {
  // Cek apakah halaman tujuan MASIH berhubungan dengan modul LHK
  // Misal masuk ke halaman: /transaksi/penjualan/dtf/lhk-so-dtf/edit
  const isRelatedPage = to.path.includes("/lhk-so-dtf");

  if (!isRelatedPage) {
    // Jika pergi ke menu lain (misal: /dashboard atau /so-dtf), bersihkan memori filter LHK!
    sessionStorage.removeItem(SESSION_STATE_KEY);
  }

  next(); // Lanjutkan perpindahan halaman
});
</script>

<template>
  <PageLayout title="LHK Jasa" desktop-mode icon="mdi-clipboard-text-clock">
    <template #header-actions>
      <v-btn
        v-if="authStore.can(MENU_ID, 'insert')"
        size="small"
        color="primary"
        prepend-icon="mdi-plus"
        @click="router.push('/transaksi/penjualan/dtf/lhk-so-dtf/edit')"
        >Baru</v-btn
      >
      <v-btn
        v-if="authStore.can(MENU_ID, 'edit')"
        size="small"
        :disabled="!canEditOrDelete"
        prepend-icon="mdi-pencil"
        @click="handleEdit"
      >
        Ubah
      </v-btn>
      <v-btn
        v-if="authStore.can(MENU_ID, 'delete')"
        size="small"
        color="error"
        :disabled="!canEditOrDelete"
        prepend-icon="mdi-delete"
        @click="showDeleteConfirmation"
      >
        Hapus
      </v-btn>
    </template>

    <div v-if="!hasViewPermission" class="state-container">
      <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
      <h3 class="text-h6">Akses Ditolak</h3>
    </div>

    <div v-else class="browse-content">
      <div class="filter-section">
        <span class="filter-label">Periode:</span>
        <v-text-field
          v-model="startDate"
          type="date"
          density="compact"
          hide-details
          variant="outlined"
          style="min-width: 140px"
        />
        <span class="mx-2">s/d</span>
        <v-text-field
          v-model="endDate"
          type="date"
          density="compact"
          hide-details
          variant="outlined"
          style="min-width: 140px"
        />
        <span class="filter-label ms-4">Store:</span>
        <v-select
          v-model="selectedCabang"
          :items="cabangList"
          item-title="nama"
          item-value="kode"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 180px"
        />
        <span class="filter-label ms-4">Jenis:</span>
        <v-select
          v-model="selectedJenisOrder"
          :items="jenisOrderList"
          item-title="nama"
          item-value="kode"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 180px"
        />
        <v-spacer />
        <v-btn
          @click="fetchData"
          icon="mdi-refresh"
          variant="text"
          size="small"
          title="Muat Ulang Data"
        />
      </div>

      <div class="table-container">
        <AppDataTable
          v-model="selected"
          v-model:expanded="expanded"
          :headers="headers"
          :items="list"
          :loading="isLoading"
          :item-value="getItemId"
          :footer-props="footerProps"
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
                    width: header.width + (typeof header.width === 'number' ? 'px' : ''),
                    minWidth: header.width + (typeof header.width === 'number' ? 'px' : ''),
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
                    <v-icon v-if="isSorted(header)" size="small" class="ms-1">{{
                      getSortIcon(header)
                    }}</v-icon>
                  </div>
                  <div class="resizer" @mousedown.stop="onResizeStart($event, header)"></div>
                </th>
              </template>
            </tr>
          </template>

          <template #[`item.Tanggal`]="{ item }">
            {{ format(parseISO(item.Tanggal), "dd/MM/yyyy") }}
          </template>
          <template #[`item.TotalJumlahSistem`]="{ item }">
            <span class="font-weight-bold text-grey">{{
              item.TotalJumlahSistem.toLocaleString()
            }}</span>
          </template>

          <template #[`item.TotalJumlahRiil`]="{ item }">
            <span class="font-weight-bold text-blue">{{
              item.TotalJumlahRiil.toLocaleString()
            }}</span>
          </template>

          <template #[`item.TotalReject`]="{ item }">
            <v-chip
              v-if="item.TotalReject > 0"
              size="x-small"
              color="error"
              variant="flat"
              class="font-weight-bold"
            >
              {{ item.TotalReject.toLocaleString() }}
            </v-chip>
            <span v-else class="text-grey-lighten-1">-</span>
          </template>
          <template #[`item.LuasRiil`]="{ item }">{{
            Number(item.LuasRiil).toLocaleString()
          }}</template>
          <template #[`item.TotalLuasSistem`]="{ item }">{{
            Number(item.TotalLuasSistem).toLocaleString()
          }}</template>
          <template #[`item.Selisih`]="{ item }">
            <span
              :class="
                item.Selisih > 0 ? 'text-error font-weight-bold' : 'text-success font-weight-bold'
              "
            >
              {{ item.Selisih.toLocaleString() }}
            </span>
          </template>

          <template #[`item.NamaJenisOrder`]="{ item }">
            <v-chip
              size="x-small"
              :color="item.jo_kode === 'BR' ? 'teal' : 'primary'"
              variant="tonal"
              class="font-weight-bold"
            >
              {{ item.NamaJenisOrder }}
            </v-chip>
          </template>

          <template #[`item.Ratio`]="{ item }">
            <span
              class="font-weight-bold"
              :class="item.LuasRiil > item.TotalLuasSistem ? 'text-error' : 'text-success'"
            >
              {{
                item.LuasRiil > 0 ? ((item.TotalLuasSistem / item.LuasRiil) * 100).toFixed(1) : "0"
              }}%
            </span>
          </template>

          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length" class="pa-0">
                <div class="detail-outer-wrapper">
                  <div class="detail-sticky-content">
                    <div class="detail-table-wrapper">
                      <div v-if="loadingDetails.has(item.NomorLhk)" class="pa-4 text-center">
                        Memuat pekerjaan...
                      </div>
                      <v-data-table
                        v-else
                        :headers="detailHeaders"
                        :items="details[item.NomorLhk]"
                        density="compact"
                        class="detail-table"
                        :items-per-page="-1"
                        hide-default-footer
                      />
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </AppDataTable>
      </div>
    </div>

    <v-dialog v-model="isConfirmDialogVisible" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">Konfirmasi Hapus</v-card-title>
        <v-card-text>
          Anda yakin ingin menghapus data LHK untuk SO:
          <strong>{{ itemToDelete?.SoDtf }}</strong> pada tanggal
          <strong>{{
            itemToDelete ? format(new Date(itemToDelete.Tanggal), "dd/MM/yyyy") : ""
          }}</strong
          >?
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="grey-darken-1" variant="text" @click="isConfirmDialogVisible = false"
            >Batal</v-btn
          >
          <v-btn color="error" variant="tonal" @click="deleteItem">Ya, Hapus</v-btn>
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
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  flex-shrink: 0;

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

/* --- Tabel Desktop Style --- */
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

/* --- Utility & State --- */
.state-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

/* Pastikan field filter tidak putih */
.filter-section :deep(.v-field),
.filter-section :deep(.v-field--variant-outlined),
.filter-section :deep(.v-field--variant-filled) {
  background-color: rgb(var(--v-theme-surface)) !important;
}

.filter-section :deep(.v-field--variant-filled .v-field__overlay) {
  background-color: rgb(var(--v-theme-surface)) !important;
}

/* Menangani teks detail yang panjang */
.so-list-container {
  max-width: 340px;
  line-height: 1.2;
  padding: 4px 0;
}

.truncate-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 10px !important;
}

.text-tiny {
  font-size: 10px;
}

/* Warna baris terpilih */
:deep(.v-data-table__selected) {
  background-color: #e3f2fd !important;
}

/* [FIX] Tata Letak Rata Kiri & Sticky (seperti SoView) */
.detail-outer-wrapper {
  background-color: #f8f9fa;
  width: 100%;
  padding: 12px 0;
  border-bottom: 1px solid #eee;
}

.detail-sticky-content {
  position: sticky;
  left: 0;
  /* Membuat konten detail tidak ikut bergeser ke kanan */
  padding-left: 50px;
  /* Sejajar dengan kolom pertama data (setelah panah) */
  width: fit-content;
}

.detail-table-wrapper {
  border: 1px solid #ddd;
  border-radius: 4px;
  background: white;
  overflow-y: auto;
  /* Aktifkan scroll vertikal */
  max-height: 400px;
  /* Batas tinggi, sesuaikan dengan kenyamanan */
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.detail-table {
  font-size: 11px !important;
}

.detail-table :deep(th),
.detail-table :deep(td) {
  text-align: left !important;
  font-size: 11px !important;
  padding: 0 12px !important;
  height: 32px !important;
}

.text-error {
  color: #d32f2f !important;
}

.text-success {
  color: #2e7d32 !important;
}

.text-deep-orange {
  color: #ff5722 !important;
}

.text-blue {
  color: #1976d2 !important;
}
</style>
