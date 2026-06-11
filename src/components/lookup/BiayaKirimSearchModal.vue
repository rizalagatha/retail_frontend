<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import api from "@/services/api";
import { useToast } from "vue-toastification";
import { format, parseISO } from "date-fns";

interface Props {
  customerKode: string;
  gudangKode: string;
}

interface BiayaKirimItem {
  Nomor: string;
  Tanggal: string;
  Nominal: number;
  Bayar: number;
  Sisa: number;
}

const props = defineProps<Props>();
const emit = defineEmits(["close", "selected"]);
const toast = useToast();

const items = ref<BiayaKirimItem[]>([]);
const loading = ref(true);
const search = ref("");

const headers = [
  { title: "No. Biaya Kirim", key: "Nomor", width: "160px" },
  { title: "Tanggal", key: "Tanggal", width: "100px" },
  { title: "Nominal", key: "Nominal", align: "end" as const, width: "120px" },
  { title: "Terbayar", key: "Bayar", align: "end" as const, width: "120px" },
  { title: "Sisa", key: "Sisa", align: "end" as const, width: "120px" },
];

const loadItems = async () => {
  loading.value = true;
  try {
    const response = await api.get("/biaya-kirim-form/lookup/unpaid", {
      params: {
        customerKode: props.customerKode,
        gudangKode: props.gudangKode,
        q: search.value,
      },
    });
    items.value = response.data;
  } catch (err) {
    console.error(err);
    toast.error("Gagal memuat daftar Biaya Kirim.");
  } finally {
    loading.value = false;
  }
};

const filteredItems = computed(() => {
  if (!search.value) return items.value;
  const lower = search.value.toLowerCase();
  return items.value.filter((item) => (item.Nomor || "").toLowerCase().includes(lower));
});

const handleRowClick = (_: Event, row: { item: BiayaKirimItem }) => {
  emit("selected", row.item);
  emit("close");
};

const formatNum = (num: number) => (num || 0).toLocaleString("id-ID");
const formatDate = (dateStr: string) => {
  try {
    return format(parseISO(dateStr), "dd/MM/yyyy");
  } catch {
    return dateStr;
  }
};

onMounted(loadItems);
</script>

<template>
  <v-dialog :model-value="true" @update:modelValue="$emit('close')" max-width="800px" persistent>
    <v-card class="d-flex flex-column modal-style-delphi" style="height: 60vh">
      <v-toolbar color="#D32F2F" density="compact">
        <v-icon color="white" class="ml-3 mr-2">mdi-truck-delivery</v-icon>
        <v-toolbar-title class="text-subtitle-2 text-white font-weight-bold"
          >Bantuan - Pilih Biaya Kirim</v-toolbar-title
        >
        <v-spacer></v-spacer>
        <v-btn
          icon="mdi-close"
          color="white"
          @click="$emit('close')"
          variant="text"
          size="small"
        ></v-btn>
      </v-toolbar>

      <v-card-text class="pa-4 d-flex flex-column flex-grow-1">
        <v-text-field
          v-model="search"
          label="Cari Nomor Biaya Kirim..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          clearable
          hide-details
          autofocus
          class="mb-4 flex-shrink-0 search-input-compact"
          @keyup.enter="loadItems"
        />

        <v-data-table
          :headers="headers"
          :items="filteredItems"
          :loading="loading"
          hover
          density="compact"
          fixed-header
          class="flex-grow-1 table-font-11"
          @click:row="handleRowClick"
        >
          <template #[`item.Tanggal`]="{ item }">{{ formatDate(item.Tanggal) }}</template>
          <template #[`item.Nominal`]="{ item }">{{ formatNum(item.Nominal) }}</template>
          <template #[`item.Bayar`]="{ item }">{{ formatNum(item.Bayar) }}</template>
          <template #[`item.Sisa`]="{ item }">{{ formatNum(item.Sisa) }}</template>
          <template #no-data>
            <div class="text-center pa-4 text-grey">
              Tidak ada data Biaya Kirim yang belum lunas.
            </div>
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.table-font-11 :deep(table) {
  font-size: 11px !important;
}
.table-font-11 :deep(th) {
  font-size: 11px !important;
  font-weight: bold !important;
  background-color: #f5f5f5 !important;
  color: #333 !important;
}
.table-font-11 :deep(td) {
  height: 30px !important;
  white-space: nowrap;
  cursor: pointer;
}
.search-input-compact :deep(input),
.search-input-compact :deep(label) {
  font-size: 12px !important;
}
.modal-style-delphi {
  font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
}
</style>
