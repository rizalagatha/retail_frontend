<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/authStore';
import PageLayout from '@/components/PageLayout.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

// Definisikan semua kemungkinan menu dalam satu struktur data
const allSections = {
    penjualan: {
        title: 'Transaksi Penjualan',
        icon: 'mdi-cart-outline',
        items: [
            { title: 'Penawaran', description: 'Buat penawaran harga untuk customer.', to: '/transaksi/penjualan/penawaran', icon: 'mdi-handshake-outline', menuId: '42' },
            { title: 'Pengajuan Harga', description: 'Proses pengajuan harga khusus.', to: '/transaksi/penjualan/pengajuan/pengajuan-harga', icon: 'mdi-file-document-plus-outline', menuId: '38' },
            { title: 'Setting Harga', description: 'Persetujuan dan pengaturan harga dari pengajuan.', to: '/transaksi/penjualan/pengajuan/setting-harga', icon: 'mdi-tune-variant', menuId: '39' },
            { title: 'SO DTF Pesanan', description: 'Surat pesanan untuk produk DTF custom.', to: '/transaksi/penjualan/dtf/so-dtf', icon: 'mdi-clipboard-list-outline', menuId: '35' },
            { title: 'LHK SO DTF', description: 'Laporan hasil kerja untuk SO DTF pesanan.', to: '/transaksi/penjualan/dtf/lhk-so-dtf', icon: 'mdi-file-chart-outline', menuId: '41' },
            { title: 'Dasbor DTF', description: 'Pantau proses kerja DTF secara visual.', to: '/transaksi/penjualan/dtf/dasbor-dtf', icon: 'mdi-view-dashboard-outline', menuId: '40' },
            { title: 'SO DTF Stok', description: 'Surat pesanan untuk produk DTF stok.', to: '/transaksi/penjualan/dtf/so-dtf-stok', icon: 'mdi-package-variant', menuId: '36' },
            { title: 'LHK SO DTF Stok', description: 'Laporan hasil kerja untuk SO DTF stok.', to: '/transaksi/penjualan/dtf/lhk-so-dtf-stok', icon: 'mdi-chart-box-outline', menuId: '48' },
            { title: 'Surat Pesanan', description: 'Catat pesanan dari customer.', to: '/transaksi/penjualan/surat-pesanan', icon: 'mdi-file-document-edit-outline', menuId: '26' },
            { title: 'Proforma Invoice', description: 'Buat tagihan sementara sebelum pengiriman.', to: '/transaksi/penjualan/proforma', icon: 'mdi-receipt-text-outline', menuId: '28' },
            { title: 'Invoice', description: 'Buat tagihan resmi penjualan.', to: '/transaksi/penjualan/invoice', icon: 'mdi-receipt', menuId: '27' },
            { title: 'Retur Jual', description: 'Proses pengembalian barang dari customer.', to: '/transaksi/penjualan/retur-jual', icon: 'mdi-keyboard-return', menuId: '29' }
        ]
    },
    internal: {
        title: 'Transaksi Internal',
        icon: 'mdi-office-building-outline',
        items: [
            { title: 'Buffer Stok', description: 'Atur batas minimum dan maksimum stok.', to: '/transaksi/internal/buffer-stok', icon: 'mdi-database-outline' },
            { title: 'Minta Barang ke DC', description: 'Buat permintaan barang dari store ke DC.', to: '/transaksi/internal/minta-barang', icon: 'mdi-arrow-up-bold-circle-outline', menuId: '37' },
            { title: 'Terima SJ dari DC', description: 'Proses penerimaan surat jalan dari DC.', to: '/transaksi/internal/terima-sj', icon: 'mdi-arrow-down-bold-circle-outline', menuId: '31' },
            { title: 'Retur Barang ke DC', description: 'Proses pengembalian barang ke DC.', to: '/transaksi/internal/retur-dc', icon: 'mdi-undo-variant', menuId: '32' },
            { title: 'Koreksi Stok', description: 'Penyesuaian jumlah stok secara manual.', to: '/transaksi/internal/koreksi-stok', icon: 'mdi-pencil-outline', menuId: '25' },
            { title: 'Pengajuan Barcode Baru', description: 'Buat permintaan barcode untuk produk baru.', to: '/transaksi/internal/pengajuan-barcode', icon: 'mdi-barcode', menuId: '33' },
            { title: 'Klerek', description: 'Proses klerek atau rekapitulasi data.', to: '/transaksi/internal/klerek', icon: 'mdi-clipboard-check-outline', menuId: '34' }
        ]
    },
    mutasi: {
        title: 'Transaksi Mutasi',
        icon: 'mdi-swap-horizontal',
        items: [
            { title: 'Mutasi Out ke Produksi', description: 'Kirim barang dari gudang ke bagian produksi.', to: '/transaksi/mutasi/out-produksi', icon: 'mdi-export', menuId: '43' },
            { title: 'Mutasi In dari Produksi', description: 'Terima barang jadi dari bagian produksi.', to: '/transaksi/mutasi/in-produksi', icon: 'mdi-import', menuId: '44' },
            { title: 'Mutasi Stok', description: 'Pindah barang antar jenis stok internal.', to: '/transaksi/mutasi/stok', icon: 'mdi-swap-vertical', menuId: '45' },
            { title: 'Mutasi Antar Store (Kirim)', description: 'Kirim barang dari satu store ke store lain.', to: '/transaksi/mutasi/store-kirim', icon: 'mdi-send', menuId: '46' },
            { title: 'Mutasi Antar Store (Terima)', description: 'Terima barang dari store lain.', to: '/transaksi/mutasi/store-terima', icon: 'mdi-inbox-arrow-down', menuId: '47' }
        ]
    },
    'stok-opname': {
        title: 'Transaksi Stok Opname',
        icon: 'mdi-clipboard-list-outline',
        items: [
            { title: 'List HPP Kosong Ada Stok', description: 'Lihat daftar produk dengan stok tapi HPP nol.', to: '/transaksi/stok-opname/hpp-kosong', icon: 'mdi-currency-usd-off', menuId: '704' },
            { title: 'Setting Tanggal', description: 'Atur tanggal cut-off untuk proses stok opname.', to: '/transaksi/stok-opname/setting-tanggal', icon: 'mdi-calendar-edit-outline', menuId: '21' },
            { title: 'Input Hitung Stok', description: 'Masukkan hasil perhitungan stok fisik.', to: '/transaksi/stok-opname/input-hitung-stok', icon: 'mdi-clipboard-edit-outline', menuId: '23' },
            { title: 'Hitung Stok per Lokasi', description: 'Proses perhitungan stok berdasarkan lokasi rak.', to: '/transaksi/stok-opname/hitung-per-lokasi', icon: 'mdi-map-marker-multiple-outline', menuId: '20' },
            { title: 'Cek Selisih', description: 'Bandingkan hasil stok fisik dengan stok sistem.', to: '/transaksi/stok-opname/cek-selisih', icon: 'mdi-scale-balance', menuId: '22' },
            { title: 'Proses', description: 'Lakukan proses finalisasi stok opname.', to: '/transaksi/stok-opname/proses', icon: 'mdi-progress-check', menuId: '24' },
        ]
    }
};

// Ambil data seksi saat ini berdasarkan parameter URL
const currentSection = computed(() => {
    const sectionKey = route.params.section as keyof typeof allSections;
    return allSections[sectionKey] || { title: 'Menu Tidak Ditemukan', icon: 'mdi-help-circle', items: [] };
});
</script>

<template>
    <PageLayout :title="currentSection.title" :icon="currentSection.icon">
        <div class="pa-4">
            <v-row>
                <template v-for="item in currentSection.items" :key="item.to">
                    <v-col v-if="!item.menuId || authStore.can(item.menuId, 'view')" cols="12" sm="6" md="4" lg="3">
                        <v-card class="d-flex flex-column fill-height" hover elevation="2"
                            @click="router.push(item.to)">
                            <v-card-title class="d-flex align-center">
                                <v-icon :icon="item.icon" class="mr-3" color="primary" size="24"></v-icon>
                                <span class="font-weight-bold">{{ item.title }}</span>
                            </v-card-title>
                            <v-card-text class="flex-grow-1">{{ item.description }}</v-card-text>
                            <v-divider></v-divider>
                            <v-card-actions>
                                <v-spacer></v-spacer>
                                <v-btn color="primary" variant="text" :to="item.to">Buka Menu</v-btn>
                            </v-card-actions>
                        </v-card>
                    </v-col>
                </template>
            </v-row>
        </div>
    </PageLayout>
</template>

<style scoped>
.v-card {
    transition: all 0.2s ease-in-out;
}

.v-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1) !important;
}
</style>