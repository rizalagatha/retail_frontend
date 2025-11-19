<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, parseISO } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import type { AxiosError } from 'axios';

interface StokOpnameDate {
  cabang: string;
  tanggal: string;
  transfer: 'Y' | 'N';
}

// --- Inisialisasi & State ---
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '21';

const items = ref<StokOpnameDate[]>([]);
const selected = ref<StokOpnameDate[]>([]);
const isLoading = ref(true);

const dialogSetting = reactive({
  show: false,
  tanggal: format(new Date(), 'yyyy-MM-dd'),
});
const dialogConfirm = reactive({ show: false, title: '', text: '', onConfirm: () => { } });

// --- Computed Properties ---
const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed<StokOpnameDate | null>(() => isSingleSelected.value ? selected.value[0] : null);
const canDelete = computed(() => isSingleSelected.value && selectedRow.value?.transfer !== 'Y');

const headers = [
  { title: 'Cabang', key: 'cabang', width: '200px' },
  { title: 'Tanggal', key: 'tanggal' },
  { title: 'Transfer', key: 'transfer', align: 'center', width: '200px' },
] as const;

// --- Methods ---
const fetchData = async () => {
  isLoading.value = true;
  selected.value = [];
  try {
    const response = await api.get('/stok-opname/setting-tanggal');
    items.value = response.data;
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || 'Gagal memuat data.');
  } finally {
    isLoading.value = false;
  }
};

const openSettingDialog = () => {
  dialogSetting.tanggal = format(new Date(), 'yyyy-MM-dd');
  dialogSetting.show = true;
};

const handleSetTanggal = async () => {
  isLoading.value = true;
  dialogSetting.show = false;
  try {
    const response = await api.post('/stok-opname/setting-tanggal', { tanggal: dialogSetting.tanggal });
    toast.success(response.data.message);
    fetchData();
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || 'Gagal menyimpan tanggal.');
  } finally {
    isLoading.value = false;
  }
};

const openDeleteDialog = () => {
  if (!canDelete.value) return;
  dialogConfirm.title = 'Konfirmasi Hapus';
  dialogConfirm.text = `Yakin ingin menghapus tanggal stok opname <strong>${format(parseISO(selectedRow.value!.tanggal), 'dd MMMM yyyy')}</strong>?`;
  dialogConfirm.onConfirm = handleDelete;
  dialogConfirm.show = true;
};

const handleDelete = async () => {
  isLoading.value = true;
  try {
    const response = await api.delete(`/stok-opname/setting-tanggal/${selectedRow.value!.tanggal}`);
    toast.success(response.data.message);
    fetchData();
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || 'Gagal menghapus tanggal.');
  } finally {
    isLoading.value = false;
  }
};

onMounted(fetchData);
</script>

<template>
  <PageLayout title="Setting Tanggal Stok Opname" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" prepend-icon="mdi-cog" color="primary"
        @click="openSettingDialog">Setting</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" prepend-icon="mdi-delete" color="error"
        :disabled="!canDelete" @click="openDeleteDialog">Hapus</v-btn>
    </template>

    <div class="browse-content">
      <div class="table-container">
        <AppDataTable v-model="selected" :headers="headers" :items="items" :loading="isLoading"
          class="desktop-table header-browse-blue" density="compact" fixed-header item-value="tanggal" return-object
          single-select>
          <template #[`item.tanggal`]="{ item }">
            {{ format(parseISO(item.tanggal), 'dd MMMM yyyy') }}
          </template>
          <template #[`item.transfer`]="{ item }">
            <v-chip size="small" :color="item.transfer === 'Y' ? 'success' : 'grey'">
              {{ item.transfer === 'Y' ? 'SUDAH' : 'BELUM' }}
            </v-chip>
          </template>
        </AppDataTable>
      </div>
    </div>

    <!-- Dialog untuk Setting Tanggal -->
    <v-dialog v-model="dialogSetting.show" max-width="400px" persistent>
      <v-card>
        <v-card-title>Setting Tanggal Stok Opname</v-card-title>
        <v-card-text>
          <v-text-field v-model="dialogSetting.tanggal" type="date" label="Tanggal" variant="outlined" density="compact"
            autofocus />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="dialogSetting.show = false">Batal</v-btn>
          <v-btn color="primary" @click="handleSetTanggal">OK</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog untuk Konfirmasi Hapus -->
    <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text>
          <div v-html="dialogConfirm.text"></div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="dialogConfirm.show = false">Tidak</v-btn>
          <v-btn color="primary" variant="tonal"
            @click="() => { dialogConfirm.onConfirm(); dialogConfirm.show = false; }">Ya</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>
