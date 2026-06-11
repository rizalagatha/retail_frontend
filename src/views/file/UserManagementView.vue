<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import api from "@/services/api";
import PageLayout from "@/components/PageLayout.vue";
import UserSearchModal from "@/components/lookup/UserSearchModal.vue";
import { useToast } from "vue-toastification";
import { useAuthStore } from "@/stores/authStore";
import axios, { AxiosError } from "axios";

const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = "1";

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
interface UserForCopy {
  kode: string;
  nama: string;
  cabang: string; // tambah ini
  uid: string;
}

// --- State ---
const isNewUser = ref(true);
const kode = ref("");
const nama = ref("");
const password = ref("");
const cabang = ref("");
const permissions = ref<Permission[]>([]);
const branches = ref<Branch[]>([]);
const checkAll = ref(false);
const isLoading = ref(false);
const isHelpModalVisible = ref(false);
const hasViewPermission = computed(() => authStore.can(MENU_ID, "view"));
const newMenuIds = ref<string[]>([]); // menu yang belum pernah dikonfigurasi
const userListForCopy = ref<UserForCopy[]>([]);
const isCopyMenuVisible = ref(false);
const selectedCopyUser = ref("");
const userListForCopyFormatted = computed(() =>
  userListForCopy.value.map((u) => ({
    ...u,
    label: `[${u.cabang}] ${u.kode} - ${u.nama}`,
  }))
);
const isApplyOthersVisible = ref(false);
const usersInSameCabang = ref<{ kode: string; nama: string; cabang: string }[]>([]);
const selectedTargetUsers = ref<string[]>([]);

// --- Methods ---
const fetchInitialMenus = async () => {
  try {
    const response = await api.get<MenuResponse[]>("/users/menus");
    permissions.value = response.data.map(
      (menu): Permission => ({
        id: menu.men_id,
        nama: menu.men_keterangan || menu.men_nama,
        keterangan: menu.men_keterangan,
        view: false,
        insert: false,
        edit: false,
        delete: false,
      })
    );
  } catch {
    toast.error("Gagal memuat daftar menu.");
  }
};

const fetchBranches = async () => {
  try {
    const response = await api.get(`/users/branches`);
    branches.value = response.data;
    if (branches.value.length > 0 && !cabang.value) {
      if (authStore.user?.cabang === "KDC") {
        cabang.value = branches.value[0].gdg_kode;
      } else {
        // [PERBAIKAN] Gunakan optional chaining dan fallback string kosong
        cabang.value = authStore.user?.cabang || "";
      }
    }
  } catch (error) {
    console.error("Gagal mengambil data cabang:", error);
  }
};

// [BARU] Buka modal pilih user untuk copy permission
const openCopyFromUser = async () => {
  if (!cabang.value) return toast.error("Pilih cabang dulu.");
  isCopyMenuVisible.value = false; // tutup dulu kalau ada
  selectedCopyUser.value = "";
  userListForCopy.value = [];

  try {
    const res = await api.get("/users/users-by-cabang", {
      params: { kasirOnly: true }, // tidak perlu kirim cabang, karena kasirOnly ambil semua K01-K10
    });
    userListForCopy.value = res.data;
    isCopyMenuVisible.value = true; // buka SETELAH data ready
  } catch {
    toast.error("Gagal memuat daftar user referensi.");
  }
};

// [BARU] Eksekusi copy permission dari user yang dipilih
const doCopyPermission = async () => {
  if (!selectedCopyUser.value) return toast.error("Pilih user referensi dulu.");
  try {
    const [refCabang, refKode] = selectedCopyUser.value.split("|");
    const res = await api.get("/users/template", {
      params: { kode: refKode, cabang: refCabang },
    });
    permissions.value = (res.data as Permission[]).map((p) => ({ ...p }));
    isCopyMenuVisible.value = false;
    selectedCopyUser.value = "";
    toast.success("Hak akses berhasil disalin.");
  } catch {
    toast.error("Gagal mengambil template hak akses.");
  }
};

// [BARU] Deteksi menu baru setelah load user edit
const checkNewMenus = async () => {
  if (isNewUser.value || !kode.value || !cabang.value) {
    newMenuIds.value = [];
    return;
  }
  const res = await api.get("/users/new-menus", {
    params: { kode: kode.value, cabang: cabang.value },
  });
  newMenuIds.value = res.data;
  if (res.data.length > 0) {
    toast.warning(`${res.data.length} menu baru belum dikonfigurasi untuk user ini.`);
  }
};

const handleKodeSearch = async () => {
  // Hanya cari jika KODE dan CABANG sudah diisi
  if (!kode.value || !cabang.value) {
    // Jika salah satu kosong, anggap ini user baru
    isNewUser.value = true;
    nama.value = "";
    password.value = ""; // Kosongkan password
    await fetchInitialMenus(); // Reset hak akses
    return;
  }

  isLoading.value = true;
  try {
    // Cari berdasarkan kode DAN cabang
    const response = await api.get(`/users/${kode.value}/${cabang.value}`);
    const data = response.data;

    if (data) {
      // Pastikan data tidak null
      isNewUser.value = false;
      nama.value = data.user.user_nama;
      permissions.value = data.permissions;
      await checkNewMenus();
      password.value = ""; // Kosongkan password saat load
      toast.info(`Mode Edit: Menampilkan data untuk user ${kode.value}.`);
    } else {
      // Backend mengembalikan 200 OK tapi data null (user tidak ditemukan)
      isNewUser.value = true;
      nama.value = "";
      await fetchInitialMenus();
      toast.info(
        `Kode user ${kode.value} di cabang ${cabang.value} tidak ditemukan. Silakan isi data baru.`
      );
    }
  } catch (error: unknown) {
    const err = error as AxiosError<ErrorResponse>;
    if (err.response && err.response.status === 404) {
      isNewUser.value = true;
      nama.value = "";
      await fetchInitialMenus();
      toast.info(
        `Kode user ${kode.value} di cabang ${cabang.value} tidak ditemukan. Silakan isi data baru.`
      );
    } else {
      toast.error(err.response?.data?.message || "Terjadi kesalahan saat mencari data user.");
    }
  } finally {
    isLoading.value = false;
  }
};

const openApplyOthersDialog = async () => {
  try {
    // Ambil semua user di cabang yang sama, exclude user yang baru disimpan
    const res = await api.get("/users/users-by-cabang", {
      params: { cabang: cabang.value },
    });
    usersInSameCabang.value = (res.data as UserForCopy[]).filter((u) => u.kode !== kode.value); // exclude diri sendiri
    selectedTargetUsers.value = [];
    isApplyOthersVisible.value = true;
  } catch {
    // Kalau gagal load, tetap reset form saja
    resetForm();
  }
};

const saveUser = async () => {
  if (!kode.value || !nama.value || !cabang.value) {
    toast.error("Kode, Nama, dan Cabang tidak boleh kosong.");
    return;
  }
  if (isNewUser.value && !password.value) {
    toast.error("Password wajib diisi untuk user baru.");
    return;
  }

  const requiredPermission = isNewUser.value ? "insert" : "edit";
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

    // Cek apakah perlu tawarkan apply ke user lain
    if (newMenuIds.value.length > 0 && !isNewUser.value) {
      await openApplyOthersDialog();
    } else {
      resetForm();
    }
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
const doApplyToOthers = async () => {
  if (!selectedTargetUsers.value.length) {
    isApplyOthersVisible.value = false;
    resetForm();
    return;
  }

  isLoading.value = true;
  try {
    const targetUsers = selectedTargetUsers.value.map((uid) => {
      const [targetCabang, targetKode] = uid.split("|");
      return { kode: targetKode, cabang: targetCabang };
    });

    await api.post("/users/apply-new-menus", {
      sourceKode: kode.value,
      sourceCabang: cabang.value,
      targetUsers,
      menuIds: newMenuIds.value,
    });

    toast.success(`Hak akses menu baru diterapkan ke ${targetUsers.length} user.`);
  } catch {
    toast.error("Gagal menerapkan ke user lain.");
  } finally {
    isLoading.value = false;
    isApplyOthersVisible.value = false;
    resetForm();
  }
};

const resetForm = () => {
  isNewUser.value = true;
  kode.value = "";
  nama.value = "";
  password.value = "";
  checkAll.value = false;

  if (branches.value.length > 0) {
    if (authStore.user?.cabang === "KDC") {
      cabang.value = branches.value[0].gdg_kode;
    } else {
      // [PERBAIKAN] Gunakan optional chaining dan fallback
      cabang.value = authStore.user?.cabang || "";
    }
  }

  fetchInitialMenus();
};
const toggleCheckAll = () => {
  permissions.value.forEach((p) => {
    p.view = checkAll.value;
    p.insert = checkAll.value;
    p.edit = checkAll.value;
    p.delete = checkAll.value;
  });
};
const handleUserSelected = (user: { kode: string; kode_cabang: string; nama_cabang: string }) => {
  kode.value = user.kode;
  cabang.value = user.kode_cabang; // [FIX] Simpan kodenya (misal: "KDC"), BUKAN namanya ("DC PUSAT")!
  isHelpModalVisible.value = false;
  handleKodeSearch();
};
const openHelpModal = () => {
  isHelpModalVisible.value = true;
};
const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === "F1") {
    e.preventDefault();
    openHelpModal();
  } else if (e.key === "Enter") {
    e.preventDefault();
    handleKodeSearch();
  }
};

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
      <!-- Kiri: aksi user -->
      <v-btn
        v-if="authStore.can(MENU_ID, 'insert')"
        size="small"
        variant="outlined"
        @click="resetForm"
      >
        Baru
      </v-btn>

      <v-btn
        v-if="authStore.can(MENU_ID, 'insert') || authStore.can(MENU_ID, 'edit')"
        size="small"
        color="primary"
        @click="saveUser"
        :loading="isLoading"
      >
        Simpan
      </v-btn>

      <v-divider vertical class="mx-1" style="height: 24px; align-self: center" />

      <v-btn
        size="small"
        color="teal"
        variant="tonal"
        prepend-icon="mdi-content-copy"
        @click="openCopyFromUser"
        :disabled="!cabang"
      >
        Salin dari User Lain
      </v-btn>

      <v-chip
        v-if="newMenuIds.length > 0"
        color="warning"
        variant="flat"
        prepend-icon="mdi-alert-circle-outline"
        size="small"
        class="ml-1"
      >
        {{ newMenuIds.length }} menu baru
      </v-chip>
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
            <v-text-field
              v-model="kode"
              label="Kode"
              placeholder="Ketik atau F1..."
              variant="outlined"
              density="compact"
              hide-details
              @keydown="handleKeydown"
              @blur="handleKodeSearch"
              :disabled="!isNewUser"
            >
              <template #append-inner
                ><v-icon size="small" @click="openHelpModal" icon="mdi-magnify"></v-icon
              ></template>
            </v-text-field>
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-text-field
              v-model="nama"
              label="Nama"
              variant="outlined"
              density="compact"
              hide-details
            ></v-text-field>
          </v-col>
          <v-col cols="12" sm="6" md="3">
            <v-text-field
              v-model="password"
              label="Password"
              type="password"
              :placeholder="isNewUser ? 'Wajib diisi' : 'Isi untuk ganti'"
              variant="outlined"
              density="compact"
              hide-details
            ></v-text-field>
          </v-col>
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
              :disabled="!isNewUser || authStore.user?.cabang !== 'KDC'"
              @update:modelValue="handleKodeSearch"
            ></v-select>
          </v-col>
        </v-row>
      </div>

      <!-- Permissions Section -->
      <div class="desktop-form-section flex-grow-1 d-flex flex-column">
        <div class="d-flex justify-space-between align-center mb-2">
          <h3 class="section-title">Hak Akses Menu</h3>
          <div class="d-flex align-center gap-3">
            <v-chip
              v-if="newMenuIds.length > 0"
              color="warning"
              variant="tonal"
              prepend-icon="mdi-alert-circle-outline"
              size="small"
            >
              {{ newMenuIds.length }} menu baru belum dikonfigurasi
            </v-chip>
            <v-checkbox
              v-model="checkAll"
              label="Cek Semua"
              @update:model-value="toggleCheckAll"
              hide-details
              density="compact"
              color="primary"
            />
          </div>
        </div>
        <v-data-table
          :items="permissions"
          :headers="[
            { title: 'Id', key: 'id', sortable: false, width: '55px' },
            { title: 'Nama Menu', key: 'nama', sortable: false },
            { title: 'Semua', key: 'all', sortable: false, align: 'center', width: '65px' },
            { title: 'View', key: 'view', sortable: false, align: 'center', width: '65px' },
            { title: 'Insert', key: 'insert', sortable: false, align: 'center', width: '65px' },
            { title: 'Update', key: 'edit', sortable: false, align: 'center', width: '65px' },
            { title: 'Delete', key: 'delete', sortable: false, align: 'center', width: '65px' },
          ]"
          :loading="isLoading && permissions.length === 0"
          density="compact"
          class="desktop-table flex-grow-1"
          fixed-header
          height="100%"
          :items-per-page="-1"
          :row-props="
            (item) => ({ class: newMenuIds.includes(String(item.item.id)) ? 'row-new-menu' : '' })
          "
        >
          <template v-slot:[`item.view`]="{ item }">
            <div class="d-flex justify-center">
              <v-checkbox-btn
                v-model="item.view"
                hide-details
                density="compact"
                color="primary"
              ></v-checkbox-btn>
            </div>
          </template>
          <template v-slot:[`item.insert`]="{ item }">
            <div class="d-flex justify-center">
              <v-checkbox-btn
                v-model="item.insert"
                hide-details
                density="compact"
                color="success"
              ></v-checkbox-btn>
            </div>
          </template>
          <template v-slot:[`item.edit`]="{ item }">
            <div class="d-flex justify-center">
              <v-checkbox-btn
                v-model="item.edit"
                hide-details
                density="compact"
                color="warning"
              ></v-checkbox-btn>
            </div>
          </template>
          <template v-slot:[`item.delete`]="{ item }">
            <div class="d-flex justify-center">
              <v-checkbox-btn
                v-model="item.delete"
                hide-details
                density="compact"
                color="error"
              ></v-checkbox-btn>
            </div>
          </template>
          <template v-slot:[`item.all`]="{ item }">
            <div class="d-flex justify-center">
              <v-checkbox-btn
                :model-value="item.view && item.insert && item.edit"
                hide-details
                density="compact"
                color="blue-grey"
                @update:model-value="
                  (val) => {
                    item.view = val;
                    item.insert = val;
                    item.edit = val;
                  }
                "
              />
            </div>
          </template>
        </v-data-table>
      </div>
    </div>

    <template #footer>
      <div class="d-flex justify-space-between align-center w-100">
        <v-chip size="small" :color="isNewUser ? 'success' : 'primary'" variant="flat">
          <v-icon start size="x-small">{{ isNewUser ? "mdi-plus" : "mdi-pencil" }}</v-icon>
          {{ isNewUser ? "Mode Tambah Baru" : "Mode Edit" }}
        </v-chip>
        <span v-if="!isNewUser" class="text-caption">Current User: {{ kode }}</span>
      </div>
    </template>

    <UserSearchModal
      v-if="isHelpModalVisible"
      fetch-url="/users"
      @close="isHelpModalVisible = false"
      @user-selected="handleUserSelected"
    />
  </PageLayout>

  <v-dialog v-model="isCopyMenuVisible" max-width="400px">
    <v-card>
      <v-card-title class="text-subtitle-1 font-weight-bold">
        Salin Hak Akses dari User
      </v-card-title>
      <v-card-text>
        <v-select
          v-model="selectedCopyUser"
          :items="userListForCopyFormatted"
          item-title="label"
          item-value="uid"
          label="Pilih User Referensi"
          variant="outlined"
          density="compact"
          hide-details
        />
        <div class="text-caption text-grey mt-2">
          Semua hak akses user yang dipilih akan disalin ke form ini.
        </div>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="isCopyMenuVisible = false">Batal</v-btn>
        <v-btn color="indigo" variant="flat" @click="doCopyPermission">Salin</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog v-model="isApplyOthersVisible" max-width="480px" persistent>
    <v-card>
      <v-card-title class="text-subtitle-1 font-weight-bold pa-4">
        <v-icon start color="warning">mdi-account-multiple-plus</v-icon>
        Terapkan ke User Lain?
      </v-card-title>

      <v-card-text class="pt-0">
        <p class="text-body-2 text-grey-darken-1 mb-3">
          Ditemukan <strong>{{ newMenuIds.length }} menu baru</strong> pada user
          <strong>{{ kode }}</strong
          >. Pilih user lain di cabang <strong>{{ cabang }}</strong> yang ingin mendapat setting
          yang sama:
        </p>

        <!-- Tombol pilih semua -->
        <div class="d-flex align-center justify-space-between mb-2">
          <span class="text-caption text-grey">{{ selectedTargetUsers.length }} user dipilih</span>
          <v-btn
            size="x-small"
            variant="text"
            color="primary"
            @click="selectedTargetUsers = usersInSameCabang.map((u) => u.cabang + '|' + u.kode)"
          >
            Pilih Semua
          </v-btn>
        </div>

        <!-- List user dengan checkbox -->
        <v-list density="compact" class="border rounded" max-height="280" style="overflow-y: auto">
          <v-list-item
            v-for="u in usersInSameCabang"
            :key="u.cabang + '|' + u.kode"
            :value="u.cabang + '|' + u.kode"
            rounded
          >
            <template #prepend>
              <v-checkbox-btn
                :model-value="selectedTargetUsers.includes(u.cabang + '|' + u.kode)"
                @update:model-value="
                  (val) => {
                    const uid = u.cabang + '|' + u.kode;
                    if (val) selectedTargetUsers.push(uid);
                    else selectedTargetUsers = selectedTargetUsers.filter((x) => x !== uid);
                  }
                "
                color="primary"
                hide-details
              />
            </template>
            <v-list-item-title class="text-body-2">{{ u.nama }}</v-list-item-title>
            <v-list-item-subtitle class="text-caption"
              >{{ u.kode }} · {{ u.cabang }}</v-list-item-subtitle
            >
          </v-list-item>

          <v-list-item v-if="usersInSameCabang.length === 0">
            <v-list-item-title class="text-caption text-grey text-center">
              Tidak ada user lain di cabang ini.
            </v-list-item-title>
          </v-list-item>
        </v-list>
      </v-card-text>

      <v-card-actions class="pa-4 pt-0">
        <v-btn
          variant="text"
          @click="
            isApplyOthersVisible = false;
            resetForm();
          "
        >
          Lewati
        </v-btn>
        <v-spacer />
        <v-btn
          color="primary"
          variant="flat"
          :disabled="!selectedTargetUsers.length"
          :loading="isLoading"
          @click="doApplyToOthers"
        >
          Terapkan ke {{ selectedTargetUsers.length }} User
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
:deep(.row-new-menu) {
  background-color: #fff8e1 !important;
  border-left: 3px solid #ffc107;
}
</style>
