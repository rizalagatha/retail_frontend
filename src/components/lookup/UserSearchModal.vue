<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import api from "@/services/api";

// --- Tipe Data ---
interface User {
  kode: string;
  nama: string;
  kode_cabang: string; // [FIX]
  nama_cabang: string; // [FIX]
}

// --- Props & Emits ---
defineProps<{
  fetchUrl: string;
}>();

const emit = defineEmits(["close", "user-selected"]);

// --- State ---
const items = ref<User[]>([]);
const loading = ref(true);
const search = ref("");

// [FIX] Tambahkan definisi kolom Cabang
const headers = [
  { title: "Kode", key: "kode", sortable: false, width: "30%" },
  { title: "Nama User", key: "nama", sortable: false, width: "45%" },
  { title: "Cabang", key: "nama_cabang", sortable: false, width: "25%" }, // Tampilkan nama
];

// --- Methods ---
const loadItems = async () => {
  loading.value = true;
  try {
    const response = await api.get("/users");
    items.value = response.data;
  } catch (error) {
    console.error("Gagal memuat data user:", error);
    items.value = [];
  } finally {
    loading.value = false;
  }
};

const selectUser = (item: User) => {
  if (item && item.kode) {
    emit("user-selected", item);
    emit("close");
  }
};

// Computed property untuk filtering di sisi klien
const filteredItems = computed(() => {
  if (!search.value) {
    return items.value;
  }
  const lowerCaseSearch = search.value.toLowerCase();
  return items.value.filter(
    (user) =>
      user.kode.toLowerCase().includes(lowerCaseSearch) ||
      user.nama.toLowerCase().includes(lowerCaseSearch) ||
      (user.nama_cabang && user.nama_cabang.toLowerCase().includes(lowerCaseSearch)) // [FIX] Dukung pencarian by Cabang
  );
});

onMounted(loadItems);
</script>

<template>
  <v-dialog :model-value="true" @update:modelValue="$emit('close')" max-width="900px" persistent>
    <v-card class="dialog-card d-flex flex-column" style="height: 80vh">
      <v-toolbar color="primary" density="compact">
        <v-toolbar-title class="text-subtitle-1">Bantuan - Pilih User</v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" @click="$emit('close')" variant="text" size="small"></v-btn>
      </v-toolbar>

      <v-card-text class="pa-4 d-flex flex-column flex-grow-1">
        <v-text-field
          v-model="search"
          label="Cari berdasarkan kode, nama user, atau cabang..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          clearable
          class="mb-4 flex-shrink-0"
          hide-details
        ></v-text-field>

        <v-data-table
          :headers="headers"
          :items="filteredItems"
          :search="search"
          :loading="loading"
          hover
          class="desktop-table flex-grow-1"
          density="compact"
          fixed-header
        >
          <template #item="{ item }">
            <tr @click="selectUser(item)" style="cursor: pointer">
              <td>{{ item.kode }}</td>
              <td>{{ item.nama }}</td>
              <td>
                <v-chip
                  size="x-small"
                  variant="flat"
                  color="blue-grey-lighten-4"
                  class="font-weight-bold"
                >
                  {{ item.nama_cabang }}
                </v-chip>
              </td>
            </tr>
          </template>
        </v-data-table>
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
