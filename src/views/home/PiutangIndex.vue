<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/authStore';
import PageLayout from '@/components/PageLayout.vue';

const router = useRouter();
const authStore = useAuthStore();

// Definisikan semua sub-menu piutang
// CATATAN: 'menuId' di bawah ini adalah contoh. Sesuaikan dengan ID dari database Anda.
const subMenus = ref([
    {
        title: 'Setoran Pembayaran',
        description: 'Kelola dan catat setoran pembayaran piutang dari customer.',
        icon: 'mdi-bank-transfer',
        path: '/piutang/setoran-pembayaran',
        menuId: '51', // Contoh ID
    },
    {
        title: 'Form Setoran Kasir',
        description: 'Formulir khusus untuk setoran dari kasir (FSK).',
        icon: 'mdi-cash-multiple',
        path: '/piutang/fsk',
        menuId: '54', // Contoh ID
    },
    {
        title: 'Kartu Piutang',
        description: 'Lihat riwayat dan status piutang per customer.',
        icon: 'mdi-credit-card-outline',
        path: '/piutang/kartu-piutang',
        menuId: '52', // Contoh ID
    },
    {
        title: 'Potongan',
        description: 'Kelola potongan atau penyesuaian nilai piutang.',
        icon: 'mdi-tag-minus-outline',
        path: '/piutang/potongan',
        menuId: '53', // Contoh ID
    },
    {
        title: 'Refund',
        description: 'Proses pengembalian dana (refund) kepada customer.',
        icon: 'mdi-cash-refund',
        path: '/piutang/refund',
        menuId: '55', // Contoh ID
    }
]);
</script>

<template>
    <PageLayout title="Menu Piutang" icon="mdi-credit-card-outline">
        <div class="pa-4">
            <v-row>
                <!-- Loop melalui semua sub-menu piutang -->
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