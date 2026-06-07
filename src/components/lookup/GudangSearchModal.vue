<script setup lang="ts">
import { ref, watch } from "vue";
import api from "@/services/api";

interface Gudang {
  kode: string;
  nama: string;
}

// --- Props & Emits ---
const props = defineProps({
  userCabang: {
    type: String,
    required: true,
  },
  onlyDc: { type: Boolean, default: false },
  source: { type: String, default: "default" },
});
const emit = defineEmits(["close", "gudang-selected"]);

// --- State ---
const items = ref<Gudang[]>([]);
const totalItems = ref(0);
const loading = ref(true);
const search = ref("");
const options = ref({ page: 1, itemsPerPage: 10 });

const headers = [
  { title: "Kode", key: "kode", sortable: false },
  { title: "Nama Gudang", key: "nama", sortable: false },
];

// --- Methods ---
const loadItems = async ({ page, itemsPerPage }: { page: number; itemsPerPage: number }) => {
  loading.value = true;
  try {
    // --- LOGIKA PEMILIHAN ENDPOINT ---
    let apiUrl = "/warehouses"; // Endpoint default
    const params: Record<string, string | number | boolean | undefined> = {
      term: search.value,
      userCabang: props.userCabang,
      page,
      itemsPerPage,
      onlyDc: props.onlyDc,
      source: props.source,
    };

    if (props.source === "retur-dc") {
      apiUrl = "/retur-dc-form/lookup/gudang-dc";
      delete params.userCabang;
    }
    // --- TAMBAHKAN BLOK ELSE IF INI ---
    else if (props.source === "qc-ke-garmen") {
      apiUrl = "/qc-ke-garmen-form/gudang-options"; // API spesifik
      // Hapus parameter yang tidak dibutuhkan oleh endpoint ini
      delete params.userCabang;
      delete params.page;
      delete params.itemsPerPage;
      delete params.onlyDc;
      // Filter 'term' akan dilakukan di frontend karena datanya sedikit (hanya GJ001, GJ002)
    }
    // --- AKHIR BLOK ---

    const response = await api.get(apiUrl, { params });

    // --- PERBARUI LOGIKA RESPON ---
    // Cek apakah data adalah array (untuk qc-garmen) atau objek (untuk paginasi)
    if (Array.isArray(response.data)) {
      // Untuk qc-garmen
      items.value = response.data;
      totalItems.value = response.data.length;
    } else if (
      response.data &&
      Array.isArray(response.data.items) &&
      typeof response.data.total === "number"
    ) {
      // Untuk paginasi default
      items.value = response.data.items;
      totalItems.value = response.data.total;
    } else {
      items.value = [];
      totalItems.value = 0;
    }
  } catch (error) {
    console.error("Gagal memuat data gudang:", error);
    items.value = [];
    totalItems.value = 0;
  } finally {
    loading.value = false;
  }
};

const selectGudang = (item: Gudang) => {
  const gudangData: Gudang = {
    kode: item.kode,
    nama: item.nama,
  };

  if (gudangData.kode) {
    emit("gudang-selected", gudangData);
  } else {
    console.warn("Data gudang tidak valid:", item);
  }
};

// --- Watchers ---
let searchTimeout: ReturnType<typeof setTimeout>;
watch(search, () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    options.value.page = 1; // Reset ke halaman 1
    loadItems(options.value);
  }, 500);
});
</script>

<template>
  <v-dialog :model-value="true" @update:model-value="emit('close')" max-width="900px" persistent>
    <v-card class="dialog-card d-flex flex-column" style="height: 80vh">
      <v-toolbar color="primary" density="compact">
        <v-toolbar-title class="text-subtitle-1">Bantuan - Pilih Gudang</v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" @click="emit('close')" variant="text" size="small"></v-btn>
      </v-toolbar>

      <v-card-text class="pa-4 d-flex flex-column flex-grow-1">
        <v-text-field
          v-model="search"
          label="Cari berdasarkan kode atau nama gudang..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          clearable
          class="mb-4 flex-shrink-0"
          hide-details
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
          <!-- Gunakan template slot untuk menampilkan data dan handle click -->
          <template #item="{ item }">
            <tr @click="selectGudang(item)" style="cursor: pointer">
              <td>{{ item.kode }}</td>
              <td>{{ item.nama }}</td>
            </tr>
          </template>
          <template #no-data>
            <div class="text-center pa-4">Tidak ada data gudang.</div>
          </template>
        </v-data-table-server>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.dialog-card {
  font-size: 12px;
}

.desktop-table {
  font-size: 11px;
}

.desktop-table :deep(td),
.desktop-table :deep(th) {
  padding: 0 8px !important;
  height: 28px !important;
}
</style>
