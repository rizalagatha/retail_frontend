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
  "master-data": {
    title: "Master Data",
    icon: "mdi-database-outline",
    items: [
      {
        title: "Jenis Kain",
        description: "Kelola data master jenis kain untuk produk garmen.",
        to: "/gudang-dc/master-data/jenis-kain",
        icon: "mdi-texture",
        menuId: "201",
      },
      {
        title: "Warna Kain",
        description: "Kelola data master warna kain yang tersedia.",
        to: "/gudang-dc/master-data/warna-kain",
        icon: "mdi-palette-outline",
        menuId: "202",
      },
      {
        title: "Lengan",
        description: "Kelola data master jenis lengan produk.",
        to: "/gudang-dc/master-data/lengan",
        icon: "mdi-tshirt-crew-outline",
        menuId: "203",
      },
      {
        title: "Barang",
        description: "Kelola data master barang gudang DC.",
        to: "/gudang-dc/master-data/barang-dc",
        icon: "mdi-package-variant-closed",
        menuId: "204",
      },
      {
        title: "Promo",
        description: "Kelola data promo dan diskon untuk produk.",
        to: "/gudang-dc/master-data/promo",
        icon: "mdi-percent-outline",
        menuId: "205",
      },
      {
        title: "Price List",
        description: "Kelola daftar harga jual produk per kategori.",
        to: "/gudang-dc/master-data/price-list",
        icon: "mdi-receipt-text-outline",
        menuId: "206",
      },
      {
        title: "Master Barang External",
        description: "Kelola data barang dari supplier eksternal.",
        to: "/gudang-dc/master-data/barang-external",
        icon: "mdi-link-variant",
        menuId: "219",
      },
    ],
  },
  operasional: {
    title: "Operasional Gudang",
    icon: "mdi-forklift",
    items: [
      {
        title: "Terima STBJ",
        description: "Proses penerimaan Surat Tanda Bukti Jalan dari supplier.",
        to: "/gudang-dc/operasional/terima-stbj",
        icon: "mdi-inbox-arrow-down",
        menuId: "211",
      },
      {
        title: "Terima dari Gudang Repair",
        description: "Terima barang yang sudah selesai diperbaiki.",
        to: "/gudang-dc/operasional/terima-repair",
        icon: "mdi-tools",
        menuId: "212",
      },
      {
        title: "Surat Jalan ke Store",
        description: "Buat surat jalan pengiriman barang ke store.",
        to: "/gudang-dc/operasional/surat-jalan-store",
        icon: "mdi-truck-delivery-outline",
        menuId: "213",
      },
      {
        title: "Pengambilan Barang",
        description: "Proses pengambilan barang dari gudang DC.",
        to: "/gudang-dc/operasional/ambil-barang",
        icon: "mdi-package-up",
        menuId: "253",
      },
      {
        title: "Terima Retur dari Store",
        description: "Proses penerimaan retur barang dari store.",
        to: "/gudang-dc/operasional/terima-rb",
        icon: "mdi-package-down",
        menuId: "214",
      },
      {
        title: "QC ke Garmen",
        description: "Quality control barang sebelum dikirim ke garmen.",
        to: "/gudang-dc/operasional/qc-garmen",
        icon: "mdi-quality-high",
        menuId: "215",
      },
      {
        title: "Mutasi Stok Antar Gudang",
        description: "Proses mutasi stok antar lokasi gudang DC.",
        to: "/gudang-dc/operasional/mutasi-antar-gudang",
        icon: "mdi-swap-horizontal-circle-outline",
        menuId: "216",
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
