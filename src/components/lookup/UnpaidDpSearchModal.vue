<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import api from "@/services/api";
import { useToast } from "vue-toastification";
import { formatRupiah } from "@/utils/formatRupiah";
import axios from "axios";

interface UnpaidDp {
  nomor: string;
  jenis: string;
  nominal: number;
}

const props = defineProps({
  customerKode: { type: String, required: true },
});
const emit = defineEmits(["close", "selected"]);
const toast = useToast();

const items = ref<UnpaidDp[]>([]);
const loading = ref(true);
const search = ref("");

const filteredItems = computed(() => {
  if (!search.value) return items.value;
  return items.value.filter((item) =>
    item.nomor.toLowerCase().includes(search.value.toLowerCase())
  );
});

const headers = [
  { title: "Nomor Setoran", key: "nomor" },
  { title: "Jenis", key: "jenis" },
  { title: "Sisa Nominal", key: "nominal", align: "end" },
] as const;

const loadItems = async () => {
  loading.value = true;
  try {
    const response = await api.get(`/invoice-form/lookup/unpaid-dp/${props.customerKode}`);
    items.value = response.data;
  } catch (error: unknown) {
    // <-- Ubah ke unknown
    // Ekstrak pesan jadi string aman
    let errorMessage = "Gagal memuat data DP yang belum lunas.";
    if (axios.isAxiosError(error)) {
      errorMessage = error.response?.data?.message || errorMessage;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }
    toast.error(errorMessage); // <-- Lempar 1 parameter saja
  } finally {
    loading.value = false;
  }
};

const selectItem = (item: UnpaidDp) => {
  emit("selected", item);
  emit("close");
};

const handleRowClick = (event: Event, data: { item: UnpaidDp }) => {
  selectItem(data.item);
};

onMounted(loadItems);
</script>

<template>
  <v-dialog :model-value="true" @update:modelValue="$emit('close')" max-width="800px" persistent>
    <v-card class="d-flex flex-column" style="height: 70vh">
      <v-toolbar density="compact" class="modal-toolbar">
        <v-icon icon="mdi-cash-search" class="ms-2 me-1" size="20"></v-icon>
        <v-toolbar-title class="text-subtitle-1 font-weight-bold"
          >Pilih DP / Setoran</v-toolbar-title
        >
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" @click="$emit('close')" variant="text" size="small"></v-btn>
      </v-toolbar>

      <v-card-text class="pa-4 d-flex flex-column flex-grow-1">
        <v-text-field
          v-model="search"
          label="Cari berdasarkan nomor setoran..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          clearable
          class="mb-4 flex-shrink-0 search-input"
          hide-details
          autofocus
        ></v-text-field>

        <div class="table-container">
          <v-data-table
            :headers="headers"
            :items="filteredItems"
            :loading="loading"
            density="compact"
            class="desktop-table"
            fixed-header
            hover
            :items-per-page="-1"
            @click:row="handleRowClick"
          >
            <template #[`item.nomor`]="{ value }">
              <span class="font-weight-bold">{{ value }}</span>
            </template>
            <template #[`item.jenis`]="{ value }">
              <v-chip size="x-small" color="red-darken-2" variant="flat" class="font-weight-bold">
                {{ value }}
              </v-chip>
            </template>
            <template #[`item.nominal`]="{ value }">
              <span class="font-weight-bold nominal-text">{{ formatRupiah(value) }}</span>
            </template>

            <template #loading>
              <div class="loading-state">
                <v-progress-circular
                  indeterminate
                  color="#b71c1c"
                  size="32"
                  width="3"
                  class="mb-3"
                />
                <div class="text-caption text-medium-emphasis">Memuat data DP/setoran...</div>
              </div>
            </template>

            <template #no-data>
              <div class="empty-state">
                <v-icon
                  :icon="search ? 'mdi-file-search-outline' : 'mdi-cash-remove'"
                  size="48"
                  class="mb-2"
                  color="grey-lighten-1"
                />
                <div v-if="search" class="text-body-2 text-medium-emphasis">
                  Tidak ada DP/setoran dengan nomor <strong>"{{ search }}"</strong>.
                </div>
                <div v-else class="text-body-2 text-medium-emphasis">
                  Tidak ada DP/setoran sisa untuk customer ini.
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
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
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

.desktop-table :deep(thead tr th) {
  background: linear-gradient(135deg, #b71c1c 0%, #8e0000 100%) !important;
  color: #ffffff !important;
  font-weight: bold !important;
  text-transform: uppercase;
  font-size: 10.5px !important;
}

.desktop-table :deep(tbody tr:nth-child(even)) {
  background-color: rgba(183, 28, 28, 0.02);
}
.desktop-table :deep(tbody tr:hover) {
  background-color: rgba(183, 28, 28, 0.08) !important;
  cursor: pointer;
}

.nominal-text {
  color: #b71c1c;
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
