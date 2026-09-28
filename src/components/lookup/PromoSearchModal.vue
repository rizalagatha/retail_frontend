<script setup lang="ts">
import { ref, onMounted } from "vue";
import api from "@/services/api";
import { useToast } from "vue-toastification";
import axios from "axios";

interface Promo {
  nomor: string;
  namaPromo: string;
}

const props = defineProps({
  tanggal: { type: String, required: true },
});
const emit = defineEmits(["close", "selected"]);
const toast = useToast();

const items = ref<Promo[]>([]);
const loading = ref(false);
const search = ref("");

const headers = [
  { title: "Nomor Promo", key: "nomor" },
  { title: "Nama Promo", key: "namaPromo" },
];

const loadItems = async () => {
  loading.value = true;
  try {
    const response = await api.get("/invoice-form/lookup/promo", {
      params: { term: search.value, tanggal: props.tanggal },
    });
    items.value = response.data;
  } catch (error: unknown) {
    // [PERBAIKAN 1] Beri tipe unknown
    // [PERBAIKAN 2] Jadikan satu string yang aman
    let errorMessage = "Gagal memuat data promo.";

    if (axios.isAxiosError(error)) {
      errorMessage = error.response?.data?.message || errorMessage;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    // [PERBAIKAN 3] Masukkan sebagai 1 parameter saja
    toast.error(errorMessage);
  } finally {
    loading.value = false;
  }
};

const selectItem = (item: Promo) => {
  emit("selected", item);
  emit("close");
};

const handleRowClick = (event: Event, data: { item: Promo }) => {
  selectItem(data.item);
};

onMounted(loadItems);
</script>

<template>
  <v-dialog :model-value="true" @update:modelValue="$emit('close')" max-width="800px" persistent>
    <v-card class="dialog-card d-flex flex-column" style="height: 70vh">
      <v-toolbar density="compact" class="modal-toolbar">
        <v-icon size="20" class="ms-2 me-2">mdi-ticket-percent-outline</v-icon>
        <v-toolbar-title class="text-subtitle-1 font-weight-bold">Pilih Promo</v-toolbar-title>
        <v-spacer />
        <v-btn icon="mdi-close" @click="$emit('close')" variant="text" size="small" />
      </v-toolbar>
      <v-card-text class="pa-4 d-flex flex-column flex-grow-1">
        <v-text-field
          v-model="search"
          @input="loadItems"
          label="Cari berdasarkan nomor atau nama promo..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          clearable
          class="mb-4 flex-shrink-0 search-input"
          hide-details
          autofocus
        />
        <v-data-table
          :headers="headers"
          :items="items"
          :loading="loading"
          hover
          class="desktop-table flex-grow-1"
          density="compact"
          fixed-header
          :items-per-page="-1"
          @click:row="handleRowClick"
        >
          <template #item="{ item }">
            <tr @click="selectItem(item)" class="promo-row">
              <td class="font-weight-bold">{{ item.nomor }}</td>
              <td>{{ item.namaPromo }}</td>
            </tr>
          </template>

          <template #loading>
            <div class="loading-state">
              <v-progress-circular indeterminate color="#b71c1c" size="32" width="3" class="mb-3" />
              <div class="text-caption text-medium-emphasis">Memuat data promo...</div>
            </div>
          </template>

          <template #no-data>
            <div class="empty-state">
              <v-icon
                :icon="search ? 'mdi-file-search-outline' : 'mdi-ticket-percent-outline'"
                size="48"
                class="mb-2"
                color="grey-lighten-1"
              />
              <div v-if="search" class="text-body-2 text-medium-emphasis">
                Tidak ada promo yang cocok dengan <strong>"{{ search }}"</strong>.
              </div>
              <div v-else class="text-body-2 text-medium-emphasis">
                Tidak ada promo aktif untuk tanggal ini.
              </div>
              <v-btn
                v-if="search"
                variant="text"
                size="small"
                color="#b71c1c"
                class="mt-2"
                @click="
                  search = '';
                  loadItems();
                "
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

.promo-row {
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
