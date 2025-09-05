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

const headers = [
  { title: 'No. HP', key: 'hp', sortable: false },
  { title: 'Nama', key: 'nama', sortable: false },
];

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
  <v-dialog
    :model-value="true"
    @update:modelValue="emit('close')"
    max-width="900px"
    persistent
  >
    <v-card class="dialog-card d-flex flex-column" style="height: 80vh;">
      <v-toolbar color="primary" density="compact">
        <v-toolbar-title class="text-subtitle-1">Bantuan - Pilih Member</v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn icon="mdi-close" @click="emit('close')" variant="text" size="small"></v-btn>
      </v-toolbar>

      <v-card-text class="pa-4 d-flex flex-column flex-grow-1">
        <v-text-field
          v-model="searchTerm"
          label="Cari berdasarkan No. HP atau Nama..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          clearable
          class="mb-4 flex-shrink-0"
          hide-details
        ></v-text-field>

        <v-data-table
          :headers="headers"
          :items="filteredMembers"
          :loading="isLoading"
          hover
          class="desktop-table flex-grow-1"
          density="compact"
          fixed-header
        >
          <template #item="{ item }">
            <tr @click="selectMember(item)" style="cursor: pointer;">
              <td>{{ item.hp }}</td>
              <td>{{ item.nama }}</td>
            </tr>
          </template>
          <template #no-data>
            <div class="text-center pa-4">Tidak ada data member.</div>
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