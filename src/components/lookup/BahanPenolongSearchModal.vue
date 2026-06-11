<script setup lang="ts">
import { ref, watch } from "vue";
import api from "@/services/api";

interface BahanItem {
  kode: string;
  nama: string;
  satuan: string;
  jenis: string;
  stok: number;
}

const props = defineProps<{ cabang: string }>();
const emit = defineEmits<{
  (e: "close"): void;
  (e: "selected", item: BahanItem): void;
}>();

const items = ref<BahanItem[]>([]);
const totalItems = ref(0);
const loading = ref(false);
const search = ref("");
const options = ref({ page: 1, itemsPerPage: 10 });

const headers = [
  { title: "Kode", key: "kode", width: "130px" },
  { title: "Nama", key: "nama" },
  { title: "Satuan", key: "satuan", width: "80px", align: "center" as const },
  { title: "Jenis", key: "jenis", width: "120px", align: "center" as const },
  { title: "Stok", key: "stok", width: "80px", align: "end" as const },
];

const loadItems = async ({ page, itemsPerPage }: { page: number; itemsPerPage: number }) => {
  if (!props.cabang) return;
  loading.value = true;
  try {
    const res = await api.get("/surat-jalan-form/bahan-penolong/search", {
      params: { term: search.value, page, itemsPerPage, cabang: props.cabang },
    });
    items.value = res.data.items;
    totalItems.value = res.data.total;
  } catch {
    console.error("Gagal memuat bahan penolong.");
  } finally {
    loading.value = false;
  }
};

const selectItem = (item: BahanItem) => {
  emit("selected", item);
  emit("close");
};

let timer: number | undefined;
watch(search, () => {
  options.value.page = 1;
  clearTimeout(timer);
  timer = window.setTimeout(() => loadItems(options.value), 400);
});
</script>

<template>
  <v-dialog :model-value="true" @update:model-value="$emit('close')" max-width="900px" persistent>
    <v-card class="d-flex flex-column" style="height: 70vh">
      <v-toolbar color="teal-darken-2" density="compact">
        <v-icon class="ml-3 mr-2">mdi-package-variant-closed</v-icon>
        <v-toolbar-title>Bantuan - Pilih Bahan Penolong</v-toolbar-title>
        <v-spacer />
        <v-btn icon="mdi-close" @click="$emit('close')" />
      </v-toolbar>

      <v-card-text class="pa-4 d-flex flex-column flex-grow-1">
        <v-text-field
          v-model="search"
          label="Cari kode atau nama bahan..."
          variant="outlined"
          density="compact"
          clearable
          hide-details
          autofocus
          class="mb-4"
        />

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
            <tr @click="selectItem(item)" style="cursor: pointer">
              <td>{{ item.kode }}</td>
              <td>{{ item.nama }}</td>
              <td class="text-center">{{ item.satuan }}</td>
              <td class="text-center">
                <v-chip
                  :color="item.jenis === 'OBAT' ? 'purple-darken-1' : 'teal-darken-2'"
                  size="x-small"
                  variant="flat"
                >
                  {{ item.jenis }}
                </v-chip>
              </td>
              <td class="text-end">
                <span :class="item.stok <= 0 ? 'text-error font-weight-bold' : 'font-weight-bold'">
                  {{ item.stok }}
                </span>
              </td>
            </tr>
          </template>
        </v-data-table-server>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>
