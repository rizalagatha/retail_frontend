<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import SupplierSearchModal from '@/components/SupplierSearchModal.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '8'; 

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

const dialogDelete = ref(false);
const itemToDelete = ref<Supplier | null>(null);

const hasViewPermission = computed(() => authStore.can(MENU_ID, 'view'));

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

onMounted(() => {
    if(hasViewPermission.value) {
        fetchSuppliers();
    } else {
        isLoading.value = false;
        toast.error("Anda tidak memiliki izin untuk mengakses halaman ini.");
    }
});
</script>

<template>
  <PageLayout title="Master Supplier" desktop-mode icon="mdi-truck-delivery">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary" @click="openNewDialog" prepend-icon="mdi-plus">Baru</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" :disabled="!canEdit" @click="handleEditFromHeader" prepend-icon="mdi-pencil">Ubah</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" :disabled="!canDelete" @click="handleDeleteFromHeader" prepend-icon="mdi-delete">Hapus</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'view')" size="small" @click="printData" prepend-icon="mdi-printer">Cetak</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'view')" size="small" @click="exportData" prepend-icon="mdi-file-excel">Export</v-btn>
    </template>
    
    <div v-if="!hasViewPermission" class="state-container">
        <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
        <h3 class="text-h6">Akses Ditolak</h3>
    </div>

    <div v-else class="browse-content">
      <!-- Filter Section -->
      <div class="filter-section">
        <v-text-field v-model="search" density="compact" label="Cari Supplier..." prepend-inner-icon="mdi-magnify" variant="outlined" hide-details single-line></v-text-field>
        <v-spacer></v-spacer>
        <v-btn @click="fetchSuppliers" icon="mdi-refresh" variant="text" size="small"></v-btn>
      </div>

      <!-- Table Section -->
      <v-data-table
        v-model="selected"
        :headers="headers"
        :items="suppliers"
        :search="search"
        :loading="isLoading"
        item-value="kode"
        density="compact"
        class="desktop-table"
        fixed-header
        show-select
        return-object
      >
        <template #item.status="{ item }">
          <v-chip :color="item.status === 'AKTIF' ? 'success' : 'error'" variant="tonal" size="x-small">{{ item.status }}</v-chip>
        </template>
        <template #item.actions="{ item }">
          <v-icon v-if="authStore.can(MENU_ID, 'edit')" size="small" class="me-2" @click="openEditDialog(item)">mdi-pencil</v-icon>
          <v-icon v-if="authStore.can(MENU_ID, 'delete')" size="small" @click="confirmDelete(item)">mdi-delete</v-icon>
        </template>
      </v-data-table>
    </div>

    <!-- Dialogs -->
    <v-dialog v-model="dialog" max-width="800px" persistent>
      <v-card class="dialog-card">
        <v-card-title class="dialog-header">
          <span class="text-subtitle-1 font-weight-medium">{{ dialogTitle }}</span>
        </v-card-title>
        <v-card-text class="pa-4">
          <v-container>
            <v-row>
              <v-col cols="12" md="6">
                  <v-text-field v-model="editedItem.kode" label="Kode" :disabled="!isNew" variant="outlined" density="compact" hide-details placeholder="Ketik atau F1..." @keydown.f1.prevent="isHelpModalVisible = true" append-inner-icon="mdi-magnify" @click:append-inner="isHelpModalVisible = true"></v-text-field>
                  <v-text-field v-model="editedItem.nama" label="Nama" variant="outlined" density="compact" hide-details></v-text-field>
                  <v-textarea v-model="editedItem.alamat" label="Alamat" variant="outlined" density="compact" rows="2" hide-details></v-textarea>
                  <v-text-field v-model="editedItem.kota" label="Kota" variant="outlined" density="compact" hide-details></v-text-field>
                  <v-text-field v-model="editedItem.telp" label="Telepon" variant="outlined" density="compact" hide-details></v-text-field>
                  <v-text-field v-model="editedItem.contactPerson" label="Contact Person" variant="outlined" density="compact" hide-details></v-text-field>
              </v-col>
              <v-col cols="12" md="6">
                  <v-text-field v-model="editedItem.rekening" label="No. Rekening" variant="outlined" density="compact" hide-details></v-text-field>
                  <v-text-field v-model="editedItem.bank" label="Bank" variant="outlined" density="compact" hide-details></v-text-field>
                  <v-text-field v-model="editedItem.atasNama" label="Atas Nama" variant="outlined" density="compact" hide-details></v-text-field>
                  <v-radio-group v-model="editedItem.status" inline label="Status" density="compact" hide-details class="mt-4">
                      <v-radio label="Aktif" value="AKTIF" color="success"></v-radio>
                      <v-radio label="Pasif" value="PASIF" color="error"></v-radio>
                  </v-radio-group>
              </v-col>
            </v-row>
          </v-container>
        </v-card-text>
        <v-card-actions class="dialog-footer">
          <v-spacer></v-spacer>
          <v-btn size="small" @click="dialog = false">Batal</v-btn>
          <v-btn size="small" color="primary" @click="saveSupplier" variant="elevated">Simpan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
    
    <SupplierSearchModal v-if="isHelpModalVisible" @close="isHelpModalVisible = false" @supplier-selected="handleSupplierSelected" />
    
    <v-dialog v-model="dialogDelete" max-width="500px">
      <v-card>
        <v-card-title class="text-h5">Konfirmasi Hapus</v-card-title>
        <v-card-text>Apakah Anda yakin ingin menghapus supplier <strong>{{ itemToDelete?.nama }}</strong>?</v-card-text>
        <v-card-actions><v-spacer></v-spacer><v-btn @click="dialogDelete = false">Batal</v-btn><v-btn color="red-darken-1" variant="elevated" @click="deleteConfirmed">Hapus</v-btn><v-spacer></v-spacer></v-card-actions>
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
.desktop-table :deep(td), .desktop-table :deep(th) {
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
.dialog-card :deep(.v-text-field),
.dialog-card :deep(.v-select),
.dialog-card :deep(.v-textarea) {
    margin-bottom: 12px;
}
</style>

