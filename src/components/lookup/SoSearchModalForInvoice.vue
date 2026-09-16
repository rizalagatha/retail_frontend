<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import api from "@/services/api";
import { useToast } from "vue-toastification";
import { format, parseISO } from "date-fns";

interface So {
  Nomor: string;
  Tanggal: string;
  Customer: string;
  Alamat: string;
  Kota: string;
}

const props = defineProps({
  cabang: { type: String, required: true },
  mode: { type: String, default: "invoice" }, // ⭐ invoice | dtf
});
const emit = defineEmits(["close", "so-selected"]);
const toast = useToast();

const items = ref<So[]>([]);
const totalItems = ref(0);
const loading = ref(true);
const search = ref("");
const options = ref({ page: 1, itemsPerPage: 15 });

const headers = [
  { title: "Nomor SO", key: "Nomor" },
  { title: "Tanggal", key: "Tanggal" },
  { title: "Customer", key: "Customer" },
  { title: "Alamat", key: "Alamat" },
  { title: "Kota", key: "Kota" },
  { title: "", key: "actions", sortable: false, width: "40px" },
];

const getEndpoint = () => {
  return props.mode === "dtf" ? "/so-dtf-form/lookup/so" : "/invoice-form/lookup/so";
};

const loadItems = async ({ page, itemsPerPage }: { page: number; itemsPerPage: number }) => {
  loading.value = true;
  try {
    const endpoint = getEndpoint();

    const response = await api.get(endpoint, {
      params: {
        cabang: props.cabang,
        term: search.value,
        page,
        itemsPerPage,
      },
    });
    if (response.data && Array.isArray(response.data.items)) {
      items.value = response.data.items;
      totalItems.value = response.data.total;
    } else {
      items.value = [];
      totalItems.value = 0;
    }
  } catch {
    toast.error("Gagal memuat data SO.");
    items.value = [];
    totalItems.value = 0;
  } finally {
    loading.value = false;
  }
};

const selectItem = (item: So) => {
  emit("so-selected", item);
  emit("close");
};

let searchTimeout: ReturnType<typeof setTimeout>;
watch(search, () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    options.value.page = 1;
    loadItems(options.value);
  }, 500);
});

onMounted(() => {
  loadItems(options.value);
});
</script>

<template>
  <v-dialog :model-value="true" @update:model-value="$emit('close')" max-width="1000px" persistent>
    <v-card class="d-flex flex-column so-search-card" style="height: 80vh">
      <div class="so-search-header">
        <div class="header-icon-circle">
          <v-icon icon="mdi-file-document-outline" size="20" color="white" />
        </div>
        <div class="header-text">
          <div class="header-title">Cari Surat Pesanan (SO)</div>
          <div class="header-subtitle">{{ totalItems }} SO ditemukan</div>
        </div>
        <v-btn icon="mdi-close" variant="text" size="small" color="white" @click="$emit('close')" />
      </div>

      <v-card-text class="pa-4 d-flex flex-column flex-grow-1" style="min-height: 0">
        <v-text-field
          v-model="search"
          label="Cari berdasarkan nomor SO atau nama customer..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          clearable
          class="mb-3 flex-shrink-0 so-search-input"
          hide-details
          autofocus
        ></v-text-field>

        <v-data-table-server
          v-model:page="options.page"
          v-model:items-per-page="options.itemsPerPage"
          :headers="headers"
          :items="items"
          :items-length="totalItems"
          :loading="loading"
          @update:options="loadItems"
          hover
          class="desktop-table so-search-table flex-grow-1"
          density="compact"
          fixed-header
          no-data-text=""
        >
          <template #item="{ item }">
            <tr class="so-row" @click="selectItem(item)">
              <td>
                <div class="d-flex align-center">
                  <v-icon size="16" color="#b71c1c" class="mr-2">mdi-file-document</v-icon>
                  <span class="font-weight-bold so-nomor">{{ item.Nomor }}</span>
                </div>
              </td>
              <td>{{ format(parseISO(item.Tanggal), "dd/MM/yyyy") }}</td>
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

          <template #no-data>
            <div class="empty-so-state">
              <v-icon size="40">mdi-file-search-outline</v-icon>
              <div class="empty-title">Tidak ada SO ditemukan</div>
              <div class="empty-subtitle">Coba ubah kata kunci pencarian</div>
            </div>
          </template>
        </v-data-table-server>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.so-search-card {
  overflow: hidden;
}

.so-search-header {
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

.so-search-input :deep(.v-field--focused .v-field__outline) {
  color: #b71c1c !important;
}

.so-search-table :deep(thead tr th) {
  background: linear-gradient(135deg, #b71c1c 0%, #8e0000 100%) !important;
  color: #ffffff !important;
  font-weight: bold !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 38px !important;
  border-bottom: none !important;
}

.so-row {
  cursor: pointer;
  transition: background-color 0.12s ease;
}

.so-row:hover {
  background-color: rgba(183, 28, 28, 0.06) !important;
}

.so-row:active {
  background-color: rgba(183, 28, 28, 0.12) !important;
}

.so-search-table :deep(tbody tr:nth-child(even)) {
  background-color: rgba(183, 28, 28, 0.02);
}

.so-nomor {
  color: #b71c1c;
}

.cust-name {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

.text-truncate-cell {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 220px;
}

.empty-so-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
  color: rgba(0, 0, 0, 0.4);
  text-align: center;
}

.empty-so-state .v-icon {
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
/* ══════════════ PAGINATION FOOTER (Items per page) ══════════════ */
.so-search-table :deep(.v-data-table-footer) {
  padding: 8px 16px !important;
  border-top: 2px solid rgba(183, 28, 28, 0.15);
  background: linear-gradient(180deg, rgba(183, 28, 28, 0.03) 0%, transparent 100%);
  font-size: 12px;
}

.so-search-table :deep(.v-data-table-footer__items-per-page .v-field) {
  border-radius: 8px;
  background-color: rgba(183, 28, 28, 0.05);
}

.so-search-table :deep(.v-data-table-footer__items-per-page .v-field__outline) {
  color: rgba(183, 28, 28, 0.25) !important;
}

.so-search-table :deep(.v-data-table-footer .v-btn.v-btn--icon) {
  background-color: rgba(183, 28, 28, 0.06);
  border-radius: 8px !important;
  min-width: 32px !important;
  width: 32px;
  height: 32px;
  transition: all 0.15s ease;
}

.so-search-table :deep(.v-data-table-footer .v-btn.v-btn--icon .v-icon) {
  color: #b71c1c;
}

.so-search-table :deep(.v-data-table-footer .v-btn.v-btn--icon:not(.v-btn--disabled):hover) {
  background-color: #b71c1c;
}

.so-search-table
  :deep(.v-data-table-footer .v-btn.v-btn--icon:not(.v-btn--disabled):hover .v-icon) {
  color: #ffffff !important;
}

.so-search-table :deep(.v-data-table-footer .v-btn.v-btn--icon.v-btn--disabled) {
  background-color: rgba(0, 0, 0, 0.03);
  opacity: 0.4;
}

.so-search-table :deep(.v-data-table-footer__info) {
  font-weight: 600;
  color: rgba(0, 0, 0, 0.6);
}
</style>
