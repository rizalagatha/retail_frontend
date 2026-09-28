<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import MemberSearchModal from "@/components/lookup/MemberSearchModal.vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import axios from "axios";

const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "7";

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
const search = ref("");
const isLoading = ref(true);
const selected = ref<Member[]>([]);

const dialog = ref(false);
const isNew = ref(true);
const editedItem = ref<Partial<Member>>({});
const isHelpModalVisible = ref(false);

const dialogDelete = ref(false);
const itemToDelete = ref<Member | null>(null);

const hasViewPermission = computed(() => authStore.can(MENU_ID, "view"));

const headers = [
  { title: "No. HP", key: "hp" },
  { title: "Nama", key: "nama" },
  { title: "Alamat", key: "alamat" },
  { title: "Gender", key: "gender" },
  { title: "Usia", key: "usia" },
  { title: "Referensi", key: "referensi" },
  { title: "Actions", key: "actions", sortable: false, align: "center" },
] as const;

const genderItems = ["Pria", "Wanita"];
const ageItems = ["< 17", "18-24", "25-34", "35-44", "45+"];
const refItems = ["Teman", "Facebook", "Instagram", "Whatsapp", "Website", "Lain-lain"];

// --- Computed ---
const canEdit = computed(() => selected.value.length === 1);
const canDelete = computed(() => selected.value.length === 1);
const dialogTitle = computed(() => (isNew.value ? "Member Baru" : "Ubah Member"));

// --- Methods ---
const fetchMembers = async () => {
  isLoading.value = true;
  selected.value = [];
  try {
    const response = await api.get("/members");
    members.value = response.data;
  } catch (error: unknown) {
    // [PERBAIKAN]
    let msg = "Gagal memuat data member.";
    if (axios.isAxiosError(error)) msg = error.response?.data?.message || msg;
    toast.error(msg);
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
  // [ANTI-CRASH] Cek user store agar tidak null
  if (!authStore.user) {
    toast.error("Sesi berakhir. Silakan login kembali.");
    return;
  }

  try {
    const payload = {
      ...editedItem.value,
      isNew: isNew.value,
      user: authStore.user,
    };
    await api.post("/members/save", payload);
    toast.success("Data member berhasil disimpan.");
    fetchMembers();
    dialog.value = false;
  } catch (error: unknown) {
    // [PERBAIKAN]
    let msg = "Gagal menyimpan data member.";
    if (axios.isAxiosError(error)) msg = error.response?.data?.message || msg;
    toast.error(msg);
  }
};

const deleteMember = async (item: Member) => {
  try {
    await api.delete(`/members/${item.hp}`);
    toast.success("Data member berhasil dihapus.");
    fetchMembers();
  } catch (error: unknown) {
    // [PERBAIKAN]
    let msg = "Gagal menghapus data member.";
    if (axios.isAxiosError(error)) msg = error.response?.data?.message || msg;
    toast.error(msg);
  }
};

const handleRowClick = (_event: Event, { item }: { item: Member }) => {
  selected.value = [item];
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
    head: [["No. HP", "Nama", "Alamat", "Gender", "Usia"]],
    body: members.value.map((m) => [m.hp, m.nama, m.alamat, m.gender, m.usia]),
    startY: 20,
  });
  doc.autoPrint();
  window.open(doc.output("bloburl"), "_blank");
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
          label="Cari Member..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          hide-details
          single-line
          class="search-grow member-search-field"
        ></v-text-field>
        <v-spacer></v-spacer>
        <v-btn @click="fetchMembers" icon="mdi-refresh" variant="text" size="small"></v-btn>
      </div>

      <div class="table-container">
        <AppDataTable
          v-model:selected="selected"
          :headers="headers"
          :items="members"
          :search="search"
          :loading="isLoading"
          item-value="hp"
          density="compact"
          class="desktop-table"
          fixed-header
          show-select
          return-object
          hover
          select-strategy="single"
          :row-props="(data: any) => {
        const item = data.item?.raw ?? data.item
        const isSelected = selected.some((s: any) => s.hp === item.hp)
        return { class: isSelected ? 'row-is-selected' : '' }
      }"
          @click:row="handleRowClick"
        >
          <template #[`item.actions`]="{ item }">
            <v-icon
              v-if="authStore.can(MENU_ID, 'edit')"
              size="small"
              class="me-2"
              @click.stop="openEditDialog(item)"
              >mdi-pencil</v-icon
            >
            <v-icon
              v-if="authStore.can(MENU_ID, 'delete')"
              size="small"
              @click.stop="confirmDelete(item)"
              >mdi-delete</v-icon
            >
          </template>
        </AppDataTable>
      </div>
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
                <v-text-field
                  v-model="editedItem.hp"
                  label="No. HP"
                  :disabled="!isNew"
                  variant="outlined"
                  density="compact"
                  placeholder="Ketik No. HP atau klik ikon cari"
                  hide-details
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
              </v-col>
              <v-col cols="12" sm="6">
                <v-select
                  v-model="editedItem.gender"
                  :items="genderItems"
                  label="Gender"
                  variant="outlined"
                  density="compact"
                  hide-details
                  class="mb-2"
                ></v-select>
              </v-col>
              <v-col cols="12" sm="6">
                <v-select
                  v-model="editedItem.usia"
                  :items="ageItems"
                  label="Rentang Usia"
                  variant="outlined"
                  density="compact"
                  hide-details
                  class="mb-2"
                ></v-select>
              </v-col>
              <v-col cols="12">
                <v-select
                  v-model="editedItem.referensi"
                  :items="refItems"
                  label="Referensi"
                  variant="outlined"
                  density="compact"
                  hide-details
                  class="mb-2"
                ></v-select>
              </v-col>
            </v-row>
          </v-container>
        </v-card-text>

        <v-card-actions class="dialog-footer">
          <v-spacer></v-spacer>
          <v-btn size="small" variant="text" color="grey" @click="dialog = false">Batal</v-btn>
          <v-btn size="small" class="btn-primary-red" @click="saveMember" variant="flat"
            >Simpan</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>

    <MemberSearchModal
      v-if="isHelpModalVisible"
      @close="isHelpModalVisible = false"
      @member-selected="handleMemberSelected"
    />

    <v-dialog v-model="dialogDelete" max-width="500px">
      <v-card class="dialog-card">
        <v-card-title class="dialog-header">Konfirmasi Hapus</v-card-title>
        <v-card-text class="pa-4 pt-6 text-body-1">
          Apakah Anda yakin ingin menghapus member <strong>{{ itemToDelete?.nama }}</strong
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

/* ── Layout ───────────────────────────────────────────────────────────── */
.browse-content {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 64px - 32px);
  overflow: hidden;
}

.filter-section {
  flex-shrink: 0;
  padding: 6px 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  background-color: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.search-grow {
  flex: 1 1 0;
}
.search-grow :deep(.v-field) {
  font-size: 11px !important;
  height: 28px !important;
}
.search-grow :deep(.v-field__input) {
  font-size: 11px !important;
  min-height: 28px !important;
  padding: 0 4px !important;
}

.table-container {
  flex-grow: 1;
  height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.desktop-table {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.desktop-table :deep(.v-table__wrapper) {
  flex-grow: 1;
  height: 100% !important;
  overflow-y: auto !important;
}
.desktop-table :deep(table) {
  width: max-content;
  min-width: 100%;
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

/* --- Search bar: menang melawan .filter-section .v-input { flex: 0 0 auto } global --- */
.filter-section .search-grow.member-search-field {
  flex: 0 0 420px !important;
  width: 420px !important;
  min-width: 420px !important;
  max-width: 420px !important;
  flex-shrink: 0 !important;
  flex-grow: 0 !important;
}

.filter-section .search-grow.member-search-field :deep(.v-input__control) {
  width: 100% !important;
}

.filter-section .search-grow.member-search-field :deep(.v-field) {
  width: 100% !important;
  border-radius: 8px !important;
  background-color: rgba(183, 28, 28, 0.03) !important;
  border: 1px solid rgba(183, 28, 28, 0.25) !important;
  box-shadow: none !important;
}

.filter-section .search-grow.member-search-field :deep(.v-field__outline) {
  display: none !important;
}

.filter-section .search-grow.member-search-field :deep(.v-field--focused) {
  border-color: #b71c1c !important;
  background-color: rgba(183, 28, 28, 0.06) !important;
}

.filter-section .search-grow.member-search-field :deep(.v-field__prepend-inner .v-icon) {
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

/* ══════════════ ROW SELECTED / HOVER MERAH ══════════════ */
.desktop-table :deep(tbody tr:nth-child(even)) {
  background-color: rgba(183, 28, 28, 0.02);
}

.desktop-table :deep(tbody tr:hover td) {
  background-color: rgba(183, 28, 28, 0.05) !important;
  cursor: pointer;
}
.desktop-table :deep(tbody tr.row-is-selected td) {
  background-color: rgba(183, 28, 28, 0.1) !important;
}
.desktop-table :deep(tbody tr.row-is-selected td:first-child) {
  border-left: 3px solid #b71c1c !important;
}
.desktop-table :deep(tbody tr.row-is-selected:hover td) {
  background-color: rgba(183, 28, 28, 0.16) !important;
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

.dialog-card :deep(.v-list-item--active) {
  background-color: rgba(183, 28, 28, 0.1) !important;
  color: #b71c1c !important;
}
</style>
