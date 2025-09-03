<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import UserSearchModal from '@/components/UserSearchModal.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';

const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '1';

interface Permission {
    id: string;
    nama: string;
    keterangan: string;
    view: boolean;
    insert: boolean;
    edit: boolean;
    delete: boolean;
}
interface Branch {
    gdg_kode: string;
}

// --- State Utama Form ---
const isNewUser = ref(true);
const kode = ref('');
const nama = ref('');
const password = ref('');
const cabang = ref('');
const permissions = ref<Permission[]>([]);
const branches = ref<Branch[]>([]);
const checkAll = ref(false);

// --- State UI & Notifikasi ---
const isLoading = ref(false);
const isHelpModalVisible = ref(false);

const fetchInitialMenus = async () => {
    try {
        const response = await api.get(`/users/menus`);
        permissions.value = response.data.map((menu: any) => ({
            id: menu.men_id,
            nama: menu.men_nama,
            keterangan: menu.men_keterangan,
            view: false,
            insert: false,
            edit: false,
            delete: false,
        }));
    } catch (error) {
        console.error("Gagal mengambil daftar menu:", error);
        toast.error("Gagal memuat daftar menu.");
    }
};

const fetchBranches = async () => {
    try {
        const response = await api.get(`/users/branches`);
        branches.value = response.data;
        if (branches.value.length > 0 && !cabang.value) {
            cabang.value = branches.value[0].gdg_kode;
        }
    } catch (error) {
        console.error("Gagal mengambil data cabang:", error);
    }
};

const handleKodeSearch = async () => {
    if (!kode.value || !cabang.value) return;

    isLoading.value = true;
    try {
        const response = await api.get(`/users/${kode.value}/${cabang.value}`);
        const data = response.data;
        isNewUser.value = false;
        nama.value = data.user.user_nama;
        permissions.value = data.permissions;
        password.value = '';
        toast.info(`Mode Edit: Menampilkan data untuk user ${kode.value}.`);
    } catch (error: any) {
        if (error.response && error.response.status === 404) {
            isNewUser.value = true;
            nama.value = '';
            await fetchInitialMenus();
            toast.info(`Kode user ${kode.value} tidak ditemukan. Silakan isi data baru.`);
        } else {
            console.error("Error saat mencari user:", error);
            toast.error("Terjadi kesalahan saat mencari data user.");
        }
    } finally {
        isLoading.value = false;
    }
};

const saveUser = async () => {
    if (!kode.value || !nama.value || !cabang.value) {
        toast.error('Kode, Nama, dan Cabang tidak boleh kosong.');
        return;
    }
    if (isNewUser.value && !password.value) {
        toast.error('Password wajib diisi untuk user baru.');
        return;
    }

    isLoading.value = true;
    try {
        const payload = {
            kode: kode.value,
            nama: nama.value,
            password: password.value,
            cabang: cabang.value,
            permissions: permissions.value,
            isNewUser: isNewUser.value,
        };
        const response = await api.post(`/users/save`, payload);
        toast.success(response.data.message);
        resetForm();
    } catch (error: any) {
        toast.error(error.response?.data?.message || 'Gagal menyimpan data.');
    } finally {
        isLoading.value = false;
    }
};

const resetForm = () => {
    isNewUser.value = true;
    kode.value = '';
    nama.value = '';
    password.value = '';
    checkAll.value = false;
    fetchInitialMenus();
};

const toggleCheckAll = () => {
    permissions.value.forEach(p => {
        p.view = checkAll.value;
        p.insert = checkAll.value;
        p.edit = checkAll.value;
        p.delete = checkAll.value;
    });
};

const handleUserSelected = (user: { kode: string, cabang: string }) => {
    kode.value = user.kode;
    cabang.value = user.cabang;
    isHelpModalVisible.value = false;
    handleKodeSearch();
};

const openHelpModal = () => {
    isHelpModalVisible.value = true;
};

onMounted(() => {
    if (!authStore.can(MENU_ID, 'view')) {
      toast.error("Anda tidak memiliki izin untuk melihat halaman ini.");
      // Redirect atau tampilkan pesan error
    } else {
      fetchBranches();
      fetchInitialMenus();
    }
});
</script>

<template>
    <PageLayout 
        title="Master User" 
        icon="mdi-account-group"
        :desktop-mode="true"
        :loading="isLoading"
    >
        <template #header-actions>
            <v-btn v-if="authStore.can(MENU_ID, 'insert')" @click="resetForm" color="grey-darken-1" variant="outlined" size="small">
                <v-icon start>mdi-plus</v-icon>
                Baru
            </v-btn>
            <v-btn v-if="authStore.can(MENU_ID, 'insert') || authStore.can(MENU_ID, 'edit')" @click="saveUser" :loading="isLoading" color="primary" variant="elevated" size="small">
                <v-icon start>mdi-content-save</v-icon>
                Simpan
            </v-btn>
        </template>

        <!-- Form Section -->
        <v-card variant="outlined" class="mb-3" elevation="0">
            <v-card-title class="text-subtitle-1 py-2 bg-grey-lighten-4">
                <v-icon start size="small">mdi-account-edit</v-icon>
                Data User
            </v-card-title>
            <v-card-text class="pa-4">
                <v-row dense>
                    <!-- Kode Field -->
                    <v-col cols="12" sm="6" md="3">
                        <v-text-field
                            v-model="kode"
                            label="Kode"
                            :disabled="!isNewUser"
                            placeholder="Ketik kode atau tekan F1..."
                            variant="outlined"
                            density="compact"
                            hide-details
                            @keydown.enter.prevent="handleKodeSearch"
                            @blur="handleKodeSearch"
                            @keydown.f1.prevent="openHelpModal"
                        >
                            <template #append-inner>
                                <v-btn 
                                    icon="mdi-help-circle" 
                                    size="x-small" 
                                    variant="text"
                                    @click="openHelpModal"
                                    title="Cari User (F1)"
                                ></v-btn>
                            </template>
                        </v-text-field>
                    </v-col>

                    <!-- Nama Field -->
                    <v-col cols="12" sm="6" md="3">
                        <v-text-field
                            v-model="nama"
                            label="Nama"
                            variant="outlined"
                            density="compact"
                            hide-details
                        ></v-text-field>
                    </v-col>

                    <!-- Password Field -->
                    <v-col cols="12" sm="6" md="3">
                        <v-text-field
                            v-model="password"
                            label="Password"
                            type="password"
                            :placeholder="isNewUser ? 'Wajib diisi' : 'Isi untuk ganti password'"
                            variant="outlined"
                            density="compact"
                            hide-details
                        ></v-text-field>
                    </v-col>

                    <!-- Cabang Field -->
                    <v-col cols="12" sm="6" md="3">
                        <v-select
                            v-model="cabang"
                            :items="branches"
                            item-title="gdg_kode"
                            item-value="gdg_kode"
                            label="Cabang"
                            variant="outlined"
                            density="compact"
                            hide-details
                            :disabled="!isNewUser"
                        ></v-select>
                    </v-col>
                </v-row>
            </v-card-text>
        </v-card>

        <!-- Permissions Section -->
        <v-card variant="outlined" elevation="0" class="flex-grow-1 d-flex flex-column">
            <v-card-title class="text-subtitle-1 py-2 bg-grey-lighten-4 d-flex justify-space-between align-center">
                <div>
                    <v-icon start size="small">mdi-shield-account</v-icon>
                    Hak Akses Menu
                </div>
                <v-checkbox
                    v-model="checkAll"
                    label="Cek Semua"
                    @update:model-value="toggleCheckAll"
                    hide-details
                    density="compact"
                    color="primary"
                ></v-checkbox>
            </v-card-title>

            <v-card-text class="pa-0 flex-grow-1 d-flex flex-column">
                <v-data-table
                    :items="permissions"
                    :headers="[
                        { title: 'Id', key: 'id', sortable: false, width: '60px' },
                        { title: 'Nama Menu', key: 'nama', sortable: false },
                        { title: 'Keterangan', key: 'keterangan', sortable: false },
                        { title: 'View', key: 'view', sortable: false, align: 'center', width: '70px' },
                        { title: 'Insert', key: 'insert', sortable: false, align: 'center', width: '70px' },
                        { title: 'Update', key: 'edit', sortable: false, align: 'center', width: '70px' },
                        { title: 'Delete', key: 'delete', sortable: false, align: 'center', width: '70px' }
                    ]"
                    :loading="isLoading && permissions.length === 0"
                    loading-text="Memuat data..."
                    :items-per-page="-1"
                    hide-default-footer
                    density="compact"
                    height="400"
                    fixed-header
                    class="permissions-table"
                >
                    <!-- Custom cells for checkboxes -->
                    <template #item.view="{ item }">
                        <div class="d-flex justify-center">
                            <v-checkbox-btn 
                                v-model="item.view" 
                                hide-details 
                                density="compact"
                                color="primary"
                            ></v-checkbox-btn>
                        </div>
                    </template>
                    <template #item.insert="{ item }">
                        <div class="d-flex justify-center">
                            <v-checkbox-btn 
                                v-model="item.insert" 
                                hide-details 
                                density="compact"
                                color="success"
                            ></v-checkbox-btn>
                        </div>
                    </template>
                    <template #item.edit="{ item }">
                        <div class="d-flex justify-center">
                            <v-checkbox-btn 
                                v-model="item.edit" 
                                hide-details 
                                density="compact"
                                color="warning"
                            ></v-checkbox-btn>
                        </div>
                    </template>
                    <template #item.delete="{ item }">
                        <div class="d-flex justify-center">
                            <v-checkbox-btn 
                                v-model="item.delete" 
                                hide-details 
                                density="compact"
                                color="error"
                            ></v-checkbox-btn>
                        </div>
                    </template>
                </v-data-table>
            </v-card-text>
        </v-card>

        <!-- Status Bar -->
        <template #footer>
            <div class="d-flex justify-space-between align-center">
                <div class="d-flex ga-4">
                    <v-chip size="small" :color="isNewUser ? 'success' : 'primary'" variant="flat">
                        <v-icon start size="x-small">{{ isNewUser ? 'mdi-plus' : 'mdi-pencil' }}</v-icon>
                        {{ isNewUser ? 'Tambah Baru' : 'Edit Mode' }}
                    </v-chip>
                    <span class="text-caption">Total Menu: {{ permissions.length }}</span>
                </div>
                <span class="text-caption" v-if="!isNewUser">Current User: {{ kode }}</span>
            </div>
        </template>
    </PageLayout>

    <!-- Search Modal tetap menggunakan Vuetify -->
    <UserSearchModal 
        v-if="isHelpModalVisible"
        fetch-url="http://192.168.1.73:8000/api/users"
        @close="isHelpModalVisible = false"
        @user-selected="handleUserSelected"
    />
</template>

<style scoped>
/* Modern Desktop Styling - balanced between classic and contemporary */
.permissions-table {
  font-size: 0.875rem;
}

.permissions-table :deep(.v-data-table__wrapper) {
  border-radius: 4px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.permissions-table :deep(.v-data-table-header) {
  background: rgba(var(--v-theme-surface-variant), 0.4);
}

.permissions-table :deep(.v-data-table-header th) {
  font-weight: 600;
  font-size: 0.75rem;
  border-bottom: 2px solid rgba(var(--v-theme-on-surface), 0.12);
}

.permissions-table :deep(.v-data-table__tbody tr:nth-child(odd)) {
  background: rgba(var(--v-theme-surface-variant), 0.02);
}

.permissions-table :deep(.v-data-table__tbody tr:hover) {
  background: rgba(var(--v-theme-primary), 0.04);
}

.permissions-table :deep(.v-data-table__tbody td) {
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.05);
  font-size: 0.8125rem;
  padding: 4px 8px;
}

/* Compact form styling */
:deep(.v-field--variant-outlined .v-field__outline) {
  --v-field-border-opacity: 0.25;
}

:deep(.v-field--focused .v-field__outline) {
  --v-field-border-opacity: 1;
}

/* Card titles styling */
:deep(.v-card-title) {
  font-size: 0.9375rem !important;
  font-weight: 600;
  letter-spacing: 0.025em;
}

/* Status chips */
:deep(.v-chip) {
  font-size: 0.75rem;
}

/* Responsive improvements */
@media (max-width: 768px) {
  .permissions-table :deep(.v-data-table__tbody td) {
    padding: 2px 4px;
    font-size: 0.75rem;
  }
  
  .permissions-table :deep(.v-data-table-header th) {
    padding: 4px 6px;
    font-size: 0.6875rem;
  }
}
</style>