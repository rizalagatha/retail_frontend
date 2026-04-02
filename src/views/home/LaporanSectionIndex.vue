<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/stores/authStore";
import PageLayout from "@/components/PageLayout.vue";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

// Definisikan semua kemungkinan menu dalam satu struktur data
const allSections = {
  stok: {
    title: "Laporan Stok",
    icon: "mdi-archive-outline",
    items: [
      {
        title: "Laporan Stok",
        description: "Lihat posisi stok real-time di semua gudang dan store.",
        to: "/laporan/stok/real-time",
        icon: "mdi-package-variant",
        menuId: "501",
      },
      {
        title: "Mutasi Stok",
        description: "Laporan mutasi keluar masuk stok per periode.",
        to: "/laporan/stok/mutasi-stok",
        icon: "mdi-swap-horizontal",
        menuId: "502",
      },
      {
        title: "Kartu Stok",
        description: "Riwayat transaksi stok per barang secara detail.",
        to: "/laporan/stok/kartu-stok",
        icon: "mdi-card-text-outline",
        menuId: "503",
      },
      {
        title: "Stok Stagnan",
        description: "Analisa barang dengan pergerakan lambat atau stagnan.",
        to: "/laporan/stok/stagnan",
        icon: "mdi-clock-outline",
        menuId: "508",
      },
      {
        title: "Dead Stok",
        description: "Identifikasi barang yang tidak bergerak dalam periode tertentu.",
        to: "/laporan/stok/dead-stok",
        icon: "mdi-alert-circle-outline",
        menuId: "510",
      },
    ],
  },
  penjualan: {
    title: "Laporan Penjualan",
    icon: "mdi-trending-up",
    items: [
      {
        title: "Laporan Invoice",
        description: "Rekapitulasi data invoice penjualan per periode.",
        to: "/laporan/penjualan/invoice",
        icon: "mdi-receipt",
        menuId: "505",
      },
      {
        title: "Pareto Barang",
        description: "Analisa produk best seller dan kontribusi penjualan.",
        to: "/laporan/penjualan/pareto",
        icon: "mdi-chart-bar",
        menuId: "511",
      },
      {
        title: "Sales vs Target",
        description: "Perbandingan pencapaian sales terhadap target.",
        to: "/laporan/penjualan/sales-vs-target",
        icon: "mdi-target",
        menuId: "509",
      },
      {
        title: "Target Achievement",
        description: "Monitoring pencapaian target sales per salesman.",
        to: "/laporan/penjualan/monitoring-achievement",
        icon: "mdi-trophy-outline",
        menuId: "705",
      },
    ],
  },
  analisa: {
    title: "Laporan Analisa",
    icon: "mdi-chart-timeline-variant",
    items: [
      {
        title: "Penjualan Pivot",
        description: "Analisa penjualan dengan pivot table yang fleksibel.",
        to: "/laporan/analisa/with-pivot",
        icon: "mdi-table-pivot",
        menuId: "506",
      },
      {
        title: "Stok Pivot",
        description: "Analisa stok dengan pivot table multi dimensi.",
        to: "/laporan/analisa/stok-pivot",
        icon: "mdi-table-large",
        menuId: "507",
      },
    ],
  },
  "lain-lain": {
    title: "Laporan Lain-lain",
    icon: "mdi-dots-horizontal",
    items: [
      {
        title: "List Otorisasi",
        description: "Daftar transaksi yang memerlukan otorisasi.",
        to: "/laporan/lain-lain/list-otorisasi",
        icon: "mdi-shield-check-outline",
        menuId: "512",
      },
      {
        title: "Saldo Kasir",
        description: "Laporan saldo dan transaksi kasir per periode.",
        to: "/laporan/lain-lain/saldo-kasir",
        icon: "mdi-cash-register",
        menuId: "601",
      },
    ],
  },
};

// Ambil data seksi saat ini berdasarkan parameter URL
const currentSection = computed(() => {
  const sectionKey = route.params.section as keyof typeof allSections;
  return (
    allSections[sectionKey] || { title: "Menu Tidak Ditemukan", icon: "mdi-help-circle", items: [] }
  );
});
</script>

<template>
  <PageLayout :title="currentSection.title" :icon="currentSection.icon">
    <div class="pa-4">
      <v-row>
        <template v-for="item in currentSection.items" :key="item.to">
          <v-col
            v-if="!item.menuId || authStore.can(item.menuId, 'view')"
            cols="12"
            sm="6"
            md="4"
            lg="3"
          >
            <v-card
              class="d-flex flex-column fill-height"
              hover
              elevation="2"
              @click="router.push(item.to)"
            >
              <v-card-title class="d-flex align-center">
                <v-icon :icon="item.icon" class="mr-3" color="primary" size="24"></v-icon>
                <span class="font-weight-bold">{{ item.title }}</span>
              </v-card-title>
              <v-card-text class="flex-grow-1">{{ item.description }}</v-card-text>
              <v-divider></v-divider>
              <v-card-actions>
                <v-spacer></v-spacer>
                <v-btn color="primary" variant="text" :to="item.to">Buka Laporan</v-btn>
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
