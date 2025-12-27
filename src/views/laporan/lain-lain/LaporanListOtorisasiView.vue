<script setup lang="ts">
import { ref, reactive, onMounted, watch, computed } from 'vue';
import { useToast } from 'vue-toastification';
import { format } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import api from '@/services/api';
import { AxiosError } from 'axios';
import AppDataTable from '@/components/AppDataTable.vue';
import { formatRupiah } from "@/utils/formatRupiah";

// Update Interface sesuai kolom baru
interface OtorisasiItem {
  nomor: string;
  transaksi: string;
  jenis: string;
  nominal: number;
  approver: string;
  requester: string;
  keterangan: string; // Alasan masuk sini
  tanggal: string;
  barcode: string;
  uniqueId: string;
}

const toast = useToast();
const isLoading = ref(false);
const masterData = ref<OtorisasiItem[]>([]);

const filters = reactive({
  startDate: format(new Date(), 'yyyy-MM-dd'),
  endDate: format(new Date(), 'yyyy-MM-dd'),
});

const selectedFilterField = ref('nomor');
const filterSearchValue = ref('');

// Update Opsi Filter
const filterOptions = [
  { title: 'Nomor', value: 'nomor' },
  { title: 'Transaksi', value: 'transaksi' },
  { title: 'Jenis', value: 'jenis' },
  { title: 'Approver', value: 'approver' },
  { title: 'Requester', value: 'requester' },
  { title: 'Keterangan/Alasan', value: 'keterangan' },
];

// Update Headers Tabel
const headers = [
  { title: 'Nomor', key: 'nomor', fixed: true, width: '140px' },
  { title: 'Tanggal', key: 'tanggal', width: '160px' },
  { title: 'Transaksi', key: 'transaksi', width: '120px' },
  { title: 'Jenis', key: 'jenis', width: '150px' },
  { title: 'Nominal', key: 'nominal', align: 'end', width: '120px' },
  { title: 'Req', key: 'requester', width: '100px' },
  { title: 'Appr', key: 'approver', width: '100px' },

  // INI YANG PENTING: DUA KOLOM TERPISAH
  { title: 'Keterangan', key: 'keterangan', width: '250px' },
  { title: 'Alasan', key: 'alasan', width: '200px' },
];

const fetchMasterData = async () => {
  isLoading.value = true;
  masterData.value = [];
  try {
    const response = await api.get('/laporan-list-otorisasi/list-otorisasi', {
      params: { startDate: filters.startDate, endDate: filters.endDate },
    });

    const rows = (response.data?.data ?? response.data ?? []) as Record<string, unknown>[];

    masterData.value = rows.map((item, idx) => {
      // 1. Ambil mentahan dari database
      // Contoh: "Cust: SRI\nDiskon: 325.000\n\nAlasan: PROMO DESEMBER"
      const rawText = String(item.keterangan ?? item.raw_keterangan ?? '');

      // 2. Tentukan Kata Kunci Pemisah
      const keyword = 'Alasan:';

      let ketClean = rawText;
      let reasonClean = '-';

      // 3. Logika Split Berdasarkan Kata Kunci
      // Cari posisi di mana kata "Alasan:" dimulai
      const index = rawText.indexOf(keyword);

      if (index !== -1) {
        // --- BAGIAN KETERANGAN (Sebelum kata "Alasan:") ---
        // Ambil dari karakter 0 sampai index ditemukan
        const ketPart = rawText.substring(0, index).trim();

        // Opsional: Ganti Enter (\n) dengan Koma agar rapi di tabel
        ketClean = ketPart.replace(/\n+/g, ', ').trim();
        // Jika hasil akhirnya berakhiran koma, hapus komanya
        if (ketClean.endsWith(',')) ketClean = ketClean.slice(0, -1);


        // --- BAGIAN ALASAN (Setelah kata "Alasan:") ---
        // Ambil dari index + panjang kata kunci sampai akhir
        const reasonPart = rawText.substring(index + keyword.length).trim();
        reasonClean = reasonPart.replace(/\n+/g, ' ').trim();
      } else {
        // Jika tidak ada kata "Alasan:", maka bersihkan enter saja
        ketClean = rawText.replace(/\n+/g, ', ').trim();
      }

      return {
        nomor: String(item.nomor ?? ''),
        transaksi: String(item.transaksi ?? ''),
        jenis: String(item.jenis ?? ''),
        nominal: Number(item.nominal ?? 0),
        approver: String(item.approver ?? '-'),
        requester: String(item.requester ?? '-'),

        // Masukkan hasil split
        keterangan: ketClean,
        alasan: reasonClean,

        tanggal: String(item.tanggal ?? ''),
        barcode: String(item.barcode ?? ''),
        uniqueId: `${item.nomor}-${idx}`,
      };
    });
  } catch (err) {
    const error = err as AxiosError<{ message?: string }>;
    toast.error(error.response?.data?.message || 'Gagal memuat daftar otorisasi.');
  } finally {
    isLoading.value = false;
  }
};

const filteredData = computed(() => {
  const keyword = filterSearchValue.value.trim().toLowerCase();
  const field = selectedFilterField.value;

  if (!keyword) return masterData.value;

  return masterData.value.filter((item) => {
    const val = item[field as keyof OtorisasiItem];
    return val?.toString().toLowerCase().includes(keyword);
  });
});

onMounted(fetchMasterData);
watch(filters, fetchMasterData, { deep: true });
</script>

<template>
  <PageLayout title="Laporan Daftar Otorisasi" icon="mdi-shield-account-outline">
    <template #header-actions>
      <v-btn size="small" prepend-icon="mdi-file-export" color="blue-grey" disabled>
        Export
      </v-btn>
    </template>

    <div class="browse-content">
      <div class="filter-section">
        <v-label class="filter-label font-weight-bold">Periode:</v-label>
        <v-text-field v-model="filters.startDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 150px;" class="ms-2" />
        <span class="mx-2 align-self-center">-</span>
        <v-text-field v-model="filters.endDate" type="date" density="compact" hide-details variant="outlined"
          style="max-width: 150px;" />

        <v-divider vertical class="mx-4 hidden-sm-and-down"></v-divider>

        <v-select v-model="selectedFilterField" :items="filterOptions" label="Filter Kolom" density="compact"
          hide-details variant="outlined" style="max-width: 180px;" />

        <v-text-field v-model="filterSearchValue" label="Cari data..." density="compact" hide-details variant="outlined"
          style="min-width: 200px;" clearable prepend-inner-icon="mdi-magnify" class="ms-2" />

        <v-spacer></v-spacer>
        <v-btn @click="fetchMasterData" icon="mdi-refresh" variant="tonal" size="small" :loading="isLoading"
          color="primary" />
      </div>

      <div class="fill-height-table mt-2">
        <AppDataTable :headers="headers" :items="filteredData" :loading="isLoading" class="desktop-table elevation-1"
          density="compact" fixed-header :items-per-page="20" item-value="uniqueId">

          <template #[`item.nominal`]="{ item }">
            <span :class="item.nominal > 0 ? 'text-blue-grey-darken-3 font-weight-medium' : 'text-grey'">
              {{ formatRupiah(item.nominal) }}
            </span>
          </template>

          <template #[`item.approver`]="{ item }">
            <v-chip size="x-small" color="success" variant="tonal" v-if="item.approver !== '-'">
              <v-icon start icon="mdi-check-circle" size="small"></v-icon>
              {{ item.approver }}
            </v-chip>
            <span v-else class="text-grey">-</span>
          </template>

          <template #[`item.requester`]="{ item }">
             <span class="text-caption font-weight-bold">{{ item.requester }}</span>
          </template>

          <template #no-data>
            <div class="text-center py-6 text-medium-emphasis">
              <v-icon icon="mdi-file-hidden" size="large" class="mb-2"></v-icon>
              <div>Tidak ada data otorisasi pada periode ini.</div>
            </div>
          </template>
        </AppDataTable>
      </div>
    </div>
  </PageLayout>
</template>
