<script setup lang="ts">
import { ref, onMounted, computed, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format, parseISO, isBefore } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import * as XLSX from 'xlsx';
import type { AxiosError } from 'axios';

interface Promo {
  nomor: string;
  judul: string;
  tanggal1: string;
  tanggal2: string;
  jenis: string;
  totalRp: number;
  totalQty: number;
  diskonRp: number;
  diskonPersen: number;
  keterangan?: string;
}

const router = useRouter();
const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '205';

const dataList = ref<Promo[]>([]);
const selected = ref<Promo[]>([]);
const loading = ref(true);
const dialogConfirm = reactive({ show: false, title: '', text: '', onConfirm: () => { } });

const isSingleSelected = computed(() => selected.value.length === 1);
const selectedRow = computed(() => isSingleSelected.value ? selected.value[0] : null);

const headers = [
  { title: 'Nomor', key: 'nomor', width: '150px' },
  { title: 'Judul', key: 'judul', width: '250px' },
  { title: 'Tanggal Mulai', key: 'tanggal1' },
  { title: 'Tanggal Selesai', key: 'tanggal2' },
  { title: 'Jenis', key: 'jenis' },
  { title: 'Total Rp', key: 'totalRp', align: 'end' },
  { title: 'Total Qty', key: 'totalQty', align: 'end' },
  { title: 'Diskon Rp', key: 'diskonRp', align: 'end' },
  { title: 'Diskon %', key: 'diskonPersen', align: 'end' },
  { title: 'Keterangan', key: 'keterangan' },
] as const;

const fetchData = async () => {
  loading.value = true;
  selected.value = [];
  try {
    const response = await api.get('/promo');
    dataList.value = response.data;
  } catch (error) {
    const err = error as AxiosError<{ message?: string }>;
    toast.error(err.response?.data?.message || 'Gagal mengambil data.');
  } finally {
    loading.value = false;
  }
};

const handleNew = () => {
  router.push({ name: 'PromoCreate' });
};

const handleEdit = () => {
  if (!isSingleSelected.value) return;

  router.push({
    name: 'PromoEdit',
    params: { nomor: selectedRow.value.nomor }
  });
};

const handleDelete = () => {
  if (!isSingleSelected.value) return;
  showConfirmation(
    'Konfirmasi Hapus',
    `Yakin ingin menghapus promo: ${selectedRow.value.judul}?`,
    async () => {
      try {
        const response = await api.delete(`/promo/${selectedRow.value.nomor}`);
        toast.success(response.data.message);
        fetchData();
      } catch (error) {
        const err = error as AxiosError<{ message?: string }>;
        toast.error(err.response?.data?.message || 'Gagal menghapus data.');
      }
    }
  );
};

const exportData = () => {
  if (dataList.value.length === 0) return toast.warning('Tidak ada data untuk diexport.');
  const worksheet = XLSX.utils.json_to_sheet(dataList.value);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Promo");
  XLSX.writeFile(workbook, "Export_Promo.xlsx");
};

const showConfirmation = (title: string, text: string, onConfirm: () => void) => {
  dialogConfirm.title = title;
  dialogConfirm.text = text;
  dialogConfirm.onConfirm = onConfirm;
  dialogConfirm.show = true;
};

const getRowTextColor = (item: Promo) => {
  if (isBefore(parseISO(item.tanggal2), new Date())) {
    return 'text-red';
  }
  return '';
};

onMounted(fetchData);
</script>

<template>
  <PageLayout title="Browse Promo" icon="mdi-gift-outline">
    <template #header-actions>
      <v-btn v-if="authStore.can(MENU_ID, 'insert')" size="small" color="primary" @click="handleNew">Baru</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'edit')" size="small" @click="handleEdit"
        :disabled="!isSingleSelected">Ubah</v-btn>
      <v-btn v-if="authStore.can(MENU_ID, 'delete')" size="small" color="error" @click="handleDelete"
        :disabled="!isSingleSelected">Hapus</v-btn>
      <v-btn size="small" color="teal" @click="exportData" prepend-icon="mdi-file-excel">Export</v-btn>
    </template>

    <div class="browse-content">
      <div class="table-container">
        <v-data-table v-model="selected" :headers="headers" :items="dataList" :loading="loading" item-value="nomor"
          density="compact" class="desktop-table" fixed-header show-select return-object single-select>
          <template v-for="header in headers" #[`item.${header.key}`]="{ item }" :key="header.key">
            <td :class="getRowTextColor(item)">
              <template v-if="['tanggal1', 'tanggal2'].includes(header.key)">
                {{ item[header.key]
                  ? format(parseISO(String(item[header.key])), 'dd/MM/yyyy')
                : '' }}
              </template>
              <template v-else>
                {{ item[header.key] }}
              </template>
            </td>
          </template>
        </v-data-table>
      </div>
    </div>

    <v-dialog v-model="dialogConfirm.show" max-width="400px" persistent>
      <v-card>
        <v-card-title class="text-h6 font-weight-bold">{{ dialogConfirm.title }}</v-card-title>
        <v-card-text>{{ dialogConfirm.text }}</v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn text @click="dialogConfirm.show = false">Batal</v-btn>
          <v-btn color="error" variant="tonal" @click="dialogConfirm.onConfirm(); dialogConfirm.show = false;">Ya,
            Hapus</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </PageLayout>
</template>
