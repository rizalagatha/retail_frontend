<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import type { DataTableHeader } from 'vuetify';
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
  franchise?: 'Y' | 'N';
  limitTrans: number;
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
const isSaving = ref(false);
const selected = ref<Customer[]>([]);

const dialog = ref(false);
const isNew = ref(true);
const editedItem = ref<Partial<Customer>>({});
const levelHistory = ref<LevelHistory[]>([]);
const availableLevels = ref([]);

// --- State untuk konfirmasi hapus ---
// const dialogDelete = ref(false); // <-- TAMBAHKAN INI
// const itemToDelete = ref<Customer | null>(null); // <-- TAMBAHKAN INI

const hasViewPermission = computed(() => authStore.can(MENU_ID, 'view'));

const headers: DataTableHeader[] = [
  { title: 'Kode', key: 'kode', width: '120px' },
  { title: 'Nama', key: 'nama', width: '200px' },
  { title: 'Alamat', key: 'alamat', width: '200px' },
  { title: 'Kota', key: 'kota', width: '120px' },
  { title: 'Telp', key: 'telp', width: '120px' },
  { title: 'Kontak', key: 'namaKontak', width: '150px' },
  { title: 'Level', key: 'level', width: '150px' },
  { title: 'Limit', key: 'limitTrans', align: 'end', width: '120px' },
  { title: 'TOP', key: 'top', align: 'end', width: '80px' },
  { title: 'Status', key: 'status', width: '100px' },
  { title: 'Actions', key: 'actions', sortable: false, width: '100px' }
];

const levelHistoryHeaders = [
  { title: 'No.', key: 'no', sortable: false },
  { title: 'Tanggal', key: 'tanggal' },
  { title: 'Kode', key: 'kode' },
  { title: 'Level', key: 'level' },
];

// --- Computed Properties ---
const canEdit = computed(() => selected.value.length === 1);
// const canDelete = computed(() => selected.value.length === 1);
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
  } catch {
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
  } catch {
    toast.error('Gagal memuat detail customer.');
  }
};

const handleEditFromHeader = () => {
  if (canEdit.value) {
    openEditDialog(selected.value[0]);
  }
};

const normalizeNullableFields = () => {
  const fields = ["npwp", "namaNpwp", "alamatNpwp", "kotaNpwp"];

  fields.forEach(f => {
    if (editedItem.value[f] === "" || editedItem.value[f] === undefined) {
      editedItem.value[f] = null;
    }
  });
};

const saveCustomer = async () => {
  normalizeNullableFields();

  isSaving.value = true;
  try {
    if (isNew.value) {
      const response = await api.post('/customers', editedItem.value);
      toast.success(response.data.message);
    } else {
      const response = await api.put(`/customers/${editedItem.value.kode}`, editedItem.value);
      toast.success(response.data.message);
    }

    fetchCustomers();
    dialog.value = false;

  } catch (error: unknown) {
    const err = error as { response?: { data?: { message?: string } } };
    toast.error(err.response?.data?.message || 'Gagal menyimpan data customer.');
  } finally {
    isSaving.value = false;
  }
};

// const deleteCustomer = async (item: Customer) => {
//   // if (confirm(`Yakin ingin menghapus customer ${item.nama}?`)) {
//   try {
//     const response = await api.delete(`/customers/${item.kode}`);
//     toast.success(response.data.message);
//     fetchCustomers();
//   } catch (error) {
//     toast.error('Gagal menghapus data customer.');
//   }
//   // }
// };

// const handleDeleteFromHeader = () => {
//   if (canDelete.value) {
//     // Panggil confirmDelete agar pengecekan statusnya terpusat
//     confirmDelete(selected.value[0]);
//   }
// };

const printData = () => {
  if (customers.value.length === 0) {
    toast.info("Tidak ada data untuk dicetak.");
    return;
  }
  const doc = new jsPDF();
  doc.text("Daftar Customer", 14, 16);
  autoTable(doc, {
    head: [['Kode', 'Nama', 'Level', 'Alamat', 'Status']], // Tambahkan 'Level'
    body: customers.value.map(c => [c.kode, c.nama, c.level, c.alamat, c.status]), // Tambahkan c.level
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
    Level: c.level,
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

// const confirmDelete = (item: Customer) => {
//   // Cek status customer sebelum membuka dialog konfirmasi
//   if (item.status === 'AKTIF') {
//     toast.warning('Customer yang berstatus AKTIF tidak dapat dihapus.');
//     return; // Hentikan proses jika statusnya AKTIF
//   }

//   // Jika status PASIF, lanjutkan seperti biasa
//   itemToDelete.value = item;
//   dialogDelete.value = true;
// };

// Menjalankan aksi hapus setelah konfirmasi
// const deleteConfirmed = () => {
//   if (itemToDelete.value) {
//     deleteCustomer(itemToDelete.value);
//   }
//   dialogDelete.value = false;
//   itemToDelete.value = null;
// };

const getItemKey = (item: Customer) => `${item.kode}-${item.level}`;

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
      <!-- <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" color="error" :disabled="!canDelete" @click="handleDeleteFromHeader"
        prepend-icon="mdi-delete">Hapus</v-btn> -->
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
      <AppDataTable v-model="selected" :headers="headers" :items="customers" :search="search" :loading="isLoading"
        :item-value="getItemKey" density="compact" class="desktop-table header-browse-blue" fixed-header show-select
        return-object>
        <template #[`item.status`]="{ item }">
          <v-chip :color="item.status === 'AKTIF' ? 'success' : 'error'" size="x-small" variant="tonal">
            {{ item.status }}
          </v-chip>
        </template>
        <template #[`item.tglLahir`]="{ item }">
          {{ item.tglLahir ? format(new Date(item.tglLahir), 'dd/MM/yyyy') : '-' }}
        </template>
        <template #[`item.top`]="{ item }">
          {{ item.top }} hari
        </template>
        <template #[`item.level`]="{ item }">
          <v-chip size="x-small" color="primary" variant="outlined" v-if="item.level">
            {{ item.level }}
          </v-chip>
          <span v-else class="text-caption text-grey">Belum diatur</span>
        </template>
        <template #[`item.limitTrans`]="{ item }">
          {{ new Intl.NumberFormat('id-ID').format(item.limit || 0) }}
        </template>
        <template #[`item.actions`]="{ item }">
          <v-icon v-if="authStore.can(MENU_ID, 'edit')" size="small" class="me-2" @click="openEditDialog(item)">
            mdi-pencil
          </v-icon>
          <!-- <v-icon v-if="authStore.can(MENU_ID, 'delete')" size="small" @click="confirmDelete(item)">
            mdi-delete
          </v-icon> -->
        </template>
      </AppDataTable>
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
                  placeholder="(Otomatis)" hide-details class="mb-2"></v-text-field>
                <v-text-field v-model="editedItem.nama" label="Nama" variant="outlined" density="compact" hide-details
                  class="mb-2"></v-text-field>
                <v-textarea v-model="editedItem.alamat" label="Alamat" variant="outlined" density="compact" rows="2"
                  hide-details class="mb-2"></v-textarea>
                <v-text-field v-model="editedItem.kota" label="Kota" variant="outlined" density="compact" hide-details
                  class="mb-2"></v-text-field>
                <v-text-field v-model="editedItem.telp" label="No Telp/Hp" variant="outlined" density="compact"
                  hide-details class="mb-2"></v-text-field>
                <v-text-field v-model="editedItem.namaKontak" label="Kontak Person" variant="outlined" density="compact"
                  hide-details class="mb-2"></v-text-field>
                <v-text-field v-model="editedItem.tglLahir" label="Tanggal Lahir" type="date" variant="outlined"
                  density="compact" hide-details class="mb-2"></v-text-field>
                <v-text-field v-model="editedItem.top" label="TOP" type="number" suffix="hari" variant="outlined"
                  density="compact" hide-details class="mb-2"></v-text-field>
                <v-select v-model="editedItem.level" :items="availableLevels" item-title="nama" item-value="kode"
                  label="Level" variant="outlined" density="compact" hide-details class="mb-2"></v-select>
                <v-radio-group v-model="editedItem.status" inline label="Status" density="compact" hide-details
                  class="mb-2">
                  <v-radio label="Aktif" value="AKTIF" color="success"></v-radio>
                  <v-radio label="Pasif" value="PASIF" color="error"></v-radio>
                </v-radio-group>
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field v-model="editedItem.npwp" label="NPWP" variant="outlined" density="compact" hide-details
                  class="mb-2"></v-text-field>
                <v-text-field v-model="editedItem.namaNpwp" label="Nama NPWP" variant="outlined" density="compact"
                  hide-details class="mb-2"></v-text-field>
                <v-textarea v-model="editedItem.alamatNpwp" label="Alamat NPWP" variant="outlined" density="compact"
                  rows="2" hide-details class="mb-2"></v-textarea>
                <v-text-field v-model="editedItem.kotaNpwp" label="Kota NPWP" variant="outlined" density="compact"
                  hide-details class="mb-2"></v-text-field>

                <h3 class="text-subtitle-2 mt-4 mb-2 text-high-emphasis">History Level</h3>
                <v-data-table :headers="levelHistoryHeaders" :items="levelHistory" density="compact"
                  class="border rounded-sm bg-surface"
                  style="border-color: rgba(var(--v-border-color), var(--v-border-opacity)) !important;">
                  <template #[`item.no`]="{ index }">
                    {{ index + 1 }}
                  </template>
                  <template #[`item.tanggal`]="{ item }">
                    {{ item.tanggal ? format(new Date(item.tanggal), 'dd/MM/yyyy') : '-' }}
                  </template>
                </v-data-table>
              </v-col>
            </v-row>
          </v-container>
        </v-card-text>

        <v-card-actions class="dialog-footer">
          <v-spacer></v-spacer>
          <v-btn variant="text" color="grey" @click="dialog = false">Batal</v-btn>
          <v-btn color="primary" variant="flat" @click="saveCustomer" :loading="isSaving" :disabled="isSaving">
            Simpan
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- <v-dialog v-model="dialogDelete" max-width="500px">
      <v-card>
        <v-card-title class="text-h5">Konfirmasi Hapus</v-card-title>
        <v-card-text>Apakah Anda yakin ingin menghapus customer <strong>{{ itemToDelete?.nama }}</strong>?</v-card-text>
        <v-card-actions><v-spacer></v-spacer><v-btn @click="dialogDelete = false">Batal</v-btn><v-btn
            color="red-darken-1" variant="elevated"
            @click="deleteConfirmed">Hapus</v-btn><v-spacer></v-spacer></v-card-actions>
      </v-card>
    </v-dialog> -->
  </PageLayout>
</template>

<style scoped>
/* Dialog Styles */
.dialog-card {
  font-size: 12px;
  /* [FIX] Background card ikut tema */
  background-color: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
}

.dialog-header {
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  padding: 8px 16px;
  /* [FIX] Background header dialog lebih gelap/terang sedikit dari surface */
  background-color: rgb(var(--v-theme-background));
}

.dialog-footer {
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  padding: 8px 16px;
  background-color: rgb(var(--v-theme-background));
}

/* Mengatur font untuk label */
.dialog-card :deep(.v-label) {
  font-size: 11px !important;
  color: rgba(var(--v-theme-on-surface), 0.7);
}

/* Mengatur font untuk teks input */
.dialog-card :deep(input),
.dialog-card :deep(textarea),
.dialog-card :deep(.v-select__selection-text) {
  font-size: 12px !important;
  color: rgb(var(--v-theme-on-surface));
}

/* Fix input field background di dark mode */
.dialog-card :deep(.v-field) {
  background-color: rgb(var(--v-theme-surface)) !important;
  border-color: rgba(var(--v-border-color), var(--v-border-opacity));
}

/* Mengatur jarak antar field */
.dialog-card :deep(.v-text-field),
.dialog-card :deep(.v-textarea),
.dialog-card :deep(.v-select),
.dialog-card :deep(.v-radio-group) {
  margin-bottom: 8px;
  /* Tambah jarak sedikit biar gak terlalu mepet */
}

/* Fix table header di dalam dialog (History Level) */
.dialog-card :deep(thead tr th) {
  background-color: rgb(var(--v-theme-background)) !important;
  color: rgb(var(--v-theme-on-surface)) !important;
  font-weight: 600;
}
</style>
