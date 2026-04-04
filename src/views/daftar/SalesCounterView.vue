<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import UserSearchModal from "@/components/lookup/UserSearchModal.vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import type { AxiosError } from "axios";

const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "10";

interface SalesCounter {
  kode: string;
  nama: string;
  alamat: string;
  hp: string;
  ktp: string;
  status: "AKTIF" | "PASIF";
}

// --- State ---
const salesCounters = ref<SalesCounter[]>([]);
const search = ref("");
const isLoading = ref(true);
const selected = ref<SalesCounter[]>([]);
const dialog = ref(false);
const isNew = ref(true);
const editedItem = ref<Partial<SalesCounter>>({});
const isHelpModalVisible = ref(false);
const dialogDelete = ref(false);
const itemToDelete = ref<SalesCounter | null>(null);

const hasViewPermission = computed(() => authStore.can(MENU_ID, "view"));

const headers = [
  { title: "Kode", key: "kode", width: "120px" },
  { title: "Nama", key: "nama" },
  { title: "Alamat", key: "alamat" },
  { title: "No. HP", key: "hp", width: "150px" },
  { title: "No. KTP", key: "ktp", width: "180px" },
  { title: "Status", key: "status", align: "center", width: "100px" },
  { title: "Actions", key: "actions", sortable: false, align: "center", width: "80px" },
] as const;

// --- Computed ---
const canEdit = computed(() => selected.value.length === 1);
const canDelete = computed(() => selected.value.length === 1);
const dialogTitle = computed(() => (isNew.value ? "Sales Counter Baru" : "Ubah Sales Counter"));
const availableUsersUrl = computed(() => {
  return `/users/available-for-sc?cabang=${authStore.user?.cabang || ""}`;
});

// --- Helper ---
const getErrorMessage = (err: unknown, fallback: string) => {
  const error = err as AxiosError<{ message?: string }>;
  return error.response?.data?.message || error.message || fallback;
};

// --- Methods ---
const fetchSalesCounters = async () => {
  isLoading.value = true;
  selected.value = [];
  try {
    const response = await api.get("/sales-counters");
    salesCounters.value = response.data;
  } catch (err) {
    toast.error(getErrorMessage(err, "Gagal memuat data sales counter."));
  } finally {
    isLoading.value = false;
  }
};

const openNewDialog = () => {
  isNew.value = true;
  editedItem.value = { status: "AKTIF" };
  dialog.value = true;
};

const openEditDialog = (item: SalesCounter) => {
  isNew.value = false;
  editedItem.value = { ...item };
  dialog.value = true;
};

const handleUserSelected = (user: { kode: string; nama: string }) => {
  isHelpModalVisible.value = false;
  editedItem.value.kode = user.kode;
  editedItem.value.nama = user.nama;
};

const handleEditFromHeader = () => {
  if (canEdit.value) {
    openEditDialog(selected.value[0]);
  }
};

const saveSalesCounter = async () => {
  try {
    const payload = { ...editedItem.value, isNew: isNew.value, user: authStore.user };
    await api.post("/sales-counters/save", payload);
    toast.success("Data sales counter berhasil disimpan.");
    fetchSalesCounters();
    dialog.value = false;
  } catch (err) {
    toast.error(getErrorMessage(err, "Gagal menyimpan data sales counter."));
  }
};

const deleteSalesCounter = async (item: SalesCounter) => {
  try {
    await api.delete(`/sales-counters/${item.kode}`);
    toast.success("Data sales counter berhasil dihapus.");
    fetchSalesCounters();
  } catch (err) {
    toast.error(getErrorMessage(err, "Gagal menghapus data."));
  }
};

const handleDeleteFromHeader = () => {
  if (canDelete.value) {
    confirmDelete(selected.value[0]);
  }
};

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

onMounted(() => {
  if (hasViewPermission.value) {
    fetchSalesCounters();
  } else {
    isLoading.value = false;
    toast.error("Anda tidak memiliki izin untuk mengakses halaman ini.");
  }
});
</script>

<template>
  <PageLayout title="Master Sales Counter" desktop-mode icon="mdi-account-tie">
    <template #header-actions>
      <v-btn
        v-if="authStore.can(MENU_ID, 'insert')"
        size="small"
        color="primary"
        @click="openNewDialog"
        prepend-icon="mdi-plus"
        >Baru</v-btn
      >
      <v-btn
        v-if="authStore.can(MENU_ID, 'edit')"
        size="small"
        :disabled="!canEdit"
        @click="handleEditFromHeader"
        prepend-icon="mdi-pencil"
        >Ubah</v-btn
      >
      <v-btn
        v-if="authStore.can(MENU_ID, 'delete')"
        size="small"
        :disabled="!canDelete"
        @click="handleDeleteFromHeader"
        prepend-icon="mdi-delete"
        color="error"
        >Hapus</v-btn
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
          label="Cari Sales Counter..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          hide-details
          single-line
        ></v-text-field>
        <v-spacer></v-spacer>
        <v-btn @click="fetchSalesCounters" icon="mdi-refresh" variant="text" size="small"></v-btn>
      </div>

      <AppDataTable
        v-model="selected"
        :headers="headers"
        :items="salesCounters"
        :search="search"
        :loading="isLoading"
        item-value="kode"
        density="compact"
        class="desktop-table header-browse-blue"
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
                  v-model="editedItem.kode"
                  label="Kode"
                  :disabled="!isNew"
                  variant="outlined"
                  density="compact"
                  placeholder="Pilih user atau F1"
                  @keydown.f1.prevent="isHelpModalVisible = true"
                  append-inner-icon="mdi-magnify"
                  @click:append-inner="isHelpModalVisible = true"
                ></v-text-field>

                <v-text-field
                  v-model="editedItem.nama"
                  label="Nama"
                  variant="outlined"
                  :disabled="!isNew"
                  density="compact"
                ></v-text-field>

                <v-textarea
                  v-model="editedItem.alamat"
                  label="Alamat"
                  variant="outlined"
                  density="compact"
                  rows="2"
                ></v-textarea>

                <v-text-field
                  v-model="editedItem.hp"
                  label="No. HP"
                  variant="outlined"
                  density="compact"
                ></v-text-field>

                <v-text-field
                  v-model="editedItem.ktp"
                  label="No. KTP"
                  variant="outlined"
                  density="compact"
                ></v-text-field>

                <v-radio-group
                  v-model="editedItem.status"
                  inline
                  label="Status"
                  density="compact"
                  hide-details
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
          <v-btn size="small" color="primary" @click="saveSalesCounter" variant="elevated"
            >Simpan</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>

    <UserSearchModal
      v-if="isHelpModalVisible"
      :fetch-url="availableUsersUrl"
      @close="isHelpModalVisible = false"
      @user-selected="handleUserSelected"
    />

    <v-dialog v-model="dialogDelete" max-width="500px">
      <v-card class="dialog-card">
        <v-card-title class="dialog-header">Konfirmasi Hapus</v-card-title>
        <v-card-text class="pa-4 pt-6 text-body-1">
          Apakah Anda yakin ingin menghapus <strong>{{ itemToDelete?.nama }}</strong
          >?
        </v-card-text>
        <v-card-actions class="dialog-footer">
          <v-spacer></v-spacer>
          <v-btn variant="text" color="grey" @click="dialogDelete = false">Batal</v-btn>
          <v-btn color="error" variant="elevated" @click="deleteConfirmed">Hapus</v-btn>
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

/* Fix Input Text Color in Dark Mode */
.dialog-card :deep(.v-field__input),
.dialog-card :deep(.v-label) {
  color: rgb(var(--v-theme-on-surface));
}

/* Fix Input Background */
.dialog-card :deep(.v-field) {
  background-color: rgb(var(--v-theme-surface));
  border-color: rgba(var(--v-border-color), var(--v-border-opacity));
}

.dialog-card :deep(.v-text-field),
.dialog-card :deep(.v-select),
.dialog-card :deep(.v-textarea) {
  margin-bottom: 12px;
}

.dialog-card :deep(.v-input__details) {
  display: none;
}
</style>
