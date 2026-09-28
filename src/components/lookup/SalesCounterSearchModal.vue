<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import api from "@/services/api";

interface SalesCounter {
  kode: string;
  nama: string;
}

const emit = defineEmits(["close", "sales-counter-selected"]);

const salesCounters = ref<SalesCounter[]>([]);
const searchTerm = ref("");
const isLoading = ref(false);

const headers = [
  { title: "Kode", key: "kode", sortable: false },
  { title: "Nama", key: "nama", sortable: false },
];

const fetchAllSalesCounters = async () => {
  isLoading.value = true;
  try {
    const response = await api.get("/sales-counters");
    salesCounters.value = response.data;
  } catch (error) {
    console.error("Gagal mengambil daftar sales counter:", error);
  } finally {
    isLoading.value = false;
  }
};

const filteredSalesCounters = computed(() => {
  if (!searchTerm.value) {
    return salesCounters.value;
  }
  const lowerCaseSearch = searchTerm.value.toLowerCase();
  return salesCounters.value.filter(
    (sc) =>
      sc.kode.toLowerCase().includes(lowerCaseSearch) ||
      sc.nama.toLowerCase().includes(lowerCaseSearch)
  );
});

const selectSalesCounter = (sc: SalesCounter) => {
  emit("sales-counter-selected", sc);
};

onMounted(fetchAllSalesCounters);
</script>

<template>
  <v-dialog :model-value="true" @update:modelValue="emit('close')" max-width="900px" persistent>
    <v-card class="dialog-card d-flex flex-column" style="height: 80vh">
      <v-toolbar density="compact" class="modal-toolbar">
        <v-icon icon="mdi-account-tie-outline" class="ms-2 me-1" size="20"></v-icon>
        <v-toolbar-title class="text-subtitle-1 font-weight-bold"
          >Pilih Sales Counter</v-toolbar-title
        >
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" @click="emit('close')" variant="text" size="small"></v-btn>
      </v-toolbar>

      <v-card-text class="pa-4 d-flex flex-column flex-grow-1">
        <v-text-field
          v-model="searchTerm"
          label="Cari berdasarkan Kode atau Nama..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          clearable
          class="mb-4 flex-shrink-0 search-input"
          hide-details
        ></v-text-field>

        <v-data-table
          :headers="headers"
          :items="filteredSalesCounters"
          :loading="isLoading"
          hover
          class="desktop-table flex-grow-1"
          density="compact"
          fixed-header
        >
          <template #item="{ item }">
            <tr @click="selectSalesCounter(item)" class="sc-row">
              <td class="font-weight-bold">{{ item.kode }}</td>
              <td>{{ item.nama }}</td>
            </tr>
          </template>

          <template #loading>
            <div class="loading-state">
              <v-progress-circular indeterminate color="#b71c1c" size="32" width="3" class="mb-3" />
              <div class="text-caption text-medium-emphasis">Memuat data sales counter...</div>
            </div>
          </template>

          <template #no-data>
            <div class="empty-state">
              <v-icon
                :icon="searchTerm ? 'mdi-account-search-outline' : 'mdi-account-off-outline'"
                size="48"
                class="mb-2"
                color="grey-lighten-1"
              />
              <div v-if="searchTerm" class="text-body-2 text-medium-emphasis">
                Tidak ada sales counter dengan kata kunci <strong>"{{ searchTerm }}"</strong>.
              </div>
              <div v-else class="text-body-2 text-medium-emphasis">
                Belum ada data sales counter.
              </div>
              <v-btn
                v-if="searchTerm"
                variant="text"
                size="small"
                color="#b71c1c"
                class="mt-2"
                @click="searchTerm = ''"
              >
                Hapus pencarian
              </v-btn>
            </div>
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

.search-input :deep(.v-field--focused .v-field__outline) {
  color: #b71c1c !important;
}
.search-input :deep(.v-field--focused .v-label) {
  color: #b71c1c !important;
}
.search-input :deep(.v-icon) {
  color: rgba(183, 28, 28, 0.7);
}

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

.sc-row {
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

.empty-state,
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
}

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
  min-width: 80px;
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
