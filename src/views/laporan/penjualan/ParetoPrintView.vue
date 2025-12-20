<script setup lang="ts">
import { ref, onMounted, nextTick, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '@/services/api';
import { format } from 'date-fns';
import Logo from '@/assets/logo.png';

// --- Tipe Data & State ---
interface ParetoItem {
  KODE: string;
  NAMA: string;
  ALLSIZE: number;
  XS: number; S: number; M: number; L: number; XL: number;
  '2XL': number; '3XL': number; '4XL': number; '5XL': number;
  OVERSIZE: number; JUMBO: number; OTHER: number;
  TOTAL: number;
  StokReal: number;
}

const route = useRoute();
const reportData = ref<ParetoItem[]>([]);
const headerInfo = ref({
  periode: '',
  cabang: '',
  item: '',
  kategori: '',
});
const isLoading = ref(true);
const appLogo = Logo;

// --- Methods ---
const fetchPrintData = async () => {
  isLoading.value = true;
  try {
    // Ambil filter dari URL query
    const filters = route.query;
    headerInfo.value = {
      periode: `Periode: ${format(new Date(filters.startDate as string), 'dd-MM-yyyy')} s/d ${format(new Date(filters.endDate as string), 'dd-MM-yyyy')}`,
      cabang: `Cabang: ${filters.cabang}`,
      item: `Item: ${filters.limit}`,
      kategori: `Kategori Produk: ${filters.kategori}`,
    };

    // Panggil endpoint yang sama dengan halaman browse
    const response = await api.get('/pareto', { params: filters });
    reportData.value = response.data;
    document.title = `Pareto Barang Terjual - ${filters.cabang}`;

  } catch (error) {
    alert("Gagal memuat data untuk dicetak.");
    console.error("Error fetching print data:", error);
  } finally {
    isLoading.value = false;
  }
};

// Panggil window.print() setelah data selesai dimuat dan DOM diperbarui
watch(isLoading, (newValue) => {
  if (newValue === false) {
    nextTick(() => {
      window.print();
    });
  }
});

onMounted(fetchPrintData);
</script>

<template>
  <div class="print-container">
    <div v-if="isLoading" class="text-center">Memuat data...</div>
    <div v-if="reportData.length > 0" class="page">
      <div class="report-header">
        <div class="header-left">
          <div class="title">Pareto Barang Terjual</div>
          <div class="filters-info">
            <span>{{ headerInfo.periode }}</span>
            <span>{{ headerInfo.cabang }}</span>
            <span>{{ headerInfo.item }}</span>
            <span>{{ headerInfo.kategori }}</span>
          </div>
        </div>
        <div class="header-right">
          <img :src="appLogo" alt="Company Logo" class="company-logo" />
        </div>
      </div>

      <div class="items-table">
        <table>
          <thead>
            <tr>
              <th>No</th>
              <th>Kode</th>
              <th>Nama</th>
              <th>Allsize</th>
              <th>XS</th>
              <th>S</th>
              <th>M</th>
              <th>L</th>
              <th>XL</th>
              <th>2XL</th>
              <th>3XL</th>
              <th>4XL</th>
              <th>5XL</th>
              <th>Oversize</th>
              <th>Jumbo</th>
              <th>Other</th>
              <th>Total</th>
              <th>Stok</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in reportData" :key="item.KODE">
              <td class="center">{{ index + 1 }}</td>
              <td>{{ item.KODE }}</td>
              <td>{{ item.NAMA }}</td>
              <td class="right">{{ item.ALLSIZE }}</td>
              <td class="right">{{ item.XS }}</td>
              <td class="right">{{ item.S }}</td>
              <td class="right">{{ item.M }}</td>
              <td class="right">{{ item.L }}</td>
              <td class="right">{{ item.XL }}</td>
              <td class="right">{{ item['2XL'] }}</td>
              <td class="right">{{ item['3XL'] }}</td>
              <td class="right">{{ item['4XL'] }}</td>
              <td class="right">{{ item['5XL'] }}</td>
              <td class="right">{{ item.OVERSIZE }}</td>
              <td class="right">{{ item.JUMBO }}</td>
              <td class="right">{{ item.OTHER || 0 }}</td>
              <td class="right bold">{{ item.TOTAL }}</td>
              <td class="right bold">{{ item.StokReal }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="report-footer">
        <span>Printed: {{ new Date().toLocaleString('id-ID') }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.print-container {
  font-family: 'Segoe UI', Tahoma, sans-serif;
  font-size: 8pt;
  color: black;
}

.page {
  padding: 10mm;
}

.report-header {
  border-bottom: 2px solid black;
  padding-bottom: 5px;
  margin-bottom: 10px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.header-left {
  flex-grow: 1;
}

.header-right {
  margin-left: 20px;
}

.title {
  font-size: 14pt;
  font-weight: bold;
}

.filters-info {
  display: flex;
  justify-content: space-between;
  margin-top: 5px;
  font-size: 7pt;
}

.company-logo {
  max-height: 40px;
  width: auto;
}

.items-table table {
  width: 100%;
  border-collapse: collapse;
}

.items-table th,
.items-table td {
  border: 1px solid #ccc;
  padding: 4px;
}

.items-table thead th {
  font-weight: bold;
  text-align: center;
  background-color: #f0f0f0;
}

.center {
  text-align: center;
}

.right {
  text-align: right;
}

.bold {
  font-weight: bold;
}

.report-footer {
  text-align: right;
  font-style: italic;
  font-size: 7pt;
  margin-top: 10px;
}

@media print {
  @page {
    size: A4 landscape;
    margin: 10mm;
  }

  body,
  .print-container {
    background: white;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .page {
    border: none;
    box-shadow: none;
    margin: 0;
    padding: 0;
  }
}

/* ============================= */
/* FORCE LIGHT MODE FOR PRINT VIEW */
/* ============================= */

.print-container,
.print-container * {
  color: #000 !important;
  background: #fff !important;
}
</style>
