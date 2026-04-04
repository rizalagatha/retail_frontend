<script setup lang="ts">
import { ref, onMounted, nextTick, computed, watch } from "vue";
import { useRoute } from "vue-router";
import api from "@/services/api";
import JsBarcode from "jsbarcode";

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
  // [FIX] Pastikan itemsToPrint adalah array sebelum di-proses
  if (!Array.isArray(itemsToPrint.value)) {
    return [];
  }

  const expandedItems = itemsToPrint.value.flatMap((item) =>
    Array.from({ length: item.jumlah || 0 }, () => ({
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

    // [FIX] Tangani jika data terbungkus dalam properti 'data' lagi (response.data.data)
    const rawData = response.data;
    itemsToPrint.value = Array.isArray(rawData) ? rawData : rawData.data || [];

    document.title = `Cetak Barcode - ${nomor}`;
  } catch (err) {
    console.error("Gagal load:", err);
    alert("Gagal memuat data barcode.");
  } finally {
    isLoading.value = false;
  }
};

watch(isLoading, (val) => {
  if (!val) {
    nextTick(async () => {
      // Pastikan data sudah masuk ke DOM
      await new Promise((resolve) => setTimeout(resolve, 100));

      barcodeSheets.value.forEach((sheet, sheetIndex) => {
        sheet.forEach((item, itemIndex) => {
          const elementId = `barcode-${sheetIndex}-${itemIndex}`;
          const canvas = document.getElementById(elementId);

          if (canvas && item.barcode) {
            try {
              JsBarcode(canvas, item.barcode, {
                format: "CODE128", // [FIX] Gunakan CODE128 agar lebih fleksibel
                width: 1.2,
                height: 35, // Tinggi sedikit ditambah agar mudah di-scan
                displayValue: true,
                fontSize: 10,
                margin: 0,
                background: "#ffffff",
              });
            } catch (err) {
              console.error(`Gagal render barcode ${item.barcode}:`, err);
            }
          }
        });
      });

      // Beri jeda lebih lama sedikit agar printer label sempat memproses
      setTimeout(() => {
        window.print();
      }, 800);
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
            <div class="item-info">
              <span class="item-size">UK: {{ item.ukuran }}</span>
              <span class="item-price">Rp {{ item.harga.toLocaleString("id-ID") }}</span>
            </div>
            <svg :id="`barcode-${sheetIndex}-${itemIndex}`"></svg>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@media print {
  @page {
    size: 68mm 15mm;
    margin: 0;
  }

  body {
    margin: 0;
  }
}

.label-sheet {
  width: 68mm;
  height: 15mm;
  display: flex !important;
  flex-direction: row;
  justify-content: space-around;
  align-items: center;
  page-break-after: always;
  overflow: hidden;
}

.barcode-container {
  width: 33mm;
  height: 14mm;
  display: flex !important;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
}

.item-name {
  font-size: 7px;
  font-weight: bold;
  white-space: nowrap;
  max-width: 30mm;
  overflow: hidden;
}

.item-info {
  font-size: 6px;
  display: flex;
  gap: 4px;
}

/* Memastikan SVG tidak terpotong */
.barcode-container svg {
  width: 100%;
  max-height: 10mm;
}
</style>
