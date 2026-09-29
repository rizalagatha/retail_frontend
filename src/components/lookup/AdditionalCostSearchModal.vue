<script setup lang="ts">
import { ref, onMounted } from "vue";
import api from "@/services/api";

interface AdditionalCost {
  tambahan: string;
  harga: number;
}

const emit = defineEmits(["close", "cost-selected"]);

const items = ref<AdditionalCost[]>([]);
const loading = ref(true);

const loadItems = async () => {
  loading.value = true;
  try {
    const response = await api.get("/price-proposal-form/search-additional-costs");
    items.value = response.data;
  } catch (error) {
    console.error("Gagal memuat data biaya tambahan:", error);
  } finally {
    loading.value = false;
  }
};

const selectCost = (item: AdditionalCost) => {
  emit("cost-selected", item);
};

const handleRowClick = (event: Event, data: { item: AdditionalCost }) => {
  selectCost(data.item);
};

onMounted(loadItems);
</script>

<template>
  <v-dialog :model-value="true" @update:modelValue="emit('close')" max-width="600px">
    <v-card class="dialog-card">
      <v-toolbar density="compact" class="modal-toolbar">
        <v-icon icon="mdi-cash-plus" class="ms-2 me-1" size="20"></v-icon>
        <v-toolbar-title class="text-subtitle-1 font-weight-bold"
          >Pilih Harga Tambahan</v-toolbar-title
        >
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" @click="emit('close')" variant="text" size="small"></v-btn>
      </v-toolbar>
      <v-card-text class="pa-4">
        <v-data-table
          :headers="[
            { title: 'Keterangan Tambahan', key: 'tambahan' },
            { title: 'Harga', key: 'harga', align: 'end' },
          ]"
          :items="items"
          :loading="loading"
          density="compact"
          class="desktop-table"
          hover
          @click:row="handleRowClick"
        >
          <template #[`item.harga`]="{ item }">
            <span class="font-weight-bold price-value">
              {{ new Intl.NumberFormat("id-ID").format(item.harga || 0) }}
            </span>
          </template>
          <template #no-data>
            <div class="text-center pa-4">Tidak ada data harga tambahan.</div>
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

.desktop-table {
  font-size: 11px;
}

.desktop-table :deep(td),
.desktop-table :deep(th) {
  padding: 0 8px !important;
  height: 28px !important;
}

.desktop-table :deep(thead tr th) {
  background: linear-gradient(180deg, #b71c1c 0%, #9a1515 100%) !important;
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

.desktop-table :deep(tbody tr:nth-child(even)) {
  background-color: rgba(183, 28, 28, 0.02);
}

.desktop-table :deep(tbody tr:hover) {
  background-color: rgba(183, 28, 28, 0.08) !important;
}

.desktop-table :deep(tbody tr:active) {
  background-color: rgba(183, 28, 28, 0.14) !important;
}

.price-value {
  color: #b71c1c;
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

.desktop-table :deep(.v-data-table-footer__items-per-page .v-field) {
  border-radius: 8px;
  background-color: rgba(183, 28, 28, 0.05);
}

.desktop-table :deep(.v-data-table-footer__items-per-page .v-field__outline) {
  color: rgba(183, 28, 28, 0.25) !important;
}

.desktop-table :deep(.v-data-table-footer .v-btn.v-btn--icon) {
  background-color: rgba(183, 28, 28, 0.06);
  border-radius: 8px !important;
  min-width: 32px !important;
  width: 32px;
  height: 32px;
}

.desktop-table :deep(.v-data-table-footer .v-btn.v-btn--icon .v-icon) {
  color: #b71c1c;
}

.desktop-table :deep(.v-data-table-footer .v-btn.v-btn--icon:not(.v-btn--disabled):hover) {
  background-color: #b71c1c;
}

.desktop-table :deep(.v-data-table-footer .v-btn.v-btn--icon:not(.v-btn--disabled):hover .v-icon) {
  color: #ffffff !important;
}

.desktop-table :deep(.v-data-table-footer .v-btn.v-btn--icon.v-btn--disabled) {
  background-color: rgba(0, 0, 0, 0.03);
  opacity: 0.4;
}
</style>
