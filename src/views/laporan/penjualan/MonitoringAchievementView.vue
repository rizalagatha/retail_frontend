<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue';
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import * as XLSX from 'xlsx';
import { AxiosError } from 'axios';
import AppDataTable from '@/components/AppDataTable.vue';

interface DailyItem {
  kode_cabang: string;
  nama_cabang: string;
  hari: string;
  tanggal: string; // atau Date jika sudah parse
  omset: number;
  total_omset: number;
  target: number;
  total_target: number;
  ach: number;
}
interface WeeklyItem {
  kode_cabang: string;
  nama_cabang: string;
  nominal_w1: number;
  target_w1: number;
  nominal_w2: number;
  target_w2: number;
  nominal_w3: number;
  target_w3: number;
  nominal_w4: number;
  target_w4: number;
  nominal_w5: number;
  target_w5: number;
  total_nominal: number;
  total_target: number;
  // ACH bisa dihitung, jadi opsional
}
interface MonthlyItem {
  tahun: number;
  bulan: number;
  kode_cabang: string;
  nama_cabang: string;
  nominal: number;
  target: number;
  ach: number;
}
interface YtdItem {
  tahun: number;
  bulan: number;
  kode_cabang: string;
  nama_cabang: string;
  nominal: number;
  target: number;
  ach: number;
}
type WeeklyTotals = {
  nominal_w1: number; target_w1: number;
  nominal_w2: number; target_w2: number;
  nominal_w3: number; target_w3: number;
  nominal_w4: number; target_w4: number;
  nominal_w5: number; target_w5: number;
  total_nominal: number; total_target: number;
  ach_w1: number; ach_w2: number; ach_w3: number; ach_w4: number; ach_w5: number;
  total_ach: number;
};
interface DailySummary {
  omset: number;
  total_omset: number;
  target: number;
  total_target: number;
  ach: number;
  nominal: number;
}
interface MonthlySummary {
  nominal: number;
  target: number;
  ach: number;
}
interface YtdSummary {
  nominal: number;
  target: number;
  ach: number;
}
interface ExcelRow {
  [key: string]: string | number | undefined;
}

const toast = useToast();
const authStore = useAuthStore();
const MENU_ID = '705';

const activeTab = ref('daily');
const isLoading = ref(false);
const cabangOptions = ref([]);

const dailyData = ref<DailyItem[]>([]);
const weeklyData = ref<WeeklyItem[]>([]);
const monthlyData = ref<MonthlyItem[]>([]);
const ytdData = ref<YtdItem[]>([]);

const currentYear = new Date().getFullYear();
const filters = reactive({
  tahun: currentYear,
  bulan: new Date().getMonth() + 1,
  cabang: authStore.user?.cabang === 'KDC' ? 'ALL' : authStore.user?.cabang,
});

const yearOptions = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];
const monthOptions = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, title: format(new Date(0, i), 'MMMM') }));

// Headers dinamis berdasarkan tab
// --- Definisi Headers untuk Setiap Tab ---
const headersDaily = [
  { title: 'No', key: 'no', sortable: false, width: '50px' }, { title: 'Kode Cabang', key: 'kode_cabang' },
  { title: 'Nama Cabang', key: 'nama_cabang', minWidth: '150px' }, { title: 'Hari', key: 'hari' },
  { title: 'Tanggal', key: 'tanggal' },
  { title: 'Omset (Harian)', key: 'omset' }, // Ganti judul
  { title: 'Total Omset (Kumulatif)', key: 'total_omset' }, // Ganti judul
  { title: 'Target (Harian)', key: 'target' }, // Ganti judul
  { title: 'Total Target (Kumulatif)', key: 'total_target' }, // <-- TAMBAHKAN INI
  { title: 'Ach(%)', key: 'ach' }, // Ini sudah kumulatif (benar)
];
// const headersWeeklyGroup = [
//   { title: 'No', rowspan: 2, key: 'no' }, { title: 'Kode Cabang', rowspan: 2, key: 'kode_cabang' }, { title: 'Nama Cabang', rowspan: 2, key: 'nama_cabang' },
//   { title: 'Minggu 1', colspan: 3, align: 'center' }, { title: 'Minggu 2', colspan: 3, align: 'center' },
//   { title: 'Minggu 3', colspan: 3, align: 'center' }, { title: 'Minggu 4', colspan: 3, align: 'center' },
//   { title: 'Minggu 5', colspan: 3, align: 'center' }, { title: 'Total', colspan: 3, align: 'center' },
// ];
// const headersWeeklySub = [
//   'Omset', 'Target', 'Ach(%)', 'Omset', 'Target', 'Ach(%)', 'Omset', 'Target', 'Ach(%)',
//   'Omset', 'Target', 'Ach(%)', 'Omset', 'Target', 'Ach(%)', 'Omset', 'Target', 'Ach(%)',
// ];
const headersMonthly = [
  { title: 'Tahun', key: 'tahun' }, { title: 'Bulan', key: 'bulan' },
  { title: 'Kode Cabang', key: 'kode_cabang' }, { title: 'Nama Cabang', key: 'nama_cabang' },
  { title: 'Omset', key: 'nominal' }, { title: 'Target', key: 'target' },
  { title: 'Ach(%)', key: 'ach' },
];
const headersYtd = [
  { title: 'No', key: 'no', sortable: false, width: '50px' }, { title: 'Tahun', key: 'tahun' },
  { title: 'Bulan', key: 'bulan' }, { title: 'Total Omset', key: 'nominal' },
  { title: 'Target', key: 'target' }, { title: 'Ach(%)', key: 'ach' },
];

// const activeHeaders = computed(() => {
//   switch (activeTab.value) {
//     case 'daily': return headersDaily;
//     case 'weekly': return headersWeekly;
//     case 'monthly': return headersMonthlyYTD;
//     case 'ytd': return headersMonthlyYTD;
//     default: return [];
//   }
// });

const totalSummary = computed<DailySummary>(() =>
  (activeTab.value === 'daily' ? dailyTotalSummary.value :
    activeTab.value === 'weekly' ? weeklyTotalSummary.value :
      activeTab.value === 'monthly' ? monthlyTotalSummary.value :
        activeTab.value === 'ytd' ? ytdTotalSummary.value :
          { omset: 0, total_omset: 0, target: 0, total_target: 0, ach: 0 }) as DailySummary
);

const dailyTotalSummary = computed<DailySummary>(() => {
  if (!dailyData.value || dailyData.value.length === 0) {
    return { omset: 0, target: 0, total_omset: 0, total_target: 0, ach: 0 } as DailySummary;
  }

  const lastItem = dailyData.value[dailyData.value.length - 1];
  const totals = {
    omset: dailyData.value.reduce((sum, item) => sum + (Number(item.omset) || 0), 0),
    target: dailyData.value.reduce((sum, item) => sum + (Number(item.target) || 0), 0),
    total_omset: Number(lastItem.total_omset) || 0,
    total_target: Number(lastItem.total_target) || 0,
  };

  return {
    ...totals,
    ach: totals.total_target > 0 ? (totals.total_omset / totals.total_target * 100) : 0,
  } as DailySummary;
});

const weeklyTotalSummary = computed<WeeklyTotals>(() => {
  if (!weeklyData.value || weeklyData.value.length === 0) {
    // kosongkan semua properti
    return {
      nominal_w1: 0, target_w1: 0,
      nominal_w2: 0, target_w2: 0,
      nominal_w3: 0, target_w3: 0,
      nominal_w4: 0, target_w4: 0,
      nominal_w5: 0, target_w5: 0,
      total_nominal: 0, total_target: 0,
      ach_w1: 0, ach_w2: 0, ach_w3: 0, ach_w4: 0, ach_w5: 0,
      total_ach: 0
    };
  }

  const totals = weeklyData.value.reduce<WeeklyTotals>((acc, item) => {
    for (let i = 1; i <= 5; i++) {
      acc[`nominal_w${i}`] += Number(item[`nominal_w${i}`] || 0);
      acc[`target_w${i}`] += Number(item[`target_w${i}`] || 0);
    }
    acc.total_nominal += Number(item.total_nominal || 0);
    acc.total_target += Number(item.total_target || 0);
    return acc;
  }, {
    nominal_w1: 0, target_w1: 0,
    nominal_w2: 0, target_w2: 0,
    nominal_w3: 0, target_w3: 0,
    nominal_w4: 0, target_w4: 0,
    nominal_w5: 0, target_w5: 0,
    total_nominal: 0, total_target: 0,
    ach_w1: 0, ach_w2: 0, ach_w3: 0, ach_w4: 0, ach_w5: 0,
    total_ach: 0
  });

  // Hitung Ach(%) tiap minggu
  for (let i = 1; i <= 5; i++) {
    totals[`ach_w${i}`] = totals[`target_w${i}`] > 0 ? (totals[`nominal_w${i}`] / totals[`target_w${i}`] * 100) : 0;
  }
  totals.total_ach = totals.total_target > 0 ? (totals.total_nominal / totals.total_target * 100) : 0;

  return totals;
});
const monthlyTotalSummary = computed<MonthlySummary>(() => {
  if (!monthlyData.value || monthlyData.value.length === 0) {
    // Return object lengkap, tidak boleh kosong
    return { nominal: 0, target: 0, ach: 0 } as MonthlySummary;
  }

  const totals = {
    nominal: monthlyData.value.reduce((sum, item) => sum + (Number(item.nominal) || 0), 0),
    target: monthlyData.value.reduce((sum, item) => sum + (Number(item.target) || 0), 0),
  };

  return {
    ...totals,
    ach: totals.target > 0 ? (totals.nominal / totals.target * 100) : 0,
  } as MonthlySummary;
});

const ytdTotalSummary = computed<YtdSummary>(() => {
  if (!ytdData.value || ytdData.value.length === 0) {
    return { nominal: 0, target: 0, ach: 0 } as YtdSummary;
  }

  const totals = {
    nominal: ytdData.value.reduce((sum, item) => sum + (Number(item.nominal) || 0), 0),
    target: ytdData.value.reduce((sum, item) => sum + (Number(item.target) || 0), 0),
  };

  return {
    ...totals,
    ach: totals.target > 0 ? (totals.nominal / totals.target * 100) : 0,
  } as YtdSummary;
});

const fetchData = async () => {
  isLoading.value = true;
  try {
    const response = await api.get('/monitoring-achievement', {
      params: { ...filters, reportType: activeTab.value }
    });
    // Simpan data ke state yang sesuai
    if (activeTab.value === 'daily') dailyData.value = response.data;
    else if (activeTab.value === 'weekly') weeklyData.value = response.data;
    else if (activeTab.value === 'monthly') monthlyData.value = response.data;
    else if (activeTab.value === 'ytd') ytdData.value = response.data;
  } catch (err: unknown) {
    const error = err as AxiosError<{ message?: string }>; // <- cast ke AxiosError dengan kemungkinan ada property message
    if (error.response) {
      toast.error(error.response.data?.message || `Gagal memuat data. Status: ${error.response.status}`);
    } else if (error.request) {
      toast.error('Tidak ada respon dari server. Periksa koneksi.');
    } else {
      toast.error(`Terjadi kesalahan: ${error.message || 'Unknown error'}`);
    }
  } finally {
    isLoading.value = false;
  }
};

const fetchCabangOptions = async () => {
  try {
    const response = await api.get('/monitoring-achievement/cabang-options');
    cabangOptions.value = response.data;
  } catch (error) {
    toast.error('Gagal memuat filter cabang.', error);
  }
};

const exportData = () => {
  let dataToExport: ExcelRow[] = [];
  let worksheet: XLSX.WorkSheet | null = null;
  let fileName = `Laporan_Monitoring_Achievement_${filters.tahun}-${filters.bulan}.xlsx`;
  let sheetName = 'Data';

  const dailyTotals = dailyTotalSummary.value;
  const weeklyTotals = weeklyTotalSummary.value;
  const monthlyTotals = monthlyTotalSummary.value;
  const ytdTotals = ytdTotalSummary.value;

  // --- Ambil Data dan Format Sesuai Tab Aktif ---
  switch (activeTab.value) {
    case 'daily':
      if (dailyData.value.length === 0) return toast.warning('Tidak ada data Harian untuk diekspor.');
      sheetName = 'Daily';
      fileName = `Laporan_Harian_${filters.cabang}_${filters.tahun}-${filters.bulan}.xlsx`;
      dataToExport = dailyData.value.map((item, index) => ({
        No: index + 1,
        'Kode Cabang': item.kode_cabang,
        'Nama Cabang': item.nama_cabang,
        Hari: item.hari,
        Tanggal: item.tanggal ? format(new Date(item.tanggal), 'dd-MM-yyyy') : '',
        'Omset Harian': item.omset,
        'Total Omset Kumulatif': item.total_omset,
        'Target Harian': item.target,
        'Total Target Kumulatif': item.total_target,
        'Ach (%)': item.ach, // Ach sudah kumulatif
      }));
      // Tambahkan Grand Total
      if (dailyTotals && Object.keys(dailyTotals).length > 0) {
        dataToExport.push({}); // Baris kosong
        dataToExport.push({
          No: '', 'Kode Cabang': '', 'Nama Cabang': '', Hari: '', Tanggal: 'GRAND TOTAL:',
          'Omset Harian': dailyTotals.omset, // <-- Akses properti dari dailyTotals
          'Total Omset Kumulatif': dailyTotals.total_omset,
          'Target Harian': dailyTotals.target,
          'Total Target Kumulatif': dailyTotals.total_target,
          'Ach (%)': dailyTotals.ach,
        });
      }
      break;

    case 'weekly':
      if (weeklyData.value.length === 0) return toast.warning('Tidak ada data Mingguan untuk diekspor.');
      sheetName = 'Weekly';
      fileName = `Laporan_Mingguan_${filters.tahun}-${filters.bulan}.xlsx`;
      dataToExport = weeklyData.value.map((item, index) => ({
        No: index + 1,
        'Kode Cabang': item.kode_cabang,
        'Nama Cabang': item.nama_cabang,
        'Omset W1': item.nominal_w1,
        'Target W1': item.target_w1,
        'Ach W1 (%)': item.target_w1 > 0 ? (item.nominal_w1 / item.target_w1 * 100) : 0,
        'Omset W2': item.nominal_w2,
        'Target W2': item.target_w2,
        'Ach W2 (%)': item.target_w2 > 0 ? (item.nominal_w2 / item.target_w2 * 100) : 0,
        'Omset W3': item.nominal_w3,
        'Target W3': item.target_w3,
        'Ach W3 (%)': item.target_w3 > 0 ? (item.nominal_w3 / item.target_w3 * 100) : 0,
        'Omset W4': item.nominal_w4,
        'Target W4': item.target_w4,
        'Ach W4 (%)': item.target_w4 > 0 ? (item.nominal_w4 / item.target_w4 * 100) : 0,
        'Omset W5': item.nominal_w5,
        'Target W5': item.target_w5,
        'Ach W5 (%)': item.target_w5 > 0 ? (item.nominal_w5 / item.target_w5 * 100) : 0,
        'Total Omset': item.total_nominal,
        'Total Target': item.total_target,
        'Total Ach (%)': item.total_target > 0 ? (item.total_nominal / item.total_target * 100) : 0,
      }));
      // Tambahkan Grand Total
      if (weeklyTotals && Object.keys(weeklyTotals).length > 0) {
        dataToExport.push({}); // Baris kosong
        dataToExport.push({
          No: '', 'Kode Cabang': '', 'Nama Cabang': 'GRAND TOTAL:',
          'Omset W1': weeklyTotals.nominal_w1, // <-- Akses properti dari weeklyTotals
          'Target W1': weeklyTotals.target_w1,
          'Ach W1 (%)': weeklyTotals.ach_w1,
          'Omset W2': weeklyTotals.nominal_w2,
          'Target W2': weeklyTotals.target_w2,
          'Ach W2 (%)': weeklyTotals.ach_w2,
          'Omset W3': weeklyTotals.nominal_w3,
          'Target W3': weeklyTotals.target_w3,
          'Ach W3 (%)': weeklyTotals.ach_w3,
          'Omset W4': weeklyTotals.nominal_w4,
          'Target W4': weeklyTotals.target_w4,
          'Ach W4 (%)': weeklyTotals.ach_w4,
          'Omset W5': weeklyTotals.nominal_w5,
          'Target W5': weeklyTotals.target_w5,
          'Ach W5 (%)': weeklyTotals.ach_w5,
          'Total Omset': weeklyTotals.total_nominal,
          'Total Target': weeklyTotals.total_target,
          'Total Ach (%)': weeklyTotals.total_ach,
        });
      }
      break;

    case 'monthly':
      if (monthlyData.value.length === 0) return toast.warning('Tidak ada data Bulanan untuk diekspor.');
      sheetName = 'Monthly';
      fileName = `Laporan_Bulanan_${filters.tahun}-${filters.bulan}.xlsx`;
      dataToExport = monthlyData.value.map((item, index) => ({
        No: index + 1,
        Tahun: item.tahun,
        Bulan: monthOptions.find(m => m.value === item.bulan)?.title || item.bulan,
        'Kode Cabang': item.kode_cabang,
        'Nama Cabang': item.nama_cabang,
        Omset: item.nominal,
        Target: item.target,
        'Ach (%)': item.ach,
      }));
      // Tambahkan Grand Total
      if (monthlyTotals && Object.keys(monthlyTotals).length > 0) {
        dataToExport.push({}); // Baris kosong
        dataToExport.push({
          No: '', Tahun: '', Bulan: '', 'Kode Cabang': '', 'Nama Cabang': 'GRAND TOTAL:',
          Omset: monthlyTotals.nominal, // <-- Akses properti dari monthlyTotals
          Target: monthlyTotals.target,
          'Ach (%)': monthlyTotals.ach,
        });
      }
      break;

    case 'ytd':
      if (ytdData.value.length === 0) return toast.warning('Tidak ada data Year to Date untuk diekspor.');
      sheetName = 'YearToDate';
      fileName = `Laporan_Ytd_${filters.cabang}_${filters.tahun}.xlsx`;
      dataToExport = ytdData.value.map((item, index) => ({
        No: index + 1,
        Tahun: item.tahun,
        Bulan: monthOptions.find(m => m.value === item.bulan)?.title || item.bulan,
        'Kode Cabang': item.kode_cabang, // Tambahkan ini jika perlu
        'Nama Cabang': item.nama_cabang, // Tambahkan ini jika perlu
        'Total Omset': item.nominal,
        Target: item.target,
        'Ach (%)': item.ach,
      }));
      // Tambahkan Grand Total
      if (ytdTotals && Object.keys(ytdTotals).length > 0) {
        dataToExport.push({}); // Baris kosong
        dataToExport.push({
          No: '', Tahun: '', Bulan: 'GRAND TOTAL:', 'Kode Cabang': '', 'Nama Cabang': '',
          'Total Omset': ytdTotals.nominal, // <-- Akses properti dari ytdTotals
          Target: ytdTotals.target,
          'Ach (%)': ytdTotals.ach,
        });
      }
      break;

    default:
      toast.error('Tab tidak valid untuk ekspor.');
      return;
  }

  // --- Buat Worksheet & Download ---
  try {
    toast.info(`Membuat file Excel untuk tab ${sheetName}...`);
    if (dataToExport.length === 0) {
      toast.error('Tidak ada data sama sekali untuk diekspor.');
      return;
    }
    worksheet = XLSX.utils.json_to_sheet(dataToExport);

    // Optional: Atur lebar kolom (bisa disesuaikan)
    const firstDataRow = dataToExport.find(row => row.No === 1) || dataToExport[0];
    const cols = Object.keys(firstDataRow).map(key => ({
      wch: key.includes('Nama') ? 30 : key.includes('Cabang') ? 15 : key.includes('Tanggal') ? 12 : key.includes('%') ? 8 : 12
    }));
    if (worksheet) worksheet['!cols'] = cols;

    // Atur format angka untuk kolom numerik (contoh)
    dataToExport.forEach((_row, r) => {
      // Cek jika baris BUKAN baris kosong atau label GRAND TOTAL
      const rowData = dataToExport[r];
      const isDataRow = rowData && Object.values(rowData).some(val => val !== '' && !String(val).includes('GRAND TOTAL'));

      if (isDataRow) {
        // Ambil keys dari baris ini atau baris data pertama
        const keys = Object.keys(rowData);
        keys.forEach((key, c) => {
          const cellRef = XLSX.utils.encode_cell({ r: r + 1, c }); // +1 karena header otomatis json_to_sheet

          // --- PERBAIKAN: Tambahkan cek worksheet && worksheet[cellRef] ---
          if (worksheet && worksheet[cellRef]) {
            const cellValue = worksheet[cellRef].v;

            if (typeof cellValue === 'number') {
              if (key.includes('%')) {
                worksheet[cellRef].z = '0.00%';
                worksheet[cellRef].t = 'n';
                // Cek jika nilai belum dibagi 100 (misalnya dari total summary)
                if (cellValue > 1 || cellValue < -1) {
                  worksheet[cellRef].v = cellValue / 100;
                }
              } else if (!key.toLowerCase().includes('no') && !key.toLowerCase().includes('tahun') && !key.toLowerCase().includes('bulan')) {
                worksheet[cellRef].z = '#,##0';
                worksheet[cellRef].t = 'n';
              }
            } else if (key.includes('%') && typeof cellValue === 'string' && cellValue.endsWith('%')) {
              // Jika sudah string dengan %, coba konversi
              const numValue = parseFloat(cellValue.replace('%', ''));
              if (!isNaN(numValue)) {
                worksheet[cellRef].v = numValue / 100;
                worksheet[cellRef].z = '0.00%';
                worksheet[cellRef].t = 'n';
              }
            }
          }
          // -----------------------------------------------------------------
        });
      }
    });

    if (!worksheet) {
      throw new Error('Worksheet gagal dibuat.');
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, fileName);
    toast.success(`File ${fileName} berhasil diekspor.`);
  } catch (error) {
    toast.error('Gagal membuat file Excel.');
    console.error("Export Excel error:", error);
  }
};

onMounted(() => {
  fetchCabangOptions();
  fetchData();
});
watch(activeTab, (newTab) => {
  // Reset filter cabang ke default saat pindah tab
  if (newTab === 'weekly' || newTab === 'monthly') {
    // Untuk weekly dan monthly, tidak perlu filter cabang spesifik
    // Biarkan kosong atau set ke default
  } else if (newTab === 'daily' || newTab === 'ytd') {
    // Untuk daily dan ytd, kembalikan ke default user
    if (authStore.user?.cabang !== 'KDC') {
      filters.cabang = authStore.user?.cabang;
    }
  }

  // Fetch data akan otomatis terpanggil karena ada watch di [filters, activeTab]
});
watch([filters, activeTab], fetchData, { deep: true });
</script>

<template>
  <PageLayout title="Laporan Monitoring Achievement" :menu-id="MENU_ID">
    <template #header-actions>
      <v-btn size="small" color="teal" prepend-icon="mdi-file-excel" @click="exportData">
        Export
      </v-btn>
    </template>

    <v-tabs v-model="activeTab" class="mb-2">
      <v-tab value="daily">Daily</v-tab>
      <v-tab value="weekly">Weekly</v-tab>
      <v-tab value="monthly">Monthly</v-tab>
      <v-tab value="ytd">Year to Date</v-tab>
    </v-tabs>

    <div class="browse-content">
      <div class="filter-section">
        <v-select v-model="filters.tahun" :items="yearOptions" label="Tahun" density="compact" hide-details
          variant="outlined" style="max-width: 150px;" />
        <v-select v-if="activeTab !== 'ytd'" v-model="filters.bulan" :items="monthOptions" item-title="title"
          item-value="value" label="Bulan" density="compact" hide-details variant="outlined" class="ms-4"
          style="max-width: 180px;" />
        <v-select v-if="activeTab === 'daily' || activeTab === 'ytd'" v-model="filters.cabang" :items="cabangOptions"
          item-title="nama" item-value="kode" label="Cabang" density="compact" hide-details variant="outlined"
          class="ms-4" style="max-width: 200px;" :readonly="authStore.user?.cabang !== 'KDC'" />
        <v-spacer />
        <v-btn @click="fetchData" icon="mdi-refresh" variant="text" size="small" :loading="isLoading" />
      </div>

      <div class="table-container">
        <v-window v-model="activeTab">
          <!-- Tab Daily -->
          <v-window-item value="daily">
            <AppDataTable :headers="headersDaily" :items="dailyData" :loading="isLoading" class="desktop-table"
              density="compact" height="500" fixed-header :items-per-page="-1">
              <template v-slot:[`item.no`]="{ index }">
                {{ index + 1 }}
              </template>
              <template v-slot:[`item.tanggal`]="{ item }">
                {{ format(new Date(item.tanggal), 'dd-MM-yyyy') }}
              </template>
              <template v-for="col in ['omset', 'total_omset', 'target', 'total_target']" :key="col"
                v-slot:[`item.${col}`]="{ item }">
                <td class="text-end">{{ (item[col] || 0).toLocaleString('id-ID') }}</td>
              </template>
              <template v-slot:[`item.ach`]="{ item }">
                <td class="text-end">
                  <v-chip size="small" :color="item.ach >= 100 ? 'success' : 'error'">
                    {{ (item.ach || 0).toFixed(2) }}%
                  </v-chip>
                </td>
              </template>
              <template v-slot:[`body.append`]>
                <tr class="bg-grey-lighten-3 font-weight-bold total-row-sticky">
                  <td colspan="5" class="text-start">GRAND TOTAL :</td>
                  <td class="text-start">{{ totalSummary.omset?.toLocaleString('id-ID') }}</td>
                  <td class="text-start">{{ totalSummary.total_omset?.toLocaleString('id-ID') }}</td>
                  <td class="text-start">{{ totalSummary.target?.toLocaleString('id-ID') }}</td>
                  <td class="text-start">{{ totalSummary.total_target?.toLocaleString('id-ID') }}</td>
                  <td class="text-start">{{ totalSummary.ach?.toFixed(2) }}%</td>
                </tr>
              </template>
              <template #bottom></template>
            </AppDataTable>
          </v-window-item>

          <!-- Tab Weekly -->
          <v-window-item value="weekly">
            <div style="overflow-x: auto;">
              <table class="weekly-table">
                <thead>
                  <tr>
                    <th rowspan="2" style="min-width: 40px;">No</th>
                    <th rowspan="2" style="min-width: 80px;">Kode Cabang</th>
                    <th rowspan="2" style="min-width: 120px;">Nama Cabang</th>
                    <th colspan="3" class="text-center">Minggu 1</th>
                    <th colspan="3" class="text-center">Minggu 2</th>
                    <th colspan="3" class="text-center">Minggu 3</th>
                    <th colspan="3" class="text-center">Minggu 4</th>
                    <th colspan="3" class="text-center">Minggu 5</th>
                    <th colspan="3" class="text-center">Total</th>
                  </tr>
                  <tr>
                    <template v-for="w in 6" :key="w">
                      <th class="text-end" style="min-width: 100px;">Omset</th>
                      <th class="text-end" style="min-width: 100px;">Target</th>
                      <th class="text-center" style="min-width: 70px;">Ach(%)</th>
                    </template>
                  </tr>
                </thead>
                <tbody>
                  <tr v-if="isLoading">
                    <td colspan="21" class="text-center py-4">Loading...</td>
                  </tr>
                  <tr v-else-if="weeklyData.length === 0">
                    <td colspan="21" class="text-center py-4">Tidak ada data</td>
                  </tr>
                  <template v-else>
                    <tr v-for="(item, index) in weeklyData" :key="index">
                      <td class="text-center">{{ index + 1 }}</td>
                      <td>{{ item.kode_cabang }}</td>
                      <td>{{ item.nama_cabang }}</td>
                      <template v-for="w in 5" :key="w">
                        <td class="text-end">{{ (item[`nominal_w${w}`] || 0).toLocaleString('id-ID') }}</td>
                        <td class="text-end">{{ (item[`target_w${w}`] || 0).toLocaleString('id-ID') }}</td>
                        <td class="text-center">
                          <v-chip size="x-small"
                            :color="(item[`target_w${w}`] > 0 ? (item[`nominal_w${w}`] / item[`target_w${w}`] * 100) : 0) >= 100 ? 'success' : 'error'">
                            {{ (item[`target_w${w}`] > 0 ? (item[`nominal_w${w}`] / item[`target_w${w}`] * 100) :
                              0).toFixed(2) }}%
                          </v-chip>
                        </td>
                      </template>
                      <td class="text-end font-weight-bold">{{ (item.total_nominal || 0).toLocaleString('id-ID') }}</td>
                      <td class="text-end font-weight-bold">{{ (item.total_target || 0).toLocaleString('id-ID') }}</td>
                      <td class="text-center">
                        <v-chip size="x-small"
                          :color="(item.total_target > 0 ? (item.total_nominal / item.total_target * 100) : 0) >= 100 ? 'success' : 'error'">
                          {{ (item.total_target > 0 ? (item.total_nominal / item.total_target * 100) : 0).toFixed(2) }}%
                        </v-chip>
                      </td>
                    </tr>
                  </template>
                </tbody>
                <tfoot v-if="weeklyData.length > 0">
                  <tr class="total-row-sticky">
                    <td colspan="3" class="text-end">GRAND TOTAL :</td>
                    <template v-for="w in 5" :key="w">
                      <td class="text-end">{{ (weeklyTotalSummary[`nominal_w${w}`] || 0).toLocaleString('id-ID') }}</td>
                      <td class="text-end">{{ (weeklyTotalSummary[`target_w${w}`] || 0).toLocaleString('id-ID') }}</td>
                      <td class="text-center">{{ (weeklyTotalSummary[`ach_w${w}`] || 0).toFixed(2) }}%</td>
                    </template>
                    <td class="text-end">{{ (weeklyTotalSummary.total_nominal || 0).toLocaleString('id-ID') }}</td>
                    <td class="text-end">{{ (weeklyTotalSummary.total_target || 0).toLocaleString('id-ID') }}</td>
                    <td class="text-center">{{ (weeklyTotalSummary.total_ach || 0).toFixed(2) }}%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </v-window-item>

          <!-- Tab Monthly -->
          <v-window-item value="monthly">
            <AppDataTable :headers="headersMonthly" :items="monthlyData" :loading="isLoading" class="desktop-table"
              density="compact" fixed-header :items-per-page="-1">
              <template v-for="col in ['nominal', 'target']" :key="col" v-slot:[`item.${col}`]="{ item }">
                <td class="text-end">{{ (item[col] || 0).toLocaleString('id-ID') }}</td>
              </template>
              <template v-slot:[`item.ach`]="{ item }">
                <td class="text-end">
                  <v-chip size="small" :color="item.ach >= 100 ? 'success' : 'error'">
                    {{ (item.ach || 0).toFixed(2) }}%
                  </v-chip>
                </td>
              </template>
              <template v-slot:[`body.append`]>
                <tr class="total-row-sticky">
                  <td></td>
                  <td></td>
                  <td></td>
                  <td class="text-start">GRAND TOTAL :</td>
                  <td class="text-start">{{ (totalSummary.nominal || 0).toLocaleString('id-ID') }}</td>
                  <td class="text-start">{{ (totalSummary.target || 0).toLocaleString('id-ID') }}</td>
                  <td class="text-start">{{ (totalSummary.ach || 0).toFixed(2) }}%</td>
                </tr>
              </template>
              <template #bottom></template>
            </AppDataTable>
          </v-window-item>

          <!-- Tab Year to Date -->
          <v-window-item value="ytd">
            <AppDataTable :headers="headersYtd" :items="ytdData" :loading="isLoading" class="desktop-table"
              density="compact" fixed-header :items-per-page="-1">
              <template v-slot:[`item.no`]="{ index }">
                {{ index + 1 }}
              </template>
              <template v-slot:[`item.bulan`]="{ item }">
                {{monthOptions.find(m => m.value === item.bulan)?.title}}
              </template>
              <template v-for="col in ['nominal', 'target']" :key="col" v-slot:[`item.${col}`]="{ item }">
                <td class="text-end">{{ (item[col] || 0).toLocaleString('id-ID') }}</td>
              </template>
              <template v-slot:[`item.ach`]="{ item }">
                <td class="text-end">
                  <v-chip size="small" :color="item.ach >= 100 ? 'success' : 'error'">
                    {{ (item.ach || 0).toFixed(2) }}%
                  </v-chip>
                </td>
              </template>
              <template v-slot:[`body.append`]>
                <tr class="total-row-sticky">
                  <td></td>
                  <td></td>
                  <td class="text-start">GRAND TOTAL :</td>
                  <td class="text-start">{{ (totalSummary.nominal || 0).toLocaleString('id-ID') }}</td>
                  <td class="text-start">{{ (totalSummary.target || 0).toLocaleString('id-ID') }}</td>
                  <td class="text-start">{{ (totalSummary.ach || 0).toFixed(2) }}%</td>
                </tr>
              </template>
              <template #bottom></template>
            </AppDataTable>
          </v-window-item>
        </v-window>
      </div>
    </div>
  </PageLayout>
</template>

<style scoped>
.browse-content {
  padding: 16px;
}

.filter-section {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
  gap: 8px;
}

.table-container {
  /* overflow-x: auto; */
  border: 1px solid #e0e0e0;
  border-radius: 4px;
}

:deep(.v-table__wrapper) {
  max-height: 500px;
  /* tinggi scroll area */
  overflow-y: auto !important;
  /* wajib agar sticky bisa berfungsi */
  position: relative;
  /* buat referensi posisi sticky */
}

/* Styling untuk tabel weekly */
.weekly-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px !important;
  background: white;
}

.weekly-table th,
.weekly-table td {
  padding: 6px 8px !important;
  border: 1px solid #e0e0e0;
  font-size: 11px !important;
  white-space: nowrap;
}

.weekly-table thead th {
  background-color: #f5f5f5;
  font-weight: 600;
  font-size: 11px !important;
  position: sticky;
  top: 0;
  z-index: 10;
}

.weekly-table tbody td {
  font-size: 11px !important;
}

/* Override v-chip untuk tabel weekly */
.weekly-table :deep(.v-chip) {
  font-size: 10px !important;
  height: 18px !important;
  padding: 0 4px !important;
  min-width: 50px;
}

.weekly-table :deep(.v-chip__content) {
  padding: 0 !important;
}

/* Alignment khusus */
.text-end {
  text-align: right !important;
}

.text-center {
  text-align: center !important;
}

.font-weight-bold {
  font-weight: 600 !important;
}

.grand-total-row {
  background-color: #f5f5f5 !important;
}

.total-row-sticky td {
  position: sticky;
  bottom: 0;
  z-index: 20;
  /* pastikan lebih tinggi dari header */
  background-color: #eeeeee !important;
  border-top: 2px solid #bdbdbd !important;
  font-weight: 600 !important;
  font-size: 12px !important;
  padding: 10px 16px !important;
}

/* Penyesuaian kecil untuk font tabel weekly agar konsisten */
.weekly-table .total-row-sticky td {
  font-size: 11px !important;
  padding: 8px !important;
  background-color: #f5f5f5 !important;
  /* Samakan dengan tfoot weekly sebelumnya */
  border-top: 2px solid #9e9e9e !important;
}
</style>
