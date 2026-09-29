<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import api from "@/services/api";
import { useToast } from "vue-toastification";
import { format, subMonths, addDays } from "date-fns";

// 1. Definisi Interface
interface PackingListItem {
  Nomor: string;
  Tanggal: string;
  Keterangan: string;
  Usr: string;
  Status: string;
  [key: string]: unknown;
}

const props = defineProps<{
  storeKode: string;
}>();

// 2. Update Emit agar Type-Safe
const emit = defineEmits<{
  (e: "close"): void;
  (e: "selected", item: PackingListItem): void; // Menggunakan interface di sini
}>();

const toast = useToast();

// 3. Gunakan Interface pada Ref
const items = ref<PackingListItem[]>([]);
const loading = ref(false);
const search = ref("");

const headers = [
  { title: "No. Packing List", key: "Nomor", width: "140px" },
  { title: "Tanggal", key: "Tanggal", width: "90px" },
  { title: "Keterangan", key: "Keterangan" },
  { title: "User", key: "Usr", width: "100px" },
];

const loadData = async () => {
  if (!props.storeKode) return;

  loading.value = true;
  try {
    const startDate = format(subMonths(new Date(), 2), "yyyy-MM-dd");
    const endDate = format(addDays(new Date(), 1), "yyyy-MM-dd");

    // Gunakan Generic Type pada API call
    const response = await api.get<PackingListItem[]>("/packing-list", {
      params: {
        startDate,
        endDate,
        cabang: props.storeKode,
        status: "O",
        search: search.value,
      },
    });

    items.value = response.data.filter((i) => i.Status === "O" || i.Status === "OPEN");
  } catch (error) {
    console.error(error);
    toast.error("Gagal memuat data Packing List.");
  } finally {
    loading.value = false;
  }
};

// 4. [FIX] Ganti 'any' dengan 'PackingListItem'
const selectItem = (item: PackingListItem) => {
  if (!item) return;
  emit("selected", item);
  emit("close");
};

const handleRowClick = (event: Event, row: { item: PackingListItem }) => {
  selectItem(row.item);
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return "-";
  return format(new Date(dateStr), "dd-MM-yyyy");
};

watch(() => props.storeKode, loadData);
onMounted(loadData);
</script>

<template>
  <v-dialog :model-value="true" @update:modelValue="$emit('close')" max-width="850px" persistent>
    <v-card class="dialog-card d-flex flex-column" style="height: 80vh">
      <v-toolbar density="compact" class="modal-toolbar">
        <v-icon icon="mdi-clipboard-list-outline" class="ms-2 me-1" size="20"></v-icon>
        <v-toolbar-title class="text-subtitle-1 font-weight-bold">
          Pilih Packing List (Pra-SJ) - Store {{ storeKode }}
        </v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" @click="$emit('close')" variant="text" size="small"></v-btn>
      </v-toolbar>

      <v-card-text class="pa-4 d-flex flex-column flex-grow-1">
        <v-text-field
          v-model="search"
          label="Cari Nomor PL / Keterangan..."
          placeholder="Ketik lalu tekan Enter"
          prepend-inner-icon="mdi-magnify"
          density="compact"
          variant="outlined"
          hide-details
          autofocus
          class="mb-4 flex-shrink-0 search-input"
          @keydown.enter="loadData"
        ></v-text-field>

        <v-data-table
          :headers="headers"
          :items="items"
          :loading="loading"
          density="compact"
          fixed-header
          height="calc(80vh - 200px)"
          class="desktop-table flex-grow-1"
          :items-per-page="10"
          hover
          @click:row="handleRowClick"
        >
          <template #[`item.Nomor`]="{ item }">
            <v-chip size="x-small" color="red-darken-2" variant="flat" class="font-weight-bold">
              {{ item.Nomor }}
            </v-chip>
          </template>
          <template #[`item.Tanggal`]="{ item }">
            {{ formatDate(item.Tanggal) }}
          </template>
          <template #no-data>
            <div class="text-center pa-4">Tidak ada Packing List yang masih OPEN.</div>
          </template>
        </v-data-table>
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

.search-input :deep(.v-field__input),
.search-input :deep(.v-label) {
  font-size: 11px !important;
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

.desktop-table :deep(tbody tr) {
  cursor: pointer;
  transition: background-color 0.12s ease;
}

.desktop-table :deep(tbody tr td) {
  font-size: 11px !important;
  border-bottom: 1px solid #f0f0f0 !important;
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
