<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import api from "@/services/api";
import { useToast } from "vue-toastification";
import { format, parseISO } from "date-fns";
import axios from "axios";

interface Sj {
  NoSJ: string;
  TglSJ: string;
  NoPermintaan: string;
  NoTerimaSJ: string;
  NoSO: string;
  KdCus: string;
  Customer: string;
  Alamat: string;
  Kota: string;
}

interface TableOptions {
  page: number;
  itemsPerPage: number;
}

const props = defineProps({
  cabang: { type: String, required: true },
});

const emit = defineEmits(["close", "sj-selected"]);
const toast = useToast();

const items = ref<Sj[]>([]);
const totalItems = ref(0);
const loading = ref(true);
const search = ref("");

// Definisi Header sesuai request & referensi Delphi
const headers = [
  { title: "No. SJ", key: "NoSJ" },
  { title: "Tanggal", key: "TglSJ" },
  { title: "No. Terima SJ", key: "NoTerimaSJ" },
  { title: "No. SO", key: "NoSO" },
  { title: "Kd. Cus", key: "KdCus" },
  { title: "Customer", key: "Customer" },
  { title: "Alamat", key: "Alamat" },
  { title: "Kota", key: "Kota" },
];

const options = ref({ page: 1, itemsPerPage: 15, sortBy: [] });

const itemsPerPageOptions = [
  { value: 15, title: "15" },
  { value: 30, title: "30" },
  { value: 50, title: "50" },
  { value: -1, title: "Semua" }, // Nilai -1 digunakan untuk "All"
];

const loadItems = async (optionsEvent?: TableOptions) => {
  loading.value = true;

  const { page, itemsPerPage } = optionsEvent || options.value;

  try {
    const response = await api.get("/invoice-form/lookup/sj-list", {
      params: {
        cabang: props.cabang,
        term: search.value,
        page: page,
        itemsPerPage: itemsPerPage,
      },
    });

    if (response.data && response.data.items) {
      items.value = response.data.items;
      totalItems.value = response.data.total;
    } else {
      items.value = Array.isArray(response.data) ? response.data : [];
      totalItems.value = items.value.length;
    }
  } catch (error: unknown) {
    // [PERBAIKAN 4] Gunakan unknown
    // [PERBAIKAN 5] Ekstrak pesan error menjadi satu string yang aman
    let errorMessage = "Gagal memuat data Surat Jalan.";
    if (axios.isAxiosError(error)) {
      errorMessage = error.response?.data?.message || errorMessage;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }
    toast.error(errorMessage);
  } finally {
    loading.value = false;
  }
};

const selectItem = (item: Sj) => {
  emit("sj-selected", item);
  emit("close");
};

let searchTimeout: ReturnType<typeof setTimeout>;
watch(search, () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    // Cukup reset ke page 1, v-data-table-server akan otomatis trigger loadItems
    // karena options.page berubah secara reaktif
    options.value.page = 1;
    loadItems();
  }, 500);
});

onMounted(() => {
  loadItems(options.value);
});
</script>

<template>
  <v-dialog :model-value="true" @update:model-value="$emit('close')" max-width="1200px" persistent>
    <v-card class="d-flex flex-column sj-search-card" style="height: 80vh">
      <div class="sj-search-header">
        <div class="header-icon-circle">
          <v-icon icon="mdi-truck-delivery-outline" size="20" color="white" />
        </div>
        <div class="header-text">
          <div class="header-title">Cari Surat Jalan (KPR)</div>
          <div class="header-subtitle">{{ totalItems }} SJ ditemukan</div>
        </div>
        <v-btn icon="mdi-close" variant="text" size="small" color="white" @click="$emit('close')" />
      </div>

      <v-card-text class="pa-4 d-flex flex-column flex-grow-1" style="min-height: 0">
        <v-text-field
          v-model="search"
          label="Cari berdasarkan nomor SJ, SO, atau nama customer..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          clearable
          class="mb-3 flex-shrink-0 sj-search-input"
          hide-details
          autofocus
        ></v-text-field>

        <v-data-table-server
          v-model:page="options.page"
          v-model:items-per-page="options.itemsPerPage"
          :items-per-page-options="itemsPerPageOptions"
          :headers="headers"
          :items="items"
          :items-length="totalItems"
          :loading="loading"
          @update:options="loadItems"
          hover
          class="desktop-table sj-search-table flex-grow-1"
          density="compact"
          fixed-header
          no-data-text=""
        >
          <template #item="{ item }">
            <tr class="sj-row" @click="selectItem(item)">
              <td>
                <div class="d-flex align-center">
                  <v-icon size="16" color="#b71c1c" class="mr-2">mdi-file-document</v-icon>
                  <span class="font-weight-bold sj-nomor">{{ item.NoSJ }}</span>
                </div>
              </td>
              <td>{{ item.TglSJ ? format(parseISO(item.TglSJ), "dd/MM/yyyy") : "-" }}</td>
              <td>
                <v-chip
                  size="x-small"
                  :color="item.NoTerimaSJ ? 'success' : 'error'"
                  variant="flat"
                  class="font-weight-bold"
                >
                  {{ item.NoTerimaSJ || "BELUM TERIMA" }}
                </v-chip>
              </td>
              <td>{{ item.NoSO || "-" }}</td>
              <td>{{ item.KdCus }}</td>
              <td>
                <div class="cust-name">{{ item.Customer }}</div>
              </td>
              <td>
                <div class="text-truncate-cell">{{ item.Alamat }}</div>
              </td>
              <td>{{ item.Kota }}</td>
              <td class="text-center">
                <v-icon size="18" color="grey-lighten-1">mdi-chevron-right</v-icon>
              </td>
            </tr>
          </template>

          <template #loading>
            <v-skeleton-loader type="table-row@5"></v-skeleton-loader>
          </template>

          <template #no-data>
            <div class="empty-sj-state">
              <v-icon size="40">mdi-truck-remove-outline</v-icon>
              <div class="empty-title">Tidak ada Surat Jalan ditemukan</div>
              <div class="empty-subtitle">Coba ubah kata kunci pencarian</div>
            </div>
          </template>
        </v-data-table-server>
      </v-card-text>

      <v-divider />
      <v-card-actions class="pa-3">
        <v-spacer />
        <v-btn variant="tonal" color="grey-darken-1" @click="$emit('close')">Tutup</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.desktop-table :deep(table) {
  width: 100%;
}

.text-truncate {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ══════════════ HEADER MODAL ══════════════ */
.sj-search-card {
  overflow: hidden;
}

.sj-search-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px 14px 20px;
  background: linear-gradient(135deg, #b71c1c 0%, #8e0000 100%);
  flex-shrink: 0;
}

.header-icon-circle {
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.22);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.header-text {
  flex-grow: 1;
  min-width: 0;
}

.header-title {
  color: white;
  font-size: 15px;
  font-weight: 800;
  line-height: 1.3;
}

.header-subtitle {
  color: rgba(255, 255, 255, 0.85);
  font-size: 11.5px;
  font-weight: 500;
  margin-top: 1px;
}

.sj-search-input :deep(.v-field--focused .v-field__outline) {
  color: #b71c1c !important;
}

/* ══════════════ TABEL ══════════════ */
.sj-search-table :deep(thead tr th) {
  background: linear-gradient(135deg, #b71c1c 0%, #8e0000 100%) !important;
  color: #ffffff !important;
  font-weight: bold !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 38px !important;
  border-bottom: none !important;
}

.sj-row {
  cursor: pointer;
  transition: background-color 0.12s ease;
}

.sj-row:hover {
  background-color: rgba(183, 28, 28, 0.06) !important;
}

.sj-row:active {
  background-color: rgba(183, 28, 28, 0.12) !important;
}

.sj-search-table :deep(tbody tr:nth-child(even)) {
  background-color: rgba(183, 28, 28, 0.02);
}

.sj-nomor {
  color: #b71c1c;
}

.cust-name {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
}

.text-truncate-cell {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

/* ══════════════ EMPTY STATE ══════════════ */
.empty-sj-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  color: rgba(0, 0, 0, 0.4);
  text-align: center;
}

.empty-sj-state .v-icon {
  color: rgba(183, 28, 28, 0.25);
  margin-bottom: 8px;
}

.empty-title {
  font-size: 14px;
  font-weight: 700;
  color: rgba(0, 0, 0, 0.55);
}

.empty-subtitle {
  font-size: 12px;
  margin-top: 2px;
}

/* ══════════════ PAGINATION FOOTER ══════════════ */
.sj-search-table :deep(.v-data-table-footer) {
  padding: 8px 16px !important;
  border-top: 2px solid rgba(183, 28, 28, 0.15);
  background: linear-gradient(180deg, rgba(183, 28, 28, 0.03) 0%, transparent 100%);
  font-size: 12px;
}

.sj-search-table :deep(.v-data-table-footer__items-per-page .v-field) {
  border-radius: 8px;
  background-color: rgba(183, 28, 28, 0.05);
}

.sj-search-table :deep(.v-data-table-footer__items-per-page .v-field__outline) {
  color: rgba(183, 28, 28, 0.25) !important;
}

.sj-search-table :deep(.v-data-table-footer .v-btn.v-btn--icon) {
  background-color: rgba(183, 28, 28, 0.06);
  border-radius: 8px !important;
  min-width: 32px !important;
  width: 32px;
  height: 32px;
  transition: all 0.15s ease;
}

.sj-search-table :deep(.v-data-table-footer .v-btn.v-btn--icon .v-icon) {
  color: #b71c1c;
}

.sj-search-table :deep(.v-data-table-footer .v-btn.v-btn--icon:not(.v-btn--disabled):hover) {
  background-color: #b71c1c;
}

.sj-search-table
  :deep(.v-data-table-footer .v-btn.v-btn--icon:not(.v-btn--disabled):hover .v-icon) {
  color: #ffffff !important;
}

.sj-search-table :deep(.v-data-table-footer .v-btn.v-btn--icon.v-btn--disabled) {
  background-color: rgba(0, 0, 0, 0.03);
  opacity: 0.4;
}

.sj-search-table :deep(.v-data-table-footer__info) {
  font-weight: 600;
  color: rgba(0, 0, 0, 0.6);
}
</style>
