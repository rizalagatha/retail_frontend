<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore'; // (1) Impor authStore
import { format } from 'date-fns';

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

const hasViewPermission = computed(() => authStore.can(MENU_ID, 'view'));

const headers = [
  { title: 'Kode', key: 'kode', width: '120px' },
  { title: 'Nama', key: 'nama', width: '250px' },
  { title: 'Alamat', key: 'alamat' },
  { title: 'Kota', key: 'kota', width: '150px' },
  { title: 'No. Telpon', key: 'telp', width: '120px' },
  { title: 'Tgl Lahir', key: 'tglLahir', width: '100px' },
  { title: 'TOP', key: 'top', align: 'center', width: '60px' },
  { title: 'Level', key: 'level', width: '120px' },
  { title: 'Status', key: 'status', align: 'center', width: '100px' },
  { title: 'Actions', key: 'actions', sortable: false, align: 'center', width: '80px' },
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
        // Panggil confirmDelete agar pengecekan statusnya terpusat
        confirmDelete(selected.value[0]);
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

const confirmDelete = (item: Customer) => {
  // Cek status customer sebelum membuka dialog konfirmasi
  if (item.status === 'AKTIF') {
    toast.warning('Customer yang berstatus AKTIF tidak dapat dihapus.');
    return; // Hentikan proses jika statusnya AKTIF
  }

  // Jika status PASIF, lanjutkan seperti biasa
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

onMounted(() => {
  if (hasViewPermission.value) {
    fetchCustomers();
  } else {
    isLoading.value = false;
    toast.error("Anda tidak memiliki izin untuk melihat halaman ini.");
  }
});
</script>

<template>
  <PageLayout title="Master Customer" desktop-mode icon="mdi-account-multiple">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary" @click="openNewDialog"
        prepend-icon="mdi-plus">Baru</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" :disabled="!canEdit" @click="handleEditFromHeader"
        prepend-icon="mdi-pencil">Ubah</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" :disabled="!canDelete" @click="handleDeleteFromHeader"
        prepend-icon="mdi-delete">Hapus</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'view')" size="small" @click="printData"
        prepend-icon="mdi-printer">Cetak</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'view')" size="small" @click="exportData"
        prepend-icon="mdi-file-excel">Export</v-btn>
    </template>

    <div v-if="!hasViewPermission" class="state-container">
      <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
      <h3 class="text-h6">Akses Ditolak</h3>
    </div>

    <div v-else class="browse-content">
      <!-- Filter Section -->
      <div class="filter-section">
        <v-text-field v-model="search" density="compact" label="Cari Customer..." prepend-inner-icon="mdi-magnify"
          variant="outlined" hide-details single-line></v-text-field>
        <v-spacer></v-spacer>
        <v-btn @click="fetchCustomers" icon="mdi-refresh" variant="text" size="small"></v-btn>
      </div>

      <!-- Table Section -->
      <v-data-table v-model="selected" :headers="headers" :items="customers" :search="search" :loading="isLoading"
        item-value="kode" density="compact" class="desktop-table" fixed-header show-select return-object>
        <template #item.status="{ item }">
          <v-chip :color="item.status === 'AKTIF' ? 'success' : 'error'" variant="tonal" size="x-small">{{ item.status
            }}</v-chip>
        </template>
        <template #item.tglLahir="{ item }">
          {{ item.tglLahir ? format(new Date(item.tglLahir), 'dd/MM/yyyy') : '-' }}
        </template>
        <template #item.top="{ item }">
          {{ item.top }} hari
        </template>
        <template #item.level="{ item }">
          <span class="text-caption">{{ item.level }}</span>
        </template>
        <template #item.actions="{ item }">
          <v-icon v-if="authStore.can(MENU_ID, 'edit')" size="small" class="me-2"
            @click="openEditDialog(item)">mdi-pencil</v-icon>
          <v-icon v-if="authStore.can(MENU_ID, 'delete')" size="small" @click="confirmDelete(item)">mdi-delete</v-icon>
        </template>
      </v-data-table>
    </div>

    <!-- Dialogs -->
    <v-dialog v-model="dialog" max-width="900px" persistent>
      <v-card class="dialog-card">
        <v-card-title class="dialog-header">
          <span class="text-subtitle-1 font-weight-medium">{{ dialogTitle }}</span>
        </v-card-title>
        <v-card-text class="pa-4">
          <v-container>
            <v-row>
              <v-col cols="12" md="6">
                <v-text-field v-model="editedItem.kode" label="Kode" readonly variant="outlined" density="compact"
                  placeholder="(Otomatis)" hide-details></v-text-field>
                <v-text-field v-model="editedItem.nama" label="Nama" variant="outlined" density="compact"
                  hide-details></v-text-field>
                <v-textarea v-model="editedItem.alamat" label="Alamat" variant="outlined" density="compact" rows="2"
                  hide-details></v-textarea>
                <v-text-field v-model="editedItem.kota" label="Kota" variant="outlined" density="compact"
                  hide-details></v-text-field>
                <v-text-field v-model="editedItem.telp" label="No Telp/Hp" variant="outlined" density="compact"
                  hide-details></v-text-field>
                <v-text-field v-model="editedItem.namaKontak" label="Kontak Person" variant="outlined" density="compact"
                  hide-details></v-text-field>
                <v-text-field v-model="editedItem.tglLahir" label="Tanggal Lahir" type="date" variant="outlined"
                  density="compact" hide-details></v-text-field>
                <v-text-field v-model="editedItem.top" label="TOP" type="number" suffix="hari" variant="outlined"
                  density="compact" hide-details></v-text-field>
                <v-select v-model="editedItem.level" :items="availableLevels" item-title="nama" item-value="kode"
                  label="Level" variant="outlined" density="compact" hide-details></v-select>
                <v-radio-group v-model="editedItem.status" inline label="Status" density="compact" hide-details>
                  <v-radio label="Aktif" value="AKTIF" color="success"></v-radio>
                  <v-radio label="Pasif" value="PASIF" color="error"></v-radio>
                </v-radio-group>
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field v-model="editedItem.npwp" label="NPWP" variant="outlined" density="compact"
                  hide-details></v-text-field>
                <v-text-field v-model="editedItem.namaNpwp" label="Nama NPWP" variant="outlined" density="compact"
                  hide-details></v-text-field>
                <v-textarea v-model="editedItem.alamatNpwp" label="Alamat NPWP" variant="outlined" density="compact"
                  rows="2" hide-details></v-textarea>
                <v-text-field v-model="editedItem.kotaNpwp" label="Kota NPWP" variant="outlined" density="compact"
                  hide-details></v-text-field>
                <h3 class="text-subtitle-2 mt-4 mb-2">History Level</h3>
                <v-data-table :headers="levelHistoryHeaders" :items="levelHistory" density="compact"
                  class="border rounded-sm">
                  <template #item.no="{ index }">{{ index + 1 }}</template>
                  <template #item.tanggal="{ item }">
                    {{ item.tanggal ? format(new Date(item.tanggal), 'dd/MM/yyyy') : '-' }}
                  </template>
                </v-data-table>
              </v-col>
            </v-row>
          </v-container>
        </v-card-text>
        <v-card-actions class="dialog-footer">
          <v-spacer></v-spacer>
          <v-btn size="small" @click="dialog = false">Tutup</v-btn>
          <v-btn size="small" color="primary" @click="saveCustomer" variant="elevated">Simpan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="dialogDelete" max-width="500px">
      <v-card>
        <v-card-title class="text-h5">Konfirmasi Hapus</v-card-title>
        <v-card-text>Apakah Anda yakin ingin menghapus customer <strong>{{ itemToDelete?.nama }}</strong>?</v-card-text>
        <v-card-actions><v-spacer></v-spacer><v-btn @click="dialogDelete = false">Batal</v-btn><v-btn
            color="red-darken-1" variant="elevated"
            @click="deleteConfirmed">Hapus</v-btn><v-spacer></v-spacer></v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
.browse-content {
  border: 1px solid #e0e0e0;
  background-color: #ffffff;
  display: flex;
  flex-direction: column;
}

.filter-section {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 6px 10px;
  border-bottom: 1px solid #e0e0e0;
  flex-shrink: 0;
}

.desktop-table {
  font-size: 11px;
}

.desktop-table :deep(td),
.desktop-table :deep(th) {
  padding: 0 8px !important;
  height: 28px !important;
}

.state-container {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100%;
  color: #757575;
}

/* Dialog Styles */
.dialog-card {
  font-size: 12px;
}

.dialog-header {
  border-bottom: 1px solid #e0e0e0;
  padding: 8px 16px;
  background-color: #f5f5f5;
}

.dialog-footer {
  border-top: 1px solid #e0e0e0;
  padding: 8px 16px;
  background-color: #f5f5f5;
}

/* Memberikan sedikit ruang antar field */
.dialog-card :deep(.v-text-field),
.dialog-card :deep(.v-select),
.dialog-card :deep(.v-textarea) {
  margin-bottom: 8px;
}
</style>
