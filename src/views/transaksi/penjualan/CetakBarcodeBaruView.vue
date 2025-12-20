<script setup lang="ts">
import { ref, onMounted, nextTick, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import api from '@/services/api';
import JsBarcode from 'jsbarcode';

interface BarcodeItem {
  barcode: string;
  nama: string;
  ukuran: string;
  harga: number;
  jumlah: number;
}

const route = useRoute();
const isLoading = ref(true);
const itemsToPrint = ref<BarcodeItem[]>([]);

const barcodeSheets = computed(() => {
  const expandedItems = itemsToPrint.value.flatMap(item =>
    Array.from({ length: item.jumlah }, () => ({
      barcode: item.barcode,
      nama: item.nama,
      ukuran: item.ukuran,
      harga: item.harga,
    }))
  );

  const sheets = [];
  for (let i = 0; i < expandedItems.length; i += 2) {
    sheets.push(expandedItems.slice(i, i + 2));
  }
  return sheets;
});

const fetchPrintData = async (nomor: string) => {
  isLoading.value = true;
  try {
    const response = await api.get(`/pengajuan-barcode-form/print-a4/${nomor}`);
    itemsToPrint.value = response.data;
    document.title = `Cetak Barcode - ${nomor}`;
  } catch {
    alert("Gagal memuat data barcode.");
  } finally {
    isLoading.value = false;
  }
};

watch(isLoading, (val) => {
  if (!val) {
    nextTick(() => {
      // Generate semua barcode
      barcodeSheets.value.forEach((sheet, sheetIndex) => {
        sheet.forEach((item, itemIndex) => {
          const elementId = `#barcode-${sheetIndex}-${itemIndex}`;
          const svgElement = document.querySelector(elementId);
          if (svgElement && item) {
            JsBarcode(svgElement, item.barcode, {
              format: "CODE128C", width: 1.2, height: 18,
              displayValue: true, fontSize: 7, margin: 1
            });
          }
        });
      });
      // Tunggu sebentar agar barcode ter-render, lalu print
      setTimeout(() => window.print(), 500);
    });
  }
});

onMounted(() => {
  const nomor = route.params.nomor as string;
  if (nomor) fetchPrintData(nomor);
});
</script>

<template>
  <div class="print-container">
    <div v-if="isLoading" class="loading-text">Memuat data barcode...</div>
    <div v-else>
      <div v-for="(sheet, sheetIndex) in barcodeSheets" :key="sheetIndex" class="label-sheet">
        <div v-for="(item, itemIndex) in sheet" :key="itemIndex" class="barcode-container">
          <template v-if="item">
            <div class="item-name">{{ item.nama }}</div>
            <div class="item-size">{{ item.ukuran }}</div>
            <svg :id="`barcode-${sheetIndex}-${itemIndex}`"></svg>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@page {
  size: 68mm 15mm;
  margin: 0;
}

body,
html {
  margin: 0;
  padding: 0;
  width: 68mm;
  height: 15mm;
  overflow: hidden;
}

.label-sheet {
  width: 100%;
  height: 100%;
  display: flex !important;
  justify-content: space-between !important;
  align-items: center;
  page-break-after: always;
}

.barcode-container {
  box-sizing: border-box;
  width: 33mm;
  /* Lebar pasti untuk satu label */
  height: 15mm;
  /* Tinggi pasti untuk satu label */
  display: flex !important;
  flex-direction: column;
  justify-content: center !important;
  align-items: center !important;
  padding: 0.5mm 1mm;
  text-align: center;
  overflow: hidden;
}

.item-name,
.item-size {
  font-family: Arial, sans-serif;
  font-size: 5px;
  line-height: 1.1;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.item-name {
  font-weight: bold;
}

.item-size {
  font-weight: normal;
}

.barcode-container svg {
  max-width: 100%;
  height: auto;
  display: block;
  margin-top: 0.5mm;
}

.loading-text {
  font-family: Arial, sans-serif;
  text-align: center;
  padding: 20px;
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
