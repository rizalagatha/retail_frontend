<script setup lang="ts">
import { computed } from 'vue';
import { format } from 'date-fns';
import logoUrl from '@/assets/logo.png'; // Impor logo lokal

const props = defineProps({
  printData: { type: Object, required: true },
});

const emit = defineEmits(['close', 'print']);

// --- Fungsi Helper untuk Terbilang ---
const terbilang = (n: number): string => {
  if (n === null || n === undefined) return "Nol Rupiah";
  n = Math.floor(n);
  if (n === 0) return "Nol Rupiah";

  const angka = ["", "Satu", "Dua", "Tiga", "Empat", "Lima", "Enam", "Tujuh", "Delapan", "Sembilan", "Sepuluh", "Sebelas"];

  const terbilangRecursive = (num: number): string => {
    if (num < 12) return angka[num];
    if (num < 20) return terbilangRecursive(num - 10) + " Belas";
    if (num < 100) return angka[Math.floor(num / 10)] + " Puluh " + terbilangRecursive(num % 10);
    if (num < 200) return "Seratus " + terbilangRecursive(num - 100);
    if (num < 1000) return terbilangRecursive(Math.floor(num / 100)) + " Ratus " + terbilangRecursive(num % 100);
    if (num < 2000) return "Seribu " + terbilangRecursive(num - 1000);
    if (num < 1000000) return terbilangRecursive(Math.floor(num / 1000)) + " Ribu " + terbilangRecursive(num % 1000);
    if (num < 1000000000) return terbilangRecursive(Math.floor(num / 1000000)) + " Juta " + terbilangRecursive(num % 1000000);
    if (num < 1000000000000) return terbilangRecursive(Math.floor(num / 1000000000)) + " Miliar " + terbilangRecursive(num % 1000000000);
    if (num < 1000000000000000) return terbilangRecursive(Math.floor(num / 1000000000000)) + " Triliun " + terbilangRecursive(num % 1000000000000);
    return "Angka Melebihi Batas";
  };

  return terbilangRecursive(n).replace(/\s+/g, ' ').trim() + " Rupiah";
};

const grandTotal = computed(() => {
  const footer = props.printData.footer || {};
  const total = footer.total || 0;
  const diskon_faktur = footer.diskon_faktur || 0;
  const ppn = footer.ppn || 0;
  const bkrm = footer.bkrm || 0;
  return (total - diskon_faktur) + ppn + bkrm;
});

</script>

<template>
  <v-dialog :model-value="true" @update:model-value="emit('close')" fullscreen transition="dialog-bottom-transition"
    scroll-strategy="none">
    <v-card class="d-flex flex-column">
      <v-toolbar color="primary" density="compact">
        <v-toolbar-title>Preview Penawaran - {{ printData.header.nomor }}</v-toolbar-title>
        <v-spacer></v-spacer>
        <v-btn prepend-icon="mdi-printer" @click="emit('print')">Cetak</v-btn>
        <v-btn icon="mdi-close" @click="emit('close')"></v-btn>
      </v-toolbar>

      <v-card-text class="flex-grow-1 bg-grey-lighten-3 pa-8 overflow-auto">
        <div class="a4-paper mx-auto pa-10">
          <!-- Header Laporan -->
          <v-row no-gutters class="header-section">
            <v-col cols="8">
              <p class="font-weight-bold text-h6">{{ printData.gudang.gdg_inv_nama }}</p>
              <p>{{ printData.gudang.gdg_inv_alamat }}</p>
              <p>{{ printData.gudang.gdg_inv_kota }}</p>
              <p>{{ printData.gudang.gdg_inv_telp }}</p>
            </v-col>
            <v-col cols="4" class="d-flex justify-end">
              <div class="logo-wrapper">
                <img :src="logoUrl" alt="Logo" class="logo-fill" />
              </div>
            </v-col>
          </v-row>

          <h2 class="text-h5 text-center font-weight-bold my-8">PENAWARAN</h2>

          <!-- Info Transaksi -->
          <v-row no-gutters class="info-section">
            <v-col cols="6">
              <v-row dense>
                <v-col cols="3">Nomor</v-col>
                <v-col cols="9">: {{ printData.header.pen_nomor }}</v-col>
                <v-col cols="3">Tanggal</v-col>
                <v-col cols="9">: {{ format(new Date(printData.header.pen_tanggal), 'dd-MM-yyyy') }}</v-col>
              </v-row>
            </v-col>
            <v-col cols="6">
              <v-row dense>
                <v-col cols="3">Customer</v-col>
                <v-col cols="9">: {{ printData.customer.cus_nama }}</v-col>
                <v-col cols="3">Alamat</v-col>
                <v-col cols="9">: {{ printData.customer.cus_alamat }} {{ printData.customer.cus_kota }}</v-col>
                <v-col cols="3">Telp</v-col>
                <v-col cols="9">: {{ printData.customer.cus_telp }}</v-col>
              </v-row>
            </v-col>
          </v-row>

          <!-- Tabel Item -->
          <v-table density="compact" class="mt-6 report-table">
            <thead>
              <tr>
                <th class="text-left">No</th>
                <th class="text-left">Nama</th>
                <th class="text-left">Ukuran</th>
                <th class="text-right">Qty</th>
                <th class="text-right">Harga</th>
                <th class="text-right">Diskon</th>
                <th class="text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in printData.details" :key="index">
                <td>{{ index + 1 }}</td>
                <td>{{ item.nama }}</td>
                <td>{{ item.ukuran }}</td>
                <td class="text-right">{{ item.qty }}</td>
                <td class="text-right">{{ new Intl.NumberFormat('id-ID').format(item.harga) }}</td>
                <td class="text-right">{{ new Intl.NumberFormat('id-ID').format(item.diskon) }}</td>
                <td class="text-right">{{ new Intl.NumberFormat('id-ID').format(item.total) }}</td>
              </tr>
            </tbody>
          </v-table>

          <!-- Footer Laporan -->
          <v-row no-gutters class="mt-4 footer-section">
            <v-col cols="7">
              <div class="pa-2 border rounded-sm">
                <p class="font-italic"><strong>Terbilang:</strong> {{ terbilang(grandTotal) }}</p>
              </div>
              <v-row class="mt-8 text-center">
                <v-col>
                  <p>Dibuat Oleh,</p>
                  <p style="margin-top: 60px;">( {{ printData.header.created }} )</p>
                </v-col>
                <v-col>
                  <p>Mengetahui,</p>
                  <p style="margin-top: 60px;">( .......................... )</p>
                </v-col>
              </v-row>
              <p class="mt-4"><strong>Note:</strong> {{ printData.header.keterangan }}</p>
            </v-col>
            <v-col cols="5">
              <v-table density="compact">
                <tbody>
                  <tr>
                    <td>Total</td>
                    <td class="text-right">{{ new Intl.NumberFormat('id-ID').format(printData.footer.total) }}</td>
                  </tr>
                  <tr>
                    <td>Diskon</td>
                    <td class="text-right">{{ new Intl.NumberFormat('id-ID').format(printData.footer.diskon_faktur) }}
                    </td>
                  </tr>
                  <tr>
                    <td>Ppn</td>
                    <td class="text-right">{{ new Intl.NumberFormat('id-ID').format(printData.footer.ppn) }}</td>
                  </tr>
                  <tr>
                    <td>Biaya Kirim</td>
                    <td class="text-right">{{ new Intl.NumberFormat('id-ID').format(printData.footer.bkrm) }}</td>
                  </tr>
                  <tr class="font-weight-bold">
                    <td>Grand Total</td>
                    <td class="text-right">{{ new Intl.NumberFormat('id-ID').format(grandTotal) }}</td>
                  </tr>
                </tbody>
              </v-table>
            </v-col>
          </v-row>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.a4-paper {
  background: white;
  width: 21cm;
  min-height: 29.7cm;
  box-shadow: 0 0 0.5cm rgba(0, 0, 0, 0.5);
  color: #000;
  font-size: 10pt;
}

.report-table,
.report-table th,
.report-table td {
  font-size: 9pt;
}

.info-section p,
.header-section p {
  margin-bottom: 2px;
}

.logo-wrapper {
  width: 120px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #e0e0e0;
  /* Optional: untuk melihat boundary */
  border-radius: 4px;
  overflow: hidden;
}

.logo {
  max-width: 100%;
  max-height: 100%;
  width: auto;
  height: auto;
  object-fit: contain;
  /* Mempertahankan aspect ratio tanpa cropping */
  display: block;
}

/* Alternative jika ingin logo mengisi penuh dengan kemungkinan cropping */
.logo-fill {
  width: 100%;
  height: 100%;
  object-fit: cover;
  /* Mengisi penuh tapi mungkin ada cropping */
}

/* Alternative jika ingin logo dengan ukuran tetap */
.logo-fixed {
  width: 80px;
  height: 60px;
  object-fit: contain;
}
</style>
