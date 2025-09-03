<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import api from '@/services/api';

interface Member {
  hp: string;
  nama: string;
}

const emit = defineEmits(['close', 'member-selected']);

const members = ref<Member[]>([]);
const searchTerm = ref('');
const isLoading = ref(false);

const fetchAllMembers = async () => {
  isLoading.value = true;
  try {
    const response = await api.get('/members');
    members.value = response.data;
  } catch (error) {
    console.error("Gagal mengambil daftar member:", error);
  } finally {
    isLoading.value = false;
  }
};

const filteredMembers = computed(() => {
  if (!searchTerm.value) {
    return members.value;
  }
  const lowerCaseSearch = searchTerm.value.toLowerCase();
  return members.value.filter(member => 
    member.hp.toLowerCase().includes(lowerCaseSearch) ||
    member.nama.toLowerCase().includes(lowerCaseSearch)
  );
});

const selectMember = (member: Member) => {
  emit('member-selected', member);
};

onMounted(fetchAllMembers);
</script>

<template>
  <v-dialog :model-value="true" @update:modelValue="emit('close')" max-width="700px">
    <v-card>
      <v-card-title class="d-flex align-center">
        <span>Bantuan - Pilih Member</span>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" variant="text" @click="emit('close')"></v-btn>
      </v-card-title>
      <v-card-text>
        <v-text-field
          v-model="searchTerm"
          label="Cari berdasarkan No. HP atau Nama..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          hide-details
          class="mb-4"
        ></v-text-field>
        <v-data-table
          :headers="[{ title: 'No. HP', key: 'hp' }, { title: 'Nama', key: 'nama' }]"
          :items="filteredMembers"
          :loading="isLoading"
          density="compact"
          hover
          @click:row="(_, { item }) => selectMember(item)"
        >
          <template #no-data>
            <div class="text-center pa-4">Tidak ada data member.</div>
          </template>
        </v-data-table>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>
