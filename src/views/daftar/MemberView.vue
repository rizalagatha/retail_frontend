<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import MemberSearchModal from '@/components/lookup/MemberSearchModal.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '7';

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

const dialogDelete = ref(false);
const itemToDelete = ref<Member | null>(null);

const hasViewPermission = computed(() => authStore.can(MENU_ID, 'view'));

const headers = [
  { title: 'No. HP', key: 'hp' },
  { title: 'Nama', key: 'nama' },
  { title: 'Alamat', key: 'alamat' },
  { title: 'Gender', key: 'gender' },
  { title: 'Usia', key: 'usia' },
  { title: 'Referensi', key: 'referensi' },
  { title: 'Actions', key: 'actions', sortable: false, align: 'center' },
] as const;

const genderItems = ['Pria', 'Wanita'];
const ageItems = ['< 17', '18-24', '25-34', '35-44', '45+'];
const refItems = ['Teman', 'Facebook', 'Instagram', 'Whatsapp', 'Website', 'Lain-lain'];

// --- Computed ---
const canEdit = computed(() => selected.value.length === 1);
const canDelete = computed(() => selected.value.length === 1);
const dialogTitle = computed(() => (isNew.value ? 'Member Baru' : 'Ubah Member'));

// --- Methods ---
const fetchMembers = async () => {
  isLoading.value = true;
  selected.value = [];
  try {
    const response = await api.get('/members');
    members.value = response.data;
  } catch (error) {
    toast.error('Gagal memuat data member.', error);
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
  if (canEdit.value) {
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
    await api.post('/members/save', payload);
    toast.success('Data member berhasil disimpan.');
    fetchMembers();
    dialog.value = false;
  } catch (error) {
    toast.error('Gagal menyimpan data member.', error);
  }
};

const deleteMember = async (item: Member) => {
  try {
    await api.delete(`/members/${item.hp}`);
    toast.success('Data member berhasil dihapus.');
    fetchMembers();
  } catch (error) {
    toast.error('Gagal menghapus data member.', error);
  }
};

const handleDeleteFromHeader = () => {
  if (canDelete.value) {
    confirmDelete(selected.value[0]);
  }
};

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

onMounted(() => {
  if (hasViewPermission.value) {
    fetchMembers();
  } else {
    isLoading.value = false;
    toast.error("Anda tidak memiliki izin untuk melihat halaman ini.");
  }
});
</script>

<template>
  <PageLayout title="Master Member" desktop-mode icon="mdi-account-heart">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary" @click="openNewDialog"
        prepend-icon="mdi-plus">Baru</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" :disabled="!canEdit" @click="handleEditFromHeader"
        prepend-icon="mdi-pencil">Ubah</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" color="error" :disabled="!canDelete"
        @click="handleDeleteFromHeader" prepend-icon="mdi-delete">Hapus</v-btn>
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
      <div class="filter-section">
        <v-text-field v-model="search" density="compact" label="Cari Member..." prepend-inner-icon="mdi-magnify"
          variant="outlined" hide-details single-line></v-text-field>
        <v-spacer></v-spacer>
        <v-btn @click="fetchMembers" icon="mdi-refresh" variant="text" size="small"></v-btn>
      </div>

      <AppDataTable v-model="selected" :headers="headers" :items="members" :search="search" :loading="isLoading"
        item-value="hp" density="compact" class="desktop-table header-browse-blue" fixed-header show-select return-object>
        <template #[`item.actions`]="{ item }">
          <v-icon v-if="authStore.can(MENU_ID, 'edit')" size="small" class="me-2"
            @click="openEditDialog(item)">mdi-pencil</v-icon>
          <v-icon v-if="authStore.can(MENU_ID, 'delete')" size="small" @click="confirmDelete(item)">mdi-delete</v-icon>
        </template>
      </AppDataTable>
    </div>

    <v-dialog v-model="dialog" max-width="600px" persistent>
      <v-card class="dialog-card">
        <v-card-title class="dialog-header">
          <span class="text-subtitle-1 font-weight-medium">{{ dialogTitle }}</span>
        </v-card-title>

        <v-card-text class="pa-4">
          <v-container>
            <v-row>
              <v-col cols="12">
                <v-text-field v-model="editedItem.hp" label="No. HP" :disabled="!isNew" variant="outlined"
                  density="compact" placeholder="Ketik No. HP atau klik ikon cari" hide-details class="mb-2"
                  @keydown.f1.prevent="isHelpModalVisible = true" append-inner-icon="mdi-magnify"
                  @click:append-inner="isHelpModalVisible = true"></v-text-field>

                <v-text-field v-model="editedItem.nama" label="Nama" variant="outlined" density="compact"
                  hide-details class="mb-2"></v-text-field>

                <v-textarea v-model="editedItem.alamat" label="Alamat" variant="outlined" density="compact" rows="2"
                  hide-details class="mb-2"></v-textarea>
              </v-col>
              <v-col cols="12" sm="6">
                <v-select v-model="editedItem.gender" :items="genderItems" label="Gender" variant="outlined"
                  density="compact" hide-details class="mb-2"></v-select>
              </v-col>
              <v-col cols="12" sm="6">
                <v-select v-model="editedItem.usia" :items="ageItems" label="Rentang Usia" variant="outlined"
                  density="compact" hide-details class="mb-2"></v-select>
              </v-col>
              <v-col cols="12">
                <v-select v-model="editedItem.referensi" :items="refItems" label="Referensi" variant="outlined"
                  density="compact" hide-details class="mb-2"></v-select>
              </v-col>
            </v-row>
          </v-container>
        </v-card-text>

        <v-card-actions class="dialog-footer">
          <v-spacer></v-spacer>
          <v-btn size="small" variant="text" color="grey" @click="dialog = false">Batal</v-btn>
          <v-btn size="small" color="primary" @click="saveMember" variant="flat">Simpan</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <MemberSearchModal v-if="isHelpModalVisible" @close="isHelpModalVisible = false"
      @member-selected="handleMemberSelected" />

    <v-dialog v-model="dialogDelete" max-width="500px">
      <v-card class="dialog-card">
        <v-card-title class="dialog-header">Konfirmasi Hapus</v-card-title>
        <v-card-text class="pa-4 pt-6 text-body-1">
            Apakah Anda yakin ingin menghapus member <strong>{{ itemToDelete?.nama }}</strong>?
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

/* Menghapus hint dari HP agar tidak memakan ruang */
.dialog-card :deep(.v-text-field .v-messages) {
  display: none;
}

.dialog-card :deep(.v-text-field .v-input__details) {
  min-height: 0;
  padding: 0;
}
</style>
