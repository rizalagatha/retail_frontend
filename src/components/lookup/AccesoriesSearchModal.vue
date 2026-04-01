<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import api from "@/services/api";
import { useToast } from "vue-toastification";

interface AccesoriesItem {
  kode: string;
  nama: string;
  satuan: string;
  note: string;
}

const emit = defineEmits(["close", "item-selected"]);
const toast = useToast();

const items = ref<AccesoriesItem[]>([]);
const totalItems = ref(0); // Optional: Jika backend nanti mendukung pagination
const loading = ref(true);
const search = ref("");

// Karena endpoint pencarian barang ini simpel (tanpa pagination di backend),
// kita tidak perlu options.page dan options.itemsPerPage.
const headers = [
  { title: "Kode Barang", key: "kode", width: "150px" },
  { title: "Nama Barang", key: "nama" },
  { title: "Satuan", key: "satuan", width: "100px", align: "center" },
  { title: "Keterangan", key: "note", width: "200px" },
] as const;

const loadItems = async () => {
  loading.value = true;
  try {
    const response = await api.get("/minta-accesories-form/search-barang", {
      params: {
        keyword: search.value,
      },
    });

    // Asumsi backend mengembalikan array langsung
    if (Array.isArray(response.data)) {
      items.value = response.data;
      totalItems.value = response.data.length;
    } else {
      items.value = [];
      totalItems.value = 0;
    }
  } catch (error) {
    toast.error("Gagal memuat data barang kaosan.", error);
    items.value = [];
    totalItems.value = 0;
  } finally {
    loading.value = false;
  }
};

const selectItem = (item: AccesoriesItem) => {
  emit("item-selected", item);
  emit("close");
};

let searchTimeout: ReturnType<typeof setTimeout>;
watch(search, () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    loadItems();
  }, 500);
});

onMounted(() => {
  loadItems();
});
</script>

<template>
  <v-dialog :model-value="true" @update:model-value="$emit('close')" max-width="800px" persistent>
    <v-card class="d-flex flex-column" style="height: 80vh">
      <v-toolbar color="primary" density="compact">
        <v-toolbar-title class="text-subtitle-1 text-white">
          <v-icon icon="mdi-magnify" class="mr-2" size="small"></v-icon>
          Cari Barang Kebutuhan Kaosan
        </v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn
          icon="mdi-close"
          @click="$emit('close')"
          variant="text"
          size="small"
          color="white"
        ></v-btn>
      </v-toolbar>

      <v-card-text class="pa-4 d-flex flex-column flex-grow-1">
        <v-text-field
          v-model="search"
          label="Cari berdasarkan kode atau nama barang..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          clearable
          class="mb-4 flex-shrink-0"
          hide-details
          autofocus
        ></v-text-field>

        <v-data-table
          :headers="headers"
          :items="items"
          :loading="loading"
          hover
          class="desktop-table flex-grow-1 elevation-1 border rounded"
          density="compact"
          fixed-header
          :items-per-page="15"
        >
          <template #item="{ item }">
            <tr @click="selectItem(item)" class="cursor-pointer">
              <td>
                <span class="font-weight-bold text-primary">{{ item.kode }}</span>
              </td>
              <td>{{ item.nama }}</td>
              <td class="text-center">{{ item.satuan }}</td>
              <td>{{ item.note || "-" }}</td>
            </tr>
          </template>
          <template #no-data>
            <div class="text-center py-4 text-grey">
              {{ search ? "Barang tidak ditemukan." : "Ketik untuk mencari..." }}
            </div>
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>
