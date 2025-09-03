<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import api from '@/services/api'; // (1) Gunakan instance API terpusat
import PageLayout from '@/components/PageLayout.vue';
import SupplierSearchModal from '@/components/SupplierSearchModal.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '8'; // (2) Definisikan ID Menu

interface Supplier {
  kode: string;
  nama: string;
  alamat: string;
  kota: string;
  telp: string;
  contactPerson: string;
  status: 'AKTIF' | 'PASIF';
  rekening: string;
  bank: string;
  atasNama: string;
}

// --- State ---
const suppliers = ref<Supplier[]>([]);
const search = ref('');
const isLoading = ref(true);
const selected = ref<Supplier[]>([]);

const dialog = ref(false);
const isNew = ref(true);
const editedItem = ref<Partial<Supplier>>({});
const isHelpModalVisible = ref(false);

// (3) State untuk konfirmasi hapus
const dialogDelete = ref(false);
const itemToDelete = ref<Supplier | null>(null);

const headers = [
  { title: 'Kode', key: 'kode' },
  { title: 'Nama', key: 'nama' },
  { title: 'Alamat', key: 'alamat' },
  { title: 'Kota', key: 'kota' },
  { title: 'Contact Person', key: 'contactPerson' },
  { title: 'Status', key: 'status', align: 'center' },
  { title: 'Actions', key: 'actions', sortable: false, align: 'center' },
];

// --- Computed Properties ---
const canEdit = computed(() => selected.value.length === 1);
const canDelete = computed(() => selected.value.length === 1);
const dialogTitle = computed(() => (isNew.value ? 'Supplier Baru' : 'Ubah Supplier'));

// --- Methods ---
const fetchSuppliers = async () => {
  isLoading.value = true;
  selected.value = [];
  try {
    const response = await api.get('/suppliers'); // Gunakan API
    suppliers.value = response.data;
  } catch (error) {
    toast.error('Gagal memuat data supplier.');
  } finally {
    isLoading.value = false;
  }
};

const openNewDialog = () => {
  isNew.value = true;
  editedItem.value = { status: 'AKTIF' };
  dialog.value = true;
};

const openEditDialog = (item: Supplier) => {
  isNew.value = false;
  editedItem.value = { ...item };
  dialog.value = true;
};

const handleSupplierSelected = (supplier: Supplier) => {
    isHelpModalVisible.value = false;
    openEditDialog(supplier);
};

const handleEditFromHeader = () => {
    if(canEdit.value) {
        openEditDialog(selected.value[0]);
    }
};

const saveSupplier = async () => {
  try {
    const payload = {
        ...editedItem.value,
        isNew: isNew.value,
        user: authStore.user
    };
    await api.post('/suppliers/save', payload); // Gunakan API
    toast.success('Data supplier berhasil disimpan.');
    fetchSuppliers();
  } catch (error) {
    toast.error('Gagal menyimpan data supplier.');
  } finally {
    dialog.value = false;
  }
};

// (4) Ubah metode hapus, hilangkan confirm()
const deleteSupplier = async (item: Supplier) => {
    try {
      await api.delete(`/suppliers/${item.kode}`); // Gunakan API
      toast.success('Data supplier berhasil dihapus.');
      fetchSuppliers();
    } catch (error) {
      toast.error('Gagal menghapus data supplier.');
    }
};

const handleDeleteFromHeader = () => {
    if(canDelete.value) {
        // Panggil dialog konfirmasi
        confirmDelete(selected.value[0]);
    }
};

// (5) Tambahkan metode untuk dialog konfirmasi
const confirmDelete = (item: Supplier) => {
  itemToDelete.value = item;
  dialogDelete.value = true;
};

const deleteConfirmed = () => {
  if (itemToDelete.value) {
    deleteSupplier(itemToDelete.value);
  }
  dialogDelete.value = false;
  itemToDelete.value = null;
};

const printData = () => {
  const doc = new jsPDF();
  doc.text("Daftar Supplier", 14, 16);
  autoTable(doc, {
    head: [['Kode', 'Nama', 'Alamat', 'Kota', 'Status']],
    body: suppliers.value.map(s => [s.kode, s.nama, s.alamat, s.kota, s.status]),
    startY: 20,
  });
  doc.autoPrint();
  window.open(doc.output('bloburl'), '_blank');
};

const exportData = () => {
  const worksheet = XLSX.utils.json_to_sheet(suppliers.value);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Suppliers");
  XLSX.writeFile(workbook, "DaftarSupplier.xlsx");
};

onMounted(fetchSuppliers);
</script>

<template>
  <PageLayout title="Master Supplier">
    <!-- (6) Terapkan v-if pada semua tombol aksi -->
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" color="primary" @click="openNewDialog" prepend-icon="mdi-plus">Baru</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" :disabled="!canEdit" @click="handleEditFromHeader" prepend-icon="mdi-pencil">Ubah</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'delete')" :disabled="!canDelete" @click="handleDeleteFromHeader" prepend-icon="mdi-delete">Hapus</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'view')" @click="printData" prepend-icon="mdi-printer" variant="outlined">Cetak</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'view')" @click="exportData" prepend-icon="mdi-file-excel" variant="outlined">Export</v-btn>
      <v-btn @click="fetchSuppliers" icon="mdi-refresh" variant="text"></v-btn>
    </template>

    <v-card>
      <v-card-title class="d-flex align-center pe-2">
        <v-icon icon="mdi-truck-delivery"></v-icon> &nbsp; Daftar Supplier
        <v-spacer></v-spacer>
        <v-text-field v-model="search" density="compact" label="Cari Supplier" prepend-inner-icon="mdi-magnify" variant="solo-filled" flat hide-details single-line></v-text-field>
      </v-card-title>
      <v-divider></v-divider>
      <v-data-table v-model="selected" :headers="headers" :items="suppliers" :search="search" :loading="isLoading" item-value="kode" show-select return-object hover>
        <template #item.status="{ item }">
          <v-chip :color="item.status === 'AKTIF' ? 'green' : 'red'" variant="elevated">{{ item.status }}</v-chip>
        </template>
        <template #item.actions="{ item }">
          <v-icon v-if="authStore.can(MENU_ID, 'edit')" class="me-2" size="small" @click="openEditDialog(item)">mdi-pencil</v-icon>
          <v-icon v-if="authStore.can(MENU_ID, 'delete')" size="small" @click="confirmDelete(item)">mdi-delete</v-icon>
        </template>
      </v-data-table>
    </v-card>

    <v-dialog v-model="dialog" max-width="800px">
        <v-card>
        <v-card-title>
          <span class="text-h5">{{ dialogTitle }}</span>
        </v-card-title>
        <v-card-text>
          <v-container>
            <v-row>
              <v-col cols="12" sm="6">
                <v-text-field
                    v-model="editedItem.kode"
                    label="Kode"
                    :disabled="!isNew"
                    variant="outlined"
                    @keydown.f1.prevent="isHelpModalVisible = true"
                    hint="Tekan F1 untuk bantuan"
                    persistent-hint
                ></v-text-field>
              </v-col>
              <v-col cols="12" sm="6">
                <v-text-field v-model="editedItem.nama" label="Nama" variant="outlined"></v-text-field>
              </v-col>
              <v-col cols="12">
                <v-textarea v-model="editedItem.alamat" label="Alamat" variant="outlined" rows="2"></v-textarea>
              </v-col>
              <v-col cols="12" sm="6">
                <v-text-field v-model="editedItem.kota" label="Kota" variant="outlined"></v-text-field>
              </v-col>
              <v-col cols="12" sm="6">
                <v-text-field v-model="editedItem.telp" label="Telepon" variant="outlined"></v-text-field>
              </v-col>
              <v-col cols="12" sm="6">
                <v-text-field v-model="editedItem.contactPerson" label="Contact Person" variant="outlined"></v-text-field>
              </v-col>
              <v-col cols="12" sm="6">
                <v-select v-model="editedItem.status" :items="['AKTIF', 'PASIF']" label="Status" variant="outlined"></v-select>
              </v-col>
              <v-divider class="my-4"></v-divider>
              <v-col cols="12" sm="4">
                <v-text-field v-model="editedItem.rekening" label="No. Rekening" variant="outlined"></v-text-field>
              </v-col>
              <v-col cols="12" sm="4">
                <v-text-field v-model="editedItem.bank" label="Bank" variant="outlined"></v-text-field>
              </v-col>
              <v-col cols="12" sm="4">
                <v-text-field v-model="editedItem.atasNama" label="Atas Nama" variant="outlined"></v-text-field>
              </v-col>
            </v-row>
          </v-container>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn color="blue-darken-1" variant="text" @click="dialog = false">Batal</v-btn>
          <v-btn color="blue-darken-1" variant="text" @click="saveSupplier">Simpan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <SupplierSearchModal
        v-if="isHelpModalVisible"
        @close="isHelpModalVisible = false"
        @supplier-selected="handleSupplierSelected"
    />
    
    <!-- (7) Tambahkan dialog konfirmasi hapus -->
    <v-dialog v-model="dialogDelete" max-width="500px">
      <v-card>
        <v-card-title class="text-h5">Konfirmasi Hapus</v-card-title>
        <v-card-text>
          Apakah Anda yakin ingin menghapus supplier <strong>{{ itemToDelete?.nama }}</strong>?
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
