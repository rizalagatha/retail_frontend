<script setup lang="ts">
import { ref, onMounted } from "vue";
import api from "@/services/api";
import { useToast } from "vue-toastification";
import { format, parseISO } from "date-fns"; //

const emit = defineEmits(["close", "selected"]);
const toast = useToast();

const items = ref([]);
const loading = ref(true);

const headers = [
  { title: "Nomor Retur", key: "Nomor", width: "180px" },
  { title: "Tanggal", key: "Tanggal", width: "120px" },
  { title: "No. Invoice", key: "Invoice", width: "180px" },
  { title: "Qty Barang", key: "Qty", align: "end", width: "100px" },
] as const;

const loadItems = async () => {
  loading.value = true;
  try {
    const response = await api.get("/retur-dc-form/lookup/retur-jual-kon");
    items.value = response.data;
  } catch (error) {
    toast.error("Gagal memuat daftar retur online.", error);
  } finally {
    loading.value = false;
  }
};

onMounted(loadItems);
</script>

<template>
  <v-dialog :model-value="true" @update:modelValue="$emit('close')" max-width="800px" persistent>
    <v-card class="rounded-lg">
      <v-toolbar color="orange-darken-3" density="compact">
        <v-toolbar-title class="text-subtitle-1 font-weight-bold">
          Bantuan - Pilih Retur Jual Online (KON)
        </v-toolbar-title>
        <v-spacer />
        <v-btn icon="mdi-close" variant="text" @click="$emit('close')" />
      </v-toolbar>

      <v-card-text class="pa-0">
        <v-data-table :headers="headers" :items="items" :loading="loading" density="compact" hover class="modal-table"
          @click:row="(_, { item }) => emit('selected', item)">
          <template #[`item.Tanggal`]="{ item }">
            {{ item.Tanggal ? format(parseISO(item.Tanggal), "dd-MM-yyyy") : "" }}
          </template>

          <template #bottom></template>
        </v-data-table>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
/* FIX 2: Set Font 11px untuk seluruh isi tabel */
.modal-table :deep(table) {
  font-size: 11px !important;
}

.modal-table :deep(thead tr th) {
  font-size: 11px !important;
  font-weight: bold !important;
  background-color: #f5f5f5 !important;
  height: 36px !important;
}

.modal-table :deep(tbody tr td) {
  height: 32px !important;
  cursor: pointer;
}
</style>
