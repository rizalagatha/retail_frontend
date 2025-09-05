<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import api from '@/services/api';

// --- Tipe Data ---
interface TshirtType {
  jenisKaos: string;
}

// --- Props & Emits ---
const props = defineProps({
  customType: { // Menerima tipe 'Y' (Custom) atau 'N' (Stok)
    type: String,
    required: true,
  },
});
const emit = defineEmits(['close', 'type-selected']);

// --- State ---
const items = ref<TshirtType[]>([]);
const loading = ref(true);
const search = ref('');

const headers = [
  { title: 'Jenis Kaos', key: 'jenisKaos', sortable: true },
];

// --- Methods ---
const loadItems = async () => {
  loading.value = true;
  try {
    const response = await api.get('/price-proposal-form/search-tshirt-types', {
      params: {
        custom: props.customType,
      },
    });
    items.value = response.data;
  } catch (error) {
    console.error("Gagal memuat data jenis kaos:", error);
    items.value = [];
  } finally {
    loading.value = false;
  }
};

const selectType = (item: TshirtType) => {
    if (item) {
        emit('type-selected', item);
        emit('close');
    }
};

// Computed property untuk filtering di sisi klien
const filteredItems = computed(() => {
    if (!search.value) return items.value;
    return items.value.filter(item =>
        item.jenisKaos.toLowerCase().includes(search.value.toLowerCase())
    );
});

onMounted(loadItems);
</script>

<template>
  <v-dialog
    :model-value="true"
    @update:modelValue="$emit('close')"
    max-width="800px"
    persistent
  >
    <v-card class="dialog-card d-flex flex-column" style="height: 80vh;">
      <v-toolbar color="primary" density="compact">
        <v-toolbar-title class="text-subtitle-1">Bantuan - Pilih Jenis Kaos</v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" @click="$emit('close')" variant="text" size="small"></v-btn>
      </v-toolbar>

      <v-card-text class="pa-4 d-flex flex-column flex-grow-1">
        <v-text-field
          v-model="search"
          label="Cari jenis kaos..."
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
          @click:row="(_, { item }) => selectType(item)"
          hover
          density="compact"
          class="desktop-table flex-grow-1"
          fixed-header
        >
          <template #item="{ item }">
            <tr @click="selectType(item)" style="cursor: pointer;">
              <td>{{ item.jenisKaos }}</td>
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
.desktop-table :deep(td), .desktop-table :deep(th) {
    padding: 0 8px !important;
    height: 28px !important;
}
</style>

