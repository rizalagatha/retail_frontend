<script setup lang="ts">
import { ref, watch } from "vue";
import api from "@/services/api";

interface BahanItem {
  kode: string;
  nama: string;
  satuan: string;
  jenis: string;
  stok: number;
}

const props = defineProps<{ cabang: string }>();
const emit = defineEmits<{
  (e: "close"): void;
  (e: "selected", item: BahanItem): void;
}>();

const items = ref<BahanItem[]>([]);
const totalItems = ref(0);
const loading = ref(false);
const search = ref("");
const options = ref({ page: 1, itemsPerPage: 10 });

const headers = [
  { title: "Kode", key: "kode", width: "130px" },
  { title: "Nama", key: "nama" },
  { title: "Satuan", key: "satuan", width: "80px", align: "center" as const },
  { title: "Jenis", key: "jenis", width: "120px", align: "center" as const },
  { title: "Stok", key: "stok", width: "80px", align: "end" as const },
];

const loadItems = async ({ page, itemsPerPage }: { page: number; itemsPerPage: number }) => {
  if (!props.cabang) return;
  loading.value = true;
  try {
    const res = await api.get("/surat-jalan-form/bahan-penolong/search", {
      params: { term: search.value, page, itemsPerPage, cabang: props.cabang },
    });
    items.value = res.data.items;
    totalItems.value = res.data.total;
  } catch {
    console.error("Gagal memuat bahan penolong.");
  } finally {
    loading.value = false;
  }
};

const selectItem = (item: BahanItem) => {
  emit("selected", item);
  emit("close");
};

let timer: number | undefined;
watch(search, () => {
  options.value.page = 1;
  clearTimeout(timer);
  timer = window.setTimeout(() => loadItems(options.value), 400);
});
</script>

<template>
  <v-dialog :model-value="true" @update:model-value="$emit('close')" max-width="900px" persistent>
    <v-card class="dialog-card d-flex flex-column" style="height: 70vh">
      <v-toolbar density="compact" class="modal-toolbar">
        <v-icon icon="mdi-package-variant-closed" class="ms-2 me-1" size="20"></v-icon>
        <v-toolbar-title class="text-subtitle-1 font-weight-bold">
          Pilih Bahan Penolong
        </v-toolbar-title>
        <v-spacer />
        <v-btn icon="mdi-close" @click="$emit('close')" variant="text" size="small" />
      </v-toolbar>

      <v-card-text class="pa-4 d-flex flex-column flex-grow-1">
        <v-text-field
          v-model="search"
          label="Cari kode atau nama bahan..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          clearable
          hide-details
          autofocus
          class="mb-4 flex-shrink-0 search-input"
        />

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
            <tr @click="selectItem(item)" class="bahan-row">
              <td>
                <v-chip size="x-small" color="red-darken-2" variant="flat" class="font-weight-bold">
                  {{ item.kode }}
                </v-chip>
              </td>
              <td>{{ item.nama }}</td>
              <td class="text-center">{{ item.satuan }}</td>
              <td class="text-center">
                <v-chip
                  :color="item.jenis === 'OBAT' ? 'purple-darken-1' : 'blue-grey-darken-1'"
                  size="x-small"
                  variant="flat"
                  class="font-weight-bold"
                >
                  {{ item.jenis }}
                </v-chip>
              </td>
              <td class="text-end">
                <span :class="item.stok <= 0 ? 'text-error font-weight-bold' : 'font-weight-bold'">
                  {{ item.stok }}
                </span>
              </td>
            </tr>
          </template>
          <template #no-data>
            <div class="text-center pa-4">Tidak ada data bahan penolong.</div>
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
.bahan-row {
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
