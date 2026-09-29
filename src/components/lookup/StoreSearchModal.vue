<script setup lang="ts">
import { ref, watch } from "vue";
import api from "@/services/api";

interface Store {
  kode: string;
  nama: string;
}

const props = defineProps({
  excludeBranch: { type: String, default: null },
});
const emit = defineEmits(["close", "store-selected"]);

const items = ref<Store[]>([]);
const totalItems = ref(0);
const loading = ref(true);
const search = ref("");
const options = ref({ page: 1, itemsPerPage: 10 });

const headers = [
  { title: "Kode", key: "kode", sortable: false },
  { title: "Nama Store", key: "nama", sortable: false },
];

const loadItems = async ({ page, itemsPerPage }: { page: number; itemsPerPage: number }) => {
  loading.value = true;
  try {
    const response = await api.get("/surat-jalan-form/lookup/stores", {
      // atau endpoint generik Anda
      params: {
        term: search.value,
        page: page,
        itemsPerPage: itemsPerPage,
        excludeBranch: props.excludeBranch, // Kirim prop ke backend
      },
    });
    // --- TAMBAHKAN VALIDASI RESPON INI ---
    if (
      response.data &&
      Array.isArray(response.data.items) &&
      typeof response.data.total === "number"
    ) {
      // Jika data valid, set seperti biasa
      items.value = response.data.items;
      totalItems.value = response.data.total;
    } else {
      // Jika struktur data tidak sesuai, set ke default kosong untuk mencegah error
      items.value = [];
      totalItems.value = 0;
    }
    // --- AKHIR VALIDASI ---
  } catch (error) {
    console.error("Gagal memuat data store:", error);
    items.value = [];
    totalItems.value = 0;
  } finally {
    loading.value = false;
  }
};

const selectStore = (item: Store) => {
  emit("store-selected", item);
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
</script>

<template>
  <v-dialog :model-value="true" @update:modelValue="$emit('close')" max-width="900px" persistent>
    <v-card class="dialog-card d-flex flex-column" style="height: 80vh">
      <v-toolbar density="compact" class="modal-toolbar">
        <v-icon icon="mdi-store-search-outline" class="ms-2 me-1" size="20"></v-icon>
        <v-toolbar-title class="text-subtitle-1 font-weight-bold">Pilih Store</v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" @click="$emit('close')" variant="text" size="small"></v-btn>
      </v-toolbar>
      <v-card-text class="pa-4 d-flex flex-column flex-grow-1">
        <v-text-field
          v-model="search"
          label="Cari berdasarkan kode atau nama store..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          clearable
          class="mb-4 flex-shrink-0 search-input"
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
          class="desktop-table flex-grow-1"
          density="compact"
          fixed-header
        >
          <template #item="{ item }">
            <tr @click="selectStore(item)" class="store-row">
              <td>
                <v-chip size="x-small" color="red-darken-2" variant="flat" class="font-weight-bold">
                  {{ item.kode }}
                </v-chip>
              </td>
              <td>{{ item.nama }}</td>
            </tr>
          </template>
          <template #no-data>
            <div class="text-center pa-4">Tidak ada data store.</div>
          </template>
        </v-data-table-server>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.dialog-card {
  font-size: 12px;
  border-radius: 12px;
  overflow: hidden;
}

/* Toolbar merah gradient */
.modal-toolbar {
  background: linear-gradient(135deg, #b71c1c 0%, #8e0000 100%) !important;
  color: #ffffff !important;
}

.modal-toolbar :deep(.v-toolbar-title) {
  color: #ffffff;
}

.modal-toolbar :deep(.v-btn) {
  color: #ffffff !important;
}

/* Search field */
.search-input :deep(.v-field) {
  border-radius: 8px;
}

.search-input :deep(.v-field--focused .v-field__outline) {
  color: #b71c1c !important;
}

.search-input :deep(.v-field--focused .v-label) {
  color: #b71c1c !important;
}

.search-input :deep(.v-icon) {
  color: rgba(183, 28, 28, 0.7);
}

/* Tabel */
.desktop-table {
  font-size: 11px;
}

.desktop-table :deep(td),
.desktop-table :deep(th) {
  padding: 0 8px !important;
  height: 28px !important;
}

.desktop-table :deep(thead tr th) {
  background: linear-gradient(135deg, #b71c1c 0%, #8e0000 100%) !important;
  color: #ffffff !important;
  font-weight: bold !important;
  text-transform: uppercase;
  font-size: 10.5px !important;
  border-bottom: none !important;
}

/* Baris */
.store-row {
  cursor: pointer;
  transition: background-color 0.12s ease;
}

.desktop-table :deep(tbody tr:nth-child(even)) {
  background-color: rgba(183, 28, 28, 0.02);
}

.desktop-table :deep(tbody tr:hover) {
  background-color: rgba(183, 28, 28, 0.08) !important;
}

.desktop-table :deep(tbody tr:active) {
  background-color: rgba(183, 28, 28, 0.14) !important;
}

/* Footer pagination */
.desktop-table :deep(.v-data-table-footer) {
  display: flex;
  align-items: center;
  padding: 10px 16px !important;
  background: linear-gradient(180deg, rgba(183, 28, 28, 0.03) 0%, transparent 100%);
  border-top: 2px solid rgba(183, 28, 28, 0.15);
  font-size: 12px;
}

.desktop-table :deep(.v-data-table-footer__items-per-page) {
  margin-right: auto;
  gap: 8px;
}

.desktop-table :deep(.v-data-table-footer__items-per-page .v-select) {
  max-width: 92px;
}

.desktop-table :deep(.v-data-table-footer__items-per-page .v-field__input) {
  padding-right: 4px;
  min-width: 0;
}

.desktop-table :deep(.v-data-table-footer__items-per-page .v-field) {
  border-radius: 8px;
  background-color: rgba(183, 28, 28, 0.05);
}

.desktop-table :deep(.v-data-table-footer__items-per-page .v-field__outline) {
  color: rgba(183, 28, 28, 0.25) !important;
}

.desktop-table :deep(.v-data-table-footer__info) {
  font-weight: 600;
  color: rgba(0, 0, 0, 0.65);
  margin: 0 16px;
}

.desktop-table :deep(.v-data-table-footer__pagination) {
  gap: 4px;
}

.desktop-table :deep(.v-data-table-footer .v-btn.v-btn--icon) {
  background-color: rgba(183, 28, 28, 0.06);
  border-radius: 8px !important;
  min-width: 32px !important;
  width: 32px;
  height: 32px;
  transition: all 0.15s ease;
}

.desktop-table :deep(.v-data-table-footer .v-btn.v-btn--icon .v-icon) {
  color: #b71c1c;
}

.desktop-table :deep(.v-data-table-footer .v-btn.v-btn--icon:not(.v-btn--disabled):hover) {
  background-color: #b71c1c;
  transform: translateY(-1px);
}

.desktop-table :deep(.v-data-table-footer .v-btn.v-btn--icon:not(.v-btn--disabled):hover .v-icon) {
  color: #ffffff !important;
}

.desktop-table :deep(.v-data-table-footer .v-btn.v-btn--icon.v-btn--disabled) {
  background-color: rgba(0, 0, 0, 0.03);
  opacity: 0.4;
}

.desktop-table :deep(.v-data-table-footer .v-btn.v-btn--icon.v-btn--disabled .v-icon) {
  color: rgba(0, 0, 0, 0.3);
}
</style>
