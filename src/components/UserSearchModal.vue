<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import api from '@/services/api';

interface User {
  kode: string;
  nama: string;
}

// (1) Tambahkan 'fetchUrl' sebagai properti yang wajib diisi
const props = defineProps<{
  fetchUrl: string;
}>();

const emit = defineEmits(['close', 'user-selected']);

const users = ref<User[]>([]);
const searchTerm = ref('');
const isLoading = ref(false);

const fetchUsers = async () => {
  isLoading.value = true;
  try {
    const response = await api.get('/users/');
    users.value = response.data;
  } catch (error) {
    console.error("Gagal mengambil daftar user:", error);
  } finally {
    isLoading.value = false;
  }
};

const filteredUsers = computed(() => {
  if (!searchTerm.value) {
    return users.value;
  }
  const lowerCaseSearch = searchTerm.value.toLowerCase();
  return users.value.filter(user => 
    user.kode.toLowerCase().includes(lowerCaseSearch) ||
    user.nama.toLowerCase().includes(lowerCaseSearch)
  );
});

const selectUser = (user: User) => {
  emit('user-selected', user);
};

onMounted(fetchUsers);
</script>

<template>
  <v-dialog :model-value="true" @update:modelValue="emit('close')" max-width="700px">
    <v-card>
      <v-card-title class="d-flex align-center">
        <span>Bantuan - Pilih User</span>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" variant="text" @click="emit('close')"></v-btn>
      </v-card-title>
      <v-card-text>
        <v-text-field
          v-model="searchTerm"
          label="Cari berdasarkan Kode atau Nama User..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          hide-details
          class="mb-4"
        ></v-text-field>
        <v-data-table
          :headers="[{ title: 'Kode', key: 'kode' }, { title: 'Nama', key: 'nama' }]"
          :items="filteredUsers"
          :loading="isLoading"
          density="compact"
          hover
          @click:row="(_, { item }) => selectUser(item)"
        >
        </v-data-table>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>
