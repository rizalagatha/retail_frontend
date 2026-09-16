<script setup lang="ts">
import { ref, onMounted } from "vue";
import api from "@/services/api";
import { useToast } from "vue-toastification";
import axios from "axios";

interface BonusItem {
  kode: string;
  nama: string;
  ukuran: string;
  stok: number;
}

const props = defineProps({
  promoNomor: { type: String, required: true },
});
const emit = defineEmits(["close", "selected"]);
const toast = useToast();
const items = ref<BonusItem[]>([]);
const loading = ref(true);

const headers = [
  { title: "Kode", key: "kode" },
  { title: "Nama Barang", key: "nama" },
  { title: "Ukuran", key: "ukuran" },
  { title: "Stok", key: "stok", align: "end" },
] as const;

onMounted(async () => {
  try {
    const response = await api.get(`/invoice-form/lookup/promo-bonus/${props.promoNomor}`);
    items.value = response.data;
  } catch (error: unknown) {
    // [PERBAIKAN] 3. Ekstrak pesan error agar tipenya valid (String)
    let errorMessage = "Gagal memuat item bonus.";
    if (axios.isAxiosError(error)) {
      errorMessage = error.response?.data?.message || errorMessage;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }
    toast.error(errorMessage);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <v-dialog :model-value="true" @update:modelValue="$emit('close')" max-width="800px" persistent>
    <v-card class="dialog-card">
      <v-toolbar density="compact" class="modal-toolbar">
        <v-icon size="20" class="ms-2 me-2">mdi-gift-outline</v-icon>
        <v-toolbar-title class="text-subtitle-1 font-weight-bold">Pilih Item Bonus</v-toolbar-title>
        <v-spacer />
        <v-btn icon="mdi-close" @click="$emit('close')" variant="text" size="small" />
      </v-toolbar>
      <v-card-text class="pa-4">
        <v-data-table
          :headers="headers"
          :items="items"
          :loading="loading"
          hover
          class="desktop-table"
          density="compact"
          fixed-header
          :items-per-page="-1"
        >
          <template #item="{ item }">
            <tr @click="emit('selected', item)" class="bonus-row">
              <td class="font-weight-bold">{{ item.kode }}</td>
              <td>{{ item.nama }}</td>
              <td>
                <v-chip size="x-small" color="red-darken-2" variant="flat" class="font-weight-bold">
                  {{ item.ukuran }}
                </v-chip>
              </td>
              <td class="text-end">{{ item.stok }}</td>
            </tr>
          </template>

          <template #loading>
            <div class="loading-state">
              <v-progress-circular indeterminate color="#b71c1c" size="32" width="3" class="mb-3" />
              <div class="text-caption text-medium-emphasis">Memuat item bonus...</div>
            </div>
          </template>

          <template #no-data>
            <div class="empty-state">
              <v-icon icon="mdi-gift-off-outline" size="48" class="mb-2" color="grey-lighten-1" />
              <div class="text-body-2 text-medium-emphasis">
                Tidak ada item bonus untuk promo ini.
              </div>
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

.bonus-row {
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
  padding: 32px 24px;
  text-align: center;
}
</style>
