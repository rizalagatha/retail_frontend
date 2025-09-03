<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import api from '@/services/api'; // (1) Gunakan instance API terpusat
import PageLayout from '@/components/PageLayout.vue';
import UserSearchModal from '@/components/UserSearchModal.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';

const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '10'; // (2) Definisikan ID Menu

interface SalesCounter {
  kode: string;
  nama: string;
  alamat: string;
  hp: string;
  ktp: string;
  status: 'AKTIF' | 'PASIF';
}

// --- State ---
const salesCounters = ref<SalesCounter[]>([]);
const search = ref('');
const isLoading = ref(true);
const selected = ref<SalesCounter[]>([]);

const dialog = ref(false);
const isNew = ref(true);
const editedItem = ref<Partial<SalesCounter>>({});
const isHelpModalVisible = ref(false);

// (3) State untuk konfirmasi hapus
const dialogDelete = ref(false);
const itemToDelete = ref<SalesCounter | null>(null);

const headers = [
  { title: 'Kode', key: 'kode' },
  { title: 'Nama', key: 'nama' },
  { title: 'Alamat', key: 'alamat' },
  { title: 'No. HP', key: 'hp' },
  { title: 'No. KTP', key: 'ktp' },
  { title: 'Status', key: 'status', align: 'center' },
  { title: 'Actions', key: 'actions', sortable: false, align: 'center' },
];

// --- Computed Properties ---
const canEdit = computed(() => selected.value.length === 1);
const canDelete = computed(() => selected.value.length === 1);
const dialogTitle = computed(() => (isNew.value ? 'Sales Counter Baru' : 'Ubah Sales Counter'));

const availableUsersUrl = computed(() => {
    const userCabang = authStore.user?.cabang || '';
    return `http://192.168.1.73:8000/api/users/available-for-sc?cabang=${userCabang}`;
});


// --- Methods ---
const fetchSalesCounters = async () => {
  isLoading.value = true;
  selected.value = [];
  try {
    const response = await api.get('/sales-counters'); // Gunakan API
    salesCounters.value = response.data;
  } catch (error) {
    toast.error('Gagal memuat data sales counter.');
  } finally {
    isLoading.value = false;
  }
};

const openNewDialog = () => {
  isNew.value = true;
  editedItem.value = { status: 'AKTIF' };
  dialog.value = true;
};

const openEditDialog = (item: SalesCounter) => {
  isNew.value = false;
  editedItem.value = { ...item };
  dialog.value = true;
};

const handleUserSelected = (user: { kode: string, nama: string }) => {
    isHelpModalVisible.value = false;
    editedItem.value.kode = user.kode;
    editedItem.value.nama = user.nama;
};

const handleEditFromHeader = () => {
    if(canEdit.value) {
        openEditDialog(selected.value[0]);
    }
};

const saveSalesCounter = async () => {
  try {
    const payload = {
        ...editedItem.value,
        isNew: isNew.value,
        user: authStore.user
    };
    await api.post('/sales-counters/save', payload); // Gunakan API
    toast.success('Data sales counter berhasil disimpan.');
    fetchSalesCounters();
  } catch (error) {
    toast.error('Gagal menyimpan data sales counter.');
  } finally {
    dialog.value = false;
  }
};

// (4) Ubah metode hapus, hilangkan confirm()
const deleteSalesCounter = async (item: SalesCounter) => {
    try {
      await api.delete(`/sales-counters/${item.kode}`); // Gunakan API
      toast.success('Data sales counter berhasil dihapus.');
      fetchSalesCounters();
    } catch (error) {
      toast.error('Gagal menghapus data.');
    }
};

const handleDeleteFromHeader = () => {
    if(canDelete.value) {
        confirmDelete(selected.value[0]);
    }
};

// (5) Tambahkan metode untuk dialog konfirmasi
const confirmDelete = (item: SalesCounter) => {
  itemToDelete.value = item;
  dialogDelete.value = true;
};

const deleteConfirmed = () => {
  if (itemToDelete.value) {
    deleteSalesCounter(itemToDelete.value);
  }
  dialogDelete.value = false;
  itemToDelete.value = null;
};

onMounted(fetchSalesCounters);
</script>

<template>
  <PageLayout title="Master Sales Counter">
    <!-- (6) Terapkan v-if pada semua tombol aksi -->
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" color="primary" @click="openNewDialog" prepend-icon="mdi-plus">Baru</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" :disabled="!canEdit" @click="handleEditFromHeader" prepend-icon="mdi-pencil">Ubah</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'delete')" :disabled="!canDelete" @click="handleDeleteFromHeader" prepend-icon="mdi-delete">Hapus</v-btn>
      <v-btn icon="mdi-refresh" variant="text" @click="fetchSalesCounters"></v-btn>
    </template>

    <v-card>
      <v-card-title class="d-flex align-center pe-2">
        <v-icon icon="mdi-account-tie"></v-icon> &nbsp; Daftar Sales Counter
        <v-spacer></v-spacer>
        <v-text-field v-model="search" density="compact" label="Cari" prepend-inner-icon="mdi-magnify" variant="solo-filled" flat hide-details single-line></v-text-field>
      </v-card-title>
      <v-divider></v-divider>
      <v-data-table v-model="selected" :headers="headers" :items="salesCounters" :search="search" :loading="isLoading" item-value="kode" show-select return-object hover>
        <template #item.status="{ item }">
          <v-chip :color="item.status === 'AKTIF' ? 'green' : 'red'" variant="elevated">{{ item.status }}</v-chip>
        </template>
        <template #item.actions="{ item }">
          <v-icon v-if="authStore.can(MENU_ID, 'edit')" class="me-2" size="small" @click="openEditDialog(item)">mdi-pencil</v-icon>
          <v-icon v-if="authStore.can(MENU_ID, 'delete')" size="small" @click="confirmDelete(item)">mdi-delete</v-icon>
        </template>
      </v-data-table>
    </v-card>

    <v-dialog v-model="dialog" max-width="600px">
      <v-card>
        <v-card-title>
          <span class="text-h5">{{ dialogTitle }}</span>
        </v-card-title>
        <v-card-text>
          <v-container>
            <v-row>
              <v-col cols="12">
                <v-text-field
                    v-model="editedItem.kode"
                    label="Kode"
                    :disabled="!isNew"
                    variant="outlined"
                    @keydown.f1.prevent="isHelpModalVisible = true"
                    hint="Tekan F1 untuk memilih user"
                    persistent-hint
                ></v-text-field>
              </v-col>
              <v-col cols="12">
                <v-text-field v-model="editedItem.nama" label="Nama" variant="outlined" :disabled="!isNew"></v-text-field>
              </v-col>
              <v-col cols="12">
                <v-textarea v-model="editedItem.alamat" label="Alamat" variant="outlined" rows="2"></v-textarea>
              </v-col>
              <v-col cols="12" sm="6">
                <v-text-field v-model="editedItem.hp" label="No. HP" variant="outlined"></v-text-field>
              </v-col>
              <v-col cols="12" sm="6">
                <v-text-field v-model="editedItem.ktp" label="No. KTP" variant="outlined"></v-text-field>
              </v-col>
              <v-col cols="12">
                <v-radio-group v-model="editedItem.status" inline label="Status">
                    <v-radio label="Aktif" value="AKTIF"></v-radio>
                    <v-radio label="Pasif" value="PASIF"></v-radio>
                </v-radio-group>
              </v-col>
            </v-row>
          </v-container>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="blue-darken-1" variant="text" @click="dialog = false">Batal</v-btn>
          <v-btn color="blue-darken-1" variant="text" @click="saveSalesCounter">Simpan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <UserSearchModal
        v-if="isHelpModalVisible"
        :fetch-url="availableUsersUrl"
        @close="isHelpModalVisible = false"
        @user-selected="handleUserSelected"
    />

    <!-- (7) Tambahkan dialog konfirmasi hapus -->
    <v-dialog v-model="dialogDelete" max-width="500px">
      <v-card>
        <v-card-title class="text-h5">Konfirmasi Hapus</v-card-title>
        <v-card-text>
          Apakah Anda yakin ingin menghapus <strong>{{ itemToDelete?.nama }}</strong>?
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn variant="text" @click="dialogDelete = false">Batal</v-btn>
          <v-btn color="red-darken-1" variant="elevated" @click="deleteConfirmed">Hapus</v-btn>
          <v-spacer></v-spacer>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>
