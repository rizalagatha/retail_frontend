<script setup lang="ts">
import { ref, onMounted } from "vue";
import api from "@/services/api";
import { useToast } from "vue-toastification";
import axios from "axios";
import { format } from "date-fns";

interface Retur {
  Nomor: string;
  Tanggal: string;
  Nominal: number;
  Sisa: number;
}

const props = defineProps({
  customerKode: { type: String, required: true },
  invoiceNomor: { type: String, required: true },
});

const emit = defineEmits(["close", "selected"]);
const toast = useToast();

const items = ref<Retur[]>([]);
const loading = ref(true);

const headers = [
  { title: "Nomor Retur", key: "Nomor", width: "180px" },
  { title: "Tanggal", key: "Tanggal", width: "120px" },
  { title: "Sisa Nominal", key: "Sisa", align: "end" as const },
];

// Helper untuk format Rupiah
const rupiah = (val: number) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(val || 0);
};

const loadItems = async () => {
  loading.value = true;
  try {
    const response = await api.get("/invoice-form/lookup/retur-jual", {
      params: { customerKode: props.customerKode, invoiceNomor: props.invoiceNomor },
    });
    items.value = response.data;
  } catch (error: unknown) {
    // [FIX 1] Tipe error unknown
    let errorMessage = "Gagal memuat data retur jual.";
    if (axios.isAxiosError(error)) {
      errorMessage = error.response?.data?.message || errorMessage;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }
    toast.error(errorMessage); // [FIX 2] Jadikan 1 parameter string
  } finally {
    loading.value = false;
  }
};

// [FIX 3] Buat fungsi handler baris agar TypeScript tidak ngambek
const handleRowClick = (event: Event, data: { item: Retur }) => {
  emit("selected", data.item);
};

onMounted(loadItems);
</script>

<template>
  <v-dialog :model-value="true" @update:modelValue="$emit('close')" max-width="800px" persistent>
    <v-card class="dialog-card d-flex flex-column" style="height: 60vh">
      <v-toolbar color="primary" density="compact">
        <v-toolbar-title class="text-subtitle-1">Bantuan - Pilih Retur Jual</v-toolbar-title>
        <v-spacer />
        <v-btn icon="mdi-close" @click="$emit('close')" variant="text" size="small"></v-btn>
      </v-toolbar>

      <v-card-text class="pa-4 d-flex flex-column flex-grow-1">
        <v-data-table
          :headers="headers"
          :items="items"
          :loading="loading"
          density="compact"
          hover
          fixed-header
          class="desktop-table header-browse-blue flex-grow-1"
          @click:row="handleRowClick"
        >
          <template #[`item.Tanggal`]="{ item }">
            {{ item.Tanggal ? format(new Date(item.Tanggal), "dd/MM/yyyy") : "-" }}
          </template>

          <template #[`item.Sisa`]="{ item }">
            {{ rupiah(item.Sisa) }}
          </template>

          <template #bottom></template>
        </v-data-table>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.desktop-table :deep(tbody tr) {
  cursor: pointer;
}
</style>
