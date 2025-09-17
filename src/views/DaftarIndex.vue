<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/authStore';
import PageLayout from '@/components/PageLayout.vue';

const router = useRouter();
const authStore = useAuthStore();

// Definisikan semua sub-menu yang ada di bawah "Daftar"
// Setiap item memiliki menuId yang akan digunakan untuk cek hak akses
const subMenus = ref([
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
    // Tambahkan sub-menu "Daftar" lainnya di sini jika ada
]);

</script>

<template>
    <PageLayout title="Menu Master Data" icon="mdi-archive-outline">
        <div class="pa-4">
            <v-row>
                <!-- Loop melalui semua sub-menu -->
                <template v-for="item in subMenus" :key="item.path">
                    <!-- Tampilkan kartu HANYA jika user memiliki hak akses 'view' -->
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
