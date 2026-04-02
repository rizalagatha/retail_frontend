<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import api from "@/services/api";
import { useToast } from "vue-toastification";
import { format, subMonths, addDays } from "date-fns";

// 1. Definisi Interface
interface PackingListItem {
  Nomor: string;
  Tanggal: string;
  Keterangan: string;
  Usr: string;
  Status: string;
  [key: string]: unknown;
}

const props = defineProps<{
  storeKode: string;
}>();

// 2. Update Emit agar Type-Safe
const emit = defineEmits<{
  (e: "close"): void;
  (e: "selected", item: PackingListItem): void; // Menggunakan interface di sini
}>();

const toast = useToast();

// 3. Gunakan Interface pada Ref
const items = ref<PackingListItem[]>([]);
const loading = ref(false);
const search = ref("");

const headers = [
  { title: "No. Packing List", key: "Nomor", width: "140px" },
  { title: "Tanggal", key: "Tanggal", width: "90px" },
  { title: "Keterangan", key: "Keterangan" },
  { title: "User", key: "Usr", width: "100px" },
];

const loadData = async () => {
  if (!props.storeKode) return;

  loading.value = true;
  try {
    const startDate = format(subMonths(new Date(), 2), "yyyy-MM-dd");
    const endDate = format(addDays(new Date(), 1), "yyyy-MM-dd");

    // Gunakan Generic Type pada API call
    const response = await api.get<PackingListItem[]>("/packing-list", {
      params: {
        startDate,
        endDate,
        cabang: props.storeKode,
        status: "O",
        search: search.value,
      },
    });

    items.value = response.data.filter((i) => i.Status === "O" || i.Status === "OPEN");
  } catch (error) {
    console.error(error);
    toast.error("Gagal memuat data Packing List.");
  } finally {
    loading.value = false;
  }
};

// 4. [FIX] Ganti 'any' dengan 'PackingListItem'
const selectItem = (item: PackingListItem) => {
  if (!item) return;
  emit("selected", item);
  emit("close");
};

const handleRowClick = (event: Event, row: { item: PackingListItem }) => {
  selectItem(row.item);
};

const formatDate = (dateStr: string) => {
  if (!dateStr) return "-";
  return format(new Date(dateStr), "dd-MM-yyyy");
};

watch(() => props.storeKode, loadData);
onMounted(loadData);
</script>

<template>
  <v-dialog :model-value="true" @update:modelValue="$emit('close')" max-width="850px" persistent>
    <v-card>
      <v-card-title
        class="bg-primary text-white py-2 px-4 d-flex align-center"
        style="font-size: 14px; font-weight: 600"
      >
        <span>Pilih Packing List (Pra-SJ) - Store {{ storeKode }}</span>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" variant="text" density="compact" @click="$emit('close')"></v-btn>
      </v-card-title>

      <v-card-text class="pt-4 px-4 pb-2">
        <v-text-field
          v-model="search"
          label="Cari Nomor PL..."
          placeholder="Ketik nomor lalu tekan Enter"
          prepend-inner-icon="mdi-magnify"
          density="compact"
          variant="outlined"
          hide-details
          class="mb-3 custom-input"
          @keydown.enter="loadData"
        ></v-text-field>

        <div class="table-wrapper">
          <v-data-table
            :headers="headers"
            :items="items"
            :loading="loading"
            density="compact"
            fixed-header
            height="350px"
            class="custom-table"
            :items-per-page="10"
            hover
            @click:row="handleRowClick"
          >
            <template #[`item.Tanggal`]="{ item }">
              {{ formatDate(item.Tanggal) }}
            </template>
          </v-data-table>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
/* Styling Konsisten 11px */

.custom-input :deep(.v-field__input),
.custom-input :deep(.v-label) {
  font-size: 11px !important;
}

.custom-table :deep(thead tr th) {
  background-color: #f5f5f5 !important;
  color: #424242 !important;
  font-weight: 600 !important;
  text-transform: uppercase;
  font-size: 11px !important;
  height: 36px !important;
  border-bottom: 1px solid #e0e0e0 !important;
}

.custom-table :deep(tbody tr td) {
  font-size: 11px !important;
  height: 32px !important;
  border-bottom: 1px solid #f0f0f0 !important;
  cursor: pointer;
  /* [UBAH] Tambahkan pointer agar terlihat bisa diklik */
}

/* Hover effect lebih tegas */
.custom-table :deep(tbody tr:hover) {
  background-color: #bbdefb !important;
  /* Biru lebih gelap saat hover */
}
</style>
