<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from "vue";
import api from "@/services/api";

interface Rekening {
  kode: string;
  nama: string;
  rekening: string;
}

// --- Props & Emits ---
const props = defineProps({
  cabang: { type: String, required: true },
});
const emit = defineEmits(["close", "selected"]);

// --- State ---
const items = ref<Rekening[]>([]);
const loading = ref(true);
const search = ref<string | null>("");

const headers = [
  { title: "Kode Akun", key: "kode", sortable: false, width: "150px" },
  { title: "Nama Bank", key: "nama", sortable: false },
  { title: "No. Rekening", key: "rekening", sortable: false },
] as const;

// --- Methods ---
let requestId = 0; // hanya respons terakhir yang boleh mengisi tabel
const loadItems = async () => {
  const currentRequest = ++requestId;
  loading.value = true;
  try {
    const response = await api.get<Rekening[]>("/so-form/lookup/rekening", {
      params: { term: search.value ?? "", cabang: props.cabang },
    });
    if (currentRequest !== requestId) return;
    items.value = Array.isArray(response.data) ? response.data : [];
  } catch (error) {
    if (currentRequest !== requestId) return;
    console.error("Gagal memuat data rekening:", error);
    items.value = [];
  } finally {
    if (currentRequest === requestId) loading.value = false;
  }
};

const selectItem = (item: Rekening) => {
  if (item && item.kode) {
    emit("selected", item);
    emit("close");
  }
};

// --- Watchers ---
let searchTimeout: ReturnType<typeof setTimeout>;
watch(search, () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(loadItems, 500);
});

onMounted(loadItems);
onBeforeUnmount(() => clearTimeout(searchTimeout));
</script>

<template>
  <v-dialog :model-value="true" @update:model-value="$emit('close')" max-width="800px" persistent>
    <v-card class="dialog-card d-flex flex-column" style="height: 70vh">
      <v-toolbar density="compact" class="modal-toolbar">
        <v-icon icon="mdi-bank" class="ms-2 me-1" size="20"></v-icon>
        <v-toolbar-title class="text-subtitle-1 font-weight-bold">Pilih Akun Bank</v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" @click="$emit('close')" variant="text" size="small"></v-btn>
      </v-toolbar>

      <v-card-text class="pa-4 d-flex flex-column flex-grow-1">
        <v-text-field
          v-model="search"
          label="Cari berdasarkan kode akun, nama bank, atau no. rekening..."
          variant="outlined"
          density="compact"
          clearable
          prepend-inner-icon="mdi-magnify"
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
            <tr
              class="rekening-row"
              tabindex="0"
              @click="selectItem(item)"
              @keydown.enter="selectItem(item)"
            >
              <td>{{ item.kode }}</td>
              <td>{{ item.nama }}</td>
              <td class="no-rekening">{{ item.rekening }}</td>
            </tr>
          </template>

          <template #no-data>
            <div class="pa-6 text-center empty-text">
              {{ loading ? "Memuat data..." : "Tidak ada akun bank yang cocok." }}
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

/* Toolbar merah gradient, sama dengan modal pencarian lain */
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

/* Field pencarian */
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

/* Baris: hover, klik, dan fokus keyboard terasa hidup */
.rekening-row {
  cursor: pointer;
  transition: background-color 0.12s ease;
}

.rekening-row:focus-visible {
  outline: 2px solid #b71c1c;
  outline-offset: -2px;
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

.no-rekening {
  font-variant-numeric: tabular-nums;
}

.empty-text {
  font-size: 11px;
  opacity: 0.75;
}
</style>
