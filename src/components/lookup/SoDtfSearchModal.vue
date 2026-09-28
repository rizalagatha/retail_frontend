<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import api from "@/services/api";
import { format } from "date-fns";

interface SoDtfItem {
  nomor: string;
  tanggal: string;
  namaDtf: string;
  keterangan: string;
  isLhk: number;
}

const props = defineProps({
  cabang: { type: String, required: true },
  customerKode: { type: String, required: true },
});
const emit = defineEmits(["close", "selected"]);

const items = ref<SoDtfItem[]>([]);
const loading = ref(true);
const search = ref("");

const headers = [
  { title: "Nomor", key: "nomor", sortable: false, width: "200px" },
  { title: "Tanggal", key: "tanggal", sortable: false, width: "120px" },
  { title: "Nama DTF", key: "namaDtf", sortable: false, width: "40%" },
  { title: "Status LHK", key: "isLhk", width: "120px" },
  { title: "Keterangan", key: "keterangan", sortable: false },
];

const loadItems = async () => {
  loading.value = true;
  try {
    const response = await api.get("/invoice-form/lookup/so-dtf", {
      params: {
        term: search.value,
        cabang: props.cabang,
        customerKode: props.customerKode,
      },
    });
    items.value = response.data;
  } catch (error) {
    console.error("Gagal memuat data SO DTF:", error);
  } finally {
    loading.value = false;
  }
};

const selectItem = (item: SoDtfItem) => {
  emit("selected", item);
  emit("close");
};

let searchTimeout: ReturnType<typeof setTimeout>;
watch(search, () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => loadItems(), 500);
});

onMounted(loadItems);
</script>

<template>
  <v-dialog :model-value="true" @update:model-value="$emit('close')" max-width="1200px" persistent>
    <v-card class="dialog-card d-flex flex-column" style="height: 80vh">
      <v-toolbar density="compact" class="modal-toolbar">
        <v-icon icon="mdi-file-find-outline" class="ms-2 me-1" size="20"></v-icon>
        <v-toolbar-title class="text-subtitle-1 font-weight-bold">Pilih SO DTF</v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" @click="$emit('close')" variant="text" size="small"></v-btn>
      </v-toolbar>
      <v-card-text class="pa-4 d-flex flex-column flex-grow-1">
        <v-text-field
          v-model="search"
          label="Cari berdasarkan Nomor atau Nama DTF..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          clearable
          class="mb-4 flex-shrink-0 search-input"
          hide-details
          autofocus
        ></v-text-field>
        <v-data-table
          :headers="headers"
          :items="items"
          :loading="loading"
          hover
          class="desktop-table flex-grow-1"
          density="compact"
          fixed-header
          :items-per-page="-1"
        >
          <template #item="{ item }">
            <tr @click="selectItem(item)" class="sodtf-row">
              <td class="font-weight-bold">{{ item.nomor }}</td>
              <td>{{ format(new Date(item.tanggal), "dd/MM/yyyy") }}</td>
              <td>{{ item.namaDtf }}</td>
              <td>
                <v-chip
                  size="x-small"
                  :color="item.isLhk ? 'success' : 'warning'"
                  variant="flat"
                  class="font-weight-bold"
                >
                  {{ item.isLhk ? "SUDAH LHK" : "BELUM LHK" }}
                </v-chip>
              </td>
              <td>{{ item.keterangan }}</td>
            </tr>
          </template>

          <template #loading>
            <div class="loading-state">
              <v-progress-circular indeterminate color="#b71c1c" size="32" width="3" class="mb-3" />
              <div class="text-caption text-medium-emphasis">Memuat data SO DTF...</div>
            </div>
          </template>

          <template #no-data>
            <div class="empty-state">
              <v-icon
                :icon="search ? 'mdi-file-search-outline' : 'mdi-printer-off-outline'"
                size="48"
                class="mb-2"
                color="grey-lighten-1"
              />
              <div v-if="search" class="text-body-2 text-medium-emphasis">
                Tidak ada SO DTF yang cocok dengan <strong>"{{ search }}"</strong>.
              </div>
              <div v-else class="text-body-2 text-medium-emphasis">
                Belum ada SO DTF yang tersedia, atau semuanya masih dalam pengerjaan (belum LHK).
              </div>
              <v-btn
                v-if="search"
                variant="text"
                size="small"
                color="#b71c1c"
                class="mt-2"
                @click="search = ''"
              >
                Hapus pencarian
              </v-btn>
            </div>
          </template>

          <template #bottom></template>
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

.sodtf-row {
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
</style>
