<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import api from "@/services/api";
import { format } from "date-fns";

interface ProposalItem {
  nomor: string;
  tanggal: string;
  customer: string;
  jenisKaos: string;
  keterangan: string;
}

const props = defineProps({
  cabang: { type: String, required: true },
  customerKode: { type: String, required: true },
  statuses: { type: String, default: "" }, // [BARU] misal "ACC_FINANCE" atau "ACC_FINANCE,MENUNGGU_DC"
  onlyCustom: { type: Boolean, default: false }, // [BARU]
});
const emit = defineEmits(["close", "selected"]);

const items = ref<ProposalItem[]>([]);
const loading = ref(true);
const search = ref("");

const headers = [
  { title: "Nomor", key: "nomor", sortable: false, width: "200px" },
  { title: "Tanggal", key: "tanggal", sortable: false, width: "120px" },
  { title: "Customer", key: "customer", sortable: false, width: "250px" },
  { title: "Jenis Kaos", key: "jenisKaos", sortable: false, width: "200px" },
  { title: "Keterangan", key: "keterangan", sortable: false },
];

const loadItems = async () => {
  loading.value = true;
  try {
    const response = await api.get("/offer-form/search/price-proposals", {
      params: {
        term: search.value,
        cabang: props.cabang,
        customerKode: props.customerKode,
        ...(props.statuses ? { statuses: props.statuses } : {}),
        ...(props.onlyCustom ? { onlyCustom: "Y" } : {}),
      },
    });
    items.value = response.data;
  } catch (error) {
    console.error("Gagal memuat data Pengajuan Harga:", error);
  } finally {
    loading.value = false;
  }
};

const selectItem = (item: ProposalItem) => {
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
        <v-icon icon="mdi-file-document-outline" class="ms-2 me-1" size="20"></v-icon>
        <v-toolbar-title class="text-subtitle-1 font-weight-bold"
          >Pilih Pengajuan Harga</v-toolbar-title
        >
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" @click="$emit('close')" variant="text" size="small"></v-btn>
      </v-toolbar>
      <v-card-text class="pa-4 d-flex flex-column flex-grow-1">
        <v-text-field
          v-model="search"
          label="Cari berdasarkan Nomor atau Keterangan..."
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
          <template #loading>
            <div class="loading-state">
              <v-progress-circular indeterminate color="#b71c1c" size="32" width="3" class="mb-3" />
              <div class="text-caption text-medium-emphasis">Memuat data pengajuan harga...</div>
            </div>
          </template>

          <template #no-data>
            <div class="empty-state">
              <v-icon
                :icon="search ? 'mdi-file-search-outline' : 'mdi-file-document-outline'"
                size="48"
                class="mb-2"
                color="grey-lighten-1"
              />
              <div v-if="search" class="text-body-2 text-medium-emphasis">
                Tidak ada pengajuan harga yang cocok dengan
                <strong>"{{ search }}"</strong>.
              </div>
              <div v-else class="text-body-2 text-medium-emphasis">
                Belum ada pengajuan harga untuk customer ini.
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

          <template #item="{ item }">
            <tr @click="selectItem(item)" class="proposal-row">
              <td class="font-weight-bold">{{ item.nomor }}</td>
              <td>{{ format(new Date(item.tanggal), "dd/MM/yyyy") }}</td>
              <td>{{ item.customer }}</td>
              <td>{{ item.jenisKaos }}</td>
              <td>{{ item.keterangan }}</td>
            </tr>
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

.proposal-row {
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
