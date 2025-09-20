<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import api from '@/services/api';
import PageLayout from '@/components/PageLayout.vue';
import UserSearchModal from '@/components/UserSearchModal.vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import axios, { AxiosError } from "axios";

const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '1';

// --- Interfaces ---
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
interface MenuResponse {
    men_id: string;
    men_nama: string;
    men_keterangan: string;
}
interface ErrorResponse {
    message: string;
}

// --- State ---
const isNewUser = ref(true);
const kode = ref('');
const nama = ref('');
const password = ref('');
const cabang = ref('');
const permissions = ref<Permission[]>([]);
const branches = ref<Branch[]>([]);
const checkAll = ref(false);
const isLoading = ref(false);
const isHelpModalVisible = ref(false);
const hasViewPermission = computed(() => authStore.can(MENU_ID, 'view'));

// --- Methods ---
const fetchInitialMenus = async () => {
    try {
        const response = await api.get<MenuResponse[]>("/users/menus");
        permissions.value = response.data.map((menu): Permission => ({
            id: menu.men_id,
            nama: menu.men_nama,
            keterangan: menu.men_keterangan,
            view: false,
            insert: false,
            edit: false,
            delete: false,
        }));
    } catch {
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
    } catch (error: unknown) {
        const err = error as AxiosError<ErrorResponse>;
        if (err.response && err.response.status === 404) {
            isNewUser.value = true;
            nama.value = "";
            await fetchInitialMenus();
            toast.info(`Kode user ${kode.value} tidak ditemukan. Silakan isi data baru.`);
        } else {
            toast.error(err.response?.data?.message || "Terjadi kesalahan saat mencari data user.");
        }
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

    const requiredPermission = isNewUser.value ? 'insert' : 'edit';
    if (!authStore.can(MENU_ID, requiredPermission)) {
        toast.error(`Anda tidak memiliki izin untuk ${requiredPermission} data user.`);
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
    } catch (error: unknown) {
        if (axios.isAxiosError<ErrorResponse>(error)) {
            toast.error(error.response?.data?.message || "Gagal menyimpan data.");
        } else {
            toast.error("Gagal menyimpan data (unknown error).");
            console.error(error);
        }
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
const openHelpModal = () => { isHelpModalVisible.value = true; };

onMounted(() => {
    if (hasViewPermission.value) {
        fetchBranches();
        fetchInitialMenus();
    } else {
        toast.error("Anda tidak memiliki izin untuk melihat halaman ini.");
    }
});
</script>

<template>
    <PageLayout title="Master User" icon="mdi-account-group" desktop-mode :loading="isLoading">
        <template #header-actions>
            <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" @click="resetForm">Baru</v-btn>
            <v-btn v-if="authStore.can(MENU_ID, 'insert') || authStore.can(MENU_ID, 'edit')" size="small"
                color="primary" @click="saveUser" :loading="isLoading">Simpan</v-btn>
        </template>

        <div v-if="!hasViewPermission" class="state-container">
            <v-icon size="64" class="mb-4">mdi-lock-outline</v-icon>
            <h3 class="text-h6">Akses Ditolak</h3>
        </div>

        <div v-else class="user-form-container">
            <!-- Form Section -->
            <div class="desktop-form-section">
                <v-row dense>
                    <v-col cols="12" sm="6" md="3">
                        <v-text-field v-model="kode" label="Kode" placeholder="Ketik atau F1..." variant="outlined"
                            density="compact" hide-details @keydown.enter.prevent="handleKodeSearch"
                            @blur="handleKodeSearch" @keydown.f1.prevent="openHelpModal">
                            <template #append-inner><v-icon size="small" @click="openHelpModal"
                                    icon="mdi-magnify"></v-icon></template>
                        </v-text-field>
                    </v-col>
                    <v-col cols="12" sm="6" md="3">
                        <v-text-field v-model="nama" label="Nama" variant="outlined" density="compact"
                            hide-details></v-text-field>
                    </v-col>
                    <v-col cols="12" sm="6" md="3">
                        <v-text-field v-model="password" label="Password" type="password"
                            :placeholder="isNewUser ? 'Wajib diisi' : 'Isi untuk ganti'" variant="outlined"
                            density="compact" hide-details></v-text-field>
                    </v-col>
                    <v-col cols="12" sm="6" md="3">
                        <v-select v-model="cabang" :items="branches" item-title="gdg_kode" item-value="gdg_kode"
                            label="Cabang" variant="outlined" density="compact" hide-details></v-select>
                    </v-col>
                </v-row>
            </div>

            <!-- Permissions Section -->
            <div class="desktop-form-section flex-grow-1 d-flex flex-column">
                <div class="d-flex justify-space-between align-center mb-2">
                    <h3 class="section-title">Hak Akses Menu</h3>
                    <v-checkbox v-model="checkAll" label="Cek Semua" @update:model-value="toggleCheckAll" hide-details
                        density="compact" color="primary"></v-checkbox>
                </div>
                <v-data-table :items="permissions" :headers="[
                    { title: 'Id', key: 'id', sortable: false, width: '60px' },
                    { title: 'Nama Menu', key: 'nama', sortable: false },
                    { title: 'View', key: 'view', sortable: false, align: 'center', width: '70px' },
                    { title: 'Insert', key: 'insert', sortable: false, align: 'center', width: '70px' },
                    { title: 'Update', key: 'edit', sortable: false, align: 'center', width: '70px' },
                    { title: 'Delete', key: 'delete', sortable: false, align: 'center', width: '70px' }
                ]" :loading="isLoading && permissions.length === 0" density="compact" class="desktop-table flex-grow-1"
                    fixed-header height="100%" :items-per-page="-1">
                    <template v-slot:[`item.view`]="{ item }">
                        <div class="d-flex justify-center"><v-checkbox-btn v-model="item.view" hide-details
                                density="compact" color="primary"></v-checkbox-btn></div>
                    </template>
                    <template v-slot:[`item.insert`]="{ item }">
                        <div class="d-flex justify-center"><v-checkbox-btn v-model="item.insert" hide-details
                                density="compact" color="success"></v-checkbox-btn></div>
                    </template>
                    <template v-slot:[`item.edit`]="{ item }">
                        <div class="d-flex justify-center"><v-checkbox-btn v-model="item.edit" hide-details
                                density="compact" color="warning"></v-checkbox-btn></div>
                    </template>
                    <template v-slot:[`item.delete`]="{ item }">
                        <div class="d-flex justify-center"><v-checkbox-btn v-model="item.delete" hide-details
                                density="compact" color="error"></v-checkbox-btn></div>
                    </template>
                </v-data-table>
            </div>
        </div>

        <template #footer>
            <div class="d-flex justify-space-between align-center w-100">
                <v-chip size="small" :color="isNewUser ? 'success' : 'primary'" variant="flat">
                    <v-icon start size="x-small">{{ isNewUser ? 'mdi-plus' : 'mdi-pencil' }}</v-icon>
                    {{ isNewUser ? 'Mode Tambah Baru' : 'Mode Edit' }}
                </v-chip>
                <span v-if="!isNewUser" class="text-caption">Current User: {{ kode }}</span>
            </div>
        </template>

        <UserSearchModal v-if="isHelpModalVisible" fetch-url="/users" @close="isHelpModalVisible = false"
            @user-selected="handleUserSelected" />
    </PageLayout>
</template>
