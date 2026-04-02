<script setup lang="ts">
import { ref, watch } from "vue";
import api from "@/services/api";
import { useToast } from "vue-toastification";
import axios from "axios";

const toast = useToast();

// Tipe Data
interface Sticker {
  kode: string;
  barcode: string;
  nama: string;
  ukuran: string;
  harga: number;
  stok: number;
  uniqueId: string;
}

// Props & Emits
const props = defineProps({
  gudang: { type: String, required: true },
});
const emit = defineEmits(["close", "selected"]);

// State
const items = ref<Sticker[]>([]);
const totalItems = ref(0);
const loading = ref(true);
const search = ref("");
const options = ref({ page: 1, itemsPerPage: 50 });

const headers = [
  { title: "Kode Stiker", key: "kode", width: "180px" },
  { title: "Barcode", key: "barcode", width: "150px" },
  { title: "Nama Stiker", key: "nama" },
  { title: "Ukuran", key: "ukuran", width: "100px" },
  { title: "Stok", key: "stok", align: "end" as const },
  { title: "Harga", key: "harga", align: "end" as const },
];

const loadItems = async ({ page, itemsPerPage }: { page: number; itemsPerPage: number }) => {
  loading.value = true;
  try {
    const response = await api.get("/pengajuan-barcode-form/lookup/stickers", {
      params: {
        term: search.value,
        gudang: props.gudang,
        page,
        itemsPerPage,
      },
    });
    items.value = response.data.items || [];
    totalItems.value = response.data.total || 0;
  } catch (error: unknown) {
    // [PERBAIKAN 2] Beri tipe unknown pada error
    // [PERBAIKAN 3] Ekstrak pesannya menjadi satu string yang aman
    let errorMessage = "Gagal memuat data stiker.";
    if (axios.isAxiosError(error)) {
      errorMessage = error.response?.data?.message || errorMessage;
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    // [PERBAIKAN 4] Lempar 1 parameter string saja
    toast.error(errorMessage);
  } finally {
    loading.value = false;
  }
};

const selectItem = (item: Sticker) => {
  // Kirim seluruh objek item yang dipilih
  emit("selected", item);
  emit("close");
};

let searchTimeout: ReturnType<typeof setTimeout>;
watch(search, () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    options.value.page = 1;
    loadItems(options.value);
  }, 500);
});
</script>

<template>
  <v-dialog :model-value="true" @update:modelValue="$emit('close')" max-width="1200px" persistent>
    <v-card class="dialog-card d-flex flex-column" style="height: 80vh">
      <v-toolbar color="primary" density="compact">
        <v-toolbar-title class="text-subtitle-1">Bantuan - Pilih Stiker</v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" @click="$emit('close')" variant="text" size="small"></v-btn>
      </v-toolbar>
      <v-card-text class="pa-4 d-flex flex-column flex-grow-1">
        <v-text-field
          v-model="search"
          label="Cari berdasarkan kode, nama, atau barcode stiker..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          clearable
          hide-details
          autofocus
          class="mb-4 flex-shrink-0"
        ></v-text-field>
        <v-data-table-server
          v-model:page="options.page"
          v-model:items-per-page="options.itemsPerPage"
          :headers="headers"
          :items="items"
          :items-length="totalItems"
          :loading="loading"
          @update:options="loadItems"
          hover
          density="compact"
          fixed-header
          class="desktop-table flex-grow-1"
        >
          <template #item="{ item }">
            <tr style="cursor: pointer" @click="selectItem(item)">
              <td>{{ item.kode }}</td>
              <td>{{ item.barcode }}</td>
              <td>{{ item.nama }}</td>
              <td>{{ item.ukuran }}</td>
              <td class="text-end">{{ item.stok }}</td>
              <td class="text-end">{{ new Intl.NumberFormat("id-ID").format(item.harga) }}</td>
            </tr>
          </template>
        </v-data-table-server>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>
