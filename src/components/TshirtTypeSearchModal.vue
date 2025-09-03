<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import api from '@/services/api';

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

const filteredItems = computed(() => {
    if (!search.value) return items.value;
    return items.value.filter(item => 
        item.jenisKaos.toLowerCase().includes(search.value.toLowerCase())
    );
});

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
  } finally {
    loading.value = false;
  }
};

const selectType = (item: TshirtType) => {
    if (item) {
        emit('type-selected', item);
    }
};

onMounted(loadItems);
</script>

<template>
  <v-dialog
    :model-value="true"
    @update:model-value="emit('close')"
    max-width="600px"
    persistent
  >
    <v-card>
      <v-toolbar color="primary" dark>
        <v-toolbar-title>Bantuan - Pilih Jenis Kaos</v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" @click="emit('close')" variant="text"></v-btn>
      </v-toolbar>

      <v-card-text class="pa-4">
        <v-text-field
          v-model="search"
          label="Cari jenis kaos..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          clearable
          class="mb-4"
          hide-details
        ></v-text-field>

        <v-data-table
          :headers="headers"
          :items="filteredItems"
          :loading="loading"
          @click:row="(_, { item }) => selectType(item)"
          hover
          density="compact"
          class="elevation-1"
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

