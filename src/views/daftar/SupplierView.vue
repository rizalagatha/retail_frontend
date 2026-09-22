<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import SupplierSearchModal from "@/components/lookup/SupplierSearchModal.vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import AppDataTable from "@/components/AppDataTable.vue";

const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "8";

interface Supplier {
  kode: string;
  nama: string;
  alamat: string;
  kota: string;
  telp: string;
  contactPerson: string;
  status: "AKTIF" | "PASIF";
  rekening: string;
  bank: string;
  atasNama: string;
}

// --- State ---
const suppliers = ref<Supplier[]>([]);
const search = ref("");
const isLoading = ref(true);
const selected = ref<Supplier[]>([]);

const dialog = ref(false);
const isNew = ref(true);
const editedItem = ref<Partial<Supplier>>({});
const isHelpModalVisible = ref(false);

const dialogDelete = ref(false);
const itemToDelete = ref<Supplier | null>(null);

const hasViewPermission = computed(() => authStore.can(MENU_ID, "view"));

const headers = [
  { title: "Kode", key: "kode" },
  { title: "Nama", key: "nama" },
  { title: "Alamat", key: "alamat" },
  { title: "Kota", key: "kota" },
  { title: "Contact Person", key: "contactPerson" },
  { title: "Status", key: "status", align: "center" },
  { title: "Actions", key: "actions", sortable: false, align: "center" },
] as const;

// --- Computed Properties ---
const canEdit = computed(() => selected.value.length === 1);
const canDelete = computed(() => selected.value.length === 1);
const dialogTitle = computed(() => (isNew.value ? "Supplier Baru" : "Ubah Supplier"));

// --- Methods ---
const fetchSuppliers = async () => {
  isLoading.value = true;
  selected.value = [];
  try {
    const response = await api.get("/suppliers");
    suppliers.value = response.data;
  } catch {
    toast.error("Gagal memuat data supplier.");
  } finally {
    isLoading.value = false;
  }
};

const openNewDialog = () => {
  isNew.value = true;
  editedItem.value = { status: "AKTIF" };
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
  if (canEdit.value) {
    openEditDialog(selected.value[0]);
  }
};

const saveSupplier = async () => {
  try {
    const payload = {
      ...editedItem.value,
      isNew: isNew.value,
      user: authStore.user,
    };
    await api.post("/suppliers/save", payload);
    toast.success("Data supplier berhasil disimpan.");
    fetchSuppliers();
    dialog.value = false;
  } catch {
    toast.error("Gagal menyimpan data supplier.");
  }
};

const deleteSupplier = async (item: Supplier) => {
  try {
    await api.delete(`/suppliers/${item.kode}`);
    toast.success("Data supplier berhasil dihapus.");
    fetchSuppliers();
  } catch {
    toast.error("Gagal menghapus data supplier.");
  }
};

const handleDeleteFromHeader = () => {
  if (canDelete.value) {
    confirmDelete(selected.value[0]);
  }
};

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
    head: [["Kode", "Nama", "Alamat", "Kota", "Status"]],
    body: suppliers.value.map((s) => [s.kode, s.nama, s.alamat, s.kota, s.status]),
    startY: 20,
  });
  doc.autoPrint();
  window.open(doc.output("bloburl"), "_blank");
};

const exportData = () => {
  const worksheet = XLSX.utils.json_to_sheet(suppliers.value);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Suppliers");
  XLSX.writeFile(workbook, "DaftarSupplier.xlsx");
};

onMounted(() => {
  if (hasViewPermission.value) {
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
      <v-btn
        v-if="authStore.can(MENU_ID, 'insert')"
        size="small"
        class="btn-primary-red"
        variant="flat"
        @click="openNewDialog"
        prepend-icon="mdi-plus"
        >Baru</v-btn
      >
      <v-btn
        v-if="authStore.can(MENU_ID, 'edit')"
        size="small"
        variant="tonal"
        class="btn-header-action"
        :disabled="!canEdit"
        @click="handleEditFromHeader"
        prepend-icon="mdi-pencil"
        >Ubah</v-btn
      >
      <v-btn
        v-if="authStore.can(MENU_ID, 'delete')"
        size="small"
        color="error"
        variant="tonal"
        :disabled="!canDelete"
        @click="handleDeleteFromHeader"
        prepend-icon="mdi-delete"
        >Hapus</v-btn
      >
      <v-btn
        v-if="authStore.can(MENU_ID, 'view')"
        size="small"
        variant="tonal"
        class="btn-header-action"
        @click="printData"
        prepend-icon="mdi-printer"
        >Cetak</v-btn
      >
      <v-btn
        v-if="authStore.can(MENU_ID, 'view')"
        size="small"
        variant="tonal"
        class="btn-header-action"
        @click="exportData"
        prepend-icon="mdi-file-excel"
        >Export</v-btn
      >
    </template>

    <div v-if="!hasViewPermission" class="state-container">
      <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
      <h3 class="text-h6">Akses Ditolak</h3>
    </div>

    <div v-else class="browse-content">
      <div class="filter-section">
        <v-text-field
          v-model="search"
          density="compact"
          label="Cari Supplier..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          hide-details
          single-line
        ></v-text-field>
        <v-spacer></v-spacer>
        <v-btn @click="fetchSuppliers" icon="mdi-refresh" variant="text" size="small"></v-btn>
      </div>

      <AppDataTable
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
        <template #[`item.status`]="{ item }">
          <v-chip
            :color="item.status === 'AKTIF' ? 'success' : 'error'"
            variant="tonal"
            size="x-small"
          >
            {{ item.status }}
          </v-chip>
        </template>
        <template #[`item.actions`]="{ item }">
          <v-icon
            v-if="authStore.can(MENU_ID, 'edit')"
            size="small"
            class="me-2"
            @click="openEditDialog(item)"
          >
            mdi-pencil
          </v-icon>
          <v-icon v-if="authStore.can(MENU_ID, 'delete')" size="small" @click="confirmDelete(item)">
            mdi-delete
          </v-icon>
        </template>
      </AppDataTable>
    </div>

    <v-dialog v-model="dialog" max-width="800px" persistent>
      <v-card class="dialog-card">
        <v-card-title class="dialog-header">
          <span class="text-subtitle-1 font-weight-medium">{{ dialogTitle }}</span>
        </v-card-title>

        <v-card-text class="pa-4">
          <v-container>
            <v-row>
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="editedItem.kode"
                  label="Kode"
                  :disabled="!isNew"
                  variant="outlined"
                  density="compact"
                  hide-details
                  placeholder="Ketik atau F1..."
                  class="mb-2"
                  @keydown.f1.prevent="isHelpModalVisible = true"
                  append-inner-icon="mdi-magnify"
                  @click:append-inner="isHelpModalVisible = true"
                ></v-text-field>

                <v-text-field
                  v-model="editedItem.nama"
                  label="Nama"
                  variant="outlined"
                  density="compact"
                  hide-details
                  class="mb-2"
                ></v-text-field>

                <v-textarea
                  v-model="editedItem.alamat"
                  label="Alamat"
                  variant="outlined"
                  density="compact"
                  rows="2"
                  hide-details
                  class="mb-2"
                ></v-textarea>

                <v-text-field
                  v-model="editedItem.kota"
                  label="Kota"
                  variant="outlined"
                  density="compact"
                  hide-details
                  class="mb-2"
                ></v-text-field>

                <v-text-field
                  v-model="editedItem.telp"
                  label="Telepon"
                  variant="outlined"
                  density="compact"
                  hide-details
                  class="mb-2"
                ></v-text-field>

                <v-text-field
                  v-model="editedItem.contactPerson"
                  label="Contact Person"
                  variant="outlined"
                  density="compact"
                  hide-details
                  class="mb-2"
                ></v-text-field>
              </v-col>
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="editedItem.rekening"
                  label="No. Rekening"
                  variant="outlined"
                  density="compact"
                  hide-details
                  class="mb-2"
                ></v-text-field>

                <v-text-field
                  v-model="editedItem.bank"
                  label="Bank"
                  variant="outlined"
                  density="compact"
                  hide-details
                  class="mb-2"
                ></v-text-field>

                <v-text-field
                  v-model="editedItem.atasNama"
                  label="Atas Nama"
                  variant="outlined"
                  density="compact"
                  hide-details
                  class="mb-2"
                ></v-text-field>

                <v-radio-group
                  v-model="editedItem.status"
                  inline
                  label="Status"
                  density="compact"
                  hide-details
                  class="mt-4"
                >
                  <v-radio label="Aktif" value="AKTIF" color="success"></v-radio>
                  <v-radio label="Pasif" value="PASIF" color="error"></v-radio>
                </v-radio-group>
              </v-col>
            </v-row>
          </v-container>
        </v-card-text>

        <v-card-actions class="dialog-footer">
          <v-spacer></v-spacer>
          <v-btn size="small" variant="text" color="grey" @click="dialog = false">Batal</v-btn>
          <v-btn size="small" class="btn-primary-red" @click="saveSupplier" variant="flat"
            >Simpan</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>

    <SupplierSearchModal
      v-if="isHelpModalVisible"
      @close="isHelpModalVisible = false"
      @supplier-selected="handleSupplierSelected"
    />

    <v-dialog v-model="dialogDelete" max-width="500px">
      <v-card class="dialog-card">
        <v-card-title class="dialog-header">Konfirmasi Hapus</v-card-title>
        <v-card-text class="pa-4 pt-6 text-body-1">
          Apakah Anda yakin ingin menghapus supplier <strong>{{ itemToDelete?.nama }}</strong
          >?
        </v-card-text>
        <v-card-actions class="dialog-footer">
          <v-spacer></v-spacer>
          <v-btn variant="text" color="grey" @click="dialogDelete = false">Batal</v-btn>
          <v-btn color="error" variant="flat" @click="deleteConfirmed">Hapus</v-btn>
          <v-spacer></v-spacer>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>

<style scoped>
/* Dialog Styles (Dark Mode Compatible) */
.dialog-card {
  font-size: 12px;
  background-color: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
}

.dialog-header {
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  padding: 8px 16px;
  background-color: rgb(var(--v-theme-background));
}

.dialog-footer {
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  padding: 8px 16px;
  background-color: rgb(var(--v-theme-background));
}

/* Fix Input Text Color & Background */
.dialog-card :deep(.v-field__input),
.dialog-card :deep(.v-label) {
  color: rgb(var(--v-theme-on-surface));
}

.dialog-card :deep(.v-field) {
  background-color: rgb(var(--v-theme-surface));
  border-color: rgba(var(--v-border-color), var(--v-border-opacity));
}

.dialog-card :deep(.v-text-field),
.dialog-card :deep(.v-select),
.dialog-card :deep(.v-textarea) {
  margin-bottom: 12px;
}

/* ══════════════ TOMBOL HEADER TEMA MERAH ══════════════ */
.btn-primary-red {
  background: linear-gradient(135deg, #b71c1c 0%, #8e0000 100%) !important;
  color: #ffffff !important;
}
.btn-primary-red:hover {
  filter: brightness(1.08);
}

.btn-header-action {
  background-color: rgba(183, 28, 28, 0.08) !important;
  color: #b71c1c !important;
  font-weight: 700;
  border: 1px solid rgba(183, 28, 28, 0.2);
}
.btn-header-action:hover:not(:disabled) {
  background-color: rgba(183, 28, 28, 0.14) !important;
}
.btn-header-action:disabled {
  opacity: 0.4;
}

/* ══════════════ FILTER SECTION AKSEN MERAH ══════════════ */
.filter-section {
  border-bottom: 2px solid rgba(183, 28, 28, 0.15) !important;
  background: linear-gradient(180deg, rgba(183, 28, 28, 0.03) 0%, transparent 100%);
}

/* --- Search bar diperlebar — selector spesifik agar menang dari CSS global
     .filter-section .v-input { flex: 0 0 auto } --- */
.filter-section .search-grow.supplier-search-field {
  flex: 0 0 420px !important;
  width: 420px !important;
  min-width: 420px !important;
  max-width: 420px !important;
  flex-shrink: 0 !important;
  flex-grow: 0 !important;
}

.filter-section .search-grow.supplier-search-field :deep(.v-input__control) {
  width: 100% !important;
}

.filter-section .search-grow.supplier-search-field :deep(.v-field) {
  width: 100% !important;
  border-radius: 8px !important;
  background-color: rgba(183, 28, 28, 0.03) !important;
  border: 1px solid rgba(183, 28, 28, 0.25) !important;
  box-shadow: none !important;
}

.filter-section .search-grow.supplier-search-field :deep(.v-field__outline) {
  display: none !important;
}

.filter-section .search-grow.supplier-search-field :deep(.v-field--focused) {
  border-color: #b71c1c !important;
  background-color: rgba(183, 28, 28, 0.06) !important;
}

.filter-section .search-grow.supplier-search-field :deep(.v-field__prepend-inner .v-icon) {
  color: #b71c1c !important;
  opacity: 1 !important;
}

/* ══════════════ HEADER TABEL GRADIENT MERAH ══════════════ */
.desktop-table :deep(thead tr th) {
  background: linear-gradient(135deg, #b71c1c 0%, #8e0000 100%) !important;
  color: #ffffff !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  font-size: 11px !important;
  box-shadow: 0 2px 6px rgba(183, 28, 28, 0.35);
  border-bottom: none !important;
}

.desktop-table :deep(thead tr th span),
.desktop-table :deep(thead tr th .v-icon) {
  color: #ffffff !important;
}

/* ══════════════ ROW HOVER MERAH ══════════════ */
.desktop-table :deep(tbody tr:nth-child(even)) {
  background-color: rgba(183, 28, 28, 0.02);
}

.desktop-table :deep(tbody tr:hover td) {
  background-color: rgba(183, 28, 28, 0.05) !important;
  cursor: pointer;
}

/* ══════════════ CHECKBOX SELEKSI BARIS — MERAH SAAT DICENTANG ══════════════ */
.desktop-table :deep(.v-selection-control--dirty .v-icon) {
  color: #b71c1c !important;
}

/* ══════════════ PAGINATION FOOTER MERAH ══════════════ */
.desktop-table :deep(.v-data-table-footer) {
  padding: 8px 16px !important;
  border-top: 2px solid rgba(183, 28, 28, 0.15);
  background: linear-gradient(180deg, rgba(183, 28, 28, 0.03) 0%, transparent 100%);
}

.desktop-table :deep(.v-data-table-footer__items-per-page .v-field) {
  border-radius: 8px;
  background-color: rgba(183, 28, 28, 0.05);
}

.desktop-table :deep(.v-data-table-footer .v-btn.v-btn--icon) {
  background-color: rgba(183, 28, 28, 0.06);
  border-radius: 8px !important;
  min-width: 32px !important;
  width: 32px;
  height: 32px;
}

.desktop-table :deep(.v-data-table-footer .v-btn.v-btn--icon .v-icon) {
  color: #b71c1c;
}

.desktop-table :deep(.v-data-table-footer .v-btn.v-btn--icon:not(.v-btn--disabled):hover) {
  background-color: #b71c1c;
}

.desktop-table :deep(.v-data-table-footer .v-btn.v-btn--icon:not(.v-btn--disabled):hover .v-icon) {
  color: #ffffff !important;
}

.desktop-table :deep(.v-pagination .v-btn--active) {
  background-color: #b71c1c !important;
  color: #ffffff !important;
}

/* ══════════════ DIALOG FORM: HEADER & AKSEN MERAH ══════════════ */
.dialog-header {
  border-bottom: 2px solid rgba(183, 28, 28, 0.2) !important;
  border-left: 4px solid #b71c1c !important;
  background: linear-gradient(135deg, rgba(183, 28, 28, 0.06) 0%, transparent 100%);
}

.dialog-card :deep(.v-field--focused .v-field__outline) {
  color: #b71c1c !important;
}

.dialog-card :deep(.v-field--focused .v-label) {
  color: #b71c1c !important;
}
</style>
