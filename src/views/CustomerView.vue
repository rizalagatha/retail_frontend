<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore'; // (1) Impor authStore

// Impor library untuk PDF dan Excel
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

const toast = useToast();
const authStore = useAuthStore(); // (2) Gunakan store
const MENU_ID = '9';

interface Customer {
  kode: string;
  nama: string;
  alamat: string;
  kota: string;
  telp: string;
  namaKontak: string;
  status: 'AKTIF' | 'PASIF';
  tglLahir: string | null;
  top: number;
  level: string;
  npwp: string;
  namaNpwp: string;
  alamatNpwp: string;
  kotaNpwp: string;
}

interface LevelHistory {
  tanggal: string;
  kode: string;
  level: string;
}

// --- State ---
const customers = ref<Customer[]>([]);
const search = ref('');
const isLoading = ref(true);
const selected = ref<Customer[]>([]);

const dialog = ref(false);
const isNew = ref(true);
const editedItem = ref<Partial<Customer>>({});
const levelHistory = ref<LevelHistory[]>([]);
const availableLevels = ref([]);

// --- State untuk konfirmasi hapus ---
const dialogDelete = ref(false); // <-- TAMBAHKAN INI
const itemToDelete = ref<Customer | null>(null); // <-- TAMBAHKAN INI

const headers = [
  { title: 'Kode', key: 'kode', width: '150px' },
  { title: 'Nama', key: 'nama' },
  { title: 'Alamat', key: 'alamat' },
  { title: 'Kota', key: 'kota' },
  { title: 'Status', key: 'status', align: 'center' },
  { title: 'Actions', key: 'actions', sortable: false, align: 'center' },
];

const levelHistoryHeaders = [
  { title: 'No.', key: 'no', sortable: false },
  { title: 'Tanggal', key: 'tanggal' },
  { title: 'Kode', key: 'kode' },
  { title: 'Level', key: 'level' },
];

// --- Computed Properties ---
const canEdit = computed(() => selected.value.length === 1);
const canDelete = computed(() => selected.value.length === 1);
const dialogTitle = computed(() => (isNew.value ? 'Customer Baru' : 'Ubah Customer'));

// --- Methods ---
const fetchCustomers = async () => {
  isLoading.value = true;
  selected.value = [];
  try {
    const response = await api.get('/customers');
    customers.value = response.data;
  } catch (error) {
    toast.error('Gagal memuat data customer.');
    console.error(error);
  } finally {
    isLoading.value = false;
  }
};

const openNewDialog = async () => {
  isNew.value = true;
  editedItem.value = { kode: '', status: 'AKTIF', top: 0 };
  levelHistory.value = [];
  dialog.value = true;

  try {
    const levelsResponse = await api.get('/customers/levels');
    availableLevels.value = levelsResponse.data;
  } catch (e) {
    toast.error("Gagal menyiapkan form baru.");
  }
};

const openEditDialog = async (item: Customer) => {
  isNew.value = false;
  try {
    const response = await api.get(`/customers/${item.kode}`);
    editedItem.value = response.data.customer;
    levelHistory.value = response.data.levelHistory;
    availableLevels.value = response.data.levels;
    dialog.value = true;
  } catch (error) {
    toast.error('Gagal memuat detail customer.');
  }
};

const handleEditFromHeader = () => {
  if (canEdit.value) {
    openEditDialog(selected.value[0]);
  }
};

const saveCustomer = async () => {
  try {
    // (3) Sertakan informasi user dari store saat menyimpan
    const payload = {
      ...editedItem.value,
      isNew: isNew.value,
      user: authStore.user // Mengirim data user (kode, cabang, dll)
    };
    if (isNew.value) {
      delete payload.kode;
    }
    const response = await api.post('/customers/save', payload);
    toast.success(response.data.message);
    fetchCustomers();
  } catch (error) {
    toast.error('Gagal menyimpan data customer.');
  } finally {
    dialog.value = false;
  }
};

const deleteCustomer = async (item: Customer) => {
  // if (confirm(`Yakin ingin menghapus customer ${item.nama}?`)) { // <-- HAPUS BARIS INI
  try {
    const response = await api.delete(`/customers/${item.kode}`);
    toast.success(response.data.message);
    fetchCustomers();
  } catch (error) {
    toast.error('Gagal menghapus data customer.');
  }
  // } // <-- HAPUS BARIS INI
};

const handleDeleteFromHeader = () => {
  if (canDelete.value) {
    deleteCustomer(selected.value[0]);
  }
};

const printData = () => {
  if (customers.value.length === 0) {
    toast.info("Tidak ada data untuk dicetak.");
    return;
  }
  const doc = new jsPDF();
  doc.text("Daftar Customer", 14, 16);
  autoTable(doc, {
    head: [['Kode', 'Nama', 'Alamat', 'Kota', 'Status']],
    body: customers.value.map(c => [c.kode, c.nama, c.alamat, c.kota, c.status]),
    startY: 20,
  });

  doc.autoPrint();
  const pdfBlob = doc.output('blob');
  const pdfUrl = URL.createObjectURL(pdfBlob);
  window.open(pdfUrl, '_blank');
};

const exportData = () => {
  if (customers.value.length === 0) {
    toast.info("Tidak ada data untuk diexport.");
    return;
  }
  const worksheet = XLSX.utils.json_to_sheet(customers.value.map(c => ({
    Kode: c.kode,
    Nama: c.nama,
    Alamat: c.alamat,
    Kota: c.kota,
    Telepon: c.telp,
    'Nama Kontak': c.namaKontak,
    Status: c.status,
  })));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Customers");
  XLSX.writeFile(workbook, "DaftarCustomer.xlsx");
};

const confirmDelete = (item: Customer) => { // <-- TAMBAHKAN FUNGSI INI
  itemToDelete.value = item;
  dialogDelete.value = true;
};

// Menjalankan aksi hapus setelah konfirmasi
const deleteConfirmed = () => { // <-- TAMBAHKAN FUNGSI INI
  if (itemToDelete.value) {
    deleteCustomer(itemToDelete.value);
  }
  dialogDelete.value = false;
  itemToDelete.value = null;
};

onMounted(fetchCustomers);
</script>

<template>
  <PageLayout title="Master Customer">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" color="primary" @click="openNewDialog"
        prepend-icon="mdi-plus">Baru</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" :disabled="!canEdit" @click="handleEditFromHeader"
        prepend-icon="mdi-pencil">Ubah</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'delete')" :disabled="!canDelete" @click="handleDeleteFromHeader"
        prepend-icon="mdi-delete">Hapus</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'view')" @click="printData" prepend-icon="mdi-printer"
        variant="outlined">Cetak</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'view')" @click="exportData" prepend-icon="mdi-file-excel"
        variant="outlined">Export</v-btn>
      <v-btn @click="fetchCustomers" icon="mdi-refresh" variant="text"></v-btn>
    </template>
    <v-card>
      <v-card-title class="d-flex align-center pe-2">
        <v-icon icon="mdi-account-multiple"></v-icon> &nbsp; Daftar Customer
        <v-spacer></v-spacer>
        <v-text-field v-model="search" density="compact" label="Cari Customer" prepend-inner-icon="mdi-magnify"
          variant="solo-filled" flat hide-details single-line></v-text-field>
      </v-card-title>
      <v-divider></v-divider>
      <v-data-table v-model="selected" :headers="headers" :items="customers" :search="search" :loading="isLoading"
        item-value="kode" show-select return-object hover>
        <template #item.status="{ item }">
          <v-chip :color="item.status === 'AKTIF' ? 'green' : 'red'" variant="elevated">{{ item.status }}</v-chip>
        </template>
        <template #item.actions="{ item }">
          <v-icon v-if="authStore.can(MENU_ID, 'edit')" class="me-2" size="small"
            @click="openEditDialog(item)">mdi-pencil</v-icon>
          <v-icon v-if="authStore.can(MENU_ID, 'delete')" size="small" @click="confirmDelete(item)">mdi-delete</v-icon>
        </template>
        <template #no-data>
          <div class="text-center pa-4">
            <v-icon class="mb-2" color="grey" size="32">mdi-database-off-outline</v-icon>
            <p class="text-grey">Tidak ada data customer untuk ditampilkan.</p>
          </div>
        </template>
      </v-data-table>
    </v-card>

    <v-dialog v-model="dialog" max-width="900px" persistent>
      <v-card>
        <v-card-title class="pa-4">
          <span class="text-h5">{{ dialogTitle }}</span>
        </v-card-title>
        <v-card-text class="py-4">
          <v-container>
            <v-row>
              <!-- Kolom Kiri -->
              <v-col cols="12" md="6">
                <v-text-field v-model="editedItem.kode" label="Kode" readonly variant="outlined" density="compact"
                  placeholder="(Akan dibuat otomatis)"></v-text-field>
                <v-text-field v-model="editedItem.nama" label="Nama" variant="outlined"
                  density="compact"></v-text-field>
                <v-textarea v-model="editedItem.alamat" label="Alamat" variant="outlined" density="compact"
                  rows="2"></v-textarea>
                <v-text-field v-model="editedItem.kota" label="Kota" variant="outlined"
                  density="compact"></v-text-field>
                <v-text-field v-model="editedItem.telp" label="No Telp/Hp" variant="outlined"
                  density="compact"></v-text-field>
                <v-text-field v-model="editedItem.namaKontak" label="Nama Kontak Person" variant="outlined"
                  density="compact"></v-text-field>
                <v-text-field v-model="editedItem.tglLahir" label="Tanggal Lahir" type="date" variant="outlined"
                  density="compact"></v-text-field>
                <v-text-field v-model="editedItem.top" label="TOP (Tempo)" type="number" suffix="hari"
                  variant="outlined" density="compact"></v-text-field>
                <v-radio-group v-model="editedItem.status" inline label="Status">
                  <v-radio label="Aktif" value="AKTIF"></v-radio>
                  <v-radio label="Pasif" value="PASIF"></v-radio>
                </v-radio-group>
                <v-select v-model="editedItem.level" :items="availableLevels" item-title="nama" item-value="kode"
                  label="Level" variant="outlined" density="compact"></v-select>
              </v-col>
              <!-- Kolom Kanan -->
              <v-col cols="12" md="6">
                <v-text-field v-model="editedItem.npwp" label="NPWP" variant="outlined"
                  density="compact"></v-text-field>
                <v-text-field v-model="editedItem.namaNpwp" label="Nama NPWP" variant="outlined"
                  density="compact"></v-text-field>
                <v-textarea v-model="editedItem.alamatNpwp" label="Alamat NPWP" variant="outlined" density="compact"
                  rows="2"></v-textarea>
                <v-text-field v-model="editedItem.kotaNpwp" label="Kota NPWP" variant="outlined"
                  density="compact"></v-text-field>
                <h3 class="text-subtitle-1 mt-4 mb-2">History Level</h3>
                <v-data-table :headers="levelHistoryHeaders" :items="levelHistory" density="compact"
                  class="border rounded-lg">
                  <template #item.no="{ index }">
                    {{ index + 1 }}
                  </template>
                </v-data-table>
              </v-col>
            </v-row>
          </v-container>
        </v-card-text>
        <v-card-actions class="pa-4">
          <v-spacer></v-spacer>
          <v-btn variant="text" @click="dialog = false">Tutup</v-btn>
          <v-btn color="primary" variant="elevated" @click="saveCustomer">Simpan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    <v-dialog v-model="dialogDelete" max-width="500px">
      <v-card>
        <v-card-title class="text-h5">Konfirmasi Hapus</v-card-title>
        <v-card-text>
          Apakah Anda yakin ingin menghapus customer <strong>{{ itemToDelete?.nama }}</strong>?
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
