<script setup lang="ts">
import { ref, reactive, onMounted, watch, computed } from 'vue'; 
import { useToast } from 'vue-toastification';
import { useAuthStore } from '@/stores/authStore';
import api from '@/services/api';
import { format } from 'date-fns';
import PageLayout from '@/components/PageLayout.vue';
import GudangSearchModal from '@/components/GudangSearchModal.vue'; // Asumsi komponen pencarian Gudang ada
import * as XLSX from 'xlsx';

// --- Tipe Data ---
interface GudangOption {
    kode: string;
    nama: string;
}

// --- State & Inisialisasi ---
const toast = useToast();
const authStore = useAuthStore();
const CABKAOS = authStore.user?.cabangUtama || 'KDC'; 

// State Laporan
const masterData = ref<any[]>([]);
const details = ref<Record<string, any[]>>({}); // Untuk detail Master-Detail (Level)
const isLoading = ref(false);
const loadingDetails = ref(new Set<string>());
const gudangList = ref<GudangOption[]>([]);
const isGudangSearchVisible = ref(false);
const expanded = ref<any[]>([]); // Untuk expand/detail di tabel Level


const reportType = ref<'tanggal' | 'customer' | 'level'>('tanggal'); 

// Filters (sesuai input di Delphi)
const filters = reactive({
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    // edtgdgkode.Text
    gudangKode: CABKAOS === 'KDC' ? 'ALL' : CABKAOS, 
    gudangNama: CABKAOS === 'KDC' ? 'Semua Cabang' : CABKAOS, 
});

// --- Logic Headers Tabel ---

// Headers Laporan Per Tanggal
const headersTanggal = [
    { title: filters.gudangKode === 'ALL' ? 'Cabang' : 'Kode', key: 'Kode', fixed: true, width: '100px' },
    { title: 'Tanggal', key: 'Tanggal', fixed: true, width: '120px' },
    { title: 'Nominal', key: 'Nominal', align: 'end' },
    ...(CABKAOS === 'KDC' ? [
        { title: 'HPP', key: 'Hpp', align: 'end' },
        { title: 'Laba', key: 'Laba', align: 'end' },
    ] : []),
    { title: 'Donasi', key: 'Donasi', align: 'end' },
    { title: 'Pundi Amal', key: 'PundiAmal', align: 'end' },
];

// Headers Laporan Per Pelanggan
const headersCustomer = [
    { title: 'Kode', key: 'Kode', fixed: true, width: '80px' },
    { title: 'Nama', key: 'Nama', fixed: true, width: '250px' },
    { title: 'Level', key: 'Level_nama', width: '150px' },
    { title: 'Alamat', key: 'Alamat', sortable: false },
    { title: 'Kota', key: 'Kota' },
    { title: 'Nominal', key: 'Nominal', align: 'end' },
    ...(CABKAOS === 'KDC' ? [
        { title: 'HPP', key: 'Hpp', align: 'end' },
        { title: 'Laba', key: 'Laba', align: 'end' },
    ] : []),
    { title: 'Donasi', key: 'Donasi', align: 'end' },
    { title: 'Pundi Amal', key: 'PundiAmal', align: 'end' },
];

// Headers Laporan Per Level
const headersLevel = [
    { title: 'Kode', key: 'Kode', fixed: true, width: '80px' },
    { title: 'Level', key: 'Level', fixed: true, width: '200px' },
    { title: 'Qty', key: 'Qty', align: 'end' },
    { title: 'Nominal', key: 'Nominal', align: 'end' },
    ...(CABKAOS === 'KDC' ? [
        { title: 'HPP', key: 'Hpp', align: 'end' },
        { title: 'Laba', key: 'Laba', align: 'end' },
    ] : []),
    { title: 'Donasi', key: 'Donasi', align: 'end' },
    { title: 'Pundi Amal', key: 'PundiAmal', align: 'end' },
    { key: 'data-table-expand', title: '' }, // Untuk expand detail
];

// Headers Detail Pelanggan (untuk Laporan Per Level)
const detailHeadersLevel = [
    { title: 'Kode', key: 'kdcus', width: '80px' },
    { title: 'Nama', key: 'nama', width: '200px' },
    { title: 'Alamat', key: 'alamat', sortable: false },
    { title: 'Kota', key: 'kota', width: '120px' },
    { title: 'Qty', key: 'Qty', align: 'end', width: '80px' },
    { title: 'Nominal', key: 'Nominal', align: 'end' },
    ...(CABKAOS === 'KDC' ? [
        { title: 'HPP', key: 'Hpp', align: 'end' },
        { title: 'Laba', key: 'Laba', align: 'end' },
    ] : []),
];

const headers = [
  { title: "Cabang", key: "cabang" },
  { title: "Tanggal", key: "tanggal" },
  { title: "Nominal", key: "nominal" },
  { title: "HPP", key: "hpp" },
  { title: "Laba", key: "laba" },
  { title: "Donasi", key: "donasi" },
  { title: "Pundi Amal", key: "pundi_amal" },
];

const filteredData = ref([]); // data tabel kamu

const total = computed(() => {
  const sum = (key) =>
    filteredData.value.reduce((acc, row) => acc + (Number(row[key]) || 0), 0);
  return {
    nominal: sum("nominal"),
    hpp: sum("hpp"),
    laba: sum("laba"),
    donasi: sum("donasi"),
    pundi_amal: sum("pundi_amal"),
  };
});

const formatNumber = (num) =>
  new Intl.NumberFormat("id-ID").format(Math.round(num));

// Komputasi Header Aktif
const activeHeaders = computed(() => {
    switch (reportType.value) {
        case 'tanggal':
            return headersTanggal;
        case 'customer':
            return headersCustomer;
        case 'level':
            return headersLevel;
        default:
            return [];
    }
});

// --- Hitung Total Keseluruhan ---
const totalSummary = computed(() => {
  if (!masterData.value.length) return {};

  // Hitung total tiap kolom numerik yang ada di headers aktif
  const totals: Record<string, number> = {};

  activeHeaders.value.forEach(header => {
    const key = header.key;
    if (['Nominal', 'Hpp', 'Laba', 'Donasi', 'PundiAmal', 'Qty'].includes(key)) {
      totals[key] = masterData.value.reduce(
        (sum, item) => sum + (Number(item[key]) || 0),
        0
      );
    }
  });

  return totals;
});


// --- API Calls ---

// Fungsi dummy untuk fetch Gudang (sesuai logika F1 di Delphi)
const fetchGudangOptions = async () => {

    if (CABKAOS === 'KDC') {
        gudangList.value = [
            { kode: 'ALL', nama: 'Semua Cabang' },
            // Asumsi call API /gudang-list untuk gudang lainnya
            // ... (data gudang dari API)
        ];
    } else {
        gudangList.value = [
            { kode: CABKAOS, nama: `Cabang ${CABKAOS}` }, // Ambil nama dari API jika perlu
        ];
    }
};

const fetchMasterData = async () => {
    isLoading.value = true;
    details.value = {};
    expanded.value = [];
    try {
        const response = await api.get('/laporan-invoice/master', { 
            params: { 
                ...filters, 
                reportType: reportType.value 
            } 
        });
        masterData.value = response.data;
    } catch (error: any) {
        toast.error(error.response?.data?.message || `Gagal memuat data Laporan ${reportType.value}.`);
    } finally {
        isLoading.value = false;
    }
};

const loadDetails = async (newlyExpandedItems: any[]) => {
    if (reportType.value !== 'level') return; // Hanya untuk laporan Level

    const itemToLoad = newlyExpandedItems.find(item => {
        const id = item.Kode; // Key untuk laporan level adalah Kode Level
        return !details.value[id] && !loadingDetails.value.has(id);
    });

    if (!itemToLoad) return;

    const levelKode = itemToLoad.Kode; 
    loadingDetails.value.add(levelKode);

    try {
        // Query detail sesuai logika SQL detail laporan level:
        // Filter: levelKode (MasterKeyField) dan rentang tanggal/gudang.
        const response = await api.get('/laporan-invoice/detail-customer-by-level', {
            params: { 
                ...filters, 
                levelKode: levelKode,
            },
        });

        details.value = {
            ...details.value,
            [levelKode]: response.data,
        };
    } catch (error: any) {
        toast.error(error.response?.data?.message || `Gagal memuat detail untuk Level ${levelKode}`);
    } finally {
        loadingDetails.value.delete(levelKode);
    }
};

// --- Event Handlers ---
const onGudangSelected = (gudangKode: string) => {
    const selected = gudangList.value.find(g => g.kode === gudangKode);
    if (selected) {
        filters.gudangNama = selected.nama;
    }
};

const openGudangSearch = () => { 
    if (CABKAOS !== 'KDC') return; 
    isGudangSearchVisible.value = true; 
};

const onGudangSelectedModal = (gudang: { kode: string; nama: string; }) => {
    filters.gudangKode = gudang.kode;
    filters.gudangNama = gudang.nama;
    isGudangSearchVisible.value = false;
};

const clearGudangFilter = () => {
    if (CABKAOS === 'KDC') {
        filters.gudangKode = 'ALL';
        filters.gudangNama = 'Semua Cabang';
    }
};

const exportToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(masterData.value);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Laporan Invoice ${reportType.value}`);
    XLSX.writeFile(wb, `LaporanInvoice_${reportType.value}_${filters.startDate}_sd_${filters.endDate}.xlsx`);
};

// --- Lifecycle & Watchers ---
onMounted(fetchGudangOptions);

// Muat data setiap kali filter atau tipe laporan berubah
watch([filters, reportType], fetchMasterData, { deep: true, immediate: true });
</script>

<template>
  <PageLayout title="Laporan Invoice Penjualan" icon="mdi-receipt-text-outline">
    <!-- Header Actions -->
    <template #header-actions>
      <v-btn size="small" @click="exportToExcel" prepend-icon="mdi-file-excel" color="teal">Export</v-btn>
      <v-btn
        v-if="reportType === 'level'"
        size="small"
        @click="console.log('Cetak Laporan Level')"
        prepend-icon="mdi-printer"
        color="primary"
      >
        Cetak (Delphi: cxButton3)
      </v-btn>
    </template>

    <div class="browse-content">
      <!-- Filter Section -->
      <div class="filter-section d-flex align-center flex-wrap">
        <v-radio-group v-model="reportType" inline density="compact" hide-details class="me-4">
          <v-radio label="Per Tanggal" value="tanggal" class="me-4" />
          <v-radio label="Per Pelanggan" value="customer" class="me-4" />
          <v-radio label="Per Level" value="level" />
        </v-radio-group>

        <v-label class="filter-label ms-4">Periode:</v-label>
        <v-text-field
          v-model="filters.startDate"
          type="date"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 180px;"
        />
        <v-label class="mx-2">s/d</v-label>
        <v-text-field
          v-model="filters.endDate"
          type="date"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 180px;"
        />

        <v-text-field
          v-model="filters.gudangKode"
          label="Cabang (F1)"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 140px;"
          class="ms-4"
          :readonly="CABKAOS !== 'KDC'"
          @click="openGudangSearch"
          @keydown.f1.prevent="openGudangSearch"
          clearable
          @click:clear="clearGudangFilter"
        >
          <template #append-inner>
            <v-icon @click="openGudangSearch" :disabled="CABKAOS !== 'KDC'">mdi-magnify</v-icon>
          </template>
        </v-text-field>

        <v-text-field
          v-model="filters.gudangNama"
          readonly
          filled
          density="compact"
          hide-details
          style="max-width: 200px;"
          class="ms-1"
        />

        <v-spacer />
        <v-btn
          @click="fetchMasterData"
          icon="mdi-refresh"
          variant="text"
          size="small"
          :loading="isLoading"
          title="Muat Ulang Data"
        />
      </div>

      <!-- ====================== -->
      <!-- 🧾 DATA TABLE SECTION -->
      <!-- ====================== -->
      <div class="table-container">
        <!-- ✅ MODE PER LEVEL -->
        <v-data-table
          v-if="reportType === 'level'"
          :headers="activeHeaders"
          :items="masterData"
          :loading="isLoading"
          class="desktop-table main-table"
          density="compact"
          fixed-header
          show-expand
          return-object
          item-value="Kode"
          v-model:expanded="expanded"
          @update:expanded="loadDetails"
          height="420px"
        >
          <!-- Format angka -->
          <template v-slot:item.Nominal="{ item }">
            {{ new Intl.NumberFormat('id-ID').format(item.Nominal) }}
          </template>
          <template v-slot:item.Hpp="{ item }">
            {{ new Intl.NumberFormat('id-ID').format(item.Hpp) }}
          </template>
          <template v-slot:item.Laba="{ item }">
            {{ new Intl.NumberFormat('id-ID').format(item.Laba) }}
          </template>
          <template v-slot:item.Donasi="{ item }">
            {{ new Intl.NumberFormat('id-ID').format(item.Donasi) }}
          </template>
          <template v-slot:item.PundiAmal="{ item }">
            {{ new Intl.NumberFormat('id-ID').format(item.PundiAmal) }}
          </template>

          <!-- ✅ TOTAL FIXED -->
          <template v-slot:body.append>
            <tr class="bg-grey-lighten-4 font-weight-bold total-row-fixed">
              <td
                v-for="(header, index) in activeHeaders"
                :key="header.key"
                class="text-end pa-2"
              >
                <template v-if="index === 0">TOTAL :</template>
                <template
                  v-else-if="['Qty', 'Nominal', 'Hpp', 'Laba', 'Donasi', 'PundiAmal'].includes(header.key)"
                >
                  {{ new Intl.NumberFormat('id-ID').format(totalSummary[header.key] || 0) }}
                </template>
                <template v-else>&nbsp;</template>
              </td>
            </tr>
          </template>

          <!-- ✅ Expanded Detail -->
          <template #expanded-row="{ columns, item }">
            <tr>
              <td :colspan="columns.length">
                <div class="detail-container pa-2">
                  <v-data-table
                    :headers="detailHeadersLevel"
                    :items="details[item.Kode]"
                    density="compact"
                    class="detail-table"
                    :items-per-page="-1"
                  >
                    <template #bottom></template>
                    <template v-slot:item.Nominal="{ item }">
                      {{ new Intl.NumberFormat('id-ID').format(item.Nominal) }}
                    </template>
                    <template v-slot:item.Hpp="{ item }">
                      {{ new Intl.NumberFormat('id-ID').format(item.Hpp) }}
                    </template>
                    <template v-slot:item.Laba="{ item }">
                      {{ new Intl.NumberFormat('id-ID').format(item.Laba) }}
                    </template>
                  </v-data-table>
                </div>
              </td>
            </tr>
          </template>
        </v-data-table>

        <!-- ✅ MODE NON-LEVEL -->
        <v-data-table
          v-else
          :headers="activeHeaders"
          :items="masterData"
          :loading="isLoading"
          class="desktop-table main-table"
          density="compact"
          fixed-header
          height="420px"
        >
          <!-- Format angka -->
          <template v-slot:item.Nominal="{ item }">
            {{ new Intl.NumberFormat('id-ID').format(item.Nominal) }}
          </template>
          <template v-slot:item.Hpp="{ item }">
            {{ new Intl.NumberFormat('id-ID').format(item.Hpp) }}
          </template>
          <template v-slot:item.Laba="{ item }">
            {{ new Intl.NumberFormat('id-ID').format(item.Laba) }}
          </template>
          <template v-slot:item.Donasi="{ item }">
            {{ new Intl.NumberFormat('id-ID').format(item.Donasi) }}
          </template>
          <template v-slot:item.PundiAmal="{ item }">
            {{ new Intl.NumberFormat('id-ID').format(item.PundiAmal) }}
          </template>

          <!-- ✅ TOTAL FIXED -->
          <template v-slot:body.append>
            <tr class="bg-grey-lighten-4 font-weight-bold total-row-fixed">
              <td
                v-for="(header, index) in activeHeaders"
                :key="header.key"
                class="text-end pa-2"
              >
                <template v-if="index === 0">TOTAL :</template>
                <template
                  v-else-if="['Nominal', 'Hpp', 'Laba', 'Donasi', 'PundiAmal'].includes(header.key)"
                >
                  {{ new Intl.NumberFormat('id-ID').format(totalSummary[header.key] || 0) }}
                </template>
                <template v-else>&nbsp;</template>
              </td>
            </tr>
          </template>
        </v-data-table>
      </div>
    </div>
  </PageLayout>
</template>

<style scoped>
/* Batas tinggi agar hanya isi tabel yang scroll */
.v-data-table__wrapper {
  max-height: 400px;
  overflow-y: auto;
  position: relative;
}

/* ✅ Baris total tetap di bawah dan tidak ikut scroll */
.total-row-fixed {
  position: sticky;
  bottom: 0;
  background-color: #f5f5f5; /* warna latar total */
  z-index: 5;
  box-shadow: 0 -2px 4px rgba(0, 0, 0, 0.05);
}
tr.bg-grey-lighten-4 {
  border-top: 2px solid #ccc;
}
.font-weight-bold {
  font-weight: bold;
}
.text-end {
  text-align: right;
}

.filter-section {
    padding: 8px 0;
    border-bottom: 1px solid #eee;
}

.table-container {
    height: calc(100vh - 200px);
    overflow-y: auto;
}

.desktop-table {
    white-space: nowrap;
}

/* Kustomisasi untuk detail table agar tidak terlalu lebar */
.detail-table-wrapper {
    max-width: 90%;
    margin: 0 auto;
}
</style>