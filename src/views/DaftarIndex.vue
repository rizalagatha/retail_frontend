<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/authStore';
import PageLayout from '@/components/PageLayout.vue';

const router = useRouter();
const authStore = useAuthStore();

// Semua menu, termasuk dari Gudang DC, digabung menjadi satu daftar.
// Setiap item memiliki struktur yang sama.
const subMenus = ref([
    // --- Master Data Umum ---
    {
        title: 'Customer',
        description: 'Pengelolaan data customer umum.',
        icon: 'mdi-account-group-outline',
        path: '/daftar/customers',
        menuId: '9',
    },
    {
        title: 'Member',
        description: 'Pengelolaan data member dan pelanggan setia.',
        icon: 'mdi-account-heart-outline',
        path: '/daftar/members',
        menuId: '7',
    },
    {
        title: 'Supplier',
        description: 'Pengelolaan data pemasok barang.',
        icon: 'mdi-truck-delivery-outline',
        path: '/daftar/suppliers',
        menuId: '8',
    },
    {
        title: 'Sales Counter',
        description: 'Pengelolaan data sales counter (SC).',
        icon: 'mdi-account-tie-outline',
        path: '/daftar/sales-counters',
        menuId: '10',
    },
    {
        title: 'Cetak Barcode',
        description: 'Fasilitas untuk mencetak barcode produk.',
        icon: 'mdi-barcode-scan',
        path: '/daftar/cetak-barcode',
        menuId: '11',
    },

    // --- Master Data Gudang DC (dijadikan kartu individual) ---
    {
        title: 'Barang DC',
        description: 'Pengelolaan data master barang Gudang DC.',
        icon: 'mdi-package-variant-closed',
        path: '/gudang-dc/master-data/barang-dc',
        menuId: '204', // ID Menu untuk Barang DC
    },
    {
        title: 'Jenis Kain',
        description: 'Pengelolaan data master jenis kain.',
        icon: 'mdi-texture',
        path: '/gudang-dc/master-data/jenis-kain',
        menuId: '201', // Asumsi menggunakan hak akses yang sama
    },
    {
        title: 'Warna Kain',
        description: 'Pengelolaan data master warna kain.',
        icon: 'mdi-palette-outline',
        path: '/gudang-dc/master-data/warna-kain',
        menuId: '202', // Asumsi menggunakan hak akses yang sama
    },
    {
        title: 'Lengan',
        description: 'Pengelolaan data master jenis lengan.',
        icon: 'mdi-tshirt-crew-outline',
        path: '/gudang-dc/master-data/lengan',
        menuId: '203', // Asumsi menggunakan hak akses yang sama
    },
    {
        title: 'Price List',
        description: 'Pengelolaan data daftar harga produk.',
        icon: 'mdi-receipt-text-outline',
        path: '/gudang-dc/master-data/price-list',
        menuId: '206', // Asumsi menggunakan hak akses yang sama
    },
    {
        title: 'Promo',
        description: 'Pengelolaan data promo dan diskon.',
        icon: 'mdi-percent-outline',
        path: '/gudang-dc/master-data/promo',
        menuId: '205', // Asumsi menggunakan hak akses yang sama
    },
    {
        title: 'Master Barang External',
        description: 'Pengelolaan data master barang eksternal.',
        icon: 'mdi-link-variant',
        path: '/gudang-dc/master-data/barang-external',
        menuId: '219', // Asumsi menggunakan hak akses yang sama
    },
]);
</script>

<template>
    <PageLayout title="Menu Master Data" icon="mdi-archive-outline">
        <div class="pa-4">
            <v-row>
                <template v-for="item in subMenus" :key="item.path">
                    <v-col v-if="authStore.can(item.menuId, 'view')" cols="12" sm="6" md="4" lg="3">
                        <v-card class="d-flex flex-column fill-height" hover elevation="2"
                            @click="router.push(item.path)">
                            <v-card-title class="d-flex align-center">
                                <v-icon :icon="item.icon" class="mr-3" color="primary" size="24"></v-icon>
                                <span class="font-weight-bold">{{ item.title }}</span>
                            </v-card-title>
                            <v-card-text class="flex-grow-1">
                                {{ item.description }}
                            </v-card-text>
                            <v-divider></v-divider>
                            <v-card-actions>
                                <v-spacer></v-spacer>
                                <v-btn color="primary" variant="text" :to="item.path">
                                    Buka Menu
                                </v-btn>
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