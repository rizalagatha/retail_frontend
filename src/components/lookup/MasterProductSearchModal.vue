<script setup lang="ts">
import { ref, watch } from "vue";
import api from "@/services/api";

interface MasterProduct {
  kode: string;
  nama: string;
}

const emit = defineEmits(["close", "product-selected"]);

const items = ref<MasterProduct[]>([]);
const totalItems = ref(0);
const loading = ref(true);
const search = ref("");
const options = ref({ page: 1, itemsPerPage: 15 });

const headers = [
  { title: "Kode", key: "kode" },
  { title: "Nama Barang", key: "nama" },
];

const loadItems = async ({ page, itemsPerPage }: { page: number; itemsPerPage: number }) => {
  loading.value = true;
  try {
    const response = await api.get("/barcode-form/master-search", {
      params: {
        term: search.value,
        page: page,
        itemsPerPage: itemsPerPage,
      },
    });
    if (response.data && Array.isArray(response.data.items)) {
      items.value = response.data.items;
      totalItems.value = response.data.total;
    } else {
      items.value = [];
      totalItems.value = 0;
    }
  } catch (error) {
    console.error("Gagal memuat data master produk:", error);
  } finally {
    loading.value = false;
  }
};

const selectProduct = (item: MasterProduct) => {
  emit("product-selected", item);
  emit("close");
};

let searchTimeout: ReturnType<typeof setTimeout>;
watch(
  search,
  () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      options.value.page = 1;
      loadItems(options.value);
    }, 500);
  },
  { immediate: true }
);
</script>

<template>
  <v-dialog :model-value="true" @update:modelValue="$emit('close')" max-width="900px" persistent>
    <v-card class="d-flex flex-column" style="height: 80vh">
      <v-toolbar color="primary" density="compact">
        <v-toolbar-title class="text-subtitle-1">Bantuan - Pilih Barang</v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" @click="$emit('close')" variant="text" size="small"></v-btn>
      </v-toolbar>
      <v-card-text class="pa-4 d-flex flex-column flex-grow-1">
        <v-text-field
          v-model="search"
          label="Cari kode, jenis kaos, tipe, lengan, kain, atau warna..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          clearable
          class="mb-4 flex-shrink-0"
          hide-details
          autofocus
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
          class="desktop-table flex-grow-1"
          density="compact"
          fixed-header
        >
          <template #item="{ item }">
            <tr @click="selectProduct(item)" style="cursor: pointer">
              <td>{{ item.kode }}</td>
              <td>{{ item.nama }}</td>
            </tr>
          </template>
        </v-data-table-server>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>
