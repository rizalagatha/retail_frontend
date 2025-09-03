<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import api from '@/services/api'; // (1) Gunakan instance API, bukan axios
import PageLayout from '@/components/PageLayout.vue';
import MemberSearchModal from '@/components/MemberSearchModal.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '7'; // (2) Definisikan ID Menu

interface Member {
  hp: string;
  nama: string;
  alamat: string;
  gender: string;
  usia: string;
  referensi: string;
}

// --- State ---
const members = ref<Member[]>([]);
const search = ref('');
const isLoading = ref(true);
const selected = ref<Member[]>([]);

const dialog = ref(false);
const isNew = ref(true);
const editedItem = ref<Partial<Member>>({});
const isHelpModalVisible = ref(false);

// (3) State untuk konfirmasi hapus
const dialogDelete = ref(false);
const itemToDelete = ref<Member | null>(null);

const headers = [
  { title: 'No. HP', key: 'hp' },
  { title: 'Nama', key: 'nama' },
  { title: 'Alamat', key: 'alamat' },
  { title: 'Gender', key: 'gender' },
  { title: 'Usia', key: 'usia' },
  { title: 'Referensi', key: 'referensi' },
  { title: 'Actions', key: 'actions', sortable: false, align: 'center' },
];

const genderItems = ['Pria', 'Wanita'];
const ageItems = ['< 17', '18-24', '25-34', '35-44', '45+'];
const refItems = ['Teman', 'Facebook', 'Instagram', 'Whatsapp', 'Website', 'Lain-lain'];

// --- Computed Properties ---
const canEdit = computed(() => selected.value.length === 1);
const canDelete = computed(() => selected.value.length === 1);
const dialogTitle = computed(() => (isNew.value ? 'Member Baru' : 'Ubah Member'));

// --- Methods ---
const fetchMembers = async () => {
  isLoading.value = true;
  selected.value = [];
  try {
    const response = await api.get('/members'); // Gunakan API
    members.value = response.data;
  } catch (error) {
    toast.error('Gagal memuat data member.');
  } finally {
    isLoading.value = false;
  }
};

const openNewDialog = () => {
  isNew.value = true;
  editedItem.value = {};
  dialog.value = true;
};

const openEditDialog = (item: Member) => {
  isNew.value = false;
  editedItem.value = { ...item };
  dialog.value = true;
};

const handleMemberSelected = (member: Member) => {
    isHelpModalVisible.value = false;
    openEditDialog(member);
};

const handleEditFromHeader = () => {
    if(canEdit.value) {
        openEditDialog(selected.value[0]);
    }
};

const saveMember = async () => {
  try {
    const payload = {
        ...editedItem.value,
        isNew: isNew.value,
        user: authStore.user
    };
    await api.post('/members/save', payload); // Gunakan API
    toast.success('Data member berhasil disimpan.');
    fetchMembers();
  } catch (error) {
    toast.error('Gagal menyimpan data member.');
  } finally {
    dialog.value = false;
  }
};

// (4) Ubah metode hapus, hilangkan confirm()
const deleteMember = async (item: Member) => {
    try {
      await api.delete(`/members/${item.hp}`); // Gunakan API
      toast.success('Data member berhasil dihapus.');
      fetchMembers();
    } catch (error) {
      toast.error('Gagal menghapus data member.');
    }
};

const handleDeleteFromHeader = () => {
    if(canDelete.value) {
        // Panggil dialog konfirmasi
        confirmDelete(selected.value[0]);
    }
};

// (5) Tambahkan metode untuk dialog konfirmasi
const confirmDelete = (item: Member) => {
  itemToDelete.value = item;
  dialogDelete.value = true;
};

const deleteConfirmed = () => {
  if (itemToDelete.value) {
    deleteMember(itemToDelete.value);
  }
  dialogDelete.value = false;
  itemToDelete.value = null;
};

const printData = () => {
  const doc = new jsPDF();
  doc.text("Daftar Member", 14, 16);
  autoTable(doc, {
    head: [['No. HP', 'Nama', 'Alamat', 'Gender', 'Usia']],
    body: members.value.map(m => [m.hp, m.nama, m.alamat, m.gender, m.usia]),
    startY: 20,
  });
  doc.autoPrint();
  window.open(doc.output('bloburl'), '_blank');
};

const exportData = () => {
  const worksheet = XLSX.utils.json_to_sheet(members.value);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Members");
  XLSX.writeFile(workbook, "DaftarMember.xlsx");
};

onMounted(fetchMembers);
</script>

<template>
  <PageLayout title="Master Member">
    <!-- (6) Terapkan v-if pada semua tombol aksi -->
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" color="primary" @click="openNewDialog" prepend-icon="mdi-plus">Baru</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" :disabled="!canEdit" @click="handleEditFromHeader" prepend-icon="mdi-pencil">Ubah</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'delete')" :disabled="!canDelete" @click="handleDeleteFromHeader" prepend-icon="mdi-delete">Hapus</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'view')" @click="printData" prepend-icon="mdi-printer" variant="outlined">Cetak</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'view')" @click="exportData" prepend-icon="mdi-file-excel" variant="outlined">Export</v-btn>
      <v-btn @click="fetchMembers" icon="mdi-refresh" variant="text"></v-btn>
    </template>

    <v-card>
      <v-card-title class="d-flex align-center pe-2">
        <v-icon icon="mdi-account-heart"></v-icon> &nbsp; Daftar Member
        <v-spacer></v-spacer>
        <v-text-field v-model="search" density="compact" label="Cari Member" prepend-inner-icon="mdi-magnify" variant="solo-filled" flat hide-details single-line></v-text-field>
      </v-card-title>
      <v-divider></v-divider>
      <v-data-table v-model="selected" :headers="headers" :items="members" :search="search" :loading="isLoading" item-value="hp" show-select return-object hover>
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
                  v-model="editedItem.hp"
                  label="No. HP"
                  :disabled="!isNew"
                  variant="outlined"
                  @keydown.f1.prevent="isHelpModalVisible = true"
                  hint="Tekan F1 untuk bantuan"
                  persistent-hint
                ></v-text-field>
              </v-col>
              <v-col cols="12">
                <v-text-field v-model="editedItem.nama" label="Nama" variant="outlined"></v-text-field>
              </v-col>
              <v-col cols="12">
                <v-textarea v-model="editedItem.alamat" label="Alamat" variant="outlined" rows="2"></v-textarea>
              </v-col>
              <v-col cols="12" sm="6">
                <v-select v-model="editedItem.gender" :items="genderItems" label="Gender" variant="outlined"></v-select>
              </v-col>
              <v-col cols="12" sm="6">
                <v-select v-model="editedItem.usia" :items="ageItems" label="Usia" variant="outlined"></v-select>
              </v-col>
              <v-col cols="12">
                <v-select v-model="editedItem.referensi" :items="refItems" label="Referensi" variant="outlined"></v-select>
              </v-col>
            </v-row>
          </v-container>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="blue-darken-1" variant="text" @click="dialog = false">Batal</v-btn>
          <v-btn color="blue-darken-1" variant="text" @click="saveMember">Simpan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <MemberSearchModal
        v-if="isHelpModalVisible"
        @close="isHelpModalVisible = false"
        @member-selected="handleMemberSelected"
    />

    <!-- (7) Tambahkan dialog konfirmasi hapus -->
    <v-dialog v-model="dialogDelete" max-width="500px">
      <v-card>
        <v-card-title class="text-h5">Konfirmasi Hapus</v-card-title>
        <v-card-text>
          Apakah Anda yakin ingin menghapus member <strong>{{ itemToDelete?.nama }}</strong>?
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

